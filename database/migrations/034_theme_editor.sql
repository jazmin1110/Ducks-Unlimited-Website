-- =============================================================================
-- MIGRATION 034 — Theme editor: draft order, version history, one-step publish,
--                 email sign-ups
-- =============================================================================
-- Run this in the Supabase SQL Editor (safe to run more than once).
--
-- Only ADDS things — the website keeps working exactly as before until the new
-- editor is deployed.
--
-- What it adds:
--   1. page_sections.draft_position → the editor's new section order, saved
--      as a draft. The live site keeps using `position` until Publish.
--   2. page_versions table → a copy of the whole homepage every time someone
--      presses Publish, so an older version can be brought back.
--   3. publish_page() → does everything Publish needs in ONE step, so the live
--      site is never left half-published if something fails halfway:
--        - copies each section's draft to the live version
--        - really removes sections marked "removed" in the draft
--        - applies the new section order
--        - publishes the theme (colours, fonts, button shape)
--        - saves a version in page_versions
--        - writes a line in the Activity log
--   4. newsletter_signups table → emails from the "Email sign-up" section.
--      Only the website's server (/api/newsletter-signup) can add rows; only
--      admins can read them.
--
-- Draft flags used by the editor (inside page_sections.draft, a JSON blob):
--   "_hidden": true   → section is kept but not shown on the website
--   "_removed": true  → section will be removed when someone presses Publish
-- =============================================================================


-- ── 1. Draft order ───────────────────────────────────────────────────────────

alter table public.page_sections
  add column if not exists draft_position integer;

comment on column public.page_sections.draft_position is
  'Section order saved by the editor but not published yet. NULL = order unchanged. Publish copies it into position.';


-- ── 2. Version history ───────────────────────────────────────────────────────

create table if not exists public.page_versions (
  id                  uuid primary key default gen_random_uuid(),
  page_key            text not null,
  brand_id            uuid not null references public.brands (id) on delete cascade,

  -- Everything that was live right after this publish:
  --   { "sections": [ { "id", "section_type", "position", "settings" }, ... ],
  --     "theme": { ...theme settings... } | null }
  snapshot            jsonb not null,

  published_at        timestamptz not null default now(),
  published_by        uuid,
  published_by_email  text
);

create index if not exists page_versions_page_brand_idx
  on public.page_versions (page_key, brand_id, published_at desc);

comment on table public.page_versions is
  'A saved copy of a page each time it is published (Admin → Design → History).';

alter table public.page_versions enable row level security;

drop policy if exists "Admins can read page versions" on public.page_versions;
create policy "Admins can read page versions"
  on public.page_versions for select
  using (public.is_admin());
-- No insert/update/delete policy: only publish_page() (below) writes here.


-- ── 3. publish_page() ────────────────────────────────────────────────────────
-- Called by the editor's Publish button:
--   supabase.rpc('publish_page', { p_page_key: 'home', p_brand_id: '<uuid>' })
-- Returns the id of the new saved version.
--
-- A database function runs as one transaction: if any step fails, NOTHING
-- changes and the live site stays as it was.

create or replace function public.publish_page(p_page_key text, p_brand_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot   jsonb;
  v_theme      jsonb;
  v_version_id uuid;
begin
  -- Only people listed in admin_users may publish.
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  -- a) Sections marked "removed" in the draft → removed for real.
  update page_sections
     set deleted_at = now(), draft = null, draft_position = null
   where page_key = p_page_key
     and brand_id = p_brand_id
     and deleted_at is null
     and draft ->> '_removed' = 'true';

  -- b) Every other section with draft changes → draft becomes the live version.
  update page_sections
     set published = draft - '_removed', draft = null
   where page_key = p_page_key
     and brand_id = p_brand_id
     and deleted_at is null
     and draft is not null;

  -- c) New section order → live order.
  update page_sections
     set position = draft_position, draft_position = null
   where page_key = p_page_key
     and brand_id = p_brand_id
     and deleted_at is null
     and draft_position is not null;

  -- d) Theme (colours, fonts, button shape).
  update theme_settings
     set published = draft, draft = null
   where brand_id = p_brand_id
     and draft is not null;

  -- e) Save a copy of what is now live.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',           s.id,
           'section_type', s.section_type,
           'position',     s.position,
           'settings',     s.published
         ) order by s.position), '[]'::jsonb)
    into v_snapshot
    from page_sections s
   where s.page_key = p_page_key
     and s.brand_id = p_brand_id
     and s.deleted_at is null
     and s.published is not null;

  select t.published into v_theme
    from theme_settings t
   where t.brand_id = p_brand_id;

  insert into page_versions (page_key, brand_id, snapshot, published_by, published_by_email)
  values (
    p_page_key,
    p_brand_id,
    jsonb_build_object('sections', v_snapshot, 'theme', v_theme),
    auth.uid(),
    auth.jwt() ->> 'email'
  )
  returning id into v_version_id;

  -- f) Activity log (Admin → Activity log).
  perform public.log_admin_change(
    'page_sections', v_version_id, 'publish',
    jsonb_build_object('page', p_page_key, 'brand_id', p_brand_id)
  );

  return v_version_id;
end;
$$;

revoke execute on function public.publish_page(text, uuid) from public, anon;
grant  execute on function public.publish_page(text, uuid) to authenticated;


-- ── 4. Email sign-ups ────────────────────────────────────────────────────────

create table if not exists public.newsletter_signups (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  brand_id      uuid references public.brands (id) on delete set null,
  -- When the person ticked/accepted the consent line under the form
  -- (Data Privacy Act: we must be able to show they agreed).
  consented_at  timestamptz not null,
  created_at    timestamptz not null default now()
);

-- One sign-up per email per brand (capital letters don't count as different).
create unique index if not exists newsletter_signups_email_brand_idx
  on public.newsletter_signups (lower(email), brand_id);

comment on table public.newsletter_signups is
  'Emails from the homepage "Email sign-up" section. Added only by /api/newsletter-signup.';

alter table public.newsletter_signups enable row level security;

drop policy if exists "Admins can read newsletter signups" on public.newsletter_signups;
create policy "Admins can read newsletter signups"
  on public.newsletter_signups for select
  using (public.is_admin());

drop policy if exists "Admins can delete newsletter signups" on public.newsletter_signups;
create policy "Admins can delete newsletter signups"
  on public.newsletter_signups for delete
  using (public.is_admin());
-- No insert policy: visitors can't write here directly. The server function
-- uses the service role key, which skips these rules.

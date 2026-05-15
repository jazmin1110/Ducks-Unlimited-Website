-- =============================================================================
-- Migration 007 — site_content table (homepage CMS)
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- Adds a tiny CMS the admin uses to edit homepage copy + images without a
-- coder. Each editable section is one row, keyed by a stable string like
-- 'home.hero' or 'home.tile.polo'. Each row has TWO JSONB blobs:
--
--   draft     → what the admin is editing right now (private until published)
--   published → what the public storefront shows
--
-- The "Publish" button in /admin/homepage.html copies draft → published.
-- The "Preview" button opens /?preview=1, which (for signed-in admins) reads
-- draft instead of published so the admin can see changes before going live.
--
-- Why one table with two columns instead of two tables:
--   - Simpler queries, one round-trip to load everything
--   - Atomic publish (no half-published states)
--   - JSONB lets us evolve each section's shape without migrations
--
-- The shape of each JSONB blob is documented in /admin/homepage.html and
-- /js/site-content.js — Postgres just stores it as opaque JSON.
-- =============================================================================


-- ── Table ──
create table if not exists public.site_content (
  -- Stable, human-readable identifier. Examples:
  --   home.hero
  --   home.tile.polo
  --   home.tile.tshirt
  --   home.tile.bottoms
  --   home.editorial.cotton
  --   home.editorial.workshop
  key         text primary key,

  -- The version every public visitor sees. May be null for never-published rows.
  published   jsonb,

  -- The admin's working copy (saved with "Save draft"). May be null if the
  -- admin hasn't started editing this section yet.
  draft       jsonb,

  updated_at  timestamptz not null default now(),
  -- Tracks which admin last touched the row (for an audit trail later).
  updated_by  uuid        references auth.users(id)
);

-- Auto-update updated_at on every UPDATE so we don't have to remember it
-- in client code. Idempotent: drop if it exists, then recreate.
create or replace function public.tg_site_content_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists site_content_set_updated_at on public.site_content;
create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute function public.tg_site_content_set_updated_at();


-- ── RLS ──
-- Storefront (anonymous) visitors need to read `published`.
-- Admins (any signed-in user) read/write everything.
-- We DON'T expose `draft` to anonymous visitors — they must not see
-- in-progress edits even via SQL.
alter table public.site_content enable row level security;

-- Public can SELECT rows (we trust the client to only render `published`,
-- but to be safe the column-level select grant below restricts that anyway).
drop policy if exists "Public can read published site content" on public.site_content;
create policy "Public can read published site content"
  on public.site_content
  for select
  using (true);

-- Admins (any authenticated user, since this site has no public sign-ups
-- right now — adjust if that changes) can do anything.
drop policy if exists "Admins can manage site content" on public.site_content;
create policy "Admins can manage site content"
  on public.site_content
  for all
  to authenticated
  using (true)
  with check (true);

-- Column-level: anonymous readers cannot see the `draft` column or
-- `updated_by`. They CAN read key/published/updated_at.
revoke all on public.site_content from anon;
grant select (key, published, updated_at) on public.site_content to anon;
-- authenticated keeps full access via the RLS policy above.
grant all on public.site_content to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- SEED — initial published content matching the current hardcoded homepage.
-- Mirrors public/index.html as of this migration so the site looks identical
-- before/after the CMS goes live.
-- on conflict do nothing makes this idempotent if you re-run the file.
-- ────────────────────────────────────────────────────────────────────────────

insert into public.site_content (key, published) values

-- ── Hero ──
('home.hero', jsonb_build_object(
  'eyebrow',     'Ducks Unlimited · Est. 1995',
  'headline',    'Affordable luxury,<br />hand-finished in the Philippines.',
  'sub',         'Egyptian cotton garments, woven, cut, and sewn in our Greenhills workshop — the way we''ve done it for three decades.',
  'cta_text',    'Shop the Collection',
  'cta_link',    '/shop.html',
  'image_url',   'https://picsum.photos/seed/du-hero-2026/1920/1200'
)),

-- ── Collection tiles ──
('home.tile.polo', jsonb_build_object(
  'image_url', 'https://picsum.photos/seed/du-collection-polo/600/800',
  'label',     'Iconic',
  'name',      'Polo Shirts',
  'cta_text',  'Shop Polos',
  'link',      '/shop.html?category=polo'
)),
('home.tile.tshirt', jsonb_build_object(
  'image_url', 'https://picsum.photos/seed/du-collection-tshirt/600/800',
  'label',     'Essentials',
  'name',      'T-Shirts',
  'cta_text',  'Shop T-Shirts',
  'link',      '/shop.html?category=t-shirt'
)),
('home.tile.bottoms', jsonb_build_object(
  'image_url', 'https://picsum.photos/seed/du-collection-bottoms/600/800',
  'label',     'Tailored',
  'name',      'Bottoms',
  'cta_text',  'Shop Bottoms',
  'link',      '/shop.html?category=bottoms'
)),

-- ── Editorial rows ──
('home.editorial.cotton', jsonb_build_object(
  'image_url', 'https://picsum.photos/seed/du-editorial-cotton/900/1100',
  'image_alt', 'Egyptian cotton being woven',
  'eyebrow',   'The Material',
  'headline',  'Woven from the finest Egyptian cotton.',
  'body_html', '<p>Every Ducks Unlimited garment begins with long-staple Egyptian cotton — softer to the touch, stronger in the seam, and built to outlast trend cycles. We weave the cloth ourselves so we can guarantee what''s inside each piece.</p>',
  'cta_text',  'Read the Cotton Story',
  'cta_link',  '/journal/the-cotton-story'
)),
('home.editorial.workshop', jsonb_build_object(
  'image_url', 'https://picsum.photos/seed/du-editorial-workshop/900/1100',
  'image_alt', 'Hand-finishing in the Greenhills workshop',
  'eyebrow',   'The Workshop',
  'headline',  'Hand-finished, one piece at a time.',
  'body_html', '<p>From the first cut to the final hem, every Ducks Unlimited piece is finished by hand in our family-run workshop in Greenhills. No middlemen, no outsourcing — just three decades of craft passed down through our team.</p>',
  'cta_text',  'Discover Our Heritage',
  'cta_link',  '/#story'
))

on conflict (key) do nothing;

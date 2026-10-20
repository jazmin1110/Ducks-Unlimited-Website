-- =============================================================================
-- Migration 015 — page_sections + theme_settings (Shopify-style page builder)
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- Introduces a page-builder foundation so a non-coder admin can reorder, add,
-- and remove sections on a page from the admin UI — the same model Shopify
-- uses in Online Store 2.0:
--
--   templates/<page>  →  ordered list of sections (page_sections rows)
--   sections/<type>   →  the section-type schema (lives in JS, not SQL)
--   settings          →  per-section JSONB blob the admin fills in
--
-- Each row is ONE section on ONE page for ONE brand (or global). The admin
-- edits `draft`; "Publish" copies draft → published atomically. The storefront
-- reads `published` ordered by `position`.
--
-- NOTE: coexists with the existing `site_content` key-based CMS. The old
-- system still renders fine; new work goes through page_sections. We'll
-- migrate the homepage to page_sections in a follow-up.
-- =============================================================================


-- ── page_sections ──
create table if not exists public.page_sections (
  id            uuid primary key default gen_random_uuid(),

  -- Which page this section belongs to. For now: 'home'. Later: 'shop',
  -- 'product', 'journal', custom pages, etc.
  page_key      text not null,

  -- Which brand owns this section. NULL = global (shared across brands).
  -- Follows the pattern already set by site_content.brand_id.
  brand_id      uuid references public.brands (id) on delete cascade,

  -- Which section TYPE this is — matches a schema in /js/section-schemas.js
  -- Examples: 'hero', 'category-tiles', 'product-rail', 'editorial-block',
  -- 'richtext'. Kept as text (not an enum) so new types don't require a
  -- migration — add them to the JS registry and start using them.
  section_type  text not null,

  -- Order within the page. Lower = higher on the page. We leave gaps when
  -- the admin reorders (position 10, 20, 30…) so inserting between two
  -- sections only touches one row.
  position      integer not null default 100,

  -- The public version. May be null for brand-new sections that have only
  -- ever been saved as a draft.
  published     jsonb,

  -- The admin's working copy. May be null if the published version has
  -- never been edited since.
  draft         jsonb,

  -- Soft-delete so an accidentally-removed section can be restored.
  deleted_at    timestamptz,

  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id)
);

create index if not exists page_sections_page_brand_idx
  on public.page_sections (page_key, brand_id, position)
  where deleted_at is null;


-- Auto-touch updated_at.
create or replace function public.tg_page_sections_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists page_sections_set_updated_at on public.page_sections;
create trigger page_sections_set_updated_at
  before update on public.page_sections
  for each row execute function public.tg_page_sections_set_updated_at();


-- ── theme_settings ── (global look & feel — one row per brand)
create table if not exists public.theme_settings (
  -- One row per brand. brand_id is the primary key so there can only ever
  -- be one row per brand — makes "load the theme" a single-row read.
  brand_id      uuid primary key references public.brands (id) on delete cascade,

  -- Same draft/published pattern as site_content.
  published     jsonb,
  draft         jsonb,

  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id)
);

create or replace function public.tg_theme_settings_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists theme_settings_set_updated_at on public.theme_settings;
create trigger theme_settings_set_updated_at
  before update on public.theme_settings
  for each row execute function public.tg_theme_settings_set_updated_at();


-- ── RLS ──
-- Public: can read published rows. Admins (authenticated): everything.
alter table public.page_sections   enable row level security;
alter table public.theme_settings  enable row level security;

drop policy if exists "Public can read page_sections" on public.page_sections;
create policy "Public can read page_sections"
  on public.page_sections for select using (deleted_at is null);

drop policy if exists "Admins can manage page_sections" on public.page_sections;
create policy "Admins can manage page_sections"
  on public.page_sections for all to authenticated
  using (true) with check (true);

drop policy if exists "Public can read theme_settings" on public.theme_settings;
create policy "Public can read theme_settings"
  on public.theme_settings for select using (true);

drop policy if exists "Admins can manage theme_settings" on public.theme_settings;
create policy "Admins can manage theme_settings"
  on public.theme_settings for all to authenticated
  using (true) with check (true);

-- Column-level: anonymous visitors must not see the `draft` of either table.
revoke all on public.page_sections  from anon;
revoke all on public.theme_settings from anon;
-- deleted_at is included so the storefront can filter on it (harmless: RLS
-- already hides deleted rows from anon, so they only ever see NULL here).
grant select (id, page_key, brand_id, section_type, position, published, deleted_at, updated_at)
  on public.page_sections to anon;
grant select (brand_id, published, updated_at)
  on public.theme_settings to anon;
grant all on public.page_sections  to authenticated;
grant all on public.theme_settings to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- SEED — a starter homepage of sections for each brand that exists today.
-- Mirrors the look of the current index.html so switching the storefront
-- renderer to page_sections won't change what visitors see.
-- Positions use the leave-gaps convention (10, 20, 30…).
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  brand_rec record;
begin
  for brand_rec in select id, slug, name from public.brands loop

    -- Hero
    insert into public.page_sections (page_key, brand_id, section_type, position, published)
    select 'home', brand_rec.id, 'hero', 10, jsonb_build_object(
      'eyebrow',   brand_rec.name || ' · Est. 1995',
      'headline',  'Affordable luxury,<br />hand-finished in the Philippines.',
      'sub',       'Egyptian cotton garments, woven, cut, and sewn in our Greenhills workshop.',
      'cta_text',  'Shop the Collection',
      'cta_link',  '/shop.html',
      'image_url', 'https://picsum.photos/seed/' || brand_rec.slug || '-hero/1920/1200'
    )
    where not exists (
      select 1 from public.page_sections
       where page_key = 'home' and brand_id = brand_rec.id and section_type = 'hero'
    );

    -- Category tiles (3 blocks)
    insert into public.page_sections (page_key, brand_id, section_type, position, published)
    select 'home', brand_rec.id, 'category-tiles', 20, jsonb_build_object(
      'heading', 'Shop by Category',
      'blocks', jsonb_build_array(
        jsonb_build_object(
          'id',        gen_random_uuid()::text,
          'image_url', 'https://picsum.photos/seed/' || brand_rec.slug || '-polo/600/800',
          'label',     'Iconic',
          'name',      'Polo Shirts',
          'link',      '/shop.html?category=polo'
        ),
        jsonb_build_object(
          'id',        gen_random_uuid()::text,
          'image_url', 'https://picsum.photos/seed/' || brand_rec.slug || '-tshirt/600/800',
          'label',     'Essentials',
          'name',      'T-Shirts',
          'link',      '/shop.html?category=t-shirt'
        ),
        jsonb_build_object(
          'id',        gen_random_uuid()::text,
          'image_url', 'https://picsum.photos/seed/' || brand_rec.slug || '-bottoms/600/800',
          'label',     'Tailored',
          'name',      'Bottoms',
          'link',      '/shop.html?category=bottoms'
        )
      )
    )
    where not exists (
      select 1 from public.page_sections
       where page_key = 'home' and brand_id = brand_rec.id and section_type = 'category-tiles'
    );

    -- Featured product rail
    insert into public.page_sections (page_key, brand_id, section_type, position, published)
    select 'home', brand_rec.id, 'product-rail', 30, jsonb_build_object(
      'heading',      'New Arrivals',
      'subheading',   'Just arrived in the workshop.',
      'collection',   'new',
      'max_products', 8,
      'cta_text',     'Shop All New',
      'cta_link',     '/shop.html?sort=newest'
    )
    where not exists (
      select 1 from public.page_sections
       where page_key = 'home' and brand_id = brand_rec.id and section_type = 'product-rail'
    );

    -- Editorial block
    insert into public.page_sections (page_key, brand_id, section_type, position, published)
    select 'home', brand_rec.id, 'editorial-block', 40, jsonb_build_object(
      'image_url', 'https://picsum.photos/seed/' || brand_rec.slug || '-cotton/900/1100',
      'image_alt', 'Egyptian cotton being woven',
      'eyebrow',   'The Material',
      'headline',  'Woven from the finest Egyptian cotton.',
      'body',      'Every garment begins with long-staple Egyptian cotton — softer to the touch, stronger in the seam, and built to outlast trend cycles.',
      'cta_text',  'Read the Cotton Story',
      'cta_link',  '/journal/the-cotton-story',
      'layout',    'image-left'
    )
    where not exists (
      select 1 from public.page_sections
       where page_key = 'home' and brand_id = brand_rec.id and section_type = 'editorial-block'
    );

    -- Theme settings
    insert into public.theme_settings (brand_id, published)
    select brand_rec.id, jsonb_build_object(
      'brand_color',   case when brand_rec.slug = 'rw' then '#2A2420' else '#1B4D2E' end,
      'accent_color',  case when brand_rec.slug = 'rw' then '#8C6B3F' else '#C9A84C' end,
      'bg_color',      '#F5F0E8',
      'text_color',    '#1A1A1A',
      'heading_font',  'Cormorant Garamond',
      'body_font',     'DM Sans'
    )
    where not exists (select 1 from public.theme_settings where brand_id = brand_rec.id);

  end loop;
end $$;

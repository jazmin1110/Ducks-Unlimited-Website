-- =============================================================================
-- Migration 004 — Lookbooks + Journal (Phase 4)
-- =============================================================================
-- Adds the editorial content pieces that turn the storefront into something
-- closer to "The World of Ralph Lauren":
--
--   * lookbooks          — top-level editorial collections (e.g. "Holiday 2026")
--   * lookbook_scenes    — full-bleed photographs inside each lookbook
--   * lookbook_hotspots  — clickable points on a scene → links to a product
--   * journal_posts      — long-form editorial articles ("The Cotton Story")
--
-- All four tables are publicly readable (storefront content). Writes are
-- restricted to admins via the is_admin() helper from migration 003.
-- Run this AFTER migration 003.
-- =============================================================================


-- =============================================================================
-- LOOKBOOKS
-- =============================================================================

create table lookbooks (
  id            uuid primary key default gen_random_uuid(),

  -- URL-friendly slug shown in the address bar: /lookbooks/view.html?slug=holiday-2026
  slug          text not null unique,

  title         text not null,
  subtitle      text,            -- One-line teaser shown on the listing page

  -- Cover image used on the /lookbooks/ index grid + as the hero on the detail page.
  hero_image    text not null,

  -- Optional intro paragraph rendered between the hero and the first scene.
  intro         text,

  -- When null, the lookbook is a draft (hidden from the public listing).
  published_at  timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index lookbooks_published_at_idx on lookbooks (published_at desc nulls last);

comment on table lookbooks is
  'Editorial collections shown on /lookbooks/. Each one is a stack of scene photos.';


-- =============================================================================
-- LOOKBOOK SCENES
-- One photo per row, in display order, inside a lookbook.
-- =============================================================================

create table lookbook_scenes (
  id            uuid primary key default gen_random_uuid(),
  lookbook_id   uuid not null references lookbooks (id) on delete cascade,

  -- Full-bleed photo URL (Supabase Storage or external).
  image_url     text not null,

  -- Optional editorial caption shown beside / over the scene.
  caption       text,

  -- Vertical position of the scene inside the lookbook (smaller = earlier).
  display_order integer not null default 0,

  created_at    timestamptz not null default now()
);

create index lookbook_scenes_lookbook_idx
  on lookbook_scenes (lookbook_id, display_order);

comment on table lookbook_scenes is
  'Full-bleed photos stacked inside a lookbook. display_order controls top-to-bottom order.';


-- =============================================================================
-- LOOKBOOK HOTSPOTS
-- A clickable dot on a scene that links to a product ("Shop the Look").
-- Coordinates are stored as percentages so they survive image scaling.
-- =============================================================================

create table lookbook_hotspots (
  id          uuid primary key default gen_random_uuid(),
  scene_id    uuid not null references lookbook_scenes (id) on delete cascade,
  product_id  uuid not null references products (id) on delete cascade,

  -- Position as percentage of the image dimensions.
  -- 0,0  = top-left.   100,100 = bottom-right.
  x_percent   numeric(5, 2) not null check (x_percent >= 0 and x_percent <= 100),
  y_percent   numeric(5, 2) not null check (y_percent >= 0 and y_percent <= 100),

  -- Optional override label shown in the slide-out preview ("Cream Polo, M").
  -- Falls back to the product name when empty.
  label       text,

  created_at  timestamptz not null default now()
);

create index lookbook_hotspots_scene_idx on lookbook_hotspots (scene_id);

comment on table lookbook_hotspots is
  'Clickable dots placed on lookbook scene photos. Each one links to a product.';


-- =============================================================================
-- JOURNAL POSTS
-- Long-form editorial articles ("Why Egyptian Cotton Matters").
-- =============================================================================

create table journal_posts (
  id           uuid primary key default gen_random_uuid(),

  slug         text not null unique,
  title        text not null,
  excerpt      text,            -- Shown on the listing card + as meta description
  hero_image   text,            -- Cover photo for the listing + the post hero
  author       text,            -- e.g. "The DU Team"

  -- Sanitized HTML body. The admin editor writes raw HTML; the storefront
  -- renders it as-is, so admins should only paste content they control.
  body_html    text not null,

  published_at timestamptz,     -- null = draft (hidden from storefront)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index journal_posts_published_at_idx
  on journal_posts (published_at desc nulls last);

comment on table journal_posts is
  'Editorial articles for /journal/. Stored body is rendered as HTML on the post page.';


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table lookbooks         enable row level security;
alter table lookbook_scenes   enable row level security;
alter table lookbook_hotspots enable row level security;
alter table journal_posts     enable row level security;


-- ── lookbooks ──────────────────────────────────────────────────────────────

create policy "Public can read published lookbooks"
  on lookbooks for select
  using (published_at is not null);

create policy "Admins can read all lookbooks"
  on lookbooks for select using (public.is_admin());

create policy "Admins can insert lookbooks"
  on lookbooks for insert with check (public.is_admin());

create policy "Admins can update lookbooks"
  on lookbooks for update using (public.is_admin());

create policy "Admins can delete lookbooks"
  on lookbooks for delete using (public.is_admin());


-- ── lookbook_scenes ────────────────────────────────────────────────────────
-- Scenes inherit the publish state of their parent lookbook.

create policy "Public can read scenes of published lookbooks"
  on lookbook_scenes for select
  using (
    exists (
      select 1 from lookbooks l
      where l.id = lookbook_scenes.lookbook_id
        and l.published_at is not null
    )
  );

create policy "Admins can read all scenes"
  on lookbook_scenes for select using (public.is_admin());

create policy "Admins can insert scenes"
  on lookbook_scenes for insert with check (public.is_admin());

create policy "Admins can update scenes"
  on lookbook_scenes for update using (public.is_admin());

create policy "Admins can delete scenes"
  on lookbook_scenes for delete using (public.is_admin());


-- ── lookbook_hotspots ──────────────────────────────────────────────────────

create policy "Public can read hotspots on published scenes"
  on lookbook_hotspots for select
  using (
    exists (
      select 1 from lookbook_scenes s
      join lookbooks l on l.id = s.lookbook_id
      where s.id = lookbook_hotspots.scene_id
        and l.published_at is not null
    )
  );

create policy "Admins can read all hotspots"
  on lookbook_hotspots for select using (public.is_admin());

create policy "Admins can insert hotspots"
  on lookbook_hotspots for insert with check (public.is_admin());

create policy "Admins can update hotspots"
  on lookbook_hotspots for update using (public.is_admin());

create policy "Admins can delete hotspots"
  on lookbook_hotspots for delete using (public.is_admin());


-- ── journal_posts ──────────────────────────────────────────────────────────

create policy "Public can read published journal posts"
  on journal_posts for select
  using (published_at is not null);

create policy "Admins can read all journal posts"
  on journal_posts for select using (public.is_admin());

create policy "Admins can insert journal posts"
  on journal_posts for insert with check (public.is_admin());

create policy "Admins can update journal posts"
  on journal_posts for update using (public.is_admin());

create policy "Admins can delete journal posts"
  on journal_posts for delete using (public.is_admin());


-- =============================================================================
-- STORAGE — editorial-images bucket
-- A separate bucket from product-images so admins can manage editorial
-- assets without polluting the product imagery namespace.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('editorial-images', 'editorial-images', true)
on conflict (id) do nothing;

create policy "Public can view editorial images"
  on storage.objects for select
  using (bucket_id = 'editorial-images');

create policy "Admins can upload editorial images"
  on storage.objects for insert
  with check (bucket_id = 'editorial-images' and public.is_admin());

create policy "Admins can update editorial images"
  on storage.objects for update
  using (bucket_id = 'editorial-images' and public.is_admin());

create policy "Admins can delete editorial images"
  on storage.objects for delete
  using (bucket_id = 'editorial-images' and public.is_admin());

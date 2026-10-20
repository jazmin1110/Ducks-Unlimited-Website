-- =============================================================================
-- Migration 013 — Rocwood homepage seeds + announcement-bar key
-- =============================================================================
-- Depends on 011 (brand_id column on site_content) and 012 (composite
-- UNIQUE (key, brand_id) with nulls not distinct). Idempotent: re-running
-- just upserts the same defaults — admin edits are not overwritten because
-- `on conflict do nothing` leaves existing rows alone.
--
-- Does three things:
--   1. Seeds Rocwood (brand slug 'rw') defaults for every section the
--      homepage CMS edits, so Rocwood admins don't open blank forms.
--   2. Adds a NEW editable section — home.announcement — for the
--      announcement bar text, seeded for BOTH brands.
--   3. Leaves all existing Ducks Unlimited rows untouched (migration 011
--      backfilled their brand_id).
-- =============================================================================


-- =============================================================================
-- Helper: resolve a brand slug to its UUID. Does nothing permanent; lives
-- only for the duration of this migration via `with` CTEs below.
-- =============================================================================


-- ── 1. Rocwood homepage defaults ──────────────────────────────────────────
-- insert … on conflict do nothing uses the (key, brand_id) composite from
-- migration 012. If a row already exists for (key, rw-brand), it stays as-is.

insert into public.site_content (key, brand_id, published)
select 'home.hero',
       (select id from public.brands where slug = 'rw'),
       jsonb_build_object(
         'eyebrow',   'ROCWOOD',
         'headline',  'Everyday essentials, built to last.',
         'sub',       'Quietly rugged basics for the way we actually live. Cut, stitched, and finished in the Philippines.',
         'cta_text',  'Shop the Collection',
         'cta_link',  '/shop.html?brand=rw',
         'image_url', 'https://picsum.photos/seed/rocwood-hero/1600/900'
       )
on conflict (key, brand_id) do nothing;

insert into public.site_content (key, brand_id, published)
select 'home.tile.polo',
       (select id from public.brands where slug = 'rw'),
       jsonb_build_object(
         'image_url', 'https://picsum.photos/seed/rocwood-men/600/800',
         'label',     'For Him',
         'name',      'Men',
         'cta_text',  'Shop Men',
         'link',      '/shop.html?brand=rw&audience=men'
       )
on conflict (key, brand_id) do nothing;

insert into public.site_content (key, brand_id, published)
select 'home.tile.tshirt',
       (select id from public.brands where slug = 'rw'),
       jsonb_build_object(
         'image_url', 'https://picsum.photos/seed/rocwood-women/600/800',
         'label',     'For Her',
         'name',      'Women',
         'cta_text',  'Shop Women',
         'link',      '/shop.html?brand=rw&audience=women'
       )
on conflict (key, brand_id) do nothing;

insert into public.site_content (key, brand_id, published)
select 'home.tile.bottoms',
       (select id from public.brands where slug = 'rw'),
       jsonb_build_object(
         'image_url', 'https://picsum.photos/seed/rocwood-kids/600/800',
         'label',     'Mini RW',
         'name',      'Kids & Baby',
         'cta_text',  'Shop Kids',
         'link',      '/shop.html?brand=rw&audience=kids'
       )
on conflict (key, brand_id) do nothing;

insert into public.site_content (key, brand_id, published)
select 'home.editorial.cotton',
       (select id from public.brands where slug = 'rw'),
       jsonb_build_object(
         'eyebrow',   'MATERIALS',
         'headline',  'Honest fabrics. Nothing fussy.',
         'body',      'Rocwood pieces lean on heavier-weight cottons and relaxed cuts. Made for the long haul.',
         'cta_text',  'Our Approach',
         'cta_link',  '/#story',
         'image_url', 'https://picsum.photos/seed/rocwood-materials/900/1100'
       )
on conflict (key, brand_id) do nothing;

insert into public.site_content (key, brand_id, published)
select 'home.editorial.workshop',
       (select id from public.brands where slug = 'rw'),
       jsonb_build_object(
         'eyebrow',   'WORKSHOP',
         'headline',  'Made in the Philippines.',
         'body',      'Cut and sewn alongside Ducks Unlimited in our Greenhills workshop. Same hands, different vibe.',
         'cta_text',  'Visit the Store',
         'cta_link',  '/stores.html',
         'image_url', 'https://picsum.photos/seed/rocwood-workshop/900/1100'
       )
on conflict (key, brand_id) do nothing;


-- ── 2. Announcement bar — new key, seeded for BOTH brands ────────────────
-- `message` is HTML-safe (admins can add <strong>, <br>, etc.). Empty
-- message = hide the bar on the storefront. `link` is optional; when set,
-- the entire bar becomes a clickable link to that URL.

insert into public.site_content (key, brand_id, published)
select 'home.announcement',
       (select id from public.brands where slug = 'du'),
       jsonb_build_object(
         'message', 'Free shipping on orders over <strong>₱3,000</strong> · Shipped from Greenhills, Metro Manila',
         'link',    ''
       )
on conflict (key, brand_id) do nothing;

insert into public.site_content (key, brand_id, published)
select 'home.announcement',
       (select id from public.brands where slug = 'rw'),
       jsonb_build_object(
         'message', 'Free shipping on orders over <strong>₱3,000</strong> · Rocwood essentials — made alongside Ducks Unlimited',
         'link',    ''
       )
on conflict (key, brand_id) do nothing;


-- =============================================================================
-- END OF MIGRATION 013
-- =============================================================================

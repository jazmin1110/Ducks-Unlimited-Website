-- =============================================================================
-- Migration 010 — Clear stock images, pare seed products to one
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- WHY this exists:
--   The site was seeded with placeholder imagery from picsum.photos,
--   placehold.co, and Unsplash so layouts looked complete during the
--   initial build. The owner is now ready to start with a clean slate
--   and fill in real photography over time. This migration:
--
--     1. Deletes all 3 demo lookbooks (cascades to scenes + hotspots)
--     2. Deletes all 4 demo journal posts
--     3. Wipes every product image (placehold.co text cards + Unsplash
--        stock photos) so products render with the built-in branded
--        duck-silhouette placeholder
--     4. Deletes 19 of the 20 demo products, keeping ONE ("Classic Cotton
--        Polo") so the shop page still shows what a product card looks
--        like in the listing UI
--     5. Empties every image_url field on the homepage CMS rows so the
--        storefront stops fetching picsum URLs from site_content
--
-- Idempotent — every section uses prefix matchers (`demo-` slugs and
-- `f1110000` UUIDs) that are safe to re-run.
--
-- The HTML/CSS changes that go with this migration are in the same PR:
--   - public/index.html — strip picsum URLs from hero, tiles, editorial,
--     journal-teaser imgs
--   - public/components/nav.html — remove mega-nav featured img tiles
--   - public/css/style.css — brand-tone placeholder for any blank img
--   - public/js/site-content.js — skip empty image_url so storefront
--     doesn't paint <img src="">
-- =============================================================================


-- ── 1. Lookbooks (cascades to lookbook_scenes + lookbook_hotspots) ──
-- The cascade is defined in migration 004 via ON DELETE CASCADE.
delete from public.lookbooks
where slug like 'demo-%';


-- ── 2. Journal posts ──
delete from public.journal_posts
where slug like 'demo-%';


-- ── 3. Wipe every product image for the demo product set ──
-- Removes both the original placehold.co text-card images AND any Unsplash
-- photos seeded later. The remaining product (kept in step 4) will have
-- ZERO images, which the storefront card already handles by rendering a
-- branded duck-silhouette placeholder.
delete from public.product_images
where product_id::text like 'f1110000%';


-- ── 4. Pare demo products from 20 down to 1 ──
-- Keeps "Classic Cotton Polo" (UUID ending ...0001). The other 19 cascade
-- through to their variants and inventory rows automatically.
delete from public.products
where id::text like 'f1110000%'
  and id != 'f1110000-0000-0000-0000-000000000001';


-- ── 5. Clear every image_url field on the homepage CMS rows ──
-- Sets the value to an empty string in the published JSONB blob for each
-- home.* row. The storefront reader (js/site-content.js) treats empty
-- strings as "skip", so the HTML's blank <img> shows the brand-tone
-- placeholder rule instead of being overwritten with picsum URLs.
update public.site_content
set published = jsonb_set(coalesce(published, '{}'::jsonb), '{image_url}', '""'::jsonb)
where key like 'home.%'
  and published ? 'image_url';


-- =============================================================================
-- Verification queries (run after the migration to confirm)
-- =============================================================================
--   select count(*) from products       where id::text like 'f1110000%';        -- expect 1
--   select count(*) from product_images where product_id::text like 'f1110000%'; -- expect 0
--   select count(*) from lookbooks      where slug like 'demo-%';               -- expect 0
--   select count(*) from journal_posts  where slug like 'demo-%';               -- expect 0
--   select key, published->>'image_url' from site_content where key like 'home.%';
--   -- every row's image_url should be the empty string
-- =============================================================================

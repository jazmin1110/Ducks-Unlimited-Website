-- =============================================================================
-- Migration 008 — re-theme homepage tiles from product types to audiences
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- The three homepage collection tiles were originally seeded as product
-- types: Polos / T-Shirts / Bottoms. The brand prefers an audience-led
-- navigation (Men / Women / Kids & Baby), so this migration rewrites the
-- published content for each tile.
--
-- Internal keys are intentionally KEPT the same (home.tile.polo etc.) so
-- that the storefront's data-content-key attributes don't need to change
-- and any in-progress drafts the admin has saved aren't lost.
--
-- Image URLs use new picsum.photos seeds; the admin can replace each one
-- with a real photo via /admin/homepage.html → upload.
--
-- Idempotent: re-running just overwrites with the same values.
-- =============================================================================

update public.site_content
set published = jsonb_build_object(
  'image_url', 'https://picsum.photos/seed/du-collection-men/600/800',
  'label',     'For Him',
  'name',      'Men',
  'cta_text',  'Shop Men',
  'link',      '/shop.html?audience=men'
)
where key = 'home.tile.polo';

update public.site_content
set published = jsonb_build_object(
  'image_url', 'https://picsum.photos/seed/du-collection-women/600/800',
  'label',     'For Her',
  'name',      'Women',
  'cta_text',  'Shop Women',
  'link',      '/shop.html?audience=women'
)
where key = 'home.tile.tshirt';

update public.site_content
set published = jsonb_build_object(
  'image_url', 'https://picsum.photos/seed/du-collection-kids/600/800',
  'label',     'Mini DU',
  'name',      'Kids & Baby',
  'cta_text',  'Shop Kids',
  'link',      '/shop.html?audience=kids'
)
where key = 'home.tile.bottoms';

-- =============================================================================
-- Migration 025 — Rocwood's brand colour is club navy (#1F2A44)
-- =============================================================================
-- Ducks Unlimited stays forest green (#1B4D2E).
--
-- Before this, Rocwood had three different colours in three places:
--   brands.primary_color        → #2A2420 (espresso brown)
--   theme_settings brand_color  → #213a9c (royal blue, set in Admin → Theme)
--   the site's CSS              → #2A2420 (now changed to #1F2A44 in style.css)
-- This puts the same navy in the database so every page matches.
--
-- Safe to run more than once.
-- =============================================================================

update brands
   set primary_color = '#1F2A44'
 where slug = 'rw';

-- The live theme (and the unpublished draft, if there is one) used by
-- the homepage sections and Admin → Theme
update theme_settings
   set published = jsonb_set(coalesce(published, '{}'::jsonb), '{brand_color}', '"#1F2A44"'),
       draft     = case when draft is null then null
                        else jsonb_set(draft, '{brand_color}', '"#1F2A44"') end,
       updated_at = now()
 where brand_id = (select id from brands where slug = 'rw');

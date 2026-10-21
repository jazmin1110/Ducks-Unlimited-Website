-- =============================================================================
-- Migration 018 — Let visitors read site_content.brand_id
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- Bug: migration 012 made site_content per-brand, and the storefront loaders
-- (/js/site-content.js, the announcement bar, the shop intro) now select and
-- filter on brand_id. But anonymous visitors were only ever granted
-- key / published / updated_at (migration 007), so every request failed with
-- "permission denied for table site_content" and visitors only ever saw the
-- hardcoded fallback text — e.g. Rocwood pages showed Ducks Unlimited copy.
--
-- brand_id is not sensitive (it's just which brand a row belongs to), so we
-- grant it. `draft` stays hidden from anonymous visitors.
-- =============================================================================

grant select (brand_id) on public.site_content to anon;

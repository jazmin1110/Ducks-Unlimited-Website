-- =============================================================================
-- 032 — "Knit, not woven" copy + new Accessories category (Oct 2026)
--
-- What changes:
--   * Ducks Unlimited only knits, so every "woven / weave" mention in live
--     content becomes knit wording.
--   * New product category 'accessories' (socks, underwear, bags, caps…).
--     products.category is plain text with no CHECK list, so no table change
--     is needed — the site's dropdowns and labels were updated in code.
--   * Underwear (boxers and briefs) moves from 'others' to 'accessories'.
--
-- Content only. Safe to run more than once.
-- =============================================================================

-- ── Homepage "The Material" block (Ducks Unlimited) ─────────────────────────
update page_sections
set published = published
      || jsonb_build_object(
           'headline',  'Knitted from the finest Egyptian cotton.',
           'body',      '<p>Every Ducks Unlimited garment begins with long-staple Egyptian cotton — softer to the touch, stronger in the seam, and built to outlast trend cycles. We knit the fabric ourselves so we can guarantee what''s inside each piece.</p>',
           'image_alt', 'Egyptian cotton knit fabric'),
    updated_at = now()
where id = '77dca369-f223-482f-a2bd-0f22f81afbff';

-- Older site_content copy of the same block, kept in sync
update site_content
set published = published
      || jsonb_build_object(
           'headline',  'Knitted from the finest Egyptian cotton.',
           'body_html', '<p>Every Ducks Unlimited garment begins with long-staple Egyptian cotton — softer to the touch, stronger in the seam, and built to outlast trend cycles. We knit the fabric ourselves so we can guarantee what''s inside each piece.</p>',
           'image_alt', 'Egyptian cotton knit fabric'),
    updated_at = now()
where key = 'home.editorial.cotton';

-- ── Product descriptions ────────────────────────────────────────────────────
update products
set description = replace(description, 'woven from soft Egyptian cotton', 'knitted from soft Egyptian cotton')
where description like '%woven from soft Egyptian cotton%';

update products
set description = replace(description, 'Ducks Unlimited woven waistband', 'Ducks Unlimited knit waistband')
where description like '%Ducks Unlimited woven waistband%';

-- ── Underwear → Accessories ─────────────────────────────────────────────────
update products
set category = 'accessories'
where category = 'others'
  and name ~* '(brief|boxer|sock|underwear|bag|cap|hat|belt)';

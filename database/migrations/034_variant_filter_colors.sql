-- =============================================================================
-- 034 — Plain-English colours for the shop's Colour filter
-- =============================================================================
-- Product colour names are brand-speak ("Snorkel Blue", "Cork", "Turtle Dove").
-- Shoppers filter by everyday colours ("Blue", "Brown", "Beige"), so each
-- variant can carry up to two everyday colours: the shirt colour first, then
-- the main colour of the print. Example: Running Club on Snorkel Blue with a
-- white print = {Blue, White}.
--
-- Allowed names (same list as colorFamily() in public/js/colors.js):
--   White, Black, Grey, Beige, Brown, Red, Orange, Yellow, Green, Blue, Navy,
--   Purple, Pink
--
-- Left empty, the shop works it out from the variant's swatch colour
-- (color_hex / colour name) — that gives the shirt colour only.
-- =============================================================================

alter table variants
  add column if not exists filter_colors text[];

comment on column variants.filter_colors is
  'Everyday colours for the shop Colour filter: shirt colour first, then main print colour (max 2). Empty = worked out from color_hex.';

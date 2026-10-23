-- =============================================================================
-- Migration 030 — Tag product photos with a color
-- =============================================================================
-- What this adds:
--
--   product_images.color — which colorway a photo shows, e.g. 'Navy'.
--     * Must match the color name used on the product's variants.
--     * Leave it empty (null) for photos that suit every color
--       (detail shots, lifestyle photos, size charts…).
--
-- How the product page uses it:
--   When a shopper taps a color swatch, the gallery shows that color's
--   photos first, followed by the "all colors" photos. If a color has no
--   photos of its own yet, every photo is shown like before.
--
-- Safe to run more than once.
-- =============================================================================

alter table product_images
  add column if not exists color text;

comment on column product_images.color is
  'Colorway shown in this photo (matches variants.color). Null = shown for every color.';

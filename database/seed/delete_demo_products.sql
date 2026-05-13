-- =============================================================================
-- Ducks Unlimited — Delete All Demo Products
-- =============================================================================
-- Run this in the Supabase SQL Editor to remove EVERYTHING created by
-- demo_products.sql.
--
-- How this works: every demo product has a UUID starting with `f1110000-`.
-- Deleting those products cascades automatically to their variants,
-- inventory rows, and product_images (via ON DELETE CASCADE in the schema).
--
-- Your real products (created through the admin panel) are completely
-- unaffected — they have random UUIDs that won't match this pattern.
-- =============================================================================

DELETE FROM products
WHERE id::text LIKE 'f1110000%';

-- That's it. The cascade handles the rest.
-- Run this query afterwards to confirm everything's gone:
--   SELECT count(*) FROM products WHERE id::text LIKE 'f1110000%';   -- should be 0

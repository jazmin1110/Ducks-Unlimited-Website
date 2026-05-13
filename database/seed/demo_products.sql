-- =============================================================================
-- Ducks Unlimited — Demo Product Seed
-- =============================================================================
-- Run this in the Supabase SQL Editor to populate the shop with 20 demo
-- products (with variants, inventory, and placeholder images) so you can
-- test the storefront and admin panel against realistic-looking data.
--
-- All demo products share UUIDs starting with `f1110000-` so they're easy
-- to remove later. Run `database/seed/delete_demo_products.sql` to wipe
-- everything created here.
--
-- Re-running this file is SAFE — it deletes prior demo data first, so you'll
-- never get duplicate rows or unique-constraint violations.
-- =============================================================================


-- ─── 0. Clean up any existing demo data (so this file is re-runnable) ───
DELETE FROM products WHERE id::text LIKE 'f1110000%';
-- CASCADE on FK constraints removes related variants, inventory, and images.


-- ─── 1. Insert 20 demo products ───
INSERT INTO products (id, name, description, category, base_price, is_active) VALUES

  -- ── Polo Shirts ──
  ('f1110000-0000-0000-0000-000000000001',
   'Classic Cotton Polo',
   'Our flagship polo, woven from soft Egyptian cotton with a slight stretch for all-day comfort. Tailored fit, mother-of-pearl buttons, hand-finished in our Greenhills workshop.',
   'polo', 950, true),

  ('f1110000-0000-0000-0000-000000000002',
   'Cordillera Pique Polo',
   'Heavier pique knit inspired by mountain weekends — substantial weight, breathable weave, holds its shape after countless washes.',
   'polo', 1100, true),

  ('f1110000-0000-0000-0000-000000000003',
   'Saturday Polo',
   'A lighter, easy-fit polo for slow weekends. Ringspun cotton with a soft hand-feel and a slightly longer back hem.',
   'polo', 850, true),

  ('f1110000-0000-0000-0000-000000000004',
   'Heritage Polo',
   'Our most refined polo. Long-staple Egyptian cotton, hand-rolled placket, signature woven label at the hem.',
   'polo', 1250, true),

  ('f1110000-0000-0000-0000-000000000005',
   'Sunday Polo',
   'Made for warm mornings — featherweight cotton, generously cut, with a soft collar that lays flat or stands up cleanly.',
   'polo', 950, true),

  -- ── T-Shirts ──
  ('f1110000-0000-0000-0000-000000000006',
   'Essential Crew Tee',
   'The everyday tee, refined. Combed cotton jersey, double-stitched seams, a crew neck that keeps its shape.',
   't-shirt', 650, true),

  ('f1110000-0000-0000-0000-000000000007',
   'Pocket Tee',
   'Garment-dyed cotton with a chest pocket and a slightly relaxed cut. Soft from the very first wear.',
   't-shirt', 700, true),

  ('f1110000-0000-0000-0000-000000000008',
   'Pinoy Heritage Tee',
   'A tribute to our 30 years in Greenhills — subtle woven flag detail at the hem, otherwise quietly classic.',
   't-shirt', 750, true),

  ('f1110000-0000-0000-0000-000000000009',
   'Garden Tee',
   'Lightweight cotton in colors that lean toward the outdoors. Cut a touch longer for comfort.',
   't-shirt', 650, true),

  ('f1110000-0000-0000-0000-000000000010',
   'Beach Boy Tee',
   'Salt-washed cotton in cooling tones. Looks great straight out of the laundry pile.',
   't-shirt', 700, true),

  -- ── Shorts ──
  ('f1110000-0000-0000-0000-000000000011',
   'Beach Day Shorts',
   'Quick-drying cotton blend, generously cut above the knee. Side pockets, elastic back, hidden drawcord.',
   'shorts', 850, true),

  ('f1110000-0000-0000-0000-000000000012',
   'Tailored Linen Shorts',
   'Pure Irish linen with a flat-front cut. Dressy enough for a beach wedding, easy enough for Sundays.',
   'shorts', 1100, true),

  ('f1110000-0000-0000-0000-000000000013',
   'Cargo Shorts',
   'Heavy cotton twill with reinforced side pockets and a relaxed leg. Built to outlast your weekends.',
   'shorts', 1200, true),

  ('f1110000-0000-0000-0000-000000000014',
   'Weekender Shorts',
   'Mid-weight cotton with a clean front and tapered leg. The shorts you reach for without thinking.',
   'shorts', 900, true),

  ('f1110000-0000-0000-0000-000000000015',
   'Boracay Shorts',
   'Inspired by long afternoons on white sand. Lightweight, slightly above the knee, with a coconut-button waistband.',
   'shorts', 850, true),

  -- ── Pants ──
  ('f1110000-0000-0000-0000-000000000016',
   'Classic Chinos',
   'The chino, perfected. Mid-weight cotton, slim-straight cut, hand-finished hem ready for cuffing.',
   'pants', 1500, true),

  ('f1110000-0000-0000-0000-000000000017',
   'Linen Trousers',
   'Pure linen with a relaxed pleat. Crisp on humid mornings, comfortable through the longest dinners.',
   'pants', 1800, true),

  ('f1110000-0000-0000-0000-000000000018',
   'Manila Tailored Pants',
   'Our dressiest trouser. Wool-cotton blend with a hand-set waistband and clean half-break at the shoe.',
   'pants', 2200, true),

  ('f1110000-0000-0000-0000-000000000019',
   'Weekend Pants',
   'Soft brushed cotton with a tapered leg and elastic waist. The lazy alternative to jeans.',
   'pants', 1400, true),

  ('f1110000-0000-0000-0000-000000000020',
   'Heritage Slacks',
   'Our signature dress slack — heavyweight wool blend, deep front pleats, satin-finish buttons.',
   'pants', 2000, true);


-- ─── 2. Insert one primary placeholder image per product ───
-- placehold.co generates simple branded text images that always load.
-- Each product gets a different background/foreground combo for variety
-- across the catalog grid.
INSERT INTO product_images (product_id, image_url, display_order, is_primary) VALUES

  ('f1110000-0000-0000-0000-000000000001',
   'https://placehold.co/600x720/1B4D2E/F5F0E8/png?text=Classic+Cotton+Polo&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000002',
   'https://placehold.co/600x720/C9A84C/FFFFFF/png?text=Cordillera+Pique+Polo&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000003',
   'https://placehold.co/600x720/F5F0E8/1B4D2E/png?text=Saturday+Polo&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000004',
   'https://placehold.co/600x720/1A1A1A/F5F0E8/png?text=Heritage+Polo&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000005',
   'https://placehold.co/600x720/1B4D2E/C9A84C/png?text=Sunday+Polo&font=playfair', 0, true),

  ('f1110000-0000-0000-0000-000000000006',
   'https://placehold.co/600x720/F5F0E8/1B4D2E/png?text=Essential+Crew+Tee&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000007',
   'https://placehold.co/600x720/1B4D2E/F5F0E8/png?text=Pocket+Tee&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000008',
   'https://placehold.co/600x720/1A1A1A/C9A84C/png?text=Pinoy+Heritage+Tee&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000009',
   'https://placehold.co/600x720/C9A84C/1B4D2E/png?text=Garden+Tee&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000010',
   'https://placehold.co/600x720/F5F0E8/C9A84C/png?text=Beach+Boy+Tee&font=playfair', 0, true),

  ('f1110000-0000-0000-0000-000000000011',
   'https://placehold.co/600x720/1B4D2E/F5F0E8/png?text=Beach+Day+Shorts&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000012',
   'https://placehold.co/600x720/F5F0E8/1B4D2E/png?text=Tailored+Linen+Shorts&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000013',
   'https://placehold.co/600x720/1A1A1A/F5F0E8/png?text=Cargo+Shorts&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000014',
   'https://placehold.co/600x720/C9A84C/FFFFFF/png?text=Weekender+Shorts&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000015',
   'https://placehold.co/600x720/1B4D2E/C9A84C/png?text=Boracay+Shorts&font=playfair', 0, true),

  ('f1110000-0000-0000-0000-000000000016',
   'https://placehold.co/600x720/1A1A1A/F5F0E8/png?text=Classic+Chinos&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000017',
   'https://placehold.co/600x720/F5F0E8/1B4D2E/png?text=Linen+Trousers&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000018',
   'https://placehold.co/600x720/1B4D2E/F5F0E8/png?text=Manila+Tailored+Pants&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000019',
   'https://placehold.co/600x720/C9A84C/1B4D2E/png?text=Weekend+Pants&font=playfair', 0, true),
  ('f1110000-0000-0000-0000-000000000020',
   'https://placehold.co/600x720/1A1A1A/C9A84C/png?text=Heritage+Slacks&font=playfair', 0, true);


-- ─── 3. Insert variants + their inventory ───
-- Strategy: insert all variants in one statement, then use a CTE to insert
-- the matching inventory rows (online + greenhills_store) in a second.
--
-- SKU format: DUS-{NN}-{COL3}-{SIZE}  e.g. DUS-01-NAV-M  (DUS = Demo Ducks Seed)
--
-- All variants start with quantity=20 online and quantity=10 in-store, with
-- low_stock_threshold=5. A handful are knocked down at the bottom of this
-- file to simulate low/out-of-stock for testing the storefront badges.

WITH inserted AS (
  INSERT INTO variants (product_id, color, size, sku, price_override) VALUES

    -- 1. Classic Cotton Polo — Navy / White / Cream  in S, M, L, XL, XXL
    ('f1110000-0000-0000-0000-000000000001', 'Navy',   'S',   'DUS-01-NAV-S',   null),
    ('f1110000-0000-0000-0000-000000000001', 'Navy',   'M',   'DUS-01-NAV-M',   null),
    ('f1110000-0000-0000-0000-000000000001', 'Navy',   'L',   'DUS-01-NAV-L',   null),
    ('f1110000-0000-0000-0000-000000000001', 'Navy',   'XL',  'DUS-01-NAV-XL',  null),
    ('f1110000-0000-0000-0000-000000000001', 'Navy',   'XXL', 'DUS-01-NAV-XXL', null),
    ('f1110000-0000-0000-0000-000000000001', 'White',  'S',   'DUS-01-WHT-S',   null),
    ('f1110000-0000-0000-0000-000000000001', 'White',  'M',   'DUS-01-WHT-M',   null),
    ('f1110000-0000-0000-0000-000000000001', 'White',  'L',   'DUS-01-WHT-L',   null),
    ('f1110000-0000-0000-0000-000000000001', 'White',  'XL',  'DUS-01-WHT-XL',  null),
    ('f1110000-0000-0000-0000-000000000001', 'Cream',  'S',   'DUS-01-CRM-S',   null),
    ('f1110000-0000-0000-0000-000000000001', 'Cream',  'M',   'DUS-01-CRM-M',   null),
    ('f1110000-0000-0000-0000-000000000001', 'Cream',  'L',   'DUS-01-CRM-L',   null),

    -- 2. Cordillera Pique Polo — Forest Green / Charcoal / Navy  in M, L, XL
    ('f1110000-0000-0000-0000-000000000002', 'Forest Green', 'M',  'DUS-02-FOR-M',  null),
    ('f1110000-0000-0000-0000-000000000002', 'Forest Green', 'L',  'DUS-02-FOR-L',  null),
    ('f1110000-0000-0000-0000-000000000002', 'Forest Green', 'XL', 'DUS-02-FOR-XL', null),
    ('f1110000-0000-0000-0000-000000000002', 'Charcoal',     'M',  'DUS-02-CHA-M',  null),
    ('f1110000-0000-0000-0000-000000000002', 'Charcoal',     'L',  'DUS-02-CHA-L',  null),
    ('f1110000-0000-0000-0000-000000000002', 'Charcoal',     'XL', 'DUS-02-CHA-XL', null),
    ('f1110000-0000-0000-0000-000000000002', 'Navy',         'M',  'DUS-02-NAV-M',  null),
    ('f1110000-0000-0000-0000-000000000002', 'Navy',         'L',  'DUS-02-NAV-L',  null),
    ('f1110000-0000-0000-0000-000000000002', 'Navy',         'XL', 'DUS-02-NAV-XL', null),

    -- 3. Saturday Polo — White / Khaki / Olive  in S, M, L
    ('f1110000-0000-0000-0000-000000000003', 'White', 'S', 'DUS-03-WHT-S', null),
    ('f1110000-0000-0000-0000-000000000003', 'White', 'M', 'DUS-03-WHT-M', null),
    ('f1110000-0000-0000-0000-000000000003', 'White', 'L', 'DUS-03-WHT-L', null),
    ('f1110000-0000-0000-0000-000000000003', 'Khaki', 'S', 'DUS-03-KHA-S', null),
    ('f1110000-0000-0000-0000-000000000003', 'Khaki', 'M', 'DUS-03-KHA-M', null),
    ('f1110000-0000-0000-0000-000000000003', 'Khaki', 'L', 'DUS-03-KHA-L', null),
    ('f1110000-0000-0000-0000-000000000003', 'Olive', 'S', 'DUS-03-OLI-S', null),
    ('f1110000-0000-0000-0000-000000000003', 'Olive', 'M', 'DUS-03-OLI-M', null),
    ('f1110000-0000-0000-0000-000000000003', 'Olive', 'L', 'DUS-03-OLI-L', null),

    -- 4. Heritage Polo — Cream / Navy / Black  in S, M, L, XL, XXL  (XXL upcharge)
    ('f1110000-0000-0000-0000-000000000004', 'Cream', 'S',   'DUS-04-CRM-S',   null),
    ('f1110000-0000-0000-0000-000000000004', 'Cream', 'M',   'DUS-04-CRM-M',   null),
    ('f1110000-0000-0000-0000-000000000004', 'Cream', 'L',   'DUS-04-CRM-L',   null),
    ('f1110000-0000-0000-0000-000000000004', 'Cream', 'XL',  'DUS-04-CRM-XL',  null),
    ('f1110000-0000-0000-0000-000000000004', 'Cream', 'XXL', 'DUS-04-CRM-XXL', 1350),
    ('f1110000-0000-0000-0000-000000000004', 'Navy',  'M',   'DUS-04-NAV-M',   null),
    ('f1110000-0000-0000-0000-000000000004', 'Navy',  'L',   'DUS-04-NAV-L',   null),
    ('f1110000-0000-0000-0000-000000000004', 'Navy',  'XL',  'DUS-04-NAV-XL',  null),
    ('f1110000-0000-0000-0000-000000000004', 'Black', 'M',   'DUS-04-BLK-M',   null),
    ('f1110000-0000-0000-0000-000000000004', 'Black', 'L',   'DUS-04-BLK-L',   null),

    -- 5. Sunday Polo — Light Blue / White / Cream  in S, M, L, XL
    ('f1110000-0000-0000-0000-000000000005', 'Light Blue', 'S',  'DUS-05-LBL-S',  null),
    ('f1110000-0000-0000-0000-000000000005', 'Light Blue', 'M',  'DUS-05-LBL-M',  null),
    ('f1110000-0000-0000-0000-000000000005', 'Light Blue', 'L',  'DUS-05-LBL-L',  null),
    ('f1110000-0000-0000-0000-000000000005', 'Light Blue', 'XL', 'DUS-05-LBL-XL', null),
    ('f1110000-0000-0000-0000-000000000005', 'White',      'S',  'DUS-05-WHT-S',  null),
    ('f1110000-0000-0000-0000-000000000005', 'White',      'M',  'DUS-05-WHT-M',  null),
    ('f1110000-0000-0000-0000-000000000005', 'White',      'L',  'DUS-05-WHT-L',  null),
    ('f1110000-0000-0000-0000-000000000005', 'Cream',      'S',  'DUS-05-CRM-S',  null),
    ('f1110000-0000-0000-0000-000000000005', 'Cream',      'M',  'DUS-05-CRM-M',  null),

    -- 6. Essential Crew Tee — White / Black / Navy / Charcoal  in XS, S, M, L, XL
    ('f1110000-0000-0000-0000-000000000006', 'White',    'XS', 'DUS-06-WHT-XS', null),
    ('f1110000-0000-0000-0000-000000000006', 'White',    'S',  'DUS-06-WHT-S',  null),
    ('f1110000-0000-0000-0000-000000000006', 'White',    'M',  'DUS-06-WHT-M',  null),
    ('f1110000-0000-0000-0000-000000000006', 'White',    'L',  'DUS-06-WHT-L',  null),
    ('f1110000-0000-0000-0000-000000000006', 'White',    'XL', 'DUS-06-WHT-XL', null),
    ('f1110000-0000-0000-0000-000000000006', 'Black',    'S',  'DUS-06-BLK-S',  null),
    ('f1110000-0000-0000-0000-000000000006', 'Black',    'M',  'DUS-06-BLK-M',  null),
    ('f1110000-0000-0000-0000-000000000006', 'Black',    'L',  'DUS-06-BLK-L',  null),
    ('f1110000-0000-0000-0000-000000000006', 'Black',    'XL', 'DUS-06-BLK-XL', null),
    ('f1110000-0000-0000-0000-000000000006', 'Navy',     'S',  'DUS-06-NAV-S',  null),
    ('f1110000-0000-0000-0000-000000000006', 'Navy',     'M',  'DUS-06-NAV-M',  null),
    ('f1110000-0000-0000-0000-000000000006', 'Navy',     'L',  'DUS-06-NAV-L',  null),
    ('f1110000-0000-0000-0000-000000000006', 'Charcoal', 'M',  'DUS-06-CHA-M',  null),
    ('f1110000-0000-0000-0000-000000000006', 'Charcoal', 'L',  'DUS-06-CHA-L',  null),

    -- 7. Pocket Tee — Olive / Cream / Black  in S, M, L, XL
    ('f1110000-0000-0000-0000-000000000007', 'Olive', 'S',  'DUS-07-OLI-S',  null),
    ('f1110000-0000-0000-0000-000000000007', 'Olive', 'M',  'DUS-07-OLI-M',  null),
    ('f1110000-0000-0000-0000-000000000007', 'Olive', 'L',  'DUS-07-OLI-L',  null),
    ('f1110000-0000-0000-0000-000000000007', 'Cream', 'S',  'DUS-07-CRM-S',  null),
    ('f1110000-0000-0000-0000-000000000007', 'Cream', 'M',  'DUS-07-CRM-M',  null),
    ('f1110000-0000-0000-0000-000000000007', 'Cream', 'L',  'DUS-07-CRM-L',  null),
    ('f1110000-0000-0000-0000-000000000007', 'Black', 'M',  'DUS-07-BLK-M',  null),
    ('f1110000-0000-0000-0000-000000000007', 'Black', 'L',  'DUS-07-BLK-L',  null),
    ('f1110000-0000-0000-0000-000000000007', 'Black', 'XL', 'DUS-07-BLK-XL', null),

    -- 8. Pinoy Heritage Tee — Navy / Cream / Olive  in S, M, L, XL
    ('f1110000-0000-0000-0000-000000000008', 'Navy',  'S',  'DUS-08-NAV-S',  null),
    ('f1110000-0000-0000-0000-000000000008', 'Navy',  'M',  'DUS-08-NAV-M',  null),
    ('f1110000-0000-0000-0000-000000000008', 'Navy',  'L',  'DUS-08-NAV-L',  null),
    ('f1110000-0000-0000-0000-000000000008', 'Navy',  'XL', 'DUS-08-NAV-XL', null),
    ('f1110000-0000-0000-0000-000000000008', 'Cream', 'S',  'DUS-08-CRM-S',  null),
    ('f1110000-0000-0000-0000-000000000008', 'Cream', 'M',  'DUS-08-CRM-M',  null),
    ('f1110000-0000-0000-0000-000000000008', 'Cream', 'L',  'DUS-08-CRM-L',  null),
    ('f1110000-0000-0000-0000-000000000008', 'Olive', 'M',  'DUS-08-OLI-M',  null),
    ('f1110000-0000-0000-0000-000000000008', 'Olive', 'L',  'DUS-08-OLI-L',  null),

    -- 9. Garden Tee — Forest Green / Cream / White  in S, M, L
    ('f1110000-0000-0000-0000-000000000009', 'Forest Green', 'S', 'DUS-09-FOR-S', null),
    ('f1110000-0000-0000-0000-000000000009', 'Forest Green', 'M', 'DUS-09-FOR-M', null),
    ('f1110000-0000-0000-0000-000000000009', 'Forest Green', 'L', 'DUS-09-FOR-L', null),
    ('f1110000-0000-0000-0000-000000000009', 'Cream',        'S', 'DUS-09-CRM-S', null),
    ('f1110000-0000-0000-0000-000000000009', 'Cream',        'M', 'DUS-09-CRM-M', null),
    ('f1110000-0000-0000-0000-000000000009', 'Cream',        'L', 'DUS-09-CRM-L', null),
    ('f1110000-0000-0000-0000-000000000009', 'White',        'S', 'DUS-09-WHT-S', null),
    ('f1110000-0000-0000-0000-000000000009', 'White',        'M', 'DUS-09-WHT-M', null),
    ('f1110000-0000-0000-0000-000000000009', 'White',        'L', 'DUS-09-WHT-L', null),

    -- 10. Beach Boy Tee — Light Blue / Cream / White  in S, M, L, XL
    ('f1110000-0000-0000-0000-000000000010', 'Light Blue', 'S',  'DUS-10-LBL-S',  null),
    ('f1110000-0000-0000-0000-000000000010', 'Light Blue', 'M',  'DUS-10-LBL-M',  null),
    ('f1110000-0000-0000-0000-000000000010', 'Light Blue', 'L',  'DUS-10-LBL-L',  null),
    ('f1110000-0000-0000-0000-000000000010', 'Light Blue', 'XL', 'DUS-10-LBL-XL', null),
    ('f1110000-0000-0000-0000-000000000010', 'Cream',      'S',  'DUS-10-CRM-S',  null),
    ('f1110000-0000-0000-0000-000000000010', 'Cream',      'M',  'DUS-10-CRM-M',  null),
    ('f1110000-0000-0000-0000-000000000010', 'Cream',      'L',  'DUS-10-CRM-L',  null),
    ('f1110000-0000-0000-0000-000000000010', 'White',      'M',  'DUS-10-WHT-M',  null),
    ('f1110000-0000-0000-0000-000000000010', 'White',      'L',  'DUS-10-WHT-L',  null),

    -- 11. Beach Day Shorts — Navy / Khaki / Olive  in S, M, L, XL
    ('f1110000-0000-0000-0000-000000000011', 'Navy',  'S',  'DUS-11-NAV-S',  null),
    ('f1110000-0000-0000-0000-000000000011', 'Navy',  'M',  'DUS-11-NAV-M',  null),
    ('f1110000-0000-0000-0000-000000000011', 'Navy',  'L',  'DUS-11-NAV-L',  null),
    ('f1110000-0000-0000-0000-000000000011', 'Navy',  'XL', 'DUS-11-NAV-XL', null),
    ('f1110000-0000-0000-0000-000000000011', 'Khaki', 'S',  'DUS-11-KHA-S',  null),
    ('f1110000-0000-0000-0000-000000000011', 'Khaki', 'M',  'DUS-11-KHA-M',  null),
    ('f1110000-0000-0000-0000-000000000011', 'Khaki', 'L',  'DUS-11-KHA-L',  null),
    ('f1110000-0000-0000-0000-000000000011', 'Olive', 'M',  'DUS-11-OLI-M',  null),
    ('f1110000-0000-0000-0000-000000000011', 'Olive', 'L',  'DUS-11-OLI-L',  null),

    -- 12. Tailored Linen Shorts — Cream / Khaki / Charcoal  in M, L, XL
    ('f1110000-0000-0000-0000-000000000012', 'Cream',    'M',  'DUS-12-CRM-M',  null),
    ('f1110000-0000-0000-0000-000000000012', 'Cream',    'L',  'DUS-12-CRM-L',  null),
    ('f1110000-0000-0000-0000-000000000012', 'Cream',    'XL', 'DUS-12-CRM-XL', null),
    ('f1110000-0000-0000-0000-000000000012', 'Khaki',    'M',  'DUS-12-KHA-M',  null),
    ('f1110000-0000-0000-0000-000000000012', 'Khaki',    'L',  'DUS-12-KHA-L',  null),
    ('f1110000-0000-0000-0000-000000000012', 'Khaki',    'XL', 'DUS-12-KHA-XL', null),
    ('f1110000-0000-0000-0000-000000000012', 'Charcoal', 'M',  'DUS-12-CHA-M',  null),
    ('f1110000-0000-0000-0000-000000000012', 'Charcoal', 'L',  'DUS-12-CHA-L',  null),

    -- 13. Cargo Shorts — Olive / Khaki / Black  in M, L, XL, XXL
    ('f1110000-0000-0000-0000-000000000013', 'Olive', 'M',   'DUS-13-OLI-M',   null),
    ('f1110000-0000-0000-0000-000000000013', 'Olive', 'L',   'DUS-13-OLI-L',   null),
    ('f1110000-0000-0000-0000-000000000013', 'Olive', 'XL',  'DUS-13-OLI-XL',  null),
    ('f1110000-0000-0000-0000-000000000013', 'Khaki', 'M',   'DUS-13-KHA-M',   null),
    ('f1110000-0000-0000-0000-000000000013', 'Khaki', 'L',   'DUS-13-KHA-L',   null),
    ('f1110000-0000-0000-0000-000000000013', 'Khaki', 'XL',  'DUS-13-KHA-XL',  null),
    ('f1110000-0000-0000-0000-000000000013', 'Khaki', 'XXL', 'DUS-13-KHA-XXL', 1300),
    ('f1110000-0000-0000-0000-000000000013', 'Black', 'L',   'DUS-13-BLK-L',   null),
    ('f1110000-0000-0000-0000-000000000013', 'Black', 'XL',  'DUS-13-BLK-XL',  null),

    -- 14. Weekender Shorts — Navy / Cream / Charcoal  in S, M, L, XL
    ('f1110000-0000-0000-0000-000000000014', 'Navy',     'S',  'DUS-14-NAV-S',  null),
    ('f1110000-0000-0000-0000-000000000014', 'Navy',     'M',  'DUS-14-NAV-M',  null),
    ('f1110000-0000-0000-0000-000000000014', 'Navy',     'L',  'DUS-14-NAV-L',  null),
    ('f1110000-0000-0000-0000-000000000014', 'Navy',     'XL', 'DUS-14-NAV-XL', null),
    ('f1110000-0000-0000-0000-000000000014', 'Cream',    'S',  'DUS-14-CRM-S',  null),
    ('f1110000-0000-0000-0000-000000000014', 'Cream',    'M',  'DUS-14-CRM-M',  null),
    ('f1110000-0000-0000-0000-000000000014', 'Cream',    'L',  'DUS-14-CRM-L',  null),
    ('f1110000-0000-0000-0000-000000000014', 'Charcoal', 'M',  'DUS-14-CHA-M',  null),
    ('f1110000-0000-0000-0000-000000000014', 'Charcoal', 'L',  'DUS-14-CHA-L',  null),

    -- 15. Boracay Shorts — Light Blue / White / Khaki  in S, M, L, XL
    ('f1110000-0000-0000-0000-000000000015', 'Light Blue', 'S',  'DUS-15-LBL-S',  null),
    ('f1110000-0000-0000-0000-000000000015', 'Light Blue', 'M',  'DUS-15-LBL-M',  null),
    ('f1110000-0000-0000-0000-000000000015', 'Light Blue', 'L',  'DUS-15-LBL-L',  null),
    ('f1110000-0000-0000-0000-000000000015', 'Light Blue', 'XL', 'DUS-15-LBL-XL', null),
    ('f1110000-0000-0000-0000-000000000015', 'White',      'S',  'DUS-15-WHT-S',  null),
    ('f1110000-0000-0000-0000-000000000015', 'White',      'M',  'DUS-15-WHT-M',  null),
    ('f1110000-0000-0000-0000-000000000015', 'White',      'L',  'DUS-15-WHT-L',  null),
    ('f1110000-0000-0000-0000-000000000015', 'Khaki',      'M',  'DUS-15-KHA-M',  null),
    ('f1110000-0000-0000-0000-000000000015', 'Khaki',      'L',  'DUS-15-KHA-L',  null),

    -- 16. Classic Chinos — Navy / Khaki / Olive  in S, M, L, XL, XXL
    ('f1110000-0000-0000-0000-000000000016', 'Navy',  'S',   'DUS-16-NAV-S',   null),
    ('f1110000-0000-0000-0000-000000000016', 'Navy',  'M',   'DUS-16-NAV-M',   null),
    ('f1110000-0000-0000-0000-000000000016', 'Navy',  'L',   'DUS-16-NAV-L',   null),
    ('f1110000-0000-0000-0000-000000000016', 'Navy',  'XL',  'DUS-16-NAV-XL',  null),
    ('f1110000-0000-0000-0000-000000000016', 'Navy',  'XXL', 'DUS-16-NAV-XXL', 1650),
    ('f1110000-0000-0000-0000-000000000016', 'Khaki', 'S',   'DUS-16-KHA-S',   null),
    ('f1110000-0000-0000-0000-000000000016', 'Khaki', 'M',   'DUS-16-KHA-M',   null),
    ('f1110000-0000-0000-0000-000000000016', 'Khaki', 'L',   'DUS-16-KHA-L',   null),
    ('f1110000-0000-0000-0000-000000000016', 'Khaki', 'XL',  'DUS-16-KHA-XL',  null),
    ('f1110000-0000-0000-0000-000000000016', 'Olive', 'M',   'DUS-16-OLI-M',   null),
    ('f1110000-0000-0000-0000-000000000016', 'Olive', 'L',   'DUS-16-OLI-L',   null),
    ('f1110000-0000-0000-0000-000000000016', 'Olive', 'XL',  'DUS-16-OLI-XL',  null),

    -- 17. Linen Trousers — Cream / Khaki / White  in M, L, XL
    ('f1110000-0000-0000-0000-000000000017', 'Cream', 'M',  'DUS-17-CRM-M',  null),
    ('f1110000-0000-0000-0000-000000000017', 'Cream', 'L',  'DUS-17-CRM-L',  null),
    ('f1110000-0000-0000-0000-000000000017', 'Cream', 'XL', 'DUS-17-CRM-XL', null),
    ('f1110000-0000-0000-0000-000000000017', 'Khaki', 'M',  'DUS-17-KHA-M',  null),
    ('f1110000-0000-0000-0000-000000000017', 'Khaki', 'L',  'DUS-17-KHA-L',  null),
    ('f1110000-0000-0000-0000-000000000017', 'Khaki', 'XL', 'DUS-17-KHA-XL', null),
    ('f1110000-0000-0000-0000-000000000017', 'White', 'M',  'DUS-17-WHT-M',  null),
    ('f1110000-0000-0000-0000-000000000017', 'White', 'L',  'DUS-17-WHT-L',  null),

    -- 18. Manila Tailored Pants — Navy / Charcoal / Black  in M, L, XL
    ('f1110000-0000-0000-0000-000000000018', 'Navy',     'M',  'DUS-18-NAV-M',  null),
    ('f1110000-0000-0000-0000-000000000018', 'Navy',     'L',  'DUS-18-NAV-L',  null),
    ('f1110000-0000-0000-0000-000000000018', 'Navy',     'XL', 'DUS-18-NAV-XL', null),
    ('f1110000-0000-0000-0000-000000000018', 'Charcoal', 'M',  'DUS-18-CHA-M',  null),
    ('f1110000-0000-0000-0000-000000000018', 'Charcoal', 'L',  'DUS-18-CHA-L',  null),
    ('f1110000-0000-0000-0000-000000000018', 'Charcoal', 'XL', 'DUS-18-CHA-XL', null),
    ('f1110000-0000-0000-0000-000000000018', 'Black',    'M',  'DUS-18-BLK-M',  null),
    ('f1110000-0000-0000-0000-000000000018', 'Black',    'L',  'DUS-18-BLK-L',  null),

    -- 19. Weekend Pants — Olive / Khaki / Cream  in S, M, L, XL
    ('f1110000-0000-0000-0000-000000000019', 'Olive', 'S',  'DUS-19-OLI-S',  null),
    ('f1110000-0000-0000-0000-000000000019', 'Olive', 'M',  'DUS-19-OLI-M',  null),
    ('f1110000-0000-0000-0000-000000000019', 'Olive', 'L',  'DUS-19-OLI-L',  null),
    ('f1110000-0000-0000-0000-000000000019', 'Olive', 'XL', 'DUS-19-OLI-XL', null),
    ('f1110000-0000-0000-0000-000000000019', 'Khaki', 'S',  'DUS-19-KHA-S',  null),
    ('f1110000-0000-0000-0000-000000000019', 'Khaki', 'M',  'DUS-19-KHA-M',  null),
    ('f1110000-0000-0000-0000-000000000019', 'Khaki', 'L',  'DUS-19-KHA-L',  null),
    ('f1110000-0000-0000-0000-000000000019', 'Cream', 'M',  'DUS-19-CRM-M',  null),
    ('f1110000-0000-0000-0000-000000000019', 'Cream', 'L',  'DUS-19-CRM-L',  null),

    -- 20. Heritage Slacks — Charcoal / Black / Navy  in M, L, XL
    ('f1110000-0000-0000-0000-000000000020', 'Charcoal', 'M',  'DUS-20-CHA-M',  null),
    ('f1110000-0000-0000-0000-000000000020', 'Charcoal', 'L',  'DUS-20-CHA-L',  null),
    ('f1110000-0000-0000-0000-000000000020', 'Charcoal', 'XL', 'DUS-20-CHA-XL', null),
    ('f1110000-0000-0000-0000-000000000020', 'Black',    'M',  'DUS-20-BLK-M',  null),
    ('f1110000-0000-0000-0000-000000000020', 'Black',    'L',  'DUS-20-BLK-L',  null),
    ('f1110000-0000-0000-0000-000000000020', 'Black',    'XL', 'DUS-20-BLK-XL', null),
    ('f1110000-0000-0000-0000-000000000020', 'Navy',     'M',  'DUS-20-NAV-M',  null),
    ('f1110000-0000-0000-0000-000000000020', 'Navy',     'L',  'DUS-20-NAV-L',  null)

  RETURNING id
)
-- For every new variant, create two inventory rows: online + greenhills_store
INSERT INTO inventory (variant_id, channel, quantity, low_stock_threshold)
SELECT inserted.id, channel_qty.channel, channel_qty.quantity, 5
FROM inserted
CROSS JOIN (VALUES ('online', 20), ('greenhills_store', 10))
  AS channel_qty(channel, quantity);


-- ─── 4. Realistic stock variety ───
-- Set some specific variants to LOW or OUT-OF-STOCK so the storefront's
-- "Low Stock" / "Out of Stock" badges and the admin dashboard's alerts
-- actually fire on the demo data.

-- OUT OF STOCK (online quantity = 0)
UPDATE inventory SET quantity = 0
WHERE channel = 'online'
  AND variant_id IN (
    SELECT id FROM variants WHERE sku IN (
      'DUS-01-NAV-XXL',  -- Classic Cotton Polo / Navy / XXL
      'DUS-04-BLK-L',    -- Heritage Polo / Black / L
      'DUS-07-OLI-S',    -- Pocket Tee / Olive / S
      'DUS-13-KHA-XXL',  -- Cargo Shorts / Khaki / XXL
      'DUS-18-BLK-M'     -- Manila Tailored Pants / Black / M
    )
  );

-- LOW STOCK (online quantity ≤ low_stock_threshold)
UPDATE inventory SET quantity = 2
WHERE channel = 'online'
  AND variant_id IN (
    SELECT id FROM variants WHERE sku IN (
      'DUS-01-WHT-S',
      'DUS-06-WHT-XS',
      'DUS-10-LBL-L'
    )
  );

UPDATE inventory SET quantity = 4
WHERE channel = 'online'
  AND variant_id IN (
    SELECT id FROM variants WHERE sku IN (
      'DUS-03-WHT-M',
      'DUS-16-NAV-XXL',
      'DUS-20-CHA-XL'
    )
  );


-- =============================================================================
-- Done.
-- =============================================================================
-- To verify:
--   SELECT count(*) FROM products WHERE id::text LIKE 'f1110000%';   -- should be 20
--   SELECT count(*) FROM variants v JOIN products p ON p.id = v.product_id
--     WHERE p.id::text LIKE 'f1110000%';                              -- ~155 variants
--   SELECT count(*) FROM inventory i JOIN variants v ON v.id = i.variant_id
--     JOIN products p ON p.id = v.product_id WHERE p.id::text LIKE 'f1110000%';
--                                                                    -- ~310 inventory rows
--
-- To remove all demo data: run database/seed/delete_demo_products.sql
-- =============================================================================

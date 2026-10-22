-- =============================================================================
-- Ducks Unlimited + Rocwood — Demo Catalog (30 products)
-- =============================================================================
-- Run this in the Supabase SQL Editor to fill the shop with test products:
-- 3 products per category (Polo, T-Shirt, Shorts, Pants, Others) for EACH
-- brand = 15 Ducks Unlimited + 15 Rocwood. Each one has a description,
-- colours + sizes (variants), stock at both channels, and photos.
--
-- PHOTOS
--   Ducks Unlimited polos, tees and underwear use REAL product photos taken
--   from the Ducks Unlimited Lazada store, saved on this site in
--   /public/images/products/du/.
--   Ducks Unlimited shorts + pants, and ALL Rocwood products, use free
--   Unsplash stock photos (no real photos of those exist online yet).
--
-- REMOVING THEM LATER
--   Every product here has an ID starting with `f1120000-`. Run
--   database/seed/delete_demo_products.sql to remove them all.
--   (The older demo "Classic Cotton Polo" uses `f1110000-` and is left alone,
--   because some test orders point at it.)
--
-- Re-running this file is SAFE: it deletes its own products first.
-- (If you've placed a test order for one of these, delete that order first,
-- or the delete step will refuse — orders keep their products.)
-- =============================================================================

begin;

-- ─── 0. Remove any earlier copy of this demo catalog ───
-- Cascades to variants, inventory and product_images.
delete from products where id::text like 'f1120000%';

-- ─── 1. Products ───
insert into products (id, brand_id, name, description, category, audience, base_price, is_active) values
  -- DU · polo
  ('f1120000-0000-0000-0000-000000000101', (select id from brands where slug = 'du'),
   'Contrast-Collar Pique Polo',
   '100% Egyptian cotton pique with a crisp white knit collar and our embroidered duck crest on the chest. A soft, breathable everyday polo that holds its shape wash after wash.',
   'polo', 'men', 877, true),
  -- DU · polo
  ('f1120000-0000-0000-0000-000000000102', (select id from brands where slug = 'du'),
   'Classic Golf Polo',
   'Our best-selling golf polo in 100% Egyptian cotton. Clean three-button placket, ribbed collar and cuffs, and the little duck on the hem. Smart enough for the clubhouse, easy enough for Sundays.',
   'polo', 'men', 877, true),
  -- DU · polo
  ('f1120000-0000-0000-0000-000000000103', (select id from brands where slug = 'du'),
   'Ladies'' Pocket Polo',
   'A neat, feminine cut in 100% Egyptian cotton, with a patch pocket and a slightly shorter sleeve. Pairs with everything from denim to linen skirts.',
   'polo', 'women', 777, true),
  -- DU · t-shirt
  ('f1120000-0000-0000-0000-000000000104', (select id from brands where slug = 'du'),
   'Printed V-Neck Pocket Tee',
   'All-over print on soft 100% Egyptian cotton jersey, finished with a contrast chest pocket. A relaxed weekend tee with a little more personality.',
   't-shirt', 'men', 877, true),
  -- DU · t-shirt
  ('f1120000-0000-0000-0000-000000000105', (select id from brands where slug = 'du'),
   'Ladies'' Y-Neck Tee',
   'A pale-pink cotton tee with a contrast-trimmed Y-neck and two-button placket. Light, soft and made for humid days.',
   't-shirt', 'women', 577, true),
  -- DU · t-shirt
  ('f1120000-0000-0000-0000-000000000106', (select id from brands where slug = 'du'),
   'Kids'' Round-Neck Tee',
   'The same 100% Egyptian cotton we use for grown-ups, cut for kids. Tagless-feel neck label, double-stitched hems and the duck on the hem. Built for the playground.',
   't-shirt', 'kids', 427, true),
  -- DU · shorts
  ('f1120000-0000-0000-0000-000000000107', (select id from brands where slug = 'du'),
   'Weekend Chino Shorts',
   'Mid-weight cotton twill cut just above the knee, with slant pockets and a flat front. The shorts you reach for on every out-of-town trip.',
   'shorts', 'men', 1095, true),
  -- DU · shorts
  ('f1120000-0000-0000-0000-000000000108', (select id from brands where slug = 'du'),
   'Drawstring Walk Shorts',
   'Soft cotton-linen blend with an elastic back and hidden drawcord. Dresses up with a polo, dresses down with a tee.',
   'shorts', 'men', 995, true),
  -- DU · shorts
  ('f1120000-0000-0000-0000-000000000109', (select id from brands where slug = 'du'),
   'Ladies'' Pleated Shorts',
   'High-waisted, front-pleated shorts in crisp cotton with a button fly. Polished enough for brunch, breezy enough for the beach.',
   'shorts', 'women', 995, true),
  -- DU · pants
  ('f1120000-0000-0000-0000-000000000110', (select id from brands where slug = 'du'),
   'Classic Chinos',
   'A slim-straight chino in mid-weight stretch cotton. Clean front, hand-finished hem ready for cuffing — the trouser to wear with every polo you own.',
   'pants', 'men', 1495, true),
  -- DU · pants
  ('f1120000-0000-0000-0000-000000000111', (select id from brands where slug = 'du'),
   'Pleated Linen-Blend Trousers',
   'Single-pleat trousers in a cool linen-cotton blend with a relaxed leg. Made for Manila afternoons and long dinners after.',
   'pants', 'men', 1695, true),
  -- DU · pants
  ('f1120000-0000-0000-0000-000000000112', (select id from brands where slug = 'du'),
   'Easy Tapered Trousers',
   'Soft brushed cotton with an elastic back waist and a tapered ankle. All the comfort of track pants, none of the sloppiness.',
   'pants', 'unisex', 1595, true),
  -- DU · others
  ('f1120000-0000-0000-0000-000000000113', (select id from brands where slug = 'du'),
   'Knitted Boxer Shorts',
   '100% Egyptian cotton knit boxers with a covered elastic waistband and a one-button fly. Soft, breathable and cool in the heat.',
   'others', 'men', 397, true),
  -- DU · others
  ('f1120000-0000-0000-0000-000000000114', (select id from brands where slug = 'du'),
   'Geometric Knit Boxer Shorts',
   'Our cotton knit boxers in a small geometric jacquard. The same easy fit, with a little more pattern.',
   'others', 'men', 397, true),
  -- DU · others
  ('f1120000-0000-0000-0000-000000000115', (select id from brands where slug = 'du'),
   'Plain Knitted Brief',
   'A classic brief in 100% Egyptian cotton with the Ducks Unlimited woven waistband. Everyday comfort that lasts.',
   'others', 'men', 177, true),
  -- RW · polo
  ('f1120000-0000-0000-0000-000000000201', (select id from brands where slug = 'rw'),
   'Clubhouse Pique Polo',
   'Heavy cotton pique with a structured collar and tonal embroidery. Rugged enough for weekends, sharp enough for the office.',
   'polo', 'men', 1295, true),
  -- RW · polo
  ('f1120000-0000-0000-0000-000000000202', (select id from brands where slug = 'rw'),
   'Harbor Polo',
   'A deep-navy polo in breathable cotton jersey, cut a little longer in the body. Our go-to for drives to the coast.',
   'polo', 'men', 1195, true),
  -- RW · polo
  ('f1120000-0000-0000-0000-000000000203', (select id from brands where slug = 'rw'),
   'Heritage Knit Polo',
   'Fine-gauge knit polo with ribbed cuffs and a soft, sweater-like hand. Looks great with dark denim and leather.',
   'polo', 'men', 1395, true),
  -- RW · t-shirt
  ('f1120000-0000-0000-0000-000000000204', (select id from brands where slug = 'rw'),
   'Heavyweight Crew Tee',
   'A dense 240gsm cotton tee that keeps its shape. Boxy fit, thick rib collar, built to be worn hard.',
   't-shirt', 'men', 795, true),
  -- RW · t-shirt
  ('f1120000-0000-0000-0000-000000000205', (select id from brands where slug = 'rw'),
   'Everyday Pocket Tee',
   'Clean white cotton jersey with a small chest emblem. The tee that goes under every jacket we make.',
   't-shirt', 'unisex', 695, true),
  -- RW · t-shirt
  ('f1120000-0000-0000-0000-000000000206', (select id from brands where slug = 'rw'),
   'Garment-Dyed Tee (2-Pack)',
   'Two garment-dyed cotton tees, soft from the first wear. One in black, one in sage — because one is never enough.',
   't-shirt', 'unisex', 1195, true),
  -- RW · shorts
  ('f1120000-0000-0000-0000-000000000207', (select id from brands where slug = 'rw'),
   'Chino Walk Shorts',
   'Stretch cotton twill shorts with a clean front and a 7-inch inseam. Pairs with loafers or sneakers alike.',
   'shorts', 'men', 1195, true),
  -- RW · shorts
  ('f1120000-0000-0000-0000-000000000208', (select id from brands where slug = 'rw'),
   'Trail Shorts',
   'Quick-dry ripstop shorts with a zip back pocket. Made for the beach, the trail and everything in between.',
   'shorts', 'men', 1095, true),
  -- RW · shorts
  ('f1120000-0000-0000-0000-000000000209', (select id from brands where slug = 'rw'),
   'Ladies'' Denim Shorts',
   'Mid-rise denim shorts with a rolled hem, cut from rigid cotton denim that softens beautifully with wear.',
   'shorts', 'women', 1095, true),
  -- RW · pants
  ('f1120000-0000-0000-0000-000000000210', (select id from brands where slug = 'rw'),
   'Raw Selvedge Jeans',
   '13.5oz raw selvedge denim in a slim-straight fit. Wear them hard and they fade to your life.',
   'pants', 'men', 2495, true),
  -- RW · pants
  ('f1120000-0000-0000-0000-000000000211', (select id from brands where slug = 'rw'),
   'Stonewash Straight Jeans',
   'A classic straight leg in mid-blue stonewash denim with a touch of stretch. The easiest jeans you will own.',
   'pants', 'men', 2195, true),
  -- RW · pants
  ('f1120000-0000-0000-0000-000000000212', (select id from brands where slug = 'rw'),
   'Black Slim Jeans',
   'Slim-fit jeans in washed black stretch denim. Goes with everything in your closet, especially leather.',
   'pants', 'men', 2295, true),
  -- RW · others
  ('f1120000-0000-0000-0000-000000000213', (select id from brands where slug = 'rw'),
   'Trucker Denim Jacket',
   'The classic trucker: mid-wash denim, chest flap pockets and a boxy cropped fit. Gets better every year you wear it.',
   'others', 'men', 3295, true),
  -- RW · others
  ('f1120000-0000-0000-0000-000000000214', (select id from brands where slug = 'rw'),
   'Moto Leather Jacket',
   'Full-grain lamb leather moto jacket with an asymmetric zip and quilted lining. Our most rugged piece.',
   'others', 'men', 6995, true),
  -- RW · others
  ('f1120000-0000-0000-0000-000000000215', (select id from brands where slug = 'rw'),
   'Canvas Work Jacket',
   'Heavy cotton canvas chore jacket with four patch pockets and corozo buttons. Built like workwear, cut for the city.',
   'others', 'men', 3795, true);

-- ─── 2. Photos (first one = main photo) ───
insert into product_images (product_id, image_url, display_order, is_primary) values
  -- Contrast-Collar Pique Polo
  ('f1120000-0000-0000-0000-000000000101', '/images/products/du/polo-lt-blue.jpg', 0, true),
  ('f1120000-0000-0000-0000-000000000101', '/images/products/du/polo-bright-royal.jpg', 1, false),
  -- Classic Golf Polo
  ('f1120000-0000-0000-0000-000000000102', '/images/products/du/golf-polo-white.jpg', 0, true),
  ('f1120000-0000-0000-0000-000000000102', '/images/products/du/golf-polo-sprout.jpg', 1, false),
  -- Ladies' Pocket Polo
  ('f1120000-0000-0000-0000-000000000103', '/images/products/du/ladies-polo-white.jpg', 0, true),
  -- Printed V-Neck Pocket Tee
  ('f1120000-0000-0000-0000-000000000104', '/images/products/du/vneck-charcoal.jpg', 0, true),
  ('f1120000-0000-0000-0000-000000000104', '/images/products/du/vneck-cascade.jpg', 1, false),
  -- Ladies' Y-Neck Tee
  ('f1120000-0000-0000-0000-000000000105', '/images/products/du/ladies-yneck-pink.jpg', 0, true),
  -- Kids' Round-Neck Tee
  ('f1120000-0000-0000-0000-000000000106', '/images/products/du/kids-tee-natural.jpg', 0, true),
  ('f1120000-0000-0000-0000-000000000106', '/images/products/du/kids-tee-airforce.jpg', 1, false),
  ('f1120000-0000-0000-0000-000000000106', '/images/products/du/kids-tee-putty.jpg', 2, false),
  -- Weekend Chino Shorts
  ('f1120000-0000-0000-0000-000000000107', 'https://images.unsplash.com/photo-1792569251301-8e9fd3731328?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Drawstring Walk Shorts
  ('f1120000-0000-0000-0000-000000000108', 'https://images.unsplash.com/photo-1788500304887-6711fead4b54?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Ladies' Pleated Shorts
  ('f1120000-0000-0000-0000-000000000109', 'https://images.unsplash.com/photo-1789110853613-4ace8d4041e3?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Classic Chinos
  ('f1120000-0000-0000-0000-000000000110', 'https://images.unsplash.com/photo-1791573391881-98b6b072e7ff?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Pleated Linen-Blend Trousers
  ('f1120000-0000-0000-0000-000000000111', 'https://images.unsplash.com/photo-1788380944948-f5fe4a3b3a13?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Easy Tapered Trousers
  ('f1120000-0000-0000-0000-000000000112', 'https://images.unsplash.com/photo-1789238052416-d6c439162025?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Knitted Boxer Shorts
  ('f1120000-0000-0000-0000-000000000113', '/images/products/du/boxer-moss.jpg', 0, true),
  -- Geometric Knit Boxer Shorts
  ('f1120000-0000-0000-0000-000000000114', '/images/products/du/boxer-geo-maroon.jpg', 0, true),
  ('f1120000-0000-0000-0000-000000000114', '/images/products/du/boxer-geo-chocolate.jpg', 1, false),
  -- Plain Knitted Brief
  ('f1120000-0000-0000-0000-000000000115', '/images/products/du/brief-navy.jpg', 0, true),
  ('f1120000-0000-0000-0000-000000000115', '/images/products/du/brief-white-moss.jpg', 1, false),
  -- Clubhouse Pique Polo
  ('f1120000-0000-0000-0000-000000000201', 'https://images.unsplash.com/photo-1625910513399-c9fcba54338c?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Harbor Polo
  ('f1120000-0000-0000-0000-000000000202', 'https://images.unsplash.com/photo-1604006853105-d44ea6e146ef?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Heritage Knit Polo
  ('f1120000-0000-0000-0000-000000000203', 'https://images.unsplash.com/photo-1788500304857-256ab412295c?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Heavyweight Crew Tee
  ('f1120000-0000-0000-0000-000000000204', 'https://images.unsplash.com/photo-1571455786673-9d9d6c194f90?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Everyday Pocket Tee
  ('f1120000-0000-0000-0000-000000000205', 'https://images.unsplash.com/photo-1574180566232-aaad1b5b8450?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Garment-Dyed Tee (2-Pack)
  ('f1120000-0000-0000-0000-000000000206', 'https://images.unsplash.com/photo-1759572095384-1a7e646d0d4f?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Chino Walk Shorts
  ('f1120000-0000-0000-0000-000000000207', 'https://images.unsplash.com/photo-1697319452360-ee47502e39f6?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Trail Shorts
  ('f1120000-0000-0000-0000-000000000208', 'https://images.unsplash.com/photo-1621496503717-095a410e1566?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Ladies' Denim Shorts
  ('f1120000-0000-0000-0000-000000000209', 'https://images.unsplash.com/photo-1789110520350-db58d2271c63?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Raw Selvedge Jeans
  ('f1120000-0000-0000-0000-000000000210', 'https://images.unsplash.com/photo-1714143164072-7646ef5cb24d?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Stonewash Straight Jeans
  ('f1120000-0000-0000-0000-000000000211', 'https://images.unsplash.com/photo-1714143136372-ddaf8b606da7?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Black Slim Jeans
  ('f1120000-0000-0000-0000-000000000212', 'https://images.unsplash.com/photo-1511196044526-5cb3bcb7071b?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Trucker Denim Jacket
  ('f1120000-0000-0000-0000-000000000213', 'https://images.unsplash.com/photo-1527016021513-b09758b777bd?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Moto Leather Jacket
  ('f1120000-0000-0000-0000-000000000214', 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=75', 0, true),
  -- Canvas Work Jacket
  ('f1120000-0000-0000-0000-000000000215', 'https://images.unsplash.com/photo-1790610810449-518947f70274?auto=format&fit=crop&w=900&q=75', 0, true);

-- ─── 3. Variants (colour × size) + stock ───
-- Stock: 15 online + 8 at the Greenhills store per variant. A few are set
-- low or sold out at the bottom so you can see the stock badges.
with v as (
  insert into variants (product_id, color, size, sku, price_override) values
    ('f1120000-0000-0000-0000-000000000101', 'Light Blue', 'S', 'DUD-101-LIG-S', null),
    ('f1120000-0000-0000-0000-000000000101', 'Light Blue', 'M', 'DUD-101-LIG-M', null),
    ('f1120000-0000-0000-0000-000000000101', 'Light Blue', 'L', 'DUD-101-LIG-L', null),
    ('f1120000-0000-0000-0000-000000000101', 'Light Blue', 'XL', 'DUD-101-LIG-XL', null),
    ('f1120000-0000-0000-0000-000000000101', 'Bright Royal', 'S', 'DUD-101-BRI-S', null),
    ('f1120000-0000-0000-0000-000000000101', 'Bright Royal', 'M', 'DUD-101-BRI-M', null),
    ('f1120000-0000-0000-0000-000000000101', 'Bright Royal', 'L', 'DUD-101-BRI-L', null),
    ('f1120000-0000-0000-0000-000000000101', 'Bright Royal', 'XL', 'DUD-101-BRI-XL', null),
    ('f1120000-0000-0000-0000-000000000102', 'White', 'S', 'DUD-102-WHI-S', null),
    ('f1120000-0000-0000-0000-000000000102', 'White', 'M', 'DUD-102-WHI-M', null),
    ('f1120000-0000-0000-0000-000000000102', 'White', 'L', 'DUD-102-WHI-L', null),
    ('f1120000-0000-0000-0000-000000000102', 'White', 'XL', 'DUD-102-WHI-XL', null),
    ('f1120000-0000-0000-0000-000000000102', 'White', 'XXL', 'DUD-102-WHI-XXL', 977),
    ('f1120000-0000-0000-0000-000000000102', 'Sprout', 'S', 'DUD-102-SPR-S', null),
    ('f1120000-0000-0000-0000-000000000102', 'Sprout', 'M', 'DUD-102-SPR-M', null),
    ('f1120000-0000-0000-0000-000000000102', 'Sprout', 'L', 'DUD-102-SPR-L', null),
    ('f1120000-0000-0000-0000-000000000102', 'Sprout', 'XL', 'DUD-102-SPR-XL', null),
    ('f1120000-0000-0000-0000-000000000102', 'Sprout', 'XXL', 'DUD-102-SPR-XXL', 977),
    ('f1120000-0000-0000-0000-000000000103', 'White', 'XS', 'DUD-103-WHI-XS', null),
    ('f1120000-0000-0000-0000-000000000103', 'White', 'S', 'DUD-103-WHI-S', null),
    ('f1120000-0000-0000-0000-000000000103', 'White', 'M', 'DUD-103-WHI-M', null),
    ('f1120000-0000-0000-0000-000000000103', 'White', 'L', 'DUD-103-WHI-L', null),
    ('f1120000-0000-0000-0000-000000000104', 'Charcoal Gray', 'S', 'DUD-104-CHA-S', null),
    ('f1120000-0000-0000-0000-000000000104', 'Charcoal Gray', 'M', 'DUD-104-CHA-M', null),
    ('f1120000-0000-0000-0000-000000000104', 'Charcoal Gray', 'L', 'DUD-104-CHA-L', null),
    ('f1120000-0000-0000-0000-000000000104', 'Charcoal Gray', 'XL', 'DUD-104-CHA-XL', null),
    ('f1120000-0000-0000-0000-000000000104', 'Cascade', 'S', 'DUD-104-CAS-S', null),
    ('f1120000-0000-0000-0000-000000000104', 'Cascade', 'M', 'DUD-104-CAS-M', null),
    ('f1120000-0000-0000-0000-000000000104', 'Cascade', 'L', 'DUD-104-CAS-L', null),
    ('f1120000-0000-0000-0000-000000000104', 'Cascade', 'XL', 'DUD-104-CAS-XL', null),
    ('f1120000-0000-0000-0000-000000000105', 'Pale Pink', 'XS', 'DUD-105-PAL-XS', null),
    ('f1120000-0000-0000-0000-000000000105', 'Pale Pink', 'S', 'DUD-105-PAL-S', null),
    ('f1120000-0000-0000-0000-000000000105', 'Pale Pink', 'M', 'DUD-105-PAL-M', null),
    ('f1120000-0000-0000-0000-000000000105', 'Pale Pink', 'L', 'DUD-105-PAL-L', null),
    ('f1120000-0000-0000-0000-000000000106', 'Twisted Natural', '4', 'DUD-106-TWI-4', null),
    ('f1120000-0000-0000-0000-000000000106', 'Twisted Natural', '6', 'DUD-106-TWI-6', null),
    ('f1120000-0000-0000-0000-000000000106', 'Twisted Natural', '8', 'DUD-106-TWI-8', null),
    ('f1120000-0000-0000-0000-000000000106', 'Twisted Natural', '10', 'DUD-106-TWI-10', null),
    ('f1120000-0000-0000-0000-000000000106', 'Twisted Natural', '12', 'DUD-106-TWI-12', null),
    ('f1120000-0000-0000-0000-000000000106', 'Airforce Blue', '4', 'DUD-106-AIR-4', null),
    ('f1120000-0000-0000-0000-000000000106', 'Airforce Blue', '6', 'DUD-106-AIR-6', null),
    ('f1120000-0000-0000-0000-000000000106', 'Airforce Blue', '8', 'DUD-106-AIR-8', null),
    ('f1120000-0000-0000-0000-000000000106', 'Airforce Blue', '10', 'DUD-106-AIR-10', null),
    ('f1120000-0000-0000-0000-000000000106', 'Airforce Blue', '12', 'DUD-106-AIR-12', null),
    ('f1120000-0000-0000-0000-000000000106', 'Putty', '4', 'DUD-106-PUT-4', null),
    ('f1120000-0000-0000-0000-000000000106', 'Putty', '6', 'DUD-106-PUT-6', null),
    ('f1120000-0000-0000-0000-000000000106', 'Putty', '8', 'DUD-106-PUT-8', null),
    ('f1120000-0000-0000-0000-000000000106', 'Putty', '10', 'DUD-106-PUT-10', null),
    ('f1120000-0000-0000-0000-000000000106', 'Putty', '12', 'DUD-106-PUT-12', null),
    ('f1120000-0000-0000-0000-000000000107', 'Khaki', 'S', 'DUD-107-KHA-S', null),
    ('f1120000-0000-0000-0000-000000000107', 'Khaki', 'M', 'DUD-107-KHA-M', null),
    ('f1120000-0000-0000-0000-000000000107', 'Khaki', 'L', 'DUD-107-KHA-L', null),
    ('f1120000-0000-0000-0000-000000000107', 'Khaki', 'XL', 'DUD-107-KHA-XL', null),
    ('f1120000-0000-0000-0000-000000000107', 'Stone', 'S', 'DUD-107-STO-S', null),
    ('f1120000-0000-0000-0000-000000000107', 'Stone', 'M', 'DUD-107-STO-M', null),
    ('f1120000-0000-0000-0000-000000000107', 'Stone', 'L', 'DUD-107-STO-L', null),
    ('f1120000-0000-0000-0000-000000000107', 'Stone', 'XL', 'DUD-107-STO-XL', null),
    ('f1120000-0000-0000-0000-000000000108', 'Sand', 'S', 'DUD-108-SAN-S', null),
    ('f1120000-0000-0000-0000-000000000108', 'Sand', 'M', 'DUD-108-SAN-M', null),
    ('f1120000-0000-0000-0000-000000000108', 'Sand', 'L', 'DUD-108-SAN-L', null),
    ('f1120000-0000-0000-0000-000000000108', 'Sand', 'XL', 'DUD-108-SAN-XL', null),
    ('f1120000-0000-0000-0000-000000000108', 'Olive', 'S', 'DUD-108-OLI-S', null),
    ('f1120000-0000-0000-0000-000000000108', 'Olive', 'M', 'DUD-108-OLI-M', null),
    ('f1120000-0000-0000-0000-000000000108', 'Olive', 'L', 'DUD-108-OLI-L', null),
    ('f1120000-0000-0000-0000-000000000108', 'Olive', 'XL', 'DUD-108-OLI-XL', null),
    ('f1120000-0000-0000-0000-000000000109', 'Ivory', 'XS', 'DUD-109-IVO-XS', null),
    ('f1120000-0000-0000-0000-000000000109', 'Ivory', 'S', 'DUD-109-IVO-S', null),
    ('f1120000-0000-0000-0000-000000000109', 'Ivory', 'M', 'DUD-109-IVO-M', null),
    ('f1120000-0000-0000-0000-000000000109', 'Ivory', 'L', 'DUD-109-IVO-L', null),
    ('f1120000-0000-0000-0000-000000000110', 'Stone', '30', 'DUD-110-STO-30', null),
    ('f1120000-0000-0000-0000-000000000110', 'Stone', '32', 'DUD-110-STO-32', null),
    ('f1120000-0000-0000-0000-000000000110', 'Stone', '34', 'DUD-110-STO-34', null),
    ('f1120000-0000-0000-0000-000000000110', 'Stone', '36', 'DUD-110-STO-36', null),
    ('f1120000-0000-0000-0000-000000000110', 'Navy', '30', 'DUD-110-NAV-30', null),
    ('f1120000-0000-0000-0000-000000000110', 'Navy', '32', 'DUD-110-NAV-32', null),
    ('f1120000-0000-0000-0000-000000000110', 'Navy', '34', 'DUD-110-NAV-34', null),
    ('f1120000-0000-0000-0000-000000000110', 'Navy', '36', 'DUD-110-NAV-36', null),
    ('f1120000-0000-0000-0000-000000000111', 'Beige', '30', 'DUD-111-BEI-30', null),
    ('f1120000-0000-0000-0000-000000000111', 'Beige', '32', 'DUD-111-BEI-32', null),
    ('f1120000-0000-0000-0000-000000000111', 'Beige', '34', 'DUD-111-BEI-34', null),
    ('f1120000-0000-0000-0000-000000000111', 'Beige', '36', 'DUD-111-BEI-36', null),
    ('f1120000-0000-0000-0000-000000000112', 'Tan', 'S', 'DUD-112-TAN-S', null),
    ('f1120000-0000-0000-0000-000000000112', 'Tan', 'M', 'DUD-112-TAN-M', null),
    ('f1120000-0000-0000-0000-000000000112', 'Tan', 'L', 'DUD-112-TAN-L', null),
    ('f1120000-0000-0000-0000-000000000112', 'Tan', 'XL', 'DUD-112-TAN-XL', null),
    ('f1120000-0000-0000-0000-000000000113', 'Moss Green', 'S', 'DUD-113-MOS-S', null),
    ('f1120000-0000-0000-0000-000000000113', 'Moss Green', 'M', 'DUD-113-MOS-M', null),
    ('f1120000-0000-0000-0000-000000000113', 'Moss Green', 'L', 'DUD-113-MOS-L', null),
    ('f1120000-0000-0000-0000-000000000113', 'Moss Green', 'XL', 'DUD-113-MOS-XL', null),
    ('f1120000-0000-0000-0000-000000000114', 'Maroon', 'S', 'DUD-114-MAR-S', null),
    ('f1120000-0000-0000-0000-000000000114', 'Maroon', 'M', 'DUD-114-MAR-M', null),
    ('f1120000-0000-0000-0000-000000000114', 'Maroon', 'L', 'DUD-114-MAR-L', null),
    ('f1120000-0000-0000-0000-000000000114', 'Maroon', 'XL', 'DUD-114-MAR-XL', null),
    ('f1120000-0000-0000-0000-000000000114', 'Chocolate', 'S', 'DUD-114-CHO-S', null),
    ('f1120000-0000-0000-0000-000000000114', 'Chocolate', 'M', 'DUD-114-CHO-M', null),
    ('f1120000-0000-0000-0000-000000000114', 'Chocolate', 'L', 'DUD-114-CHO-L', null),
    ('f1120000-0000-0000-0000-000000000114', 'Chocolate', 'XL', 'DUD-114-CHO-XL', null),
    ('f1120000-0000-0000-0000-000000000115', 'Navy Blue', 'S', 'DUD-115-NAV-S', null),
    ('f1120000-0000-0000-0000-000000000115', 'Navy Blue', 'M', 'DUD-115-NAV-M', null),
    ('f1120000-0000-0000-0000-000000000115', 'Navy Blue', 'L', 'DUD-115-NAV-L', null),
    ('f1120000-0000-0000-0000-000000000115', 'Navy Blue', 'XL', 'DUD-115-NAV-XL', null),
    ('f1120000-0000-0000-0000-000000000115', 'White/Moss Green', 'S', 'DUD-115-WHI-S', null),
    ('f1120000-0000-0000-0000-000000000115', 'White/Moss Green', 'M', 'DUD-115-WHI-M', null),
    ('f1120000-0000-0000-0000-000000000115', 'White/Moss Green', 'L', 'DUD-115-WHI-L', null),
    ('f1120000-0000-0000-0000-000000000115', 'White/Moss Green', 'XL', 'DUD-115-WHI-XL', null),
    ('f1120000-0000-0000-0000-000000000201', 'Black', 'S', 'RWD-201-BLA-S', null),
    ('f1120000-0000-0000-0000-000000000201', 'Black', 'M', 'RWD-201-BLA-M', null),
    ('f1120000-0000-0000-0000-000000000201', 'Black', 'L', 'RWD-201-BLA-L', null),
    ('f1120000-0000-0000-0000-000000000201', 'Black', 'XL', 'RWD-201-BLA-XL', null),
    ('f1120000-0000-0000-0000-000000000201', 'Club Navy', 'S', 'RWD-201-CLU-S', null),
    ('f1120000-0000-0000-0000-000000000201', 'Club Navy', 'M', 'RWD-201-CLU-M', null),
    ('f1120000-0000-0000-0000-000000000201', 'Club Navy', 'L', 'RWD-201-CLU-L', null),
    ('f1120000-0000-0000-0000-000000000201', 'Club Navy', 'XL', 'RWD-201-CLU-XL', null),
    ('f1120000-0000-0000-0000-000000000202', 'Navy', 'S', 'RWD-202-NAV-S', null),
    ('f1120000-0000-0000-0000-000000000202', 'Navy', 'M', 'RWD-202-NAV-M', null),
    ('f1120000-0000-0000-0000-000000000202', 'Navy', 'L', 'RWD-202-NAV-L', null),
    ('f1120000-0000-0000-0000-000000000202', 'Navy', 'XL', 'RWD-202-NAV-XL', null),
    ('f1120000-0000-0000-0000-000000000203', 'Midnight', 'S', 'RWD-203-MID-S', null),
    ('f1120000-0000-0000-0000-000000000203', 'Midnight', 'M', 'RWD-203-MID-M', null),
    ('f1120000-0000-0000-0000-000000000203', 'Midnight', 'L', 'RWD-203-MID-L', null),
    ('f1120000-0000-0000-0000-000000000203', 'Midnight', 'XL', 'RWD-203-MID-XL', null),
    ('f1120000-0000-0000-0000-000000000203', 'Midnight', 'XXL', 'RWD-203-MID-XXL', 1495),
    ('f1120000-0000-0000-0000-000000000204', 'Black', 'S', 'RWD-204-BLA-S', null),
    ('f1120000-0000-0000-0000-000000000204', 'Black', 'M', 'RWD-204-BLA-M', null),
    ('f1120000-0000-0000-0000-000000000204', 'Black', 'L', 'RWD-204-BLA-L', null),
    ('f1120000-0000-0000-0000-000000000204', 'Black', 'XL', 'RWD-204-BLA-XL', null),
    ('f1120000-0000-0000-0000-000000000204', 'Bone', 'S', 'RWD-204-BON-S', null),
    ('f1120000-0000-0000-0000-000000000204', 'Bone', 'M', 'RWD-204-BON-M', null),
    ('f1120000-0000-0000-0000-000000000204', 'Bone', 'L', 'RWD-204-BON-L', null),
    ('f1120000-0000-0000-0000-000000000204', 'Bone', 'XL', 'RWD-204-BON-XL', null),
    ('f1120000-0000-0000-0000-000000000205', 'White', 'S', 'RWD-205-WHI-S', null),
    ('f1120000-0000-0000-0000-000000000205', 'White', 'M', 'RWD-205-WHI-M', null),
    ('f1120000-0000-0000-0000-000000000205', 'White', 'L', 'RWD-205-WHI-L', null),
    ('f1120000-0000-0000-0000-000000000205', 'White', 'XL', 'RWD-205-WHI-XL', null),
    ('f1120000-0000-0000-0000-000000000206', 'Black/Sage', 'S', 'RWD-206-BLA-S', null),
    ('f1120000-0000-0000-0000-000000000206', 'Black/Sage', 'M', 'RWD-206-BLA-M', null),
    ('f1120000-0000-0000-0000-000000000206', 'Black/Sage', 'L', 'RWD-206-BLA-L', null),
    ('f1120000-0000-0000-0000-000000000206', 'Black/Sage', 'XL', 'RWD-206-BLA-XL', null),
    ('f1120000-0000-0000-0000-000000000207', 'Off-White', '30', 'RWD-207-OFF-30', null),
    ('f1120000-0000-0000-0000-000000000207', 'Off-White', '32', 'RWD-207-OFF-32', null),
    ('f1120000-0000-0000-0000-000000000207', 'Off-White', '34', 'RWD-207-OFF-34', null),
    ('f1120000-0000-0000-0000-000000000207', 'Off-White', '36', 'RWD-207-OFF-36', null),
    ('f1120000-0000-0000-0000-000000000207', 'Khaki', '30', 'RWD-207-KHA-30', null),
    ('f1120000-0000-0000-0000-000000000207', 'Khaki', '32', 'RWD-207-KHA-32', null),
    ('f1120000-0000-0000-0000-000000000207', 'Khaki', '34', 'RWD-207-KHA-34', null),
    ('f1120000-0000-0000-0000-000000000207', 'Khaki', '36', 'RWD-207-KHA-36', null),
    ('f1120000-0000-0000-0000-000000000208', 'Sage', 'S', 'RWD-208-SAG-S', null),
    ('f1120000-0000-0000-0000-000000000208', 'Sage', 'M', 'RWD-208-SAG-M', null),
    ('f1120000-0000-0000-0000-000000000208', 'Sage', 'L', 'RWD-208-SAG-L', null),
    ('f1120000-0000-0000-0000-000000000208', 'Sage', 'XL', 'RWD-208-SAG-XL', null),
    ('f1120000-0000-0000-0000-000000000209', 'Dark Indigo', 'XS', 'RWD-209-DAR-XS', null),
    ('f1120000-0000-0000-0000-000000000209', 'Dark Indigo', 'S', 'RWD-209-DAR-S', null),
    ('f1120000-0000-0000-0000-000000000209', 'Dark Indigo', 'M', 'RWD-209-DAR-M', null),
    ('f1120000-0000-0000-0000-000000000209', 'Dark Indigo', 'L', 'RWD-209-DAR-L', null),
    ('f1120000-0000-0000-0000-000000000210', 'Raw Indigo', '30', 'RWD-210-RAW-30', null),
    ('f1120000-0000-0000-0000-000000000210', 'Raw Indigo', '32', 'RWD-210-RAW-32', null),
    ('f1120000-0000-0000-0000-000000000210', 'Raw Indigo', '34', 'RWD-210-RAW-34', null),
    ('f1120000-0000-0000-0000-000000000210', 'Raw Indigo', '36', 'RWD-210-RAW-36', null),
    ('f1120000-0000-0000-0000-000000000211', 'Mid Blue', '30', 'RWD-211-MID-30', null),
    ('f1120000-0000-0000-0000-000000000211', 'Mid Blue', '32', 'RWD-211-MID-32', null),
    ('f1120000-0000-0000-0000-000000000211', 'Mid Blue', '34', 'RWD-211-MID-34', null),
    ('f1120000-0000-0000-0000-000000000211', 'Mid Blue', '36', 'RWD-211-MID-36', null),
    ('f1120000-0000-0000-0000-000000000212', 'Washed Black', '30', 'RWD-212-WAS-30', null),
    ('f1120000-0000-0000-0000-000000000212', 'Washed Black', '32', 'RWD-212-WAS-32', null),
    ('f1120000-0000-0000-0000-000000000212', 'Washed Black', '34', 'RWD-212-WAS-34', null),
    ('f1120000-0000-0000-0000-000000000212', 'Washed Black', '36', 'RWD-212-WAS-36', null),
    ('f1120000-0000-0000-0000-000000000213', 'Mid Wash', 'S', 'RWD-213-MID-S', null),
    ('f1120000-0000-0000-0000-000000000213', 'Mid Wash', 'M', 'RWD-213-MID-M', null),
    ('f1120000-0000-0000-0000-000000000213', 'Mid Wash', 'L', 'RWD-213-MID-L', null),
    ('f1120000-0000-0000-0000-000000000213', 'Mid Wash', 'XL', 'RWD-213-MID-XL', null),
    ('f1120000-0000-0000-0000-000000000214', 'Black', 'S', 'RWD-214-BLA-S', null),
    ('f1120000-0000-0000-0000-000000000214', 'Black', 'M', 'RWD-214-BLA-M', null),
    ('f1120000-0000-0000-0000-000000000214', 'Black', 'L', 'RWD-214-BLA-L', null),
    ('f1120000-0000-0000-0000-000000000214', 'Black', 'XL', 'RWD-214-BLA-XL', null),
    ('f1120000-0000-0000-0000-000000000215', 'Tobacco', 'S', 'RWD-215-TOB-S', null),
    ('f1120000-0000-0000-0000-000000000215', 'Tobacco', 'M', 'RWD-215-TOB-M', null),
    ('f1120000-0000-0000-0000-000000000215', 'Tobacco', 'L', 'RWD-215-TOB-L', null),
    ('f1120000-0000-0000-0000-000000000215', 'Tobacco', 'XL', 'RWD-215-TOB-XL', null)
  returning id
)
insert into inventory (variant_id, channel, quantity, low_stock_threshold)
select id, 'online', 15, 5 from v
union all
select id, 'greenhills_store', 8, 3 from v;

-- ─── 4. A few low / sold-out sizes, to test the badges ───
update inventory set quantity = 2
 where channel = 'online'
   and variant_id in (select id from variants where sku in ('DUD-102-WHI-XL', 'RWD-210-RAW-34', 'DUD-106-PUT-12'));

update inventory set quantity = 0
 where channel = 'online'
   and variant_id in (select id from variants where sku in ('DUD-101-LIG-S', 'RWD-214-BLA-M', 'DUD-113-MOS-XL'));

commit;

-- Check it worked (should show 15 + 15):
--   select b.slug, count(*) from products p join brands b on b.id = p.brand_id
--    where p.id::text like 'f1120000%' group by b.slug;

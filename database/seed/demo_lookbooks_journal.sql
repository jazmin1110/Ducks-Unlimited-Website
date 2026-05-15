-- =============================================================================
-- Ducks Unlimited — Filler data for Lookbooks, Journal, and prettier products
-- =============================================================================
-- Run this AFTER `database/seed/demo_products.sql` (so the 20 demo products
-- already exist) in the Supabase SQL Editor.
--
-- What this file does:
--   1. Replaces the placehold.co text-card images on the 20 demo products
--      with real-looking Unsplash stock photos (clothing-themed).
--   2. Adds a SECONDARY image to each product so the shop card's hover-swap
--      effect actually works.
--   3. Inserts 3 lookbooks with 2–3 scenes each + a handful of hotspots
--      that link back to demo products ("Shop the Look").
--   4. Inserts 4 journal posts with realistic body HTML so the /journal/
--      pages look populated.
--
-- All seeded rows use prefixes / id ranges that make them easy to remove:
--   * Lookbooks   — slugs starting with `demo-`
--   * Journal     — slugs starting with `demo-`
--
-- Re-running this file is SAFE — every section deletes prior demo rows first.
-- =============================================================================


-- =============================================================================
-- 1. PRODUCT IMAGES — swap text placeholders for clothing stock photos
-- =============================================================================
-- We delete every image row for the 20 demo products first, then re-insert
-- with one PRIMARY photo + one SECONDARY photo per product. The shop card
-- swaps to the secondary on hover (.product-card__image-alt class).
--
-- Image URLs use images.unsplash.com with stable photo IDs and explicit
-- width/quality params so they're fast to load and don't get re-cropped.

DELETE FROM product_images WHERE product_id::text LIKE 'f1110000%';

-- Helper note: each Unsplash URL has the format
--   https://images.unsplash.com/photo-<ID>?w=800&q=80&auto=format&fit=crop
-- and we use display_order 0 (primary) + 1 (secondary).

INSERT INTO product_images (product_id, image_url, display_order, is_primary) VALUES

  -- ── Polo Shirts (products 1–5) ─────────────────────────────────────
  -- Primary: clean front-view polo / Secondary: lifestyle / detail shot
  ('f1110000-0000-0000-0000-000000000001',
   'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000001',
   'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000002',
   'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000002',
   'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000003',
   'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000003',
   'https://images.unsplash.com/photo-1481437156560-3205f6a55735?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000004',
   'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000004',
   'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000005',
   'https://images.unsplash.com/photo-1620799140188-3b2a02fd9a77?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000005',
   'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80&auto=format&fit=crop', 1, false),


  -- ── T-Shirts (products 6–10) ───────────────────────────────────────
  ('f1110000-0000-0000-0000-000000000006',
   'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000006',
   'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000007',
   'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000007',
   'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000008',
   'https://images.unsplash.com/photo-1503602642458-232111445657?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000008',
   'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000009',
   'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000009',
   'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000010',
   'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000010',
   'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80&auto=format&fit=crop', 1, false),


  -- ── Shorts (products 11–15) ────────────────────────────────────────
  ('f1110000-0000-0000-0000-000000000011',
   'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000011',
   'https://images.unsplash.com/photo-1542219550-37153d387c27?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000012',
   'https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000012',
   'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000013',
   'https://images.unsplash.com/photo-1542219550-37153d387c27?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000013',
   'https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000014',
   'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000014',
   'https://images.unsplash.com/photo-1542219550-37153d387c27?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000015',
   'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000015',
   'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800&q=80&auto=format&fit=crop', 1, false),


  -- ── Pants (products 16–20) ─────────────────────────────────────────
  ('f1110000-0000-0000-0000-000000000016',
   'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000016',
   'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000017',
   'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000017',
   'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000018',
   'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000018',
   'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000019',
   'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000019',
   'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80&auto=format&fit=crop', 1, false),

  ('f1110000-0000-0000-0000-000000000020',
   'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80&auto=format&fit=crop', 0, true),
  ('f1110000-0000-0000-0000-000000000020',
   'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&q=80&auto=format&fit=crop', 1, false);


-- =============================================================================
-- 2. LOOKBOOKS — 3 editorial collections with scenes + hotspots
-- =============================================================================
-- Cleanup: cascade-delete any prior demo lookbooks (slugs starting with demo-).
-- ON DELETE CASCADE on lookbook_scenes/hotspots takes care of children.

DELETE FROM lookbooks WHERE slug LIKE 'demo-%';

-- Use stable UUIDs in the f2220000 range so we can reference them when
-- inserting scenes + hotspots without needing to query for the new id.

INSERT INTO lookbooks (id, slug, title, subtitle, hero_image, intro, published_at) VALUES

  ('f2220000-0000-0000-0000-000000000001',
   'demo-holiday-2026',
   'Holiday 2026',
   'Heritage pieces for the season at home — woven, sewn, and finished by hand in Greenhills.',
   'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1600&q=80&auto=format&fit=crop',
   'Each look in this collection was photographed in our Greenhills atelier — the same workshop where every piece is hand-finished. Layer the heritage polo over the linen trouser; the cordillera pique with the manila tailored pant. Made for celebrations close to home.',
   now() - interval '7 days'),

  ('f2220000-0000-0000-0000-000000000002',
   'demo-summer-in-boracay',
   'Summer in Boracay',
   'A capsule of sun-faded shorts, breathable tees, and the only swim shorts you''ll need this season.',
   'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=1600&q=80&auto=format&fit=crop',
   'Salt, sand, and slow afternoons. Our summer capsule leans toward generously-cut shorts and feather-light cotton tees — built for the kind of holiday where you don''t check your phone.',
   now() - interval '21 days'),

  ('f2220000-0000-0000-0000-000000000003',
   'demo-manila-heritage',
   'Manila Heritage',
   'A quiet tribute to thirty years of family-run craft in the heart of Greenhills.',
   'https://images.unsplash.com/photo-1485518882345-15568b007407?w=1600&q=80&auto=format&fit=crop',
   'Three decades of doing things the slow way. This collection brings together the pieces that have anchored our archive — the heritage polo, the linen trouser, the chinos cut to last. Photographed in our atelier, just as they''ve always been.',
   now() - interval '40 days');


-- ── SCENES — full-bleed photos inside each lookbook ──────────────────

INSERT INTO lookbook_scenes (id, lookbook_id, image_url, caption, display_order) VALUES

  -- Holiday 2026 (3 scenes)
  ('f2230000-0000-0000-0000-000000000001',
   'f2220000-0000-0000-0000-000000000001',
   'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1600&q=80&auto=format&fit=crop',
   'The Heritage Polo, layered for evenings at home.', 0),

  ('f2230000-0000-0000-0000-000000000002',
   'f2220000-0000-0000-0000-000000000001',
   'https://images.unsplash.com/photo-1483721310020-03333e577078?w=1600&q=80&auto=format&fit=crop',
   'Manila Tailored Pants, paired with the Heritage Slacks for a sharper occasion.', 1),

  ('f2230000-0000-0000-0000-000000000003',
   'f2220000-0000-0000-0000-000000000001',
   'https://images.unsplash.com/photo-1444459094717-a39f1e3e0903?w=1600&q=80&auto=format&fit=crop',
   'A quieter moment — the Cordillera Pique, hand-finished in our workshop.', 2),

  -- Summer in Boracay (2 scenes)
  ('f2230000-0000-0000-0000-000000000004',
   'f2220000-0000-0000-0000-000000000002',
   'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1600&q=80&auto=format&fit=crop',
   'Beach Day Shorts and the Beach Boy Tee — the only two pieces you''ll need.', 0),

  ('f2230000-0000-0000-0000-000000000005',
   'f2220000-0000-0000-0000-000000000002',
   'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=1600&q=80&auto=format&fit=crop',
   'Sunday afternoons, salt-washed cotton, slow time.', 1),

  -- Manila Heritage (3 scenes)
  ('f2230000-0000-0000-0000-000000000006',
   'f2220000-0000-0000-0000-000000000003',
   'https://images.unsplash.com/photo-1485518882345-15568b007407?w=1600&q=80&auto=format&fit=crop',
   'The Linen Trouser, photographed in our atelier.', 0),

  ('f2230000-0000-0000-0000-000000000007',
   'f2220000-0000-0000-0000-000000000003',
   'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1600&q=80&auto=format&fit=crop',
   'Classic Chinos — cut, sewn, and finished in Greenhills.', 1),

  ('f2230000-0000-0000-0000-000000000008',
   'f2220000-0000-0000-0000-000000000003',
   'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1600&q=80&auto=format&fit=crop',
   'Pinoy Heritage Tee — the woven flag at the hem.', 2);


-- ── HOTSPOTS — clickable "Shop the Look" dots on a few scenes ─────────
-- x_percent / y_percent are positions on the photo (0,0 = top-left).
-- We add 1–2 hotspots per scene that link to one of the demo products.

INSERT INTO lookbook_hotspots (scene_id, product_id, x_percent, y_percent, label) VALUES

  -- Holiday scene 1 — Heritage Polo
  ('f2230000-0000-0000-0000-000000000001',
   'f1110000-0000-0000-0000-000000000004',
   55.0, 38.0, 'Heritage Polo'),

  -- Holiday scene 2 — Manila Tailored Pants + Heritage Slacks
  ('f2230000-0000-0000-0000-000000000002',
   'f1110000-0000-0000-0000-000000000018',
   42.0, 65.0, 'Manila Tailored Pants'),
  ('f2230000-0000-0000-0000-000000000002',
   'f1110000-0000-0000-0000-000000000020',
   62.0, 70.0, 'Heritage Slacks'),

  -- Holiday scene 3 — Cordillera Pique
  ('f2230000-0000-0000-0000-000000000003',
   'f1110000-0000-0000-0000-000000000002',
   50.0, 40.0, 'Cordillera Pique Polo'),

  -- Summer scene 1 — Beach Day Shorts + Beach Boy Tee
  ('f2230000-0000-0000-0000-000000000004',
   'f1110000-0000-0000-0000-000000000011',
   48.0, 72.0, 'Beach Day Shorts'),
  ('f2230000-0000-0000-0000-000000000004',
   'f1110000-0000-0000-0000-000000000010',
   48.0, 38.0, 'Beach Boy Tee'),

  -- Summer scene 2 — Sunday Polo
  ('f2230000-0000-0000-0000-000000000005',
   'f1110000-0000-0000-0000-000000000005',
   54.0, 45.0, 'Sunday Polo'),

  -- Manila Heritage scene 1 — Linen Trousers
  ('f2230000-0000-0000-0000-000000000006',
   'f1110000-0000-0000-0000-000000000017',
   50.0, 70.0, 'Linen Trousers'),

  -- Manila Heritage scene 2 — Classic Chinos
  ('f2230000-0000-0000-0000-000000000007',
   'f1110000-0000-0000-0000-000000000016',
   45.0, 68.0, 'Classic Chinos'),

  -- Manila Heritage scene 3 — Pinoy Heritage Tee
  ('f2230000-0000-0000-0000-000000000008',
   'f1110000-0000-0000-0000-000000000008',
   52.0, 42.0, 'Pinoy Heritage Tee');


-- =============================================================================
-- 3. JOURNAL POSTS — 4 editorial articles
-- =============================================================================

DELETE FROM journal_posts WHERE slug LIKE 'demo-%';

INSERT INTO journal_posts (slug, title, excerpt, hero_image, author, body_html, published_at) VALUES

  -- ── Post 1: Why Egyptian Cotton Matters ──
  ('demo-why-egyptian-cotton-matters',
   'Why Egyptian Cotton Matters',
   'The longer the fiber, the softer the cloth — and the longer your shirt lasts. A primer on what makes our cotton different.',
   'https://images.unsplash.com/photo-1605518216938-7c31b7b14ad0?w=1600&q=80&auto=format&fit=crop',
   'The DU Team',
   '<p>Most of the cotton in the world is grown for volume, not quality. The fibers — the tiny threads that get spun into yarn — are short, around 22 millimetres on average. Short fibers spin into a rougher yarn that pills, fades, and loses its shape after a season of wear.</p>
<p>Egyptian cotton is different. Grown along the Nile in some of the most fertile soil on the planet, the fibers are <em>long</em> — closer to 35 millimetres. That single difference cascades through every step that follows.</p>
<h2>Why long-staple matters</h2>
<p>Longer fibers spin into a smoother, stronger yarn. That yarn weaves into a cloth with a softer hand-feel, a more consistent surface, and seams that hold up to the weekly wash for years instead of months.</p>
<p>If you''ve ever owned a shirt that got softer with wear, that''s long-staple cotton at work. Short-staple cotton just gets worn out.</p>
<blockquote>It''s not a luxury. It''s the difference between a shirt you keep and a shirt you replace.</blockquote>
<h2>What we do with it</h2>
<p>Every Ducks Unlimited garment starts with Egyptian cotton woven on our looms in Greenhills. We don''t outsource the cloth — we make it ourselves, one bolt at a time, so we can guarantee what''s inside every piece that leaves our workshop.</p>
<p>The polo on your shoulders is the same cloth our family has been weaving since 1995.</p>',
   now() - interval '5 days'),

  -- ── Post 2: The Anatomy of a Perfect Polo ──
  ('demo-anatomy-perfect-polo',
   'The Anatomy of a Perfect Polo',
   'Five details that separate a great polo from a forgettable one — and how we get each of them right.',
   'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=1600&q=80&auto=format&fit=crop',
   'The DU Team',
   '<p>A polo shirt looks simple. It''s also the easiest garment in your closet to get wrong. After thirty years of making them, here are the five details we obsess over.</p>
<h3>1. The collar</h3>
<p>A great polo collar lays flat against your chest when you wear it open, and stands up cleanly when you pop it. Most polo collars do one or the other. Ours are interlined with a soft canvas that holds either shape.</p>
<h3>2. The placket</h3>
<p>The strip of fabric down the front, where the buttons live. A cheap placket flares out and curls. We hand-roll ours so it stays close to the body and gets sharper with each wash.</p>
<h3>3. The buttons</h3>
<p>Plastic buttons crack. We use mother-of-pearl — natural, slightly different on each shirt, harder to break.</p>
<h3>4. The hem</h3>
<p>A good polo has a slightly longer back hem so it stays tucked when you reach for something on a high shelf. Ours adds half an inch.</p>
<h3>5. The cloth</h3>
<p>Long-staple Egyptian cotton, woven on our own looms. We''ve <a href="/journal/demo-why-egyptian-cotton-matters">written about why it matters</a> — but the short version: it''s why our polos are still soft after a hundred washes.</p>',
   now() - interval '14 days'),

  -- ── Post 3: Three Decades in Greenhills ──
  ('demo-three-decades-greenhills',
   'Three Decades in Greenhills',
   'How a small family workshop in San Juan became the brand it is today — and what we''re carrying forward.',
   'https://images.unsplash.com/photo-1604176354204-9268737828e4?w=1600&q=80&auto=format&fit=crop',
   'Renee Ang',
   '<p>My grandfather opened the workshop in 1995 with two sewing machines, a single roll of cotton, and the idea that you could make beautiful clothes in the Philippines without cutting a single corner.</p>
<p>Thirty years later, we''re still in the same neighborhood. The two sewing machines have become forty. The single roll of cotton is now a small loom room next to the cutting floor. But the idea hasn''t changed.</p>
<h2>What we still do ourselves</h2>
<p>We weave the cotton. We cut every piece. We finish every hem by hand. There''s no overseas factory, no white-label partner, no shortcut. When you buy a Ducks Unlimited shirt, you''re buying something a small team in Greenhills personally touched at least eight times.</p>
<p>That''s slower than the industry standard. It''s also the only way we know.</p>
<h2>What we''re carrying forward</h2>
<p>The next thirty years are going to look a little different. Online ordering. New audiences. A few new categories — kids and women — that my grandfather wouldn''t recognize.</p>
<p>But the workshop will stay where it is. The cotton will still come from the Nile. And every shirt will still be hand-finished by someone who''s been doing this for years.</p>
<blockquote>Affordable luxury isn''t about cutting corners. It''s about clothes made to last, designed to live in, by people who care.</blockquote>',
   now() - interval '30 days'),

  -- ── Post 4: How to Care for Your DU Shirts ──
  ('demo-how-to-care-for-your-shirts',
   'How to Care for Your DU Shirts',
   'A small set of habits that will keep your Ducks Unlimited pieces looking sharp for a decade or more.',
   'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=1600&q=80&auto=format&fit=crop',
   'The DU Team',
   '<p>Long-staple Egyptian cotton is built to last. But how you wash, dry, and store your shirts makes the difference between five years of wear and twenty.</p>
<h2>Washing</h2>
<ul>
  <li><strong>Cold water.</strong> Hot water shrinks fibers and fades dye. Cold water is enough for everyday wear.</li>
  <li><strong>Inside out.</strong> Reduces friction on the outer surface, especially on collars and hems.</li>
  <li><strong>Mild detergent.</strong> Skip the bleach and the heavy enzymes — neither is friendly to natural fibers.</li>
</ul>
<h2>Drying</h2>
<ul>
  <li><strong>Air dry when you can.</strong> The dryer is the single biggest source of wear on cotton garments. Hang on a wooden hanger out of direct sun.</li>
  <li><strong>If you must use the dryer:</strong> low heat, short cycle, take it out slightly damp.</li>
</ul>
<h2>Storage</h2>
<ul>
  <li><strong>Hang polos and dress shirts.</strong> Folding creases the placket.</li>
  <li><strong>Fold tees flat.</strong> They keep their shape better that way and don''t stretch at the shoulder.</li>
</ul>
<p>That''s it. Five minutes of attention per laundry day, and your shirts will outlast every fast-fashion piece in your closet.</p>',
   now() - interval '60 days');


-- =============================================================================
-- DONE
-- =============================================================================
-- To wipe everything this file added:
--
--   DELETE FROM lookbooks WHERE slug LIKE 'demo-%';
--   DELETE FROM journal_posts WHERE slug LIKE 'demo-%';
--   DELETE FROM product_images WHERE product_id::text LIKE 'f1110000%';
--   -- Then re-run /database/seed/demo_products.sql to restore the original
--   -- placehold.co text-card images (or this file to keep the Unsplash ones).
-- =============================================================================

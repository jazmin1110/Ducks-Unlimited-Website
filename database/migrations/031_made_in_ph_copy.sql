-- =============================================================================
-- 031 — "Made in the Philippines" copy refresh (family feedback, Oct 2026)
--
-- What changes:
--   * No more "Greenhills workshop" / "hand-finished" claims.
--   * "Shipped from Greenhills" → "Shipped from the Philippines".
--   * The homepage workshop block becomes the origin story, using facts from
--     Philstar (2005-09-26 and 2008-11-21): Kuo family business, started in
--     golf apparel, made locally by sister company CMT Manufacturing,
--     Egyptian cotton thread, international quality at local prices.
--
-- Content only — no table changes. Safe to run more than once.
-- DU brand id: 741a645c-…   Rocwood brand id: d149b907-…
-- =============================================================================

-- ── Ducks Unlimited homepage hero ────────────────────────────────────────────
update page_sections
set published = published
      || jsonb_build_object(
           'headline', 'Affordable luxury,<br />proudly made in the Philippines.',
           'sub',      'Egyptian cotton clothing, made locally by a Filipino family business since 1995.'),
    updated_at = now()
where id = '13994061-ea89-4e2a-b29c-2424952c9724';

-- ── Ducks Unlimited "workshop" block → origin story ─────────────────────────
update page_sections
set published = published
      || jsonb_build_object(
           'eyebrow',   'Our Story',
           'headline',  'Proudly made in the Philippines.',
           'body',      '<p>Ducks Unlimited is run by the Kuo family. Our founder, William Kuo, started out selling golf apparel just as golf was catching on in the Philippines.</p><p>From golf polos we grew into everyday clothes for men, women, teens and kids, all made locally by our sister company, CMT Manufacturing, from Egyptian cotton thread. The idea is the same as day one: international quality at local prices. Every piece you buy supports Filipino makers.</p>',
           'image_alt', 'Ducks Unlimited polos',
           'cta_text',  'Visit a Store',
           'cta_link',  '/stores.html'),
    updated_at = now()
where id = '8d55d37d-c28d-424e-b5a1-7d5110915edc';

-- ── Rocwood "workshop" block ────────────────────────────────────────────────
update page_sections
set published = published
      || jsonb_build_object(
           'eyebrow', 'Support Local',
           'body',    '<p>Made in the Philippines by the same Filipino family behind Ducks Unlimited. Same hands, different vibe.</p>'),
    updated_at = now()
where id = '886b4b60-613b-4dd4-8b32-d729cb45cab7';

-- ── Older site_content rows (kept in sync so nothing old shows up) ──────────
update site_content
set published = published
      || jsonb_build_object(
           'headline', 'Affordable luxury,<br />proudly made in the Philippines.',
           'sub',      'Egyptian cotton clothing, made locally by a Filipino family business since 1995.'),
    updated_at = now()
where key = 'home.hero' and brand_id = '741a645c-ac2f-4d17-9062-396ecac0d197';

update site_content
set published = published
      || jsonb_build_object(
           'eyebrow',   'Our Story',
           'headline',  'Proudly made in the Philippines.',
           'body_html', '<p>Ducks Unlimited is run by the Kuo family. Our founder, William Kuo, started out selling golf apparel just as golf was catching on in the Philippines.</p><p>From golf polos we grew into everyday clothes for men, women, teens and kids, all made locally by our sister company, CMT Manufacturing, from Egyptian cotton thread. The idea is the same as day one: international quality at local prices. Every piece you buy supports Filipino makers.</p>',
           'image_alt', 'Ducks Unlimited polos',
           'cta_text',  'Visit a Store',
           'cta_link',  '/stores.html'),
    updated_at = now()
where key = 'home.editorial.workshop' and brand_id = '741a645c-ac2f-4d17-9062-396ecac0d197';

update site_content
set published = published
      || jsonb_build_object(
           'eyebrow', 'Support Local',
           'body',    'Made in the Philippines by the same Filipino family behind Ducks Unlimited. Same hands, different vibe.'),
    updated_at = now()
where key = 'home.editorial.workshop' and brand_id = 'd149b907-db40-4554-a6c8-d16f432aaedd';

-- Announcement bar across the top of every Ducks Unlimited page
update site_content
set published = published
      || jsonb_build_object('message', 'Free shipping on orders over <strong>₱3,000</strong> · Shipped from the Philippines'),
    updated_at = now()
where key = 'home.announcement' and brand_id = '741a645c-ac2f-4d17-9062-396ecac0d197';

-- Subtitle under "Shop All"
update site_content
set published = published
      || jsonb_build_object('subtitle', 'Egyptian cotton, proudly made in the Philippines — made to last.'),
    updated_at = now()
where key = 'shop.intro' and brand_id = '741a645c-ac2f-4d17-9062-396ecac0d197';

-- ── Product descriptions that mentioned hand-finishing ──────────────────────
update products
set description = replace(description, 'hand-finished in our Greenhills workshop', 'made in the Philippines')
where description like '%hand-finished in our Greenhills workshop%';

update products
set description = replace(description, 'hand-finished hem', 'finished hem')
where description like '%hand-finished hem%';

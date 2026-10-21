-- =============================================================================
-- Migration 017 — Port the real homepage content into page_sections
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- Migration 015 seeded placeholder sections. This replaces them with the
-- content the live homepage actually shows today, read from site_content
-- (so any edits made in /admin/homepage.html carry over), plus the
-- Heritage Story and Journal Teaser copy that was hardcoded in index.html.
--
-- Safe to re-run: it deletes the brand's 'home' sections and rebuilds them.
-- Only run it BEFORE anyone edits the homepage in /admin/design.html.
-- =============================================================================

do $$
declare
  b      record;
  hero   jsonb; t1 jsonb; t2 jsonb; t3 jsonb; ed1 jsonb; ed2 jsonb;
begin
  for b in select id, slug from public.brands loop

    -- Pull this brand's current homepage content (empty object if missing).
    select coalesce(published, '{}') into hero from public.site_content where key = 'home.hero'              and brand_id = b.id;
    select coalesce(published, '{}') into t1   from public.site_content where key = 'home.tile.polo'         and brand_id = b.id;
    select coalesce(published, '{}') into t2   from public.site_content where key = 'home.tile.tshirt'       and brand_id = b.id;
    select coalesce(published, '{}') into t3   from public.site_content where key = 'home.tile.bottoms'      and brand_id = b.id;
    select coalesce(published, '{}') into ed1  from public.site_content where key = 'home.editorial.cotton'  and brand_id = b.id;
    select coalesce(published, '{}') into ed2  from public.site_content where key = 'home.editorial.workshop' and brand_id = b.id;
    hero := coalesce(hero, '{}'); t1 := coalesce(t1, '{}'); t2 := coalesce(t2, '{}');
    t3 := coalesce(t3, '{}'); ed1 := coalesce(ed1, '{}'); ed2 := coalesce(ed2, '{}');

    -- Start clean for this brand's homepage.
    delete from public.page_sections where page_key = 'home' and brand_id = b.id;

    -- 10 Hero
    insert into public.page_sections (page_key, brand_id, section_type, position, published) values
    ('home', b.id, 'hero', 10, jsonb_build_object(
      'image_url', coalesce(hero->>'image_url', ''),
      'eyebrow',   coalesce(hero->>'eyebrow', ''),
      'headline',  coalesce(hero->>'headline', ''),
      'sub',       coalesce(hero->>'sub', ''),
      'cta_text',  coalesce(hero->>'cta_text', 'Shop the Collection'),
      'cta_link',  coalesce(hero->>'cta_link', '/shop.html'),
      'overlay',   30
    ));

    -- 20 Category tiles (Men / Women / Kids)
    insert into public.page_sections (page_key, brand_id, section_type, position, published) values
    ('home', b.id, 'category-tiles', 20, jsonb_build_object(
      'eyebrow', 'The Collection',
      'heading', 'Made for everyday elegance',
      'blocks', jsonb_build_array(
        jsonb_build_object('id', 'blk_men',   'image_url', coalesce(t1->>'image_url',''), 'image_alt', 'Men''s Collection',
          'label', coalesce(t1->>'label',''), 'name', coalesce(t1->>'name','Men'), 'cta_text', coalesce(t1->>'cta_text','Shop Men'), 'link', coalesce(t1->>'link','/shop.html?audience=men')),
        jsonb_build_object('id', 'blk_women', 'image_url', coalesce(t2->>'image_url',''), 'image_alt', 'Women''s Collection',
          'label', coalesce(t2->>'label',''), 'name', coalesce(t2->>'name','Women'), 'cta_text', coalesce(t2->>'cta_text','Shop Women'), 'link', coalesce(t2->>'link','/shop.html?audience=women')),
        jsonb_build_object('id', 'blk_kids',  'image_url', coalesce(t3->>'image_url',''), 'image_alt', 'Kids & Baby Collection',
          'label', coalesce(t3->>'label',''), 'name', coalesce(t3->>'name','Kids & Baby'), 'cta_text', coalesce(t3->>'cta_text','Shop Kids'), 'link', coalesce(t3->>'link','/shop.html?audience=kids'))
      )
    ));

    -- 30 / 40 Editorial blocks. Rocwood rows store plain `body`; DU rows
    -- store `body_html`. Normalise both into `body` (HTML).
    insert into public.page_sections (page_key, brand_id, section_type, position, published) values
    ('home', b.id, 'editorial-block', 30, jsonb_build_object(
      'image_url', coalesce(ed1->>'image_url',''), 'image_alt', coalesce(ed1->>'image_alt',''),
      'eyebrow',   coalesce(ed1->>'eyebrow',''),   'headline',  coalesce(ed1->>'headline',''),
      'body',      coalesce(ed1->>'body_html', case when ed1->>'body' is not null then '<p>' || (ed1->>'body') || '</p>' end, ''),
      'cta_text',  coalesce(ed1->>'cta_text',''),  'cta_link',  coalesce(ed1->>'cta_link',''),
      'layout',    'image-left'
    )),
    ('home', b.id, 'editorial-block', 40, jsonb_build_object(
      'image_url', coalesce(ed2->>'image_url',''), 'image_alt', coalesce(ed2->>'image_alt',''),
      'eyebrow',   coalesce(ed2->>'eyebrow',''),   'headline',  coalesce(ed2->>'headline',''),
      'body',      coalesce(ed2->>'body_html', case when ed2->>'body' is not null then '<p>' || (ed2->>'body') || '</p>' end, ''),
      'cta_text',  coalesce(ed2->>'cta_text',''),  'cta_link',  coalesce(ed2->>'cta_link',''),
      'layout',    'image-right'
    ));

    -- 50 New arrivals
    insert into public.page_sections (page_key, brand_id, section_type, position, published) values
    ('home', b.id, 'product-rail', 50, jsonb_build_object(
      'eyebrow', 'Just In', 'heading', 'New Arrivals', 'collection', 'new',
      'max_products', 8, 'cta_text', 'Shop All New', 'cta_link', '/shop.html'
    ));

    -- 60 Heritage story (was hardcoded in index.html — same copy for both brands today)
    insert into public.page_sections (page_key, brand_id, section_type, position, published) values
    ('home', b.id, 'story', 60, jsonb_build_object(
      'eyebrow', 'Our Heritage',
      'heading', 'Crafted in the Philippines since 1995',
      'body',    '<p>Ducks Unlimited began as a small family workshop in Greenhills, San Juan — a place to make beautiful, honest clothes the way they used to be made: slowly, by hand, with care.</p><p>Three decades on, we''re still here, still vertically integrated, still finishing every hem ourselves. Because affordable luxury isn''t about cutting corners. It''s about clothes made to last, designed to live in, by people who care.</p>',
      'blocks', jsonb_build_array(
        jsonb_build_object('id','blk_s1','num','1995','label','Family-run since'),
        jsonb_build_object('id','blk_s2','num','100%','label','Hand-finished in Greenhills'),
        jsonb_build_object('id','blk_s3','num','Egyptian Cotton','label','Woven in-house')
      )
    ));

    -- 70 Journal teaser (was hardcoded in index.html)
    insert into public.page_sections (page_key, brand_id, section_type, position, published) values
    ('home', b.id, 'journal-teaser', 70, jsonb_build_object(
      'eyebrow', 'The Journal',
      'heading', 'Stories from the workshop',
      'blocks', jsonb_build_array(
        jsonb_build_object('id','blk_j1','image_url','','eyebrow','Materials','title','Why Egyptian Cotton Matters',
          'excerpt','The longer the fiber, the softer the cloth — and the longer your shirt lasts. A primer on what makes our cotton different.','link','/journal/the-cotton-story'),
        jsonb_build_object('id','blk_j2','image_url','','eyebrow','Style Guide','title','The Anatomy of a Perfect Polo',
          'excerpt','From collar roll to placket length, six small details that separate an everyday polo from one you''ll wear for a decade.','link','/journal/the-perfect-polo'),
        jsonb_build_object('id','blk_j3','image_url','','eyebrow','Heritage','title','Thirty Years in Greenhills',
          'excerpt','A family business, three generations in. How our workshop has stayed small, stayed local, and stayed Filipino-made.','link','/journal/thirty-years')
      )
    ));

  end loop;
end $$;

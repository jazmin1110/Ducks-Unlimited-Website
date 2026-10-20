-- =============================================================================
-- Migration 014 — Shop page intro, per brand
-- =============================================================================
-- Adds a new editable CMS section `shop.intro` so each brand can own its own
-- Shop page headline + subtitle without a code change. Depends on 011/012
-- (per-brand site_content). Idempotent via on-conflict-do-nothing.
-- =============================================================================

insert into public.site_content (key, brand_id, published)
select 'shop.intro',
       (select id from public.brands where slug = 'du'),
       jsonb_build_object(
         'title',    'Shop All',
         'subtitle', 'Every piece is hand-finished in our Greenhills workshop — Egyptian cotton, made to last.'
       )
on conflict (key, brand_id) do nothing;

insert into public.site_content (key, brand_id, published)
select 'shop.intro',
       (select id from public.brands where slug = 'rw'),
       jsonb_build_object(
         'title',    'Shop All',
         'subtitle', 'Everyday essentials, cut and sewn in the Philippines. Built to live in, built to last.'
       )
on conflict (key, brand_id) do nothing;

-- =============================================================================
-- END OF MIGRATION 014
-- =============================================================================

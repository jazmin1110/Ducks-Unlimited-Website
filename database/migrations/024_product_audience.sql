-- =============================================================================
-- Migration 024 — who a product is for (Men / Women / Kids & Baby)
-- =============================================================================
-- The nav, footer and homepage tiles link to /shop.html?audience=men|women|kids.
-- Until now products had nowhere to store this, so "Men" showed everything.
--
-- products.audience:
--   'men'     → shows under Men
--   'women'   → shows under Women
--   'unisex'  → shows under Men AND Women
--   'kids'    → shows under Kids & Baby
--   NULL      → not set yet: shows in every section (so nothing disappears
--               from the shop before it has been tagged in Admin → Products)
--
-- Safe to run more than once.
-- =============================================================================

alter table products
  add column if not exists audience text;

-- Only allow the four values above (or empty)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_audience_check'
  ) then
    alter table products
      add constraint products_audience_check
      check (audience is null or audience in ('men', 'women', 'unisex', 'kids'));
  end if;
end $$;

comment on column products.audience is
  'Who the product is for: men, women, unisex (men + women) or kids. NULL = shows in every shop section.';

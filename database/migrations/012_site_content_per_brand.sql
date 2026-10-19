-- =============================================================================
-- Migration 012 — Scope site_content by brand
-- =============================================================================
-- Builds on migration 011 (which added site_content.brand_id as nullable).
-- Lets the homepage CMS store a different row per key per brand so Ducks
-- Unlimited and Rocwood can have their own hero copy, hero image, featured
-- tiles, etc.
--
-- A NULL brand_id keeps meaning "applies to all brands" (e.g. a shared
-- announcement bar, legal copy). The UNIQUE constraint accommodates both.
-- =============================================================================


-- Only runs if site_content exists (migration 007). Guarded for safety.
do $$
begin
  if not exists (select 1 from information_schema.tables where table_name = 'site_content') then
    raise notice 'site_content table does not exist yet — skipping migration 012.';
    return;
  end if;

  -- 1. Drop the single-column uniqueness on key (name is Supabase default).
  --    If your constraint has a different name, uncomment and adjust.
  execute 'alter table site_content drop constraint if exists site_content_key_key';

  -- 2. Replace with a composite unique that treats NULL brand_id as a single
  --    distinct value. Postgres' default UNIQUE treats NULLs as distinct, so
  --    we use `nulls not distinct` (Postgres 15+, which Supabase runs).
  --    This means at most ONE global row per key AND at most one row per
  --    (key, brand) pair — exactly what we want.
  execute 'alter table site_content
             add constraint site_content_key_brand_uniq
             unique nulls not distinct (key, brand_id)';

  -- 3. Fast lookup for "fetch a brand's content".
  execute 'create index if not exists site_content_brand_id_idx on site_content (brand_id)';
end $$;

-- =============================================================================
-- END OF MIGRATION 012
-- =============================================================================

-- =============================================================================
-- Migration 009 — Performance indexes
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- WHY this exists:
--   The products + variants + inventory tables had only their PRIMARY KEY
--   indexes. Every shop page load was doing a full-table scan filtered by
--   `is_active = true` and then sorting by `created_at`. Cheap with 20
--   demo products; very expensive once you have hundreds.
--
--   This adds the indexes that match the real query patterns the
--   storefront and admin actually run, so Postgres can use the index
--   instead of scanning the whole table.
--
-- All `if not exists` so this migration is safe to re-run.
-- Indexes are created concurrently elsewhere in production-grade systems;
-- here we keep it simple because the tables are small enough that a brief
-- lock during creation is fine.
-- =============================================================================


-- ── products ───────────────────────────────────────────────────────────────

-- Partial index — only rows where is_active = true. Every storefront query
-- filters by this, so a partial index is much smaller and faster than a
-- full one. Combined with `category` so the common filter "active +
-- category = 'polo'" is a single index lookup.
create index if not exists products_active_category_idx
  on products (category)
  where is_active = true;

-- Sort key on shop.html ("Newest first") and the homepage's New Arrivals.
-- DESC so the most recent rows are at the start of the index.
create index if not exists products_created_at_desc_idx
  on products (created_at desc);

-- Active products only — used by the dashboard's "Active Products" stat
-- and any "show me everything that's live" query.
create index if not exists products_is_active_idx
  on products (is_active)
  where is_active = true;


-- ── variants ───────────────────────────────────────────────────────────────

-- Foreign-key column. Postgres does NOT auto-create indexes on FK columns,
-- and we join variants → products on every product fetch. Without this,
-- the join is a sequential scan of variants.
create index if not exists variants_product_id_idx
  on variants (product_id);


-- ── inventory ──────────────────────────────────────────────────────────────

-- Composite index matching the most common query: "give me inventory for
-- this variant on this channel". Used by the inventory admin page and
-- product detail page (online stock display).
create index if not exists inventory_variant_channel_idx
  on inventory (variant_id, channel);

-- Low-stock dashboard: "find every variant where quantity <= threshold".
-- A plain quantity index helps even though we ultimately compare two
-- columns — Postgres can use it as a starting point.
create index if not exists inventory_quantity_idx
  on inventory (quantity);


-- ── product_images ─────────────────────────────────────────────────────────

-- product_images already has product_id+display_order from migration 001.
-- Adding the is_primary flag so "give me the primary image" is a direct
-- index hit instead of scanning every image for that product.
create index if not exists product_images_primary_idx
  on product_images (product_id)
  where is_primary = true;


-- ── orders ─────────────────────────────────────────────────────────────────

-- Admin dashboard's "Orders Today" stat filters by created_at + payment_status.
-- Sort by created_at DESC for the recent-orders panel.
create index if not exists orders_created_at_desc_idx
  on orders (created_at desc);

create index if not exists orders_payment_status_idx
  on orders (payment_status);

create index if not exists orders_fulfillment_status_idx
  on orders (fulfillment_status);


-- ── site_content ───────────────────────────────────────────────────────────

-- Storefront fetches every row whose key starts with "home." on every
-- homepage load. With ~6 rows it's fine without an index, but as the CMS
-- grows (more sections, more pages) a key index keeps lookups fast.
-- Note: the table already has `key` as PRIMARY KEY so prefix lookups
-- using LIKE 'home.%' are already index-friendly. No new index needed.


-- ── lookbook_hotspots ──────────────────────────────────────────────────────

-- Existing migration 004 indexed scene_id. Add product_id so reverse
-- lookups ("which lookbooks feature this product?") are fast — useful
-- for a future "appears in" badge on product pages.
create index if not exists lookbook_hotspots_product_idx
  on lookbook_hotspots (product_id);


-- =============================================================================
-- DONE
-- =============================================================================
-- To inspect what indexes exist on a table:
--   select indexname, indexdef from pg_indexes where tablename = 'products';
--
-- To see whether Postgres is actually using an index for a query:
--   explain analyze select ... from products where is_active = true;
-- Look for "Index Scan" or "Bitmap Index Scan" instead of "Seq Scan".
-- =============================================================================

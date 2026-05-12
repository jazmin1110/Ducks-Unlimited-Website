-- =============================================================================
-- Migration 001 — Add product_images table
-- =============================================================================
-- Run this in the Supabase SQL editor if you ALREADY ran schema.sql and
-- need to add the new product_images table to your existing database.
-- (If you're starting fresh, just run the updated schema.sql instead —
-- this migration is only for existing projects.)
--
-- After running this, also run storage_setup.sql to create the
-- 'product-images' bucket.
-- =============================================================================

create table if not exists product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products (id) on delete cascade,
  image_url     text not null,
  display_order integer not null default 0 check (display_order >= 0),
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now()
);

comment on table product_images is
  'Image URLs for products. Files live in the product-images storage bucket.';
comment on column product_images.display_order is
  '0-indexed position in the gallery. Smallest = main/featured image.';
comment on column product_images.is_primary is
  'True for the image with the smallest display_order. Managed by the admin UI.';

create index if not exists product_images_product_id_idx
  on product_images (product_id, display_order);


-- RLS — public read, admins write
alter table product_images enable row level security;

create policy "Public can read product images"
  on product_images for select
  using (true);

create policy "Admins can insert product images"
  on product_images for insert
  to authenticated
  with check (true);

create policy "Admins can update product images"
  on product_images for update
  to authenticated
  using (true);

create policy "Admins can delete product images"
  on product_images for delete
  to authenticated
  using (true);

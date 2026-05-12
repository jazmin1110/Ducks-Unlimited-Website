-- =============================================================================
-- Ducks Unlimited — Supabase Storage Setup
-- =============================================================================
-- Run this in the Supabase SQL editor AFTER schema.sql.
--
-- This file creates the 'product-images' storage bucket and the access
-- policies that control who can upload, view, and delete files in it.
--
-- Supabase Storage is a separate system from regular Postgres tables —
-- it stores actual binary files (JPGs, PNGs, etc.) and exposes them via
-- public URLs. The product_images table holds the URLs that link to these
-- files.
-- =============================================================================


-- =============================================================================
-- CREATE THE BUCKET
-- A bucket is just a top-level folder in Supabase Storage. We call ours
-- "product-images" to make it easy to find later.
-- =============================================================================

-- "public = true" makes any file in this bucket viewable via its URL
-- (no authentication required). That's what we want for product photos —
-- customers shopping the storefront need to see them.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing; -- idempotent — safe to re-run


-- =============================================================================
-- STORAGE POLICIES
-- These control who can perform each operation on files inside the bucket.
-- Even with public = true, you still need an INSERT/UPDATE/DELETE policy
-- for those operations.
-- =============================================================================

-- Anyone (logged in or not) can view files. Needed so customers see images.
create policy "Public can view product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Only logged-in admins can upload new product images
create policy "Admins can upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

-- Only logged-in admins can replace product images (e.g. re-upload a fixed version)
create policy "Admins can update product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images');

-- Only logged-in admins can delete product images
create policy "Admins can delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');


-- =============================================================================
-- END OF STORAGE SETUP
-- =============================================================================

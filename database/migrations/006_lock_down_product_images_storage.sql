-- =============================================================================
-- Migration 006 — Lock down product-images storage bucket policies
-- =============================================================================
-- storage_setup.sql created the product-images bucket with policies that
-- used "to authenticated" for insert/update/delete. Before Phase 3 that was
-- effectively admin-only (only admins could sign in). Now that customers can
-- sign in too, those policies would let any customer modify product imagery.
--
-- This migration replaces them with public.is_admin() checks, matching the
-- editorial-images bucket from migration 004.
-- Run AFTER migration 003 (which defines is_admin()).
-- =============================================================================

drop policy if exists "Admins can upload product images"  on storage.objects;
drop policy if exists "Admins can update product images"  on storage.objects;
drop policy if exists "Admins can delete product images"  on storage.objects;

-- Public read stays (customers need to see product photography)
-- The "Public can view product images" policy from storage_setup.sql is fine.

create policy "Admins can upload product images"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "Admins can update product images"
  on storage.objects for update
  using (bucket_id = 'product-images' and public.is_admin());

create policy "Admins can delete product images"
  on storage.objects for delete
  using (bucket_id = 'product-images' and public.is_admin());

-- =============================================================================
-- Migration 006 — site-content storage bucket
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- Creates a NEW public storage bucket called "site-content" for any image
-- that's part of the site itself but NOT a product photo:
--   - Store hero photos (admin/stores.html)
--   - Journal post cover images & inline images (admin/journal.html)
--   - Lookbook scene images (admin/lookbooks.html)
--   - Gift-card hero images
--   - Homepage hero / collection tiles / editorial blocks (Phase 2 CMS)
--
-- Why a separate bucket from "product-images":
--   - Different lifecycle (these images don't get deleted when products go)
--   - Easier to back up / move CMS content separately later
--   - Clearer permissions if we ever lock down product image uploads more
--
-- Idempotent: safe to re-run.
-- =============================================================================


-- ── Bucket ──
-- public = true so any visitor can load the files via URL (we want customers
-- to see hero/journal/lookbook images on the storefront without auth).
insert into storage.buckets (id, name, public)
values ('site-content', 'site-content', true)
on conflict (id) do nothing;


-- ── Policies ──
-- Mirror the same pattern as product-images: public read, authenticated write.

-- Anyone can view files in this bucket (needed for the storefront)
create policy "Public can view site content"
  on storage.objects for select
  using (bucket_id = 'site-content');

-- Only signed-in admins can add new files
create policy "Admins can upload site content"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-content');

-- Only signed-in admins can replace existing files
create policy "Admins can update site content"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'site-content');

-- Only signed-in admins can delete files
create policy "Admins can delete site content"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'site-content');

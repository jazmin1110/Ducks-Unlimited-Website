-- =============================================================================
-- Migration 019 — Remove the Journal and Heritage Story from the homepage
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- The Journal pages and the Heritage Story section were removed from the
-- website code. This cleans up the homepage sections saved in the database
-- so the Design page and the live homepage no longer show them.
--
-- What it does:
--   1. Soft-deletes every 'story' and 'journal-teaser' section (sets
--      deleted_at — nothing is permanently erased).
--   2. Editorial blocks whose button pointed at a journal article or the
--      old "#story" anchor now point at the shop instead.
--
-- NOTE: the journal_posts table is left in place (with any posts in it) so
-- no content is lost. It's simply no longer used by the site.
--
-- Safe to re-run.
-- =============================================================================


-- 1. Hide the Heritage Story and Journal Teaser sections.
update public.page_sections
   set deleted_at = now(),
       updated_at = now()
 where section_type in ('story', 'journal-teaser')
   and deleted_at is null;


-- 2. Repoint editorial buttons that linked to the journal or #story.
--    Done for both the live copy (published) and the admin's working copy (draft).
update public.page_sections
   set published = published || jsonb_build_object('cta_text', 'Shop the Collection', 'cta_link', '/shop.html'),
       updated_at = now()
 where section_type = 'editorial-block'
   and (published->>'cta_link' like '/journal%' or published->>'cta_link' like '%#story');

update public.page_sections
   set draft = draft || jsonb_build_object('cta_text', 'Shop the Collection', 'cta_link', '/shop.html'),
       updated_at = now()
 where section_type = 'editorial-block'
   and (draft->>'cta_link' like '/journal%' or draft->>'cta_link' like '%#story');

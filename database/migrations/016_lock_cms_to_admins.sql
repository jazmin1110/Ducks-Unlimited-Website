-- =============================================================================
-- Migration 016 — Only real admins can edit site content, design, and brands
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- Before this migration, site_content, page_sections, theme_settings and
-- brands let ANY signed-in account write to them ("to authenticated using
-- (true)"). That was fine when only the owner could sign in, but customers
-- can now create accounts — so a customer could have edited the homepage.
--
-- This swaps those policies for the same public.is_admin() check that
-- products, lookbooks, journal_posts, stores and gift_cards already use
-- (see migration 003). is_admin() = "is this user listed in admin_users?".
--
-- To add another admin later:
--   insert into admin_users (id) values ('<their auth user id>');
--
-- Reading is unchanged: the public-read policies on each table still let
-- every visitor (signed in or not) see published content.
-- =============================================================================


-- ── site_content ──
drop policy if exists "Admins can manage site content" on public.site_content;
create policy "Admins can manage site content"
  on public.site_content for all
  using (public.is_admin()) with check (public.is_admin());


-- ── page_sections ──
drop policy if exists "Admins can manage page_sections" on public.page_sections;
create policy "Admins can manage page_sections"
  on public.page_sections for all
  using (public.is_admin()) with check (public.is_admin());


-- ── theme_settings ──
drop policy if exists "Admins can manage theme_settings" on public.theme_settings;
create policy "Admins can manage theme_settings"
  on public.theme_settings for all
  using (public.is_admin()) with check (public.is_admin());


-- ── brands ── (reading all brands stays open to signed-in users; harmless)
drop policy if exists "Admins can update brands" on public.brands;
create policy "Admins can update brands"
  on public.brands for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can insert brands" on public.brands;
create policy "Admins can insert brands"
  on public.brands for insert
  with check (public.is_admin());

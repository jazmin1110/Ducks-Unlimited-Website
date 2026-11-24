-- =============================================================================
-- 035 — Stop the public from writing fake entries into the admin change log
--
-- Problem: log_admin_change() runs with owner rights (SECURITY DEFINER) and,
-- like every new function in Supabase, anyone could call it through the API
-- (/rest/v1/rpc/log_admin_change) — even without signing in. That let a
-- stranger add made-up rows to admin_log (e.g. "price changed from 899 to 1"),
-- which would make the audit trail untrustworthy.
--
-- Fix: take away the right to call it directly. Nothing in the website calls
-- it — only the database's own triggers and publish_page() do, and those run
-- as the function's owner, so they keep working.
--
-- Safe to run more than once.
-- =============================================================================

revoke execute on function public.log_admin_change(text, uuid, text, jsonb)
  from public, anon, authenticated;

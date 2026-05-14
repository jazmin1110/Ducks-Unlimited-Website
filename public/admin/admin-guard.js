// =============================================================================
// Ducks Unlimited — Admin Page Guard
// =============================================================================
// Used by every page under /admin/* (except the login form) to enforce that
// the current visitor is signed in AND listed in the admin_users allowlist.
//
// Without this, any signed-in customer could load the admin UI — the RLS
// policies would block their data writes, but they'd see broken-empty pages
// (and a render-time leak of admin-only structure).
//
// Usage:
//
//   import { requireAdmin } from '/admin/admin-guard.js';
//   const { user } = await requireAdmin();
//   // …rest of the admin page only runs if requireAdmin resolves
//
// requireAdmin() either resolves with { user } when the visitor is an admin,
// or redirects to /admin/index.html and never resolves (Promise stays
// pending — callers should treat that as "stop running the rest of the page").
// =============================================================================

import { supabase } from '/lib/supabase.js';

/**
 * Check that the current visitor is signed in AND in the admin_users table.
 * Redirects to /admin/index.html with a `?reason=` query param when they're
 * not — the login page reads that param to show a friendly message.
 */
export async function requireAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    redirectToLogin();
    return new Promise(() => {}); // never resolve
  }

  // Hit admin_users with the session's RLS context. The "Admins can read
  // admin_users" policy means non-admins get zero rows back — same effect
  // as a 404. We just check whether our own row exists.
  const { data, error } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    console.error('[admin-guard] admin_users lookup failed:', error);
    redirectToLogin('error');
    return new Promise(() => {});
  }

  if (!data) {
    // Signed in but not an admin → sign them out to avoid an infinite loop
    // where /admin/index.html sees their session and bounces back.
    await supabase.auth.signOut();
    redirectToLogin('not-admin');
    return new Promise(() => {});
  }

  return { user: session.user };
}

function redirectToLogin(reason) {
  const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
  window.location.href = `/admin/index.html${qs}`;
}

/**
 * Sign out + go back to the login page. Wired up by the "Log Out" button on
 * every admin page. Lives here so we keep the redirect target consistent.
 */
export async function adminSignOut() {
  await supabase.auth.signOut();
  window.location.href = '/admin/index.html';
}

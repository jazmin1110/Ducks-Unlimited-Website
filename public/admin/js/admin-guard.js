// =============================================================================
// Admin guard — "is the person on this page allowed in the admin?"
// =============================================================================
// Every admin page calls this first:
//
//   import { requireAdmin } from '/admin/js/admin-guard.js';
//   const session = await requireAdmin();
//
// It checks two things:
//   1. Someone is signed in at all.
//   2. That account is listed in the admin_users table (the database function
//      is_admin() answers this — the same check the database itself uses).
//
// Why check #2? Customers can also sign in (to see their orders). Without it,
// a signed-in customer who typed /admin/... would see an empty, broken admin.
// The database already blocks them from changing anything — this just shows
// them a clear message instead.
//
// If either check fails we send them to the admin login page and stop the
// rest of the page's code from running.
// =============================================================================

import { supabase } from '/lib/supabase.js';

// A promise that never finishes. Awaiting it "pauses" the page's code forever,
// so nothing else runs while the browser is moving to the login page.
const STOP = () => new Promise(() => {});

export async function requireAdmin() {
  const { data: { session } } = await supabase.auth.getSession();

  // Not signed in → go log in.
  if (!session) {
    window.location.replace('/admin/index.html');
    return STOP();
  }

  // Signed in, but is this account an admin?
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || !isAdmin) {
    // ?denied=1 tells the login page to explain what happened.
    window.location.replace('/admin/index.html?denied=1');
    return STOP();
  }

  return session;
}

// Used by the login page: true when the signed-in account is an admin.
export async function isCurrentUserAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

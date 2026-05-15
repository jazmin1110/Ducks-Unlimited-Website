// =============================================================================
// Ducks Unlimited — Auth Helpers
// =============================================================================
// Thin wrappers around Supabase Auth so pages don't have to know the SDK
// details. Also dispatches a `du:auth-change` event on `window` so any UI
// that needs to react to sign in / sign out can subscribe to one place.
//
// Usage:
//
//   import { signIn, signUp, signOut, getCurrentUser, onAuthChange } from '/js/auth.js';
//
//   onAuthChange((user) => {
//     // user is null when signed out, or { id, email, ... } when signed in
//   });
// =============================================================================

import { supabase } from '/lib/supabase.js';

// ── Session helpers ─────────────────────────────────────────────────────────

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function isSignedIn() {
  return (await getCurrentUser()) !== null;
}

// ── Sign in / up / out ──────────────────────────────────────────────────────

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { user: data?.user ?? null, error };
}

export async function signUp({ email, password, displayName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName ?? null } },
  });
  return { user: data?.user ?? null, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

// ── Auth state subscription ─────────────────────────────────────────────────
// Fires immediately with the current user, then again on every change.

export function onAuthChange(callback) {
  getCurrentUser().then(callback);

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
    window.dispatchEvent(new CustomEvent('du:auth-change', {
      detail: { user: session?.user ?? null },
    }));
  });

  return subscription;
}

// ── Auto-redirect helper ────────────────────────────────────────────────────
// Use on account pages to bounce signed-out visitors to the sign-in page.

export async function requireSignIn(redirectTo = '/auth/sign-in.html') {
  const user = await getCurrentUser();
  if (!user) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `${redirectTo}?next=${next}`;
    return null;
  }
  return user;
}

// ── Account page gate (non-redirecting) ─────────────────────────────────────
// Use on /account/* pages to show a friendly CTA panel instead of redirecting
// signed-out visitors. Expects two top-level elements in the page:
//
//   <div id="signedInView">  ...real page content...                </div>
//   <div id="signedOutView" hidden>
//     ...with <a data-cta="sign-in"> and <a data-cta="sign-up"> links...
//   </div>
//
// What it does:
//   1. Wires both CTA links with `?next=<current-page>` so visitors bounce
//      back here after authenticating.
//   2. If signed in: shows #signedInView, hides #signedOutView, returns the
//      user object (drop-in replacement for `requireSignIn()`).
//   3. If signed out: hides #signedInView, shows #signedOutView, returns null
//      (so the page script can early-return).
//
// Returns: the user object when signed in, or null otherwise.

export async function gateAccountPage() {
  const inView  = document.getElementById('signedInView');
  const outView = document.getElementById('signedOutView');

  // Always wire the CTA links to bounce back here after auth
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  outView?.querySelector('[data-cta="sign-in"]')
    ?.setAttribute('href', `/auth/sign-in.html?next=${next}`);
  outView?.querySelector('[data-cta="sign-up"]')
    ?.setAttribute('href', `/auth/sign-up.html?next=${next}`);

  const user = await getCurrentUser();
  if (!user) {
    if (inView)  inView.hidden  = true;
    if (outView) outView.hidden = false;
    return null;
  }
  if (inView)  inView.hidden  = false;
  if (outView) outView.hidden = true;
  return user;
}

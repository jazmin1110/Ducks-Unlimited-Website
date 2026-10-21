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

export async function signUp({ email, password, displayName, marketingOptIn = false }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName ?? null, marketing_opt_in: !!marketingOptIn },
      // Where the "confirm your email" link lands, if confirmation is turned on
      emailRedirectTo: `${window.location.origin}/account/`,
    },
  });
  // When "Confirm email" is ON in Supabase, signUp succeeds but returns no
  // session — the customer has to click the link in their inbox first.
  return {
    user: data?.user ?? null,
    needsConfirmation: !error && !data?.session,
    error,
  };
}

// Passwordless option: emails a one-click sign-in link (Everlane / Shopify
// style). Also creates the account if this email is new.
export async function sendMagicLink(email, next = '/account/') {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}${safeNext(next)}` },
  });
  return { error };
}

// "Forgot password?" — emails a link to /auth/reset-password.html
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password.html`,
  });
  return { error };
}

// Sets a new password for the signed-in user (also used after a reset link)
export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  return { error };
}

// Changes the login email. Supabase sends a confirmation link to the new
// address; the change only takes effect after it's clicked.
export async function updateEmail(email) {
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${window.location.origin}/account/profile.html` },
  );
  return { error };
}

// Access token for calling our own /api endpoints as this customer
export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

// ── Friendly error messages ─────────────────────────────────────────────────
// Supabase errors are written for developers ("Invalid login credentials").
// This turns the common ones into plain language for shoppers.

export function friendlyAuthError(error) {
  const msg  = String(error?.message || '').toLowerCase();
  const code = error?.code || '';
  if (code === 'invalid_credentials' || msg.includes('invalid login'))
    return 'That email and password don\'t match. Try again, or reset your password.';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed'))
    return 'Please confirm your email first — check your inbox for our link.';
  if (code === 'user_already_exists' || msg.includes('already registered'))
    return 'An account with this email already exists. Sign in instead?';
  if (code === 'weak_password' || msg.includes('password should'))
    return 'Please choose a stronger password (at least 8 characters).';
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit') || msg.includes('security purposes'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (code === 'same_password')
    return 'Your new password must be different from the old one.';
  if (msg.includes('failed to fetch') || msg.includes('network'))
    return 'We couldn\'t reach the server. Check your connection and try again.';
  return error?.message || 'Something went wrong. Please try again.';
}

// ── Safe redirect target ────────────────────────────────────────────────────
// Only allow ?next= values that point back into this site ("/account/…"),
// never "https://evil.com" or "//evil.com".

export function safeNext(value, fallback = '/account/') {
  const v = String(value || '');
  if (v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\')) return v;
  return fallback;
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

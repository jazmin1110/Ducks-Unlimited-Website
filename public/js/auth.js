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

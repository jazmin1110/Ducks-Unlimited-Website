// =============================================================================
// Ducks Unlimited — Wishlist
// =============================================================================
// Tracks favorite product IDs.
//
//   - Signed out: localStorage only.
//   - Signed in:  Supabase `wishlists` table is the source of truth.
//                 On sign-in we merge any local IDs into the DB (so favorites
//                 picked while signed-out aren't lost). On sign-out we keep
//                 localStorage in sync as a snapshot of the last session.
//
// Public API:
//   getWishlist()       → Promise<string[]>
//   wishlistCount()     → number       (local snapshot — fast, sync)
//   isInWishlist(id)    → boolean      (local snapshot — fast, sync)
//   addToWishlist(id)   → Promise<void>
//   removeFromWishlist(id) → Promise<void>
//   toggleWishlist(id)  → Promise<boolean>  (true = now in wishlist)
//
// Listen on `window` for 'wishlist:change' events to re-paint UI.
// =============================================================================

import { supabase } from '/lib/supabase.js';

const STORAGE_KEY = 'du:wishlist';

// ── Local cache (also our offline / signed-out store) ──────────────────────

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (err) {
    console.warn('[wishlist] readLocal failed:', err);
    return [];
  }
}

function writeLocal(ids) {
  const unique = [...new Set(ids.map(String))];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  window.dispatchEvent(new CustomEvent('wishlist:change', { detail: { ids: unique } }));
}

// ── User helpers ─────────────────────────────────────────────────────────────

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Public API ───────────────────────────────────────────────────────────────

// Read the wishlist from the authoritative source: Supabase if signed in,
// else localStorage. Always updates the local cache so the sync helpers
// (isInWishlist / wishlistCount) stay accurate without an await.
export async function getWishlist() {
  const userId = await getUserId();
  if (!userId) return readLocal();

  const { data, error } = await supabase
    .from('wishlists')
    .select('product_id')
    .eq('user_id', userId);

  if (error) {
    console.warn('[wishlist] DB read failed, falling back to local:', error);
    return readLocal();
  }

  const ids = (data ?? []).map(r => String(r.product_id));
  writeLocal(ids); // keep local in sync
  return ids;
}

// These are intentionally sync — they read the local cache that getWishlist /
// addToWishlist / removeFromWishlist keep up to date. Good enough for the
// "is this heart filled?" check that fires on every card render.
export function wishlistCount()  { return readLocal().length; }
export function isInWishlist(id) { return readLocal().includes(String(id)); }

export async function addToWishlist(productId) {
  const sid = String(productId);
  const local = readLocal();
  if (!local.includes(sid)) {
    local.push(sid);
    writeLocal(local);
  }

  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('wishlists')
    .insert({ user_id: userId, product_id: sid })
    .select();

  // Unique-violation is fine — it just means the product was already saved.
  if (error && error.code !== '23505') {
    console.warn('[wishlist] DB insert failed:', error);
  }
}

export async function removeFromWishlist(productId) {
  const sid = String(productId);
  writeLocal(readLocal().filter(x => x !== sid));

  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', sid);

  if (error) console.warn('[wishlist] DB delete failed:', error);
}

export async function toggleWishlist(productId) {
  if (isInWishlist(productId)) {
    await removeFromWishlist(productId);
    return false;
  }
  await addToWishlist(productId);
  return true;
}

// ── Sign-in / sign-out sync ─────────────────────────────────────────────────
// When a user signs in, merge any local-only product IDs into the DB so they
// aren't lost. Then refresh the local cache from the DB.

async function mergeLocalIntoDB(userId) {
  const local = readLocal();
  if (local.length === 0) return;

  const rows = local.map(productId => ({ user_id: userId, product_id: productId }));

  // upsert with ignoreDuplicates so existing rows aren't touched
  const { error } = await supabase
    .from('wishlists')
    .upsert(rows, { onConflict: 'user_id,product_id', ignoreDuplicates: true });

  if (error) console.warn('[wishlist] merge into DB failed:', error);
}

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    await mergeLocalIntoDB(session.user.id);
    await getWishlist(); // refreshes local cache + fires wishlist:change
  } else if (event === 'SIGNED_OUT') {
    // Clear local so a different user on the same browser doesn't inherit
    writeLocal([]);
  }
});

// ── Cross-tab sync ──────────────────────────────────────────────────────────

window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  window.dispatchEvent(new CustomEvent('wishlist:change', { detail: { ids: readLocal() } }));
});

// ── Auto-paint count badges ─────────────────────────────────────────────────

function paintCounts() {
  const n = wishlistCount();
  document.querySelectorAll('[data-wishlist-count]').forEach(el => {
    el.textContent = n;
    el.classList.toggle('has-items', n > 0);
  });
}

window.addEventListener('wishlist:change', paintCounts);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', paintCounts);
} else {
  paintCounts();
}

// On load, if a session exists, pull fresh data
getWishlist().catch(() => { /* swallow — local cache is fine */ });

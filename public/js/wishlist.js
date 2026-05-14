// =============================================================================
// Ducks Unlimited — Wishlist (localStorage)
// =============================================================================
// Tracks favorite product IDs in the browser. In Phase 3 we'll sync this
// to a `wishlists` table in Supabase when the user is signed in. For now,
// everything lives in localStorage so the heart icons work end-to-end.
//
// Usage in any page:
//
//   import { toggleWishlist, isInWishlist, wishlistCount } from '/js/wishlist.js';
//
// And listen for 'wishlist:change' events on `window` to refresh UI.
// =============================================================================

const STORAGE_KEY = 'du:wishlist';

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.warn('[wishlist] read failed:', err);
    return [];
  }
}

function write(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent('wishlist:change', { detail: { ids } }));
}

export function getWishlist()       { return read(); }
export function wishlistCount()     { return read().length; }
export function isInWishlist(id)    { return read().includes(String(id)); }

export function addToWishlist(id) {
  const ids = read();
  const sid = String(id);
  if (!ids.includes(sid)) {
    ids.push(sid);
    write(ids);
  }
}

export function removeFromWishlist(id) {
  const sid = String(id);
  const ids = read().filter(x => x !== sid);
  write(ids);
}

// Returns the new state (true = now in wishlist, false = removed)
export function toggleWishlist(id) {
  if (isInWishlist(id)) {
    removeFromWishlist(id);
    return false;
  }
  addToWishlist(id);
  return true;
}

// ── Cross-tab sync: when another tab updates the wishlist, re-fire the event
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  window.dispatchEvent(new CustomEvent('wishlist:change', { detail: { ids: read() } }));
});

// ── Auto-update any [data-wishlist-count] elements on the page
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

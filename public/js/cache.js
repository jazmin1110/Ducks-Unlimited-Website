// =============================================================================
// Ducks Unlimited — Tiny localStorage cache for slow Supabase queries
// =============================================================================
// Lets pages render INSTANTLY from a previous visit's cached data, then
// quietly refresh in the background and re-render once the fresh data
// arrives. Used by /shop.html for the product list.
//
// PATTERN — "stale-while-revalidate":
//
//   1. On page load, look up cached data for this key in localStorage.
//   2. If it exists AND is younger than maxAgeMs → render it RIGHT NOW.
//      The page feels instant because we're not waiting for the network.
//   3. ALWAYS fetch fresh data in the background.
//   4. When the fetch returns, compare to what we rendered. If different,
//      re-render with the fresh copy and update the cache.
//
// USAGE:
//
//   import { swrCache } from '/js/cache.js';
//
//   await swrCache({
//     key: 'shop:products:v1',          // any unique string
//     maxAgeMs: 5 * 60 * 1000,           // 5 minutes
//     fetcher: () => loadProductsFromSupabase(),
//     onData: (products, source) => {    // called 1-2 times: cache + fresh
//       renderShop(products);
//       if (source === 'cache') showStaleBanner();
//     },
//   });
//
// LIMITS we accept:
//   - Cached data may be up to maxAgeMs old when shown. For the storefront
//     catalog this is fine — products don't change every minute.
//   - localStorage is per-domain, capped at ~5 MB. Don't cache giant blobs.
//   - If the cached data and the fresh data are identical, we still call
//     onData twice (with source='cache' then source='fresh'). The page can
//     diff and skip the second render if it cares.
// =============================================================================


// Read the cached envelope for `key`. Returns null if missing, malformed,
// or older than maxAgeMs. Never throws — cache failures should be silent.
function readCache(key, maxAgeMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const envelope = JSON.parse(raw);
    if (!envelope || typeof envelope.savedAt !== 'number') return null;

    const age = Date.now() - envelope.savedAt;
    if (age > maxAgeMs) return null;

    return envelope.data;
  } catch {
    // QuotaExceeded / SecurityError / parse error — pretend we have no cache.
    return null;
  }
}

// Write `data` under `key` with a timestamp envelope.
function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      data,
    }));
  } catch {
    // Storage full or disabled — drop silently. The page still works fine,
    // it just won't have a cache to hit on the next load.
  }
}


// Public API — see the file header for usage details.
//
// Returns a promise that resolves AFTER the fresh fetch completes (whether
// or not the cache hit). Callers can ignore the return value if they don't
// care about that completion signal.
export async function swrCache({ key, maxAgeMs = 5 * 60 * 1000, fetcher, onData }) {
  // Step 1 — synchronous cache hit. Render immediately if we have one.
  const cached = readCache(key, maxAgeMs);
  if (cached !== null) {
    try { onData(cached, 'cache'); } catch (e) { console.error(e); }
  }

  // Step 2 — fresh fetch in the background. Always runs, so the cache
  // gets refreshed even when we just rendered from it.
  let fresh;
  try {
    fresh = await fetcher();
  } catch (err) {
    console.error('[cache] fetcher failed for key', key, err);
    // If the fetch fails AND we never rendered from cache, the caller
    // sees nothing — but that's the same as if there was no cache layer
    // at all, so it's not a regression.
    return;
  }

  // Update the cache for the next page load
  writeCache(key, fresh);

  // Step 3 — re-render with fresh data. Skip if we're SURE it's identical
  // to what we already rendered. Cheap deep-equal via JSON.stringify is
  // fine for the typical product-list size (< 100 KB).
  if (cached !== null) {
    try {
      if (JSON.stringify(cached) === JSON.stringify(fresh)) return;
    } catch { /* fall through to re-render */ }
  }

  try { onData(fresh, 'fresh'); } catch (e) { console.error(e); }
}


// Manual invalidation — if you know data changed (e.g. admin saved a
// product), call this to force the next page load to fetch fresh.
//
//   import { invalidateCache } from '/js/cache.js';
//   invalidateCache('shop:products:v1');
export function invalidateCache(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

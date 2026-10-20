// =============================================================================
// Ducks Unlimited + Rocwood — Brand resolver
// =============================================================================
// Decides which brand the visitor is currently browsing and makes it available
// to every other page / module via two surfaces:
//
//   1. `document.documentElement.dataset.brand`  → 'du' or 'rw'
//      Lets CSS re-theme per brand ([data-brand="rw"] { ... }).
//
//   2. `window.CURRENT_BRAND`                    → { slug, name, ... }
//      Lets other scripts filter products, build links, etc.
//
// Resolution order (first match wins):
//   1. URL path prefix:  /rw/anything  → rw
//   2. Query param:      ?brand=rw     → rw
//   3. localStorage:     'brand'       → whatever was persisted last
//   4. Default:          du
//
// Keep this file tiny and zero-dependency. It runs before Supabase or any
// framework code — the brand must be known on first paint.
// =============================================================================

const KNOWN_BRANDS = {
  du: {
    slug: 'du',
    name: 'Ducks Unlimited',
    tagline: 'est. 1995',
    primaryColor: '#1B4D2E',
    accentColor: '#C9A84C',
    orderPrefix: 'DU',
    homePath: '/'
  },
  rw: {
    slug: 'rw',
    name: 'Rocwood',
    tagline: null,
    primaryColor: '#2A2420',
    accentColor: '#8C6B3F',
    orderPrefix: 'RW',
    homePath: '/rw/'
  }
};

const DEFAULT_SLUG = 'du';
const STORAGE_KEY  = 'brand';


// ─── Resolve the current brand slug from the URL / storage ──────────────────

function slugFromPath() {
  // Treat the FIRST path segment as a brand slug only if it matches a known brand.
  // Guards against false positives like /rw-something-else.html.
  const match = window.location.pathname.match(/^\/([a-z]{2,4})(?:\/|$)/);
  if (match && KNOWN_BRANDS[match[1]]) return match[1];
  return null;
}

function slugFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('brand');
  return q && KNOWN_BRANDS[q] ? q : null;
}

function slugFromStorage() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s && KNOWN_BRANDS[s] ? s : null;
  } catch {
    // Safari private mode throws on localStorage — treat as not-set.
    return null;
  }
}

function resolveSlug() {
  return slugFromPath()
      ?? slugFromQuery()
      ?? slugFromStorage()
      ?? DEFAULT_SLUG;
}


// ─── Apply the brand to the document ────────────────────────────────────────

function applyBrand(slug) {
  const brand = KNOWN_BRANDS[slug] || KNOWN_BRANDS[DEFAULT_SLUG];

  document.documentElement.dataset.brand = brand.slug;
  window.CURRENT_BRAND = brand;

  // Persist for the visitor's next page (except when the URL dictated it;
  // we still persist, so a direct deep-link to /rw/* sticks for next visit).
  try { localStorage.setItem(STORAGE_KEY, brand.slug); } catch {}

  // Let the rest of the site react (nav paints the switcher, shop filters, etc).
  window.dispatchEvent(new CustomEvent('brand:change', { detail: brand }));

  return brand;
}


// ─── Public API ─────────────────────────────────────────────────────────────

export function getCurrentBrand() {
  return window.CURRENT_BRAND || KNOWN_BRANDS[DEFAULT_SLUG];
}

export function setBrand(slug) {
  // No-op when the user clicks the already-active brand tab.
  const prev = getCurrentBrand();
  if (prev && prev.slug === slug) return prev;

  const brand = applyBrand(slug);

  // Brand switching on a brand home jumps to the other brand's home.
  // Everywhere else we reload so every brand-aware fetch on the page
  // (shop products, announcement bar, site-content hero) re-runs with the
  // newly-applied brand. Making one place reload is cheaper and more
  // reliable than making every consumer subscribe to brand:change.
  const path   = window.location.pathname;
  const atHome = path === '/' || /^\/[a-z]{2,4}\/?$/.test(path);
  if (atHome && brand.homePath !== path) {
    window.location.href = brand.homePath;
  } else {
    window.location.reload();
  }
  return brand;
}

export function allBrands() {
  return Object.values(KNOWN_BRANDS);
}

export function brandBySlug(slug) {
  return KNOWN_BRANDS[slug] || null;
}


// =============================================================================
// Admin-side brand filter
// =============================================================================
// Admin pages pick a brand independently of what visitors are browsing as.
// Backed by a separate localStorage key so switching brands in admin doesn't
// bleed into the public storefront experience, and vice versa.
//
// Admin additionally has an "all" value: show rows from every brand at once.
// Public never has this.

const ADMIN_STORAGE_KEY = 'admin_brand';
const ADMIN_DEFAULT     = 'du';
export const ADMIN_ALL  = 'all';

export function getAdminBrandSlug() {
  try {
    const s = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (s === ADMIN_ALL) return ADMIN_ALL;
    if (s && KNOWN_BRANDS[s]) return s;
  } catch {}
  return ADMIN_DEFAULT;
}

export function setAdminBrandSlug(slug) {
  if (slug !== ADMIN_ALL && !KNOWN_BRANDS[slug]) return;
  try { localStorage.setItem(ADMIN_STORAGE_KEY, slug); } catch {}
}

// Build a Supabase relational filter that scopes a query to the admin's
// currently-selected brand. Returns `null` when "All brands" is selected so
// the caller can skip the filter entirely.
//
// Usage:
//   let q = supabase.from('products').select('*, brands!inner(slug)');
//   const f = adminBrandFilter();
//   if (f) q = q.eq('brands.slug', f);
//   const { data } = await q;
export function adminBrandFilter() {
  const slug = getAdminBrandSlug();
  return slug === ADMIN_ALL ? null : slug;
}


// ─── Dynamic <title> tag per brand ─────────────────────────────────────────
// Every page's <title> is authored as "Something — Ducks Unlimited". Rewrite
// the trailing brand name to match the ACTIVE brand so a Rocwood visitor's
// browser tab doesn't say "— Ducks Unlimited". Known-brand names are
// matched explicitly so a page whose title happens to contain an em-dash
// mid-sentence isn't mutilated.
function applyBrandToTitle(brand) {
  const names = Object.values(KNOWN_BRANDS).map(b => b.name);
  const pattern = new RegExp('\\s+[—–-]\\s+(' + names.map(n => n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|') + ')\\s*$');
  const current = document.title || '';
  if (pattern.test(current)) {
    document.title = current.replace(pattern, ' — ' + brand.name);
  }
  // Pages whose title doesn't carry a brand suffix are left alone.
}


// ─── Run on load so the first paint already has the right brand ────────────

const _initialBrand = applyBrand(resolveSlug());
applyBrandToTitle(_initialBrand);

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
  const brand = applyBrand(slug);
  // Navigate to this brand's home only if we're currently on the OTHER brand's
  // home — switching mid-flow (cart, product page) should stay on the page.
  const path = window.location.pathname;
  const atHome = path === '/' || /^\/[a-z]{2,4}\/?$/.test(path);
  if (atHome && brand.homePath !== path) {
    window.location.href = brand.homePath;
  }
  return brand;
}

export function allBrands() {
  return Object.values(KNOWN_BRANDS);
}

export function brandBySlug(slug) {
  return KNOWN_BRANDS[slug] || null;
}


// ─── Run on load so the first paint already has the right brand ────────────

applyBrand(resolveSlug());

// =============================================================================
// Ducks Unlimited — Storefront section renderer
// =============================================================================
// Reads an ordered list of page_sections rows from Supabase and renders each
// one as HTML. The storefront calls renderPageSections('home', containerEl)
// and we take it from there.
//
// Per-brand resolution follows the same rule as /js/site-content.js:
//   brand-specific rows (brand_id = <current>) win over global rows
//   (brand_id IS NULL) with the same section_type.
//
// Preview mode (?preview=1 + authenticated admin) reads `draft` instead of
// `published`. Anonymous visitors with ?preview=1 silently fall back.
//
// The HTML for each section type lives in /js/section-templates.js, which the
// admin editor's live preview also uses — so the preview always matches the
// live site. This file only LOADS things (sections, theme, products) and then
// hands them to the templates.
//
// No-JavaScript / offline fallback: whatever HTML is already inside the
// container stays put unless we successfully load at least one section. So
// index.html keeps a hardcoded copy of the homepage inside its container.
// =============================================================================

import { supabase }        from '/lib/supabase.js';
import { getCurrentBrand } from '/js/brand.js';
// Stand-in photos for any slot that has no uploaded photo yet
import { productPhotos } from '/js/stock-photos.js';
// The ?v= number makes browsers fetch a fresh copy after we change the
// templates (Vercel lets browsers keep /js/ files for a day). Bump it whenever
// section-templates.js changes.
import { renderSectionsHtml } from '/js/section-templates.js?v=20261124';
import { themeCssVars, fontStylesheetUrl } from '/js/theme-fonts.js';


// ── Public API ──────────────────────────────────────────────────────────────

// Fetch + render every section for a page into `container`. Resolves once
// painted.
//
//   await renderPageSections('home', document.getElementById('sections'));
//
// Options:
//   preview  → force preview mode (used by the admin preview iframe)
//   brandId  → override the auto-resolved brand (used by admin)
export async function renderPageSections(pageKey, container, options = {}) {
  if (!container) return;

  const usePreview = options.preview ?? await shouldUsePreview();
  const brandId    = options.brandId ?? await resolveBrandId();
  const sections   = await loadSections(pageKey, brandId, usePreview);

  // Also load the brand's theme settings so sections can read brand/accent colors.
  const theme = await loadThemeSettings(brandId, usePreview);

  // Nothing loaded (DB unreachable, or page has no sections yet)? Leave the
  // container's existing fallback HTML alone rather than blanking the page.
  if (!sections.length) {
    applyThemeVars(container, theme);
    return;
  }

  // Products, stores, lookbooks — whatever the sections need.
  const ctx = await loadRenderContext(sections, brandId);
  renderSectionsFromData(container, sections, theme, ctx);
}

// Draw an already-loaded list of sections into `container`.
// Used by renderPageSections() above, and by the editor's live preview
// (/js/editor-preview.js), which passes unsaved changes straight in.
//
//   sections → [{ id, section_type, settings }]
//   theme    → the brand's theme settings (or null)
//   ctx      → from loadRenderContext(), plus { editor: true } in the editor
export function renderSectionsFromData(container, sections, theme, ctx = {}) {
  if (!container) return;
  applyThemeVars(container, theme);
  const brand = getCurrentBrand();
  container.innerHTML = renderSectionsHtml(sections, {
    brandSlug:    brand.slug,
    brandName:    brand.name,
    brandTagline: brand.tagline || '',
    productsByCollection: {},
    storesById:    {},
    lookbooksById: {},
    editor: false,
    ...ctx,
    theme
  });

  // Let anything that cares know we're done (e.g. a lazy-image observer).
  container.dispatchEvent(new CustomEvent('sections:rendered', {
    detail: { count: sections.length }
  }));
}

// Load the extra data some sections need (products for product rails, and —
// later — stores and lookbooks). Only fetches what the sections refer to.
export async function loadRenderContext(sections, brandId) {
  return {
    productsByCollection: await loadProductsForRails(sections, brandId)
  };
}


// ── Loaders ─────────────────────────────────────────────────────────────────

async function loadSections(pageKey, brandId, usePreview) {
  const cols = usePreview
    ? 'id, page_key, brand_id, section_type, position, published, draft'
    : 'id, page_key, brand_id, section_type, position, published';

  let q = supabase.from('page_sections').select(cols)
    .eq('page_key', pageKey)
    // Skip soft-deleted sections. RLS already hides them from anonymous
    // visitors, but a signed-in admin browsing the storefront would see them.
    .is('deleted_at', null);
  if (brandId) q = q.or(`brand_id.eq.${brandId},brand_id.is.null`);
  else         q = q.is('brand_id', null);
  q = q.order('position', { ascending: true });

  const { data, error } = await q;
  if (error) {
    console.error('[sections-render] load failed:', error);
    return [];
  }

  // Brand vs global: if this brand has ANY sections of its own on this page,
  // show only those. Otherwise fall back to the global (brand_id = NULL) set.
  // We pick a whole page's worth at once (not per section type) so a page
  // can have two sections of the same type, e.g. two text blocks.
  const rows      = data || [];
  // A row only "counts" if it has something to show. A brand-new section
  // that has never been published (published = null) must not make the
  // live page switch from the shared set to the brand's own set.
  const hasContent = (r) => !!((usePreview ? r.draft : null) || r.published);
  const brandRows = rows.filter((r) => brandId && r.brand_id === brandId && hasContent(r));
  const pageRows  = brandRows.length ? brandRows : rows.filter((r) => r.brand_id === null);

  return pageRows
    .map((row) => ({
      ...row,
      // Preview shows the draft if there is one; otherwise the live version.
      settings: (usePreview ? row.draft : null) || row.published
    }))
    // Never-published sections have no content outside preview — skip them.
    .filter((row) => row.settings)
    .sort((a, b) => a.position - b.position);
}

async function loadThemeSettings(brandId, usePreview) {
  if (!brandId) return null;
  const cols = usePreview ? 'brand_id, published, draft' : 'brand_id, published';
  const { data, error } = await supabase
    .from('theme_settings')
    .select(cols)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (error || !data) return null;
  return (usePreview ? data.draft : data.published) || data.published || null;
}

// Pull products once per unique collection seen in the sections. Each rail
// gets a slice sized to its max_products. Keeps the storefront to one DB
// round-trip per rail bucket (new / sale / featured).
async function loadProductsForRails(sections, brandId) {
  const needed = new Set();
  for (const s of sections) {
    if (s.section_type === 'product-rail' && s.settings?.collection) {
      needed.add(s.settings.collection);
    }
  }
  if (!needed.size) return {};

  const out = {};
  for (const collection of needed) {
    out[collection] = await loadProductCollection(collection, brandId, 16);
  }
  return out;
}

async function loadProductCollectionNewest(brandId, limit) {
  let q = supabase.from('products')
    .select('id, name, base_price, category, created_at, product_images ( image_url, is_primary, display_order )')
    .eq('is_active', true).order('created_at', { ascending: false }).limit(limit);
  if (brandId) q = q.eq('brand_id', brandId);
  return q;
}

// Matches the real schema used by /shop.html: products + joined
// product_images (we pick the primary one in JS). No `is_on_sale` /
// `compare_at_price` columns exist today — "sale" and "featured" fall back
// to newest for now until those features exist in the catalog.
async function loadProductCollection(collection, brandId, limit) {
  let q = supabase
    .from('products')
    .select(`
      id, name, base_price, category, created_at,
      product_images ( image_url, is_primary, display_order )
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (brandId) q = q.eq('brand_id', brandId);
  // "featured" = products ticked "Feature on homepage" in Admin → Products
  // (products.is_featured, migration 033). Anything else = newest first.
  if (collection === 'featured') q = q.eq('is_featured', true);

  let { data, error } = await q;
  // Column missing (migration 033 not run yet) → fall back to newest
  if (error?.code === '42703' && collection === 'featured') {
    ({ data, error } = await loadProductCollectionNewest(brandId, limit));
  }
  if (error) {
    // Fail soft so the rest of the page still renders on a fresh DB.
    console.warn('[sections-render] product load failed for', collection, error.message);
    return [];
  }
  // Normalise to the shape productCardHtml expects.
  return (data || []).map((p) => ({
    id:        p.id,
    name:      p.name,
    price:     p.base_price,
    // No product photo uploaded yet → a stock photo for its category
    image_url: pickPrimaryImage(p.product_images) || pickPrimaryImage(productPhotos(p.category))
  }));
}

function pickPrimaryImage(images) {
  if (!Array.isArray(images) || !images.length) return '';
  const primary = images.find((i) => i.is_primary);
  if (primary) return primary.image_url;
  // Fallback: the lowest display_order.
  const sorted = [...images].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  return sorted[0]?.image_url || '';
}


// ── Theme vars ──────────────────────────────────────────────────────────────

function applyThemeVars(container, theme) {
  if (!theme) return;
  // Override the site's own CSS variables (from /css/style.css), scoped to
  // the sections container — so the Theme form recolors every section while
  // the nav and footer keep the brand defaults. themeCssVars() (in
  // /js/theme-fonts.js) skips anything that isn't a real colour or a font
  // from our menu.
  for (const [k, v] of Object.entries(themeCssVars(theme))) {
    container.style.setProperty(k, v);
  }

  // A font other than the defaults needs its Google Fonts stylesheet.
  // One <link> tag, reused and updated if the theme changes (the editor's
  // preview changes it while you pick fonts).
  const href = fontStylesheetUrl(theme);
  let link = document.getElementById('theme-font-link');
  if (href) {
    if (!link) {
      link = document.createElement('link');
      link.id  = 'theme-font-link';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  } else if (link) {
    link.remove();
  }
}


// Preview = ?preview=1 AND an authenticated session. Same rule as site-content.js.
async function shouldUsePreview() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('preview') !== '1') return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

async function resolveBrandId() {
  const slug = getCurrentBrand().slug;
  const key = 'brand_id_map';
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (cached?.[slug]) return cached[slug];
  } catch {}
  const { data } = await supabase.from('brands').select('slug, id');
  if (!data) return null;
  const map = Object.fromEntries(data.map((b) => [b.slug, b.id]));
  try { sessionStorage.setItem(key, JSON.stringify(map)); } catch {}
  return map[slug] || null;
}



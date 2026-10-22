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
// Keep the per-type template functions tiny and self-contained — one function
// per section type, each returns an HTML string. No frameworks, no reactivity.
//
// Templates output the SAME markup + class names as the hand-written homepage,
// so all the styling lives in /css/home.css (not inline here).
//
// No-JavaScript / offline fallback: whatever HTML is already inside the
// container stays put unless we successfully load at least one section. So
// index.html keeps a hardcoded copy of the homepage inside its container.
// =============================================================================

import { supabase }        from '/lib/supabase.js';
import { getCurrentBrand } from '/js/brand.js';


// ── Public API ──────────────────────────────────────────────────────────────

// Fetch + render every section for a page into `container`. Clears the
// container first. Resolves once painted.
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
  applyThemeVars(container, theme);

  // Products are a cross-section concern — one fetch, slice per rail.
  const productsByCollection = await loadProductsForRails(sections, brandId);

  // Nothing loaded (DB unreachable, or page has no sections yet)? Leave the
  // container's existing fallback HTML alone rather than blanking the page.
  if (!sections.length) return;

  // Render each section in order.
  const html = sections.map((s) => renderOne(s, { productsByCollection })).join('');
  container.innerHTML = html;

  // Let anything that cares know we're done (e.g. a lazy-image observer).
  container.dispatchEvent(new CustomEvent('sections:rendered', {
    detail: { pageKey, count: sections.length }
  }));
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
  const brandRows = rows.filter((r) => brandId && r.brand_id === brandId);
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
  // Future hook: when products get an `is_featured` or `is_on_sale` column,
  // branch on `collection` here. For now every collection = newest-first.

  const { data, error } = await q;
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
    image_url: pickPrimaryImage(p.product_images)
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
  // the nav and footer keep the brand defaults.
  const map = {
    '--color-primary': theme.brand_color,
    '--color-accent':  theme.accent_color,
    '--color-bg':      theme.bg_color,
    '--color-text':    theme.text_color,
    '--font-heading':  theme.heading_font && `'${theme.heading_font}', Georgia, serif`,
    '--font-body':     theme.body_font    && `'${theme.body_font}', -apple-system, sans-serif`
  };
  for (const [k, v] of Object.entries(map)) {
    if (v) container.style.setProperty(k, v);
  }
}


// ── Dispatch ────────────────────────────────────────────────────────────────

function renderOne(section, ctx) {
  const fn = TEMPLATES[section.section_type];
  if (!fn) {
    console.warn('[sections-render] no template for', section.section_type);
    return `<!-- unknown section type: ${esc(section.section_type)} -->`;
  }
  try {
    return fn(section.settings || {}, ctx);
  } catch (err) {
    console.error('[sections-render] template crashed for', section.section_type, err);
    return `<!-- template error: ${esc(section.section_type)} -->`;
  }
}


// ── Templates ───────────────────────────────────────────────────────────────
// Each returns an HTML string. Keep inline styles minimal — they're there so
// the sections look reasonable without any page-side CSS.

const TEMPLATES = {

  hero(s) {
    // No image → the CSS default (solid brand color) shows through.
    const overlay = typeof s.overlay === 'number' ? s.overlay / 100 : 0.35;
    const bgStyle = s.image_url
      ? ` style="background-image: linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${Math.min(overlay + 0.15, 0.9)})), url('${escCssUrl(s.image_url)}'); background-size: cover; background-position: center;"`
      : '';
    return `
      <section class="hero${s.image_url ? ' hero--photo' : ''}"${bgStyle}>
        <div class="hero__inner">
          ${s.eyebrow  ? `<p class="hero__eyebrow">${esc(s.eyebrow)}</p>` : ''}
          ${s.headline ? `<h1 class="hero__headline">${s.headline}</h1>` : ''}
          ${s.sub      ? `<p class="hero__sub">${esc(s.sub)}</p>` : ''}
          ${s.cta_text && s.cta_link ? `<a class="btn btn-outline-light" href="${escAttr(s.cta_link)}">${esc(s.cta_text)}</a>` : ''}
        </div>
      </section>
    `;
  },

  'category-tiles'(s) {
    const tiles = Array.isArray(s.blocks) ? s.blocks : [];
    if (!tiles.length) return '';
    return `
      <section class="collections section-xl">
        <div class="container">
          ${introHtml(s.eyebrow, s.heading, 'collections__intro')}
          <div class="collections__grid">
            ${tiles.map(tileHtml).join('')}
          </div>
        </div>
      </section>
    `;
  },

  'product-rail'(s, ctx) {
    const products = (ctx.productsByCollection?.[s.collection] || []).slice(0, Number(s.max_products) || 8);
    return `
      <section class="new-arrivals section-xl">
        <div class="container">
          ${introHtml(s.eyebrow, s.heading, 'new-arrivals__head')}
          <div class="products-grid">
            ${products.length
              ? products.map(productCardHtml).join('')
              : `<p class="products-empty">New arrivals coming soon.</p>`}
          </div>
          ${s.cta_text && s.cta_link ? `
            <div class="new-arrivals__cta">
              <a href="${escAttr(s.cta_link)}" class="btn btn-outline-dark">${esc(s.cta_text)}</a>
            </div>` : ''}
        </div>
      </section>
    `;
  },

  'editorial-block'(s) {
    const reverse = s.layout === 'image-right';
    // No photo yet → a text-only block (no big empty picture box).
    const media = s.image_url
      ? `<div class="editorial__media">${imgHtml(s.image_url, s.image_alt)}</div>`
      : '';
    return `
      <section class="editorial${s.image_url ? '' : ' editorial--text'}">
        <div class="editorial__row${reverse ? ' editorial__row--reverse' : ''}">
          ${media}
          <div class="editorial__copy">
            ${s.eyebrow  ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ''}
            ${s.headline ? `<h2 class="display-sm">${esc(s.headline)}</h2>` : ''}
            ${s.body ? `<div>${s.body}</div>` : ''}
            ${s.cta_text && s.cta_link ? `<p><a class="btn btn-outline-dark" href="${escAttr(s.cta_link)}">${esc(s.cta_text)}</a></p>` : ''}
          </div>
        </div>
      </section>
    `;
  },

  richtext(s) {
    const align = ['left', 'center', 'right'].includes(s.align) ? s.align : 'center';
    return `
      <section class="section-xl" style="text-align:${align};">
        <div class="container" style="max-width:720px;">
          ${s.heading ? `<h2 class="display-sm">${esc(s.heading)}</h2>` : ''}
          ${s.body    ? `<div style="line-height:1.8;">${s.body}</div>` : ''}
        </div>
      </section>
    `;
  }
};


// ── Small helpers ───────────────────────────────────────────────────────────

// Centered eyebrow + heading + gold rule, used at the top of several sections.
function introHtml(eyebrow, heading, className) {
  if (!eyebrow && !heading) return '';
  return `
    <div class="${className}">
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
      ${heading ? `<h2 class="display-sm">${esc(heading)}</h2>` : ''}
    </div>
  `;
}

// An <img>, or the brand-tone placeholder (img.is-empty in style.css) when
// no photo has been uploaded yet.
function imgHtml(url, alt) {
  return url
    ? `<img src="${escAttr(url)}" alt="${escAttr(alt || '')}" loading="lazy" decoding="async" />`
    : `<img class="is-empty" src="" alt="${escAttr(alt || '')}" />`;
}

function tileHtml(b) {
  // No photo yet → a plain tile in the brand's warm tone (CSS: --blank),
  // instead of an empty <img> that some browsers draw as a broken image.
  return `
    <a class="collection-tile${b.image_url ? '' : ' collection-tile--blank'}" href="${escAttr(b.link || '/shop.html')}">
      ${b.image_url ? imgHtml(b.image_url, b.image_alt || b.name) : ''}
      <div class="collection-tile__overlay">
        ${b.label    ? `<span class="collection-tile__label">${esc(b.label)}</span>` : ''}
        ${b.name     ? `<h3 class="collection-tile__name">${esc(b.name)}</h3>` : ''}
        ${b.cta_text ? `<span class="collection-tile__cta">${esc(b.cta_text)}</span>` : ''}
      </div>
    </a>
  `;
}

function productCardHtml(p) {
  const href  = `/product.html?id=${encodeURIComponent(p.id)}`;
  const brand = getCurrentBrand();
  return `
    <a class="product-card" href="${escAttr(href)}">
      <div class="product-card__image">
        ${p.image_url
          ? `<img src="${escAttr(p.image_url)}" alt="${escAttr(p.name || '')}" loading="lazy" />`
          : `<div class="product-card__placeholder">
               <span class="product-card__placeholder-mark">${esc(brand.name)}</span>
               ${brand.tagline ? `<span class="product-card__placeholder-sub">${esc(brand.tagline)}</span>` : ''}
             </div>`}
      </div>
      <div class="product-card__body">
        <h3 class="product-card__name">${esc(p.name || '')}</h3>
        <p class="product-card__price">${formatPrice(p.price)}</p>
      </div>
    </a>
  `;
}

function formatPrice(n) {
  if (n == null) return '';
  // Same format as the shop page: ₱1,250.00
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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


// ── Escaping ────────────────────────────────────────────────────────────────
// Text in setting values comes from authenticated admins, so we don't fear
// script injection the way we would with user comments — but we still escape
// the plain-text fields to avoid breaking the HTML when an admin types a <.
// Richtext fields are intentionally NOT escaped — the admin needs to be able
// to paste <br>, <em>, <strong>.

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

function escCssUrl(s) {
  return String(s ?? '').replace(/'/g, "\\'");
}

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
// per section type, each returns an HTML string. No frameworks, no reactivity;
// the admin preview re-renders the whole page on each change.
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
  // Scope the CSS vars to the sections container so a per-brand theme can
  // coexist with the global stylesheet without `!important`.
  const map = {
    '--section-brand-color':  theme.brand_color,
    '--section-accent-color': theme.accent_color,
    '--section-bg-color':     theme.bg_color,
    '--section-text-color':   theme.text_color,
    '--section-heading-font': theme.heading_font && `"${theme.heading_font}", serif`,
    '--section-body-font':    theme.body_font    && `"${theme.body_font}", sans-serif`
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
    const overlay = typeof s.overlay === 'number' ? s.overlay / 100 : 0.35;
    const img = s.image_url || '';
    const bg = img
      ? `linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay + 0.1})), url('${escCssUrl(img)}')`
      : 'var(--section-brand-color, #1B4D2E)';
    const align = ['left', 'center', 'right'].includes(s.align) ? s.align : 'center';
    return `
      <section class="s-hero" style="
        background: ${bg};
        background-size: cover;
        background-position: center;
        color: #fff;
        padding: clamp(4rem, 12vw, 10rem) 1.25rem;
        text-align: ${align};
      ">
        <div style="max-width:900px; margin:0 auto;">
          ${s.eyebrow ? `<p style="font-size:.72rem; letter-spacing:.22em; text-transform:uppercase; opacity:.9; margin-bottom:1rem;">${esc(s.eyebrow)}</p>` : ''}
          ${s.headline ? `<h1 style="font-family: var(--section-heading-font, 'Cormorant Garamond', serif); font-size: clamp(2rem, 5vw, 3.75rem); line-height:1.1; font-weight:500; margin:0 0 1rem;">${s.headline}</h1>` : ''}
          ${s.sub      ? `<p style="font-size: 1.05rem; max-width:620px; margin:${align === 'center' ? '0 auto' : '0'} 1.75rem; opacity:.92;">${esc(s.sub)}</p>` : ''}
          ${s.cta_text && s.cta_link ? `<a href="${escAttr(s.cta_link)}" style="display:inline-block; padding:.9rem 2rem; background:#fff; color:#1A1A1A; text-decoration:none; font-size:.82rem; letter-spacing:.15em; text-transform:uppercase; font-weight:600;">${esc(s.cta_text)}</a>` : ''}
        </div>
      </section>
    `;
  },

  'category-tiles'(s) {
    const tiles = Array.isArray(s.blocks) ? s.blocks : [];
    if (!tiles.length) return '';
    return `
      <section class="s-cat-tiles" style="padding: clamp(2.5rem, 6vw, 4.5rem) 1.25rem; background: var(--section-bg-color, #F5F0E8);">
        <div style="max-width:1200px; margin:0 auto;">
          ${s.heading ? `<h2 style="font-family: var(--section-heading-font, 'Cormorant Garamond', serif); font-size: clamp(1.6rem, 3vw, 2.4rem); color: var(--section-brand-color, #1B4D2E); text-align:center; margin:0 0 2rem;">${esc(s.heading)}</h2>` : ''}
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:1rem;">
            ${tiles.map(tileHtml).join('')}
          </div>
        </div>
      </section>
    `;
  },

  'product-rail'(s, ctx) {
    const products = (ctx.productsByCollection?.[s.collection] || []).slice(0, Number(s.max_products) || 8);
    return `
      <section class="s-rail" style="padding: clamp(2.5rem, 6vw, 4.5rem) 1.25rem;">
        <div style="max-width:1200px; margin:0 auto;">
          <div style="display:flex; align-items:baseline; justify-content:space-between; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap;">
            <div>
              ${s.heading    ? `<h2 style="font-family: var(--section-heading-font, 'Cormorant Garamond', serif); font-size: clamp(1.6rem, 3vw, 2.4rem); color: var(--section-brand-color, #1B4D2E); margin:0;">${esc(s.heading)}</h2>` : ''}
              ${s.subheading ? `<p style="color:#555; margin:.3rem 0 0;">${esc(s.subheading)}</p>` : ''}
            </div>
            ${s.cta_text && s.cta_link ? `<a href="${escAttr(s.cta_link)}" style="font-size:.78rem; letter-spacing:.14em; text-transform:uppercase; color: var(--section-brand-color, #1B4D2E);">${esc(s.cta_text)} →</a>` : ''}
          </div>
          ${products.length
            ? `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:1rem;">${products.map(productCardHtml).join('')}</div>`
            : `<p style="color:#999; font-style:italic;">No products in this collection yet.</p>`}
        </div>
      </section>
    `;
  },

  'editorial-block'(s) {
    const imgFirst = (s.layout ?? 'image-left') === 'image-left';
    const img = `
      <div style="aspect-ratio: 4/5; background: #eee; overflow:hidden;">
        ${s.image_url ? `<img src="${escAttr(s.image_url)}" alt="${escAttr(s.image_alt || '')}" style="width:100%; height:100%; object-fit:cover; display:block;" loading="lazy">` : ''}
      </div>
    `;
    const text = `
      <div style="display:flex; flex-direction:column; justify-content:center; padding: clamp(1.5rem, 3vw, 3rem);">
        ${s.eyebrow  ? `<p style="font-size:.72rem; letter-spacing:.22em; text-transform:uppercase; color: var(--section-accent-color, #C9A84C); margin:0 0 1rem;">${esc(s.eyebrow)}</p>` : ''}
        ${s.headline ? `<h2 style="font-family: var(--section-heading-font, 'Cormorant Garamond', serif); font-size: clamp(1.6rem, 3vw, 2.6rem); color: var(--section-brand-color, #1B4D2E); line-height:1.15; margin:0 0 1rem;">${esc(s.headline)}</h2>` : ''}
        ${s.body     ? `<div style="color:#333; line-height:1.65; margin-bottom:1.5rem;">${s.body}</div>` : ''}
        ${s.cta_text && s.cta_link ? `<a href="${escAttr(s.cta_link)}" style="font-size:.78rem; letter-spacing:.14em; text-transform:uppercase; color: var(--section-brand-color, #1B4D2E); align-self:flex-start;">${esc(s.cta_text)} →</a>` : ''}
      </div>
    `;
    return `
      <section class="s-editorial" style="padding: clamp(2rem, 5vw, 4rem) 1.25rem;">
        <div style="max-width:1200px; margin:0 auto; display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:0;">
          ${imgFirst ? img + text : text + img}
        </div>
      </section>
    `;
  },

  richtext(s) {
    const align = ['left', 'center', 'right'].includes(s.align) ? s.align : 'center';
    return `
      <section class="s-richtext" style="padding: clamp(2rem, 5vw, 4rem) 1.25rem; text-align:${align};">
        <div style="max-width:720px; margin:0 auto;">
          ${s.heading ? `<h2 style="font-family: var(--section-heading-font, 'Cormorant Garamond', serif); font-size: clamp(1.6rem, 3vw, 2.4rem); color: var(--section-brand-color, #1B4D2E); margin:0 0 1rem;">${esc(s.heading)}</h2>` : ''}
          ${s.body    ? `<div style="color:#333; line-height:1.75; font-size:1.02rem;">${s.body}</div>` : ''}
        </div>
      </section>
    `;
  }
};


// ── Small helpers ───────────────────────────────────────────────────────────

function tileHtml(b) {
  return `
    <a href="${escAttr(b.link || '#')}" style="display:block; text-decoration:none; color:inherit;">
      <div style="aspect-ratio: 3/4; background:#eee; overflow:hidden; margin-bottom:.75rem;">
        ${b.image_url ? `<img src="${escAttr(b.image_url)}" alt="${escAttr(b.name || '')}" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block; transition: transform .4s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">` : ''}
      </div>
      ${b.label ? `<p style="font-size:.68rem; letter-spacing:.18em; text-transform:uppercase; color: var(--section-accent-color, #C9A84C); margin:0 0 .25rem;">${esc(b.label)}</p>` : ''}
      <p style="font-family: var(--section-heading-font, 'Cormorant Garamond', serif); font-size:1.3rem; color: var(--section-brand-color, #1B4D2E); margin:0;">${esc(b.name || '')}</p>
    </a>
  `;
}

function productCardHtml(p) {
  const href = `/product.html?id=${encodeURIComponent(p.id)}`;
  return `
    <a href="${escAttr(href)}" style="display:block; text-decoration:none; color:inherit;">
      <div style="aspect-ratio:4/5; background:#eee; margin-bottom:.6rem; overflow:hidden;">
        ${p.image_url ? `<img src="${escAttr(p.image_url)}" alt="${escAttr(p.name || '')}" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block;">` : ''}
      </div>
      <p style="margin:0; font-size:.95rem; color:#1A1A1A;">${esc(p.name || '')}</p>
      <p style="margin:.2rem 0 0; font-size:.9rem; color:#333;">${formatPrice(p.price)}</p>
    </a>
  `;
}

function formatPrice(n) {
  if (n == null) return '';
  // Local PHP format — adjust once there's a shared formatter.
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0 });
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

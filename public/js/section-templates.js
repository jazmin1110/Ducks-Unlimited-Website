// =============================================================================
// Ducks Unlimited — Section templates (pure: no Supabase, no page access)
// =============================================================================
// Turns a list of homepage sections into one HTML string. Used by:
//   - /js/sections-render.js  (the live homepage, after it loads the sections)
//   - /js/editor-preview.js   (the editor's live preview, with unsaved changes)
// Because both use this file, the preview always matches what goes live.
//
// This file must not import Supabase or /js/brand.js, and must not touch the
// page when it loads, so our Node tests (tests/section-templates.test.mjs)
// can import it. That's also why imports here use "./" paths.
//
// Everything a template needs to know comes in through `ctx`:
//   ctx = {
//     brandSlug:   'du' | 'rw',
//     brandName:   'Ducks Unlimited',        // shown on product cards w/o photo
//     brandTagline:'',
//     productsByCollection: { new: [...], featured: [...] },
//     storesById:   { <id>: store },          // for the "Visit our store" section
//     lookbooksById:{ <id>: lookbook },       // for the "Lookbook" section
//     theme:  the brand's theme settings (or null),
//     editor: true when drawing inside the admin editor's preview
//   }
//
// Templates output the SAME markup + class names as the hand-written homepage,
// so all the styling lives in /css/home.css (not inline here).
// =============================================================================

import { homePhoto, tilePhoto, editorialPhoto } from './stock-photos.js';
import { sanitizeHtml } from './safe-html.js';
import { SECTION_SCHEMAS } from './section-schemas.js';
import { sectionWrapperAttrs } from './section-style.js';


// ── Public API ──────────────────────────────────────────────────────────────

// Draw every section, in the order given, as one HTML string.
// Hidden (_hidden) and removed (_removed) sections are skipped.
export function renderSectionsHtml(sections, ctx) {
  return (sections || [])
    .filter((s) => s && s.settings && !s.settings._hidden && !s.settings._removed)
    .map((s) => {
      const html = renderOne(s, ctx);
      // Every section sits in a <div> carrying its Style choices (space,
      // background, width) as classes — see /js/section-style.js.
      const { className, style } = sectionWrapperAttrs(s.settings, ctx?.theme);
      let attrs = `class="${className}"${style ? ` style="${escAttr(style)}"` : ''}`;
      // In the editor, also tag it so a click on it can be traced back to
      // the section it belongs to.
      if (ctx?.editor) {
        const name = SECTION_SCHEMAS[s.section_type]?.name || s.section_type;
        attrs += ` data-editor-section-id="${escAttr(s.id)}" data-editor-section-name="${escAttr(name)}"`;
      }
      return `<div ${attrs}>${html}</div>`;
    })
    .join('');
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

export const TEMPLATES = {

  hero(s, ctx) {
    // No image → a stock photo (see /js/stock-photos.js), or failing that
    // the CSS default (solid brand color) shows through.
    s = { ...s, image_url: homePhoto(s.image_url, ctx.brandSlug, 'hero') };
    const overlay = typeof s.overlay === 'number' ? s.overlay / 100 : 0.35;
    const bgStyle = s.image_url
      ? ` style="background-image: linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${Math.min(overlay + 0.15, 0.9)})), url('${escCssUrl(s.image_url)}'); background-size: cover; background-position: center;"`
      : '';
    return `
      <section class="hero${s.image_url ? ' hero--photo' : ''}"${bgStyle}>
        <div class="hero__inner">
          ${s.eyebrow  ? `<p class="hero__eyebrow">${esc(s.eyebrow)}</p>` : ''}
          ${s.headline ? `<h1 class="hero__headline">${sanitizeHtml(s.headline)}</h1>` : ''}
          ${s.sub      ? `<p class="hero__sub">${esc(s.sub)}</p>` : ''}
          ${s.cta_text && s.cta_link ? `<a class="btn btn-outline-light" href="${escAttr(s.cta_link)}">${esc(s.cta_text)}</a>` : ''}
        </div>
      </section>
    `;
  },

  'category-tiles'(s, ctx) {
    const tiles = Array.isArray(s.blocks) ? s.blocks : [];
    if (!tiles.length) return '';
    return `
      <section class="collections section-xl">
        <div class="container">
          ${introHtml(s.eyebrow, s.heading, 'collections__intro')}
          <div class="collections__grid">
            ${tiles.map((b) => tileHtml(b, ctx)).join('')}
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
              ? products.map((p) => productCardHtml(p, ctx)).join('')
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

  'editorial-block'(s, ctx) {
    s = { ...s, image_url: editorialPhoto(s.image_url, ctx.brandSlug, `${s.eyebrow} ${s.headline}`) };
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
            ${s.body ? `<div>${sanitizeHtml(s.body)}</div>` : ''}
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
          ${s.body    ? `<div style="line-height:1.8;">${sanitizeHtml(s.body)}</div>` : ''}
        </div>
      </section>
    `;
  },

  // A wide photo with words and a button on top.
  'image-banner'(s, ctx) {
    const photo  = homePhoto(s.image_url, ctx.brandSlug, 'hero');
    const height = ['short', 'medium', 'tall'].includes(s.height) ? s.height : 'medium';
    const pos    = s.text_position === 'left' ? 'left' : 'center';
    return `
      <section class="image-banner image-banner--${height} image-banner--${pos}${photo ? '' : ' image-banner--plain'}">
        ${photo ? `<img class="image-banner__img" src="${escAttr(photo)}" alt="${escAttr(s.image_alt || '')}" loading="lazy" decoding="async" />` : ''}
        <div class="image-banner__content">
          ${s.heading ? `<h2 class="image-banner__heading">${esc(s.heading)}</h2>` : ''}
          ${s.text ? `<div class="image-banner__text">${sanitizeHtml(s.text)}</div>` : ''}
          ${s.cta_text && s.cta_link ? `<a class="btn btn-outline-light" href="${escAttr(s.cta_link)}">${esc(s.cta_text)}</a>` : ''}
        </div>
      </section>
    `;
  },

  // Photos that change every few seconds. /js/slideshow.js adds the arrows,
  // dots and timing; without it, only the first slide shows.
  slideshow(s, ctx) {
    const slides = Array.isArray(s.blocks) ? s.blocks : [];
    if (!slides.length) return '';
    const seconds = Math.min(10, Math.max(3, Number(s.seconds) || 5));
    return `
      <section class="slideshow" data-slideshow data-autoplay="${s.autoplay === false ? 'false' : 'true'}"
               data-seconds="${seconds}" aria-roledescription="carousel" aria-label="Slideshow">
        ${slides.map((b, i) => {
          const photo = homePhoto(b.image_url, ctx.brandSlug, 'hero');
          return `
          <div class="slideshow__slide${photo ? '' : ' slideshow__slide--plain'}"${i === 0 ? '' : ' hidden'} aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}">
            ${photo ? `<img class="slideshow__img" src="${escAttr(photo)}" alt="${escAttr(b.image_alt || '')}" ${i === 0 ? '' : 'loading="lazy" '}decoding="async" />` : ''}
            <div class="slideshow__content">
              ${b.heading ? `<h2 class="slideshow__heading">${esc(b.heading)}</h2>` : ''}
              ${b.text ? `<p class="slideshow__text">${esc(b.text)}</p>` : ''}
              ${b.cta_text && b.cta_link ? `<a class="btn btn-outline-light" href="${escAttr(b.cta_link)}">${esc(b.cta_text)}</a>` : ''}
            </div>
          </div>`;
        }).join('')}
      </section>
    `;
  },

  // Two to four columns side by side.
  multicolumn(s) {
    const cols  = ['2', '3', '4'].includes(String(s.columns)) ? String(s.columns) : '3';
    const items = Array.isArray(s.blocks) ? s.blocks : [];
    return `
      <section class="multicolumn multicolumn--${cols} section-xl">
        <div class="container">
          ${introHtml('', s.heading, 'multicolumn__intro')}
          <div class="multicolumn__grid">
            ${items.map((b) => {
              const inner = `
                ${b.image_url ? `<div class="multicolumn__media">${imgHtml(b.image_url, b.image_alt)}</div>` : ''}
                ${b.heading ? `<h3 class="multicolumn__heading">${esc(b.heading)}</h3>` : ''}
                ${b.text ? `<div class="multicolumn__text">${sanitizeHtml(b.text)}</div>` : ''}`;
              return b.link
                ? `<a class="multicolumn__item multicolumn__item--link" href="${escAttr(b.link)}">${inner}</a>`
                : `<div class="multicolumn__item">${inner}</div>`;
            }).join('')}
          </div>
        </div>
      </section>
    `;
  },

  // What customers say.
  testimonials(s) {
    const quotes = Array.isArray(s.blocks) ? s.blocks : [];
    return `
      <section class="testimonials section-xl">
        <div class="container">
          ${introHtml('', s.heading, 'testimonials__intro')}
          <div class="testimonials__grid">
            ${quotes.map((q) => `
              <figure class="testimonial">
                <blockquote class="testimonial__quote">${esc(q.quote)}</blockquote>
                ${q.name || q.place ? `
                <figcaption class="testimonial__who">
                  ${q.name ? `<span class="testimonial__name">${esc(q.name)}</span>` : ''}
                  ${q.place ? `<span class="testimonial__place">${esc(q.place)}</span>` : ''}
                </figcaption>` : ''}
              </figure>`).join('')}
          </div>
        </div>
      </section>
    `;
  },

  // A grid of photos, each optionally a link.
  'image-gallery'(s) {
    const cols   = String(s.columns) === '3' ? '3' : '4';
    const photos = Array.isArray(s.blocks) ? s.blocks : [];
    return `
      <section class="gallery gallery--${cols} section-xl">
        <div class="container">
          ${introHtml('', s.heading, 'gallery__intro')}
          <div class="gallery__grid">
            ${photos.map((p) => {
              const img = p.image_url
                ? imgHtml(p.image_url, p.image_alt)
                : `<span class="gallery__blank" aria-hidden="true"></span>`;
              return p.link
                ? `<a class="gallery__item" href="${escAttr(p.link)}">${img}</a>`
                : `<div class="gallery__item">${img}</div>`;
            }).join('')}
          </div>
        </div>
      </section>
    `;
  },

  // Questions that open to show the answer. <details> works without JavaScript.
  faq(s) {
    const items = Array.isArray(s.blocks) ? s.blocks : [];
    return `
      <section class="faq section-xl">
        <div class="container faq__container">
          ${introHtml('', s.heading, 'faq__intro')}
          <div class="faq__list">
            ${items.map((q) => `
              <details class="faq__item">
                <summary class="faq__question">${esc(q.question)}</summary>
                <div class="faq__answer">${sanitizeHtml(q.answer || '')}</div>
              </details>`).join('')}
          </div>
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

function tileHtml(b, ctx) {
  b = { ...b, image_url: tilePhoto(b.image_url, ctx.brandSlug, b.link) };
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

function productCardHtml(p, ctx) {
  const href  = `/product.html?id=${encodeURIComponent(p.id)}`;
  const brand = { name: ctx.brandName || '', tagline: ctx.brandTagline || '' };
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

// ── Escaping ────────────────────────────────────────────────────────────────
// Text in setting values comes from authenticated admins, so we don't fear
// script injection the way we would with user comments — but we still escape
// the plain-text fields to avoid breaking the HTML when an admin types a <.
// Richtext fields go through sanitizeHtml() (see /js/safe-html.js), which
// keeps only <p>, <br>, <strong>, <em> and safe links.

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

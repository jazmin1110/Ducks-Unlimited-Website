// =============================================================================
// Ducks Unlimited — Storefront site_content reader
// =============================================================================
// Loads CMS-driven copy + images from the `site_content` Postgres table and
// paints them into the storefront page. Used by /index.html for the homepage
// hero, collection tiles, and editorial blocks.
//
// HOW THE PAGE OPTS IN
//   The script walks every element with a `data-content-key` attribute and
//   replaces its content based on the rest of the data-* attributes:
//
//     <h1 data-content-key="home.hero" data-content-field="headline"></h1>
//        → innerText = state['home.hero'].headline
//
//     <h1 data-content-key="home.hero" data-content-field="headline" data-content-html></h1>
//        → innerHTML = state['home.hero'].headline   (for fields with <br/>, etc.)
//
//     <img data-content-key="home.hero" data-content-field="image_url"
//          data-content-attr="src">
//        → element.src = state['home.hero'].image_url
//
//     <a data-content-key="home.hero" data-content-field="cta_link"
//        data-content-attr="href">
//        → element.href = state['home.hero'].cta_link
//
//     <section data-content-key="home.hero" data-content-field="image_url"
//              data-content-bg-image>
//        → element.style.backgroundImage = `url('...')`  (preserves any CSS overlay)
//
// PREVIEW MODE
//   When the URL has ?preview=1 AND the visitor has an admin Supabase session,
//   we read the `draft` blob instead of `published`. Anonymous visitors with
//   ?preview=1 still see the published version — RLS prevents anything else.
// =============================================================================

import { supabase } from '/lib/supabase.js';


// ── Public API ──────────────────────────────────────────────────────────────

// Reads every site_content row whose key starts with `prefix` (e.g. "home.")
// and applies it to any [data-content-key] elements on the page.
//
// Call from a page like:
//   import { applySiteContent } from '/js/site-content.js';
//   applySiteContent('home.');
//
// Returns the loaded content object so the caller can use it directly too.
export async function applySiteContent(prefix = 'home.') {
  const usePreview = await shouldUsePreview();

  // Pull just the columns we need. Anonymous visitors don't have access to
  // `draft` (revoked at the SQL level), so we ask for it conditionally.
  const cols = usePreview ? 'key, published, draft' : 'key, published';

  const { data, error } = await supabase
    .from('site_content')
    .select(cols)
    .like('key', `${prefix}%`);

  if (error) {
    console.error('[site-content] load failed:', error);
    return {};
  }

  // Build { key → content } where content is draft (preview) or published.
  const byKey = {};
  for (const row of (data || [])) {
    const content = (usePreview ? row.draft : row.published) || row.published || null;
    if (content) byKey[row.key] = content;
  }

  // Walk the DOM and apply.
  applyToDom(byKey);

  // Tell anyone who cares (e.g. a section that wants to fade in once content
  // is loaded) that we're done painting.
  document.documentElement.dispatchEvent(
    new CustomEvent('site-content:applied', { detail: { byKey } })
  );

  return byKey;
}


// ── Internals ───────────────────────────────────────────────────────────────

// Preview mode requires BOTH the ?preview=1 flag AND an authenticated session.
// Anonymous visitors with the flag silently fall back to published content.
async function shouldUsePreview() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('preview') !== '1') return false;

  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

// Walk the DOM looking for `[data-content-key]` and replace text/attrs/bg
// according to the data-* attributes. See the file header for the contract.
function applyToDom(byKey) {
  const elements = document.querySelectorAll('[data-content-key]');
  for (const el of elements) {
    const key   = el.dataset.contentKey;
    const field = el.dataset.contentField;
    if (!key || !field) continue;

    const content = byKey[key];
    if (!content) continue; // row missing — leave the hardcoded fallback in place

    const value = content[field];
    // Skip null, undefined, AND empty strings — an empty src/href would
    // either paint a broken image or trigger a self-page re-fetch in some
    // browsers. The HTML's hardcoded fallback (also blank for image
    // fields) shows the brand-tone placeholder via CSS instead.
    if (!value) continue;

    if (el.dataset.contentAttr) {
      // Set an attribute (src, href, alt, etc.)
      el.setAttribute(el.dataset.contentAttr, value);
    } else if (el.dataset.contentBgImage !== undefined) {
      // Set a CSS background-image while preserving any existing CSS overlay.
      // The original homepage hero uses a linear-gradient(...) + url(...) stack;
      // we replace just the URL portion.
      el.style.backgroundImage =
        `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.45)), url('${escapeCssUrl(value)}')`;
    } else if (el.dataset.contentHtml !== undefined) {
      // innerHTML — used for fields that may contain inline tags like <br/>.
      // Only safe because the content originates from authenticated admins.
      el.innerHTML = value;
    } else {
      // Plain text replacement (default; safest)
      el.textContent = value;
    }
  }
}

// Minimal escape so a stray quote in an image URL doesn't break the CSS.
function escapeCssUrl(url) {
  return String(url).replace(/'/g, "\\'");
}

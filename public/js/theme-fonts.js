// =============================================================================
// Ducks Unlimited — Theme fonts and theme CSS variables (pure)
// =============================================================================
// The editor's font dropdowns only offer the fonts listed here, so a typo can
// never break the website's lettering. All are free Google Fonts.
//
// The first font in each list is the brand default, which /css/style.css
// already loads on every page. Any other choice needs its own Google Fonts
// stylesheet — fontStylesheetUrl() builds that link.
//
// To offer another font: add its exact Google Fonts name to a list below.
// =============================================================================

export const HEADING_FONTS = [
  'Cormorant Garamond',
  'Playfair Display',
  'EB Garamond',
  'Libre Baskerville',
  'Lora',
  'DM Serif Display'
];

export const BODY_FONTS = [
  'DM Sans',
  'Inter',
  'Lato',
  'Work Sans',
  'Nunito Sans',
  'Karla'
];

// Font weights we load for each kind of text.
const HEADING_WEIGHTS = '400;600';
const BODY_WEIGHTS    = '400;500';

// Theme "button shape" choice → corner roundness for buttons.
const BUTTON_RADIUS = { square: '0', rounded: '6px', pill: '999px' };


// ── Public API ──────────────────────────────────────────────────────────────

// The Google Fonts stylesheet address for the theme's fonts, or null when
// the theme uses only the default fonts (already loaded by style.css).
export function fontStylesheetUrl(theme) {
  const families = [];
  const heading = pickFont(theme?.heading_font, HEADING_FONTS);
  const body    = pickFont(theme?.body_font, BODY_FONTS);
  // Libre Baskerville has no 600 weight and DM Serif Display only has 400.
  // Asking Google for a weight a font doesn't have makes the whole request
  // fail, so those two get their own weights (see headingWeights below).
  if (heading && heading !== HEADING_FONTS[0]) families.push(familyParam(heading, headingWeights(heading)));
  if (body && body !== BODY_FONTS[0])          families.push(familyParam(body, BODY_WEIGHTS));
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

// The CSS variables a theme sets on the sections area. Anything broken
// (a colour that isn't a colour, a font not on our menu) is left out, so the
// site's normal look shows instead.
export function themeCssVars(theme) {
  const t = theme || {};
  const vars = {};
  const color = (v) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v || '').trim()) ? String(v).trim() : '');

  if (color(t.brand_color))  vars['--color-primary'] = color(t.brand_color);
  if (color(t.accent_color)) vars['--color-accent']  = color(t.accent_color);
  if (color(t.bg_color))     vars['--color-bg']      = color(t.bg_color);
  if (color(t.text_color))   vars['--color-text']    = color(t.text_color);

  const heading = pickFont(t.heading_font, HEADING_FONTS);
  const body    = pickFont(t.body_font, BODY_FONTS);
  if (heading) vars['--font-heading'] = `'${heading}', Georgia, serif`;
  if (body)    vars['--font-body']    = `'${body}', -apple-system, sans-serif`;

  if (BUTTON_RADIUS[t.button_shape] !== undefined) vars['--btn-radius'] = BUTTON_RADIUS[t.button_shape];
  return vars;
}


// ── Helpers ─────────────────────────────────────────────────────────────────

// The font name if it's on the menu, else ''.
function pickFont(name, menu) {
  return menu.includes(name) ? name : '';
}

function headingWeights(font) {
  if (font === 'DM Serif Display')  return '400';
  if (font === 'Libre Baskerville') return '400;700';
  return HEADING_WEIGHTS;
}

// "Work Sans", "400;500" → "family=Work+Sans:wght@400;500"
function familyParam(font, weights) {
  return `family=${font.replace(/ /g, '+')}:wght@${weights}`;
}

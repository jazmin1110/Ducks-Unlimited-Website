// =============================================================================
// Ducks Unlimited — Section "Style" settings (pure: no Supabase, no page access)
// =============================================================================
// Every section gets the same few Style choices at the bottom of its form:
//
//   Space above / Space below : None · Small · Medium · Large
//   Background                : Page colour · White · Brand colour ·
//                               Accent colour · Custom colour
//   Width (some types only)   : Normal · Full width
//
// They are CHOICES, not sliders, so nobody can set an ugly value by accident.
//
// "Medium" and "Page colour" mean "the section's own built-in look", so a
// section with default Style looks exactly as it did before this existed.
//
// sectionWrapperAttrs() turns the choices into CSS classes for the <div>
// that wraps each section. The CSS that uses those classes is in
// /css/home.css (search for "Section style").
// =============================================================================


const SPACE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'sm',   label: 'Small' },
  { value: 'md',   label: 'Medium' },
  { value: 'lg',   label: 'Large' }
];

const BACKGROUND_OPTIONS = [
  { value: 'page',   label: 'Page colour' },
  { value: 'white',  label: 'White' },
  { value: 'brand',  label: 'Brand colour' },
  { value: 'accent', label: 'Accent colour' },
  { value: 'custom', label: 'Custom colour' }
];

// The Style fields, in the same shape as the fields in section-schemas.js,
// so the admin builds their form the same way.
//   group: 'style'      → the admin shows these under a "Style" heading
//   showIf              → only show this field when another field has a value
//   onlyIfFullWidth     → only added to section types that allow full width
export const STYLE_FIELDS = [
  { id: 'space_above', type: 'select', label: 'Space above', default: 'md', options: SPACE_OPTIONS, group: 'style' },
  { id: 'space_below', type: 'select', label: 'Space below', default: 'md', options: SPACE_OPTIONS, group: 'style' },
  { id: 'background',  type: 'select', label: 'Background',  default: 'page', options: BACKGROUND_OPTIONS, group: 'style' },
  { id: 'background_custom', type: 'color', label: 'Custom background colour', default: '#FFFFFF', group: 'style',
    showIf: { field: 'background', equals: 'custom' } },
  { id: 'width', type: 'select', label: 'Width', default: 'normal', group: 'style', onlyIfFullWidth: true,
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'full',   label: 'Full width (edge to edge)' }
    ]
  }
];

// Fallback colours when the brand has no saved theme yet.
const DEFAULT_THEME = { brand_color: '#1B4D2E', accent_color: '#C9A84C' };

const SPACES      = SPACE_OPTIONS.map((o) => o.value);
const BACKGROUNDS = BACKGROUND_OPTIONS.map((o) => o.value);


// ── Public API ──────────────────────────────────────────────────────────────

// Is this a "real" colour like #1B4D2E or #fff? Returns the colour, or ''.
export function cleanHex(value) {
  const v = String(value || '').trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : '';
}

// Is this colour dark enough that WHITE text reads better on it than black?
// Uses the standard contrast formula (WCAG). Broken colours count as light.
export function isDarkColor(hex) {
  const v = cleanHex(hex);
  if (!v) return false;
  let h = v.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // White wins when (1.05)/(L+0.05) > (L+0.05)/(0.05), i.e. L < ~0.179.
  return luminance < 0.179;
}

// Classes + inline style for the <div> around one section.
//   settings → the section's settings (Style choices may be missing)
//   theme    → the brand's theme settings (or null)
// Returns { className: 'sec sec--above-md ...', style: '' | '--sec-bg:#123456' }
export function sectionWrapperAttrs(settings, theme) {
  const s = settings || {};
  const t = { ...DEFAULT_THEME, ...(theme || {}) };

  const above = SPACES.includes(s.space_above) ? s.space_above : 'md';
  const below = SPACES.includes(s.space_below) ? s.space_below : 'md';
  let bg      = BACKGROUNDS.includes(s.background) ? s.background : 'page';

  let style = '';
  let bgColor = '';
  if (bg === 'brand')  bgColor = cleanHex(t.brand_color);
  if (bg === 'accent') bgColor = cleanHex(t.accent_color);
  if (bg === 'white')  bgColor = '#FFFFFF';
  if (bg === 'custom') {
    bgColor = cleanHex(s.background_custom);
    if (bgColor) style = `--sec-bg:${bgColor}`;
    else bg = 'page'; // not a real colour → behave like the default
  }

  const classes = ['sec', `sec--above-${above}`, `sec--below-${below}`, `sec--bg-${bg}`];
  if (bgColor && isDarkColor(bgColor)) classes.push('sec--dark');
  if (s.width === 'full') classes.push('sec--full');

  return { className: classes.join(' '), style };
}

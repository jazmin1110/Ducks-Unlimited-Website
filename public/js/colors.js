// =============================================================================
// Colour names → swatch hex codes (storefront + admin)
// =============================================================================
// The admin can store an exact hex on each variant (variants.color_hex). When
// that's empty we fall back to this list, matched loosely on the name
// ("Charcoal Gray" → charcoal, "Navy Blue" → navy, "Moss Green" → moss).
// Unknown names get a neutral grey so a wrong colour is never shown.
// =============================================================================

export const COLOR_MAP = {
  white: '#ffffff', ivory: '#f7f3e8', cream: '#f5e9d4', natural: '#efe6d3', 'twisted natural': '#e9e1cf',
  beige: '#e8dcc4', sand: '#dccbaa', stone: '#c9c2b4', putty: '#d8d0c3', tan: '#d2b48c', khaki: '#c4a575',
  gold: '#C9A84C', mustard: '#d4a72c', yellow: '#e8c34a', orange: '#cc7a3b', rust: '#b5552a',
  red: '#b33a3a', wine: '#722f37', maroon: '#6e2929', burgundy: '#6a1f2b',
  pink: '#d4a8b8', 'pale pink': '#ecc9d2', blush: '#e6b8c0', purple: '#6a4378', lavender: '#b4a3d1',
  blue: '#4a6fa5', 'light blue': '#a8c5db', 'lt blue': '#a8c5db', sky: '#9ccbe8', 'airforce blue': '#5d8aa8',
  'bright royal': '#2a4fd0', royal: '#2a4fd0', cobalt: '#1f4ec2', navy: '#1e2a44', 'navy blue': '#1e2a44',
  'club navy': '#1F2A44', cascade: '#6aa6b8', teal: '#2d7a7e', aqua: '#6fc6c4',
  green: '#2d6b3f', 'forest green': '#1B4D2E', 'moss green': '#5e6b3a', moss: '#5e6b3a', sprout: '#9aab3a',
  olive: '#6b7f3a', sage: '#9aa88a', mint: '#b9dcc5', lime: '#b7d34a',
  brown: '#5a3e2b', chocolate: '#4a2c20', coffee: '#6b4a34', camel: '#c19a6b',
  gray: '#888888', grey: '#888888', 'charcoal gray': '#36454f', 'charcoal grey': '#36454f', charcoal: '#36454f',
  'heather gray': '#a9a9a9', 'heather grey': '#a9a9a9', silver: '#bfbfbf',
  black: '#1a1a1a', 'washed black': '#2b2b2b', indigo: '#2c3e6b', denim: '#3b5b8a',
};

/**
 * Hex for a colour name. `hex` (from variants.color_hex) wins when present.
 * For "A/B" two-tone names ("White/Moss Green") the first colour is used.
 */
export function colorToHex(name, hex) {
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const raw = String(name || '').trim().toLowerCase();
  if (!raw) return '#999999';
  const first = raw.split('/')[0].trim();
  if (COLOR_MAP[first]) return COLOR_MAP[first];
  // Loose match: the longest known name contained in the string ("dark navy blue" → navy blue)
  let best = null;
  for (const key of Object.keys(COLOR_MAP)) {
    if (first.includes(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? COLOR_MAP[best] : '#999999';
}

/** CSS background for a swatch: two-tone names get a split circle. */
export function swatchStyle(name, hex) {
  const parts = String(name || '').split('/').map(s => s.trim()).filter(Boolean);
  if (parts.length === 2 && !hex) {
    return `background: linear-gradient(135deg, ${colorToHex(parts[0])} 50%, ${colorToHex(parts[1])} 50%)`;
  }
  return `background: ${colorToHex(name, hex)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Everyday colour names for the shop's Colour filter
// ─────────────────────────────────────────────────────────────────────────────
// Product colours use brand names ("Snorkel Blue", "Cork", "Turtle Dove").
// Shoppers filter by plain colours, so every swatch hex is sorted into one of
// these. Each variant can also store its own pair in variants.filter_colors
// (shirt colour + main print colour); this function is the fallback.
// Same rules are used by the photo script that fills filter_colors.
export const COLOR_FAMILIES = ['White', 'Black', 'Grey', 'Beige', 'Brown', 'Red', 'Orange',
  'Yellow', 'Green', 'Blue', 'Navy', 'Purple', 'Pink'];

export function colorFamily(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const v = Math.max(r, g, b), d = v - Math.min(r, g, b);
  const s = v === 0 ? 0 : d / v;                       // saturation 0–1
  let h = 0;                                            // hue 0–360
  if (d) h = v === r ? ((g - b) / d) % 6 : v === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;

  if (v < 0.22) return 'Black';
  if (s < 0.12) return v >= 0.85 ? 'White' : (v < 0.25 ? 'Black' : 'Grey');
  if (h >= 20 && h <= 50 && s < 0.45 && v >= 0.7) return 'Beige';   // turtle dove, khaki, sand
  if (h >= 10 && h <= 45 && v < 0.6) return 'Brown';                // cork, chocolate
  if (h < 12 || h >= 345) return (v > 0.8 && s < 0.45) ? 'Pink' : 'Red';
  if (h < 40)  return 'Orange';
  if (h < 65)  return 'Yellow';
  if (h < 165) return 'Green';
  if (h < 250) return v < 0.45 ? 'Navy' : 'Blue';
  if (h < 290) return 'Purple';
  return 'Pink';
}

// Letter sizes first (XS…XXXL), then numbers (kids 2–14, waist 28–40), then the rest
const SIZE_ORDER = { XXS: 0, XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6, XXXL: 7, '2XL': 6, '3XL': 7, 'ONE SIZE': 50 };
export function sizeRank(size) {
  const s = String(size || '').trim().toUpperCase();
  if (SIZE_ORDER[s] != null) return SIZE_ORDER[s];
  const n = Number(s);
  return Number.isFinite(n) ? 100 + n : 999;
}

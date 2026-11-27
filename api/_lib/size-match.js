// =============================================================================
// Size matching — "I'm M in Uniqlo, what am I in Ducks?"
// =============================================================================
// The AI is bad at doing measurement math reliably, so we do it here in plain
// code and hand the AI a ready-made answer sheet ("Uniqlo M → Ducks S").
//
// Where the numbers come from:
//   * OUR sizes  → public/size-guide.html (the Polos and T-Shirts tables).
//                  Edit that page and the matches change with it.
//   * THEIR sizes → the size_reference table (Admin → Ask helper → Size charts).
//
// How a match works (chest only — chest decides the size of a top):
//   1. Take the other brand's chest range for that size, e.g. Uniqlo M = 88–96 cm.
//      If that brand only publishes SHIRT measurements (Penshoppe), estimate
//      the body it fits: shirt chest − "ease" (the extra room a shirt has).
//   2. See which of OUR sizes covers most of that range
//      (S = 91–96 covers 5 cm of it, XS = 86–91 covers 3 cm → Ducks S).
//   3. If a second size covers at least half as much, mention it too:
//      "S (or XS for a closer fit)".
// =============================================================================

// Extra room a shirt has over the body it fits, in cm (full chest around).
// Worked out from Uniqlo's Dry Pique Polo, which publishes BOTH charts:
// shirt chest is about 13–15 cm bigger than the body chart for a regular fit.
// Relaxed fits are cut about 5 cm roomier (Penshoppe regular vs relaxed polo).
const EASE_CM = { slim: 10, regular: 14, relaxed: 19 };

// How close (cm) to a size boundary counts as "between two sizes"
const BETWEEN_CM = 1.5;

const round = (n) => Math.round(n * 10) / 10;

// Wording when nothing in our range fits
const NONE_SMALL = (ours) => `no match (smaller than our smallest size, ${ours})`;
const NONE_BIG   = (ours) => `no match (bigger than our biggest size, ${ours})`;


// ─── 1. Read OUR size guide tables out of size-guide.html ─────────────────────
// Returns { polo: [{size, min, max, minIn, maxIn}], 't-shirt': [...] }
export function parseOurSizeGuide(html) {
  const out = {};
  const panels = { polo: 'panel-polos', 't-shirt': 'panel-tshirts' };

  for (const [category, panelId] of Object.entries(panels)) {
    // Everything from this panel's <section> up to the next <section>
    const start = html.indexOf(`id="${panelId}"`);
    if (start === -1) continue;
    const end = html.indexOf('<section', start + 10);
    const panel = html.slice(start, end === -1 ? undefined : end);

    // Each row: <tr><td>M</td><td><span class="u-cm">96 – 101</span><span class="u-in" hidden>38 – 40</span>...
    // The FIRST measurement column is the chest.
    const rowRe = /<tr>\s*<td>\s*([^<]+?)\s*<\/td>\s*<td>\s*<span class="u-cm">\s*([\d.]+)\s*[–-]\s*([\d.]+)\s*<\/span>\s*<span class="u-in"[^>]*>\s*([\d.]+)\s*[–-]\s*([\d.]+)/g;
    const rows = [];
    let m;
    while ((m = rowRe.exec(panel))) {
      rows.push({
        size: m[1].trim(),
        min: Number(m[2]), max: Number(m[3]),
        minIn: Number(m[4]), maxIn: Number(m[5]),
      });
    }
    if (rows.length) out[category] = rows;
  }
  return out;
}


// ─── 2. The body chest range a size from another brand fits ──────────────────
function bodyRange(ref) {
  const lo = Number(ref.chest_min_cm);
  const hi = Number(ref.chest_max_cm);
  if (ref.measure_type === 'garment') {
    const ease = EASE_CM[ref.fit] ?? EASE_CM.regular;
    // A single shirt measurement fits a small range of bodies — call it ±2 cm
    return { lo: round(lo - ease - 2), hi: round(hi - ease + 2), estimated: true };
  }
  return { lo, hi, estimated: false };
}


// ─── 3. Which of OUR sizes fits a body chest range (cm)? ─────────────────────
// Looks at how much of their range each of our sizes covers.
//   Uniqlo M = 88–96 cm. Our XS (86–91) covers 3 cm of it, our S (91–96)
//   covers 5 cm → answer "S (or XS for a closer fit)".
// The second size is only mentioned when it covers at least half as much as
// the best one — otherwise it's just noise.
// Returns a short phrase for the AI, e.g. "M", "S (or XS for a closer fit)",
// "smaller than our XS".
export function ourSizeForRange(lo, hi, ours) {
  if (!ours?.length) return null;
  const first = ours[0];
  const last = ours[ours.length - 1];
  const mid = (lo + hi) / 2;

  // Completely (or mostly) outside our chart
  if (hi <= first.min || mid < first.min - BETWEEN_CM) return NONE_SMALL(first.size);
  if (lo >= last.max  || mid > last.max + BETWEEN_CM)  return NONE_BIG(last.size);

  // How many cm of their range each of our sizes covers.
  // A single number (lo = hi) counts as a 1 cm window so the math still works.
  const a = lo === hi ? lo - 0.5 : lo;
  const b = lo === hi ? hi + 0.5 : hi;
  const scored = ours
    .map((s, i) => ({ s, i, cover: Math.max(0, Math.min(b, s.max) - Math.max(a, s.min)) }))
    .filter(x => x.cover > 0)
    .sort((x, y) => y.cover - x.cover);

  if (!scored.length) return mid < first.min ? NONE_SMALL(first.size) : NONE_BIG(last.size);

  const best = scored[0];
  let text = best.s.size;

  // Ends of our chart: warn that it may not be a perfect fit
  if (mid < first.min) text += ' (our smallest — may be a bit loose)';
  else if (mid > last.max) text += ' (our biggest — may be a bit snug)';

  // A close second? Say which way it goes
  const second = scored[1];
  if (second && second.cover >= best.cover * 0.5) {
    text += second.i < best.i
      ? ` (or ${second.s.size} for a closer fit)`
      : ` (or ${second.s.size} for a roomier fit)`;
  }
  return text;
}


// ─── 4. Work out every match once ────────────────────────────────────────────
// refs = rows from size_reference; ours = parseOurSizeGuide(...)
// Returns { groups, entries } where each entry is one size of one brand:
//   { label: 'Penshoppe relaxed polo', brand, size, estimated,
//     results: { 'polos and t-shirts': 'S (or M for a roomier fit)' } }
export function buildSizeMatches(refs, ours) {
  const cats = Object.keys(ours);
  if (!cats.length) return { groups: [], entries: [] };

  // If our polo and t-shirt charts have the same chest ranges, treat them as one
  const same = cats.length > 1 &&
    JSON.stringify(ours.polo?.map(r => [r.size, r.min, r.max])) ===
    JSON.stringify(ours['t-shirt']?.map(r => [r.size, r.min, r.max]));
  const groups = same
    ? [['polos and t-shirts', ours.polo]]
    : cats.map(c => [c === 'polo' ? 'polos' : 't-shirts', ours[c]]);

  const entries = [...refs]
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.fit.localeCompare(b.fit) ||
                    a.category.localeCompare(b.category) || a.sort_order - b.sort_order)
    .map(r => {
      const parts = [r.brand];
      if (r.fit !== 'regular') parts.push(r.fit);
      if (r.category !== 'tops') parts.push(r.category);
      const b = bodyRange(r);
      const results = {};
      for (const [label, rows] of groups) results[label] = ourSizeForRange(b.lo, b.hi, rows);
      return { label: parts.join(' '), brand: r.brand, size: r.size, estimated: b.estimated, results };
    });

  return { groups, entries };
}


// ─── 5. The full answer sheet the AI reads ───────────────────────────────────
export function buildSizeMatchText({ groups, entries }, brandName = 'Ducks Unlimited') {
  if (!groups.length) return '';
  const lines = [];

  // Our own chart, cm + inches, so the AI never has to convert units
  for (const [label, rows] of groups) {
    lines.push(`OUR ${label.toUpperCase()} (body chest): ` +
      rows.map(r => `${r.size} ${r.min}-${r.max} cm (${r.minIn}-${r.maxIn} in)`).join(', '));
  }
  lines.push('');

  for (const [label] of groups) {
    lines.push(`${brandName.toUpperCase()} ${label.toUpperCase()} — their size = our size:`);
    const byLabel = new Map();
    for (const e of entries) {
      if (!byLabel.has(e.label)) byLabel.set(e.label, []);
      byLabel.get(e.label).push(e);
    }
    for (const [brandLabel, list] of byLabel) {
      const est = list.some(e => e.estimated) ? ' [estimate: this brand only lists shirt measurements]' : '';
      lines.push(`- ${brandLabel}${est}: ` + list.map(e => `their ${e.size} = ${e.results[label].startsWith('no match') ? '' : 'our '}${e.results[label]}`).join('; '));
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}


// ─── 6. Spot "brand + size" in a customer's message ──────────────────────────
// So the AI gets the exact answer handed to it instead of reading the sheet.
// Other ways people type the brand names:
const BRAND_ALIASES = {
  'H&M':            ['h&m', 'h & m', 'h and m', 'hnm', 'h&amp;m'],
  'Ralph Lauren':   ['ralph lauren', 'ralph', 'polo ralph', 'rl '],
  'Tommy Hilfiger': ['tommy hilfiger', 'tommy', 'hilfiger'],
  'Uniqlo':         ['uniqlo', 'uniqulo', 'uniklo'],
  'Penshoppe':      ['penshoppe', 'penshop', 'pen shoppe'],
  'Lacoste':        ['lacoste'],
  'Nike':           ['nike'],
  'Adidas':         ['adidas'],
};

// "medium", "2XL", "xl" … → the size names used in size_reference
function findSize(text) {
  const t = ` ${text.toLowerCase()} `;
  const words = [
    [/\b(extra[\s-]?extra[\s-]?large|2\s?xl|xxl)\b/, 'XXL'],
    [/\b(3\s?xl|xxxl)\b/, '3XL'],
    [/\b(extra[\s-]?large|xl)\b/, 'XL'],
    [/\b(extra[\s-]?small|xs)\b/, 'XS'],
    [/\b(large)\b/, 'L'], [/\b(medium)\b/, 'M'], [/\b(small)\b/, 'S'],
    // single letters only when they stand alone ("size M", "M ako", "a L") — not "I'm"
    [/(?:^|[\s(,:])l(?=$|[\s),.?!])/, 'L'], [/(?:^|[\s(,:])m(?=$|[\s),.?!])/, 'M'], [/(?:^|[\s(,:])s(?=$|[\s),.?!])/, 'S'],
  ];
  for (const [re, size] of words) if (re.test(t)) return size;
  return null;
}

// Returns a short note for the AI, or '' when no known brand is mentioned.
export function lookupSizeQuestion(text, { groups, entries }) {
  if (!entries?.length) return '';
  const lower = ` ${String(text).toLowerCase()} `;
  const brand = Object.entries(BRAND_ALIASES).find(([, names]) => names.some(n => lower.includes(n)))?.[0];
  if (!brand) return '';

  const size = findSize(text);
  const same = (a, b) => a === b || (a === 'XXL' && b === '2XL') || (a === '3XL' && b === 'XXXL');
  let list = entries.filter(e => e.brand === brand && (!size || same(e.size, size)));
  if (!list.length) list = entries.filter(e => e.brand === brand); // size not on their chart

  // Brand has several charts (Penshoppe regular polo / relaxed polo / relaxed tee)?
  // Narrow down by what they mentioned, else use the regular-fit chart.
  if (new Set(list.map(e => e.label)).size > 1) {
    const saysRelaxed = /relaxed|oversize/.test(lower);
    const saysTee = /\b(tee|tees|t-?shirts?|tshirts?)\b/.test(lower);
    const saysPolo = /\bpolo/.test(lower);
    const pick = (fn) => { const f = list.filter(fn); if (f.length) list = f; };
    pick(e => saysRelaxed === /relaxed/.test(e.label));
    if (saysTee) pick(e => /t-shirt/.test(e.label));
    else if (saysPolo) pick(e => /polo/.test(e.label));
  }

  return list.map(e => {
    const ours = groups.map(([label]) => `our ${label}: ${e.results[label]}`).join('; ');
    return `${e.label} ${e.size} → ${ours}${e.estimated ? ' (estimate — this brand only lists shirt measurements)' : ''}`;
  }).join('\n');
}

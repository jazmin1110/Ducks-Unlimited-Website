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
  if (hi <= first.min || mid < first.min - BETWEEN_CM) return `smaller than our ${first.size}`;
  if (lo >= last.max  || mid > last.max + BETWEEN_CM)  return `bigger than our ${last.size}`;

  // How many cm of their range each of our sizes covers.
  // A single number (lo = hi) counts as a 1 cm window so the math still works.
  const a = lo === hi ? lo - 0.5 : lo;
  const b = lo === hi ? hi + 0.5 : hi;
  const scored = ours
    .map((s, i) => ({ s, i, cover: Math.max(0, Math.min(b, s.max) - Math.max(a, s.min)) }))
    .filter(x => x.cover > 0)
    .sort((x, y) => y.cover - x.cover);

  if (!scored.length) return mid < first.min ? `smaller than our ${first.size}` : `bigger than our ${last.size}`;

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


// ─── 4. Build the answer sheet the AI reads ──────────────────────────────────
// refs = rows from size_reference; ours = parseOurSizeGuide(...)
// categoryLabel: what to call our products in the text ('polos', 't-shirts')
export function buildSizeMatchText(refs, ours, brandName = 'Ducks Unlimited') {
  const cats = Object.keys(ours);
  if (!cats.length) return '';

  // If our polo and t-shirt charts have the same chest ranges, show one list
  const same = cats.length > 1 &&
    JSON.stringify(ours.polo?.map(r => [r.size, r.min, r.max])) ===
    JSON.stringify(ours['t-shirt']?.map(r => [r.size, r.min, r.max]));
  const groups = same
    ? [['polos and t-shirts', ours.polo]]
    : cats.map(c => [c === 'polo' ? 'polos' : 't-shirts', ours[c]]);

  const lines = [];

  // Our own chart, cm + inches, so the AI never has to convert units
  for (const [label, rows] of groups) {
    lines.push(`OUR ${label.toUpperCase()} (body chest): ` +
      rows.map(r => `${r.size} ${r.min}-${r.max} cm (${r.minIn}-${r.maxIn} in)`).join(', '));
  }
  lines.push('');

  // Group other brands' rows: "Uniqlo" / "Penshoppe relaxed polo" ...
  const byKey = new Map();
  for (const r of refs) {
    const parts = [r.brand];
    if (r.fit !== 'regular') parts.push(r.fit);
    if (r.category !== 'tops') parts.push(r.category);
    const key = parts.join(' ');
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }

  for (const [label, rows] of groups) {
    lines.push(`${brandName.toUpperCase()} ${label.toUpperCase()} — size matches:`);
    for (const [key, rowsForBrand] of byKey) {
      rowsForBrand.sort((a, b) => a.sort_order - b.sort_order);
      let estimated = false;
      const pairs = rowsForBrand.map(r => {
        const b = bodyRange(r);
        estimated ||= b.estimated;
        return `${r.size}→${ourSizeForRange(b.lo, b.hi, rows)}`;
      });
      lines.push(`- ${key}${estimated ? ' (estimate: this brand only lists shirt measurements)' : ''}: ${pairs.join(' · ')}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

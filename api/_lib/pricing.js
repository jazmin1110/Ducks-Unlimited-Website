// =============================================================================
// Pricing rules shared by checkout — shipping zones, pickup, member discounts
// and voucher codes.
// =============================================================================
// Everything money-related lives here so the "preview" the shopper sees
// (/api/quote) and the real charge (/api/create-payment) can never disagree.
//
// To change a shipping fee or the free-shipping threshold, edit the numbers
// at the top of this file. Nothing else needs to change.
// =============================================================================

import { supabaseAdmin } from './supabase-admin.js';

// ── Shipping ─────────────────────────────────────────────────────────────────

// Orders at or above this amount (after discounts) ship free.
export const FREE_SHIPPING_THRESHOLD_PHP = 3000;

// Flat fee per zone (PHP). "Zone" is worked out from the province.
export const SHIPPING_ZONES = {
  metro_manila: { label: 'Metro Manila',        fee: 100, days: '1–3 days' },
  luzon:        { label: 'Luzon',               fee: 150, days: '2–5 days' },
  visayas:      { label: 'Visayas',             fee: 200, days: '3–7 days' },
  mindanao:     { label: 'Mindanao',            fee: 200, days: '3–7 days' },
};

// Which provinces belong to Visayas and Mindanao. Everything else (and
// anything we don't recognise) is Luzon, except "Metro Manila".
const VISAYAS = [
  'Aklan', 'Antique', 'Biliran', 'Bohol', 'Capiz', 'Cebu', 'Eastern Samar', 'Guimaras',
  'Iloilo', 'Leyte', 'Negros Occidental', 'Negros Oriental', 'Northern Samar', 'Samar',
  'Siquijor', 'Southern Leyte',
];
const MINDANAO = [
  'Agusan del Norte', 'Agusan del Sur', 'Basilan', 'Bukidnon', 'Camiguin', 'Cotabato',
  'Davao de Oro', 'Davao del Norte', 'Davao del Sur', 'Davao Occidental', 'Davao Oriental',
  'Dinagat Islands', 'Lanao del Norte', 'Lanao del Sur', 'Maguindanao del Norte',
  'Maguindanao del Sur', 'Misamis Occidental', 'Misamis Oriental', 'Sarangani',
  'South Cotabato', 'Sultan Kudarat', 'Sulu', 'Surigao del Norte', 'Surigao del Sur',
  'Tawi-Tawi', 'Zamboanga del Norte', 'Zamboanga del Sur', 'Zamboanga Sibugay',
];

// "Cebu" → 'visayas', "Metro Manila" → 'metro_manila', "Bulacan" → 'luzon'
export function zoneForProvince(province) {
  const p = String(province || '').trim().toLowerCase();
  if (!p) return 'luzon';
  if (p === 'metro manila' || p === 'ncr' || p === 'national capital region') return 'metro_manila';
  if (VISAYAS.some(v => v.toLowerCase() === p))  return 'visayas';
  if (MINDANAO.some(m => m.toLowerCase() === p)) return 'mindanao';
  return 'luzon';
}

// ── Members ──────────────────────────────────────────────────────────────────

// Store membership: Member = 10% off, Elite = 20% off (lifetime).
export const MEMBER_DISCOUNT = { member: 0.10, elite: 0.20 };

// Find the member record for a signed-in customer (by account), or by the
// phone / email typed at checkout. Returns { tier, member_number } or null.
export async function findMember({ userId, phone, email }) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  const mail   = String(email || '').trim().toLowerCase();

  const tries = [];
  if (userId) tries.push(`members?user_id=eq.${userId}&select=tier,member_number&limit=1`);
  if (digits.length === 10) tries.push(`members?phone_key=eq.${digits}&select=tier,member_number&limit=1`);
  // Email match ignores upper/lower case (ilike), but ilike treats % * and _
  // as wildcards — so "%@%.%" used to match ANY member and unlock the
  // discount. Only look up real-looking emails, and escape "_" so it means
  // a literal underscore.
  const emailOk = /^[^\s@%*\\]+@[^\s@%*\\]+\.[^\s@%*\\]+$/.test(mail);
  if (emailOk) {
    const literal = mail.replace(/_/g, '\\_');
    tries.push(`members?email=ilike.${encodeURIComponent(literal)}&select=tier,member_number&limit=1`);
  }

  for (const path of tries) {
    const rows = await supabaseAdmin(path).catch(() => []);
    if (rows?.[0]) return rows[0];
  }
  return null;
}

// ── Voucher codes ────────────────────────────────────────────────────────────

// Look up a code and check it can be used right now. Returns
//   { ok: true, row }            → usable
//   { ok: false, reason: '...' } → tell the shopper why
export async function checkDiscountCode(code, { subtotal, brandSlug }) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return { ok: false, reason: 'Enter a code.' };
  if (!/^[A-Z0-9_-]{2,30}$/.test(clean)) return { ok: false, reason: 'That code is not valid.' };

  const rows = await supabaseAdmin(
    `discount_codes?code=eq.${encodeURIComponent(clean)}&select=*,brands(slug)&limit=1`
  ).catch(() => []);
  const row = rows?.[0];

  if (!row || !row.is_active) return { ok: false, reason: 'That code is not valid.' };

  const now = Date.now();
  if (row.starts_at && Date.parse(row.starts_at) > now) return { ok: false, reason: 'That code is not active yet.' };
  if (row.ends_at   && Date.parse(row.ends_at)   < now) return { ok: false, reason: 'That code has expired.' };
  if (row.max_uses != null && row.uses >= row.max_uses) return { ok: false, reason: 'That code has been fully used.' };
  if (row.brands?.slug && brandSlug && row.brands.slug !== brandSlug) {
    return { ok: false, reason: `That code only works on ${row.brands.slug === 'rw' ? 'Rocwood' : 'Ducks Unlimited'} orders.` };
  }
  if (Number(subtotal) < Number(row.min_subtotal)) {
    return { ok: false, reason: `That code needs a subtotal of at least ₱${Number(row.min_subtotal).toLocaleString('en-PH')}.` };
  }
  return { ok: true, row };
}

// ── The one place totals are worked out ──────────────────────────────────────
//
//   computeTotals({
//     subtotal:       1800,            // items × prices (server-verified)
//     shippingMethod: 'delivery' | 'pickup',
//     province:       'Cebu',
//     member:         { tier: 'elite' } | null,
//     code:           discount_codes row | null,
//   })
//   → { subtotal, discountAmount, discountLabel, shippingZone, shippingFee, total, lines: [...] }
//
// Rules, in order:
//   1. Member discount OR voucher — whichever is bigger (they don't stack).
//   2. Shipping: free for pickup, free at/above the threshold, else the zone fee.
//      A 'free_shipping' voucher also zeroes the fee.

const money = (n) => Math.round(Number(n) * 100) / 100;

export function computeTotals({ subtotal, shippingMethod, province, member, code }) {
  subtotal = money(subtotal);

  // Candidate discounts
  let memberAmt = 0, memberLabel = null;
  if (member?.tier && MEMBER_DISCOUNT[member.tier]) {
    memberAmt   = money(subtotal * MEMBER_DISCOUNT[member.tier]);
    memberLabel = `${member.tier === 'elite' ? 'Elite member' : 'Member'} ${Math.round(MEMBER_DISCOUNT[member.tier] * 100)}% off`;
  }

  let codeAmt = 0, codeLabel = null, codeFreeShip = false;
  if (code) {
    if (code.kind === 'percent')       codeAmt = money(subtotal * (Number(code.value) / 100));
    else if (code.kind === 'fixed')    codeAmt = money(Math.min(subtotal, Number(code.value)));
    else if (code.kind === 'free_shipping') codeFreeShip = true;
    codeLabel = `Code ${code.code}`;
  }

  // Best single discount wins (free-shipping codes can ride along with the member discount)
  let discountAmount, discountLabel;
  if (codeAmt > memberAmt) { discountAmount = codeAmt;   discountLabel = codeLabel; }
  else                     { discountAmount = memberAmt; discountLabel = memberLabel; }
  if (codeFreeShip && !discountLabel) discountLabel = codeLabel;

  const afterDiscount = money(subtotal - discountAmount);

  // Shipping
  const isPickup = shippingMethod === 'pickup';
  const zone     = isPickup ? null : zoneForProvince(province);
  let shippingFee = 0;
  if (!isPickup) {
    shippingFee = SHIPPING_ZONES[zone].fee;
    if (afterDiscount >= FREE_SHIPPING_THRESHOLD_PHP || codeFreeShip) shippingFee = 0;
  }

  return {
    subtotal,
    discountAmount,
    discountLabel,
    shippingMethod: isPickup ? 'pickup' : 'delivery',
    shippingZone:   zone,
    shippingZoneLabel: zone ? SHIPPING_ZONES[zone].label : 'Pick up in store',
    shippingDays:   zone ? SHIPPING_ZONES[zone].days : null,
    shippingFee,
    total: money(afterDiscount + shippingFee),
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD_PHP,
  };
}

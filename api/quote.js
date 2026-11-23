// =============================================================================
// /api/quote — "what will this order cost?" for the checkout page
// =============================================================================
// POST body:
//   {
//     items:          [{ variantId, quantity }],
//     shippingMethod: 'delivery' | 'pickup',
//     province:       'Cebu',                 // delivery only
//     discountCode:   'WELCOME10',            // optional
//     phone, email:                           // optional — to spot a store member
//   }
//
// Response:
//   { subtotal, discountAmount, discountLabel, shippingFee, shippingZoneLabel,
//     shippingDays, total, member: { tier } | null,
//     codeError: 'why the code was refused' | null }
//
// This is only a preview. /api/create-payment runs the exact same rules
// again before any money is taken, so the browser can't change the price.
// =============================================================================

import { getUserFromRequest, supabaseAdmin } from './_lib/supabase-admin.js';
import { computeTotals, findMember, checkDiscountCode } from './_lib/pricing.js';
import { allowRequest } from './_lib/ratelimit.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowRequest(req, res, { limit: 60, windowMs: 60_000, key: 'quote' })) return;

  const body  = req.body || {};
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter(i => UUID_RE.test(String(i?.variantId || '')) && Number(i.quantity) > 0);
  if (items.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });

  try {
    const user = await getUserFromRequest(req);

    const ids = [...new Set(items.map(i => String(i.variantId).toLowerCase()))].join(',');
    const variants = await supabaseAdmin(
      `variants?id=in.(${ids})&select=id,price_override,products!inner(base_price,is_active,brands(slug))`
    );

    let subtotal = 0;
    const slugs = new Set();
    for (const it of items) {
      const v = variants.find(x => x.id === String(it.variantId).toLowerCase());
      if (!v || !v.products?.is_active) continue;
      subtotal += Number(v.price_override ?? v.products.base_price) * Math.floor(Number(it.quantity));
      if (v.products.brands?.slug) slugs.add(v.products.brands.slug);
    }
    const brandSlug = slugs.size === 1 ? [...slugs][0] : 'du';

    const member = await findMember({ userId: user?.id, phone: body.phone, email: body.email });

    let code = null, codeError = null;
    if (body.discountCode) {
      const check = await checkDiscountCode(body.discountCode, { subtotal, brandSlug });
      if (check.ok) code = check.row; else codeError = check.reason;
    }

    const totals = computeTotals({
      subtotal,
      shippingMethod: body.shippingMethod === 'pickup' ? 'pickup' : 'delivery',
      province: body.province,
      member, code,
    });

    return res.status(200).json({
      ...totals,
      member:    member ? { tier: member.tier } : null,
      codeApplied: code ? code.code : null,
      codeError,
    });
  } catch (err) {
    console.error('quote error:', err);
    return res.status(500).json({ error: 'Could not work out the total right now.' });
  }
}

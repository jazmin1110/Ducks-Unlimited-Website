// =============================================================================
// /api/create-payment — Create a Supabase order, then start payment
// =============================================================================
// POST body:
//   {
//     items:          [{ variantId, quantity }],
//     customer:       { name, email, phone },
//     shipping:       { address, barangay, city, province, zip },   // delivery only
//     shippingMethod: 'delivery' | 'pickup',
//     pickupStoreId:  '<uuid>',                                      // pickup only
//     paymentMethod:  'maya' | 'cod',
//     discountCode:   'WELCOME10' (optional),
//     notes:          string (optional)
//   }
//
// Response:
//   { orderId, orderNumber, paymentUrl }      → Maya: go to paymentUrl
//   { orderId, orderNumber, paymentUrl: null } → COD: go straight to confirmation
//
// What happens here (server-side, so the browser can't cheat):
//   1. Validate the request
//   2. Merge duplicate lines, re-fetch prices + stock from Supabase
//   3. Work out the totals (member discount, voucher, shipping zone) with
//      the same rules as /api/quote
//   4. Insert the order + order_items with status 'pending'
//   5. Maya  → create a hosted checkout and return its URL.
//      COD   → take the stock now (there's no payment event later), email a
//              confirmation, and return.
//
// Online (Maya) orders only take stock when the payment is confirmed
// (/api/maya-verify or a webhook) — never here — so an abandoned checkout
// doesn't block stock. /api/expire-orders tidies those up.
// =============================================================================

import { getUserFromRequest, supabaseAdmin } from './_lib/supabase-admin.js';
import { createMayaCheckout } from './_lib/maya.js';
import { computeTotals, findMember, checkDiscountCode } from './_lib/pricing.js';
import { sendOrderEmail, sendStaffEmail } from './_lib/email.js';
import { loadOrderForEmail, flagOversold } from './_lib/orders.js';
import { allowRequest } from './_lib/ratelimit.js';

// Which company handles online payments. Maya is the default; set
// PAYMENT_PROVIDER=paymongo in the environment to switch back to PayMongo.
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'maya').toLowerCase();

// ── Input validators ──
const PHONE_RE = /^(?:\+?63|0)9\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validatePayload(body) {
  if (!body) return 'Empty request.';

  const { items, customer, shipping } = body;
  const shippingMethod = body.shippingMethod || 'delivery';
  const paymentMethod  = body.paymentMethod  || 'maya';

  if (!Array.isArray(items) || items.length === 0) return 'Your cart is empty.';
  if (items.length > 50) return 'That is too many different items for one order. Please split it up.';
  for (const it of items) {
    if (!UUID_RE.test(String(it?.variantId || ''))) return 'One of the items in your cart is invalid.';
    const q = Number(it.quantity);
    if (!Number.isInteger(q) || q <= 0 || q > 99) return 'One of the items in your cart has an invalid quantity.';
  }

  if (!customer?.name?.trim())  return 'Please provide your full name.';
  if (!EMAIL_RE.test(customer?.email || '')) return 'Please provide a valid email address.';

  const phoneClean = String(customer?.phone || '').replace(/[\s\-]/g, '');
  if (!PHONE_RE.test(phoneClean)) return 'Please provide a valid Philippine phone number.';

  if (!['delivery', 'pickup'].includes(shippingMethod)) return 'Please choose delivery or pickup.';
  if (!['maya', 'cod'].includes(paymentMethod))         return 'Please choose a payment method.';

  if (shippingMethod === 'delivery') {
    if (!shipping?.address?.trim())  return 'Please provide a shipping address.';
    if (!shipping?.city?.trim())     return 'Please provide a city.';
    if (!shipping?.province?.trim()) return 'Please provide a province.';
    if (!/^\d{4}$/.test(String(shipping?.zip || '').trim())) return 'Please provide a valid 4-digit ZIP code.';
  } else if (!UUID_RE.test(String(body.pickupStoreId || ''))) {
    return 'Please choose a store to pick up from.';
  }

  return null;
}

// Combine repeated variants: [{a,1},{a,2}] → [{a,3}]
function mergeLines(items) {
  const byId = new Map();
  for (const it of items) {
    const id = String(it.variantId).toLowerCase();
    byId.set(id, (byId.get(id) || 0) + Number(it.quantity));
  }
  return [...byId].map(([variantId, quantity]) => ({ variantId, quantity }));
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 10 checkout attempts per minute per IP is plenty for a human
  if (!allowRequest(req, res, { limit: 10, windowMs: 60_000, key: 'checkout' })) return;

  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const { customer, shipping, notes } = req.body;
    const items          = mergeLines(req.body.items);
    const shippingMethod = req.body.shippingMethod || 'delivery';
    const paymentMethod  = req.body.paymentMethod  || 'maya';
    const phoneClean     = String(customer.phone).replace(/[\s\-]/g, '');
    const emailClean     = customer.email.trim().toLowerCase();

    // ── Who is checking out? (guests are fine — user_id stays null) ──
    const user = await getUserFromRequest(req);

    // ── Re-fetch variants: prices + stock come from the database, not the browser ──
    const idsParam = items.map(i => i.variantId).join(',');
    const variants = await supabaseAdmin(
      `variants?id=in.(${idsParam})&select=id,color,size,price_override,products!inner(name,base_price,is_active,brand_id,brands(slug)),inventory(channel,quantity)`
    );

    let subtotal = 0;
    const orderItemsToInsert = [];
    for (const item of items) {
      const v = variants.find(x => x.id === item.variantId);
      if (!v || !v.products?.is_active) {
        return res.status(400).json({ error: 'An item in your cart is no longer available.' });
      }
      const stock = (v.inventory || []).find(i => i.channel === 'online')?.quantity ?? 0;
      if (stock < item.quantity) {
        return res.status(400).json({
          error: `Sorry — only ${stock} of "${v.products.name}" ${stock === 1 ? 'is' : 'are'} in stock. Please update your cart.`,
        });
      }
      const unitPrice = Number(v.price_override ?? v.products.base_price);
      subtotal += unitPrice * item.quantity;
      orderItemsToInsert.push({
        variant_id:        v.id,
        quantity:          item.quantity,
        price_at_purchase: unitPrice,
        brand_id:          v.products.brand_id,
      });
    }

    // ── Which brand is this order for? ──
    // Every order belongs to one brand (it decides the DU-/RW- order number).
    // A bag with both brands is ONE order under Ducks Unlimited; each line
    // still remembers its own brand (order_items.brand_id) for reports.
    const brandIds = [...new Set(orderItemsToInsert.map(oi => oi.brand_id))];
    if (brandIds.some(id => !id)) return res.status(400).json({ error: 'An item in your cart is no longer available.' });
    let brandId   = brandIds[0];
    let brandSlug = variants.find(v => v.products.brand_id === brandId)?.products?.brands?.slug ?? 'du';
    if (brandIds.length > 1) {
      const du = await supabaseAdmin('brands?slug=eq.du&select=id');
      if (!du?.[0]?.id) throw new Error('Ducks Unlimited brand row not found');
      brandId = du[0].id; brandSlug = 'du';
    }

    // ── Pickup store (if chosen) ──
    let store = null;
    if (shippingMethod === 'pickup') {
      const rows = await supabaseAdmin(`stores?id=eq.${req.body.pickupStoreId}&is_active=eq.true&allows_pickup=eq.true&select=id,name,address,city,province`);
      store = rows?.[0];
      if (!store) return res.status(400).json({ error: 'That store is not available for pickup.' });
    }

    // ── Discounts + shipping (same rules as /api/quote) ──
    const member = await findMember({ userId: user?.id, phone: phoneClean, email: emailClean });

    let code = null;
    if (req.body.discountCode) {
      const check = await checkDiscountCode(req.body.discountCode, { subtotal, brandSlug });
      if (!check.ok) return res.status(400).json({ error: check.reason, field: 'discountCode' });
      code = check.row;
    }

    const totals = computeTotals({ subtotal, shippingMethod, province: shipping?.province, member, code });

    // ── Address text ──
    const shippingStr = shippingMethod === 'pickup'
      ? `PICK UP — ${store.name}, ${store.address}, ${store.city}`
      : [
          shipping.address.trim(),
          shipping.barangay?.trim() ? `Brgy. ${shipping.barangay.trim()}` : null,
          shipping.city.trim(), shipping.province.trim(), shipping.zip.trim(),
        ].filter(Boolean).join(', ');

    // ── Insert the order ──
    const orderInsert = await supabaseAdmin('orders', {
      method: 'POST',
      body: JSON.stringify([{
        brand_id:           brandId,
        user_id:            user?.id ?? null,
        customer_name:      customer.name.trim(),
        customer_email:     emailClean,
        customer_phone:     phoneClean,
        shipping_address:   shippingStr,
        shipping_method:    shippingMethod,
        pickup_store_id:    store?.id ?? null,
        shipping_zone:      totals.shippingZone,
        subtotal_amount:    totals.subtotal,
        shipping_fee:       totals.shippingFee,
        discount_amount:    totals.discountAmount,
        discount_label:     totals.discountLabel,
        total_amount:       totals.total,
        payment_method:     paymentMethod,
        payment_provider:   paymentMethod === 'cod' ? null : PAYMENT_PROVIDER,
        payment_status:     'pending',
        fulfillment_status: 'pending',
        customer_notes:     notes?.trim()?.slice(0, 1000) || null,
      }]),
    });
    const order = orderInsert?.[0];
    if (!order?.id) throw new Error('Order insert returned no row');

    await supabaseAdmin('order_items', {
      method: 'POST',
      body: JSON.stringify(orderItemsToInsert.map(oi => ({ ...oi, order_id: order.id }))),
    });

    // Count the voucher use (best effort)
    if (code) {
      await supabaseAdmin(`discount_codes?id=eq.${code.id}`, {
        method: 'PATCH', body: JSON.stringify({ uses: (code.uses || 0) + 1 }),
      }).catch(() => {});
    }

    const siteUrl    = (process.env.SITE_URL || '').replace(/\/$/, '');
    const successUrl = `${siteUrl}/order-confirmation.html?order=${encodeURIComponent(order.order_number)}`;
    const failedUrl  = `${siteUrl}/checkout.html?status=failed`;

    // ═════════════════════════════════════════════════════════════════════
    // CASH ON DELIVERY — no payment page. Take the stock now so the pieces
    // are held for this customer, then email a confirmation.
    // ═════════════════════════════════════════════════════════════════════
    if (paymentMethod === 'cod') {
      const oversold = await supabaseAdmin('rpc/deduct_stock_for_order', {
        method: 'POST', body: JSON.stringify({ p_order_id: order.id }),
      }).catch(err => { console.error('COD stock deduct failed', err); return null; });

      const full = await loadOrderForEmail(order.id);
      if (Array.isArray(oversold) && oversold.length) await flagOversold(full, oversold);
      await sendOrderEmail('placed', full);
      await sendStaffEmail(`New COD order ${order.order_number}`,
        `<p>${full.customer_name} — ₱${Number(full.total_amount).toFixed(2)} — ${shippingMethod === 'pickup' ? 'pickup at ' + store.name : 'deliver to ' + shippingStr}</p>`);

      return res.status(200).json({ orderId: order.id, orderNumber: order.order_number, paymentUrl: null });
    }

    // ═════════════════════════════════════════════════════════════════════
    // MAYA — hosted checkout page
    // ═════════════════════════════════════════════════════════════════════
    if (PAYMENT_PROVIDER === 'maya') {
      const [firstName, ...rest] = customer.name.trim().split(/\s+/);
      const address = shippingMethod === 'pickup'
        ? { line1: store.address, city: store.city, state: store.province || 'Metro Manila', zipCode: '1500', countryCode: 'PH' }
        : { line1: shipping.address.trim(), line2: shipping.barangay?.trim() || '', city: shipping.city.trim(),
            state: shipping.province.trim(), zipCode: shipping.zip.trim(), countryCode: 'PH' };

      let checkout;
      try {
        checkout = await createMayaCheckout({
          referenceNumber: order.id,   // /api/maya-verify checks Maya's reply carries this id
          total:       totals.total,
          shippingFee: totals.shippingFee,
          buyer: {
            firstName, lastName: rest.join(' ') || firstName,
            contact: { email: emailClean, phone: phoneClean },
            billingAddress: address, shippingAddress: address,
          },
          items: [
            ...orderItemsToInsert.map(oi => {
              const v = variants.find(x => x.id === oi.variant_id);
              return {
                name:        [v.products.name, v.color, v.size].filter(Boolean).join(' · '),
                quantity:    oi.quantity,
                amount:      { value: oi.price_at_purchase },
                totalAmount: { value: oi.price_at_purchase * oi.quantity },
              };
            }),
            // Maya wants the line items to add up to the total, so a discount
            // is sent as a negative line.
            ...(totals.discountAmount > 0 ? [{
              name: totals.discountLabel || 'Discount', quantity: 1,
              amount: { value: -totals.discountAmount }, totalAmount: { value: -totals.discountAmount },
            }] : []),
          ],
          redirect: {
            success: `${successUrl}&provider=maya`,
            failure: failedUrl,
            cancel:  `${siteUrl}/checkout.html?status=cancelled`,
          },
        });
      } catch (err) {
        console.error('Maya error:', err);
        await supabaseAdmin(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ payment_status: 'failed' }) }).catch(() => {});
        return res.status(502).json({ error: 'Could not start card payment. Please try again.' });
      }

      if (!checkout?.checkoutId || !checkout?.redirectUrl) throw new Error('Maya response missing checkoutId or redirectUrl');

      await supabaseAdmin(`orders?id=eq.${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_provider: 'maya', payment_reference: checkout.checkoutId }),
      });

      // "We have your order" email — the receipt follows once Maya confirms
      await sendOrderEmail('placed', await loadOrderForEmail(order.id));

      return res.status(200).json({ orderId: order.id, orderNumber: order.order_number, paymentUrl: checkout.redirectUrl });
    }

    // ═════════════════════════════════════════════════════════════════════
    // PAYMONGO (backup provider) — payment link
    // ═════════════════════════════════════════════════════════════════════
    const auth = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');
    let link;
    try {
      const r = await fetch('https://api.paymongo.com/v1/links', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ data: { attributes: {
          amount: Math.round(totals.total * 100),
          description: `Order ${order.order_number}`,
          remarks: `${customer.name.trim()} · ${emailClean}`,
          ...(siteUrl ? { redirect: { success: successUrl, failed: failedUrl } } : {}),
        } } }),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`PayMongo: ${r.status} ${text}`);
      link = JSON.parse(text);
    } catch (err) {
      console.error('PayMongo error:', err);
      await supabaseAdmin(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ payment_status: 'failed' }) }).catch(() => {});
      return res.status(502).json({ error: 'Could not create payment link. Please try again.' });
    }

    const linkId = link?.data?.id, checkoutUrl = link?.data?.attributes?.checkout_url;
    if (!linkId || !checkoutUrl) throw new Error('PayMongo response missing id or checkout_url');

    await supabaseAdmin(`orders?id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ paymongo_payment_id: linkId, payment_provider: 'paymongo', payment_reference: linkId, payment_method: 'paymongo' }),
    });
    await sendOrderEmail('placed', await loadOrderForEmail(order.id));

    return res.status(200).json({ orderId: order.id, orderNumber: order.order_number, paymentUrl: checkoutUrl });

  } catch (err) {
    console.error('create-payment error:', err);
    return res.status(500).json({ error: 'We could not process your order right now. Please try again in a moment.' });
  }
}

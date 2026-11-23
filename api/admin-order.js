// =============================================================================
// /api/admin-order — staff actions on an order
// =============================================================================
// Called by the admin Orders page. Only admins can use it.
//
// POST with header  Authorization: Bearer <admin's access token>
// body: { orderId: "<uuid>", action: ..., ...fields }
//
// Actions:
//   "status"    → { fulfillment: "packed" | "shipped" | "delivered",
//                   trackingNumber, internalNotes }
//                 Saves the status (forward only — the database enforces it),
//                 emails the customer when it becomes "shipped" / ready for
//                 pickup.
//   "cod_paid"  → cash was received for a COD order → payment_status = paid.
//   "cancel"    → { reason, note, refundMethod }
//   "refund"    → { reason, note, refundMethod, amount, items: [...] }
//
// ── How CANCEL works ──
//   Only before the order is shipped (status Pending or Packed).
//   * Stock was taken (paid online, or COD) → every item goes back into
//     ONLINE stock. Otherwise nothing moves.
//   * Paid → the money still owed is refunded with refundMethod.
//
// ── How REFUND works ── (for returns after shipping, or partial refunds)
//   Staff pick which items came back and whether each one goes back in
//   stock (a damaged item shouldn't), and how much money to return.
//
// ── Money ──
//   Maya only allows refunds through code after Maya's Relationship Manager
//   switches it on, so for now:
//   refundMethod "manual"   → staff refund in Maya Manager (Void same day,
//     Refund from the next day), then we record it here.
//   refundMethod "paymongo" → only for OLDER orders paid with PayMongo: we ask
//     PayMongo to send the money back.
//   refundMethod "none"     → no money goes back.
//
// Every cancel/refund is saved in the order_refunds table as history, and the
// customer gets an email.
// =============================================================================

import { supabaseAdmin, getUserFromRequest } from './_lib/supabase-admin.js';
import { loadOrderForEmail, restockItems } from './_lib/orders.js';
import { sendOrderEmail } from './_lib/email.js';

const REASONS = {
  customer_request: 'Customer asked',
  out_of_stock:     'Out of stock',
  damaged:          'Damaged / defective',
  wrong_item:       'Wrong item sent',
  other:            'Other',
};

const CHANNELS = ['online', 'greenhills_store'];

const toCentavos = (pesos) => Math.round(Number(pesos) * 100);
const money      = (n) => Math.round(Number(n) * 100) / 100;
const stampNow   = () => new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

function paymongoAuth() {
  return 'Basic ' + Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');
}

async function findPayMongoPaymentId(order) {
  if (order.provider_payment_id) return order.provider_payment_id;
  const linkId = order.paymongo_payment_id || order.payment_reference;
  if (!linkId) return null;
  const res = await fetch(`https://api.paymongo.com/v1/links/${encodeURIComponent(linkId)}`, {
    headers: { Authorization: paymongoAuth(), Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Could not look up the PayMongo payment (${res.status}).`);
  const link = await res.json();
  const payments = (link?.data?.attributes?.payments || []).map(p => p?.data ?? p);
  const paid = payments.find(p => p?.attributes?.status === 'paid') ?? payments[0];
  return paid?.id || null;
}

async function sendPayMongoRefund({ paymentId, amount, reasonKey, note, orderNumber }) {
  const res = await fetch('https://api.paymongo.com/refunds', {
    method: 'POST',
    headers: { Authorization: paymongoAuth(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ data: { attributes: {
      amount: toCentavos(amount), payment_id: paymentId,
      reason: reasonKey === 'customer_request' ? 'requested_by_customer' : 'others',
      notes: `${orderNumber}: ${REASONS[reasonKey] ?? ''} ${note ?? ''}`.trim().slice(0, 255),
    } } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.errors?.map(e => e.detail).join(' ') || `PayMongo error ${res.status}`);
    err.status = 502;
    throw err;
  }
  return { id: body?.data?.id ?? null, status: body?.data?.attributes?.status ?? null };
}

function reject(res, status, message) {
  return res.status(status).json({ error: message });
}

// Supabase returns Postgres errors as text — pull out the friendly part of
// a "raise exception" from our triggers (e.g. "Orders only move forward…").
function dbMessage(err) {
  const m = String(err?.message || '').match(/"message":"([^"]+)"/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reject(res, 405, 'Method not allowed');
  }

  // ── 1. Who is asking? Must be a signed-in admin. ──
  const user = await getUserFromRequest(req);
  if (!user) return reject(res, 401, 'Please log in again and retry.');
  const admins = await supabaseAdmin(`admin_users?id=eq.${user.id}&select=id`).catch(() => []);
  if (!admins?.length) return reject(res, 403, 'Only admins can change orders.');

  const { orderId, action } = req.body || {};
  if (!orderId || !['status', 'cod_paid', 'cancel', 'refund'].includes(action)) return reject(res, 400, 'Missing order or action.');

  // ── 2. Load the order ──
  let order;
  try {
    const rows = await supabaseAdmin(
      `orders?id=eq.${encodeURIComponent(orderId)}` +
      `&select=id,order_number,total_amount,refunded_amount,payment_status,payment_method,fulfillment_status,shipping_method,` +
      `payment_provider,payment_reference,paymongo_payment_id,provider_payment_id,internal_notes,stock_deducted,tracking_number,` +
      `order_items(variant_id,quantity),order_refunds(items)`
    );
    order = rows?.[0];
  } catch (err) {
    console.error('admin-order: load failed', err);
    return reject(res, 500, 'Could not load the order. Please try again.');
  }
  if (!order) return reject(res, 404, 'Order not found.');

  // ═══════════════════════════════════════════════════════════════════════
  // STATUS — packed / shipped / delivered (+ tracking + staff notes)
  // ═══════════════════════════════════════════════════════════════════════
  if (action === 'status') {
    const fulfillment    = req.body.fulfillment;
    const trackingNumber = String(req.body.trackingNumber ?? '').trim() || null;
    const internalNotes  = String(req.body.internalNotes ?? '').trim() || null;

    if (order.fulfillment_status === 'cancelled') return reject(res, 400, 'This order is cancelled.');
    if (fulfillment && !['pending', 'packed', 'shipped', 'delivered'].includes(fulfillment)) return reject(res, 400, 'Unknown status.');
    if (fulfillment === 'shipped' && order.shipping_method !== 'pickup' && !trackingNumber) {
      return reject(res, 400, 'Please enter a tracking number before marking this order as shipped.');
    }
    if (fulfillment && fulfillment !== 'pending' && order.payment_status !== 'paid' && order.payment_method !== 'cod') {
      return reject(res, 400, 'This order is not paid yet. Wait for the payment before packing it.');
    }

    const patch = { tracking_number: trackingNumber, internal_notes: internalNotes };
    if (fulfillment && fulfillment !== order.fulfillment_status) patch.fulfillment_status = fulfillment;

    try {
      await supabaseAdmin(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    } catch (err) {
      return reject(res, 400, dbMessage(err) || 'Could not save the change.');
    }

    let emailed = false;
    if (patch.fulfillment_status === 'shipped') {
      const full = await loadOrderForEmail(order.id);
      emailed = (await sendOrderEmail('shipped', full)).sent;
    }
    return res.status(200).json({ ok: true, emailed });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COD PAID — cash received at the door / in store
  // ═══════════════════════════════════════════════════════════════════════
  if (action === 'cod_paid') {
    if (order.payment_method !== 'cod') return reject(res, 400, 'Only cash-on-delivery orders can be marked paid here.');
    if (order.payment_status === 'paid') return reject(res, 400, 'Already marked paid.');
    await supabaseAdmin(`orders?id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        payment_status: 'paid',
        cod_paid_at:    new Date().toISOString(),
        internal_notes: [order.internal_notes, `[${stampNow()}] Cash received — marked paid by ${user.email}`].filter(Boolean).join('\n'),
      }),
    });
    return res.status(200).json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CANCEL / REFUND
  // ═══════════════════════════════════════════════════════════════════════
  const { reason, note, refundMethod } = req.body;
  if (!REASONS[reason]) return reject(res, 400, 'Please choose a reason.');
  if (!['paymongo', 'manual', 'none'].includes(refundMethod)) return reject(res, 400, 'Please choose how the money is returned.');

  const isPaid    = order.payment_status === 'paid';
  const stillOwed = money(Number(order.total_amount) - Number(order.refunded_amount || 0));

  // How many of each item can still come back = ordered − already returned
  const remaining = {};
  for (const oi of order.order_items || []) remaining[oi.variant_id] = (remaining[oi.variant_id] || 0) + oi.quantity;
  for (const r of order.order_refunds || []) for (const it of r.items || []) remaining[it.variant_id] = (remaining[it.variant_id] || 0) - it.quantity;

  let items  = [];
  let amount = 0;

  if (action === 'cancel') {
    if (order.fulfillment_status === 'cancelled') return reject(res, 400, 'This order is already cancelled.');
    if (['shipped', 'delivered'].includes(order.fulfillment_status)) {
      return reject(res, 400, 'This order has already been shipped. Use "Return / refund" instead.');
    }
    // Stock goes back only if it was actually taken (paid online, or COD)
    if (order.stock_deducted) {
      items = Object.entries(remaining).filter(([, q]) => q > 0)
        .map(([variant_id, quantity]) => ({ variant_id, quantity, restock_channel: 'online' }));
    }
    if (isPaid) {
      amount = refundMethod === 'none' ? 0 : stillOwed;
    } else if (refundMethod !== 'none') {
      return reject(res, 400, 'This order was never paid, so there is nothing to refund.');
    }
  } else {
    if (!isPaid) return reject(res, 400, 'Only paid orders can be refunded.');
    for (const it of req.body.items || []) {
      const qty = Number(it.quantity);
      if (!qty) continue;
      if (!Number.isInteger(qty) || qty < 0) return reject(res, 400, 'Item quantities must be whole numbers.');
      if (!(it.variantId in remaining)) return reject(res, 400, 'One of the items is not part of this order.');
      if (qty > remaining[it.variantId]) return reject(res, 400, 'You are returning more of an item than is left on the order.');
      if (it.restockChannel != null && !CHANNELS.includes(it.restockChannel)) return reject(res, 400, 'Unknown stock location.');
      items.push({ variant_id: it.variantId, quantity: qty, restock_channel: it.restockChannel ?? null });
    }
    amount = refundMethod === 'none' ? 0 : money(req.body.amount);
    if (!Number.isFinite(amount) || amount < 0) return reject(res, 400, 'Please enter a valid refund amount.');
    if (amount > stillOwed) return reject(res, 400, `You can refund at most ₱${stillOwed.toFixed(2)} on this order.`);
    if (amount === 0 && items.length === 0) return reject(res, 400, 'Choose items to take back, an amount to refund, or both.');
  }

  // ── Send the money back (if asked) — BEFORE changing anything here ──
  let providerRefund = { id: null, status: null };
  if (refundMethod === 'paymongo' && amount > 0) {
    if (order.payment_provider !== 'paymongo' && !order.paymongo_payment_id) {
      return reject(res, 400, 'This order was paid with Maya. Refund it in Maya Manager first, then choose "I refunded it in Maya Manager".');
    }
    if (amount < 1) return reject(res, 400, 'PayMongo refunds must be at least ₱1.00.');
    try {
      const paymentId = await findPayMongoPaymentId(order);
      if (!paymentId) return reject(res, 400, 'Could not find the PayMongo payment for this order. Refund it in the PayMongo dashboard, then choose "I already refunded it".');
      providerRefund = await sendPayMongoRefund({ paymentId, amount, reasonKey: reason, note, orderNumber: order.order_number });
    } catch (err) {
      console.error('admin-order: PayMongo refund failed', err);
      return reject(res, err.status || 502, `PayMongo did not accept the refund: ${err.message}`);
    }
  }

  // ── Save everything: history row, stock, order ──
  try {
    await supabaseAdmin('order_refunds', {
      method: 'POST',
      body: JSON.stringify({
        order_id: order.id, kind: action, amount,
        method: amount > 0 ? refundMethod : 'none',
        reason: REASONS[reason], note: note?.trim() || null,
        provider_refund_id: providerRefund.id, provider_status: providerRefund.status,
        items, created_by: user.id, created_by_email: user.email ?? null,
      }),
    });

    await restockItems(items);

    const line = action === 'cancel'
      ? `[${stampNow()}] Cancelled (${REASONS[reason]})${amount > 0 ? ` — refunded ₱${amount.toFixed(2)} (${refundMethod})` : ''} by ${user.email}`
      : `[${stampNow()}] Refund ₱${amount.toFixed(2)} (${amount > 0 ? refundMethod : 'no money'}), ${items.reduce((n, i) => n + i.quantity, 0)} item(s) returned — ${REASONS[reason]} — by ${user.email}`;

    const patch = {
      refunded_amount: money(Number(order.refunded_amount || 0) + amount),
      internal_notes:  [order.internal_notes, line].filter(Boolean).join('\n'),
    };
    if (action === 'cancel') {
      patch.fulfillment_status = 'cancelled';
      patch.cancelled_at       = new Date().toISOString();
      patch.cancel_reason      = REASONS[reason] + (note?.trim() ? ` — ${note.trim()}` : '');
      if (order.stock_deducted) patch.stock_deducted = false;
    }
    await supabaseAdmin(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  } catch (err) {
    console.error('admin-order: saving failed', err);
    const extra = providerRefund.id
      ? ` The money WAS sent back through PayMongo (refund ${providerRefund.id}) — please add a note on this order.`
      : '';
    return reject(res, 500, `Could not save the change.${extra}`);
  }

  // Tell the customer
  const full = await loadOrderForEmail(order.id);
  await sendOrderEmail(action === 'cancel' ? 'cancelled' : 'refunded', full);

  return res.status(200).json({
    ok: true,
    refunded: amount,
    restocked: items.filter(i => i.restock_channel).reduce((n, i) => n + i.quantity, 0),
    providerRefundId: providerRefund.id,
  });
}

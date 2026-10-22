// =============================================================================
// /api/admin-order — Cancel an order, or refund money / take back items
// =============================================================================
// Called by the admin Orders page. Only admins can use it.
//
// POST with header  Authorization: Bearer <admin's access token>
// body:
//   {
//     orderId:      "<uuid>",
//     action:       "cancel" | "refund",
//     reason:       "customer_request" | "out_of_stock" | "damaged" | "wrong_item" | "other",
//     note:         "free text (optional)",
//     refundMethod: "paymongo" | "manual" | "none",
//     amount:       500,          // pesos to give back (refund action only;
//                                 //  cancel always gives back everything left)
//     items: [                    // refund action only: items that came back
//       { variantId: "<uuid>", quantity: 1, restockChannel: "online" | "greenhills_store" | null }
//     ]
//   }
//
// ── How CANCEL works ──
//   Only before the order is shipped (status Pending or Packed).
//   * Not paid yet → just marked Cancelled. No money, no stock to move
//     (stock is only taken when an order is paid).
//   * Paid → every item goes back into ONLINE stock (that's where it was
//     taken from) and the money still owed is refunded with refundMethod.
//
// ── How REFUND works ── (for returns after shipping, or partial refunds)
//   Staff pick which items came back and whether each one goes back in
//   stock (a damaged item shouldn't), and how much money to return.
//
// ── Money ──
//   The shop takes payments with MAYA. Maya only allows refunds through code
//   after Maya's Relationship Manager switches it on, so for now:
//   refundMethod "manual"   → staff refund in Maya Manager (Void same day,
//     Refund from the next day), then we record it here. This is the normal
//     route for every Maya order.
//   refundMethod "paymongo" → only for OLDER orders paid with PayMongo: we ask
//     PayMongo to send the money back. If PayMongo says no, NOTHING is
//     changed here, and the error is shown to staff.
//   refundMethod "none"     → no money goes back.
//
// Every cancel/refund is saved in the order_refunds table as history.
// =============================================================================

import { supabaseAdmin, getUserFromRequest } from './_lib/supabase-admin.js';

const REASONS = {
  customer_request: 'Customer asked',
  out_of_stock:     'Out of stock',
  damaged:          'Damaged / defective',
  wrong_item:       'Wrong item sent',
  other:            'Other',
};

const CHANNELS = ['online', 'greenhills_store'];

// ₱12.50 → 1250 (PayMongo counts in centavos)
const toCentavos = (pesos) => Math.round(Number(pesos) * 100);

// Round to 2 decimals so 0.1 + 0.2 style float errors never reach the DB
const money = (n) => Math.round(Number(n) * 100) / 100;

function paymongoAuth() {
  return 'Basic ' + Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');
}

// Find the PayMongo payment id (pay_…) for an order. The webhook saves it in
// provider_payment_id; older orders only have the link id, so we ask PayMongo
// for the link and read the payment out of it.
async function findPayMongoPaymentId(order) {
  if (order.provider_payment_id) return order.provider_payment_id;

  const linkId = order.paymongo_payment_id || order.payment_reference;
  if (!linkId) return null;

  const res = await fetch(`https://api.paymongo.com/v1/links/${encodeURIComponent(linkId)}`, {
    headers: { Authorization: paymongoAuth(), Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Could not look up the PayMongo payment (${res.status}).`);
  const link = await res.json();

  // Each entry is a payment; depending on API version it's wrapped in "data"
  const payments = link?.data?.attributes?.payments || [];
  const paid = payments
    .map(p => p?.data ?? p)
    .find(p => p?.attributes?.status === 'paid') ?? payments.map(p => p?.data ?? p)[0];
  return paid?.id || null;
}

// Ask PayMongo to send money back. Returns { id, status } of the refund.
async function sendPayMongoRefund({ paymentId, amount, reasonKey, note, orderNumber }) {
  const res = await fetch('https://api.paymongo.com/refunds', {
    method: 'POST',
    headers: {
      Authorization:  paymongoAuth(),
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount:     toCentavos(amount),
          payment_id: paymentId,
          // PayMongo only accepts these four reasons
          reason:     reasonKey === 'customer_request' ? 'requested_by_customer' : 'others',
          notes:      `${orderNumber}: ${REASONS[reasonKey] ?? ''} ${note ?? ''}`.trim().slice(0, 255),
        },
      },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // PayMongo explains what went wrong in errors[].detail — pass it on to staff
    const detail = body?.errors?.map(e => e.detail).join(' ') || `PayMongo error ${res.status}`;
    const err = new Error(detail);
    err.status = 502;
    throw err;
  }
  return { id: body?.data?.id ?? null, status: body?.data?.attributes?.status ?? null };
}

// Small helper so every "you can't do that" answer looks the same
function reject(res, status, message) {
  return res.status(status).json({ error: message });
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
  if (!admins?.length) return reject(res, 403, 'Only admins can cancel or refund orders.');

  // ── 2. Read and check the request ──
  const { orderId, action, reason, note, refundMethod } = req.body || {};
  if (!orderId || !['cancel', 'refund'].includes(action)) return reject(res, 400, 'Missing order or action.');
  if (!REASONS[reason]) return reject(res, 400, 'Please choose a reason.');
  if (!['paymongo', 'manual', 'none'].includes(refundMethod)) return reject(res, 400, 'Please choose how the money is returned.');

  // ── 3. Load the order, its items, and what was already refunded ──
  let order;
  try {
    const rows = await supabaseAdmin(
      `orders?id=eq.${encodeURIComponent(orderId)}` +
      `&select=id,order_number,total_amount,refunded_amount,payment_status,fulfillment_status,` +
      `payment_provider,payment_reference,paymongo_payment_id,provider_payment_id,internal_notes,` +
      `order_items(variant_id,quantity),order_refunds(items)`
    );
    order = rows?.[0];
  } catch (err) {
    console.error('admin-order: load failed', err);
    return reject(res, 500, 'Could not load the order. Please try again.');
  }
  if (!order) return reject(res, 404, 'Order not found.');

  const isPaid       = order.payment_status === 'paid';
  const stillOwed    = money(Number(order.total_amount) - Number(order.refunded_amount || 0));

  // How many of each item can still come back = ordered − already returned
  const remaining = {};
  for (const oi of order.order_items || []) {
    remaining[oi.variant_id] = (remaining[oi.variant_id] || 0) + oi.quantity;
  }
  for (const r of order.order_refunds || []) {
    for (const it of r.items || []) {
      remaining[it.variant_id] = (remaining[it.variant_id] || 0) - it.quantity;
    }
  }

  // ── 4. Work out what this action does: items back + money back ──
  let items  = [];   // [{ variant_id, quantity, restock_channel }]
  let amount = 0;

  if (action === 'cancel') {
    if (order.fulfillment_status === 'cancelled') return reject(res, 400, 'This order is already cancelled.');
    if (['shipped', 'delivered'].includes(order.fulfillment_status)) {
      return reject(res, 400, 'This order has already been shipped. Use "Return / refund" instead.');
    }

    if (isPaid) {
      // Everything goes back to online stock (that's where the webhook took it from)
      items = Object.entries(remaining)
        .filter(([, qty]) => qty > 0)
        .map(([variant_id, quantity]) => ({ variant_id, quantity, restock_channel: 'online' }));
      amount = refundMethod === 'none' ? 0 : stillOwed;
    } else {
      // Never paid → no stock was taken and there's no money to return
      if (refundMethod !== 'none') return reject(res, 400, 'This order was never paid, so there is nothing to refund.');
    }
  } else {
    // action === 'refund'
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

  // ── 5. Send the money back (if asked) — BEFORE changing anything here ──
  let providerRefund = { id: null, status: null };
  if (refundMethod === 'paymongo' && amount > 0) {
    if (order.payment_provider !== 'paymongo' && !order.paymongo_payment_id) {
      return reject(res, 400, 'This order was paid with Maya. Refund it in Maya Manager first, then choose "I refunded it in Maya Manager".');
    }
    if (amount < 1) return reject(res, 400, 'PayMongo refunds must be at least ₱1.00.');
    try {
      const paymentId = await findPayMongoPaymentId(order);
      if (!paymentId) return reject(res, 400, 'Could not find the PayMongo payment for this order. Refund it in the PayMongo dashboard, then choose "I already refunded it".');
      providerRefund = await sendPayMongoRefund({
        paymentId, amount, reasonKey: reason, note, orderNumber: order.order_number,
      });
    } catch (err) {
      console.error('admin-order: PayMongo refund failed', err);
      return reject(res, err.status || 502, `PayMongo did not accept the refund: ${err.message}`);
    }
  }

  // ── 6. Save everything: history row, stock, order ──
  // If any of this fails AFTER PayMongo already sent money, tell staff the
  // refund id so they can fix the record by hand.
  try {
    await supabaseAdmin('order_refunds', {
      method: 'POST',
      body: JSON.stringify({
        order_id:           order.id,
        kind:               action,
        amount,
        method:             amount > 0 ? refundMethod : 'none',
        reason:             REASONS[reason],
        note:               note?.trim() || null,
        provider_refund_id: providerRefund.id,
        provider_status:    providerRefund.status,
        items,
        created_by:         user.id,
        created_by_email:   user.email ?? null,
      }),
    });

    // Put returned items back in stock (one safe step each — see adjust_stock)
    for (const it of items) {
      if (!it.restock_channel) continue;
      await supabaseAdmin('rpc/adjust_stock', {
        method: 'POST',
        body: JSON.stringify({ p_variant_id: it.variant_id, p_channel: it.restock_channel, p_delta: it.quantity }),
      });
    }

    // Update the order itself, and leave a line in the staff notes
    const stamp = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
    const line  = action === 'cancel'
      ? `[${stamp}] Cancelled (${REASONS[reason]})${amount > 0 ? ` — refunded ₱${amount.toFixed(2)} (${refundMethod})` : ''} by ${user.email}`
      : `[${stamp}] Refund ₱${amount.toFixed(2)} (${amount > 0 ? refundMethod : 'no money'}), ${items.reduce((n, i) => n + i.quantity, 0)} item(s) returned — ${REASONS[reason]} — by ${user.email}`;

    const patch = {
      refunded_amount: money(Number(order.refunded_amount || 0) + amount),
      internal_notes:  [order.internal_notes, line].filter(Boolean).join('\n'),
    };
    if (action === 'cancel') {
      patch.fulfillment_status = 'cancelled';
      patch.cancelled_at       = new Date().toISOString();
      patch.cancel_reason      = REASONS[reason] + (note?.trim() ? ` — ${note.trim()}` : '');
    }
    await supabaseAdmin(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  } catch (err) {
    console.error('admin-order: saving failed', err);
    const extra = providerRefund.id
      ? ` The money WAS sent back through PayMongo (refund ${providerRefund.id}) — please add a note on this order.`
      : '';
    return reject(res, 500, `Could not save the change.${extra}`);
  }

  return res.status(200).json({
    ok: true,
    refunded: amount,
    restocked: items.filter(i => i.restock_channel).reduce((n, i) => n + i.quantity, 0),
    providerRefundId: providerRefund.id,
  });
}

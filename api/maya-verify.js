// =============================================================================
// /api/maya-verify — ask Maya whether an order was paid, and record it
// =============================================================================
// POST body:  { orderNumber: "DU-00012" }
// Response:   { paymentStatus: "paid" | "pending" | "failed" }
//
// Called by /order-confirmation.html when Maya sends the shopper back
// (?provider=maya). Safe to call as often as you like:
//   * the result comes from Maya's servers (using our SECRET key), never
//     from the browser, so nobody can fake a payment by calling this;
//   * an order that is already 'paid' is never processed twice.
//
// TODO before going live: also add a Maya webhook (Maya Manager → Webhooks,
// event PAYMENT_SUCCESS) that runs the same markPaid() logic, in case a
// shopper closes the tab before the confirmation page loads.
// =============================================================================

import { supabaseAdmin } from './_lib/supabase-admin.js';
import { getMayaCheckout, isMayaSandbox } from './_lib/maya.js';

// Accepts "DU-00012", "du00012", "DU 12" → "DU-00012" (same as track-order)
function normalizeOrderNumber(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^([A-Z]{2})-?(\d{1,10})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(5, '0')}`;
}

// Mark the order paid, then take the items out of online stock.
async function markPaid(order) {
  const sandbox = isMayaSandbox();

  await supabaseAdmin(`orders?id=eq.${order.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      payment_status: 'paid',
      // Label sandbox orders so nobody ships a test order by mistake
      ...(sandbox ? {
        internal_notes: ['[MAYA SANDBOX TEST: not a real payment, do not ship]', order.internal_notes]
          .filter(Boolean).join('\n'),
      } : {}),
    }),
  });

  // Sandbox payments aren't real money, so leave the real stock alone.
  if (sandbox) return;

  for (const oi of (order.order_items || [])) {
    const rows = await supabaseAdmin(
      `inventory?variant_id=eq.${oi.variant_id}&channel=eq.online&select=id,quantity`
    );
    if (!rows?.[0]) continue;
    await supabaseAdmin(`inventory?id=eq.${rows[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: Math.max(0, rows[0].quantity - oi.quantity) }),
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orderNumber = normalizeOrderNumber(req.body?.orderNumber);
  if (!orderNumber) return res.status(400).json({ error: 'Invalid order number.' });

  try {
    const orders = await supabaseAdmin(
      `orders?order_number=eq.${encodeURIComponent(orderNumber)}` +
      `&select=id,total_amount,payment_status,payment_reference,internal_notes,order_items(variant_id,quantity)`
    );
    const order = orders?.[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Already done — nothing to check
    if (order.payment_status === 'paid') return res.status(200).json({ paymentStatus: 'paid' });

    // The Maya checkout id was saved on the order by create-payment.js
    if (!order.payment_reference) return res.status(200).json({ paymentStatus: 'pending' });
    const checkout = await getMayaCheckout(order.payment_reference);

    // Only count it as paid if Maya says so, for THIS order, for the full amount
    const paid =
      checkout.paymentStatus === 'PAYMENT_SUCCESS' &&
      checkout.requestReferenceNumber === order.id &&
      Math.abs(Number(checkout.totalAmount?.amount ?? checkout.totalAmount?.value) - Number(order.total_amount)) < 0.01;

    if (paid) {
      await markPaid(order);
      return res.status(200).json({ paymentStatus: 'paid' });
    }

    const failed = ['PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'PAYMENT_CANCELLED', 'VOIDED']
      .includes(checkout.paymentStatus);
    return res.status(200).json({ paymentStatus: failed ? 'failed' : 'pending' });

  } catch (err) {
    console.error('maya-verify error:', err);
    return res.status(500).json({ error: 'Could not check the payment right now.' });
  }
}

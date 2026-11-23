// =============================================================================
// /api/maya-verify — ask Maya whether an order was paid, and record it
// =============================================================================
// POST body:  { orderNumber: "DU-00012" }
// Response:   { paymentStatus: "paid" | "pending" | "failed" | "cod" }
//
// Called by /order-confirmation.html when Maya sends the shopper back
// (?provider=maya), and by the "Check again" button. Safe to call as often
// as you like:
//   * the result comes from Maya's servers (using our SECRET key), never
//     from the browser, so nobody can fake a payment by calling this;
//   * an order that is already 'paid' is never processed twice
//     (markOrderPaid checks).
//
// TODO before going live (waiting on Maya for production keys): also add a
// Maya webhook (Maya Manager → Webhooks, event PAYMENT_SUCCESS) that calls
// markOrderPaid(), in case a shopper closes the tab before this page loads.
// Until then, /api/expire-orders re-checks Maya for every stale pending order.
// =============================================================================

import { supabaseAdmin } from './_lib/supabase-admin.js';
import { getMayaCheckout, isMayaSandbox } from './_lib/maya.js';
import { markOrderPaid } from './_lib/orders.js';
import { allowRequest } from './_lib/ratelimit.js';

function normalizeOrderNumber(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^([A-Z]{2})-?(\d{1,10})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(5, '0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowRequest(req, res, { limit: 30, windowMs: 60_000, key: 'verify' })) return;

  const orderNumber = normalizeOrderNumber(req.body?.orderNumber);
  if (!orderNumber) return res.status(400).json({ error: 'Invalid order number.' });

  try {
    const orders = await supabaseAdmin(
      `orders?order_number=eq.${encodeURIComponent(orderNumber)}` +
      `&select=id,total_amount,payment_status,payment_method,payment_reference`
    );
    const order = orders?.[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (order.payment_status === 'paid')   return res.status(200).json({ paymentStatus: 'paid' });
    if (order.payment_method === 'cod')    return res.status(200).json({ paymentStatus: 'cod' });
    if (order.payment_status === 'expired') return res.status(200).json({ paymentStatus: 'failed' });

    // The Maya checkout id was saved on the order by create-payment.js
    if (!order.payment_reference) return res.status(200).json({ paymentStatus: 'pending' });
    const checkout = await getMayaCheckout(order.payment_reference);

    // Only count it as paid if Maya says so, for THIS order, for the full amount
    const paid =
      checkout.paymentStatus === 'PAYMENT_SUCCESS' &&
      checkout.requestReferenceNumber === order.id &&
      Math.abs(Number(checkout.totalAmount?.amount ?? checkout.totalAmount?.value) - Number(order.total_amount)) < 0.01;

    if (paid) {
      await markOrderPaid(order.id, { sandbox: isMayaSandbox() });
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

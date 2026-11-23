// =============================================================================
// /api/cancel-order — a customer cancels their own order
// =============================================================================
// POST body: { orderNumber: "DU-00012", email: "juan@example.com", reason: "..." }
// Signed-in customers can also send their token; guests prove ownership
// with the email used at checkout (same rule as /api/track-order).
//
// Allowed only while the order is still 'pending' (not packed yet). Paid
// orders that are cancelled need a refund, which staff do in Maya Manager;
// the order is flagged for them.
// =============================================================================

import { supabaseAdmin, getUserFromRequest } from './_lib/supabase-admin.js';
import { loadOrderForEmail, restockItems } from './_lib/orders.js';
import { sendOrderEmail, sendStaffEmail } from './_lib/email.js';
import { allowRequest } from './_lib/ratelimit.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOrderNumber(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^([A-Z]{2})-?(\d{1,10})$/);
  return m ? `${m[1]}-${m[2].padStart(5, '0')}` : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowRequest(req, res, { limit: 10, windowMs: 60_000, key: 'cancel' })) return;

  const orderNumber = normalizeOrderNumber(req.body?.orderNumber);
  const email       = String(req.body?.email || '').trim().toLowerCase();
  const reason      = String(req.body?.reason || '').trim().slice(0, 300);
  if (!orderNumber || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Order number and email are required.' });

  try {
    const rows = await supabaseAdmin(
      `orders?order_number=eq.${encodeURIComponent(orderNumber)}&customer_email=eq.${encodeURIComponent(email)}` +
      `&select=id,user_id,payment_status,payment_method,fulfillment_status,stock_deducted,internal_notes,order_items(variant_id,quantity)&limit=1`
    );
    const order = rows?.[0];
    if (!order) return res.status(404).json({ error: "We couldn't find an order with that number and email." });

    // If the order belongs to an account, the request must come from that account
    if (order.user_id) {
      const user = await getUserFromRequest(req);
      if (!user || user.id !== order.user_id) return res.status(403).json({ error: 'Please sign in to cancel this order.' });
    }

    if (order.fulfillment_status === 'cancelled') return res.status(400).json({ error: 'This order is already cancelled.' });
    if (order.fulfillment_status !== 'pending') {
      return res.status(400).json({ error: 'This order is already being packed. Please contact us and we will sort it out.' });
    }
    if (order.payment_status === 'expired') return res.status(400).json({ error: 'This order already expired.' });

    const isPaid = order.payment_status === 'paid';
    const stamp  = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
    const line   = `[${stamp}] Cancelled by the customer${reason ? ` — ${reason}` : ''}` +
                   (isPaid ? ' — ⚠ PAID: refund the customer in Maya Manager, then record it (Return / refund).' : '');

    await supabaseAdmin(`orders?id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fulfillment_status: 'cancelled',
        cancelled_at:  new Date().toISOString(),
        cancel_reason: `Customer cancelled${reason ? `: ${reason}` : ''}`,
        internal_notes: [order.internal_notes, line].filter(Boolean).join('\n'),
      }),
    });

    // Give the stock back if it had been taken (paid online, or COD)
    if (order.stock_deducted) {
      await restockItems((order.order_items || []).map(oi => ({ ...oi, restock_channel: 'online' })));
      await supabaseAdmin(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ stock_deducted: false }) });
    }

    // History row so it shows up with the other cancels/refunds
    await supabaseAdmin('order_refunds', {
      method: 'POST',
      body: JSON.stringify({
        order_id: order.id, kind: 'cancel', amount: 0, method: 'none',
        reason: 'Customer asked', note: reason || 'Cancelled from My Orders',
        items: order.stock_deducted ? (order.order_items || []).map(oi => ({ variant_id: oi.variant_id, quantity: oi.quantity, restock_channel: 'online' })) : [],
        created_by_email: email,
      }),
    }).catch(() => {});

    const full = await loadOrderForEmail(order.id);
    await sendOrderEmail('cancelled', full);
    if (isPaid) await sendStaffEmail(`⚠ ${orderNumber} cancelled by customer — refund needed`, `<p>${line}</p>`);

    return res.status(200).json({ ok: true, needsRefund: isPaid });
  } catch (err) {
    console.error('cancel-order error:', err);
    return res.status(500).json({ error: 'Could not cancel the order right now. Please contact us.' });
  }
}

// =============================================================================
// Order helpers shared by the /api functions
// =============================================================================
//   loadOrderForEmail(orderId)  → the order with items, brand and pickup store,
//                                 in the shape sendOrderEmail() expects
//   markOrderPaid(orderId)      → marks it paid, takes the stock (once), emails
//                                 the customer. Safe to call twice.
//   restockOrder(order, items)  → puts items back after a cancel/return
// =============================================================================

import { supabaseAdmin } from './supabase-admin.js';
import { sendOrderEmail, sendStaffEmail } from './email.js';
import { isMayaSandbox } from './maya.js';

export const ORDER_EMAIL_SELECT =
  'id,order_number,customer_name,customer_email,customer_phone,shipping_address,' +
  'total_amount,subtotal_amount,shipping_fee,discount_amount,discount_label,' +
  'payment_status,payment_method,fulfillment_status,shipping_method,tracking_number,' +
  'customer_notes,internal_notes,refunded_amount,cancel_reason,stock_deducted,' +
  'brands(slug,name),stores(name,address,city),' +
  'order_items(variant_id,quantity,price_at_purchase,variants(color,size,products(name)))';

export async function loadOrderForEmail(orderId) {
  const rows = await supabaseAdmin(`orders?id=eq.${orderId}&select=${ORDER_EMAIL_SELECT}`);
  return rows?.[0] || null;
}

// ── Mark paid ────────────────────────────────────────────────────────────────
// Called by /api/maya-verify, the PayMongo webhook, and the admin "cash
// received" button for COD. Returns the final order row.
//
//   * Already paid → nothing happens (so a retry never double-counts stock).
//   * Paid after staff cancelled it → recorded as paid, stock left alone, and
//     a loud note is added so staff refund the customer.
//   * Otherwise → payment_status = 'paid', stock taken out of 'online' in one
//     database call (deduct_stock_for_order), then a receipt email.
//
// opts.sandbox  → true for Maya sandbox payments: label the order and DON'T
//                 touch real stock.
export async function markOrderPaid(orderId, { sandbox = false, providerPaymentId = null } = {}) {
  const order = await loadOrderForEmail(orderId);
  if (!order) throw new Error(`markOrderPaid: order ${orderId} not found`);
  if (order.payment_status === 'paid') return order;

  const patch = { payment_status: 'paid' };
  if (providerPaymentId) patch.provider_payment_id = providerPaymentId;

  if (order.fulfillment_status === 'cancelled') {
    patch.internal_notes = [order.internal_notes,
      '⚠ PAID AFTER THIS ORDER WAS CANCELLED — refund the customer, then record it (Orders → Return / refund).']
      .filter(Boolean).join('\n');
    await supabaseAdmin(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    await sendStaffEmail(`⚠ ${order.order_number} paid after cancel`,
      `<p>Order ${order.order_number} was paid after it was cancelled. Please refund the customer.</p>`);
    return { ...order, ...patch };
  }

  if (sandbox) {
    patch.internal_notes = ['[MAYA SANDBOX TEST: not a real payment, do not ship]', order.internal_notes]
      .filter(Boolean).join('\n');
  }

  await supabaseAdmin(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify(patch) });

  // Take the stock — once. (COD orders already took it at checkout.)
  if (!sandbox && !order.stock_deducted) {
    const oversold = await supabaseAdmin('rpc/deduct_stock_for_order', {
      method: 'POST', body: JSON.stringify({ p_order_id: order.id }),
    }).catch(err => { console.error('deduct_stock_for_order failed', err); return null; });

    if (Array.isArray(oversold) && oversold.length) {
      await flagOversold(order, oversold);
    }
  }

  const fresh = await loadOrderForEmail(order.id);
  await sendOrderEmail('paid', fresh);
  return fresh;
}

// Something was sold that wasn't really in stock (two shoppers paid for the
// last piece). Tell staff instead of hiding it.
export async function flagOversold(order, oversold) {
  const lines = oversold.map(o => `variant ${o.variant_id}: wanted ${o.wanted}, had ${o.had}`).join('; ');
  const note  = `⚠ OVERSOLD — ${lines}. Contact the customer before packing.`;
  await supabaseAdmin(`orders?id=eq.${order.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ internal_notes: [order.internal_notes, note].filter(Boolean).join('\n') }),
  }).catch(() => {});
  await sendStaffEmail(`⚠ ${order.order_number} oversold`, `<p>${note}</p>`);
}

// Put items back into stock (cancel / return). items = [{ variant_id, quantity, restock_channel }]
export async function restockItems(items) {
  for (const it of items) {
    if (!it.restock_channel || !it.quantity) continue;
    await supabaseAdmin('rpc/adjust_stock', {
      method: 'POST',
      body: JSON.stringify({ p_variant_id: it.variant_id, p_channel: it.restock_channel, p_delta: it.quantity }),
    });
  }
}

export { isMayaSandbox };

// =============================================================================
// /api/track-order — Look up one order by order number + email
// =============================================================================
// Used by:
//   * /track-order.html         → guests checking on an order without an account
//   * /order-confirmation.html  → the "thank you" page Maya sends people to
//
// POST body:
//   { orderNumber: "DU-00012", email: "juan@example.com", claim: false }
//
// Both the order number AND the email must match — knowing just one isn't
// enough (order numbers are sequential, so they're easy to guess).
//
// claim: true  → if the request also carries a signed-in customer's token and
//                the order isn't linked to an account yet, link it to theirs.
//                This is how a guest order gets added to "My Orders" later.
//
// The response only contains what a customer needs to see. Staff notes,
// payment IDs and the full street address are never returned.
// =============================================================================

import { supabaseAdmin, getUserFromRequest } from './_lib/supabase-admin.js';
import { allowRequest } from './_lib/ratelimit.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts "DU-00012", "du00012", "DU 12" → "DU-00012"
function normalizeOrderNumber(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^([A-Z]{2})-?(\d{1,10})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(5, '0')}`;
}

// "Unit 4, 12 Ortigas Ave, Brgy. Greenhills, San Juan, Metro Manila, 1502"
//   → "San Juan, Metro Manila, 1502"
// Hides the street line so a lookup never reveals someone's exact address.
function maskAddress(full) {
  const parts = String(full || '').split(',').map(p => p.trim()).filter(Boolean);
  return parts.slice(-3).join(', ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // 20 lookups a minute per IP — stops someone guessing order numbers
  if (!allowRequest(req, res, { limit: 20, windowMs: 60_000, key: 'track' })) return;

  const orderNumber = normalizeOrderNumber(req.body?.orderNumber);
  const email       = String(req.body?.email || '').trim().toLowerCase();
  const claim       = req.body?.claim === true;

  if (!orderNumber)          return res.status(400).json({ error: 'Please enter a valid order number, like DU-00012.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter the email you used at checkout.' });

  // Same message for "no such order" and "wrong email" so this endpoint can't
  // be used to discover which order numbers exist.
  const NOT_FOUND = { error: "We couldn't find an order with that number and email. Please check both and try again." };

  try {
    const rows = await supabaseAdmin(
      `orders?order_number=eq.${encodeURIComponent(orderNumber)}` +
      `&customer_email=eq.${encodeURIComponent(email)}` +
      `&select=id,order_number,user_id,customer_name,shipping_address,total_amount,` +
      `payment_status,payment_method,fulfillment_status,shipping_method,tracking_number,created_at,` +
      `paid_at,packed_at,shipped_at,delivered_at,refunded_amount,` +
      `subtotal_amount,shipping_fee,discount_amount,discount_label,customer_notes,stores(name,address,city),` +
      `order_items(quantity,price_at_purchase,variants(color,size,products(id,name,product_images(image_url,is_primary,display_order))))` +
      `&limit=1`
    );

    const order = rows?.[0];
    if (!order) return res.status(404).json(NOT_FOUND);

    // ── Optional: add this guest order to the signed-in customer's account ──
    let linkedToYou = false;
    if (claim) {
      const user = await getUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Please sign in first.' });

      // Only the person who owns the checkout email may add the order to their
      // account. Without this, anyone who knew an order number and the buyer's
      // email could claim it and then see the buyer's address and phone.
      if (String(user.email || '').trim().toLowerCase() !== email) {
        return res.status(403).json({
          error: 'This order was placed with a different email from the one on your account, so it can’t be added here.',
        });
      }

      if (order.user_id && order.user_id !== user.id) {
        return res.status(409).json({ error: 'This order is already linked to another account.' });
      }
      if (!order.user_id) {
        await supabaseAdmin(`orders?id=eq.${order.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ user_id: user.id }),
        });
      }
      linkedToYou = true;
    } else {
      const user = await getUserFromRequest(req);
      linkedToYou = !!(user && order.user_id === user.id);
    }

    return res.status(200).json({
      order: {
        orderNumber:       order.order_number,
        firstName:         String(order.customer_name || '').split(' ')[0],
        shipTo:            maskAddress(order.shipping_address),
        total:             Number(order.total_amount),
        subtotal:          order.subtotal_amount != null ? Number(order.subtotal_amount) : null,
        shippingFee:       Number(order.shipping_fee ?? 0),
        discountAmount:    Number(order.discount_amount ?? 0),
        discountLabel:     order.discount_label || null,
        paymentStatus:     order.payment_status,
        paymentMethod:     order.payment_method || 'maya',
        fulfillmentStatus: order.fulfillment_status,
        shippingMethod:    order.shipping_method || 'delivery',
        pickupStore:       order.stores ? { name: order.stores.name, address: order.stores.address, city: order.stores.city } : null,
        customerNotes:     order.customer_notes || null,
        canCancel:         order.fulfillment_status === 'pending' && !['expired', 'failed'].includes(order.payment_status),
        trackingNumber:    order.tracking_number,
        createdAt:         order.created_at,
        paidAt:            order.paid_at,
        packedAt:          order.packed_at,
        shippedAt:         order.shipped_at,
        deliveredAt:       order.delivered_at,
        refundedAmount:    Number(order.refunded_amount ?? 0),
        hasAccount:        !!order.user_id,
        linkedToYou,
        items: (order.order_items || []).map(it => {
          const v = it.variants || {};
          const p = v.products || {};
          const imgs = (p.product_images || [])
            .sort((a, b) => (b.is_primary - a.is_primary) || (a.display_order - b.display_order));
          return {
            name:     p.name || 'Item',
            productId: p.id || null,
            color:    v.color || null,
            size:     v.size || null,
            quantity: it.quantity,
            price:    Number(it.price_at_purchase),
            image:    imgs[0]?.image_url || null,
          };
        }),
      },
    });
  } catch (err) {
    console.error('track-order error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
}

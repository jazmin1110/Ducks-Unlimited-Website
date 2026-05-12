// =============================================================================
// /api/create-payment — Create a Supabase order + PayMongo payment link
// =============================================================================
// POST body:
//   {
//     items:    [{ variantId, quantity }],
//     customer: { name, email, phone },
//     shipping: { address, city, province, zip },
//     notes:    string (optional)
//   }
//
// Response:
//   { orderId, orderNumber, paymentUrl }
//
// This function runs server-side on Vercel. It:
//   1. Validates the request body
//   2. Re-fetches variant prices + stock from Supabase (frontend can't be trusted)
//   3. Creates an order + order_items rows with status 'pending'
//   4. Creates a PayMongo payment link
//   5. Stores the PayMongo link id on the order so the webhook can match later
//   6. Returns the PayMongo checkout URL
//
// Inventory is NOT decremented here — that happens only after the webhook
// confirms successful payment.
// =============================================================================

const SHIPPING_FEE_PHP = 150;

// Centavos — PayMongo amounts are in the smallest currency unit (1 PHP = 100 centavos)
function toCentavos(amount) {
  return Math.round(Number(amount) * 100);
}

// ── Helper: call Supabase REST API with the service-role key ──
// We use the service-role key (not anon) because the webhook + create-payment
// both need to bypass RLS to write to orders/inventory.
async function supabase(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── Helper: create a PayMongo payment link ──
async function createPayMongoLink({ amount, description, remarks, redirect }) {
  const auth = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');

  const body = {
    data: {
      attributes: {
        amount: toCentavos(amount),
        description,
        remarks: remarks || '',
        // /v1/links sometimes ignores redirect — PayMongo's dashboard global
        // setting is the more reliable way to redirect users. We pass it
        // anyway so newer API versions can pick it up.
        ...(redirect ? { redirect } : {}),
      },
    },
  };

  const res = await fetch('https://api.paymongo.com/v1/links', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`PayMongo: ${res.status} ${text}`);
  return JSON.parse(text);
}

// ── Input validators ──
const PHONE_RE = /^(?:\+?63|0)9\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePayload(body) {
  if (!body) return 'Empty request.';

  const { items, customer, shipping } = body;

  if (!Array.isArray(items) || items.length === 0) return 'Your cart is empty.';
  for (const it of items) {
    if (!it?.variantId || !Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0) {
      return 'One of the items in your cart is invalid.';
    }
  }

  if (!customer?.name?.trim())  return 'Please provide your full name.';
  if (!EMAIL_RE.test(customer?.email || '')) return 'Please provide a valid email address.';

  const phoneClean = String(customer?.phone || '').replace(/[\s\-]/g, '');
  if (!PHONE_RE.test(phoneClean)) return 'Please provide a valid Philippine phone number.';

  if (!shipping?.address?.trim()) return 'Please provide a shipping address.';
  if (!shipping?.city?.trim())    return 'Please provide a city.';
  if (!shipping?.province?.trim()) return 'Please provide a province.';
  if (!/^\d{4}$/.test(String(shipping?.zip || '').trim())) return 'Please provide a valid 4-digit ZIP code.';

  return null;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Validate ──
  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const { items, customer, shipping, notes } = req.body;

    // ── Re-fetch variants for authoritative pricing + stock check ──
    // Building the IN filter for the REST API:
    //   variants?id=in.(uuid1,uuid2)
    const idsParam = items.map(i => i.variantId).join(',');
    const variants = await supabase(
      `variants?id=in.(${idsParam})&select=id,color,size,price_override,products!inner(base_price,is_active),inventory(channel,quantity)`
    );

    // Every item must resolve to an active variant with enough stock
    let subtotal = 0;
    const orderItemsToInsert = [];

    for (const item of items) {
      const v = variants.find(x => x.id === item.variantId);

      if (!v) {
        return res.status(400).json({ error: 'An item in your cart is no longer available.' });
      }
      if (!v.products?.is_active) {
        return res.status(400).json({ error: 'An item in your cart is no longer available.' });
      }

      // Check online inventory
      const onlineRow = (v.inventory || []).find(i => i.channel === 'online');
      const stock = onlineRow?.quantity ?? 0;
      if (stock < item.quantity) {
        return res.status(400).json({
          error: `Sorry — only ${stock} of one item is in stock. Please update your cart.`,
        });
      }

      const unitPrice = Number(v.price_override ?? v.products.base_price);
      subtotal += unitPrice * item.quantity;

      orderItemsToInsert.push({
        variant_id:        v.id,
        quantity:          Number(item.quantity),
        price_at_purchase: unitPrice,
      });
    }

    const shippingFee = SHIPPING_FEE_PHP;
    const total = subtotal + shippingFee;

    // ── Combine shipping fields into the single shipping_address column ──
    const shippingStr = [
      shipping.address.trim(),
      shipping.city.trim(),
      shipping.province.trim(),
      shipping.zip.trim(),
    ].filter(Boolean).join(', ');

    // ── Insert the order (status pending) ──
    // The DB trigger auto-generates order_number as DU-00001, etc.
    const orderInsert = await supabase('orders', {
      method: 'POST',
      body: JSON.stringify([{
        customer_name:      customer.name.trim(),
        customer_email:     customer.email.trim().toLowerCase(),
        customer_phone:     String(customer.phone).replace(/[\s\-]/g, ''),
        shipping_address:   shippingStr,
        total_amount:       total,
        payment_status:     'pending',
        fulfillment_status: 'pending',
        internal_notes:     notes?.trim() || null,
      }]),
    });

    const order = orderInsert?.[0];
    if (!order?.id) throw new Error('Order insert returned no row');

    // ── Insert order_items rows linked to the new order ──
    await supabase('order_items', {
      method: 'POST',
      body: JSON.stringify(
        orderItemsToInsert.map(oi => ({ ...oi, order_id: order.id }))
      ),
    });

    // ── Create the PayMongo payment link ──
    const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
    const successUrl = `${siteUrl}/order-confirmation.html?order=${encodeURIComponent(order.order_number)}`;
    const failedUrl  = `${siteUrl}/checkout.html?status=failed`;

    let paymongoLink;
    try {
      paymongoLink = await createPayMongoLink({
        amount:      total,
        description: `Ducks Unlimited Order ${order.order_number}`,
        remarks:     `${customer.name.trim()} · ${customer.email.trim()}`,
        redirect:    siteUrl ? { success: successUrl, failed: failedUrl } : undefined,
      });
    } catch (err) {
      console.error('PayMongo error:', err);
      // The order exists but no payment link could be created. Mark it failed.
      await supabase(`orders?id=eq.${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_status: 'failed' }),
      }).catch(() => {});
      return res.status(502).json({ error: 'Could not create payment link. Please try again.' });
    }

    const linkId      = paymongoLink?.data?.id;
    const checkoutUrl = paymongoLink?.data?.attributes?.checkout_url;
    if (!linkId || !checkoutUrl) {
      throw new Error('PayMongo response missing id or checkout_url');
    }

    // ── Store the link id on the order so the webhook can match it back ──
    await supabase(`orders?id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ paymongo_payment_id: linkId }),
    });

    return res.status(200).json({
      orderId:     order.id,
      orderNumber: order.order_number,
      paymentUrl:  checkoutUrl,
    });

  } catch (err) {
    console.error('create-payment error:', err);
    return res.status(500).json({
      error: 'We could not process your order right now. Please try again in a moment.',
    });
  }
}

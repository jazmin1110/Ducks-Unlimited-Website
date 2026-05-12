// =============================================================================
// /api/paymongo-webhook — receive payment confirmations from PayMongo
// =============================================================================
// This is the critical file — inventory only decrements when this webhook
// confirms a successful payment.
//
// Setup (in the PayMongo dashboard → Developers → Webhooks):
//   1. Add webhook URL:  https://<your-domain>/api/paymongo-webhook
//   2. Subscribe to events: link.payment.paid (and optionally payment.paid)
//   3. Copy the webhook signing secret into PAYMONGO_WEBHOOK_SECRET env var
//
// Flow:
//   1. PayMongo POSTs the event to this endpoint
//   2. We verify the HMAC signature
//   3. For successful payment events, we find the matching order by the
//      PayMongo link id we stored when the order was created
//   4. Update payment_status to 'paid'
//   5. Decrement online inventory for each line item
// =============================================================================

import crypto from 'crypto';

// Tell Vercel NOT to auto-parse the body — we need the raw bytes to verify
// the HMAC signature byte-for-byte against what PayMongo sent.
export const config = {
  api: { bodyParser: false },
};

// ─────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────

// Read the raw request body as a UTF-8 string
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// Verify the PayMongo signature header. PayMongo sends:
//   paymongo-signature: t=<timestamp>,te=<test-sig>,li=<live-sig>
// Each signature is HMAC-SHA256 of `${timestamp}.${rawBody}` with the secret.
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',')
      .map(p => {
        const idx = p.indexOf('=');
        return idx === -1 ? null : [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
      })
      .filter(Boolean)
  );

  const timestamp = parts.t;
  // Live signatures are 'li', test/sandbox are 'te'. We accept either.
  const provided = parts.li || parts.te;
  if (!timestamp || !provided) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // Constant-time comparison to avoid timing attacks
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false;
  }
}

// Talk to Supabase REST API with the service-role key (bypasses RLS)
async function supabase(path, options = {}) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
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

// Walk the webhook payload to find the PayMongo link id this event refers to.
// The shape varies between event types — we check the most common paths.
function extractLinkId(event) {
  const attrs = event?.data?.attributes;
  const inner = attrs?.data?.attributes;

  // link.payment.paid: data.attributes.data IS the link object
  if (attrs?.type === 'link.payment.paid') {
    return attrs?.data?.id || null;
  }

  // payment.paid: the payment object has a source with the link id
  if (attrs?.type === 'payment.paid') {
    return inner?.source?.id || attrs?.data?.id || null;
  }

  // Fallback — try the most likely paths
  return inner?.source?.id || attrs?.data?.id || null;
}

// ─────────────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Read raw body (needed for signature verification) ──
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('Webhook: failed to read body', err);
    return res.status(400).json({ error: 'Could not read body' });
  }

  // ── 2. Verify signature ──
  const signature = req.headers['paymongo-signature'];
  const valid = verifySignature(rawBody, signature, process.env.PAYMONGO_WEBHOOK_SECRET);

  if (!valid) {
    console.warn('Webhook: signature verification FAILED');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ── 3. Parse the event ──
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = event?.data?.attributes?.type;

  // We only care about successful payments. Always ACK other events with 200
  // so PayMongo doesn't retry them.
  const interesting = ['link.payment.paid', 'payment.paid'];
  if (!interesting.includes(eventType)) {
    return res.status(200).json({ received: true, ignored: eventType });
  }

  const linkId = extractLinkId(event);
  if (!linkId) {
    console.warn('Webhook: could not extract link id from event', eventType);
    return res.status(200).json({ received: true, error: 'no link id' });
  }

  // ── 4. Find the matching order ──
  let order;
  try {
    const orders = await supabase(
      `orders?paymongo_payment_id=eq.${encodeURIComponent(linkId)}` +
      `&select=id,payment_status,order_items(variant_id,quantity)`
    );
    order = orders?.[0];
  } catch (err) {
    console.error('Webhook: order lookup failed', err);
    // Return 500 so PayMongo retries — this is a transient failure
    return res.status(500).json({ error: 'order lookup failed' });
  }

  if (!order) {
    console.warn(`Webhook: no order found for PayMongo link ${linkId}`);
    return res.status(200).json({ received: true, error: 'order not found' });
  }

  // ── 5. Idempotency: skip if already processed ──
  // PayMongo may resend webhooks. If the order is already paid, decrementing
  // inventory again would double-count.
  if (order.payment_status === 'paid') {
    return res.status(200).json({ received: true, already_processed: true });
  }

  try {
    // ── 6. Mark the order as paid ──
    await supabase(`orders?id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ payment_status: 'paid' }),
    });

    // ── 7. Decrement online inventory for each line item ──
    // We do this AFTER marking paid so re-running this block (in case of a
    // retry that lost connection mid-loop) is gated by the payment_status
    // idempotency check above.
    for (const oi of (order.order_items || [])) {
      // Fetch current quantity, then subtract.
      // PostgREST doesn't support atomic decrement via REST, so we read-then-write.
      // Race condition window is tiny for typical store traffic; for higher
      // scale, define a Postgres function and call it via .rpc instead.
      const rows = await supabase(
        `inventory?variant_id=eq.${oi.variant_id}&channel=eq.online&select=id,quantity`
      );

      if (!rows?.[0]) {
        console.warn(`Webhook: no online inventory row for variant ${oi.variant_id}`);
        continue;
      }

      const newQty = Math.max(0, rows[0].quantity - oi.quantity);
      await supabase(`inventory?id=eq.${rows[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: newQty }),
      });
    }

    return res.status(200).json({ received: true, processed: true });

  } catch (err) {
    console.error('Webhook: processing failed', err);
    // Return 500 so PayMongo retries. The idempotency check protects against
    // double-processing if the retry succeeds.
    return res.status(500).json({ error: 'processing failed' });
  }
}

// =============================================================================
// Maya Checkout helpers (credit/debit cards via Maya Business)
// =============================================================================
// Maya hosts the card form for us: we create a "checkout", send the shopper
// to the redirectUrl Maya gives back, and Maya sends them back to our site
// when they finish (or cancel).
//
// Environment variables:
//   MAYA_ENV         'sandbox' (default) or 'production'
//   MAYA_PUBLIC_KEY  pk-...  used to CREATE checkouts
//   MAYA_SECRET_KEY  sk-...  used to READ payment results (server only!)
//
// Sandbox keys + test cards: https://developers.maya.ph/reference/sandbox-credentials-and-cards
// The sandbox keys are shared by every developer, so never put real data in it.
// =============================================================================

// Sandbox and live Maya use different servers
export function mayaBaseUrl() {
  return process.env.MAYA_ENV === 'production'
    ? 'https://pg.maya.ph'
    : 'https://pg-sandbox.paymaya.com';
}

export function isMayaSandbox() {
  return process.env.MAYA_ENV !== 'production';
}

// Maya uses HTTP Basic auth: the key is the username, the password is empty.
function basicAuth(key) {
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

// ── Create a hosted checkout page ──
// referenceNumber: our own unique id for this payment (we use the order's
//                  UUID — sandbox keys are shared, so "DU-00001" could clash
//                  with someone else's test).
// Returns { checkoutId, redirectUrl }.
export async function createMayaCheckout({ referenceNumber, total, shippingFee, items, buyer, redirect }) {
  const body = {
    totalAmount: {
      value:    Number(total.toFixed(2)),
      currency: 'PHP',
      details:  { shippingFee: Number(shippingFee.toFixed(2)), subtotal: Number((total - shippingFee).toFixed(2)) },
    },
    buyer,
    items,
    redirectUrl: redirect, // { success, failure, cancel }
    requestReferenceNumber: referenceNumber,
  };

  const res = await fetch(`${mayaBaseUrl()}/checkout/v1/checkouts`, {
    method:  'POST',
    headers: {
      'Authorization': basicAuth(process.env.MAYA_PUBLIC_KEY),
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Maya checkout: ${res.status} ${text}`);
  return JSON.parse(text);
}

// ── Look up the payments made for one of our reference numbers ──
// Returns an array of Maya payment objects (usually 0 or 1). A successful
// card payment has status 'PAYMENT_SUCCESS'.
export async function getMayaPaymentsByReference(referenceNumber) {
  const res = await fetch(
    `${mayaBaseUrl()}/payments/v1/payment-rrns/${encodeURIComponent(referenceNumber)}`,
    {
      headers: {
        'Authorization': basicAuth(process.env.MAYA_SECRET_KEY),
        'Accept':        'application/json',
      },
    }
  );

  // 404 just means "no payment has been made for this reference yet"
  if (res.status === 404) return [];

  const text = await res.text();
  if (!res.ok) throw new Error(`Maya payment lookup: ${res.status} ${text}`);
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [data];
}

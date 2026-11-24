// =============================================================================
// Transactional emails — receipts, "shipped", cancellations
// =============================================================================
// Sent through Resend (https://resend.com) with plain fetch — no packages.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY   re_xxx            (from resend.com → API Keys)
//   EMAIL_FROM       "Ducks Unlimited <orders@yourdomain.ph>"
//                    Resend must have verified that domain first. While
//                    testing you can use onboarding@resend.dev, which only
//                    delivers to the email on your Resend account.
//   EMAIL_BCC        (optional) a staff inbox that gets a copy of every email
//
// If RESEND_API_KEY is not set, nothing is sent and the email is only logged.
// The shop keeps working either way — an email that fails never fails an order.
//
// Usage:
//   import { sendOrderEmail } from './_lib/email.js';
//   await sendOrderEmail('paid', order);     // 'placed' | 'paid' | 'shipped' | 'cancelled' | 'refunded'
// =============================================================================

const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Make customer-typed text safe to put inside an email's HTML.
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function siteUrl() {
  return (process.env.SITE_URL || 'https://ducks-unlimited-website.vercel.app').replace(/\/$/, '');
}

// Which brand the email speaks as. Mixed bags are Ducks Unlimited orders.
function brandOf(order) {
  const slug = order.brands?.slug || (String(order.order_number || '').startsWith('RW') ? 'rw' : 'du');
  return slug === 'rw'
    ? { name: 'Rocwood',         color: '#1F2A44', accent: '#8C6B3F' }
    : { name: 'Ducks Unlimited', color: '#1B4D2E', accent: '#C9A84C' };
}

// ── Build the message for each event ─────────────────────────────────────────

function itemsTable(order) {
  const rows = (order.order_items || []).map(it => {
    const v = it.variants || {};
    const name = v.products?.name || 'Item';
    const meta = [v.color, v.size].filter(Boolean).join(' · ');
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;">${esc(name)}<br><span style="color:#777;font-size:13px;">${esc(meta)} × ${it.quantity}</span></td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${peso(Number(it.price_at_purchase) * it.quantity)}</td>
    </tr>`;
  }).join('');

  const subtotal = order.subtotal_amount ?? (order.order_items || []).reduce((s, it) => s + Number(it.price_at_purchase) * it.quantity, 0);
  const discount = Number(order.discount_amount || 0);
  const shipping = Number(order.shipping_fee || 0);

  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
    ${rows}
    <tr><td style="padding:8px 0;color:#777;">Subtotal</td><td style="text-align:right;">${peso(subtotal)}</td></tr>
    ${discount > 0 ? `<tr><td style="padding:4px 0;color:#777;">${esc(order.discount_label || 'Discount')}</td><td style="text-align:right;">− ${peso(discount)}</td></tr>` : ''}
    <tr><td style="padding:4px 0;color:#777;">${order.shipping_method === 'pickup' ? 'Pick up in store' : 'Shipping'}</td><td style="text-align:right;">${shipping > 0 ? peso(shipping) : 'Free'}</td></tr>
    <tr><td style="padding:10px 0;font-weight:bold;border-top:2px solid #333;">Total</td><td style="padding:10px 0;font-weight:bold;border-top:2px solid #333;text-align:right;">${peso(order.total_amount)}</td></tr>
  </table>`;
}

function deliveryBlock(order) {
  if (order.shipping_method === 'pickup') {
    const s = order.stores;
    return `<p style="margin:0;"><strong>Pick up at:</strong> ${esc(s?.name || 'our store')}${s?.address ? `<br>${esc(s.address)}${s.city ? ', ' + esc(s.city) : ''}` : ''}</p>
      <p style="color:#777;font-size:13px;">We'll email you when it's ready. Please bring a valid ID and your order number.</p>`;
  }
  return `<p style="margin:0;"><strong>Ship to:</strong> ${esc(order.customer_name)}<br>${esc(order.shipping_address)}</p>`;
}

const FIRST = (order) => esc(String(order.customer_name || '').split(' ')[0] || 'there');

function buildMessage(kind, order) {
  const b = brandOf(order);
  const trackUrl = `${siteUrl()}/track-order.html?order=${encodeURIComponent(order.order_number)}`;
  const isCod = order.payment_method === 'cod';

  const templates = {
    placed: {
      subject: `Order ${order.order_number} received`,
      title:   `Thanks, ${FIRST(order)} — we have your order.`,
      body:    isCod
        ? `<p>We'll start preparing it now. Please have <strong>${peso(order.total_amount)}</strong> ready in cash ${order.shipping_method === 'pickup' ? 'when you pick it up' : 'for the courier'}.</p>`
        : `<p>We're waiting for your payment to clear. If you've already paid, you'll get a second email once Maya confirms it.</p>`,
    },
    paid: {
      subject: `Payment received for ${order.order_number}`,
      title:   `Thank you, ${FIRST(order)}. Your payment is confirmed.`,
      body:    `<p>We're getting your order ready. You'll hear from us again when it ${order.shipping_method === 'pickup' ? 'is ready for pickup' : 'ships'}.</p>`,
    },
    shipped: {
      subject: order.shipping_method === 'pickup'
        ? `${order.order_number} is ready for pickup`
        : `${order.order_number} is on its way`,
      title: order.shipping_method === 'pickup'
        ? `Your order is ready, ${FIRST(order)}.`
        : `Your order has shipped, ${FIRST(order)}.`,
      body: order.shipping_method === 'pickup'
        ? `<p>Drop by any time during store hours.</p>`
        : `<p>${order.tracking_number
            ? `Tracking number: <strong style="font-family:monospace;">${esc(order.tracking_number)}</strong>${trackingLink(order.tracking_number)}`
            : 'Your parcel has been handed to the courier.'}</p>`,
    },
    cancelled: {
      subject: `Order ${order.order_number} cancelled`,
      title:   `Your order has been cancelled.`,
      body:    `<p>${esc(order.cancel_reason || '')}</p>${Number(order.refunded_amount) > 0 ? `<p>A refund of <strong>${peso(order.refunded_amount)}</strong> has been arranged. Card refunds usually show up within 5–10 banking days.</p>` : ''}<p>If this is a mistake, just reply to this email.</p>`,
    },
    refunded: {
      subject: `Refund on order ${order.order_number}`,
      title:   `We've recorded a refund on your order.`,
      body:    `<p>Refunded so far: <strong>${peso(order.refunded_amount)}</strong> of ${peso(order.total_amount)}. Card refunds usually show up within 5–10 banking days.</p>`,
    },
  };

  const t = templates[kind];
  if (!t) throw new Error(`Unknown email kind: ${kind}`);

  const html = `<!doctype html><html><body style="margin:0;background:#F5F0E8;font-family:Helvetica,Arial,sans-serif;color:#1A1A1A;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <div style="background:${b.color};color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;">
        <div style="font-size:18px;letter-spacing:.12em;text-transform:uppercase;">${esc(b.name)}</div>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;">
        <h1 style="font-size:22px;margin:0 0 8px;">${t.title}</h1>
        <p style="color:#777;margin:0 0 16px;">Order <strong style="color:#1A1A1A;">${esc(order.order_number)}</strong></p>
        ${t.body}
        <div style="margin:20px 0;">${itemsTable(order)}</div>
        <div style="background:#F5F0E8;padding:14px 16px;border-radius:6px;margin-bottom:20px;">${deliveryBlock(order)}</div>
        ${order.customer_notes ? `<p style="color:#777;font-size:13px;">Your note: “${esc(order.customer_notes)}”</p>` : ''}
        <p><a href="${trackUrl}" style="display:inline-block;background:${b.color};color:#fff;text-decoration:none;padding:12px 22px;border-radius:4px;">Track your order</a></p>
        <p style="color:#777;font-size:12px;margin-top:28px;">Questions? Reply to this email or message us on Facebook. ${esc(b.name)} · Greenhills, San Juan, Metro Manila</p>
      </div>
    </div>
  </body></html>`;

  const text = `${t.title}\nOrder ${order.order_number}\nTotal ${peso(order.total_amount)}\nTrack: ${trackUrl}`;
  return { subject: `${t.subject} — ${b.name}`, html, text };
}

// Turn a tracking number into a courier link when we can guess the courier.
function trackingLink(num) {
  const n = String(num).trim().toUpperCase();
  let url = null;
  if (/^JNT|^JT|^\d{12}$/.test(n))      url = `https://www.jtexpress.ph/trajectoryQuery?waybillNo=${encodeURIComponent(n)}`;
  else if (/^LBC|^\d{12,14}$/.test(n))   url = `https://www.lbcexpress.com/track/?tracking_no=${encodeURIComponent(n)}`;
  else if (/^SPX|^PH\d/.test(n))         url = `https://spx.ph/track?${encodeURIComponent(n)}`;
  return url ? ` — <a href="${url}">track the parcel</a>` : '';
}

// ── Send ─────────────────────────────────────────────────────────────────────

// `order` must include: order_number, customer_name, customer_email,
// shipping_address, total_amount, and order_items(…variants(products(name)))
// — see loadOrderForEmail() in ./orders.js.
export async function sendOrderEmail(kind, order) {
  if (!order?.customer_email) return { sent: false, reason: 'no email' };

  let msg;
  try { msg = buildMessage(kind, order); }
  catch (err) { console.error('email: could not build', err); return { sent: false, reason: err.message }; }

  const key  = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Ducks Unlimited <onboarding@resend.dev>';

  if (!key) {
    console.log(`[email not sent — RESEND_API_KEY missing] to=${order.customer_email} subject="${msg.subject}"`);
    return { sent: false, reason: 'RESEND_API_KEY not set' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to:   [order.customer_email],
        ...(process.env.EMAIL_BCC ? { bcc: [process.env.EMAIL_BCC] } : {}),
        reply_to: process.env.EMAIL_REPLY_TO || undefined,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      console.error('email: Resend refused', res.status, await res.text());
      return { sent: false, reason: `Resend ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('email: send failed', err);
    return { sent: false, reason: err.message };
  }
}

// A short note to staff (new order, low stock, oversold). Goes to EMAIL_BCC
// or EMAIL_STAFF if set; otherwise just logged.
export async function sendStaffEmail(subject, bodyHtml) {
  const key = process.env.RESEND_API_KEY;
  const to  = process.env.EMAIL_STAFF || process.env.EMAIL_BCC;
  if (!key || !to) { console.log(`[staff email skipped] ${subject}`); return { sent: false }; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Ducks Unlimited <onboarding@resend.dev>',
        to: [to], subject, html: bodyHtml,
      }),
    });
    return { sent: res.ok };
  } catch { return { sent: false }; }
}

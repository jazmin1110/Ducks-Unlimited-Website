// =============================================================================
// Shared code for every /account/* page
// =============================================================================
// One place for the things all account pages need, so each page stays short:
//
//   initAccountPage('orders')  → checks sign-in, draws the account menu,
//                                shows the "please sign in" panel if needed.
//                                Returns the user, or null if signed out.
//   escapeHtml, formatPrice, formatDate, formatDateTime
//   orderFromRow(row)          → turns a Supabase `orders` row into the same
//                                shape /api/track-order returns
//   orderStatus(order)         → { key, label } for the coloured status pill
//   renderTimeline(order)      → HTML for the Placed → Paid → Packed →
//                                Shipped → Delivered progress tracker
//   renderOrderItems(items)    → HTML list of items with thumbnails
//
// Usage on a page:
//   import { initAccountPage } from '/js/account.js';
//   const user = await initAccountPage('orders');
//   if (user) { ...load the page... }
// =============================================================================

import { getCurrentUser, signOut, onAuthChange } from '/js/auth.js';

// ── Account menu ────────────────────────────────────────────────────────────
// Order = order shown in the menu. `key` matches what each page passes in.

const NAV_ITEMS = [
  { key: 'overview',  label: 'Overview',          href: '/account/' },
  { key: 'orders',    label: 'Orders & Tracking', href: '/account/orders.html' },
  { key: 'wishlist',  label: 'Wishlist',          href: '/account/wishlist.html' },
  { key: 'addresses', label: 'Addresses',         href: '/account/addresses.html' },
  { key: 'profile',   label: 'Account Details',   href: '/account/profile.html' },
];

function renderNav(activeKey) {
  const el = document.querySelector('[data-account-nav]');
  if (!el) return;

  el.innerHTML = `
    <ul class="account-nav__list">
      ${NAV_ITEMS.map(item => `
        <li>
          <a class="account-nav__link${item.key === activeKey ? ' is-active' : ''}"
             href="${item.href}"
             ${item.key === activeKey ? 'aria-current="page"' : ''}>${item.label}</a>
        </li>
      `).join('')}
      <li class="account-nav__help">
        <a class="account-nav__link" href="/customer-service/help.html">Help &amp; Contact</a>
      </li>
      <li>
        <button type="button" class="account-nav__link account-nav__signout" data-sign-out>Sign Out</button>
      </li>
    </ul>
  `;

  el.querySelector('[data-sign-out]').addEventListener('click', async () => {
    await signOut();
    window.location.href = '/';
  });

  // On phones the menu is a sideways-scrolling row — make sure the current
  // tab is visible instead of hidden off to the right.
  el.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// ── Signed-out panel ────────────────────────────────────────────────────────
// Each page can customise the message with data attributes on #signedOutView:
//   <div id="signedOutView" data-title="Your orders" data-text="Sign in to…">

function renderSignedOut() {
  const out = document.getElementById('signedOutView');
  if (!out) return;

  const next  = encodeURIComponent(window.location.pathname + window.location.search);
  const title = out.dataset.title || 'Sign in to your account';
  const text  = out.dataset.text  || 'Track orders, save addresses for faster checkout, and keep a wishlist across devices.';

  out.innerHTML = `
    <div class="signed-out-gate__panel">
      <p class="eyebrow">My Account</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="signed-out-gate__sub">${escapeHtml(text)}</p>
      <div class="signed-out-gate__actions">
        <a class="btn btn-primary"      href="/auth/sign-in.html?next=${next}">Sign In</a>
        <a class="btn btn-outline-dark" href="/auth/sign-up.html?next=${next}">Create Account</a>
      </div>
      <p class="signed-out-gate__track">
        Checked out as a guest? <a href="/track-order.html">Track your order</a>
      </p>
    </div>
  `;
}

export async function initAccountPage(activeKey) {
  const inView  = document.getElementById('signedInView');
  const outView = document.getElementById('signedOutView');

  const user = await getCurrentUser();

  if (!user) {
    renderSignedOut();
    if (inView)  inView.hidden  = true;
    if (outView) outView.hidden = false;
    return null;
  }

  renderNav(activeKey);
  if (inView)  inView.hidden  = false;
  if (outView) outView.hidden = true;

  // If the customer signs out in another tab, don't leave their details on
  // screen here.
  onAuthChange((u) => { if (!u) window.location.reload(); });

  return user;
}

// ── Formatting helpers ──────────────────────────────────────────────────────

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatPrice(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ── Orders ──────────────────────────────────────────────────────────────────

// Supabase row (snake_case, nested joins) → the flat shape used everywhere.
export function orderFromRow(o) {
  return {
    id:                o.id,
    orderNumber:       o.order_number,
    total:             Number(o.total_amount),
    paymentStatus:     o.payment_status,
    fulfillmentStatus: o.fulfillment_status,
    trackingNumber:    o.tracking_number,
    shippingAddress:   o.shipping_address,
    createdAt:         o.created_at,
    paidAt:            o.paid_at,
    packedAt:          o.packed_at,
    shippedAt:         o.shipped_at,
    deliveredAt:       o.delivered_at,
    refundedAmount:    Number(o.refunded_amount ?? 0),
    items: (o.order_items || []).map(it => {
      const v = it.variants || {};
      const p = v.products || {};
      const imgs = [...(p.product_images || [])]
        .sort((a, b) => (b.is_primary - a.is_primary) || (a.display_order - b.display_order));
      return {
        name:      p.name || 'Item',
        productId: p.id || null,
        color:     v.color || null,
        size:      v.size || null,
        quantity:  it.quantity,
        price:     Number(it.price_at_purchase),
        image:     imgs[0]?.image_url || null,
      };
    }),
  };
}

// The `select` string account pages use to load orders with everything above.
export const ORDER_SELECT = `
  id, order_number, payment_status, fulfillment_status, tracking_number,
  shipping_address, total_amount, created_at,
  paid_at, packed_at, shipped_at, delivered_at, refunded_amount,
  order_items (
    quantity, price_at_purchase,
    variants ( color, size, products ( id, name, product_images ( image_url, is_primary, display_order ) ) )
  )
`;

// One label for the pill, based on both lifecycle columns.
export function orderStatus(o) {
  // Cancelled wins over everything else (uses the red "failed" pill style)
  if (o.fulfillmentStatus === 'cancelled') return { key: 'failed', label: o.refundedAmount > 0 ? 'Cancelled · Refunded' : 'Cancelled' };
  if (o.paymentStatus === 'failed')  return { key: 'failed',  label: 'Payment not completed' };
  if (o.paymentStatus === 'pending') return { key: 'pending', label: 'Awaiting payment' };
  switch (o.fulfillmentStatus) {
    case 'packed':    return { key: 'packed',    label: 'Packed' };
    case 'shipped':   return { key: 'shipped',   label: 'On the way' };
    case 'delivered': return { key: 'delivered', label: 'Delivered' };
    default:          return { key: 'paid',      label: 'Preparing your order' };
  }
}

// What the customer should expect next — shown under the timeline.
function nextStepText(o) {
  if (o.fulfillmentStatus === 'cancelled') {
    return o.refundedAmount > 0
      ? `This order was cancelled and ${formatPrice(o.refundedAmount)} was refunded to you. It can take a few days to show, depending on your bank or e-wallet.`
      : 'This order was cancelled. If you have questions, please contact us.';
  }
  if (o.refundedAmount > 0) {
    return `We refunded ${formatPrice(o.refundedAmount)} on this order. It can take a few days to show, depending on your bank or e-wallet.`;
  }
  if (o.paymentStatus === 'failed')
    return "Your payment didn't go through, so this order won't be shipped. You can place it again from your cart.";
  if (o.paymentStatus === 'pending')
    return "We haven't received your payment yet. If you already paid, it can take a few minutes to show here.";
  switch (o.fulfillmentStatus) {
    case 'pending':   return "Payment received. We're getting your pieces ready — we'll update this page when it ships.";
    case 'packed':    return 'Your order is packed and waiting for the courier.';
    case 'shipped':   return o.trackingNumber
                        ? 'Your order is with the courier. Use the tracking number below on the courier\'s website.'
                        : 'Your order is with the courier. A tracking number will appear here soon.';
    case 'delivered': return 'Delivered. We hope you love it! Something not right? See our returns policy.';
    default:          return '';
  }
}

export function renderTimeline(o) {
  const failed = o.paymentStatus === 'failed';
  const steps = [
    { label: 'Order placed', at: o.createdAt,   done: true },
    { label: 'Paid',         at: o.paidAt,      done: o.paymentStatus === 'paid' },
    { label: 'Packed',       at: o.packedAt,    done: ['packed', 'shipped', 'delivered'].includes(o.fulfillmentStatus) && o.paymentStatus === 'paid' },
    { label: 'Shipped',      at: o.shippedAt,   done: ['shipped', 'delivered'].includes(o.fulfillmentStatus) && o.paymentStatus === 'paid' },
    { label: 'Delivered',    at: o.deliveredAt, done: o.fulfillmentStatus === 'delivered' && o.paymentStatus === 'paid' },
  ];
  // The first step that isn't done yet is the "current" one
  const currentIdx = steps.findIndex(s => !s.done);

  const tracking = o.trackingNumber ? `
    <div class="order-tracking">
      <span class="order-tracking__label">Tracking number</span>
      <span class="order-tracking__value">
        <code>${escapeHtml(o.trackingNumber)}</code>
        <button type="button" class="order-tracking__copy" data-copy="${escapeHtml(o.trackingNumber)}">Copy</button>
      </span>
    </div>` : '';

  return `
    <ol class="timeline${failed ? ' timeline--failed' : ''}">
      ${steps.map((s, i) => `
        <li class="timeline__step${s.done ? ' is-done' : ''}${i === currentIdx && !failed ? ' is-current' : ''}">
          <span class="timeline__dot" aria-hidden="true"></span>
          <span class="timeline__label">${s.label}</span>
          <span class="timeline__date">${s.done && s.at ? escapeHtml(formatDate(s.at)) : ''}</span>
        </li>
      `).join('')}
    </ol>
    <p class="timeline__next">${escapeHtml(nextStepText(o))}</p>
    ${tracking}
  `;
}

// Wire up any "Copy" buttons for tracking numbers inside `root`.
export function wireCopyButtons(root = document) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    } catch { /* clipboard blocked — the number is still visible to copy by hand */ }
  });
}

export function renderOrderItems(items) {
  return `
    <ul class="order-lines">
      ${items.map(it => {
        const meta = [it.color, it.size && `Size ${it.size}`, `Qty ${it.quantity}`].filter(Boolean).join(' · ');
        const img  = it.image
          ? `<img src="${escapeHtml(it.image)}" alt="" loading="lazy" />`
          : '';
        const name = it.productId
          ? `<a href="/product.html?id=${encodeURIComponent(it.productId)}">${escapeHtml(it.name)}</a>`
          : escapeHtml(it.name);
        return `
          <li class="order-line">
            <div class="order-line__img">${img}</div>
            <div class="order-line__info">
              <div class="order-line__name">${name}</div>
              <div class="order-line__meta">${escapeHtml(meta)}</div>
            </div>
            <div class="order-line__price">${formatPrice(it.price * it.quantity)}</div>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

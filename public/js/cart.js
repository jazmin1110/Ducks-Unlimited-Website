// =============================================================================
// Ducks Unlimited — Shopping Cart
// =============================================================================
// Manages the customer's cart using localStorage. The cart survives page
// reloads and syncs across tabs.
//
// Import in your page:
//   <script type="module">
//     import { addToCart, getCart, getCartCount } from '/js/cart.js';
//     ...
//   </script>
//
// Any element with `data-cart-count` will automatically display the current
// item count and update when the cart changes — no extra wiring needed.
// =============================================================================

const STORAGE_KEY = 'du-cart';

// ─────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────

// Read the cart from localStorage, returning [] on missing/corrupted data
function readCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // localStorage data was corrupted — start fresh
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

// Persist the cart and broadcast a change event so the UI can react
function writeCart(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart:change', { detail: { items } }));
}

// Coerce a value to a non-negative integer, returning 0 for invalid input
function toCount(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}


// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Add a variant to the cart. If the variant is already in the cart, the
 * quantity is added to the existing line. Optional `details` object is
 * cached on the line so the cart page can render without an extra DB
 * lookup — the cart page should still re-verify prices at checkout time.
 *
 * @param {string} variantId
 * @param {number} quantity
 * @param {object} [details]  Optional: { productName, variantLabel, sku, price, imageUrl }
 */
export function addToCart(variantId, quantity, details = {}) {
  const qty = toCount(quantity);
  if (!variantId || qty <= 0) return;

  const cart = readCart();
  const existing = cart.find(item => item.variantId === variantId);

  if (existing) {
    existing.quantity += qty;
    // Refresh cached details if newer info is passed in (e.g. price changed)
    if (details.price        !== undefined) existing.price        = Number(details.price) || 0;
    if (details.productName)               existing.productName  = details.productName;
    if (details.variantLabel)              existing.variantLabel = details.variantLabel;
    if (details.sku)                       existing.sku          = details.sku;
    if (details.imageUrl)                  existing.imageUrl     = details.imageUrl;
  } else {
    cart.push({
      variantId,
      quantity:     qty,
      productName:  details.productName  || '',
      variantLabel: details.variantLabel || '',
      sku:          details.sku          || '',
      price:        Number(details.price) || 0,
      imageUrl:     details.imageUrl     || '',
      addedAt:      new Date().toISOString(),
    });
  }

  writeCart(cart);
}

/**
 * Remove a variant from the cart entirely.
 */
export function removeFromCart(variantId) {
  writeCart(readCart().filter(item => item.variantId !== variantId));
}

/**
 * Set the quantity of a variant. A quantity of 0 removes the item.
 */
export function updateQuantity(variantId, quantity) {
  const qty = toCount(quantity);
  if (qty <= 0) {
    removeFromCart(variantId);
    return;
  }
  const cart = readCart();
  const item = cart.find(i => i.variantId === variantId);
  if (item) {
    item.quantity = qty;
    writeCart(cart);
  }
}

/**
 * Return the current cart as an array. Always returns a fresh array — safe
 * to mutate without affecting the stored cart.
 */
export function getCart() {
  return readCart();
}

/**
 * Total number of items across all lines (sum of quantities).
 */
export function getCartCount() {
  return readCart().reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Total price across all lines, using each item's cached price.
 * Prices may be stale — re-verify at checkout against the database.
 */
export function getCartTotal() {
  return readCart().reduce(
    (sum, item) => sum + (Number(item.price) || 0) * item.quantity,
    0
  );
}

/**
 * Empty the cart.
 */
export function clearCart() {
  writeCart([]);
}


// ─────────────────────────────────────────────────────────────────────
// Auto-sync UI elements
// Any element with [data-cart-count] gets the count automatically.
// Add the `has-items` class when count > 0 so CSS can show/hide the badge.
// ─────────────────────────────────────────────────────────────────────

function updateCartBadges() {
  const count = getCartCount();
  document.querySelectorAll('[data-cart-count]').forEach(el => {
    el.textContent = count;
    el.classList.toggle('has-items', count > 0);
  });
}

// Local changes within this tab
window.addEventListener('cart:change', updateCartBadges);

// Cross-tab sync — fires when ANOTHER tab modifies localStorage
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) updateCartBadges();
});

// Initial paint — run once now if the DOM is ready, otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateCartBadges);
} else {
  updateCartBadges();
}

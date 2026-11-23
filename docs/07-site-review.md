# Site review — storefront + admin (2026-11-05)

How this was done: read every API function, the cart/checkout/product/shop
scripts, the admin orders/products/inventory/dashboard scripts and the
database policies, then walked the live site (ducks-unlimited-website.vercel.app)
on desktop and at phone width, and the admin while signed in.

Priority key: **P0** = fix before taking real money · **P1** = fix soon,
customers will hit it · **P2** = worth doing · **P3** = nice to have.

---

## 1. Logic and correctness

### P0 — Before go-live

1. **No payment webhook for Maya.** The order is only marked paid when the
   shopper lands on `/order-confirmation.html` and the page calls
   `/api/maya-verify`. If they close the tab, lose signal, or Maya's redirect
   fails, the money is taken but the order stays "pending" forever and stock
   is never deducted. Add a Maya webhook (PAYMENT_SUCCESS → same `markPaid`
   logic), and a scheduled sweep that re-checks every pending order with a
   `payment_reference` older than a few minutes.

2. **No emails at all.** Nothing is sent on order placed, paid, shipped,
   or refunded. There is no code anywhere for email. A customer gets no
   receipt and no tracking number unless they log in. This is the single
   biggest trust gap. Wire a transactional email service (Resend / Postmark)
   from `maya-verify`/webhook (receipt) and from the admin "Save Changes" when
   status becomes shipped (tracking link).

3. **Stock is only checked, never reserved.** `create-payment.js` reads stock
   and creates the order, but two shoppers can both pass the check for the
   last item, both pay on Maya, and one is oversold. Minimum fix: at
   `markPaid`, if stock would go below zero, flag the order instead of
   clamping to 0 silently (`Math.max(0, …)` hides the oversell today).
   Better: reserve stock at order creation with an expiry (15–30 min) and
   release on failure/expiry.

4. **Stock decrement is not atomic.** Both the webhook and `maya-verify` do
   read-then-write on the inventory row. Use the existing `adjust_stock()`
   RPC (migration 027) with a negative delta instead; it already exists and
   is SECURITY DEFINER.

5. **Abandoned checkouts pile up as "pending" orders.** Every click on Place
   Order inserts an order row before Maya is even opened. The admin already
   shows 5 "Not paid yet" of 10 total, and the customer's "My Orders" lists
   them all as "Awaiting payment". Either auto-mark pending orders older than
   N hours as `failed`/`expired` (sweep job), or hide them from the customer
   list and the admin "All orders" default view.

6. **Duplicate variant lines in the request bypass the stock check.** If the
   same `variantId` appears twice in `items`, each line is checked separately
   against the full stock. Merge lines by variant before validating.
   `quantity` is also never forced to an integer on the server (`2.5` would
   pass validation and fail the DB check, returning a generic 500).

7. **`variantId` values go straight into a PostgREST filter**
   (`variants?id=in.(…)`). Validate each one is a UUID first; a bad value
   today produces an unhelpful 500.

### P1 — Customers will notice

8. **Wrong colour photo in the bag and checkout.** The product page passes
   the colour's image, but `cart.html` and `checkout.html` override it with the
   product's primary image (`info.imageUrl ?? item.imageUrl`). Verified live:
   a Sprout (green) polo shows a white polo thumbnail in the cart, mini-cart
   summary and checkout. Keep the variant photo (prefer the cached one, or
   pick the image whose `color` matches the variant).

9. **Shipping / returns copy contradicts itself.** Found on the product page
   accordion: "Free shipping on orders over ₱2,500 within Metro Manila", while
   every other surface says ₱3,000 nationwide. Returns say "30-day" on the
   PDP trust strip, "within 30 days of delivery" on the returns page, and
   "within 7 days" elsewhere. Pick one policy and source it from one place
   (a constant or `site_content`).

10. **Customer order notes are stored in `internal_notes`.** The checkout
    "Anything we should know?" field is written into the same column the
    staff edit and the sandbox/refund logic appends to. Staff can overwrite
    the customer's gift-wrap request without noticing. Add a
    `customer_notes` column and show it separately in the order panel and on
    the packing slip.

11. **Mixed-brand orders break per-brand reporting.** A bag with Ducks +
    Rocwood becomes a DU order, so Rocwood revenue on the dashboard is
    understated and Rocwood staff filtering by brand won't see those items.
    Store `brand_id` on `order_items` (from the product) so reports can split
    by line.

12. **Order number is guessable, lookup is only guarded by email.**
    Fine for now, but rate-limit `/api/track-order` (Vercel has no default
    limit) so order numbers plus a leaked email list can't be enumerated.

13. **Sticky mobile Add-to-Bag bar reads the wrong selectors.** It looks for
    `.product-title` / `.product-price`, which don't exist (the page uses
    `.info__name` / `.info__price`), so the bar shows no name or price. It also
    attaches a `MutationObserver` to the whole `body` and re-runs on every DOM
    change, which is wasteful.

14. **Product page title always says "— Ducks Unlimited"** even for Rocwood
    products; the related-products placeholder also says "Ducks Unlimited".
    Use the brand name from `product.brands.name`.

15. **"Hidden" product can still be bought via a stale link?** No: the server
    checks `is_active`. But a product with zero photos *is* shown on the
    storefront as a blank beige tile (Classic Cotton Polo, visible live).
    Either hide photo-less products from the catalog or make the admin warn
    when publishing without a photo.

16. **Admin can move fulfillment backwards or skip steps** (delivered →
    pending, pending → delivered). Enforce forward-only transitions, and
    block "shipped" on unpaid orders instead of just confirming.

17. **Order-confirmation page loops only 6 × 3 s.** If Maya takes longer than
    18 s to settle, the customer sees "Awaiting payment" with no way to
    re-check. Add a "Check again" button and keep polling slowly in the
    background.

### P2

18. The size order map only knows XS–XXXL. Kids sizes (2–14) and waist sizes
    (28–40) sort as 99 on the storefront PDP and shop filter (the admin
    inventory page already has `sizeRank`; reuse it).
19. The shop's free-text search matches descriptions, so "polo" returns
    chinos and shorts. Weight name matches above description matches, or
    show name matches first.
20. Shop products are cached in localStorage for 5 minutes (stale-while-
    revalidate). Stock badges can be 5 minutes old; that's fine, but price
    changes also lag. Consider a shorter TTL or bumping the cache key when
    an admin saves a product.
21. `delete-account.js` deletes the auth user; orders keep `customer_email`
    and name. Under the Data Privacy Act you may need to pseudonymise those
    on request too (keep order number + amounts, blank name/phone/address).

---

## 2. Missing features (what a PH clothing shop is expected to have)

### P0 / P1

1. **Order emails** (see Logic 2). Receipt, paid, shipped with tracking link,
   cancelled/refunded.
2. **Cash on delivery / GCash direct.** Maya Checkout covers cards, Maya
   wallet and QR Ph, but a large share of PH shoppers still pick COD. Add a
   payment-method step with COD (order goes to "to pack" immediately,
   `payment_status = cod_pending`, mark paid on delivery in admin).
3. **Shipping zones.** Flat ₱150 nationwide is unusual; Metro Manila vs
   Luzon vs Visayas/Mindanao rates are standard and the province dropdown
   already exists. Also a **store pickup** option (three stores exist in the
   admin) with no shipping fee.
4. **Discount / voucher codes** at checkout, and the **member 10% / 20%
   discount** — the Members table exists in admin but nothing in checkout
   reads it. Link member → account (there is already a "Match website
   accounts" button) and apply the tier discount server-side in
   `create-payment.js`.
5. **Order cancellation by the customer** while unpaid/pending, from My
   Orders.

### P2

6. **Low-stock / new-order notifications for staff** (email or a daily
   digest), since there is no push.
7. **Sales reporting**: the dashboard only shows "today". Add 7-day / 30-day
   revenue, orders by status over time, top products, and a CSV export of
   orders for accounting.
8. **Reviews / ratings** or at least "fit feedback" on the PDP.
9. **Back-in-stock / size notify me** on out-of-stock variants.
10. **Product search in the admin orders list by SKU** (search covers order
    number, name, email, phone only).
11. **Bulk order actions** in admin: select several "to pack" orders → print
    all packing slips, mark packed.
12. **Courier integration or at least a tracking link builder** (J&T, LBC,
    Lalamove) so the tracking number becomes a clickable URL for the
    customer.
13. **Returns requested by the customer** from My Orders (today returns are
    admin-only).

### P3

14. Gift cards page exists but is redirected away; either finish it or
    remove the table and admin page to reduce surface area.
15. Lookbooks: storefront says "coming soon" and admin has none. Ship one or
    hide the nav link until there is content.
16. Wishlist → "add all to bag" and share link.
17. Recently viewed strip on PDP / cart.
18. Size guide per category (kids, waist) rather than one generic page.

---

## 3. Design and UX

### Storefront

1. **Header is too tall.** Announcement bar + brand switcher + main nav is
   ~130 px on desktop and ~200 px on phone (the announcement wraps to two
   lines). On a 375 px phone the hero headline starts below the fold. Shrink
   the announcement to one line (shorter copy), and collapse the brand
   switcher into the nav on scroll.
2. **Photo consistency.** Ducks products are flat-lays on white; Rocwood and
   several Ducks pants/shorts use Unsplash lifestyle shots of other people's
   clothes. On the shop grid they sit side by side and it reads as two
   different stores. Until real Rocwood photos exist, hide Rocwood products
   that only have stock photos, or at least crop stock photos to the same
   square flat-lay frame.
3. **Colour swatches are mostly grey.** The colour map only knows ~25 names;
   actual variant colours are "Sprout", "Airforce Blue", "Bright Royal",
   "Cascade", "Charcoal Gray", "Twisted Natural"… all render as #999. Add a
   `hex` column on variants (or a `colors` lookup table) editable in admin,
   and fall back to the colour's photo as the swatch when there is one.
4. **Colour filter list is 24 near-unique entries** ("Navy" and "Navy Blue"
   are separate). Normalise colour names in admin (dropdown of known colours
   with "add new") so the filter stays short.
5. **Filter counts never change** when a filter is applied; they always show
   totals. Either recompute counts against the current selection or drop
   the numbers.
6. **PDP has one photo and no thumbnails, no zoom.** For an "affordable
   luxury" position, shoppers expect front/back/detail shots and tap-to-zoom.
   At minimum, show the colour variant photos as thumbnails and add pinch /
   click zoom.
7. **PDP copy is generic for every product.** "Model is 5'11" and wears M"
   appears on kids' tees and boxers; care instructions are the same for
   everything. Make Fit and Care per-product (or per-category) fields in the
   admin.
8. **Homepage "New Arrivals" leads with a brief on a mannequin.** Newest-by-
   created_at is not merchandising. Let the admin pin featured products (the
   Product Grid section in the Homepage builder could take a manual list).
9. **The green "paint splash" editorial image** is clearly stock/AI and
   off-brand next to the real store photos. Replace with a fabric / knitting
   close-up from the factory.
10. **Checkout has no order review step and no way to edit the bag.** The
    summary card has no "Edit" link back to the cart, no payment-method
    choice (it only says "you'll be redirected to Maya"), no terms checkbox.
    Add: edit link, payment method radios (Maya, COD), a short policy line
    with links.
11. **Cart quantity controls don't allow typing** (only +/−), and the
    "Only N left" toast is the only feedback at the stock ceiling.
12. **Mini-cart is empty space** below one item on desktop. Use that space
    for "you may also like" or the free-shipping progress bar (which only
    appears on the cart page).
13. **Mobile sticky Add-to-Bag** is broken (Logic 13); once fixed, keep it.
14. **Footer email is a Yahoo address.** Fine for now, but a branded
    address (hello@ducksunlimited.ph) is cheap and reads as more legitimate.
15. **Accessibility**: colour swatches have no text alternative beyond the
    label; the announcement "×" has no aria-label; the shop grid cards have
    the product name twice (link + body link). Run an axe pass.

### Admin

16. **Dashboard shows only "today".** Add a date range, a 30-day sparkline,
    and an "attention" list (unpaid > 1 day, shipped without tracking,
    paid-after-cancel flags).
17. **Inventory table edits one variant per side-panel.** For 190 SKUs,
    staff will want inline editing (click the number, type, Enter) and a
    "bulk set for this product" row.
18. **Inventory in "All brands" view has no brand column**; Rocwood jeans
    sort to the top with no indication of brand.
19. **Order panel is long and the actions are at the very bottom.** Put
    status + tracking at the top (that's 90% of the work), keep customer
    details below, and move Cancel/Refund under a "More" disclosure.
20. **Packing slip always says "Ducks Unlimited"** even for Rocwood orders,
    and doesn't print the customer's note (because it's merged into staff
    notes).
21. **Products list has no stock column and no image-count column.** Staff
    can't see "out of stock" or "no photo" without opening each product.
22. **Add Product form: variants are only created after the product is
    saved**, and inventory starts at 0 with a note to go to the Inventory
    page. Allow entering starting stock in the "Add a colour in many sizes"
    block.
23. **Admin nav labels are confusing**: the "Homepage" tab opens
    `design.html` and the "Announcements" tab opens `homepage.html`. Rename
    files or labels so they match.
24. **No admin audit trail** beyond refunds. Log who changed a product price,
    stock, or order status (a small `admin_log` table written by triggers).
25. **Admin pages are not usable on a phone** (tables overflow). Managers
    checking orders from the shop floor will want at least the Orders page
    to work on mobile.

---

## 4. Technical / housekeeping

1. **Add security and caching headers in `vercel.json`**: HSTS,
   `X-Content-Type-Options`, `Referrer-Policy`, a basic CSP, and long
   `Cache-Control` for `/images/*`, `/css/*`, `/js/*`.
2. **Rate-limit the public API functions** (`create-payment`, `track-order`,
   `maya-verify`). Vercel functions have none by default; a tiny in-memory
   limiter plus Vercel Firewall rules is enough.
3. **SEO basics are missing on product pages**: no Open Graph / Twitter
   tags, no canonical, no `Product` JSON-LD, and the title is set after JS
   runs. Since pages are static HTML, add a small serverless route
   (`/api/og?id=`) or pre-render product meta so Facebook / Messenger shares
   show the photo and price (most PH traffic will come from FB/IG).
4. **Images are served at upload size** (up to 5 MB JPG). Resize to ~1600 px
   and convert to WebP on upload in `image-uploader.js`, and request
   Supabase's image transform (`?width=`) for grid thumbnails.
5. **Dead code**: PayMongo path in `create-payment.js` and the webhook,
   gift cards, journal/lookbook seeds. Keep PayMongo only if you intend to
   fall back to it; otherwise remove to reduce what a beginner has to read.
6. **The README is out of date** (says PayMongo, lists 2 migrations; there
   are 32). Update it with the Maya flow and the go-live checklist from
   memory (webhook, production keys, remove sandbox labels).
7. **Keep the `scripts/dev-server.mjs` route** (it works) but document it in
   `.claude/launch.json` as the default; the python server can't run the API.
8. **`schema.sql` no longer matches the live DB** (status checks, policies,
   columns). Regenerate it from Supabase so a fresh install works.

---

## 5. Suggested order of work

1. Maya webhook + pending-order sweep + emails (Logic 1, 2, 5; Features 1).
2. Atomic stock + oversell flag + variant validation (Logic 3, 4, 6, 7).
3. Wrong-colour photo, copy contradictions, customer-notes column
   (Logic 8–10).
4. COD + shipping zones + member discount at checkout (Features 2–4).
5. Header height, swatch colours, photo consistency, PDP gallery
   (Design 1–7).
6. Admin: dashboard ranges, inline inventory, order panel reorder
   (Design 16–19).
7. Headers, rate limits, OG tags, image resizing (Technical 1–4).

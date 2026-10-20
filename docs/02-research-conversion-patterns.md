# Research — what the best-converting online clothing stores do

Patterns from top-converting clothing retailers (Aritzia, Everlane, SSENSE, Zara, Uniqlo, Allbirds, Lululemon, Shopify's merchant best-practice guides, Baymard Institute's e-commerce UX research). Below is only what moves the needle on **conversion** — not design opinions.

---

## 1. Homepage — above the fold

**What works**
- One primary message. One primary image. One primary CTA. Not three.
- Hero is a lifestyle shot with product visible, not a landscape or abstract.
- CTA says what happens: "Shop the Collection", not "Learn More".
- Announcement bar for one high-value message only (free shipping threshold, launch, sale). Rotating announcements lose attention — keep it static or rotate slowly.
- A "shop by category" tile row (3–6 tiles max) **below** the hero. Aritzia and Zara both do this. Converts browsers who don't know what they want yet.

**What doesn't**
- Carousel hero with 4 slides. Users engage with slide 1 only. Baymard data: 1% click-through on slides 2+.
- "Welcome" or mission copy up top. Save it for about pages.
- Full-screen hero with no visible product.

**For us**
- Brand switcher sits at the top (Ducks | Rocwood), persisted per visit.
- Hero per brand, editable from admin.
- Category tile row per brand (editable).
- One announcement bar, same across brands or per-brand — admin's call.

---

## 2. PLP (product listing / shop page)

**What works**
- **Dense product grid.** 4 columns desktop, 2 columns mobile. Big product photos.
- **Secondary image on hover** showing a second angle or lifestyle shot. Everlane and SSENSE both do this. Lifts PDP click-through meaningfully.
- **Price shown on card, in product's primary currency.** No "from" unless the range is wide.
- **Color swatches on card** (max 4 shown, "+2 more" if needed). Clicking a swatch previews that color's image.
- **Sort = default to "newest" or "best-selling"**. "Price low to high" as default kills margin.
- **Filters are sticky on scroll** (desktop) or in a slide-out drawer (mobile). Collapsible groups: Category, Size, Color, Price range.
- **"Add to Cart" from PLP** (quick add) for single-variant products or defaulting to one size — reduces clicks to purchase. For sized clothing, "Quick view" that opens size selector in a modal.
- **Infinite scroll OR load more button, not pagination.** Baymard: pagination costs you ~15% of PLP engagement.
- Show total count and current count ("Showing 48 of 128").

**What doesn't**
- 3-column desktop grids. Too much whitespace, feels empty.
- Hiding price until hover.
- Filter sidebars that reset on page navigation.

---

## 3. PDP (product detail page)

Highest-leverage page. Baymard: PDP changes account for the biggest conversion swings.

**What works**
- **Image gallery takes 50-60% of above-the-fold on desktop.** 5+ images per product. First image is product-on-model, second is flat/laydown, third is detail, fourth is back, fifth is model-styled with other product.
- **Zoomable images.** Click to zoom at least 2x.
- **Price, name, variant pickers, Add to Cart all visible without scrolling** (above the fold on desktop).
- **Size selector with "Size guide" link right next to it.** Not buried in a tab below.
- **Color selector with named swatches**, not just colored circles.
- **Stock scarcity signal** when relevant: "Only 2 left in size M." Not fake urgency — real only.
- **Add to Cart is the single primary CTA.** Big, high-contrast, says "Add to Cart" or "Add to Bag" — not "Buy Now" (that reads as single-item checkout and reduces basket size).
- **Shipping and returns summary in bullet form** right under or next to Add to Cart. "Free shipping over ₱3,000. 30-day returns." Not a modal, not a tab, inline.
- **Below the fold:** full description → materials/care → size & fit → reviews → "You may also like".
- **Reviews visible.** Even 3 reviews beat zero. Star rating in the main info block.
- **Sticky Add to Cart on mobile.** When the user scrolls past it, a slim bar sticks to the bottom with image + price + Add button.

**What doesn't**
- Tabs for description / details / returns (users don't open them). Just stack sections.
- "Add to wishlist" as a bigger CTA than Add to Cart.
- Hiding size availability until you pick a size.
- Pop-ups the moment you land on PDP.

---

## 4. Cart

**What works**
- **Mini cart that slides in from the right** when you add to cart. Shows the line just added, cart subtotal, "View Cart" and "Checkout" buttons. Doesn't yank the user off the page.
- **Full cart page shows product image, name, variant, qty stepper, line price.**
- **Shipping threshold progress bar.** "Add ₱500 more for free shipping." Lifts AOV.
- **Edit quantity in-place** without reloading. Delete per line.
- **Promo code input is a collapsed link** ("Have a promo code?"), not an open field. An empty open field makes shoppers hunt for codes elsewhere and abandon.
- **Checkout CTA is primary; "Continue shopping" is secondary** (text link).
- **Trust badges below the CTA**: PayMongo accepted methods, SSL icon, returns policy link.

**What doesn't**
- Modal cart with no "view full cart" option.
- Requiring login before showing the cart.
- Hiding tax/shipping until checkout step 3.

---

## 5. Checkout

Biggest conversion losses happen here. Baymard average: **~70% cart abandonment**, most of it in checkout.

**What works**
- **Guest checkout.** Required. "Create an account" is a checkbox at the end, pre-filled with the email they already entered. Not a gate.
- **Single-page or 3-step checkout, not 5.** Email → Shipping → Payment. All on one scroll or three short screens.
- **Address autocomplete** (Google Places or similar). For PH, at minimum: region → city → barangay cascading dropdowns.
- **Payment methods visible as logos**, not names only. GCash, Maya, cards. PayMongo supports all three.
- **Order summary visible throughout** (right rail on desktop, collapsible top on mobile).
- **No surprise fees.** Shipping shown before payment step.
- **Explicit error messaging** per field. Red border + specific message, not a global "something went wrong".
- **"Place Order" CTA says the price**: "Place Order — ₱2,450".

**What doesn't**
- Forcing account creation. Baymard: 24% of US shoppers abandon over this. For PH, higher.
- Hidden shipping until the end.
- Captcha during checkout (unless fraud is a real problem).
- Multiple "Place Order" buttons on the page (confuses conversions).

---

## 6. Trust + friction removers

- **Reviews on PDP and homepage.** Even 5-6 reviews beat zero. Use a simple schema (star + text + reviewer first name + size purchased).
- **"Shipped from Greenhills, Metro Manila"** or similar — localizes trust for PH buyers.
- **Return policy summary on PDP and in footer**, not just in a legal page.
- **About / Our Story page** with photos of the physical Greenhills store. Builds legitimacy fast.
- **Clear contact info in footer**: email, phone, store address with hours.
- **FAQ page** with real questions, not corporate-speak.
- **Instagram feed** linked from footer. Social proof + visual.

---

## 7. Mobile specifics (most PH shoppers)

- **Thumb-reachable primary CTAs** — Add to Cart in the bottom third of the screen.
- **Collapsible nav** (hamburger) with search as a persistent icon in the header.
- **No horizontal scroll anywhere, ever.**
- **Fonts: body ≥16px**, line-height ~1.5.
- **Buttons ≥44x44pt tap targets.**
- **Lazy-load images below the fold.**
- **Preconnect to Supabase + Google Fonts in `<head>`** (already done — keep it).

---

## 8. Multi-brand specifics (Ducks + Rocwood)

- **Brand switcher in the top bar**, not in a hamburger. Visible on every page.
- **Each brand gets its own homepage, hero, color accent, tone.** Shared cart, shared account, shared checkout.
- **Products are tagged with brand**, filterable from shop page. User can also "Shop All" across brands.
- **Order confirmation reflects brand** — "Thanks for your Ducks Unlimited order", with the right brand's email signature.
- **Admin lets you edit each brand's homepage separately** — same CMS pattern, scoped by brand.

---

## 9. What we're going to apply (prioritized)

**High-leverage, cheap to add (do first):**
1. PDP sticky Add to Cart (mobile)
2. Secondary image on PLP card hover
3. Shipping threshold progress bar in cart
4. Guest checkout confirmed working
5. Mini cart slide-in on add
6. Size guide link next to size selector
7. Trust/returns summary under PDP Add to Cart
8. Announcement bar (editable in admin)

**Required for multi-brand:**
9. `brand` column across products / content / orders
10. Brand switcher nav
11. Brand-scoped admin content editing

**Later / nice-to-have:**
12. Reviews system
13. Address autocomplete
14. Analytics (Vercel + PostHog)
15. Real customer photo gallery / Instagram embed

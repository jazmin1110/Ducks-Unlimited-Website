# Audit — what we have (2026-10-19)

## Stack
Plain HTML + CSS + vanilla JS. No build step. Vercel for hosting + serverless (`/api/*`). Supabase for DB + auth + storage. PayMongo wired as serverless skeleton.

## What's actually built

### Storefront (`public/`)
- `index.html` — homepage, audience-led tiles (Men / Women / Kids & Baby)
- `shop.html` — product catalog with filters, search
- `product.html` — PDP with Quick View (jitter fixed), variant select
- `cart.html`, `checkout.html` — cart + checkout → PayMongo
- `account/` — profile, orders, addresses, wishlist (behind Supabase auth)
- `auth/sign-in.html`, `auth/sign-up.html`
- `journal/`, `lookbooks/` — editorial pages
- `gift-cards.html`, `stores.html`, `size-guide.html`
- `customer-service/` — help, returns, shipping, privacy, terms, accessibility
- `components/nav.html`, `components/footer.html` — loaded via `js/components.js`

### Admin (`public/admin/`)
- `index.html` — login
- `dashboard.html` — stats, recent orders, low stock
- `products.html` — product + variant CRUD, image upload
- `inventory.html` — per-channel stock
- `orders.html` — fulfillment + tracking
- `homepage.html` — **CMS editor for homepage tiles** (site_content table)
- `journal.html`, `lookbooks.html`, `gift-cards.html`, `stores.html`

### Serverless API (`api/`)
- `create-payment.js` — creates order + PayMongo payment link
- `paymongo-webhook.js` — confirms payment, decrements inventory

### Database (10 migrations + schema + seed)
- `schema.sql` — products, variants, inventory, orders, order_items, product_images, RLS everywhere
- Migrations added over time: product_images, order tracking, account features, lookbooks/journal, gift_cards/stores, site_content bucket, site_content table, homepage_audience_tiles, perf indexes, profile_fields
- `seed/demo_products.sql`, `seed/demo_lookbooks_journal.sql` — demo data

## What's missing for the overhaul

| Gap | Why it matters |
|---|---|
| No `brand` concept anywhere | Site is single-brand (DU only). Need to tag products + content with brand, filter by brand, switch brand in nav. |
| Order number prefix hardcoded `DU-` | Rocwood orders would need `RW-` (or shared sequence, but prefix per brand reads better in receipts). |
| `inventory.channel` check constraint hardcodes `'online'` + `'greenhills_store'` only | Rocwood may have its own physical store(s). Constraint has to open. |
| Design is functional but not conversion-tuned | See `02-research-conversion-patterns.md`. PDP, PLP, cart, checkout all need polish against proven patterns. |
| Supabase project is on CMT org, not visible to current MCP token | Need either new project or scoped access. |
| No analytics | Can't measure conversion lift. Add Vercel Web Analytics (free) + maybe PostHog for funnels. |
| Admin "edit how the site looks" is partial | `homepage.html` edits homepage tiles. Need: hero copy/image per brand, featured collections, journal pins, announcement bar — per brand. |
| 5 stale `claude/*` branches on origin | All merged. Safe to delete after this overhaul. |

## What NOT to throw out

- RLS schema — well-structured, keep it, extend with `brand` column.
- Admin panel structure — reuse all admin pages, add a brand selector at the top.
- PayMongo serverless scaffolding — correct architecture (price re-fetched server-side, inventory decrements on webhook, not on order creation).
- Component loader (`components.js`) — simple and works.
- Design tokens in `css/style.css` — brand palette, fonts.

## Known good patterns in current code
- Prices re-fetched server-side in `create-payment.js` (no trusting the frontend)
- Inventory decrements on PayMongo webhook, not order creation (prevents overselling on abandoned carts)
- RLS enforced on every table
- Mobile-first CSS

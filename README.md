# Ducks Unlimited + Rocwood — E-Commerce Website

Online shop and admin panel for **Ducks Unlimited** (Egyptian cotton polos and
shirts, made in the Philippines since 1995) and its sister brand **Rocwood**.
Based in Greenhills, San Juan.

---

## Tech Stack

- **Frontend:** Plain HTML, CSS, vanilla JavaScript (no React, no build step)
- **Database + Auth:** [Supabase](https://supabase.com) (PostgreSQL + Row Level Security)
- **Payments:** [Maya Checkout](https://developers.maya.ph) (cards, Maya wallet, GCash / QR Ph) and cash on delivery. PayMongo is kept as a backup provider.
- **Emails:** [Resend](https://resend.com) for receipts and shipping notices
- **Hosting:** Vercel (static files + serverless functions + a cron job)
- **Fonts:** Cormorant Garamond (headings), DM Sans (body) — via Google Fonts

---

## Project Structure

```
/
├── public/                 # Everything customers see (served as-is)
│   ├── index.html              # Landing page (both brands)
│   ├── home.html               # Brand homepage (/du/ and /rw/), built from admin sections
│   ├── shop.html               # Catalog with filters + search
│   ├── product.html            # Product page (served through /api/product-page for share tags)
│   ├── cart.html, checkout.html, order-confirmation.html, track-order.html
│   ├── account/                # My Account: orders, addresses, wishlist, profile
│   ├── auth/                   # Sign in / sign up / password reset
│   ├── customer-service/       # Shipping, returns, help, privacy, terms
│   ├── admin/                  # Staff panel (Supabase Auth + admin_users table)
│   │   ├── dashboard.html          # To-do cards, sales for a period, top products, "needs a look"
│   │   ├── orders.html             # Orders: pack / ship / COD cash / cancel / refund / packing slips / CSV
│   │   ├── products.html           # Products, variants, photos, fit & care, featured, swatch colours
│   │   ├── inventory.html          # Stock per variant (click a number to edit), CSV import/export
│   │   ├── customers.html, members.html, vouchers.html, log.html
│   │   ├── design.html             # Homepage builder (sections)
│   │   ├── homepage.html           # Announcement bar + shop intro text
│   │   ├── lookbooks.html, stores.html
│   │   └── js/                     # admin-guard, CSV import/export, image uploader
│   ├── components/             # nav, footer, mini-cart, announcement bar, admin nav
│   ├── js/                     # cart, auth, account helpers, brand switcher, colours, sections
│   ├── css/                    # style.css (design tokens), home.css, account.css
│   └── lib/supabase.js         # Shared Supabase client (anon key — safe to expose)
│
├── api/                    # Vercel serverless functions (server-side, secret keys)
│   ├── create-payment.js       # Checkout: validates, prices, creates the order, starts Maya or COD
│   ├── quote.js                # Live totals for the checkout page (shipping zone, member discount, voucher)
│   ├── maya-verify.js          # Confirms a Maya payment and marks the order paid
│   ├── expire-orders.js        # Cron: expires abandoned checkouts, catches paid-but-closed-tab orders
│   ├── track-order.js          # Order lookup by number + email (guests)
│   ├── cancel-order.js         # Customer cancels while still "pending"
│   ├── admin-order.js          # Staff: status + tracking, COD cash received, cancel, refund
│   ├── delete-account.js       # Right-to-erasure
│   ├── product-page.js         # product.html with Open Graph / JSON-LD injected
│   ├── paymongo-webhook.js     # Backup provider
│   └── _lib/                   # Shared: pricing rules, emails, orders, rate limit, Maya, Supabase
│
├── database/
│   ├── schema.sql              # Original schema (historical — the live DB is schema + all migrations)
│   ├── migrations/             # Apply in order in the Supabase SQL Editor (001 … 033)
│   └── seed/                   # Demo catalogue
│
├── scripts/dev-server.mjs  # Local server that also runs /api/* (no Vercel CLI needed)
├── .env.example            # Every environment variable, explained
└── vercel.json             # Rewrites, security headers, caching, the cron
```

---

## Running Locally

```bash
cp .env.example .env     # then fill in the values
node scripts/dev-server.mjs
```

Open http://localhost:3000. This serves the site **and** the `/api/*`
functions, so checkout, quotes and order tracking work locally. (A plain
static server such as `python -m http.server` shows the pages but checkout
will say it can't reach the server.)

In the Claude desktop app, the `site-api` entry in `.claude/launch.json`
starts this same server.

---

## Environment Variables

Set these in `.env` locally and in Vercel → Settings → Environment Variables.
`.env.example` explains each one. The important groups:

| Group | Variables |
|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only) |
| Maya | `MAYA_ENV` (`sandbox` / `production`), `MAYA_PUBLIC_KEY`, `MAYA_SECRET_KEY` |
| Site | `SITE_URL` (used for redirect and email links) |
| Emails | `RESEND_API_KEY`, `EMAIL_FROM`, optional `EMAIL_REPLY_TO`, `EMAIL_BCC`, `EMAIL_STAFF` |
| Cron | `CRON_SECRET` (protects `/api/expire-orders`) |
| PayMongo (backup) | `PAYMENT_PROVIDER=paymongo`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` |

Without `RESEND_API_KEY` no emails are sent (they're logged instead); the
shop still works.

---

## How an order flows

1. **Checkout** (`checkout.html`) asks `/api/quote` for live totals as the
   shopper fills in the form: shipping zone from the province (Metro Manila
   ₱100 · Luzon ₱150 · Visayas/Mindanao ₱200, free at ₱3,000+, pickup free),
   store-member discount (matched by account, phone or email), voucher code.
   The rules live in one place: `api/_lib/pricing.js`.
2. **Place order** → `/api/create-payment` re-checks everything server-side
   and inserts the order as `pending`.
   - **Maya**: the shopper is sent to Maya's hosted page. Stock is **not**
     taken yet. When they return, `order-confirmation.html` calls
     `/api/maya-verify`, which asks Maya and marks the order paid.
   - **Cash on delivery / pay in store**: stock is taken immediately and a
     confirmation email goes out. Staff press **Cash received** on the order
     when the money comes in.
3. **Paid** → `markOrderPaid()` (in `api/_lib/orders.js`) takes stock in one
   database call (`deduct_stock_for_order`), flags anything oversold, and
   emails the receipt.
4. **Staff** pack and ship from Admin → Orders. Statuses only move forward.
   Marking it *Shipped* (or *Ready for pickup*) emails the customer with the
   tracking number.
5. **Abandoned checkouts**: `/api/expire-orders` runs once a day (2am PH time) and
   marks online orders still unpaid after 2 hours as `expired` (after one last
   check with Maya, so a paid-but-closed-tab order is rescued, not expired).

---

## Database Migrations

The live database is `schema.sql` plus every file in `database/migrations/`
applied in order. New installs: run `schema.sql`, `storage_setup.sql`, then
all migrations. Existing installs: run only the ones you haven't yet.

The latest, `033_checkout_options_emails_and_audit.sql`, adds COD / pickup /
voucher columns on orders, `order_items.brand_id`, `variants.color_hex`,
product fit/care notes and `is_featured`, the `discount_codes` table, the
`admin_log` table with its triggers, `deduct_stock_for_order()`, and the
forward-only fulfillment rule.

---

## Go-live checklist (Maya)

Still waiting on Maya for production keys. When they arrive:

1. Set `MAYA_ENV=production`, `MAYA_PUBLIC_KEY`, `MAYA_SECRET_KEY` in Vercel.
2. Add a Maya webhook (Maya Manager → Webhooks, event `PAYMENT_SUCCESS`)
   that calls `markOrderPaid()` — see the TODO at the top of
   `api/maya-verify.js`. Until then `/api/expire-orders` re-checks Maya for
   every stale pending order, so paid orders are never lost.
3. Delete the sandbox test orders (they're labelled in staff notes).
4. Set `RESEND_API_KEY` + a verified `EMAIL_FROM` so customers get receipts.

---

## Project Conventions

- **Plain HTML/CSS/JS** — no build step, no frameworks. The owner is a beginner
  coder, so code stays simple and well-commented.
- **Mobile-first design** — most Filipino shoppers are on phones.
- **The server is the source of truth for money and stock.** The browser only
  previews totals; `/api/create-payment` recomputes them before anything is
  charged, and stock only moves through the database functions.
- **One place per rule**: shipping, discounts → `api/_lib/pricing.js`;
  emails → `api/_lib/email.js`; swatch colours → `public/js/colors.js`.

---

## License

Private project — all rights reserved by Ducks Unlimited.

# Ducks Unlimited — E-Commerce Website

E-commerce site and admin panel for **Ducks Unlimited**, a Filipino retail clothing brand
crafting Egyptian cotton garments since 1995. Based in Greenhills, San Juan.

---

## Tech Stack

- **Frontend:** Plain HTML, CSS, vanilla JavaScript (no React, no Next.js, no build step)
- **Database + Auth:** [Supabase](https://supabase.com) (PostgreSQL + Row Level Security)
- **Payments:** [PayMongo](https://paymongo.com) (Philippine-friendly payment gateway)
- **Hosting:** [Vercel](https://vercel.com) (static files + serverless functions)
- **Fonts:** Cormorant Garamond (headings), DM Sans (body) — via Google Fonts

---

## Project Structure

```
/
├── public/          # Customer-facing storefront (everything in here is publicly served)
│   ├── index.html       # Homepage
│   ├── shop.html        # Product catalog with filters
│   ├── product.html     # Individual product detail page
│   ├── cart.html        # Shopping cart
│   ├── checkout.html    # Checkout form → PayMongo
│   ├── css/style.css    # Shared design tokens + components
│   ├── js/
│   │   ├── cart.js          # Cart state in localStorage
│   │   └── components.js    # Loads /components/ snippets into pages
│   └── components/
│       ├── nav.html         # Reusable navigation
│       └── footer.html      # Reusable footer
│
├── admin/           # Password-protected admin panel (Supabase Auth)
│   ├── index.html       # Login
│   ├── dashboard.html   # Overview with stats + recent orders + low stock
│   ├── products.html    # Manage products, variants, and images
│   ├── inventory.html   # Update stock per channel
│   └── orders.html      # View orders, update fulfillment, add tracking
│
├── api/             # Vercel serverless functions
│   ├── create-payment.js     # Creates order + PayMongo payment link
│   └── paymongo-webhook.js   # Receives payment confirmations, decrements inventory
│
├── lib/
│   └── supabase.js          # Shared Supabase client for frontend pages
│
├── database/
│   ├── schema.sql                  # Full database schema (run once for new installs)
│   ├── storage_setup.sql           # Creates the product-images storage bucket
│   └── migrations/                 # Incremental updates for existing databases
│       ├── 001_product_images.sql
│       └── 002_order_notes_and_tracking.sql
│
├── .env.example     # Template for required env vars (copy to .env locally)
├── vercel.json      # Vercel deployment config
└── README.md        # You are here
```

---

## Running Locally

### Prerequisites

- **Node.js 18+** — needed for the Vercel CLI to run serverless functions locally
- **Vercel CLI** — install once with `npm i -g vercel`
- A **Supabase project** (free tier is fine)
- A **PayMongo account** (you can use test mode while building)

### First-time setup

1. **Clone this repository**
   ```bash
   git clone https://github.com/<your-username>/ducks-unlimited-website.git
   cd ducks-unlimited-website
   ```

2. **Create `.env`** from the template
   ```bash
   cp .env.example .env
   ```
   Then open `.env` in your editor and fill in the values — see the
   [Environment Variables](#environment-variables) section below for where to get each one.

3. **Set up the database** — in your Supabase project's SQL Editor:
   - Run the contents of `database/schema.sql` once.
   - Run `database/storage_setup.sql` to create the storage bucket for product images.
   - If you ever update the schema later, apply files from `database/migrations/` in order.

4. **Create your first admin user** in Supabase
   - Go to Supabase dashboard → Authentication → Users → "Add user"
   - Enter your email + password
   - You can now log into the admin panel at `/admin/`

5. **Start the dev server**
   ```bash
   vercel dev
   ```
   This serves the static files AND runs the `/api/*` serverless functions locally.
   Open [http://localhost:3000](http://localhost:3000).

> **Why `vercel dev` instead of a regular static server?** Because plain `http-server` or `python -m http.server` won't run the serverless functions in `/api/*` — so checkout won't work locally without it.

---

## Environment Variables

All of these are required for the site to work end-to-end. Locally they live in
`.env`. In production they go in the Vercel dashboard (see [Deploy](#deploy-to-vercel)).

| Variable | What it is | Where to get it |
|---|---|---|
| `SUPABASE_URL` | Your Supabase project URL | Supabase → Settings → API → "Project URL" |
| `SUPABASE_ANON_KEY` | Public Supabase key (frontend) | Supabase → Settings → API → "anon public" |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** admin key. Bypasses RLS. | Supabase → Settings → API → "service_role" — keep this secret! |
| `PAYMONGO_SECRET_KEY` | **Server-only** PayMongo key | PayMongo → Developers → API Keys → "Secret Key" (use `sk_test_…` while building) |
| `PAYMONGO_PUBLIC_KEY` | Public PayMongo key (reserved) | PayMongo → Developers → API Keys → "Public Key" |
| `PAYMONGO_WEBHOOK_SECRET` | Signs webhook payloads from PayMongo | Created when you register a webhook (see [PayMongo setup](#paymongo-setup)) |
| `SITE_URL` | Your live site URL | `https://ducks-unlimited-website.vercel.app` (production) or `http://localhost:3000` (local dev) |

> ⚠️ **Never commit `.env`.** It's already in `.gitignore`. Don't paste the
> service role key or PayMongo secret key into frontend code — they belong on
> the server only.

---

## PayMongo Setup

1. **Get your API keys**
   - Sign up at [paymongo.com](https://paymongo.com).
   - Go to Developers → API Keys.
   - Copy the **Public Key** and **Secret Key**. Start with the test keys (`pk_test_…` / `sk_test_…`).

2. **Register a webhook** so payments confirm automatically:
   - In PayMongo dashboard: Developers → Webhooks → "Create Webhook"
   - **Endpoint URL:** `https://<your-vercel-domain>/api/paymongo-webhook`
   - **Events to subscribe to:** `link.payment.paid` (and `payment.paid`)
   - After creating, copy the **Signing Secret** → set as `PAYMONGO_WEBHOOK_SECRET`

3. **(Optional)** Set the global redirect URL in PayMongo → Settings so customers
   are sent back to your site after paying:
   - Success: `https://<your-domain>/order-confirmation.html`
   - Failed:  `https://<your-domain>/checkout.html?status=failed`

---

## Deploy to Vercel

### One-time setup

1. **Push your code to GitHub** (see the walkthrough below if you don't have a repo yet).

2. **Import the repo into Vercel**
   - Go to [vercel.com/new](https://vercel.com/new).
   - Select your GitHub repo.
   - Vercel auto-detects the project. **Don't change any settings** — `vercel.json` already configures everything.
   - Click **Deploy**.

3. **Add environment variables** in Vercel
   - Go to your project in Vercel → Settings → Environment Variables.
   - Add each variable from the table above.
   - Set them for **Production, Preview, and Development** so all environments work.

4. **Redeploy** after adding the env vars (Vercel → Deployments → "Redeploy" on the latest one).

### Future deploys

Every push to the `main` branch automatically deploys to production. Every push
to a feature branch creates a preview deployment.

---

## Database Migrations

The canonical schema lives in `database/schema.sql`. For incremental updates to
an existing database, apply migrations in order from `database/migrations/`.

Current migrations:

| File | What it adds |
|---|---|
| `001_product_images.sql` | The `product_images` table + RLS policies |
| `002_order_notes_and_tracking.sql` | `orders.tracking_number` and `orders.internal_notes` columns |

To apply: paste the SQL into the Supabase SQL Editor and run.

---

## Project Conventions

- **Plain HTML/CSS/JS** — no build step, no frameworks. The owner is a beginner
  coder, so code stays simple and well-commented.
- **Mobile-first design** — most Filipino shoppers are on phones. Default styles
  are for mobile, desktop overrides go in `@media (min-width: ...)` blocks.
- **Server is the source of truth for prices and stock.** The frontend can hint
  at these, but `/api/create-payment` re-fetches authoritative values before
  charging anyone.
- **Inventory only decrements after PayMongo confirms payment** — never when an
  order is created. This prevents overselling during abandoned checkouts.

---

## License

Private project — all rights reserved by Ducks Unlimited.

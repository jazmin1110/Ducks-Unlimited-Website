# Overhaul plan

## Decisions locked in
- **Keep plain HTML/CSS/vanilla JS** — refactor, don't rewrite in a framework.
- **One site, brand switcher.** `ducksunlimited.ph` (or similar) hosts both brands; `Ducks | Rocwood` toggle in top bar. Shared cart, shared account, shared admin.
- **Supabase** stays. Resume CMT-org project. Add `brand` column via a new migration (`011_brands.sql`), don't rewrite schema.
- **PayMongo** — keep the existing serverless skeleton, finish wiring with test keys, then production keys when ready.

## Phases

### Phase A — Multi-brand foundation (branch: `overhaul/multibrand-v2`)
1. Migration `011_brands.sql`:
   - `brands` table (id, slug, name, tagline, accent_color, primary_color, is_active)
   - Seed `ducks-unlimited` and `rocwood`
   - Add `brand_id` to `products`, default to Ducks for backfill
   - Add `brand_id` to `site_content`, `lookbooks`, `journal_posts`, `homepage_tiles`, `stores`
   - Open the `inventory.channel` check constraint (or move to a `channels` table referencing brand)
   - Add brand prefix to orders: `brand_id` on orders, prefix generated per brand
2. Shared JS helper `js/brand.js` — resolve current brand from URL (`/rw/*` prefix or `?brand=rw`) and persist in `localStorage`.
3. Nav: brand switcher pill ("Ducks | Rocwood"), route accordingly.
4. Shop page: filter by brand (default = current brand), with "Shop all" option.
5. Admin: brand selector at top of homepage CMS, products list, inventory, journal, lookbooks, stores, orders.

### Phase B — Conversion patterns from `02-research-conversion-patterns.md`
Everything flagged High-leverage in Phase 9 of the research doc:
1. PDP sticky Add to Cart (mobile)
2. Secondary image on PLP card hover
3. Shipping threshold progress bar in cart (`FREE_SHIPPING_THRESHOLD` configurable per brand)
4. Guest checkout confirmed and QA'd end-to-end
5. Mini cart slide-in on add-to-cart
6. Size guide link next to size selector on PDP
7. Trust/returns summary pinned under PDP Add to Cart
8. Static (or admin-edited) announcement bar

### Phase C — Admin "edit how the site looks" expansion
- Hero copy + hero image + hero CTA, per brand
- Featured products / collections, per brand
- Journal pins, per brand
- Announcement bar text + visibility, per brand
- Everything persisted in `site_content` (JSONB), scoped by `brand_id`

### Phase D — PayMongo wiring + QA
- Fill `.env` with PayMongo test keys
- End-to-end test: cart → checkout → PayMongo test card → webhook → order marked paid, inventory decremented
- Order confirmation page polish

### Phase E — Supabase reconnect + seed
- Resume CMT-org project, run `schema.sql` + migrations 001–011 fresh (or just 011 if DB is intact)
- Seed Rocwood demo products
- QA all admin flows end-to-end

### Phase F — Deploy + QA
- Push `overhaul/multibrand-v2` → PR → preview deploy
- QA on preview URL (mobile + desktop)
- Merge to `main` → production deploy
- Smoke-test production

## Not doing in this overhaul (deferred)
- Reviews system
- Address autocomplete
- Analytics
- Instagram embed / UGC gallery
- Rewriting into Next.js

## Open questions to decide as we go
- Rocwood's physical store (name + address) — if any
- Rocwood's brand colors / fonts — if different from Ducks
- Rocwood's domain plan: `rocwood.ph`? subdomain? path prefix?
- PayMongo account — do we have test keys yet?

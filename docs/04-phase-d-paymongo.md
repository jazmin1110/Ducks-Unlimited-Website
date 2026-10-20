# Phase D — PayMongo wiring

Reference for when PayMongo account approval lands. All blockers, inputs, fixes, and the test plan in one place.

---

## What's already built (and good)

Scaffolding is more complete than typical PayMongo starter code. Architecture is correct — don't rewrite.

**[`api/create-payment.js`](../api/create-payment.js)** — Called from [checkout.html:714](../public/checkout.html#L714). Validates payload server-side, re-fetches variant prices + stock from Supabase (never trusts the frontend), inserts a `pending` order + line items, calls PayMongo's `/v1/links` endpoint, stores the PayMongo link id on the order so the webhook can match it later, returns the PayMongo checkout URL. Fixed ₱150 shipping fee hardcoded.

**[`api/paymongo-webhook.js`](../api/paymongo-webhook.js)** — Receives PayMongo's confirmation. Reads raw body (needed for HMAC verification), verifies the `paymongo-signature` header with a constant-time compare, idempotency-guards against duplicate webhook deliveries, flips the order to `paid`, decrements online inventory per line item. Returns 500 on transient failure so PayMongo retries, 200 on uninteresting events so it doesn't.

**checkout.html** already handles end-to-end UI: form validation, POST to `/api/create-payment`, redirect to `paymentUrl`, and a `?status=failed` branch for the PayMongo failure redirect.

---

## What migration 011 broke (fix before touching PayMongo)

1. **`orders.brand_id` is now NOT NULL** — current `create-payment.js` doesn't set it, so every order insert will fail against the new schema.
   **Fix:** resolve the current brand from the request body (or the `Referer` header), look up its UUID, inject into the insert.
2. **Order description is hardcoded** `"Ducks Unlimited Order DU-xxxxx"` — Rocwood orders would say "Ducks Unlimited Order RW-00001" on the PayMongo page.
   **Fix:** swap in the brand's display name from the brand lookup.
3. **Free shipping over ₱3,000 is in the UI but not the server** — cart promises free shipping at ₱3K; `create-payment.js` always adds ₱150.
   **Fix:** zero shipping when `subtotal >= FREE_SHIPPING_THRESHOLD`. Pull the constant from a shared place (new `/js/shipping.js` or similar) so both sides agree.

---

## What's missing

- **`/order-confirmation.html` doesn't exist.** Success redirect in `create-payment.js:215` points to a 404.
  Needs building: brand-themed thank-you page, order number, items summary, next-steps copy (shipping ETA, what the email says, contact info).
- **No branded order confirmation email.** PayMongo sends a payment receipt from PayMongo, not from you. Options:
  - **(a)** Supabase `pg_net` + Resend/Postmark triggered by a webhook
  - **(b)** A second Vercel function the paymongo-webhook calls
  - **(c)** Skip for v1, send manually from Gmail
  Baymard: the confirmation email is a big trust lever. Recommend (b) at minimum.
- **No order-lookup for returning customers.** `/account/orders.html` exists but needs to be wired to pull by the logged-in user's email. In scope for v1 or deferred?

---

## Env vars to set in Vercel

Per environment: **Production + Preview + Development**. Vercel → the ducks project → Settings → Environment Variables.

| Var | Value | Where to find it |
|-----|-------|------------------|
| `SUPABASE_URL` | `https://qrtfgqscpaghtxnhtoyp.supabase.co` | Already pinned in `public/lib/supabase.js`; same value |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Supabase dashboard → Project Settings → API → "service_role" |
| `PAYMONGO_SECRET_KEY` | `sk_test_...` (test) → `sk_live_...` (prod) | PayMongo → Developers → API Keys → Secret Key |
| `PAYMONGO_PUBLIC_KEY` | `pk_test_...` / `pk_live_...` | Same page, Public Key |
| `PAYMONGO_WEBHOOK_SECRET` | **Secret** | Created when you register the webhook (see below) |
| `SITE_URL` | Preview Vercel URL (preview env) or real domain (prod) | Vercel deploy URL |

**Never commit these to the repo.** Vercel env vars only.

---

## PayMongo webhook setup (after account approval)

1. PayMongo dashboard → Developers → Webhooks → Create Webhook
2. URL: `https://<your-preview-or-prod>.vercel.app/api/paymongo-webhook`
3. Events: `link.payment.paid` AND `payment.paid`
4. Copy the Signing Secret → paste as `PAYMONGO_WEBHOOK_SECRET` in Vercel
5. (Optional) Settings → set global success/failure redirect URLs so customers return to your site

Register one webhook per environment (preview + prod) if you want to test on preview without live-site interference.

---

## Test plan (I run through this once your keys are in)

Using PayMongo's test cards (e.g. `4343 4343 4343 4345` for successful card payment; full list in PayMongo docs):

1. Add product → cart → checkout
2. Fill form, redirect to PayMongo
3. Pay with test card
4. Verify: redirected to `/order-confirmation.html` with the right order number
5. Verify in Supabase: order row flipped to `paid`, inventory decremented
6. Repeat under Rocwood brand — order number is `RW-00001`, PayMongo page says "Rocwood Order RW-00001"
7. Test failure path: use test decline card → redirected to `/checkout.html?status=failed`
8. Test idempotency: in Supabase, flip the paid order back to `pending` manually, re-trigger the webhook from PayMongo's dashboard — order should NOT double-decrement inventory. (Current code already guards at the top of the handler; verify it holds.)

---

## Rough time estimate (my work, after you unblock)

- Multi-brand fixes to `create-payment.js` + shipping threshold: **~1 hour**
- Build `/order-confirmation.html` (brand-aware, uses `site-content` for copy): **~2 hours**
- Full end-to-end test with test keys on preview deploy: **~1 hour**
- Order-confirmation email, if we add it this phase: **~2–3 hours** including Resend account + template

**~4 hours without email, ~7 hours with it.** Decide at the time.

---

## PayMongo signup prep (while waiting for approval)

Business verification is the slow part. Have ready:

- DTI/SEC registration certificate
- Business permit or BIR certificate of registration
- Bank account under the business name (for deposits)
- Valid government ID
- Some ask for proof of business address

Approval typically takes 3–7 business days when docs are complete and consistent. Inconsistencies across docs slow it down a lot.

---

## When to open this doc

- Right after PayMongo account approves — review the env-vars table + webhook setup first
- When you want to add that order-confirmation email — the "What's missing" section covers options
- If anything in `create-payment.js` or `paymongo-webhook.js` behaves unexpectedly — "What migration 011 broke" is the first place to check

# 06 — Customer Accounts Overhaul

Covers sign-up, sign-in, password reset, My Account, order tracking (with and without an account), saved addresses, and how checkout uses the account.

## What was broken

| Problem | Impact |
|---|---|
| Every `/account/*` page used `return` at the top level of a `<script type="module">` | **Syntax error**: none of the account pages loaded their data at all |
| Orders were matched to accounts **by email**, with email confirmation off | Anyone could sign up with another shopper's email and read their orders (name, phone, home address) |
| `orders` and `order_items` allowed public INSERT | Anyone could write fake orders into the database, at any price |
| `/order-confirmation.html` didn't exist | Every successful PayMongo payment redirected to a 404 |
| No forgot-password or reset-password flow | Customers who forgot their password were locked out |
| No guest order tracking | Footer "Track Order" sent guests to a sign-in wall |
| `tracking_number` was saved by admins but never shown to customers | Customers couldn't track their shipment |
| Checkout ignored the account completely | Signed-in shoppers retyped everything, and orders weren't linked to their account |
| The profile page auto-saved the default address one field at a time | The first save always failed because the address table requires 5 fields |
| No INSERT policy on `customer_profiles` | The "create profile if missing" fallback always failed |
| Supabase error text shown as-is ("Invalid login credentials") | Unfriendly, and confusing for shoppers |
| `?next=` redirect accepted any URL | Open redirect (`?next=https://evil.com`) |

## Research (REA captures, mobile 390px)

- **Penshoppe sign-up**: 11 required fields (birthday, gender, province, city…), and the marketing checkbox is **pre-ticked**. Two things to avoid: long forms cause sign-up abandonment, and pre-ticked consent isn't valid opt-in under the PH Data Privacy Act. One thing we kept: a Province **dropdown** instead of free text.
- **Everlane (Shopify customer accounts)**: one screen with a single email field ("Sign in or create an account") and a one-time code instead of a password. We added the same idea as **"Email me a sign-in link"** next to the password option.
- **Zalora PH / Aritzia / Uniqlo PH**: their login pages loaded inside iframes or behind bot checks, so they couldn't be captured.
- From `02-research-conversion-patterns.md` (Baymard): guest checkout must stay, and the best moment to offer an account is **right after purchase**, when the shopper has already typed all their details.

## What's new

**Sign up**: only 3 fields (first name, email, password), a live password checklist, a show/hide button, an **unticked** marketing opt-in, and a terms notice. If the email is already registered, it offers a one-tap "Sign in". It also handles the "Confirm email" setting if you turn it on later.

**Sign in**: show/hide password, "Forgot password?" (carries over the typed email), "Email me a sign-in link", a guest "Track an order" link, and friendly error messages.

**Password reset**: `/auth/forgot-password.html` → email → `/auth/reset-password.html`. It never reveals whether an email has an account.

**My Account** (one layout for all pages: swipeable tabs on phones, a sidebar on desktop)
- Overview: greeting, counts, latest order with live status, default address, and a nudge to finish the profile
- Orders & Tracking: cards with thumbnails and status; orders still in transit are counted
- Order detail (`/account/order.html?id=`): a Placed → Paid → Packed → Shipped → Delivered timeline with dates, a "what happens next" line, the tracking number with a Copy button, items, totals, address, and help links
- Addresses: Province dropdown, PH phone and ZIP checks, "set as default", and if you delete the default, the next address is promoted
- Account Details: profile (explicit Save button), marketing preference, change email, change password, sign out on all devices, and **delete account** (PH Data Privacy Act right to erasure)

**Guest tracking** (`/track-order.html`): look up an order with order number + email. If signed in, you can **"Add to My Account"**. If not, it offers to create an account, which then links the order automatically.

**Order confirmation** (`/order-confirmation.html`): live status, which re-checks for ~18s while PayMongo's webhook arrives. It also offers post-purchase account creation.

**Checkout**: shows a "Sign in for faster checkout" prompt to guests (guest checkout is still fully supported). For signed-in shoppers it pre-fills name, email, phone and default address, offers a saved-address picker, adds a "Save this address" option, a Barangay field and a Province dropdown, and **links the order to the account**.

## Files

- `database/migrations/021_account_overhaul.sql`: `orders.user_id`, status timestamps plus a trigger, RLS by `user_id`, removes the public order INSERT, adds a profile INSERT policy, and copies marketing opt-in at sign-up
- `api/_lib/supabase-admin.js` (shared), `api/track-order.js`, `api/delete-account.js`; `api/create-payment.js` now links the order to the account and adds barangay
- `public/js/account.js` (shared account layout and order helpers), `public/js/ph-locations.js`, additions to `public/js/auth.js`
- `public/css/account.css`
- Pages: `auth/*` (4), `account/*` (6, including the new `order.html`), `track-order.html`, `order-confirmation.html`, `checkout.html`

## Setup steps (owner)

1. **Run the migration**: Supabase → SQL Editor → paste `database/migrations/021_account_overhaul.sql` → Run. *Run this before deploying*: the new pages read columns that this migration adds.
2. **Supabase → Authentication → URL Configuration**
   - Site URL: your live domain
   - Redirect URLs: add `https://<your-domain>/**` (needed for password reset, sign-in links and email change)
3. **Recommended: Authentication → Providers → Email → turn on "Confirm email".** The sign-up page already handles it.
4. Optional: brand the auth emails in Authentication → Email Templates (reset, magic link, confirm).

## Not done yet (future ideas)

- Courier tracking links (LBC / J&T / Ninja Van): needs a `courier` column and a dropdown in admin
- Order status emails (shipped / delivered): needs an email provider (Resend, Postmark…)
- Rate limiting on `/api/track-order` (Vercel Firewall rule)
- Syncing `marketing_opt_in` with `newsletter_subscribers`
- Returns/exchange requests from the order page

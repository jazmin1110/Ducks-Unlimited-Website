-- =============================================================================
-- Migration 027 — Cancel orders and refund money
-- =============================================================================
-- Run this in the Supabase SQL editor. Safe to run more than once.
--
-- What it adds:
--
--   1. A new fulfillment status 'cancelled' for orders.
--
--   2. Four new columns on orders:
--        cancelled_at         when the order was cancelled
--        cancel_reason        why (e.g. "Customer asked", "Out of stock")
--        refunded_amount      total pesos given back so far (0 = no refund)
--        provider_payment_id  PayMongo's payment id (pay_…). Needed to send a
--                             refund through PayMongo. Saved by the webhook.
--
--      payment_status is NOT changed by a refund: "paid" still means "the
--      customer paid us". refunded_amount says how much went back. Keeping
--      them separate also means a re-sent payment webhook can never take
--      stock out a second time.
--
--   3. An order_refunds table — one row per cancel/refund, so there is a
--      history of who gave back how much, how, and which items went back
--      into stock.
--
--   4. A function adjust_stock() that adds to (or takes from) a stock count
--      in one step, so two things changing stock at the same moment can't
--      overwrite each other. Only the server (/api) can call it.
--
-- All cancels and refunds go through /api/admin-order.js — never straight
-- from the browser — because sending money back needs our secret PayMongo key.
-- =============================================================================


-- ── 1. Allow the 'cancelled' fulfillment status ─────────────────────────────
alter table orders drop constraint if exists orders_fulfillment_status_check;
alter table orders add constraint orders_fulfillment_status_check
  check (fulfillment_status in ('pending', 'packed', 'shipped', 'delivered', 'cancelled'));


-- ── 2. New order columns ────────────────────────────────────────────────────
alter table orders
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancel_reason       text,
  add column if not exists refunded_amount     numeric(10, 2) not null default 0,
  add column if not exists provider_payment_id text;

alter table orders drop constraint if exists orders_refunded_amount_check;
alter table orders add constraint orders_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= total_amount);

comment on column orders.refunded_amount     is 'Pesos refunded to the customer so far. 0 = nothing refunded.';
comment on column orders.provider_payment_id is 'PayMongo payment id (pay_...) used to send refunds.';


-- ── 3. Refund history ───────────────────────────────────────────────────────
create table if not exists order_refunds (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references orders (id) on delete cascade,

  -- 'cancel' = the whole order was cancelled; 'refund' = return / partial refund
  kind               text not null check (kind in ('cancel', 'refund')),

  -- Pesos given back in this step (0 is allowed, e.g. cancelling an unpaid order)
  amount             numeric(10, 2) not null default 0 check (amount >= 0),

  -- How the money went back:
  --   'paymongo' → sent automatically through PayMongo's refund API
  --   'manual'   → staff refunded outside the website (Maya Manager, GCash, cash…)
  --   'none'     → no money returned (unpaid order, or store credit)
  method             text not null check (method in ('paymongo', 'manual', 'none')),

  reason             text,
  note               text,

  -- PayMongo's id + status for the refund (only when method = 'paymongo')
  provider_refund_id text,
  provider_status    text,

  -- Items that came back: [{ "variant_id": "...", "quantity": 1, "restock_channel": "online" }]
  -- restock_channel null = item NOT put back in stock (e.g. damaged)
  items              jsonb not null default '[]'::jsonb,

  created_by         uuid references auth.users (id) on delete set null,
  created_by_email   text,
  created_at         timestamptz not null default now()
);

create index if not exists order_refunds_order_id_idx on order_refunds (order_id);

comment on table order_refunds is
  'History of cancellations and refunds. Written only by /api/admin-order.js.';

alter table order_refunds enable row level security;

-- Admins can read the history (the admin Orders page shows it).
-- Nobody can write from the browser — only the server, which skips RLS.
drop policy if exists "Admins can read order refunds" on order_refunds;
create policy "Admins can read order refunds"
  on order_refunds for select
  using (public.is_admin());


-- ── 4. adjust_stock(): add/subtract stock in one safe step ──────────────────
-- Example: select adjust_stock('<variant id>', 'online', 2);  → +2 online
-- Never goes below 0. Creates the stock row if it doesn't exist yet.
-- Returns the new quantity.
create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_channel    text,
  p_delta      integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_qty integer;
begin
  insert into inventory (variant_id, channel, quantity)
  values (p_variant_id, p_channel, greatest(0, p_delta))
  on conflict (variant_id, channel)
  do update set quantity   = greatest(0, inventory.quantity + p_delta),
                updated_at = now()
  returning quantity into new_qty;
  return new_qty;
end;
$$;

-- Only the server (service role) may call it — not visitors, not customers.
revoke execute on function public.adjust_stock(uuid, text, integer) from public, anon, authenticated;
grant  execute on function public.adjust_stock(uuid, text, integer) to service_role;

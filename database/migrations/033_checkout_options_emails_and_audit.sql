-- =============================================================================
-- MIGRATION 033 — Checkout options, customer notes, vouchers, audit log
-- =============================================================================
-- Run this in the Supabase SQL Editor (safe to run more than once).
--
-- What it adds:
--   1. orders:  customer_notes (what the shopper typed — separate from staff
--               notes), payment_method (maya / cod), shipping_method
--               (delivery / pickup), pickup_store_id, shipping_zone,
--               subtotal_amount, shipping_fee, discount_amount, discount_label,
--               stock_deducted (so we never take stock twice, and know what to
--               put back on cancel), and an 'expired' payment status for
--               abandoned checkouts.
--   2. order_items.brand_id  → so reports can split mixed Ducks + Rocwood bags.
--   3. variants.color_hex    → real swatch colours instead of grey circles.
--   4. products.fit_notes / care_notes → per-product "Fit & Sizing" and "Care".
--   5. stores.allows_pickup  → which branches accept "pick up in store".
--   6. discount_codes table  → voucher codes used at checkout.
--   7. admin_log table + triggers → who changed a price, stock, or order status.
--   8. deduct_stock_for_order() → takes an order's items out of online stock in
--      one call and reports anything that was oversold.
--   9. A trigger that only lets fulfillment move FORWARD
--      (pending → packed → shipped → delivered), except for cancelling.
-- =============================================================================


-- ── 1. orders ────────────────────────────────────────────────────────────────

alter table orders
  add column if not exists customer_notes    text,
  add column if not exists payment_method    text not null default 'maya',
  add column if not exists shipping_method   text not null default 'delivery',
  add column if not exists pickup_store_id   uuid references stores (id) on delete set null,
  add column if not exists shipping_zone     text,
  add column if not exists subtotal_amount   numeric(10, 2),
  add column if not exists shipping_fee      numeric(10, 2) not null default 0,
  add column if not exists discount_amount   numeric(10, 2) not null default 0,
  add column if not exists discount_label    text,
  add column if not exists stock_deducted    boolean not null default false,
  add column if not exists cod_paid_at       timestamptz;

comment on column orders.customer_notes  is 'What the shopper typed in "Anything we should know?" at checkout. Shown on the packing slip.';
comment on column orders.payment_method  is 'maya = paid online through Maya Checkout · cod = cash on delivery / pay at pickup · paymongo = older orders';
comment on column orders.shipping_method is 'delivery = courier to the address · pickup = collect at pickup_store_id';
comment on column orders.shipping_zone   is 'metro_manila / luzon / visayas / mindanao — decides the shipping fee';
comment on column orders.discount_label  is 'Human text for the discount line, e.g. "Member 10%" or "Code WELCOME10"';
comment on column orders.stock_deducted  is 'true once the items were taken out of online stock (on payment, or at once for COD).';

alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('maya', 'cod', 'paymongo'));

alter table orders drop constraint if exists orders_shipping_method_check;
alter table orders add constraint orders_shipping_method_check
  check (shipping_method in ('delivery', 'pickup'));

-- Abandoned checkouts become 'expired' (see /api/expire-orders)
alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check
  check (payment_status in ('pending', 'paid', 'failed', 'expired'));

-- Backfill older rows so reports don't see nulls
update orders set payment_method = 'paymongo'
 where payment_method = 'maya' and (payment_provider = 'paymongo' or (payment_provider is null and paymongo_payment_id is not null));
update orders set stock_deducted = true where payment_status = 'paid' and stock_deducted = false;
update orders o
   set subtotal_amount = coalesce((select sum(oi.price_at_purchase * oi.quantity) from order_items oi where oi.order_id = o.id), o.total_amount),
       shipping_fee    = greatest(0, o.total_amount - coalesce((select sum(oi.price_at_purchase * oi.quantity) from order_items oi where oi.order_id = o.id), o.total_amount))
 where o.subtotal_amount is null;

create index if not exists orders_payment_method_idx on orders (payment_method);


-- ── 2. order_items.brand_id ──────────────────────────────────────────────────

alter table order_items add column if not exists brand_id uuid references brands (id);

update order_items oi
   set brand_id = p.brand_id
  from variants v join products p on p.id = v.product_id
 where v.id = oi.variant_id and oi.brand_id is null;

create index if not exists order_items_brand_id_idx on order_items (brand_id);


-- ── 3. variants.color_hex ────────────────────────────────────────────────────

alter table variants add column if not exists color_hex text
  check (color_hex is null or color_hex ~ '^#[0-9a-fA-F]{6}$');

comment on column variants.color_hex is 'Swatch colour like #1B4D2E. Set once per colour name in the admin; the storefront falls back to a built-in list when empty.';


-- ── 4. products.fit_notes / care_notes ───────────────────────────────────────

alter table products
  add column if not exists fit_notes  text,
  add column if not exists care_notes text;

comment on column products.fit_notes  is 'Shown under "Fit & Sizing" on the product page. Empty = category default.';
comment on column products.care_notes is 'Shown under "Care" on the product page. Empty = category default.';


-- ── 5. stores.allows_pickup ──────────────────────────────────────────────────

alter table stores add column if not exists allows_pickup boolean not null default true;


-- ── 6. discount_codes ────────────────────────────────────────────────────────

create table if not exists discount_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                      -- stored UPPERCASE
  kind         text not null check (kind in ('percent', 'fixed', 'free_shipping')),
  value        numeric(10, 2) not null default 0 check (value >= 0),  -- 10 = 10% or ₱10
  min_subtotal numeric(10, 2) not null default 0,
  starts_at    timestamptz,
  ends_at      timestamptz,
  max_uses     integer,                                   -- null = unlimited
  uses         integer not null default 0,
  is_active    boolean not null default true,
  brand_id     uuid references brands (id) on delete set null,  -- null = both brands
  note         text,
  created_at   timestamptz not null default now()
);

comment on table discount_codes is 'Voucher codes typed at checkout. The server (/api/create-payment) checks and applies them.';

alter table discount_codes enable row level security;

drop policy if exists "Admins manage discount codes" on discount_codes;
create policy "Admins manage discount codes"
  on discount_codes for all
  using (public.is_admin())
  with check (public.is_admin());
-- Shoppers never read this table directly; the server validates codes with the
-- service-role key, so a code list can't be scraped.


-- ── 7. admin_log + triggers ──────────────────────────────────────────────────

create table if not exists admin_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  table_name  text not null,
  row_id      uuid,
  action      text not null,          -- 'price', 'visibility', 'stock', 'fulfillment', 'payment', 'insert', 'delete'
  summary     jsonb                   -- small before/after, e.g. {"from": 877, "to": 899}
);

comment on table admin_log is 'Who changed what in the admin. Filled by database triggers, never by the browser.';

create index if not exists admin_log_created_at_idx on admin_log (created_at desc);
create index if not exists admin_log_row_id_idx     on admin_log (row_id);

alter table admin_log enable row level security;

drop policy if exists "Admins can read the log" on admin_log;
create policy "Admins can read the log"
  on admin_log for select
  using (public.is_admin());
-- No insert/update/delete policy: only the triggers below (SECURITY DEFINER) write.

-- Who is making the change? Admins come through with their JWT; the server
-- (service role) has no JWT, so it's logged as 'server'.
create or replace function public.log_admin_change(
  p_table text, p_row uuid, p_action text, p_summary jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into admin_log (actor_id, actor_email, table_name, row_id, action, summary)
  values (
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', 'server'),
    p_table, p_row, p_action, p_summary
  );
end;
$$;

create or replace function public.trg_log_products()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_admin_change('products', new.id, 'insert', jsonb_build_object('name', new.name, 'price', new.base_price));
  elsif tg_op = 'DELETE' then
    perform log_admin_change('products', old.id, 'delete', jsonb_build_object('name', old.name));
  else
    if new.base_price is distinct from old.base_price then
      perform log_admin_change('products', new.id, 'price', jsonb_build_object('name', new.name, 'from', old.base_price, 'to', new.base_price));
    end if;
    if new.is_active is distinct from old.is_active then
      perform log_admin_change('products', new.id, 'visibility', jsonb_build_object('name', new.name, 'visible', new.is_active));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists products_admin_log on products;
create trigger products_admin_log
  after insert or update or delete on products
  for each row execute function public.trg_log_products();

create or replace function public.trg_log_inventory()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.quantity is distinct from old.quantity then
    perform log_admin_change('inventory', new.variant_id, 'stock',
      jsonb_build_object('channel', new.channel, 'from', old.quantity, 'to', new.quantity));
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_admin_log on inventory;
create trigger inventory_admin_log
  after update on inventory
  for each row execute function public.trg_log_inventory();

create or replace function public.trg_log_orders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fulfillment_status is distinct from old.fulfillment_status then
    perform log_admin_change('orders', new.id, 'fulfillment',
      jsonb_build_object('order', new.order_number, 'from', old.fulfillment_status, 'to', new.fulfillment_status));
  end if;
  if new.payment_status is distinct from old.payment_status then
    perform log_admin_change('orders', new.id, 'payment',
      jsonb_build_object('order', new.order_number, 'from', old.payment_status, 'to', new.payment_status));
  end if;
  return new;
end;
$$;

drop trigger if exists orders_admin_log on orders;
create trigger orders_admin_log
  after update on orders
  for each row execute function public.trg_log_orders();


-- ── 8. deduct_stock_for_order() ──────────────────────────────────────────────
-- Takes every item of the order out of ONLINE stock in one go, marks the order
-- stock_deducted, and returns a list of anything that was oversold (stock was
-- lower than the quantity bought). Does nothing if the stock was already taken.
--
--   select deduct_stock_for_order('<order id>');
--   → [{"variant_id": "...", "wanted": 2, "had": 1}]   (empty array = all fine)

create or replace function public.deduct_stock_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it       record;
  had      integer;
  oversold jsonb := '[]'::jsonb;
  already  boolean;
begin
  select stock_deducted into already from orders where id = p_order_id for update;
  if already is null then
    raise exception 'Order % not found', p_order_id;
  end if;
  if already then
    return oversold;   -- nothing to do twice
  end if;

  for it in select variant_id, quantity from order_items where order_id = p_order_id loop
    -- Lock the row so two payments can't both read the same number
    select quantity into had from inventory
     where variant_id = it.variant_id and channel = 'online' for update;

    if had is null then
      had := 0;
      insert into inventory (variant_id, channel, quantity) values (it.variant_id, 'online', 0)
      on conflict (variant_id, channel) do nothing;
    end if;

    if had < it.quantity then
      oversold := oversold || jsonb_build_object('variant_id', it.variant_id, 'wanted', it.quantity, 'had', had);
    end if;

    update inventory
       set quantity = greatest(0, quantity - it.quantity), updated_at = now()
     where variant_id = it.variant_id and channel = 'online';
  end loop;

  update orders set stock_deducted = true where id = p_order_id;
  return oversold;
end;
$$;

revoke execute on function public.deduct_stock_for_order(uuid) from public, anon, authenticated;
grant  execute on function public.deduct_stock_for_order(uuid) to service_role;


-- ── 9. Fulfillment only moves forward ────────────────────────────────────────
-- pending(0) → packed(1) → shipped(2) → delivered(3). Cancelling is allowed
-- from any step (the cancel API decides whether that makes sense), and a
-- cancelled order never changes again.

create or replace function public.trg_fulfillment_forward_only()
returns trigger language plpgsql as $$
declare
  rank_old integer;
  rank_new integer;
begin
  if new.fulfillment_status is not distinct from old.fulfillment_status then
    return new;
  end if;
  if old.fulfillment_status = 'cancelled' then
    raise exception 'This order is cancelled and cannot change status.';
  end if;
  if new.fulfillment_status = 'cancelled' then
    return new;
  end if;
  rank_old := array_position(array['pending','packed','shipped','delivered'], old.fulfillment_status);
  rank_new := array_position(array['pending','packed','shipped','delivered'], new.fulfillment_status);
  if rank_new is null or rank_old is null or rank_new < rank_old then
    raise exception 'Orders only move forward: pending → packed → shipped → delivered (tried % → %).',
      old.fulfillment_status, new.fulfillment_status;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_fulfillment_forward_only on orders;
create trigger orders_fulfillment_forward_only
  before update of fulfillment_status on orders
  for each row execute function public.trg_fulfillment_forward_only();


-- ── Starter voucher (edit or delete in Admin → Vouchers) ─────────────────────
-- Added SWITCHED OFF (is_active = false) on purpose: a working 10%-off code
-- should not exist until the owner decides to use it. To turn it on, open
-- Admin → Vouchers and switch it to active.
insert into discount_codes (code, kind, value, min_subtotal, note, is_active)
values ('WELCOME10', 'percent', 10, 1000, 'Sample code — 10% off orders of ₱1,000 or more (switched off until you turn it on)', false)
on conflict (code) do nothing;

-- =============================================================================
-- END OF MIGRATION 033
-- =============================================================================

-- ── 10. products.is_featured ─────────────────────────────────────────────────
-- Tick "Feature on homepage" in Admin → Products to hand-pick what the
-- homepage Product Grid shows (Homepage builder → "Which products?" → Featured).
alter table products add column if not exists is_featured boolean not null default false;
create index if not exists products_featured_idx on products (is_featured) where is_featured;

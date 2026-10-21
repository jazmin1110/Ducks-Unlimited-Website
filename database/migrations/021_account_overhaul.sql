-- =============================================================================
-- Migration 021 — Customer account overhaul
-- =============================================================================
-- What this fixes / adds:
--
--   1. orders.user_id — orders now belong to an account by ID, not by email.
--      Before, a customer could read any order whose email matched theirs.
--      Because email confirmation is off, someone could sign up with another
--      person's email address and read that person's orders (name, phone,
--      home address). Linking by user_id closes that hole.
--
--   2. Status timestamps (paid_at, shipped_at, delivered_at) so the account
--      page can show a real tracking timeline ("Shipped Oct 21").
--      A trigger fills them in automatically when the status changes, so the
--      admin panel and the PayMongo webhook don't need any changes.
--
--   3. Customers can insert their own profile row (the profile page creates
--      one if it's missing; before, there was no INSERT policy so it failed).
--
--   4. Removes the "anyone can insert" policies on orders / order_items.
--      Orders are created ONLY by /api/create-payment using the service-role
--      key (which skips RLS). Leaving the public INSERT open let anyone write
--      fake orders straight into the database with any price.
--
-- Safe to run more than once.
-- =============================================================================


-- ── 1. Link orders to accounts ──────────────────────────────────────────────

alter table orders
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists orders_user_id_idx on orders (user_id);

comment on column orders.user_id is
  'Account that placed (or claimed) the order. Null for guest checkouts.';

-- One-time backfill: attach existing orders to the account with the same email.
update orders o
set    user_id = u.id
from   auth.users u
where  o.user_id is null
  and  lower(o.customer_email) = lower(u.email);


-- ── 2. Status timestamps for the tracking timeline ──────────────────────────

alter table orders
  add column if not exists paid_at      timestamptz,
  add column if not exists packed_at    timestamptz,
  add column if not exists shipped_at   timestamptz,
  add column if not exists delivered_at timestamptz;

-- Fills in the matching *_at column the first time a status is reached.
create or replace function public.stamp_order_status_times()
returns trigger
language plpgsql
as $$
begin
  if new.payment_status = 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;
  if new.fulfillment_status in ('packed', 'shipped', 'delivered') and new.packed_at is null then
    new.packed_at := now();
  end if;
  if new.fulfillment_status in ('shipped', 'delivered') and new.shipped_at is null then
    new.shipped_at := now();
  end if;
  if new.fulfillment_status = 'delivered' and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stamp_status_times on orders;
create trigger orders_stamp_status_times
  before insert or update of payment_status, fulfillment_status on orders
  for each row execute procedure public.stamp_order_status_times();


-- ── 3. Customer-facing read policies (by user_id) ───────────────────────────

drop policy if exists "Customers can read their own orders" on orders;
create policy "Customers can read their own orders"
  on orders for select
  using (user_id = auth.uid());

drop policy if exists "Customers can read items from their own orders" on order_items;
create policy "Customers can read items from their own orders"
  on order_items for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.user_id = auth.uid()
    )
  );


-- ── 4. Close the public order-insert hole ───────────────────────────────────

drop policy if exists "Anyone can place an order"     on orders;
drop policy if exists "Anyone can insert order items" on order_items;


-- ── 5. Profile insert policy ────────────────────────────────────────────────

drop policy if exists "Customers can create their own profile" on customer_profiles;
create policy "Customers can create their own profile"
  on customer_profiles for insert
  with check (auth.uid() = id);


-- ── 6. Sign-up trigger: also copy the marketing opt-in checkbox ─────────────
-- The sign-up form sends { display_name, marketing_opt_in } as user metadata.
-- Stores display_name as-is (no longer falls back to the email address, which
-- made the account page greet people as "Welcome back, juan@gmail.com").

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_profiles (id, display_name, marketing_opt_in)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

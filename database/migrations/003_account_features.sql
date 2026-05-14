-- =============================================================================
-- Migration 003 — Account Features (Phase 3)
-- =============================================================================
-- Adds tables that back the Ducks Unlimited customer account area:
--
--   * customer_profiles      — extends auth.users with a display name + phone
--   * wishlists              — saved products per signed-in customer
--   * customer_addresses     — saved shipping addresses
--   * newsletter_subscribers — emails captured by the footer newsletter form
--
-- Auth itself is provided by Supabase Auth (already enabled by default).
-- Make sure email signup is on in Authentication → Providers.
--
-- Run this in the Supabase SQL editor top to bottom.
-- =============================================================================


-- =============================================================================
-- CUSTOMER PROFILES
-- One row per signed-in customer. Extends auth.users with non-auth fields.
-- A row is auto-created via trigger on signup so the rest of the app can
-- always assume it exists.
-- =============================================================================

create table customer_profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table customer_profiles is
  'Extends auth.users with display name + phone. Row created on signup via trigger.';

-- Trigger: create a profile row whenever a new user signs up
create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_customer();


-- =============================================================================
-- WISHLISTS
-- A signed-in customer's saved products. Unique on (user, product) so a
-- product can only be saved once per customer.
-- =============================================================================

create table wishlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  product_id  uuid not null references products (id) on delete cascade,
  created_at  timestamptz not null default now(),

  unique (user_id, product_id)
);

create index wishlists_user_id_idx on wishlists (user_id);

comment on table wishlists is
  'Saved products per signed-in customer. Signed-out wishlists live in localStorage.';


-- =============================================================================
-- CUSTOMER ADDRESSES
-- Saved shipping addresses. Customers can have many; one can be default.
-- =============================================================================

create table customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,

  -- Friendly label so customers can tell addresses apart ("Home", "Office")
  label         text,

  recipient_name text not null,
  phone          text not null,

  line1         text not null,
  line2         text,
  barangay      text,
  city          text not null,
  province      text not null,
  postal_code   text,
  country       text not null default 'PH',

  is_default    boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index customer_addresses_user_id_idx on customer_addresses (user_id);

-- Only one default address per customer
create unique index customer_addresses_one_default_per_user
  on customer_addresses (user_id) where is_default = true;

comment on table customer_addresses is
  'Saved shipping addresses. At most one row per user has is_default = true.';


-- =============================================================================
-- NEWSLETTER SUBSCRIBERS
-- Emails captured by the footer newsletter form. Not tied to auth so anyone
-- can sign up without creating an account.
-- =============================================================================

create table newsletter_subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  -- 'pending' until double-opt-in is implemented; later: 'active' / 'unsubscribed'
  status          text not null default 'pending'
                    check (status in ('pending', 'active', 'unsubscribed')),
  source          text,           -- 'footer', 'checkout', 'popup'…
  subscribed_at   timestamptz not null default now()
);

comment on table newsletter_subscribers is
  'Email signups from the footer form. Public can insert; only admins can read.';


-- =============================================================================
-- ROW LEVEL SECURITY
-- Enable on every new table. Customers can only see/edit their own data.
-- Admins (controlled by admin_users) can read everything.
-- =============================================================================

alter table customer_profiles      enable row level security;
alter table wishlists              enable row level security;
alter table customer_addresses     enable row level security;
alter table newsletter_subscribers enable row level security;


-- ── Helper: is the calling user an admin? ────────────────────────────────────
-- Reuses the admin_users table from the original schema.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where id = auth.uid()
  );
$$;


-- ── customer_profiles policies ───────────────────────────────────────────────

create policy "Customers can read their own profile"
  on customer_profiles for select
  using (auth.uid() = id);

create policy "Customers can update their own profile"
  on customer_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Admins can read all profiles"
  on customer_profiles for select
  using (public.is_admin());


-- ── wishlists policies ───────────────────────────────────────────────────────

create policy "Customers can read their own wishlist"
  on wishlists for select
  using (auth.uid() = user_id);

create policy "Customers can add to their own wishlist"
  on wishlists for insert
  with check (auth.uid() = user_id);

create policy "Customers can remove from their own wishlist"
  on wishlists for delete
  using (auth.uid() = user_id);


-- ── customer_addresses policies ──────────────────────────────────────────────

create policy "Customers can read their own addresses"
  on customer_addresses for select
  using (auth.uid() = user_id);

create policy "Customers can insert their own addresses"
  on customer_addresses for insert
  with check (auth.uid() = user_id);

create policy "Customers can update their own addresses"
  on customer_addresses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Customers can delete their own addresses"
  on customer_addresses for delete
  using (auth.uid() = user_id);


-- ── newsletter_subscribers policies ──────────────────────────────────────────
-- Anyone can subscribe; only admins can read the list.

create policy "Anyone can subscribe to the newsletter"
  on newsletter_subscribers for insert
  with check (true);

create policy "Admins can read newsletter subscribers"
  on newsletter_subscribers for select
  using (public.is_admin());

create policy "Admins can update newsletter subscribers"
  on newsletter_subscribers for update
  using (public.is_admin());

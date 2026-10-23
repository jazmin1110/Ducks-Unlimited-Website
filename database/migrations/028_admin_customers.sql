-- =============================================================================
-- Migration 028 — Admin "Customers" page
-- =============================================================================
-- What this adds:
--
--   1. admin_list_customers() — one row per customer for /admin/customers.html.
--      A "customer" is either:
--        * someone with an account (customer_profiles + their sign-in email), or
--        * a guest who checked out without an account (grouped by email).
--      If a guest order's email matches an account's email, that order is
--      counted under the account, so the same person doesn't show up twice.
--
--      Why a function and not a plain table read? Account emails live in
--      auth.users, which the browser can't read. This function runs with extra
--      rights ("security definer") but FIRST checks is_admin(), so only admins
--      ever get data back.
--
--   2. Admins can read customers' saved addresses (shown on the detail view).
--      Read-only — admins still can't change or delete them.
--
-- Money rules (same as the rest of the admin):
--   * Only PAID orders count toward "orders" and "total spent".
--   * Refunds are taken off: spent = total_amount - refunded_amount.
--
-- Safe to run more than once.
-- =============================================================================


-- ── 1. The customer list ────────────────────────────────────────────────────

create or replace function public.admin_list_customers()
returns table (
  customer_key     text,         -- user id for accounts, 'guest:<email>' for guests
  user_id          uuid,         -- null for guests
  name             text,
  email            text,
  phone            text,
  has_account      boolean,
  joined_at        timestamptz,  -- sign-up date (accounts) or first order (guests)
  marketing_opt_in boolean,
  birthday         date,
  paid_orders      bigint,
  total_spent      numeric,
  last_order_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Only admins. Everyone else gets an error, not data.
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  return query
  with accounts as (
    select p.id                                  as user_id,
           lower(u.email)                        as email_lc,
           u.email::text                         as email,
           p.display_name,
           p.phone,
           p.created_at,
           p.marketing_opt_in,
           p.birthday
    from customer_profiles p
    join auth.users u on u.id = p.id
    -- Staff accounts are not customers
    where not exists (select 1 from admin_users a where a.id = p.id)
  ),
  -- Decide which "customer" each order belongs to
  tagged as (
    select o.*,
           coalesce(o.user_id::text, acc.user_id::text, 'guest:' || lower(o.customer_email)) as ckey
    from orders o
    left join accounts acc
           on o.user_id is null and acc.email_lc = lower(o.customer_email)
  ),
  totals as (
    select t.ckey,
           count(*) filter (where t.payment_status = 'paid')                                  as paid_orders,
           coalesce(sum(t.total_amount - t.refunded_amount)
                    filter (where t.payment_status = 'paid'), 0)                              as total_spent,
           max(t.created_at)                                                                  as last_order_at,
           min(t.created_at)                                                                  as first_order_at,
           -- Most recent name / phone the guest typed at checkout
           (array_agg(t.customer_name  order by t.created_at desc))[1]                        as last_name,
           (array_agg(t.customer_phone order by t.created_at desc)
              filter (where t.customer_phone is not null and t.customer_phone <> ''))[1]      as last_phone,
           (array_agg(t.customer_email order by t.created_at desc))[1]                        as last_email
    from tagged t
    group by t.ckey
  )
  -- Account holders (even ones with no orders yet)
  select a.user_id::text,
         a.user_id,
         coalesce(nullif(a.display_name, ''), tt.last_name, a.email),
         a.email,
         coalesce(nullif(a.phone, ''), tt.last_phone),
         true,
         a.created_at,
         a.marketing_opt_in,
         a.birthday,
         coalesce(tt.paid_orders, 0),
         coalesce(tt.total_spent, 0),
         tt.last_order_at
  from accounts a
  left join totals tt on tt.ckey = a.user_id::text

  union all

  -- Guests (no account with that email)
  select tt.ckey,
         null::uuid,
         tt.last_name,
         tt.last_email,
         tt.last_phone,
         false,
         tt.first_order_at,
         null::boolean,
         null::date,
         tt.paid_orders,
         tt.total_spent,
         tt.last_order_at
  from totals tt
  where tt.ckey like 'guest:%';
end;
$$;

-- The browser calls this with the signed-in user's token; the is_admin()
-- check inside does the real gatekeeping.
revoke all on function public.admin_list_customers() from public, anon;
grant execute on function public.admin_list_customers() to authenticated;


-- ── 2. Admins can read saved addresses ──────────────────────────────────────

drop policy if exists "Admins can read all addresses" on customer_addresses;
create policy "Admins can read all addresses"
  on customer_addresses for select
  using (public.is_admin());

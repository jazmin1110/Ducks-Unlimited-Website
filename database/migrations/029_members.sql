-- =============================================================================
-- Migration 029 — Store membership (replaces the Microsoft Access list)
-- =============================================================================
-- What this adds:
--
--   1. members — one row per store member (the physical card holders).
--        member_number  the number printed on their card (kept as-is from Access)
--        tier           'member' (10% off) or 'elite' (20% off)
--        phone_key      the last 10 digits of their mobile number, filled in
--                       automatically. Used to match the same person across
--                       the stores, the website and Oboda no matter how the
--                       number was typed (0917…, +63917…, 917…).
--        user_id        their website account, when we can match one
--
--   2. admin_link_member_accounts() — matches members to website accounts by
--      mobile number or email, and fills in user_id. Runs after every import.
--
-- Who can see what:
--   * Admins can read and change every member.
--   * A customer can read their own member row (for a digital card later).
--
-- Safe to run more than once.
-- =============================================================================


-- ── 1. The members table ────────────────────────────────────────────────────

create table if not exists members (
  id             uuid primary key default gen_random_uuid(),
  member_number  text not null unique,
  name           text not null,
  phone          text,
  phone_key      text generated always as (
                   nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), '')
                 ) stored,
  email          text,
  tier           text not null default 'member' check (tier in ('member', 'elite')),
  member_since   date,
  elite_since    date,
  user_id        uuid references auth.users (id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table members is
  'Store membership card holders. Member = 10% off, Elite = 20% off, lifetime.';
comment on column members.member_number is
  'Number printed on the physical card. Also used as the customer Code in Oboda.';
comment on column members.phone_key is
  'Last 10 digits of the mobile number (auto). Used for matching across systems.';

create index if not exists members_phone_key_idx on members (phone_key);
create index if not exists members_email_idx     on members (lower(email));
-- One website account ↔ at most one member
create unique index if not exists members_user_id_idx on members (user_id) where user_id is not null;

-- Keep updated_at current on every edit
create or replace function public.touch_members_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists members_touch_updated_at on members;
create trigger members_touch_updated_at
  before update on members
  for each row execute procedure public.touch_members_updated_at();


-- ── 2. Who can see / change members ─────────────────────────────────────────

alter table members enable row level security;

drop policy if exists "Admins can read members"   on members;
drop policy if exists "Admins can add members"    on members;
drop policy if exists "Admins can update members" on members;
drop policy if exists "Admins can delete members" on members;
drop policy if exists "Customers can read their own membership" on members;

create policy "Admins can read members"
  on members for select using (public.is_admin());
create policy "Admins can add members"
  on members for insert with check (public.is_admin());
create policy "Admins can update members"
  on members for update using (public.is_admin());
create policy "Admins can delete members"
  on members for delete using (public.is_admin());

create policy "Customers can read their own membership"
  on members for select using (user_id = auth.uid());


-- ── 3. Match members to website accounts ────────────────────────────────────
-- For each member with no linked account yet, look for exactly ONE website
-- account with the same mobile number (or, failing that, the same email).
-- If two accounts match, we skip it rather than guess.
-- Returns how many members were newly linked.

create or replace function public.admin_link_member_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  linked integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  with accounts as (
    select p.id as user_id,
           nullif(right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10), '') as phone_key,
           lower(u.email) as email_lc
    from customer_profiles p
    join auth.users u on u.id = p.id
    where not exists (select 1 from admin_users a where a.id = p.id)
  ),
  matches as (
    select m.id as member_id,
           -- Mobile number match first, then email
           coalesce(
             (select case when count(*) = 1 then min(a.user_id::text) end
                from accounts a where m.phone_key is not null and a.phone_key = m.phone_key),
             (select case when count(*) = 1 then min(a.user_id::text) end
                from accounts a where m.email is not null and a.email_lc = lower(m.email))
           )::uuid as user_id
    from members m
    where m.user_id is null
  ),
  -- If two members point at the same account, skip both rather than guess
  safe as (
    select member_id, user_id,
           count(*) over (partition by user_id) as members_matching
    from matches
    where user_id is not null
  )
  update members m
  set    user_id = s.user_id
  from   safe s
  where  m.id = s.member_id
    and  s.members_matching = 1
    -- An account can belong to only one member
    and  not exists (select 1 from members m2 where m2.user_id = s.user_id);

  get diagnostics linked = row_count;
  return linked;
end;
$$;

revoke all on function public.admin_link_member_accounts() from public, anon;
grant execute on function public.admin_link_member_accounts() to authenticated;

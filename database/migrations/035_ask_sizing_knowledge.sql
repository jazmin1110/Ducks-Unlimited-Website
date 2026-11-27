-- =============================================================================
-- Migration 035 — Smarter "Ask us" helper
-- =============================================================================
-- What this adds:
--
--   1. size_reference — other brands' size charts (Uniqlo, H&M, Lacoste ...).
--        The /api/ask helper compares these with OUR size guide
--        (public/size-guide.html) so it can answer
--        "I'm M in Uniqlo, what am I in Ducks?" with real numbers.
--        chest_min_cm / chest_max_cm are ALWAYS a full circumference (around
--        the body), in cm.
--          measure_type = 'body'    → the brand's chart says which body it fits
--          measure_type = 'garment' → the brand only lists the shirt itself
--                                     (we store body width × 2). The helper
--                                     estimates the body that fits it.
--
--   2. ask_knowledge — your own question + answer pairs ("Is the white polo
--      see-through?"). The helper reads every active one. Add them from
--      Admin → Ask helper.
--
--   3. ask_logs — every question customers type, the answer they got, and
--      whether the helper had to say "not sure". Admin → Ask helper shows the
--      "not sure" ones so you can add answers.
--      Only admins can read it. Nothing personal is stored beyond what the
--      customer typed.
--
-- Who can see what:
--   * Only admins can read or change these tables from the browser.
--   * /api/ask uses the server key, so it can read them and add log rows.
--
-- Safe to run more than once.
-- =============================================================================


-- ── 1. Other brands' size charts ────────────────────────────────────────────

create table if not exists size_reference (
  id            uuid primary key default gen_random_uuid(),
  brand         text not null,                       -- 'Uniqlo', 'H&M' ...
  fit           text not null default 'regular'
                  check (fit in ('slim', 'regular', 'relaxed')),
  category      text not null default 'tops'
                  check (category in ('tops', 'polo', 't-shirt')),
  size          text not null,                       -- 'M', 'XL', '2XL' ...
  measure_type  text not null default 'body'
                  check (measure_type in ('body', 'garment')),
  chest_min_cm  numeric(5,1) not null,
  chest_max_cm  numeric(5,1) not null,
  sort_order    int  not null default 0,             -- XS=1, S=2, M=3 ...
  source_url    text,                                -- where the numbers came from
  source_note   text,
  checked_on    date default current_date,           -- when someone last checked it
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint size_reference_range check (chest_max_cm >= chest_min_cm),
  constraint size_reference_unique unique (brand, fit, category, size)
);

comment on table size_reference is
  'Other brands'' size charts. /api/ask compares them with our size guide.';
comment on column size_reference.chest_min_cm is
  'Chest circumference in cm. For garment charts: the shirt''s body width x 2.';


-- ── 2. Your own Q&A ─────────────────────────────────────────────────────────

create table if not exists ask_knowledge (
  id             uuid primary key default gen_random_uuid(),
  brand          text check (brand in ('du', 'rw')),  -- empty = both brands
  question       text not null,
  answer         text not null,
  is_active      boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table ask_knowledge is
  'Question + answer pairs the Ask helper reads. Empty brand = both brands.';


-- ── 3. What customers asked ─────────────────────────────────────────────────

create table if not exists ask_logs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  brand        text,                 -- 'du' or 'rw' (which site they were on)
  product_id   uuid,                 -- the product page they were on, if any
  question     text not null,
  answer       text,
  not_sure     boolean not null default false,  -- helper couldn't answer from what it knows
  resolved     boolean not null default false   -- an admin dealt with it
);

comment on table ask_logs is
  'Questions typed into the Ask bubble. not_sure = the helper had no answer.';

create index if not exists ask_logs_created_idx  on ask_logs (created_at desc);
create index if not exists ask_logs_open_idx     on ask_logs (created_at desc) where not_sure and not resolved;


-- ── Keep updated_at current on every edit ──────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists size_reference_touch on size_reference;
create trigger size_reference_touch before update on size_reference
  for each row execute procedure public.touch_updated_at();

drop trigger if exists ask_knowledge_touch on ask_knowledge;
create trigger ask_knowledge_touch before update on ask_knowledge
  for each row execute procedure public.touch_updated_at();


-- ── Who can see / change them: admins only ─────────────────────────────────

alter table size_reference enable row level security;
alter table ask_knowledge  enable row level security;
alter table ask_logs       enable row level security;

drop policy if exists "Admins manage size_reference" on size_reference;
create policy "Admins manage size_reference" on size_reference
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage ask_knowledge" on ask_knowledge;
create policy "Admins manage ask_knowledge" on ask_knowledge
  for all using (public.is_admin()) with check (public.is_admin());

-- Logs: admins can read, tick "resolved", and delete. New rows only come from
-- /api/ask (server key), so there is no insert policy for browsers.
drop policy if exists "Admins read ask_logs"   on ask_logs;
drop policy if exists "Admins update ask_logs" on ask_logs;
drop policy if exists "Admins delete ask_logs" on ask_logs;
create policy "Admins read ask_logs"   on ask_logs for select using (public.is_admin());
create policy "Admins update ask_logs" on ask_logs for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete ask_logs" on ask_logs for delete using (public.is_admin());

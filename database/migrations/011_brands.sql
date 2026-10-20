-- =============================================================================
-- Migration 011 — Multi-brand foundation
-- =============================================================================
-- Introduces the concept of brands (Ducks Unlimited + Rocwood) across the
-- schema. All existing rows are backfilled to Ducks Unlimited so nothing
-- breaks. Run top to bottom in the Supabase SQL Editor.
-- =============================================================================


-- =============================================================================
-- BRANDS
-- One row per brand sold through this site. Admins can add more later without
-- a schema change.
-- =============================================================================

create table brands (
  id            uuid primary key default gen_random_uuid(),

  -- URL-safe short code used in paths and product filtering.
  -- 'du' = Ducks Unlimited, 'rw' = Rocwood.
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),

  -- Human-readable name shown in nav, receipts, emails
  name          text not null,

  -- One-line brand tagline (optional) shown under the logo
  tagline       text,

  -- CSS color token (hex) applied as the brand's accent across the site.
  -- Nav underline, buttons, badges, etc. Fallback: Ducks' muted gold.
  accent_color  text not null default '#C9A84C',

  -- Primary / headline color (hex). Logo, headings. Fallback: forest green.
  primary_color text not null default '#1B4D2E',

  -- Prefix for order numbers of this brand's orders ('DU' / 'RW' etc.)
  order_prefix  text not null unique check (order_prefix ~ '^[A-Z]{2,4}$'),

  -- Toggle whether the brand is live on the storefront
  is_active     boolean not null default true,

  -- Display order (smaller = earlier in brand switcher)
  display_order integer not null default 0,

  created_at    timestamptz not null default now()
);

comment on table brands is
  'One row per brand (Ducks Unlimited, Rocwood). Drives storefront theming and product filtering.';


-- Seed the two brands we know about today
insert into brands (slug, name, tagline, accent_color, primary_color, order_prefix, display_order) values
  ('du', 'Ducks Unlimited', 'est. 1995',  '#C9A84C', '#1B4D2E', 'DU', 0),
  ('rw', 'Rocwood',         null,         '#8C6B3F', '#2A2420', 'RW', 1);


-- =============================================================================
-- PRODUCTS — add brand_id
-- =============================================================================

-- Column: nullable initially so we can backfill before enforcing NOT NULL.
alter table products add column brand_id uuid references brands (id);

-- Backfill: every existing product belongs to Ducks Unlimited.
update products
   set brand_id = (select id from brands where slug = 'du')
 where brand_id is null;

-- Now enforce: every product must belong to a brand.
alter table products alter column brand_id set not null;

-- Fast filtering by brand on the shop page.
create index products_brand_id_idx on products (brand_id) where is_active = true;


-- =============================================================================
-- ORDERS — add brand_id and brand-aware order numbering
-- =============================================================================

alter table orders add column brand_id uuid references brands (id);

update orders
   set brand_id = (select id from brands where slug = 'du')
 where brand_id is null;

alter table orders alter column brand_id set not null;

-- Replace the single-brand order number generator with a per-brand one.
-- Each brand gets its own sequence so order numbers read as DU-00001 / RW-00001.
-- The old `order_number_seq` sequence is kept untouched for history.
create sequence if not exists order_number_seq_du start with 1;
create sequence if not exists order_number_seq_rw start with 1;

-- Pre-advance the DU sequence past any existing DU-XXXXX orders so new ones
-- don't collide with historical order numbers.
do $$
declare
  max_du_num integer;
begin
  select coalesce(max((substring(order_number from 'DU-([0-9]+)'))::integer), 0)
    into max_du_num
    from orders
   where order_number like 'DU-%';

  if max_du_num > 0 then
    perform setval('order_number_seq_du', max_du_num);
  end if;
end $$;

create or replace function assign_order_number()
returns trigger language plpgsql as $$
declare
  prefix   text;
  seq_name text;
  next_num bigint;
begin
  -- Look up the brand's order prefix (DU / RW / etc.)
  select order_prefix into prefix
    from brands
   where id = new.brand_id;

  if prefix is null then
    raise exception 'Order has brand_id=% but no matching brand row', new.brand_id;
  end if;

  -- One sequence per brand so numbering restarts at 1 for new brands.
  -- Sequence names are safe (prefix is checked ^[A-Z]{2,4}$ in the brands table).
  seq_name := 'order_number_seq_' || lower(prefix);

  -- Create the sequence lazily the first time a brand places an order
  execute format('create sequence if not exists %I start with 1', seq_name);
  execute format('select nextval(%L)', seq_name) into next_num;

  new.order_number := prefix || '-' || lpad(next_num::text, 5, '0');
  return new;
end;
$$;

-- Trigger definition is unchanged (it was created in schema.sql); it now
-- calls the updated function.


-- =============================================================================
-- SITE CONTENT — scope to brand (homepage CMS edits per brand)
-- =============================================================================
-- Only runs if the site_content table exists (migration 007). Guarded so
-- fresh installs that haven't applied 007 yet don't fail here.

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'site_content') then
    execute 'alter table site_content add column if not exists brand_id uuid references brands (id)';
    execute 'update site_content set brand_id = (select id from brands where slug = ''du'') where brand_id is null';
    -- Keep brand_id nullable on site_content: some entries (e.g. global
    -- announcement bar) may apply across all brands. NULL = global.
  end if;
end $$;


-- =============================================================================
-- HOMEPAGE AUDIENCE TILES — scope to brand
-- =============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'homepage_audience_tiles') then
    execute 'alter table homepage_audience_tiles add column if not exists brand_id uuid references brands (id)';
    execute 'update homepage_audience_tiles set brand_id = (select id from brands where slug = ''du'') where brand_id is null';
    execute 'alter table homepage_audience_tiles alter column brand_id set not null';
  end if;
end $$;


-- =============================================================================
-- LOOKBOOKS, JOURNAL POSTS, STORES, GIFT CARDS — scope to brand
-- =============================================================================
-- All guarded with existence checks so this migration is safe to run on a
-- partially-migrated database.

do $$
declare
  t text;
begin
  foreach t in array array['lookbooks', 'journal_posts', 'stores', 'gift_cards']
  loop
    if exists (select 1 from information_schema.tables where table_name = t) then
      execute format('alter table %I add column if not exists brand_id uuid references brands (id)', t);
      execute format('update %I set brand_id = (select id from brands where slug = ''du'') where brand_id is null', t);
      -- Keep stores.brand_id nullable: a physical store can be shared by
      -- multiple brands (Greenhills sells both DU and RW).
      if t <> 'stores' then
        execute format('alter table %I alter column brand_id set not null', t);
      end if;
    end if;
  end loop;
end $$;


-- =============================================================================
-- RLS on brands
-- =============================================================================

alter table brands enable row level security;

create policy "Public can read active brands"
  on brands for select
  using (is_active = true);

create policy "Admins can read all brands"
  on brands for select
  to authenticated
  using (true);

create policy "Admins can update brands"
  on brands for update
  to authenticated
  using (true);

create policy "Admins can insert brands"
  on brands for insert
  to authenticated
  with check (true);

-- No delete policy — brands are deactivated via is_active, never deleted
-- (would orphan historical orders).


-- =============================================================================
-- END OF MIGRATION 011
-- =============================================================================

-- =============================================================================
-- Ducks Unlimited — Supabase Database Schema
-- =============================================================================
-- Run this file in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Run it top to bottom — tables must exist before policies are applied.
-- =============================================================================


-- =============================================================================
-- PRODUCTS
-- One row per product (e.g. "Classic Polo Shirt"). Variants hold the
-- size/color combinations. This table holds shared info across all variants.
-- =============================================================================

create table products (
  id           uuid primary key default gen_random_uuid(),

  -- The display name shown on the storefront and admin panel
  name         text not null,

  -- Full product description shown on the product detail page
  description  text,

  -- Product category — used for filtering on the storefront
  -- Examples: 'polo', 'shirt', 'shorts', 'jacket'
  category     text not null,

  -- Base price in Philippine Pesos (PHP). Variants can override this.
  base_price   numeric(10, 2) not null check (base_price >= 0),

  -- When false, the product is hidden from the storefront (draft/archived).
  -- Admins can still see it in the admin panel.
  is_active    boolean not null default true,

  created_at   timestamptz not null default now()
);

comment on table products is
  'One row per product. Variants hold the size/color combinations.';

comment on column products.base_price is
  'Price in PHP. Individual variants can set a price_override if they cost more or less.';

comment on column products.is_active is
  'Set to false to hide from storefront without deleting the product.';


-- =============================================================================
-- VARIANTS
-- One row per size + color combination of a product.
-- Example: "Classic Polo — XL / Forest Green" is one variant row.
-- =============================================================================

create table variants (
  id             uuid primary key default gen_random_uuid(),

  -- Which product this variant belongs to
  product_id     uuid not null references products (id) on delete cascade,

  -- The color name exactly as it should appear to customers
  color          text not null,

  -- The size label exactly as it should appear (e.g. 'S', 'M', 'L', 'XL', 'XXL')
  size           text not null,

  -- Stock Keeping Unit — unique code for this exact variant, used for inventory
  -- management and order fulfillment. Set by the admin. Example: 'DU-POLO-XL-GRN'
  sku            text not null unique,

  -- Leave null to use the product's base_price. Set a value here if this
  -- variant costs more or less (e.g. XXL sizes may cost extra).
  price_override numeric(10, 2) check (price_override >= 0)
);

comment on table variants is
  'One row per size + color combination. Links back to products.';

comment on column variants.sku is
  'Unique code for this variant. Used in packing slips and inventory tracking.';

comment on column variants.price_override is
  'If set, overrides the product base_price for this specific variant.';


-- =============================================================================
-- INVENTORY
-- Tracks stock quantity per variant per sales channel.
-- A variant can have inventory in multiple channels at the same time.
-- =============================================================================

create table inventory (
  id                  uuid primary key default gen_random_uuid(),

  -- Which variant this stock count belongs to
  variant_id          uuid not null references variants (id) on delete cascade,

  -- Where this stock lives. Current channels:
  --   'online'           → stock sold through this website
  --   'greenhills_store' → physical store in Greenhills, San Juan
  -- More channels can be added later without changing the schema.
  channel             text not null check (channel in ('online', 'greenhills_store')),

  -- Current stock quantity. Never go below 0.
  quantity            integer not null default 0 check (quantity >= 0),

  -- When quantity drops to or below this number, the admin panel will show
  -- a low-stock warning. Set to 0 to disable the warning.
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),

  -- Automatically updated whenever this row changes (see trigger below)
  updated_at          timestamptz not null default now(),

  -- One row per variant+channel pair — no duplicates allowed
  unique (variant_id, channel)
);

comment on table inventory is
  'Stock counts per variant per channel. Add a row per channel you want to track.';

comment on column inventory.channel is
  'Sales channel. Currently: online, greenhills_store. Add new channels here.';

comment on column inventory.low_stock_threshold is
  'Admin panel shows a warning when quantity is at or below this number.';


-- Auto-update updated_at whenever an inventory row is changed
create or replace function update_inventory_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger inventory_updated_at
  before update on inventory
  for each row execute function update_inventory_timestamp();


-- =============================================================================
-- ORDERS
-- One row per customer order placed through the website.
-- In-store sales are NOT tracked here — this is online orders only.
-- =============================================================================

create table orders (
  id                  uuid primary key default gen_random_uuid(),

  -- Human-readable order reference shown to customers and staff.
  -- Format: DU-00001, DU-00002, etc. Generated automatically (see sequence below).
  order_number        text not null unique,

  -- Customer contact details collected at checkout
  customer_name       text not null,
  customer_email      text not null,
  customer_phone      text,

  -- Full shipping address as a single text block.
  -- Example: "123 Main St, Barangay Poblacion, Makati City, 1210"
  shipping_address    text not null,

  -- Total amount charged in PHP (should match the sum of order_items)
  total_amount        numeric(10, 2) not null check (total_amount >= 0),

  -- Payment lifecycle from PayMongo:
  --   'pending' → customer hasn't paid yet
  --   'paid'    → PayMongo confirmed payment
  --   'failed'  → payment attempt failed or was cancelled
  payment_status      text not null default 'pending'
                        check (payment_status in ('pending', 'paid', 'failed')),

  -- Fulfillment lifecycle managed by admins:
  --   'pending'   → order received, not yet packed
  --   'packed'    → items packed and ready for pickup/shipping
  --   'shipped'   → handed to courier
  --   'delivered' → customer confirmed or courier confirmed delivery
  fulfillment_status  text not null default 'pending'
                        check (fulfillment_status in ('pending', 'packed', 'shipped', 'delivered')),

  -- The payment ID returned by PayMongo after a successful payment.
  -- Null until payment is confirmed. Used to look up the transaction in PayMongo.
  paymongo_payment_id text,

  created_at          timestamptz not null default now()
);

comment on table orders is
  'Online orders only. One row per customer order.';

comment on column orders.order_number is
  'Human-readable ID shown to customers. Auto-generated as DU-00001, DU-00002, etc.';

comment on column orders.paymongo_payment_id is
  'Set after PayMongo confirms payment. Used to verify or refund through PayMongo dashboard.';


-- Sequence for generating order numbers like DU-00001
create sequence order_number_seq start 1;

-- Function that generates the next order number and assigns it to new orders
create or replace function assign_order_number()
returns trigger language plpgsql as $$
begin
  new.order_number = 'DU-' || lpad(nextval('order_number_seq')::text, 5, '0');
  return new;
end;
$$;

create trigger orders_assign_number
  before insert on orders
  for each row execute function assign_order_number();


-- =============================================================================
-- ORDER ITEMS
-- The individual line items inside an order.
-- One row per variant per order (e.g. 2x XL Forest Green Polo = one row).
-- =============================================================================

create table order_items (
  id                uuid primary key default gen_random_uuid(),

  -- Which order this line item belongs to
  order_id          uuid not null references orders (id) on delete cascade,

  -- Which product variant was ordered (links to variants → products)
  variant_id        uuid not null references variants (id),

  -- How many units of this variant were ordered
  quantity          integer not null check (quantity > 0),

  -- The price per unit AT THE TIME the order was placed.
  -- Stored separately so price changes on products don't alter historical orders.
  price_at_purchase numeric(10, 2) not null check (price_at_purchase >= 0)
);

comment on table order_items is
  'Line items inside an order. One row per variant ordered.';

comment on column order_items.price_at_purchase is
  'Snapshot of the price when the order was placed. Not linked to current product price.';


-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Controls who can read or write each table.
-- Supabase uses Postgres RLS — policies are enforced at the database level.
-- =============================================================================

-- Enable RLS on every table (denies all access by default until policies are added)
alter table products    enable row level security;
alter table variants    enable row level security;
alter table inventory   enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;


-- -----------------------------------------------------------------------------
-- PRODUCTS — public read (active only), admin write
-- -----------------------------------------------------------------------------

-- Anyone visiting the site can see active products
create policy "Public can read active products"
  on products for select
  using (is_active = true);

-- Logged-in admins can see all products, including drafts/archived
create policy "Admins can read all products"
  on products for select
  to authenticated
  using (true);

-- Only admins can add new products
create policy "Admins can insert products"
  on products for insert
  to authenticated
  with check (true);

-- Only admins can edit products (e.g. change price, toggle is_active)
create policy "Admins can update products"
  on products for update
  to authenticated
  using (true);

-- Only admins can delete products
create policy "Admins can delete products"
  on products for delete
  to authenticated
  using (true);


-- -----------------------------------------------------------------------------
-- VARIANTS — public read, admin write
-- -----------------------------------------------------------------------------

-- Anyone can see variants of active products (needed to show sizes/colors)
create policy "Public can read variants of active products"
  on variants for select
  using (
    exists (
      select 1 from products p
      where p.id = variants.product_id
        and p.is_active = true
    )
  );

-- Admins can see all variants regardless of product status
create policy "Admins can read all variants"
  on variants for select
  to authenticated
  using (true);

create policy "Admins can insert variants"
  on variants for insert
  to authenticated
  with check (true);

create policy "Admins can update variants"
  on variants for update
  to authenticated
  using (true);

create policy "Admins can delete variants"
  on variants for delete
  to authenticated
  using (true);


-- -----------------------------------------------------------------------------
-- INVENTORY — public read (quantities only), admin write
-- -----------------------------------------------------------------------------

-- Anyone can read inventory quantities (needed to show "In Stock" / "Out of Stock")
create policy "Public can read inventory"
  on inventory for select
  using (true);

create policy "Admins can insert inventory"
  on inventory for insert
  to authenticated
  with check (true);

-- Admins update inventory when stock arrives or items are sold in-store
create policy "Admins can update inventory"
  on inventory for update
  to authenticated
  using (true);

create policy "Admins can delete inventory"
  on inventory for delete
  to authenticated
  using (true);


-- -----------------------------------------------------------------------------
-- ORDERS — public insert (placing an order), admin read/update
-- -----------------------------------------------------------------------------

-- Anyone can place an order (no login required at checkout)
create policy "Anyone can place an order"
  on orders for insert
  with check (true);

-- Only admins can view orders (customer privacy)
create policy "Admins can read all orders"
  on orders for select
  to authenticated
  using (true);

-- Admins update orders to change payment_status or fulfillment_status
create policy "Admins can update orders"
  on orders for update
  to authenticated
  using (true);

-- Orders are never deleted — this keeps the order history intact
-- (No delete policy added intentionally)


-- -----------------------------------------------------------------------------
-- ORDER ITEMS — public insert (placing an order), admin read
-- -----------------------------------------------------------------------------

-- Inserting order items happens at the same time as placing an order
create policy "Anyone can insert order items"
  on order_items for insert
  with check (true);

-- Only admins can view what was in each order
create policy "Admins can read order items"
  on order_items for select
  to authenticated
  using (true);

-- Order items are never updated or deleted after an order is placed


-- =============================================================================
-- END OF SCHEMA
-- =============================================================================

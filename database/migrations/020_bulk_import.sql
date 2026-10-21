-- =============================================================================
-- Migration 020 — Bulk import/export (Oboda-style CSV files)
-- =============================================================================
-- Run this in the Supabase SQL editor.
--
-- What it adds:
--   1. variants.barcode — optional barcode per variant (Oboda files carry one,
--      and Oboda's stock file lets you identify an item by barcode).
--   2. admin_apply_product_import(...) — saves a whole product import at once.
--   3. admin_apply_stock_import(...)   — saves a whole stock import at once.
--
-- WHY FUNCTIONS?
--   A Postgres function runs as ONE transaction: if anything fails halfway
--   (e.g. a duplicate SKU), every change it made is undone automatically.
--   That's how we guarantee an import never "half-saves".
--
--   The admin page does all the checking and builds a "plan" (what to create,
--   what to update). The manager reviews it in a preview, clicks Confirm, and
--   the plan is sent here to be applied.
--
-- SECURITY:
--   Both functions run as the signed-in user ("security invoker"), so the
--   normal admin-only Row Level Security rules still apply to every write.
--   They also check public.is_admin() up front for a clear error message.
--
-- Safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. BARCODE COLUMN
-- =============================================================================

alter table variants add column if not exists barcode text;

comment on column variants.barcode is
  'Optional barcode (e.g. from Oboda). Unique when filled in. Used to match rows in stock imports.';

-- Two variants can't share a barcode — but many can have none (null).
create unique index if not exists variants_barcode_key
  on variants (barcode)
  where barcode is not null;


-- =============================================================================
-- 2. APPLY A PRODUCT IMPORT
-- =============================================================================
-- p_brand_id: the brand new products are created under (top-bar brand).
-- p_plan:     JSON built by /admin/js/product-import.js, shaped like:
--
--   {
--     "new_products": [
--       { "name": "Classic Polo", "category": "polo", "description": "...",
--         "base_price": 1295,
--         "variants": [ { "sku": "DU-POLO-M-GRN", "color": "Green", "size": "M",
--                         "barcode": "123...", "price_override": null } ] }
--     ],
--     "new_variants": [            -- new sizes/colors for EXISTING products
--       { "product_id": "<uuid>", "sku": "...", "color": "...", "size": "...",
--         "barcode": null, "price_override": null }
--     ],
--     "product_updates": [         -- only the keys present get changed
--       { "id": "<uuid>", "name": "...", "description": "...", "category": "..." }
--     ],
--     "variant_updates": [         -- only the keys present get changed
--       { "id": "<uuid>", "color": "...", "size": "...", "barcode": "...",
--         "price_override": 1395 }      -- null here means "use base price"
--     ]
--   }
--
-- New products are created HIDDEN (is_active = false) so photos can be added
-- before customers see them. Every new variant gets inventory rows for both
-- channels at quantity 0 (same as adding a variant by hand).
-- =============================================================================

create or replace function public.admin_apply_product_import(
  p_brand_id uuid,
  p_plan     jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  np            jsonb;   -- one new product from the plan
  nv            jsonb;   -- one new variant from the plan
  pu            jsonb;   -- one product update
  vu            jsonb;   -- one variant update
  new_product   uuid;
  new_variant   uuid;
  count_new_products    integer := 0;
  count_new_variants    integer := 0;
  count_product_updates integer := 0;
  count_variant_updates integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can import products.';
  end if;

  -- ── Brand-new products, each with its variants ──
  for np in select * from jsonb_array_elements(coalesce(p_plan->'new_products', '[]'::jsonb))
  loop
    insert into products (name, description, category, base_price, is_active, brand_id)
    values (
      np->>'name',
      nullif(np->>'description', ''),
      np->>'category',
      (np->>'base_price')::numeric,
      false,                       -- start hidden
      p_brand_id
    )
    returning id into new_product;
    count_new_products := count_new_products + 1;

    for nv in select * from jsonb_array_elements(coalesce(np->'variants', '[]'::jsonb))
    loop
      insert into variants (product_id, color, size, sku, barcode, price_override)
      values (
        new_product,
        nv->>'color',
        nv->>'size',
        nv->>'sku',
        nullif(nv->>'barcode', ''),
        (nv->>'price_override')::numeric   -- JSON null → SQL null
      )
      returning id into new_variant;
      count_new_variants := count_new_variants + 1;

      insert into inventory (variant_id, channel, quantity)
      values (new_variant, 'online', 0), (new_variant, 'greenhills_store', 0)
      on conflict (variant_id, channel) do nothing;
    end loop;
  end loop;

  -- ── New sizes/colors added to products that already exist ──
  for nv in select * from jsonb_array_elements(coalesce(p_plan->'new_variants', '[]'::jsonb))
  loop
    insert into variants (product_id, color, size, sku, barcode, price_override)
    values (
      (nv->>'product_id')::uuid,
      nv->>'color',
      nv->>'size',
      nv->>'sku',
      nullif(nv->>'barcode', ''),
      (nv->>'price_override')::numeric
    )
    returning id into new_variant;
    count_new_variants := count_new_variants + 1;

    insert into inventory (variant_id, channel, quantity)
    values (new_variant, 'online', 0), (new_variant, 'greenhills_store', 0)
    on conflict (variant_id, channel) do nothing;
  end loop;

  -- ── Updates to existing products ──
  -- "pu ? 'name'" means "did the plan include a name?". If not, keep the
  -- current value. This is how blank cells in the file never erase data.
  for pu in select * from jsonb_array_elements(coalesce(p_plan->'product_updates', '[]'::jsonb))
  loop
    update products set
      name        = case when pu ? 'name'        then pu->>'name'        else name        end,
      description = case when pu ? 'description' then pu->>'description' else description end,
      category    = case when pu ? 'category'    then pu->>'category'    else category    end
    where id = (pu->>'id')::uuid;
    count_product_updates := count_product_updates + 1;
  end loop;

  -- ── Updates to existing variants ──
  for vu in select * from jsonb_array_elements(coalesce(p_plan->'variant_updates', '[]'::jsonb))
  loop
    update variants set
      color          = case when vu ? 'color'          then vu->>'color'                   else color          end,
      size           = case when vu ? 'size'           then vu->>'size'                    else size           end,
      barcode        = case when vu ? 'barcode'        then vu->>'barcode'                 else barcode        end,
      price_override = case when vu ? 'price_override' then (vu->>'price_override')::numeric else price_override end
    where id = (vu->>'id')::uuid;
    count_variant_updates := count_variant_updates + 1;
  end loop;

  return jsonb_build_object(
    'new_products',    count_new_products,
    'new_variants',    count_new_variants,
    'product_updates', count_product_updates,
    'variant_updates', count_variant_updates
  );
end;
$$;

grant execute on function public.admin_apply_product_import(uuid, jsonb) to authenticated;


-- =============================================================================
-- 3. APPLY A STOCK IMPORT
-- =============================================================================
-- p_mode: 'add' → file quantity is ADDED to current stock (a delivery arrived)
--         'set' → file quantity REPLACES current stock (after a physical count)
-- p_rows: JSON array built by /admin/js/stock-import.js:
--   [ { "variant_id": "<uuid>", "channel": "online", "quantity": 20 }, ... ]
--
-- If a variant has no inventory row yet for that channel, one is created.
-- The add happens inside the database (quantity + 20), so it stays correct
-- even if an order came in between the preview and the confirm.
-- =============================================================================

create or replace function public.admin_apply_stock_import(
  p_mode text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r       jsonb;
  changed integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can import stock.';
  end if;

  if p_mode not in ('add', 'set') then
    raise exception 'Stock import mode must be "add" or "set".';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into inventory (variant_id, channel, quantity)
    values ((r->>'variant_id')::uuid, r->>'channel', (r->>'quantity')::integer)
    on conflict (variant_id, channel) do update
      set quantity = case
                       when p_mode = 'add' then inventory.quantity + excluded.quantity
                       else excluded.quantity
                     end;
    changed := changed + 1;
  end loop;

  return jsonb_build_object('rows', changed);
end;
$$;

grant execute on function public.admin_apply_stock_import(text, jsonb) to authenticated;

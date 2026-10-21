-- =============================================================================
-- Migration 022 — Fix "permission denied for schema public" at checkout
-- =============================================================================
-- The order-number trigger (from 011_brands) runs
--   create sequence if not exists order_number_seq_<brand>
-- Postgres checks CREATE permission on the schema even when the sequence
-- already exists, and the role /api/create-payment uses (service_role) doesn't
-- have it, so every new order failed.
--
-- Fix: run the trigger function with its owner's rights (security definer),
-- with a fixed search_path so it can't be tricked into using other objects.
-- The logic itself is unchanged.
--
-- Safe to run more than once.
-- =============================================================================

create or replace function public.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

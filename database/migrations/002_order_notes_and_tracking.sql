-- =============================================================================
-- Migration 002 — Add tracking_number and internal_notes to orders
-- =============================================================================
-- Run this in the Supabase SQL editor if you ALREADY ran schema.sql and
-- need to add the new order tracking + notes columns to your existing
-- database. (If you're starting fresh, the updated schema.sql already
-- includes these columns.)
-- =============================================================================

-- Tracking number — set when fulfillment_status moves to 'shipped'
alter table orders add column if not exists tracking_number text;

comment on column orders.tracking_number is
  'Courier tracking number. Set by staff when fulfillment_status is shipped.';


-- Internal staff notes — never shown to the customer
alter table orders add column if not exists internal_notes text;

comment on column orders.internal_notes is
  'Free-text notes for staff (e.g. "called customer to confirm address"). Not customer-facing.';

-- =============================================================================
-- Migration 023 — Payment provider columns (switching to Maya)
-- =============================================================================
-- Until now orders only had paymongo_payment_id. We now pay through Maya, so
-- orders get two provider-neutral columns:
--
--   payment_provider   'maya' or 'paymongo'
--   payment_reference  the provider's id for this payment
--                      (for Maya: the checkout id, used by /api/maya-verify
--                       to ask Maya whether the order was paid)
--
-- paymongo_payment_id is kept so older orders and the PayMongo webhook still
-- work. Safe to run more than once.
-- =============================================================================

alter table orders
  add column if not exists payment_provider  text,
  add column if not exists payment_reference text;

comment on column orders.payment_provider  is 'Which company processed the payment: maya or paymongo.';
comment on column orders.payment_reference is 'The payment company''s id for this order (Maya checkout id).';

-- Label the existing PayMongo orders
update orders
set    payment_provider  = 'paymongo',
       payment_reference = paymongo_payment_id
where  payment_provider is null
  and  paymongo_payment_id is not null;

create index if not exists orders_payment_reference_idx on orders (payment_reference);

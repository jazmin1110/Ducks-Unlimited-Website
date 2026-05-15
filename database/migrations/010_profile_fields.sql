-- =============================================================================
-- Migration 010 — Profile fields (birthday + marketing opt-in + gender)
-- =============================================================================
-- Adds three optional fields the customer can self-edit on the profile page:
--
--   * birthday          — used later for birthday discount emails
--   * marketing_opt_in  — checkbox for newsletter / promo sends
--   * gender            — optional self-identification for product recs
--
-- All three are nullable so existing rows stay valid. RLS is already set up by
-- migration 003 ("Customers can update their own profile") and that policy
-- applies row-wide, so no new policies are needed.
--
-- Default `false` on marketing_opt_in is deliberate — opt-in must be explicit
-- (PH Data Privacy Act + general best practice).
--
-- The gender column uses a CHECK constraint to keep the set of values small
-- and predictable: 'male' | 'female' | 'prefer_not_to_say'. NULL means the
-- customer hasn't picked anything yet.
-- =============================================================================

alter table customer_profiles
  add column if not exists birthday         date,
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists gender           text
    check (gender in ('male', 'female', 'prefer_not_to_say'));

comment on column customer_profiles.birthday is
  'Optional. Used for birthday promo emails.';

comment on column customer_profiles.marketing_opt_in is
  'Explicit opt-in for marketing emails. Default false per PH Data Privacy Act.';

comment on column customer_profiles.gender is
  'Optional self-ID: male | female | prefer_not_to_say. Used for product recs.';

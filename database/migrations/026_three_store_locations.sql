-- =============================================================================
-- 026 — Three store locations
-- =============================================================================
-- We now list three stores on /stores.html, with no "flagship" wording.
--   1. Greenhills Shopping Center, Shoppesville 2/F  (updates the old row)
--   2. Century Park Hotel Manila, G/F                 (new)
--   3. Cash & Carry Department Store, 3/F             (new)
--
-- Details are rough for now. Hours and phone numbers for the two new stores
-- are left empty (the Hours box is hidden when there are none) — fill them in
-- later from the admin or with an UPDATE like the one below.
-- New stores have no lat/lng, so the map searches by name + address instead.
-- =============================================================================

-- 1. Greenhills: rename, new address, and remove the placeholder phone
--    number so customers never see "+63 9XX XXX XXXX".
update stores
set name        = 'Greenhills Shopping Center',
    address     = 'Shoppesville 2/F, Greenhills Shopping Center',
    description = null,
    phone       = null,
    display_order = 0
where name = 'Greenhills Flagship';

-- 2 + 3. The two new stores. "where not exists" makes this safe to re-run.
insert into stores (name, address, city, province, display_order)
select 'Century Park Hotel', 'G/F, Century Park Hotel Manila, 599 Pablo Ocampo Sr. St., Malate', 'Manila', 'Metro Manila', 1
where not exists (select 1 from stores where name = 'Century Park Hotel');

insert into stores (name, address, city, province, display_order)
select 'Cash & Carry', '3/F, Cash & Carry Department Store, South Superhighway', 'Makati', 'Metro Manila', 2
where not exists (select 1 from stores where name = 'Cash & Carry');

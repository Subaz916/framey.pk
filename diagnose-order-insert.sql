-- ============================================================================
--  FRAMEY.PK — WHY ORDERS AREN'T BEING STORED
--  Run this ONCE in Supabase Studio -> SQL Editor -> New query -> Run.
--  It only reports. It changes nothing, so it is safe to run repeatedly.
--
--  Read the output top to bottom. Section 1 tells you which of the two failure
--  modes you have; section 2 is the cause; section 3 is the proof.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1.  HEADLINE: CAN THE STOREFRONT INSERT AN ORDER AT ALL?
--      These four booleans are the whole story. anon_can_insert MUST be true.
--      anon_can_select is EXPECTED to be false — see fix-order-insert.sql.
-- ---------------------------------------------------------------------------

select
  has_table_privilege('anon', 'public.orders', 'insert')   as anon_can_insert,
  has_table_privilege('anon', 'public.orders', 'select')   as anon_can_select,
  has_schema_privilege('anon', 'public', 'usage')          as anon_has_schema_usage,
  (select count(*) from pg_policies
     where tablename = 'orders' and cmd = 'insert')        as insert_policies;


-- ---------------------------------------------------------------------------
--  2.  THE INSERT POLICY AND THE GUARD TRIGGER
--      Both must be present. A missing trigger is why an order can be accepted
--      but have no effect; a missing policy rejects the row outright.
-- ---------------------------------------------------------------------------

select policyname, cmd, roles::text as roles, with_check
  from pg_policies
 where tablename = 'orders'
 order by cmd, policyname;

select tgname as trigger, tgenabled
  from pg_trigger
 where tgrelid = 'public.orders'::regclass
   and not tgisinternal
 order by tgname;


-- ---------------------------------------------------------------------------
--  3.  DOES THE CATALOGUE THE SHOP SERVES ACTUALLY EXIST IN `products`?
--      This is the most common cause and it is invisible from the storefront.
--
--      lock_order_on_insert (supabase.sql) refuses any order whose item id is
--      not an ACTIVE row in `products`. If the seed never ran, or a product was
--      deactivated, the shop still shows that frame — it falls back to the
--      built-in catalogue in script.js — the customer checks out, and the
--      database throws 'product <id> is not available'. The order is then
--      discarded, silently.
--
--      You need 8 missing = 0 and 8 inactive = 0.
-- ---------------------------------------------------------------------------

with catalogue(id) as (values
  ('minimal-black-frame'), ('golden-luxury-frame'), ('modern-family-frame'),
  ('abstract-art-frame'), ('wooden-classic-frame'), ('premium-gallery-set'),
  ('white-oak-square-frame'), ('floral-print-frame'))
select
  (select count(*) from catalogue)                                     as catalogue_size,
  (select count(*) from catalogue c
     where not exists (select 1 from public.products p where p.id = c.id)) as missing_from_db,
  (select count(*) from public.products p
     where p.id in (select id from catalogue) and not p.active)        as inactive_in_db,
  (select count(*) from public.products where active)                  as active_products_in_db;


-- ---------------------------------------------------------------------------
--  4.  PROOF: REPLAY A REAL ORDER AS THE ANONYMOUS ROLE
--      This is the decisive test. It runs the insert with exactly the
--      privileges and RLS of a real customer, inside a transaction that is
--      ROLLED BACK, so it stores nothing. If it succeeds, the storefront path
--      is healthy and the problem is the admin panel, not checkout.
--      If it raises, the error text IS your bug.
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing text;
begin
  -- Refuse to pretend: if the catalogue is broken, say so instead of testing.
  select string_agg(c.id, ', ')
    into v_missing
    from (values ('minimal-black-frame'), ('golden-luxury-frame'),
                 ('modern-family-frame'), ('abstract-art-frame'),
                 ('wooden-classic-frame'), ('premium-gallery-set'),
                 ('white-oak-square-frame'), ('floral-print-frame')) as c(id)
   where not exists (select 1 from public.products p
                      where p.id = c.id and p.active);

  if v_missing is not null then
    raise exception 'STOP: these catalogue ids have no ACTIVE row in products, so lock_order_on_insert will reject every order: %', v_missing;
  end if;

  raise notice 'catalogue looks complete — running the live insert test below';
end $$;

begin;
  set local role anon;

  insert into public.orders
    (order_no, name, phone, address, city, province, payment, items,
     subtotal, delivery, total, status)
  values
    ('DIAG-0001', 'Diagnostic Test', '03000000000', 'Test address',
     'Karachi', 'Sindh', 'COD',
     '[{"id":"minimal-black-frame","name":"Minimal Black Frame","size":"8 x 10 inch","qty":1,"price":1499}]'::jsonb,
     1499, 250, 1749, 'new');

  raise notice 'RESULT: the anonymous insert SUCCEEDED. Checkout is healthy — the bug is the admin read path, not the insert.';
rollback;

-- If the insert above raises, Postgres prints the message. The ones to expect:
--   "product minimal-black-frame is not available"  -> section 3, a dead product row
--   "permission denied for table orders"            -> anon_can_insert is false
--   "new row violates row-level security policy"    -> the insert policy is missing
--   "quantity must be between 1 and 10"             -> a bad qty in the payload


-- ---------------------------------------------------------------------------
--  5.  ORPHANED ORDERS ALREADY LOST BY THE OLD CODE
--      The previous build showed "Order Placed" even when the insert failed,
--      parking the row in the CUSTOMER'S browser localStorage under the key
--      framey_pending_orders_v1. Nothing server-side can recover those. Ask the
--      customer to open the shop on the same device and browser and load the
--      page once with a connection — flushPendingOrders() retries the queue
--      automatically. This count is what is currently stored.
-- ---------------------------------------------------------------------------

select count(*) as orders_in_database,
       min(created_at) as first_order,
       max(created_at) as newest_order
  from public.orders;

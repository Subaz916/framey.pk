-- ============================================================================
--  FRAMEY.PK — WHY ORDERS AREN'T BEING STORED
--  Run this ONCE in Supabase Studio -> SQL Editor -> New query -> Run.
--  It only reports. It changes nothing, so it is safe to run repeatedly.
--
--  Read the output top to bottom. Section 1 tells you which of the two failure
--  modes you have; section 2 is the cause; section 4 is the proof.
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
--      Both must be present. A missing policy rejects the row outright; a
--      missing trigger means the storefront can forge prices and quantities.
-- ---------------------------------------------------------------------------

select policyname, cmd, roles::text as roles, with_check
  from pg_policies
 where tablename = 'orders'
 order by cmd, policyname;

select tgname as trigger_name, tgenabled
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
--      deactivated, the shop still shows that frame — syncFromSupabase() fails
--      and script.js falls back to its built-in catalogue — the customer checks
--      out, and the database throws 'product <id> is not available'. The order
--      is then discarded, silently.
--
--      You need missing_from_db = 0 and inactive_in_db = 0.
-- ---------------------------------------------------------------------------

with catalogue(id) as (values
  ('minimal-black-frame'), ('golden-luxury-frame'), ('modern-family-frame'),
  ('abstract-art-frame'), ('wooden-classic-frame'), ('premium-gallery-set'),
  ('white-oak-square-frame'), ('floral-print-frame'))
select
  (select count(*) from catalogue)                                      as catalogue_size,
  (select count(*) from catalogue c
     where not exists (select 1 from public.products p where p.id = c.id))
                                                                      as missing_from_db,
  (select count(*) from public.products p
     where p.id in (select id from catalogue) and not p.active)        as inactive_in_db,
  (select count(*) from public.products where active)                  as active_products_in_db;


-- ---------------------------------------------------------------------------
--  4.  PROOF: REPLAY A REAL ORDER AS THE ANONYMOUS ROLE
--      The decisive test. It runs the insert with exactly the privileges and
--      RLS of a real customer, inside a transaction that is ROLLED BACK, so it
--      stores nothing. The DO block catches the failure and reports it, so this
--      section always prints a result and never aborts the script.
--
--      RESULT: OK      -> checkout is healthy; the bug is the admin read path.
--      RESULT: FAILED  -> the message in brackets is your bug:
--          "product ... is not available"  -> a dead row in products (section 3)
--          "permission denied for table"    -> anon_can_insert is false
--          "row-level security policy"     -> the insert policy is missing
--          "quantity must be between 1 and 10"
-- ---------------------------------------------------------------------------

begin;
  set local role anon;

  do $$
  begin
    insert into public.orders
      (order_no, name, phone, address, city, province, payment, items,
       subtotal, delivery, total, status)
    values
      ('DIAG-0001', 'Diagnostic Test', '03000000000', 'Test address',
       'Karachi', 'Sindh', 'COD',
       '[{"id":"minimal-black-frame","name":"Minimal Black Frame","size":"8 x 10 inch","qty":1,"price":1}]'::jsonb,
       1, 1, 2, 'new');

    raise notice 'RESULT: OK - the anonymous insert succeeded. Checkout is healthy; the bug is the admin read path, not the insert.';
  exception when others then
    raise notice 'RESULT: FAILED - % (SQLSTATE %)', sqlerrm, sqlstate;
  end $$;
rollback;


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

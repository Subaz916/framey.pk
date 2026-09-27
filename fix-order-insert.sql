-- ============================================================================
--  FRAMEY.PK — REPAIR ORDER INSERT
--  Run this ONCE in Supabase Studio -> SQL Editor -> New query -> Run, AFTER
--  diagnose-order-insert.sql has told you what is broken.
--
--  Every statement is idempotent, so it is safe to run more than once and safe
--  to run before you have read the diagnosis. Nothing here deletes orders.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1.  PRIVILEGES
--      The storefront signs in as `anon` and may do exactly two things: read
--      the catalogue, and create one order. It must NOT be able to read orders
--      back, because that would expose every customer's name, address and phone
--      number to anyone who opens devtools.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant insert on public.orders to anon;

-- Deliberately NOT granted, and actively revoked:
--   * select    -> reading customers' details
--   * update    -> editing an order after the fact
--   * delete    -> destroying order history
revoke select, update, delete on public.orders from anon;

-- Admins read and update orders but never delete them, so history is permanent.
grant select, update on public.orders to authenticated;


-- ---------------------------------------------------------------------------
--  2.  ROW LEVEL SECURITY
--      RLS decides WHICH rows a role may touch; the grants above decide whether
--      it may touch the table at all. Both are required — a correct policy with
--      a missing grant still fails, and so does the reverse.
-- ---------------------------------------------------------------------------

alter table public.orders enable row level security;

-- The storefront may create an order, and only in its opening state. This stops
-- a crafted request from inserting an order that is already marked delivered.
drop policy if exists orders_public_insert on public.orders;
create policy orders_public_insert on public.orders
  for insert to anon, authenticated
  with check (status = 'new' and payment = 'COD');

-- Anonymously readable order numbers are not a thing, so nothing reads as anon.
drop policy if exists orders_anon_read on public.orders;


-- ---------------------------------------------------------------------------
--  3.  THE GUARD TRIGGER
--      Without this trigger the storefront can invent prices, quantities and
--      product ids, and the admin dashboard's revenue figures become fiction.
--      Re-created here so a database that predates it is brought up to date.
-- ---------------------------------------------------------------------------

create or replace function public.lock_order_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_price int;
  v_sum   bigint := 0;
  qty     int;
  lines   int := 0;
begin
  new.status := 'new';

  if new.items is null or jsonb_typeof(new.items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(new.items) = 0 then
    raise exception 'an order needs at least one item' using errcode = '22023';
  end if;

  if jsonb_array_length(new.items) > 20 then
    raise exception 'too many items in one order' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(new.items) loop
    lines := lines + 1;

    if item ->> 'id' is null then
      raise exception 'item % is missing a product id', lines using errcode = '22023';
    end if;

    -- A scalar variable, not `record`: assigning one column into a record and
    -- then reading a field off it is legal but needlessly clever here.
    v_price := null;
    select p.price into v_price
      from public.products p
     where p.id = item ->> 'id'
       and p.active;

    if v_price is null then
      raise exception 'product % is not available', item ->> 'id' using errcode = '22023';
    end if;

    qty := (item ->> 'qty')::int;
    if qty is null or qty < 1 or qty > 10 then
      raise exception 'quantity must be between 1 and 10' using errcode = '22023';
    end if;

    v_sum := v_sum + v_price::bigint * qty;
  end loop;

  if v_sum <= 0 then
    raise exception 'order total must be greater than zero' using errcode = '22023';
  end if;

  -- The browser's numbers are never trusted. Delivery is a flat 250.
  new.subtotal := v_sum;
  new.delivery := 250;
  new.total    := v_sum + 250;
  return new;
end;
$$;

drop trigger if exists orders_lock on public.orders;
create trigger orders_lock before insert on public.orders
  for each row execute function public.lock_order_on_insert();


-- ---------------------------------------------------------------------------
--  4.  REPORT
--      anon_can_insert MUST now be true and anon_can_select MUST be false.
--      If either is the other way round, the statement above did not apply.
-- ---------------------------------------------------------------------------

select
  has_table_privilege('anon', 'public.orders', 'insert') as anon_can_insert,
  has_table_privilege('anon', 'public.orders', 'select') as anon_can_select,
  has_table_privilege('anon', 'public.orders', 'delete') as anon_can_delete,
  (select count(*) from pg_policies
     where tablename = 'orders' and cmd = 'insert')        as insert_policies;


-- ---------------------------------------------------------------------------
--  5.  STILL NOT WORKING?  Replay the storefront insert as anon.
--      This stores nothing (it rolls back). The DO block catches the failure, so
--      this always prints a result instead of aborting the script.
-- ---------------------------------------------------------------------------

begin;
  set local role anon;

  do $$
  begin
    insert into public.orders
      (order_no, name, phone, address, city, province, payment, items,
       subtotal, delivery, total, status)
    values
      ('DIAG-0002', 'Diagnostic Test', '03000000000', 'Test address',
       'Karachi', 'Sindh', 'COD',
       '[{"id":"minimal-black-frame","name":"Minimal Black Frame","size":"8 x 10 inch","qty":1,"price":1}]'::jsonb,
       1, 1, 2, 'new');

    raise notice 'RESULT: OK - checkout can store orders.';
  exception when others then
    raise notice 'RESULT: FAILED - % (SQLSTATE %)', sqlerrm, sqlstate;
  end $$;
rollback;

-- If the insert above is rejected, run diagnose-order-insert.sql section 3.
-- A "product ... is not available" error means the `products` table is missing
-- that row or it is inactive — re-run the seed section of supabase.sql, or set
-- active = true on the product.


-- ---------------------------------------------------------------------------
--  6.  RECOVER THE ORDERS THE OLD BUILD SWALLOWED
--      Nothing on the server can do this. The lost rows only ever existed in one
--      browser's localStorage, under framey_pending_orders_v1.
--
--      Ask whoever placed an order to open the shop on the SAME device and
--      browser, while online, and load the page once. flushPendingOrders()
--      retries the queue on boot. A row that already landed is recognised by its
--      order_no and dropped, so this cannot double-order anybody.
-- ---------------------------------------------------------------------------

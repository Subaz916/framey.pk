-- ============================================================================
--  FRAMEY.PK - RESTORE CHECKOUT
--  Supabase Studio -> SQL Editor -> New query -> paste this whole file -> Run
--
--  Every statement is idempotent, so this is safe to run more than once and
--  safe to run before you have read any of the comments. It deletes nothing.
--
--  Why: the storefront signs in as `anon`, and `anon` had no INSERT privilege
--  on public.orders. Every order was rejected with 42501
--  "permission denied for table orders", which is the message customers saw
--  as "Our order system is temporarily rejecting requests".
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1. PRIVILEGES - may the role touch the table at all
-- ---------------------------------------------------------------------------

grant usage on schema public to anon;

grant insert on public.orders to anon;

-- Deliberately NOT granted: reading customers' names, addresses and phone
-- numbers, editing an order after the fact, or deleting order history.
revoke select, update, delete on public.orders from anon;


-- ---------------------------------------------------------------------------
--  2. ROW LEVEL SECURITY - which rows the role may touch
--     Grants decide WHETHER a role may act; policies decide WHICH rows.
--     Both are required: a correct policy with a missing grant still fails.
-- ---------------------------------------------------------------------------

alter table public.orders enable row level security;

-- The storefront may create an order, and only in its opening state. This
-- stops a crafted request from inserting an order already marked delivered.
drop policy if exists orders_public_insert on public.orders;
create policy orders_public_insert on public.orders
  for insert to anon, authenticated
  with check (status = 'new' and payment = 'COD');


-- ---------------------------------------------------------------------------
--  3. REPORT
--     The three columns MUST now read: true | false | 1
--     can_insert     = anon may create orders          -> MUST be true
--     can_select     = anon may read customers' data   -> MUST be false
--     insert_policies= the policy from section 2       -> MUST be 1
-- ---------------------------------------------------------------------------

select
  has_table_privilege('anon', 'public.orders', 'insert') as can_insert,
  has_table_privilege('anon', 'public.orders', 'select') as can_select,
  (select count(*) from pg_policies
     where tablename = 'orders' and cmd = 'insert')       as insert_policies;

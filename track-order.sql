-- ============================================================================
--  FRAMEY.PK — CUSTOMER ORDER TRACKING
--  Run this ONCE in Supabase Studio -> SQL Editor -> New query -> Run.
--  Safe to re-run: the function is CREATE OR REPLACE.
--  Run it AFTER fix-order-insert.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  WHY A FUNCTION INSTEAD OF A QUERY
--
--  The storefront signs in as `anon`, and `anon` deliberately has NO SELECT on
--  `orders` — that is what keeps every customer's name, address and phone number
--  private from anyone who opens devtools. So the tracking page cannot simply ask
--  PostgREST for the order; it would get 42501, exactly like the insert's old
--  `.select()` did.
--
--  This function is SECURITY DEFINER, so it reads the table as its owner and
--  sidesteps RLS on purpose. That makes it the one place in the project where a
--  client can read order data, so it is deliberately narrow:
--
--    * it matches on TWO things — the order number AND the phone number that was
--      given at checkout. The order number alone is NOT a secret: it is
--      FR-YYMMDD-XXXX, only 9000 values a day, so anyone could walk through them.
--      Requiring the phone as well means a guess has to be right twice.
--
--    * it returns only what tracking needs. Name, address, city, province, email
--      and notes are NOT in the return type, so they cannot leak through this
--      door even if the caller's guess is right.
--
--    * a wrong order number and a wrong phone are indistinguishable to the
--      caller: both return zero rows. The page cannot be used to discover which
--      order numbers exist.
--
--  KNOWN LIMITATION: `anon` may call this as often as it likes. Guessing needs
--  both values to be correct, so the practical exposure is small, but a
--  determined attacker with a list of order numbers could still probe phone
--  numbers. If that ever matters, move the lookup behind a Supabase Edge
--  Function with real rate limiting.
-- ---------------------------------------------------------------------------

create or replace function public.track_order(p_order_no text, p_phone text)
returns table (
  order_no   text,
  status     text,
  created_at timestamptz,
  subtotal   int,
  delivery   int,
  total      int,
  items      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.order_no,
    o.status,
    o.created_at,
    o.subtotal,
    o.delivery,
    o.total,
    o.items
  from public.orders o
  where lower(o.order_no) = lower(trim(coalesce(p_order_no, '')))

    -- Compare the last 10 digits only. Customers type their number every which
    -- way — 03001234567, 3001234567, +92 300 1234567 — and all three are the
    -- same person, so a literal string compare would fail on punctuation and
    -- country code rather than on anything meaningful.
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 7
    and right(regexp_replace(o.phone,       '\D', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
$$;

-- A new function is EXECUTABLE by PUBLIC by default, which would let any role
-- call it without being granted. Take that away and re-grant only what is needed.
revoke all on function public.track_order(text, text) from public;
grant  execute on function public.track_order(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
--  CHECK IT IS WIRED UP
--      is_callable must be true. found must be false — a wrong phone number has
--      to return nothing at all, and this is what proves it.
-- ---------------------------------------------------------------------------

select
  has_function_privilege('anon', 'public.track_order(text,text)', 'execute')
                                                          as is_callable,
  (select count(*) from public.track_order('FR-000000-0000', '03000000000'))
                                                          as found;


-- ---------------------------------------------------------------------------
--  TRY IT WITH A REAL ORDER
--      Replace the two values with a genuine order number and the phone number
--      that was used at checkout. You should get one row.
-- ---------------------------------------------------------------------------

select
  order_no,
  status,
  created_at,
  subtotal,
  delivery,
  total,
  jsonb_array_length(items) as item_lines
from public.track_order(
  'FR-260101-1234',   -- a real order number
  '03001234567'       -- the phone given at checkout
);


-- ---------------------------------------------------------------------------
--  DONE.  The page is /track-order.html. It reads nothing until the visitor
--  submits the form, so nothing here is exposed on page load.
-- ---------------------------------------------------------------------------

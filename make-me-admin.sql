-- ============================================================================
--  FRAMEY.PK — GRANT ADMIN ACCESS
--  Target account: subhandaraz90@gmail.com
--
--  WHY YOU NEED THIS
--  ----------------
--  That account is signed in, but it is not on the admin list. Every table in
--  this project has a row-level-security policy that is gated on
--  public.is_admin(), so being signed in is not enough. While the account is
--  missing from public.admins:
--
--    * the Orders tab is empty even though the orders really are in Supabase
--      (RLS filters the rows out and returns success, not an error), and
--    * deleting a product or category "works", then everything comes back on
--      refresh, because a DELETE that matches no rows reports no error.
--
--  The on_auth_user_created trigger only promotes accounts at sign-up time. An
--  account that existed before its address was in admin_invites was never
--  promoted, which is what happened here. This script promotes it directly.
--
--  HOW TO USE
--  ----------
--  Supabase dashboard -> SQL Editor -> New query -> paste all of this ->
--  Run. It is safe to run more than once.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1.  PROMOTE THE ACCOUNT
--      public.admins is keyed on user_id (a foreign key to auth.users), not on
--      email, so the row id has to be looked up from auth.users. If the
--      address has never signed up, this inserts nothing — see step 4.
-- ---------------------------------------------------------------------------

insert into public.admins (user_id, email, name)
select u.id, u.email, u.raw_user_meta_data ->> 'full_name'
from auth.users u
where lower(u.email) = lower('subhandaraz90@gmail.com')
on conflict (user_id) do nothing;

-- Remove the invite so a later signup of the same address is not silently
-- promoted again. (admin_invites is only ever read by this script.)
delete from public.admin_invites
where lower(email) = lower('subhandaraz90@gmail.com');


-- ---------------------------------------------------------------------------
--  2.  MAKE SURE THE ACCOUNT CAN ACTUALLY DO THE JOB
--      RLS decides WHICH rows are visible, but the role still needs the
--      privilege on the table first. Re-applying these costs nothing and fixes
--      the case where the database was created before the grants were added.
-- ---------------------------------------------------------------------------

-- Orders: admins read and update. They are never deleted, so order history
-- stays permanent. The storefront may only create rows, never read them —
-- that is what keeps customer names, addresses and phone numbers private.
grant select, update on public.orders to authenticated;
revoke insert, update, delete on public.orders from anon;
revoke select on public.orders from anon;

-- Categories: full editing for admins (this is what makes the new Categories
-- page in the admin panel work), read-only for the storefront.
grant select on public.categories to anon, authenticated;
grant select, insert, update, delete on public.categories to authenticated;
revoke insert, update, delete on public.categories from anon;

-- Products: active rows are public so the storefront can render; only admins
-- can write. Listing the storefront needs SELECT and nothing more.
grant select on public.products to anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;
revoke insert, update, delete on public.products from anon;

-- admin_invites stays service-role only, so a promoted account cannot write
-- itself another admin.
revoke all on public.admin_invites from anon, authenticated;

grant select on public.admins to authenticated;
grant execute on function public.is_admin() to anon, authenticated;


-- ---------------------------------------------------------------------------
--  3.  REPORT WHAT HAPPENED
--      Run this last. "is_admin" should say true. If it says false, step 1
--      matched no row, which means the address has never signed up.
-- ---------------------------------------------------------------------------

do $$
declare
  v_email text := 'subhandaraz90@gmail.com';
  v_uid   uuid;
begin
  select u.id into v_uid
  from auth.users u
  where lower(u.email) = lower(v_email);

  if v_uid is null then
    raise exception 'NO SUCH USER: % has never signed up. Sign in through admin-access.html first, then run this script again.', v_email;
  end if;

  if not exists (select 1 from public.admins a where a.user_id = v_uid) then
    raise exception 'STILL NOT AN ADMIN: % exists in auth.users but not in public.admins.', v_email;
  end if;

  raise notice 'OK: % (user_id %) is now an admin. Reload the admin page.', v_email, v_uid;
end $$;

select
  u.email                as "signed in as",
  exists (select 1 from public.admins a where a.user_id = u.id)
                         as "is admin",
  (select count(*) from public.orders)   as "orders in database",
  (select count(*) from public.products) as "products in database",
  (select count(*) from public.categories) as "categories in database"
from auth.users u
where lower(u.email) = lower('subhandaraz90@gmail.com');


-- ---------------------------------------------------------------------------
--  HOUSEKEEPING (optional)
--  Removes the junk row created while diagnosing the order-insert bug.
--  Harmless if it is already gone.
-- ---------------------------------------------------------------------------

-- delete from public.orders where order_no = 'PROBE-3';

-- ============================================================================
--  FRAMEY.PK — Supabase schema
--  Run this ONCE in Supabase Studio → SQL Editor → New query → Run.
--  Safe to re-run: every statement is idempotent.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
--  1.  TABLES
-- ============================================================================

-- Emails allowed to become admins. A new auth user is only promoted if their
-- address appears here, so anyone who finds the sign-up form cannot self-promote.
create table if not exists public.admin_invites (
  email      text primary key,
  note       text,
  created_at timestamptz default now()
);

-- The admin roster. Written only by the trigger below; never writable by a client.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  name       text,
  created_at timestamptz default now()
);

create table if not exists public.categories (
  slug       text primary key,
  name       text not null,
  image      text,
  sort_order int  not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.products (
  id          text primary key,
  name        text not null,
  category    text references public.categories (slug) on update cascade,
  price       int  not null check (price >= 0),
  old_price   int  check (old_price is null or old_price > price),
  image       text not null,
  material    text,
  color       text,
  color_hex   text,
  rating      numeric(2,1) not null default 4.5 check (rating between 0 and 5),
  reviews     int not null default 0 check (reviews >= 0),
  sold        int not null default 0 check (sold  >= 0),
  sizes       text[] not null default '{}',
  description text,
  featured    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists public.orders (
  id         uuid primary key default gen_random_uuid(),
  order_no   text unique not null,
  name       text not null,
  phone      text not null,
  email      text,
  address    text not null,
  city       text not null,
  province   text not null,
  postal     text,
  notes      text,
  payment    text not null default 'COD',
  items      jsonb not null check (jsonb_array_length(items) > 0),
  subtotal   int not null default 0,
  delivery   int not null default 250,
  total      int not null default 0,
  status     text not null default 'new'
             check (status in ('new','confirmed','shipped','delivered','cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_featured_idx on public.products (featured) where featured;
create index if not exists orders_status_idx   on public.orders (status);
create index if not exists orders_created_idx  on public.orders (created_at desc);

-- ============================================================================
--  2.  is_admin()  — the single source of truth for "is this caller an admin"
--  SECURITY DEFINER so reading `admins` does not recurse through its own RLS.
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant  execute on function public.is_admin() to anon, authenticated;

-- ============================================================================
--  3.  TABLE GRANTS
--  RLS decides WHICH rows a role may touch, but the role still needs the
--  privilege at all. Supabase usually pre-grants these, but a table created
--  from this script does not inherit that reliably, so grant it explicitly.
--  Note there is no grant on admin_invites: it stays service-role only.
-- ============================================================================

grant select on public.categories to anon, authenticated;
grant select, insert, update, delete on public.categories to authenticated;

grant select on public.products to anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.admins to authenticated;

-- Orders: a signed-in admin may read and update them (never delete, so order
-- history is permanent). The storefront may only ever create one.
grant select, update on public.orders to authenticated;
grant insert on public.orders to anon;

--  IMPORTANT: anon gets INSERT but deliberately NOT SELECT on `orders`. That
--  is what stops anyone reading your customers' names, addresses and phone
--  numbers. The side effect is that the storefront must never ask PostgREST
--  for the inserted row back — `.insert(row).select()` sends
--  Prefer: return=representation, which runs INSERT ... RETURNING, and
--  RETURNING requires SELECT privilege. Postgres rejects the whole INSERT with
--  42501 and the order is lost even though the customer saw "Order Placed".
--  Insert WITHOUT .select()/.single() and trust the trigger below for money.
revoke select on public.orders from anon;

-- Strip everything else, in case the project was set up with wide-open grants.
revoke update, delete on public.orders from anon;
revoke insert, update, delete on public.categories from anon;
revoke insert, update, delete on public.products from anon;
revoke all on public.admin_invites from anon, authenticated;

-- ============================================================================
--  4.  ROW LEVEL SECURITY
--  Everything is denied by default; each table opts in explicitly below.
-- ============================================================================

alter table public.admin_invites enable row level security;
alter table public.admins         enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.orders         enable row level security;

-- admin_invites: NO policies at all -> unreachable by any client, service role only.
drop policy if exists admin_invites_all on public.admin_invites;

-- admins: an admin may read the roster. Nobody may write it from a client.
drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins
  for select to authenticated using (public.is_admin());

-- categories: public read, admin write.
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
  for select to anon, authenticated using (true);

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- products: the storefront may only ever see ACTIVE rows.
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated using (active);

-- products: full control, but only for admins. Also lets an admin read the
-- inactive rows, which the public policy deliberately hides.
drop policy if exists products_admin_all on public.products;
create policy products_admin_all on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- orders: the storefront may CREATE an order, and may read nothing.
drop policy if exists orders_public_insert on public.orders;
create policy orders_public_insert on public.orders
  for insert to anon, authenticated
  with check (status = 'new' and payment = 'COD');

-- orders: admins read and update. Deletes stay off so order history is not lost.
drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders
  for select to authenticated using (public.is_admin());

drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
--  5.  TRIGGERS
-- ============================================================================

-- Promote a brand new auth user to admin, but ONLY if invited.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.admin_invites i where lower(i.email) = lower(new.email)) then
    insert into public.admins (user_id, email, name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill. The trigger above only fires when a NEW auth user is created, so
-- an account that was made *before* its address was added to admin_invites
-- would never be promoted and the panel would sit empty forever ("signed in,
-- but not on the admin list"). This promotes every invited address that
-- already has an account. Safe to re-run.
insert into public.admins (user_id, email, name)
select u.id, u.email, u.raw_user_meta_data ->> 'full_name'
from auth.users u
join public.admin_invites i on lower(i.email) = lower(u.email)
on conflict (user_id) do nothing;

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Never trust the browser with money or status. On every insert we recompute
-- the totals from the products table and force the status back to 'new'.
--
-- The client is not trusted for the item list either: every line must name a
-- product that actually exists and is on sale, quantities are capped, and the
-- line count is bounded. Without this anyone could post a thousand-rupee order
-- made of invented ids, or a single order for ten thousand frames, and wreck
-- the revenue figures on the dashboard.
create or replace function public.lock_order_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  p record;
  sum bigint := 0;
  qty int;
  lines int := 0;
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

    select pr.price into p
      from public.products pr
     where pr.id = item ->> 'id'
       and pr.active;

    if not found then
      raise exception 'product % is not available', item ->> 'id' using errcode = '22023';
    end if;

    -- A non-numeric or absurd quantity is rejected rather than silently fixed,
    -- so a broken client is visible instead of quietly mis-billing someone.
    qty := (item ->> 'qty')::int;
    if qty is null or qty < 1 or qty > 10 then
      raise exception 'quantity must be between 1 and 10' using errcode = '22023';
    end if;

    sum := sum + p.price::bigint * qty;
  end loop;

  if sum <= 0 then
    raise exception 'order total must be greater than zero' using errcode = '22023';
  end if;

  new.subtotal := sum;
  new.delivery := 250;
  new.total    := sum + 250;
  return new;
end;
$$;

drop trigger if exists orders_lock on public.orders;
create trigger orders_lock before insert on public.orders
  for each row execute function public.lock_order_on_insert();

-- A store owner must not be able to mark their own order delivered by accident.
create or replace function public.guard_order_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- total/subtotal/delivery are server-owned: restore them if a client changed them.
    new.subtotal := old.subtotal;
    new.delivery := old.delivery;
    new.total    := old.total;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard on public.orders;
create trigger orders_guard before update on public.orders
  for each row execute function public.guard_order_total();

-- ============================================================================
--  6.  DASHBOARD VIEWS
-- ============================================================================

create or replace view public.order_stats
with (security_invoker = true) as
  select
    count(*)                                        as total_orders,
    count(*) filter (where status = 'new')          as new_orders,
    count(*) filter (where status = 'confirmed')    as confirmed_orders,
    count(*) filter (where status = 'shipped')      as shipped_orders,
    count(*) filter (where status = 'delivered')    as delivered_orders,
    count(*) filter (where status = 'cancelled')    as cancelled_orders,
    coalesce(sum(total) filter (where status <> 'cancelled'), 0) as revenue,
    max(created_at)                                 as last_order_at
  from public.orders;

grant select on public.order_stats to authenticated;

create or replace view public.top_products
with (security_invoker = true) as
  select
    p.id, p.name, p.price, p.sold, p.image,
    coalesce(sum((i ->> 'qty')::int), 0) as units_ordered
  from public.products p
  left join lateral jsonb_array_elements(
    (select o.items from public.orders o where o.status <> 'cancelled')
  ) i on true
  group by p.id, p.name, p.price, p.sold, p.image
  order by units_ordered desc, p.sold desc
  limit 6;

grant select on public.top_products to authenticated;

-- ============================================================================
--  7.  SEED DATA
--  Matches the hard-coded catalogue in script.js exactly, so switching the
--  storefront over to Supabase changes nothing visually.
--  Re-running is safe: ON CONFLICT DO UPDATE.
-- ============================================================================

insert into public.categories (slug, name, image, sort_order) values
  ('Modern',  'Modern',  'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=900&q=70', 1),
  ('Wooden',  'Wooden',  'https://images.unsplash.com/photo-1766579696917-5335e0a82962?auto=format&fit=crop&w=900&q=70', 2),
  ('Luxury',  'Luxury',  'https://images.unsplash.com/photo-1674816926075-dff16b68a24f?auto=format&fit=crop&w=900&q=70', 3),
  ('Family',  'Family',  'https://images.unsplash.com/photo-1680475749670-ec339eab0b3f?auto=format&fit=crop&w=900&q=70', 4),
  ('Art',     'Art',     'https://images.unsplash.com/photo-1714859100411-74b0b9a6bf15?auto=format&fit=crop&w=900&q=70', 5)
on conflict (slug) do update
  set name = excluded.name, image = excluded.image, sort_order = excluded.sort_order;

insert into public.products
  (id, name, category, price, old_price, image, material, color, color_hex, rating, reviews, sold, sizes, description, featured, active)
values
  ('minimal-black-frame', 'Minimal Black Frame', 'Modern', 1499, 1799,
   'https://images.unsplash.com/photo-1601360204725-a50359faad2f?auto=format&fit=crop&w=800&q=70',
   'Engineered Wood', 'Matte Black', '#1c1c1c', 4.8, 214, 340,
   array['8 × 10 inch','12 × 16 inch','16 × 20 inch','18 × 24 inch'],
   'A clean, ultra-thin black frame with a crisp rectangular profile. Built for modern interiors, offices and bedrooms, it comes with clear acrylic glazing, an acid-free backing board and hanging hardware already fitted — so all you have to do is pick your spot and hang it.', true, true),

  ('golden-luxury-frame', 'Golden Luxury Frame', 'Luxury', 1999, 2499,
   'https://images.unsplash.com/photo-1774907432786-900e87e15cfc?auto=format&fit=crop&w=800&q=70',
   'Solid Wood + Gold Leaf', 'Antique Gold', '#b08d57', 4.9, 168, 275,
   array['8 × 10 inch','12 × 16 inch','16 × 20 inch','18 × 24 inch'],
   'Statement luxury with a hand-finished gold profile and softly bevelled inner edge. The deep gold tone pairs beautifully with dark walls, velvet sofas and classic artwork. Reinforced backing makes it stable and museum-flat even at 18 × 24 inch.', true, true),

  ('modern-family-frame', 'Modern Family Frame', 'Family', 1699, 1999,
   'https://images.unsplash.com/photo-1721825170822-936b26b0b7ac?auto=format&fit=crop&w=800&q=70',
   'MDF with PVC Wrap', 'Warm White', '#f2ece1', 4.7, 132, 210,
   array['12 × 16 inch','16 × 20 inch','18 × 24 inch'],
   'A wider format made for family portraits and group photos. The warm white finish blends into light walls while the deeper mat opening keeps the photo itself the hero. A favourite for living rooms, staircases and entry halls.', true, true),

  ('abstract-art-frame', 'Abstract Art Frame', 'Art', 1299, null,
   'https://images.unsplash.com/photo-1622542796254-5b9c46ab0d2f?auto=format&fit=crop&w=800&q=70',
   'Premium Wood', 'Natural Oak', '#c8a97c', 4.6, 96, 185,
   array['8 × 10 inch','12 × 16 inch','16 × 20 inch','18 × 24 inch'],
   'Designed around bold graphic and abstract prints. The slim natural-oak profile adds warmth without competing with the artwork, and the deep-set glazing gives prints a gallery-style depth. Great for studios, home offices and feature walls.', true, true),

  ('wooden-classic-frame', 'Wooden Classic Frame', 'Wooden', 1799, 2199,
   'https://images.unsplash.com/photo-1582053628662-c65b0e0544e9?auto=format&fit=crop&w=800&q=70',
   'Solid Sheesham Wood', 'Walnut Brown', '#6b4a2f', 4.8, 187, 260,
   array['8 × 10 inch','12 × 16 inch','16 × 20 inch','18 × 24 inch'],
   'Timeless sheesham wood with a hand-rubbed walnut finish and visible grain. Substantial enough to feel like an heirloom, quiet enough for a bedroom wall. Each frame is inspected by hand before it is wrapped and dispatched.', true, true),

  ('premium-gallery-set', 'Premium Gallery Set', 'Modern', 3999, 4999,
   'https://images.unsplash.com/photo-1465161191540-aac346fcbaff?auto=format&fit=crop&w=800&q=70',
   'Mixed Wood + Metal Detail', 'Assorted Neutral', '#b8a893', 5.0, 74, 130,
   array['8 × 10 inch','12 × 16 inch','16 × 20 inch'],
   'A coordinated set of six frames in mixed sizes, pre-matched so they hang together without looking identical. The fastest way to turn one empty wall into a full gallery wall. Hanging template and spacers included.', true, true),

  ('white-oak-square-frame', 'White Oak Square Frame', 'Wooden', 1599, null,
   'https://images.unsplash.com/photo-1626846116799-ad61f874f99d?auto=format&fit=crop&w=800&q=70',
   'Solid Oak', 'Light Oak', '#d8c1a0', 4.7, 58, 120,
   array['8 × 10 inch','12 × 16 inch','16 × 20 inch'],
   'Square-profile white oak with a soft matte finish. The neutral tone works with both warm and cool palettes, and the square shape is an easy match for portrait, landscape or square prints.', false, true),

  ('floral-print-frame', 'Floral Print Frame', 'Art', 1199, 1399,
   'https://images.unsplash.com/photo-1632258521940-b29d7d2ae9f5?auto=format&fit=crop&w=800&q=70',
   'Engineered Wood', 'Ivory White', '#f5f1e8', 4.5, 81, 145,
   array['8 × 10 inch','12 × 16 inch','16 × 20 inch'],
   'A light ivory frame with delicate proportions, made for botanical prints, florals and soft illustrations. Comes with a wide mat window so smaller prints look perfectly centred.', false, true)
on conflict (id) do update set
  name        = excluded.name,
  category    = excluded.category,
  price       = excluded.price,
  old_price   = excluded.old_price,
  image       = excluded.image,
  material    = excluded.material,
  color       = excluded.color,
  color_hex   = excluded.color_hex,
  rating      = excluded.rating,
  reviews     = excluded.reviews,
  sold        = excluded.sold,
  sizes       = excluded.sizes,
  description = excluded.description;

-- ============================================================================
--  8.  FIRST ADMIN  ←  EDIT THIS LINE BEFORE RUNNING
--  The address below must match the email you use on /admin-access.html.
-- ============================================================================

insert into public.admin_invites (email, note)
values ('you@example.com', 'store owner — replace this with your real email')
on conflict (email) do update set note = excluded.note;

-- To add another admin later, just add their address:
--   insert into public.admin_invites (email) values ('second@example.com');

-- ============================================================================
--  DONE.  Next:
--   1. Supabase → Authentication → Users → "Add user" (or use the sign-up form
--      on /admin-access.html). Use the SAME email you put in admin_invites.
--   2. Project Settings → API → copy Project URL and anon public key into
--      config.js.
--   3. Sign in at /admin-access.html.
-- ============================================================================

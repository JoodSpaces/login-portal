-- =====================================================================
--  JOOD Tracker — Supabase schema
--  Run once in your Supabase project: SQL Editor → paste → Run.
--  Then create users in Authentication → Users and insert a matching
--  row in `profiles` (role = 'admin' or 'owner').
-- =====================================================================

-- 1. Profiles: role per user ------------------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'owner',   -- 'admin' | 'owner'
  created_at timestamptz default now()
);

-- 2. Units (properties) -----------------------------------------------
create table if not exists units (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references auth.users(id) not null,
  name       text not null,
  location   text,
  bedrooms   int default 1,
  created_at timestamptz default now()
);

-- 3. Bookings / guests ------------------------------------------------
create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid references units(id) on delete cascade not null,
  guest_name     text not null,
  source         text default 'Direct',       -- Airbnb | Booking.com | Direct | VRBO
  checkin        date not null,
  checkout       date not null,
  nights         int,
  guests         int default 1,
  nightly_rate   numeric default 0,
  total          numeric default 0,           -- gross booking value
  platform_fee   numeric default 0,
  cleaning_fee   numeric default 0,
  payment_status text default 'Pending',      -- Paid | Pending
  phone          text,
  email          text,
  notes          text,
  created_at     timestamptz default now()
);

-- 4. Expenses ---------------------------------------------------------
create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid references units(id) on delete cascade not null,
  date        date not null,
  category    text default 'Other',            -- Cleaning | Maintenance | Utilities | Supplies | Other
  description text,
  amount      numeric default 0,
  created_at  timestamptz default now()
);

-- 5. Owner payouts ----------------------------------------------------
create table if not exists payouts (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid references units(id) on delete cascade not null,
  date       date not null,
  amount     numeric default 0,
  note       text,
  created_at timestamptz default now()
);

-- =====================================================================
--  Row Level Security — admins see everything, owners see their units
-- =====================================================================
alter table profiles enable row level security;
alter table units    enable row level security;
alter table bookings enable row level security;
alter table expenses enable row level security;
alter table payouts  enable row level security;

-- helper: is the current user an admin?
create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles: a user reads their own row; admins read all
create policy "read own profile" on profiles
  for select using (id = auth.uid() or is_admin());

-- units
create policy "read units"   on units   for select using (owner_id = auth.uid() or is_admin());
create policy "write units"  on units   for all    using (owner_id = auth.uid() or is_admin())
                                                    with check (owner_id = auth.uid() or is_admin());

-- child tables: access follows the parent unit's ownership
create policy "read bookings"  on bookings for select
  using (unit_id in (select id from units where owner_id = auth.uid()) or is_admin());
create policy "write bookings" on bookings for all
  using (unit_id in (select id from units where owner_id = auth.uid()) or is_admin())
  with check (unit_id in (select id from units where owner_id = auth.uid()) or is_admin());

create policy "read expenses"  on expenses for select
  using (unit_id in (select id from units where owner_id = auth.uid()) or is_admin());
create policy "write expenses" on expenses for all
  using (unit_id in (select id from units where owner_id = auth.uid()) or is_admin())
  with check (unit_id in (select id from units where owner_id = auth.uid()) or is_admin());

create policy "read payouts"  on payouts for select
  using (unit_id in (select id from units where owner_id = auth.uid()) or is_admin());
create policy "write payouts" on payouts for all
  using (unit_id in (select id from units where owner_id = auth.uid()) or is_admin())
  with check (unit_id in (select id from units where owner_id = auth.uid()) or is_admin());

-- =====================================================================
--  Optional: auto-create a profile row when a user signs up
-- =====================================================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'owner')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

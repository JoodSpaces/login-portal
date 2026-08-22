-- Superseded. The portal and tracker share one database, so both schemas
-- are now maintained in a single file at the project root:
--     supabase-schema.sql
-- Run that file in the Supabase SQL Editor instead of this one.

-- =====================================================================
--  JOOD — full Supabase schema (Owner Portal + Guest & Finance Tracker)
--
--  HOW TO RUN
--    Supabase → SQL Editor → New query → paste this whole file → Run.
--    Safe to re-run at any time (every statement is idempotent).
--
--  IMPORTANT: the portal and the tracker share ONE `units` table and ONE
--  `profiles` table. Run this single file, not the two older per-app files.
--
--  AFTER RUNNING — make yourself staff (find your id in Authentication → Users):
--    update profiles set role = 'admin' where id = '<your-auth-user-id>';
--
--  PERMISSION MODEL
--    admin (JOOD staff) → read + write everything
--    owner             → read only their own unit and its children
--                        (plus marking their own messages as read)
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
--  1. TABLES
-- ─────────────────────────────────────────────────────────────────────

create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'owner',      -- 'admin' | 'owner'
  created_at timestamptz default now()
);

create table if not exists units (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) not null,
  name          text not null,
  location      text,
  -- portal fields
  stage         text default 'review',           -- 'review' | 'ready' | 'live'
  stage_label   text,
  specs         jsonb default '[]',              -- [["Floor Area","360 m²"],["Bedrooms","3"]]
  income        text,
  income_note   text,
  proposal_url  text,
  room_tool_url text,
  -- tracker fields
  bedrooms      int default 1,
  -- investment model (drives the automatic owner payout)
  model            text default 'commission',   -- 'commission' | 'partnership' | 'guaranteed'
  commission_pct   numeric default 25,          -- Model 01: JOOD's cut of net-after-platform-fees
  owner_split_pct  numeric default 60,          -- Model 02: owner's share of net-after-platform-fees
  guaranteed_rent  numeric default 0,           -- Model 03: fixed rent paid to the owner each month
  model_note       text,
  -- projected owner income, entered per unit (null = fall back to `projections`)
  proj_usd         numeric,
  proj_fx          numeric,
  proj_occ         numeric,
  proj_fee         numeric,
  created_at    timestamptz default now()
);
-- if `units` already existed from an older run, add anything missing
alter table units add column if not exists stage         text default 'review';
alter table units add column if not exists stage_label   text;
alter table units add column if not exists specs         jsonb default '[]';
alter table units add column if not exists income        text;
alter table units add column if not exists income_note   text;
alter table units add column if not exists proposal_url  text;
alter table units add column if not exists room_tool_url text;
alter table units add column if not exists bedrooms      int default 1;
alter table units add column if not exists model           text default 'commission';
alter table units add column if not exists commission_pct  numeric default 25;
alter table units add column if not exists owner_split_pct numeric default 60;
alter table units add column if not exists guaranteed_rent numeric default 0;
alter table units add column if not exists model_note      text;
-- projected owner income, entered per unit (shown on the portal overview)
alter table units add column if not exists proj_usd numeric;
alter table units add column if not exists proj_fx  numeric;
alter table units add column if not exists proj_occ numeric;
alter table units add column if not exists proj_fee numeric;

create table if not exists documents (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid references units(id) on delete cascade not null,
  title      text not null,
  meta       text,
  tag        text default 'PDF',
  file_path  text,                               -- path inside the `documents` storage bucket
  created_at timestamptz default now()
);
alter table documents add column if not exists file_path text;

create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid references units(id) on delete cascade not null,
  from_name  text not null,
  body       text not null,
  unread     boolean default true,
  created_at timestamptz default now()
);

create table if not exists projections (
  id         int primary key default 1,
  usd        numeric default 0,
  fx         numeric default 0,
  occ        numeric default 0,
  fee        numeric default 0,
  updated_at timestamptz default now(),
  constraint projections_single_row check (id = 1)
);
insert into projections (id) values (1) on conflict (id) do nothing;

create table if not exists guests (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  phone         text,
  email         text,
  nationality   text,
  tags          text[] default '{}',            -- VIP | Corporate | Repeat | Blocked …
  notes         text,
  marketing_ok  boolean default false,          -- consent to be contacted directly
  first_stay    date,
  created_at    timestamptz default now()
);
-- one guest per contact detail: phone and email are the identity keys
create unique index if not exists guests_phone_key on guests (phone) where phone is not null and phone <> '';
create unique index if not exists guests_email_key on guests (lower(email)) where email is not null and email <> '';
create index if not exists guests_name_idx on guests (lower(full_name));

create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid references units(id) on delete cascade not null,
  guest_name     text not null,
  source         text default 'Direct',          -- Airbnb | Booking.com | Direct | VRBO
  checkin        date not null,
  checkout       date not null,
  nights         int,
  guests         int default 1,
  nightly_rate   numeric default 0,
  total          numeric default 0,              -- gross booking value
  platform_fee   numeric default 0,
  cleaning_fee   numeric default 0,
  payment_status text default 'Pending',         -- Paid | Pending
  phone          text,
  email          text,
  notes          text,
  guest_id       uuid references guests(id) on delete set null,
  created_at     timestamptz default now()
);
alter table bookings add column if not exists guest_id uuid references guests(id) on delete set null;
create index if not exists bookings_guest_idx on bookings (guest_id);

-- ── Backfill: build a guest record per distinct contact, then link bookings ──
-- Matches on phone first, then email, then (name) as a last resort.
insert into guests (full_name, phone, email, first_stay)
select distinct on (coalesce(nullif(b.phone,''), nullif(lower(b.email),''), lower(b.guest_name)))
       b.guest_name,
       nullif(b.phone,''),
       nullif(b.email,''),
       min(b.checkin) over (partition by coalesce(nullif(b.phone,''), nullif(lower(b.email),''), lower(b.guest_name)))
from bookings b
where b.guest_id is null
order by coalesce(nullif(b.phone,''), nullif(lower(b.email),''), lower(b.guest_name)), b.checkin
on conflict do nothing;

update bookings b set guest_id = g.id
from guests g
where b.guest_id is null
  and (   (nullif(b.phone,'')       is not null and g.phone = b.phone)
       or (nullif(b.email,'')       is not null and lower(g.email) = lower(b.email))
       or (coalesce(b.phone,'')='' and coalesce(b.email,'')='' and lower(g.full_name) = lower(b.guest_name)));

create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid references units(id) on delete cascade not null,
  date        date not null,
  category    text default 'Other',              -- Cleaning | Maintenance | Utilities | Supplies | Other
  description text,
  amount      numeric default 0,
  created_at  timestamptz default now()
);

create table if not exists payouts (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid references units(id) on delete cascade not null,
  date       date not null,
  amount     numeric default 0,
  note       text,
  created_at timestamptz default now()
);

-- helpful indexes for the tracker's period filters
create index if not exists bookings_unit_checkin_idx on bookings (unit_id, checkin);
create index if not exists expenses_unit_date_idx    on expenses (unit_id, date);
create index if not exists payouts_unit_date_idx     on payouts  (unit_id, date);
create index if not exists messages_unit_created_idx on messages (unit_id, created_at desc);
create index if not exists units_owner_idx           on units    (owner_id);

-- ─────────────────────────────────────────────────────────────────────
--  1b. SOFT DELETES — nothing in the app is ever destroyed
--      "Remove" stamps deleted_at; the Trash view restores it.
-- ─────────────────────────────────────────────────────────────────────
alter table units    add column if not exists deleted_at timestamptz;
alter table bookings add column if not exists deleted_at timestamptz;
alter table expenses add column if not exists deleted_at timestamptz;
alter table payouts  add column if not exists deleted_at timestamptz;
alter table guests   add column if not exists deleted_at timestamptz;
alter table documents add column if not exists deleted_at timestamptz;
alter table messages  add column if not exists deleted_at timestamptz;

create index if not exists units_live_idx    on units    (deleted_at) where deleted_at is null;
create index if not exists bookings_live_idx on bookings (deleted_at) where deleted_at is null;
create index if not exists expenses_live_idx on expenses (deleted_at) where deleted_at is null;
create index if not exists payouts_live_idx  on payouts  (deleted_at) where deleted_at is null;
create index if not exists guests_live_idx   on guests   (deleted_at) where deleted_at is null;

-- Removing a unit must NOT cascade-destroy its history. Detach the child
-- foreign keys from "on delete cascade" so a hard delete can't wipe years of
-- records by accident — the app soft-deletes instead.
do $$
begin
  execute 'alter table bookings drop constraint if exists bookings_unit_id_fkey';
  execute 'alter table bookings add  constraint bookings_unit_id_fkey foreign key (unit_id) references units(id) on delete restrict';
  execute 'alter table expenses drop constraint if exists expenses_unit_id_fkey';
  execute 'alter table expenses add  constraint expenses_unit_id_fkey foreign key (unit_id) references units(id) on delete restrict';
  execute 'alter table payouts  drop constraint if exists payouts_unit_id_fkey';
  execute 'alter table payouts  add  constraint payouts_unit_id_fkey  foreign key (unit_id) references units(id) on delete restrict';
exception when others then
  raise notice 'foreign keys left as-is: %', sqlerrm;
end $$;


-- ─────────────────────────────────────────────────────────────────────
--  2. HELPERS
-- ─────────────────────────────────────────────────────────────────────

-- is the signed-in user JOOD staff?
create or replace function is_admin() returns boolean
language sql security definer stable
set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- does the signed-in user own this unit (or are they staff)?
create or replace function owns_unit(u uuid) returns boolean
language sql security definer stable
set search_path = public as $$
  select is_admin() or exists(select 1 from units where id = u and owner_id = auth.uid());
$$;


-- ─────────────────────────────────────────────────────────────────────
--  3. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────

alter table profiles    enable row level security;
alter table units       enable row level security;
alter table documents   enable row level security;
alter table messages    enable row level security;
alter table projections enable row level security;
alter table guests      enable row level security;
alter table bookings    enable row level security;
alter table expenses    enable row level security;
alter table payouts     enable row level security;

-- clear any policies from earlier versions of the schema
drop policy if exists "owners view own unit"      on units;
drop policy if exists "owners view own documents" on documents;
drop policy if exists "owners view own messages"  on messages;
drop policy if exists "read own profile"          on profiles;
drop policy if exists "profiles read"             on profiles;
drop policy if exists "profiles self name"        on profiles;
drop policy if exists "profiles admin write"      on profiles;
drop policy if exists "read units"                on units;
drop policy if exists "write units"               on units;
drop policy if exists "units read"                on units;
drop policy if exists "units admin write"         on units;
drop policy if exists "documents read"            on documents;
drop policy if exists "documents admin write"     on documents;
drop policy if exists "messages read"             on messages;
drop policy if exists "messages admin write"      on messages;
drop policy if exists "messages owner mark read"  on messages;
drop policy if exists "projections read"          on projections;
drop policy if exists "projections admin write"   on projections;
drop policy if exists "read bookings"             on bookings;
drop policy if exists "write bookings"            on bookings;
drop policy if exists "read expenses"             on expenses;
drop policy if exists "write expenses"            on expenses;
drop policy if exists "read payouts"              on payouts;
drop policy if exists "write payouts"             on payouts;
drop policy if exists "read guests"              on guests;
drop policy if exists "write guests"             on guests;

-- profiles ------------------------------------------------------------
create policy "profiles read" on profiles
  for select using (id = auth.uid() or is_admin());

-- a user may edit their own row but NOT change their own role
create policy "profiles self name" on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid()
              and role = (select p.role from profiles p where p.id = auth.uid()));

create policy "profiles admin write" on profiles
  for all using (is_admin()) with check (is_admin());

-- units ---------------------------------------------------------------
create policy "units read" on units
  for select using (is_admin() or (owner_id = auth.uid() and deleted_at is null));

create policy "units admin write" on units
  for all using (is_admin()) with check (is_admin());

-- documents -----------------------------------------------------------
create policy "documents read" on documents
  for select using (is_admin() or (owns_unit(unit_id) and deleted_at is null));

create policy "documents admin write" on documents
  for all using (is_admin()) with check (is_admin());

-- messages ------------------------------------------------------------
create policy "messages read" on messages
  for select using (is_admin() or (owns_unit(unit_id) and deleted_at is null));

create policy "messages admin write" on messages
  for all using (is_admin()) with check (is_admin());

-- owners may only flip the read state of their own messages
create policy "messages owner mark read" on messages
  for update using (owns_unit(unit_id))
  with check (owns_unit(unit_id));

create or replace function guard_message_edit() returns trigger
language plpgsql
set search_path = public as $$
begin
  if not is_admin() then
    if new.unit_id   is distinct from old.unit_id
    or new.from_name is distinct from old.from_name
    or new.body      is distinct from old.body then
      raise exception 'owners may only change the read state of a message';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists messages_guard on messages;
create trigger messages_guard before update on messages
  for each row execute function guard_message_edit();

-- projections (any signed-in user reads; staff edit) -------------------
create policy "projections read" on projections
  for select using (auth.uid() is not null);

create policy "projections admin write" on projections
  for all using (is_admin()) with check (is_admin());

-- tracker data: owners READ their unit's records, only JOOD writes ----
create policy "read bookings"  on bookings for select using (is_admin() or (owns_unit(unit_id) and deleted_at is null));
create policy "write bookings" on bookings for all    using (is_admin()) with check (is_admin());

create policy "read expenses"  on expenses for select using (is_admin() or (owns_unit(unit_id) and deleted_at is null));
create policy "write expenses" on expenses for all    using (is_admin()) with check (is_admin());

create policy "read payouts"   on payouts  for select using (is_admin() or (owns_unit(unit_id) and deleted_at is null));
create policy "write payouts"  on payouts  for all    using (is_admin()) with check (is_admin());

-- guest book: JOOD only. Owners never see other owners' guests, or their own
-- guests' contact details — that list is JOOD's operating asset.
create policy "read guests"  on guests for select using (is_admin());
create policy "write guests" on guests for all    using (is_admin()) with check (is_admin());

-- ── Owner-safe guest directory ──
-- Owners get name, country and stay dates for guests in THEIR units — and
-- nothing else. The view is security-definer (RLS on `guests` is bypassed),
-- so the owns_unit() filter here IS the access control. Contact details,
-- tags, notes and consent are simply not selected, so they can't leak.
drop view if exists guest_directory;
create view guest_directory as
select g.id            as guest_id,
       g.full_name,
       g.nationality,
       b.unit_id,
       b.id            as booking_id,
       b.checkin,
       b.checkout,
       coalesce(b.nights, greatest(0, (b.checkout - b.checkin))) as nights
from guests g
join bookings b on b.guest_id = g.id
where g.deleted_at is null
  and b.deleted_at is null
  and owns_unit(b.unit_id);

grant select on guest_directory to authenticated;


-- ─────────────────────────────────────────────────────────────────────
--  4. STORAGE — private `documents` bucket
--     Object path convention: "<unit_id>/contract.pdf"
-- ─────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "docs read own unit" on storage.objects;
drop policy if exists "docs admin write"   on storage.objects;

create policy "docs read own unit" on storage.objects
  for select using (
    bucket_id = 'documents'
    and owns_unit(nullif(split_part(name, '/', 1), '')::uuid)
  );

create policy "docs admin write" on storage.objects
  for all using (bucket_id = 'documents' and is_admin())
  with check (bucket_id = 'documents' and is_admin());


-- ─────────────────────────────────────────────────────────────────────
--  5. AUTO-CREATE A PROFILE ON SIGNUP (role defaults to 'owner')
-- ─────────────────────────────────────────────────────────────────────

create or replace function handle_new_user() returns trigger
language plpgsql security definer
set search_path = public as $$
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

-- backfill profiles for users created before this trigger existed
insert into profiles (id, full_name, role)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.email), 'owner'
from auth.users u
on conflict (id) do nothing;


-- =====================================================================
--  6. NEXT STEPS (run by hand, replacing the placeholders)
-- =====================================================================
-- Make yourself staff:
--   update profiles set role = 'admin' where id = '<your-auth-user-id>';
--
-- Create an owner's unit:
--   insert into units (owner_id, name, location, bedrooms, stage, income, income_note)
--   values ('<owner-auth-user-id>', 'Villa Dunes', 'Katameya Dunes', 4, 'review', '—', 'Projection pending');
--
-- Set the shared projection shown on the portal overview:
--   update projections set usd = 4200, fx = 48.5, occ = 0.72, fee = 0.18, updated_at = now() where id = 1;
--
-- Per-unit projected owner income (overrides the shared row for that unit):
--   update units set proj_usd = 4200, proj_fx = 48.5, proj_occ = 72, proj_fee = 25
--   where name = 'Villa Dunes';

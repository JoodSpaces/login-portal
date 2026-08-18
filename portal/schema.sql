-- JOOD Owner Portal — run this once in Supabase SQL Editor

create table units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  name text not null,
  location text,
  stage text default 'review',        -- 'review' | 'ready' | 'live'
  stage_label text,
  specs jsonb default '[]',            -- e.g. [["Floor Area","360 m²"],["Bedrooms","3"]]
  income text,
  income_note text,
  proposal_url text,
  room_tool_url text,
  created_at timestamptz default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references units(id) not null,
  title text not null,
  meta text,
  tag text default 'PDF',
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references units(id) not null,
  from_name text not null,
  body text not null,
  unread boolean default true,
  created_at timestamptz default now()
);

alter table units enable row level security;
alter table documents enable row level security;
alter table messages enable row level security;

create policy "owners view own unit" on units
  for select using (owner_id = auth.uid());

create policy "owners view own documents" on documents
  for select using (unit_id in (select id from units where owner_id = auth.uid()));

create policy "owners view own messages" on messages
  for select using (unit_id in (select id from units where owner_id = auth.uid()));

create table if not exists public.watchlist_items (
  id bigint generated always as identity primary key,
  symbol text not null unique,
  name text not null,
  market text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.weight_entries (
  id bigint generated always as identity primary key,
  entry_date date not null unique,
  target_weight numeric,
  actual_weight numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.running_entries (
  id bigint generated always as identity primary key,
  entry_date date not null,
  distance_km numeric not null,
  duration_minutes numeric not null,
  avg_pace_seconds integer not null,
  note text,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists running_entries_source_external_id_idx
  on public.running_entries (source, external_id)
  where external_id is not null;

create table if not exists public.integration_tokens (
  provider text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.watchlist_items enable row level security;
alter table public.weight_entries enable row level security;
alter table public.running_entries enable row level security;
alter table public.integration_tokens enable row level security;

drop policy if exists "service role full access watchlist_items" on public.watchlist_items;
create policy "service role full access watchlist_items"
  on public.watchlist_items
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role full access weight_entries" on public.weight_entries;
create policy "service role full access weight_entries"
  on public.weight_entries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role full access running_entries" on public.running_entries;
create policy "service role full access running_entries"
  on public.running_entries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role full access integration_tokens" on public.integration_tokens;
create policy "service role full access integration_tokens"
  on public.integration_tokens
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- DetailDesk – schemat bazy (Supabase / Postgres)
-- Dostęp: wyłącznie właściciel studia (e-mail w app_owner). Klienci NIE mają dostępu do tabel –
-- ich strony działają przez funkcję Edge „public”, która zwraca tylko dane jednego zlecenia po tokenie.

create extension if not exists pgcrypto;

-- właściciel (e-mail logowania)
create table if not exists public.app_owner (email text primary key);
alter table public.app_owner enable row level security; -- brak polityk = brak dostępu z API

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_owner
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) and coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated, anon;

-- tabele dokumentowe: id + dane (jsonb)
do $$
declare t text;
begin
  foreach t in array array['cars', 'jobs', 'quotes', 'protocols'] loop
    execute format('create table if not exists public.%I (
      id uuid primary key default gen_random_uuid(),
      data jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy owner_all on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- token strony klienta: 48 znaków hex = 192 bity losowości (niezgadywalny)
alter table public.jobs add column if not exists token text unique not null default encode(gen_random_bytes(24), 'hex');
create index if not exists jobs_status_idx on public.jobs ((data ->> 'status'));
create index if not exists jobs_date_idx on public.jobs ((data ->> 'date'));

-- ustawienia, log przypomnień itp.
create table if not exists public.meta (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
alter table public.meta enable row level security;
drop policy if exists owner_all on public.meta;
create policy owner_all on public.meta for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- subskrypcje Web Push (iPhone/komputer właściciela)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  device text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists owner_all on public.push_subscriptions;
create policy owner_all on public.push_subscriptions for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- prosty limit zapytań z formularza (ochrona przed spamem) – tylko dla funkcji serwerowych
create table if not exists public.request_log (
  id bigserial primary key,
  ip text,
  created_at timestamptz not null default now()
);
alter table public.request_log enable row level security;

-- Storage: prywatny kubełek na zdjęcia
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false;

drop policy if exists photos_owner_all on storage.objects;
create policy photos_owner_all on storage.objects for all to authenticated
  using (bucket_id = 'photos' and public.is_owner())
  with check (bucket_id = 'photos' and public.is_owner());

-- odświeżanie aplikacji na żywo po nowym zapytaniu
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'jobs') then
    alter publication supabase_realtime add table public.jobs;
  end if;
end $$;

-- uprawnienia ról (RLS i tak ogranicza wiersze do właściciela; anon nie dostaje nic)
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.cars, public.jobs, public.quotes, public.protocols, public.meta, public.push_subscriptions to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on public.cars, public.jobs, public.quotes, public.protocols, public.meta, public.push_subscriptions, public.request_log, public.app_owner from anon;

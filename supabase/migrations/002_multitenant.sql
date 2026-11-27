-- DetailDesk 002 – wiele studiów (multi-tenant) + abonamenty
-- Każdy rekord należy do studia (studio_id). RLS: odczyt tylko własnego studia,
-- zapis tylko gdy studio jest aktywne (active_until > now()). Po wygaśnięciu: tylko odczyt.

-- ---------- studia ----------
create table if not exists public.studios (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'),
  name text not null,
  email_from_name text,
  contact_email text not null,
  logo_url text,
  plan text not null default 'trial' check (plan in ('trial', 'paid', 'lifetime')),
  active_until timestamptz not null default now() + interval '30 days',
  trial_reminders jsonb not null default '{}'::jsonb,
  -- pod przyszłą integrację ze Stripe
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now()
);
alter table public.studios enable row level security;

create table if not exists public.studio_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  studio_id uuid not null references public.studios (id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);
alter table public.studio_members enable row level security;

-- administratorzy platformy (Ty)
create table if not exists public.app_admins (email text primary key);
alter table public.app_admins enable row level security;
insert into public.app_admins (email) select lower(email) from public.app_owner on conflict do nothing;

-- historia abonamentu (okres próbny, przedłużenia ręczne, płatności Stripe)
create table if not exists public.subscription_events (
  id bigserial primary key,
  studio_id uuid not null references public.studios (id) on delete cascade,
  kind text not null,                 -- trial | extend
  months int,
  amount_cents int,
  currency text default 'pln',
  source text not null,               -- registration | admin | stripe
  external_id text unique,            -- np. ID faktury Stripe – chroni przed podwójnym naliczeniem
  active_until_after timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.subscription_events enable row level security;

-- ---------- funkcje pomocnicze ----------
create or replace function public.current_studio_id() returns uuid
language sql stable security definer set search_path = public as $$
  select studio_id from public.studio_members where user_id = auth.uid();
$$;

create or replace function public.studio_is_active(p_studio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select active_until > now() from public.studios where id = p_studio), false);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
     and exists (select 1 from public.app_admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- zgodność wstecz
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_studio_id() is not null;
$$;

-- ---------- studio ARC Detailing z dotychczasowych danych ----------
do $$
declare sid uuid; uid uuid; oemail text;
begin
  select email into oemail from public.app_owner limit 1;
  if oemail is null then return; end if;
  select id into sid from public.studios where slug = 'arc-detailing';
  if sid is null then
    insert into public.studios (slug, name, email_from_name, contact_email, plan, active_until)
    values ('arc-detailing', 'ARC Detailing', 'ARC Detailing', lower(oemail), 'lifetime', '2099-12-31')
    returning id into sid;
  end if;
  select id into uid from auth.users where lower(email) = lower(oemail);
  if uid is not null then
    insert into public.studio_members (user_id, studio_id) values (uid, sid) on conflict do nothing;
  end if;
end $$;

-- ---------- studio_id we wszystkich tabelach ----------
do $$
declare t text; sid uuid := (select id from public.studios where slug = 'arc-detailing');
begin
  foreach t in array array['cars', 'jobs', 'quotes', 'protocols', 'push_subscriptions', 'meta'] loop
    execute format('alter table public.%I add column if not exists studio_id uuid references public.studios (id) on delete cascade', t);
    if sid is not null then
      execute format('update public.%I set studio_id = %L where studio_id is null', t, sid);
    end if;
    execute format('alter table public.%I alter column studio_id set default public.current_studio_id()', t);
    execute format('alter table public.%I alter column studio_id set not null', t);
    execute format('create index if not exists %I on public.%I (studio_id)', t || '_studio_idx', t);
  end loop;
end $$;

-- ustawienia: klucz unikalny w obrębie studia
alter table public.meta drop constraint if exists meta_pkey;
alter table public.meta add primary key (studio_id, key);

-- ARC ma już skonfigurowane ustawienia – pomijamy ekran pierwszej konfiguracji
insert into public.meta (studio_id, key, value)
select id, 'settings', '{"onboarded": true}'::jsonb from public.studios where slug = 'arc-detailing'
on conflict (studio_id, key) do update set value = coalesce(public.meta.value, '{}'::jsonb) || '{"onboarded": true}'::jsonb;

-- ---------- RLS: oddzielenie studiów + tryb tylko do odczytu ----------
do $$
declare t text;
begin
  foreach t in array array['cars', 'jobs', 'quotes', 'protocols', 'meta', 'push_subscriptions'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('drop policy if exists studio_select on public.%I', t);
    execute format('drop policy if exists studio_insert on public.%I', t);
    execute format('drop policy if exists studio_update on public.%I', t);
    execute format('drop policy if exists studio_delete on public.%I', t);
    execute format('create policy studio_select on public.%I for select to authenticated using (studio_id = public.current_studio_id())', t);
    execute format('create policy studio_insert on public.%I for insert to authenticated with check (studio_id = public.current_studio_id() and public.studio_is_active(studio_id))', t);
    execute format('create policy studio_update on public.%I for update to authenticated using (studio_id = public.current_studio_id() and public.studio_is_active(studio_id)) with check (studio_id = public.current_studio_id() and public.studio_is_active(studio_id))', t);
    execute format('create policy studio_delete on public.%I for delete to authenticated using (studio_id = public.current_studio_id() and public.studio_is_active(studio_id))', t);
  end loop;
end $$;

drop policy if exists studio_self on public.studios;
create policy studio_self on public.studios for select to authenticated using (id = public.current_studio_id() or public.is_admin());
drop policy if exists member_self on public.studio_members;
create policy member_self on public.studio_members for select to authenticated using (user_id = auth.uid());

grant select on public.studios, public.studio_members to authenticated;
grant all on public.studios, public.studio_members, public.app_admins, public.subscription_events to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on public.studios, public.studio_members, public.app_admins, public.subscription_events from anon;

-- ---------- abonament: jedno miejsce przedłużania (admin teraz, Stripe później) ----------
create or replace function public.extend_studio_subscription(
  p_studio uuid, p_months int, p_source text, p_external_id text default null, p_amount_cents int default null, p_actor text default null
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'Nieprawidłowa liczba miesięcy'; end if;
  -- idempotencja: ta sama płatność (np. faktura Stripe) nie przedłuży dwa razy
  if p_external_id is not null and exists (select 1 from public.subscription_events where external_id = p_external_id) then
    return (select active_until from public.studios where id = p_studio);
  end if;
  update public.studios
     set active_until = greatest(active_until, now()) + make_interval(months => p_months),
         plan = case when plan = 'lifetime' then plan else 'paid' end,
         trial_reminders = '{}'::jsonb
   where id = p_studio
  returning active_until into v_until;
  if v_until is null then raise exception 'Nie znaleziono studia'; end if;
  insert into public.subscription_events (studio_id, kind, months, amount_cents, source, external_id, active_until_after, created_by)
  values (p_studio, 'extend', p_months, p_amount_cents, p_source, p_external_id, v_until, p_actor);
  return v_until;
end $$;
revoke all on function public.extend_studio_subscription(uuid, int, text, text, int, text) from public, anon, authenticated;
grant execute on function public.extend_studio_subscription(uuid, int, text, text, int, text) to service_role;

-- ---------- RPC dla aplikacji ----------
create or replace function public.my_studio() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select json_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'email_from_name', s.email_from_name, 'contact_email', s.contact_email,
      'logo_url', s.logo_url, 'plan', s.plan, 'active_until', s.active_until, 'active', s.active_until > now(), 'is_admin', public.is_admin())
     from public.studios s where s.id = public.current_studio_id()),
    json_build_object('id', null, 'is_admin', public.is_admin()));
$$;

create or replace function public.update_my_studio(p_name text default null, p_email_from_name text default null, p_logo_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare sid uuid := public.current_studio_id();
begin
  if sid is null then raise exception 'Brak studia'; end if;
  if not public.studio_is_active(sid) then raise exception 'Tryb tylko do odczytu – okres próbny się skończył'; end if;
  update public.studios set
    name = coalesce(nullif(trim(p_name), ''), name),
    email_from_name = coalesce(nullif(trim(p_email_from_name), ''), email_from_name),
    logo_url = case when p_logo_url is null then logo_url when p_logo_url = '' then null else p_logo_url end
  where id = sid;
end $$;

create or replace function public.admin_list_studios()
returns table (id uuid, slug text, name text, contact_email text, plan text, active_until timestamptz, created_at timestamptz, jobs bigint, last_job timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  return query
    select s.id, s.slug, s.name, s.contact_email, s.plan, s.active_until, s.created_at,
           (select count(*) from public.jobs j where j.studio_id = s.id),
           (select max(j.created_at) from public.jobs j where j.studio_id = s.id)
    from public.studios s order by s.created_at desc;
end $$;

create or replace function public.admin_extend_studio(p_studio uuid, p_months int) returns timestamptz
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  if p_months not in (1, 12) then raise exception 'Dozwolone: 1 lub 12 miesięcy'; end if;
  return public.extend_studio_subscription(p_studio, p_months, 'admin', null, null, auth.jwt() ->> 'email');
end $$;

revoke all on function public.my_studio(), public.update_my_studio(text, text, text), public.admin_list_studios(), public.admin_extend_studio(uuid, int) from public, anon;
grant execute on function public.my_studio(), public.update_my_studio(text, text, text), public.admin_list_studios(), public.admin_extend_studio(uuid, int) to authenticated;

-- ---------- Storage ----------
-- zdjęcia: prywatne, ścieżka zaczyna się od ID studia (stare zdjęcia ARC – po właścicielu pliku)
drop policy if exists photos_owner_all on storage.objects;
drop policy if exists photos_select on storage.objects;
drop policy if exists photos_insert on storage.objects;
drop policy if exists photos_update on storage.objects;
drop policy if exists photos_delete on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = public.current_studio_id()::text or owner = auth.uid()));
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_studio_id()::text and public.studio_is_active(public.current_studio_id()));
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_studio_id()::text and public.studio_is_active(public.current_studio_id()));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = public.current_studio_id()::text or owner = auth.uid()) and public.studio_is_active(public.current_studio_id()));

-- logo: publiczne (widoczne na stronie rezerwacji i w e-mailach), zapis tylko do własnego folderu
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true;
drop policy if exists logos_insert on storage.objects;
drop policy if exists logos_update on storage.objects;
drop policy if exists logos_delete on storage.objects;
create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_studio_id()::text and public.studio_is_active(public.current_studio_id()));
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_studio_id()::text and public.studio_is_active(public.current_studio_id()));
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_studio_id()::text and public.studio_is_active(public.current_studio_id()));

-- ---------- pomysły i uwagi od studiów do administratora ----------
create table if not exists public.feedback (
  id bigserial primary key,
  studio_id uuid not null references public.studios (id) on delete cascade,
  author_email text,
  kind text not null default 'pomysł' check (kind in ('pomysł', 'uwaga', 'błąd')),
  message text not null check (char_length(message) between 3 and 4000),
  status text not null default 'nowe' check (status in ('nowe', 'przeczytane', 'zrobione')),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
grant all on public.feedback to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on public.feedback from anon;
-- studio widzi tylko swoje zgłoszenia; zapis przez funkcję serwerową (działa też po wygaśnięciu okresu próbnego)
grant select on public.feedback to authenticated;
drop policy if exists feedback_own on public.feedback;
create policy feedback_own on public.feedback for select to authenticated using (studio_id = public.current_studio_id());

create or replace function public.admin_list_feedback()
returns table (id bigint, studio_name text, studio_slug text, author_email text, kind text, message text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  return query select f.id, s.name, s.slug, f.author_email, f.kind, f.message, f.status, f.created_at
    from public.feedback f join public.studios s on s.id = f.studio_id order by f.created_at desc limit 200;
end $$;

create or replace function public.admin_set_feedback_status(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  update public.feedback set status = p_status where id = p_id;
end $$;
revoke all on function public.admin_list_feedback(), public.admin_set_feedback_status(bigint, text) from public, anon;
grant execute on function public.admin_list_feedback(), public.admin_set_feedback_status(bigint, text) to authenticated;

-- DetailDesk 003 – panel administratora platformy
-- ZASADA: administrator NIE ma reguł RLS do danych klientów studiów (cars, jobs, quotes, protocols, zdjęcia).
-- Widzi wyłącznie dane studiów (właścicieli) i zagregowane liczby przez funkcje admin_* poniżej.

alter table public.studios add column if not exists phone text;
alter table public.studios add column if not exists blocked boolean not null default false;
alter table public.studios add column if not exists blocked_at timestamptz;

-- aktywne = opłacone/okres próbny trwa I nie zablokowane
create or replace function public.studio_is_active(p_studio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select active_until > now() and not blocked from public.studios where id = p_studio), false);
$$;

-- notatki administratora o studiu – osobna tabela bez polityk (studio ich nie widzi)
create table if not exists public.studio_admin_notes (
  studio_id uuid primary key references public.studios (id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.studio_admin_notes enable row level security;
grant all on public.studio_admin_notes to service_role;
revoke all on public.studio_admin_notes from anon, authenticated;

-- skrzynka pomysłów: statusy + odpowiedź e-mailem
alter table public.feedback drop constraint if exists feedback_status_check;
update public.feedback set status = 'w realizacji' where status = 'przeczytane';
alter table public.feedback add constraint feedback_status_check check (status in ('nowe', 'w realizacji', 'zrobione'));
alter table public.feedback add column if not exists reply text;
alter table public.feedback add column if not exists replied_at timestamptz;

-- ogłoszenia dla wszystkich studiów
create table if not exists public.announcements (
  id bigserial primary key,
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 2000),
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
grant select on public.announcements to authenticated;
grant all on public.announcements to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on public.announcements from anon;
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated using (active);

-- ---------- studio: własne dane (z blokadą) ----------
create or replace function public.my_studio() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select json_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'email_from_name', s.email_from_name, 'contact_email', s.contact_email,
      'phone', s.phone, 'logo_url', s.logo_url, 'plan', s.plan, 'active_until', s.active_until, 'blocked', s.blocked,
      'active', s.active_until > now() and not s.blocked, 'is_admin', public.is_admin())
     from public.studios s where s.id = public.current_studio_id()),
    json_build_object('id', null, 'is_admin', public.is_admin()));
$$;

-- ---------- administrator: tylko dane studiów i liczby ----------
drop function if exists public.admin_list_studios();
create or replace function public.admin_list_studios()
returns table (
  id uuid, slug text, name text, contact_email text, phone text, plan text, active_until timestamptz, blocked boolean,
  created_at timestamptz, last_sign_in timestamptz, jobs_month bigint, bookings_month bigint, jobs_total bigint,
  revenue_cents bigint, notes text
)
language plpgsql stable security definer set search_path = public, auth as $$
declare v_month timestamptz := date_trunc('month', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw';
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  return query
    select s.id, s.slug, s.name, s.contact_email, s.phone, s.plan, s.active_until, s.blocked, s.created_at,
      (select max(u.last_sign_in_at) from public.studio_members m join auth.users u on u.id = m.user_id where m.studio_id = s.id),
      (select count(*) from public.jobs j where j.studio_id = s.id and j.created_at >= v_month),
      (select count(*) from public.jobs j where j.studio_id = s.id and j.created_at >= v_month and j.data ->> 'source' = 'online'),
      (select count(*) from public.jobs j where j.studio_id = s.id),
      (select coalesce(sum(e.amount_cents), 0)::bigint from public.subscription_events e where e.studio_id = s.id),
      (select n.notes from public.studio_admin_notes n where n.studio_id = s.id)
    from public.studios s
    order by s.created_at desc;
end $$;

create or replace function public.admin_list_payments()
returns table (id bigint, studio_id uuid, studio_name text, kind text, months int, amount_cents int, source text, active_until_after timestamptz, created_by text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  return query select e.id, e.studio_id, s.name, e.kind, e.months, e.amount_cents, e.source, e.active_until_after, e.created_by, e.created_at
    from public.subscription_events e join public.studios s on s.id = e.studio_id
    order by e.created_at desc limit 500;
end $$;

drop function if exists public.admin_extend_studio(uuid, int);
create or replace function public.admin_extend_studio(p_studio uuid, p_months int, p_amount_cents int default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  if p_months not in (1, 12) then raise exception 'Dozwolone: 1 lub 12 miesięcy'; end if;
  if p_amount_cents is not null and (p_amount_cents < 0 or p_amount_cents > 10000000) then raise exception 'Nieprawidłowa kwota'; end if;
  return public.extend_studio_subscription(p_studio, p_months, 'admin', null, p_amount_cents, auth.jwt() ->> 'email');
end $$;

create or replace function public.admin_set_blocked(p_studio uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  update public.studios set blocked = p_blocked, blocked_at = case when p_blocked then now() else null end where id = p_studio;
end $$;

create or replace function public.admin_set_notes(p_studio uuid, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  insert into public.studio_admin_notes (studio_id, notes, updated_at) values (p_studio, left(coalesce(p_notes, ''), 10000), now())
  on conflict (studio_id) do update set notes = excluded.notes, updated_at = now();
end $$;

drop function if exists public.admin_list_feedback();
create or replace function public.admin_list_feedback()
returns table (id bigint, studio_id uuid, studio_name text, author_email text, kind text, message text, status text, reply text, replied_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  return query select f.id, f.studio_id, s.name, f.author_email, f.kind, f.message, f.status, f.reply, f.replied_at, f.created_at
    from public.feedback f join public.studios s on s.id = f.studio_id order by f.created_at desc limit 300;
end $$;

create or replace function public.admin_set_feedback_status(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  if p_status not in ('nowe', 'w realizacji', 'zrobione') then raise exception 'Nieprawidłowy status'; end if;
  update public.feedback set status = p_status where id = p_id;
end $$;

create or replace function public.admin_set_announcement(p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  update public.announcements set active = false where active;
  if coalesce(trim(p_title), '') <> '' then
    insert into public.announcements (title, body, created_by) values (trim(p_title), trim(p_body), auth.jwt() ->> 'email');
  end if;
end $$;

revoke all on function
  public.admin_list_studios(), public.admin_list_payments(), public.admin_extend_studio(uuid, int, int),
  public.admin_set_blocked(uuid, boolean), public.admin_set_notes(uuid, text), public.admin_list_feedback(),
  public.admin_set_feedback_status(bigint, text), public.admin_set_announcement(text, text)
from public, anon;
grant execute on function
  public.admin_list_studios(), public.admin_list_payments(), public.admin_extend_studio(uuid, int, int),
  public.admin_set_blocked(uuid, boolean), public.admin_set_notes(uuid, text), public.admin_list_feedback(),
  public.admin_set_feedback_status(bigint, text), public.admin_set_announcement(text, text)
to authenticated;

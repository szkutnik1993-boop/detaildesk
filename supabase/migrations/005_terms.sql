-- DetailDesk 005 – akceptacja Regulaminu (z Umową powierzenia) i Polityki prywatności przy rejestracji studia
alter table public.studios add column if not exists terms_accepted_at timestamptz;
alter table public.studios add column if not exists terms_version text;
comment on column public.studios.terms_accepted_at is 'Data i godzina akceptacji Regulaminu (z Umową powierzenia) i Polityki prywatności przy rejestracji';
comment on column public.studios.terms_version is 'Wersja zaakceptowanych dokumentów, np. 2026-11-28';

-- my_studio: także data i wersja zaakceptowanych dokumentów (widoczne w Ustawieniach studia)
create or replace function public.my_studio() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select json_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'email_from_name', s.email_from_name, 'contact_email', s.contact_email,
      'phone', s.phone, 'logo_url', s.logo_url, 'plan', s.plan, 'active_until', s.active_until, 'blocked', s.blocked,
      'active', s.active_until > now() and not s.blocked, 'is_admin', public.is_admin(),
      'terms_accepted_at', s.terms_accepted_at, 'terms_version', s.terms_version)
     from public.studios s where s.id = public.current_studio_id()),
    json_build_object('id', null, 'is_admin', public.is_admin()));
$$;

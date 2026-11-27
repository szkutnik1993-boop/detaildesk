-- DetailDesk 008 – usuwanie studia przez administratora (podwójne potwierdzenie w panelu + adres studia sprawdzany na serwerze)
-- Ewidencja sprzedaży zostaje: wpłata traci powiązanie ze studiem, ale zachowuje nazwę i NIP z dnia wpłaty.
alter table public.payments alter column studio_id drop not null;
alter table public.payments drop constraint if exists payments_studio_id_fkey;
alter table public.payments add constraint payments_studio_id_fkey foreign key (studio_id) references public.studios (id) on delete set null;

-- pliki studia w Storage (usuwane przez API Storage w funkcji serwerowej – SQL nie może kasować plików)
create or replace function public.admin_studio_files(p_studio uuid) returns table (bucket text, name text)
language sql stable security definer set search_path = public, storage as $$
  select o.bucket_id::text, o.name from storage.objects o
  where o.bucket_id in ('photos', 'logos') and o.name like p_studio::text || '/%';
$$;

-- usunięcie studia: kaskadowo auta, zlecenia, wyceny, protokoły, ustawienia, powiadomienia, pomysły, notatki,
-- historia abonamentu i członkostwo; następnie konta właścicieli. Studia administratora nie można usunąć.
create or replace function public.admin_delete_studio_data(p_studio uuid) returns json
language plpgsql security definer set search_path = public, auth as $$
declare v_users uuid[]; v_name text; v_slug text;
begin
  select name, slug into v_name, v_slug from public.studios where id = p_studio;
  if v_name is null then raise exception 'Nie znaleziono studia'; end if;
  if exists (
    select 1 from public.studio_members m join auth.users u on u.id = m.user_id
    join public.app_admins a on a.email = lower(u.email) where m.studio_id = p_studio
  ) then raise exception 'Nie można usunąć studia administratora'; end if;
  select array_agg(user_id) into v_users from public.studio_members where studio_id = p_studio;
  delete from public.studios where id = p_studio;
  if v_users is not null then delete from auth.users where id = any (v_users); end if;
  return json_build_object('name', v_name, 'slug', v_slug, 'users', coalesce(array_length(v_users, 1), 0));
end $$;

revoke all on function public.admin_studio_files(uuid), public.admin_delete_studio_data(uuid) from public, anon, authenticated;
grant execute on function public.admin_studio_files(uuid), public.admin_delete_studio_data(uuid) to service_role;

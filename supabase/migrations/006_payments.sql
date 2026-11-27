-- DetailDesk 006 – wpłaty studiów (ewidencja sprzedaży, limit przychodu działalności nierejestrowanej)
-- Tabela tylko dla administratora platformy. Zawiera dane STUDIA (nazwa, NIP) – nie dane klientów studiów.
create table if not exists public.payments (
  id bigserial primary key,
  studio_id uuid not null references public.studios (id) on delete restrict, -- ewidencja nie znika razem ze studiem
  amount_cents int not null check (amount_cents > 0 and amount_cents <= 10000000),
  paid_on date not null default (now() at time zone 'Europe/Warsaw')::date,
  invoice_number text,
  studio_name text not null,   -- stan na dzień wpłaty (do ewidencji)
  studio_nip text,
  months int not null default 1 check (months between 1 and 12),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists payments_paid_on_idx on public.payments (paid_on);
alter table public.payments enable row level security;
drop policy if exists payments_admin_read on public.payments;
create policy payments_admin_read on public.payments for select to authenticated using (public.is_admin());
revoke all on public.payments from anon;
revoke insert, update, delete on public.payments from authenticated; -- zapis tylko przez admin_mark_paid
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
grant usage, select on all sequences in schema public to service_role;

-- NIP studia z jego ustawień (dane studia, nie klientów)
create or replace function public.studio_nip(p_studio uuid) returns text
language sql stable security definer set search_path = public as $$
  select nullif(trim(value -> 'studio' ->> 'nip'), '') from public.meta where studio_id = p_studio and key = 'settings';
$$;
revoke all on function public.studio_nip(uuid) from public, anon, authenticated;

-- „Oznacz jako opłacone”: zapis wpłaty + przedłużenie abonamentu (domyślnie o 1 miesiąc)
create or replace function public.admin_mark_paid(p_studio uuid, p_amount_cents int, p_invoice text default null, p_paid_on date default null, p_months int default 1)
returns json language plpgsql security definer set search_path = public as $$
declare v_pay public.payments; v_until timestamptz; v_name text;
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Podaj kwotę'; end if;
  select name into v_name from public.studios where id = p_studio;
  if v_name is null then raise exception 'Nie znaleziono studia'; end if;
  insert into public.payments (studio_id, amount_cents, paid_on, invoice_number, studio_name, studio_nip, months, created_by)
  values (p_studio, p_amount_cents, coalesce(p_paid_on, (now() at time zone 'Europe/Warsaw')::date), nullif(trim(p_invoice), ''),
          v_name, public.studio_nip(p_studio), coalesce(p_months, 1), auth.jwt() ->> 'email')
  returning * into v_pay;
  v_until := public.extend_studio_subscription(p_studio, coalesce(p_months, 1), 'payment', 'payment:' || v_pay.id, p_amount_cents, auth.jwt() ->> 'email');
  return json_build_object('id', v_pay.id, 'active_until', v_until);
end $$;

-- ewidencja sprzedaży (z NIP studia) – do panelu i eksportu CSV
create or replace function public.admin_list_sales()
returns table (id bigint, paid_on date, studio_id uuid, studio_name text, studio_nip text, amount_cents int, invoice_number text, months int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak uprawnień'; end if;
  return query select p.id, p.paid_on, p.studio_id, p.studio_name, coalesce(p.studio_nip, public.studio_nip(p.studio_id)), p.amount_cents, p.invoice_number, p.months, p.created_at
    from public.payments p order by p.paid_on, p.id;
end $$;

revoke all on function public.admin_mark_paid(uuid, int, text, date, int), public.admin_list_sales() from public, anon;
grant execute on function public.admin_mark_paid(uuid, int, text, date, int), public.admin_list_sales() to authenticated;

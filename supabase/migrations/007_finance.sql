-- DetailDesk 007 – Finanse studia: płatność za wizytę (kwota końcowa, forma, status)
-- Pola zapisywane w zleceniu (jobs.data): finalPrice, paymentMethod (gotowka|karta|przelew|blik),
-- paymentStatus (oplacone|nieoplacone), paidAt, doneDate.
-- Widok działa z uprawnieniami wywołującego (security_invoker) → obowiązuje RLS tabeli jobs:
-- studio widzi wyłącznie swoje wizyty, administrator platformy nie widzi wizyt innych studiów.

create or replace view public.finance_visits with (security_invoker = true) as
select
  j.id,
  j.studio_id,
  coalesce(j.data ->> 'doneDate', j.data ->> 'date')::date as done_on,
  coalesce(nullif(j.data ->> 'finalPrice', '')::numeric, nullif(j.data ->> 'price', '')::numeric, 0) as amount,
  j.data ->> 'paymentMethod' as payment_method,
  j.data ->> 'paymentStatus' as payment_status,
  nullif(j.data ->> 'paidAt', '')::timestamptz as paid_at,
  j.data ->> 'status' as status
from public.jobs j
where j.data ->> 'status' in ('gotowe', 'odebrane');

revoke all on public.finance_visits from anon;
grant select on public.finance_visits to authenticated;

-- szybkie zestawienia po dacie wykonania w obrębie studia
create index if not exists jobs_studio_done_idx on public.jobs (studio_id, (data ->> 'doneDate'));

-- kontrola poprawności wartości płatności zapisywanych przez aplikację
alter table public.jobs drop constraint if exists jobs_payment_values_check;
alter table public.jobs add constraint jobs_payment_values_check check (
  (data ->> 'paymentMethod') is null or (data ->> 'paymentMethod') in ('gotowka', 'karta', 'przelew', 'blik')
) not valid;
alter table public.jobs validate constraint jobs_payment_values_check;
alter table public.jobs drop constraint if exists jobs_payment_status_check;
alter table public.jobs add constraint jobs_payment_status_check check (
  (data ->> 'paymentStatus') is null or (data ->> 'paymentStatus') in ('oplacone', 'nieoplacone')
) not valid;
alter table public.jobs validate constraint jobs_payment_status_check;

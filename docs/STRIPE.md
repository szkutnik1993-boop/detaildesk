# Podpięcie Stripe (na przyszłość)

Abonament studia przedłuża jedna funkcja w bazie: `extend_studio_subscription(studio, miesiące, źródło, external_id, kwota_gr, kto)`.
Dziś wywołuje ją panel administratora („Przedłuż o 1 / 12 miesięcy”), a docelowo zrobi to webhook Stripe.

Co już jest gotowe:
- `studios.stripe_customer_id`, `studios.stripe_subscription_id` – powiązanie studia z klientem Stripe,
- `subscription_events` – historia (okres próbny, przedłużenia, kwoty); `external_id` jest unikalne,
  więc ponowne dostarczenie tego samego webhooka **nie przedłuży drugi raz**,
- `supabase/functions/_shared/billing.js` → `extendSubscription(db, {...})`.

Kroki wdrożenia:
1. W Stripe: produkt „DetailDesk” z cenami miesięczną i roczną (w metadanych ceny: `months=1` / `months=12`).
2. Nowa funkcja Edge `stripe-webhook` (bez weryfikacji JWT):
   - weryfikacja podpisu nagłówka `Stripe-Signature` sekretem `STRIPE_WEBHOOK_SECRET` (Supabase Secrets),
   - zdarzenie `invoice.paid` → studio po `invoice.customer` (`studios.stripe_customer_id`) →
     `extendSubscription(db, { studioId, months, source: 'stripe', externalId: invoice.id, amountCents: invoice.amount_paid })`.
3. Przycisk „Zapłać” w Ustawieniach → funkcja tworząca sesję Stripe Checkout (`client_reference_id` = ID studia,
   po `checkout.session.completed` zapisz `stripe_customer_id` w `studios`).
4. Klucz `STRIPE_SECRET_KEY` tylko w Supabase Secrets – nigdy w kodzie strony.

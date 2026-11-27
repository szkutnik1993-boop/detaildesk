// Rozliczenia abonamentu – jedno miejsce przedłużania ważności studia.
//
// Teraz: panel administratora → RPC admin_extend_studio → extend_studio_subscription (SQL).
// Później (Stripe): funkcja Edge „stripe-webhook” po zdarzeniu `invoice.paid`:
//   1. zweryfikuj podpis (STRIPE_WEBHOOK_SECRET),
//   2. znajdź studio po invoice.customer (kolumna studios.stripe_customer_id),
//   3. wywołaj extendSubscription(db, { studioId, months, source: 'stripe', externalId: invoice.id, amountCents: invoice.amount_paid }).
// externalId jest unikalny – ponowne dostarczenie tego samego webhooka nie przedłuży drugi raz.

export async function extendSubscription(db, { studioId, months, source, externalId = null, amountCents = null, actor = null }) {
  const { data, error } = await db.rpc('extend_studio_subscription', {
    p_studio: studioId,
    p_months: months,
    p_source: source,
    p_external_id: externalId,
    p_amount_cents: amountCents,
    p_actor: actor,
  });
  if (error) throw new Error(error.message);
  return data; // nowa data active_until
}

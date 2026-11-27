import { addDays, addMonths } from './dates.js';
import { fillTemplate, formatMoney, servicesLabel } from './pricing.js';

export function carLabel(car) {
  if (!car) return 'auto';
  return [car.make, car.model].filter(Boolean).join(' ') || car.plate || 'auto';
}

/**
 * Wylicza przypomnienia do wysłania na dany dzień.
 * - serwis powłoki: X miesięcy po wykonaniu zlecenia z usługą „powłoka”
 * - wycena bez odpowiedzi: X dni po wysłaniu wyceny o statusie „wysłana”
 * Przypomnienia już wysłane/pominięte (log) nie są zwracane.
 */
export function computeReminders({ jobs = [], quotes = [], cars = [], settings, log = {}, today }) {
  const out = [];
  const carById = Object.fromEntries(cars.map((c) => [c.id, c]));
  const vars = { studio: settings.studio.name, podpis: settings.studio.signature };
  const coatingMonths = Number(settings.reminders.coatingMonths) || 6;
  const days = Number(settings.reminders.quoteFollowupDays) || 5;
  const svcById = Object.fromEntries((settings.services || []).map((s) => [s.id, s]));

  // zaproszenia po usługach z terminem odświeżenia (wosk, sealant, powłoka…) – termin z aktualnego cennika
  for (const job of jobs) {
    if (job.status !== 'gotowe' && job.status !== 'odebrane') continue;
    const doneDate = job.doneDate || job.date;
    if (!doneDate) continue;
    const car = carById[job.carId];
    const seen = new Set();
    for (const line of job.services || []) {
      const svc = svcById[line.serviceId];
      const isCoating = !!(svc ? svc.coating : line.coating);
      const months = Number(svc ? svc.reminderMonths : line.reminderMonths ?? (line.coating ? coatingMonths : null));
      if (!Number.isFinite(months) || months <= 0) continue;
      const id = isCoating ? `coating:${job.id}` : `refresh:${job.id}:${line.serviceId || line.name}`;
      if (seen.has(id) || log[id]) continue;
      seen.add(id);
      const due = addMonths(doneDate, months);
      if (due > today) continue;
      const name = svc?.name || line.name;
      out.push({
        id,
        type: isCoating ? 'coating' : 'refresh',
        due,
        title: isCoating ? 'Serwis powłoki' : `Odświeżenie: ${name}`,
        subtitle: `${carLabel(car)}${car?.ownerName ? ' · ' + car.ownerName : ''}`,
        phone: car?.ownerPhone || '',
        text: fillTemplate(isCoating ? settings.templates.coating : settings.templates.refresh, { ...vars, miesiace: months, auto: carLabel(car), usluga: name }),
        carId: car?.id,
      });
    }
  }

  for (const q of quotes) {
    if (q.status !== 'wysłana') continue;
    const id = `quote:${q.id}`;
    if (log[id]) continue;
    const sent = (q.sentAt || q.createdAt || '').slice(0, 10);
    if (!sent) continue;
    const due = addDays(sent, days);
    if (due > today) continue;
    const car = q.carId ? carById[q.carId] : null;
    out.push({
      id,
      type: 'quote',
      due,
      title: 'Wycena bez odpowiedzi',
      subtitle: `${q.clientName || car?.ownerName || 'Klient'} · ${formatMoney(q.total)} zł`,
      phone: q.phone || car?.ownerPhone || '',
      text: fillTemplate(settings.templates.followup, {
        ...vars,
        uslugi: servicesLabel(q.items || []),
        cena: formatMoney(q.total),
        auto: q.carLabel || carLabel(car),
      }),
      quoteId: q.id,
    });
  }

  return out.sort((a, b) => (a.due < b.due ? -1 : 1));
}

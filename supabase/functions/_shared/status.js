// Przepływ statusów zlecenia:
// zapytanie → umowione (potwierdzony termin) → w_trakcie (przyjęte z protokołem) → gotowe → odebrane
// zapytanie/umowione → anulowane

export const STATUSES = {
  zapytanie: { label: 'Nowe zapytanie', client: 'Zapytanie wysłane – czekamy na potwierdzenie terminu' },
  umowione: { label: 'Umówione', client: 'Termin potwierdzony' },
  w_trakcie: { label: 'W trakcie', client: 'Auto w trakcie prac' },
  gotowe: { label: 'Gotowe', client: 'Auto gotowe – zapraszamy po odbiór' },
  odebrane: { label: 'Odebrane', client: 'Auto odebrane – dziękujemy!' },
  anulowane: { label: 'Anulowane', client: 'Zlecenie anulowane' },
};

export const FLOW = ['zapytanie', 'umowione', 'w_trakcie', 'gotowe', 'odebrane'];

export const TRANSITIONS = {
  zapytanie: ['umowione', 'anulowane'],
  umowione: ['w_trakcie', 'anulowane'],
  w_trakcie: ['gotowe'],
  gotowe: ['odebrane', 'w_trakcie'],
  odebrane: [],
  anulowane: ['zapytanie'],
};

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Zmienia status zlecenia (bez efektów ubocznych).
 * Zwraca { job, notify } – notify: jaki e-mail wysłać klientowi ('confirmed' | 'ready' | null).
 */
export function applyTransition(job, to, opts = {}) {
  const from = job.status || 'zapytanie';
  if (!canTransition(from, to)) {
    throw new Error(`Nie można zmienić statusu z „${STATUSES[from]?.label || from}” na „${STATUSES[to]?.label || to}”.`);
  }
  const at = opts.now || new Date().toISOString();
  const next = { ...job, status: to, timeline: [...(job.timeline || []), { type: 'status', status: to, at }] };
  let notify = null;

  if (to === 'umowione') {
    const date = opts.date ?? job.date;
    const time = opts.time ?? job.time ?? '';
    if (!DATE_RE.test(date || '')) throw new Error('Wybierz datę wizyty.');
    if (time && !TIME_RE.test(time)) throw new Error('Nieprawidłowa godzina.');
    Object.assign(next, { date, time, confirmedAt: at });
    notify = 'confirmed';
  }
  if (to === 'w_trakcie') next.startedAt = next.startedAt || at;
  if (to === 'gotowe') {
    const price = Number(opts.finalPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error('Wpisz kwotę końcową.');
    Object.assign(next, { finalPrice: Math.round(price), doneDate: opts.doneDate || at.slice(0, 10), readyAt: at });
    notify = 'ready';
  }
  if (to === 'odebrane') Object.assign(next, { handedOverAt: at });
  if (to === 'anulowane') next.cancelledAt = at;
  return { job: next, notify };
}

// statusy, w których auto jest „w studiu”
export const isActive = (s) => s === 'w_trakcie' || s === 'gotowe';
// zlecenia wykonane (historia, przypomnienia o powłoce)
export const isDone = (s) => s === 'gotowe' || s === 'odebrane';

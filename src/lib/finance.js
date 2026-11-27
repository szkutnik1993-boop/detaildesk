// Finanse studia – zestawienie pomocnicze z zakończonych wizyt (nie zastępuje kasy fiskalnej ani ewidencji).
// Przychód wizyty = kwota końcowa, data = dzień wykonania (doneDate). Liczymy wizyty „gotowe” i „odebrane”.
import { PAYMENT_METHODS } from './status.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const monthStart = (s) => `${s.slice(0, 7)}-01`;
const monthEnd = (s) => {
  const d = parse(monthStart(s));
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
const shiftMonth = (s, n) => {
  const d = parse(s);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return iso(t);
};

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

export function visits(jobs, cars = []) {
  const carById = Object.fromEntries(cars.map((c) => [c.id, c]));
  return jobs
    .filter((j) => (j.status === 'gotowe' || j.status === 'odebrane') && (j.doneDate || j.date))
    .map((j) => {
      const car = carById[j.carId];
      const amount = Number(j.finalPrice ?? j.price) || 0;
      return {
        id: j.id,
        date: (j.doneDate || j.date).slice(0, 10),
        amount,
        method: j.paymentMethod || null,
        status: j.paymentStatus || null,
        services: j.services || [],
        car: car ? [car.make, car.model].filter(Boolean).join(' ') : '',
        plate: car?.plate || '',
        client: car?.ownerName || j.client?.name || '',
      };
    });
}

export const inRange = (list, from, to) => list.filter((v) => v.date >= from && v.date <= to);
export const total = (list) => list.reduce((a, v) => a + v.amount, 0);

// zmiana procentowa (null, gdy nie ma z czym porównać)
export const pctChange = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);

export function tiles(list, today) {
  const d = parse(today);
  const weekStart = addDays(today, -((d.getDay() + 6) % 7)); // poniedziałek
  const mStart = monthStart(today);
  const prevSameDay = shiftMonth(today, -1);
  const month = total(inRange(list, mStart, today));
  const prevMonthToDate = total(inRange(list, monthStart(prevSameDay), prevSameDay));
  return {
    today: total(inRange(list, today, today)),
    week: total(inRange(list, weekStart, today)),
    month,
    prevMonthToDate,
    monthChange: pctChange(month, prevMonthToDate),
  };
}

// „zaplanowane”: suma wycen umówionych wizyt od dziś do końca miesiąca
export function planned(jobs, today) {
  const end = monthEnd(today);
  const list = jobs.filter((j) => j.status === 'umowione' && j.date && j.date >= today && j.date <= end);
  return { amount: list.reduce((a, j) => a + (Number(j.price) || 0), 0), count: list.length };
}

export function last12Months(list, today) {
  const out = [];
  for (let i = 11; i >= 0; i--) {
    const m = shiftMonth(monthStart(today), -i);
    const from = monthStart(m);
    const to = monthEnd(m);
    const d = parse(from);
    out.push({ key: from.slice(0, 7), label: MONTHS[d.getMonth()], year: d.getFullYear(), amount: total(inRange(list, from, to)), count: inRange(list, from, to).length });
  }
  return out;
}

// top usług wg przychodu – kwotę końcową dzielimy proporcjonalnie do cen pozycji
export function topServices(list, n = 5) {
  const sums = {};
  for (const v of list) {
    const lines = v.services.filter((s) => s.name);
    if (!lines.length) continue;
    const base = lines.reduce((a, s) => a + (Number(s.price) || 0), 0);
    for (const s of lines) {
      const share = base > 0 ? (Number(s.price) || 0) / base : 1 / lines.length;
      sums[s.name] = (sums[s.name] || 0) + v.amount * share;
    }
  }
  return Object.entries(sums)
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

export function byMethod(list) {
  const keys = [...Object.keys(PAYMENT_METHODS), null];
  return keys
    .map((k) => {
      const l = list.filter((v) => (v.method || null) === k);
      return { method: k, label: k ? PAYMENT_METHODS[k] : 'Nie podano', amount: total(l), count: l.length };
    })
    .filter((x) => x.count > 0);
}

export const unpaid = (list) => list.filter((v) => v.status === 'nieoplacone').sort((a, b) => a.date.localeCompare(b.date));

export function summary(list) {
  const count = list.length;
  const sum = total(list);
  return { count, sum, avg: count ? Math.round(sum / count) : 0 };
}

export const rangePresets = (today) => {
  const prev = shiftMonth(today, -1);
  return {
    month: { label: 'Ten miesiąc', from: monthStart(today), to: monthEnd(today) },
    prev: { label: 'Poprzedni miesiąc', from: monthStart(prev), to: monthEnd(prev) },
    year: { label: 'Ten rok', from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` },
    m12: { label: '12 miesięcy', from: monthStart(shiftMonth(today, -11)), to: monthEnd(today) },
  };
};

const cell = (v) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2).replace('.', ',');

export function financeCsv(list) {
  const rows = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const lines = [['Data', 'Auto', 'Nr rej.', 'Klient', 'Usługi', 'Kwota (zł)', 'Forma płatności', 'Status'].join(';')];
  for (const v of rows) {
    lines.push(
      [v.date, v.car, v.plate, v.client, v.services.map((s) => s.name).join(', '), money(v.amount), v.method ? PAYMENT_METHODS[v.method] : '', v.status === 'oplacone' ? 'opłacone' : v.status === 'nieoplacone' ? 'nieopłacone' : '']
        .map(cell)
        .join(';')
    );
  }
  lines.push(['Razem', '', '', '', '', money(total(rows)), '', ''].join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// odmiana: 1 wizyta, 2–4 wizyty, 5+ wizyt (12–14 wizyt)
export function plural(n, one, few, many) {
  const a = Math.abs(n);
  if (a === 1) return one;
  const t = a % 10;
  const h = a % 100;
  return t >= 2 && t <= 4 && !(h >= 12 && h <= 14) ? few : many;
}
export const visitsLabel = (n) => `${n} ${plural(n, 'wizyta', 'wizyty', 'wizyt')}`;

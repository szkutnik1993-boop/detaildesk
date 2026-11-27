// Przychód platformy: kwartalny limit działalności nierejestrowanej, cena domyślna, ewidencja sprzedaży (CSV).
export const QUARTER_LIMIT_CENTS = 1081350; // 10 813,50 zł
export const FOUNDER_SLOTS = 10;
export const FOUNDER_PRICE_CENTS = 2900;
export const REGULAR_PRICE_CENTS = 4900;

const pad = (n) => String(n).padStart(2, '0');
const ROMAN = ['I', 'II', 'III', 'IV'];

// kwartał dla daty RRRR-MM-DD (czas polski liczymy po stronie wywołującego)
export function quarterRange(isoDate) {
  const [y, m] = isoDate.split('-').map(Number);
  const q = Math.floor((m - 1) / 3);
  const startM = q * 3 + 1;
  const endM = startM + 2;
  const lastDay = new Date(Date.UTC(y, endM, 0)).getUTCDate();
  return { start: `${y}-${pad(startM)}-01`, end: `${y}-${pad(endM)}-${pad(lastDay)}`, label: `${ROMAN[q]} kwartał ${y}`, quarter: q + 1, year: y };
}

export const sumInRange = (sales, start, end) =>
  sales.filter((s) => s.paid_on >= start && s.paid_on <= end).reduce((a, s) => a + Number(s.amount_cents || 0), 0);

export function limitLevel(cents, limit = QUARTER_LIMIT_CENTS) {
  const pct = (cents / limit) * 100;
  return { pct, level: pct >= 95 ? 'danger' : pct >= 80 ? 'warn' : 'ok', left: Math.max(0, limit - cents) };
}

// oferta założycielska: pierwsze 10 studiów (bez bezterminowych, np. studia administratora) → 29 zł, pozostałe → 49 zł
export function defaultPriceCents(studio, studios) {
  const founders = [...studios]
    .filter((s) => s.plan !== 'lifetime')
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(0, FOUNDER_SLOTS)
    .map((s) => s.id);
  return founders.includes(studio.id) ? FOUNDER_PRICE_CENTS : REGULAR_PRICE_CENTS;
}

export const zl = (cents) => (Number(cents || 0) / 100).toFixed(2).replace('.', ',');

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Ewidencja sprzedaży – CSV dla Excela (średnik, przecinek dziesiętny, UTF-8 z BOM)
export function salesCsv(sales, { from = '0000-01-01', to = '9999-12-31' } = {}) {
  const rows = sales.filter((s) => s.paid_on >= from && s.paid_on <= to).sort((a, b) => (a.paid_on === b.paid_on ? a.id - b.id : a.paid_on.localeCompare(b.paid_on)));
  let running = 0;
  const lines = [['Lp.', 'Data', 'Studio', 'NIP', 'Kwota (zł)', 'Suma narastająco (zł)', 'Nr faktury'].join(';')];
  rows.forEach((s, i) => {
    running += Number(s.amount_cents);
    lines.push([i + 1, s.paid_on, s.studio_name, s.studio_nip || '', zl(s.amount_cents), zl(running), s.invoice_number || ''].map(csvCell).join(';'));
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}

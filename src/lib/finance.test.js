import { describe, it, expect } from 'vitest';
import { visits, tiles, planned, last12Months, topServices, byMethod, unpaid, summary, inRange, financeCsv, pctChange, rangePresets } from './finance.js';
import { applyTransition, paymentPatch } from './status.js';

const TODAY = '2026-11-28'; // sobota
const job = (id, doneDate, finalPrice, extra = {}) => ({ id, status: 'odebrane', doneDate, finalPrice, carId: 'c1', services: [{ name: 'Mycie zewnętrzne', price: 150 }], ...extra });
const cars = [{ id: 'c1', make: 'Audi', model: 'A4', plate: 'WA 1', ownerName: 'Ewa' }];
const jobs = [
  job('a', '2026-11-28', 300, { paymentMethod: 'karta', paymentStatus: 'oplacone' }),
  job('b', '2026-11-24', 200, { paymentMethod: 'gotowka', paymentStatus: 'nieoplacone' }), // poniedziałek – ten tydzień
  job('c', '2026-11-10', 1000, { paymentMethod: 'blik', paymentStatus: 'oplacone', services: [{ name: 'Korekta One Step', price: 1200 }, { name: 'Powłoka ceramiczna', price: 800 }] }),
  job('d', '2026-10-15', 500, { paymentMethod: 'przelew', paymentStatus: 'oplacone' }),
  job('e', '2026-10-29', 400), // stare zlecenie bez płatności
  { id: 'f', status: 'w_trakcie', date: '2026-11-28', price: 999 }, // niezakończone – nie liczy się
  { id: 'g', status: 'umowione', date: '2026-11-30', price: 700 },
  { id: 'h', status: 'umowione', date: '2026-12-02', price: 900 }, // przyszły miesiąc
  { id: 'i', status: 'umowione', date: '2026-11-20', price: 100 }, // przeszła, nieprzyjęta
];
const V = visits(jobs, cars);

describe('zakończenie wizyty: kwota, forma płatności, status', () => {
  it('„Auto gotowe” zapisuje kwotę, formę i status', () => {
    const r = applyTransition({ status: 'w_trakcie', timeline: [] }, 'gotowe', { finalPrice: '650', paymentMethod: 'blik', paymentStatus: 'oplacone', now: '2026-11-28T10:00:00Z' });
    expect(r.job).toMatchObject({ finalPrice: 650, paymentMethod: 'blik', paymentStatus: 'oplacone', paidAt: '2026-11-28T10:00:00Z' });
  });
  it('nieopłacone bez daty zapłaty; nieznana forma odrzucona', () => {
    expect(paymentPatch({ paymentMethod: 'karta', paymentStatus: 'nieoplacone' })).toEqual({ paymentMethod: 'karta', paymentStatus: 'nieoplacone', paidAt: null });
    expect(() => paymentPatch({ paymentMethod: 'bitcoin' })).toThrow();
    expect(() => paymentPatch({ paymentStatus: 'może' })).toThrow();
  });
});

describe('dashboard Finanse', () => {
  it('liczy tylko wizyty zakończone (gotowe/odebrane)', () => {
    expect(V.map((v) => v.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('kafelki: dziś / tydzień / miesiąc + zmiana vs ten sam okres poprzedniego miesiąca', () => {
    const t = tiles(V, TODAY);
    // 1–28 listopada: 1500 zł; 1–28 października: tylko 15.10 (500 zł) – wizyta z 29.10 poza okresem
    expect(t).toMatchObject({ today: 300, week: 500, month: 1500, prevMonthToDate: 500, monthChange: 200 });
  });
  it('zmiana %', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(100, 0)).toBeNull();
  });
  it('zaplanowane: umówione od dziś do końca miesiąca', () => {
    expect(planned(jobs, TODAY)).toEqual({ amount: 700, count: 1 });
  });
  it('12 miesięcy: od gru 2025 do lis 2026', () => {
    const m = last12Months(V, TODAY);
    expect(m).toHaveLength(12);
    expect(m[0]).toMatchObject({ key: '2025-12', label: 'gru' });
    expect(m[11]).toMatchObject({ key: '2026-11', amount: 1500, count: 3 });
    expect(m[10]).toMatchObject({ key: '2026-10', amount: 900 });
  });
  it('top usług – kwota końcowa dzielona proporcjonalnie do cen pozycji', () => {
    const top = topServices(V);
    expect(top[0]).toEqual({ name: 'Mycie zewnętrzne', amount: 1400 }); // 300+200+500+400
    expect(top).toContainEqual({ name: 'Korekta One Step', amount: 600 }); // 1000 × 1200/2000
    expect(top).toContainEqual({ name: 'Powłoka ceramiczna', amount: 400 });
  });
  it('podział wg formy płatności (+ „nie podano” dla starych zleceń)', () => {
    expect(byMethod(V)).toEqual([
      { method: 'gotowka', label: 'Gotówka', amount: 200, count: 1 },
      { method: 'karta', label: 'Karta', amount: 300, count: 1 },
      { method: 'przelew', label: 'Przelew', amount: 500, count: 1 },
      { method: 'blik', label: 'BLIK', amount: 1000, count: 1 },
      { method: null, label: 'Nie podano', amount: 400, count: 1 },
    ]);
  });
  it('nieopłacone wizyty', () => {
    expect(unpaid(V).map((v) => v.id)).toEqual(['b']);
  });
  it('średnia wartość i liczba wizyt w zakresie', () => {
    expect(summary(inRange(V, '2026-11-01', '2026-11-30'))).toEqual({ count: 3, sum: 1500, avg: 500 });
    expect(summary([])).toEqual({ count: 0, sum: 0, avg: 0 });
  });
  it('zakresy dat', () => {
    const p = rangePresets(TODAY);
    expect(p.month).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
    expect(p.prev).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('CSV: kolumny, polskie formaty, suma', () => {
    const csv = financeCsv(inRange(V, '2026-11-01', '2026-11-30'));
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Data;Auto;Nr rej.;Klient;Usługi;Kwota (zł);Forma płatności;Status');
    expect(lines[1]).toBe('2026-11-10;Audi A4;WA 1;Ewa;Korekta One Step, Powłoka ceramiczna;1000,00;BLIK;opłacone');
    expect(lines.at(-1)).toBe('Razem;;;;;1500,00;;');
  });
});

import { visitsLabel, plural } from './finance.js';
describe('odmiana liczby wizyt', () => {
  it('1 wizyta, 2–4 wizyty, 5+ wizyt, 12–14 wizyt, 22 wizyty', () => {
    expect([0, 1, 2, 4, 5, 12, 14, 21, 22, 25, 112].map(visitsLabel)).toEqual(['0 wizyt', '1 wizyta', '2 wizyty', '4 wizyty', '5 wizyt', '12 wizyt', '14 wizyt', '21 wizyt', '22 wizyty', '25 wizyt', '112 wizyt']);
    expect(plural(3, 'umówiona', 'umówione', 'umówionych')).toBe('umówione');
  });
});

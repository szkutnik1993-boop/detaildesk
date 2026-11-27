import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from './defaults.js';
import { calcQuote, roundTo, quoteSmsText, formatMoney } from './pricing.js';
import { computeReminders } from './reminders.js';

const S = mergeSettings(null);
const q = (serviceIds, sizeId = 'small', paintId = 'good') => calcQuote({ serviceIds, sizeId, paintId }, S);

describe('zaokrąglanie', () => {
  it('zaokrągla do 10 zł', () => {
    expect(roundTo(344)).toBe(340);
    expect(roundTo(345)).toBe(350);
    expect(roundTo(1518)).toBe(1520);
  });
  it('odporne na błędy zmiennoprzecinkowe (300 × 1,15)', () => {
    expect(roundTo(300 * 1.15)).toBe(350);
  });
});

describe('cennik domyślny', () => {
  it('ma 5 usług z właściwymi cenami', () => {
    const prices = Object.fromEntries(DEFAULT_SETTINGS.services.map((s) => [s.id, s.price]));
    expect(prices).toEqual({ wnetrze: 300, tapicerka: 600, 'one-step': 1200, 'two-step': 1800, ceramika: 800 });
  });
});

describe('calcQuote', () => {
  it('małe auto ×1', () => {
    expect(q(['wnetrze']).total).toBe(300);
    expect(q(['tapicerka']).total).toBe(600);
  });
  it('sedan/kombi ×1,15 z zaokrągleniem', () => {
    expect(q(['wnetrze'], 'sedan').total).toBe(350); // 345
    expect(q(['ceramika'], 'sedan').total).toBe(920);
  });
  it('SUV ×1,3', () => {
    expect(q(['tapicerka'], 'suv').total).toBe(780);
    expect(q(['ceramika'], 'suv').total).toBe(1040);
  });
  it('stan lakieru działa tylko na korekty', () => {
    expect(q(['one-step'], 'small', 'bad').total).toBe(1500); // 1200 × 1,25
    expect(q(['ceramika'], 'small', 'bad').total).toBe(800); // powłoka bez mnożnika lakieru
    expect(q(['wnetrze'], 'suv', 'bad').total).toBe(390);
  });
  it('korekta Two Step, sedan, średni lakier', () => {
    expect(q(['two-step'], 'sedan', 'medium').total).toBe(2280); // 2277
  });
  it('korekta One Step, SUV, zły lakier', () => {
    expect(q(['one-step'], 'suv', 'bad').total).toBe(1950);
  });
  it('kilka usług – suma zaokrąglonych pozycji', () => {
    const r = q(['one-step', 'ceramika'], 'sedan', 'medium');
    expect(r.items.map((i) => i.price)).toEqual([1520, 920]);
    expect(r.total).toBe(2440);
    expect(r.needsPaint).toBe(true);
  });
  it('wszystkie usługi, SUV, zły lakier', () => {
    const r = q(['wnetrze', 'tapicerka', 'one-step', 'two-step', 'ceramika'], 'suv', 'bad');
    // 390 + 780 + 1950 + 2925→2930 + 1040
    expect(r.total).toBe(390 + 780 + 1950 + 2930 + 1040);
  });
  it('brak usług = 0 zł', () => {
    expect(q([]).total).toBe(0);
    expect(q([]).needsPaint).toBe(false);
  });
  it('nieznana wielkość/stan = mnożnik 1', () => {
    expect(q(['one-step'], 'xyz', 'xyz').total).toBe(1200);
  });
  it('uwzględnia zmiany cennika i mnożników z ustawień', () => {
    const custom = mergeSettings({
      services: [{ id: 'a', name: 'Test', price: 1000, correction: true }],
      sizes: [{ id: 'x', name: 'X', mult: 1.5 }],
      paints: [{ id: 'p', name: 'P', mult: 1.2 }],
      rounding: 50,
    });
    expect(calcQuote({ serviceIds: ['a'], sizeId: 'x', paintId: 'p' }, custom).total).toBe(1800);
    const c2 = { ...custom, rounding: 100 };
    expect(calcQuote({ serviceIds: ['a'], sizeId: 'x', paintId: 'p' }, { ...c2, services: [{ id: 'a', name: 'T', price: 333, correction: false }] }).total).toBe(500); // 499,5
  });
});

describe('SMS z wyceną', () => {
  it('ma dokładnie wymagany format', () => {
    const r = q(['one-step', 'ceramika'], 'sedan', 'medium');
    expect(quoteSmsText(r, S)).toBe(
      'Dzień dobry! Wstępna wycena ARC Detailing: korekta One Step + powłoka ceramiczna – ok. 2440 zł. Cenę potwierdzę po oględzinach auta. Pozdrawiam, Tomek'
    );
  });
  it('formatuje kwoty', () => {
    expect(formatMoney(2440)).toBe('2440');
    expect(formatMoney(12500)).toBe('12 500');
  });
});

describe('przypomnienia', () => {
  const cars = [{ id: 'c1', make: 'BMW', model: 'X5', ownerName: 'Jan', ownerPhone: '500100200' }];
  it('serwis powłoki po 6 miesiącach', () => {
    const jobs = [{ id: 'j1', carId: 'c1', status: 'gotowe', doneDate: '2026-05-27', services: [{ name: 'Powłoka', coating: true }] }];
    expect(computeReminders({ jobs, cars, settings: S, today: '2026-11-26' })).toHaveLength(0);
    const r = computeReminders({ jobs, cars, settings: S, today: '2026-11-27' });
    expect(r).toHaveLength(1);
    expect(r[0].phone).toBe('500100200');
    expect(r[0].text).toContain('BMW X5');
    expect(computeReminders({ jobs, cars, settings: S, today: '2026-12-01', log: { 'coating:j1': { action: 'sent' } } })).toHaveLength(0);
  });
  it('wycena bez odpowiedzi po 5 dniach', () => {
    const quotes = [{ id: 'q1', status: 'wysłana', sentAt: '2026-11-20T10:00:00', total: 920, items: [{ name: 'Powłoka ceramiczna' }], phone: '600' }];
    expect(computeReminders({ quotes, settings: S, today: '2026-11-24' })).toHaveLength(0);
    expect(computeReminders({ quotes, settings: S, today: '2026-11-25' })).toHaveLength(1);
    expect(computeReminders({ quotes: [{ ...quotes[0], status: 'przyjęta' }], settings: S, today: '2026-12-25' })).toHaveLength(0);
  });
  it('czasy przypomnień z ustawień', () => {
    const s = mergeSettings({ reminders: { quoteFollowupDays: 2 } });
    const quotes = [{ id: 'q1', status: 'wysłana', sentAt: '2026-11-20', total: 1, items: [] }];
    expect(computeReminders({ quotes, settings: s, today: '2026-11-22' })).toHaveLength(1);
  });
});

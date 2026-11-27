import { describe, it, expect } from 'vitest';
import { quarterRange, sumInRange, limitLevel, defaultPriceCents, salesCsv, QUARTER_LIMIT_CENTS, zl } from './revenue.js';

describe('kwartał i limit przychodu (10 813,50 zł)', () => {
  it('granice kwartałów', () => {
    expect(quarterRange('2026-11-28')).toMatchObject({ start: '2026-10-01', end: '2026-12-31', label: 'IV kwartał 2026' });
    expect(quarterRange('2027-02-15')).toMatchObject({ start: '2027-01-01', end: '2027-03-31', label: 'I kwartał 2027' });
    expect(quarterRange('2028-05-01')).toMatchObject({ start: '2028-04-01', end: '2028-06-30' });
    expect(quarterRange('2026-09-30').end).toBe('2026-09-30');
  });
  it('sumuje tylko wpłaty z kwartału', () => {
    const s = [{ paid_on: '2026-09-30', amount_cents: 4900 }, { paid_on: '2026-10-01', amount_cents: 2900 }, { paid_on: '2026-12-31', amount_cents: 4900 }, { paid_on: '2027-01-01', amount_cents: 4900 }];
    expect(sumInRange(s, '2026-10-01', '2026-12-31')).toBe(7800);
  });
  it('pasek: zwykły < 80%, żółty od 80%, czerwony od 95%', () => {
    expect(QUARTER_LIMIT_CENTS).toBe(1081350);
    expect(limitLevel(864999).level).toBe('ok'); // 79,99%
    expect(limitLevel(865080).level).toBe('warn'); // 80%
    expect(limitLevel(1027282).level).toBe('warn'); // 94,99%
    expect(limitLevel(1027283).level).toBe('danger'); // 95%
    expect(limitLevel(1200000)).toMatchObject({ level: 'danger', left: 0 });
  });
});

describe('cena domyślna przy „Oznacz jako opłacone”', () => {
  const studios = [{ id: 'arc', plan: 'lifetime', created_at: '2026-01-01' }, ...Array.from({ length: 12 }, (_, i) => ({ id: `s${i + 1}`, plan: 'trial', created_at: `2026-11-${String(i + 1).padStart(2, '0')}` }))];
  it('pierwsze 10 studiów (bez bezterminowego) → 29 zł, kolejne → 49 zł', () => {
    expect(defaultPriceCents({ id: 's1' }, studios)).toBe(2900);
    expect(defaultPriceCents({ id: 's10' }, studios)).toBe(2900);
    expect(defaultPriceCents({ id: 's11' }, studios)).toBe(4900);
  });
});

describe('ewidencja sprzedaży – CSV', () => {
  const sales = [
    { id: 2, paid_on: '2026-11-20', studio_name: 'Auto; Spa "Lux"', studio_nip: '1234567890', amount_cents: 2900, invoice_number: 'FV 2/2026' },
    { id: 1, paid_on: '2026-11-05', studio_name: 'Klaura', studio_nip: '', amount_cents: 4900, invoice_number: 'FV 1/2026' },
    { id: 3, paid_on: '2027-01-02', studio_name: 'Później', amount_cents: 4900 },
  ];
  it('kolumny, kolejność wg daty, suma narastająco, format dla Excela', () => {
    const csv = salesCsv(sales, { from: '2026-10-01', to: '2026-12-31' });
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Lp.;Data;Studio;NIP;Kwota (zł);Suma narastająco (zł);Nr faktury');
    expect(lines[1]).toBe('1;2026-11-05;Klaura;;49,00;49,00;FV 1/2026');
    expect(lines[2]).toBe('2;2026-11-20;"Auto; Spa ""Lux""";1234567890;29,00;78,00;FV 2/2026');
    expect(lines).toHaveLength(3); // wpłata z 2027 poza zakresem
  });
  it('format kwot', () => {
    expect(zl(1081350)).toBe('10813,50');
  });
});

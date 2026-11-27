import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, normalizeService, moveItem, publicConfig } from './defaults.js';
import { calcQuote } from './pricing.js';
import { computeReminders } from './reminders.js';
import { validateRequest } from './booking.js';
import { servicesFromCatalog } from './catalog.js';

const S = mergeSettings(null);
const q = (ids, sizeId = 'small', paintId = 'good', settings = S) => calcQuote({ serviceIds: ids, sizeId, paintId }, settings);

describe('nowe mycia: cena wg wielkości auta, stan lakieru bez znaczenia', () => {
  it('ceny bazowe 150 / 250 / 350 zł', () => {
    expect(q(['mycie']).total).toBe(150);
    expect(q(['mycie-wosk']).total).toBe(250);
    expect(q(['mycie-sealant']).total).toBe(350);
  });
  it('sedan ×1,15 i SUV ×1,3 (zaokrąglenie do 10 zł)', () => {
    expect(q(['mycie'], 'sedan').total).toBe(170); // 172,5
    expect(q(['mycie-wosk'], 'sedan').total).toBe(290); // 287,5
    expect(q(['mycie-sealant'], 'sedan').total).toBe(400); // 402,5
    expect(q(['mycie'], 'suv').total).toBe(200); // 195
    expect(q(['mycie-wosk'], 'suv').total).toBe(330); // 325
    expect(q(['mycie-sealant'], 'suv').total).toBe(460); // 455
  });
  it('zły lakier nie zmienia ceny mycia', () => {
    for (const id of ['mycie', 'mycie-wosk', 'mycie-sealant']) expect(q([id], 'suv', 'bad').total).toBe(q([id], 'suv', 'good').total);
    expect(q(['mycie-sealant', 'one-step'], 'small', 'bad').needsPaint).toBe(true); // korekta nadal liczy lakier
  });
});

describe('przypomnienia po usługach', () => {
  const cars = [{ id: 'c1', make: 'Audi', model: 'A4', ownerName: 'Ewa', ownerPhone: '600' }];
  const job = (id, serviceId, doneDate, extra = {}) => ({ id, carId: 'c1', status: 'odebrane', doneDate, services: [{ serviceId, name: 'x', ...extra }] });
  const due = (jobs, today, settings = S, log = {}) => computeReminders({ jobs, cars, settings, today, log });

  it('wosk – zaproszenie na odświeżenie po 2 miesiącach', () => {
    const jobs = [job('j1', 'mycie-wosk', '2026-09-27')];
    expect(due(jobs, '2026-11-26')).toHaveLength(0);
    const r = due(jobs, '2026-11-27');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: 'refresh', title: 'Odświeżenie: Mycie + wosk', phone: '600' });
    expect(r[0].text).toContain('Minęło 2 mies. od usługi „Mycie + wosk” na Audi A4');
  });
  it('sealant – po 5 miesiącach', () => {
    const jobs = [job('j2', 'mycie-sealant', '2026-06-27')];
    expect(due(jobs, '2026-11-26')).toHaveLength(0);
    expect(due(jobs, '2026-11-27')[0].text).toContain('Minęło 5 mies. od usługi „Mycie + sealant”');
  });
  it('powłoka – „Serwis powłoki” po 6 miesiącach (bez zmian dla starych przypomnień)', () => {
    const r = due([job('j3', 'ceramika', '2026-05-27')], '2026-11-27');
    expect(r[0]).toMatchObject({ id: 'coating:j3', type: 'coating', title: 'Serwis powłoki' });
  });
  it('zwykłe mycie – bez przypomnienia', () => {
    expect(due([job('j4', 'mycie', '2025-01-01')], '2026-11-27')).toHaveLength(0);
  });
  it('termin zmieniony w Ustawieniach obowiązuje od razu (także dla wykonanych zleceń)', () => {
    const custom = mergeSettings({ services: S.services.map((s) => (s.id === 'mycie-wosk' ? { ...s, reminderMonths: 3 } : s)) });
    const jobs = [job('j5', 'mycie-wosk', '2026-09-27')];
    expect(due(jobs, '2026-11-27', custom)).toHaveLength(0);
    expect(due(jobs, '2026-12-27', custom)[0].text).toContain('Minęło 3 mies.');
    const off = mergeSettings({ services: S.services.map((s) => (s.id === 'mycie-wosk' ? { ...s, reminderMonths: null } : s)) });
    expect(due(jobs, '2027-12-27', off)).toHaveLength(0);
  });
  it('wysłane/pominięte przypomnienie nie wraca; niewykonane zlecenie nie przypomina', () => {
    const jobs = [job('j6', 'mycie-wosk', '2026-09-27')];
    expect(due(jobs, '2026-11-27', S, { 'refresh:j6:mycie-wosk': { action: 'sent' } })).toHaveLength(0);
    expect(due([{ ...jobs[0], status: 'w_trakcie' }], '2026-11-27')).toHaveLength(0);
  });
  it('kilka usług w jednym zleceniu → osobne przypomnienia', () => {
    const j = { id: 'j7', carId: 'c1', status: 'gotowe', doneDate: '2026-01-01', services: [{ serviceId: 'mycie-wosk' }, { serviceId: 'ceramika' }] };
    expect(due([j], '2026-11-27').map((r) => r.type).sort()).toEqual(['coating', 'refresh']);
  });
});

describe('cennik studia: dodawanie, edycja, ukrywanie, kolejność', () => {
  it('stare zapisy: powłoka z flagą „coating” dostaje termin z dotychczasowego ustawienia', () => {
    const old = mergeSettings({ reminders: { coatingMonths: 8 }, services: [{ id: 'c', name: 'Powłoka', price: 900, coating: true }, { id: 'w', name: 'Wnętrze', price: 300 }] });
    expect(old.services[0].reminderMonths).toBe(8);
    expect(old.services[1].reminderMonths).toBeNull();
    expect(old.services[1].hidden).toBe(false);
  });
  it('normalizacja wpisów z formularza (tekst → liczba, puste → brak)', () => {
    expect(normalizeService({ id: 'a', name: 'A', price: 1, reminderMonths: '4' }).reminderMonths).toBe(4);
    expect(normalizeService({ id: 'a', name: 'A', price: 1, reminderMonths: null }).reminderMonths).toBeNull();
    expect(normalizeService({ id: 'a', name: 'A', price: 1, reminderMonths: '0' }).reminderMonths).toBeNull();
  });
  it('zmiana kolejności', () => {
    const l = ['a', 'b', 'c'];
    expect(moveItem(l, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(l, 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(l, 0, -1)).toBe(l);
    expect(moveItem(l, 2, 1)).toBe(l);
  });
  it('kolejność z cennika = kolejność w formularzu klienta', () => {
    const s = mergeSettings({ services: moveItem(S.services, 2, -2) });
    expect(publicConfig(s).services.map((x) => x.id).slice(0, 3)).toEqual(['mycie-sealant', 'mycie-wosk', 'mycie']);
  });
  it('ukryta usługa: niewidoczna dla klienta i odrzucana przy rezerwacji', () => {
    const s = mergeSettings({ services: S.services.map((x) => (x.id === 'tapicerka' ? { ...x, hidden: true } : x)) });
    expect(publicConfig(s).services.map((x) => x.id)).not.toContain('tapicerka');
    const base = { make: 'A', model: 'B', sizeId: 'small', slots: [{ date: '2026-12-01' }], name: 'Jan', phone: '600100200', email: 'a@b.pl', consent: true };
    expect(validateRequest({ ...base, serviceIds: ['tapicerka'] }, s, '2026-11-27').errors.serviceIds).toBeTruthy();
    expect(validateRequest({ ...base, serviceIds: ['tapicerka', 'mycie'] }, s, '2026-11-27').clean.serviceIds).toEqual(['mycie']);
  });
  it('formularz klienta dostaje opis usługi', () => {
    expect(publicConfig(S).services[0]).toEqual({ id: 'mycie', name: 'Mycie zewnętrzne', description: 'ręczne, 2 wiadra, felgi, osuszanie', price: 150, correction: false });
  });
  it('nowe studio: mycia z katalogu z terminami przypomnień', () => {
    const out = servicesFromCatalog([{ id: 'mycie-wosk', price: '' }, { id: 'mycie-sealant', price: '380' }]);
    expect(out.map((x) => [x.id, x.price, x.reminderMonths, x.correction])).toEqual([
      ['mycie-wosk', 250, 2, false],
      ['mycie-sealant', 380, 5, false],
    ]);
  });
});

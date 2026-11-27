import { describe, it, expect } from 'vitest';
import { mergeSettings } from './defaults.js';
import { applyTransition, canTransition, FLOW } from './status.js';
import { validateRequest, normPhone } from './booking.js';
import { buildIcs, warsawToUTC, addDaysISO, warsawToday } from './ics.js';

const S = mergeSettings(null);
const NOW = '2026-11-27T10:00:00.000Z';

describe('przepływ statusów zlecenia', () => {
  const base = { id: 'j1', status: 'zapytanie', price: 2440, timeline: [{ type: 'status', status: 'zapytanie', at: NOW }] };

  it('pełna ścieżka: zapytanie → umówione → w trakcie → gotowe → odebrane', () => {
    let r = applyTransition(base, 'umowione', { date: '2026-12-03', time: '09:00', now: NOW });
    expect(r.job.status).toBe('umowione');
    expect(r.job.date).toBe('2026-12-03');
    expect(r.notify).toBe('confirmed');

    r = applyTransition(r.job, 'w_trakcie', { now: NOW });
    expect(r.job.startedAt).toBe(NOW);
    expect(r.notify).toBeNull();

    r = applyTransition(r.job, 'gotowe', { finalPrice: '2500', now: NOW });
    expect(r.job.finalPrice).toBe(2500);
    expect(r.job.doneDate).toBe('2026-11-27');
    expect(r.notify).toBe('ready');

    r = applyTransition(r.job, 'odebrane', { now: NOW });
    expect(r.job.status).toBe('odebrane');
    expect(r.job.timeline.map((t) => t.status)).toEqual(FLOW);
  });

  it('nie pozwala przeskoczyć etapów', () => {
    expect(() => applyTransition(base, 'gotowe', { finalPrice: 100 })).toThrow();
    expect(() => applyTransition(base, 'w_trakcie')).toThrow();
    expect(canTransition('odebrane', 'zapytanie')).toBe(false);
    expect(canTransition('umowione', 'anulowane')).toBe(true);
  });

  it('potwierdzenie wymaga daty, gotowe wymaga kwoty', () => {
    expect(() => applyTransition({ ...base, date: '' }, 'umowione', { date: '' })).toThrow('Wybierz datę');
    expect(() => applyTransition(base, 'umowione', { date: '2026-12-03', time: '25:00' })).toThrow('godzina');
    const inProgress = { ...base, status: 'w_trakcie' };
    expect(() => applyTransition(inProgress, 'gotowe', { finalPrice: '' })).toThrow('kwotę');
    expect(() => applyTransition(inProgress, 'gotowe', { finalPrice: 0 })).toThrow();
  });

  it('nie modyfikuje oryginalnego obiektu', () => {
    applyTransition(base, 'umowione', { date: '2026-12-03' });
    expect(base.status).toBe('zapytanie');
    expect(base.timeline).toHaveLength(1);
  });
});

describe('walidacja zapytania klienta', () => {
  const ok = {
    make: 'BMW', model: 'X5', sizeId: 'suv', serviceIds: ['one-step', 'ceramika'], paintId: 'medium',
    slots: [{ date: '2026-12-01', time: '09:00' }, { date: '2026-12-02', time: '' }],
    name: 'Jan', phone: '600 100 200', email: 'Jan@Example.com', consent: true,
  };
  it('poprawne zapytanie + cena liczona na serwerze', () => {
    const v = validateRequest(ok, S, '2026-11-27');
    expect(v.ok).toBe(true);
    expect(v.clean.phone).toBe('600100200');
    expect(v.clean.email).toBe('jan@example.com');
    // One Step: 1200 × 1,3 × 1,1 = 1716 → 1720; powłoka: 800 × 1,3 = 1040
    expect(v.calc.total).toBe(2760);
  });
  it('wymaga zgody RODO, terminu w przyszłości, usług i danych kontaktowych', () => {
    const v = validateRequest({ ...ok, consent: false, slots: [{ date: '2026-11-01' }], serviceIds: ['hack'], email: 'x', phone: '12' }, S, '2026-11-27');
    expect(v.ok).toBe(false);
    expect(Object.keys(v.errors).sort()).toEqual(['consent', 'email', 'phone', 'serviceIds', 'slots']);
  });
  it('przycina do max 3 terminów i odrzuca nieznaną wielkość', () => {
    const v = validateRequest({ ...ok, sizeId: 'tir', slots: [1, 2, 3, 4].map((d) => ({ date: `2026-12-0${d}` })) }, S, '2026-11-27');
    expect(v.clean.slots).toHaveLength(3);
    expect(v.errors.sizeId).toBeTruthy();
  });
  it('normalizuje numer telefonu', () => {
    expect(normPhone('+48 600-100-200')).toBe('+48600100200');
  });
});

describe('kalendarz .ics i strefa czasowa', () => {
  it('przelicza czas polski na UTC (zima/lato)', () => {
    expect(warsawToUTC('2026-12-03', '09:00').toISOString()).toBe('2026-12-03T08:00:00.000Z');
    expect(warsawToUTC('2026-07-01', '09:00').toISOString()).toBe('2026-07-01T07:00:00.000Z');
  });
  it('buduje poprawny plik', () => {
    const ics = buildIcs({ uid: 'j1@dd', date: '2026-12-03', time: '09:00', title: 'ARC Detailing – BMW X5', description: 'Korekta, powłoka', url: 'https://x/y', now: new Date(NOW) });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20261203T080000Z');
    expect(ics).toContain('DTEND:20261203T090000Z');
    expect(ics).toContain('SUMMARY:ARC Detailing – BMW X5');
    expect(ics).toContain('DESCRIPTION:Korekta\\, powłoka');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('wydarzenie całodniowe bez godziny', () => {
    const ics = buildIcs({ uid: 'a', date: '2026-12-31', title: 't' });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
  });
  it('„jutro” liczone w polskiej strefie', () => {
    expect(warsawToday(new Date('2026-11-27T23:30:00Z'))).toBe('2026-11-28');
    expect(addDaysISO('2026-11-30', 1)).toBe('2026-12-01');
  });
});

import { normWeb, webHref } from './booking.js';
describe('strona www studia', () => {
  it('ujednolica zapis', () => {
    expect(normWeb('https://www.MojeStudio.pl/')).toBe('www.mojestudio.pl');
    expect(normWeb('mojestudio.pl')).toBe('mojestudio.pl');
    expect(normWeb('http://auto-spa.com.pl/oferta/')).toBe('auto-spa.com.pl/oferta');
    expect(normWeb('  ')).toBe('');
  });
  it('odrzuca niepoprawne adresy', () => {
    for (const bad of ['moje studio', 'localhost', 'javascript:alert(1)', 'http://', 'abc', 'a b.pl']) expect(normWeb(bad)).toBeNull();
  });
  it('link zawsze przez https', () => {
    expect(webHref('arcdetailing.pl')).toBe('https://arcdetailing.pl');
    expect(webHref('http://x.pl')).toBe('https://x.pl');
    expect(webHref('zły adres')).toBeNull();
  });
});

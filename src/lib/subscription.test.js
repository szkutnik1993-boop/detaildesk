import { describe, it, expect } from 'vitest';
import { studioStatus, dueReminder, extendedUntil, trialEnd, slugify, safeSlug, RESERVED_SLUGS, SLUG_RE, TRIAL_DAYS } from './subscription.js';
import { CATALOG_ITEMS, servicesFromCatalog } from './catalog.js';
import { DEFAULT_SETTINGS } from './defaults.js';

const NOW = new Date('2026-11-27T10:00:00Z');
const days = (n) => new Date(NOW.getTime() + n * 86400000).toISOString();

describe('okres próbny i status studia', () => {
  it('nowe studio dostaje 30 dni', () => {
    expect(TRIAL_DAYS).toBe(30);
    const st = studioStatus({ plan: 'trial', active_until: trialEnd(NOW).toISOString() }, NOW);
    expect(st).toMatchObject({ active: true, state: 'trial', daysLeft: 30 });
  });
  it('po terminie: wygasło (tryb tylko do odczytu)', () => {
    expect(studioStatus({ plan: 'trial', active_until: days(-1) }, NOW)).toMatchObject({ active: false, state: 'expired', daysLeft: 0 });
    expect(studioStatus({ plan: 'paid', active_until: new Date(NOW.getTime() - 1000).toISOString() }, NOW).active).toBe(false);
  });
  it('opłacone i bezterminowe', () => {
    expect(studioStatus({ plan: 'paid', active_until: days(40) }, NOW).state).toBe('paid');
    expect(studioStatus({ plan: 'lifetime', active_until: '2099-12-31T00:00:00Z' }, NOW).state).toBe('lifetime');
  });
});

describe('przypomnienia 7 dni i 1 dzień przed końcem', () => {
  it('wysyła 7 i 1 dzień przed, w inne dni nie', () => {
    expect(dueReminder({ plan: 'trial', active_until: days(7) }, NOW)?.days).toBe(7);
    expect(dueReminder({ plan: 'trial', active_until: days(1) }, NOW)?.days).toBe(1);
    for (const d of [0.5, 2, 3, 6, 8, 30]) expect(dueReminder({ plan: 'trial', active_until: days(d) }, NOW)).toBeNull();
  });
  it('nie wysyła drugi raz tego samego przypomnienia', () => {
    const s = { plan: 'trial', active_until: days(7) };
    const due = dueReminder(s, NOW);
    expect(dueReminder({ ...s, trial_reminders: { [due.key]: 'x' } }, NOW)).toBeNull();
  });
  it('po przedłużeniu przypomnienia liczą się od nowa (nowa data w kluczu)', () => {
    const a = dueReminder({ plan: 'paid', active_until: days(7) }, NOW);
    const b = dueReminder({ plan: 'paid', active_until: days(7), trial_reminders: { 'd7:2020-01-01': 'x' } }, NOW);
    expect(b?.days).toBe(7);
    expect(a.key).not.toBe('d7:2020-01-01');
  });
  it('bez przypomnień dla wygasłych i bezterminowych', () => {
    expect(dueReminder({ plan: 'trial', active_until: days(-1) }, NOW)).toBeNull();
    expect(dueReminder({ plan: 'lifetime', active_until: days(7) }, NOW)).toBeNull();
  });
});

describe('przedłużanie (1 / 12 miesięcy)', () => {
  it('aktywne: liczone od daty końca', () => {
    expect(extendedUntil('2026-12-15T10:00:00Z', 1, NOW).toISOString()).toBe('2027-01-15T10:00:00.000Z');
    expect(extendedUntil('2026-12-15T10:00:00Z', 12, NOW).toISOString()).toBe('2027-12-15T10:00:00.000Z');
  });
  it('wygasłe: liczone od dziś (nie od starej daty)', () => {
    expect(extendedUntil('2026-01-01T00:00:00Z', 1, NOW).toISOString()).toBe('2026-12-27T10:00:00.000Z');
  });
});

describe('link studia (slug)', () => {
  it('z polskiej nazwy robi poprawny adres', () => {
    expect(slugify('ARC Detailing')).toBe('arc-detailing');
    expect(slugify('Łódź Auto Spa – Żoliborz!')).toBe('lodz-auto-spa-zoliborz');
    expect(slugify('  ')).toBe('studio');
    expect(SLUG_RE.test(slugify('x'.repeat(80)))).toBe(true);
  });
  it('studio nie zajmie ścieżek strony (detaildesk.pl/zlecenie, /app…)', () => {
    expect(safeSlug('Zlecenie')).toBe('zlecenie-studio');
    expect(safeSlug('APP')).toBe('app-studio');
    expect(safeSlug('Rejestracja')).toBe('rejestracja-studio');
    expect(safeSlug('Auto Spa Kraków')).toBe('auto-spa-krakow');
    for (const r of RESERVED_SLUGS) expect(RESERVED_SLUGS).not.toContain(safeSlug(r));
  });
  it('odrzuca niebezpieczne wartości', () => {
    for (const bad of ['', '-a', 'a-', 'A', 'a b', "a'b", '../x']) expect(SLUG_RE.test(bad)).toBe(false);
  });
});

describe('katalog usług (pierwsza konfiguracja)', () => {
  it('ma unikalne ID i zgodne ID z domyślnym cennikiem ARC', () => {
    const ids = CATALOG_ITEMS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of DEFAULT_SETTINGS.services) expect(ids).toContain(s.id);
  });
  it('wybór z listy tworzy cennik z własnymi cenami', () => {
    const out = servicesFromCatalog([{ id: 'one-step', price: '1400' }, { id: 'ceramika', price: '' }, { id: 'nieistnieje', price: 1 }]);
    expect(out).toEqual([
      { id: 'one-step', name: 'Korekta One Step', price: 1400, correction: true, coating: false },
      { id: 'ceramika', name: 'Powłoka ceramiczna', price: 800, correction: false, coating: true },
    ]);
  });
});

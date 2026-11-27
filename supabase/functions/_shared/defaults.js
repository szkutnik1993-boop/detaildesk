// Domyślne ustawienia aplikacji – wszystko można zmienić w Ustawieniach.
export const DEFAULT_SETTINGS = {
  studio: {
    name: 'ARC Detailing',
    signature: 'Tomek',
    phone: '',
    email: '',
    web: 'arcdetailing.pl',
    address: '',
    company: '', // pełna nazwa firmy (administrator danych – RODO)
    nip: '',
    logo: null, // dataURL logo do PDF (opcjonalnie)
  },
  stages: ['Mycie', 'Dekontaminacja', 'Korekta', 'Powłoka', 'Wnętrze', 'Odbiór'],
  // Usługa: id, name, description (opcjonalnie), price (małe auto), correction (liczyć stan lakieru),
  // reminderMonths (zaproszenie po X mies., null = brak), coating (szablon „serwis powłoki”), hidden (ukryta).
  // Kolejność w tablicy = kolejność w formularzu klienta i w wycenach.
  services: [
    { id: 'mycie', name: 'Mycie zewnętrzne', description: 'ręczne, 2 wiadra, felgi, osuszanie', price: 150, correction: false, reminderMonths: null },
    { id: 'mycie-wosk', name: 'Mycie + wosk', description: 'mycie zewnętrzne i zabezpieczenie lakieru woskiem', price: 250, correction: false, reminderMonths: 2 },
    { id: 'mycie-sealant', name: 'Mycie + sealant', description: 'mycie zewnętrzne i trwalsze zabezpieczenie sealantem', price: 350, correction: false, reminderMonths: 5 },
    { id: 'wnetrze', name: 'Detailing wnętrza', price: 300, correction: false, reminderMonths: null },
    { id: 'tapicerka', name: 'Pranie tapicerki', price: 600, correction: false, reminderMonths: null },
    { id: 'one-step', name: 'Korekta One Step', price: 1200, correction: true, reminderMonths: null },
    { id: 'two-step', name: 'Korekta Two Step', price: 1800, correction: true, reminderMonths: null },
    { id: 'ceramika', name: 'Powłoka ceramiczna', price: 800, correction: false, coating: true, reminderMonths: 6 },
  ],
  sizes: [
    { id: 'small', name: 'Małe', mult: 1 },
    { id: 'sedan', name: 'Sedan / kombi', mult: 1.15 },
    { id: 'suv', name: 'SUV / duże', mult: 1.3 },
  ],
  paints: [
    { id: 'good', name: 'Dobry', mult: 1 },
    { id: 'medium', name: 'Średni', mult: 1.1 },
    { id: 'bad', name: 'Zły', mult: 1.25 },
  ],
  rounding: 10,
  reminders: {
    coatingMonths: 6,
    quoteFollowupDays: 5,
  },
  paintThreshold: 250,
  templates: {
    quote:
      'Dzień dobry! Wstępna wycena {studio}: {uslugi} – ok. {cena} zł. Cenę potwierdzę po oględzinach auta. Pozdrawiam, {podpis}',
    followup:
      'Dzień dobry! Kilka dni temu przesłałem wstępną wycenę {studio}: {uslugi} – ok. {cena} zł. Czy mogę zaproponować termin? Pozdrawiam, {podpis}',
    coating:
      'Dzień dobry! Minęło {miesiace} mies. od nałożenia powłoki ceramicznej na {auto}. Zapraszam na serwis powłoki – odświeży ochronę i połysk. Pozdrawiam, {podpis}',
    refresh:
      'Dzień dobry! Minęło {miesiace} mies. od usługi „{usluga}” na {auto}. Zapraszam na odświeżenie – lakier znów będzie zabezpieczony i błyszczący. Pozdrawiam, {podpis}',
    ready: 'Dzień dobry! {auto} jest gotowe do odbioru. Pozdrawiam, {podpis} – {studio}',
    confirm: 'Dzień dobry! Potwierdzam termin w {studio}: {termin}. Szczegóły i postęp prac: {link} Pozdrawiam, {podpis}',
  },
};

// Scala zapisane ustawienia z domyślnymi (nowe pola w kolejnych wersjach nie przepadną).
export function mergeSettings(saved) {
  const d = structuredCloneSafe(DEFAULT_SETTINGS);
  if (!saved || typeof saved !== 'object') return d;
  return {
    ...d,
    ...saved,
    studio: { ...d.studio, ...(saved.studio || {}) },
    reminders: { ...d.reminders, ...(saved.reminders || {}) },
    templates: { ...d.templates, ...(saved.templates || {}) },
    services: (Array.isArray(saved.services) ? saved.services : d.services).map((s) => normalizeService(s, saved.reminders?.coatingMonths)),
    sizes: Array.isArray(saved.sizes) && saved.sizes.length ? saved.sizes : d.sizes,
    paints: Array.isArray(saved.paints) && saved.paints.length ? saved.paints : d.paints,
    stages: Array.isArray(saved.stages) && saved.stages.length ? saved.stages : d.stages,
  };
}

// Starsze zapisy usług: powłoka z flagą „coating” bez własnego terminu → dotychczasowy globalny termin (domyślnie 6 mies.)
export function normalizeService(s, coatingMonths) {
  const out = { ...s, correction: !!s.correction, hidden: !!s.hidden };
  if (out.reminderMonths === undefined) out.reminderMonths = s.coating ? Number(coatingMonths) || 6 : null;
  const m = Number(out.reminderMonths);
  out.reminderMonths = Number.isFinite(m) && m > 0 ? Math.round(m) : null;
  return out;
}

// przesunięcie usługi w cenniku (kolejność w formularzu klienta)
export function moveItem(list, index, dir) {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

// Część ustawień widoczna publicznie (formularz klienta, polityka prywatności) – bez logo i szablonów.
export function publicConfig(s) {
  const { name, signature, phone, email, web, address, company, nip } = s.studio;
  return {
    studio: { name, signature, phone, email, web, address, company, nip },
    services: s.services.filter((x) => !x.hidden).map(({ id, name, description, price, correction }) => ({ id, name, description: description || '', price, correction })),
    sizes: s.sizes,
    paints: s.paints,
    rounding: s.rounding,
  };
}

export function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}

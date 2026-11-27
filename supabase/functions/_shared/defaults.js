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
  services: [
    { id: 'wnetrze', name: 'Detailing wnętrza', price: 300, correction: false, coating: false },
    { id: 'tapicerka', name: 'Pranie tapicerki', price: 600, correction: false, coating: false },
    { id: 'one-step', name: 'Korekta One Step', price: 1200, correction: true, coating: false },
    { id: 'two-step', name: 'Korekta Two Step', price: 1800, correction: true, coating: false },
    { id: 'ceramika', name: 'Powłoka ceramiczna', price: 800, correction: false, coating: true },
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
    services: Array.isArray(saved.services) ? saved.services : d.services,
    sizes: Array.isArray(saved.sizes) && saved.sizes.length ? saved.sizes : d.sizes,
    paints: Array.isArray(saved.paints) && saved.paints.length ? saved.paints : d.paints,
    stages: Array.isArray(saved.stages) && saved.stages.length ? saved.stages : d.stages,
  };
}

// Część ustawień widoczna publicznie (formularz klienta, polityka prywatności) – bez logo i szablonów.
export function publicConfig(s) {
  const { name, signature, phone, email, web, address, company, nip } = s.studio;
  return {
    studio: { name, signature, phone, email, web, address, company, nip },
    services: s.services.map(({ id, name, price, correction }) => ({ id, name, price, correction })),
    sizes: s.sizes,
    paints: s.paints,
    rounding: s.rounding,
  };
}

export function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}

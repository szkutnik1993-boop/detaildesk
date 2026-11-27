// Walidacja zapytania z formularza klienta (ta sama w przeglądarce i na serwerze)
import { calcQuote } from './pricing.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const cleanText = (s, max = 100) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
export const normPhone = (p) => {
  const s = String(p || '').replace(/[^\d+]/g, '');
  return s.startsWith('+') ? '+' + s.slice(1).replace(/\+/g, '') : s.replace(/\+/g, '');
};

export function validateRequest(body, settings, today) {
  const errors = {};
  const b = body || {};
  const make = cleanText(b.make, 60);
  const model = cleanText(b.model, 60);
  const name = cleanText(b.name, 80);
  const phone = normPhone(b.phone);
  const email = cleanText(b.email, 120).toLowerCase();
  const note = cleanText(b.note, 600);
  const sizeId = String(b.sizeId || '');
  const paintId = String(b.paintId || settings.paints[0]?.id);
  const serviceIds = Array.isArray(b.serviceIds) ? b.serviceIds.map(String).filter((id) => settings.services.some((s) => s.id === id && !s.hidden)) : [];
  const slots = (Array.isArray(b.slots) ? b.slots : [])
    .map((s) => ({ date: String(s?.date || ''), time: String(s?.time || '') }))
    .filter((s) => s.date)
    .slice(0, 3);

  if (!make) errors.make = 'Podaj markę auta.';
  if (!model) errors.model = 'Podaj model auta.';
  if (!settings.sizes.some((s) => s.id === sizeId)) errors.sizeId = 'Wybierz wielkość auta.';
  if (!serviceIds.length) errors.serviceIds = 'Wybierz przynajmniej jedną usługę.';
  if (!settings.paints.some((p) => p.id === paintId)) errors.paintId = 'Wybierz stan lakieru.';
  if (slots.length < 1) errors.slots = 'Zaproponuj przynajmniej jeden termin (najlepiej 2–3).';
  for (const s of slots) {
    if (!DATE_RE.test(s.date) || s.date < today) errors.slots = 'Terminy muszą być w przyszłości.';
    if (s.time && !TIME_RE.test(s.time)) errors.slots = 'Nieprawidłowa godzina.';
  }
  if (name.length < 2) errors.name = 'Podaj imię.';
  if (phone.replace(/\D/g, '').length < 9) errors.phone = 'Podaj numer telefonu.';
  if (!EMAIL_RE.test(email)) errors.email = 'Podaj poprawny e-mail.';
  if (b.consent !== true) errors.consent = 'Zgoda jest wymagana, aby wysłać zapytanie.';

  const calc = calcQuote({ serviceIds, sizeId, paintId }, settings);
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    clean: { make, model, name, phone, email, note, sizeId, paintId, serviceIds, slots },
    calc,
  };
}

// Adres strony www studia: bez „https://”, bez końcowego „/”, mała domena. null = niepoprawny, '' = brak.
export function normWeb(v) {
  let s = String(v ?? '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const [host, ...rest] = s.split('/');
  const h = host.toLowerCase();
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(h) || h.length > 100 || /\s/.test(s)) return null;
  return [h, ...rest].join('/').slice(0, 200);
}

// pełny adres do linku (zawsze https)
export const webHref = (v) => {
  const w = normWeb(v);
  return w ? `https://${w}` : null;
};

// Abonament studia: okres próbny, status, przypomnienia (czysta logika – testowana jednostkowo)
import { warsawToday } from './ics.js';

export const TRIAL_DAYS = 30;
export const REMINDER_DAYS = [7, 1];

const DAY = 86400000;
const warsawDate = (d) => warsawToday(new Date(d));
const daysBetweenISO = (a, b) => Math.round((Date.UTC(...b.split('-').map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...a.split('-').map((x, i) => (i === 1 ? x - 1 : +x)))) / DAY);

export function studioStatus(studio, now = new Date()) {
  const until = new Date(studio.active_until);
  const active = until.getTime() > now.getTime();
  const daysLeft = active ? Math.max(0, daysBetweenISO(warsawDate(now), warsawDate(until))) : 0;
  const state = !active ? 'expired' : studio.plan === 'lifetime' ? 'lifetime' : studio.plan === 'trial' ? 'trial' : 'paid';
  const label = { expired: 'Wygasło', lifetime: 'Bezterminowo', trial: 'Okres próbny', paid: 'Aktywny' }[state];
  return { active, daysLeft, state, label };
}

/** Czy dziś wysłać przypomnienie (7 lub 1 dzień przed końcem)? Zwraca liczbę dni lub null. */
export function dueReminder(studio, now = new Date()) {
  if (studio.plan === 'lifetime') return null;
  const st = studioStatus(studio, now);
  if (!st.active) return null;
  const d = st.daysLeft;
  if (!REMINDER_DAYS.includes(d)) return null;
  const key = `d${d}:${warsawDate(studio.active_until)}`;
  if (studio.trial_reminders && studio.trial_reminders[key]) return null;
  return { days: d, key };
}

/** Nowa data ważności po przedłużeniu (to samo co funkcja SQL extend_studio_subscription). */
export function extendedUntil(activeUntil, months, now = new Date()) {
  const base = new Date(Math.max(new Date(activeUntil).getTime(), now.getTime()));
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function trialEnd(now = new Date()) {
  return new Date(now.getTime() + TRIAL_DAYS * DAY);
}

export function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return s.length >= 2 ? s : 'studio';
}

export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/;

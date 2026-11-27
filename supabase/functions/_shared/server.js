// Wspólne narzędzia funkcji Edge (Deno). Klucze tajne tylko ze zmiennych środowiskowych (Supabase Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import webpush from 'npm:web-push@3.6.7';
import { mergeSettings } from './defaults.js';
import { SLUG_RE } from './subscription.js';

export const env = (k, d = '') => Deno.env.get(k) ?? d;

export const admin = () =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' } });

export const appBase = () => env('PUBLIC_BASE_URL', 'https://app.detaildesk.pl/').replace(/\/?$/, '/'); // aplikacja studiów
export const siteBase = () => env('PUBLIC_SITE_URL', 'https://detaildesk.pl/').replace(/\/?$/, '/'); // strony klientów
export const fnBase = () => `${env('SUPABASE_URL')}/functions/v1`;
export const jobLink = (token) => `${siteBase()}zlecenie/?t=${token}`;
export const icsLink = (token) => `${fnBase()}/public?action=ics&t=${token}`;
export const bookingLink = (slug) => `${siteBase()}${slug}`;
export const DEFAULT_SLUG = () => env('DEFAULT_STUDIO_SLUG', 'arc-detailing');

export const doc = (row) =>
  row ? { ...row.data, id: row.id, token: row.token, studioId: row.studio_id, createdAt: row.data?.createdAt || row.created_at } : null;

export const carLabel = (car) => (car ? [car.make, car.model].filter(Boolean).join(' ') || car.plate || 'auto' : 'auto');

export const isActive = (studio) => !!studio && !studio.blocked && new Date(studio.active_until).getTime() > Date.now();

export async function getStudio(db, { id, slug }) {
  if (slug !== undefined && !SLUG_RE.test(slug || '')) return null;
  const q = db.from('studios').select('*');
  const { data } = await (id ? q.eq('id', id) : q.eq('slug', slug)).maybeSingle();
  return data || null;
}

export async function getSettings(db, studioId) {
  const { data } = await db.from('meta').select('value').eq('studio_id', studioId).eq('key', 'settings').maybeSingle();
  return mergeSettings(data?.value);
}

// dane studia do e-maili i stron klienta (ustawienia + logo z tabeli studios)
export function studioInfo(studio, settings) {
  return { ...settings.studio, name: studio.name || settings.studio.name, logoUrl: studio.logo_url || null };
}

const senderAddress = () => {
  const from = env('EMAIL_FROM', 'onboarding@resend.dev');
  const m = from.match(/<([^>]+)>/);
  return m ? m[1] : from.trim();
};

export async function sendEmail({ to, subject, html, attachments, fromName, replyTo }) {
  const key = env('RESEND_API_KEY');
  if (!key) return { skipped: 'brak RESEND_API_KEY' };
  const name = String(fromName || 'DetailDesk').replace(/[<>"\r\n]/g, '').slice(0, 60);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: `${name} <${senderAddress()}>`, to: [to], reply_to: replyTo || undefined, subject, html, attachments }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`E-mail nie wysłany (${r.status}): ${out.message || JSON.stringify(out)}`);
  return out;
}

// e-mail w imieniu studia (nazwa nadawcy studia, odpowiedzi trafiają do studia)
export const sendStudioEmail = (studio, mail) =>
  sendEmail({ ...mail, fromName: studio.email_from_name || studio.name, replyTo: studio.contact_email });

export async function sendPushAll(db, studioId, payload) {
  const pub = env('VAPID_PUBLIC_KEY');
  const priv = env('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return { skipped: 'brak kluczy VAPID' };
  webpush.setVapidDetails(env('VAPID_SUBJECT', 'mailto:kontakt@arcdetailing.pl'), pub, priv);
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, subscription').eq('studio_id', studioId);
  let sent = 0;
  const errors = [];
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify(payload), { TTL: 86400, urgency: 'high' });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else errors.push(String(e.statusCode || e.message));
    }
  }
  return { sent, total: (subs || []).length, errors };
}

export async function logEmail(db, row, entry) {
  const data = { ...row.data, emails: [...(row.data.emails || []), { ...entry, at: new Date().toISOString() }] };
  await db.from('jobs').update({ data, updated_at: new Date().toISOString() }).eq('id', row.id);
  return data;
}

// limit zapytań z jednego IP (formularze publiczne)
export async function rateLimited(db, req, max) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from('request_log').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
  return { limited: (count || 0) >= max, log: () => db.from('request_log').insert({ ip }) };
}

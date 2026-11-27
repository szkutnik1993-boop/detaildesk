// Wspólne narzędzia funkcji Edge (Deno). Klucze tajne tylko ze zmiennych środowiskowych (Supabase Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import webpush from 'npm:web-push@3.6.7';
import { mergeSettings } from './defaults.js';

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

export const appBase = () => env('PUBLIC_BASE_URL', 'https://arc-app.arcdetailing.pl/').replace(/\/?$/, '/');
export const fnBase = () => `${env('SUPABASE_URL')}/functions/v1`;
export const jobLink = (token) => `${appBase()}zlecenie/?t=${token}`;
export const icsLink = (token) => `${fnBase()}/public?action=ics&t=${token}`;

export const doc = (row) => (row ? { ...row.data, id: row.id, token: row.token, createdAt: row.data?.createdAt || row.created_at } : null);

export const carLabel = (car) => (car ? [car.make, car.model].filter(Boolean).join(' ') || car.plate || 'auto' : 'auto');

export async function getSettings(db) {
  const { data } = await db.from('meta').select('value').eq('key', 'settings').maybeSingle();
  return mergeSettings(data?.value);
}

export async function sendEmail({ to, subject, html, attachments }) {
  const key = env('RESEND_API_KEY');
  if (!key) return { skipped: 'brak RESEND_API_KEY' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env('EMAIL_FROM', 'ARC Detailing <onboarding@resend.dev>'),
      to: [to],
      reply_to: env('OWNER_EMAIL') || undefined,
      subject,
      html,
      attachments,
    }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`E-mail nie wysłany (${r.status}): ${out.message || JSON.stringify(out)}`);
  return out;
}

export async function sendPushAll(db, payload) {
  const pub = env('VAPID_PUBLIC_KEY');
  const priv = env('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return { skipped: 'brak kluczy VAPID' };
  webpush.setVapidDetails(env('VAPID_SUBJECT', 'mailto:kontakt@arcdetailing.pl'), pub, priv);
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, subscription');
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

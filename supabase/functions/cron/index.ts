// Zadanie cykliczne (pg_cron, codziennie ok. 17:00):
// 1) e-mail do klientów dzień przed wizytą (tylko aktywne studia),
// 2) przypomnienie dla studia 7 dni i 1 dzień przed końcem okresu próbnego / abonamentu.
import { admin, carLabel, doc, env, getSettings, getStudio, isActive, json, jobLink, icsLink, sendEmail, sendStudioEmail, logEmail, studioInfo } from '../_shared/server.js';
import { clientReminder, studioTrialReminder } from '../_shared/emails.js';
import { addDaysISO, warsawToday } from '../_shared/ics.js';
import { dueReminder } from '../_shared/subscription.js';

Deno.serve(async (req) => {
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ ok: false }, 401);
  const db = admin();
  const body = await req.json().catch(() => ({}));
  const tomorrow = body.date || addDaysISO(warsawToday(), 1);
  const now = body.now ? new Date(body.now) : new Date();

  // 1. przypomnienia o wizytach
  const { data: rows, error } = await db.from('jobs').select('*').eq('data->>status', 'umowione').eq('data->>date', tomorrow);
  if (error) return json({ ok: false, error: error.message }, 500);
  const cache = new Map();
  const studioCtx = async (id) => {
    if (!cache.has(id)) {
      const studio = await getStudio(db, { id });
      cache.set(id, studio ? { studio, settings: await getSettings(db, id) } : null);
    }
    return cache.get(id);
  };
  const sent = [];
  for (const row of rows || []) {
    const job = doc(row);
    if (job.reminderSentFor === tomorrow) continue;
    const ctx = await studioCtx(row.studio_id);
    if (!ctx || !isActive(ctx.studio)) continue;
    const { data: carRow } = await db.from('cars').select('data').eq('id', job.carId).maybeSingle();
    const to = job.client?.email || carRow?.data?.ownerEmail;
    if (!to) continue;
    try {
      const mail = clientReminder({ job, carLabel: carLabel(carRow?.data), studio: studioInfo(ctx.studio, ctx.settings), jobLink: jobLink(row.token), icsLink: icsLink(row.token) });
      const r = await sendStudioEmail(ctx.studio, { to, ...mail });
      const data = await logEmail(db, row, { type: 'reminder', to, id: r?.id || null });
      await db.from('jobs').update({ data: { ...data, reminderSentFor: tomorrow } }).eq('id', row.id);
      sent.push({ id: row.id, to });
    } catch (e) {
      console.error(e);
      sent.push({ id: row.id, error: e.message });
    }
  }

  // 2. koniec okresu próbnego / abonamentu
  const contact = env('PLATFORM_CONTACT', env('OWNER_EMAIL'));
  const { data: studios } = await db.from('studios').select('*').neq('plan', 'lifetime').gt('active_until', now.toISOString());
  const trial = [];
  for (const s of studios || []) {
    const due = dueReminder(s, now);
    if (!due) continue;
    try {
      const untilText = new Date(s.active_until).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
      await sendEmail({ to: s.contact_email, fromName: 'DetailDesk', replyTo: env('OWNER_EMAIL'), ...studioTrialReminder({ studio: s, days: due.days, untilText, contact }) });
      await db.from('studios').update({ trial_reminders: { ...(s.trial_reminders || {}), [due.key]: new Date().toISOString() } }).eq('id', s.id);
      trial.push({ studio: s.slug, days: due.days });
    } catch (e) {
      console.error(e);
      trial.push({ studio: s.slug, error: e.message });
    }
  }
  return json({ ok: true, date: tomorrow, sent, trial });
});

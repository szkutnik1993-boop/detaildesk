// Zadanie cykliczne (pg_cron, codziennie ok. 17:00): e-mail z przypomnieniem dzień przed wizytą.
import { admin, carLabel, doc, env, getSettings, json, jobLink, icsLink, sendEmail, logEmail } from '../_shared/server.js';
import { clientReminder } from '../_shared/emails.js';
import { addDaysISO, warsawToday } from '../_shared/ics.js';

Deno.serve(async (req) => {
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ ok: false }, 401);
  const db = admin();
  const body = await req.json().catch(() => ({}));
  const tomorrow = body.date || addDaysISO(warsawToday(), 1);
  const { data: rows, error } = await db.from('jobs').select('*').eq('data->>status', 'umowione').eq('data->>date', tomorrow);
  if (error) return json({ ok: false, error: error.message }, 500);
  const settings = await getSettings(db);
  const out = [];
  for (const row of rows || []) {
    const job = doc(row);
    if (job.reminderSentFor === tomorrow) continue;
    const { data: carRow } = await db.from('cars').select('data').eq('id', job.carId).maybeSingle();
    const to = job.client?.email || carRow?.data?.ownerEmail;
    if (!to) continue;
    try {
      const mail = clientReminder({ job, carLabel: carLabel(carRow?.data), studio: settings.studio, jobLink: jobLink(row.token), icsLink: icsLink(row.token) });
      const r = await sendEmail({ to, ...mail });
      const data = await logEmail(db, row, { type: 'reminder', to, id: r?.id || null });
      await db.from('jobs').update({ data: { ...data, reminderSentFor: tomorrow } }).eq('id', row.id);
      out.push({ id: row.id, to });
    } catch (e) {
      console.error(e);
      out.push({ id: row.id, error: e.message });
    }
  }
  return json({ ok: true, date: tomorrow, sent: out });
});

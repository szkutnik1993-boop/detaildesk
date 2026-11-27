// Funkcja tylko dla właściciela (sprawdzany token logowania + e-mail z app_owner):
// wysyłka e-maili do klienta (potwierdzenie terminu, auto gotowe) i test powiadomień push.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { admin, carLabel, cors, doc, env, getSettings, json, jobLink, icsLink, sendEmail, sendPushAll, logEmail, appBase } from '../_shared/server.js';
import { clientConfirmed, clientReady } from '../_shared/emails.js';
import { buildIcs } from '../_shared/ics.js';

const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

async function requireOwner(req, db) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.email) return null;
  const { data: owner } = await db.from('app_owner').select('email').ilike('email', data.user.email).maybeSingle();
  return owner ? data.user : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  try {
    const user = await requireOwner(req, db);
    if (!user) return json({ ok: false, error: 'Brak uprawnień' }, 401);
    const body = await req.json().catch(() => ({}));

    if (body.action === 'test-push') {
      const r = await sendPushAll(db, { title: 'DetailDesk', body: 'Powiadomienia działają ✓', url: appBase() });
      return json({ ok: true, ...r });
    }

    if (body.action === 'notify') {
      const { data: row } = await db.from('jobs').select('*').eq('id', body.jobId).maybeSingle();
      if (!row) return json({ ok: false, error: 'Nie znaleziono zlecenia' }, 404);
      const job = doc(row);
      const settings = await getSettings(db);
      const { data: carRow } = await db.from('cars').select('data').eq('id', job.carId).maybeSingle();
      const to = job.client?.email || carRow?.data?.ownerEmail;
      if (!to) return json({ ok: false, error: 'Klient nie ma adresu e-mail' }, 400);
      const label = carLabel(carRow?.data);
      const links = { jobLink: jobLink(row.token), icsLink: icsLink(row.token) };
      let mail;
      let attachments;
      if (body.type === 'confirmed') {
        if (job.status !== 'umowione' || !job.date) return json({ ok: false, error: 'Zlecenie nie ma potwierdzonego terminu' }, 400);
        mail = clientConfirmed({ job, carLabel: label, studio: settings.studio, ...links });
        const ics = buildIcs({
          uid: `${row.id}@detaildesk`,
          date: job.date,
          time: job.time,
          title: `${settings.studio.name} – ${label}`,
          description: `${(job.services || []).map((s) => s.name).join(', ')}\nSzczegóły: ${links.jobLink}`,
          location: settings.studio.address,
          url: links.jobLink,
        });
        attachments = [{ filename: 'wizyta-arc-detailing.ics', content: b64(ics), content_type: 'text/calendar' }];
      } else if (body.type === 'ready') {
        if (job.status !== 'gotowe' || !job.finalPrice) return json({ ok: false, error: 'Zlecenie nie jest oznaczone jako gotowe' }, 400);
        mail = clientReady({ job, carLabel: label, studio: settings.studio, ...links });
      } else {
        return json({ ok: false, error: 'Nieznany typ wiadomości' }, 400);
      }
      const r = await sendEmail({ to, ...mail, attachments });
      await logEmail(db, row, { type: body.type, to, id: r?.id || null, skipped: r?.skipped || null });
      return json({ ok: true, to, skipped: r?.skipped || null, jobLink: links.jobLink });
    }

    return json({ ok: false, error: 'Nieznana akcja' }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e.message || 'Błąd serwera' }, 500);
  }
});

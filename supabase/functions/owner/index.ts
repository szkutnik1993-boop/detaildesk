// Funkcja dla zalogowanego właściciela studia (token sesji → członkostwo w studio).
// E-maile do klienta (potwierdzenie, gotowe, protokół), test push, pomysły/uwagi do administratora.
import {
  admin, appBase, carLabel, cors, doc, env, getSettings, getStudio, isActive, json, jobLink, icsLink,
  sendEmail, sendStudioEmail, sendPushAll, logEmail, studioInfo,
} from '../_shared/server.js';
import { clientConfirmed, clientProtocol, clientReady, adminFeedback, adminReply } from '../_shared/emails.js';
import { buildIcs } from '../_shared/ics.js';

const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const READ_ONLY = 'Okres próbny się skończył – aplikacja działa w trybie tylko do odczytu.';

async function requireMember(req, db) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: m } = await db.from('studio_members').select('studio_id').eq('user_id', data.user.id).maybeSingle();
  if (!m) return null;
  const studio = await getStudio(db, { id: m.studio_id });
  return studio ? { user: data.user, studio } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  try {
    const me = await requireMember(req, db);
    if (!me) return json({ ok: false, error: 'Brak uprawnień' }, 401);
    const { studio } = me;
    const body = await req.json().catch(() => ({}));

    // pomysły i uwagi do administratora – działa także po wygaśnięciu okresu próbnego
    if (body.action === 'feedback') {
      const kind = ['pomysł', 'uwaga', 'błąd'].includes(body.kind) ? body.kind : 'pomysł';
      const message = String(body.message || '').trim().slice(0, 4000);
      if (message.length < 3) return json({ ok: false, error: 'Napisz kilka słów.' }, 400);
      const { count } = await db.from('feedback').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id).gte('created_at', new Date(Date.now() - 3600_000).toISOString());
      if ((count || 0) >= 10) return json({ ok: false, error: 'Za dużo wiadomości w ciągu godziny.' }, 429);
      const { error } = await db.from('feedback').insert({ studio_id: studio.id, author_email: me.user.email, kind, message });
      if (error) throw error;
      if (env('OWNER_EMAIL')) {
        await sendEmail({ to: env('OWNER_EMAIL'), fromName: 'DetailDesk', replyTo: me.user.email, ...adminFeedback({ studio, author: me.user.email, kind, message, adminLink: `${appBase()}#/admin` }) }).catch((e) => console.error(e));
      }
      return json({ ok: true });
    }

    // administrator platformy: odpowiedź e-mailem na pomysł/uwagę studia
    if (body.action === 'admin-reply') {
      const { data: isAdm } = await db.from('app_admins').select('email').eq('email', (me.user.email || '').toLowerCase()).maybeSingle();
      if (!isAdm) return json({ ok: false, error: 'Brak uprawnień' }, 403);
      const reply = String(body.reply || '').trim().slice(0, 4000);
      if (reply.length < 2) return json({ ok: false, error: 'Wpisz odpowiedź.' }, 400);
      const { data: fb } = await db.from('feedback').select('*').eq('id', body.feedbackId).maybeSingle();
      if (!fb || !fb.author_email) return json({ ok: false, error: 'Nie znaleziono zgłoszenia' }, 404);
      const target = await getStudio(db, { id: fb.studio_id });
      await sendEmail({ to: fb.author_email, fromName: 'DetailDesk', replyTo: me.user.email, ...adminReply({ studio: target, original: fb.message, reply }) });
      await db.from('feedback').update({ reply, replied_at: new Date().toISOString(), status: fb.status === 'nowe' ? 'w realizacji' : fb.status }).eq('id', fb.id);
      return json({ ok: true, to: fb.author_email });
    }

    if (body.action === 'test-push') {
      const r = await sendPushAll(db, studio.id, { title: 'DetailDesk', body: 'Powiadomienia działają ✓', url: appBase() });
      return json({ ok: true, ...r });
    }

    // dalej: akcje wysyłające e-maile do klientów – tylko dla aktywnego studia
    if (!isActive(studio)) return json({ ok: false, error: READ_ONLY, readOnly: true }, 403);
    const settings = await getSettings(db, studio.id);
    const info = studioInfo(studio, settings);

    if (body.action === 'send-protocol') {
      const pdf = String(body.pdfBase64 || '');
      if (!pdf || pdf.length > 30_000_000) return json({ ok: false, error: 'Nieprawidłowy plik PDF' }, 400);
      const { data: prow } = await db.from('protocols').select('*').eq('id', body.protocolId).eq('studio_id', studio.id).maybeSingle();
      if (!prow) return json({ ok: false, error: 'Nie znaleziono protokołu' }, 404);
      const { data: row } = await db.from('jobs').select('*').eq('id', prow.data.jobId).eq('studio_id', studio.id).maybeSingle();
      const job = row ? doc(row) : { services: [] };
      const { data: carRow } = await db.from('cars').select('data').eq('id', prow.data.carId).eq('studio_id', studio.id).maybeSingle();
      const to = job.client?.email || carRow?.data?.ownerEmail;
      if (!to) return json({ ok: false, error: 'Klient nie ma adresu e-mail – uzupełnij go w danych auta' }, 400);
      const mail = clientProtocol({ job, carLabel: carLabel(carRow?.data), plate: carRow?.data?.plate, studio: info, jobLink: row ? jobLink(row.token) : appBase() });
      const filename = String(body.filename || 'protokol-przyjecia.pdf').replace(/[^\w.-]/g, '_');
      const r = await sendStudioEmail(studio, { to, ...mail, attachments: [{ filename, content: pdf, content_type: 'application/pdf' }] });
      const sent = { to, at: new Date().toISOString(), id: r?.id || null };
      await db.from('protocols').update({ data: { ...prow.data, emailed: [...(prow.data.emailed || []), sent] }, updated_at: sent.at }).eq('id', prow.id);
      if (row) await logEmail(db, row, { type: 'protocol', to, id: r?.id || null });
      return json({ ok: true, to, skipped: r?.skipped || null });
    }

    if (body.action === 'notify') {
      const { data: row } = await db.from('jobs').select('*').eq('id', body.jobId).eq('studio_id', studio.id).maybeSingle();
      if (!row) return json({ ok: false, error: 'Nie znaleziono zlecenia' }, 404);
      const job = doc(row);
      const { data: carRow } = await db.from('cars').select('data').eq('id', job.carId).eq('studio_id', studio.id).maybeSingle();
      const to = job.client?.email || carRow?.data?.ownerEmail;
      if (!to) return json({ ok: false, error: 'Klient nie ma adresu e-mail' }, 400);
      const label = carLabel(carRow?.data);
      const links = { jobLink: jobLink(row.token), icsLink: icsLink(row.token) };
      let mail;
      let attachments;
      if (body.type === 'confirmed') {
        if (job.status !== 'umowione' || !job.date) return json({ ok: false, error: 'Zlecenie nie ma potwierdzonego terminu' }, 400);
        mail = clientConfirmed({ job, carLabel: label, studio: info, ...links });
        const ics = buildIcs({
          uid: `${row.id}@detaildesk`, date: job.date, time: job.time, title: `${studio.name} – ${label}`,
          description: `${(job.services || []).map((s) => s.name).join(', ')}\nSzczegóły: ${links.jobLink}`,
          location: settings.studio.address, url: links.jobLink,
        });
        attachments = [{ filename: 'wizyta.ics', content: b64(ics), content_type: 'text/calendar' }];
      } else if (body.type === 'ready') {
        if (job.status !== 'gotowe' || !job.finalPrice) return json({ ok: false, error: 'Zlecenie nie jest oznaczone jako gotowe' }, 400);
        mail = clientReady({ job, carLabel: label, studio: info, ...links });
      } else {
        return json({ ok: false, error: 'Nieznany typ wiadomości' }, 400);
      }
      const r = await sendStudioEmail(studio, { to, ...mail, attachments });
      await logEmail(db, row, { type: body.type, to, id: r?.id || null, skipped: r?.skipped || null });
      return json({ ok: true, to, skipped: r?.skipped || null, jobLink: links.jobLink });
    }

    return json({ ok: false, error: 'Nieznana akcja' }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e.message || 'Błąd serwera' }, 500);
  }
});

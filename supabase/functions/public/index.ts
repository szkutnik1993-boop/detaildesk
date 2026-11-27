// Funkcja publiczna (bez logowania): cennik studia, zapytanie od klienta, strona zlecenia po tokenie, plik .ics,
// rejestracja nowego studia (30 dni okresu próbnego).
import {
  admin, appBase, bookingLink, carLabel, cors, doc, getSettings, getStudio, isActive, json, jobLink, icsLink,
  sendEmail, sendStudioEmail, sendPushAll, env, rateLimited, studioInfo, DEFAULT_SLUG,
} from '../_shared/server.js';
import { publicConfig } from '../_shared/defaults.js';
import { validateRequest, cleanText, normWeb } from '../_shared/booking.js';
import { buildIcs, warsawToday } from '../_shared/ics.js';
import { ownerNewRequest, adminNewStudio, studioWelcome } from '../_shared/emails.js';
import { STATUSES } from '../_shared/status.js';
import { formatMoney, servicesLabel } from '../_shared/pricing.js';
import { safeSlug, trialEnd } from '../_shared/subscription.js';
import { TERMS_VERSION } from '../_shared/legal.js';

const TOKEN_RE = /^[a-f0-9]{48}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONSENT_TEXT =
  'Wyrażam zgodę na przetwarzanie moich danych osobowych w celu obsługi zapytania i realizacji usługi, zgodnie z polityką prywatności.';
const UNAVAILABLE = 'Rezerwacje chwilowo niedostępne';

const studioPublic = (studio, settings) => ({
  slug: studio.slug,
  name: studio.name,
  logoUrl: studio.logo_url || null,
  active: isActive(studio),
  ...(settings ? { contact: publicConfig(settings).studio } : {}),
});

async function jobByToken(db, token) {
  if (!TOKEN_RE.test(token || '')) return null;
  const { data } = await db.from('jobs').select('*').eq('token', token).maybeSingle();
  return data;
}

async function handleConfig(url, db) {
  const studio = await getStudio(db, { slug: url.searchParams.get('s') || DEFAULT_SLUG() });
  if (!studio) return json({ ok: false, error: 'Nie znaleziono studia.' }, 404);
  const settings = await getSettings(db, studio.id);
  const cfg = publicConfig(settings);
  cfg.studio = { ...cfg.studio, name: studio.name };
  return json({ ok: true, studio: studioPublic(studio, settings), config: isActive(studio) ? cfg : { studio: cfg.studio } });
}

async function handleRequest(req, url, db) {
  const body = await req.json().catch(() => ({}));
  if (body.website) return json({ ok: true });
  const studio = await getStudio(db, { slug: url.searchParams.get('s') || DEFAULT_SLUG() });
  if (!studio) return json({ ok: false, error: 'Nie znaleziono studia.' }, 404);
  if (!isActive(studio)) return json({ ok: false, error: UNAVAILABLE, unavailable: true }, 403);

  const rl = await rateLimited(db, req, 5);
  if (rl.limited) return json({ ok: false, error: 'Zbyt wiele zapytań. Spróbuj za godzinę lub zadzwoń.' }, 429);

  const settings = await getSettings(db, studio.id);
  const v = validateRequest(body, settings, warsawToday());
  if (!v.ok) return json({ ok: false, errors: v.errors }, 400);
  await rl.log();
  const c = v.clean;
  const now = new Date().toISOString();

  const { data: existing } = await db.from('cars').select('*').eq('studio_id', studio.id).eq('data->>ownerPhone', c.phone);
  let carRow = (existing || []).find(
    (r) => (r.data.make || '').toLowerCase() === c.make.toLowerCase() && (r.data.model || '').toLowerCase() === c.model.toLowerCase()
  );
  if (carRow) {
    const data = { ...carRow.data, ownerName: carRow.data.ownerName || c.name, ownerEmail: c.email, size: c.sizeId, updatedAt: now };
    await db.from('cars').update({ data, updated_at: now }).eq('id', carRow.id);
    carRow = { ...carRow, data };
  } else {
    const { data, error } = await db
      .from('cars')
      .insert({ studio_id: studio.id, data: { make: c.make, model: c.model, size: c.sizeId, ownerName: c.name, ownerPhone: c.phone, ownerEmail: c.email, createdAt: now, updatedAt: now, source: 'online' } })
      .select()
      .single();
    if (error) throw error;
    carRow = data;
  }

  const jobData = {
    status: 'zapytanie', source: 'online', carId: carRow.id,
    date: c.slots[0].date, time: c.slots[0].time, proposedSlots: c.slots,
    client: { name: c.name, phone: c.phone, email: c.email },
    services: v.calc.items.map((i) => ({ serviceId: i.id, name: i.name, price: i.price, coating: i.coating })),
    price: v.calc.total, estimate: v.calc.total, sizeId: c.sizeId, paintId: v.calc.needsPaint ? c.paintId : null,
    note: c.note, notes: c.note, chemicals: '', photosBefore: [], photosAfter: [],
    consent: { at: now, text: CONSENT_TEXT },
    timeline: [{ type: 'status', status: 'zapytanie', at: now }],
    createdAt: now, updatedAt: now,
  };
  const { data: jobRow, error } = await db.from('jobs').insert({ studio_id: studio.id, data: jobData }).select().single();
  if (error) throw error;

  const job = doc(jobRow);
  const label = carLabel(carRow.data);
  const appLink = `${appBase()}#/job/${jobRow.id}`;
  const results = await Promise.allSettled([
    sendPushAll(db, studio.id, { title: `Nowe zapytanie: ${c.name}`, body: `${label} · ${servicesLabel(v.calc.items)} · ok. ${formatMoney(v.calc.total)} zł`, url: appLink, tag: `job-${jobRow.id}` }),
    sendEmail({ to: studio.contact_email, fromName: 'DetailDesk', ...ownerNewRequest({ job, carLabel: label, studio: studioInfo(studio, settings), appLink }) }),
  ]);
  results.forEach((r) => r.status === 'rejected' && console.error('notify owner:', r.reason));
  return json({ ok: true, token: jobRow.token });
}

async function handleJob(url, db) {
  const row = await jobByToken(db, url.searchParams.get('t'));
  if (!row) return json({ ok: false, error: 'Nie znaleziono zlecenia.' }, 404);
  const job = doc(row);
  const studio = await getStudio(db, { id: row.studio_id });
  const settings = await getSettings(db, row.studio_id);
  const { data: carRow } = await db.from('cars').select('*').eq('id', job.carId).eq('studio_id', row.studio_id).maybeSingle();

  const photoItems = (job.timeline || []).filter((t) => t.type === 'photo' && t.path);
  let signed = {};
  if (photoItems.length) {
    const { data } = await db.storage.from('photos').createSignedUrls(photoItems.map((p) => p.path), 3600 * 6);
    signed = Object.fromEntries((data || []).map((d) => [d.path, d.signedUrl]));
  }
  const showFinal = job.status === 'gotowe' || job.status === 'odebrane';
  return json({
    ok: true,
    job: {
      status: job.status,
      statusLabel: STATUSES[job.status]?.client || job.status,
      clientName: (job.client?.name || carRow?.data?.ownerName || '').split(' ')[0],
      car: carLabel(carRow?.data),
      plate: carRow?.data?.plate || '',
      date: job.date,
      time: job.time,
      proposedSlots: job.status === 'zapytanie' ? job.proposedSlots || [] : [],
      services: (job.services || []).map((s) => ({ name: s.name })),
      estimate: job.estimate ?? job.price,
      finalPrice: showFinal ? job.finalPrice : null,
      createdAt: job.createdAt,
      icsUrl: job.status === 'umowione' ? icsLink(row.token) : null,
      timeline: (job.timeline || [])
        .filter((t) => t.type === 'status' || (t.type === 'photo' && signed[t.path]))
        .map((t) => (t.type === 'photo' ? { type: 'photo', at: t.at, stage: t.stage, caption: t.caption, url: signed[t.path] } : { type: 'status', at: t.at, status: t.status, label: STATUSES[t.status]?.label })),
    },
    studio: { ...publicConfig(settings).studio, name: studio?.name || settings.studio.name, slug: studio?.slug, logoUrl: studio?.logo_url || null },
  });
}

async function handleIcs(url, db) {
  const row = await jobByToken(db, url.searchParams.get('t'));
  if (!row || !row.data.date) return new Response('Nie znaleziono', { status: 404, headers: cors });
  const job = doc(row);
  const studio = await getStudio(db, { id: row.studio_id });
  const settings = await getSettings(db, row.studio_id);
  const { data: carRow } = await db.from('cars').select('data').eq('id', job.carId).maybeSingle();
  const ics = buildIcs({
    uid: `${row.id}@detaildesk`, date: job.date, time: job.time,
    title: `${studio?.name || settings.studio.name} – ${carLabel(carRow?.data)}`,
    description: `${(job.services || []).map((s) => s.name).join(', ')}\nSzczegóły: ${jobLink(row.token)}`,
    location: settings.studio.address, url: jobLink(row.token),
  });
  return new Response(ics, { headers: { ...cors, 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="wizyta.ics"' } });
}

// rejestracja nowego studia: konto właściciela + studio + 30 dni okresu próbnego
async function handleRegister(req, db) {
  const b = await req.json().catch(() => ({}));
  if (b.website) return json({ ok: true });
  const name = cleanText(b.studioName, 60);
  const email = cleanText(b.email, 120).toLowerCase();
  const phone = cleanText(b.phone, 30);
  const web = normWeb(b.web);
  const errors = {};
  if (name.length < 2) errors.studioName = 'Podaj nazwę studia.';
  if (!EMAIL_RE.test(email)) errors.email = 'Podaj poprawny e-mail.';
  if (web === null) errors.web = 'Podaj poprawny adres strony, np. mojestudio.pl (albo zostaw puste).';
  // akceptacja Regulaminu (z Umową powierzenia) i Polityki prywatności – wymagana, w aktualnej wersji
  if (b.consent !== true) errors.consent = 'Zaakceptuj Regulamin (w tym Umowę powierzenia) i Politykę prywatności.';
  else if (b.termsVersion !== TERMS_VERSION) errors.consent = 'Dokumenty zostały zaktualizowane – odśwież stronę i zaakceptuj aktualną wersję.';
  if (Object.keys(errors).length) return json({ ok: false, errors }, 400);

  const rl = await rateLimited(db, req, 3); // max 3 nowe studia / godzinę z jednego IP
  if (rl.limited) return json({ ok: false, error: 'Zbyt wiele prób. Spróbuj za godzinę.' }, 429);

  const { data: created, error: uErr } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (uErr) {
    if (/already|registered|exists/i.test(uErr.message)) return json({ ok: false, error: 'Konto z tym e-mailem już istnieje – zaloguj się.', exists: true }, 409);
    throw uErr;
  }
  const userId = created.user.id;
  try {
    const base = safeSlug(name);
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const { data: taken } = await db.from('studios').select('id').eq('slug', slug).maybeSingle();
      if (!taken) break;
      slug = `${base.slice(0, 46)}-${i}`;
    }
    const { data: studio, error: sErr } = await db
      .from('studios')
      .insert({
        slug, name, email_from_name: name, contact_email: email, phone: phone || null, plan: 'trial', active_until: trialEnd().toISOString(),
        terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION,
      })
      .select()
      .single();
    if (sErr) throw sErr;
    const steps = await Promise.all([
      db.from('studio_members').insert({ user_id: userId, studio_id: studio.id, role: 'owner' }),
      db.from('meta').insert({ studio_id: studio.id, key: 'settings', value: { studio: { name, signature: '', phone, email, web: web || '', address: '' }, services: [], onboarded: false } }),
      db.from('subscription_events').insert({ studio_id: studio.id, kind: 'trial', months: null, source: 'registration', active_until_after: studio.active_until, created_by: email }),
    ]);
    const failed = steps.find((s) => s.error);
    if (failed) throw failed.error;

    // e-mail powitalny z linkiem do instrukcji instalacji na telefonie
    const trialUntil = new Date(studio.active_until).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
    await sendEmail({ to: email, fromName: 'DetailDesk', replyTo: env('OWNER_EMAIL') || undefined, ...studioWelcome({ studio, appLink: appBase(), guideLink: `${appBase()}#/instalacja`, bookingLink: bookingLink(slug), trialUntil }) }).catch((e) => console.error(e));
    if (env('OWNER_EMAIL')) {
      await sendEmail({ to: env('OWNER_EMAIL'), fromName: 'DetailDesk', ...adminNewStudio({ studio, email, phone, adminLink: `${appBase()}#/admin` }) }).catch((e) => console.error(e));
    }
    await rl.log();
    return json({ ok: true, slug, bookingUrl: bookingLink(slug) });
  } catch (e) {
    await db.auth.admin.deleteUser(userId).catch(() => {}); // sprzątanie (studio usunie się kaskadowo, jeśli powstało)
    await db.from('studios').delete().eq('contact_email', email).eq('plan', 'trial');
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const db = admin();
  try {
    if (req.method === 'GET' && action === 'config') return await handleConfig(url, db);
    if (req.method === 'GET' && action === 'job') return await handleJob(url, db);
    if (req.method === 'GET' && action === 'ics') return await handleIcs(url, db);
    if (req.method === 'POST' && action === 'request') return await handleRequest(req, url, db);
    if (req.method === 'POST' && action === 'register') return await handleRegister(req, db);
    return json({ ok: false, error: 'Nieznana akcja' }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'Błąd serwera. Spróbuj ponownie.' }, 500);
  }
});

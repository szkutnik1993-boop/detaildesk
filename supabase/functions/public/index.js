// Funkcja publiczna (bez logowania): cennik, zapytanie od klienta, strona zlecenia po tokenie, plik .ics
import { admin, appBase, carLabel, cors, doc, getSettings, json, jobLink, icsLink, sendEmail, sendPushAll, env } from '../_shared/server.js';
import { publicConfig } from '../_shared/defaults.js';
import { validateRequest } from '../_shared/booking.js';
import { buildIcs, warsawToday } from '../_shared/ics.js';
import { ownerNewRequest } from '../_shared/emails.js';
import { STATUSES } from '../_shared/status.js';
import { formatMoney, servicesLabel } from '../_shared/pricing.js';

const TOKEN_RE = /^[a-f0-9]{48}$/;
const CONSENT_TEXT =
  'Wyrażam zgodę na przetwarzanie moich danych osobowych w celu obsługi zapytania i realizacji usługi, zgodnie z polityką prywatności.';

async function jobByToken(db, token) {
  if (!TOKEN_RE.test(token || '')) return null;
  const { data } = await db.from('jobs').select('*').eq('token', token).maybeSingle();
  return data;
}

async function handleRequest(req, db) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const body = await req.json().catch(() => ({}));
  if (body.website) return json({ ok: true, token: null }); // pułapka na boty

  // limit: 5 zapytań / godzinę z jednego adresu IP
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from('request_log').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
  if ((count || 0) >= 5) return json({ ok: false, error: 'Zbyt wiele zapytań. Spróbuj za godzinę lub zadzwoń.' }, 429);

  const settings = await getSettings(db);
  const v = validateRequest(body, settings, warsawToday());
  if (!v.ok) return json({ ok: false, errors: v.errors }, 400);
  await db.from('request_log').insert({ ip });
  const c = v.clean;
  const now = new Date().toISOString();

  // auto: jeśli klient (telefon) z tym samym autem już jest w bazie – użyj go
  const { data: existing } = await db.from('cars').select('*').eq('data->>ownerPhone', c.phone);
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
      .insert({ data: { make: c.make, model: c.model, size: c.sizeId, ownerName: c.name, ownerPhone: c.phone, ownerEmail: c.email, createdAt: now, updatedAt: now, source: 'online' } })
      .select()
      .single();
    if (error) throw error;
    carRow = data;
  }

  const jobData = {
    status: 'zapytanie',
    source: 'online',
    carId: carRow.id,
    date: c.slots[0].date,
    time: c.slots[0].time,
    proposedSlots: c.slots,
    client: { name: c.name, phone: c.phone, email: c.email },
    services: v.calc.items.map((i) => ({ serviceId: i.id, name: i.name, price: i.price, coating: i.coating })),
    price: v.calc.total,
    estimate: v.calc.total,
    sizeId: c.sizeId,
    paintId: v.calc.needsPaint ? c.paintId : null,
    note: c.note,
    notes: c.note,
    chemicals: '',
    photosBefore: [],
    photosAfter: [],
    consent: { at: now, text: CONSENT_TEXT },
    timeline: [{ type: 'status', status: 'zapytanie', at: now }],
    createdAt: now,
    updatedAt: now,
  };
  const { data: jobRow, error } = await db.from('jobs').insert({ data: jobData }).select().single();
  if (error) throw error;

  const job = doc(jobRow);
  const label = carLabel(carRow.data);
  const appLink = `${appBase()}#/job/${jobRow.id}`;
  const results = await Promise.allSettled([
    sendPushAll(db, {
      title: `Nowe zapytanie: ${c.name}`,
      body: `${label} · ${servicesLabel(v.calc.items)} · ok. ${formatMoney(v.calc.total)} zł`,
      url: appLink,
      tag: `job-${jobRow.id}`,
    }),
    env('OWNER_EMAIL') ? sendEmail({ to: env('OWNER_EMAIL'), ...ownerNewRequest({ job, carLabel: label, studio: settings.studio, appLink }) }) : Promise.resolve(null),
  ]);
  results.forEach((r) => r.status === 'rejected' && console.error('notify owner:', r.reason));
  return json({ ok: true, token: jobRow.token });
}

async function handleJob(url, db) {
  const row = await jobByToken(db, url.searchParams.get('t'));
  if (!row) return json({ ok: false, error: 'Nie znaleziono zlecenia.' }, 404);
  const job = doc(row);
  const settings = await getSettings(db);
  const { data: carRow } = await db.from('cars').select('*').eq('id', job.carId).maybeSingle();

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
    studio: publicConfig(settings).studio,
  });
}

async function handleIcs(url, db) {
  const row = await jobByToken(db, url.searchParams.get('t'));
  if (!row || !row.data.date) return new Response('Nie znaleziono', { status: 404, headers: cors });
  const job = doc(row);
  const settings = await getSettings(db);
  const { data: carRow } = await db.from('cars').select('data').eq('id', job.carId).maybeSingle();
  const ics = buildIcs({
    uid: `${row.id}@detaildesk`,
    date: job.date,
    time: job.time,
    title: `${settings.studio.name} – ${carLabel(carRow?.data)}`,
    description: `${(job.services || []).map((s) => s.name).join(', ')}\nSzczegóły: ${jobLink(row.token)}`,
    location: settings.studio.address,
    url: jobLink(row.token),
  });
  return new Response(ics, {
    headers: { ...cors, 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="wizyta-arc-detailing.ics"' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const db = admin();
  try {
    if (req.method === 'GET' && action === 'config') return json({ ok: true, config: publicConfig(await getSettings(db)) });
    if (req.method === 'GET' && action === 'job') return await handleJob(url, db);
    if (req.method === 'GET' && action === 'ics') return await handleIcs(url, db);
    if (req.method === 'POST' && action === 'request') return await handleRequest(req, db);
    return json({ ok: false, error: 'Nieznana akcja' }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'Błąd serwera. Spróbuj ponownie.' }, 500);
  }
});

// Test całej ścieżki na prawdziwym backendzie (Supabase). Uruchamiany lokalnie.
// Wymaga: PROJECT_REF, SERVICE_KEY (tylko do wygenerowania sesji właściciela), OWNER_EMAIL, CRON_SECRET.
// Tworzy zlecenie testowe „TEST E2E”; z KEEP=1 zostawia je w bazie.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { applyTransition } from '../supabase/functions/_shared/status.js';
import { warsawToday, addDaysISO } from '../supabase/functions/_shared/ics.js';

const E = process.env;
const URL_ = `https://${E.PROJECT_REF}.supabase.co`;
const F = `${URL_}/functions/v1`;
const anonKey = readFileSync('src/config.js', 'utf8').match(/SUPABASE_ANON_KEY = '(.*?)'/)[1];
const testEmail = E.TEST_CLIENT_EMAIL || E.OWNER_EMAIL;
let pass = 0;
const ok = (cond, msg, extra = '') => {
  if (!cond) throw new Error(`✗ ${msg} ${extra}`);
  pass++;
  console.log(`✓ ${msg}${extra ? ' – ' + extra : ''}`);
};
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });

// 1. Klient wysyła zapytanie (bez logowania)
const tomorrow = addDaysISO(warsawToday(), 1);
const req = await j(
  await fetch(`${F}/public?action=request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      make: 'TEST E2E', model: 'Audi A6', sizeId: 'sedan', serviceIds: ['one-step', 'ceramika'], paintId: 'medium',
      slots: [{ date: tomorrow, time: '09:00' }, { date: addDaysISO(tomorrow, 1), time: '10:00' }],
      name: 'Test Klient', phone: '+48 500 000 000', email: testEmail, note: 'Zlecenie testowe', consent: true,
    }),
  })
);
ok(req.status === 200 && /^[a-f0-9]{48}$/.test(req.body?.token || ''), 'zapytanie przyjęte, token 192-bit', req.body?.token?.slice(0, 8) + '…');
const token = req.body.token;

const bad = await j(await fetch(`${F}/public?action=request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ make: 'x', consent: false }) }));
ok(bad.status === 400 && bad.body.errors.consent, 'zapytanie bez zgody RODO odrzucone');

const view = async () => (await j(await fetch(`${F}/public?action=job&t=${token}`))).body;
let v = await view();
ok(v.job.status === 'zapytanie' && v.job.estimate === 2440, 'strona klienta: status zapytanie, cena orient. 2440 zł (serwer przeliczył)');
ok(!('phone' in v.job) && !('email' in v.job) && !('id' in v.job), 'strona klienta nie ujawnia telefonu/e-maila/ID');

// 2. Bezpieczeństwo: anonim nie widzi tabel ani zdjęć
const anon = createClient(URL_, anonKey, { auth: { persistSession: false } });
const a1 = await anon.from('jobs').select('*');
ok((a1.data || []).length === 0, 'RLS: anonim nie widzi zleceń');
const a2 = await anon.from('jobs').insert({ data: { hack: 1 } });
ok(!!a2.error, 'RLS: anonim nie może dopisać zlecenia');
const a3 = await anon.from('meta').select('*');
ok((a3.data || []).length === 0, 'RLS: anonim nie widzi ustawień');
const a4 = await anon.storage.from('photos').list('');
ok((a4.data || []).length === 0, 'Storage: anonim nie widzi zdjęć');

// 3. Sesja właściciela (kod jednorazowy wygenerowany przez API administratora, bez wysyłki e-maila)
const gl = await j(
  await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: E.SERVICE_KEY, Authorization: `Bearer ${E.SERVICE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: E.OWNER_EMAIL }),
  })
);
const owner = createClient(URL_, anonKey, { auth: { persistSession: false } });
const vr = await owner.auth.verifyOtp({ email: E.OWNER_EMAIL, token: gl.body.email_otp, type: 'email' });
ok(!vr.error && vr.data.session, 'właściciel zalogowany kodem');
const at = vr.data.session.access_token;
ok((await owner.rpc('is_owner')).data === true, 'is_owner() = true');
const call = async (body) => j(await fetch(`${F}/owner`, { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));

const { data: rows } = await owner.from('jobs').select('*').eq('token', token);
ok(rows.length === 1, 'właściciel widzi zlecenie w aplikacji');
let row = rows[0];
let job = { ...row.data, id: row.id };
const save = async (jb) => {
  const { id, ...data } = jb;
  const { error } = await owner.from('jobs').update({ data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};

// 4. Potwierdzenie terminu + e-mail z .ics
job = applyTransition(job, 'umowione', { date: tomorrow, time: '09:00' }).job;
await save(job);
let n = await call({ action: 'notify', jobId: job.id, type: 'confirmed' });
ok(n.status === 200 && n.body.ok, 'potwierdzenie: e-mail do klienta', n.body.skipped ? `POMINIĘTY (${n.body.skipped})` : `wysłany do ${n.body.to}`);
v = await view();
ok(v.job.status === 'umowione' && v.job.icsUrl, 'strona klienta: termin potwierdzony + link do kalendarza');
const ics = await fetch(v.job.icsUrl);
const icsText = await ics.text();
ok(ics.headers.get('content-type').includes('text/calendar') && icsText.includes('DTSTART:'), 'plik .ics generuje się poprawnie');

// 5. Przypomnienie dzień przed (zadanie cykliczne)
const cr = await j(await fetch(`${F}/cron`, { method: 'POST', headers: { 'x-cron-secret': E.CRON_SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ date: tomorrow }) }));
const mine = (cr.body?.sent || []).find((s) => s.id === job.id);
ok(cr.status === 200 && mine && !mine.error, 'przypomnienie o jutrzejszej wizycie wysłane', mine?.to);
const cr2 = await j(await fetch(`${F}/cron`, { method: 'POST', headers: { 'x-cron-secret': E.CRON_SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ date: tomorrow }) }));
ok(!(cr2.body?.sent || []).some((s) => s.id === job.id), 'przypomnienie nie wysyła się drugi raz');

// 5b. Protokół przyjęcia wysłany klientowi e-mailem (PDF w załączniku)
const { data: prot, error: pErr } = await owner
  .from('protocols')
  .insert({ data: { carId: job.carId, jobId: job.id, mileage: '85000', paint: { hood: '120' }, damages: [], notes: 'test', createdAt: new Date().toISOString() } })
  .select()
  .single();
if (pErr) throw pErr;
const tinyPdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');
const sp = await call({ action: 'send-protocol', protocolId: prot.id, filename: 'protokol-test.pdf', pdfBase64: tinyPdf });
ok(sp.status === 200 && sp.body.ok && !sp.body.skipped, 'protokół PDF wysłany mailem do klienta', sp.body.to || sp.body.error);
const { data: protAfter } = await owner.from('protocols').select('data').eq('id', prot.id).single();
ok((protAfter.data.emailed || []).length === 1, 'aplikacja zapisała, kiedy i dokąd wysłano protokół');

// 6. Przyjęcie + zdjęcie etapu widoczne dla klienta
({ data: [row] } = await owner.from('jobs').select('*').eq('id', job.id));
job = applyTransition({ ...row.data, id: row.id }, 'w_trakcie').job;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const path = `test/${job.id}.png`;
const up = await owner.storage.from('photos').upload(path, png, { contentType: 'image/png', upsert: true });
ok(!up.error, 'zdjęcie wysłane do prywatnego Storage');
job.timeline.push({ type: 'photo', path, stage: 'Korekta', caption: 'Po pierwszym etapie', at: new Date().toISOString() });
await save(job);
v = await view();
const ph = v.job.timeline.find((t) => t.type === 'photo');
ok(v.job.status === 'w_trakcie' && ph && ph.stage === 'Korekta', 'strona klienta: status w trakcie + zdjęcie etapu');
ok((await fetch(ph.url)).status === 200, 'zdjęcie dostępne dla klienta przez podpisany link');

// 7. Auto gotowe z kwotą końcową
job = applyTransition(job, 'gotowe', { finalPrice: 2500 }).job;
await save(job);
n = await call({ action: 'notify', jobId: job.id, type: 'ready' });
ok(n.status === 200 && n.body.ok, 'auto gotowe: e-mail „Zapraszamy po odbiór”', n.body.skipped ? `POMINIĘTY (${n.body.skipped})` : `wysłany do ${n.body.to}`);
v = await view();
ok(v.job.status === 'gotowe' && v.job.finalPrice === 2500, 'strona klienta: gotowe, kwota 2500 zł');

job = applyTransition(job, 'odebrane').job;
await save(job);
v = await view();
ok(v.job.status === 'odebrane', 'odebrane');

// sprzątanie
if (!E.KEEP) {
  await owner.storage.from('photos').remove([path]);
  await owner.from('protocols').delete().eq('id', prot.id);
  await owner.from('jobs').delete().eq('id', job.id);
  await owner.from('cars').delete().eq('id', job.carId);
  console.log('(zlecenie testowe usunięte)');
}
console.log(`\nWSZYSTKO OK – ${pass} sprawdzeń. Link testowy: https://arc-app.arcdetailing.pl/zlecenie/?t=${token}`);

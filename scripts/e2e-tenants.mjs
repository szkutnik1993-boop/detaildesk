// Test wielu studiów na prawdziwym backendzie (Supabase): rejestracja, separacja danych (RLS),
// administrator BEZ dostępu do danych klientów, okres próbny, tryb tylko do odczytu, przedłużenie, blokada,
// przypomnienia, ogłoszenia, pomysły. Po teście studio testowe jest usuwane.
// Wymaga: PROJECT_REF, SERVICE_KEY, SUPABASE_ACCESS_TOKEN (tylko do ustawienia dat w teście), OWNER_EMAIL, CRON_SECRET.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { warsawToday, addDaysISO } from '../supabase/functions/_shared/ics.js';

const E = process.env;
const URL_ = `https://${E.PROJECT_REF}.supabase.co`;
const F = `${URL_}/functions/v1`;
const anonKey = readFileSync('src/config.js', 'utf8').match(/SUPABASE_ANON_KEY = '(.*?)'/)[1];
let pass = 0;
const ok = (cond, msg, extra = '') => {
  if (!cond) throw new Error(`✗ ${msg} ${extra}`);
  pass++;
  console.log(`✓ ${msg}${extra ? ' – ' + extra : ''}`);
};
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${E.PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${E.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return JSON.parse(t);
};
async function sessionFor(email) {
  const gl = await j(await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: E.SERVICE_KEY, Authorization: `Bearer ${E.SERVICE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  }));
  const c = createClient(URL_, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.verifyOtp({ email, token: gl.body.email_otp, type: 'email' });
  if (error) throw error;
  return { c, token: data.session.access_token };
}
const ownerFn = (token, body) => fetch(`${F}/owner`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j);

const ts = Date.now();
const startedAt = new Date().toISOString();
const bEmail = `delivered+studio${ts}@resend.dev`; // testowy adres Resend (bez prawdziwej skrzynki)
let studioB = null;
let userB = null;

try {
  // ---------- 1. rejestracja nowego studia ----------
  const reg = await j(await fetch(`${F}/public?action=register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ studioName: `Test Studio ${ts}`, email: bEmail, phone: '500600700', web: 'https://www.Test-Studio.pl/', consent: true }),
  }));
  ok(reg.status === 200 && reg.body.slug, 'rejestracja nowego studia', reg.body?.slug || JSON.stringify(reg.body));
  const slug = reg.body.slug;
  const dup = await j(await fetch(`${F}/public?action=register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studioName: 'Duplikat', email: bEmail, consent: true }) }));
  ok(dup.status === 409, 'drugie konto na ten sam e-mail odrzucone');

  const B = await sessionFor(bEmail);
  const A = await sessionFor(E.OWNER_EMAIL); // ARC Detailing + administrator platformy
  const stB = (await B.c.rpc('my_studio')).data;
  studioB = stB.id;
  userB = (await B.c.auth.getUser()).data.user.id;
  const left = Math.round((new Date(stB.active_until) - Date.now()) / 86400000);
  ok(stB.plan === 'trial' && stB.active && left === 30, 'okres próbny 30 dni (active_until)', stB.active_until);
  ok(stB.is_admin === false, 'właściciel nowego studia nie jest administratorem');
  const metaB = (await B.c.from('meta').select('value').eq('key', 'settings').single()).data;
  ok(metaB.value.onboarded === false, 'nowe studio zaczyna od ekranu pierwszej konfiguracji');

  // ---------- 2. własny link /umow ----------
  const cfg = await j(await fetch(`${F}/public?action=config&s=${slug}`));
  ok(cfg.body.ok && cfg.body.studio.active && cfg.body.studio.name === `Test Studio ${ts}`, 'formularz /umow?s= dla nowego studia działa');
  ok(cfg.body.studio.contact.web === 'www.test-studio.pl', 'strona www z rejestracji zapisana i ujednolicona', cfg.body.studio.contact.web);
  const badWeb = await j(await fetch(`${F}/public?action=register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studioName: 'Zła strona', email: `delivered+zla${ts}@resend.dev`, web: 'moje studio', consent: true }) }));
  ok(badWeb.status === 400 && !!badWeb.body.errors.web, 'niepoprawny adres strony odrzucony przy rejestracji');
  // studio B konfiguruje cennik (pierwsza konfiguracja)
  const { error: cfgErr } = await B.c.from('meta').upsert({ key: 'settings', value: { ...metaB.value, onboarded: true, services: [{ id: 'mycie', name: 'Mycie detailingowe', price: 150 }] } }, { onConflict: 'studio_id,key' });
  ok(!cfgErr, 'studio zapisuje własny cennik');
  const cfg2 = await j(await fetch(`${F}/public?action=config&s=${slug}`));
  ok(cfg2.body.config.services.length === 1 && cfg2.body.config.services[0].price === 150, 'formularz pokazuje cennik tylko tego studia');

  const tomorrow = addDaysISO(warsawToday(), 1);
  const booking = (s) => fetch(`${F}/public?action=request&s=${s}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ make: 'TEST', model: 'Tenant', sizeId: 'small', serviceIds: ['mycie'], slots: [{ date: tomorrow, time: '10:00' }], name: 'Klient Testowy', phone: '500111222', email: 'delivered@resend.dev', consent: true }),
  }).then(j);
  ok((await booking(slug)).status === 200, 'rezerwacja online w nowym studiu');

  // ---------- 3. separacja danych studiów (RLS) ----------
  const jobsB = (await B.c.from('jobs').select('id, studio_id, data')).data;
  ok(jobsB.length === 1 && jobsB.every((r) => r.studio_id === studioB), 'studio B widzi tylko swoje zlecenie');
  const jobB = jobsB[0];
  const arcJobs = (await sql(`select count(*)::int as n from public.jobs where studio_id <> '${studioB}'`))[0].n;
  ok(arcJobs >= 0 && jobsB.length === 1, `studio B nie widzi ${arcJobs} zleceń innych studiów`);

  // ADMINISTRATOR (ARC) – brak dostępu do danych klientów innych studiów
  for (const t of ['jobs', 'cars', 'quotes', 'protocols', 'meta', 'push_subscriptions']) {
    const r = await A.c.from(t).select('*').eq('studio_id', studioB);
    ok(!r.error && r.data.length === 0, `administrator NIE widzi tabeli ${t} studia B`);
  }
  const byId = await A.c.from('jobs').select('*').eq('id', jobB.id);
  ok(byId.data.length === 0, 'administrator nie odczyta zlecenia studia B nawet znając jego ID');
  const upd = await A.c.from('jobs').update({ data: { hacked: true } }).eq('id', jobB.id).select();
  ok((upd.data || []).length === 0, 'administrator nie zmieni zlecenia studia B');
  const byToken = await A.c.from('jobs').select('token').eq('studio_id', studioB);
  ok(byToken.data.length === 0, 'administrator nie pozna tokenu strony klienta studia B');

  // zdjęcia: B wgrywa do swojego folderu; admin nie ma do nich dostępu
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const photoPath = `${studioB}/test/${ts}.png`;
  ok(!(await B.c.storage.from('photos').upload(photoPath, png, { contentType: 'image/png' })).error, 'studio B wgrywa zdjęcie do swojego folderu');
  const arcId = (await A.c.rpc('my_studio')).data.id;
  ok(!!(await B.c.storage.from('photos').upload(`${arcId}/hack-${ts}.png`, png, { contentType: 'image/png' })).error, 'studio B nie wgra zdjęcia do folderu innego studia');
  // logo: zapis do własnego folderu (także nadpisanie), publiczny odczyt, brak zapisu do cudzego folderu
  const logoUp = await B.c.storage.from('logos').upload(`${studioB}/logo-test.png`, png, { contentType: 'image/png', upsert: true });
  ok(!logoUp.error, 'studio wgrywa logo', logoUp.error?.message || '');
  ok(!(await B.c.storage.from('logos').upload(`${studioB}/logo-test.png`, png, { contentType: 'image/png', upsert: true })).error, 'studio podmienia logo');
  const logoUrl = B.c.storage.from('logos').getPublicUrl(`${studioB}/logo-test.png`).data.publicUrl;
  ok((await fetch(logoUrl)).status === 200, 'logo dostępne publicznie (formularz, e-maile)');
  ok(!!(await B.c.storage.from('logos').upload(`${arcId}/hack.png`, png, { contentType: 'image/png' })).error, 'studio nie podmieni logo innego studia');
  ok(!(await B.c.rpc('update_my_studio', { p_logo_url: logoUrl })).error, 'adres logo zapisany w studiu');
  ok((await j(await fetch(`${F}/public?action=config&s=${slug}`))).body.studio.logoUrl === logoUrl, 'formularz /umow zwraca logo studia');

  const signedAdmin = await A.c.storage.from('photos').createSignedUrl(photoPath, 60);
  ok(!!signedAdmin.error || !signedAdmin.data?.signedUrl, 'administrator nie otworzy zdjęcia klienta studia B');
  const listAdmin = await A.c.storage.from('photos').list(studioB);
  ok((listAdmin.data || []).length === 0, 'administrator nie widzi listy zdjęć studia B');

  // panel administratora: tylko dane studiów i liczby
  const list = await A.c.rpc('admin_list_studios');
  const rowB = (list.data || []).find((r) => r.id === studioB);
  ok(!list.error && rowB, 'administrator widzi studio B na liście');
  ok(rowB.jobs_month === 1 && rowB.bookings_month === 1 && rowB.jobs_total === 1, 'aktywność studia jako liczby (1 zlecenie, 1 rezerwacja online)');
  const allowed = ['id', 'slug', 'name', 'contact_email', 'phone', 'plan', 'active_until', 'blocked', 'created_at', 'last_sign_in', 'jobs_month', 'bookings_month', 'jobs_total', 'revenue_cents', 'notes'];
  ok(Object.keys(rowB).every((k) => allowed.includes(k)), 'lista studiów nie zawiera danych klientów (tylko dane studia i liczby)');
  ok(!JSON.stringify(list.data).includes('Klient Testowy') && !JSON.stringify(list.data).includes('500111222'), 'w odpowiedzi panelu nie ma imion ani telefonów klientów');
  ok(!!(await B.c.rpc('admin_list_studios')).error, 'zwykłe studio nie ma dostępu do panelu administratora');
  ok(!!(await B.c.rpc('admin_extend_studio', { p_studio: studioB, p_months: 12 })).error, 'studio nie przedłuży samo sobie abonamentu');
  ok(!!(await B.c.rpc('extend_studio_subscription', { p_studio: studioB, p_months: 12, p_source: 'hack' })).error, 'bezpośrednie przedłużenie zablokowane');
  await B.c.from('studios').update({ active_until: '2099-01-01' }).eq('id', studioB);
  ok((await B.c.rpc('my_studio')).data.plan === 'trial' && new Date((await B.c.rpc('my_studio')).data.active_until).getFullYear() < 2099, 'studio nie zmieni sobie daty ważności');

  // ---------- 4. przypomnienie 7 dni przed końcem ----------
  await sql(`update public.studios set active_until = now() + interval '7 days' + interval '2 hours', trial_reminders = '{}' where id = '${studioB}'`);
  const cron = () => fetch(`${F}/cron`, { method: 'POST', headers: { 'x-cron-secret': E.CRON_SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ date: '2000-01-01' }) }).then(j);
  let c1 = await cron();
  ok((c1.body.trial || []).some((t) => t.studio === slug && t.days === 7 && !t.error), 'e-mail: dostęp kończy się za 7 dni');
  c1 = await cron();
  ok(!(c1.body.trial || []).some((t) => t.studio === slug), 'przypomnienie 7-dniowe nie wysyła się drugi raz');
  await sql(`update public.studios set active_until = now() + interval '1 day' + interval '2 hours' where id = '${studioB}'`);
  c1 = await cron();
  ok((c1.body.trial || []).some((t) => t.studio === slug && t.days === 1), 'e-mail: dostęp kończy się jutro');

  // ---------- 5. po terminie: tylko odczyt, rezerwacje wyłączone ----------
  await sql(`update public.studios set active_until = now() - interval '1 minute' where id = '${studioB}'`);
  const expired = (await B.c.rpc('my_studio')).data;
  ok(expired.active === false, 'po terminie studio jest nieaktywne');
  ok((await B.c.from('jobs').select('id')).data.length === 1, 'tryb tylko do odczytu: dane nadal widoczne (nic nie usunięte)');
  const ins = await B.c.from('cars').insert({ data: { make: 'X' } });
  ok(!!ins.error, 'tryb tylko do odczytu: dodawanie zablokowane przez bazę');
  const updRO = await B.c.from('jobs').update({ data: { ...jobB.data, notes: 'x' } }).eq('id', jobB.id).select();
  ok((updRO.data || []).length === 0, 'tryb tylko do odczytu: edycja zablokowana przez bazę');
  ok(!!(await B.c.storage.from('photos').upload(`${studioB}/ro-${ts}.png`, png, { contentType: 'image/png' })).error, 'tryb tylko do odczytu: wysyłanie zdjęć zablokowane');
  const exportRO = await Promise.all(['cars', 'jobs', 'quotes', 'protocols', 'meta'].map((t) => B.c.from(t).select('*')));
  ok(exportRO.every((r) => !r.error), 'eksport danych działa po wygaśnięciu');
  const cfgExp = await j(await fetch(`${F}/public?action=config&s=${slug}`));
  ok(cfgExp.body.studio.active === false && !cfgExp.body.config.services, 'formularz /umow: „Rezerwacje chwilowo niedostępne” (bez cennika)');
  const bookExp = await booking(slug);
  ok(bookExp.status === 403 && bookExp.body.error === 'Rezerwacje chwilowo niedostępne', 'rezerwacja po terminie odrzucona przez serwer');
  const notifyExp = await ownerFn(B.token, { action: 'notify', jobId: jobB.id, type: 'confirmed' });
  ok(notifyExp.status === 403, 'wysyłka e-maili do klientów wstrzymana po terminie');

  // pomysł do administratora działa nawet po wygaśnięciu
  const fb = await ownerFn(B.token, { action: 'feedback', kind: 'pomysł', message: `Test pomysłu ${ts}` });
  ok(fb.status === 200, 'studio wysyła pomysł do administratora (także po wygaśnięciu)');
  const fbList = (await A.c.rpc('admin_list_feedback')).data;
  const myFb = fbList.find((x) => x.message === `Test pomysłu ${ts}`);
  ok(myFb && myFb.status === 'nowe', 'pomysł widoczny w skrzynce administratora');
  ok(!(await A.c.rpc('admin_set_feedback_status', { p_id: myFb.id, p_status: 'w realizacji' })).error, 'zmiana statusu pomysłu: w realizacji');
  const rep = await ownerFn(A.token, { action: 'admin-reply', feedbackId: myFb.id, reply: 'Dzięki, dodam!' });
  ok(rep.status === 200, 'odpowiedź e-mailem na pomysł', rep.body?.to);
  ok((await B.c.from('feedback').select('reply').eq('id', myFb.id).single()).data.reply === 'Dzięki, dodam!', 'studio widzi odpowiedź w aplikacji');
  ok((await ownerFn(B.token, { action: 'admin-reply', feedbackId: myFb.id, reply: 'hack' })).status === 403, 'studio nie może odpowiadać jako administrator');

  // ---------- 6. administrator przedłuża ----------
  const ext = await A.c.rpc('admin_extend_studio', { p_studio: studioB, p_months: 1, p_amount_cents: 9900 });
  ok(!ext.error, 'administrator: Przedłuż o 1 miesiąc (99 zł)');
  const after = (await B.c.rpc('my_studio')).data;
  const leftAfter = Math.round((new Date(after.active_until) - Date.now()) / 86400000);
  ok(after.active && after.plan === 'paid' && leftAfter >= 28 && leftAfter <= 31, 'studio znów aktywne, liczone od dziś', `${leftAfter} dni`);
  ok(!(await B.c.from('cars').insert({ data: { make: 'po przedłużeniu' } })).error, 'po przedłużeniu zapis znów działa');
  const pays = (await A.c.rpc('admin_list_payments')).data.filter((p) => p.studio_id === studioB);
  ok(pays.some((p) => p.kind === 'trial') && pays.some((p) => p.amount_cents === 9900 && p.months === 1), 'historia płatności: okres próbny + wpłata 99 zł');
  ok(!(await A.c.rpc('admin_extend_studio', { p_studio: studioB, p_months: 12 })).error, 'administrator: Przedłuż o 12 miesięcy');
  ok(!!(await A.c.rpc('admin_extend_studio', { p_studio: studioB, p_months: 5 })).error, 'inne okresy niż 1/12 mies. odrzucone');

  // ---------- 7. notatki, blokada, ogłoszenie ----------
  ok(!(await A.c.rpc('admin_set_notes', { p_studio: studioB, p_notes: 'Zadzwonić w piątek' })).error, 'notatka o studiu zapisana');
  ok((await A.c.rpc('admin_list_studios')).data.find((r) => r.id === studioB).notes === 'Zadzwonić w piątek', 'notatka widoczna w panelu');
  ok((await B.c.from('studio_admin_notes').select('*')).data === null || (await B.c.from('studio_admin_notes').select('*')).data.length === 0, 'studio nie widzi notatek administratora');
  ok(!(await A.c.rpc('admin_set_blocked', { p_studio: studioB, p_blocked: true })).error, 'Zablokuj studio');
  ok((await B.c.rpc('my_studio')).data.active === false && (await booking(slug)).status === 403, 'zablokowane: tylko odczyt i brak rezerwacji');
  ok(!!(await B.c.from('cars').insert({ data: { make: 'X' } })).error, 'zablokowane: zapis zablokowany przez bazę');
  ok(!(await A.c.rpc('admin_set_blocked', { p_studio: studioB, p_blocked: false })).error && (await B.c.rpc('my_studio')).data.active, 'Odblokuj studio');

  const annTitle = `Test ogłoszenia ${ts}`;
  ok(!(await A.c.rpc('admin_set_announcement', { p_title: annTitle, p_body: 'Nowa funkcja!' })).error, 'ogłoszenie opublikowane');
  ok((await B.c.from('announcements').select('title').eq('active', true)).data.some((a) => a.title === annTitle), 'ogłoszenie widoczne w aplikacji studia');
  ok(!!(await B.c.rpc('admin_set_announcement', { p_title: 'hack', p_body: 'hack' })).error, 'studio nie opublikuje ogłoszenia');
  await A.c.rpc('admin_set_announcement', { p_title: '', p_body: '' });
  ok((await B.c.from('announcements').select('id').eq('active', true)).data.length === 0, 'ogłoszenie wyłączone');

  // ---------- 8. ARC (studio administratora) działa normalnie ----------
  const arc = (await A.c.rpc('my_studio')).data;
  ok(arc.slug === 'arc-detailing' && arc.active && arc.plan === 'lifetime' && arc.is_admin, 'ARC Detailing: bezterminowo, administrator');
  ok((await j(await fetch(`${F}/public?action=config`))).body.studio.slug === 'arc-detailing', 'stary link /umow/ bez parametru prowadzi do ARC Detailing');
} finally {
  if (studioB) {
    // pliki – przez API Storage (SQL nie może usuwać plików), potem studio (reszta usuwa się kaskadowo)
    for (const bucket of ['photos', 'logos']) {
      const files = await sql(`select name from storage.objects where bucket_id = '${bucket}' and name like '${studioB}/%'`).catch(() => []);
      if (files.length) {
        await fetch(`${URL_}/storage/v1/object/${bucket}`, {
          method: 'DELETE',
          headers: { apikey: E.SERVICE_KEY, Authorization: `Bearer ${E.SERVICE_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ prefixes: files.map((f) => f.name) }),
        });
      }
    }
    await sql(`delete from public.studios where id = '${studioB}'`).catch((e) => console.error(e.message));
  }
  if (userB) await fetch(`${URL_}/auth/v1/admin/users/${userB}`, { method: 'DELETE', headers: { apikey: E.SERVICE_KEY, Authorization: `Bearer ${E.SERVICE_KEY}` } });
  await sql(`delete from public.feedback where message like 'Test pomysłu %'; delete from public.request_log where created_at >= '${startedAt}';`).catch(() => {});
  console.log('(studio testowe usunięte)');
}
console.log(`\nWSZYSTKO OK – ${pass} sprawdzeń wielu studiów`);

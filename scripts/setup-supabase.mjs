// Jednorazowa konfiguracja Supabase przez Management API (uruchamiane lokalnie, NIE w przeglądarce).
// Wymaga zmiennych środowiskowych (nie zapisuj ich w repozytorium):
//   SUPABASE_ACCESS_TOKEN, PROJECT_REF, OWNER_EMAIL, RESEND_API_KEY,
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, [EMAIL_FROM], [PUBLIC_BASE_URL], [STEP]
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const E = process.env;
const ref = E.PROJECT_REF;
const token = E.SUPABASE_ACCESS_TOKEN;
const base = (E.PUBLIC_BASE_URL || 'https://arc-app.arcdetailing.pl/').replace(/\/?$/, '/');
if (!ref || !token) throw new Error('Brak PROJECT_REF / SUPABASE_ACCESS_TOKEN');
const steps = (E.STEP || 'keys,sql,owner,auth,secrets,functions,cron').split(',');

async function mgmt(path, opts = {}) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const sql = (query) => mgmt('/database/query', { method: 'POST', body: JSON.stringify({ query }) });
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// 1. klucze projektu
const keys = await mgmt('/api-keys?reveal=true');
const anon = keys.find((k) => k.name === 'anon')?.api_key;
const service = keys.find((k) => k.name === 'service_role')?.api_key;
if (steps.includes('keys')) {
  let cfg = readFileSync('src/config.js', 'utf8');
  cfg = cfg.replace(/SUPABASE_URL = '.*?'/, `SUPABASE_URL = 'https://${ref}.supabase.co'`).replace(/SUPABASE_ANON_KEY = '.*?'/, `SUPABASE_ANON_KEY = '${anon}'`);
  writeFileSync('src/config.js', cfg);
  console.log('✓ klucz publiczny (anon) zapisany w src/config.js');
}

// 2. schemat bazy + RLS + Storage
if (steps.includes('sql')) {
  await sql(readFileSync('supabase/migrations/001_init.sql', 'utf8'));
  console.log('✓ tabele, reguły RLS, kubełek zdjęć');
}

// 3. właściciel: wpis w app_owner + konto użytkownika
if (steps.includes('owner')) {
  if (!E.OWNER_EMAIL) throw new Error('Brak OWNER_EMAIL');
  await sql(`insert into public.app_owner(email) values (${lit(E.OWNER_EMAIL.toLowerCase())}) on conflict do nothing;`);
  const r = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email: E.OWNER_EMAIL, email_confirm: true }),
  });
  const out = await r.json();
  if (!r.ok && !/already/i.test(JSON.stringify(out))) throw new Error(JSON.stringify(out));
  console.log('✓ właściciel:', E.OWNER_EMAIL);
}

// 4. logowanie: tylko istniejące konto, e-mail z kodem przez SMTP Resend
if (steps.includes('auth')) {
  const tpl = readFileSync('supabase/templates/login.html', 'utf8');
  await mgmt('/config/auth', {
    method: 'PATCH',
    body: JSON.stringify({
      site_url: base,
      uri_allow_list: `${base}**,http://localhost:5173/**`,
      disable_signup: true,
      mailer_otp_exp: 900,
      mailer_subjects_magic_link: 'DetailDesk – kod logowania: {{ .Token }}',
      mailer_templates_magic_link_content: tpl,
      ...(E.RESEND_API_KEY
        ? {
            smtp_host: 'smtp.resend.com',
            smtp_port: '465',
            smtp_user: 'resend',
            smtp_pass: E.RESEND_API_KEY,
            smtp_admin_email: (E.EMAIL_FROM || 'onboarding@resend.dev').replace(/.*<|>.*/g, ''),
            smtp_sender_name: 'DetailDesk',
            rate_limit_email_sent: 30,
          }
        : {}),
    }),
  });
  console.log('✓ logowanie (kod + link), rejestracja wyłączona');
}

// 5. sekrety funkcji (tylko w Supabase, nigdy w kodzie strony)
const cronSecret = E.CRON_SECRET || randomBytes(24).toString('hex');
if (steps.includes('secrets')) {
  const secrets = {
    OWNER_EMAIL: E.OWNER_EMAIL,
    RESEND_API_KEY: E.RESEND_API_KEY,
    EMAIL_FROM: E.EMAIL_FROM || 'ARC Detailing <onboarding@resend.dev>',
    VAPID_PUBLIC_KEY: E.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: E.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: `mailto:${E.OWNER_EMAIL}`,
    PUBLIC_BASE_URL: base,
    CRON_SECRET: cronSecret,
  };
  await mgmt('/secrets', { method: 'POST', body: JSON.stringify(Object.entries(secrets).filter(([, v]) => v).map(([name, value]) => ({ name, value }))) });
  console.log('✓ sekrety:', Object.keys(secrets).join(', '));
}

// 6. funkcje Edge
if (steps.includes('functions')) {
  for (const fn of ['public', 'owner', 'cron']) {
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'functions', 'deploy', fn, '--project-ref', ref, '--no-verify-jwt', '--use-api', '--yes'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...E, SUPABASE_ACCESS_TOKEN: token },
    });
    console.log('✓ funkcja', fn);
  }
}

// 7. zadanie cykliczne: codziennie 16:00 UTC (17:00/18:00 w Polsce) – przypomnienia o jutrzejszych wizytach
if (steps.includes('cron')) {
  await sql(`create extension if not exists pg_cron; create extension if not exists pg_net;`);
  await sql(`select cron.unschedule('detaildesk-reminders') where exists (select 1 from cron.job where jobname = 'detaildesk-reminders');`);
  await sql(
    `select cron.schedule('detaildesk-reminders', '0 16 * * *', $$ select net.http_post(url := 'https://${ref}.supabase.co/functions/v1/cron', headers := jsonb_build_object('content-type','application/json','x-cron-secret',${lit(cronSecret)}), body := '{}'::jsonb) $$);`
  );
  console.log('✓ przypomnienia dzień przed wizytą (pg_cron, codziennie 16:00 UTC)');
}

writeFileSync(E.OUT_FILE || '.deploy-out.json', JSON.stringify({ ref, cronSecret, service }, null, 2));
console.log('Gotowe.');

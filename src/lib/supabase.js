import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, FUNCTIONS_URL, SITE_URL } from '../config.js';
import { authStorage, requestPersistentStorage } from './authStorage.js';

requestPersistentStorage();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true, // sesja zostaje po zamknięciu aplikacji (odświeżana automatycznie)
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: authStorage, // domyślny klucz – obecne sesje zostają zachowane
  },
});

// wywołanie funkcji tylko dla właściciela (z tokenem sesji)
export async function ownerCall(body) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`${FUNCTIONS_URL}/owner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${data.session?.access_token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.ok) throw new Error(out.error || `Błąd ${r.status}`);
  return out;
}

// publiczne API (strony klienta)
export async function publicGet(params) {
  const r = await fetch(`${FUNCTIONS_URL}/public?${new URLSearchParams(params)}`);
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.ok) throw Object.assign(new Error(out.error || `Błąd ${r.status}`), { status: r.status });
  return out;
}
export async function publicPost(action, body) {
  const r = await fetch(`${FUNCTIONS_URL}/public?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.ok) throw Object.assign(new Error(out.error || 'Nie udało się wysłać'), { errors: out.errors, status: r.status });
  return out;
}

export const clientJobUrl = (token) => `${SITE_URL}zlecenie/?t=${token}`;

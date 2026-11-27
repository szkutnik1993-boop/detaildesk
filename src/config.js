// Publiczna konfiguracja – te wartości są jawne z założenia (widać je w każdej przeglądarce).
// Dostęp do danych chronią reguły RLS w bazie; klucze tajne są wyłącznie w Supabase Secrets.
export const SUPABASE_URL = 'https://xljidczanjvuxeulvbjc.supabase.co';
export const SUPABASE_ANON_KEY = '__ANON_KEY__';
export const VAPID_PUBLIC_KEY = 'BLbPpVaRDgw1SPF8cnqmCeA_brGXR4BBE8DYNUVC4mDI0VJ63y5Byxd_wUxwASvhiOdBW6c-WDgwIuyTM8EONvU';
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

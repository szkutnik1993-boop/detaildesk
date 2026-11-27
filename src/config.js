// Publiczna konfiguracja – te wartości są jawne z założenia (widać je w każdej przeglądarce).
// Dostęp do danych chronią reguły RLS w bazie; klucze tajne są wyłącznie w Supabase Secrets.
export const SUPABASE_URL = 'https://xljidczanjvuxeulvbjc.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsamlkY3phbmp2dXhldWx2YmpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU3NDY2MzUsImV4cCI6MjExMTMyMjYzNX0.WpANde8ElY2wbUclxsuj-K2qDoUrAFSOA8VG5BLQJio';
export const VAPID_PUBLIC_KEY = 'BLbPpVaRDgw1SPF8cnqmCeA_brGXR4BBE8DYNUVC4mDI0VJ63y5Byxd_wUxwASvhiOdBW6c-WDgwIuyTM8EONvU';
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

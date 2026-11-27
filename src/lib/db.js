// Warstwa danych: Supabase (Postgres + Storage). Rekordy przechowywane jako dokumenty JSON (kolumna data).
import { supabase } from './supabase.js';

export const TABLES = ['cars', 'jobs', 'quotes', 'protocols'];

export function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const toDoc = (row) => ({ ...row.data, id: row.id, ...(row.token ? { token: row.token } : {}) });

function check(error) {
  if (error) throw new Error(error.message || String(error));
}

export async function fetchTable(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order('created_at').range(from, from + 999);
    check(error);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out.map(toDoc);
}

export async function upsertDoc(table, doc) {
  const { id, token, ...data } = doc;
  const { data: row, error } = await supabase
    .from(table)
    .upsert({ id, data, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single();
  check(error);
  return toDoc(row);
}

export async function deleteDoc(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  check(error);
}

export async function getMeta(key, fallback) {
  const { data, error } = await supabase.from('meta').select('value').eq('key', key).maybeSingle();
  check(error);
  return data ? data.value : fallback;
}

export async function setMeta(key, value) {
  // studio_id uzupełnia baza (domyślnie studio zalogowanego użytkownika)
  const { error } = await supabase.from('meta').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'studio_id,key' });
  check(error);
}

// studio zalogowanego użytkownika (+ status abonamentu, rola administratora)
export async function myStudio() {
  const { data, error } = await supabase.rpc('my_studio');
  check(error);
  return data;
}

export async function updateMyStudio({ name, emailFromName, logoUrl } = {}) {
  const { error } = await supabase.rpc('update_my_studio', { p_name: name ?? null, p_email_from_name: emailFromName ?? null, p_logo_url: logoUrl ?? null });
  check(error);
}

// logo: publiczny kubełek „logos/<studio>/logo-<czas>.png” (widoczne na stronie rezerwacji i w e-mailach)
export async function uploadLogo(blob, studioId) {
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${studioId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('logos').upload(path, blob, { contentType: blob.type, upsert: true });
  check(error);
  return supabase.storage.from('logos').getPublicUrl(path).data.publicUrl;
}

// --- administrator platformy ---
export async function adminListStudios() {
  const { data, error } = await supabase.rpc('admin_list_studios');
  check(error);
  return data;
}
export async function adminExtendStudio(studioId, months, amountCents = null) {
  const { data, error } = await supabase.rpc('admin_extend_studio', { p_studio: studioId, p_months: months, p_amount_cents: amountCents });
  check(error);
  return data;
}
export async function adminListFeedback() {
  const { data, error } = await supabase.rpc('admin_list_feedback');
  check(error);
  return data;
}
export async function adminSetFeedbackStatus(id, status) {
  const { error } = await supabase.rpc('admin_set_feedback_status', { p_id: id, p_status: status });
  check(error);
}
export async function adminListPayments() {
  const { data, error } = await supabase.rpc('admin_list_payments');
  check(error);
  return data;
}
export async function adminSetBlocked(studioId, blocked) {
  const { error } = await supabase.rpc('admin_set_blocked', { p_studio: studioId, p_blocked: blocked });
  check(error);
}
export async function adminSetNotes(studioId, notes) {
  const { error } = await supabase.rpc('admin_set_notes', { p_studio: studioId, p_notes: notes });
  check(error);
}
export async function adminSetAnnouncement(title, body) {
  const { error } = await supabase.rpc('admin_set_announcement', { p_title: title, p_body: body });
  check(error);
}
export async function myFeedback() {
  const { data, error } = await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(20);
  check(error);
  return data;
}

// --- zdjęcia (prywatny kubełek „photos”, folder = ID studia) ---
let photoPrefix = '';
export const setPhotoPrefix = (studioId) => {
  photoPrefix = studioId ? `${studioId}/` : '';
};
export async function uploadPhoto(blob) {
  const d = new Date();
  const path = `${photoPrefix}${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${uid()}.jpg`;
  const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  check(error);
  return path;
}

export async function deletePhoto(path) {
  const { error } = await supabase.storage.from('photos').remove([path]);
  check(error);
}

export async function signedUrl(path, seconds = 3600 * 12) {
  const { data, error } = await supabase.storage.from('photos').createSignedUrl(path, seconds);
  check(error);
  return data.signedUrl;
}

// --- kopia zapasowa (JSON, bez plików zdjęć – te są w Storage) ---
export async function exportAll() {
  const data = {};
  for (const t of TABLES) {
    const { data: rows, error } = await supabase.from(t).select('*');
    check(error);
    data[t] = rows;
  }
  const { data: meta, error } = await supabase.from('meta').select('*');
  check(error);
  data.meta = meta;
  return { app: 'detaildesk', version: 2, exportedAt: new Date().toISOString(), data };
}

export async function importAll(backup) {
  if (!backup || backup.app !== 'detaildesk' || !backup.data) throw new Error('To nie jest plik kopii DetailDesk.');
  if (backup.version !== 2) throw new Error('Ta kopia pochodzi ze starej wersji aplikacji.');
  for (const t of TABLES) {
    const rows = (backup.data[t] || []).map(({ studio_id, ...r }) => r); // zawsze do studia zalogowanego użytkownika
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from(t).upsert(rows.slice(i, i + 200), { onConflict: 'id' });
      check(error);
    }
  }
  if (backup.data.meta?.length) {
    const { error } = await supabase.from('meta').upsert(backup.data.meta.map(({ studio_id, ...r }) => r), { onConflict: 'studio_id,key' });
    check(error);
  }
}

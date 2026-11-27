// Trwałe przechowywanie sesji logowania: localStorage + kopia w IndexedDB.
// Na iPhonie (aplikacja z ekranu początkowego) chroni przed utratą sesji, gdy jedna z pamięci zostanie wyczyszczona.
import { openDB } from 'idb';

let dbp;
const idb = () => (dbp ||= openDB('detaildesk-auth', 1, { upgrade: (d) => d.createObjectStore('kv') }).catch(() => null));

const ls = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* brak miejsca / tryb prywatny */
    }
  },
  del: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignoruj */
    }
  },
};

export const authStorage = {
  async getItem(key) {
    const v = ls.get(key);
    if (v) return v;
    const db = await idb();
    const backup = db ? await db.get('kv', key).catch(() => null) : null;
    if (backup) ls.set(key, backup); // odtwórz z kopii
    return backup ?? null;
  },
  async setItem(key, value) {
    ls.set(key, value);
    const db = await idb();
    if (db) await db.put('kv', value, key).catch(() => {});
  },
  async removeItem(key) {
    ls.del(key);
    const db = await idb();
    if (db) await db.delete('kv', key).catch(() => {});
  },
};

// poproś system o trwałe przechowywanie danych strony
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}

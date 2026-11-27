import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TABLES, deleteDoc, deletePhoto, fetchTable, getMeta, myStudio, setMeta, setPhotoPrefix, signedUrl, uid, uploadPhoto, upsertDoc } from './lib/db.js';
import { supabase } from './lib/supabase.js';
import { mergeSettings } from './lib/defaults.js';
import { nowISO } from './lib/dates.js';
import { compressImage, downloadBlob, openBlob, shareOrDownload } from './lib/utils.js';
import Icon from './components/Icon.jsx';

const DataCtx = createContext(null);
export const READ_ONLY_MSG = 'Okres próbny się skończył – aplikacja działa w trybie tylko do odczytu. Skontaktuj się, żeby przedłużyć.';
const UICtx = createContext(null);

export function DataProvider({ children, login }) {
  const [session, setSession] = useState(undefined); // undefined = sprawdzam
  const [owner, setOwner] = useState(null);
  const [studio, setStudio] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    try {
      const [cars, jobs, quotes, protocols] = await Promise.all(TABLES.map(fetchTable));
      const [settings, reminderLog, lastBackup] = await Promise.all([getMeta('settings', null), getMeta('reminderLog', {}), getMeta('lastBackup', null)]);
      setData({ cars, jobs, quotes, protocols, settings: mergeSettings(settings), reminderLog: reminderLog || {}, lastBackup });
      setError(null);
    } catch (e) {
      console.error(e);
      setError(e.message);
    }
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) {
      setData(null);
      setOwner(null);
      return;
    }
    let alive = true;
    myStudio()
      .then((st) => {
        if (!alive) return;
        const ok = !!st?.id;
        setStudio(st);
        setPhotoPrefix(st?.id);
        setOwner(ok);
        if (ok) load();
      })
      .catch((e) => setError(e.message));
    // na żywo: nowe zapytania / zmiany zleceń
    const ch = supabase
      .channel('jobs-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => load())
      .subscribe();
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      supabase.removeChannel(ch);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [userId, load]);

  const dataRef = useRef(data);
  dataRef.current = data;
  const studioRef = useRef(studio);
  studioRef.current = studio;
  // tryb tylko do odczytu po wygaśnięciu okresu próbnego (baza i tak blokuje zapis – to tylko czytelny komunikat)
  const guard = () => {
    if (studioRef.current && studioRef.current.active === false) throw new Error(READ_ONLY_MSG);
  };

  const api = useMemo(
    () => ({
      reload: load,
      async refreshStudio() {
        const st = await myStudio();
        setStudio(st);
        return st;
      },
      async save(table, obj) {
        guard();
        const o = { ...obj };
        if (!o.id) o.id = uid();
        if (!o.createdAt) o.createdAt = nowISO();
        o.updatedAt = nowISO();
        const saved = await upsertDoc(table, o);
        setData((d) => (d ? { ...d, [table]: [...d[table].filter((x) => x.id !== saved.id), saved] } : d));
        return saved;
      },
      async remove(table, id) {
        guard();
        await deleteDoc(table, id);
        setData((d) => (d ? { ...d, [table]: d[table].filter((x) => x.id !== id) } : d));
      },
      async saveSettings(settings) {
        guard();
        await setMeta('settings', settings);
        setData((d) => ({ ...d, settings: mergeSettings(settings) }));
      },
      async logReminder(id, action) {
        if (studioRef.current?.active === false) return;
        const log = { ...(dataRef.current?.reminderLog || {}), [id]: { action, at: nowISO() } };
        setData((d) => ({ ...d, reminderLog: log }));
        await setMeta('reminderLog', log);
      },
      async markBackup() {
        if (studioRef.current?.active === false) return;
        const at = nowISO();
        await setMeta('lastBackup', at);
        setData((d) => ({ ...d, lastBackup: at }));
      },
      async addPhoto(file) {
        guard();
        const blob = await compressImage(file);
        return uploadPhoto(blob);
      },
      async removePhoto(path) {
        photoCache.delete(path);
        await deletePhoto(path).catch(() => {});
      },
      signOut: () => supabase.auth.signOut(),
    }),
    [load]
  );

  if (session === undefined) return <Splash />;
  if (!session) return login;
  if (owner === false)
    return (
      <Splash>
        <p className="muted" style={{ maxWidth: 300, textAlign: 'center' }}>To konto ({session.user.email}) nie jest przypisane do żadnego studia.</p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Wyloguj</button>
      </Splash>
    );
  if (!data)
    return (
      <Splash>
        {error ? (
          <>
            <p className="warn" style={{ maxWidth: 320, textAlign: 'center' }}>Nie mogę połączyć się z bazą: {error}</p>
            <button className="btn" onClick={load}>Spróbuj ponownie</button>
          </>
        ) : (
          <div className="spinner" />
        )}
      </Splash>
    );

  return <DataCtx.Provider value={{ data, api, session, studio, readOnly: studio?.active === false }}>{children}</DataCtx.Provider>;
}

export function Splash({ children }) {
  return (
    <div className="splash">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div className="brand">ARC<span>DETAILING</span></div>
        {children}
      </div>
    </div>
  );
}

export const useData = () => useContext(DataCtx);

// --- zdjęcia: podpisane (czasowe) linki do prywatnego Storage ---
const photoCache = new Map(); // path -> { url, exp }
export async function photoUrl(path) {
  const c = photoCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const url = await signedUrl(path);
  photoCache.set(path, { url, exp: Date.now() + 11 * 3600 * 1000 });
  return url;
}
export async function loadPhoto(path) {
  // jako dataURL – do PDF
  const r = await fetch(await photoUrl(path));
  const blob = await r.blob();
  return await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(blob);
  });
}
export function usePhoto(path) {
  const [url, setUrl] = useState(() => photoCache.get(path)?.url || null);
  useEffect(() => {
    let alive = true;
    if (path) photoUrl(path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

// --- UI: powiadomienia, arkusz z gotowym plikiem, podgląd zdjęć ---
export function UIProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [file, setFile] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [busy, setBusy] = useState(null);
  const timer = useRef();

  const ui = useMemo(
    () => ({
      toast(msg) {
        clearTimeout(timer.current);
        setToast(msg);
        timer.current = setTimeout(() => setToast(null), 2800);
      },
      showFile: setFile,
      showPhoto: setViewer,
      async run(label, fn) {
        setBusy(label);
        try {
          return await fn();
        } catch (e) {
          console.error(e);
          alert(`Błąd: ${e.message || e}`);
        } finally {
          setBusy(null);
        }
      },
    }),
    []
  );

  return (
    <UICtx.Provider value={ui}>
      {children}
      {toast && <div className="toast">{toast}</div>}
      {busy && (
        <div className="overlay center">
          <div className="spinner" />
          <div className="muted" style={{ marginTop: 14 }}>{busy}</div>
        </div>
      )}
      {file && (
        <div className="overlay sheet-wrap" onClick={() => setFile(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="row gap" style={{ alignItems: 'center', marginBottom: 6 }}>
              <div className="file-badge">{file.filename?.endsWith('.json') ? 'JSON' : 'PDF'}</div>
              <div style={{ minWidth: 0 }}>
                <div className="h3">{file.title}</div>
                <div className="muted small ellipsis">{file.filename}</div>
              </div>
            </div>
            <button className="btn primary block" onClick={() => shareOrDownload(file.blob, file.filename, file.title)}>
              <Icon name="share" /> Wyślij / udostępnij
            </button>
            <button className="btn block" onClick={() => openBlob(file.blob)}>
              <Icon name="file" /> Podgląd
            </button>
            <button className="btn block ghost" onClick={() => downloadBlob(file.blob, file.filename)}>
              <Icon name="download" /> Zapisz plik
            </button>
            <button className="btn block ghost" onClick={() => setFile(null)}>Zamknij</button>
          </div>
        </div>
      )}
      {viewer && (
        <div className="overlay viewer" onClick={() => setViewer(null)}>
          <img src={viewer.src} alt="" />
          {viewer.caption && <div className="viewer-caption">{viewer.caption}</div>}
          <button className="icon-btn viewer-close" aria-label="Zamknij"><Icon name="x" /></button>
        </div>
      )}
    </UICtx.Provider>
  );
}

export const useUI = () => useContext(UICtx);

import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field, Header, Section } from '../components/ui.jsx';
import { useData, useUI } from '../store.jsx';
import { DEFAULT_SETTINGS, structuredCloneSafe } from '../lib/defaults.js';
import { exportAll, importAll, uid } from '../lib/db.js';
import { daysBetween, fmtDateTime, todayISO } from '../lib/dates.js';
import { fileToDataURL, parseNum } from '../lib/utils.js';
import { currentSubscription, disablePush, enablePush, isStandalone } from '../lib/push.js';
import { ownerCall } from '../lib/supabase.js';

export default function Settings() {
  const { data, api, session } = useData();
  const ui = useUI();
  const [s, setS] = useState(() => structuredCloneSafe(data.settings));
  const [dirty, setDirty] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const importRef = useRef();
  const logoRef = useRef();

  useEffect(() => {
    currentSubscription().then((x) => setPushOn(!!x)).catch(() => {});
  }, []);

  const upd = (fn) => {
    setS((prev) => {
      const next = structuredCloneSafe(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    const clean = structuredCloneSafe(s);
    clean.services = clean.services.filter((x) => x.name.trim()).map((x) => ({ ...x, price: parseNum(x.price) }));
    clean.sizes = clean.sizes.map((x) => ({ ...x, mult: parseNum(x.mult, 1) }));
    clean.paints = clean.paints.map((x) => ({ ...x, mult: parseNum(x.mult, 1) }));
    clean.rounding = parseNum(clean.rounding, 10);
    clean.paintThreshold = parseNum(clean.paintThreshold, 250);
    clean.reminders.coatingMonths = parseNum(clean.reminders.coatingMonths, 6);
    clean.reminders.quoteFollowupDays = parseNum(clean.reminders.quoteFollowupDays, 5);
    await api.saveSettings(clean);
    setS(clean);
    setDirty(false);
    ui.toast('Ustawienia zapisane');
  };

  const doExport = () =>
    ui.run('Przygotowuję kopię…', async () => {
      const backup = await exportAll();
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const name = `detaildesk-kopia-${todayISO()}.json`;
      await api.markBackup();
      ui.showFile({ blob, filename: name, title: 'Kopia zapasowa DetailDesk' });
    });

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await ui.run('Wczytuję kopię…', async () => {
      const backup = JSON.parse(await file.text());
      const d = backup.data || {};
      const msg = `Kopia z ${backup.exportedAt ? fmtDateTime(backup.exportedAt) : '?'}:\n${(d.cars || []).length} aut, ${(d.jobs || []).length} zleceń, ${(d.quotes || []).length} wycen, ${(d.photos || []).length} zdjęć.\n\nRekordy z kopii nadpiszą rekordy o tych samych identyfikatorach. Kontynuować?`;
      if (!confirm(msg)) return;
      await importAll(backup);
      await api.reload();
      ui.toast('Kopia przywrócona ✓');
      setTimeout(() => window.location.reload(), 600);
    });
  };

  const setLogo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const url = await fileToDataURL(f);
    if (!/^data:image\/(png|jpe?g)/.test(url)) return alert('Logo musi być w formacie PNG lub JPG.');
    upd((n) => (n.studio.logo = url));
  };

  const backupAge = data.lastBackup ? daysBetween(data.lastBackup.slice(0, 10), todayISO()) : null;
  const bookingUrl = new URL('umow/', document.baseURI.replace(/#.*$/, '')).toString();
  const togglePush = () =>
    ui.run(pushOn ? 'Wyłączam…' : 'Włączam powiadomienia…', async () => {
      if (pushOn) await disablePush();
      else await enablePush();
      setPushOn(!pushOn);
      ui.toast(pushOn ? 'Powiadomienia wyłączone' : 'Powiadomienia włączone ✓');
    });
  const testPush = () => ui.run('Wysyłam test…', async () => { const r = await ownerCall({ action: 'test-push' }); ui.toast(`Wysłano na ${r.sent} z ${r.total} urządzeń`); });

  return (
    <div className="screen">
      <Header title="Ustawienia" backTo="/" />

      <Section title="Link dla klientów">
        <div className="card form">
          <div className="small muted">Stały link do formularza zapytania – wstaw na stronę www, Instagram, Google.</div>
          <div className="link-box">{bookingUrl}</div>
          <div className="row gap">
            <button className="btn grow" onClick={() => navigator.clipboard.writeText(bookingUrl).then(() => ui.toast('Skopiowano link'))}>Kopiuj</button>
            <a className="btn grow" href={bookingUrl} target="_blank" rel="noreferrer">Otwórz</a>
          </div>
        </div>
      </Section>

      <Section title="Powiadomienia push">
        <div className="card form">
          <div className="small muted">
            Powiadomienie o nowym zapytaniu na tym urządzeniu.{!isStandalone() && /iPhone|iPad/.test(navigator.userAgent) ? ' Najpierw dodaj aplikację do ekranu początkowego (Udostępnij → Do ekranu początkowego) i otwórz ją z ikony.' : ''}
          </div>
          <button className={pushOn ? 'btn block' : 'btn block primary'} onClick={togglePush}>
            <Icon name="bell" /> {pushOn ? 'Wyłącz powiadomienia na tym urządzeniu' : 'Włącz powiadomienia na tym urządzeniu'}
          </button>
          {pushOn && <button className="btn block ghost" onClick={testPush}>Wyślij powiadomienie testowe</button>}
        </div>
      </Section>

      <Section title="Kopia zapasowa">
        <div className="card form">
          <p className="small muted" style={{ margin: 0 }}>
            Dane są w chmurze (Supabase, serwery we Frankfurcie). Dodatkowo możesz pobrać kopię danych (bez plików zdjęć) i zapisać ją np. w iCloud Drive.
          </p>
          <div className="small">
            Ostatnia kopia: <strong className={backupAge === null || backupAge >= 14 ? 'warn' : 'gold'}>{data.lastBackup ? `${fmtDateTime(data.lastBackup)} (${backupAge} dni temu)` : 'nigdy'}</strong>
          </div>
          <button className="btn primary block" onClick={doExport}>
            <Icon name="download" /> Eksportuj kopię (plik)
          </button>
          <button className="btn block" onClick={() => importRef.current.click()}>
            <Icon name="upload" /> Importuj kopię z pliku
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={doImport} />
        </div>
      </Section>

      <Section title="Studio">
        <div className="card form">
          <div className="grid2">
            <Field label="Nazwa studia">
              <input value={s.studio.name} onChange={(e) => upd((n) => (n.studio.name = e.target.value))} />
            </Field>
            <Field label="Podpis w SMS">
              <input value={s.studio.signature} onChange={(e) => upd((n) => (n.studio.signature = e.target.value))} />
            </Field>
            <Field label="Telefon (na PDF)">
              <input type="tel" value={s.studio.phone} onChange={(e) => upd((n) => (n.studio.phone = e.target.value))} />
            </Field>
            <Field label="E-mail (na PDF)">
              <input type="email" value={s.studio.email} onChange={(e) => upd((n) => (n.studio.email = e.target.value))} />
            </Field>
            <Field label="Strona www">
              <input value={s.studio.web} onChange={(e) => upd((n) => (n.studio.web = e.target.value))} />
            </Field>
            <Field label="Pełna nazwa firmy (RODO)">
              <input value={s.studio.company} onChange={(e) => upd((n) => (n.studio.company = e.target.value))} placeholder="np. ARC Detailing Tomasz …" />
            </Field>
            <Field label="NIP">
              <input value={s.studio.nip} onChange={(e) => upd((n) => (n.studio.nip = e.target.value))} />
            </Field>
            <Field label="Adres studia">
              <input value={s.studio.address} onChange={(e) => upd((n) => (n.studio.address = e.target.value))} />
            </Field>
          </div>
          <div className="field">
            <span className="field-label">Logo na PDF (PNG/JPG, jasne – na ciemnym pasku)</span>
            {s.studio.logo && <img src={s.studio.logo} alt="Logo" className="logo-preview" />}
            <div className="row gap">
              <button className="btn grow" onClick={() => logoRef.current.click()}>
                <Icon name="image" /> {s.studio.logo ? 'Zmień logo' : 'Dodaj logo'}
              </button>
              {s.studio.logo && (
                <button className="btn" onClick={() => upd((n) => (n.studio.logo = null))}>Usuń</button>
              )}
            </div>
            <input ref={logoRef} type="file" accept="image/png,image/jpeg" hidden onChange={setLogo} />
            {!s.studio.logo && <span className="field-hint">Bez logo PDF ma złoto-biały napis z nazwą studia.</span>}
          </div>
        </div>
      </Section>

      <Section title="Cennik (cena bazowa – małe auto)">
        <div className="card form">
          {s.services.map((x, i) => (
            <div key={x.id} className="price-row">
              <div className="line">
                <input className="grow" value={x.name} onChange={(e) => upd((n) => (n.services[i].name = e.target.value))} />
                <input className="price" inputMode="decimal" value={x.price} onChange={(e) => upd((n) => (n.services[i].price = e.target.value))} />
                <span className="muted">zł</span>
                <button className="icon-btn" aria-label="Usuń" onClick={() => confirm(`Usunąć „${x.name}” z cennika?`) && upd((n) => n.services.splice(i, 1))}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
              <div className="row gap small">
                <label className="check-row sm">
                  <input type="checkbox" checked={!!x.correction} onChange={(e) => upd((n) => (n.services[i].correction = e.target.checked))} /> korekta (stan lakieru)
                </label>
                <label className="check-row sm">
                  <input type="checkbox" checked={!!x.coating} onChange={(e) => upd((n) => (n.services[i].coating = e.target.checked))} /> powłoka (przypomnienie)
                </label>
              </div>
            </div>
          ))}
          <button className="btn block" onClick={() => upd((n) => n.services.push({ id: uid(), name: 'Nowa usługa', price: 0, correction: false, coating: false }))}>
            <Icon name="plus" /> Dodaj usługę
          </button>
          <button
            className="link-btn small"
            onClick={() => confirm('Przywrócić domyślny cennik i mnożniki?') && upd((n) => {
              n.services = structuredCloneSafe(DEFAULT_SETTINGS.services);
              n.sizes = structuredCloneSafe(DEFAULT_SETTINGS.sizes);
              n.paints = structuredCloneSafe(DEFAULT_SETTINGS.paints);
              n.rounding = DEFAULT_SETTINGS.rounding;
            })}
          >
            Przywróć domyślny cennik
          </button>
        </div>
      </Section>

      <Section title="Mnożniki">
        <div className="card form">
          <div className="field-label">Wielkość auta</div>
          {s.sizes.map((x, i) => (
            <div key={x.id} className="line">
              <input className="grow" value={x.name} onChange={(e) => upd((n) => (n.sizes[i].name = e.target.value))} />
              <span className="muted">×</span>
              <input className="price" inputMode="decimal" value={x.mult} onChange={(e) => upd((n) => (n.sizes[i].mult = e.target.value))} />
            </div>
          ))}
          <div className="field-label" style={{ marginTop: 8 }}>Stan lakieru (tylko korekty)</div>
          {s.paints.map((x, i) => (
            <div key={x.id} className="line">
              <input className="grow" value={x.name} onChange={(e) => upd((n) => (n.paints[i].name = e.target.value))} />
              <span className="muted">×</span>
              <input className="price" inputMode="decimal" value={x.mult} onChange={(e) => upd((n) => (n.paints[i].mult = e.target.value))} />
            </div>
          ))}
          <Field label="Zaokrąglenie ceny do (zł)">
            <input inputMode="numeric" value={s.rounding} onChange={(e) => upd((n) => (n.rounding = e.target.value))} />
          </Field>
        </div>
      </Section>

      <Section title="Przypomnienia i protokół">
        <div className="card form">
          <div className="grid2">
            <Field label="Serwis powłoki po (mies.)">
              <input inputMode="numeric" value={s.reminders.coatingMonths} onChange={(e) => upd((n) => (n.reminders.coatingMonths = e.target.value))} />
            </Field>
            <Field label="Wycena bez odpowiedzi po (dni)">
              <input inputMode="numeric" value={s.reminders.quoteFollowupDays} onChange={(e) => upd((n) => (n.reminders.quoteFollowupDays = e.target.value))} />
            </Field>
          </div>
          <Field label="Próg grubości lakieru (µm)" hint="Powyżej tej wartości pole świeci na pomarańczowo.">
            <input inputMode="numeric" value={s.paintThreshold} onChange={(e) => upd((n) => (n.paintThreshold = e.target.value))} />
          </Field>
        </div>
      </Section>

      <Section title="Etapy prac (zdjęcia dla klienta)">
        <div className="card form">
          <Field label="Etapy – oddzielone przecinkami">
            <input value={s.stages.join(', ')} onChange={(e) => upd((n) => (n.stages = e.target.value.split(',').map((x) => x.trim()).filter(Boolean)))} />
          </Field>
        </div>
      </Section>

      <Section title="Szablony SMS">
        <div className="card form">
          <div className="small muted">
            Pola: <code>{'{uslugi}'}</code> <code>{'{cena}'}</code> <code>{'{auto}'}</code> <code>{'{podpis}'}</code> <code>{'{studio}'}</code> <code>{'{miesiace}'}</code>
          </div>
          {[
            ['quote', 'Wycena'],
            ['followup', 'Wycena bez odpowiedzi'],
            ['coating', 'Serwis powłoki'],
            ['confirm', 'Potwierdzenie terminu ({termin}, {link})'],
            ['ready', 'Auto gotowe do odbioru'],
          ].map(([k, l]) => (
            <Field key={k} label={l}>
              <textarea rows={4} value={s.templates[k]} onChange={(e) => upd((n) => (n.templates[k] = e.target.value))} />
            </Field>
          ))}
          <button className="link-btn small" onClick={() => upd((n) => (n.templates = structuredCloneSafe(DEFAULT_SETTINGS.templates)))}>
            Przywróć domyślne szablony
          </button>
        </div>
      </Section>

      <Section title="Konto">
        <div className="card form">
          <div className="small">Zalogowano jako <b>{session.user.email}</b></div>
          <button className="btn block" onClick={() => confirm('Wylogować?') && api.signOut()}>Wyloguj</button>
        </div>
      </Section>
      <div className="small muted center-text" style={{ margin: '24px 0' }}>DetailDesk v2.0 · <a className="gold" href="prywatnosc/" target="_blank" rel="noreferrer">polityka prywatności</a></div>

      {dirty && (
        <div className="save-bar">
          <button className="btn primary block" onClick={save}>
            <Icon name="check" /> Zapisz zmiany
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field, Header, Section } from '../components/ui.jsx';
import { useData, useUI } from '../store.jsx';
import { DEFAULT_SETTINGS, moveItem, normalizeService, structuredCloneSafe } from '../lib/defaults.js';
import { exportAll, importAll, myFeedback, uid, updateMyStudio, uploadLogo } from '../lib/db.js';
import { studioStatus } from '../lib/subscription.js';
import { PLATFORM_CONTACT, bookingUrl as bookingLinkFor } from '../config.js';
import { ExtendNote } from './Onboarding.jsx';
import { go } from '../router.js';
import { daysBetween, fmtDateTime, todayISO } from '../lib/dates.js';
import { fileToDataURL, parseNum } from '../lib/utils.js';
import { currentSubscription, disablePush, enablePush, isStandalone } from '../lib/push.js';
import { ownerCall } from '../lib/supabase.js';

export default function Settings() {
  const { data, api, session, studio, readOnly } = useData();
  const [fromName, setFromName] = useState(studio.email_from_name || studio.name);
  const [fb, setFb] = useState({ kind: 'pomysł', message: '' });
  const [myFb, setMyFb] = useState([]);
  const ui = useUI();
  const [s, setS] = useState(() => structuredCloneSafe(data.settings));
  const [dirty, setDirty] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const importRef = useRef();
  const logoRef = useRef();

  useEffect(() => {
    currentSubscription().then((x) => setPushOn(!!x)).catch(() => {});
    myFeedback().then(setMyFb).catch(() => {});
  }, []);

  const upd = (fn) => {
    setS((prev) => {
      const next = structuredCloneSafe(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const save = () => ui.run('Zapisuję…', saveInner);
  const saveInner = async () => {
    const clean = structuredCloneSafe(s);
    clean.services = clean.services.filter((x) => x.name.trim()).map((x) => normalizeService({ ...x, name: x.name.trim(), description: (x.description || '').trim(), price: parseNum(x.price) }));
    clean.sizes = clean.sizes.map((x) => ({ ...x, mult: parseNum(x.mult, 1) }));
    clean.paints = clean.paints.map((x) => ({ ...x, mult: parseNum(x.mult, 1) }));
    clean.rounding = parseNum(clean.rounding, 10);
    clean.paintThreshold = parseNum(clean.paintThreshold, 250);
    clean.reminders.coatingMonths = parseNum(clean.reminders.coatingMonths, 6);
    clean.reminders.quoteFollowupDays = parseNum(clean.reminders.quoteFollowupDays, 5);
    await api.saveSettings(clean);
    await updateMyStudio({ name: clean.studio.name, emailFromName: fromName });
    await api.refreshStudio();
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
    await ui.run('Wysyłam logo…', async () => {
      const blob = await (await fetch(url)).blob();
      const publicUrl = await uploadLogo(blob, studio.id);
      await updateMyStudio({ logoUrl: publicUrl });
      await api.refreshStudio();
      upd((n) => (n.studio.logo = url));
      ui.toast('Logo zapisane – zapisz zmiany, aby trafiło też do PDF');
    });
  };

  const backupAge = data.lastBackup ? daysBetween(data.lastBackup.slice(0, 10), todayISO()) : null;
  const bookingUrl = bookingLinkFor(studio.slug);
  const sub = studio.blocked ? { label: 'Zablokowane', state: 'expired', daysLeft: 0 } : studioStatus(studio);
  const sendFb = () =>
    ui.run('Wysyłam…', async () => {
      await ownerCall({ action: 'feedback', kind: fb.kind, message: fb.message });
      setFb({ kind: fb.kind, message: '' });
      setMyFb(await myFeedback());
      ui.toast('Dziękuję! Wiadomość wysłana ✓');
    });
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

      <Section title="Abonament">
        <div className="card form">
          <div className="row between">
            <div>
              <div className="h3">{sub.label}</div>
              <div className="small muted">
                {studio.plan === 'lifetime'
                  ? 'Dostęp bezterminowy'
                  : sub.state === 'expired'
                    ? 'Tryb tylko do odczytu – dane są bezpieczne, eksport działa.'
                    : `Aktywne do ${new Date(studio.active_until).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })} · zostało ${sub.daysLeft} dni`}
              </div>
            </div>
            <span className={`pill ${sub.state === 'expired' ? 'st-done' : sub.state === 'trial' ? 'st-planned' : 'st-ready'}`}>{sub.label}</span>
          </div>
          {studio.plan !== 'lifetime' && (
            <a className="btn block" style={{ marginTop: 0 }} href={`mailto:${PLATFORM_CONTACT.email}?subject=${encodeURIComponent('Przedłużenie DetailDesk – ' + studio.name)}`}>
              <Icon name="sms" /> Przedłuż – napisz do mnie
            </a>
          )}
        </div>
      </Section>

      {studio.is_admin && (
        <button className="card list-item admin-entry" onClick={() => go('/admin')}>
          <Icon name="shield" className="gold" />
          <div style={{ flex: 1 }}>
            <div className="h3">Panel administratora</div>
            <div className="small muted">Studia, płatności, pomysły, ogłoszenia</div>
          </div>
          <Icon name="chevron" />
        </button>
      )}

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

      <button className="card list-item" onClick={() => go('/instalacja')}>
        <Icon name="phone" className="gold" />
        <div style={{ flex: 1 }}>
          <div className="h3">Jak zainstalować na telefonie</div>
          <div className="small muted">iPhone, Android (Chrome, Samsung Internet), komputer</div>
        </div>
        <Icon name="chevron" />
      </button>

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
          <button className="btn block" disabled={readOnly} onClick={() => importRef.current.click()}>
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
            <Field label="Nazwa nadawcy e-maili">
              <input value={fromName} onChange={(e) => { setFromName(e.target.value); setDirty(true); }} />
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
            <span className="field-label">Logo (formularz rezerwacji, e-maile, PDF) – PNG/JPG, jasne</span>
            {s.studio.logo && <img src={s.studio.logo} alt="Logo" className="logo-preview" />}
            <div className="row gap">
              <button className="btn grow" onClick={() => logoRef.current.click()}>
                <Icon name="image" /> {s.studio.logo ? 'Zmień logo' : 'Dodaj logo'}
              </button>
              {s.studio.logo && (
                <button className="btn" onClick={() => ui.run('Usuwam…', async () => { await updateMyStudio({ logoUrl: '' }); await api.refreshStudio(); upd((n) => (n.studio.logo = null)); })}>Usuń</button>
              )}
            </div>
            <input ref={logoRef} type="file" accept="image/png,image/jpeg" hidden onChange={setLogo} />
            {!s.studio.logo && <span className="field-hint">Bez logo PDF ma złoto-biały napis z nazwą studia.</span>}
          </div>
        </div>
      </Section>

      <Section title="Cennik (cena bazowa – małe auto)">
        <div className="card form">
          <div className="small muted">
            Kolejność tutaj = kolejność w formularzu klienta. Ukryte usługi nie pojawiają się klientom ani w nowych wycenach, ale zostają w historii zleceń.
          </div>
          {s.services.map((x, i) => (
            <div key={x.id} className={`price-row ${x.hidden ? 'is-hidden' : ''}`}>
              <div className="line">
                <div className="order-btns">
                  <button className="icon-btn sm-icon" aria-label={`Przesuń wyżej: ${x.name}`} disabled={i === 0} onClick={() => upd((n) => (n.services = moveItem(n.services, i, -1)))}>
                    <Icon name="chevron" size={16} style={{ transform: 'rotate(-90deg)' }} />
                  </button>
                  <button className="icon-btn sm-icon" aria-label={`Przesuń niżej: ${x.name}`} disabled={i === s.services.length - 1} onClick={() => upd((n) => (n.services = moveItem(n.services, i, 1)))}>
                    <Icon name="chevron" size={16} style={{ transform: 'rotate(90deg)' }} />
                  </button>
                </div>
                <input className="grow" value={x.name} aria-label="Nazwa usługi" onChange={(e) => upd((n) => (n.services[i].name = e.target.value))} />
                <input className="price" inputMode="decimal" value={x.price} aria-label={`Cena: ${x.name}`} onChange={(e) => upd((n) => (n.services[i].price = e.target.value))} />
                <span className="muted">zł</span>
                <button className="icon-btn" aria-label={`Usuń: ${x.name}`} onClick={() => confirm(`Usunąć „${x.name}” z cennika? (Możesz ją też tylko ukryć.)`) && upd((n) => n.services.splice(i, 1))}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
              <input className="svc-desc" value={x.description || ''} placeholder="Opis dla klienta (opcjonalnie), np. ręczne, 2 wiadra, felgi" aria-label={`Opis: ${x.name}`} onChange={(e) => upd((n) => (n.services[i].description = e.target.value))} />
              <div className="row gap small wrap" style={{ alignItems: 'center' }}>
                <label className="check-row sm">
                  <input type="checkbox" checked={!!x.correction} onChange={(e) => upd((n) => (n.services[i].correction = e.target.checked))} /> liczyć stan lakieru
                </label>
                <label className="check-row sm">
                  przypomnienie po
                  <input
                    className="months"
                    inputMode="numeric"
                    placeholder="–"
                    value={x.reminderMonths ?? ''}
                    aria-label={`Przypomnienie po ilu miesiącach: ${x.name}`}
                    onChange={(e) => upd((n) => (n.services[i].reminderMonths = e.target.value.replace(/\D/g, '') || null))}
                  />
                  mies.
                </label>
                <label className="check-row sm">
                  <input type="checkbox" checked={!!x.hidden} onChange={(e) => upd((n) => (n.services[i].hidden = e.target.checked))} /> ukryj
                </label>
              </div>
            </div>
          ))}
          <button className="btn block" onClick={() => upd((n) => n.services.push({ id: uid(), name: 'Nowa usługa', description: '', price: 0, correction: false, reminderMonths: null, hidden: false }))}>
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
          <ExtendNote />
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
          <Field label="Wycena bez odpowiedzi po (dni)" hint="Zaproszenia po usługach (wosk, sealant, powłoka…) ustawiasz przy każdej usłudze w cenniku.">
            <input inputMode="numeric" value={s.reminders.quoteFollowupDays} onChange={(e) => upd((n) => (n.reminders.quoteFollowupDays = e.target.value))} />
          </Field>
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
            ['refresh', 'Odświeżenie po usłudze – wosk, sealant… ({usluga}, {miesiace})'],
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

      <Section title="Pomysły i uwagi do twórcy aplikacji">
        <div className="card form">
          <div className="small muted">Masz pomysł na usprawnienie, coś nie działa albo brakuje usługi na liście? Napisz – czytam każdą wiadomość.</div>
          <div className="chips" style={{ marginBottom: 0 }}>
            {['pomysł', 'uwaga', 'błąd'].map((k) => (
              <button key={k} className={fb.kind === k ? 'on' : ''} onClick={() => setFb({ ...fb, kind: k })}>{k}</button>
            ))}
          </div>
          <textarea rows={4} value={fb.message} onChange={(e) => setFb({ ...fb, message: e.target.value })} placeholder="Twoja wiadomość…" />
          <button className="btn primary block" style={{ marginTop: 0 }} disabled={fb.message.trim().length < 3} onClick={sendFb}>
            <Icon name="sms" /> Wyślij
          </button>
          {myFb.length > 0 && (
            <div className="fb-list">
              {myFb.map((m) => (
                <div key={m.id} className="fb-item small">
                  <div className="row between"><span className="muted">{fmtDateTime(m.created_at)} · {m.kind}</span><span className="pill">{m.status}</span></div>
                  <div className="pre">{m.message}</div>
                  {m.reply && <div className="reply-box"><b>Odpowiedź:</b> <span className="pre">{m.reply}</span></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Konto">
        <div className="card form">
          <div className="small">Zalogowano jako <b>{session.user.email}</b></div>
          <button className="btn block" onClick={() => confirm('Wylogować?') && api.signOut()}>Wyloguj</button>
        </div>
      </Section>
      <div className="small muted center-text" style={{ margin: '24px 0' }}>DetailDesk v2.0 · <a className="gold" href="prywatnosc/" target="_blank" rel="noreferrer">polityka prywatności</a></div>

      {dirty && !readOnly && (
        <div className="save-bar">
          <button className="btn primary block" onClick={save}>
            <Icon name="check" /> Zapisz zmiany
          </button>
        </div>
      )}
    </div>
  );
}

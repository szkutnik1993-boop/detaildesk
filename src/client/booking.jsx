import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Brand, Footer, studioSlug, withSlug } from './common.jsx';
import Icon from '../components/Icon.jsx';
import { calcQuote, formatMoney } from '../lib/pricing.js';
import { validateRequest } from '../lib/booking.js';
import { addDays, todayISO, fmtDayLong } from '../lib/dates.js';
import { publicGet, publicPost } from '../lib/supabase.js';

const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
const fmtMult = (m) => `×${String(m).replace('.', ',')}`;

function Booking() {
  const [cfg, setCfg] = useState(null);
  const [studio, setStudio] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [f, setF] = useState({
    make: '', model: '', sizeId: '', serviceIds: [], paintId: '',
    slots: [{ date: addDays(todayISO(), 2), time: '09:00' }, { date: addDays(todayISO(), 3), time: '09:00' }],
    name: '', phone: '', email: '', note: '', consent: false, website: '',
  });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [done, setDone] = useState(null);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    publicGet({ action: 'config', ...(studioSlug() ? { s: studioSlug() } : {}) })
      .then((r) => {
        setStudio(r.studio);
        document.title = `Umów wizytę – ${r.studio.name}`;
        if (!r.studio.active) return setCfg(r.config);
        setCfg(r.config);
        setF((x) => ({ ...x, sizeId: r.config.sizes[1]?.id || r.config.sizes[0].id, paintId: r.config.paints[0].id }));
      })
      .catch((e) => setLoadErr(e.message));
  }, []);

  const calc = useMemo(() => (cfg ? calcQuote(f, cfg) : null), [cfg, f]);

  if (loadErr) return <Shell><div className="empty">Nie znaleziono studia lub nie udało się wczytać cennika. Sprawdź link albo odśwież stronę.</div></Shell>;
  if (studio && !studio.active)
    return (
      <Shell studio={{ ...cfg.studio, ...studio }}>
        <div className="c-done">
          <div className="c-done-icon muted-icon"><Icon name="calendar" size={30} /></div>
          <h1>Rezerwacje chwilowo niedostępne</h1>
          <p>Formularz online jest teraz wyłączony.</p>
        </div>
        {cfg.studio.phone && (
          <a className="btn primary block" href={`tel:${cfg.studio.phone.replace(/[^d+]/g, '')}`}><Icon name="phone" /> Zadzwoń do studia: {cfg.studio.phone}</a>
        )}
      </Shell>
    );
  if (!cfg) return <Shell><div className="center-load"><div className="spinner" /></div></Shell>;

  if (done)
    return (
      <Shell studio={{ ...cfg.studio, ...studio }}>
        <div className="c-done">
          <div className="c-done-icon"><Icon name="check" size={34} /></div>
          <h1>Dziękujemy{done.name ? `, ${done.name}` : ''}!</h1>
          <p>Zapytanie zostało wysłane.</p>
        </div>
        <div className="card c-next">
          <div className="h3">Co dalej?</div>
          <p>
            Potwierdzenie terminu otrzymasz e-mailem na <b className="gold">{done.email}</b> – wraz z linkiem do podglądu etapów pracy detailera, na którym na
            bieżąco zobaczysz status i zdjęcia swojego auta.
          </p>
          <p className="small muted">Jeśli nie widzisz wiadomości, sprawdź folder Spam lub Oferty.</p>
        </div>
        <div className="card">
          <div className="kv">
            <div className="full"><span>Usługi</span>{done.items.map((i) => i.name).join(', ')}</div>
            <div className="full"><span>Proponowane terminy</span>{done.slots.map((s) => `${fmtDayLong(s.date)}${s.time ? ', ' + s.time : ''}`).join(' · ')}</div>
            <div><span>Cena orientacyjna</span>ok. {formatMoney(done.total)} zł</div>
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>Cena potwierdzana po oględzinach auta.</div>
        </div>
        {cfg.studio.phone && (
          <a className="btn block" href={`tel:${cfg.studio.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" /> Pilna sprawa? Zadzwoń</a>
        )}
      </Shell>
    );

  const toggle = (id) => set({ serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id] });
  const setSlot = (i, patch) => set({ slots: f.slots.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  const submit = async (e) => {
    e.preventDefault();
    setSendErr(null);
    const v = validateRequest(f, cfg, todayISO());
    setErrors(v.errors);
    if (!v.ok) {
      setTimeout(() => document.querySelector('.c-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    setSending(true);
    try {
      await publicPost(studioSlug() ? `request&s=${encodeURIComponent(studioSlug())}` : 'request', f);
      setDone({ name: f.name.trim().split(' ')[0], email: f.email.trim(), total: calc.total, items: calc.items, slots: f.slots });
      window.scrollTo(0, 0);
    } catch (err) {
      setSending(false);
      if (err.errors) setErrors(err.errors);
      if (err.status === 403) setStudio((x) => ({ ...x, active: false }));
      setSendErr(err.message);
    }
  };

  const Err = ({ k }) => (errors[k] ? <div className="c-error">{errors[k]}</div> : null);

  return (
    <Shell studio={{ ...cfg.studio, ...studio }}>
      <div className="c-hero">
        <h1>Umów wizytę</h1>
        <p className="muted">Wybierz usługi, sprawdź orientacyjną cenę i zaproponuj termin. Potwierdzę go e-mailem.</p>
      </div>

      <form onSubmit={submit} noValidate>
        <section className="section">
          <div className="section-head"><h2>1. Twoje auto</h2></div>
          <div className="card form">
            <div className="grid2">
              <label className="field"><span className="field-label">Marka</span><input value={f.make} onChange={(e) => set({ make: e.target.value })} placeholder="np. BMW" autoCapitalize="words" /><Err k="make" /></label>
              <label className="field"><span className="field-label">Model</span><input value={f.model} onChange={(e) => set({ model: e.target.value })} placeholder="np. X5" autoCapitalize="words" /><Err k="model" /></label>
            </div>
            <div className="field">
              <span className="field-label">Wielkość auta</span>
              <div className="segmented">
                {cfg.sizes.map((s) => (
                  <button type="button" key={s.id} className={f.sizeId === s.id ? 'on' : ''} onClick={() => set({ sizeId: s.id })}>
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
              <Err k="sizeId" />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2>2. Usługi</h2></div>
          <div className="services">
            {cfg.services.map((x) => {
              const on = f.serviceIds.includes(x.id);
              const price = calcQuote({ ...f, serviceIds: [x.id] }, cfg).items[0]?.price;
              return (
                <button type="button" key={x.id} className={`service ${on ? 'on' : ''}`} onClick={() => toggle(x.id)} aria-pressed={on}>
                  <span className="service-check">{on && <Icon name="check" size={16} />}</span>
                  <span className="service-name">{x.name}{x.correction && <small>cena zależy od stanu lakieru</small>}</span>
                  <span className="service-price">{formatMoney(price)} zł</span>
                </button>
              );
            })}
          </div>
          <Err k="serviceIds" />
        </section>

        {calc.needsPaint && (
          <section className="section">
            <div className="section-head"><h2>Stan lakieru</h2></div>
            <div className="segmented">
              {cfg.paints.map((p) => (
                <button type="button" key={p.id} className={f.paintId === p.id ? 'on' : ''} onClick={() => set({ paintId: p.id })}>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              Dobry – pojedyncze rysy · Średni – widoczne zmatowienia i hologramy · Zły – mocno porysowany, zmatowiały lakier
            </div>
          </section>
        )}

        <div className="total-card">
          <span>Cena orientacyjna</span>
          <strong>{calc.items.length ? `ok. ${formatMoney(calc.total)} zł` : '—'}</strong>
          <small>Cena potwierdzana po oględzinach auta</small>
        </div>
        {calc.items.length > 0 && (
          <div className="c-summary small">
            {calc.items.map((i) => (
              <div key={i.id} className="row between"><span>{i.name}</span><span>{formatMoney(i.price)} zł</span></div>
            ))}
            <div className="muted" style={{ marginTop: 6 }}>{cfg.sizes.find((s) => s.id === f.sizeId)?.name}{calc.needsPaint ? ` · lakier: ${cfg.paints.find((p) => p.id === f.paintId)?.name.toLowerCase()}` : ''}</div>
          </div>
        )}

        <section className="section">
          <div className="section-head"><h2>3. Proponowane terminy</h2></div>
          <div className="small muted" style={{ marginBottom: 10 }}>Podaj 2–3 terminy, które Ci pasują – potwierdzę jeden z nich.</div>
          {f.slots.map((s, i) => (
            <div key={i} className="card slot">
              <div className="slot-head">
                <span className="strong">Termin {i + 1}</span>
                {s.date && <span className="muted small">{fmtDayLong(s.date)}</span>}
                {f.slots.length > 1 && (
                  <button type="button" className="icon-btn" aria-label="Usuń termin" onClick={() => set({ slots: f.slots.filter((_, k) => k !== i) })}><Icon name="x" size={18} /></button>
                )}
              </div>
              <div className="grid2 keep">
                <input type="date" min={addDays(todayISO(), 1)} value={s.date} onChange={(e) => setSlot(i, { date: e.target.value })} aria-label={`Data, termin ${i + 1}`} />
                <select value={s.time} onChange={(e) => setSlot(i, { time: e.target.value })} aria-label={`Godzina, termin ${i + 1}`}>
                  {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
          ))}
          {f.slots.length < 3 && (
            <button type="button" className="btn block" onClick={() => set({ slots: [...f.slots, { date: addDays(f.slots[f.slots.length - 1]?.date || todayISO(), 1), time: '09:00' }] })}>
              <Icon name="plus" /> Dodaj termin
            </button>
          )}
          <Err k="slots" />
        </section>

        <section className="section">
          <div className="section-head"><h2>4. Kontakt</h2></div>
          <div className="card form">
            <label className="field"><span className="field-label">Imię</span><input value={f.name} onChange={(e) => set({ name: e.target.value })} autoComplete="given-name" /><Err k="name" /></label>
            <div className="grid2">
              <label className="field"><span className="field-label">Telefon</span><input type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" placeholder="np. 600 100 200" /><Err k="phone" /></label>
              <label className="field"><span className="field-label">E-mail</span><input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" /><Err k="email" /></label>
            </div>
            <label className="field"><span className="field-label">Uwagi (opcjonalnie)</span><textarea rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="np. rocznik, kolor, na czym Ci najbardziej zależy" /></label>
            <input className="hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set({ website: e.target.value })} aria-hidden="true" placeholder="Nie wypełniaj" />
            <label className="check-row consent">
              <input type="checkbox" checked={f.consent} onChange={(e) => set({ consent: e.target.checked })} />
              <span className="small">
                Wyrażam zgodę na przetwarzanie moich danych osobowych w celu obsługi zapytania i realizacji usługi, zgodnie z{' '}
                <a className="gold" href={withSlug('/prywatnosc/', studio?.slug)} target="_blank" rel="noreferrer">polityką prywatności</a>.
              </span>
            </label>
            <Err k="consent" />
          </div>
        </section>

        {sendErr && <div className="c-error big">{sendErr}</div>}
        <button className="btn primary block big-one" style={{ marginTop: 20 }} disabled={sending}>
          {sending ? 'Wysyłam…' : 'Wyślij zapytanie'}
        </button>
        <div className="small muted center-text">Wysłanie zapytania nie jest jeszcze rezerwacją – termin potwierdzę e-mailem.</div>
      </form>
    </Shell>
  );
}

function Shell({ studio, children }) {
  return (
    <div className="c-page">
      <header className="c-header"><Brand studio={studio} /></header>
      <main>{children}</main>
      <Footer studio={studio} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Booking />);

import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Brand, Footer } from './common.jsx';
import Icon from '../components/Icon.jsx';
import { formatMoney } from '../lib/pricing.js';
import { fmtTermPL } from '../lib/ics.js';
import { fmtDate } from '../lib/dates.js';
import { FLOW } from '../lib/status.js';
import { publicGet } from '../lib/supabase.js';

const params = new URLSearchParams(window.location.search);
const token = params.get('t') || '';
const isNew = params.get('nowe') === '1';
const STEP_LABELS = { zapytanie: 'Zapytanie', umowione: 'Termin', w_trakcie: 'Prace', gotowe: 'Gotowe', odebrane: 'Odebrane' };
const fmtAt = (iso) => new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function JobPage() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      publicGet({ action: 'job', t: token })
        .then((r) => alive && (setD(r), setErr(null)))
        .catch((e) => alive && setErr(e.status === 404 ? 'Nie znaleziono zlecenia. Sprawdź, czy link jest kompletny.' : 'Nie udało się wczytać zlecenia.'));
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 30000); // „na bieżąco”
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (err) return <Shell><div className="empty">{err}</div></Shell>;
  if (!d) return <Shell><div className="center-load"><div className="spinner" /></div></Shell>;
  const { job, studio } = d;
  const stepIdx = FLOW.indexOf(job.status);
  const photos = job.timeline.filter((t) => t.type === 'photo');

  return (
    <Shell studio={studio}>
      {isNew && job.status === 'zapytanie' && (
        <div className="notice ok"><Icon name="check" /><span>Dziękuję! Zapytanie wysłane. Zachowaj ten link – tu zobaczysz potwierdzenie terminu i postęp prac.</span></div>
      )}
      <div className="c-hero">
        <div className="muted small">{job.clientName ? `${job.clientName}, Twoje zlecenie` : 'Twoje zlecenie'}</div>
        <h1>{job.car}</h1>
        {job.plate && <div className="muted">{job.plate}</div>}
      </div>

      <div className={`card status-card st-${job.status}`}>
        <div className="status-label">{job.statusLabel}</div>
        {job.status !== 'anulowane' && (
          <ol className="steps">
            {FLOW.map((s, i) => (
              <li key={s} className={i < stepIdx ? 'done' : i === stepIdx ? 'now' : ''}>
                <span className="dot-step">{i < stepIdx ? <Icon name="check" size={12} /> : i + 1}</span>
                <span>{STEP_LABELS[s]}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {job.status === 'gotowe' && job.finalPrice && (
        <div className="total-card">
          <span>Zapraszamy po odbiór</span>
          <strong>{formatMoney(job.finalPrice)} zł</strong>
          <small>kwota do zapłaty</small>
        </div>
      )}

      <div className="card">
        <div className="kv">
          {job.status === 'zapytanie' ? (
            <div className="full"><span>Proponowane terminy</span>{job.proposedSlots.map((s) => fmtTermPL(s.date, s.time)).join(' · ')}</div>
          ) : (
            job.date && <div className="full"><span>Termin wizyty</span>{fmtTermPL(job.date, job.time)}</div>
          )}
          <div className="full"><span>Usługi</span>{job.services.map((s) => s.name).join(', ')}</div>
          {!job.finalPrice && <div><span>Cena orientacyjna</span>ok. {formatMoney(job.estimate)} zł</div>}
          {job.finalPrice && <div><span>Kwota końcowa</span>{formatMoney(job.finalPrice)} zł</div>}
          {studio.address && <div className="full"><span>Adres</span>{studio.address}</div>}
        </div>
        {!job.finalPrice && <div className="small muted" style={{ marginTop: 10 }}>Cena potwierdzana po oględzinach auta.</div>}
        {job.icsUrl && (
          <a className="btn primary block" href={job.icsUrl}><Icon name="calendar" /> Dodaj do kalendarza</a>
        )}
        {studio.phone && (
          <a className="btn block" href={`tel:${studio.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" /> Zadzwoń do studia</a>
        )}
      </div>

      <section className="section">
        <div className="section-head"><h2>Przebieg zlecenia</h2></div>
        <div className="timeline">
          {[...job.timeline].reverse().map((t, i) =>
            t.type === 'photo' ? (
              <div key={i} className="tl-item photo">
                <div className="tl-dot" />
                <div className="tl-body">
                  <div className="tl-title">{t.stage}</div>
                  {t.caption && <div className="small">{t.caption}</div>}
                  <img src={t.url} alt={`${t.stage}${t.caption ? ' – ' + t.caption : ''}`} loading="lazy" onClick={() => setZoom(t)} />
                  <div className="small muted">{fmtAt(t.at)}</div>
                </div>
              </div>
            ) : (
              <div key={i} className="tl-item">
                <div className="tl-dot gold-dot" />
                <div className="tl-body">
                  <div className="tl-title">{t.label}</div>
                  <div className="small muted">{fmtAt(t.at)}</div>
                </div>
              </div>
            )
          )}
        </div>
        {photos.length === 0 && job.status !== 'zapytanie' && <div className="small muted">Zdjęcia z kolejnych etapów pojawią się tutaj w trakcie prac.</div>}
      </section>

      <div className="small muted center-text" style={{ marginTop: 18 }}>Zlecenie z {fmtDate(job.createdAt)} · strona odświeża się automatycznie</div>

      {zoom && (
        <div className="overlay viewer" onClick={() => setZoom(null)}>
          <img src={zoom.url} alt="" />
          <div className="viewer-caption">{zoom.stage}{zoom.caption ? ` – ${zoom.caption}` : ''}</div>
        </div>
      )}
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

ReactDOM.createRoot(document.getElementById('root')).render(<JobPage />);

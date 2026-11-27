import { useRef } from 'react';
import Icon from './Icon.jsx';
import { back, go } from '../router.js';
import { useData, usePhoto, useUI } from '../store.jsx';
import { carLabel } from '../lib/reminders.js';
import { formatMoney } from '../lib/pricing.js';
import { STATUSES } from '../lib/status.js';

export function Header({ title, sub, backTo, right }) {
  return (
    <header className="header">
      {backTo !== undefined && (
        <button className="icon-btn" aria-label="Wstecz" onClick={() => back(backTo || '/')}>
          <Icon name="back" size={24} />
        </button>
      )}
      <div className="header-title">
        <h1>{title}</h1>
        {sub && <div className="muted small">{sub}</div>}
      </div>
      <div className="header-right">{right}</div>
    </header>
  );
}

export function Section({ title, right, children }) {
  return (
    <section className="section">
      {(title || right) && (
        <div className="section-head">
          <h2>{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          <span>{o.label}</span>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

const STATUS_CLS = { zapytanie: 'st-new', umowione: 'st-planned', w_trakcie: 'st-progress', gotowe: 'st-ready', odebrane: 'st-done', anulowane: 'st-done' };

export function StatusPill({ status }) {
  return <span className={`pill ${STATUS_CLS[status] || ''}`}>{STATUSES[status]?.label || status}</span>;
}

export function Empty({ icon = 'car', children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} />
      <div>{children}</div>
    </div>
  );
}

export function JobCard({ job, car, children, showDate }) {
  return (
    <div className="card job-card">
      <button className="card-main" onClick={() => go(`/job/${job.id}`)}>
        <div className="row between">
          <div style={{ minWidth: 0 }}>
            <div className="h3 ellipsis">{carLabel(car)}</div>
            <div className="muted small ellipsis">
              {[car?.plate, car?.ownerName || job.client?.name, showDate && job.date, job.time].filter(Boolean).join(' · ')}
            </div>
          </div>
          <StatusPill status={job.status} />
        </div>
        {job.services?.length > 0 && (
          <div className="small job-services">
            {job.services.map((s) => s.name).join(' · ')}
            {job.finalPrice || job.price ? <span className="gold"> · {formatMoney(job.finalPrice || job.price)} zł</span> : null}
          </div>
        )}
      </button>
      {children && <div className="card-actions">{children}</div>}
    </div>
  );
}

export function Thumb({ id, caption, onRemove }) {
  const src = usePhoto(id);
  const ui = useUI();
  return (
    <div className="thumb">
      {src ? <img src={src} alt={caption || ''} onClick={() => ui.showPhoto({ src, caption })} /> : <div className="thumb-ph" />}
      {onRemove && (
        <button className="thumb-x" aria-label="Usuń zdjęcie" onClick={onRemove}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

export function PhotoButtons({ onFiles, labelCamera = 'Zrób zdjęcie', labelGallery = 'Z galerii' }) {
  const cam = useRef();
  const gal = useRef();
  const { api } = useData();
  const ui = useUI();
  const handle = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    await ui.run('Kompresuję zdjęcia…', async () => {
      const ids = [];
      for (const f of files) ids.push(await api.addPhoto(f));
      onFiles(ids);
    });
  };
  return (
    <div className="row gap">
      <button type="button" className="btn grow" onClick={() => cam.current.click()}>
        <Icon name="camera" /> {labelCamera}
      </button>
      <button type="button" className="btn grow" onClick={() => gal.current.click()}>
        <Icon name="image" /> {labelGallery}
      </button>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={handle} />
      <input ref={gal} type="file" accept="image/*" multiple hidden onChange={handle} />
    </div>
  );
}

export function PhotoSet({ ids = [], onChange, title }) {
  return (
    <div className="photo-set">
      {title && <div className="field-label">{title}</div>}
      {ids.length > 0 && (
        <div className="thumbs">
          {ids.map((id) => (
            <Thumb key={id} id={id} onRemove={onChange ? () => confirm('Usunąć zdjęcie?') && onChange(ids.filter((x) => x !== id)) : undefined} />
          ))}
        </div>
      )}
      {onChange && <PhotoButtons onFiles={(newIds) => onChange([...ids, ...newIds])} />}
    </div>
  );
}

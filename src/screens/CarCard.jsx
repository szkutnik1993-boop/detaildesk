import Icon from '../components/Icon.jsx';
import { Empty, Header, Section, StatusPill, Thumb } from '../components/ui.jsx';
import { useData } from '../store.jsx';
import { go } from '../router.js';
import { fmtDate, fmtDateTime } from '../lib/dates.js';
import { carLabel } from '../lib/reminders.js';
import { formatMoney } from '../lib/pricing.js';
import { smsLink, telLink } from '../lib/utils.js';

export default function CarCard({ id }) {
  const { data } = useData();
  const car = data.cars.find((c) => c.id === id);
  if (!car) return <div className="screen"><Header title="Auto" backTo="/cars" /><Empty>Nie znaleziono auta.</Empty></div>;

  const size = data.settings.sizes.find((s) => s.id === car.size);
  const jobs = data.jobs.filter((j) => j.carId === id).sort((a, b) => b.date.localeCompare(a.date));
  const protocols = data.protocols.filter((p) => p.carId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const quotes = data.quotes.filter((q) => q.carId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const withPhotos = jobs.filter((j) => j.photosBefore?.length || j.photosAfter?.length);

  return (
    <div className="screen">
      <Header
        title={carLabel(car)}
        sub={[car.plate, car.year, car.color].filter(Boolean).join(' · ')}
        backTo="/cars"
        right={
          <button className="icon-btn" aria-label="Edytuj" onClick={() => go(`/car/${id}/edit`)}>
            <Icon name="edit" />
          </button>
        }
      />

      <div className="card">
        <div className="kv">
          <div><span>Klient</span>{car.ownerName || '—'}</div>
          <div><span>Telefon</span>{car.ownerPhone || '—'}</div>
          {car.ownerEmail && <div><span>E-mail</span>{car.ownerEmail}</div>}
          <div><span>Wielkość</span>{size?.name || '—'}</div>
          {car.vin && <div><span>VIN</span>{car.vin}</div>}
          {car.notes && <div className="full"><span>Notatki</span>{car.notes}</div>}
        </div>
      </div>

      <div className="action-row">
        <a className={`btn ${car.ownerPhone ? '' : 'disabled'}`} href={car.ownerPhone ? telLink(car.ownerPhone) : undefined}>
          <Icon name="phone" /> Zadzwoń
        </a>
        <button className="btn primary" onClick={() => go(`/quote/new?carId=${id}`)}>
          <Icon name="quote" /> Nowa wycena
        </button>
        <a className={`btn ${car.ownerPhone ? '' : 'disabled'}`} href={car.ownerPhone ? smsLink(car.ownerPhone, 'Dzień dobry! ') : undefined}>
          <Icon name="sms" /> SMS
        </a>
      </div>
      <div className="action-row two">
        <button className="btn" onClick={() => go(`/intake?carId=${id}`)}>
          <Icon name="clipboard" /> Przyjmij auto
        </button>
        <button className="btn" onClick={() => go(`/job/new?carId=${id}`)}>
          <Icon name="calendar" /> Umów zlecenie
        </button>
      </div>

      <Section title="Historia usług">
        {jobs.length === 0 && <Empty icon="calendar">Brak zleceń dla tego auta.</Empty>}
        {jobs.map((j) => (
          <button key={j.id} className="card history" onClick={() => go(`/job/${j.id}`)}>
            <div className="row between">
              <div className="h3">{fmtDate(j.doneDate || j.date)}</div>
              <div className="row gap-sm" style={{ alignItems: 'center' }}>
                {j.finalPrice || j.price ? <span className="gold strong">{formatMoney(j.finalPrice || j.price)} zł</span> : null}
                <StatusPill status={j.status} />
              </div>
            </div>
            <div className="small">{(j.services || []).map((s) => s.name).join(' · ') || 'Brak usług'}</div>
            {j.chemicals && (
              <div className="small muted">
                <span className="tag">Chemia</span> {j.chemicals}
              </div>
            )}
          </button>
        ))}
      </Section>

      <Section title="Zdjęcia przed / po">
        {withPhotos.length === 0 && <Empty icon="image">Zdjęcia dodasz w zleceniu (przed i po).</Empty>}
        {withPhotos.map((j) => (
          <div key={j.id} className="card">
            <div className="small muted" style={{ marginBottom: 8 }}>{fmtDate(j.date)} · {(j.services || []).map((s) => s.name).join(', ')}</div>
            <div className="before-after">
              <div>
                <div className="field-label">Przed</div>
                <div className="thumbs">{(j.photosBefore || []).map((p) => <Thumb key={p} id={p} caption="Przed" />)}</div>
              </div>
              <div>
                <div className="field-label">Po</div>
                <div className="thumbs">{(j.photosAfter || []).map((p) => <Thumb key={p} id={p} caption="Po" />)}</div>
              </div>
            </div>
          </div>
        ))}
      </Section>

      {protocols.length > 0 && (
        <Section title="Protokoły przyjęcia">
          {protocols.map((p) => (
            <button key={p.id} className="card list-item" onClick={() => go(`/protocol/${p.id}`)}>
              <Icon name="clipboard" className="gold" />
              <div style={{ flex: 1 }}>
                <div className="h3">{fmtDateTime(p.createdAt)}</div>
                <div className="muted small">{p.mileage ? `${formatMoney(p.mileage)} km` : 'bez przebiegu'} · {(p.damages || []).length} zdj. uszkodzeń</div>
              </div>
              <Icon name="chevron" className="muted" />
            </button>
          ))}
        </Section>
      )}

      {quotes.length > 0 && (
        <Section title="Wyceny">
          {quotes.map((q) => (
            <button key={q.id} className="card list-item" onClick={() => go(`/quote/${q.id}`)}>
              <Icon name="quote" className="gold" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="h3">{formatMoney(q.total)} zł</div>
                <div className="muted small ellipsis">{fmtDate(q.createdAt)} · {(q.items || []).map((i) => i.name).join(', ')}</div>
              </div>
              <span className="pill">{q.status}</span>
            </button>
          ))}
        </Section>
      )}
    </div>
  );
}

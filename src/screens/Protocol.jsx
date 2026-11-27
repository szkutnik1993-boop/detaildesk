import Icon from '../components/Icon.jsx';
import PaintDiagram from '../components/PaintDiagram.jsx';
import { Empty, Header, Section, Thumb } from '../components/ui.jsx';
import { loadPhoto, useData, useUI } from '../store.jsx';
import { go } from '../router.js';
import { fmtDateTime } from '../lib/dates.js';
import { carLabel } from '../lib/reminders.js';
import { formatMoney } from '../lib/pricing.js';
import { protocolPdf } from '../lib/pdf.js';
import { ownerCall } from '../lib/supabase.js';

export default function Protocol({ id }) {
  const { data, api } = useData();
  const ui = useUI();
  const p = data.protocols.find((x) => x.id === id);
  if (!p) return <div className="screen"><Header title="Protokół" backTo="/" /><Empty>Nie znaleziono protokołu.</Empty></div>;
  const car = data.cars.find((c) => c.id === p.carId);
  const job = data.jobs.find((j) => j.id === p.jobId);

  const clientEmail = job?.client?.email || car?.ownerEmail;
  const lastSent = (p.emailed || []).slice(-1)[0];

  const buildPdf = async () => {
    const photos = {};
    for (const d of p.damages || []) photos[d.photoId] = await loadPhoto(d.photoId);
    return protocolPdf(p, car, data.settings, photos, job?.services || []);
  };

  const pdf = () => ui.run('Tworzę PDF protokołu…', async () => ui.showFile(await buildPdf()));

  const sendEmail = () =>
    ui.run('Wysyłam protokół e-mailem…', async () => {
      const file = await buildPdf();
      const dataUrl = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(file.blob);
      });
      const r = await ownerCall({ action: 'send-protocol', protocolId: p.id, filename: file.filename, pdfBase64: String(dataUrl).split(',')[1] });
      await api.reload();
      ui.toast(r.skipped ? `Nie wysłano: ${r.skipped}` : `Protokół wysłany do ${r.to} ✓`);
    });

  const remove = async () => {
    if (!confirm('Usunąć protokół (zlecenie zostanie)?')) return;
    for (const d of p.damages || []) await api.removePhoto(d.photoId);
    await api.remove('protocols', p.id);
    go(car ? `/car/${car.id}` : '/');
  };

  return (
    <div className="screen">
      <Header title="Protokół przyjęcia" sub={fmtDateTime(p.createdAt)} backTo="/" />

      <div className="card form">
        {clientEmail ? (
          <button className="btn primary block big-one" style={{ margin: 0 }} onClick={sendEmail}>
            <Icon name="sms" /> {lastSent ? 'Wyślij ponownie mailem' : 'Wyślij mailem do klienta'}
          </button>
        ) : (
          <button className="btn primary block big-one" style={{ margin: 0 }} onClick={() => car && go(`/car/${car.id}/edit`)}>
            <Icon name="edit" /> Dodaj e-mail klienta, aby wysłać
          </button>
        )}
        <div className="small muted">
          {lastSent
            ? `Wysłano do ${lastSent.to} · ${fmtDateTime(lastSent.at)}`
            : clientEmail
              ? `PDF z podpisem i zdjęciami trafi na ${clientEmail} razem z linkiem do podglądu etapów pracy.`
              : 'Klient nie ma adresu e-mail w danych auta.'}
        </div>
        <button className="btn block ghost" style={{ marginTop: 0 }} onClick={pdf}>
          <Icon name="file" /> Podgląd PDF / udostępnij inaczej
        </button>
      </div>

      <div className="card">
        <div className="kv">
          <div><span>Auto</span>{carLabel(car)}</div>
          <div><span>Nr rej.</span>{car?.plate || '—'}</div>
          <div><span>Klient</span>{car?.ownerName || '—'}</div>
          <div><span>Telefon</span>{car?.ownerPhone || '—'}</div>
          <div><span>Przebieg</span>{p.mileage ? `${formatMoney(p.mileage)} km` : '—'}</div>
          <div><span>Usługi</span>{(job?.services || []).map((x) => x.name).join(', ') || '—'}</div>
        </div>
      </div>

      <Section title="Grubość lakieru">
        <PaintDiagram value={p.paint || {}} threshold={Number(data.settings.paintThreshold) || 250} />
      </Section>

      {(p.damages || []).length > 0 && (
        <Section title="Uszkodzenia">
          {p.damages.map((d) => (
            <div key={d.photoId} className="damage">
              <Thumb id={d.photoId} caption={d.caption} />
              <div className="grow">{d.caption || <span className="muted">bez opisu</span>}</div>
            </div>
          ))}
        </Section>
      )}

      {p.notes && (
        <Section title="Uwagi">
          <div className="card pre">{p.notes}</div>
        </Section>
      )}

      <Section title="Podpis klienta">
        {p.signature ? <img className="sig-img" src={p.signature} alt="Podpis klienta" /> : <Empty icon="edit">Brak podpisu</Empty>}
      </Section>

      <div className="action-row two">
        {job && (
          <button className="btn" onClick={() => go(`/job/${job.id}`)}>
            <Icon name="calendar" /> Zlecenie
          </button>
        )}
        {car && (
          <button className="btn" onClick={() => go(`/car/${car.id}`)}>
            <Icon name="car" /> Karta auta
          </button>
        )}
      </div>
      <button className="btn danger block" style={{ marginTop: 24 }} onClick={remove}>
        <Icon name="trash" /> Usuń protokół
      </button>
    </div>
  );
}

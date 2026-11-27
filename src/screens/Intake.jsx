import { useState } from 'react';
import CarFields, { carValid, emptyCar } from '../components/CarFields.jsx';
import Icon from '../components/Icon.jsx';
import PaintDiagram from '../components/PaintDiagram.jsx';
import SignaturePad from '../components/SignaturePad.jsx';
import { Field, Header, PhotoButtons, Section, Thumb } from '../components/ui.jsx';
import { useData, useUI } from '../store.jsx';
import { replace } from '../router.js';
import { nowISO, todayISO } from '../lib/dates.js';
import { carLabel } from '../lib/reminders.js';
import { calcQuote } from '../lib/pricing.js';
import { applyTransition } from '../lib/status.js';

export default function Intake({ query }) {
  const { data, api } = useData();
  const ui = useUI();
  const s = data.settings;
  const job = query.jobId ? data.jobs.find((j) => j.id === query.jobId) : null;
  const initialCar = data.cars.find((c) => c.id === (job?.carId || query.carId));

  const [car, setCar] = useState(() => (initialCar ? { ...initialCar } : emptyCar(s.sizes)));
  const [mileage, setMileage] = useState('');
  const [paint, setPaint] = useState({});
  const [damages, setDamages] = useState([]);
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState(null);
  const [serviceIds, setServiceIds] = useState(() => (job?.services || []).map((x) => x.serviceId).filter(Boolean));

  const pickCar = (id) => {
    if (!id) return setCar(emptyCar(s.sizes));
    const c = data.cars.find((x) => x.id === id);
    if (c) setCar({ ...c });
  };

  const save = async () => {
    if (!carValid(car)) return alert('Uzupełnij dane auta lub klienta.');
    if (!signature && !confirm('Brak podpisu klienta. Zapisać mimo to?')) return;
    await ui.run('Zapisuję protokół…', async () => {
      const savedCar = await api.save('cars', car);
      let jobRec = job;
      if (jobRec) {
        jobRec = await api.save('jobs', jobRec.status === 'umowione' ? applyTransition(jobRec, 'w_trakcie').job : jobRec);
      } else {
        const calc = calcQuote({ serviceIds, sizeId: savedCar.size, paintId: 'good' }, s);
        jobRec = await api.save('jobs', {
          carId: savedCar.id,
          date: todayISO(),
          time: '',
          status: 'w_trakcie',
          startedAt: new Date().toISOString(),
          timeline: [{ type: 'status', status: 'w_trakcie', at: new Date().toISOString() }],
          services: calc.items.map((i) => ({ serviceId: i.id, name: i.name, price: i.price, coating: i.coating })),
          price: calc.total,
          chemicals: '',
          notes: '',
          photosBefore: [],
          photosAfter: [],
        });
      }
      const protocol = await api.save('protocols', {
        carId: savedCar.id,
        jobId: jobRec.id,
        createdAt: nowISO(),
        mileage: mileage.replace(/\D/g, ''),
        paint,
        damages,
        notes,
        signature,
      });
      ui.toast('Auto przyjęte ✓');
      replace(`/protocol/${protocol.id}`);
    });
  };

  return (
    <div className="screen">
      <Header title="Przyjęcie auta" sub="Protokół przyjęcia" backTo="/" />

      <Section title="Auto i klient">
        <div className="card form">
          {!job && data.cars.length > 0 && (
            <Field label="Auto z bazy">
              <select value={car.id || ''} onChange={(e) => pickCar(e.target.value)}>
                <option value="">— nowe auto —</option>
                {[...data.cars]
                  .sort((a, b) => carLabel(a).localeCompare(carLabel(b)))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {carLabel(c)} {c.plate ? `· ${c.plate}` : ''} {c.ownerName ? `· ${c.ownerName}` : ''}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <CarFields car={car} onChange={setCar} sizes={s.sizes} notes={false} />
          <Field label="Przebieg (km)">
            <input inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/[^\d ]/g, ''))} placeholder="np. 85 000" />
          </Field>
        </div>
      </Section>

      {!job && (
        <Section title="Usługi do wykonania">
          <div className="chips wrap">
            {s.services.filter((x) => !x.hidden).map((x) => (
              <button
                key={x.id}
                className={serviceIds.includes(x.id) ? 'on' : ''}
                onClick={() => setServiceIds((ids) => (ids.includes(x.id) ? ids.filter((i) => i !== x.id) : [...ids, x.id]))}
              >
                {x.name}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Grubość lakieru (µm)">
        <PaintDiagram value={paint} onChange={setPaint} threshold={Number(s.paintThreshold) || 250} />
      </Section>

      <Section title="Uszkodzenia">
        {damages.map((d, i) => (
          <div key={d.photoId} className="damage">
            <Thumb id={d.photoId} caption={d.caption} />
            <div className="grow">
              <input value={d.caption} placeholder="Opis, np. rysa na zderzaku" onChange={(e) => setDamages(damages.map((x, k) => (k === i ? { ...x, caption: e.target.value } : x)))} />
              <button
                className="link-btn small danger-text"
                onClick={() => {
                  if (confirm('Usunąć zdjęcie?')) {
                    api.removePhoto(d.photoId);
                    setDamages(damages.filter((_, k) => k !== i));
                  }
                }}
              >
                Usuń
              </button>
            </div>
          </div>
        ))}
        <PhotoButtons onFiles={(ids) => setDamages((ds) => [...ds, ...ids.map((photoId) => ({ photoId, caption: '' }))])} labelCamera="Zdjęcie uszkodzenia" />
      </Section>

      <Section title="Uwagi">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="np. rzeczy w aucie, poziom paliwa, życzenia klienta…" />
      </Section>

      <Section title="Podpis klienta">
        <SignaturePad value={signature} onChange={setSignature} />
      </Section>

      <div className="sticky-actions">
        <button className="btn primary grow" onClick={save}>
          <Icon name="check" /> Zapisz i przyjmij auto
        </button>
      </div>
    </div>
  );
}

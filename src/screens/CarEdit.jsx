import { useState } from 'react';
import CarFields, { carValid, emptyCar } from '../components/CarFields.jsx';
import Icon from '../components/Icon.jsx';
import { Header } from '../components/ui.jsx';
import { useData, useUI } from '../store.jsx';
import { go, replace } from '../router.js';

export default function CarEdit({ id }) {
  const { data, api } = useData();
  const ui = useUI();
  const existing = id ? data.cars.find((c) => c.id === id) : null;
  const [car, setCar] = useState(() => existing || emptyCar(data.settings.sizes));

  const save = async () => {
    if (!carValid(car)) return alert('Podaj przynajmniej markę, rejestrację lub klienta.');
    const saved = await api.save('cars', car);
    ui.toast('Zapisano');
    replace(`/car/${saved.id}`);
  };

  const remove = async () => {
    const jobs = data.jobs.filter((j) => j.carId === id);
    if (!confirm(`Usunąć auto ${car.make || ''} ${car.model || ''}${jobs.length ? ` wraz z ${jobs.length} zleceniami` : ''}? Tego nie da się cofnąć.`)) return;
    for (const j of jobs) await api.remove('jobs', j.id);
    for (const p of data.protocols.filter((p) => p.carId === id)) await api.remove('protocols', p.id);
    await api.remove('cars', id);
    ui.toast('Usunięto auto');
    go('/cars');
  };

  return (
    <div className="screen">
      <Header title={existing ? 'Edycja auta' : 'Nowe auto'} backTo={existing ? `/car/${id}` : '/cars'} />
      <div className="card form">
        <CarFields car={car} onChange={setCar} sizes={data.settings.sizes} />
      </div>
      <div className="sticky-actions">
        <button className="btn primary block" onClick={save}>
          <Icon name="check" /> Zapisz
        </button>
      </div>
      {existing && (
        <button className="btn danger block" onClick={remove} style={{ marginTop: 24 }}>
          <Icon name="trash" /> Usuń auto
        </button>
      )}
    </div>
  );
}

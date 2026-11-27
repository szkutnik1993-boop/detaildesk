import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, Header } from '../components/ui.jsx';
import { useData } from '../store.jsx';
import { go } from '../router.js';
import { carLabel } from '../lib/reminders.js';

export default function Cars() {
  const { data } = useData();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const cars = data.cars
    .filter((c) => !needle || [c.make, c.model, c.plate, c.ownerName, c.ownerPhone, c.color].join(' ').toLowerCase().includes(needle))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  return (
    <div className="screen">
      <Header
        title="Auta i klienci"
        sub={`${data.cars.length} ${data.cars.length === 1 ? 'auto' : 'aut'} w bazie`}
        right={
          <button className="icon-btn gold" aria-label="Dodaj auto" onClick={() => go('/car/new')}>
            <Icon name="plus" size={24} />
          </button>
        }
      />
      <div className="search">
        <Icon name="search" />
        <input type="search" placeholder="Szukaj: marka, rejestracja, klient, telefon" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {cars.length === 0 && (
        <Empty>{data.cars.length ? 'Nic nie znaleziono.' : 'Brak aut. Auta dodają się same przy przyjęciu auta lub umówieniu wyceny.'}</Empty>
      )}

      {cars.map((c) => (
        <button key={c.id} className="card list-item" onClick={() => go(`/car/${c.id}`)}>
          <div className="avatar">{(c.make || '?').slice(0, 1).toUpperCase()}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="h3 ellipsis">{carLabel(c)}</div>
            <div className="muted small ellipsis">{[c.plate, c.ownerName, c.ownerPhone].filter(Boolean).join(' · ')}</div>
          </div>
          <Icon name="chevron" className="muted" />
        </button>
      ))}

      <button className="btn block" style={{ marginTop: 16 }} onClick={() => go('/car/new')}>
        <Icon name="plus" /> Dodaj auto i klienta
      </button>
    </div>
  );
}

import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, Header } from '../components/ui.jsx';
import { useData } from '../store.jsx';
import { go } from '../router.js';
import { fmtDate } from '../lib/dates.js';
import { formatMoney } from '../lib/pricing.js';
import { QUOTE_STATUS } from './Quote.jsx';

const FILTERS = [
  ['all', 'Wszystkie'],
  ['open', 'Czekają'],
  ['przyjęta', 'Przyjęte'],
  ['odrzucona', 'Odrzucone'],
];

export default function Quotes() {
  const { data } = useData();
  const [f, setF] = useState('all');
  const list = data.quotes
    .filter((q) => f === 'all' || (f === 'open' ? q.status === 'wysłana' || q.status === 'szkic' : q.status === f))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="screen">
      <Header
        title="Wyceny"
        right={
          <button className="icon-btn gold" aria-label="Nowa wycena" onClick={() => go('/quote/new')}>
            <Icon name="plus" size={24} />
          </button>
        }
      />
      <button className="btn primary big-one" onClick={() => go('/quote/new')}>
        <Icon name="quote" size={22} /> Nowa wycena
      </button>
      <div className="chips">
        {FILTERS.map(([k, l]) => (
          <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>
        ))}
      </div>
      {list.length === 0 && <Empty icon="quote">Brak wycen.</Empty>}
      {list.map((q) => {
        const st = QUOTE_STATUS[q.status] || QUOTE_STATUS.szkic;
        return (
          <button key={q.id} className="card list-item" onClick={() => go(`/quote/${q.id}`)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row between">
                <div className="h3 ellipsis">{q.clientName || 'Klient'}{q.carLabel ? ` · ${q.carLabel}` : ''}</div>
              </div>
              <div className="muted small ellipsis">{fmtDate(q.createdAt)} · {(q.items || []).map((i) => i.name).join(', ')}</div>
            </div>
            <div className="right-col">
              <strong className="gold">{formatMoney(q.total)} zł</strong>
              <span className={`pill ${st.cls}`}>{st.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

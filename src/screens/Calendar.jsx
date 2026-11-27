import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, Header, JobCard } from '../components/ui.jsx';
import { useData } from '../store.jsx';
import { go } from '../router.js';
import { fmtDate, fmtDayLong, relDayLabel, todayISO } from '../lib/dates.js';

export default function Calendar() {
  const { data } = useData();
  const [past, setPast] = useState(false);
  const today = todayISO();
  const carById = Object.fromEntries(data.cars.map((c) => [c.id, c]));

  const jobs = data.jobs
    .filter((j) => j.status !== 'anulowane' && (past ? j.date < today : j.date >= today))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) * (past ? -1 : 1));

  const groups = [];
  for (const j of jobs) {
    const g = groups[groups.length - 1];
    if (g && g.date === j.date) g.jobs.push(j);
    else groups.push({ date: j.date, jobs: [j] });
  }

  return (
    <div className="screen">
      <Header
        title="Kalendarz"
        sub="Zlecenia według dni"
        right={
          <button className="icon-btn gold" aria-label="Nowe zlecenie" onClick={() => go(`/job/new?date=${today}`)}>
            <Icon name="plus" size={24} />
          </button>
        }
      />
      <div className="tabs-inline">
        <button className={!past ? 'on' : ''} onClick={() => setPast(false)}>Nadchodzące</button>
        <button className={past ? 'on' : ''} onClick={() => setPast(true)}>Minione</button>
      </div>

      {groups.length === 0 && (
        <Empty icon="calendar">{past ? 'Brak minionych zleceń.' : 'Brak zaplanowanych zleceń. Dodaj zlecenie przyciskiem +.'}</Empty>
      )}

      {groups.map((g) => (
        <div key={g.date} className="day-group">
          <div className="day-head">
            <span className={g.date === today ? 'gold' : ''}>{relDayLabel(g.date) || fmtDayLong(g.date)}</span>
            <span className="muted small">{relDayLabel(g.date) ? fmtDayLong(g.date) + ' · ' : ''}{fmtDate(g.date)}</span>
          </div>
          {g.jobs.map((j) => (
            <JobCard key={j.id} job={j} car={carById[j.carId]} />
          ))}
        </div>
      ))}

      <button className="btn block" style={{ marginTop: 16 }} onClick={() => go(`/job/new?date=${today}`)}>
        <Icon name="plus" /> Nowe zlecenie
      </button>
    </div>
  );
}

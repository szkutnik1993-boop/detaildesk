import { useEffect, useState } from 'react';
import Icon from './components/Icon.jsx';
import { go, useRoute } from './router.js';
import { useData } from './store.jsx';
import { supabase } from './lib/supabase.js';
import { PLATFORM_CONTACT } from './config.js';
import Today from './screens/Today.jsx';
import Calendar from './screens/Calendar.jsx';
import Cars from './screens/Cars.jsx';
import CarCard from './screens/CarCard.jsx';
import CarEdit from './screens/CarEdit.jsx';
import Quotes from './screens/Quotes.jsx';
import Quote from './screens/Quote.jsx';
import Intake from './screens/Intake.jsx';
import Protocol from './screens/Protocol.jsx';
import JobEdit from './screens/JobEdit.jsx';
import Settings from './screens/Settings.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Admin from './screens/Admin.jsx';
import InstallGuide from './screens/InstallGuide.jsx';

const TABS = [
  { to: '/', label: 'Dziś', icon: 'today', match: (p) => p[0] === undefined },
  { to: '/calendar', label: 'Kalendarz', icon: 'calendar', match: (p) => p[0] === 'calendar' || p[0] === 'job' },
  { to: '/cars', label: 'Auta i klienci', icon: 'car', match: (p) => p[0] === 'cars' || p[0] === 'car' },
  { to: '/quotes', label: 'Wyceny', icon: 'quote', match: (p) => p[0] === 'quotes' || p[0] === 'quote' },
];

function screen({ parts: p, query }, studio) {
  const [a, b, c] = p;
  if (!a) return <Today />;
  if (a === 'calendar') return <Calendar />;
  if (a === 'cars') return <Cars />;
  if (a === 'car' && b === 'new') return <CarEdit />;
  if (a === 'car' && c === 'edit') return <CarEdit id={b} />;
  if (a === 'car') return <CarCard id={b} />;
  if (a === 'quotes') return <Quotes />;
  if (a === 'quote') return <Quote id={b === 'new' ? null : b} query={query} />;
  if (a === 'intake') return <Intake query={query} />;
  if (a === 'protocol') return <Protocol id={b} />;
  if (a === 'job') return <JobEdit id={b === 'new' ? null : b} query={query} />;
  if (a === 'settings') return <Settings />;
  if (a === 'admin' && studio?.is_admin) return <Admin />;
  if (a === 'instalacja') return <InstallGuide />;
  return <Today />;
}

const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignoruj */
  }
};

// Ekran po wygaśnięciu okresu próbnego / zablokowaniu – dane zostają, eksport działa
function ExpiredScreen({ studio, onBrowse }) {
  const blocked = studio.blocked;
  return (
    <div className="expired">
      <div className="expired-icon"><Icon name="key" size={30} /></div>
      <h1>{blocked ? 'Studio jest zablokowane' : 'Okres próbny się skończył'}</h1>
      <p>{blocked ? 'Dostęp do edycji został wstrzymany.' : 'Skontaktuj się, żeby przedłużyć dostęp do DetailDesk.'}</p>
      <p className="muted small">
        Twoje dane są bezpieczne i nie zostaną usunięte. Możesz je przeglądać i w każdej chwili wyeksportować. Formularz rezerwacji dla klientów jest
        chwilowo wyłączony.
      </p>
      <a className="btn primary block" href={`mailto:${PLATFORM_CONTACT.email}?subject=${encodeURIComponent(`Przedłużenie DetailDesk – ${studio.name}`)}`}>
        <Icon name="sms" /> Napisz: {PLATFORM_CONTACT.email}
      </a>
      <button className="btn block" onClick={() => (onBrowse(), go('/settings'))}>
        <Icon name="download" /> Eksportuj dane
      </button>
      <button className="btn block ghost" onClick={onBrowse}>Przeglądaj dane (tylko odczyt)</button>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const { data, studio, readOnly } = useData();
  const [browse, setBrowse] = useState(false);
  const [announcement, setAnnouncement] = useState(null);

  useEffect(() => {
    supabase
      .from('announcements')
      .select('id, title, body, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data: rows }) => {
        const a = rows?.[0];
        if (a && lsGet('dd-ann-dismissed') !== String(a.id)) setAnnouncement(a);
      });
  }, []);

  // pierwsza konfiguracja nowego studia
  if (!readOnly && data.settings.onboarded === false && route.parts[0] !== 'admin') return <Onboarding />;
  if (readOnly && !browse) return <ExpiredScreen studio={studio} onBrowse={() => setBrowse(true)} />;

  return (
    <div className="app">
      {readOnly && (
        <button className="ro-banner" onClick={() => setBrowse(false)}>
          <Icon name="key" size={16} /> {studio.blocked ? 'Studio zablokowane' : 'Okres próbny się skończył'} – tryb tylko do odczytu
        </button>
      )}
      <main key={route.key}>
        {announcement && route.parts.length === 0 && (
          <div className="announcement">
            <div className="row between">
              <strong className="gold">{announcement.title}</strong>
              <button
                className="icon-btn"
                aria-label="Zamknij ogłoszenie"
                onClick={() => {
                  lsSet('dd-ann-dismissed', String(announcement.id));
                  setAnnouncement(null);
                }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="small pre">{announcement.body}</div>
          </div>
        )}
        {screen(route, studio)}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.to} className={t.match(route.parts) ? 'on' : ''} onClick={() => go(t.to)}>
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

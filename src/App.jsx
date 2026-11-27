import Icon from './components/Icon.jsx';
import { go, useRoute } from './router.js';
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

const TABS = [
  { to: '/', label: 'Dziś', icon: 'today', match: (p) => p[0] === undefined },
  { to: '/calendar', label: 'Kalendarz', icon: 'calendar', match: (p) => p[0] === 'calendar' || p[0] === 'job' },
  { to: '/cars', label: 'Auta i klienci', icon: 'car', match: (p) => p[0] === 'cars' || p[0] === 'car' },
  { to: '/quotes', label: 'Wyceny', icon: 'quote', match: (p) => p[0] === 'quotes' || p[0] === 'quote' },
];

function screen({ parts: p, query }) {
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
  return <Today />;
}

export default function App() {
    const route = useRoute();
  return (
    <div className="app">
      <main key={route.key}>{screen(route)}</main>
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

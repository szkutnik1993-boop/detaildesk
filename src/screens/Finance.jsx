// Finanse – zestawienie pomocnicze przychodów studia (z zakończonych wizyt).
import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, Header, Section } from '../components/ui.jsx';
import { useData, useUI } from '../store.jsx';
import { go } from '../router.js';
import { fmtDate, todayISO } from '../lib/dates.js';
import { formatMoney } from '../lib/pricing.js';
import { PAYMENT_METHODS, paymentPatch } from '../lib/status.js';
import { byMethod, financeCsv, inRange, last12Months, planned, plural, rangePresets, summary, tiles, topServices, unpaid, visits, visitsLabel } from '../lib/finance.js';
import { downloadBlob } from '../lib/utils.js';

const zl = (n) => `${formatMoney(Math.round(n))} zł`;

function Change({ pct }) {
  if (pct === null || pct === undefined) return <span className="fin-change muted">brak danych do porównania</span>;
  const up = pct >= 0;
  return (
    <span className={`fin-change ${up ? 'up' : 'down'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}% <span className="muted">vs ten sam okres poprz. mies.</span>
    </span>
  );
}

function MonthsChart({ months }) {
  const [sel, setSel] = useState(months.length - 1);
  const [table, setTable] = useState(false);
  const max = Math.max(...months.map((m) => m.amount), 1);
  const cur = months[sel];
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <div className="small">
          <b>{cur.label} {cur.year}</b>: <span className="gold strong">{zl(cur.amount)}</span> <span className="muted">· {visitsLabel(cur.count)}</span>
        </div>
        <button className="link-btn small" onClick={() => setTable(!table)}>{table ? 'Wykres' : 'Tabela'}</button>
      </div>
      {table ? (
        <table className="fin-table">
          <thead><tr><th>Miesiąc</th><th>Wizyty</th><th>Przychód</th></tr></thead>
          <tbody>
            {[...months].reverse().map((m) => (
              <tr key={m.key}><td>{m.label} {m.year}</td><td>{m.count}</td><td>{zl(m.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="fin-chart" role="img" aria-label="Przychód z ostatnich 12 miesięcy">
          <div className="fin-grid"><span>{zl(max)}</span><span>{zl(max / 2)}</span><span>0</span></div>
          <div className="fin-bars">
            {months.map((m, i) => (
              <button
                key={m.key}
                className={`fin-col ${i === sel ? 'sel' : ''} ${i === months.length - 1 ? 'now' : ''}`}
                onClick={() => setSel(i)}
                onMouseEnter={() => setSel(i)}
                aria-label={`${m.label} ${m.year}: ${zl(m.amount)}, ${visitsLabel(m.count)}`}
              >
                <span className="fin-bar" style={{ height: `${m.amount > 0 ? Math.max(2, (m.amount / max) * 100) : 0}%` }} />
                <span className="fin-x">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HBars({ rows, empty }) {
  if (!rows.length) return <Empty icon="file">{empty}</Empty>;
  const max = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <div className="card fin-hbars">
      {rows.map((r) => (
        <div key={r.key} className="fin-hrow">
          <div className="row between small"><span className="ellipsis">{r.label}</span><b>{zl(r.amount)}</b></div>
          <div className="fin-htrack"><span style={{ width: `${Math.max(2, (r.amount / max) * 100)}%` }} /></div>
          {r.sub && <div className="small muted">{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export default function Finance() {
  const { data, api } = useData();
  const ui = useUI();
  const today = todayISO();
  const presets = rangePresets(today);
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(presets.month);

  const all = useMemo(() => visits(data.jobs, data.cars), [data.jobs, data.cars]);
  const t = tiles(all, today);
  const plan = planned(data.jobs, today);
  const months = last12Months(all, today);
  const inR = inRange(all, range.from, range.to);
  const sum = summary(inR);
  const top = topServices(inR);
  const methods = byMethod(inR);
  const toPay = unpaid(all);

  const pick = (k) => {
    setPreset(k);
    setRange(presets[k]);
  };
  const exportCsv = () => downloadBlob(new Blob([financeCsv(inR)], { type: 'text/csv;charset=utf-8' }), `finanse-${range.from}_${range.to}.csv`);
  const markPaid = (v) =>
    ui.run('Zapisuję…', async () => {
      const job = data.jobs.find((j) => j.id === v.id);
      await api.save('jobs', { ...job, ...paymentPatch({ paymentStatus: 'oplacone', paymentMethod: job.paymentMethod || 'gotowka' }) });
      ui.toast('Opłacone ✓');
    });

  return (
    <div className="screen">
      <Header title="Finanse" sub="Przychody z zakończonych wizyt" />

      <div className="fin-tiles">
        <div className="fin-tile"><span>Dziś</span><b>{zl(t.today)}</b></div>
        <div className="fin-tile"><span>Ten tydzień</span><b>{zl(t.week)}</b></div>
        <div className="fin-tile wide">
          <span>Ten miesiąc</span>
          <b className="gold">{zl(t.month)}</b>
          <Change pct={t.monthChange} />
        </div>
        <div className="fin-tile wide">
          <span>Zaplanowane do końca miesiąca</span>
          <b>{zl(plan.amount)}</b>
          <span className="muted small">{plan.count} {plural(plan.count, 'umówiona wizyta', 'umówione wizyty', 'umówionych wizyt')} (wg wycen)</span>
        </div>
      </div>

      <Section title="Ostatnie 12 miesięcy">
        <MonthsChart months={months} />
      </Section>

      <Section title="Zakres">
        <div className="chips wrap" style={{ marginBottom: 8 }}>
          {Object.entries(presets).map(([k, p]) => (
            <button key={k} className={preset === k ? 'on' : ''} onClick={() => pick(k)}>{p.label}</button>
          ))}
        </div>
        <div className="grid2 keep-2">
          <input type="date" aria-label="Od" value={range.from} onChange={(e) => (setPreset(null), setRange({ ...range, from: e.target.value }))} />
          <input type="date" aria-label="Do" value={range.to} onChange={(e) => (setPreset(null), setRange({ ...range, to: e.target.value }))} />
        </div>
        <div className="fin-tiles" style={{ marginTop: 10 }}>
          <div className="fin-tile"><span>Przychód</span><b className="gold">{zl(sum.sum)}</b></div>
          <div className="fin-tile"><span>Wizyty</span><b>{sum.count}</b></div>
          <div className="fin-tile wide"><span>Średnia wartość wizyty</span><b>{zl(sum.avg)}</b></div>
        </div>
        <button className="btn block" onClick={exportCsv} disabled={!inR.length}>
          <Icon name="download" /> Eksport do CSV ({fmtDate(range.from)} – {fmtDate(range.to)})
        </button>
      </Section>

      <Section title="Top 5 usług wg przychodu">
        <HBars rows={top.map((s) => ({ key: s.name, label: s.name, amount: s.amount }))} empty="Brak zakończonych wizyt w tym zakresie." />
      </Section>

      <Section title="Formy płatności">
        <HBars
          rows={methods.map((m) => ({ key: m.method || 'none', label: m.label, amount: m.amount, sub: visitsLabel(m.count) }))}
          empty="Brak zakończonych wizyt w tym zakresie."
        />
      </Section>

      <Section title={`Nieopłacone wizyty${toPay.length ? ` · ${zl(toPay.reduce((a, v) => a + v.amount, 0))}` : ''}`}>
        {toPay.length === 0 && <Empty icon="check">Wszystkie zakończone wizyty są opłacone.</Empty>}
        {toPay.map((v) => (
          <div key={v.id} className="card list-item">
            <button className="card-main" style={{ flex: 1, minWidth: 0 }} onClick={() => go(`/job/${v.id}`)}>
              <div className="h3 ellipsis">{v.car || 'Auto'}{v.plate ? ` · ${v.plate}` : ''}</div>
              <div className="small muted ellipsis">{fmtDate(v.date)}{v.client ? ` · ${v.client}` : ''}{v.method ? ` · ${PAYMENT_METHODS[v.method]}` : ''}</div>
            </button>
            <div className="right-col">
              <strong className="gold">{zl(v.amount)}</strong>
              <button className="btn sm" onClick={() => markPaid(v)}>Opłacone</button>
            </div>
          </div>
        ))}
      </Section>

      <p className="fin-note small muted">Zestawienie pomocnicze, nie zastępuje kasy fiskalnej ani ewidencji księgowej.</p>
    </div>
  );
}

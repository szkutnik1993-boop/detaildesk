// Panel administratora platformy. Pokazuje WYŁĄCZNIE dane studiów (właścicieli) i zagregowane liczby –
// bez danych klientów studiów (imion, telefonów, aut, zdjęć). Dostęp sprawdza baza (funkcje admin_* + is_admin()).
import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, Field, Header, Section } from '../components/ui.jsx';
import { useUI } from '../store.jsx';
import { adminExtendStudio, adminListFeedback, adminListSales, adminListStudios, adminMarkPaid, adminSetAnnouncement, adminSetBlocked, adminSetFeedbackStatus, adminSetNotes } from '../lib/db.js';
import { QUARTER_LIMIT_CENTS, defaultPriceCents, limitLevel, quarterRange, salesCsv, sumInRange } from '../lib/revenue.js';
import { downloadBlob } from '../lib/utils.js';
import { studioStatus } from '../lib/subscription.js';
import { formatMoney } from '../lib/pricing.js';
import { fmtDate, fmtDateTime, toISO, todayISO } from '../lib/dates.js';
import { ownerCall, supabase } from '../lib/supabase.js';
import { bookingUrl } from '../config.js';

const zl = (cents) => `${formatMoney(Math.round((cents || 0) / 100))} zł`;
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
const daysAgo = (ts) => (ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : null);
const STATE_CLS = { trial: 'st-planned', paid: 'st-ready', lifetime: 'st-ready', expired: 'st-done' };

function StudioCard({ s, studios, reload }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(s.notes || '');
  const [amount, setAmount] = useState(() => String(defaultPriceCents(s, studios) / 100));
  const [invoice, setInvoice] = useState('');
  const [paidOn, setPaidOn] = useState(todayISO());
  const st = s.blocked ? { label: 'Zablokowane', state: 'expired', daysLeft: 0 } : studioStatus(s);
  const idle = daysAgo(s.last_sign_in);
  const risk = !s.blocked && st.state !== 'expired' && (idle === null || idle >= 14 || Number(s.bookings_month) + Number(s.jobs_month) === 0);
  const booking = bookingUrl(s.slug);

  // przedłużenie bez wpłaty (np. gratis); wpłaty – „Oznacz jako opłacone”
  const extend = (months) =>
    ui.run('Przedłużam…', async () => {
      if (!confirm(`Przedłużyć „${s.name}” o ${months} mies. bez rejestrowania wpłaty?`)) return;
      const until = await adminExtendStudio(s.id, months, null);
      ui.toast(`Aktywne do ${fmtDate(toISO(new Date(until)))}`);
      reload();
    });

  const markPaid = () =>
    ui.run('Zapisuję wpłatę…', async () => {
      const cents = Math.round(Number(String(amount).replace(',', '.')) * 100);
      if (!(cents > 0)) throw new Error('Podaj kwotę wpłaty.');
      if (!confirm(`Oznaczyć „${s.name}” jako opłacone: ${zl(cents)}, ${fmtDate(paidOn)}${invoice ? `, faktura ${invoice}` : ''}? Abonament przedłuży się o 1 miesiąc.`)) return;
      const r = await adminMarkPaid(s.id, cents, invoice, paidOn);
      setInvoice('');
      ui.toast(`Opłacone ✓ Aktywne do ${fmtDate(toISO(new Date(r.active_until)))}`);
      reload();
    });

  return (
    <div className={`card admin-studio ${risk ? 'risk' : ''}`}>
      <button className="card-main" onClick={() => setOpen(!open)}>
        <div className="row between">
          <div style={{ minWidth: 0 }}>
            <div className="h3 ellipsis">{s.name}</div>
            <div className="muted small ellipsis">{s.contact_email}{s.phone ? ` · ${s.phone}` : ''}</div>
          </div>
          <span className={`pill ${s.blocked ? 'st-done' : STATE_CLS[st.state]}`}>{st.label}</span>
        </div>
        <div className="admin-stats small">
          <span><b>{s.jobs_month}</b> zleceń / mies.</span>
          <span><b>{s.bookings_month}</b> rezerwacji online</span>
          <span>logowanie: <b>{idle === null ? 'nigdy' : idle === 0 ? 'dziś' : `${idle} dni temu`}</b></span>
        </div>
        <div className="small muted">
          od {fmtDate(toISO(new Date(s.created_at)))} · {s.plan === 'lifetime' ? 'bezterminowo' : `do ${fmtDate(toISO(new Date(s.active_until)))}${st.state !== 'expired' ? ` (${st.daysLeft} dni)` : ''}`}
          {risk && <span className="warn"> · może odejść</span>}
        </div>
      </button>
      {open && (
        <div className="admin-details">
          <div className="small muted">Link: <a className="gold" href={booking} target="_blank" rel="noreferrer">{booking}</a> · łącznie zleceń: {s.jobs_total} · wpłaty łącznie: {zl(s.revenue_cents)}</div>
          {s.plan !== 'lifetime' && (
            <>
              <div className="paid-box">
                <div className="field-label">Wpłata za abonament</div>
                <div className="grid3">
                  <Field label="Kwota (zł)">
                    <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} />
                  </Field>
                  <Field label="Data wpłaty">
                    <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
                  </Field>
                  <Field label="Nr faktury">
                    <input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="np. FV 1/2026" />
                  </Field>
                </div>
                <button className="btn primary block" style={{ marginTop: 0 }} onClick={markPaid}>
                  <Icon name="check" /> Oznacz jako opłacone (+1 mies.)
                </button>
                <div className="small muted">Domyślnie {defaultPriceCents(s, studios) === 2900 ? '29 zł – oferta założycielska (pierwsze 10 studiów)' : '49 zł – cena regularna'}.</div>
              </div>
              <div className="row gap">
                <button className="btn grow" onClick={() => extend(1)}>Przedłuż bez wpłaty o 1 mies.</button>
                <button className="btn grow" onClick={() => extend(12)}>o 12 mies.</button>
              </div>
            </>
          )}
          <Field label="Notatki (widoczne tylko dla Ciebie)">
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <button className="btn block" style={{ marginTop: 0 }} disabled={notes === (s.notes || '')} onClick={() => ui.run('Zapisuję…', async () => { await adminSetNotes(s.id, notes); ui.toast('Notatka zapisana'); reload(); })}>
            Zapisz notatkę
          </button>
          <button
            className={`btn block ${s.blocked ? '' : 'danger'}`}
            onClick={() =>
              confirm(s.blocked ? `Odblokować „${s.name}”?` : `Zablokować „${s.name}”? Aplikacja przejdzie w tryb tylko do odczytu, a rezerwacje zostaną wstrzymane.`) &&
              ui.run('Zapisuję…', async () => {
                await adminSetBlocked(s.id, !s.blocked);
                reload();
              })
            }
          >
            {s.blocked ? 'Odblokuj studio' : 'Zablokuj studio'}
          </button>
        </div>
      )}
    </div>
  );
}

function FeedbackItem({ f, reload }) {
  const ui = useUI();
  const [reply, setReply] = useState('');
  return (
    <div className={`card ${f.status === 'nowe' ? 'request' : ''}`}>
      <div className="row between">
        <div className="h3">{f.studio_name}</div>
        <span className="pill">{f.kind}</span>
      </div>
      <div className="small muted">{f.author_email} · {fmtDateTime(f.created_at)}</div>
      <div className="pre" style={{ margin: '10px 0' }}>{f.message}</div>
      {f.reply && (
        <div className="small reply-box">
          <b>Twoja odpowiedź</b> ({fmtDateTime(f.replied_at)}):<br />
          <span className="pre">{f.reply}</span>
        </div>
      )}
      <div className="chips" style={{ margin: '10px 0' }}>
        {['nowe', 'w realizacji', 'zrobione'].map((st) => (
          <button key={st} className={f.status === st ? 'on' : ''} onClick={() => ui.run('Zapisuję…', async () => { await adminSetFeedbackStatus(f.id, st); reload(); })}>
            {st}
          </button>
        ))}
      </div>
      <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Odpowiedz e-mailem…" />
      <button
        className="btn block"
        disabled={reply.trim().length < 2}
        onClick={() =>
          ui.run('Wysyłam odpowiedź…', async () => {
            const r = await ownerCall({ action: 'admin-reply', feedbackId: f.id, reply });
            setReply('');
            ui.toast(`Wysłano do ${r.to}`);
            reload();
          })
        }
      >
        <Icon name="sms" /> Wyślij odpowiedź
      </button>
    </div>
  );
}

export default function Admin() {
  const ui = useUI();
  const [tab, setTab] = useState('studios');
  const [studios, setStudios] = useState(null);
  const [sales, setSales] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [ann, setAnn] = useState({ title: '', body: '', current: null });
  const [err, setErr] = useState(null);

  const load = async () => {
    try {
      const [st, pay, fb, cur] = await Promise.all([
        adminListStudios(),
        adminListSales(),
        adminListFeedback(),
        supabase.from('announcements').select('*').eq('active', true).order('created_at', { ascending: false }).limit(1),
      ]);
      setStudios(st);
      setSales(pay);
      setFeedback(fb);
      setAnn((a) => ({ ...a, current: cur.data?.[0] || null }));
    } catch (e) {
      setErr(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  if (err) return <div className="screen"><Header title="Administrator" backTo="/settings" /><Empty>{err}</Empty></div>;
  if (!studios) return <div className="screen"><Header title="Administrator" backTo="/settings" /><div className="center-load"><div className="spinner" /></div></div>;

  const now = new Date();
  const states = studios.map((s) => (s.blocked ? 'blocked' : studioStatus(s, now).state));
  const count = (k) => states.filter((x) => x === k).length;
  // przychód w bieżącym kwartale (data wpłaty, czas polski) i limit działalności nierejestrowanej
  const q = quarterRange(todayISO());
  const qRevenue = sumInRange(sales, q.start, q.end);
  const lim = limitLevel(qRevenue);
  const year = todayISO().slice(0, 4);
  const exportCsv = (from, to, name) => downloadBlob(new Blob([salesCsv(sales, { from, to })], { type: 'text/csv;charset=utf-8' }), name);
  const newFb = feedback.filter((f) => f.status === 'nowe').length;

  return (
    <div className="screen">
      <Header title="Administrator" sub="DetailDesk – wszystkie studia" backTo="/settings" />

      <div className="admin-kpis">
        <div><b>{studios.length}</b><span>studiów</span></div>
        <div><b>{count('trial')}</b><span>próbnych</span></div>
        <div><b>{count('paid') + count('lifetime')}</b><span>aktywnych</span></div>
        <div><b>{count('expired') + count('blocked')}</b><span>wygasłych / zablok.</span></div>
      </div>

      <div className={`card quarter quarter-${lim.level}`}>
        <div className="row between">
          <div>
            <div className="small muted">Przychód – {q.label}</div>
            <div className="quarter-sum">{zl(qRevenue)}</div>
          </div>
          <div className="right-col small">
            <span className="muted">limit {zl(QUARTER_LIMIT_CENTS)}</span>
            <b>{lim.pct.toFixed(1).replace('.', ',')}%</b>
          </div>
        </div>
        <div className="limit-bar" role="progressbar" aria-valuenow={Math.round(lim.pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Wykorzystanie kwartalnego limitu przychodu">
          <div style={{ width: `${Math.min(100, lim.pct)}%` }} />
        </div>
        <div className="small muted">
          {lim.level === 'danger' ? '⚠️ Ponad 95% limitu – rozważ rejestrację działalności.' : lim.level === 'warn' ? 'Ponad 80% limitu kwartalnego.' : `Do limitu zostało ${zl(lim.left)}.`}
        </div>
        <div className="row gap wrap" style={{ marginTop: 10 }}>
          <button className="btn sm grow" onClick={() => exportCsv(q.start, q.end, `ewidencja-sprzedazy-${year}-Q${q.quarter}.csv`)}><Icon name="download" size={18} /> CSV – kwartał</button>
          <button className="btn sm grow" onClick={() => exportCsv(`${year}-01-01`, `${year}-12-31`, `ewidencja-sprzedazy-${year}.csv`)}><Icon name="download" size={18} /> CSV – rok {year}</button>
        </div>
      </div>

      <div className="tabs-inline wrap">
        <button className={tab === 'studios' ? 'on' : ''} onClick={() => setTab('studios')}>Studia</button>
        <button className={tab === 'payments' ? 'on' : ''} onClick={() => setTab('payments')}>Płatności</button>
        <button className={tab === 'feedback' ? 'on' : ''} onClick={() => setTab('feedback')}>Pomysły{newFb ? ` (${newFb})` : ''}</button>
        <button className={tab === 'ann' ? 'on' : ''} onClick={() => setTab('ann')}>Ogłoszenie</button>
      </div>

      {tab === 'studios' && (
        <>
          <div className="small muted" style={{ marginBottom: 10 }}>Stuknij studio, aby przedłużyć, dodać notatkę lub zablokować. Widzisz tylko liczby – bez danych klientów studiów.</div>
          {studios.map((s) => <StudioCard key={s.id} s={s} studios={studios} reload={load} />)}
        </>
      )}

      {tab === 'payments' && (
        <Section title={`Ewidencja wpłat · ${q.label}: ${zl(qRevenue)}`}>
          {sales.length === 0 && <Empty>Brak wpłat. Dodasz je przyciskiem „Oznacz jako opłacone” przy studiu.</Empty>}
          {[...sales].reverse().map((p) => (
            <div key={p.id} className="card list-item">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="h3 ellipsis">{p.studio_name}</div>
                <div className="small muted">
                  {fmtDate(p.paid_on)}{p.invoice_number ? ` · ${p.invoice_number}` : ''}{p.studio_nip ? ` · NIP ${p.studio_nip}` : ' · brak NIP'}
                </div>
              </div>
              <strong className="gold">{zl(p.amount_cents)}</strong>
            </div>
          ))}
        </Section>
      )}

      {tab === 'feedback' && (
        <Section title="Pomysły i uwagi od studiów">
          {feedback.length === 0 && <Empty icon="sms">Brak wiadomości.</Empty>}
          {feedback.map((f) => <FeedbackItem key={f.id} f={f} reload={load} />)}
        </Section>
      )}

      {tab === 'ann' && (
        <Section title="Ogłoszenie do wszystkich studiów">
          {ann.current && (
            <div className="announcement">
              <strong className="gold">{ann.current.title}</strong>
              <div className="small pre">{ann.current.body}</div>
              <div className="small muted">opublikowane {fmtDateTime(ann.current.created_at)}</div>
              <button className="btn block danger" onClick={() => ui.run('Usuwam…', async () => { await adminSetAnnouncement('', ''); load(); })}>Wyłącz ogłoszenie</button>
            </div>
          )}
          <div className="card form">
            <Field label="Tytuł"><input value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} placeholder="np. Nowa funkcja: wysyłka protokołu mailem" /></Field>
            <Field label="Treść"><textarea rows={4} value={ann.body} onChange={(e) => setAnn({ ...ann, body: e.target.value })} /></Field>
            <button
              className="btn primary block"
              disabled={ann.title.trim().length < 2 || ann.body.trim().length < 2}
              onClick={() => ui.run('Publikuję…', async () => { await adminSetAnnouncement(ann.title, ann.body); setAnn({ title: '', body: '', current: null }); ui.toast('Ogłoszenie opublikowane'); load(); })}
            >
              Opublikuj (zastąpi obecne)
            </button>
            <div className="small muted">Ogłoszenie pojawi się na ekranie „Dziś” w aplikacji każdego studia, dopóki go nie zamknie.</div>
          </div>
        </Section>
      )}
    </div>
  );
}

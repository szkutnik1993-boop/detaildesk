import Icon from '../components/Icon.jsx';
import { InstallBanner } from './InstallGuide.jsx';
import { Empty, Header, JobCard, Section } from '../components/ui.jsx';
import { useData, useUI } from '../store.jsx';
import { go } from '../router.js';
import { fmtDayLong, fmtDate, todayISO } from '../lib/dates.js';
import { carLabel, computeReminders } from '../lib/reminders.js';
import { fillTemplate, formatMoney } from '../lib/pricing.js';
import { applyTransition } from '../lib/status.js';
import { smsLink } from '../lib/utils.js';

const ORDER = { w_trakcie: 0, gotowe: 1, umowione: 2 };

export default function Today() {
  const { data, api } = useData();
  const ui = useUI();
  const today = todayISO();
  const s = data.settings;
  const carById = Object.fromEntries(data.cars.map((c) => [c.id, c]));

  const requests = data.jobs.filter((j) => j.status === 'zapytanie').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const inStudio = data.jobs
    .filter((j) => j.status === 'w_trakcie' || j.status === 'gotowe' || (j.status === 'umowione' && j.date === today))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.time || '').localeCompare(b.time || ''));

  const reminders = computeReminders({ jobs: data.jobs, quotes: data.quotes, cars: data.cars, settings: s, log: data.reminderLog, today });

  const handOver = (job) =>
    ui.run('Zapisuję…', async () => {
      await api.save('jobs', applyTransition(job, 'odebrane').job);
      ui.toast('Auto odebrane ✓');
    });

  return (
    <div className="screen">
      <Header
        title="Dziś"
        sub={fmtDayLong(today)}
        right={
          <button className="icon-btn" aria-label="Ustawienia" onClick={() => go('/settings')}>
            <Icon name="settings" size={22} />
          </button>
        }
      />

      <InstallBanner />

      <div className="big-actions">
        <button className="btn primary big" onClick={() => go('/quote/new')}>
          <Icon name="quote" size={24} />
          Nowa wycena
        </button>
        <button className="btn big" onClick={() => go('/intake')}>
          <Icon name="clipboard" size={24} />
          Przyjmij auto
        </button>
      </div>

      {requests.length > 0 && (
        <Section title={`Nowe zapytania · ${requests.length}`}>
          {requests.map((j) => {
            const car = carById[j.carId];
            return (
              <button key={j.id} className="card list-item request" onClick={() => go(`/job/${j.id}`)}>
                <div className="reminder-icon"><Icon name="bell" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="h3 ellipsis">{j.client?.name || car?.ownerName} · {carLabel(car)}</div>
                  <div className="muted small ellipsis">
                    {(j.services || []).map((x) => x.name).join(', ')} · ok. {formatMoney(j.price)} zł
                  </div>
                  <div className="small gold">Propozycje: {(j.proposedSlots || []).map((p) => `${fmtDate(p.date)}${p.time ? ' ' + p.time : ''}`).join(', ')}</div>
                </div>
                <Icon name="chevron" className="muted" />
              </button>
            );
          })}
        </Section>
      )}

      <Section title={`W studiu${inStudio.length ? ` · ${inStudio.length}` : ''}`}>
        {inStudio.length === 0 && <Empty>Brak aut w studiu. Umówione na dziś zlecenia pojawią się tutaj.</Empty>}
        {inStudio.map((job) => {
          const car = carById[job.carId];
          return (
            <JobCard key={job.id} job={job} car={car}>
              {job.status === 'umowione' && (
                <button className="btn sm primary" onClick={() => go(`/intake?jobId=${job.id}`)}>
                  <Icon name="clipboard" size={18} /> Przyjmij
                </button>
              )}
              {job.status === 'w_trakcie' && (
                <>
                  <button className="btn sm" onClick={() => go(`/job/${job.id}?stage=1`)}>
                    <Icon name="camera" size={18} /> Zdjęcie etapu
                  </button>
                  <button className="btn sm primary" onClick={() => go(`/job/${job.id}?ready=1`)}>
                    <Icon name="check" size={18} /> Auto gotowe
                  </button>
                </>
              )}
              {job.status === 'gotowe' && (
                <>
                  <a
                    className="btn sm"
                    href={smsLink(car?.ownerPhone || job.client?.phone, fillTemplate(s.templates.ready, { auto: carLabel(car), podpis: s.studio.signature, studio: s.studio.name }))}
                  >
                    <Icon name="sms" size={18} /> SMS
                  </a>
                  <button className="btn sm primary" onClick={() => handOver(job)}>
                    <Icon name="key" size={18} /> Odebrane
                  </button>
                </>
              )}
            </JobCard>
          );
        })}
      </Section>

      <Section title={`Przypomnienia do wysłania${reminders.length ? ` · ${reminders.length}` : ''}`}>
        {reminders.length === 0 && <Empty icon="bell">Nic do wysłania. Przypomnienia o serwisie powłoki i wycenach pojawią się automatycznie.</Empty>}
        {reminders.map((r) => (
          <div key={r.id} className="card reminder">
            <a
              className="card-main reminder-main"
              href={smsLink(r.phone, r.text)}
              onClick={() => {
                api.logReminder(r.id, 'sent');
                ui.toast('Otwieram SMS…');
              }}
            >
              <div className={`reminder-icon ${r.type}`}>
                <Icon name={r.type === 'coating' ? 'shield' : 'quote'} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="h3">{r.title}</div>
                <div className="muted small ellipsis">{r.subtitle}</div>
                {!r.phone && <div className="small warn">Brak numeru telefonu</div>}
              </div>
              <Icon name="sms" className="gold" />
            </a>
            <button className="link-btn small reminder-skip" onClick={() => api.logReminder(r.id, 'skipped')}>
              Pomiń
            </button>
          </div>
        ))}
      </Section>
    </div>
  );
}

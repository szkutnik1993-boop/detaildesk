import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field, Header, PhotoButtons, PhotoSet, Section, StatusPill, Thumb } from '../components/ui.jsx';
import { useData, useUI } from '../store.jsx';
import { go, replace } from '../router.js';
import { fmtDate, fmtDateTime, nowISO, todayISO } from '../lib/dates.js';
import { carLabel } from '../lib/reminders.js';
import { calcQuote, fillTemplate, formatMoney } from '../lib/pricing.js';
import { applyTransition } from '../lib/status.js';
import { fmtTermPL } from '../lib/ics.js';
import { parseNum, smsLink, telLink } from '../lib/utils.js';
import { clientJobUrl, ownerCall } from '../lib/supabase.js';

export default function JobEdit({ id, query }) {
  const { data, api } = useData();
  const ui = useUI();
  const s = data.settings;
  const existing = id ? data.jobs.find((j) => j.id === id) : null;
  const [job, setJob] = useState(
    () =>
      existing || {
        carId: query.carId || '',
        date: query.date || todayISO(),
        time: '',
        status: 'umowione',
        services: [],
        chemicals: '',
        notes: '',
        photosBefore: [],
        photosAfter: [],
        timeline: [{ type: 'status', status: 'umowione', at: new Date().toISOString() }],
      }
  );
  const [notice, setNotice] = useState(null);
  const [finalPrice, setFinalPrice] = useState('');
  const [stage, setStage] = useState(s.stages[0]);
  const [stageCaption, setStageCaption] = useState('');
  const stagesRef = useRef();
  const readyRef = useRef();
  const set = (patch) => setJob((j) => ({ ...j, ...patch }));

  useEffect(() => {
    if (query.stage) stagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (query.ready) readyRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [query.stage, query.ready]);

  if (id && !existing && !job.id) return <div className="screen"><Header title="Zlecenie" backTo="/calendar" /><div className="empty">Nie znaleziono zlecenia.</div></div>;

  const car = data.cars.find((c) => c.id === job.carId);
  const phone = car?.ownerPhone || job.client?.phone;
  const email = job.client?.email || car?.ownerEmail;
  const total = (job.services || []).reduce((sum, x) => sum + parseNum(x.price), 0);
  const protocol = data.protocols.find((p) => p.jobId === job.id);
  const quote = data.quotes.find((q) => q.id === job.quoteId);
  const link = job.token ? clientJobUrl(job.token) : null;
  const photos = (job.timeline || []).filter((t) => t.type === 'photo');

  const clean = (j = job) => ({ ...j, services: (j.services || []).filter((x) => x.name).map((x) => ({ ...x, price: parseNum(x.price) })), price: total });

  const persist = async (j) => {
    const saved = await api.save('jobs', j);
    setJob(saved);
    if (!existing) replace(`/job/${saved.id}`);
    return saved;
  };

  const notify = async (saved, type) => {
    if (!email) return setNotice({ warn: true, text: 'Klient nie ma adresu e-mail – wyślij SMS.' });
    try {
      const r = await ownerCall({ action: 'notify', jobId: saved.id, type });
      setNotice(r.skipped ? { warn: true, text: `E-mail pominięty: ${r.skipped}` } : { text: `E-mail wysłany do ${r.to} ✓` });
    } catch (e) {
      setNotice({ warn: true, text: `Zapisano, ale e-mail nie wyszedł: ${e.message}` });
    }
  };

  const transition = (to, opts, label) =>
    ui.run(label, async () => {
      const { job: next, notify: n } = applyTransition(clean(), to, opts);
      const saved = await persist(next);
      if (n) await notify(saved, n);
      else ui.toast('Zapisano ✓');
    });

  const addService = (sid) => {
    if (!sid) return;
    if (sid === '__custom') return set({ services: [...job.services, { name: '', price: 0, coating: false }] });
    const r = calcQuote({ serviceIds: [sid], sizeId: car?.size, paintId: 'good' }, s).items[0];
    set({ services: [...job.services, { serviceId: sid, name: r.name, price: r.price, coating: r.coating }] });
  };
  const setLine = (i, patch) => set({ services: job.services.map((x, k) => (k === i ? { ...x, ...patch } : x)) });

  const save = () =>
    ui.run('Zapisuję…', async () => {
      if (!job.carId) throw new Error('Wybierz auto.');
      await persist(clean());
      ui.toast('Zapisano zlecenie');
    });

  // zdjęcia przed/po – w istniejącym zleceniu zapis od razu
  const setPhotos = async (field, ids) => {
    set({ [field]: ids });
    if (job.id) await persist({ ...job, [field]: ids }).then(() => ui.toast('Zdjęcia zapisane'));
  };

  const addStagePhotos = async (paths) => {
    const at = nowISO();
    const items = paths.map((path) => ({ type: 'photo', path, stage, caption: stageCaption.trim(), at: new Date().toISOString(), local: at }));
    await persist({ ...job, timeline: [...(job.timeline || []), ...items] });
    setStageCaption('');
    ui.toast('Zdjęcie widoczne dla klienta ✓');
  };
  const removeStagePhoto = async (path) => {
    if (!confirm('Usunąć zdjęcie z osi czasu klienta?')) return;
    await persist({ ...job, timeline: job.timeline.filter((t) => t.path !== path) });
    api.removePhoto(path);
  };

  const confirmSms = fillTemplate(s.templates.confirm, {
    studio: s.studio.name,
    termin: job.date ? fmtTermPL(job.date, job.time) : '',
    link: link || '',
    podpis: s.studio.signature,
  });
  const readySms = fillTemplate(s.templates.ready, { auto: carLabel(car), podpis: s.studio.signature, studio: s.studio.name });

  const remove = async () => {
    if (!confirm('Usunąć to zlecenie?')) return;
    await api.remove('jobs', job.id);
    ui.toast('Usunięto');
    go('/calendar');
  };

  return (
    <div className="screen">
      <Header title={job.id ? carLabel(car) : 'Nowe zlecenie'} sub={job.id ? [car?.plate, car?.ownerName || job.client?.name].filter(Boolean).join(' · ') : null} backTo="/calendar" right={job.id ? <StatusPill status={job.status} /> : null} />

      {notice && (
        <div className={`notice ${notice.warn ? '' : 'ok'}`} onClick={() => setNotice(null)}>
          <Icon name={notice.warn ? 'bell' : 'check'} />
          <span>{notice.text}</span>
        </div>
      )}

      {/* ---------- PRZEPŁYW ---------- */}
      {job.status === 'zapytanie' && (
        <Section title="Zapytanie od klienta">
          <div className="card form">
            <div className="kv">
              <div><span>Klient</span>{job.client?.name}</div>
              <div><span>Telefon</span><a className="gold" href={telLink(phone)}>{phone}</a></div>
              <div className="full"><span>E-mail</span>{email}</div>
              <div><span>Wycena orient.</span>{formatMoney(job.estimate ?? job.price)} zł</div>
              <div><span>Wysłano</span>{job.createdAt ? fmtDateTime(job.createdAt) : '—'}</div>
              {job.note && <div className="full"><span>Uwagi klienta</span>{job.note}</div>}
            </div>
            <div className="field-label">Proponowane terminy – stuknij, aby wybrać</div>
            <div className="chips wrap" style={{ marginBottom: 0 }}>
              {(job.proposedSlots || []).map((p, i) => (
                <button key={i} className={job.date === p.date && (job.time || '') === (p.time || '') ? 'on' : ''} onClick={() => set({ date: p.date, time: p.time || '' })}>
                  {fmtDate(p.date)}{p.time ? `, ${p.time}` : ''}
                </button>
              ))}
            </div>
            <div className="grid2">
              <Field label="Data wizyty"><input type="date" value={job.date || ''} onChange={(e) => set({ date: e.target.value })} /></Field>
              <Field label="Godzina"><input type="time" value={job.time || ''} onChange={(e) => set({ time: e.target.value })} /></Field>
            </div>
            <button className="btn primary block big-one" onClick={() => transition('umowione', { date: job.date, time: job.time }, 'Potwierdzam termin…')}>
              <Icon name="check" /> Potwierdź termin
            </button>
            <div className="small muted">Klient dostanie e-mail z terminem, plikiem kalendarza i linkiem do strony zlecenia.</div>
            <button className="btn block ghost" onClick={() => confirm('Anulować zapytanie?') && transition('anulowane', {}, 'Zapisuję…')}>Odrzuć / anuluj</button>
          </div>
        </Section>
      )}

      {job.status === 'umowione' && job.id && (
        <Section title="Termin">
          <div className="card form">
            <div className="h3 gold">{job.date ? fmtTermPL(job.date, job.time) : '—'}</div>
            <div className="action-row two" style={{ marginTop: 0 }}>
              <a className={`btn ${phone ? '' : 'disabled'}`} href={phone ? smsLink(phone, confirmSms) : undefined}>
                <Icon name="sms" /> SMS z potwierdzeniem
              </a>
              <button className="btn primary" onClick={() => go(`/intake?jobId=${job.id}`)}>
                <Icon name="clipboard" /> Przyjmij auto
              </button>
            </div>
            <details>
              <summary className="link-btn small">Zmień termin</summary>
              <div className="grid2" style={{ marginTop: 8 }}>
                <Field label="Data"><input type="date" value={job.date || ''} onChange={(e) => set({ date: e.target.value })} /></Field>
                <Field label="Godzina"><input type="time" value={job.time || ''} onChange={(e) => set({ time: e.target.value })} /></Field>
              </div>
              <button className="btn block" onClick={() => ui.run('Zapisuję termin…', async () => { const saved = await persist({ ...clean(), confirmedAt: new Date().toISOString() }); await notify(saved, 'confirmed'); })}>
                <Icon name="check" /> Zapisz i wyślij nowe potwierdzenie
              </button>
            </details>
            <button className="btn block ghost" onClick={() => confirm('Anulować wizytę?') && transition('anulowane', {}, 'Zapisuję…')}>Anuluj wizytę</button>
          </div>
        </Section>
      )}

      {(job.status === 'w_trakcie' || job.status === 'gotowe') && (
        <div ref={stagesRef}>
          <Section title="Postęp prac – widoczny dla klienta">
            <div className="card form">
              <div className="chips wrap" style={{ marginBottom: 0 }}>
                {s.stages.map((st) => (
                  <button key={st} className={stage === st ? 'on' : ''} onClick={() => setStage(st)}>{st}</button>
                ))}
              </div>
              <input value={stageCaption} onChange={(e) => setStageCaption(e.target.value)} placeholder="Podpis (opcjonalnie), np. po pierwszym etapie polerki" />
              <PhotoButtons onFiles={addStagePhotos} labelCamera={`Zdjęcie: ${stage}`} />
              {photos.length > 0 && (
                <div className="stage-list">
                  {[...photos].reverse().map((p) => (
                    <div key={p.path} className="damage">
                      <Thumb id={p.path} caption={`${p.stage}${p.caption ? ' – ' + p.caption : ''}`} />
                      <div className="grow">
                        <div className="strong">{p.stage}</div>
                        {p.caption && <div className="small">{p.caption}</div>}
                        <div className="small muted">{fmtDateTime(p.local || p.at)}</div>
                        <button className="link-btn small danger-text" onClick={() => removeStagePhoto(p.path)}>Usuń</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </div>
      )}

      {job.status === 'w_trakcie' && (
        <div ref={readyRef}>
          <Section title="Auto gotowe">
            <div className="card form">
              <Field label="Kwota końcowa (zł)">
                <input inputMode="numeric" placeholder={String(total || job.price || '')} value={finalPrice} onChange={(e) => setFinalPrice(e.target.value.replace(/[^\d]/g, ''))} />
              </Field>
              <button className="btn primary block big-one" onClick={() => transition('gotowe', { finalPrice: parseNum(finalPrice || total || job.price) }, 'Zapisuję…')}>
                <Icon name="check" /> Auto gotowe – powiadom klienta
              </button>
              <div className="small muted">Klient dostanie e-mail „Zapraszamy po odbiór” z kwotą; strona zlecenia pokaże to samo.</div>
            </div>
          </Section>
        </div>
      )}

      {job.status === 'gotowe' && (
        <Section title="Gotowe do odbioru">
          <div className="card form">
            <div className="total-row"><span>Do zapłaty</span><strong className="gold">{formatMoney(job.finalPrice)} zł</strong></div>
            <div className="action-row two" style={{ marginTop: 0 }}>
              <a className={`btn ${phone ? '' : 'disabled'}`} href={phone ? smsLink(phone, readySms) : undefined}><Icon name="sms" /> SMS: gotowe</a>
              <button className="btn primary" onClick={() => transition('odebrane', {}, 'Zapisuję…')}><Icon name="key" /> Odebrane</button>
            </div>
            <button className="btn block ghost" onClick={() => ui.run('Wysyłam…', () => notify(job, 'ready'))}>Wyślij ponownie e-mail</button>
          </div>
        </Section>
      )}

      {link && job.status !== 'anulowane' && (
        <div className="card list-item client-link">
          <Icon name="share" className="gold" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="h3">Strona zlecenia klienta</div>
            <div className="muted small ellipsis">{link}</div>
          </div>
          <button className="btn sm" onClick={() => (navigator.share ? navigator.share({ url: link, title: 'Twoje zlecenie – ARC Detailing' }).catch(() => {}) : navigator.clipboard.writeText(link).then(() => ui.toast('Skopiowano link')))}>
            Udostępnij
          </button>
        </div>
      )}

      {/* ---------- DANE ZLECENIA ---------- */}
      <Section title="Dane zlecenia">
        <div className="card form">
          <Field label="Auto">
            <select value={job.carId} onChange={(e) => (e.target.value === '__new' ? go('/car/new') : set({ carId: e.target.value }))}>
              <option value="">— wybierz auto —</option>
              {[...data.cars]
                .sort((a, b) => carLabel(a).localeCompare(carLabel(b)))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {carLabel(c)} {c.plate ? `· ${c.plate}` : ''} {c.ownerName ? `· ${c.ownerName}` : ''}
                  </option>
                ))}
              <option value="__new">+ Dodaj nowe auto…</option>
            </select>
          </Field>
          {job.status !== 'zapytanie' && (
            <div className="grid2">
              <Field label="Data"><input type="date" value={job.date || ''} onChange={(e) => set({ date: e.target.value })} /></Field>
              <Field label="Godzina"><input type="time" value={job.time || ''} onChange={(e) => set({ time: e.target.value })} /></Field>
            </div>
          )}
          {(job.status === 'gotowe' || job.status === 'odebrane') && (
            <Field label="Data wykonania" hint="Od tej daty liczy się przypomnienie o serwisie powłoki.">
              <input type="date" value={job.doneDate || todayISO()} onChange={(e) => set({ doneDate: e.target.value })} />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Usługi">
        <div className="card form">
          {job.services.length === 0 && <div className="muted small">Dodaj usługi z cennika (cena wg wielkości auta).</div>}
          {job.services.map((x, i) => (
            <div key={i} className="line">
              <input className="grow" value={x.name} placeholder="Nazwa usługi" onChange={(e) => setLine(i, { name: e.target.value })} />
              <input className="price" inputMode="decimal" value={x.price} onChange={(e) => setLine(i, { price: e.target.value })} />
              <span className="muted">zł</span>
              <button className="icon-btn" aria-label="Usuń usługę" onClick={() => set({ services: job.services.filter((_, k) => k !== i) })}>
                <Icon name="x" size={18} />
              </button>
            </div>
          ))}
          <select value="" onChange={(e) => addService(e.target.value)}>
            <option value="">+ Dodaj usługę…</option>
            {s.services.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
            <option value="__custom">Własna pozycja…</option>
          </select>
          <div className="total-row">
            <span>Razem (orientacyjnie)</span>
            <strong className="gold">{formatMoney(total)} zł</strong>
          </div>
        </div>
      </Section>

      <Section title="Użyta chemia i notatki">
        <div className="card form">
          <Field label="Użyta chemia">
            <textarea rows={3} value={job.chemicals || ''} onChange={(e) => set({ chemicals: e.target.value })} placeholder="np. Gyeon Mohs EVO, pasta Menzerna 3500, pad Lake Country…" />
          </Field>
          <Field label="Notatki (widoczne tylko dla Ciebie)">
            <textarea rows={2} value={job.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title="Zdjęcia przed / po (prywatne)">
        <div className="card form">
          <PhotoSet title="Przed" ids={job.photosBefore || []} onChange={(ids) => setPhotos('photosBefore', ids)} />
          <PhotoSet title="Po" ids={job.photosAfter || []} onChange={(ids) => setPhotos('photosAfter', ids)} />
        </div>
      </Section>

      {(protocol || quote) && (
        <Section title="Powiązane">
          {protocol && (
            <button className="card list-item" onClick={() => go(`/protocol/${protocol.id}`)}>
              <Icon name="clipboard" className="gold" /> <span style={{ flex: 1 }}>Protokół przyjęcia</span> <Icon name="chevron" />
            </button>
          )}
          {quote && (
            <button className="card list-item" onClick={() => go(`/quote/${quote.id}`)}>
              <Icon name="quote" className="gold" /> <span style={{ flex: 1 }}>Wycena · {formatMoney(quote.total)} zł</span> <Icon name="chevron" />
            </button>
          )}
        </Section>
      )}

      <div className="sticky-actions">
        <button className="btn primary grow" onClick={save}>
          <Icon name="check" /> Zapisz zmiany
        </button>
      </div>
      {job.id && (
        <button className="btn danger block" style={{ marginTop: 24 }} onClick={remove}>
          <Icon name="trash" /> Usuń zlecenie
        </button>
      )}
    </div>
  );
}


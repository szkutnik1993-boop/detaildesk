import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field, Header, Section, Segmented } from '../components/ui.jsx';
import { useData, useUI } from '../store.jsx';
import { go, replace } from '../router.js';
import { addDays, fmtDate, nowISO, todayISO } from '../lib/dates.js';
import { carLabel } from '../lib/reminders.js';
import { calcQuote, formatMoney, quoteSmsText } from '../lib/pricing.js';
import { quotePdf } from '../lib/pdf.js';
import { smsLink } from '../lib/utils.js';

const fmtMult = (m) => `×${String(m).replace('.', ',')}`;

export const QUOTE_STATUS = {
  szkic: { label: 'Szkic', cls: '' },
  wysłana: { label: 'Wysłana', cls: 'st-planned' },
  przyjęta: { label: 'Przyjęta', cls: 'st-ready' },
  odrzucona: { label: 'Odrzucona', cls: 'st-done' },
};

export default function Quote({ id, query }) {
  const { data, api } = useData();
  const ui = useUI();
  const s = data.settings;
  const existing = id ? data.quotes.find((q) => q.id === id) : null;
  const linkedCar = data.cars.find((c) => c.id === (existing?.carId || query.carId));

  const [form, setForm] = useState(() =>
    existing
      ? { ...existing }
      : {
          carId: linkedCar?.id || null,
          clientName: linkedCar?.ownerName || '',
          phone: linkedCar?.ownerPhone || '',
          carLabel: linkedCar ? [carLabel(linkedCar), linkedCar.plate].filter(Boolean).join(' · ') : '',
          sizeId: linkedCar?.size || s.sizes[1]?.id || s.sizes[0].id,
          paintId: s.paints[0].id,
          serviceIds: [],
          customText: null,
          notes: '',
          status: 'szkic',
        }
  );
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const calc = useMemo(() => calcQuote(form, s), [form, s]);
  const autoText = quoteSmsText(calc, s);
  const text = form.customText ?? autoText;
  const [scheduleDate, setScheduleDate] = useState(addDays(todayISO(), 1));

  const toggle = (sid) => set({ serviceIds: form.serviceIds.includes(sid) ? form.serviceIds.filter((x) => x !== sid) : [...form.serviceIds, sid] });

  const persist = async (patch = {}, navigate = true) => {
    const q = { ...form, ...patch, items: calc.items, total: calc.total, text };
    const saved = await api.save('quotes', q);
    setForm(saved);
    if (navigate && !existing && !id) replace(`/quote/${saved.id}`);
    return saved;
  };

  const sendSms = () => {
    if (!calc.items.length) return alert('Wybierz przynajmniej jedną usługę.');
    // link otwieramy od razu (gest użytkownika), zapis w tle
    window.location.href = smsLink(form.phone, text);
    persist(form.status === 'szkic' || form.status === 'wysłana' ? { status: 'wysłana', sentAt: nowISO() } : {}, false);
  };

  const makePdf = async () => {
    if (!calc.items.length) return alert('Wybierz przynajmniej jedną usługę.');
    await ui.run('Tworzę ofertę PDF…', async () => {
      const saved = await persist(form.status === 'szkic' ? { status: 'wysłana', sentAt: nowISO() } : {});
      ui.showFile(await quotePdf(saved, s));
    });
  };

  const accept = async () => {
    await ui.run('Tworzę zlecenie…', async () => {
      let carId = form.carId;
      if (!carId) {
        const car = await api.save('cars', { make: form.carLabel, model: '', plate: '', size: form.sizeId, ownerName: form.clientName, ownerPhone: form.phone });
        carId = car.id;
      }
      const job = await api.save('jobs', {
        carId,
        date: scheduleDate,
        time: '',
        status: 'umowione',
        services: calc.items.map((i) => ({ serviceId: i.id, name: i.name, price: i.price, coating: i.coating })),
        price: calc.total,
        chemicals: '',
        notes: form.notes || '',
        photosBefore: [],
        photosAfter: [],
        quoteId: form.id,
        timeline: [{ type: 'status', status: 'umowione', at: new Date().toISOString() }],
      });
      await persist({ status: 'przyjęta', carId, jobId: job.id });
      ui.toast('Umówiono zlecenie');
      go(`/job/${job.id}`);
    });
  };

  const remove = async () => {
    if (!confirm('Usunąć tę wycenę?')) return;
    await api.remove('quotes', form.id);
    go('/quotes');
  };

  return (
    <div className="screen">
      <Header title={existing ? 'Wycena' : 'Nowa wycena'} sub={existing ? `${fmtDate(existing.createdAt)} · ${QUOTE_STATUS[form.status]?.label}` : null} backTo="/quotes" />

      <div className="card form">
        <div className="grid2">
          <Field label="Klient">
            <input value={form.clientName} onChange={(e) => set({ clientName: e.target.value })} placeholder="Imię" autoComplete="off" />
          </Field>
          <Field label="Telefon">
            <input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="np. 600 100 200" autoComplete="off" />
          </Field>
        </div>
        <Field label="Auto">
          <input value={form.carLabel} onChange={(e) => set({ carLabel: e.target.value })} placeholder="np. Audi A6 Avant" />
        </Field>
        <Field label="Wielkość auta">
          <Segmented options={s.sizes.map((x) => ({ value: x.id, label: x.name, sub: fmtMult(x.mult) }))} value={form.sizeId} onChange={(v) => set({ sizeId: v })} />
        </Field>
      </div>

      <Section title="Usługi">
        <div className="services">
          {s.services.map((x) => {
            const on = form.serviceIds.includes(x.id);
            const item = calc.items.find((i) => i.id === x.id);
            const preview = item || calcQuote({ ...form, serviceIds: [x.id] }, s).items[0];
            return (
              <button key={x.id} type="button" className={`service ${on ? 'on' : ''}`} onClick={() => toggle(x.id)} aria-pressed={on}>
                <span className="service-check">{on && <Icon name="check" size={16} />}</span>
                <span className="service-name">
                  {x.name}
                  <small>od {formatMoney(x.price)} zł{x.correction ? ' · zależy od lakieru' : ''}</small>
                </span>
                <span className="service-price">{formatMoney(preview.price)} zł</span>
              </button>
            );
          })}
        </div>
      </Section>

      {calc.needsPaint && (
        <Section title="Stan lakieru (korekty)">
          <Segmented options={s.paints.map((x) => ({ value: x.id, label: x.name, sub: fmtMult(x.mult) }))} value={form.paintId} onChange={(v) => set({ paintId: v })} />
        </Section>
      )}

      <div className="total-card">
        <span>Wycena wstępna</span>
        <strong>{formatMoney(calc.total)} zł</strong>
        <small>zaokrąglone do {s.rounding} zł</small>
      </div>

      <Section
        title="Treść SMS"
        right={
          form.customText !== null && form.customText !== undefined ? (
            <button className="link-btn small" onClick={() => set({ customText: null })}>Przywróć automatyczny</button>
          ) : null
        }
      >
        <textarea className="sms-preview" rows={5} value={text} onChange={(e) => set({ customText: e.target.value })} />
      </Section>

      <div className="sticky-actions">
        <button className="btn primary grow" onClick={sendSms}>
          <Icon name="sms" /> Wyślij SMS
        </button>
        <button className="btn grow" onClick={makePdf}>
          <Icon name="file" /> Oferta PDF
        </button>
      </div>
      <button className="btn block ghost" onClick={() => persist().then(() => ui.toast('Zapisano wycenę'))}>
        Zapisz bez wysyłania
      </button>

      {existing && (
        <Section title="Odpowiedź klienta">
          <div className="card form">
            {form.status === 'przyjęta' && form.jobId ? (
              <button className="btn block" onClick={() => go(`/job/${form.jobId}`)}>
                <Icon name="calendar" /> Zobacz zlecenie
              </button>
            ) : (
              <>
                <Field label="Klient przyjął – umów termin">
                  <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                </Field>
                <button className="btn primary block" onClick={accept}>
                  <Icon name="check" /> Przyjęta – utwórz zlecenie
                </button>
                {form.status !== 'odrzucona' && (
                  <button className="btn block ghost" onClick={() => persist({ status: 'odrzucona' }).then(() => ui.toast('Oznaczono jako odrzuconą'))}>
                    Klient odrzucił
                  </button>
                )}
              </>
            )}
          </div>
          <button className="btn danger block" style={{ marginTop: 16 }} onClick={remove}>
            <Icon name="trash" /> Usuń wycenę
          </button>
        </Section>
      )}
    </div>
  );
}

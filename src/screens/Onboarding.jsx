import { useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field } from '../components/ui.jsx';
import { useData, useUI } from '../store.jsx';
import { SERVICE_CATALOG, servicesFromCatalog } from '../lib/catalog.js';
import { structuredCloneSafe } from '../lib/defaults.js';
import { updateMyStudio, uploadLogo } from '../lib/db.js';
import { formatMoney } from '../lib/pricing.js';
import { PLATFORM_CONTACT } from '../config.js';

// zmniejszenie logo do max 600 px (PNG – zachowuje przezroczystość)
async function resizeLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return { blob, dataUrl: c.toDataURL('image/png') };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ExtendNote() {
  return (
    <div className="extend-note small">
      <Icon name="bell" size={18} />
      <span>
        Brakuje usługi lub funkcji? Lista jest do rozbudowy – napisz do mnie: <a className="gold" href={`mailto:${PLATFORM_CONTACT.email}`}>{PLATFORM_CONTACT.email}</a> albo
        użyj „Pomysły i uwagi” w Ustawieniach.
      </span>
    </div>
  );
}

export default function Onboarding() {
  const { data, api, studio } = useData();
  const ui = useUI();
  const [step, setStep] = useState(0);
  const [s, setS] = useState(() => structuredCloneSafe(data.settings));
  const [fromName, setFromName] = useState(studio.email_from_name || studio.name);
  const [logo, setLogo] = useState(null); // { blob, dataUrl }
  const [picked, setPicked] = useState(() => {
    const init = {};
    for (const id of ['mycie', 'wnetrze', 'one-step', 'ceramika']) init[id] = '';
    return init;
  });
  const logoRef = useRef();
  const setStudio = (k, v) => setS((x) => ({ ...x, studio: { ...x.studio, [k]: v } }));
  const bookingUrl = new URL(`umow/?s=${studio.slug}`, document.baseURI.replace(/#.*$/, '')).toString();

  const toggle = (id) =>
    setPicked((p) => {
      const n = { ...p };
      if (id in n) delete n[id];
      else n[id] = '';
      return n;
    });

  const finish = () =>
    ui.run('Zapisuję konfigurację…', async () => {
      const services = servicesFromCatalog(Object.entries(picked).map(([id, price]) => ({ id, price })));
      if (!services.length) throw new Error('Wybierz przynajmniej jedną usługę.');
      let logoUrl = null;
      if (logo) logoUrl = await uploadLogo(logo.blob, studio.id);
      await updateMyStudio({ name: s.studio.name, emailFromName: fromName, logoUrl });
      await api.saveSettings({ ...s, services, studio: { ...s.studio, logo: logo?.dataUrl || s.studio.logo || null }, onboarded: true });
      await api.refreshStudio();
      ui.toast('Studio gotowe ✓');
    });

  const steps = ['Studio', 'Logo', 'Usługi', 'Gotowe'];
  const trialEnd = new Date(studio.active_until).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="onboarding">
      <div className="brand small-brand">DETAIL<span>DESK</span></div>
      <h1>Witaj w DetailDesk!</h1>
      <p className="muted">Skonfiguruj studio w 2 minuty. Masz 30 dni bezpłatnego okresu próbnego (do {trialEnd}).</p>
      <ol className="ob-steps">
        {steps.map((t, i) => (
          <li key={t} className={i < step ? 'done' : i === step ? 'now' : ''}>{t}</li>
        ))}
      </ol>

      {step === 0 && (
        <div className="card form">
          <Field label="Nazwa studia">
            <input value={s.studio.name} onChange={(e) => setStudio('name', e.target.value)} />
          </Field>
          <Field label="Nazwa nadawcy e-maili do klientów" hint="Klienci zobaczą ją jako nadawcę potwierdzeń i przypomnień.">
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} />
          </Field>
          <Field label="Twoje imię (podpis w SMS i e-mailach)">
            <input value={s.studio.signature} onChange={(e) => setStudio('signature', e.target.value)} placeholder="np. Tomek" />
          </Field>
          <div className="grid2">
            <Field label="Telefon studia">
              <input type="tel" value={s.studio.phone} onChange={(e) => setStudio('phone', e.target.value)} />
            </Field>
            <Field label="Strona www">
              <input value={s.studio.web} onChange={(e) => setStudio('web', e.target.value)} placeholder="np. mojestudio.pl" />
            </Field>
          </div>
          <Field label="Adres studia">
            <input value={s.studio.address} onChange={(e) => setStudio('address', e.target.value)} placeholder="ulica, miasto" />
          </Field>
          <button className="btn primary block" disabled={!s.studio.name.trim() || !s.studio.signature.trim()} onClick={() => setStep(1)}>
            Dalej
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="card form">
          <div className="small muted">Logo pojawi się na formularzu rezerwacji, w e-mailach do klientów i na ofertach PDF. PNG lub JPG, najlepiej jasne na przezroczystym tle.</div>
          <div className="logo-drop" onClick={() => logoRef.current.click()}>
            {logo ? <img src={logo.dataUrl} alt="Logo" /> : <span><Icon name="image" size={28} /><br />Wybierz plik z logo</span>}
          </div>
          <input
            ref={logoRef}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setLogo(await resizeLogo(f));
            }}
          />
          <div className="row gap">
            <button className="btn grow" onClick={() => setStep(0)}>Wstecz</button>
            <button className="btn primary grow" onClick={() => setStep(2)}>{logo ? 'Dalej' : 'Pomiń'}</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <>
          <div className="small muted" style={{ marginBottom: 10 }}>
            Zaznacz usługi, które wykonujesz, i wpisz swoje ceny dla małego auta. Mnożniki dla sedana/SUV i stanu lakieru ustawisz później w Ustawieniach.
          </div>
          {SERVICE_CATALOG.map((g) => (
            <div key={g.group} className="section">
              <div className="section-head"><h2>{g.group}</h2></div>
              <div className="services">
                {g.items.map((x) => {
                  const on = x.id in picked;
                  return (
                    <div key={x.id} className={`service ${on ? 'on' : ''}`}>
                      <button type="button" className="service-check" style={{ border: on ? 0 : undefined }} onClick={() => toggle(x.id)} aria-pressed={on} aria-label={x.name}>
                        {on && <Icon name="check" size={16} />}
                      </button>
                      <span className="service-name" onClick={() => toggle(x.id)}>
                        {x.name}
                        <small>
                          sugerowana: {formatMoney(x.price)} zł{x.correction ? ' · zależy od lakieru' : ''}{x.coating ? ' · przypomnienie o serwisie' : ''}
                        </small>
                      </span>
                      {on && (
                        <input
                          className="price ob-price"
                          inputMode="numeric"
                          placeholder={String(x.price)}
                          value={picked[x.id]}
                          onChange={(e) => setPicked((p) => ({ ...p, [x.id]: e.target.value.replace(/\D/g, '') }))}
                          aria-label={`Cena: ${x.name}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <ExtendNote />
          <div className="row gap" style={{ marginTop: 16 }}>
            <button className="btn grow" onClick={() => setStep(1)}>Wstecz</button>
            <button className="btn primary grow" disabled={!Object.keys(picked).length} onClick={() => setStep(3)}>
              Dalej ({Object.keys(picked).length})
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <div className="card form">
          <div className="h3">Twój link dla klientów</div>
          <div className="small muted">Wstaw go na stronę www, Instagram i do wizytówki Google – klienci sami wybiorą usługi i zaproponują termin.</div>
          <div className="link-box">{bookingUrl}</div>
          <ul className="small ob-summary">
            <li>{s.studio.name} · nadawca e-maili: {fromName}</li>
            <li>{Object.keys(picked).length} usług w cenniku</li>
            <li>{logo ? 'Logo dodane' : 'Bez logo (możesz dodać później w Ustawieniach)'}</li>
          </ul>
          <div className="row gap">
            <button className="btn grow" onClick={() => setStep(2)}>Wstecz</button>
            <button className="btn primary grow" onClick={finish}><Icon name="check" /> Zakończ</button>
          </div>
        </div>
      )}
    </div>
  );
}

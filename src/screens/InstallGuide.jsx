// Instrukcja „Dodaj DetailDesk do ekranu telefonu” – tylko dla właścicieli studiów (aplikacja studia).
// Dostępna też bez logowania (link z e-maila powitalnego): app.detaildesk.pl/#/instalacja
import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Header } from '../components/ui.jsx';
import { useData, useUI } from '../store.jsx';
import { go } from '../router.js';
import { currentPlatform, installPrompt, isStandaloneApp, runInstallPrompt } from '../lib/install.js';
import { currentSubscription, enablePush, pushSupported } from '../lib/push.js';

export const PUSH_NOTE = 'Na iPhonie powiadomienia o nowych rezerwacjach działają tylko po dodaniu do ekranu.';

// ikony takie, jakie użytkownik zobaczy na telefonie
const G = {
  iosShare: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 8H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2" /><path d="M12 15V3M8.5 6.5 12 3l3.5 3.5" />
    </svg>
  ),
  plusSquare: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" />
    </svg>
  ),
  dots: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
  ),
  lines: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
  ),
  phoneAdd: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M12 8.5v6M9 11.5h6" />
    </svg>
  ),
  monitor: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21h8M12 17v4M12 7.5v6M9.5 11 12 13.5 14.5 11" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" fill="currentColor" />
    </svg>
  ),
  bell: <Icon name="bell" size={22} />,
  safari: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" fill="currentColor" />
    </svg>
  ),
};

function Steps({ items }) {
  return (
    <ol className="ig-steps">
      {items.map((s, i) => (
        <li key={i}>
          <span className="ig-num">{i + 1}</span>
          <span className="ig-icon">{G[s.icon]}</span>
          <span className="ig-text">{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

const IOS_STEPS = [
  { icon: 'iosShare', text: <>Stuknij <b>Udostępnij</b> – kwadrat ze strzałką na dolnym pasku Safari (na iPadzie u góry).</> },
  { icon: 'plusSquare', text: <>Przewiń listę w dół i wybierz <b>„Do ekranu początkowego”</b>.</> },
  { icon: 'phoneAdd', text: <>Stuknij <b>Dodaj</b> w prawym górnym rogu.</> },
  { icon: 'home', text: <>Otwórz <b>DetailDesk</b> z ikony na ekranie i zaloguj się kodem z e-maila (aplikacja z ekranu ma osobne logowanie niż Safari).</> },
];
const ANDROID_STEPS = {
  chrome: [
    { icon: 'dots', text: <>Stuknij menu <b>⋮</b> w prawym górnym rogu Chrome.</> },
    { icon: 'phoneAdd', text: <>Wybierz <b>„Dodaj do ekranu głównego”</b> (albo „Zainstaluj aplikację”).</> },
    { icon: 'home', text: <>Potwierdź <b>Zainstaluj / Dodaj</b> i otwieraj DetailDesk z ikony na ekranie.</> },
  ],
  samsung: [
    { icon: 'lines', text: <>Stuknij menu <b>≡</b> w prawym dolnym rogu Samsung Internet.</> },
    { icon: 'plusSquare', text: <>Wybierz <b>„Dodaj stronę do”</b>.</> },
    { icon: 'home', text: <>Wybierz <b>„Ekran startowy”</b> i potwierdź <b>Dodaj</b>.</> },
  ],
  other: [
    { icon: 'dots', text: <>Otwórz menu przeglądarki (<b>⋮</b> lub <b>≡</b>).</> },
    { icon: 'phoneAdd', text: <>Wybierz <b>„Zainstaluj”</b> lub <b>„Dodaj do ekranu głównego”</b>.</> },
    { icon: 'home', text: <>Otwieraj DetailDesk z ikony na ekranie. Najwygodniej działa w Chrome lub Samsung Internet.</> },
  ],
};

export default function InstallGuide() {
  const ctx = useData(); // null, gdy otwarte bez logowania (link z e-maila)
  const ui = useUI();
  const detected = currentPlatform();
  const standalone = isStandaloneApp();
  const [os, setOs] = useState(detected.os);
  const [android, setAndroid] = useState(detected.browser === 'samsung' ? 'samsung' : detected.browser === 'chrome' ? 'chrome' : detected.os === 'android' ? 'other' : 'chrome');
  const [canPrompt, setCanPrompt] = useState(!!installPrompt());
  const [pushOn, setPushOn] = useState(false);

  useEffect(() => {
    const on = () => setCanPrompt(!!installPrompt());
    window.addEventListener('dd-install-available', on);
    currentSubscription().then((s) => setPushOn(!!s)).catch(() => {});
    return () => window.removeEventListener('dd-install-available', on);
  }, []);

  const install = async () => {
    const r = await runInstallPrompt();
    setCanPrompt(false);
    if (r === 'accepted') ui.toast('Zainstalowano ✓ Otwórz DetailDesk z ikony na ekranie');
  };
  const turnOnPush = () =>
    ui.run('Włączam powiadomienia…', async () => {
      await enablePush();
      setPushOn(true);
      ui.toast('Powiadomienia włączone ✓');
    });
  const copyLink = () => navigator.clipboard?.writeText(window.location.href.split('#')[0]).then(() => ui.toast('Skopiowano link – wklej go w Safari'));

  const pushStep = (
    <div className="card ig-push">
      <div className="row gap" style={{ alignItems: 'center' }}>
        <span className="ig-icon gold">{G.bell}</span>
        <div className="grow">
          <div className="h3">{standalone ? 'Ostatni krok: włącz powiadomienia' : 'Po instalacji: włącz powiadomienia'}</div>
          <div className="small muted">Dostaniesz powiadomienie o każdej nowej rezerwacji od klienta.</div>
        </div>
      </div>
      {standalone && ctx ? (
        pushOn ? (
          <div className="small gold">✓ Powiadomienia są włączone na tym urządzeniu.</div>
        ) : pushSupported() ? (
          <button className="btn primary block" onClick={turnOnPush}><Icon name="bell" /> Włącz powiadomienia</button>
        ) : (
          <div className="small warn">Ta przeglądarka nie obsługuje powiadomień.</div>
        )
      ) : (
        <div className="small muted">Otwórz DetailDesk z ikony na ekranie, zaloguj się i stuknij „Włącz powiadomienia” (baner na ekranie „Dziś” albo Ustawienia → Powiadomienia).</div>
      )}
    </div>
  );

  return (
    <div className={ctx ? 'screen' : 'screen ig-public'}>
      <Header title="Zainstaluj na telefonie" sub="DetailDesk jak zwykła aplikacja – z ikoną na ekranie" backTo={ctx ? '/settings' : undefined} />

      {standalone ? (
        <div className="notice ok"><Icon name="check" /><span>DetailDesk jest zainstalowany i otwarty z ekranu telefonu.</span></div>
      ) : (
        <div className="ig-note small"><Icon name="bell" size={18} /> <span>{PUSH_NOTE}</span></div>
      )}

      {standalone && pushStep}

      {!standalone && (
        <>
          <div className="tabs-inline wrap" role="tablist">
            {[['ios', 'iPhone'], ['android', 'Android'], ['desktop', 'Komputer']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={os === k} className={os === k ? 'on' : ''} onClick={() => setOs(k)}>
                {detected.os === k ? '✓ ' : ''}{l}
              </button>
            ))}
          </div>

          {os === 'ios' && (
            <div className="card">
              {detected.os === 'ios' && detected.iosNeedsSafari && (
                <div className="ig-warn">
                  <span className="ig-icon">{G.safari}</span>
                  <div className="grow">
                    <b>Otwórz ten link w Safari.</b> Dodawanie do ekranu działa tylko z Safari – teraz strona jest otwarta w{' '}
                    {detected.browser === 'chrome' ? 'Chrome' : detected.browser === 'google' ? 'aplikacji Google' : 'innej aplikacji (np. Gmail)'}.
                    <div className="small muted" style={{ marginTop: 4 }}>Stuknij ⋯ lub ikonę udostępniania i wybierz „Otwórz w Safari” albo skopiuj link i wklej go w Safari.</div>
                    <button className="btn sm" style={{ marginTop: 8 }} onClick={copyLink}>Skopiuj link</button>
                  </div>
                </div>
              )}
              <div className="h3" style={{ marginBottom: 8 }}>iPhone – Safari</div>
              <Steps items={IOS_STEPS} />
            </div>
          )}

          {os === 'android' && (
            <div className="card">
              {canPrompt && (
                <button className="btn primary block big-one" onClick={install}>
                  <Icon name="download" /> Zainstaluj aplikację
                </button>
              )}
              <div className="chips wrap" style={{ marginBottom: 10 }}>
                {[['chrome', 'Chrome'], ['samsung', 'Samsung Internet'], ['other', 'Inna']].map(([k, l]) => (
                  <button key={k} className={android === k ? 'on' : ''} onClick={() => setAndroid(k)}>{l}</button>
                ))}
              </div>
              {canPrompt && <div className="small muted" style={{ marginBottom: 8 }}>Jeśli przycisk nie zadziała, zrób to ręcznie:</div>}
              <Steps items={ANDROID_STEPS[android]} />
            </div>
          )}

          {os === 'desktop' && (
            <div className="card">
              <div className="h3" style={{ marginBottom: 6 }}>Komputer</div>
              <p className="small" style={{ margin: '0 0 10px' }}>
                Możesz po prostu używać DetailDesk w przeglądarce pod adresem <b>app.detaildesk.pl</b>. W Chrome i Edge możesz go też zainstalować jako osobne okno:
              </p>
              {canPrompt ? (
                <button className="btn primary block" onClick={install}><Icon name="download" /> Zainstaluj na komputerze</button>
              ) : (
                <Steps items={[{ icon: 'monitor', text: <>Kliknij ikonę <b>instalacji</b> po prawej stronie paska adresu (monitor ze strzałką) i wybierz <b>Zainstaluj</b>.</> }]} />
              )}
              <div className="small muted" style={{ marginTop: 10 }}>Na telefonie otwórz app.detaildesk.pl i przejdź tę instrukcję – tam DetailDesk jest najwygodniejszy.</div>
            </div>
          )}

          {pushStep}
        </>
      )}

      {!ctx && (
        <button className="btn block" onClick={() => go('/')}>
          <Icon name="key" /> Przejdź do logowania
        </button>
      )}
    </div>
  );
}

// Baner na ekranie „Dziś”: instalacja (dopóki nie z ekranu telefonu), potem „Włącz powiadomienia”
export function InstallBanner() {
  const ui = useUI();
  const standalone = isStandaloneApp();
  const key = standalone ? 'dd-push-banner-closed' : 'dd-install-banner-closed';
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const [pushOn, setPushOn] = useState(null);
  useEffect(() => {
    if (standalone) currentSubscription().then((s) => setPushOn(!!s)).catch(() => setPushOn(true));
  }, [standalone]);

  const close = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* ignoruj */
    }
    setClosed(true);
  };
  if (closed) return null;

  if (standalone) {
    if (pushOn !== false || !pushSupported()) return null;
    return (
      <div className="install-banner">
        <span className="ig-icon gold">{G.bell}</span>
        <div className="grow">
          <div className="h3">Włącz powiadomienia</div>
          <div className="small muted">Dostaniesz powiadomienie o każdej nowej rezerwacji.</div>
          <button
            className="btn sm primary"
            style={{ marginTop: 8 }}
            onClick={() => ui.run('Włączam powiadomienia…', async () => { await enablePush(); setPushOn(true); ui.toast('Powiadomienia włączone ✓'); })}
          >
            Włącz powiadomienia
          </button>
        </div>
        <button className="icon-btn" aria-label="Zamknij" onClick={close}><Icon name="x" size={18} /></button>
      </div>
    );
  }

  return (
    <div className="install-banner">
      <span className="ig-icon gold">{G.phoneAdd}</span>
      <div className="grow">
        <div className="h3">Dodaj DetailDesk do ekranu telefonu</div>
        <div className="small muted">{PUSH_NOTE}</div>
        <button className="btn sm primary" style={{ marginTop: 8 }} onClick={() => go('/instalacja')}>Pokaż jak</button>
      </div>
      <button className="icon-btn" aria-label="Zamknij" onClick={close}><Icon name="x" size={18} /></button>
    </div>
  );
}

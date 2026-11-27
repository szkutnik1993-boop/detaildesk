import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field } from '../components/ui.jsx';
import { publicPost, supabase } from '../lib/supabase.js';
import { normWeb } from '../lib/booking.js';
import { SITE_URL } from '../config.js';
import { LEGAL_PATHS, TERMS_VERSION } from '../lib/legal.js';

const KEY = 'dd-login-email';
const read = () => {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
};

// Logowanie: link + 6-cyfrowy kod w e-mailu.
// Na iPhonie link z poczty otwiera Safari (a nie aplikację z ekranu początkowego), dlatego w aplikacji wpisujesz kod.
// czy kod został wysłany w ciągu ostatnich 15 min (iOS potrafi przeładować aplikację, gdy przełączasz się do poczty)
const SENT_KEY = 'dd-login-sent-at';
const sentRecently = () => {
  try {
    return Date.now() - Number(localStorage.getItem(SENT_KEY) || 0) < 15 * 60 * 1000;
  } catch {
    return false;
  }
};
const markSent = (on) => {
  try {
    if (on) localStorage.setItem(SENT_KEY, String(Date.now()));
    else localStorage.removeItem(SENT_KEY);
  } catch {
    /* brak localStorage */
  }
};

export default function Login() {
  const [email, setEmail] = useState(read);
  const [sent, setSentState] = useState(() => !!read() && sentRecently());
  const setSent = (v) => {
    markSent(v);
    setSentState(v);
  };
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [mode, setMode] = useState(() => (window.location.hash.includes('rejestracja') ? 'register' : 'login')); // login | register
  const [reg, setReg] = useState({ studioName: '', phone: '', web: '', consent: false, website: '' });
  const [regErr, setRegErr] = useState({});

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      localStorage.setItem(KEY, email.trim());
    } catch {
      /* brak localStorage */
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.href.replace(/#.*$/, '') },
    });
    setBusy(false);
    if (error) setMsg(error.message.includes('Signups not allowed') ? 'Ten adres nie ma dostępu.' : `Błąd: ${error.message}`);
    else setSent(true);
  };

  // rejestracja nowego studia → konto + 30 dni okresu próbnego → kod logowania e-mailem
  const register = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setRegErr({});
    if (normWeb(reg.web) === null) {
      setBusy(false);
      setRegErr({ web: 'Podaj poprawny adres strony, np. mojestudio.pl (albo zostaw puste).' });
      return;
    }
    try {
      localStorage.setItem(KEY, email.trim());
    } catch {
      /* brak localStorage */
    }
    try {
      await publicPost('register', { ...reg, email: email.trim(), termsVersion: TERMS_VERSION });
    } catch (err) {
      setBusy(false);
      if (err.errors) setRegErr(err.errors);
      setMsg(err.message);
      if (err.status === 409) setMode('login');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) setMsg(`Konto założone, ale nie wysłano kodu: ${error.message}. Spróbuj zalogować się za minutę.`);
    else setSent(true);
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setMsg('Nieprawidłowy lub wygasły kod.');
    else markSent(false);
  };

  return (
    <div className="login">
      <div className="brand">DETAIL<span>DESK</span></div>
      <div className="muted" style={{ marginTop: 4 }}>Aplikacja dla studiów detailingu</div>
      {!sent && mode === 'register' ? (
        <form className="card form login-card" onSubmit={register} noValidate>
          <div className="h3">Załóż konto studia</div>
          <div className="small muted">30 dni za darmo, bez karty. Po okresie próbnym zdecydujesz, czy zostajesz.</div>
          <Field label="Nazwa studia">
            <input required value={reg.studioName} onChange={(e) => setReg({ ...reg, studioName: e.target.value })} placeholder="np. Auto Spa Kraków" />
            {regErr.studioName && <span className="warn small">{regErr.studioName}</span>}
          </Field>
          <Field label="Twój e-mail (logowanie)">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {regErr.email && <span className="warn small">{regErr.email}</span>}
          </Field>
          <Field label="Telefon (opcjonalnie)">
            <input type="tel" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} />
          </Field>
          <Field label="Strona www (opcjonalnie)" hint="Pojawi się w e-mailach do klientów, na PDF i w formularzu rezerwacji.">
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="np. mojestudio.pl"
              value={reg.web}
              onChange={(e) => setReg({ ...reg, web: e.target.value })}
              onBlur={() => setReg((r) => ({ ...r, web: normWeb(r.web) ?? r.web }))}
            />
            {regErr.web && <span className="warn small">{regErr.web}</span>}
          </Field>
          <input className="hp" tabIndex={-1} autoComplete="off" value={reg.website} onChange={(e) => setReg({ ...reg, website: e.target.value })} aria-hidden="true" />
          {/* akceptacja dokumentów – na dole formularza, tuż nad przyciskiem; domyślnie niezaznaczona i wymagana */}
          <label className="check-row consent terms-consent">
            <input type="checkbox" required checked={reg.consent} onChange={(e) => setReg({ ...reg, consent: e.target.checked })} aria-describedby="terms-consent-text" />
            <span className="small" id="terms-consent-text">
              Zapoznałem się i akceptuję{' '}
              <a className="gold" href={`${SITE_URL}${LEGAL_PATHS.terms}`} target="_blank" rel="noopener noreferrer">Regulamin</a> (w tym Umowę powierzenia przetwarzania danych) oraz{' '}
              <a className="gold" href={`${SITE_URL}${LEGAL_PATHS.privacy}`} target="_blank" rel="noopener noreferrer">Politykę prywatności</a>.
            </span>
          </label>
          {regErr.consent && <span className="warn small">{regErr.consent}</span>}
          <button className="btn primary block" disabled={busy || !reg.consent} title={!reg.consent ? 'Zaznacz akceptację Regulaminu i Polityki prywatności' : undefined}>
            <Icon name="check" /> {busy ? 'Zakładam konto…' : 'Załóż konto – 30 dni za darmo'}
          </button>
          <button type="button" className="link-btn small" onClick={() => setMode('login')}>Mam już konto – zaloguj się</button>
        </form>
      ) : !sent ? (
        <form className="card form login-card" onSubmit={send}>
          <Field label="Twój e-mail">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn primary block" disabled={busy}>
            <Icon name="sms" /> {busy ? 'Wysyłam…' : 'Wyślij link logowania'}
          </button>
          <button type="button" className="link-btn small" onClick={() => setMode('register')}>Nowe studio? Załóż konto – 30 dni za darmo</button>
        </form>
      ) : (
        <form className="card form login-card" onSubmit={verify}>
          <div className="small">
            Wysłałem e-mail na <b>{email}</b>. Wpisz kod z wiadomości (albo kliknij link, jeśli logujesz się w przeglądarce).
          </div>
          <Field label="Kod z e-maila">
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="code-input" />
          </Field>
          <button className="btn primary block" disabled={busy || code.length < 6}>
            <Icon name="check" /> Zaloguj
          </button>
          <div className="small muted">Po zalogowaniu aplikacja zapamięta Cię na tym urządzeniu – kod nie będzie potrzebny przy kolejnym otwarciu.</div>
          <button type="button" className="link-btn small" onClick={() => setSent(false)}>Zmień e-mail / wyślij ponownie</button>
        </form>
      )}
      {msg && <div className="warn small" style={{ marginTop: 12 }}>{msg}</div>}
      <a className="link-btn small" style={{ marginTop: 18 }} href="#/instalacja">Jak zainstalować DetailDesk na telefonie?</a>
    </div>
  );
}

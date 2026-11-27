import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field } from '../components/ui.jsx';
import { supabase } from '../lib/supabase.js';

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
      <div className="brand">ARC<span>DETAILING</span></div>
      <div className="muted" style={{ marginTop: 4 }}>DetailDesk – aplikacja studia</div>
      {!sent ? (
        <form className="card form login-card" onSubmit={send}>
          <Field label="Twój e-mail">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn primary block" disabled={busy}>
            <Icon name="sms" /> {busy ? 'Wysyłam…' : 'Wyślij link logowania'}
          </button>
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
    </div>
  );
}

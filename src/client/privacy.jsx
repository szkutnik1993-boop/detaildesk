import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Brand, Footer } from './common.jsx';
import { publicGet } from '../lib/supabase.js';

// Dane administratora pobierane z Ustawień aplikacji (Studio → nazwa firmy, NIP, adres, e-mail, telefon).
const Fill = ({ v, label }) => (v ? <b>{v}</b> : <mark className="todo">[{label} – uzupełnij w Ustawieniach]</mark>);

function Privacy() {
  const [st, setSt] = useState(null);
  useEffect(() => {
    publicGet({ action: 'config' }).then((r) => setSt(r.config.studio)).catch(() => setSt({}));
  }, []);
  const s = st || {};
  return (
    <div className="c-page">
      <header className="c-header"><Brand studio={s} /></header>
      <main className="prose">
        <h1>Polityka prywatności</h1>
        <p className="muted small">Obowiązuje od 27 listopada 2026 r.</p>

        <h2>1. Administrator danych</h2>
        <p>
          Administratorem Twoich danych osobowych jest <Fill v={s.company} label="pełna nazwa firmy" />, NIP: <Fill v={s.nip} label="NIP" />, adres:{' '}
          <Fill v={s.address} label="adres" />. Kontakt w sprawie danych: e-mail <Fill v={s.email} label="e-mail" />, tel. <Fill v={s.phone} label="telefon" />.
        </p>

        <h2>2. Jakie dane zbieramy</h2>
        <p>Imię, numer telefonu, adres e-mail, markę i model samochodu, a w trakcie realizacji usługi także numer rejestracyjny, przebieg, opis stanu pojazdu, zdjęcia pojazdu i podpis na protokole przyjęcia.</p>

        <h2>3. Cel i podstawa przetwarzania</h2>
        <ul>
          <li>obsługa zapytania i przygotowanie wyceny, ustalenie terminu – art. 6 ust. 1 lit. b RODO (działania przed zawarciem umowy) oraz Twoja zgoda (art. 6 ust. 1 lit. a);</li>
          <li>realizacja usługi, protokół przyjęcia pojazdu, informowanie o postępie prac i odbiorze – art. 6 ust. 1 lit. b RODO;</li>
          <li>wystawienie dokumentów księgowych i ich przechowywanie – art. 6 ust. 1 lit. c RODO;</li>
          <li>przypomnienia o wizycie i serwisie powłoki oraz ewentualne dochodzenie roszczeń – prawnie uzasadniony interes administratora (art. 6 ust. 1 lit. f RODO).</li>
        </ul>

        <h2>4. Odbiorcy danych</h2>
        <p>
          Dane przechowujemy w usłudze Supabase (serwery w UE – Frankfurt), wiadomości e-mail wysyłamy przez Resend. Podmioty te działają na nasze zlecenie jako podmioty przetwarzające. Strona jest
          hostowana w GitHub Pages. Nie sprzedajemy danych i nie przekazujemy ich innym podmiotom poza przypadkami wymaganymi prawem.
        </p>

        <h2>5. Okres przechowywania</h2>
        <p>
          Dane z zapytania, które nie zakończyło się zleceniem – do 12 miesięcy. Dane zleceń – przez okres wymagany przepisami podatkowymi (5 lat od końca roku) oraz do czasu przedawnienia roszczeń.
          Zdjęcia pojazdu – do 3 lat od realizacji usługi, chyba że wcześniej poprosisz o ich usunięcie.
        </p>

        <h2>6. Twoje prawa</h2>
        <p>
          Masz prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia, sprzeciwu oraz cofnięcia zgody w dowolnym momencie (bez wpływu na zgodność z prawem
          przetwarzania przed jej cofnięciem). Masz też prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).
        </p>

        <h2>7. Dobrowolność</h2>
        <p>Podanie danych jest dobrowolne, ale niezbędne do obsługi zapytania i wykonania usługi.</p>

        <h2>8. Strona zlecenia i pliki cookies</h2>
        <p>
          Link do strony zlecenia jest unikalny i trudny do odgadnięcia – nie udostępniaj go osobom trzecim. Strona nie używa plików cookies marketingowych ani narzędzi analitycznych; czcionki są
          ładowane z naszego serwera.
        </p>
      </main>
      <Footer studio={s} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Privacy />);

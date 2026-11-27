import ReactDOM from 'react-dom/client';
import { Footer } from './common.jsx';
import { LegalDoc } from './legal.jsx';
import { TERMS_VERSION } from '../lib/legal.js';
import md from '../legal/regulamin.md?raw';

// Regulamin DetailDesk (z Załącznikiem nr 1 – Umowa powierzenia przetwarzania danych)
function Terms() {
  return (
    <div className="c-page">
      <header className="c-header"><a className="c-brand" href="/"><span className="gold">DETAIL</span>DESK</a></header>
      <main className="prose">
        <LegalDoc md={md} />
        <p className="muted small">Wersja dokumentu: {TERMS_VERSION}</p>
      </main>
      <Footer studio={{ name: 'DetailDesk' }} platform />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Terms />);

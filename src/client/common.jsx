import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '../styles.css';
import './client.css';
import { webHref } from '../lib/booking.js';

const RESERVED_PATHS = ['umow', 'zlecenie', 'prywatnosc', 'regulamin', 'rejestracja', 'assets', 'index.html', '404.html'];
export const studioSlug = () => {
  const q = new URLSearchParams(window.location.search).get('s');
  if (q) return q;
  const first = window.location.pathname.split('/').filter(Boolean)[0] || '';
  return first && !RESERVED_PATHS.includes(first) && /^[a-z0-9-]+$/.test(first) ? first : '';
};
export const withSlug = (path, slug = studioSlug()) => (slug ? `${path}?s=${encodeURIComponent(slug)}` : path);

// logo lub nazwa studia – prowadzi do strony www studia (w nowej karcie), jeśli studio ją podało
export function Brand({ studio }) {
  const href = webHref(studio?.web);
  const link = href ? { href, target: '_blank', rel: 'noopener noreferrer', title: `Strona ${studio?.name || 'studia'}` } : {};
  if (studio?.logoUrl) {
    const img = <img className="c-logo" src={studio.logoUrl} alt={studio.name} />;
    return href ? (
      <a className="c-logo-link" {...link}>
        {img}
      </a>
    ) : (
      img
    );
  }
  const words = (studio?.name || 'DetailDesk').split(' ');
  return (
    <a className="c-brand" {...(href ? link : { href: '#' })}>
      <span className="gold">{words[0].toUpperCase()}</span> {words.slice(1).join(' ').toUpperCase()}
    </a>
  );
}

// stopka: na stronach studia – polityka prywatności studia; na stronach DetailDesk (platform) – Regulamin i Polityka prywatności DetailDesk
export function Footer({ studio, platform }) {
  if (platform) {
    return (
      <footer className="c-footer">
        <div>DetailDesk – aplikacja dla studiów detailingu</div>
        <div>
          <a href="/regulamin/">Regulamin</a> · <a href="/prywatnosc/">Polityka prywatności</a> · <a href="/">detaildesk.pl</a>
        </div>
      </footer>
    );
  }
  return (
    <footer className="c-footer">
      <div>{[studio?.name, studio?.address].filter(Boolean).join(' · ')}</div>
      <div>
        {studio?.phone && <a href={`tel:${studio.phone.replace(/[^\d+]/g, '')}`}>tel. {studio.phone}</a>}
        {studio?.phone && ' · '}
        <a href={withSlug('/prywatnosc/', studio?.slug)}>Polityka prywatności</a>
      </div>
    </footer>
  );
}

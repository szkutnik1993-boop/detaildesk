import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '../styles.css';
import './client.css';

export const studioSlug = () => new URLSearchParams(window.location.search).get('s') || '';
export const withSlug = (path, slug = studioSlug()) => (slug ? `${path}?s=${encodeURIComponent(slug)}` : path);

export function Brand({ studio }) {
  if (studio?.logoUrl) return <img className="c-logo" src={studio.logoUrl} alt={studio.name} />;
  const words = (studio?.name || 'DetailDesk').split(' ');
  return (
    <a className="c-brand" href={studio?.web ? `https://${studio.web.replace(/^https?:\/\//, '')}` : '#'}>
      <span className="gold">{words[0].toUpperCase()}</span> {words.slice(1).join(' ').toUpperCase()}
    </a>
  );
}

export function Footer({ studio }) {
  return (
    <footer className="c-footer">
      <div>{[studio?.name, studio?.address].filter(Boolean).join(' · ')}</div>
      <div>
        {studio?.phone && <a href={`tel:${studio.phone.replace(/[^\d+]/g, '')}`}>tel. {studio.phone}</a>}
        {studio?.phone && ' · '}
        <a href={withSlug('../prywatnosc/', studio?.slug)}>Polityka prywatności</a>
      </div>
    </footer>
  );
}

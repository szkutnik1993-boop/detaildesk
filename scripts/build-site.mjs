// Składa stronę dla klientów (detaildesk.pl) z gotowego buildu aplikacji (dist/):
//   /                → strona główna dla właścicieli studiów (site/index.html)
//   /<slug-studia>   → formularz rezerwacji (404.html = formularz; slug odczytywany z adresu)
//   /zlecenie/?t=…   → strona zlecenia klienta
//   /prywatnosc/     → polityka prywatności studia
//   /umow/?s=…       → stary format linku (zgodność)
import { cpSync, mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const OUT = 'site-dist';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const p of ['assets', 'umow', 'zlecenie', 'prywatnosc']) cpSync(`dist/${p}`, `${OUT}/${p}`, { recursive: true });
for (const f of ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) if (existsSync(`dist/${f}`)) copyFileSync(`dist/${f}`, `${OUT}/${f}`);
copyFileSync('site/index.html', `${OUT}/index.html`);
copyFileSync(`${OUT}/umow/index.html`, `${OUT}/404.html`); // detaildesk.pl/<slug> → formularz rezerwacji
writeFileSync(`${OUT}/rejestracja.html`, '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=https://app.detaildesk.pl/rejestracja/"><a href="https://app.detaildesk.pl/rejestracja/">Załóż konto studia</a>');
mkdirSync(`${OUT}/rejestracja`);
copyFileSync(`${OUT}/rejestracja.html`, `${OUT}/rejestracja/index.html`);
writeFileSync(`${OUT}/CNAME`, 'detaildesk.pl\n');
writeFileSync(`${OUT}/robots.txt`, 'User-agent: *\nDisallow: /zlecenie/\n');
writeFileSync(`${OUT}/.nojekyll`, '');
console.log('✓ strona detaildesk.pl złożona w', OUT);

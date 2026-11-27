import { formatMoney } from './pricing.js';
import { fmtDate, fmtDateTime } from './dates.js';
import { carLabel } from './reminders.js';
import { PANELS } from './panels.js';

const GOLD = '#C9A45C';
const DARK = '#0E0F11';
const GREY = '#6B6F76';
const ORANGE = '#E8873A';
const PAGE_W = 595.28;

let pdfMakePromise;
async function loadPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]).then(([m, f]) => {
      const pdfMake = m.default || m;
      const vfs = f.default || f;
      pdfMake.vfs = vfs.pdfMake ? vfs.pdfMake.vfs : vfs;
      return pdfMake;
    });
  }
  return pdfMakePromise;
}

function header(settings, title, sub) {
  const st = settings.studio;
  const words = (st.name || 'ARC Detailing').split(' ');
  const brand = st.logo
    ? { image: st.logo, fit: [150, 52] }
    : {
        stack: [
          { text: [{ text: words[0].toUpperCase() + ' ', color: GOLD }, { text: words.slice(1).join(' ').toUpperCase(), color: '#F2F2F0' }], fontSize: 20, bold: true, characterSpacing: 2 },
          { text: st.web || '', color: '#A3A7AE', fontSize: 8, margin: [0, 3, 0, 0] },
        ],
      };
  return {
    columns: [
      { width: '*', ...brand },
      {
        width: 'auto',
        stack: [
          { text: title, color: GOLD, fontSize: 13, bold: true, alignment: 'right', characterSpacing: 1.5 },
          { text: sub, color: '#A3A7AE', fontSize: 9, alignment: 'right', margin: [0, 4, 0, 0] },
        ],
      },
    ],
    margin: [0, 0, 0, 34],
  };
}

function footer(settings) {
  const st = settings.studio;
  const parts = [st.name, st.address, st.phone && `tel. ${st.phone}`, st.email, st.web].filter(Boolean);
  return (page, pages) => ({
    columns: [
      { text: parts.join('  ·  '), fontSize: 7.5, color: GREY },
      { text: `${page} / ${pages}`, fontSize: 7.5, color: GREY, alignment: 'right', width: 40 },
    ],
    margin: [40, 10, 40, 0],
  });
}

const base = (settings) => ({
  pageSize: 'A4',
  pageMargins: [40, 36, 40, 50],
  background: (page) => (page === 1 ? { canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W, h: 100, color: DARK }, { type: 'rect', x: 0, y: 100, w: PAGE_W, h: 2, color: GOLD }] } : null),
  footer: footer(settings),
  defaultStyle: { fontSize: 10, color: '#1C1D20', lineHeight: 1.2 },
  styles: {
    label: { fontSize: 7.5, color: GREY, characterSpacing: 0.8 },
    h: { fontSize: 11, bold: true, color: DARK, margin: [0, 18, 0, 8] },
  },
});

function infoBox(rows) {
  return {
    table: {
      widths: ['*', '*'],
      body: chunk(rows, 2).map((pair) =>
        [0, 1].map((i) =>
          pair[i]
            ? { stack: [{ text: pair[i][0].toUpperCase(), style: 'label' }, { text: pair[i][1] || '—', margin: [0, 2, 0, 0] }], margin: [0, 4, 0, 4] }
            : { text: '' }
        )
      ),
    },
    layout: { hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => '#E2E3E5', paddingLeft: () => 0 },
  };
}

const chunk = (arr, n) => arr.reduce((acc, x, i) => (i % n ? acc[acc.length - 1].push(x) : acc.push([x]), acc), []);

async function toBlob(doc) {
  const pdfMake = await loadPdfMake();
  return new Promise((res) => pdfMake.createPdf(doc).getBlob(res));
}

export async function quotePdf(quote, settings) {
  const size = settings.sizes.find((s) => s.id === quote.sizeId);
  const paint = settings.paints.find((s) => s.id === quote.paintId);
  const nr = `W-${(quote.createdAt || '').slice(0, 10).replace(/-/g, '')}-${quote.id.slice(0, 4).toUpperCase()}`;
  const doc = base(settings);
  const items = quote.items || [];
  doc.info = { title: `Oferta ${settings.studio.name}` };
  doc.content = [
    header(settings, 'OFERTA', `nr ${nr}  ·  ${fmtDate(quote.createdAt)}`),
    { text: 'Wstępna wycena usług detailingowych', fontSize: 16, bold: true, color: DARK, margin: [0, 0, 0, 14] },
    infoBox([
      ['Klient', quote.clientName],
      ['Telefon', quote.phone],
      ['Samochód', quote.carLabel],
      ['Wielkość auta', size?.name],
      ...(items.some((i) => i.usesPaint) ? [['Stan lakieru', paint?.name]] : []),
    ]),
    { text: 'Zakres usług', style: 'h' },
    {
      table: {
        widths: [18, '*', 90],
        body: [
          [{ text: '#', style: 'label' }, { text: 'USŁUGA', style: 'label' }, { text: 'CENA', style: 'label', alignment: 'right' }],
          ...items.map((it, i) => [
            { text: String(i + 1), color: GREY },
            { text: it.name, bold: true },
            { text: `${formatMoney(it.price)} zł`, alignment: 'right' },
          ]),
        ],
      },
      layout: { hLineWidth: (i) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => '#E2E3E5', paddingTop: () => 7, paddingBottom: () => 7 },
    },
    {
      table: {
        widths: ['*', 'auto'],
        body: [[
          { text: 'RAZEM (ok.)', color: '#F2F2F0', bold: true, characterSpacing: 1, margin: [10, 9, 0, 9] },
          { text: `${formatMoney(quote.total)} zł`, color: GOLD, bold: true, fontSize: 16, alignment: 'right', margin: [0, 5, 10, 5] },
        ]],
      },
      layout: { fillColor: () => DARK, hLineWidth: () => 0, vLineWidth: () => 0 },
      margin: [0, 10, 0, 0],
    },
    {
      margin: [0, 22, 0, 0],
      stack: [
        { text: 'Informacje', style: 'h', margin: [0, 0, 0, 6] },
        { ul: ['Cena ma charakter wstępny – ostateczną kwotę potwierdzę po oględzinach auta.', 'Oferta ważna 30 dni od daty wystawienia.', 'Termin realizacji ustalamy indywidualnie.'], color: '#3A3D42', fontSize: 9.5 },
        quote.notes ? { text: quote.notes, margin: [0, 10, 0, 0], fontSize: 9.5 } : '',
      ],
    },
    { text: `Zapraszam,\n${settings.studio.signature} – ${settings.studio.name}`, margin: [0, 30, 0, 0], color: DARK, bold: true },
  ];
  const blob = await toBlob(doc);
  return { blob, filename: `oferta-${nr}.pdf`, title: `Oferta ${settings.studio.name}` };
}

export async function protocolPdf(protocol, car, settings, photos, services = []) {
  const threshold = Number(settings.paintThreshold) || 250;
  const nr = `P-${(protocol.createdAt || '').slice(0, 10).replace(/-/g, '')}-${protocol.id.slice(0, 4).toUpperCase()}`;
  const doc = base(settings);
  doc.info = { title: `Protokół przyjęcia – ${carLabel(car)}` };
  const m = protocol.paint || {};
  const cell = (key) => {
    const p = PANELS.find((x) => x.key === key);
    const v = m[key];
    const over = Number(v) > threshold;
    return {
      stack: [{ text: p.label.toUpperCase(), style: 'label', color: over ? '#FFFFFF' : GREY }, { text: v ? `${v} µm` : '—', bold: true, fontSize: 12, margin: [0, 3, 0, 0], color: over ? '#FFFFFF' : DARK }],
      fillColor: over ? ORANGE : '#F4F4F5',
      alignment: 'center',
      margin: [0, 6, 0, 6],
    };
  };
  const grid = [
    ['fl', 'hood', 'fr'],
    ['dl', 'roof', 'dr'],
    ['rl', 'trunk', 'rr'],
  ];
  const damages = protocol.damages || [];
  const damageCells = damages.map((d) => ({
    stack: [
      photos[d.photoId] ? { image: photos[d.photoId], fit: [245, 180], alignment: 'center' } : { text: '(brak zdjęcia)', color: GREY },
      { text: d.caption || '', fontSize: 9, margin: [0, 4, 0, 10], alignment: 'center' },
    ],
  }));
  if (damageCells.length % 2) damageCells.push({ text: '' });

  doc.content = [
    header(settings, 'PROTOKÓŁ PRZYJĘCIA', `nr ${nr}  ·  ${fmtDateTime(protocol.createdAt)}`),
    { text: 'Protokół przyjęcia pojazdu', fontSize: 16, bold: true, color: DARK, margin: [0, 0, 0, 14] },
    infoBox([
      ['Klient', car?.ownerName],
      ['Telefon', car?.ownerPhone],
      ['Samochód', carLabel(car)],
      ['Nr rejestracyjny', car?.plate],
      ['Kolor', car?.color],
      ['VIN', car?.vin],
      ['Przebieg', protocol.mileage ? `${formatMoney(protocol.mileage)} km` : ''],
      ['Data przyjęcia', fmtDateTime(protocol.createdAt)],
    ]),
    ...(services.length ? [{ text: 'Zlecone usługi', style: 'h' }, { ul: services.map((s) => s.name) }] : []),
    { text: 'Pomiar grubości lakieru (µm)', style: 'h' },
    {
      table: { widths: ['*', '*', '*'], body: grid.map((r) => r.map(cell)) },
      layout: { hLineWidth: () => 3, vLineWidth: () => 3, hLineColor: () => '#FFFFFF', vLineColor: () => '#FFFFFF' },
    },
    { text: [{ text: '■ ', color: ORANGE }, `powyżej ${threshold} µm – możliwa wcześniejsza naprawa lakiernicza.  Układ: przód auta u góry.`], fontSize: 8, color: GREY, margin: [0, 6, 0, 0] },
    ...(damages.length
      ? [{ text: 'Uszkodzenia i stan pojazdu', style: 'h', pageBreak: undefined }, { table: { widths: ['*', '*'], body: chunk(damageCells, 2) }, layout: 'noBorders' }]
      : []),
    ...(protocol.notes ? [{ text: 'Uwagi', style: 'h' }, { text: protocol.notes }] : []),
    {
      unbreakable: true,
      margin: [0, 24, 0, 0],
      stack: [
        { text: 'Klient potwierdza zgodność opisu stanu pojazdu z rzeczywistością i zleca wykonanie usług.', fontSize: 9, color: '#3A3D42', margin: [0, 0, 0, 12] },
        {
          columns: [
            { width: '*', stack: [protocol.signature ? { image: protocol.signature, fit: [220, 80] } : { text: ' ', margin: [0, 40, 0, 0] }, { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 220, y2: 2, lineWidth: 0.5, lineColor: GREY }] }, { text: 'PODPIS KLIENTA', style: 'label', margin: [0, 4, 0, 0] }] },
            { width: '*', stack: [{ text: `${settings.studio.signature}`, margin: [0, 58, 0, 6], alignment: 'right', bold: true }, { canvas: [{ type: 'line', x1: 37, y1: 2, x2: 257, y2: 2, lineWidth: 0.5, lineColor: GREY }] }, { text: `PRZYJMUJĄCY – ${settings.studio.name.toUpperCase()}`, style: 'label', alignment: 'right', margin: [0, 4, 0, 0] }] },
          ],
        },
      ],
    },
  ];
  const blob = await toBlob(doc);
  return { blob, filename: `protokol-${nr}.pdf`, title: `Protokół przyjęcia – ${carLabel(car)}` };
}

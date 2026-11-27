// Szablony e-maili (HTML z inline CSS – działa w Gmailu, Apple Mail, Outlooku)
import { formatMoney } from './pricing.js';
import { fmtTermPL } from './ics.js';

const GOLD = '#C9A45C';
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(studio, body) {
  const words = (studio.name || 'ARC Detailing').split(' ');
  const contact = [studio.phone && `tel. ${h(studio.phone)}`, studio.address && h(studio.address), studio.web && h(studio.web)].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#0E0F11;font-family:Helvetica,Arial,sans-serif;color:#1C1D20">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0E0F11;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:8px 4px 20px;font-size:20px;font-weight:700;letter-spacing:3px">
<span style="color:${GOLD}">${h(words[0].toUpperCase())}</span> <span style="color:#F2F2F0">${h(words.slice(1).join(' ').toUpperCase())}</span></td></tr>
<tr><td style="background:#FFFFFF;border-radius:16px;padding:28px 24px;font-size:15px;line-height:1.55">${body}</td></tr>
<tr><td style="padding:18px 4px;color:#A3A7AE;font-size:12px;line-height:1.5">${contact}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href, label, primary = true) =>
  `<a href="${h(href)}" style="display:inline-block;margin:6px 8px 6px 0;padding:13px 20px;border-radius:12px;font-weight:700;text-decoration:none;${primary ? `background:${GOLD};color:#17130B` : 'background:#F1F1F2;color:#1C1D20'}">${h(label)}</a>`;

const servicesList = (job) =>
  `<ul style="padding-left:18px;margin:8px 0">${(job.services || []).map((s) => `<li>${h(s.name)}</li>`).join('')}</ul>`;

const box = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F6F7;border-radius:12px;margin:16px 0">${rows
    .map(([k, v]) => `<tr><td style="padding:10px 14px;color:#6B6F76;font-size:13px;width:38%">${h(k)}</td><td style="padding:10px 14px;font-weight:600">${v}</td></tr>`)
    .join('')}</table>`;

export function ownerNewRequest({ job, carLabel, studio, appLink }) {
  const slots = (job.proposedSlots || []).map((s) => h(fmtTermPL(s.date, s.time))).join('<br>');
  const subject = `Nowe zapytanie: ${job.client?.name || 'klient'} – ${carLabel} – ok. ${formatMoney(job.price)} zł`;
  const html = layout(
    studio,
    `<h2 style="margin:0 0 6px;font-size:20px">Nowe zapytanie</h2>
    ${box([
      ['Klient', h(job.client?.name)],
      ['Telefon', `<a href="tel:${h(job.client?.phone)}">${h(job.client?.phone)}</a>`],
      ['E-mail', h(job.client?.email)],
      ['Auto', h(carLabel)],
      ['Wycena orientacyjna', `${formatMoney(job.price)} zł`],
      ['Proponowane terminy', slots || '—'],
    ])}
    <b>Usługi:</b>${servicesList(job)}
    ${job.note ? `<p><b>Uwagi klienta:</b><br>${h(job.note)}</p>` : ''}
    ${button(appLink, 'Otwórz w DetailDesk')}`
  );
  return { subject, html };
}

export function clientConfirmed({ job, carLabel, studio, jobLink, icsLink }) {
  const term = fmtTermPL(job.date, job.time);
  const subject = `Potwierdzenie terminu – ${studio.name}, ${term}`;
  const html = layout(
    studio,
    `<h2 style="margin:0 0 6px;font-size:20px">Dzień dobry${job.client?.name ? ` ${h(job.client.name.split(' ')[0])}` : ''}!</h2>
    <p style="margin:0">Potwierdzam termin wizyty w ${h(studio.name)}.</p>
    ${box([
      ['Termin', h(term)],
      ['Auto', h(carLabel)],
      ['Cena orientacyjna', `ok. ${formatMoney(job.price)} zł`],
      ...(studio.address ? [['Adres', h(studio.address)]] : []),
    ])}
    <b>Zakres usług:</b>${servicesList(job)}
    <p style="color:#6B6F76;font-size:13px">Cenę potwierdzę po oględzinach auta.</p>
    ${button(icsLink, 'Dodaj do kalendarza')}${button(jobLink, 'Strona zlecenia', false)}
    <p style="font-size:13px;color:#6B6F76">Na stronie zlecenia zobaczysz status i zdjęcia z postępu prac.</p>
    <p>Pozdrawiam,<br><b>${h(studio.signature)}</b> – ${h(studio.name)}</p>`
  );
  return { subject, html };
}

export function clientReminder({ job, carLabel, studio, jobLink, icsLink }) {
  const term = fmtTermPL(job.date, job.time);
  const subject = `Przypomnienie: jutro wizyta w ${studio.name}`;
  const html = layout(
    studio,
    `<h2 style="margin:0 0 6px;font-size:20px">Do zobaczenia jutro!</h2>
    <p style="margin:0">Przypominam o wizycie w ${h(studio.name)}.</p>
    ${box([
      ['Termin', h(term)],
      ['Auto', h(carLabel)],
      ...(studio.address ? [['Adres', h(studio.address)]] : []),
    ])}
    <p>Jeśli termin nie pasuje, proszę o kontakt${studio.phone ? `: <a href="tel:${h(studio.phone)}">${h(studio.phone)}</a>` : ''}.</p>
    ${button(jobLink, 'Strona zlecenia')}${button(icsLink, 'Dodaj do kalendarza', false)}
    <p>Pozdrawiam,<br><b>${h(studio.signature)}</b> – ${h(studio.name)}</p>`
  );
  return { subject, html };
}

export function clientReady({ job, carLabel, studio, jobLink }) {
  const subject = `Zapraszamy po odbiór – ${carLabel} jest gotowe`;
  const html = layout(
    studio,
    `<h2 style="margin:0 0 6px;font-size:20px">Zapraszamy po odbiór!</h2>
    <p style="margin:0">${h(carLabel)} jest gotowe.</p>
    ${box([
      ['Auto', h(carLabel)],
      ['Do zapłaty', `<span style="font-size:20px;color:#1C1D20">${formatMoney(job.finalPrice)} zł</span>`],
      ...(studio.address ? [['Adres', h(studio.address)]] : []),
    ])}
    ${button(jobLink, 'Zobacz zdjęcia z realizacji')}
    <p>Dziękuję za zaufanie!<br><b>${h(studio.signature)}</b> – ${h(studio.name)}</p>`
  );
  return { subject, html };
}

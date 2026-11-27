// Strefa Europe/Warsaw → UTC oraz generowanie pliku kalendarza .ics

function tzOffsetMinutes(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return (asUTC - date.getTime()) / 60000;
}

export function warsawToUTC(date, time = '09:00', tz = 'Europe/Warsaw') {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = (time || '09:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = tzOffsetMinutes(new Date(guess), tz);
  return new Date(guess - off * 60000);
}

// dzisiejsza data w Polsce (YYYY-MM-DD)
export function warsawToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(now);
}

export function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// długie linie dzielimy wg RFC 5545 (75 oktetów – upraszczamy do 70 znaków)
const fold = (line) => line.match(/.{1,70}/g).join('\r\n ');

export function buildIcs({ uid, date, time, durationMin = 60, title, description, location, url, now = new Date() }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DetailDesk//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp(now)}`];
  if (time) {
    const start = warsawToUTC(date, time);
    lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + durationMin * 60000))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDaysISO(date, 1).replace(/-/g, '')}`);
  }
  lines.push(`SUMMARY:${esc(title)}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (url) lines.push(`URL:${url}`);
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Przypomnienie', 'TRIGGER:-PT2H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function fmtTermPL(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return time ? `${day}, godz. ${time}` : day;
}

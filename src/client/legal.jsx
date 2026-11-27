// Dokumenty prawne DetailDesk: Regulamin (z Załącznikiem nr 1 – Umowa powierzenia) i Polityka prywatności.
// Treść w plikach src/legal/*.md (prosty Markdown: #, ##, ###, -, 1., **pogrubienie**).
import { Fragment } from 'react';

const DRAFT = '<!-- SZKIC -->';
export const isDraft = (md) => md.includes(DRAFT);

function inline(text, key) {
  // **pogrubienie** – bez HTML (React escapuje treść)
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={`${key}-${i}`}>{p.slice(2, -2)}</b> : <Fragment key={`${key}-${i}`}>{p}</Fragment>));
}

export function LegalDoc({ md }) {
  if (isDraft(md)) {
    return (
      <div className="empty" style={{ marginTop: 20 }}>
        Treść dokumentu jest w przygotowaniu.
      </div>
    );
  }
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) out.push(<p key={`p${out.length}`}>{inline(para.join(' '), `p${out.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul';
      out.push(<Tag key={`l${out.length}`}>{list.items.map((t, i) => <li key={i}>{inline(t, `l${out.length}-${i}`)}</li>)}</Tag>);
    }
    list = null;
  };
  let table = null;
  const flushTable = () => {
    if (table) {
      const [head, ...rows] = table;
      out.push(
        <div className="legal-table" key={`t${out.length}`}>
          <table>
            <thead><tr>{head.map((c, i) => <th key={i}>{inline(c, `th${i}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k}>{inline(c, `td${i}-${k}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    table = null;
  };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('<!--') || line === '---') continue;
    if (line.startsWith('|')) {
      flushPara();
      flushList();
      const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // wiersz separatora
      (table ||= []).push(cells);
      continue;
    }
    flushTable();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^[-•]\s+(.*)$/);
    const ol = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (!line) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      const Tag = `h${h[1].length}`;
      out.push(<Tag key={`h${out.length}`} id={h[1].length > 1 ? `s${out.length}` : undefined}>{inline(h[2], `h${out.length}`)}</Tag>);
    } else if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(ul ? ul[1] : ol[2]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  flushTable();
  return <>{out}</>;
}

// Obliczanie wyceny: cena bazowa × wielkość auta × (stan lakieru – tylko korekty),
// każda pozycja zaokrąglana do pełnych 10 zł (krok z ustawień), suma = suma pozycji.

export function roundTo(value, step = 10) {
  const v = Math.round(Number(value) * 100) / 100; // usuwa błędy zmiennoprzecinkowe (np. 344.99999)
  if (!step || step <= 0) return Math.round(v);
  return Math.round(v / step) * step;
}

export function findMult(list, id) {
  const item = (list || []).find((x) => x.id === id);
  const m = item ? Number(item.mult) : 1;
  return Number.isFinite(m) && m > 0 ? m : 1;
}

export function calcQuote({ serviceIds = [], sizeId, paintId } = {}, settings) {
  const sizeMult = findMult(settings.sizes, sizeId);
  const paintMult = findMult(settings.paints, paintId);
  const step = settings.rounding ?? 10;
  const items = (settings.services || [])
    .filter((s) => serviceIds.includes(s.id))
    .map((s) => {
      const base = Number(s.price) || 0;
      const usesPaint = !!s.correction;
      const raw = base * sizeMult * (usesPaint ? paintMult : 1);
      return {
        id: s.id,
        name: s.name,
        base,
        price: roundTo(raw, step),
        usesPaint,
        coating: !!s.coating,
      };
    });
  const total = items.reduce((sum, i) => sum + i.price, 0);
  return { items, total, sizeMult, paintMult, needsPaint: items.some((i) => i.usesPaint) };
}

export function lowerFirst(s) {
  if (!s) return '';
  return s.charAt(0).toLocaleLowerCase('pl-PL') + s.slice(1);
}

export function formatMoney(n) {
  const v = Math.round(Number(n) || 0);
  // grupowanie tysięcy spacją dopiero od 10 000 (polska norma)
  const s = String(Math.abs(v));
  const grouped = s.length > 4 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : s;
  return (v < 0 ? '-' : '') + grouped;
}

export function servicesLabel(items) {
  return items.map((i) => lowerFirst(i.name)).join(' + ');
}

export function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

export function quoteSmsText(calc, settings) {
  return fillTemplate(settings.templates.quote, {
    studio: settings.studio.name,
    uslugi: servicesLabel(calc.items),
    cena: formatMoney(calc.total),
    podpis: settings.studio.signature,
  });
}

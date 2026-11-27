// Katalog usług do wyboru przy pierwszej konfiguracji studia (ceny sugerowane, dla małego auta).
// correction: cena zależy od stanu lakieru; coating: przypomnienie o serwisie powłoki.
// Lista do rozbudowy – nowe pozycje dodaje administrator platformy.
export const SERVICE_CATALOG = [
  {
    group: 'Mycie',
    items: [
      { id: 'mycie', name: 'Mycie zewnętrzne', description: 'ręczne, 2 wiadra, felgi, osuszanie', price: 150 },
      { id: 'mycie-wosk', name: 'Mycie + wosk', description: 'mycie zewnętrzne i zabezpieczenie lakieru woskiem', price: 250, reminderMonths: 2 },
      { id: 'mycie-sealant', name: 'Mycie + sealant', description: 'mycie zewnętrzne i trwalsze zabezpieczenie sealantem', price: 350, reminderMonths: 5 },
      { id: 'dekontaminacja', name: 'Dekontaminacja lakieru', price: 250 },
      { id: 'silnik', name: 'Detailing komory silnika', price: 250 },
    ],
  },
  {
    group: 'Wnętrze',
    items: [
      { id: 'wnetrze', name: 'Detailing wnętrza', price: 300 },
      { id: 'tapicerka', name: 'Pranie tapicerki', price: 600 },
      { id: 'skora', name: 'Czyszczenie i impregnacja skór', price: 400 },
      { id: 'ozon', name: 'Ozonowanie', price: 100 },
    ],
  },
  {
    group: 'Lakier',
    items: [
      { id: 'one-step', name: 'Korekta One Step', price: 1200, correction: true },
      { id: 'two-step', name: 'Korekta Two Step', price: 1800, correction: true },
      { id: 'reflektory', name: 'Regeneracja reflektorów', price: 200 },
    ],
  },
  {
    group: 'Ochrona',
    items: [
      { id: 'wosk', name: 'Wosk / sealant', price: 300 },
      { id: 'ceramika', name: 'Powłoka ceramiczna', price: 800, coating: true, reminderMonths: 6 },
      { id: 'ceramika-premium', name: 'Powłoka ceramiczna premium (3 lata)', price: 1500, coating: true, reminderMonths: 6 },
      { id: 'felgi', name: 'Powłoka na felgi', price: 400 },
      { id: 'szyby', name: 'Powłoka na szyby', price: 250 },
      { id: 'ppf-front', name: 'Folia PPF – przód auta', price: 3500 },
    ],
  },
  {
    group: 'Pakiety',
    items: [{ id: 'sprzedaz', name: 'Przygotowanie auta do sprzedaży', price: 900 }],
  },
];

export const CATALOG_ITEMS = SERVICE_CATALOG.flatMap((g) => g.items);

export function servicesFromCatalog(selection) {
  // selection: [{ id, price }]
  return selection
    .map(({ id, price }) => {
      const c = CATALOG_ITEMS.find((x) => x.id === id);
      if (!c) return null;
      return {
        id: c.id,
        name: c.name,
        description: c.description || '',
        price: Number(price) > 0 ? Math.round(Number(price)) : c.price,
        correction: !!c.correction,
        coating: !!c.coating,
        reminderMonths: c.reminderMonths || null,
        hidden: false,
      };
    })
    .filter(Boolean);
}

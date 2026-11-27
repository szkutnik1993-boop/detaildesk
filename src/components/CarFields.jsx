import { Field, Segmented } from './ui.jsx';

export default function CarFields({ car, onChange, sizes, notes = true }) {
  const set = (k) => (e) => onChange({ ...car, [k]: e.target.value });
  return (
    <>
      <div className="grid2">
        <Field label="Marka">
          <input value={car.make || ''} onChange={set('make')} placeholder="np. BMW" autoCapitalize="words" />
        </Field>
        <Field label="Model">
          <input value={car.model || ''} onChange={set('model')} placeholder="np. X5" autoCapitalize="words" />
        </Field>
        <Field label="Nr rejestracyjny">
          <input value={car.plate || ''} onChange={(e) => onChange({ ...car, plate: e.target.value.toUpperCase() })} placeholder="np. WA 12345" autoCapitalize="characters" />
        </Field>
        <Field label="Kolor">
          <input value={car.color || ''} onChange={set('color')} placeholder="np. czarny" />
        </Field>
        <Field label="Rok">
          <input value={car.year || ''} onChange={set('year')} inputMode="numeric" placeholder="np. 2021" />
        </Field>
        <Field label="VIN">
          <input value={car.vin || ''} onChange={(e) => onChange({ ...car, vin: e.target.value.toUpperCase() })} autoCapitalize="characters" />
        </Field>
      </div>
      <Field label="Wielkość auta">
        <Segmented options={sizes.map((s) => ({ value: s.id, label: s.name }))} value={car.size} onChange={(v) => onChange({ ...car, size: v })} />
      </Field>
      <div className="grid2">
        <Field label="Klient">
          <input value={car.ownerName || ''} onChange={set('ownerName')} placeholder="Imię i nazwisko" autoCapitalize="words" autoComplete="off" />
        </Field>
        <Field label="Telefon">
          <input type="tel" value={car.ownerPhone || ''} onChange={set('ownerPhone')} placeholder="np. 600 100 200" autoComplete="off" />
        </Field>
      </div>
      <Field label="E-mail">
        <input type="email" value={car.ownerEmail || ''} onChange={set('ownerEmail')} autoComplete="off" />
      </Field>
      {notes && (
        <Field label="Notatki o aucie / kliencie">
          <textarea rows={2} value={car.notes || ''} onChange={set('notes')} />
        </Field>
      )}
    </>
  );
}

export const emptyCar = (sizes) => ({ make: '', model: '', plate: '', color: '', year: '', vin: '', size: sizes[1]?.id || sizes[0]?.id, ownerName: '', ownerPhone: '', ownerEmail: '', notes: '' });
export const carValid = (c) => !!(c.make || c.model || c.plate || c.ownerName);

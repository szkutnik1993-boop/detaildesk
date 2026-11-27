import { PANELS } from '../lib/panels.js';

// Schemat auta z góry z polami pomiaru grubości lakieru (µm)
export default function PaintDiagram({ value = {}, onChange, threshold = 250 }) {
  const set = (key, v) => onChange && onChange({ ...value, [key]: v.replace(/[^\d]/g, '').slice(0, 4) });
  const nums = Object.values(value).map(Number).filter((n) => n > 0);
  const over = nums.filter((n) => n > threshold).length;
  return (
    <div className="paint">
      <div className="paint-car">
        <svg viewBox="0 0 300 500" preserveAspectRatio="none" aria-hidden="true">
          <rect x="40" y="10" width="220" height="480" rx="70" fill="#14161A" stroke="#33373D" strokeWidth="2" />
          <path d="M70 150 Q150 120 230 150 L220 185 Q150 165 80 185 Z" fill="#1E2126" stroke="#33373D" />
          <path d="M80 345 Q150 362 220 345 L228 372 Q150 395 72 372 Z" fill="#1E2126" stroke="#33373D" />
          <rect x="26" y="95" width="18" height="50" rx="6" fill="#26292E" />
          <rect x="256" y="95" width="18" height="50" rx="6" fill="#26292E" />
          <rect x="26" y="365" width="18" height="50" rx="6" fill="#26292E" />
          <rect x="256" y="365" width="18" height="50" rx="6" fill="#26292E" />
        </svg>
        <div className="paint-label top">PRZÓD</div>
        <div className="paint-grid">
          {PANELS.map((p) => {
            const v = value[p.key] || '';
            const cls = v === '' ? '' : Number(v) > threshold ? 'over' : 'ok';
            return (
              <label key={p.key} className={`paint-cell ${cls}`}>
                <span>{p.short}</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="—"
                  value={v}
                  readOnly={!onChange}
                  onChange={(e) => set(p.key, e.target.value)}
                  aria-label={`${p.label} (µm)`}
                />
                <small>µm</small>
              </label>
            );
          })}
        </div>
        <div className="paint-label bottom">TYŁ</div>
      </div>
      <div className="paint-legend small muted">
        <span className="dot ok" /> do {threshold} µm &nbsp; <span className="dot over" /> powyżej {threshold} µm
        {nums.length > 0 && (
          <span>
            {' '}· max {Math.max(...nums)} µm{over ? ` · ${over} el. podejrzanych` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

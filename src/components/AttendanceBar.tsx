import { AttendanceStatus } from '../types';

/** Geteilter Balken: dabei · unsicher · fehlt · offen – mit Zahlen darunter */
export function AttendanceBar({ c, compact }: { c: Record<AttendanceStatus, number>; compact?: boolean }) {
  const missing = c.absent + c.excused + c.injured;
  const parts: { k: string; n: number; cls: string; label: string }[] = [
    { k: 'p', n: c.present, cls: 'st-present', label: 'dabei' },
    { k: 'u', n: c.unsure, cls: 'st-unsure', label: 'unsicher' },
    { k: 'a', n: missing, cls: 'st-absent', label: missing === 1 ? 'fehlt' : 'fehlen' },
    { k: 'o', n: c.none, cls: 'st-none', label: 'offen' },
  ];
  const total = parts.reduce((s, p) => s + p.n, 0);
  return (
    <div className={'abar' + (compact ? ' abar-compact' : '')}>
      <div className="abar-track" role="img" aria-label={parts.map((p) => `${p.n} ${p.label}`).join(', ')}>
        {total > 0 && parts.filter((p) => p.n > 0).map((p) => <i key={p.k} className={p.cls} style={{ flexGrow: p.n }} />)}
      </div>
      <div className="abar-legend">
        {parts.map((p) => (
          <span key={p.k}>
            <i className={`dot ${p.cls}`} />
            <b>{p.n}</b> {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

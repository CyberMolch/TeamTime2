const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISODate(new Date());

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function eventStart(date: string, time?: string): Date {
  const d = parseDate(date);
  if (time && /^\d{1,2}:\d{2}$/.test(time)) {
    const [h, min] = time.split(':').map(Number);
    d.setHours(h, min);
  }
  return d;
}

/** Ein Termin gilt 2 Stunden nach Beginn als vorbei. */
export function isOver(date: string, time?: string, now = new Date()): boolean {
  if (!time) return date < toISODate(now);
  return eventStart(date, time).getTime() + 2 * 3600_000 < now.getTime();
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

export const weekdayShort = (iso: string) => WD[parseDate(iso).getDay()];
export const weekdayLong = (iso: string) => WD_LONG[parseDate(iso).getDay()];
export const monthShort = (iso: string) => MON[parseDate(iso).getMonth()];

export function formatDate(iso: string, withYear = false): string {
  const d = parseDate(iso);
  return `${WD[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`;
}

export function formatDateNumeric(iso: string): string {
  const d = parseDate(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseDate(toISO).getTime() - parseDate(fromISO).getTime()) / 86_400_000);
}

export function relativeDay(iso: string): string {
  const diff = daysBetween(todayISO(), iso);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff > 1 && diff < 7) return `In ${diff} Tagen`;
  if (diff < -1 && diff > -7) return `Vor ${-diff} Tagen`;
  return formatDate(iso, parseDate(iso).getFullYear() !== new Date().getFullYear());
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Beginn der aktuellen Saison (Standard: 1. Juli). */
export function currentSeasonStart(seasonStart?: string, now = new Date()): string {
  const [, m, d] = (seasonStart || '2000-07-01').split('-').map(Number);
  let y = now.getFullYear();
  const candidate = new Date(y, m - 1, d);
  if (candidate > now) y -= 1;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function seasonLabel(startISO: string): string {
  const y = parseDate(startISO).getFullYear();
  const s = parseDate(startISO);
  if (s.getMonth() === 0 && s.getDate() === 1) return String(y);
  return `${String(y).slice(2)}/${String(y + 1).slice(2)}`;
}

export function ageOn(birthISO: string, onISO = todayISO()): number {
  const b = parseDate(birthISO);
  const o = parseDate(onISO);
  let age = o.getFullYear() - b.getFullYear();
  if (o.getMonth() < b.getMonth() || (o.getMonth() === b.getMonth() && o.getDate() < b.getDate())) age--;
  return age;
}

/** Nächster Geburtstag ab heute (inklusive heute). */
export function nextBirthday(birthISO: string): { date: string; inDays: number; turns: number } {
  const today = parseDate(todayISO());
  const b = parseDate(birthISO);
  const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  const date = toISODate(next);
  return { date, inDays: daysBetween(todayISO(), date), turns: next.getFullYear() - b.getFullYear() };
}

export function nowISOString() {
  return new Date().toISOString();
}

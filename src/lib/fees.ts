import { FeeSettings, Player } from '../types';
import { parseDate, todayISO } from './dates';

const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export const monthKey = (iso: string) => iso.slice(0, 7);
export const monthLabel = (key: string, withYear = false) => {
  const [y, m] = key.split('-').map(Number);
  return MON[m - 1] + (withYear ? ` ${String(y).slice(2)}` : '');
};

/** Alle Monate der Saison bis einschließlich des aktuellen Monats */
export function seasonMonths(seasonStartISO: string, untilISO = todayISO()): string[] {
  const out: string[] = [];
  const d = parseDate(seasonStartISO);
  d.setDate(1);
  const end = monthKey(untilISO);
  for (let i = 0; i < 12; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key > end) break;
    out.push(key);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export const feeFor = (f: FeeSettings | undefined, pid: string) => (f?.exempt?.includes(pid) ? 0 : f?.custom?.[pid] ?? f?.amount ?? 0);
export const hasPaid = (f: FeeSettings | undefined, pid: string, month: string) => !!f?.paid?.[pid]?.includes(month);

export function feeSummary(f: FeeSettings | undefined, players: Player[], months: string[]) {
  let expected = 0;
  let received = 0;
  const openBy: Record<string, { months: string[]; amount: number }> = {};
  for (const p of players) {
    const fee = feeFor(f, p.id);
    if (!fee) continue;
    for (const m of months) {
      expected += fee;
      if (hasPaid(f, p.id, m)) received += fee;
      else {
        const o = (openBy[p.id] ||= { months: [], amount: 0 });
        o.months.push(m);
        o.amount += fee;
      }
    }
  }
  return { expected, received, open: expected - received, openBy };
}

/** Summe aller jemals bezahlten Beiträge (für den Kassenstand) */
export function feesReceivedTotal(f: FeeSettings | undefined, players: Player[]): number {
  if (!f?.paid) return 0;
  let sum = 0;
  for (const [pid, months] of Object.entries(f.paid)) {
    const p = players.find((x) => x.id === pid);
    const fee = p ? feeFor(f, pid) || f.amount : f.amount;
    sum += months.length * fee;
  }
  return sum;
}

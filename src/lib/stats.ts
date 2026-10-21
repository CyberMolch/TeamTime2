import { AttendanceStatus, CardCount, EventType, Fine, Player, TeamEvent, isMatch } from '../types';
import { isOver } from './dates';

export interface AttendanceStats {
  present: number;
  absent: number;
  excused: number;
  unsure: number;
  injured: number;
  /** Termine, bei denen für den Spieler etwas eingetragen ist (ohne "verletzt") */
  counted: number;
  /** Anwesenheitsquote 0–100, null wenn noch nichts gezählt */
  rate: number | null;
}

export interface EventFilter {
  from?: string;
  to?: string;
  types?: EventType[];
}

export function pastEvents(events: TeamEvent[], f: EventFilter = {}): TeamEvent[] {
  return events.filter(
    (e) =>
      !e.cancelled &&
      isOver(e.date, e.time) &&
      (!f.from || e.date >= f.from) &&
      (!f.to || e.date <= f.to) &&
      (!f.types || f.types.includes(e.type)),
  );
}

export function attendanceFor(playerId: string, events: TeamEvent[]): AttendanceStats {
  const s: AttendanceStats = { present: 0, absent: 0, excused: 0, unsure: 0, injured: 0, counted: 0, rate: null };
  for (const e of events) {
    const st = e.attendance?.[playerId];
    if (!st || st === 'none') continue;
    s[st]++;
  }
  s.counted = s.present + s.absent + s.excused + s.unsure;
  s.rate = s.counted ? Math.round((s.present / s.counted) * 100) : null;
  return s;
}

export function countStatus(e: TeamEvent, players: Player[]): Record<AttendanceStatus, number> {
  const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, excused: 0, unsure: 0, injured: 0, none: 0 };
  for (const p of players) c[e.attendance?.[p.id] || 'none']++;
  return c;
}

/** Wie viele der letzten Termine in Folge war der Spieler dabei? */
export function presentStreak(playerId: string, eventsSortedDesc: TeamEvent[]): number {
  let n = 0;
  for (const e of eventsSortedDesc) {
    const st = e.attendance?.[playerId];
    if (!st || st === 'none' || st === 'injured') continue;
    if (st === 'present') n++;
    else break;
  }
  return n;
}

export interface ScorerStats {
  goals: number;
  assists: number;
  yellow: number;
  yellowRed: number;
  red: number;
  matches: number;
  starts: number;
}

export function scorerStats(player: Player, events: TeamEvent[], includeManual = true, types?: EventType[]): ScorerStats {
  const s: ScorerStats = {
    goals: includeManual ? player.goals || 0 : 0,
    assists: includeManual ? player.assists || 0 : 0,
    yellow: includeManual ? player.yellowCards || 0 : 0,
    yellowRed: includeManual ? player.yellowRedCards || 0 : 0,
    red: includeManual ? player.redCards || 0 : 0,
    matches: 0,
    starts: 0,
  };
  for (const e of events) {
    if (!isMatch(e.type) || (types && !types.includes(e.type))) continue;
    const m = e.scorers?.[player.id];
    if (m) {
      s.goals += m.goals || 0;
      s.assists += m.assists || 0;
      s.yellow += m.yellow || 0;
      s.yellowRed += m.yellowRed || 0;
      s.red += m.red || 0;
    }
    if (e.attendance?.[player.id] === 'present' || e.lineup?.includes(player.id) || e.bench?.includes(player.id)) s.matches++;
    if (e.lineup?.includes(player.id)) s.starts++;
  }
  return s;
}

export function parseResult(r?: string): [number, number] | null {
  if (!r) return null;
  const m = r.match(/(\d+)\s*[:\-]\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export type Outcome = 'win' | 'draw' | 'loss';
export const outcome = (r?: string): Outcome | null => {
  const p = parseResult(r);
  if (!p) return null;
  return p[0] > p[1] ? 'win' : p[0] < p[1] ? 'loss' : 'draw';
};

/** Bilanz – standardmäßig nur Punktspiele (Liga). Pokal- und Testspiele werden getrennt ausgewertet. */
export function matchRecord(events: TeamEvent[], types: EventType[] = ['match']) {
  const rec = { played: 0, win: 0, draw: 0, loss: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] as Outcome[] };
  const sorted = [...events].filter((e) => types.includes(e.type) && parseResult(e.result)).sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    const [f, a] = parseResult(e.result)!;
    const o = outcome(e.result)!;
    rec.played++;
    rec[o]++;
    rec.goalsFor += f;
    rec.goalsAgainst += a;
    if (e.type === 'match') rec.points += o === 'win' ? 3 : o === 'draw' ? 1 : 0;
    rec.form.push(o);
  }
  rec.form = rec.form.slice(-5);
  return rec;
}

export function fineBalance(fines: Fine[]) {
  const byPlayer: Record<string, { open: number; paid: number; count: number }> = {};
  let open = 0;
  let paid = 0;
  for (const f of fines) {
    const b = (byPlayer[f.playerId] ||= { open: 0, paid: 0, count: 0 });
    b.count++;
    if (f.paid) {
      b.paid += f.amount;
      paid += f.amount;
    } else {
      b.open += f.amount;
      open += f.amount;
    }
  }
  return { byPlayer, open, paid };
}

export const euro = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });

export const byName = (a: Player, b: Player) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export interface LeagueScorer {
  p: Player;
  goals: number;
  apps: number;
  minutes?: number;
  assists: number;
  yellow: number;
  yellowRed: number;
  red: number;
  official: boolean;
}

/** Torschützen der Punktspiele: offizielle Zahlen (fussball.de) für die laufende Saison,
 *  sonst die in der App erfassten Punktspiele. Vorlagen und Karten immer aus der App. */
export function leagueScorers(players: Player[], events: TeamEvent[], officialSeason?: string): LeagueScorer[] {
  return players.map((p) => {
    const app = scorerStats(p, events, false, ['match']);
    const ext = officialSeason && p.ext?.season === officialSeason ? p.ext : undefined;
    return {
      p,
      goals: ext?.goals ?? app.goals,
      apps: ext?.apps ?? app.matches,
      minutes: ext?.minutes,
      assists: app.assists,
      yellow: app.yellow,
      yellowRed: app.yellowRed,
      red: app.red,
      official: !!ext,
    };
  });
}

export type CardScope = 'match' | 'cup';

/** Karten aus den in der App erfassten Spielen einer Saison und eines Wettbewerbs */
export function matchCards(playerId: string, events: TeamEvent[], scope: CardScope, from: string, to?: string): CardCount {
  const c: CardCount = { yellow: 0, yellowRed: 0, red: 0 };
  for (const e of events) {
    if (e.type !== scope || e.date < from || (to && e.date >= to)) continue;
    const m = e.scorers?.[playerId];
    if (!m) continue;
    c.yellow += m.yellow || 0;
    c.yellowRed += m.yellowRed || 0;
    c.red += m.red || 0;
  }
  return c;
}

/** Karten einer Saison = Summe der bei den einzelnen Spielen eingetragenen Karten.
 *  (Früher direkt eingetragene Saisonzahlen in p.cards zählen nicht mehr mit.) */
export function cardTotals(p: Player, events: TeamEvent[], _season: string, scope: CardScope, from: string, to?: string): CardCount {
  return matchCards(p.id, events, scope, from, to);
}

export const addCards = (a: CardCount, b: CardCount): CardCount => ({ yellow: a.yellow + b.yellow, yellowRed: a.yellowRed + b.yellowRed, red: a.red + b.red });
export const hasCards = (c: CardCount) => !!(c.yellow || c.yellowRed || c.red);

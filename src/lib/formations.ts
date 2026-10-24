// Formationen für 11er-Fußball. Positionen von hinten (Tor) nach vorne, x/y in Prozent des Spielfelds
// (y = 0 ist die gegnerische Torlinie oben, 100 die eigene unten).

export type Line = 'TW' | 'Abwehr' | 'Mittelfeld' | 'Sturm';
export interface Slot {
  label: string;
  line: Line;
  x: number;
  y: number;
}

const row = (labels: string[], line: Line, y: number, spread = 84): Slot[] =>
  labels.map((label, i) => ({ label, line, y, x: labels.length === 1 ? 50 : 50 - spread / 2 + (spread / (labels.length - 1)) * i }));

const GK = row(['TW'], 'TW', 89);
const D4 = row(['LV', 'IV', 'IV', 'RV'], 'Abwehr', 70, 76);
const D3 = row(['IV', 'IV', 'IV'], 'Abwehr', 71, 58);
const D5 = row(['LV', 'IV', 'IV', 'IV', 'RV'], 'Abwehr', 69, 84);

export const FORMATIONS: Record<string, Slot[]> = {
  '4-4-2': [...GK, ...D4, ...row(['LM', 'ZM', 'ZM', 'RM'], 'Mittelfeld', 46, 80), ...row(['ST', 'ST'], 'Sturm', 20, 34)],
  '4-3-3': [...GK, ...D4, ...row(['ZM', 'ZM', 'ZM'], 'Mittelfeld', 48, 52), ...row(['LA', 'ST', 'RA'], 'Sturm', 21, 70)],
  '4-2-3-1': [...GK, ...D4, ...row(['DM', 'DM'], 'Mittelfeld', 55, 34), ...row(['LA', 'ZOM', 'RA'], 'Mittelfeld', 36, 70), ...row(['ST'], 'Sturm', 16)],
  '4-1-4-1': [...GK, ...D4, ...row(['DM'], 'Mittelfeld', 57), ...row(['LM', 'ZM', 'ZM', 'RM'], 'Mittelfeld', 39, 80), ...row(['ST'], 'Sturm', 16)],
  '3-5-2': [...GK, ...D3, ...row(['LM', 'ZM', 'ZM', 'ZM', 'RM'], 'Mittelfeld', 46, 84), ...row(['ST', 'ST'], 'Sturm', 20, 34)],
  '3-4-3': [...GK, ...D3, ...row(['LM', 'ZM', 'ZM', 'RM'], 'Mittelfeld', 47, 80), ...row(['LA', 'ST', 'RA'], 'Sturm', 21, 70)],
  '5-3-2': [...GK, ...D5, ...row(['ZM', 'ZM', 'ZM'], 'Mittelfeld', 46, 56), ...row(['ST', 'ST'], 'Sturm', 20, 34)],
  '5-4-1': [...GK, ...D5, ...row(['LM', 'ZM', 'ZM', 'RM'], 'Mittelfeld', 44, 80), ...row(['ST'], 'Sturm', 18)],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);
export const DEFAULT_FORMATION = '4-4-2';

export type Pt = { x: number; y: number };

/** Bezeichnung aus der Lage auf dem Feld (für verschobene Spieler und eigene Systeme) */
export function slotAt(x: number, y: number): Omit<Slot, 'x' | 'y'> {
  const side = x < 30 ? 'L' : x > 70 ? 'R' : '';
  if (y >= 80) return { label: 'TW', line: 'TW' };
  if (y >= 60) return { label: side ? `${side}V` : 'IV', line: 'Abwehr' };
  if (y >= 50) return { label: side ? `${side}M` : 'DM', line: 'Mittelfeld' };
  if (y >= 37) return { label: side ? `${side}M` : 'ZM', line: 'Mittelfeld' };
  if (y >= 27) return { label: side ? `${side}A` : 'ZOM', line: side ? 'Sturm' : 'Mittelfeld' };
  return { label: side ? `${side}A` : 'ST', line: 'Sturm' };
}

/** Alle wählbaren Systeme: eingebaute + eigene des Vereins */
export function allFormations(custom?: Record<string, Pt[]>): string[] {
  return [...FORMATION_NAMES, ...Object.keys(custom || {})];
}

/** Positionen eines Systems, ggf. mit verschobenen Positionen dieses Spiels */
export function slotsFor(formation: string, custom?: Record<string, Pt[]>, positions?: Pt[]): Slot[] {
  const base: Slot[] = FORMATIONS[formation] || (custom?.[formation] ? custom[formation].map((p) => ({ ...p, ...slotAt(p.x, p.y) })) : FORMATIONS[DEFAULT_FORMATION]);
  if (!positions?.length) return base;
  return base.map((s, i) => {
    const p = positions[i];
    if (!p || (p.x === s.x && p.y === s.y)) return s;
    return { x: p.x, y: p.y, ...slotAt(p.x, p.y) };
  });
}

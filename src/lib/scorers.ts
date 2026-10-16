import { FUSSBALLDE_SNAPSHOT } from '../data/fussballde';
import { sameName } from '../components/RosterImport';
import { newId } from './native';
import type { Player } from '../types';

/** Übernimmt Tore, Einsätze und Minuten der Punktspiele aus dem fussball.de-Stand */
export async function importFussballdeScorers(allPlayers: Player[], savePlayer: (p: Player) => Promise<unknown> | void) {
  const ext = (r: [string, number, number, number]) => ({ season: FUSSBALLDE_SNAPSHOT.season, source: FUSSBALLDE_SNAPSHOT.source, apps: r[1], minutes: r[2], goals: r[3], updatedAt: FUSSBALLDE_SNAPSHOT.updatedAt });
  const used = new Set<string>();
  let updated = 0;
  let added = 0;
  for (const r of FUSSBALLDE_SNAPSHOT.rows) {
    const match = allPlayers.find((p) => !used.has(p.id) && sameName(p.name, r[0]));
    if (match) {
      used.add(match.id);
      await savePlayer({ ...match, ext: ext(r) });
      updated++;
    } else if (r[3] > 0) {
      await savePlayer({ id: newId(), name: r[0], ext: ext(r) });
      added++;
    }
  }
  return { updated, added };
}

export const snapshotIsNewer = (players: Player[], season: string) =>
  FUSSBALLDE_SNAPSHOT.season === season && !players.some((p) => p.ext?.season === season && p.ext.source === FUSSBALLDE_SNAPSHOT.source && p.ext.updatedAt >= FUSSBALLDE_SNAPSHOT.updatedAt);

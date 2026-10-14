import { ClubSettings, DEFAULT_CLUB, Player, TeamData, TeamEvent } from '../types';
import { demoData } from './demo';

export interface SyncMeta {
  /** Daten kommen (noch) nur aus dem Speicher des Geräts */
  fromCache: boolean;
  /** Es gibt Änderungen, die noch nicht beim Server angekommen sind */
  pending: boolean;
}

export interface Backend {
  kind: 'demo' | 'cloud';
  /** z. B. E-Mail-Adresse des Kontos */
  account?: string;
  subscribe(cb: (d: TeamData, meta: SyncMeta) => void, onError: (e: unknown) => void): () => void;
  savePlayer(p: Player): Promise<void>;
  deletePlayer(id: string): Promise<void>;
  saveEvents(es: TeamEvent[]): Promise<void>;
  deleteEvents(ids: string[]): Promise<void>;
  saveClub(patch: Partial<ClubSettings>): Promise<void>;
  replaceAll(d: TeamData): Promise<void>;
}

/** Beispielmannschaft zum Ausprobieren – liegt nur im Speicher dieses Geräts. */
export function createDemoBackend(): Backend {
  const kind = 'demo' as const;
  const key = 'teamtime2:demo';
  const listeners = new Set<(d: TeamData, meta: SyncMeta) => void>();

  const read = (): TeamData => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const d = JSON.parse(raw);
        return { players: d.players || [], events: d.events || [], club: { ...DEFAULT_CLUB, ...(d.club || {}) } };
      }
    } catch {
      /* beschädigter Speicher → neu anfangen */
    }
    const fresh = demoData();
    write(fresh);
    return fresh;
  };
  const write = (d: TeamData) => {
    try {
      localStorage.setItem(key, JSON.stringify(d));
    } catch (e) {
      console.warn('Speichern fehlgeschlagen', e);
    }
  };

  let state = read();
  const emit = () => listeners.forEach((l) => l(state, { fromCache: false, pending: false }));
  const update = async (fn: (d: TeamData) => TeamData) => {
    state = fn(state);
    write(state);
    emit();
  };

  window.addEventListener('storage', (ev) => {
    if (ev.key === key) {
      state = read();
      emit();
    }
  });

  return {
    kind,
    subscribe(cb) {
      listeners.add(cb);
      cb(state, { fromCache: false, pending: false });
      return () => listeners.delete(cb);
    },
    savePlayer: (p) =>
      update((d) => ({ ...d, players: d.players.some((x) => x.id === p.id) ? d.players.map((x) => (x.id === p.id ? p : x)) : [...d.players, p] })),
    deletePlayer: (id) => update((d) => ({ ...d, players: d.players.filter((p) => p.id !== id) })),
    saveEvents: (es) =>
      update((d) => {
        const map = new Map(d.events.map((e) => [e.id, e]));
        es.forEach((e) => map.set(e.id, e));
        return { ...d, events: [...map.values()] };
      }),
    deleteEvents: (ids) => update((d) => ({ ...d, events: d.events.filter((e) => !ids.includes(e.id)) })),
    saveClub: (patch) => update((d) => ({ ...d, club: { ...d.club, ...patch } })),
    replaceAll: (nd) => update(() => ({ players: nd.players, events: nd.events, club: { ...DEFAULT_CLUB, ...nd.club } })),
  };
}

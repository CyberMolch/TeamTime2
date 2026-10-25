import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ClubSettings, DEFAULT_CLUB, Player, TeamData, TeamEvent, STAFF_ROLES, isStaff } from '../types';
import { Backend, SyncMeta, createDemoBackend } from './backend';
import { byName } from '../lib/stats';

type Mode = 'cloud' | 'demo';
const MODE_KEY = 'teamtime2:mode';

export type Phase = 'booting' | 'login' | 'ready';

interface StoreValue {
  phase: Phase;
  backend: Backend | null;
  data: TeamData;
  meta: SyncMeta;
  online: boolean;
  error: string | null;
  /** aktive Spieler (ohne Trainerteam), alphabetisch */
  players: Player[];
  /** aktives Trainerteam (Trainer, Co.-Trainer, Teammanager, Betreuer) */
  staff: Player[];
  /** alle Spieler inkl. inaktive */
  allPlayers: Player[];
  /** Termine nach Datum aufsteigend */
  events: TeamEvent[];
  club: ClubSettings;
  playerById: (id: string) => Player | undefined;
  savePlayer: (p: Player) => Promise<void>;
  deletePlayer: (id: string) => Promise<void>;
  saveEvent: (e: TeamEvent) => Promise<void>;
  saveEvents: (es: TeamEvent[]) => Promise<void>;
  deleteEvents: (ids: string[]) => Promise<void>;
  saveClub: (patch: Partial<ClubSettings>) => Promise<void>;
  replaceAll: (d: TeamData) => Promise<void>;
  enterDemo: () => void;
  enterCloud: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);
const EMPTY: TeamData = { players: [], events: [], club: DEFAULT_CLUB };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode | null>(() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      // Den früheren Modus „Nur auf diesem Gerät“ gibt es nicht mehr; die Daten
      // bleiben gespeichert und lassen sich nach der Anmeldung übernehmen.
      return m === 'cloud' || m === 'demo' ? m : null;
    } catch {
      return null;
    }
  });
  const [phase, setPhase] = useState<Phase>('booting');
  const [backend, setBackend] = useState<Backend | null>(null);
  const [data, setData] = useState<TeamData>(EMPTY);
  const [meta, setMeta] = useState<SyncMeta>({ fromCache: false, pending: false });
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const persistMode = (m: Mode | null) => {
    try {
      if (m) localStorage.setItem(MODE_KEY, m);
      else localStorage.removeItem(MODE_KEY);
    } catch {
      /* egal */
    }
    setMode(m);
  };

  // Backend je nach Modus aufbauen
  useEffect(() => {
    let cancelled = false;
    let unsubData: (() => void) | undefined;
    let unsubAuth: (() => void) | undefined;
    setError(null);

    const attach = (b: Backend) => {
      setBackend(b);
      unsubData = b.subscribe(
        (d, m) => {
          if (cancelled) return;
          setData(d);
          setMeta(m);
          setPhase('ready');
        },
        (e: any) => {
          console.error(e);
          if (!cancelled)
            setError(
              e?.code === 'permission-denied'
                ? 'Kein Zugriff auf die Daten. Melde dich ab und wieder an.'
                : 'Die Daten konnten nicht geladen werden. Prüfe die Internetverbindung.',
            );
        },
      );
    };

    if (mode === 'demo') {
      attach(createDemoBackend());
    } else if (mode === 'cloud') {
      setPhase('booting');
      import('./firebase')
        .then((fb) => {
          if (cancelled) return;
          unsubAuth = fb.watchUser((user) => {
            unsubData?.();
            unsubData = undefined;
            if (cancelled) return;
            if (user) attach(fb.createCloudBackend(user));
            else {
              setBackend(null);
              setData(EMPTY);
              setPhase('login');
            }
          });
        })
        .catch((e) => {
          console.error(e);
          if (!cancelled) {
            setError('Die Anmeldung konnte nicht geladen werden. Prüfe die Internetverbindung.');
            setPhase('login');
          }
        });
    } else {
      setBackend(null);
      setPhase('login');
    }
    return () => {
      cancelled = true;
      unsubData?.();
      unsubAuth?.();
    };
  }, [mode]);

  const allPlayers = useMemo(() => [...data.players].sort(byName), [data.players]);
  const players = useMemo(() => allPlayers.filter((p) => !p.inactive && !isStaff(p)), [allPlayers]);
  const staff = useMemo(() => allPlayers.filter((p) => !p.inactive && isStaff(p)).sort((a, b) => STAFF_ROLES.indexOf(a.position!) - STAFF_ROLES.indexOf(b.position!) || byName(a, b)), [allPlayers]);
  const events = useMemo(
    () => [...data.events].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')),
    [data.events],
  );
  const playerMap = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);

  const need = () => {
    if (!backend) throw new Error('Nicht angemeldet');
    return backend;
  };

  const signOut = useCallback(async () => {
    if (mode === 'cloud') {
      const fb = await import('./firebase');
      await fb.logout();
    }
    persistMode(mode === 'cloud' ? 'cloud' : null);
    if (mode !== 'cloud') {
      setBackend(null);
      setPhase('login');
    }
  }, [mode]);

  const value: StoreValue = {
    phase,
    backend,
    data,
    meta,
    online,
    error,
    players,
    staff,
    allPlayers,
    events,
    club: data.club,
    playerById: (id) => playerMap.get(id),
    savePlayer: (p) => need().savePlayer(p),
    deletePlayer: async (id) => {
      const b = need();
      await b.deletePlayer(id);
      // Spieler aus der Trikot-Reihenfolge entfernen; Termine behalten die Historie
      const rot: Partial<typeof data.club> = {};
      if (data.club.jerseyRotation?.includes(id)) rot.jerseyRotation = data.club.jerseyRotation.filter((x) => x !== id);
      if (data.club.cabinRotation?.includes(id)) rot.cabinRotation = data.club.cabinRotation.filter((x) => x !== id);
      if (Object.keys(rot).length) await b.saveClub(rot);
    },
    saveEvent: (e) => need().saveEvents([e]),
    saveEvents: (es) => need().saveEvents(es),
    deleteEvents: (ids) => need().deleteEvents(ids),
    saveClub: (patch) => need().saveClub(patch),
    replaceAll: (d) => need().replaceAll(d),
    enterDemo: () => persistMode('demo'),
    enterCloud: () => persistMode('cloud'),
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore außerhalb des StoreProvider');
  return v;
}

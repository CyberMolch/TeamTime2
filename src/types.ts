// Datenmodell – bewusst kompatibel zur ersten TeamTime-Version (Firestore-Sammlungen
// "players", "events" und Dokument "settings/{uid}"), damit vorhandene Daten weiterleben.

export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'unsure' | 'injured' | 'none';
export type EventType = 'training' | 'match' | 'cup' | 'testmatch' | 'treffen' | 'other';

export interface Player {
  id: string;
  name: string;
  avatarUrl?: string;
  birthDate?: string; // YYYY-MM-DD
  position?: string;
  jerseyNumber?: string;
  nationality?: string;
  phone?: string;
  email?: string;
  // manuell erfasste Werte (z. B. aus der Zeit vor der App)
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  injuryHistory?: string;
  medicalNotes?: string;
  notes?: string;
  tags?: string[];
  inactive?: boolean;
  /** Offizielle Saisonwerte, z. B. von fussball.de eingespielt */
  ext?: ExternalStats;
  // Altfelder der ersten Version (werden nicht mehr gepflegt, nur toleriert)
  attendanceRate?: number;
  attended?: number;
  total?: number;
  status?: AttendanceStatus;
}

export interface ExternalStats {
  season: string; // z. B. "2026/27"
  source: string; // z. B. "fussball.de"
  apps?: number;
  minutes?: number;
  goals?: number;
  updatedAt: string; // YYYY-MM-DD
}

export interface MatchStat {
  goals: number;
  assists: number;
  yellow?: number;
  red?: number;
}

export interface JerseyDuty {
  playerId: string;
  takenAt?: string; // ISO – wann die Trikots mitgenommen wurden
  returnedAt?: string; // ISO – wann sie gewaschen zurückkamen
}

export interface TeamEvent {
  id: string;
  title: string;
  type: EventType;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  endTime?: string;
  meetTime?: string;
  location: string;
  opponent?: string;
  home?: boolean;
  result?: string; // "3:1" – eigene Tore zuerst
  notes?: string;
  attendance: Record<string, AttendanceStatus>;
  lineup?: string[];
  bench?: string[];
  scorers?: Record<string, MatchStat>;
  jerseyDuty?: JerseyDuty;
  cancelled?: boolean;
  seriesId?: string;
  // Altfelder
  notify?: boolean;
  notifyTime?: string;
}

export interface Fine {
  id: string;
  playerId: string;
  reason: string;
  amount: number;
  date: string; // YYYY-MM-DD
  paid: boolean;
  paidAt?: string;
}

export interface PenaltyRule {
  id: string;
  reason: string;
  amount: number;
}

export interface CashEntry {
  id: string;
  date: string;
  label: string;
  amount: number; // positiv = Einnahme, negativ = Ausgabe
}

export interface ClubSettings {
  clubName: string;
  teamName?: string;
  coachName: string;
  coachEmail?: string;
  clubLogoUrl?: string;
  theme?: 'system' | 'light' | 'dark';
  darkTheme?: boolean; // Altfeld
  seasonStart?: string; // YYYY-MM-DD, Standard 1. Juli
  defaultLocation?: string;
  // Kasse
  fines?: Fine[];
  penaltyCatalog?: PenaltyRule[];
  cashbook?: CashEntry[];
  // Mitgliedsbeiträge
  fees?: FeeSettings;
  // Trikots
  jerseyRotation?: string[]; // Reihenfolge der Spieler-IDs
}

export interface FeeSettings {
  /** Monatsbeitrag in Euro; 0 = Beiträge ausgeschaltet */
  amount: number;
  /** abweichender Betrag pro Spieler */
  custom?: Record<string, number>;
  /** Spieler, die nichts zahlen */
  exempt?: string[];
  /** bezahlte Monate je Spieler, z. B. { p1: ['2026-07', '2026-08'] } */
  paid?: Record<string, string[]>;
}

export interface TeamData {
  players: Player[];
  events: TeamEvent[];
  club: ClubSettings;
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Dabei',
  absent: 'Fehlt',
  excused: 'Entschuldigt',
  unsure: 'Unsicher',
  injured: 'Verletzt',
  none: 'Offen',
};

export const TYPE_LABEL: Record<EventType, string> = {
  training: 'Training',
  match: 'Punktspiel',
  cup: 'Pokalspiel',
  testmatch: 'Testspiel',
  treffen: 'Treffen',
  other: 'Sonstiges',
};

export const isMatch = (t: EventType) => t === 'match' || t === 'cup' || t === 'testmatch';

export const DEFAULT_PENALTIES: PenaltyRule[] = [
  { id: 'p1', reason: 'Zuspätkommen Training', amount: 5 },
  { id: 'p2', reason: 'Zuspätkommen Spiel', amount: 10 },
  { id: 'p3', reason: 'Unentschuldigtes Fehlen', amount: 20 },
  { id: 'p4', reason: 'Trikot vergessen', amount: 10 },
  { id: 'p5', reason: 'Gelbe Karte (Meckern)', amount: 10 },
  { id: 'p6', reason: 'Rote Karte', amount: 50 },
];

export const DEFAULT_CLUB: ClubSettings = {
  clubName: 'SV Grün-Weiß Annaburg',
  coachName: '',
  theme: 'system',
};

import { AttendanceStatus, DEFAULT_CLUB, DEFAULT_PENALTIES, Player, TeamData, TeamEvent } from '../types';
import { addDays, todayISO } from '../lib/dates';

// Erfundene Beispielmannschaft zum Ausprobieren – hat nichts mit echten Personen zu tun.
const NAMES = [
  ['Lukas Brenner', 'Tor', '1'],
  ['Felix Hartung', 'Abwehr', '4'],
  ['Jonas Wendt', 'Abwehr', '5'],
  ['Paul Seidel', 'Abwehr', '2'],
  ['Niklas Rothe', 'Abwehr', '3'],
  ['Tom Albrecht', 'Mittelfeld', '6'],
  ['Erik Lindner', 'Mittelfeld', '8'],
  ['Moritz Krause', 'Mittelfeld', '10'],
  ['Ben Vogt', 'Mittelfeld', '7'],
  ['Leon Scholz', 'Sturm', '9'],
  ['Finn Kaiser', 'Sturm', '11'],
  ['David Ernst', 'Mittelfeld', '14'],
  ['Simon Graf', 'Abwehr', '15'],
  ['Max Pohl', 'Tor', '12'],
  ['Jan Fiedler', 'Sturm', '19'],
  ['Tim Ludwig', 'Mittelfeld', '17'],
];

export function demoData(): TeamData {
  const today = todayISO();
  const players: Player[] = NAMES.map(([name, position, nr], i) => ({
    id: `d${i + 1}`,
    name,
    position,
    jerseyNumber: nr,
    birthDate: `${1994 + (i % 9)}-${String(((i * 5) % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`,
  }));
  // Ein Geburtstag in den nächsten Tagen
  const bd = addDays(today, 4);
  players[7].birthDate = `1997-${bd.slice(5)}`;

  const rnd = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  const pick = (seed: number, reliability: number): AttendanceStatus => {
    const r = rnd(seed);
    if (r < reliability) return 'present';
    if (r < reliability + 0.12) return 'excused';
    if (r < reliability + 0.18) return 'unsure';
    return 'absent';
  };

  const events: TeamEvent[] = [];
  // Training dienstags und donnerstags, Spiel samstags – 8 Wochen zurück, 3 Wochen voraus
  const base = new Date();
  const dow = base.getDay();
  const lastTue = addDays(today, -((dow + 5) % 7));
  const opponents = ['SV Eintracht Nord', 'FC Blau-Gelb', 'TSV Rotental', 'SG Waldhausen', 'VfL Seeburg', 'FSV Hügelland', 'SC Brückendorf', 'BSG Mühlenau', 'Germania Ost', 'SV Fortuna'];
  const results = ['3:1', '1:1', '0:2', '2:0', '4:2', '1:2', '2:2', '3:0'];
  let n = 0;
  for (let w = -8; w <= 3; w++) {
    const tue = addDays(lastTue, w * 7);
    const thu = addDays(tue, 2);
    const sat = addDays(tue, 4);
    for (const d of [tue, thu]) {
      n++;
      const past = d < today;
      events.push({
        id: `e${n}`,
        title: 'Training',
        type: 'training',
        date: d,
        time: '18:30',
        location: 'Sportplatz Am Wald',
        attendance: past ? Object.fromEntries(players.map((p, i) => [p.id, i === 10 && w > -3 ? 'injured' : pick(n * 31 + i, 0.55 + (i % 4) * 0.1)])) : {},
        seriesId: 'demo-training',
      });
    }
    n++;
    const past = sat < today;
    const idx = (w + 8) % opponents.length;
    const ev: TeamEvent = {
      id: `e${n}`,
      title: `Spiel gegen ${opponents[idx]}`,
      type: w === -6 ? 'testmatch' : w === -3 ? 'cup' : 'match',
      date: sat,
      time: '14:00',
      meetTime: '13:00',
      location: w % 2 ? 'Sportplatz Am Wald' : `Auswärts bei ${opponents[idx]}`,
      opponent: opponents[idx],
      home: w % 2 !== 0,
      attendance: {},
    };
    if (past) {
      ev.attendance = Object.fromEntries(players.map((p, i) => [p.id, i === 10 && w > -3 ? 'injured' : pick(n * 17 + i, 0.75)]));
      const present = players.filter((p) => ev.attendance[p.id] === 'present');
      ev.lineup = present.slice(0, 11).map((p) => p.id);
      ev.bench = present.slice(11).map((p) => p.id);
      ev.result = results[(w + 8) % results.length];
      const goals = Number(ev.result.split(':')[0]);
      ev.scorers = {};
      for (let g = 0; g < goals; g++) {
        const s = present[[9, 7, 10, 8, 14][g % 5] % Math.max(present.length, 1)];
        const a = present[[7, 8, 6][g % 3] % Math.max(present.length, 1)];
        if (s) (ev.scorers[s.id] ||= { goals: 0, assists: 0 }).goals++;
        if (a && a !== s) (ev.scorers[a.id] ||= { goals: 0, assists: 0 }).assists++;
      }
      if (n % 3 === 0 && present[2]) (ev.scorers[present[2].id] ||= { goals: 0, assists: 0 }).yellow = 1;
      ev.jerseyDuty = { playerId: players[(w + 8) % players.length].id, takenAt: `${sat}T16:30:00.000Z`, returnedAt: w < -1 ? `${addDays(sat, 3)}T18:00:00.000Z` : undefined };
    } else if (w === 0 || sat >= today) {
      ev.attendance = w === 0 ? Object.fromEntries(players.slice(0, 12).map((p, i) => [p.id, i === 3 ? 'absent' : i === 5 ? 'unsure' : 'present'])) : {};
    }
    events.push(ev);
  }

  return {
    players,
    events,
    club: {
      ...DEFAULT_CLUB,
      clubName: 'SV Grün-Weiß Annaburg',
      teamName: '1. Herren',
      coachName: 'Demo-Trainer',
      penaltyCatalog: DEFAULT_PENALTIES,
      fines: [
        { id: 'f1', playerId: 'd3', reason: 'Zuspätkommen Training', amount: 5, date: addDays(today, -9), paid: false },
        { id: 'f2', playerId: 'd9', reason: 'Trikot vergessen', amount: 10, date: addDays(today, -16), paid: true, paidAt: addDays(today, -10) },
        { id: 'f3', playerId: 'd3', reason: 'Gelbe Karte (Meckern)', amount: 10, date: addDays(today, -4), paid: false },
        { id: 'f4', playerId: 'd12', reason: 'Unentschuldigtes Fehlen', amount: 20, date: addDays(today, -2), paid: false },
      ],
      cashbook: [
        { id: 'c1', date: addDays(today, -30), label: 'Kassenstand übernommen', amount: 140 },
        { id: 'c2', date: addDays(today, -12), label: 'Getränke nach dem Heimspiel', amount: -36.5 },
      ],
      jerseyRotation: players.map((p) => p.id),
      fees: {
        amount: 10,
        exempt: ['d14'],
        paid: Object.fromEntries(
          players.map((p, i) => {
            const months: string[] = [];
            const d = new Date();
            const back = i % 5 === 0 ? 1 : i % 3 === 0 ? 2 : 4;
            for (let k = 0; k < 12; k++) {
              const m = new Date(d.getFullYear(), d.getMonth() - k, 1);
              if (k >= 4 - back + (i % 5 === 0 ? 2 : 0) && k < 4) months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
            }
            return [p.id, months.sort()];
          }),
        ),
      },
    },
  };
}

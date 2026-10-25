import { Player, TeamEvent, isMatch } from '../types';
import { addDays, eventStart, isOver, nextBirthday, todayISO } from './dates';
import { countStatus } from './stats';
import { eventHeading } from './texts';
import { isNative, saveFile } from './native';

// ---------- Erinnerungen (Android) ----------
// Die Einstellung gilt pro Gerät, denn Benachrichtigungen kommen auf genau diesem Handy an.

export interface ReminderPrefs {
  enabled: boolean;
  /** 'eve' = am Vortag zur Uhrzeit, 'before' = am selben Tag x Stunden vorher */
  when: 'eve' | 'before';
  time: string; // für 'eve'
  hoursBefore: number; // für 'before'
  onlyOpen: boolean; // nur erinnern, wenn noch Rückmeldungen fehlen
  birthdays: boolean; // Benachrichtigung am Geburtstag
  birthdayTime: string; // Uhrzeit am Geburtstag
}

const KEY = 'teamtime2:reminders';
export const DEFAULT_REMINDERS: ReminderPrefs = { enabled: false, when: 'eve', time: '18:00', hoursBefore: 3, onlyOpen: false, birthdays: true, birthdayTime: '09:00' };

export function loadReminderPrefs(): ReminderPrefs {
  try {
    return { ...DEFAULT_REMINDERS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULT_REMINDERS;
  }
}
export function saveReminderPrefs(p: ReminderPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* egal */
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const cur = await LocalNotifications.checkPermissions();
  if (cur.display === 'granted') return true;
  const res = await LocalNotifications.requestPermissions();
  return res.display === 'granted';
}

function reminderTime(e: TeamEvent, p: ReminderPrefs): Date {
  if (p.when === 'before') return new Date(eventStart(e.date, e.time).getTime() - p.hoursBefore * 3600_000);
  const d = eventStart(addDays(e.date, -1), p.time);
  return d;
}

let lastSignature = '';

/** Geburtstags-Benachrichtigungen: je Person der nächste Geburtstag zur eingestellten Uhrzeit */
function birthdayNotifications(people: Player[], prefs: ReminderPrefs, now: number) {
  if (!prefs.birthdays) return [];
  return people
    .filter((p) => p.birthDate)
    .map((p, i) => {
      const b = nextBirthday(p.birthDate!);
      let at = eventStart(b.date, prefs.birthdayTime);
      // Heute schon vorbei → nächstes Jahr
      if (at.getTime() <= now + 60_000) at = eventStart(addDays(b.date, 365), prefs.birthdayTime);
      const first = p.name.split(' ')[0];
      return {
        id: 5000 + i,
        title: `🎂 ${p.name} hat heute Geburtstag`,
        body: `${first} wird ${at.getFullYear() - Number(p.birthDate!.slice(0, 4))} – tippe, um zu gratulieren.`,
        schedule: { at, allowWhileIdle: true },
        extra: { playerId: p.id },
      };
    })
    .filter((n) => n.schedule.at.getTime() - now < 370 * 86_400_000)
    .slice(0, 40);
}

const ASKED = 'teamtime2:notify-asked';

/** Plant die Erinnerungen für die nächsten 30 Tage und die Geburtstage neu (nur in der App). */
export async function scheduleReminders(events: TeamEvent[], players: Player[], prefs = loadReminderPrefs(), people: Player[] = players): Promise<number> {
  if (!isNative()) return 0;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const now = Date.now();
  const birthdays = birthdayNotifications(people, prefs, now);
  // Geburtstage sind von Anfang an eingeschaltet: einmalig um Erlaubnis fragen
  if (birthdays.length && !prefs.enabled) {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display !== 'granted') {
      let asked = false;
      try {
        asked = !!localStorage.getItem(ASKED);
        localStorage.setItem(ASKED, '1');
      } catch {
        /* egal */
      }
      if (asked || (await LocalNotifications.requestPermissions()).display !== 'granted') return 0;
    }
  }
  const limit = addDays(todayISO(), 30);
  const planned = !prefs.enabled
    ? []
    : events
        .filter((e) => !e.cancelled && !isOver(e.date, e.time) && e.date <= limit)
        .map((e, i) => {
          const c = countStatus(e, players);
          const at = reminderTime(e, prefs);
          const when = prefs.when === 'eve' ? 'Morgen' : 'Heute';
          return {
            e,
            open: c.none + c.unsure,
            n: {
              id: 1000 + i,
              title: `${when}: ${eventHeading(e)} um ${e.time} Uhr`,
              body:
                c.none + c.unsure > 0
                  ? `${c.present} dabei · ${c.none} ohne Rückmeldung${c.unsure ? ` · ${c.unsure} unsicher` : ''}`
                  : `${c.present} Spieler dabei${isMatch(e.type) && !e.jerseyDuty?.playerId ? ' · Trikots noch nicht vergeben' : ''}`,
              schedule: { at, allowWhileIdle: true },
              extra: { eventId: e.id },
            },
          };
        })
        .filter((x) => x.n.schedule.at.getTime() > now + 60_000 && (!prefs.onlyOpen || x.open > 0))
        .slice(0, 40)
        .map((x) => x.n);
  planned.push(...(birthdays as typeof planned));

  const signature = JSON.stringify(planned.map((n) => [n.title, n.body, n.schedule.at.getTime()]));
  if (signature === lastSignature) return planned.length;
  lastSignature = signature;

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (planned.length) await LocalNotifications.schedule({ notifications: planned });
  return planned.length;
}

/** Tippt man auf eine Erinnerung, öffnet sich der passende Termin bzw. der Spieler (Geburtstag). */
export async function onReminderTap(cb: (target: { eventId?: string; playerId?: string }) => void): Promise<() => void> {
  if (!isNative()) return () => {};
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const sub = await LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const { eventId, playerId } = a.notification.extra || {};
    if (eventId || playerId) cb({ eventId, playerId });
  });
  return () => sub.remove();
}

// ---------- Kalender (.ics) ----------

const icsDate = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);

export function buildICS(events: TeamEvent[], clubName: string): string {
  const stamp = icsDate(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TeamTime//DE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsText(clubName)}`];
  for (const e of events) {
    const start = eventStart(e.date, e.time);
    const meet = e.meetTime ? eventStart(e.date, e.meetTime) : null;
    const begin = meet && meet < start ? meet : start;
    const end = e.endTime ? eventStart(e.date, e.endTime) : new Date(start.getTime() + (isMatch(e.type) ? 2 : 1.5) * 3600_000);
    const desc = [e.meetTime ? `Treffpunkt ${e.meetTime} Uhr, ${isMatch(e.type) ? 'Anstoß' : 'Beginn'} ${e.time} Uhr` : '', e.notes || ''].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@teamtime`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(begin)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText((e.cancelled ? 'ABGESAGT: ' : '') + eventHeading(e))}`,
    );
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
    if (e.cancelled) lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function exportCalendar(events: TeamEvent[], clubName: string, filename = 'teamtime-termine.ics') {
  await saveFile(filename, buildICS(events, clubName), 'text/calendar');
}

// ---------- Geburtstage im Browser (PC) ----------
// Im Browser lässt sich nichts im Voraus planen: beim Öffnen am Geburtstag einmal melden.
const WEB_KEY = 'teamtime2:bday-notified';
export function webBirthdayNotice(people: Player[], prefs = loadReminderPrefs()) {
  if (isNative() || !prefs.birthdays || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const today = todayISO();
  let done: string[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(WEB_KEY) || '{}');
    done = raw.date === today ? raw.ids || [] : [];
  } catch {
    /* egal */
  }
  const due = people.filter((p) => p.birthDate && p.birthDate.slice(5) === today.slice(5) && !done.includes(p.id));
  for (const p of due) {
    try {
      new Notification(`🎂 ${p.name} hat heute Geburtstag`, { body: `${p.name.split(' ')[0]} wird ${Number(today.slice(0, 4)) - Number(p.birthDate!.slice(0, 4))}.`, icon: './icon-192.png', tag: `bday-${p.id}-${today}` });
    } catch {
      /* egal */
    }
  }
  if (due.length)
    try {
      localStorage.setItem(WEB_KEY, JSON.stringify({ date: today, ids: [...done, ...due.map((p) => p.id)] }));
    } catch {
      /* egal */
    }
}

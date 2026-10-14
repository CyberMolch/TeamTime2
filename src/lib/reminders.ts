import { Player, TeamEvent, isMatch } from '../types';
import { addDays, eventStart, isOver, todayISO } from './dates';
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
}

const KEY = 'teamtime2:reminders';
export const DEFAULT_REMINDERS: ReminderPrefs = { enabled: false, when: 'eve', time: '18:00', hoursBefore: 3, onlyOpen: false };

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

/** Plant die Erinnerungen für die nächsten 30 Tage neu (nur in der App). */
export async function scheduleReminders(events: TeamEvent[], players: Player[], prefs = loadReminderPrefs()): Promise<number> {
  if (!isNative()) return 0;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const now = Date.now();
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

  const signature = JSON.stringify(planned.map((n) => [n.title, n.body, n.schedule.at.getTime()]));
  if (signature === lastSignature) return planned.length;
  lastSignature = signature;

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (planned.length) await LocalNotifications.schedule({ notifications: planned });
  return planned.length;
}

/** Tippt man auf eine Erinnerung, öffnet sich der passende Termin. */
export async function onReminderTap(cb: (eventId: string) => void): Promise<() => void> {
  if (!isNative()) return () => {};
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const sub = await LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const id = a.notification.extra?.eventId;
    if (id) cb(id);
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

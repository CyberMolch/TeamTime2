import { Player, TeamEvent, TYPE_LABEL, isMatch } from '../types';
import { formatDate } from './dates';

export function eventTitle(e: TeamEvent): string {
  if (isMatch(e.type) && e.opponent) return `${e.home === false ? 'bei' : 'gegen'} ${e.opponent}`;
  return e.title || TYPE_LABEL[e.type];
}

export function eventHeading(e: TeamEvent): string {
  if (isMatch(e.type) && e.opponent) return `${TYPE_LABEL[e.type]} ${eventTitle(e)}`;
  return e.title || TYPE_LABEL[e.type];
}

/** Nachricht für die WhatsApp-Gruppe */
export function eventShareText(e: TeamEvent, players: Player[], clubName?: string): string {
  const name = (id: string) => players.find((p) => p.id === id)?.name.split(' ')[0] || '?';
  const fullName = (id: string) => players.find((p) => p.id === id)?.name || '?';
  const by = (st: string) => players.filter((p) => e.attendance?.[p.id] === st).map((p) => p.name);
  const lines: string[] = [];
  lines.push(`*${eventHeading(e)}*${e.cancelled ? ' – ABGESAGT' : ''}`);
  const when = [formatDate(e.date)];
  if (e.meetTime) when.push(`Treffpunkt ${e.meetTime} Uhr`);
  when.push(`${isMatch(e.type) ? 'Anstoß' : 'Beginn'} ${e.time} Uhr`);
  lines.push(when.join(' · '));
  if (e.location) lines.push(`📍 ${e.location}`);
  if (e.result) lines.push(`Ergebnis: *${e.result}*`);
  if (e.notes) lines.push('', e.notes);

  if (e.lineup?.length) {
    lines.push('', `*Startelf*`, e.lineup.map(fullName).join(', '));
    if (e.bench?.length) lines.push(`*Bank:* ${e.bench.map(fullName).join(', ')}`);
  } else {
    const present = by('present');
    const unsure = by('unsure');
    const missing = [...by('absent'), ...by('excused'), ...by('injured')];
    const open = players.filter((p) => !e.attendance?.[p.id] || e.attendance[p.id] === 'none').map((p) => p.name);
    lines.push('');
    lines.push(`✅ Dabei (${present.length}): ${present.join(', ') || '–'}`);
    if (unsure.length) lines.push(`❔ Unsicher (${unsure.length}): ${unsure.join(', ')}`);
    if (missing.length) lines.push(`❌ Nicht dabei (${missing.length}): ${missing.join(', ')}`);
    if (open.length) lines.push(`⏳ Noch keine Rückmeldung (${open.length}): ${open.join(', ')}`);
  }
  if (e.jerseyDuty?.playerId || e.cabinDuty?.playerIds.length) lines.push('');
  if (e.jerseyDuty?.playerId) lines.push(`👕 Trikots: ${name(e.jerseyDuty.playerId)}`);
  if (e.cabinDuty?.playerIds.length) lines.push(`🧹 Kabine: ${e.cabinDuty.playerIds.map(name).join(' & ')}`);
  if (clubName) lines.push('', `– ${clubName}`);
  return lines.join('\n');
}

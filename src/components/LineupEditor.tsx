import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { AttendanceStatus, Player, STATUS_LABEL, TYPE_LABEL, TeamEvent, isMatch } from '../types';
import { DEFAULT_FORMATION, FORMATIONS, FORMATION_NAMES, Line } from '../lib/formations';
import { formatDate } from '../lib/dates';
import { eventTitle } from '../lib/texts';
import { haptic, shareText } from '../lib/native';
import { Icon } from './Icon';
import { Sheet, useDialog } from './ui';

// Aufstellung eines Spiels: Formation wählen, Positionen auf dem Spielfeld antippen und besetzen,
// Ersatzbank, aus dem letzten Spiel übernehmen, als Text teilen.

const POS_LINE: Record<string, Line> = { Tor: 'TW', Abwehr: 'Abwehr', Mittelfeld: 'Mittelfeld', Sturm: 'Sturm' };
const ORDER: AttendanceStatus[] = ['present', 'unsure', 'none', 'excused', 'absent', 'injured'];

/** Slots aus gespeicherten Daten (auch für alte Aufstellungen ohne Positionen) */
export function slotsOf(e: TeamEvent): { formation: string; slots: string[] } {
  const formation = e.formation && FORMATIONS[e.formation] ? e.formation : DEFAULT_FORMATION;
  const n = FORMATIONS[formation].length;
  const base = e.slots?.length ? e.slots : e.lineup || [];
  return { formation, slots: Array.from({ length: n }, (_, i) => base[i] || '') };
}

export function lineupText(e: TeamEvent, players: Player[], clubName?: string): string {
  const { formation, slots } = slotsOf(e);
  const name = (id: string) => players.find((p) => p.id === id)?.name || '?';
  const def = FORMATIONS[formation];
  const lines: string[] = [`⚽ *Aufstellung ${TYPE_LABEL[e.type]} ${eventTitle(e)}*`, `${formatDate(e.date)}${e.time ? `, ${e.time} Uhr` : ''}${e.meetTime ? ` · Treffpunkt ${e.meetTime} Uhr` : ''}`, `System: ${formation}`, ''];
  for (const line of ['TW', 'Abwehr', 'Mittelfeld', 'Sturm'] as Line[]) {
    const ids = def.map((s, i) => (s.line === line ? slots[i] : '')).filter(Boolean);
    if (ids.length) lines.push(`*${line === 'TW' ? 'Tor' : line}:* ${ids.map(name).join(', ')}`);
  }
  if (e.bench?.length) lines.push('', `*Bank:* ${e.bench.map(name).join(', ')}`);
  if (clubName) lines.push('', `– ${clubName}`);
  return lines.join('\n');
}

export function LineupEditor({ e, onClose }: { e: TeamEvent; onClose: () => void }) {
  const { players, events, club, saveEvent } = useStore();
  const { toast } = useDialog();
  const init = slotsOf(e);
  const [formation, setFormation] = useState(init.formation);
  const [slots, setSlots] = useState<string[]>(init.slots);
  const [bench, setBench] = useState<string[]>(e.bench || []);
  const [pick, setPick] = useState<{ slot: number } | { bench: true } | null>(null);
  const def = FORMATIONS[formation];
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const st = (id: string): AttendanceStatus => e.attendance?.[id] || 'none';
  const clubName = club.teamName ? `${club.clubName} ${club.teamName}` : club.clubName;

  const persist = (f: string, s: string[], b: string[]) => {
    setFormation(f);
    setSlots(s);
    setBench(b);
    saveEvent({ ...e, formation: f, slots: s, lineup: s.filter(Boolean), bench: b });
  };

  const changeFormation = (f: string) => {
    const n = FORMATIONS[f].length;
    persist(f, Array.from({ length: n }, (_, i) => slots[i] || ''), bench);
  };

  const place = (slot: number, pid: string) => {
    haptic();
    const s = [...slots];
    const from = s.indexOf(pid);
    if (from >= 0) s[from] = s[slot]; // Tausch
    s[slot] = pid;
    persist(formation, s, bench.filter((x) => x !== pid));
    setPick(null);
  };
  const clearSlot = (slot: number, toBench = false) => {
    const s = [...slots];
    const pid = s[slot];
    s[slot] = '';
    persist(formation, s, toBench && pid ? [...bench.filter((x) => x !== pid), pid] : bench);
    setPick(null);
  };
  const addBench = (pid: string) => {
    haptic();
    persist(
      formation,
      slots.map((x) => (x === pid ? '' : x)),
      [...bench.filter((x) => x !== pid), pid],
    );
    setPick(null);
  };

  // Freie Positionen mit Zusagen auffüllen – passende Position zuerst
  const autoFill = () => {
    const s = [...slots];
    const used = new Set([...s.filter(Boolean), ...bench]);
    const avail = players.filter((p) => st(p.id) === 'present' && !used.has(p.id));
    const take = (p: Player, i: number) => {
      s[i] = p.id;
      used.add(p.id);
    };
    def.forEach((slot, i) => {
      if (s[i]) return;
      const p = avail.find((x) => !used.has(x.id) && POS_LINE[x.position || ''] === slot.line);
      if (p) take(p, i);
    });
    def.forEach((slot, i) => {
      if (s[i]) return;
      const p = avail.find((x) => !used.has(x.id) && (slot.line === 'TW' ? true : POS_LINE[x.position || ''] !== 'TW'));
      if (p) take(p, i);
    });
    const rest = avail.filter((p) => !used.has(p.id)).map((p) => p.id);
    persist(formation, s, [...bench, ...rest]);
    toast(rest.length ? `Aufgefüllt, ${rest.length} weitere auf der Bank.` : 'Mit Zusagen aufgefüllt.');
  };

  const prev = useMemo(
    () =>
      [...events]
        .filter((x) => x.id !== e.id && isMatch(x.type) && x.date < e.date && (x.slots?.some(Boolean) || x.lineup?.length))
        .sort((a, b) => b.date.localeCompare(a.date))[0],
    [events, e.id, e.date],
  );
  const copyPrev = () => {
    if (!prev) return;
    const p = slotsOf(prev);
    const ok = (id: string) => byId.has(id) && !['absent', 'injured', 'excused'].includes(st(id));
    const s = p.slots.map((id) => (id && ok(id) ? id : ''));
    const missing = p.slots.filter((id) => id && !ok(id)).length;
    persist(p.formation, s, (prev.bench || []).filter((id) => ok(id) && !s.includes(id)));
    toast(`Aufstellung vom ${formatDate(prev.date)} übernommen${missing ? ` – ${missing} Position${missing === 1 ? '' : 'en'} frei (Absage/verletzt)` : ''}.`);
  };

  const share = async () => {
    const r = await shareText('Aufstellung', lineupText({ ...e, formation, slots, bench }, players, clubName));
    if (r === 'copied') toast('Aufstellung kopiert – jetzt in WhatsApp einfügen.');
  };

  const filled = slots.filter(Boolean).length;
  const short = (p?: Player) => (p ? p.name.split(' ').slice(-1)[0] : '');

  return (
    <Sheet
      title="Aufstellung"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={share} disabled={!filled}>
            <Icon name="share" size={18} /> Teilen
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            <Icon name="check" size={18} /> Fertig
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="small muted">
          {TYPE_LABEL[e.type]} {eventTitle(e)} · {formatDate(e.date)}
        </div>
        <div className="lu-toolbar">
          <label className="lu-formation">
            <span className="small muted">System</span>
            <select value={formation} onChange={(x) => changeFormation(x.target.value)}>
              {FORMATION_NAMES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <span className="small muted" style={{ marginLeft: 'auto' }}>
            <b className="num">{filled}</b>/11 · Bank <b className="num">{bench.length}</b>
          </span>
        </div>
        <div className="lu-toolbar">
          <button className="btn btn-sm" onClick={autoFill} disabled={filled === def.length}>
            <Icon name="users" size={16} /> Mit Zusagen auffüllen
          </button>
          {prev && (
            <button className="btn btn-sm" onClick={copyPrev}>
              <Icon name="copy" size={16} /> Vom {formatDate(prev.date).split(', ')[1]} übernehmen
            </button>
          )}
          {filled > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => persist(formation, slots.map(() => ''), [])}>
              Leeren
            </button>
          )}
        </div>

        <div className="pitch" role="group" aria-label={`Spielfeld, System ${formation}`}>
          <span className="pitch-line pitch-half" />
          <span className="pitch-line pitch-circle" />
          <span className="pitch-line pitch-box pitch-box-top" />
          <span className="pitch-line pitch-box pitch-box-bottom" />
          <span className="pitch-line pitch-small pitch-small-bottom" />
          {def.map((s, i) => {
            const p = byId.get(slots[i]);
            const status = p ? st(p.id) : 'none';
            return (
              <button key={i} className={'lu-slot' + (p ? ' on' : '') + (p && ['absent', 'injured', 'excused'].includes(status) ? ' warn' : '')} style={{ left: `${s.x}%`, top: `${s.y}%` }} onClick={() => setPick({ slot: i })} aria-label={`${s.label}: ${p ? p.name : 'frei'}`}>
                <span className="lu-dot">{p ? p.jerseyNumber || initials(p.name) : <Icon name="plus" size={16} stroke={2.4} />}</span>
                <span className="lu-name">{p ? short(p) : s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="section-head" style={{ marginBottom: 0 }}>
          <h3>Ersatzbank</h3>
          <button className="btn btn-sm" onClick={() => setPick({ bench: true })}>
            <Icon name="plus" size={16} /> Ersatzspieler
          </button>
        </div>
        {bench.length ? (
          <div className="chips">
            {bench.map((id) => (
              <span key={id} className="chip on lu-bench">
                {byId.get(id)?.jerseyNumber && <b className="num">{byId.get(id)!.jerseyNumber}</b>}
                {byId.get(id)?.name || 'Unbekannt'}
                <button aria-label="Von der Bank nehmen" onClick={() => persist(formation, slots, bench.filter((x) => x !== id))}>
                  <Icon name="x" size={14} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Noch niemand auf der Bank.
          </p>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          Position antippen und Spieler wählen. Ein Spieler, der schon woanders steht, tauscht den Platz. Wird automatisch gespeichert.
        </p>
      </div>

      {pick && (
        <PlayerPicker
          title={'slot' in pick ? `${def[pick.slot].label} besetzen` : 'Ersatzspieler wählen'}
          players={players}
          status={st}
          where={(id) => {
            const i = slots.indexOf(id);
            if (i >= 0) return def[i].label;
            if (bench.includes(id)) return 'Bank';
            return '';
          }}
          current={'slot' in pick ? slots[pick.slot] : undefined}
          onPick={(id) => ('slot' in pick ? place(pick.slot, id) : addBench(id))}
          onClear={'slot' in pick && slots[pick.slot] ? () => clearSlot(pick.slot) : undefined}
          onToBench={'slot' in pick && slots[pick.slot] ? () => clearSlot(pick.slot, true) : undefined}
          onClose={() => setPick(null)}
        />
      )}
    </Sheet>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function PlayerPicker({
  title,
  players,
  status,
  where,
  current,
  onPick,
  onClear,
  onToBench,
  onClose,
}: {
  title: string;
  players: Player[];
  status: (id: string) => AttendanceStatus;
  where: (id: string) => string;
  current?: string;
  onPick: (id: string) => void;
  onClear?: () => void;
  onToBench?: () => void;
  onClose: () => void;
}) {
  const sorted = [...players].sort((a, b) => ORDER.indexOf(status(a.id)) - ORDER.indexOf(status(b.id)) || a.name.localeCompare(b.name, 'de'));
  return (
    <Sheet title={title} onClose={onClose}>
      {(onClear || onToBench) && (
        <div className="toolbar" style={{ marginTop: 0 }}>
          {onToBench && (
            <button className="btn btn-sm" onClick={onToBench}>
              Auf die Bank
            </button>
          )}
          {onClear && (
            <button className="btn btn-sm btn-ghost" onClick={onClear}>
              Position leeren
            </button>
          )}
        </div>
      )}
      <div className="list">
        {sorted.map((p) => {
          const s = status(p.id);
          const w = where(p.id);
          const out = ['absent', 'injured', 'excused'].includes(s);
          return (
            <button key={p.id} className={'list-row' + (p.id === current ? ' row-on' : '') + (out ? ' row-dim' : '')} onClick={() => onPick(p.id)}>
              <span className="lu-num">{p.jerseyNumber || ''}</span>
              <span className="grow">
                <span className="title">{p.name}</span>
                <span className="sub" style={{ display: 'block' }}>
                  <span className={`dot st-${s}`} /> {s === 'none' ? 'keine Rückmeldung' : STATUS_LABEL[s]}
                  {p.position ? ` · ${p.position}` : ''}
                </span>
              </span>
              {w && <span className="tag">{w}</span>}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

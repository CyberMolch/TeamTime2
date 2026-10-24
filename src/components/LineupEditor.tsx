import { type PointerEvent, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { AttendanceStatus, Player, STATUS_LABEL, TYPE_LABEL, TeamEvent, isMatch } from '../types';
import { DEFAULT_FORMATION, FORMATIONS, Line, Pt, allFormations, slotsFor } from '../lib/formations';
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
export function slotsOf(e: TeamEvent, custom?: Record<string, Pt[]>) {
  const formation = e.formation && (FORMATIONS[e.formation] || custom?.[e.formation]) ? e.formation : e.formation && !custom ? e.formation : DEFAULT_FORMATION;
  const def = slotsFor(formation, custom, e.positions);
  const base = e.slots?.length ? e.slots : e.lineup || [];
  return { formation, slots: Array.from({ length: def.length }, (_, i) => base[i] || ''), def, moved: !!e.positions?.length };
}

export function lineupText(e: TeamEvent, players: Player[], clubName?: string, custom?: Record<string, Pt[]>): string {
  const { formation, slots, def, moved } = slotsOf(e, custom);
  const name = (id: string) => players.find((p) => p.id === id)?.name || '?';
  const lines: string[] = [`⚽ *Aufstellung ${TYPE_LABEL[e.type]} ${eventTitle(e)}*`, `${formatDate(e.date)}${e.time ? `, ${e.time} Uhr` : ''}${e.meetTime ? ` · Treffpunkt ${e.meetTime} Uhr` : ''}`, `System: ${formation}${moved ? ' (angepasst)' : ''}`, ''];
  for (const line of ['TW', 'Abwehr', 'Mittelfeld', 'Sturm'] as Line[]) {
    const ids = def.map((s, i) => (s.line === line ? slots[i] : '')).filter(Boolean);
    if (ids.length) lines.push(`*${line === 'TW' ? 'Tor' : line}:* ${ids.map(name).join(', ')}`);
  }
  if (e.bench?.length) lines.push('', `*Bank:* ${e.bench.map(name).join(', ')}`);
  if (clubName) lines.push('', `– ${clubName}`);
  return lines.join('\n');
}

export function LineupEditor({ e, onClose }: { e: TeamEvent; onClose: () => void }) {
  const { players, events, club, saveEvent, saveClub } = useStore();
  const { toast } = useDialog();
  const custom = club.customFormations;
  const init = slotsOf(e, custom);
  const [formation, setFormation] = useState(init.formation);
  const [slots, setSlots] = useState<string[]>(init.slots);
  const [bench, setBench] = useState<string[]>(e.bench || []);
  const [positions, setPositions] = useState<Pt[] | undefined>(e.positions?.length ? e.positions : undefined);
  const [pick, setPick] = useState<{ slot: number } | { bench: true } | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const def = slotsFor(formation, custom, positions);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const st = (id: string): AttendanceStatus => e.attendance?.[id] || 'none';
  const clubName = club.teamName ? `${club.clubName} ${club.teamName}` : club.clubName;

  // pos: undefined = unverändert lassen, null = eigene Positionen entfernen
  const persist = (f: string, s: string[], b: string[], pos: Pt[] | null | undefined = positions) => {
    const p = pos || undefined;
    setFormation(f);
    setSlots(s);
    setBench(b);
    setPositions(p);
    const next: TeamEvent = { ...e, formation: f, slots: s, lineup: s.filter(Boolean), bench: b, positions: p };
    if (!p) delete next.positions;
    saveEvent(next);
  };

  const changeFormation = (f: string) => persist(f, Array.from({ length: 11 }, (_, i) => slots[i] || ''), bench, null);

  // ---- Ziehen & Ablegen auf dem Spielfeld ----
  const pitchRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; x0: number; y0: number; moved: boolean } | null>(null);
  const [dragPos, setDragPos] = useState<{ i: number; x: number; y: number } | null>(null);
  const toPct = (cx: number, cy: number) => {
    const r = pitchRef.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.round(Math.min(95, Math.max(5, v)) * 10) / 10;
    return { x: clamp(((cx - r.left) / r.width) * 100), y: clamp(((cy - r.top) / r.height) * 100) };
  };
  const onDown = (i: number, ev: PointerEvent<HTMLButtonElement>) => {
    if (ev.button !== 0) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    drag.current = { i, x0: ev.clientX, y0: ev.clientY, moved: false };
  };
  const onMove = (ev: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return;
    d.moved = true;
    setDragPos({ i: d.i, ...toPct(ev.clientX, ev.clientY) });
  };
  const onUp = (ev: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setPick({ slot: d.i });
      return;
    }
    const p = toPct(ev.clientX, ev.clientY);
    setDragPos(null);
    haptic();
    // Auf einen anderen Spieler gezogen → Plätze tauschen, sonst Position verschieben
    const target = def.findIndex((s, j) => j !== d.i && Math.abs(s.x - p.x) < 7 && Math.abs(s.y - p.y) < 5.5);
    if (target >= 0) {
      const s = [...slots];
      [s[d.i], s[target]] = [s[target], s[d.i]];
      persist(formation, s, bench);
      return;
    }
    const pos = def.map((s) => ({ x: s.x, y: s.y }));
    pos[d.i] = p;
    persist(formation, slots, bench, pos);
  };

  const saveSystem = async () => {
    const name = (naming || '').trim();
    if (!name) return;
    const pts = def.map((s) => ({ x: s.x, y: s.y }));
    await saveClub({ customFormations: { ...(custom || {}), [name]: pts } });
    persist(name, slots, bench, null);
    setNaming(null);
    toast(`System „${name}“ gespeichert – steht jetzt in der Auswahl.`);
  };
  const deleteSystem = async () => {
    if (!custom?.[formation]) return;
    const rest = { ...custom };
    const pts = rest[formation];
    delete rest[formation];
    await saveClub({ customFormations: rest });
    // Positionen dieses Spiels behalten, Grundsystem 4-4-2
    persist(DEFAULT_FORMATION, slots, bench, pts);
    toast('System gelöscht.');
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
    const p = slotsOf(prev, custom);
    const ok = (id: string) => byId.has(id) && !['absent', 'injured', 'excused'].includes(st(id));
    const s = p.slots.map((id) => (id && ok(id) ? id : ''));
    const missing = p.slots.filter((id) => id && !ok(id)).length;
    persist(p.formation, s, (prev.bench || []).filter((id) => ok(id) && !s.includes(id)), prev.positions?.length ? prev.positions : null);
    toast(`Aufstellung vom ${formatDate(prev.date)} übernommen${missing ? ` – ${missing} Position${missing === 1 ? '' : 'en'} frei (Absage/verletzt)` : ''}.`);
  };

  const share = async () => {
    const r = await shareText('Aufstellung', lineupText({ ...e, formation, slots, bench, positions }, players, clubName, custom));
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
              {allFormations(custom).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          {positions && <span className="tag">angepasst</span>}
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

        <div className="pitch" ref={pitchRef} role="group" aria-label={`Spielfeld, System ${formation}`}>
          <span className="pitch-line pitch-half" />
          <span className="pitch-line pitch-circle" />
          <span className="pitch-line pitch-box pitch-box-top" />
          <span className="pitch-line pitch-box pitch-box-bottom" />
          <span className="pitch-line pitch-small pitch-small-bottom" />
          {def.map((s, i) => {
            const p = byId.get(slots[i]);
            const status = p ? st(p.id) : 'none';
            const dp = dragPos?.i === i ? dragPos : null;
            return (
              <button
                key={i}
                className={'lu-slot' + (p ? ' on' : '') + (p && ['absent', 'injured', 'excused'].includes(status) ? ' warn' : '') + (dp ? ' dragging' : '')}
                style={{ left: `${dp ? dp.x : s.x}%`, top: `${dp ? dp.y : s.y}%` }}
                onPointerDown={(ev) => onDown(i, ev)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={() => {
                  drag.current = null;
                  setDragPos(null);
                }}
                onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), setPick({ slot: i }))}
                aria-label={`${s.label}: ${p ? p.name : 'frei'}`}
              >
                <span className="lu-dot">{p ? p.jerseyNumber || initials(p.name) : <Icon name="plus" size={16} stroke={2.4} />}</span>
                <span className="lu-name">{p ? short(p) : s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="lu-toolbar">
          {positions && (
            <button className="btn btn-sm btn-ghost" onClick={() => persist(formation, slots, bench, null)}>
              <Icon name="repeat" size={16} /> Positionen zurücksetzen
            </button>
          )}
          {naming === null ? (
            <button className="btn btn-sm" onClick={() => setNaming(positions ? '' : custom?.[formation] ? formation : '')}>
              <Icon name="download" size={16} /> Als eigenes System speichern
            </button>
          ) : (
            <span className="lu-save">
              <input autoFocus value={naming} onChange={(x) => setNaming(x.target.value)} onKeyDown={(x) => x.key === 'Enter' && saveSystem()} placeholder="Name, z. B. 4-1-3-2 Raute" maxLength={30} />
              <button className="btn btn-sm btn-primary" onClick={saveSystem} disabled={!naming.trim()}>
                Speichern
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setNaming(null)}>
                Abbrechen
              </button>
            </span>
          )}
          {custom?.[formation] && !positions && naming === null && (
            <button className="btn btn-sm btn-ghost" onClick={deleteSystem}>
              <Icon name="trash" size={16} /> System löschen
            </button>
          )}
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
          Position antippen und Spieler wählen. Spieler mit Maus oder Finger an eine beliebige Stelle ziehen – auf einen anderen Spieler gezogen, tauschen beide. Wird automatisch gespeichert.
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

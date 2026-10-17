import { type ReactNode, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { MatchStat, Player, TYPE_LABEL, TeamEvent, isMatch } from '../types';
import { formatDate, relativeDay, todayISO } from '../lib/dates';
import { outcome, parseResult } from '../lib/stats';
import { eventTitle } from '../lib/texts';
import { CardInput } from '../views/Cards';
import { Icon } from './Icon';
import { Field, Sheet, useDialog } from './ui';

// "Nach dem Spiel aktualisieren": Ergebnis, Tore und Karten eines Spiels als Zahlen eintragen.
// Tore aus Punktspielen nach dem fussball.de-Stand werden auf die Saisonzahl des Spielers aufgerechnet,
// Karten zählen über die Spiele automatisch in die Karten-Übersicht.

type Row = { goals: number; yellow: number; yellowRed: number; red: number };
const EMPTY: Row = { goals: 0, yellow: 0, yellowRed: 0, red: 0 };
const COLS: { k: keyof Row; head: ReactNode; label: string }[] = [
  { k: 'goals', head: 'Tore', label: 'Tore' },
  { k: 'yellow', head: <i className="card-ico card-y" title="Gelb" />, label: 'Gelb' },
  { k: 'yellowRed', head: <i className="card-ico card-yr" title="Gelb-Rot" />, label: 'Gelb-Rot' },
  { k: 'red', head: <i className="card-ico card-r" title="Rot" />, label: 'Rot' },
];

/** Spiele, die schon angefangen haben bzw. heute sind – neuestes zuerst */
export function updatableGames(events: TeamEvent[]): TeamEvent[] {
  const today = todayISO();
  return events.filter((e) => isMatch(e.type) && !e.cancelled && e.date <= today).sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
}

export function GameUpdateSheet({ eventId, onClose }: { eventId?: string; onClose: () => void }) {
  const { events } = useStore();
  const games = useMemo(() => updatableGames(events), [events]);
  const [id, setId] = useState(eventId || games[0]?.id);
  const e = events.find((x) => x.id === id);
  if (!e)
    return (
      <Sheet title="Tore & Karten aktualisieren" onClose={onClose}>
        <p className="muted">Es gibt noch kein Spiel, das man aktualisieren könnte.</p>
      </Sheet>
    );
  // key: beim Wechsel des Spiels Entwurf neu laden
  return <GameForm key={e.id} e={e} games={games} onPick={setId} onClose={onClose} />;
}

function GameForm({ e, games, onPick, onClose }: { e: TeamEvent; games: TeamEvent[]; onPick: (id: string) => void; onClose: () => void }) {
  const { players, club, saveEvent, savePlayer } = useStore();
  const { toast } = useDialog();
  const parsed = parseResult(e.result);
  const [own, setOwn] = useState(parsed ? String(parsed[0]) : '');
  const [opp, setOpp] = useState(parsed ? String(parsed[1]) : '');
  const [draft, setDraft] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      Object.entries(e.scorers || {}).map(([pid, m]) => [pid, { goals: m.goals || 0, yellow: m.yellow || 0, yellowRed: m.yellowRed || 0, red: m.red || 0 }]),
    ),
  );
  const involved = (p: Player) => e.lineup?.includes(p.id) || e.bench?.includes(p.id) || e.attendance?.[p.id] === 'present' || !!e.scorers?.[p.id];
  const anyInvolved = players.some(involved);
  const [showAll, setShowAll] = useState(!anyInvolved);
  const list = players.filter((p) => showAll || involved(p) || draft[p.id]);
  const goalsSum = Object.values(draft).reduce((n, r) => n + r.goals, 0);
  const [saving, setSaving] = useState(false);

  const set = (pid: string, k: keyof Row, v: number) => setDraft((d) => ({ ...d, [pid]: { ...(d[pid] || EMPTY), [k]: v } }));

  const save = async () => {
    setSaving(true);
    const result = own !== '' && opp !== '' ? `${Number(own)}:${Number(opp)}` : e.result;
    const scorers: Record<string, MatchStat> = {};
    const ids = new Set([...Object.keys(e.scorers || {}), ...Object.keys(draft)]);
    for (const pid of ids) {
      const r = draft[pid] || EMPTY;
      const assists = e.scorers?.[pid]?.assists || 0;
      if (!r.goals && !r.yellow && !r.yellowRed && !r.red && !assists) continue;
      scorers[pid] = { goals: r.goals, assists, ...(r.yellow ? { yellow: r.yellow } : {}), ...(r.yellowRed ? { yellowRed: r.yellowRed } : {}), ...(r.red ? { red: r.red } : {}) };
    }
    await saveEvent({ ...e, result, scorers });

    // Liga-Tore auf die übernommene Saisonzahl (fussball.de / eigene Eingabe) aufrechnen
    if (e.type === 'match') {
      for (const p of players) {
        const ext = p.ext;
        if (!ext || e.date < seasonStartOf(ext.season)) continue;
        const now = draft[p.id]?.goals || 0;
        const before = ext.added?.[e.id];
        // Spiele bis zum Stand der Übernahme sind dort schon enthalten
        if (before === undefined && e.date <= ext.updatedAt) continue;
        if ((before ?? 0) === now) continue;
        await savePlayer({ ...p, ext: { ...ext, goals: Math.max(0, (ext.goals || 0) + now - (before ?? 0)), added: { ...(ext.added || {}), [e.id]: now } } });
      }
    }
    setSaving(false);
    toast(`${TYPE_LABEL[e.type]} ${eventTitle(e)} aktualisiert.`);
    onClose();
  };

  const ownName = club.teamName ? `${club.clubName} ${club.teamName}` : club.clubName;
  const homeFirst = e.home !== false;
  const ownInput = <input inputMode="numeric" aria-label="Eigene Tore" value={own} onFocus={(x) => x.currentTarget.select()} onChange={(x) => setOwn(x.target.value.replace(/\D/g, '').slice(0, 2))} />;
  const oppInput = <input inputMode="numeric" aria-label="Tore Gegner" value={opp} onFocus={(x) => x.currentTarget.select()} onChange={(x) => setOpp(x.target.value.replace(/\D/g, '').slice(0, 2))} />;

  return (
    <Sheet
      title="Tore & Karten aktualisieren"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Icon name="check" size={18} /> {saving ? 'Speichert …' : 'Speichern'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {games.length > 1 && (
          <Field label="Spiel">
            <select value={e.id} onChange={(x) => onPick(x.target.value)}>
              {games.slice(0, 30).map((g) => (
                <option key={g.id} value={g.id}>
                  {formatDate(g.date)} · {TYPE_LABEL[g.type]} {eventTitle(g)}
                  {g.result ? ` (${g.result})` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="panel scoreboard">
          <div className="team">{homeFirst ? ownName : e.opponent}</div>
          <div className="score-inputs">
            {homeFirst ? ownInput : oppInput}
            <b>:</b>
            {homeFirst ? oppInput : ownInput}
          </div>
          <div className="team">{homeFirst ? e.opponent : ownName}</div>
        </div>

        <div className="section-head" style={{ marginBottom: 0 }}>
          <h3>Torschützen & Karten</h3>
          <span className="small muted">{own !== '' ? `${goalsSum} von ${own} Toren zugeordnet` : `${goalsSum} Tore eingetragen`}</span>
        </div>
        <div className="table-wrap">
          <table className="data cards-table gu-table">
            <thead>
              <tr>
                <th>Spieler</th>
                {COLS.map((c) => (
                  <th key={c.k} className="c">
                    {c.head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="name">{p.name}</td>
                  {COLS.map((c) => (
                    <td key={c.k} className="c">
                      <CardInput value={draft[p.id]?.[c.k] || 0} min={0} label={`${c.label} ${p.name}`} onCommit={(v) => set(p.id, c.k, v)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {anyInvolved && (
          <button className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Nur Spieler aus diesem Spiel' : 'Alle Spieler anzeigen'}
          </button>
        )}
        <p className="small muted">
          {e.type === 'match'
            ? 'Punktspiel: Tore zählen für die Torschützenliste, Karten für die Liga-Karten.'
            : e.type === 'cup'
              ? 'Pokalspiel: Karten zählen beim Pokal, Tore nicht für die Liga-Torschützenliste.'
              : 'Testspiel: zählt weder für die Torschützenliste noch für Liga- oder Pokal-Karten.'}
        </p>
      </div>
    </Sheet>
  );
}

function seasonStartOf(season: string) {
  // "2026/27" → 2026-07-01, "2026" → 2026-01-01
  return season.includes('/') ? `${season.slice(0, 4)}-07-01` : `${season}-01-01`;
}

/** Großes Ergebnis-Feld für das letzte Spiel (Übersicht) */
export function LastGameCard({ e, onUpdate }: { e: TeamEvent; onUpdate: () => void }) {
  const { players, club } = useStore();
  const { go } = useNav();
  const r = parseResult(e.result);
  const o = outcome(e.result);
  const ownName = club.teamName ? `${club.clubName} ${club.teamName}` : club.clubName;
  const homeFirst = e.home !== false;
  const name = (id: string) => players.find((p) => p.id === id)?.name.split(' ').slice(-1)[0] || '?';
  const entries = Object.entries(e.scorers || {});
  const goals = entries.filter(([, m]) => m.goals).sort((a, b) => b[1].goals - a[1].goals);
  const cards = entries.filter(([, m]) => m.yellow || m.yellowRed || m.red);
  const score = r ? (homeFirst ? `${r[0]} : ${r[1]}` : `${r[1]} : ${r[0]}`) : '– : –';

  return (
    <div className={'panel last-game' + (o ? ` lg-${o}` : '')}>
      <div className="lg-head">
        <span className="small muted">
          Letztes Spiel · {TYPE_LABEL[e.type]} · {relativeDay(e.date)}
        </span>
        {o && <span className={`result res-${o}`}>{o === 'win' ? 'Sieg' : o === 'draw' ? 'Unentschieden' : 'Niederlage'}</span>}
      </div>
      <button className="lg-score" onClick={() => go({ tab: 'events', eventId: e.id })}>
        <span className="team">{homeFirst ? ownName : e.opponent}</span>
        <span className="lg-num">{score}</span>
        <span className="team">{homeFirst ? e.opponent : ownName}</span>
      </button>
      {(goals.length > 0 || cards.length > 0) && (
        <div className="lg-facts small">
          {goals.length > 0 && (
            <span>
              <b>Tore:</b> {goals.map(([id, m]) => `${name(id)}${m.goals > 1 ? ` ${m.goals}×` : ''}`).join(', ')}
            </span>
          )}
          {cards.length > 0 && (
            <span className="lg-cards">
              {cards.map(([id, m]) => (
                <span key={id}>
                  {m.yellow ? <i className="card-ico card-y" /> : null}
                  {m.yellowRed ? <i className="card-ico card-yr" /> : null}
                  {m.red ? <i className="card-ico card-r" /> : null}
                  {name(id)}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      <div className="lg-actions">
        <button className={'btn btn-sm' + (!r || !goals.length ? ' btn-primary' : '')} onClick={onUpdate}>
          <Icon name="repeat" size={16} /> {r ? 'Tore & Karten aktualisieren' : 'Ergebnis & Tore eintragen'}
        </button>
      </div>
    </div>
  );
}

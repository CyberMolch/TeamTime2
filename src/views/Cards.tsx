import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { CardCount, Player } from '../types';
import { currentSeasonStart, nextSeasonStart, seasonKey } from '../lib/dates';
import { addCards, CardScope, cardTotals, matchCards } from '../lib/stats';
import { Empty, PageHead, Segmented, useDialog } from '../components/ui';

// Karten-Seite: Pro Spieler einfach die Anzahl Gelb, Gelb-Rot und Rot eintragen.
// Die Zahl im Feld ist immer die Gesamtzahl der Saison. Karten, die zusätzlich in einzelnen
// Spielen erfasst wurden, sind darin enthalten – gespeichert wird nur der Rest.

type Kind = keyof CardCount;
const KINDS: { k: Kind; cls: string; label: string }[] = [
  { k: 'yellow', cls: 'card-y', label: 'Gelb' },
  { k: 'yellowRed', cls: 'card-yr', label: 'Gelb-Rot' },
  { k: 'red', cls: 'card-r', label: 'Rot' },
];

export function CardsView() {
  const { players, events, club, savePlayer } = useStore();
  const { go } = useNav();
  const { toast } = useDialog();
  const [scope, setScope] = useState<CardScope>('match');
  const from = currentSeasonStart(club.seasonStart);
  const to = nextSeasonStart(from);
  const season = seasonKey(from);
  const key = `${season}|${scope}`;

  const rows = useMemo(
    () => players.map((p) => ({ p, total: cardTotals(p, events, season, scope, from, to), inMatches: matchCards(p.id, events, scope, from, to) })),
    [players, events, season, scope, from, to],
  );
  const sum = rows.reduce((a, r) => addCards(a, r.total), { yellow: 0, yellowRed: 0, red: 0 } as CardCount);

  const setTotal = (p: Player, inMatches: CardCount, k: Kind, value: number) => {
    const base: CardCount = { yellow: 0, yellowRed: 0, red: 0, ...(p.cards?.[key] || {}) };
    const next = { ...base, [k]: Math.max(0, value - inMatches[k]) };
    const cards = { ...(p.cards || {}) };
    if (!next.yellow && !next.yellowRed && !next.red) delete cards[key];
    else cards[key] = next;
    savePlayer({ ...p, cards });
  };

  return (
    <>
      <PageHead title="Karten" sub={`Saison ${season} · Zahl antippen und eintragen`} />
      <div className="toolbar">
        <Segmented
          label="Wettbewerb"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'match', label: 'Punktspiele' },
            { value: 'cup', label: 'Pokal' },
          ]}
        />
      </div>

      {players.length === 0 ? (
        <div className="panel">
          <Empty icon="users" title="Noch keine Spieler" action={<button className="btn btn-primary" onClick={() => go({ tab: 'team' })}>Zum Kader</button>}>
            Leg zuerst deinen Kader an.
          </Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data cards-table">
            <thead>
              <tr>
                <th>Spieler</th>
                {KINDS.map(({ k, cls, label }) => (
                  <th key={k} className="c">
                    <span className={`card-ico ${cls}`} aria-hidden="true" /> <span className="hide-sm">{label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, total, inMatches }) => (
                <tr key={p.id}>
                  <td className="name">
                    <button className="fee-name" onClick={() => go({ tab: 'team', playerId: p.id })}>
                      {p.name}
                    </button>
                  </td>
                  {KINDS.map(({ k, label }) => (
                    <td key={k} className="c">
                      <CardInput
                        value={total[k]}
                        min={inMatches[k]}
                        label={`${label} ${p.name}`}
                        onCommit={(v) => {
                          if (v < inMatches[k]) toast(`${p.name} hat ${inMatches[k]}× ${label} aus erfassten Spielen – weniger geht nur dort.`);
                          setTotal(p, inMatches, k, Math.max(v, inMatches[k]));
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="name">Gesamt</td>
                <td className="c num strong">{sum.yellow}</td>
                <td className="c num strong">{sum.yellowRed}</td>
                <td className="c num strong">{sum.red}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="small muted" style={{ marginTop: 10 }}>
        Die Zahl ist die Gesamtzahl der Saison {season}. Karten, die du bei einem Spiel unter „Spiel & Aufstellung“ einträgst, zählen automatisch mit. Pokalkarten
        werden getrennt gezählt.
      </p>
    </>
  );
}

export function CardInput({ value, min, label, onCommit }: { value: number; min: number; label: string; onCommit: (v: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => setText(value ? String(value) : ''), [value]);
  const commit = () => {
    const v = text.trim() === '' ? 0 : Math.max(0, Math.min(99, parseInt(text, 10) || 0));
    if (v !== value) onCommit(v);
    if (v === value || v < min) setText(value ? String(value) : '');
  };
  return (
    <input
      className={'card-input' + (value ? ' has' : '')}
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder="0"
      aria-label={label}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 2))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
      }}
    />
  );
}

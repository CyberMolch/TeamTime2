import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { CardCount, Player } from '../types';
import { currentSeasonStart, nextSeasonStart, seasonKey } from '../lib/dates';
import { addCards, CardScope, cardTotals, hasCards } from '../lib/stats';
import { Empty, PageHead, Segmented, useDialog } from '../components/ui';
import { Icon } from '../components/Icon';
import { GameUpdateSheet } from '../components/GameUpdate';

// Karten-Seite: Summe der bei den einzelnen Spielen eingetragenen Karten (Liga und Pokal getrennt).
// CardInput wird vom Fenster „Tore & Karten aktualisieren“ und der Torschützen-Bearbeitung genutzt.

type Kind = keyof CardCount;
const KINDS: { k: Kind; cls: string; label: string }[] = [
  { k: 'yellow', cls: 'card-y', label: 'Gelb' },
  { k: 'yellowRed', cls: 'card-yr', label: 'Gelb-Rot' },
  { k: 'red', cls: 'card-r', label: 'Rot' },
];

export function CardsView() {
  const { players, events, club, savePlayer } = useStore();
  const { go } = useNav();
  const { toast, confirm } = useDialog();
  const [scope, setScope] = useState<CardScope>('match');
  const [updating, setUpdating] = useState(false);
  const from = currentSeasonStart(club.seasonStart);
  const to = nextSeasonStart(from);
  const season = seasonKey(from);

  const rows = useMemo(
    () =>
      players
        .map((p) => ({ p, total: cardTotals(p, events, season, scope, from, to) }))
        .sort((a, b) => b.total.red - a.total.red || b.total.yellowRed - a.total.yellowRed || b.total.yellow - a.total.yellow || a.p.name.localeCompare(b.p.name, 'de')),
    [players, events, season, scope, from, to],
  );
  const sum = rows.reduce((a, r) => addCards(a, r.total), { yellow: 0, yellowRed: 0, red: 0 } as CardCount);
  const games = events.filter((e) => e.type === scope && e.date >= from && e.date < to && Object.values(e.scorers || {}).some((m) => m.yellow || m.yellowRed || m.red)).length;

  // Früher direkt auf dieser Seite eingetragene Saisonzahlen (zählen nicht mehr mit)
  const legacy = players.filter((p) => Object.entries(p.cards || {}).some(([k, c]) => k.startsWith(season) && (c.yellow || c.yellowRed || c.red)));
  const clearLegacy = async () => {
    if (!(await confirm(`Die früher direkt eingetragenen Kartenzahlen von ${legacy.length} Spielern werden gelöscht. Gezählt werden nur noch die Karten aus den Spielen.`, { title: 'Alte Einträge löschen?', ok: 'Löschen' }))) return;
    for (const p of legacy) {
      const cards = Object.fromEntries(Object.entries(p.cards || {}).filter(([k]) => !k.startsWith(season)));
      await savePlayer({ ...p, cards });
    }
    toast('Alte Einträge gelöscht.');
  };
  const legacyText = (p: Player) =>
    Object.entries(p.cards || {})
      .filter(([k]) => k.startsWith(season))
      .map(([k, c]) => `${k.endsWith('cup') ? 'Pokal' : 'Liga'}: ${[c.yellow && `${c.yellow}× Gelb`, c.yellowRed && `${c.yellowRed}× Gelb-Rot`, c.red && `${c.red}× Rot`].filter(Boolean).join(', ')}`)
      .join(' · ');

  return (
    <>
      <PageHead
        title="Karten"
        sub={`Saison ${season} · aus den eingetragenen Spielen`}
        actions={
          <>
            <button className="btn btn-sm" onClick={() => go({ tab: 'results' })}>
              <Icon name="list" size={18} /> Ergebnisse
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => setUpdating(true)}>
              <Icon name="repeat" size={18} /> Nach Spiel aktualisieren
            </button>
          </>
        }
      />
      {updating && <GameUpdateSheet onClose={() => setUpdating(false)} />}
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

      {legacy.length > 0 && (
        <div className="banner banner-info" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Icon name="info" />
          <span className="grow" style={{ minWidth: 220 }}>
            <b>Früher direkt eingetragene Karten zählen nicht mehr mit.</b> Gezählt wird nur, was bei den einzelnen Spielen steht. Bitte ggf. beim jeweiligen Spiel nachtragen:
            <span style={{ display: 'block', marginTop: 6 }}>
              {legacy.map((p) => (
                <span key={p.id} style={{ display: 'block' }}>
                  {p.name} – {legacyText(p)}
                </span>
              ))}
            </span>
          </span>
          <button className="btn btn-sm" onClick={clearLegacy}>
            Alte Einträge löschen
          </button>
        </div>
      )}

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
              {rows.map(({ p, total }) => (
                <tr key={p.id} className={hasCards(total) ? '' : 'row-dim'}>
                  <td className="name">
                    <button className="fee-name" onClick={() => go({ tab: 'team', playerId: p.id })}>
                      {p.name}
                    </button>
                  </td>
                  {KINDS.map(({ k }) => (
                    <td key={k} className="c num strong">
                      {total[k] || <span className="muted">–</span>}
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
        Summe der Karten, die bei den {scope === 'match' ? 'Punktspielen' : 'Pokalspielen'} der Saison {season} eingetragen sind ({games} {games === 1 ? 'Spiel' : 'Spiele'} mit Karten). Eintragen oder
        korrigieren über „Nach Spiel aktualisieren“ oder unter Ergebnisse.
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

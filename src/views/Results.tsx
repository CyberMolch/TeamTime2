import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { TYPE_LABEL, TeamEvent } from '../types';
import { currentSeasonStart, seasonKey } from '../lib/dates';
import { matchRecord } from '../lib/stats';
import { eventTitle } from '../lib/texts';
import { Icon } from '../components/Icon';
import { DateTile, ResultBadge } from '../components/EventRow';
import { Empty, PageHead, Segmented } from '../components/ui';
import { GameUpdateSheet, updatableGames } from '../components/GameUpdate';

// Alle vergangenen Spiele mit Ergebnis, Torschützen und Karten – zum Nachtragen und Korrigieren.

type Filter = 'all' | 'match' | 'cup' | 'testmatch';

export function ResultsView() {
  const { events, players, club } = useStore();
  const { go } = useNav();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<{ id?: string; isNew?: boolean } | null>(null);
  const seasonStart = currentSeasonStart(club.seasonStart);
  const [allSeasons, setAllSeasons] = useState(false);

  const games = useMemo(
    () => updatableGames(events).filter((e) => (allSeasons || e.date >= seasonStart) && (filter === 'all' || e.type === filter)),
    [events, filter, allSeasons, seasonStart],
  );
  const rec = matchRecord(games, filter === 'all' ? ['match'] : [filter]);
  const name = (id: string) => players.find((p) => p.id === id)?.name.split(' ').slice(-1)[0] || '?';
  const missing = games.filter((e) => !e.result).length;

  return (
    <>
      <PageHead
        title="Ergebnisse"
        sub={`${allSeasons ? 'Alle Spiele' : `Saison ${seasonKey(seasonStart)}`} · Tore & Karten nachtragen`}
        actions={
          <button className="btn btn-sm btn-primary" onClick={() => setOpen({ isNew: true })}>
            <Icon name="plus" size={18} /> Spiel nachtragen
          </button>
        }
      />
      <div className="toolbar">
        <Segmented
          label="Wettbewerb"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Alle' },
            { value: 'match', label: 'Liga' },
            { value: 'cup', label: 'Pokal' },
            { value: 'testmatch', label: 'Test' },
          ]}
        />
        <label className="check small">
          <input type="checkbox" checked={allSeasons} onChange={(x) => setAllSeasons(x.target.checked)} />
          Frühere Saisons
        </label>
      </div>

      {games.length === 0 ? (
        <div className="panel">
          <Empty
            icon="trophy"
            title="Noch keine Spiele"
            action={
              <button className="btn btn-primary" onClick={() => setOpen({ isNew: true })}>
                Spiel nachtragen
              </button>
            }
          >
            Vergangene Spiele, die noch nicht in der App stehen, kannst du hier nachtragen.
          </Empty>
        </div>
      ) : (
        <>
          <p className="small muted" style={{ margin: '0 0 10px' }}>
            {rec.played > 0 && `${filter === 'all' ? 'Punktspiele' : TYPE_LABEL[filter]}: ${rec.win} S · ${rec.draw} U · ${rec.loss} N · Tore ${rec.goalsFor}:${rec.goalsAgainst}`}
            {missing > 0 && `${rec.played ? ' · ' : ''}${missing} ${missing === 1 ? 'Spiel' : 'Spiele'} ohne Ergebnis`}
          </p>
          <div className="list">
            {games.map((e) => (
              <GameRow key={e.id} e={e} name={name} onEdit={() => setOpen({ id: e.id })} onOpen={() => go({ tab: 'events', eventId: e.id })} />
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Antippen öffnet Ergebnis, Torschützen und Karten des Spiels. Alles zählt automatisch in Torschützen, Karten und Auswertung.
          </p>
        </>
      )}

      {open && <GameUpdateSheet eventId={open.id} startNew={open.isNew} onClose={() => setOpen(null)} />}
    </>
  );
}

function GameRow({ e, name, onEdit, onOpen }: { e: TeamEvent; name: (id: string) => string; onEdit: () => void; onOpen: () => void }) {
  const entries = Object.entries(e.scorers || {});
  const goals = entries.filter(([, m]) => m.goals).sort((a, b) => b[1].goals - a[1].goals);
  const cards = entries.filter(([, m]) => m.yellow || m.yellowRed || m.red);
  return (
    <div className="res-row">
      <button className="res-main" onClick={onEdit}>
        <DateTile date={e.date} match />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="title" style={{ display: "block", overflowWrap: "anywhere" }}>
            {eventTitle(e)}
          </span>
          <span className="sub" style={{ display: 'block' }}>
            {TYPE_LABEL[e.type]}
          </span>
          {(goals.length > 0 || cards.length > 0) && (
            <span className="res-facts">
              {goals.length > 0 && <span>⚽ {goals.map(([id, m]) => `${name(id)}${m.goals > 1 ? ` ${m.goals}×` : ''}`).join(', ')}</span>}
              {cards.map(([id, m]) => (
                <span key={id} className="res-card">
                  {m.yellow ? <i className="card-ico card-y" /> : null}
                  {m.yellowRed ? <i className="card-ico card-yr" /> : null}
                  {m.red ? <i className="card-ico card-r" /> : null}
                  {name(id)}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="res-side">
          {e.result ? <ResultBadge result={e.result} /> : <span className="tag tag-rose">Ergebnis fehlt</span>}
          <span className="res-edit">
            <Icon name="edit" size={14} /> {goals.length || cards.length ? 'Bearbeiten' : 'Eintragen'}
          </span>
        </span>
      </button>
      <button className="icon-btn res-open" onClick={onOpen} aria-label={`${eventTitle(e)} öffnen`}>
        <Icon name="chevronRight" size={18} />
      </button>
    </div>
  );
}

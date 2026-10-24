import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { TYPE_LABEL, TeamEvent, isMatch } from '../types';
import { currentSeasonStart, isOver, relativeDay, seasonKey } from '../lib/dates';
import { eventTitle } from '../lib/texts';
import { Icon } from '../components/Icon';
import { DateTile, ResultBadge } from '../components/EventRow';
import { Empty, PageHead } from '../components/ui';
import { LineupEditor, slotsOf } from '../components/LineupEditor';

// Aufstellung je Spieltag: alle Spiele der Saison, kommende zuerst.

export function LineupsView() {
  const { events, club } = useStore();
  const { go } = useNav();
  const [openId, setOpenId] = useState<string | null>(null);
  const seasonStart = currentSeasonStart(club.seasonStart);

  const games = useMemo(() => events.filter((e) => isMatch(e.type) && !e.cancelled && e.date >= seasonStart).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')), [events, seasonStart]);
  // Spieltag-Nummer: Reihenfolge der Punktspiele in der Saison
  const matchday = new Map(games.filter((e) => e.type === 'match').map((e, i) => [e.id, i + 1]));
  const upcoming = games.filter((e) => !isOver(e.date, e.time));
  const past = games.filter((e) => isOver(e.date, e.time)).reverse();
  const open = events.find((e) => e.id === openId);

  const row = (e: TeamEvent, next = false) => {
    const { slots } = slotsOf(e);
    const n = slots.filter(Boolean).length;
    const md = matchday.get(e.id);
    return (
      <div className={'res-row' + (next ? ' lu-next' : '')} key={e.id}>
        <button className="res-main" onClick={() => setOpenId(e.id)}>
          <DateTile date={e.date} match />
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="sub" style={{ display: 'block' }}>
              {md ? `${md}. Spieltag` : TYPE_LABEL[e.type]}
              {['Heute', 'Morgen', 'Gestern'].includes(relativeDay(e.date)) ? ` · ${relativeDay(e.date)}` : ''}
            </span>
            <span className="title" style={{ display: 'block', overflowWrap: 'anywhere' }}>
              {eventTitle(e)}
            </span>
            <span className="sub" style={{ display: 'block' }}>
              {n ? `${e.formation || '4-4-2'} · ${n}/11${e.bench?.length ? ` · Bank ${e.bench.length}` : ''}` : 'Noch keine Aufstellung'}
            </span>
          </span>
          <span className="res-side">
            {e.result ? <ResultBadge result={e.result} /> : n === 11 ? <span className="tag tag-green">steht</span> : n ? <span className="tag">{n}/11</span> : <span className="tag tag-rose">offen</span>}
            <span className="res-edit">
              <Icon name="edit" size={14} /> {n ? 'Bearbeiten' : 'Aufstellen'}
            </span>
          </span>
        </button>
        <button className="icon-btn res-open" onClick={() => go({ tab: 'events', eventId: e.id })} aria-label={`${eventTitle(e)} öffnen`}>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
    );
  };

  return (
    <>
      <PageHead title="Aufstellung" sub={`Saison ${seasonKey(seasonStart)} · zu jedem Spieltag`} />
      {games.length === 0 ? (
        <div className="panel">
          <Empty
            icon="grid"
            title="Noch keine Spiele"
            action={
              <button className="btn btn-primary" onClick={() => go({ tab: 'events' })}>
                Zu den Terminen
              </button>
            }
          >
            Leg die Spiele unter Termine an (Punktspiel, Pokalspiel, Testspiel) – dann kannst du hier die Aufstellung eintragen.
          </Empty>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section>
              <div className="section-head">
                <h2>Kommende Spiele</h2>
              </div>
              <div className="list">{upcoming.map((e, i) => row(e, i === 0))}</div>
            </section>
          )}
          {past.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>Gespielt</h2>
              </div>
              <div className="list">{past.map((e) => row(e))}</div>
            </section>
          )}
        </>
      )}
      {open && <LineupEditor key={open.id} e={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

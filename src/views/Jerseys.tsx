import { useMemo } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { Player, TeamEvent, isMatch } from '../types';
import { daysBetween, formatDate, isOver, todayISO } from '../lib/dates';
import { eventTitle } from '../lib/texts';
import { Icon } from '../components/Icon';
import { Avatar, Empty, PageHead, useDialog } from '../components/ui';

/** Reihenfolge: gespeicherte Liste + neue Spieler hinten dran */
export function rotationOrder(players: Player[], saved?: string[]): Player[] {
  const map = new Map(players.map((p) => [p.id, p]));
  const ordered = (saved || []).map((id) => map.get(id)).filter(Boolean) as Player[];
  const rest = players.filter((p) => !saved?.includes(p.id));
  return [...ordered, ...rest];
}

export function nextJerseyCandidate(players: Player[], events: TeamEvent[], saved?: string[]): Player | undefined {
  const order = rotationOrder(players, saved);
  if (!order.length) return undefined;
  const last = [...events]
    .filter((e) => isMatch(e.type) && e.jerseyDuty?.playerId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return order[0];
  const idx = order.findIndex((p) => p.id === last.jerseyDuty!.playerId);
  return order[(idx + 1) % order.length];
}

export function JerseysView() {
  const { players, events, club, saveClub, saveEvent, playerById } = useStore();
  const { go } = useNav();
  const { toast } = useDialog();
  const order = rotationOrder(players, club.jerseyRotation);
  const candidate = nextJerseyCandidate(players, events, club.jerseyRotation);
  const nextMatch = events.find((e) => isMatch(e.type) && !e.cancelled && !isOver(e.date, e.time));

  const duties = useMemo(
    () =>
      events
        .filter((e) => isMatch(e.type) && e.jerseyDuty?.playerId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [events],
  );
  const outstanding = duties.filter((e) => isOver(e.date, e.time) && !e.jerseyDuty!.returnedAt && daysBetween(e.date, todayISO()) >= 0);
  const countBy = duties.reduce<Record<string, number>>((m, e) => {
    m[e.jerseyDuty!.playerId] = (m[e.jerseyDuty!.playerId] || 0) + 1;
    return m;
  }, {});

  const move = (i: number, dir: -1 | 1) => {
    const ids = order.map((p) => p.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    saveClub({ jerseyRotation: ids });
  };

  const assign = (e: TeamEvent, p: Player) => {
    saveEvent({ ...e, jerseyDuty: { playerId: p.id } });
    toast(`${p.name} nimmt die Trikots am ${formatDate(e.date)}.`);
  };
  const markReturned = (e: TeamEvent) => {
    saveEvent({ ...e, jerseyDuty: { ...e.jerseyDuty!, takenAt: e.jerseyDuty!.takenAt || new Date().toISOString(), returnedAt: new Date().toISOString() } });
    toast('Als zurückgebracht markiert.');
  };

  return (
    <>
      <PageHead title="Trikots" sub="Wer wäscht nach welchem Spiel – reihum." />

      {players.length === 0 ? (
        <div className="panel">
          <Empty icon="shirt" title="Noch keine Spieler">
            Sobald der Kader steht, verteilt TeamTime das Trikotwaschen reihum.
          </Empty>
        </div>
      ) : (
        <div className="grid-2">
          <div style={{ display: 'grid', gap: 16 }}>
            {nextMatch && (
              <div className="panel">
                <div className="next-up">
                  <Icon name="shirt" size={30} className="muted" />
                  <div className="grow">
                    <div className="small muted">
                      Nächstes Spiel: {eventTitle(nextMatch)}, {formatDate(nextMatch.date)}
                    </div>
                    <div className="big">
                      {nextMatch.jerseyDuty?.playerId ? playerById(nextMatch.jerseyDuty.playerId)?.name || 'Unbekannt' : candidate ? `${candidate.name}?` : 'Noch offen'}
                    </div>
                    {!nextMatch.jerseyDuty?.playerId && <div className="small muted">Vorschlag nach Reihenfolge</div>}
                  </div>
                  {!nextMatch.jerseyDuty?.playerId && candidate && (
                    <button className="btn btn-primary btn-sm" onClick={() => assign(nextMatch, candidate)}>
                      Eintragen
                    </button>
                  )}
                  {nextMatch.jerseyDuty?.playerId && (
                    <button className="btn btn-sm" onClick={() => go({ tab: 'events', eventId: nextMatch.id })}>
                      Ändern
                    </button>
                  )}
                </div>
              </div>
            )}

            {outstanding.length > 0 && (
              <div className="panel">
                <div className="panel-pad" style={{ paddingBottom: 4 }}>
                  <h3>Noch nicht zurück</h3>
                </div>
                {outstanding.map((e) => {
                  const p = playerById(e.jerseyDuty!.playerId);
                  const d = daysBetween(e.date, todayISO());
                  return (
                    <div className="list-row" key={e.id}>
                      <Avatar player={p} size={32} />
                      <span className="grow">
                        <span className="title">{p?.name || 'Unbekannt'}</span>
                        <span className="sub" style={{ display: 'block', color: d > 5 ? 'var(--rose)' : undefined }}>
                          seit {formatDate(e.date)} ({d === 0 ? 'heute' : `${d} Tage`})
                        </span>
                      </span>
                      <button className="btn btn-sm" onClick={() => markReturned(e)}>
                        <Icon name="check" size={18} /> Zurück
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <section>
              <div className="section-head">
                <h2>Verlauf</h2>
              </div>
              {duties.length === 0 ? (
                <p className="muted small">Noch niemand hat Trikots mitgenommen.</p>
              ) : (
                <div className="list">
                  {duties.slice(0, 15).map((e) => {
                    const p = playerById(e.jerseyDuty!.playerId);
                    return (
                      <button className="list-row" key={e.id} onClick={() => go({ tab: 'events', eventId: e.id })}>
                        <span className="grow">
                          <span className="title">{p?.name || 'Unbekannt'}</span>
                          <span className="sub" style={{ display: 'block' }}>
                            {formatDate(e.date, true)} · {eventTitle(e)}
                          </span>
                        </span>
                        {e.jerseyDuty!.returnedAt ? (
                          <span className="tag tag-green">zurück</span>
                        ) : isOver(e.date, e.time) ? (
                          <span className="tag tag-rose">offen</span>
                        ) : (
                          <span className="tag">geplant</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <section>
            <div className="section-head">
              <h2>Reihenfolge</h2>
              <span className="small muted">mit Pfeilen sortieren</span>
            </div>
            <div className="list">
              {order.map((p, i) => (
                <div className="list-row" key={p.id} style={p.id === candidate?.id ? { boxShadow: 'inset 4px 0 0 var(--green)' } : undefined}>
                  <span className="order-num">{i + 1}</span>
                  <span className="grow">
                    <span className="title">{p.name}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {countBy[p.id] ? `${countBy[p.id]}× gewaschen` : 'noch nie'}
                      {p.id === candidate?.id ? ' · als Nächstes dran' : ''}
                    </span>
                  </span>
                  <span className="row-actions">
                    <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${p.name} nach oben`}>
                      <Icon name="chevronDown" size={18} className="flip" />
                    </button>
                    <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`${p.name} nach unten`}>
                      <Icon name="chevronDown" size={18} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { Player, TeamEvent, isMatch } from '../types';
import { daysBetween, formatDate, isOver, todayISO } from '../lib/dates';
import { eventTitle } from '../lib/texts';
import { Icon } from '../components/Icon';
import { Avatar, Empty, Field, PageHead, Segmented, useDialog } from '../components/ui';

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

/** Die nächsten zwei für die Kabine: nach dem zuletzt eingeteilten Paar weiter in der Reihenfolge */
export function nextCabinPair(players: Player[], events: TeamEvent[], saved?: string[]): Player[] {
  const order = rotationOrder(players, saved);
  if (order.length <= 2) return order;
  const last = [...events]
    .filter((e) => isMatch(e.type) && e.cabinDuty?.playerIds.length)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const idx = last ? Math.max(...last.cabinDuty!.playerIds.map((id) => order.findIndex((p) => p.id === id))) : -1;
  return [order[(idx + 1) % order.length], order[(idx + 2) % order.length]];
}

type Duty = 'jersey' | 'cabin';

export function JerseysView() {
  const { players } = useStore();
  const [duty, setDuty] = useState<Duty>(() => {
    try {
      return (localStorage.getItem('teamtime2:duty') as Duty) || 'jersey';
    } catch {
      return 'jersey';
    }
  });
  const pick = (d: Duty) => {
    setDuty(d);
    try {
      localStorage.setItem('teamtime2:duty', d);
    } catch {
      /* egal */
    }
  };
  return (
    <>
      <PageHead title="Dienste" sub={duty === 'jersey' ? 'Wer wäscht nach welchem Spiel die Trikots – reihum.' : 'Wer macht nach dem Spiel die Kabine sauber – immer zu zweit, reihum.'} />
      <div className="toolbar">
        <Segmented
          label="Dienst"
          value={duty}
          onChange={pick}
          options={[
            { value: 'jersey', label: 'Trikotwäsche' },
            { value: 'cabin', label: 'Kabinenreinigung' },
          ]}
        />
      </div>
      {players.length === 0 ? (
        <div className="panel">
          <Empty icon="shirt" title="Noch keine Spieler">
            Sobald der Kader steht, verteilt TeamTime die Dienste reihum.
          </Empty>
        </div>
      ) : duty === 'jersey' ? (
        <JerseyPanel />
      ) : (
        <CabinPanel />
      )}
    </>
  );
}

function RotationList({ order, highlight, countText, onSave }: { order: Player[]; highlight: string[]; countText: (p: Player) => string; onSave: (ids: string[]) => void }) {
  const move = (i: number, dir: -1 | 1) => {
    const ids = order.map((p) => p.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onSave(ids);
  };
  return (
    <section>
      <div className="section-head">
        <h2>Reihenfolge</h2>
        <span className="small muted">mit Pfeilen sortieren</span>
      </div>
      <div className="list">
        {order.map((p, i) => (
          <div className="list-row" key={p.id} style={highlight.includes(p.id) ? { boxShadow: 'inset 4px 0 0 var(--green)' } : undefined}>
            <span className="order-num">{i + 1}</span>
            <span className="grow">
              <span className="title">{p.name}</span>
              <span className="sub" style={{ display: 'block' }}>
                {countText(p)}
                {highlight.includes(p.id) ? ' · als Nächstes dran' : ''}
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
  );
}

function CabinPanel() {
  const { players, events, club, saveClub, saveEvent, playerById } = useStore();
  const { go } = useNav();
  const { toast } = useDialog();
  const order = rotationOrder(players, club.cabinRotation);
  const pair = nextCabinPair(players, events, club.cabinRotation);
  const nextMatch = events.find((e) => isMatch(e.type) && !e.cancelled && !isOver(e.date, e.time));
  const names = (ids: string[]) => ids.map((id) => playerById(id)?.name || 'Unbekannt').join(' & ');

  const duties = useMemo(() => events.filter((e) => isMatch(e.type) && e.cabinDuty?.playerIds.length).sort((a, b) => b.date.localeCompare(a.date)), [events]);
  const outstanding = duties.filter((e) => isOver(e.date, e.time) && !e.cabinDuty!.doneAt);
  const countBy = duties.reduce<Record<string, number>>((m, e) => {
    for (const id of e.cabinDuty!.playerIds) m[id] = (m[id] || 0) + 1;
    return m;
  }, {});

  const assign = (e: TeamEvent, ps: Player[]) => {
    saveEvent({ ...e, cabinDuty: { playerIds: ps.map((p) => p.id) } });
    toast(`${ps.map((p) => p.name).join(' & ')} machen die Kabine am ${formatDate(e.date)}.`);
  };
  const markDone = (e: TeamEvent) => {
    saveEvent({ ...e, cabinDuty: { ...e.cabinDuty!, doneAt: new Date().toISOString() } });
    toast('Kabine als erledigt markiert.');
  };
  const assigned = nextMatch?.cabinDuty?.playerIds || [];

  return (
    <div className="grid-2">
      <div style={{ display: 'grid', gap: 16 }}>
        {nextMatch && (
          <div className="panel">
            <div className="next-up">
              <Icon name="sparkle" size={30} className="muted" />
              <div className="grow">
                <div className="small muted">
                  Nächstes Spiel: {eventTitle(nextMatch)}, {formatDate(nextMatch.date)}
                </div>
                <div className="big">{assigned.length ? names(assigned) : pair.length ? `${pair.map((p) => p.name).join(' & ')}?` : 'Noch offen'}</div>
                {!assigned.length && <div className="small muted">Vorschlag nach Reihenfolge</div>}
              </div>
              {!assigned.length && pair.length > 0 && (
                <button className="btn btn-primary btn-sm" onClick={() => assign(nextMatch, pair)}>
                  Eintragen
                </button>
              )}
            </div>
            <div className="panel-pad cabin-pick" style={{ paddingTop: 0 }}>
              {[0, 1].map((slot) => (
                <Field key={slot} label={`${slot + 1}. Spieler`}>
                  <select
                    value={assigned[slot] || ''}
                    onChange={(x) => {
                      const ids = [...assigned];
                      ids[slot] = x.target.value;
                      const clean = ids.filter(Boolean);
                      saveEvent({ ...nextMatch, cabinDuty: clean.length ? { playerIds: [...new Set(clean)] } : undefined });
                    }}
                  >
                    <option value="">{slot === 0 ? 'Noch niemand' : '–'}</option>
                    {players
                      .filter((p) => p.id !== assigned[1 - slot])
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </Field>
              ))}
            </div>
          </div>
        )}

        {outstanding.length > 0 && (
          <div className="panel">
            <div className="panel-pad" style={{ paddingBottom: 4 }}>
              <h3>Noch nicht erledigt</h3>
            </div>
            {outstanding.map((e) => (
              <div className="list-row" key={e.id}>
                <span className="grow">
                  <span className="title">{names(e.cabinDuty!.playerIds)}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {formatDate(e.date)} · {eventTitle(e)}
                  </span>
                </span>
                <button className="btn btn-sm" onClick={() => markDone(e)}>
                  <Icon name="check" size={18} /> Erledigt
                </button>
              </div>
            ))}
          </div>
        )}

        <section>
          <div className="section-head">
            <h2>Verlauf</h2>
          </div>
          {duties.length === 0 ? (
            <p className="muted small">Noch niemand war für die Kabine eingeteilt.</p>
          ) : (
            <div className="list">
              {duties.slice(0, 15).map((e) => (
                <button className="list-row" key={e.id} onClick={() => go({ tab: 'events', eventId: e.id })}>
                  <span className="grow">
                    <span className="title">{names(e.cabinDuty!.playerIds)}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {formatDate(e.date, true)} · {eventTitle(e)}
                    </span>
                  </span>
                  {e.cabinDuty!.doneAt ? <span className="tag tag-green">erledigt</span> : isOver(e.date, e.time) ? <span className="tag tag-rose">offen</span> : <span className="tag">geplant</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <RotationList
        order={order}
        highlight={pair.map((p) => p.id)}
        countText={(p) => (countBy[p.id] ? `${countBy[p.id]}× Kabine` : 'noch nie')}
        onSave={(ids) => saveClub({ cabinRotation: ids })}
      />
    </div>
  );
}

function JerseyPanel() {
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


  const assign = (e: TeamEvent, p: Player) => {
    saveEvent({ ...e, jerseyDuty: { playerId: p.id } });
    toast(`${p.name} nimmt die Trikots am ${formatDate(e.date)}.`);
  };
  const markReturned = (e: TeamEvent) => {
    saveEvent({ ...e, jerseyDuty: { ...e.jerseyDuty!, takenAt: e.jerseyDuty!.takenAt || new Date().toISOString(), returnedAt: new Date().toISOString() } });
    toast('Als zurückgebracht markiert.');
  };

  return (
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

          <RotationList
            order={order}
            highlight={candidate ? [candidate.id] : []}
            countText={(p) => (countBy[p.id] ? `${countBy[p.id]}× gewaschen` : 'noch nie')}
            onSave={(ids) => saveClub({ jerseyRotation: ids })}
          />
        </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { AttendanceStatus, Fine, MatchStat, Player, STATUS_LABEL, TYPE_LABEL, TeamEvent, isMatch } from '../types';
import { formatDate, isOver, nowISOString, relativeDay, todayISO } from '../lib/dates';
import { countStatus, euro, parseResult } from '../lib/stats';
import { eventHeading, eventShareText } from '../lib/texts';
import { haptic, newId, shareText } from '../lib/native';
import { Icon } from '../components/Icon';
import { Avatar, Empty, Field, Sheet, StatusDot, useDialog } from '../components/ui';
import { DateTile } from '../components/EventRow';
import { EventForm } from '../components/EventForm';
import { nextJerseyCandidate } from './Jerseys';
import { exportCalendar } from '../lib/reminders';

const QUICK: { st: AttendanceStatus; icon: string }[] = [
  { st: 'present', icon: 'check' },
  { st: 'unsure', icon: 'help' },
  { st: 'absent', icon: 'x' },
];
const MORE_STATUS: { st: AttendanceStatus; icon: string; hint: string }[] = [
  { st: 'present', icon: 'check', hint: 'Kommt' },
  { st: 'unsure', icon: 'help', hint: 'Weiß noch nicht' },
  { st: 'absent', icon: 'x', hint: 'Fehlt ohne Entschuldigung' },
  { st: 'excused', icon: 'mail', hint: 'Hat rechtzeitig abgesagt' },
  { st: 'injured', icon: 'medical', hint: 'Zählt nicht in die Quote' },
];

function AttendanceRow({ player, status, onSet, onMore }: { player: Player; status: AttendanceStatus; onSet: (st: AttendanceStatus) => void; onMore: () => void }) {
  const special = status === 'excused' || status === 'injured';
  return (
    <div className={'att-row' + (status !== 'none' ? ` is-${status}` : '')}>
      <span className="hide-sm">
        <Avatar player={player} size={34} />
      </span>
      <span className="grow">
        <span className="title ellipsis" style={{ display: 'block' }}>
          {player.name}
        </span>
        <span className={'att-label' + (status === 'none' ? ' muted' : '')} style={status === 'none' ? undefined : { color: `var(--st-${status})` }}>
          {status === 'none' ? 'Keine Rückmeldung' : STATUS_LABEL[status]}
        </span>
      </span>
      <div className="att-buttons" role="group" aria-label={`Rückmeldung von ${player.name}`}>
        {QUICK.map((q) => (
          <button
            key={q.st}
            className={`att-btn st-${q.st}` + (status === q.st ? ' on' : '')}
            onClick={() => {
              haptic();
              onSet(q.st);
            }}
            aria-pressed={status === q.st}
            aria-label={STATUS_LABEL[q.st]}
            title={STATUS_LABEL[q.st]}
          >
            <Icon name={q.icon} size={19} stroke={2.4} />
          </button>
        ))}
        <button className={`att-btn att-more-btn st-${status}` + (special ? ' on' : '')} onClick={onMore} aria-label="Weitere Möglichkeiten" title="Entschuldigt, verletzt …">
          <Icon name={status === 'excused' ? 'mail' : status === 'injured' ? 'medical' : 'more'} size={19} stroke={2.2} />
        </button>
      </div>
    </div>
  );
}

export function EventDetail({ id }: { id: string }) {
  const { events, players, allPlayers, club, saveEvent, saveEvents, deleteEvents } = useStore();
  const { back, go } = useNav();
  const { toast, confirm } = useDialog();
  const e = events.find((x) => x.id === id);
  const [tab, setTab] = useState<'att' | 'match'>('att');
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [finesFor, setFinesFor] = useState(false);
  const [moreFor, setMoreFor] = useState<Player | null>(null);

  if (!e)
    return (
      <>
        <button className="back-link" onClick={back}>
          <Icon name="chevronLeft" size={18} /> Zurück
        </button>
        <Empty icon="calendar" title="Termin nicht gefunden">
          Er wurde vielleicht gelöscht.
        </Empty>
      </>
    );

  const match = isMatch(e.type);
  const over = isOver(e.date, e.time);
  // Inaktive Spieler nur zeigen, wenn sie bei diesem Termin eingetragen sind
  const roster = allPlayers.filter((p) => !p.inactive || (e.attendance[p.id] && e.attendance[p.id] !== 'none'));
  const c = countStatus(e, roster);

  const setStatus = (pid: string, st: AttendanceStatus) => {
    const next = { ...e.attendance };
    if (next[pid] === st) delete next[pid];
    else next[pid] = st;
    saveEvent({ ...e, attendance: next });
  };
  const allOpenPresent = () => {
    const next = { ...e.attendance };
    roster.forEach((p) => {
      if (!next[p.id] || next[p.id] === 'none') next[p.id] = 'present';
    });
    saveEvent({ ...e, attendance: next });
    toast(`${c.none} Spieler auf „dabei“ gesetzt.`, { label: 'Rückgängig', run: () => saveEvent(e) });
  };

  const share = async () => {
    const r = await shareText(eventHeading(e), eventShareText(e, roster, club.clubName));
    if (r === 'copied') toast('Text kopiert – jetzt in WhatsApp einfügen.');
    if (r === 'failed') toast('Teilen hat nicht geklappt.');
  };

  const duplicate = () => {
    const copy: TeamEvent = { ...e, id: newId(), date: todayISO() > e.date ? todayISO() : e.date, attendance: {}, result: undefined, scorers: undefined, lineup: undefined, bench: undefined, jerseyDuty: undefined, cancelled: false, seriesId: undefined };
    saveEvent(copy);
    setMenu(false);
    go({ tab: 'events', eventId: copy.id });
    toast('Kopie angelegt – passe das Datum an.');
  };

  const toggleCancel = () => {
    saveEvent({ ...e, cancelled: !e.cancelled });
    setMenu(false);
    toast(e.cancelled ? 'Termin findet wieder statt.' : 'Termin abgesagt.');
  };

  const remove = async () => {
    setMenu(false);
    const following = e.seriesId ? events.filter((x) => x.seriesId === e.seriesId && x.date > e.date) : [];
    if (following.length) {
      const all = await confirm(`Dieser Termin gehört zu einer Serie. Sollen auch die ${following.length} folgenden Termine gelöscht werden?`, {
        title: 'Serie löschen?',
        ok: `Alle ${following.length + 1} löschen`,
        danger: true,
      });
      if (all) {
        await deleteEvents([e.id, ...following.map((x) => x.id)]);
        back();
        toast(`${following.length + 1} Termine gelöscht.`);
        return;
      }
    }
    if (await confirm(`„${eventHeading(e)}“ am ${formatDate(e.date)} wird mit allen Zusagen gelöscht.`, { title: 'Termin löschen?', ok: 'Löschen', danger: true })) {
      await deleteEvents([e.id]);
      back();
      toast('Termin gelöscht.', { label: 'Rückgängig', run: () => saveEvents([e]) });
    }
  };

  return (
    <>
      <button className="back-link" onClick={back}>
        <Icon name="chevronLeft" size={18} /> Zurück
      </button>

      <div className="detail-hero">
        <DateTile date={e.date} match={match} />
        <div className="grow">
          <div className="small muted">
            {TYPE_LABEL[e.type]} · {relativeDay(e.date)}
          </div>
          <h1 style={e.cancelled ? { textDecoration: 'line-through' } : undefined}>{eventHeading(e).replace(TYPE_LABEL[e.type] + ' ', '')}</h1>
          <div className="meta-list">
            <span>
              <Icon name="clock" size={16} />
              {e.meetTime ? `Treffpunkt ${e.meetTime} · ` : ''}
              {match ? 'Anstoß' : 'Beginn'} {e.time}
              {e.endTime ? `–${e.endTime}` : ''} Uhr
            </span>
            {e.location && (
              <span>
                <Icon name="pin" size={16} />
                {e.location}
              </span>
            )}
            {e.seriesId && (
              <span>
                <Icon name="repeat" size={16} />
                Serie
              </span>
            )}
          </div>
          {e.cancelled && (
            <span className="tag tag-rose" style={{ marginTop: 8 }}>
              Abgesagt
            </span>
          )}
          {e.notes && <p style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{e.notes}</p>}
        </div>
      </div>

      <div className="toolbar">
        <button className="btn btn-sm" onClick={share}>
          <Icon name="share" size={18} /> Teilen
        </button>
        <button className="btn btn-sm" onClick={() => setEditing(true)}>
          <Icon name="edit" size={18} /> Bearbeiten
        </button>
        <button className="btn btn-sm" onClick={() => setMenu(true)} aria-label="Weitere Aktionen">
          <Icon name="more" size={18} /> Mehr
        </button>
      </div>

      {match && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'att'} className={tab === 'att' ? 'on' : ''} onClick={() => setTab('att')}>
            Zusagen
          </button>
          <button role="tab" aria-selected={tab === 'match'} className={tab === 'match' ? 'on' : ''} onClick={() => setTab('match')}>
            Spiel & Aufstellung
          </button>
        </div>
      )}

      {tab === 'att' || !match ? (
        <>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <div className="counts">
              <span>
                <StatusDot status="present" />
                <b>{c.present}</b> dabei
              </span>
              <span>
                <StatusDot status="unsure" />
                <b>{c.unsure}</b> unsicher
              </span>
              <span>
                <StatusDot status="absent" />
                <b>{c.absent + c.excused + c.injured}</b> fehlen
              </span>
              <span>
                <StatusDot status="none" />
                <b>{c.none}</b> offen
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {c.none > 0 && (
                <button className="btn btn-sm" onClick={allOpenPresent}>
                  Alle offenen: dabei
                </button>
              )}
              {over && c.absent > 0 && (
                <button className="btn btn-sm" onClick={() => setFinesFor(true)}>
                  <Icon name="wallet" size={18} /> Strafen eintragen
                </button>
              )}
            </div>
          </div>
          {roster.length === 0 ? (
            <div className="panel">
              <Empty icon="users" title="Noch keine Spieler" action={<button className="btn btn-primary" onClick={() => go({ tab: 'team' })}>Zum Kader</button>}>
                Leg zuerst deinen Kader an.
              </Empty>
            </div>
          ) : (
            <div className="list">
              {roster.map((p) => (
                <AttendanceRow key={p.id} player={p} status={e.attendance[p.id] || 'none'} onSet={(st) => setStatus(p.id, st)} onMore={() => setMoreFor(p)} />
              ))}
            </div>
          )}
          <p className="small muted" style={{ marginTop: 10 }}>
            Nochmal tippen entfernt den Eintrag. „Entschuldigt“ und „verletzt“ findest du unter den drei Punkten.
          </p>
        </>
      ) : (
        <MatchTab e={e} roster={roster} />
      )}

      {editing && <EventForm event={e} onClose={() => setEditing(false)} />}
      {menu && (
        <Sheet title="Termin" onClose={() => setMenu(false)}>
          <div className="more-list">
            <button
              className="list-row"
              onClick={async () => {
                setMenu(false);
                await exportCalendar([e], club.clubName, `termin-${e.date}.ics`);
              }}
            >
              <Icon name="calendarPlus" />
              <span className="grow">In den Kalender</span>
            </button>
            <button className="list-row" onClick={duplicate}>
              <Icon name="copy" />
              <span className="grow">Kopieren</span>
            </button>
            <button className="list-row" onClick={toggleCancel}>
              <Icon name="ban" />
              <span className="grow">{e.cancelled ? 'Absage zurücknehmen' : 'Absagen'}</span>
            </button>
            <button className="list-row" onClick={remove} style={{ color: 'var(--rose)' }}>
              <Icon name="trash" />
              <span className="grow">Löschen</span>
            </button>
          </div>
        </Sheet>
      )}
      {moreFor && (
        <Sheet title={moreFor.name} onClose={() => setMoreFor(null)}>
          <div className="more-list">
            {MORE_STATUS.map((m) => {
              const on = (e.attendance[moreFor.id] || 'none') === m.st;
              return (
                <button
                  key={m.st}
                  className={'list-row' + (on ? ' row-on' : '')}
                  onClick={() => {
                    haptic();
                    const next = { ...e.attendance, [moreFor.id]: m.st };
                    saveEvent({ ...e, attendance: next });
                    setMoreFor(null);
                  }}
                >
                  <span className={`status-ico st-${m.st}`}>
                    <Icon name={m.icon} size={18} stroke={2.4} />
                  </span>
                  <span className="grow">
                    <span className="title" style={{ display: 'block' }}>
                      {STATUS_LABEL[m.st]}
                    </span>
                    <span className="sub">{m.hint}</span>
                  </span>
                  {on && <Icon name="check" size={18} />}
                </button>
              );
            })}
            {e.attendance[moreFor.id] && e.attendance[moreFor.id] !== 'none' && (
              <button
                className="list-row"
                onClick={() => {
                  const next = { ...e.attendance };
                  delete next[moreFor.id];
                  saveEvent({ ...e, attendance: next });
                  setMoreFor(null);
                }}
              >
                <span className="status-ico st-none">
                  <Icon name="x" size={18} />
                </span>
                <span className="grow title">Eintrag entfernen</span>
              </button>
            )}
          </div>
        </Sheet>
      )}
      {finesFor && <AbsentFines e={e} players={roster} onClose={() => setFinesFor(false)} />}
    </>
  );
}

function AbsentFines({ e, players, onClose }: { e: TeamEvent; players: Player[]; onClose: () => void }) {
  const { club, saveClub } = useStore();
  const { toast } = useDialog();
  const catalog = club.penaltyCatalog?.length ? club.penaltyCatalog : [{ id: 'x', reason: 'Unentschuldigtes Fehlen', amount: 20 }];
  const absent = players.filter((p) => e.attendance[p.id] === 'absent');
  const already = new Set((club.fines || []).filter((f) => f.date === e.date && f.reason.includes('Fehlen')).map((f) => f.playerId));
  const [sel, setSel] = useState<string[]>(absent.filter((p) => !already.has(p.id)).map((p) => p.id));
  const [rule, setRule] = useState(catalog.find((r) => /fehl/i.test(r.reason))?.id || catalog[0].id);
  const r = catalog.find((x) => x.id === rule)!;

  const save = () => {
    const add: Fine[] = sel.map((pid) => ({ id: newId(), playerId: pid, reason: r.reason, amount: r.amount, date: e.date, paid: false }));
    saveClub({ fines: [...(club.fines || []), ...add] });
    toast(`${add.length} Strafen eingetragen.`);
    onClose();
  };

  return (
    <Sheet
      title="Strafen für Fehlende"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={!sel.length} onClick={save}>
            {sel.length ? `${sel.length} × ${euro(r.amount)} eintragen` : 'Niemand ausgewählt'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Strafe">
          <select value={rule} onChange={(x) => setRule(x.target.value)}>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.reason} ({euro(c.amount)})
              </option>
            ))}
          </select>
        </Field>
        <div>
          {absent.map((p) => (
            <label className="check" key={p.id}>
              <input type="checkbox" checked={sel.includes(p.id)} onChange={(x) => setSel((s) => (x.target.checked ? [...s, p.id] : s.filter((y) => y !== p.id)))} />
              {p.name}
              {already.has(p.id) && <span className="tag">schon eingetragen</span>}
            </label>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function MatchTab({ e, roster }: { e: TeamEvent; roster: Player[] }) {
  const { club, players, events, saveEvent } = useStore();
  const parsed = parseResult(e.result);
  const [own, setOwn] = useState(parsed ? String(parsed[0]) : '');
  const [opp, setOpp] = useState(parsed ? String(parsed[1]) : '');
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  useEffect(() => {
    const p = parseResult(e.result);
    setOwn(p ? String(p[0]) : '');
    setOpp(p ? String(p[1]) : '');
  }, [e.result]);

  const saveResult = () => {
    const result = own !== '' && opp !== '' ? `${Number(own)}:${Number(opp)}` : undefined;
    if (result !== e.result) saveEvent({ ...e, result });
  };

  const lineup = e.lineup || [];
  const bench = e.bench || [];
  const cycle = (pid: string) => {
    let l = lineup.filter((x) => x !== pid);
    let b = bench.filter((x) => x !== pid);
    if (lineup.includes(pid)) b = [...b, pid];
    else if (!bench.includes(pid)) l = [...l, pid];
    saveEvent({ ...e, lineup: l, bench: b });
  };
  const candidates = roster.filter(
    (p) => !onlyAvailable || ['present', 'unsure'].includes(e.attendance[p.id] || '') || lineup.includes(p.id) || bench.includes(p.id),
  );
  const involved = roster.filter((p) => lineup.includes(p.id) || bench.includes(p.id) || e.attendance[p.id] === 'present' || e.scorers?.[p.id]);

  const setStat = (pid: string, key: keyof MatchStat, delta: number) => {
    const cur: MatchStat = { goals: 0, assists: 0, ...(e.scorers?.[pid] || {}) };
    const v = Math.max(0, (cur[key] || 0) + delta);
    const next = { ...cur, [key]: v };
    const scorers = { ...(e.scorers || {}) };
    if (!next.goals && !next.assists && !next.yellow && !next.red) delete scorers[pid];
    else scorers[pid] = next;
    saveEvent({ ...e, scorers });
  };
  const goalsLogged = Object.values(e.scorers || {}).reduce((s, m) => s + (m.goals || 0), 0);

  const ownName = club.teamName ? `${club.clubName} ${club.teamName}` : club.clubName;
  const homeFirst = e.home !== false;
  const jerseySuggest = useMemo(() => nextJerseyCandidate(players, events, club.jerseyRotation), [players, events, club.jerseyRotation]);

  const ownInput = <input inputMode="numeric" aria-label="Eigene Tore" value={own} onChange={(x) => setOwn(x.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={saveResult} />;
  const oppInput = <input inputMode="numeric" aria-label="Tore Gegner" value={opp} onChange={(x) => setOpp(x.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={saveResult} />;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="panel scoreboard">
        <div className="team">{homeFirst ? ownName : e.opponent}</div>
        <div className="score-inputs">
          {homeFirst ? ownInput : oppInput}
          <b>:</b>
          {homeFirst ? oppInput : ownInput}
        </div>
        <div className="team">{homeFirst ? e.opponent : ownName}</div>
      </div>

      <section>
        <div className="section-head">
          <h2>Aufstellung</h2>
          <span className="small muted">
            Startelf <b className="num">{lineup.length}</b> · Bank <b className="num">{bench.length}</b>
          </span>
        </div>
        <div className="toolbar">
          <label className="check small">
            <input type="checkbox" checked={onlyAvailable} onChange={(x) => setOnlyAvailable(x.target.checked)} />
            Nur Spieler mit Zusage
          </label>
          {(lineup.length > 0 || bench.length > 0) && (
            <button className="btn btn-sm btn-ghost" onClick={() => saveEvent({ ...e, lineup: [], bench: [] })}>
              Zurücksetzen
            </button>
          )}
        </div>
        {candidates.length === 0 ? (
          <p className="muted small">Noch keine Zusagen. Erfasse zuerst, wer dabei ist, oder nimm den Haken oben raus.</p>
        ) : (
          <div className="pick-grid">
            {candidates.map((p) => {
              const inL = lineup.includes(p.id);
              const inB = bench.includes(p.id);
              return (
                <button key={p.id} className={'pick' + (inL || inB ? ' on' : '')} onClick={() => cycle(p.id)}>
                  <Avatar player={p} size={30} />
                  <span className="grow ellipsis" title={p.position}>
                    {p.name}
                  </span>
                  {inL && <span className="slot slot-start">Startelf</span>}
                  {inB && <span className="slot slot-bench">Bank</span>}
                </button>
              );
            })}
          </div>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>
          Tippen: Startelf → Bank → raus.
        </p>
      </section>

      <section>
        <div className="section-head">
          <h2>Tore, Vorlagen, Karten</h2>
          {parsed && <span className="small muted">{goalsLogged} von {parsed[0]} Toren zugeordnet</span>}
        </div>
        {involved.length === 0 ? (
          <p className="muted small">Sobald Spieler zugesagt haben oder aufgestellt sind, kannst du hier Tore und Karten eintragen.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Spieler</th>
                  <th className="r">Tore</th>
                  <th className="r">Vorl.</th>
                  <th className="r">Gelb</th>
                  <th className="r">Rot</th>
                </tr>
              </thead>
              <tbody>
                {involved.map((p) => {
                  const m = e.scorers?.[p.id];
                  return (
                    <tr key={p.id}>
                      <td className="name">{p.name}</td>
                      {(['goals', 'assists', 'yellow', 'red'] as (keyof MatchStat)[]).map((k) => (
                        <td className="r" key={k}>
                          <Stepper value={m?.[k] || 0} onChange={(d) => setStat(p.id, k, d)} label={`${{ goals: 'Tore', assists: 'Vorlagen', yellow: 'Gelbe Karten', red: 'Rote Karten' }[k]} ${p.name}`} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Trikots waschen</h2>
        </div>
        <div className="panel panel-pad" style={{ display: 'grid', gap: 12 }}>
          <Field label="Wer nimmt die Trikots mit?" hint={!e.jerseyDuty?.playerId && jerseySuggest ? `Laut Reihenfolge wäre ${jerseySuggest.name} dran.` : undefined}>
            <select
              value={e.jerseyDuty?.playerId || ''}
              onChange={(x) => saveEvent({ ...e, jerseyDuty: x.target.value ? { playerId: x.target.value } : undefined })}
            >
              <option value="">Noch niemand</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {!e.jerseyDuty?.playerId && jerseySuggest && (
            <button className="btn btn-sm" style={{ justifySelf: 'start' }} onClick={() => saveEvent({ ...e, jerseyDuty: { playerId: jerseySuggest.id } })}>
              {jerseySuggest.name} eintragen
            </button>
          )}
          {e.jerseyDuty?.playerId && (
            <div className="chips">
              <button
                className={'chip' + (e.jerseyDuty.takenAt ? ' on' : '')}
                onClick={() => saveEvent({ ...e, jerseyDuty: { ...e.jerseyDuty!, takenAt: e.jerseyDuty!.takenAt ? undefined : nowISOString(), returnedAt: undefined } })}
              >
                Mitgenommen
              </button>
              <button
                className={'chip' + (e.jerseyDuty.returnedAt ? ' on' : '')}
                onClick={() =>
                  saveEvent({
                    ...e,
                    jerseyDuty: { ...e.jerseyDuty!, takenAt: e.jerseyDuty!.takenAt || nowISOString(), returnedAt: e.jerseyDuty!.returnedAt ? undefined : nowISOString() },
                  })
                }
              >
                Gewaschen zurück
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (delta: number) => void; label: string }) {
  return (
    <span className="stepper">
      <button onClick={() => onChange(-1)} disabled={!value} aria-label={`${label} verringern`}>
        −
      </button>
      <span>{value || '·'}</span>
      <button onClick={() => onChange(1)} aria-label={`${label} erhöhen`}>
        +
      </button>
    </span>
  );
}

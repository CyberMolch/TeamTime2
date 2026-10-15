import { useMemo } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { TYPE_LABEL, TeamEvent, isMatch } from '../types';
import { addDays, currentSeasonStart, formatDate, isOver, nextBirthday, relativeDay, seasonLabel, todayISO, weekdayLong } from '../lib/dates';
import { attendanceFor, countStatus, euro, fineBalance, matchRecord, pastEvents } from '../lib/stats';
import { eventHeading, eventShareText } from '../lib/texts';
import { shareText } from '../lib/native';
import { ClubLogo } from '../components/ClubLogo';
import { Icon } from '../components/Icon';
import { Avatar, Empty, Meter, useDialog } from '../components/ui';
import { AttendanceBar } from '../components/AttendanceBar';
import { EventRow, ResultBadge } from '../components/EventRow';
import { nextJerseyCandidate } from './Jerseys';

export function Dashboard() {
  const { players, events, club } = useStore();
  const { go } = useNav();
  const { toast } = useDialog();
  const today = todayISO();

  const upcoming = useMemo(() => events.filter((e) => !isOver(e.date, e.time)), [events]);
  const next = upcoming.find((e) => !e.cancelled);
  const nextMatch = upcoming.find((e) => !e.cancelled && isMatch(e.type));
  const seasonStart = currentSeasonStart(club.seasonStart);
  const past = useMemo(() => pastEvents(events, { from: seasonStart }), [events, seasonStart]);
  const lastMatch = [...past].reverse().find((e) => isMatch(e.type));
  const record = matchRecord(past);

  const recentTrainings = pastEvents(events, { from: addDays(today, -28), types: ['training'] });
  const avgTraining = recentTrainings.length
    ? Math.round(recentTrainings.reduce((s, e) => s + countStatus(e, players).present, 0) / recentTrainings.length)
    : null;

  const fines = fineBalance(club.fines || []);

  const birthdays = players
    .filter((p) => p.birthDate)
    .map((p) => ({ p, ...nextBirthday(p.birthDate!) }))
    .filter((b) => b.inDays <= 21)
    .sort((a, b) => a.inDays - b.inDays);

  // Wer war in den letzten 8 Wochen selten dabei?
  const eightWeeks = pastEvents(events, { from: addDays(today, -56) });
  const lowAttendance = players
    .map((p) => ({ p, s: attendanceFor(p.id, eightWeeks) }))
    .filter((x) => x.s.counted >= 4 && (x.s.rate ?? 100) < 50)
    .sort((a, b) => (a.s.rate ?? 0) - (b.s.rate ?? 0))
    .slice(0, 5);

  // Verletzt: zuletzt als verletzt eingetragen
  const injured = players.filter((p) => {
    const last = [...events].reverse().find((e) => e.attendance?.[p.id] && e.attendance[p.id] !== 'none' && (isOver(e.date, e.time) || e.attendance[p.id] === 'injured'));
    return last?.attendance[p.id] === 'injured';
  });

  const jerseyNext = nextJerseyCandidate(players, events, club.jerseyRotation);

  const share = async (e: TeamEvent) => {
    const r = await shareText(eventHeading(e), eventShareText(e, players, club.clubName));
    if (r === 'copied') toast('Text kopiert – jetzt in WhatsApp einfügen.');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Übersicht</h1>
          <p className="page-sub">
            {weekdayLong(today)}, {formatDate(today).split(', ')[1]} · Saison {seasonLabel(seasonStart)}
          </p>
        </div>
      </div>

      {players.length === 0 && (
        <div className="panel panel-pad" style={{ marginBottom: 16 }}>
          <Empty
            icon="users"
            title="Leg los mit deinem Kader"
            action={
              <button className="btn btn-primary" onClick={() => go({ tab: 'team' })}>
                Spieler hinzufügen
              </button>
            }
          >
            Trag zuerst deine Spieler ein. Danach kannst du Termine anlegen und Zusagen erfassen.
          </Empty>
        </div>
      )}

      {next ? (
        <Kickoff e={next} onShare={() => share(next)} />
      ) : (
        players.length > 0 && (
          <div className="panel panel-pad">
            <Empty
              icon="calendar"
              title="Kein Termin geplant"
              action={
                <button className="btn btn-primary" onClick={() => go({ tab: 'events' })}>
                  Termin anlegen
                </button>
              }
            >
              Leg Trainings als Serie an, dann stehen sie für die ganze Saison drin.
            </Empty>
          </div>
        )
      )}

      <div className="stats-row" style={{ marginTop: 16 }}>
        <button className="stat" onClick={() => go({ tab: 'stats' })}>
          <div className="stat-value">
            {record.win}–{record.draw}–{record.loss}
          </div>
          <div className="stat-label">Punktspiele S–U–N</div>
        </button>
        <button className="stat" onClick={() => go({ tab: 'stats' })}>
          <div className="stat-value">{avgTraining ?? '–'}</div>
          <div className="stat-label">Ø im Training</div>
        </button>
        <button className={'stat' + (fines.open > 0 ? ' stat-rose' : '')} onClick={() => go({ tab: 'cash' })}>
          <div className="stat-value">{euro(fines.open)}</div>
          <div className="stat-label">offene Strafen</div>
        </button>
        <button className="stat" onClick={() => go({ tab: 'team' })}>
          <div className="stat-value">{players.length}</div>
          <div className="stat-label">Spieler im Kader</div>
        </button>
      </div>

      <div className="grid-2 section">
        <div>
          <div className="section-head">
            <h2>Als Nächstes</h2>
            <button className="link" onClick={() => go({ tab: 'events' })}>
              Alle Termine
            </button>
          </div>
          {upcoming.length > 1 ? (
            <div className="list">
              {upcoming.slice(next ? 1 : 0, 6).map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </div>
          ) : (
            <p className="muted small">Keine weiteren Termine.</p>
          )}

          {lastMatch && (
            <>
              <div className="section-head section">
                <h2>Letztes Spiel</h2>
              </div>
              <button className="panel list-row" style={{ borderRadius: 16 }} onClick={() => go({ tab: 'events', eventId: lastMatch.id })}>
                <span className="grow">
                  <span className="title" style={{ display: 'block' }}>
                    {eventHeading(lastMatch)}
                  </span>
                  <span className="sub">{relativeDay(lastMatch.date)}</span>
                </span>
                {lastMatch.result ? <ResultBadge result={lastMatch.result} /> : <span className="tag">Ergebnis fehlt</span>}
              </button>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {nextMatch && (
            <div className="panel">
              <div className="next-up">
                <Icon name="shirt" size={28} className="muted" />
                <div className="grow">
                  <div className="small muted">Trikots fürs nächste Spiel</div>
                  {nextMatch.jerseyDuty?.playerId ? (
                    <div className="big">{players.find((p) => p.id === nextMatch.jerseyDuty!.playerId)?.name || 'Unbekannt'}</div>
                  ) : jerseyNext ? (
                    <div className="big muted">{jerseyNext.name}?</div>
                  ) : (
                    <div className="big muted">Noch offen</div>
                  )}
                </div>
                <button className="btn btn-sm" onClick={() => go({ tab: 'jerseys' })}>
                  {nextMatch.jerseyDuty?.playerId ? 'Ändern' : 'Festlegen'}
                </button>
              </div>
            </div>
          )}

          {birthdays.length > 0 && (
            <div className="panel">
              <div className="panel-pad" style={{ paddingBottom: 4 }}>
                <h3>Geburtstage</h3>
              </div>
              {birthdays.map(({ p, inDays, turns, date }) => (
                <button key={p.id} className="list-row" onClick={() => go({ tab: 'team', playerId: p.id })}>
                  <Icon name="cake" className={inDays === 0 ? '' : 'muted'} />
                  <span className="grow">
                    <span className="title">{p.name}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {inDays === 0 ? 'Heute' : relativeDay(date)} · wird {turns}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {(injured.length > 0 || lowAttendance.length > 0) && (
            <div className="panel">
              <div className="panel-pad" style={{ paddingBottom: 4 }}>
                <h3>Im Blick behalten</h3>
              </div>
              {injured.map((p) => (
                <button key={p.id} className="list-row" onClick={() => go({ tab: 'team', playerId: p.id })}>
                  <Avatar player={p} size={32} />
                  <span className="grow title">{p.name}</span>
                  <span className="tag" style={{ color: 'var(--st-injured)' }}>
                    Verletzt
                  </span>
                </button>
              ))}
              {lowAttendance.map(({ p, s }) => (
                <button key={p.id} className="list-row" onClick={() => go({ tab: 'team', playerId: p.id })}>
                  <Avatar player={p} size={32} />
                  <span className="grow">
                    <span className="title">{p.name}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {s.present} von {s.counted} Terminen in 8 Wochen
                    </span>
                  </span>
                  <span style={{ width: 70 }}>
                    <Meter value={s.rate} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}


function Kickoff({ e, onShare }: { e: TeamEvent; onShare: () => void }) {
  const { players, club } = useStore();
  const { go } = useNav();
  const c = countStatus(e, players);
  const match = isMatch(e.type) && !!e.opponent;
  const open = () => go({ tab: 'events', eventId: e.id });
  const own = club.teamName || club.clubName;
  const oppInitials = (e.opponent || '')
    .replace(/^(SV|FC|SG|TSV|VfB|VfL|SC|FSV|BSG|TuS|SpVgg|1\.)\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const ownSide = (
    <div className="nx-side">
      <span className="nx-crest">
        <ClubLogo src={club.clubLogoUrl} alt="" />
      </span>
      <span className="nx-team">{own}</span>
    </div>
  );
  const oppSide = (
    <div className="nx-side">
      <span className="nx-crest nx-opp">{oppInitials || '?'}</span>
      <span className="nx-team">{e.opponent}</span>
    </div>
  );
  return (
    <div className="card nx">
      <div className="nx-head">
        <span className="chip-soft">
          {TYPE_LABEL[e.type]} · {relativeDay(e.date)}
        </span>
        {e.cancelled && <span className="tag tag-rose">Abgesagt</span>}
      </div>
      {match ? (
        <button className="nx-vs" onClick={open}>
          {e.home === false ? oppSide : ownSide}
          <span className="nx-time">
            {e.time}
            <small>{e.meetTime ? `Treffpunkt ${e.meetTime}` : formatDate(e.date)}</small>
          </span>
          {e.home === false ? ownSide : oppSide}
        </button>
      ) : (
        <button className="nx-plain" onClick={open}>
          <span className="nx-title">{e.title || TYPE_LABEL[e.type]}</span>
          <span className="nx-time">{e.time}</span>
        </button>
      )}
      <div className="nx-meta">
        <span>
          <Icon name="calendar" size={15} />
          {formatDate(e.date)}
        </span>
        {e.location && (
          <span>
            <Icon name="pin" size={15} />
            {e.location}
          </span>
        )}
      </div>
      {players.length > 0 && <AttendanceBar c={c} />}
      <div className="nx-actions">
        <button className="btn btn-primary" onClick={open}>
          Zusagen erfassen
        </button>
        <button className="btn btn-soft" onClick={onShare}>
          <Icon name="share" size={18} />
          Teilen
        </button>
      </div>
    </div>
  );
}

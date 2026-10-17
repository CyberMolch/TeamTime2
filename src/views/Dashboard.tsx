import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { TYPE_LABEL, TeamEvent, isMatch } from '../types';
import { addDays, currentSeasonStart, formatDate, isOver, nextBirthday, relativeDay, seasonLabel, todayISO, weekdayLong } from '../lib/dates';
import { countStatus, euro, fineBalance, matchRecord, pastEvents } from '../lib/stats';
import { eventHeading, eventShareText } from '../lib/texts';
import { shareText } from '../lib/native';
import { ClubLogo } from '../components/ClubLogo';
import { Icon } from '../components/Icon';
import { Empty, useDialog } from '../components/ui';
import { AttendanceBar } from '../components/AttendanceBar';
import { EventRow } from '../components/EventRow';
import { nextCabinPair, nextJerseyCandidate } from './Jerseys';
import { GameUpdateSheet, LastGameCard } from '../components/GameUpdate';

export function Dashboard() {
  const { players, events, club } = useStore();
  const { go } = useNav();
  const { toast } = useDialog();
  const today = todayISO();
  const [updating, setUpdating] = useState(false);

  const upcoming = useMemo(() => events.filter((e) => !isOver(e.date, e.time)), [events]);
  const next = upcoming.find((e) => !e.cancelled);
  const nextMatch = upcoming.find((e) => !e.cancelled && isMatch(e.type));
  const seasonStart = currentSeasonStart(club.seasonStart);
  const past = useMemo(() => pastEvents(events, { from: seasonStart }), [events, seasonStart]);
  const lastMatch = [...pastEvents(events)].reverse().find((e) => isMatch(e.type));
  const record = matchRecord(past);

  const recentTrainings = pastEvents(events, { from: addDays(today, -28), types: ['training'] });
  const avgTraining = recentTrainings.length
    ? Math.round(recentTrainings.reduce((s, e) => s + countStatus(e, players).present, 0) / recentTrainings.length)
    : null;

  const fines = fineBalance(club.fines || []);

  const birthdays = players
    .filter((p) => p.birthDate)
    .map((p) => ({ p, ...nextBirthday(p.birthDate!) }))
    .filter((b) => b.inDays <= 30)
    .sort((a, b) => a.inDays - b.inDays);

  const jerseyNext = nextJerseyCandidate(players, events, club.jerseyRotation);
  const cabinNext = nextCabinPair(players, events, club.cabinRotation);

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

      {birthdays.length > 0 && (
        <section className="panel bday-panel" aria-label="Geburtstage">
          <div className="bday-head">
            <Icon name="cake" size={18} />
            <h3>Geburtstage</h3>
            <span className="small muted">nächste 30 Tage</span>
          </div>
          {birthdays.slice(0, 4).map(({ p, inDays, turns, date }) => (
            <div key={p.id} className={'bday-row' + (inDays === 0 ? ' is-today' : '')}>
              <button className="bday-main" onClick={() => go({ tab: 'team', playerId: p.id })}>
                <span className="bday-date">
                  <b>{Number(date.slice(8, 10))}</b>
                  <small>{formatDate(date).split(' ').pop()?.replace('.', '')}</small>
                </span>
                <span className="bday-text">
                  <span className="bday-name">{p.name}</span>
                  <span className="bday-sub">
                    wird {turns} · {weekdayLong(date)}
                  </span>
                </span>
              </button>
              {inDays === 0 ? (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={async () => {
                    const r = await shareText(`Geburtstag ${p.name}`, `🎉 Alles Gute zum ${turns}. Geburtstag, ${p.name.split(' ')[0]}! 🎂⚽\n– ${club.teamName ? `${club.clubName} ${club.teamName}` : club.clubName}`);
                    if (r === 'copied') toast('Glückwunsch kopiert – jetzt in WhatsApp einfügen.');
                  }}
                >
                  <Icon name="share" size={16} /> Gratulieren
                </button>
              ) : (
                <span className={'bday-in' + (inDays <= 7 ? ' soon' : '')}>{inDays === 1 ? 'morgen' : `in ${inDays} Tagen`}</span>
              )}
            </div>
          ))}
          {birthdays.length > 4 && (
            <button className="bday-more" onClick={() => go({ tab: 'team' })}>
              + {birthdays.length - 4} weitere
            </button>
          )}
        </section>
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

      {lastMatch && (
        <div style={{ marginTop: 16 }}>
          <LastGameCard e={lastMatch} onUpdate={() => setUpdating(true)} />
        </div>
      )}
      {updating && <GameUpdateSheet eventId={lastMatch?.id} onClose={() => setUpdating(false)} />}

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

        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {nextMatch && (
            <div className="panel">
              <div className="next-up">
                <Icon name="shirt" size={28} className="muted" />
                <div className="grow">
                  <div className="small muted">Trikots &amp; Kabine fürs nächste Spiel</div>
                  {nextMatch.jerseyDuty?.playerId ? (
                    <div className="big">{players.find((p) => p.id === nextMatch.jerseyDuty!.playerId)?.name || 'Unbekannt'}</div>
                  ) : jerseyNext ? (
                    <div className="big muted">{jerseyNext.name}?</div>
                  ) : (
                    <div className="big muted">Noch offen</div>
                  )}
                  <div className="small" style={{ marginTop: 2 }}>
                    <Icon name="sparkle" size={14} className="muted" />{' '}
                    {nextMatch.cabinDuty?.playerIds.length ? (
                      <>Kabine: {nextMatch.cabinDuty.playerIds.map((id) => players.find((p) => p.id === id)?.name || 'Unbekannt').join(' & ')}</>
                    ) : cabinNext.length ? (
                      <span className="muted">Kabine: {cabinNext.map((p) => p.name).join(' & ')}?</span>
                    ) : (
                      <span className="muted">Kabine noch offen</span>
                    )}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => go({ tab: 'jerseys' })}>
                  {nextMatch.jerseyDuty?.playerId && nextMatch.cabinDuty?.playerIds.length ? 'Ändern' : 'Festlegen'}
                </button>
              </div>
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

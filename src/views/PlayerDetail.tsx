import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { STATUS_LABEL } from '../types';
import { ageOn, currentSeasonStart, formatDate, formatDateNumeric, seasonLabel } from '../lib/dates';
import { attendanceFor, euro, fineBalance, pastEvents, presentStreak, scorerStats } from '../lib/stats';
import { eventTitle } from '../lib/texts';
import { Icon } from '../components/Icon';
import { Avatar, Empty, Meter, Segmented, StatusDot, useDialog } from '../components/ui';
import { PlayerForm } from '../components/PlayerForm';

export function PlayerDetail({ id }: { id: string }) {
  const { playerById, events, club, deletePlayer, savePlayer } = useStore();
  const { back, go } = useNav();
  const { confirm, toast } = useDialog();
  const [editing, setEditing] = useState(false);
  const [range, setRange] = useState<'season' | 'all'>('season');
  const p = playerById(id);
  const seasonStart = currentSeasonStart(club.seasonStart);

  const evs = useMemo(() => pastEvents(events, range === 'season' ? { from: seasonStart } : {}), [events, range, seasonStart]);
  if (!p)
    return (
      <>
        <button className="back-link" onClick={back}>
          <Icon name="chevronLeft" size={18} /> Zurück
        </button>
        <Empty icon="users" title="Spieler nicht gefunden" />
      </>
    );

  const all = attendanceFor(p.id, evs);
  const trainings = attendanceFor(p.id, evs.filter((e) => e.type === 'training'));
  const matches = attendanceFor(p.id, evs.filter((e) => e.type === 'match' || e.type === 'testmatch'));
  const streak = presentStreak(p.id, [...evs].reverse());
  const sc = scorerStats(p, evs, range === 'all');
  const fines = fineBalance((club.fines || []).filter((f) => f.playerId === p.id));
  const history = [...evs].reverse().filter((e) => e.attendance[p.id] && e.attendance[p.id] !== 'none').slice(0, 12);
  const jerseys = events.filter((e) => e.jerseyDuty?.playerId === p.id).length;
  const phone = p.phone?.replace(/[^\d+]/g, '');
  const waPhone = phone?.startsWith('+') ? phone.slice(1) : phone?.startsWith('00') ? phone.slice(2) : phone?.startsWith('0') ? '49' + phone.slice(1) : phone;

  const remove = async () => {
    if (
      await confirm(`${p.name} wird aus dem Kader gelöscht. Einträge in alten Terminen bleiben, werden aber ohne Namen angezeigt. Tipp: „Nicht mehr aktiv“ behält alles.`, {
        title: 'Spieler löschen?',
        ok: 'Löschen',
        danger: true,
      })
    ) {
      await deletePlayer(p.id);
      back();
      toast(`${p.name} gelöscht.`, { label: 'Rückgängig', run: () => savePlayer(p) });
    }
  };

  return (
    <>
      <button className="back-link" onClick={back}>
        <Icon name="chevronLeft" size={18} /> Zurück
      </button>
      <div className="detail-hero">
        <Avatar player={p} size={72} />
        <div className="grow">
          <h1>{p.name}</h1>
          <div className="meta-list">
            {p.jerseyNumber && <span>#{p.jerseyNumber}</span>}
            {p.position && <span>{p.position}</span>}
            {p.birthDate && (
              <span>
                <Icon name="cake" size={16} />
                {formatDateNumeric(p.birthDate)} ({ageOn(p.birthDate)})
              </span>
            )}
            {p.inactive && <span className="tag">inaktiv</span>}
          </div>
          {!!p.tags?.filter(Boolean).length && (
            <div className="chips" style={{ marginTop: 8 }}>
              {p.tags.filter(Boolean).map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="toolbar">
        <button className="btn btn-sm" onClick={() => setEditing(true)}>
          <Icon name="edit" size={18} /> Bearbeiten
        </button>
        {phone && (
          <a className="btn btn-sm" href={`tel:${phone}`}>
            <Icon name="phone" size={18} /> Anrufen
          </a>
        )}
        {waPhone && (
          <a className="btn btn-sm" href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer">
            <Icon name="share" size={18} /> WhatsApp
          </a>
        )}
        <button className="btn btn-sm btn-ghost" onClick={remove} style={{ color: 'var(--rose)' }}>
          <Icon name="trash" size={18} /> Löschen
        </button>
      </div>

      <div className="toolbar">
        <Segmented
          label="Zeitraum"
          value={range}
          onChange={setRange}
          options={[
            { value: 'season', label: `Saison ${seasonLabel(seasonStart)}` },
            { value: 'all', label: 'Gesamt' },
          ]}
        />
      </div>

      <div className="stats-row">
        <div className="stat">
          <div className="stat-value">{all.rate === null ? '–' : `${all.rate} %`}</div>
          <div className="stat-label">
            dabei ({all.present} von {all.counted})
          </div>
          <div style={{ marginTop: 8 }}>
            <Meter value={all.rate} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-value">{streak}</div>
          <div className="stat-label">Termine in Folge dabei</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {sc.goals} <span className="muted" style={{ fontSize: '1.2rem' }}>/ {sc.assists}</span>
          </div>
          <div className="stat-label">Tore / Vorlagen</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            <span style={{ color: 'var(--st-unsure)' }}>{sc.yellow}</span> <span className="muted">·</span> <span style={{ color: 'var(--rose)' }}>{sc.red}</span>
          </div>
          <div className="stat-label">Gelb · Rot</div>
        </div>
      </div>

      <div className="grid-2 section">
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="panel panel-pad">
            <h3 style={{ marginBottom: 10 }}>Anwesenheit</h3>
            <dl className="kv">
              <dt>Training</dt>
              <dd>{trainings.rate === null ? '–' : `${trainings.rate} % (${trainings.present}/${trainings.counted})`}</dd>
              <dt>Spiele</dt>
              <dd>{matches.rate === null ? '–' : `${matches.rate} % (${matches.present}/${matches.counted})`}</dd>
              <dt>Entschuldigt</dt>
              <dd>{all.excused}</dd>
              <dt>Unentschuldigt</dt>
              <dd style={all.absent ? { color: 'var(--rose)' } : undefined}>{all.absent}</dd>
              <dt>Verletzt</dt>
              <dd>{all.injured}</dd>
              <dt>Einsätze</dt>
              <dd>
                {sc.matches} ({sc.starts} von Beginn)
              </dd>
            </dl>
            <p className="small muted" style={{ marginTop: 10 }}>
              Quote = dabei geteilt durch alle Termine mit Eintrag. Verletzt zählt nicht mit.
            </p>
          </div>
          <section>
            <div className="section-head">
              <h2>Letzte Termine</h2>
            </div>
            {history.length === 0 ? (
              <p className="muted small">Noch keine Einträge.</p>
            ) : (
              <div className="list">
                {history.map((e) => (
                  <button key={e.id} className="list-row" onClick={() => go({ tab: 'events', eventId: e.id })}>
                    <StatusDot status={e.attendance[p.id]} />
                    <span className="grow">
                      <span className="title">{eventTitle(e)}</span>
                      <span className="sub" style={{ display: 'block' }}>
                        {formatDate(e.date, true)}
                      </span>
                    </span>
                    <span className="small" style={{ color: `var(--st-${e.attendance[p.id]})`, fontWeight: 600 }}>
                      {STATUS_LABEL[e.attendance[p.id]]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <button className="panel panel-pad" style={{ textAlign: 'left' }} onClick={() => go({ tab: 'cash' })}>
            <h3 style={{ marginBottom: 8 }}>Kasse</h3>
            <dl className="kv">
              <dt>Offen</dt>
              <dd style={fines.open ? { color: 'var(--rose)' } : undefined}>{euro(fines.open)}</dd>
              <dt>Bezahlt</dt>
              <dd>{euro(fines.paid)}</dd>
              <dt>Trikots gewaschen</dt>
              <dd>{jerseys}×</dd>
            </dl>
          </button>
          {(p.phone || p.email) && (
            <div className="panel panel-pad">
              <h3 style={{ marginBottom: 8 }}>Kontakt</h3>
              <dl className="kv">
                {p.phone && (
                  <>
                    <dt>Telefon</dt>
                    <dd>{p.phone}</dd>
                  </>
                )}
                {p.email && (
                  <>
                    <dt>E-Mail</dt>
                    <dd style={{ wordBreak: 'break-all' }}>{p.email}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
          {p.notes && (
            <div className="panel panel-pad">
              <h3 style={{ marginBottom: 6 }}>Notizen</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</p>
            </div>
          )}
          {(p.medicalNotes || p.injuryHistory) && (
            <div className="panel panel-pad">
              <h3 style={{ marginBottom: 6 }}>Verletzungen & Gesundheit</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{[p.medicalNotes, p.injuryHistory].filter(Boolean).join('\n\n')}</p>
            </div>
          )}
        </div>
      </div>
      {editing && <PlayerForm player={p} onClose={() => setEditing(false)} />}
    </>
  );
}

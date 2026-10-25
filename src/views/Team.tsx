import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { currentSeasonStart } from '../lib/dates';
import { attendanceFor, pastEvents } from '../lib/stats';
import { Icon } from '../components/Icon';
import { Avatar, Empty, Meter, PageHead } from '../components/ui';
import { BulkAddPlayers, PlayerForm, POSITIONS } from '../components/PlayerForm';
import { Player, STAFF_ROLES, isStaff } from '../types';
import { RosterImport } from '../components/RosterImport';

export function TeamView() {
  const { allPlayers, events, club } = useStore();
  const { go } = useNav();
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [importing, setImporting] = useState(false);

  const season = useMemo(() => pastEvents(events, { from: currentSeasonStart(club.seasonStart) }), [events, club.seasonStart]);
  const inactiveCount = allPlayers.filter((p) => p.inactive).length;
  const list = allPlayers.filter(
    (p) =>
      (showInactive || !p.inactive) &&
      (pos === 'all' || (pos === 'none' ? !p.position : p.position === pos)) &&
      (!q || `${p.name} ${p.jerseyNumber || ''} ${(p.tags || []).join(' ')}`.toLowerCase().includes(q.toLowerCase())),
  );
  const positions = [...new Set([...POSITIONS, ...allPlayers.map((p) => p.position).filter(Boolean) as string[]])].filter((x) => allPlayers.some((p) => p.position === x));
  const staffList = list.filter(isStaff).sort((a, b) => STAFF_ROLES.indexOf(a.position!) - STAFF_ROLES.indexOf(b.position!) || a.name.localeCompare(b.name, 'de'));
  const playerList = list.filter((p) => !isStaff(p));
  const activePlayers = allPlayers.filter((p) => !p.inactive && !isStaff(p)).length;
  const activeStaff = allPlayers.filter((p) => !p.inactive && isStaff(p)).length;

  const row = (p: Player) => {
    const staff = isStaff(p);
    const s = attendanceFor(p.id, season);
    return (
      <button key={p.id} className="list-row" onClick={() => go({ tab: 'team', playerId: p.id })} style={p.inactive ? { opacity: 0.6 } : undefined}>
        <Avatar player={p} />
        <span className="grow">
          <span className="title ellipsis" style={{ display: 'block' }}>
            {p.name}
          </span>
          <span className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {staff ? <span className="tag tag-staff">{p.position}</span> : null}
            {[
              !staff && p.jerseyNumber && `#${p.jerseyNumber}`,
              !staff && p.position,
              !staff && p.ext?.apps !== undefined && `${p.ext.apps} ${p.ext.apps === 1 ? 'Spiel' : 'Spiele'}`,
              !staff && p.ext?.goals ? `${p.ext.goals} ${p.ext.goals === 1 ? 'Tor' : 'Tore'}` : null,
              staff && p.phone,
              p.inactive && 'inaktiv',
            ]
              .filter(Boolean)
              .join(' · ') || (staff ? '' : 'Keine Angaben')}
            {p.tags?.filter(Boolean).slice(0, 2).map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </span>
        </span>
        {!staff && (
          <span style={{ width: 90, textAlign: 'right' }} title="Anwesenheit diese Saison">
            <span className="num" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
              {s.rate === null ? '–' : `${s.rate} %`}
            </span>
            <Meter value={s.rate} />
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <PageHead
        title="Kader"
        sub={`${activePlayers} aktive Spieler${activeStaff ? ` · ${activeStaff} im Trainerteam` : ''}${inactiveCount ? ` · ${inactiveCount} inaktiv` : ''}`}
        actions={
          <>
            <button className="btn" onClick={() => setBulk(true)}>
              <Icon name="list" /> Mehrere
            </button>
            <button className="btn" onClick={() => setImporting(true)}>
              <Icon name="upload" /> Kader einspielen
            </button>
            <button className="btn btn-primary only-desktop" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Spieler
            </button>
          </>
        }
      />

      {allPlayers.length === 0 ? (
        <div className="panel">
          <Empty
            icon="users"
            title="Noch keine Spieler"
            action={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => setImporting(true)}>
                  Kader einspielen
                </button>
                <button className="btn" onClick={() => setAdding(true)}>
                  Einzeln hinzufügen
                </button>
              </div>
            }
          >
            Am schnellsten geht es mit einer Liste: ein Name pro Zeile.
          </Empty>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search">
              <Icon name="search" size={18} />
              <input type="search" placeholder="Name, Nummer oder Merkmal" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Spieler suchen" />
            </div>
            {positions.length > 0 && (
              <div className="chips">
                <button className={'chip' + (pos === 'all' ? ' on' : '')} onClick={() => setPos('all')}>
                  Alle
                </button>
                {positions.map((p) => (
                  <button key={p} className={'chip' + (pos === p ? ' on' : '')} onClick={() => setPos(p)}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          {list.length === 0 ? (
            <p className="muted">Niemand passt zu dieser Suche.</p>
          ) : (
            <>
              {staffList.length > 0 && (
                <section style={{ marginBottom: 16 }}>
                  <div className="section-head">
                    <h2>Trainerteam</h2>
                  </div>
                  <div className="list">{staffList.map(row)}</div>
                </section>
              )}
              {playerList.length > 0 && (
                <section>
                  {staffList.length > 0 && (
                    <div className="section-head">
                      <h2>Spieler</h2>
                    </div>
                  )}
                  <div className="list">{playerList.map(row)}</div>
                </section>
              )}
            </>
          )}
          {inactiveCount > 0 && (
            <label className="check small" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Inaktive Spieler zeigen
            </label>
          )}
        </>
      )}

      <button className="fab" onClick={() => setAdding(true)} aria-label="Spieler hinzufügen">
        <Icon name="plus" size={26} />
      </button>
      {adding && <PlayerForm onClose={() => setAdding(false)} />}
      {bulk && <BulkAddPlayers onClose={() => setBulk(false)} />}
      {importing && <RosterImport onClose={() => setImporting(false)} />}
    </>
  );
}

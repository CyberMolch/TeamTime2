import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import type { Player } from '../types';
import { currentSeasonStart, formatDateNumeric, seasonKey, todayISO } from '../lib/dates';
import { leagueScorers, pastEvents } from '../lib/stats';
import { importFussballdeScorers, snapshotIsNewer } from '../lib/scorers';
import { FUSSBALLDE_SNAPSHOT } from '../data/fussballde';
import { buildReport, savePDF } from '../lib/pdf';
import { Icon } from '../components/Icon';
import { Avatar, Empty, PageHead, useDialog } from '../components/ui';
import { CardInput } from './Cards';

// Torschützen der Punktspiele (Liga) der laufenden Saison.
// Quelle: fussball.de-Stand bzw. eigene Eingabe; ohne beides die in der App erfassten Punktspiele.

export function ScorersView() {
  const { players, allPlayers, events, club, savePlayer } = useStore();
  const { go } = useNav();
  const { toast } = useDialog();
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const seasonStart = currentSeasonStart(club.seasonStart);
  const season = seasonKey(seasonStart);
  const evs = useMemo(() => pastEvents(events, { from: seasonStart }), [events, seasonStart]);

  const all = useMemo(
    () =>
      leagueScorers(editing ? players : allPlayers, evs, season).sort(
        (a, b) => b.goals - a.goals || b.assists - a.assists || a.apps - b.apps || a.p.name.localeCompare(b.p.name, 'de'),
      ),
    [players, allPlayers, evs, season, editing],
  );
  const scorers = all.filter((x) => x.goals > 0);
  const total = scorers.reduce((n, x) => n + x.goals, 0);
  const max = scorers[0]?.goals || 1;
  const leagueGames = evs.filter((e) => e.type === 'match' && e.result).length;
  const sources = new Set(scorers.filter((x) => x.official).map((x) => x.p.ext!.source));
  const stand = scorers.filter((x) => x.official).reduce((d, x) => (x.p.ext!.updatedAt > d ? x.p.ext!.updatedAt : d), '');
  const ranks = scorers.map((x, i) => (i > 0 && scorers[i - 1].goals === x.goals ? null : i + 1));
  // Gleiche Toranzahl = gleicher Platz
  let last = 1;
  const place = ranks.map((r) => (r === null ? last : (last = r)));

  const setGoals = (p: Player, v: number) => {
    const ext = p.ext?.season === season ? { ...p.ext, goals: v, updatedAt: todayISO() } : { season, source: 'eigene Eingabe', goals: v, updatedAt: todayISO() };
    savePlayer({ ...p, ext });
  };

  const importSnapshot = async () => {
    setImporting(true);
    const { updated, added } = await importFussballdeScorers(allPlayers, savePlayer);
    setImporting(false);
    toast(`Torschützen übernommen: ${updated} Spieler aktualisiert${added ? `, ${added} neu im Kader` : ''}.`);
  };

  const exportPDF = async () => {
    const bytes = await buildReport({
      title: 'Torschützen Punktspiele',
      subtitle: `Saison ${season}${stand ? ` · Stand ${formatDateNumeric(stand)}` : ''}`,
      clubName: [club.clubName, club.teamName].filter(Boolean).join(' · '),
      logo: club.clubLogoUrl || undefined,
      sections: [
        {
          heading: 'Torschützenliste',
          note: sources.size ? `Tore und Einsätze laut ${[...sources].join(', ')}. Nur Punktspiele.` : 'In der App erfasste Punktspiele.',
          columns: [
            { title: 'Platz', width: 0.8, align: 'right' as const },
            { title: 'Spieler', width: 4 },
            { title: 'Tore', width: 1, align: 'right' as const },
            { title: 'Spiele', width: 1, align: 'right' as const },
            { title: 'Minuten', width: 1.2, align: 'right' as const },
          ],
          rows: scorers.map((x, i) => [ranks[i] ? `${ranks[i]}.` : '', x.p.name, x.goals, x.apps || '', x.minutes ?? '']),
          footer: ['', 'Gesamt', total, '', ''],
        },
      ],
    });
    await savePDF(`torschuetzen-${todayISO()}.pdf`, bytes);
  };

  return (
    <>
      <PageHead
        title="Torschützen"
        sub={`Punktspiele · Saison ${season}`}
        actions={
          <>
            {!editing && scorers.length > 0 && (
              <button className="btn btn-sm" onClick={exportPDF}>
                <Icon name="download" size={18} /> PDF
              </button>
            )}
            <button className={'btn btn-sm' + (editing ? ' btn-primary' : '')} onClick={() => setEditing(!editing)}>
              <Icon name={editing ? 'check' : 'edit'} size={18} /> {editing ? 'Fertig' : 'Bearbeiten'}
            </button>
          </>
        }
      />

      {snapshotIsNewer(allPlayers, season) && (
        <div className="banner banner-info" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="trophy" />
          <span className="grow">
            Stand von fussball.de übernehmen ({formatDateNumeric(FUSSBALLDE_SNAPSHOT.updatedAt)}, {FUSSBALLDE_SNAPSHOT.rows.reduce((n, r) => n + r[3], 0)} Tore).
          </span>
          <button className="btn btn-sm btn-primary" disabled={importing} onClick={importSnapshot}>
            {importing ? 'Einen Moment …' : 'Übernehmen'}
          </button>
        </div>
      )}

      {editing ? (
        <>
          <div className="table-wrap">
            <table className="data cards-table">
              <thead>
                <tr>
                  <th>Spieler</th>
                  <th className="c">Tore</th>
                </tr>
              </thead>
              <tbody>
                {[...all]
                  .sort((a, b) => a.p.name.localeCompare(b.p.name, 'de'))
                  .map((x) => (
                    <tr key={x.p.id}>
                      <td className="name">{x.p.name}</td>
                      <td className="c">
                        <CardInput value={x.goals} min={0} label={`Tore ${x.p.name}`} onCommit={(v) => setGoals(x.p, v)} />
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="name">Gesamt</td>
                  <td className="c num strong">{total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Trag pro Spieler die Anzahl seiner Tore in Punktspielen der Saison {season} ein. Pokal- und Testspiele gehören nicht hierher.
          </p>
        </>
      ) : scorers.length === 0 ? (
        <div className="panel">
          <Empty icon="trophy" title="Noch keine Tore in Punktspielen">
            Tippe auf „Bearbeiten“ und trag die Tore pro Spieler ein, oder erfasse sie im Spiel unter „Spiel & Aufstellung“.
          </Empty>
        </div>
      ) : (
        <>
          <div className="stats-row scorer-kpis">
            <div className="stat">
              <div className="stat-value">{total}</div>
              <div className="stat-label">Tore{leagueGames ? ` in ${leagueGames} Spielen` : ''}</div>
            </div>
            <div className="stat">
              <div className="stat-value">{scorers.length}</div>
              <div className="stat-label">verschiedene Torschützen</div>
            </div>
            <div className="stat">
              <div className="stat-value ellipsis">{scorers[0].p.name.split(' ').slice(-1)[0]}</div>
              <div className="stat-label">bester Torschütze · {scorers[0].goals} Tore</div>
            </div>
          </div>

          <ol className="scorer-list section">
            {scorers.map((x, i) => (
              <li key={x.p.id}>
                <button className={'scorer-row' + (place[i] <= 3 ? ` top top-${place[i]}` : '')} onClick={() => go({ tab: 'team', playerId: x.p.id })}>
                  <span className="scorer-rank">{ranks[i] ? `${ranks[i]}.` : ''}</span>
                  <Avatar player={x.p} size={36} />
                  <span className="scorer-main">
                    <span className="scorer-name">{x.p.name}</span>
                    <span className="scorer-bar">
                      <i style={{ width: `${(x.goals / max) * 100}%` }} />
                    </span>
                    <span className="scorer-meta">
                      {[
                        x.apps ? `${x.apps} ${x.apps === 1 ? 'Spiel' : 'Spiele'}` : '',
                        x.minutes ? `${x.minutes.toLocaleString('de-DE')} Min.` : '',
                        x.minutes && x.goals ? `${Math.round(x.minutes / x.goals)} Min./Tor` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="scorer-goals">
                    {x.goals}
                    <small>{x.goals === 1 ? 'Tor' : 'Tore'}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="small muted" style={{ marginTop: 10 }}>
            Nur Punktspiele – Pokal- und Testspiele zählen nicht mit.
            {sources.size ? ` Zahlen laut ${[...sources].join(', ')}${stand ? `, Stand ${formatDateNumeric(stand)}` : ''}.` : ' Aus den in der App erfassten Punktspielen.'}
          </p>
        </>
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { EventType, isMatch } from '../types';
import { addDays, currentSeasonStart, monthShort, parseDate, seasonLabel, todayISO } from '../lib/dates';
import { attendanceFor, countStatus, matchRecord, pastEvents, scorerStats } from '../lib/stats';
import { eventTitle } from '../lib/texts';
import { saveFile, toCSV } from '../lib/native';
import { Icon } from '../components/Icon';
import { Empty, Meter, PageHead, Segmented, useDialog } from '../components/ui';

type SortKey = 'rate' | 'present' | 'absent' | 'name';

export function StatsView() {
  const { players, events, club } = useStore();
  const { go } = useNav();
  const { toast } = useDialog();
  const [range, setRange] = useState<'season' | '8w' | 'all'>('season');
  const [kind, setKind] = useState<'all' | 'training' | 'games'>('all');
  const [sort, setSort] = useState<SortKey>('rate');

  const seasonStart = currentSeasonStart(club.seasonStart);
  const from = range === 'season' ? seasonStart : range === '8w' ? addDays(todayISO(), -56) : undefined;
  const types: EventType[] | undefined = kind === 'training' ? ['training'] : kind === 'games' ? ['match', 'testmatch'] : undefined;
  const evs = useMemo(() => pastEvents(events, { from, types }), [events, from, kind]);
  const allInRange = useMemo(() => pastEvents(events, { from }), [events, from]);

  const rows = useMemo(() => {
    const r = players.map((p) => ({ p, s: attendanceFor(p.id, evs) }));
    const val = (x: (typeof r)[number]) =>
      sort === 'rate' ? (x.s.rate ?? -1) : sort === 'present' ? x.s.present : sort === 'absent' ? x.s.absent : 0;
    return r.sort((a, b) => (sort === 'name' ? a.p.name.localeCompare(b.p.name, 'de') : val(b) - val(a) || b.s.present - a.s.present));
  }, [players, evs, sort]);

  const scorers = useMemo(
    () =>
      players
        .map((p) => ({ p, s: scorerStats(p, allInRange, range === 'all') }))
        .filter((x) => x.s.goals || x.s.assists || x.s.yellow || x.s.red)
        .sort((a, b) => b.s.goals - a.s.goals || b.s.assists - a.s.assists),
    [players, allInRange, range],
  );

  const record = matchRecord(allInRange);
  const avg = evs.length ? Math.round(evs.reduce((s, e) => s + countStatus(e, players).present, 0) / evs.length) : null;
  const chart = evs.slice(window.innerWidth < 600 ? -12 : -24);
  const maxPresent = Math.max(1, ...chart.map((e) => countStatus(e, players).present), players.length ? Math.min(players.length, 22) : 1);

  const exportCSV = async () => {
    const head = ['Spieler', 'Quote %', 'Dabei', 'Entschuldigt', 'Unentschuldigt', 'Unsicher', 'Verletzt', 'Tore', 'Vorlagen', 'Gelb', 'Rot'];
    const data = rows.map(({ p, s }) => {
      const sc = scorerStats(p, allInRange, range === 'all');
      return [p.name, s.rate ?? '', s.present, s.excused, s.absent, s.unsure, s.injured, sc.goals, sc.assists, sc.yellow, sc.red];
    });
    await saveFile(`teamtime-auswertung-${todayISO()}.csv`, toCSV([head, ...data]), 'text/csv');
    toast('Tabelle exportiert.');
  };

  const sortBtn = (k: SortKey, label: string, cls = 'r') => (
    <th className={cls}>
      <button onClick={() => setSort(k)} style={{ fontWeight: sort === k ? 700 : 600, color: sort === k ? 'var(--ink)' : undefined }}>
        {label}
        {sort === k ? ' ↓' : ''}
      </button>
    </th>
  );

  return (
    <>
      <PageHead
        title="Auswertung"
        sub={`${evs.length} Termine ausgewertet`}
        actions={
          <button className="btn" onClick={exportCSV} disabled={!players.length}>
            <Icon name="download" /> Als Tabelle
          </button>
        }
      />
      <div className="toolbar">
        <Segmented
          label="Zeitraum"
          value={range}
          onChange={setRange}
          options={[
            { value: 'season', label: `Saison ${seasonLabel(seasonStart)}` },
            { value: '8w', label: '8 Wochen' },
            { value: 'all', label: 'Gesamt' },
          ]}
        />
        <Segmented
          label="Art"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Alle' },
            { value: 'training', label: 'Training' },
            { value: 'games', label: 'Spiele' },
          ]}
        />
      </div>

      {evs.length === 0 ? (
        <div className="panel">
          <Empty icon="chart" title="Noch nichts auszuwerten">
            Sobald vergangene Termine Zusagen haben, siehst du hier Quoten, Torschützen und die Bilanz.
          </Empty>
        </div>
      ) : (
        <>
          <div className="stats-row">
            <div className="stat">
              <div className="stat-value">{avg ?? '–'}</div>
              <div className="stat-label">Ø Spieler pro Termin</div>
            </div>
            <div className="stat">
              <div className="stat-value">
                {record.win}–{record.draw}–{record.loss}
              </div>
              <div className="stat-label">S–U–N ({record.played} Spiele)</div>
            </div>
            <div className="stat">
              <div className="stat-value">
                {record.goalsFor}:{record.goalsAgainst}
              </div>
              <div className="stat-label">Tore</div>
            </div>
            <div className="stat">
              <div className="stat-value">{record.points}</div>
              <div className="stat-label" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                Punkte (Punktspiele)
                {record.form.length > 0 && (
                  <span className="form-pills" aria-label="Form der letzten Spiele">
                    {record.form.map((o, i) => (
                      <span key={i} className={`res-${o}`}>
                        {o === 'win' ? 'S' : o === 'draw' ? 'U' : 'N'}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>

          <section className="panel panel-pad section">
            <h3>Beteiligung pro Termin</h3>
            <div className="bars" role="img" aria-label="Anzahl anwesender Spieler je Termin">
              {chart.map((e) => {
                const n = countStatus(e, players).present;
                return (
                  <button
                    key={e.id}
                    className="bar-col"
                    title={`${eventTitle(e)}, ${parseDate(e.date).getDate()}. ${monthShort(e.date)}: ${n} dabei`}
                    onClick={() => go({ tab: 'events', eventId: e.id })}
                  >
                    <span className="bar-val">{n}</span>
                    <span className={'bar ' + (isMatch(e.type) ? 'match' : 'training')} style={{ height: `${(n / maxPresent) * 100}%` }} />
                    <span className="bar-label">{parseDate(e.date).getDate()}.{parseDate(e.date).getMonth() + 1}.</span>
                  </button>
                );
              })}
            </div>
            <div className="legend">
              <span>
                <i style={{ background: 'var(--green)' }} />
                Training & Treffen
              </span>
              <span>
                <i style={{ background: 'var(--ink)' }} />
                Spiel
              </span>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Anwesenheit</h2>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th className="rank">#</th>
                    {sortBtn('name', 'Spieler', '')}
                    {sortBtn('rate', 'Quote')}
                    <th style={{ width: 120 }} aria-hidden="true" />
                    {sortBtn('present', 'Dabei')}
                    <th className="r">Entsch.</th>
                    {sortBtn('absent', 'Unentsch.')}
                    <th className="r">Verletzt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, s }, i) => (
                    <tr key={p.id} onClick={() => go({ tab: 'team', playerId: p.id })} style={{ cursor: 'pointer' }}>
                      <td className="rank">{i + 1}</td>
                      <td className="name">{p.name}</td>
                      <td className="r num" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                        {s.rate === null ? '–' : `${s.rate} %`}
                      </td>
                      <td>
                        <Meter value={s.rate} />
                      </td>
                      <td className="r">{s.present}</td>
                      <td className="r">{s.excused}</td>
                      <td className="r" style={s.absent ? { color: 'var(--rose)', fontWeight: 600 } : undefined}>
                        {s.absent}
                      </td>
                      <td className="r">{s.injured}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Torschützen & Karten</h2>
              {range !== 'all' && <span className="small muted">nur in der App erfasste Spiele</span>}
            </div>
            {scorers.length === 0 ? (
              <p className="muted small">Noch keine Tore eingetragen. Das geht im Spiel unter „Spiel & Aufstellung“.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="rank">#</th>
                      <th>Spieler</th>
                      <th className="r">Tore</th>
                      <th className="r">Vorlagen</th>
                      <th className="r">Scorer</th>
                      <th className="r">Gelb</th>
                      <th className="r">Rot</th>
                      <th className="r">Einsätze</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorers.map(({ p, s }, i) => (
                      <tr key={p.id} onClick={() => go({ tab: 'team', playerId: p.id })} style={{ cursor: 'pointer' }}>
                        <td className="rank">{i + 1}</td>
                        <td className="name">{p.name}</td>
                        <td className="r num" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                          {s.goals}
                        </td>
                        <td className="r">{s.assists}</td>
                        <td className="r">{s.goals + s.assists}</td>
                        <td className="r">{s.yellow || ''}</td>
                        <td className="r">{s.red || ''}</td>
                        <td className="r">{s.matches}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

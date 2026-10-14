import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { EventType, Player, STATUS_LABEL, TeamEvent, isMatch } from '../types';
import { addDays, currentSeasonStart, formatDate, formatDateNumeric, parseDate, seasonLabel, todayISO, weekdayShort } from '../lib/dates';
import { attendanceFor, countStatus, matchRecord, pastEvents, scorerStats } from '../lib/stats';
import { eventTitle } from '../lib/texts';
import { saveFile, toCSV } from '../lib/native';
import { buildReport, savePDF } from '../lib/pdf';
import { Icon } from '../components/Icon';
import { Empty, Meter, PageHead, Segmented, useDialog } from '../components/ui';

type SortKey = 'rate' | 'present' | 'absent' | 'name';
type View = 'overview' | 'table' | 'grid';

export function StatsView() {
  const { players, events, club } = useStore();
  const { go } = useNav();
  const { toast } = useDialog();
  const [range, setRange] = useState<'season' | '8w' | 'all'>('season');
  const [kind, setKind] = useState<'all' | 'training' | 'games'>('all');
  const [view, setView] = useState<View>('overview');
  const [sort, setSort] = useState<SortKey>('rate');

  const seasonStart = currentSeasonStart(club.seasonStart);
  const from = range === 'season' ? seasonStart : range === '8w' ? addDays(todayISO(), -56) : undefined;
  const types: EventType[] | undefined = kind === 'training' ? ['training'] : kind === 'games' ? ['match', 'testmatch'] : undefined;
  const evs = useMemo(() => pastEvents(events, { from, types }), [events, from, kind]);
  const allInRange = useMemo(() => pastEvents(events, { from }), [events, from]);
  const rangeLabel = range === 'season' ? `Saison ${seasonLabel(seasonStart)}` : range === '8w' ? 'Letzte 8 Wochen' : 'Gesamter Zeitraum';
  const kindLabel = kind === 'training' ? 'nur Training' : kind === 'games' ? 'nur Spiele' : 'alle Termine';

  const rows = useMemo(() => {
    const r = players.map((p) => ({ p, s: attendanceFor(p.id, evs) }));
    const val = (x: (typeof r)[number]) => (sort === 'rate' ? (x.s.rate ?? -1) : sort === 'present' ? x.s.present : sort === 'absent' ? x.s.absent : 0);
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

  const official = players
    .filter((p) => p.ext && (p.ext.apps !== undefined || p.ext.goals !== undefined))
    .sort((a, b) => (b.ext!.goals ?? 0) - (a.ext!.goals ?? 0) || (b.ext!.minutes ?? 0) - (a.ext!.minutes ?? 0));
  const record = matchRecord(allInRange);
  const avg = evs.length ? Math.round((evs.reduce((s, e) => s + countStatus(e, players).present, 0) / evs.length) * 10) / 10 : null;
  const teamRate = (() => {
    const t = rows.reduce((a, r) => ({ p: a.p + r.s.present, c: a.c + r.s.counted }), { p: 0, c: 0 });
    return t.c ? Math.round((t.p / t.c) * 100) : null;
  })();

  const exportCSV = async () => {
    const head = ['Spieler', 'Quote %', 'Dabei', 'Entschuldigt', 'Unentschuldigt', 'Unsicher', 'Verletzt', 'Tore', 'Vorlagen', 'Gelb', 'Rot'];
    const data = rows.map(({ p, s }) => {
      const sc = scorerStats(p, allInRange, range === 'all');
      return [p.name, s.rate ?? '', s.present, s.excused, s.absent, s.unsure, s.injured, sc.goals, sc.assists, sc.yellow, sc.red];
    });
    await saveFile(`teamtime-auswertung-${todayISO()}.csv`, toCSV([head, ...data]), 'text/csv');
    toast('Tabelle exportiert.');
  };

  const exportPDF = async () => {
    const byName = [...rows].sort((a, b) => (b.s.rate ?? -1) - (a.s.rate ?? -1) || a.p.name.localeCompare(b.p.name, 'de'));
    const bytes = await buildReport({
      title: 'Anwesenheit',
      subtitle: `${rangeLabel} · ${kindLabel} · ${evs.length} Termine${evs.length ? ` vom ${formatDateNumeric(evs[0].date)} bis ${formatDateNumeric(evs[evs.length - 1].date)}` : ''}`,
      clubName: [club.clubName, club.teamName].filter(Boolean).join(' · '),
      logo: club.clubLogoUrl || undefined,
      sections: [
        {
          heading: 'Überblick',
          pairs: [
            ['Ausgewertete Termine', String(evs.length)],
            ['Spieler pro Termin (Durchschnitt)', avg === null ? '–' : String(avg).replace('.', ',')],
            ['Quote der Mannschaft', teamRate === null ? '–' : `${teamRate} %`],
            ...(record.played ? ([['Bilanz (S–U–N)', `${record.win}–${record.draw}–${record.loss}, Tore ${record.goalsFor}:${record.goalsAgainst}`]] as [string, string][]) : []),
          ],
        },
        {
          heading: 'Anwesenheit nach Spieler',
          note: 'Quote = dabei ÷ alle Termine mit Eintrag. Verletzt zählt nicht mit.',
          columns: [
            { title: '#', width: 0.6, align: 'right' },
            { title: 'Spieler', width: 4 },
            { title: 'Quote', width: 1.3, align: 'right' },
            { title: 'Dabei', width: 1.2, align: 'right' },
            { title: 'Entsch.', width: 1.2, align: 'right' },
            { title: 'Unentsch.', width: 1.4, align: 'right' },
            { title: 'Unsicher', width: 1.3, align: 'right' },
            { title: 'Verletzt', width: 1.3, align: 'right' },
          ],
          rows: byName.map(({ p, s }, i) => [i + 1, p.name, s.rate === null ? '–' : `${s.rate} %`, s.present, s.excused, s.absent, s.unsure, s.injured]),
        },
        ...(scorers.length
          ? [
              {
                heading: 'Torschützen & Karten',
                columns: [
                  { title: 'Spieler', width: 4 },
                  { title: 'Tore', width: 1, align: 'right' as const },
                  { title: 'Vorlagen', width: 1.2, align: 'right' as const },
                  { title: 'Gelb', width: 1, align: 'right' as const },
                  { title: 'Rot', width: 1, align: 'right' as const },
                  { title: 'Einsätze', width: 1.2, align: 'right' as const },
                ],
                rows: scorers.map(({ p, s }) => [p.name, s.goals, s.assists, s.yellow || '', s.red || '', s.matches]),
              },
            ]
          : []),
      ],
    });
    await savePDF(`anwesenheit-${todayISO()}.pdf`, bytes);
    toast('Bericht erstellt.');
  };

  const officialTable = official.length > 0 && (
                <section className="section">
                  <div className="section-head">
                    <h2>Einsätze & Tore</h2>
                    <span className="small muted">
                      Saison {official[0].ext!.season} laut {official[0].ext!.source}
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th className="rank">#</th>
                          <th>Spieler</th>
                          <th className="r">Einsätze</th>
                          <th className="r">Minuten</th>
                          <th className="r">Tore</th>
                        </tr>
                      </thead>
                      <tbody>
                        {official.map((p, i) => (
                          <tr key={p.id} onClick={() => go({ tab: 'team', playerId: p.id })} style={{ cursor: 'pointer' }}>
                            <td className="rank">{i + 1}</td>
                            <td className="name">{p.name}</td>
                            <td className="r">{p.ext!.apps ?? '–'}</td>
                            <td className="r">{p.ext!.minutes ?? '–'}</td>
                            <td className="r num strong">{p.ext!.goals ?? '–'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );

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
          <>
            <button className="btn" onClick={exportPDF} disabled={!players.length || !evs.length}>
              <Icon name="file" /> Bericht
            </button>
            <button className="btn btn-ghost" onClick={exportCSV} disabled={!players.length}>
              <Icon name="download" /> Tabelle
            </button>
          </>
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
        <>
        <div className="panel">
          <Empty icon="chart" title="Noch nichts auszuwerten">
            Sobald vergangene Termine Zusagen haben, siehst du hier Quoten, Torschützen und die Bilanz.
          </Empty>
        </div>
        {officialTable}
        </>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {(
              [
                ['overview', 'Überblick'],
                ['table', 'Anwesenheit'],
                ['grid', 'Raster'],
              ] as [View, string][]
            ).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
                {l}
              </button>
            ))}
          </div>

          {view === 'overview' && (
            <>
              <div className="kpis">
                <div className="kpi">
                  <span className="kpi-value">{teamRate === null ? '–' : `${teamRate} %`}</span>
                  <span className="kpi-label">Quote der Mannschaft</span>
                </div>
                <div className="kpi">
                  <span className="kpi-value">{avg === null ? '–' : String(avg).replace('.', ',')}</span>
                  <span className="kpi-label">Spieler pro Termin</span>
                </div>
                <div className="kpi">
                  <span className="kpi-value">
                    {record.win}–{record.draw}–{record.loss}
                  </span>
                  <span className="kpi-label">
                    Siege, Remis, Niederlagen
                    {record.form.length > 0 && (
                      <span className="form-pills" aria-label="Form der letzten Spiele" style={{ marginLeft: 8 }}>
                        {record.form.map((o, i) => (
                          <span key={i} className={`res-${o}`}>
                            {o === 'win' ? 'S' : o === 'draw' ? 'U' : 'N'}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </div>
                <div className="kpi">
                  <span className="kpi-value">
                    {record.goalsFor}:{record.goalsAgainst}
                  </span>
                  <span className="kpi-label">Tore · {record.points} Punkte</span>
                </div>
              </div>

              <section className="panel panel-pad section">
                <div className="section-head" style={{ marginBottom: 4 }}>
                  <h3>Beteiligung pro Termin</h3>
                  <div className="legend" style={{ marginTop: 0 }}>
                    <span>
                      <i style={{ background: 'var(--green)' }} />
                      Training
                    </span>
                    <span>
                      <i style={{ background: 'var(--ink)' }} />
                      Spiel
                    </span>
                  </div>
                </div>
                <ParticipationChart events={evs} players={players} onOpen={(id) => go({ tab: 'events', eventId: id })} />
              </section>

              {officialTable}

              <section className="section">
                <div className="section-head">
                  <h2>{official.length ? 'In der App erfasst' : 'Torschützen & Karten'}</h2>
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
                            <td className="r num strong">{s.goals}</td>
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

          {view === 'table' && (
            <>
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
                        <td className="r num strong">{s.rate === null ? '–' : `${s.rate} %`}</td>
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
              <p className="small muted" style={{ marginTop: 8 }}>
                Quote = dabei geteilt durch alle Termine mit Eintrag. Verletzt zählt nicht mit.
              </p>
            </>
          )}

          {view === 'grid' && <AttendanceGrid events={evs} rows={rows.map((r) => r.p).sort((a, b) => a.name.localeCompare(b.name, 'de'))} onOpen={(id) => go({ tab: 'events', eventId: id })} />}
        </>
      )}
    </>
  );
}

/** Säulen je Termin mit Gitterlinien und Durchschnitt – als SVG, skaliert mit der Breite */
function ParticipationChart({ events, players, onOpen }: { events: TeamEvent[]; players: Player[]; onOpen: (id: string) => void }) {
  const list = events.slice(window.innerWidth < 600 ? -12 : -30);
  const vals = list.map((e) => countStatus(e, players).present);
  const max = Math.max(4, ...vals);
  const top = Math.ceil(max / 4) * 4;
  const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const narrow = window.innerWidth < 600;
  const W = narrow ? 360 : 640;
  const H = narrow ? 190 : 200;
  const L = 26;
  const B = 22;
  const T = 10;
  const step = (W - L) / Math.max(1, list.length);
  const bw = Math.min(22, step * 0.62);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const labelEvery = Math.ceil(list.length / (window.innerWidth < 600 ? 5 : 10));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Anwesende Spieler je Termin, Durchschnitt ${avg.toFixed(1)}`}>
      {[0, top / 4, top / 2, (3 * top) / 4, top].map((t) => (
        <g key={t}>
          <line x1={L} x2={W} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={L - 6} y={y(t) + 4} className="chart-tick" textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {list.map((e, i) => {
        const v = vals[i];
        const x = L + i * step + (step - bw) / 2;
        return (
          <g key={e.id} className="chart-bar" onClick={() => onOpen(e.id)}>
            <title>{`${eventTitle(e)} · ${formatDate(e.date)}: ${v} dabei`}</title>
            <rect x={L + i * step} y={T} width={step} height={H - T - B} fill="transparent" />
            <rect x={x} y={y(v)} width={bw} height={Math.max(1.5, H - B - y(v))} rx={3} className={isMatch(e.type) ? 'bar-match' : 'bar-training'} />
            {i % labelEvery === 0 && (
              <text x={x + bw / 2} y={H - 6} className="chart-tick" textAnchor="middle">
                {parseDate(e.date).getDate()}.{parseDate(e.date).getMonth() + 1}.
              </text>
            )}
          </g>
        );
      })}
      <line x1={L} x2={W} y1={y(avg)} y2={y(avg)} className="chart-avg" />
      <text x={W - 4} y={y(avg) - 5} className="chart-avg-label" textAnchor="end">
        Ø {avg.toFixed(1).replace('.', ',')}
      </text>
    </svg>
  );
}

/** Raster: Spieler × Termine, jede Zelle in der Farbe der Rückmeldung */
function AttendanceGrid({ events, rows, onOpen }: { events: TeamEvent[]; rows: Player[]; onOpen: (id: string) => void }) {
  const cols = events.slice(-40);
  const legend = (['present', 'unsure', 'excused', 'absent', 'injured', 'none'] as const).map((st) => (
    <span key={st}>
      <i className={`st-${st}`} style={{ background: 'var(--st)' }} />
      {st === 'none' ? 'Kein Eintrag' : STATUS_LABEL[st]}
    </span>
  ));
  return (
    <>
      <div className="legend" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        {legend}
      </div>
      <div className="table-wrap att-grid">
        <table>
          <thead>
            <tr>
              <th className="sticky-col">Spieler</th>
              {cols.map((e) => (
                <th key={e.id}>
                  <button onClick={() => onOpen(e.id)} title={`${eventTitle(e)}, ${formatDate(e.date)}`} className={isMatch(e.type) ? 'g-match' : ''}>
                    <span>{weekdayShort(e.date)}</span>
                    <b>{parseDate(e.date).getDate()}.</b>
                    <span>{parseDate(e.date).getMonth() + 1}.</span>
                  </button>
                </th>
              ))}
              <th className="r">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const s = attendanceFor(p.id, cols);
              return (
                <tr key={p.id}>
                  <td className="sticky-col">{p.name}</td>
                  {cols.map((e) => {
                    const st = e.attendance[p.id] || 'none';
                    return (
                      <td key={e.id}>
                        <span className={`g-cell st-${st}`} title={`${p.name}: ${st === 'none' ? 'kein Eintrag' : STATUS_LABEL[st]}`} />
                      </td>
                    );
                  })}
                  <td className="r num strong">{s.rate ?? '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {events.length > cols.length && <p className="small muted" style={{ marginTop: 8 }}>Gezeigt werden die letzten {cols.length} Termine.</p>}
    </>
  );
}

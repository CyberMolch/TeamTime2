import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { EventType, Player, STATUS_LABEL, TYPE_LABEL, TeamEvent, isMatch } from '../types';
import { addDays, currentSeasonStart, formatDate, formatDateNumeric, parseDate, seasonLabel, todayISO, weekdayShort } from '../lib/dates';
import { addCards, attendanceFor, cardTotals, countStatus, leagueScorers, matchRecord, pastEvents } from '../lib/stats';
import { nextSeasonStart } from '../lib/dates';
import type { CardCount } from '../types';
import { FUSSBALLDE_SNAPSHOT } from '../data/fussballde';
import { eventTitle } from '../lib/texts';
import { saveFile, toCSV } from '../lib/native';
import { buildReport, savePDF } from '../lib/pdf';
import { importFussballdeScorers } from '../lib/scorers';
import { Icon } from '../components/Icon';
import { ResultBadge } from '../components/EventRow';
import { Empty, Meter, PageHead, Segmented, useDialog } from '../components/ui';

type SortKey = 'rate' | 'present' | 'absent' | 'name';
type View = 'overview' | 'table' | 'grid';

export function StatsView() {
  const { players, allPlayers, events, club, savePlayer } = useStore();
  const { go } = useNav();
  const { toast } = useDialog();
  const [range, setRange] = useState<'season' | '8w' | 'all'>('season');
  const [kind, setKind] = useState<'all' | 'training' | 'games'>('all');
  const [view, setView] = useState<View>('overview');
  const [sort, setSort] = useState<SortKey>('rate');

  const seasonStart = currentSeasonStart(club.seasonStart);
  const from = range === 'season' ? seasonStart : range === '8w' ? addDays(todayISO(), -56) : undefined;
  const types: EventType[] | undefined = kind === 'training' ? ['training'] : kind === 'games' ? ['match', 'cup', 'testmatch'] : undefined;
  const evs = useMemo(() => pastEvents(events, { from, types }), [events, from, kind]);
  const allInRange = useMemo(() => pastEvents(events, { from }), [events, from]);
  const rangeLabel = range === 'season' ? `Saison ${seasonLabel(seasonStart)}` : range === '8w' ? 'Letzte 8 Wochen' : 'Gesamter Zeitraum';
  const kindLabel = kind === 'training' ? 'nur Training' : kind === 'games' ? 'nur Spiele' : 'alle Termine';

  const rows = useMemo(() => {
    const r = players.map((p) => ({ p, s: attendanceFor(p.id, evs) }));
    const val = (x: (typeof r)[number]) => (sort === 'rate' ? (x.s.rate ?? -1) : sort === 'present' ? x.s.present : sort === 'absent' ? x.s.absent : 0);
    return r.sort((a, b) => (sort === 'name' ? a.p.name.localeCompare(b.p.name, 'de') : val(b) - val(a) || b.s.present - a.s.present));
  }, [players, evs, sort]);

  // Torschützen nur aus Punktspielen; in der laufenden Saison mit den Zahlen von fussball.de
  const seasonLong = (() => {
    const l = seasonLabel(seasonStart);
    return l.includes('/') ? `20${l.slice(0, 2)}/${l.slice(3)}` : l;
  })();
  const officialSeason = range === 'season' ? seasonLong : undefined;
  const scorers = useMemo(
    () =>
      leagueScorers(players, allInRange, officialSeason)
        .filter((x) => x.goals || x.assists)
        .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.apps - b.apps || a.p.name.localeCompare(b.p.name, 'de')),
    [players, allInRange, officialSeason],
  );
  const hasOfficial = scorers.some((x) => x.official);
  const [cardScope, setCardScope] = useState<'league' | 'cup' | 'all'>('league');
  // Karten immer für die laufende Saison: eingetragene Zahlen + in Spielen erfasste Karten
  const seasonCards = (p: Player, scope: 'league' | 'cup' | 'all'): CardCount => {
    const to = nextSeasonStart(seasonStart);
    const league = cardTotals(p, events, seasonLong, 'match', seasonStart, to);
    if (scope === 'league') return league;
    const cup = cardTotals(p, events, seasonLong, 'cup', seasonStart, to);
    return scope === 'cup' ? cup : addCards(league, cup);
  };
  const cards = useMemo(() => {
    return players
      .map((p) => ({ p, s: seasonCards(p, cardScope) }))
      .filter((x) => x.s.yellow || x.s.yellowRed || x.s.red)
      .sort((a, b) => b.s.red - a.s.red || b.s.yellowRed - a.s.yellowRed || b.s.yellow - a.s.yellow || a.p.name.localeCompare(b.p.name, 'de'));
  }, [players, allInRange, cardScope]);
  const snapshotFits = FUSSBALLDE_SNAPSHOT.season === seasonLong;
  const snapshotNewer = snapshotFits && !players.some((p) => p.ext?.season === seasonLong && p.ext.updatedAt >= FUSSBALLDE_SNAPSHOT.updatedAt);
  const [importing, setImporting] = useState(false);
  const importSnapshot = async () => {
    setImporting(true);
    const { updated, added } = await importFussballdeScorers(allPlayers, savePlayer);
    setImporting(false);
    toast(`Torschützen übernommen: ${updated} Spieler aktualisiert${added ? `, ${added} neu im Kader` : ''}.`);
  };

  const record = matchRecord(allInRange);
  const comps = (
    [
      ['match', 'Punktspiele'],
      ['cup', 'Pokal'],
      ['testmatch', 'Testspiele'],
    ] as [EventType, string][]
  )
    .map(([t, label]) => ({ t, label, r: matchRecord(allInRange, [t]) }))
    .filter((c) => c.r.played > 0);
  const games = allInRange.filter((e) => isMatch(e.type) && e.result).reverse();
  const avg = evs.length ? Math.round((evs.reduce((s, e) => s + countStatus(e, players).present, 0) / evs.length) * 10) / 10 : null;
  const teamRate = (() => {
    const t = rows.reduce((a, r) => ({ p: a.p + r.s.present, c: a.c + r.s.counted }), { p: 0, c: 0 });
    return t.c ? Math.round((t.p / t.c) * 100) : null;
  })();

  const exportCSV = async () => {
    const head = ['Spieler', 'Quote %', 'Dabei', 'Entschuldigt', 'Unentschuldigt', 'Unsicher', 'Verletzt', 'Tore (Liga)', 'Spiele (Liga)', 'Vorlagen', 'Gelb (Liga)', 'Gelb-Rot (Liga)', 'Rot (Liga)'];
    const league = new Map(leagueScorers(players, allInRange, officialSeason).map((x) => [x.p.id, x]));
    const data = rows.map(({ p, s }) => {
      const sc = league.get(p.id)!;
      return [p.name, s.rate ?? '', s.present, s.excused, s.absent, s.unsure, s.injured, sc.goals, sc.apps, sc.assists, sc.yellow, sc.yellowRed, sc.red];
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
            ...(record.played ? ([['Punktspiele (S–U–N)', `${record.win}–${record.draw}–${record.loss}, Tore ${record.goalsFor}:${record.goalsAgainst}, ${record.points} Punkte`]] as [string, string][]) : []),
            ...comps
              .filter((c) => c.t !== 'match')
              .map((c) => [`${c.label} (S–U–N)`, `${c.r.win}–${c.r.draw}–${c.r.loss}, Tore ${c.r.goalsFor}:${c.r.goalsAgainst}`] as [string, string]),
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
                heading: 'Torschützen Punktspiele',
                note: hasOfficial ? `Tore und Einsätze laut ${FUSSBALLDE_SNAPSHOT.source}` : 'In der App erfasste Punktspiele',
                columns: [
                  { title: 'Spieler', width: 4 },
                  { title: 'Tore', width: 1, align: 'right' as const },
                  { title: 'Spiele', width: 1, align: 'right' as const },
                  { title: 'Minuten', width: 1.2, align: 'right' as const },
                  { title: 'Vorlagen', width: 1.2, align: 'right' as const },
                ],
                rows: scorers.map((x) => [x.p.name, x.goals, x.apps, x.minutes ?? '', x.assists || '']),
                footer: ['Gesamt', scorers.reduce((n, x) => n + x.goals, 0), '', '', ''],
              },
            ]
          : []),
        ...(() => {
          const lc = players
            .map((p) => ({ p, s: seasonCards(p, 'league') }))
            .filter((x) => x.s.yellow || x.s.yellowRed || x.s.red);
          return lc.length
            ? [
                {
                  heading: 'Karten Punktspiele',
                  columns: [
                    { title: 'Spieler', width: 4 },
                    { title: 'Gelb', width: 1, align: 'right' as const },
                    { title: 'Gelb-Rot', width: 1.2, align: 'right' as const },
                    { title: 'Rot', width: 1, align: 'right' as const },
                  ],
                  rows: lc.map((x) => [x.p.name, x.s.yellow || '', x.s.yellowRed || '', x.s.red || '']),
                },
              ]
            : [];
        })(),
      ],
    });
    await savePDF(`anwesenheit-${todayISO()}.pdf`, bytes);
    toast('Bericht erstellt.');
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
                    Punktspiele S–U–N
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
                  <span className="kpi-label">Tore Liga · {record.points} Punkte</span>
                </div>
              </div>

              {comps.length > 0 && (
                <section className="section">
                  <div className="section-head">
                    <h2>Spiele nach Wettbewerb</h2>
                  </div>
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Wettbewerb</th>
                          <th className="r">Sp.</th>
                          <th className="r">S–U–N</th>
                          <th className="r">Tore</th>
                          <th className="r hide-sm">Diff.</th>
                          <th className="r">Pkt.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comps.map(({ t, label, r }) => (
                          <tr key={t}>
                            <td className="name">{label}</td>
                            <td className="r">{r.played}</td>
                            <td className="r num strong">
                              {r.win}–{r.draw}–{r.loss}
                            </td>
                            <td className="r">
                              {r.goalsFor}:{r.goalsAgainst}
                            </td>
                            <td className="r hide-sm">{r.goalsFor - r.goalsAgainst > 0 ? '+' : ''}{r.goalsFor - r.goalsAgainst}</td>
                            <td className="r">{t === 'match' ? r.points : '–'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="list" style={{ marginTop: 10 }}>
                    {games.slice(0, 12).map((e) => (
                      <button key={e.id} className="list-row" onClick={() => go({ tab: 'events', eventId: e.id })}>
                        <span className="grow">
                          <span className="title ellipsis" style={{ display: 'block' }}>
                            {eventTitle(e)}
                          </span>
                          <span className="sub">
                            {TYPE_LABEL[e.type]} · {formatDate(e.date, true)}
                          </span>
                        </span>
                        <ResultBadge result={e.result} />
                      </button>
                    ))}
                  </div>
                  <p className="small muted" style={{ marginTop: 8 }}>
                    Die Bilanz oben zählt nur Punktspiele. Stimmt ein Spiel nicht, öffne es und ändere unter „Bearbeiten“ die Art (Punktspiel, Pokalspiel, Testspiel).
                  </p>
                </section>
              )}

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

              <section className="section">
                <div className="section-head">
                  <h2>Torschützen Punktspiele</h2>
                  <button className="btn btn-ghost btn-sm" onClick={() => go({ tab: 'scorers' })}>
                    Alle anzeigen <Icon name="chevronRight" size={16} />
                  </button>
                </div>
                {range === 'season' && snapshotNewer && (
                  <div className="banner banner-info" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Icon name="trophy" />
                    <span className="grow">
                      Torschützen der Punktspiele von fussball.de übernehmen (Stand {formatDateNumeric(FUSSBALLDE_SNAPSHOT.updatedAt)}, {FUSSBALLDE_SNAPSHOT.rows.reduce((n, r) => n + r[3], 0)} Tore).
                    </span>
                    <button className="btn btn-sm btn-primary" disabled={importing} onClick={importSnapshot}>
                      {importing ? 'Einen Moment …' : 'Übernehmen'}
                    </button>
                  </div>
                )}
                {scorers.length === 0 ? (
                  <p className="muted small">Noch keine Tore in Punktspielen eingetragen. Das geht im Spiel unter „Spiel & Aufstellung“.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th className="rank">#</th>
                          <th>Spieler</th>
                          <th className="r">Tore</th>
                          <th className="r">Spiele</th>
                          <th className="r hide-sm">Minuten</th>
                          <th className="r hide-sm">Vorlagen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scorers.map((x, i) => (
                          <tr key={x.p.id} onClick={() => go({ tab: 'team', playerId: x.p.id })} style={{ cursor: 'pointer' }}>
                            <td className="rank">{i + 1}</td>
                            <td className="name">{x.p.name}</td>
                            <td className="r num strong">{x.goals}</td>
                            <td className="r">{x.apps}</td>
                            <td className="r hide-sm">{x.minutes ?? '–'}</td>
                            <td className="r hide-sm">{x.assists || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td />
                          <td className="name">Gesamt</td>
                          <td className="r num strong">{scorers.reduce((n, x) => n + x.goals, 0)}</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                <p className="small muted" style={{ marginTop: 8 }}>
                  Nur Punktspiele – Pokal- und Testspiele zählen hier nicht mit.
                  {hasOfficial ? ' Vorlagen stammen aus den in der App erfassten Spielen.' : ''}
                </p>
              </section>

              <section className="section">
                <div className="section-head">
                  <h2>Karten · Saison {seasonLabel(seasonStart)}</h2>
                  <button className="btn btn-ghost btn-sm" onClick={() => go({ tab: 'results' })}>
                    <Icon name="edit" size={16} /> Nachtragen
                  </button>
                  <Segmented
                    label="Wettbewerb"
                    value={cardScope}
                    onChange={setCardScope}
                    options={[
                      { value: 'league', label: 'Liga' },
                      { value: 'cup', label: 'Pokal' },
                      { value: 'all', label: 'Alle Spiele' },
                    ]}
                  />
                </div>
                {cards.length === 0 ? (
                  <p className="muted small">Keine Karten {cardScope === 'league' ? 'in Punktspielen' : cardScope === 'cup' ? 'im Pokal' : ''} eingetragen. Karten trägst du beim jeweiligen Spiel ein – tippe auf „Nachtragen“.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Spieler</th>
                          <th className="r">
                            <span className="card-ico card-y" title="Gelb" /> Gelb
                          </th>
                          <th className="r">
                            <span className="card-ico card-yr" title="Gelb-Rot" /> Gelb-Rot
                          </th>
                          <th className="r">
                            <span className="card-ico card-r" title="Rot" /> Rot
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cards.map(({ p, s }) => (
                          <tr key={p.id} onClick={() => go({ tab: 'team', playerId: p.id })} style={{ cursor: 'pointer' }}>
                            <td className="name">{p.name}</td>
                            <td className="r num strong">{s.yellow || '–'}</td>
                            <td className="r num strong">{s.yellowRed || '–'}</td>
                            <td className="r num strong">{s.red || '–'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="name">Gesamt</td>
                          <td className="r num strong">{cards.reduce((n, c) => n + c.s.yellow, 0)}</td>
                          <td className="r num strong">{cards.reduce((n, c) => n + c.s.yellowRed, 0)}</td>
                          <td className="r num strong">{cards.reduce((n, c) => n + c.s.red, 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                <p className="small muted" style={{ marginTop: 8 }}>
                  Summe der Karten, die bei den einzelnen {cardScope === 'league' ? 'Punktspielen' : cardScope === 'cup' ? 'Pokalspielen' : 'Punkt- und Pokalspielen'} eingetragen sind.
                </p>
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

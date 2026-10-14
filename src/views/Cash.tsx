import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { CashEntry, DEFAULT_PENALTIES, FeeSettings, Fine, PenaltyRule, Player } from '../types';
import { currentSeasonStart, formatDate, formatDateNumeric, seasonLabel, todayISO } from '../lib/dates';
import { feeFor, feeSummary, feesReceivedTotal, hasPaid, monthLabel, seasonMonths } from '../lib/fees';
import { buildReport, savePDF, type Section } from '../lib/pdf';
import { euro, fineBalance } from '../lib/stats';
import { haptic, newId, saveFile, shareText, toCSV } from '../lib/native';
import { Icon } from '../components/Icon';
import { Avatar, Empty, Field, PageHead, Sheet, useDialog } from '../components/ui';

type TabKey = 'fines' | 'players' | 'fees' | 'book' | 'catalog';

export function CashView() {
  const { club, saveClub, players, allPlayers, playerById } = useStore();
  const { toast, confirm } = useDialog();
  const [tab, setTab] = useState<TabKey>('fines');
  const [adding, setAdding] = useState<string | null | undefined>(undefined); // undefined = zu, null = ohne Spieler, id = Spieler vorausgewählt
  const [bookEntry, setBookEntry] = useState(false);
  const [showPaid, setShowPaid] = useState(false);

  const fines = club.fines || [];
  const cashbook = club.cashbook || [];
  const catalog = club.penaltyCatalog?.length ? club.penaltyCatalog : DEFAULT_PENALTIES;
  const bal = fineBalance(fines);
  const bookSum = cashbook.reduce((s, c) => s + c.amount, 0);
  const feesTotal = feesReceivedTotal(club.fees, allPlayers);
  const cash = bal.paid + bookSum + feesTotal;
  const seasonStart = currentSeasonStart(club.seasonStart);
  const seasonIncome = fines.filter((f) => f.paid && (f.paidAt || f.date) >= seasonStart).reduce((s, f) => s + f.amount, 0);
  const months = seasonMonths(seasonStart);
  const feesOn = (club.fees?.amount || 0) > 0;
  const fees = feeSummary(club.fees, players, months);

  const setFines = (next: Fine[]) => saveClub({ fines: next });
  const togglePaid = (f: Fine) => {
    setFines(fines.map((x) => (x.id === f.id ? { ...x, paid: !x.paid, paidAt: !x.paid ? todayISO() : undefined } : x)));
    toast(f.paid ? 'Wieder als offen markiert.' : `${euro(f.amount)} bezahlt.`, { label: 'Rückgängig', run: () => setFines(fines) });
  };
  const removeFine = async (f: Fine) => {
    if (await confirm(`${f.reason} (${euro(f.amount)}) für ${playerById(f.playerId)?.name || 'Unbekannt'} löschen?`, { title: 'Strafe löschen?', ok: 'Löschen', danger: true })) {
      setFines(fines.filter((x) => x.id !== f.id));
      toast('Strafe gelöscht.', { label: 'Rückgängig', run: () => setFines(fines) });
    }
  };
  const payAll = (pid: string) => {
    const open = fines.filter((f) => f.playerId === pid && !f.paid);
    setFines(fines.map((f) => (f.playerId === pid && !f.paid ? { ...f, paid: true, paidAt: todayISO() } : f)));
    toast(`${euro(open.reduce((s, f) => s + f.amount, 0))} von ${playerById(pid)?.name} bezahlt.`, { label: 'Rückgängig', run: () => setFines(fines) });
  };

  const shareReminder = async () => {
    const lines = Object.entries(bal.byPlayer)
      .filter(([, b]) => b.open > 0)
      .sort((a, b) => b[1].open - a[1].open)
      .map(([pid, b]) => `• ${playerById(pid)?.name || 'Unbekannt'}: ${euro(b.open)}`);
    const text = `*Offene Strafen – ${club.clubName}*\n\n${lines.join('\n')}\n\nGesamt: ${euro(bal.open)}. Bitte beim nächsten Training bezahlen.`;
    const r = await shareText('Offene Strafen', text);
    if (r === 'copied') toast('Text kopiert – jetzt in WhatsApp einfügen.');
  };

  const exportPDF = async () => {
    const name = (pid: string) => playerById(pid)?.name || 'Unbekannt';
    const openFines = fines.filter((f) => !f.paid).sort((a, b) => name(a.playerId).localeCompare(name(b.playerId), 'de'));
    const seasonPaid = fines.filter((f) => f.paid && (f.paidAt || f.date) >= seasonStart).sort((a, b) => (a.paidAt || a.date).localeCompare(b.paidAt || b.date));
    const pairs: [string, string][] = [
      ['Kassenstand', euro(cash)],
      ['davon bezahlte Strafen', euro(bal.paid)],
    ];
    if (feesOn || feesTotal) pairs.push(['davon Mitgliedsbeiträge', euro(feesTotal)]);
    pairs.push(['davon Kassenbuch', euro(bookSum)], ['Offene Strafen', euro(bal.open)]);
    if (feesOn) pairs.push([`Offene Beiträge (Saison ${seasonLabel(seasonStart)})`, euro(fees.open)]);
    const sections: Section[] = [
      { heading: 'Überblick', pairs },
      {
        heading: 'Offene Strafen',
        columns: [
          { title: 'Spieler', width: 3 },
          { title: 'Grund', width: 4 },
          { title: 'Datum', width: 2 },
          { title: 'Betrag', width: 1.5, align: 'right' },
        ],
        rows: openFines.map((f) => [name(f.playerId), f.reason, formatDateNumeric(f.date), euro(f.amount)]),
        footer: ['Summe', '', '', euro(bal.open)],
      },
      {
        heading: `Bezahlte Strafen (Saison ${seasonLabel(seasonStart)})`,
        columns: [
          { title: 'Bezahlt am', width: 2 },
          { title: 'Spieler', width: 3 },
          { title: 'Grund', width: 4 },
          { title: 'Betrag', width: 1.5, align: 'right' },
        ],
        rows: seasonPaid.map((f) => [formatDateNumeric(f.paidAt || f.date), name(f.playerId), f.reason, euro(f.amount)]),
        footer: ['Summe', '', '', euro(seasonIncome)],
      },
    ];
    if (feesOn)
      sections.push({
        heading: `Mitgliedsbeiträge (Saison ${seasonLabel(seasonStart)})`,
        note: `Monatsbeitrag ${euro(club.fees!.amount)} · erwartet ${euro(fees.expected)} · eingegangen ${euro(fees.received)}`,
        columns: [
          { title: 'Spieler', width: 3 },
          { title: 'Offene Monate', width: 5 },
          { title: 'Offen', width: 1.5, align: 'right' },
        ],
        rows: Object.entries(fees.openBy)
          .sort((a, b) => name(a[0]).localeCompare(name(b[0]), 'de'))
          .map(([pid, o]) => [name(pid), o.months.map((m) => monthLabel(m)).join(', '), euro(o.amount)]),
        footer: ['Summe', '', euro(fees.open)],
      });
    sections.push({
      heading: 'Kassenbuch',
      columns: [
        { title: 'Datum', width: 2 },
        { title: 'Beschreibung', width: 6 },
        { title: 'Betrag', width: 1.5, align: 'right' },
      ],
      rows: [...cashbook].sort((a, b) => a.date.localeCompare(b.date)).map((c) => [formatDateNumeric(c.date), c.label, euro(c.amount)]),
      footer: ['Summe', '', euro(bookSum)],
    });
    const bytes = await buildReport({
      title: 'Kassenbericht',
      subtitle: `Stand ${formatDateNumeric(todayISO())}`,
      clubName: [club.clubName, club.teamName].filter(Boolean).join(' · '),
      logo: club.clubLogoUrl || undefined,
      sections,
    });
    await savePDF(`kassenbericht-${todayISO()}.pdf`, bytes);
    toast('Kassenbericht erstellt.');
  };

  const exportCSV = async () => {
    const rows: (string | number)[][] = [['Datum', 'Spieler', 'Grund', 'Betrag', 'Bezahlt', 'Bezahlt am']];
    [...fines].sort((a, b) => a.date.localeCompare(b.date)).forEach((f) => rows.push([f.date, playerById(f.playerId)?.name || '', f.reason, f.amount.toFixed(2).replace('.', ','), f.paid ? 'ja' : 'nein', f.paidAt || '']));
    rows.push([], ['Kassenbuch'], ['Datum', 'Beschreibung', 'Betrag']);
    cashbook.forEach((c) => rows.push([c.date, c.label, c.amount.toFixed(2).replace('.', ',')]));
    await saveFile(`teamtime-kasse-${todayISO()}.csv`, toCSV(rows), 'text/csv');
  };

  const sortedFines = useMemo(() => [...fines].filter((f) => showPaid || !f.paid).sort((a, b) => Number(a.paid) - Number(b.paid) || b.date.localeCompare(a.date)), [fines, showPaid]);
  const paidCount = fines.filter((f) => f.paid).length;

  return (
    <>
      <PageHead
        title="Mannschaftskasse"
        actions={
          <>
            <button className="btn" onClick={exportPDF}>
              <Icon name="file" /> Bericht
            </button>
            <button className="btn btn-ghost" onClick={exportCSV} title="Als Tabelle für Excel">
              <Icon name="download" /> Tabelle
            </button>
            <button className="btn btn-primary only-desktop" onClick={() => setAdding(null)}>
              <Icon name="plus" /> Strafe
            </button>
          </>
        }
      />
      <div className="stats-row">
        <div className="stat">
          <div className="stat-value">{euro(cash)}</div>
          <div className="stat-label">Kassenstand</div>
        </div>
        <div className={'stat' + (bal.open ? ' stat-rose' : '')}>
          <div className="stat-value">{euro(bal.open)}</div>
          <div className="stat-label">Strafen offen</div>
        </div>
        {feesOn ? (
          <div className={'stat' + (fees.open ? ' stat-rose' : '')}>
            <div className="stat-value">{euro(fees.open)}</div>
            <div className="stat-label">Beiträge offen</div>
          </div>
        ) : (
          <div className="stat">
            <div className="stat-value">{euro(seasonIncome)}</div>
            <div className="stat-label">Strafen bezahlt (Saison)</div>
          </div>
        )}
      </div>

      <div className="tabs section" role="tablist" style={{ marginTop: 20 }}>
        {(
          [
            ['fines', 'Strafen'],
            ['players', 'Pro Spieler'],
            ['fees', 'Beiträge'],
            ['book', 'Kassenbuch'],
            ['catalog', 'Strafenkatalog'],
          ] as [TabKey, string][]
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'fines' &&
        (fines.length === 0 ? (
          <div className="panel">
            <Empty
              icon="wallet"
              title="Noch keine Strafen"
              action={
                <button className="btn btn-primary" onClick={() => setAdding(null)}>
                  Strafe eintragen
                </button>
              }
            >
              Den Katalog mit Beträgen kannst du unter „Strafenkatalog“ anpassen.
            </Empty>
          </div>
        ) : (
          <>
            <div className="list">
              {sortedFines.map((f) => {
                const p = playerById(f.playerId);
                return (
                  <div className="list-row" key={f.id}>
                    <span className="hide-sm">
                      <Avatar player={p || { name: '?' }} size={32} />
                    </span>
                    <span className="grow" style={{ opacity: f.paid ? 0.6 : 1 }}>
                      <span className="title ellipsis" style={{ display: 'block' }}>
                        {p?.name || 'Unbekannt'}
                      </span>
                      <span className="sub" style={{ display: 'block' }}>
                        {f.reason} · {formatDate(f.date)}
                        {f.paid && f.paidAt ? ` · bezahlt ${formatDate(f.paidAt)}` : ''}
                      </span>
                    </span>
                    <b className="num nowrap" style={{ fontSize: '1.15rem', color: f.paid ? 'var(--muted)' : 'var(--rose)' }}>
                      {euro(f.amount)}
                    </b>
                    <button className={'btn btn-sm' + (f.paid ? ' btn-ghost' : '')} onClick={() => togglePaid(f)}>
                      {f.paid ? 'Offen' : 'Bezahlt'}
                    </button>
                    <button className="icon-btn" onClick={() => removeFine(f)} aria-label="Strafe löschen">
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                );
              })}
              {sortedFines.length === 0 && <p className="panel-pad muted">Alles bezahlt.</p>}
            </div>
            {paidCount > 0 && (
              <label className="check small" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} />
                Bezahlte Strafen zeigen ({paidCount})
              </label>
            )}
          </>
        ))}

      {tab === 'players' && (
        <>
          <div className="toolbar">
            <button className="btn btn-sm" onClick={shareReminder} disabled={!bal.open}>
              <Icon name="share" size={18} /> Offene Beträge in die Gruppe schicken
            </button>
          </div>
          <div className="list">
            {allPlayers
              .filter((p) => !p.inactive || bal.byPlayer[p.id])
              .map((p) => ({ p, b: bal.byPlayer[p.id] || { open: 0, paid: 0, count: 0 } }))
              .sort((a, b) => b.b.open - a.b.open || b.b.paid - a.b.paid || a.p.name.localeCompare(b.p.name, 'de'))
              .map(({ p, b }) => (
                <div className="list-row" key={p.id}>
                  <Avatar player={p} size={32} />
                  <span className="grow">
                    <span className="title">{p.name}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {b.count ? `${b.count} Strafen · ${euro(b.paid)} bezahlt` : 'Keine Strafen'}
                    </span>
                  </span>
                  {b.open > 0 && (
                    <b className="num" style={{ color: 'var(--rose)', fontSize: '1.15rem' }}>
                      {euro(b.open)}
                    </b>
                  )}
                  {b.open > 0 ? (
                    <button className="btn btn-sm" onClick={() => payAll(p.id)}>
                      Alles bezahlt
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-ghost" onClick={() => setAdding(p.id)}>
                      <Icon name="plus" size={18} /> Strafe
                    </button>
                  )}
                </div>
              ))}
          </div>
        </>
      )}

      {tab === 'book' && (
        <>
          <div className="toolbar">
            <button className="btn btn-sm" onClick={() => setBookEntry(true)}>
              <Icon name="plus" size={18} /> Einnahme oder Ausgabe
            </button>
            <span className="small muted">Bezahlte Strafen ({euro(bal.paid)}) zählen automatisch zum Kassenstand.</span>
          </div>
          {cashbook.length === 0 ? (
            <p className="muted small">Trag hier z. B. den Anfangsbestand, Getränke oder die Weihnachtsfeier ein.</p>
          ) : (
            <div className="list">
              {[...cashbook]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((c) => (
                  <div className="list-row" key={c.id}>
                    <span className="grow">
                      <span className="title">{c.label}</span>
                      <span className="sub" style={{ display: 'block' }}>
                        {formatDate(c.date, true)}
                      </span>
                    </span>
                    <b className="num" style={{ fontSize: '1.15rem', color: c.amount < 0 ? 'var(--rose)' : 'var(--green-ink)' }}>
                      {c.amount > 0 ? '+' : ''}
                      {euro(c.amount)}
                    </b>
                    <button
                      className="icon-btn"
                      aria-label="Eintrag löschen"
                      onClick={async () => {
                        if (await confirm(`„${c.label}“ löschen?`, { ok: 'Löschen', danger: true })) saveClub({ cashbook: cashbook.filter((x) => x.id !== c.id) });
                      }}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {tab === 'fees' && <FeesTab fees={club.fees} players={allPlayers.filter((p) => !p.inactive || club.fees?.paid?.[p.id]?.length)} months={months} onSave={(f) => saveClub({ fees: f })} />}

      {tab === 'catalog' && <CatalogEditor catalog={catalog} onSave={(c) => saveClub({ penaltyCatalog: c })} />}

      <button className="fab" onClick={() => setAdding(null)} aria-label="Strafe eintragen">
        <Icon name="plus" size={26} />
      </button>
      {adding !== undefined && <FineForm presetPlayer={adding} catalog={catalog} players={players} onClose={() => setAdding(undefined)} />}
      {bookEntry && <BookForm onClose={() => setBookEntry(false)} />}
    </>
  );
}

function FineForm({ presetPlayer, catalog, players, onClose }: { presetPlayer: string | null; catalog: PenaltyRule[]; players: { id: string; name: string }[]; onClose: () => void }) {
  const { club, saveClub } = useStore();
  const { toast } = useDialog();
  const [pids, setPids] = useState<string[]>(presetPlayer ? [presetPlayer] : []);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [q, setQ] = useState('');
  const amt = parseFloat(amount.replace(',', '.'));
  const valid = pids.length > 0 && reason.trim() && amt > 0;

  const save = () => {
    if (!valid) return;
    const add: Fine[] = pids.map((pid) => ({ id: newId(), playerId: pid, reason: reason.trim(), amount: Math.round(amt * 100) / 100, date, paid: false }));
    saveClub({ fines: [...(club.fines || []), ...add] });
    toast(add.length > 1 ? `${add.length} Strafen eingetragen.` : 'Strafe eingetragen.');
    onClose();
  };
  const visible = players.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Sheet
      title="Strafe eintragen"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>
            {pids.length > 1 ? `${pids.length} × eintragen` : 'Eintragen'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="field">
          <span className="field-label">Grund</span>
          <div className="chips">
            {catalog.map((r) => (
              <button
                key={r.id}
                type="button"
                className={'chip' + (reason === r.reason ? ' on' : '')}
                onClick={() => {
                  setReason(r.reason);
                  setAmount(String(r.amount).replace('.', ','));
                }}
              >
                {r.reason} · {euro(r.amount)}
              </button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <Field label="Grund (frei)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Handy in der Kabine" />
          </Field>
          <Field label="Betrag in €">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} />
          </Field>
          <Field label="Datum">
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
        </div>
        <div className="field">
          <span className="field-label">Für wen? {pids.length > 0 && `(${pids.length} gewählt)`}</span>
          {players.length > 8 && <input className="input" placeholder="Name suchen" value={q} onChange={(e) => setQ(e.target.value)} />}
          <div className="chips" style={{ marginTop: 4 }}>
            {visible.map((p) => (
              <button key={p.id} type="button" className={'chip' + (pids.includes(p.id) ? ' on' : '')} onClick={() => setPids((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function BookForm({ onClose }: { onClose: () => void }) {
  const { club, saveClub } = useStore();
  const [dir, setDir] = useState<'in' | 'out'>('out');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const amt = parseFloat(amount.replace(',', '.'));
  const save = () => {
    if (!label.trim() || !(amt > 0)) return;
    const entry: CashEntry = { id: newId(), date, label: label.trim(), amount: (dir === 'in' ? 1 : -1) * Math.round(amt * 100) / 100 };
    saveClub({ cashbook: [...(club.cashbook || []), entry] });
    onClose();
  };
  return (
    <Sheet
      title="Kassenbuch"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={!label.trim() || !(amt > 0)} onClick={save}>
            Eintragen
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="full chips">
          <button className={'chip' + (dir === 'in' ? ' on' : '')} onClick={() => setDir('in')}>
            Einnahme
          </button>
          <button className={'chip' + (dir === 'out' ? ' on' : '')} onClick={() => setDir('out')}>
            Ausgabe
          </button>
        </div>
        <Field label="Beschreibung" wide>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={dir === 'in' ? 'z. B. Anfangsbestand' : 'z. B. Kasten Wasser'} autoFocus />
        </Field>
        <Field label="Betrag in €">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} />
        </Field>
        <Field label="Datum">
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

function CatalogEditor({ catalog, onSave }: { catalog: PenaltyRule[]; onSave: (c: PenaltyRule[]) => void }) {
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const amt = parseFloat(amount.replace(',', '.'));
  const add = () => {
    if (!reason.trim() || !(amt > 0)) return;
    onSave([...catalog, { id: newId(), reason: reason.trim(), amount: Math.round(amt * 100) / 100 }]);
    setReason('');
    setAmount('');
  };
  const update = (id: string, patch: Partial<PenaltyRule>) => onSave(catalog.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="list">
        {catalog.map((r) => (
          <div className="list-row" key={r.id}>
            <input className="input grow" defaultValue={r.reason} aria-label="Grund" onBlur={(e) => e.target.value.trim() && e.target.value !== r.reason && update(r.id, { reason: e.target.value.trim() })} />
            <input
              className="input"
              style={{ width: 90, textAlign: 'right' }}
              inputMode="decimal"
              defaultValue={String(r.amount).replace('.', ',')}
              aria-label="Betrag in Euro"
              onBlur={(e) => {
                const v = parseFloat(e.target.value.replace(',', '.'));
                if (v > 0 && v !== r.amount) update(r.id, { amount: v });
              }}
            />
            <span className="muted">€</span>
            <button className="icon-btn" onClick={() => onSave(catalog.filter((x) => x.id !== r.id))} aria-label={`${r.reason} entfernen`}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
      </div>
      <div className="panel panel-pad" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Neuer Grund">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Handy in der Kabine" />
        </Field>
        <Field label="Betrag in €">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 110 }} />
        </Field>
        <button className="btn btn-primary" onClick={add} disabled={!reason.trim() || !(amt > 0)}>
          Hinzufügen
        </button>
      </div>
      <p className="small muted">Änderungen am Katalog gelten nur für neue Strafen.</p>
    </div>
  );
}

function FeesTab({ fees, players, months, onSave }: { fees?: FeeSettings; players: Player[]; months: string[]; onSave: (f: FeeSettings) => void }) {
  const { toast } = useDialog();
  const f: FeeSettings = fees || { amount: 0 };
  const [amount, setAmount] = useState(f.amount ? String(f.amount).replace('.', ',') : '');
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const sum = feeSummary(f, players, months);

  const saveAmount = () => {
    const v = parseFloat(amount.replace(',', '.')) || 0;
    if (v !== f.amount) {
      onSave({ ...f, amount: Math.round(v * 100) / 100 });
      toast(v ? `Monatsbeitrag: ${euro(v)}` : 'Beiträge ausgeschaltet.');
    }
  };
  const toggle = (pid: string, m: string) => {
    haptic();
    const cur = f.paid?.[pid] || [];
    const next = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort();
    onSave({ ...f, paid: { ...(f.paid || {}), [pid]: next } });
  };
  const payUntilNow = (pid: string) => {
    const cur = new Set(f.paid?.[pid] || []);
    months.forEach((m) => cur.add(m));
    onSave({ ...f, paid: { ...(f.paid || {}), [pid]: [...cur].sort() } });
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel panel-pad" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Monatsbeitrag in €" hint="0 oder leer = keine Beiträge">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} onBlur={saveAmount} style={{ width: 140 }} />
        </Field>
        {f.amount > 0 && (
          <dl className="kv grow" style={{ minWidth: 220 }}>
            <dt>Erwartet bis heute</dt>
            <dd>{euro(sum.expected)}</dd>
            <dt>Eingegangen</dt>
            <dd>{euro(sum.received)}</dd>
            <dt>Offen</dt>
            <dd style={sum.open ? { color: 'var(--rose)' } : undefined}>{euro(sum.open)}</dd>
          </dl>
        )}
      </div>

      {f.amount > 0 && (
        <>
          <div className="table-wrap fee-grid">
            <table className="data">
              <thead>
                <tr>
                  <th className="sticky-col">Spieler</th>
                  {months.map((m) => (
                    <th key={m} className="c">
                      {monthLabel(m)}
                    </th>
                  ))}
                  <th className="r">Offen</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const fee = feeFor(f, p.id);
                  const open = sum.openBy[p.id]?.amount || 0;
                  return (
                    <tr key={p.id}>
                      <td className="sticky-col name">
                        <button className="fee-name" onClick={() => setEditPlayer(p)}>
                          {p.name}
                          <span className="small muted">{fee ? (f.custom?.[p.id] !== undefined ? ` · ${euro(fee)}` : '') : ' · befreit'}</span>
                        </button>
                      </td>
                      {months.map((m) => {
                        const paid = hasPaid(f, p.id, m);
                        return (
                          <td key={m} className="c">
                            {fee ? (
                              <button
                                className={'fee-cell' + (paid ? ' paid' : '')}
                                onClick={() => toggle(p.id, m)}
                                aria-pressed={paid}
                                aria-label={`${p.name} ${monthLabel(m, true)} ${paid ? 'bezahlt' : 'offen'}`}
                              >
                                {paid ? <Icon name="check" size={16} stroke={2.6} /> : null}
                              </button>
                            ) : (
                              <span className="muted">–</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="r num" style={{ fontWeight: 700, color: open ? 'var(--rose)' : 'var(--muted)' }}>
                        {open ? euro(open) : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">Kästchen antippen = Monat bezahlt. Auf den Namen tippen für abweichenden Betrag oder Befreiung.</p>
        </>
      )}

      {editPlayer && (
        <FeePlayerSheet
          player={editPlayer}
          fees={f}
          onClose={() => setEditPlayer(null)}
          onPayAll={() => {
            payUntilNow(editPlayer.id);
            setEditPlayer(null);
          }}
          onSave={(next) => {
            onSave(next);
            setEditPlayer(null);
          }}
        />
      )}
    </div>
  );
}

function FeePlayerSheet({ player, fees, onClose, onSave, onPayAll }: { player: Player; fees: FeeSettings; onClose: () => void; onSave: (f: FeeSettings) => void; onPayAll: () => void }) {
  const [exempt, setExempt] = useState(!!fees.exempt?.includes(player.id));
  const [custom, setCustom] = useState(fees.custom?.[player.id] !== undefined ? String(fees.custom[player.id]).replace('.', ',') : '');
  const save = () => {
    const c = { ...(fees.custom || {}) };
    const v = parseFloat(custom.replace(',', '.'));
    if (custom.trim() && v >= 0) c[player.id] = v;
    else delete c[player.id];
    const ex = new Set(fees.exempt || []);
    if (exempt) ex.add(player.id);
    else ex.delete(player.id);
    onSave({ ...fees, custom: c, exempt: [...ex] });
  };
  return (
    <Sheet
      title={player.name}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onPayAll}>
            Alles bis heute bezahlt
          </button>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <label className="check">
          <input type="checkbox" checked={exempt} onChange={(e) => setExempt(e.target.checked)} />
          Vom Beitrag befreit
        </label>
        {!exempt && (
          <Field label="Abweichender Monatsbeitrag in €" hint={`Leer lassen für den normalen Beitrag (${euro(fees.amount)})`}>
            <input inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d,.]/g, ''))} />
          </Field>
        )}
      </div>
    </Sheet>
  );
}

import { useMemo, useState } from 'react';
import { Player, isStaff } from '../types';
import { useStore } from '../data/store';
import { currentSeasonStart, seasonLabel, todayISO } from '../lib/dates';
import { newId, pickFile } from '../lib/native';
import { Field, Sheet, useDialog } from './ui';

// Kaderliste einspielen: eine Zeile pro Spieler, optional mit Einsätzen, Minuten und Toren
// (z. B. von fussball.de). Vorhandene Spieler werden am Namen erkannt und behalten ihre
// Historie; wer nicht mehr in der Liste steht, wird auf Wunsch inaktiv gesetzt – nie gelöscht.

interface Row {
  name: string;
  apps?: number;
  minutes?: number;
  goals?: number;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Gleicher Name, gleicher Vor- und Nachname (Zweitnamen egal) oder ein Tippfehler Unterschied */
export function sameName(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xa = x.split(' ');
  const ya = y.split(' ');
  if (xa[0] === ya[0] && xa[xa.length - 1] === ya[ya.length - 1]) return true;
  return x.length > 8 && distance(x, y) <= 2;
}

export function parseRoster(text: string): Row[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : lines[0].includes(',') && /\d/.test(lines[0]) ? ',' : null;
  const rows: Row[] = [];
  for (const line of lines) {
    const cells = sep ? line.split(sep).map((c) => c.trim()) : [line];
    const name = cells[0].replace(/^"|"$/g, '');
    if (!name || /^name$/i.test(name) || /^spieler$/i.test(name)) continue;
    const n = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
    rows.push({ name, apps: n(cells[1]), minutes: n(cells[2]), goals: n(cells[3]) });
  }
  return rows;
}

export function RosterImport({ onClose }: { onClose: () => void }) {
  const { allPlayers, savePlayer, club } = useStore();
  const { toast } = useDialog();
  const [text, setText] = useState('');
  const [source, setSource] = useState('fussball.de');
  const [deactivate, setDeactivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const season = seasonLabel(currentSeasonStart(club.seasonStart));
  const seasonLong = season.includes('/') ? `20${season.slice(0, 2)}/${season.slice(3)}` : season;

  const plan = useMemo(() => {
    const rows = parseRoster(text);
    const used = new Set<string>();
    const items = rows.map((r) => {
      const match = allPlayers.find((p) => !used.has(p.id) && sameName(p.name, r.name));
      if (match) used.add(match.id);
      return { row: r, match };
    });
    const missing = allPlayers.filter((p) => !used.has(p.id) && !p.inactive && !isStaff(p));
    return { items, missing, hasStats: rows.some((r) => r.apps !== undefined || r.goals !== undefined) };
  }, [text, allPlayers]);

  const fresh = plan.items.filter((i) => !i.match);
  const updated = plan.items.filter((i) => i.match);

  const apply = async () => {
    setBusy(true);
    const ext = (r: Row) =>
      r.apps !== undefined || r.minutes !== undefined || r.goals !== undefined
        ? { season: seasonLong, source: source.trim() || 'Liste', apps: r.apps, minutes: r.minutes, goals: r.goals, updatedAt: todayISO() }
        : undefined;
    for (const { row, match } of plan.items) {
      if (match) {
        const next: Player = { ...match, name: row.name, inactive: undefined };
        const e = ext(row);
        if (e) next.ext = e;
        await savePlayer(next);
      } else {
        await savePlayer({ id: newId(), name: row.name, ext: ext(row) });
      }
    }
    if (deactivate) for (const p of plan.missing) await savePlayer({ ...p, inactive: true });
    setBusy(false);
    toast(`Kader übernommen: ${updated.length} aktualisiert, ${fresh.length} neu${deactivate && plan.missing.length ? `, ${plan.missing.length} inaktiv` : ''}.`);
    onClose();
  };

  return (
    <Sheet
      title="Kader einspielen"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={!plan.items.length || busy} onClick={apply}>
            {busy ? 'Einen Moment …' : plan.items.length ? `${plan.items.length} Spieler übernehmen` : 'Übernehmen'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">
          Eine Zeile pro Spieler: <b>Name;Einsätze;Minuten;Tore</b> (die Zahlen sind freiwillig). Du kannst die Liste einfügen oder eine CSV-Datei wählen. Vorhandene
          Spieler werden am Namen erkannt und behalten ihre Zusagen, Tore und Strafen.
        </p>
        <Field label="Spielerliste">
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Max Mustermann;5;450;2\nErika Beispiel;3;210;0'} />
        </Field>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <button
            className="btn btn-sm"
            onClick={async () => {
              const t = await pickFile('.csv,.txt,text/csv,text/plain');
              if (t) setText(t);
            }}
          >
            Datei wählen
          </button>
          {plan.hasStats && (
            <Field label={`Quelle der Zahlen (Saison ${seasonLong})`}>
              <input value={source} onChange={(e) => setSource(e.target.value)} style={{ maxWidth: 200 }} />
            </Field>
          )}
        </div>

        {plan.items.length > 0 && (
          <div className="panel panel-pad" style={{ background: 'var(--surface-2)' }}>
            <dl className="kv">
              <dt>Bereits im Kader</dt>
              <dd>{updated.length}</dd>
              <dt>Neu</dt>
              <dd>{fresh.length}</dd>
              <dt>Nicht in der Liste</dt>
              <dd>{plan.missing.length}</dd>
            </dl>
            {updated.some((u) => u.match!.name !== u.row.name) && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Angepasste Schreibweise:{' '}
                {updated
                  .filter((u) => u.match!.name !== u.row.name)
                  .map((u) => `${u.match!.name} → ${u.row.name}`)
                  .join(', ')}
              </p>
            )}
            {fresh.length > 0 && (
              <p className="small muted" style={{ marginTop: 8 }}>
                Neu: {fresh.map((f) => f.row.name).join(', ')}
              </p>
            )}
            {plan.missing.length > 0 && (
              <label className="check" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} />
                Die {plan.missing.length} nicht enthaltenen Spieler auf „inaktiv“ setzen ({plan.missing.map((p) => p.name).join(', ')})
              </label>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

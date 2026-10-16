import { useState } from 'react';
import { Player } from '../types';
import { useStore } from '../data/store';
import { newId, pickImage } from '../lib/native';
import { Avatar, Field, Sheet, useDialog } from './ui';

export const POSITIONS = ['Tor', 'Abwehr', 'Mittelfeld', 'Sturm'];

export function PlayerForm({ player, onClose, onSaved }: { player?: Player; onClose: () => void; onSaved?: (id: string) => void }) {
  const { savePlayer, allPlayers } = useStore();
  const { toast } = useDialog();
  const [p, setP] = useState<Player>(() => player || { id: newId(), name: '' });
  const [showMore, setShowMore] = useState(!!(player?.goals || player?.assists || player?.yellowCards || player?.yellowRedCards || player?.redCards));
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<Player>) => setP((x) => ({ ...x, ...patch }));

  const save = async () => {
    const name = p.name.trim().replace(/\s+/g, ' ');
    if (!name) return setErr('Wie heißt der Spieler?');
    if (!player && allPlayers.some((x) => x.name.toLowerCase() === name.toLowerCase())) return setErr(`${name} ist schon im Kader.`);
    const num = p.jerseyNumber?.trim();
    if (num && allPlayers.some((x) => x.id !== p.id && !x.inactive && x.jerseyNumber === num))
      toast(`Hinweis: Die Nummer ${num} trägt schon ${allPlayers.find((x) => x.id !== p.id && x.jerseyNumber === num)?.name}.`);
    const clean: Player = { ...p, name, jerseyNumber: num || undefined, tags: p.tags?.filter(Boolean) };
    await savePlayer(clean);
    if (!player) toast(`${name} ist jetzt im Kader.`);
    onSaved?.(clean.id);
    onClose();
  };

  const num = (v: string) => (v === '' ? undefined : Math.max(0, parseInt(v, 10) || 0));

  return (
    <Sheet
      title={player ? 'Spieler bearbeiten' : 'Neuer Spieler'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={save}>
            {player ? 'Speichern' : 'Hinzufügen'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="full" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar player={{ ...p, name: p.name || '?' }} size={64} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                const img = await pickImage(192);
                if (img) set({ avatarUrl: img });
              }}
            >
              Foto wählen
            </button>
            {p.avatarUrl && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ avatarUrl: undefined })}>
                Foto entfernen
              </button>
            )}
          </div>
        </div>
        <Field label="Name" wide>
          <input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Vor- und Nachname" autoFocus={!player} />
        </Field>
        <Field label="Rückennummer">
          <input inputMode="numeric" value={p.jerseyNumber || ''} onChange={(e) => set({ jerseyNumber: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
        </Field>
        <Field label="Position">
          <select value={p.position || ''} onChange={(e) => set({ position: e.target.value || undefined })}>
            <option value="">–</option>
            {[...new Set([...POSITIONS, ...(p.position && !POSITIONS.includes(p.position) ? [p.position] : [])])].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Geburtsdatum">
          <input type="date" value={p.birthDate || ''} onChange={(e) => set({ birthDate: e.target.value || undefined })} />
        </Field>
        <Field label="Telefon">
          <input type="tel" value={p.phone || ''} onChange={(e) => set({ phone: e.target.value || undefined })} placeholder="für Anruf & WhatsApp" />
        </Field>
        <Field label="E-Mail" wide>
          <input type="email" value={p.email || ''} onChange={(e) => set({ email: e.target.value || undefined })} />
        </Field>
        <Field label="Merkmale" wide hint="Mit Komma trennen, z. B. Kapitän, A-Jugend, Schiri">
          <input value={(p.tags || []).join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((t) => t.trimStart()) })} />
        </Field>
        <Field label="Notizen" wide>
          <textarea value={p.notes || ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
        </Field>
        <Field label="Verletzungen & Gesundheit" wide hint="Nur für dich sichtbar">
          <textarea value={p.medicalNotes || ''} onChange={(e) => set({ medicalNotes: e.target.value || undefined })} />
        </Field>

        <div className="full">
          <button type="button" className="link" onClick={() => setShowMore((s) => !s)}>
            {showMore ? 'Werte von vor der App ausblenden' : 'Tore & Karten von vor der App nachtragen'}
          </button>
        </div>
        {showMore && (
          <>
            <Field label="Tore">
              <input inputMode="numeric" value={p.goals ?? ''} onChange={(e) => set({ goals: num(e.target.value) })} />
            </Field>
            <Field label="Vorlagen">
              <input inputMode="numeric" value={p.assists ?? ''} onChange={(e) => set({ assists: num(e.target.value) })} />
            </Field>
            <Field label="Gelbe Karten">
              <input inputMode="numeric" value={p.yellowCards ?? ''} onChange={(e) => set({ yellowCards: num(e.target.value) })} />
            </Field>
            <Field label="Gelb-Rote Karten">
              <input inputMode="numeric" value={p.yellowRedCards ?? ''} onChange={(e) => set({ yellowRedCards: num(e.target.value) })} />
            </Field>
            <Field label="Rote Karten">
              <input inputMode="numeric" value={p.redCards ?? ''} onChange={(e) => set({ redCards: num(e.target.value) })} />
            </Field>
          </>
        )}
        {player && (
          <label className="check full">
            <input type="checkbox" checked={!!p.inactive} onChange={(e) => set({ inactive: e.target.checked || undefined })} />
            Nicht mehr aktiv (bleibt in der Statistik, taucht aber nicht mehr bei Terminen auf)
          </label>
        )}
        {err && <p className="error-text full">{err}</p>}
      </div>
    </Sheet>
  );
}

export function BulkAddPlayers({ onClose }: { onClose: () => void }) {
  const { allPlayers, savePlayer } = useStore();
  const { toast } = useDialog();
  const [text, setText] = useState('');
  const names = [...new Set(text.split(/\n|;/).map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean))];
  const existing = new Set(allPlayers.map((p) => p.name.toLowerCase()));
  const fresh = names.filter((n) => !existing.has(n.toLowerCase()));

  const save = async () => {
    for (const name of fresh) await savePlayer({ id: newId(), name });
    toast(`${fresh.length} Spieler hinzugefügt.`);
    onClose();
  };

  return (
    <Sheet
      title="Mehrere Spieler hinzufügen"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={!fresh.length} onClick={save}>
            {fresh.length ? `${fresh.length} hinzufügen` : 'Hinzufügen'}
          </button>
        </>
      }
    >
      <Field label="Ein Name pro Zeile" hint={names.length > fresh.length ? `${names.length - fresh.length} sind schon im Kader und werden übersprungen.` : 'Du kannst die Liste auch aus WhatsApp oder Excel einfügen.'}>
        <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Max Mustermann\nErika Beispiel'} autoFocus />
      </Field>
    </Sheet>
  );
}

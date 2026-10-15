import { useMemo, useState } from 'react';
import { EventType, TeamEvent, TYPE_LABEL, isMatch } from '../types';
import { useStore } from '../data/store';
import { addDays, formatDateNumeric, parseDate, todayISO, toISODate } from '../lib/dates';
import { newId } from '../lib/native';
import { Field, Sheet, useDialog } from './ui';

const TYPES: EventType[] = ['training', 'match', 'cup', 'testmatch', 'treffen', 'other'];
const WEEKDAYS = [
  { d: 1, l: 'Mo' },
  { d: 2, l: 'Di' },
  { d: 3, l: 'Mi' },
  { d: 4, l: 'Do' },
  { d: 5, l: 'Fr' },
  { d: 6, l: 'Sa' },
  { d: 0, l: 'So' },
];

export function EventForm({ event, onClose, onSaved }: { event?: TeamEvent; onClose: () => void; onSaved?: (id: string) => void }) {
  const { events, club, saveEvents } = useStore();
  const { toast } = useDialog();
  const isNew = !event;
  const [e, setE] = useState<TeamEvent>(
    () =>
      event || {
        id: newId(),
        title: '',
        type: 'training',
        date: todayISO(),
        time: '18:30',
        location: club.defaultLocation || '',
        attendance: {},
        home: true,
      },
  );
  const [repeat, setRepeat] = useState(false);
  const [days, setDays] = useState<number[]>(() => [parseDate(e.date).getDay()]);
  const [until, setUntil] = useState(() => addDays(todayISO(), 12 * 7));
  const [applyToSeries, setApplyToSeries] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (patch: Partial<TeamEvent>) => setE((x) => ({ ...x, ...patch }));
  const locations = useMemo(() => [...new Set(events.map((x) => x.location).filter(Boolean))].slice(0, 30), [events]);
  const opponents = useMemo(() => [...new Set(events.map((x) => x.opponent).filter(Boolean) as string[])], [events]);

  const seriesDates = useMemo(() => {
    if (!repeat || !days.length) return [];
    const out: string[] = [];
    let d = e.date;
    let guard = 0;
    while (d <= until && guard++ < 400) {
      if (days.includes(parseDate(d).getDay())) out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [repeat, days, until, e.date]);

  const save = async () => {
    if (!e.date || !e.time) return setErr('Datum und Uhrzeit fehlen.');
    if (isMatch(e.type) && !e.opponent?.trim()) return setErr('Gegen wen wird gespielt?');
    const base: TeamEvent = {
      ...e,
      title: e.title.trim() || (isMatch(e.type) ? `${TYPE_LABEL[e.type]} gegen ${e.opponent}` : TYPE_LABEL[e.type]),
      opponent: isMatch(e.type) ? e.opponent?.trim() : undefined,
      location: e.location.trim(),
    };
    if (isNew && repeat) {
      if (seriesDates.length === 0) return setErr('An den gewählten Wochentagen gibt es keinen Termin im Zeitraum.');
      const seriesId = newId();
      const list = seriesDates.map((date, i) => ({ ...base, id: i === 0 ? base.id : newId(), date, seriesId, attendance: {} }));
      await saveEvents(list);
      toast(`${list.length} Termine angelegt.`);
    } else if (!isNew && applyToSeries && e.seriesId) {
      const following = events.filter((x) => x.seriesId === e.seriesId && x.date >= event!.date && x.id !== e.id);
      const shared = { time: base.time, meetTime: base.meetTime, endTime: base.endTime, location: base.location, title: base.title, type: base.type };
      await saveEvents([base, ...following.map((x) => ({ ...x, ...shared }))]);
      toast(`${following.length + 1} Termine geändert.`);
    } else {
      await saveEvents([base]);
      toast(isNew ? 'Termin angelegt.' : 'Änderungen gespeichert.');
    }
    onSaved?.(base.id);
    onClose();
  };

  return (
    <Sheet
      title={isNew ? 'Neuer Termin' : 'Termin bearbeiten'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={save}>
            {isNew && repeat && seriesDates.length > 1 ? `${seriesDates.length} Termine anlegen` : isNew ? 'Termin anlegen' : 'Speichern'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <span className="field-label">Art</span>
          <div className="chips">
            {TYPES.map((t) => (
              <button key={t} type="button" className={'chip' + (e.type === t ? ' on' : '')} onClick={() => set({ type: t })}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {isMatch(e.type) ? (
          <>
            <Field label="Gegner" wide>
              <input list="opponents" value={e.opponent || ''} onChange={(x) => set({ opponent: x.target.value })} placeholder="z. B. SV Eintracht" />
              <datalist id="opponents">
                {opponents.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </Field>
            <div className="field full">
              <span className="field-label">Spielort</span>
              <div className="chips">
                <button type="button" className={'chip' + (e.home !== false ? ' on' : '')} onClick={() => set({ home: true })}>
                  Heimspiel
                </button>
                <button type="button" className={'chip' + (e.home === false ? ' on' : '')} onClick={() => set({ home: false })}>
                  Auswärtsspiel
                </button>
              </div>
            </div>
          </>
        ) : (
          <Field label="Bezeichnung" wide hint={`Leer lassen für „${TYPE_LABEL[e.type]}“`}>
            <input value={e.title} onChange={(x) => set({ title: x.target.value })} placeholder={TYPE_LABEL[e.type]} />
          </Field>
        )}

        <Field label={repeat ? 'Erster Termin' : 'Datum'}>
          <input type="date" value={e.date} onChange={(x) => x.target.value && set({ date: x.target.value })} />
        </Field>
        <Field label={isMatch(e.type) ? 'Anstoß' : 'Beginn'}>
          <input type="time" value={e.time} onChange={(x) => set({ time: x.target.value })} />
        </Field>
        <Field label="Treffpunkt (optional)">
          <input type="time" value={e.meetTime || ''} onChange={(x) => set({ meetTime: x.target.value || undefined })} />
        </Field>
        <Field label="Ende (optional)">
          <input type="time" value={e.endTime || ''} onChange={(x) => set({ endTime: x.target.value || undefined })} />
        </Field>
        <Field label="Ort" wide>
          <input list="locations" value={e.location} onChange={(x) => set({ location: x.target.value })} placeholder="z. B. Sportplatz" />
          <datalist id="locations">
            {locations.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </Field>
        <Field label="Notiz (optional)" wide>
          <textarea value={e.notes || ''} onChange={(x) => set({ notes: x.target.value || undefined })} placeholder="z. B. Hallenschuhe mitbringen" />
        </Field>

        {isNew && (
          <div className="full panel panel-pad" style={{ background: 'var(--surface-2)' }}>
            <label className="check">
              <input type="checkbox" checked={repeat} onChange={(x) => setRepeat(x.target.checked)} />
              Jede Woche wiederholen
            </label>
            {repeat && (
              <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
                <div className="chips" role="group" aria-label="Wochentage">
                  {WEEKDAYS.map((w) => (
                    <button
                      key={w.d}
                      type="button"
                      className={'chip' + (days.includes(w.d) ? ' on' : '')}
                      onClick={() => setDays((ds) => (ds.includes(w.d) ? ds.filter((x) => x !== w.d) : [...ds, w.d]))}
                    >
                      {w.l}
                    </button>
                  ))}
                </div>
                <Field label="Bis einschließlich">
                  <input type="date" value={until} min={e.date} onChange={(x) => x.target.value && setUntil(x.target.value)} />
                </Field>
                <p className="small muted">
                  {seriesDates.length
                    ? `${seriesDates.length} Termine vom ${formatDateNumeric(seriesDates[0])} bis ${formatDateNumeric(seriesDates[seriesDates.length - 1])}.`
                    : 'Wähle mindestens einen Wochentag.'}
                </p>
              </div>
            )}
          </div>
        )}
        {!isNew && e.seriesId && (
          <label className="check full">
            <input type="checkbox" checked={applyToSeries} onChange={(x) => setApplyToSeries(x.target.checked)} />
            Zeit, Ort und Bezeichnung auch für alle folgenden Termine der Serie übernehmen
          </label>
        )}
        {err && <p className="error-text full">{err}</p>}
      </div>
    </Sheet>
  );
}

export const nextWeekday = (d: number) => {
  const t = new Date();
  t.setDate(t.getDate() + ((d - t.getDay() + 7) % 7));
  return toISODate(t);
};

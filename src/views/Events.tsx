import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { EventType, TYPE_LABEL } from '../types';
import { isOver, parseDate } from '../lib/dates';
import { EventRow } from '../components/EventRow';
import { EventForm } from '../components/EventForm';
import { Icon } from '../components/Icon';
import { Empty, PageHead, Segmented } from '../components/ui';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function EventsView() {
  const { events } = useStore();
  const { go } = useNav();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [type, setType] = useState<'all' | 'training' | 'games' | 'other'>('all');
  const [creating, setCreating] = useState(false);
  const [limit, setLimit] = useState(60);

  const filtered = useMemo(() => {
    const matchType = (t: EventType) =>
      type === 'all' || (type === 'training' ? t === 'training' : type === 'games' ? t === 'match' || t === 'testmatch' : t === 'treffen' || t === 'other');
    const list = events.filter((e) => matchType(e.type) && (when === 'upcoming' ? !isOver(e.date, e.time) : isOver(e.date, e.time)));
    return when === 'past' ? list.reverse() : list;
  }, [events, when, type]);

  const shown = filtered.slice(0, limit);
  const groups: { key: string; label: string; items: typeof shown }[] = [];
  for (const e of shown) {
    const d = parseDate(e.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }

  return (
    <>
      <PageHead
        title="Termine"
        sub={`${events.filter((e) => !isOver(e.date, e.time) && !e.cancelled).length} anstehend`}
        actions={
          <button className="btn btn-primary only-desktop" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            Neuer Termin
          </button>
        }
      />
      <div className="toolbar">
        <Segmented
          label="Zeitraum"
          value={when}
          onChange={(v) => {
            setWhen(v);
            setLimit(60);
          }}
          options={[
            { value: 'upcoming', label: 'Anstehend' },
            { value: 'past', label: 'Vergangen' },
          ]}
        />
        <Segmented
          label="Art"
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: 'Alle' },
            { value: 'training', label: TYPE_LABEL.training },
            { value: 'games', label: 'Spiele' },
            { value: 'other', label: 'Sonstige' },
          ]}
        />
      </div>

      {groups.length === 0 ? (
        <div className="panel">
          <Empty
            icon="calendar"
            title={when === 'upcoming' ? 'Keine anstehenden Termine' : 'Noch keine vergangenen Termine'}
            action={
              when === 'upcoming' && (
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  Termin anlegen
                </button>
              )
            }
          >
            {when === 'upcoming' ? 'Trainings kannst du als wöchentliche Serie für die ganze Saison anlegen.' : undefined}
          </Empty>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <h3 className="month-label">{g.label}</h3>
            <div className="list">
              {g.items.map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </div>
          </section>
        ))
      )}
      {filtered.length > limit && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn" onClick={() => setLimit((l) => l + 60)}>
            Weitere Termine zeigen
          </button>
        </div>
      )}

      <button className="fab" onClick={() => setCreating(true)} aria-label="Neuer Termin">
        <Icon name="plus" size={26} />
      </button>
      {creating && <EventForm onClose={() => setCreating(false)} onSaved={(id) => go({ tab: 'events', eventId: id })} />}
    </>
  );
}

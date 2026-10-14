import { TeamEvent, TYPE_LABEL, isMatch } from '../types';
import { useStore } from '../data/store';
import { useNav } from '../nav';
import { isOver, monthShort, parseDate, todayISO, weekdayShort } from '../lib/dates';
import { countStatus, outcome } from '../lib/stats';
import { eventTitle } from '../lib/texts';
import { Icon } from './Icon';

export function DateTile({ date, match }: { date: string; match?: boolean }) {
  return (
    <span className={'date-tile' + (match ? ' match' : '')} aria-hidden="true">
      <span className="w">{weekdayShort(date)}</span>
      <span className="d">{parseDate(date).getDate()}</span>
      <span className="m">{monthShort(date)}</span>
    </span>
  );
}

export function ResultBadge({ result }: { result?: string }) {
  const o = outcome(result);
  if (!o) return null;
  return <span className={`result res-${o}`}>{result}</span>;
}

export function EventRow({ e }: { e: TeamEvent }) {
  const { players } = useStore();
  const { go } = useNav();
  const over = isOver(e.date, e.time);
  const c = countStatus(e, players);
  const match = isMatch(e.type);
  return (
    <button className={'event-row' + (e.cancelled ? ' cancelled' : '') + (e.date === todayISO() ? ' today' : '')} onClick={() => go({ tab: 'events', eventId: e.id })}>
      <DateTile date={e.date} match={match} />
      <span className="grow">
        <span className="title ellipsis" style={{ display: 'block' }}>
          {eventTitle(e)}
        </span>
        <span className="sub" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>
            {eventTitle(e) === TYPE_LABEL[e.type] ? '' : `${TYPE_LABEL[e.type]} · `}
            {e.time} Uhr
          </span>
          {e.location && <span className="ellipsis" style={{ maxWidth: '22ch' }}>{e.location}</span>}
        </span>
      </span>
      {e.cancelled ? (
        <span className="tag tag-rose">Abgesagt</span>
      ) : match && e.result ? (
        <ResultBadge result={e.result} />
      ) : (
        <span className="counts" style={{ gap: 8 }} title={`${c.present} dabei, ${c.absent + c.excused + c.injured} fehlen, ${c.unsure} unsicher`}>
          <span>
            <span className="dot st-present" />
            <b>{c.present}</b>
          </span>
          {!over && c.unsure > 0 && (
            <span>
              <span className="dot st-unsure" />
              <b>{c.unsure}</b>
            </span>
          )}
        </span>
      )}
      <Icon name="chevronRight" size={18} className="muted" />
    </button>
  );
}

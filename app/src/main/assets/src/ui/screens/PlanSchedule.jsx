/* ═══════════════════════════════════════════════════════════════════════
   PlanSchedule — a plan's whole schedule and its day sheet (plans2, 3.4)
   ═══════════════════════════════════════════════════════════════════════
   Mock plans-sheet-1 right. Two tabs:
   - Coming up: from yesterday on, every day with its date, portion and
     minutes (or a tick when read); a marker where a section ends
     ("Genesis finished").
   - What I've read: the days completed, newest first, with the date they
     were read and a note mark when the day has a note; above them a compact
     month history (filled = a day completed; nothing is ever "missed").
   A tap on any day opens its sheet: every item (tap to read it), Read this
   day, and Mark day as read / Not read yet. In preview mode (before a plan
   starts) the days are shown but the sheet only lists the items.
   Free globals: React.
   ═══════════════════════════════════════════════════════════════════════ */

import { schedule, itemsLabel, markDay, dayNum, todayKey, dateOf } from '../../data/plan-engine.js';
import { bookTitle } from '../../data/plan-catalog.js';
import { saveRun } from '../../utils/plan-runs-view.js';
import { PlanSheet, PlanTick, dayDate, minText, WEEK_LETTERS } from '../components/PlanBits.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A day's eyebrow: "Today", else "Day 12". @param {any} d */
const dayEyebrow = (d) => (d.today ? 'Today' : 'Day ' + (d.day + 1));

/**
 * A day's sheet: its items, Read this day, Mark day as read / Not read yet.
 * @param {{ run: any, day: number, now: Date, preview?: boolean, onClose: () => void,
 *   onRead: (day: number, k?: string) => void, noteOf?: (day: number) => string | null }} props
 */
export function DaySheet({ run, day, now, preview = false, onClose, onRead }) {
  const all = schedule(run, now, bookTitle);
  const d = all[day];
  if (!d) return null;
  const ticks = run.ticks || {};
  const title = 'Day ' + (d.day + 1) + (d.date ? ' · ' + dayDate(d.date) : '');
  const canAct = !preview && run.status !== 'stopped';
  return (
    <PlanSheet id="plan-day-sheet" title={title} onClose={onClose} closeLabel={canAct ? 'Cancel' : 'Close'}
      actions={canAct ? (
        d.done
          ? <button type="button" className="plan-text-btn" onClick={() => { saveRun(markDay(run, d.day, false, new Date())); onClose(); }}>Not read yet</button>
          : <button type="button" className="plan-text-btn" onClick={() => { saveRun(markDay(run, d.day, true, new Date())); onClose(); }}>Mark day as read</button>
      ) : null}>
      <p className="plan-sheet-sub">{itemsLabel(d.items, bookTitle) + ' · ' + minText(d.minutes)}</p>
      <ul className="root-list plan-items" aria-label={'Day ' + (d.day + 1)}>
        {d.items.map((it) => (
          <li key={it.k}>
            {canAct ? (
              <button type="button" className="root-row plan-item-row" onClick={() => { onClose(); onRead(d.day, it.k); }}
                aria-label={'Read ' + itemsLabel([it], bookTitle) + (it.k in ticks ? ', read' : '')}>
                <PlanTick on={it.k in ticks} />
                <span className="root-row-title">{itemsLabel([it], bookTitle)}</span>
                <span className="plan-item-meta">{it.k in ticks ? 'read' : minText((Number(it.w) || 0) / 200)}</span>
              </button>
            ) : (
              <span className="root-row plan-item-row">
                <PlanTick on={false} />
                <span className="root-row-title">{itemsLabel([it], bookTitle)}</span>
                <span className="plan-item-meta">{minText((Number(it.w) || 0) / 200)}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canAct ? <button type="button" className="ui-btn is-primary is-wide" onClick={() => { onClose(); onRead(d.day); }}>Read this day</button> : null}
    </PlanSheet>
  );
}

/** One schedule row. @param {{ d: any, run: any, onOpen: () => void, note?: boolean, read?: boolean }} props */
function DayRow({ d, run, onOpen, note, read }) {
  const when = read ? (d.doneOn ? dayDate(d.doneOn) : 'Read before the start') : dayDate(d.date);
  return (
    <li className={'plan-sched-item' + (d.today ? ' is-today' : '')} data-day={d.day}>
      <button type="button" className="plan-day-row plan-day-btn" onClick={onOpen}
        aria-label={dayEyebrow(d) + ', ' + when + ': ' + itemsLabel(d.items, bookTitle) + (d.done ? ', read' : ', ' + minText(d.minutes))}>
        <span className="plan-day-when"><span className="plan-day-n">{dayEyebrow(d)}</span><span className="plan-day-date">{when}</span></span>
        <span className="plan-day-portion">{itemsLabel(d.items, bookTitle)}</span>
        {note ? <span className="plan-note-mark" aria-hidden="true">✎</span> : null}
        {d.done ? <PlanTick on /> : <span className="plan-day-min">{d.today && d.items.length > 1 ? d.items.filter((it) => it.k in ((run && run.ticks) || {})).length + ' of ' + d.items.length : minText(d.minutes)}</span>}
      </button>
    </li>
  );
}

/** The compact month history: filled = a day completed. @param {{ doneOn: Set<string>, month: Date, today: string }} props */
function MonthHistory({ doneOn, month, today }) {
  const y = month.getFullYear(), m = month.getMonth();
  const first = /** @type {number} */ (dayNum(y + '-' + String(m + 1).padStart(2, '0') + '-01'));
  const last = new Date(y, m + 1, 0).getDate();
  const lead = ((first + 4) % 7 + 7) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<span key={'b' + i} className="plan-cal-blank" />);
  for (let n = 1; n <= last; n++) {
    const key = dateOf(first + n - 1);
    cells.push(<span key={n} className="plan-cal-day" data-done={doneOn.has(key) ? '1' : undefined} data-today={key === today ? '1' : undefined}>{n}</span>);
  }
  return (
    <div className="ui-card plan-cal" role="img" aria-label={MONTHS[m] + ': ' + [...doneOn].filter((k) => k.startsWith(y + '-' + String(m + 1).padStart(2, '0'))).length + ' days read'}>
      <p className="plan-cal-name">{MONTHS[m] + ' ' + y}</p>
      <div className="plan-cal-grid" aria-hidden="true">
        {WEEK_LETTERS.map((w, i) => <span key={'w' + i} className="plan-cal-wd">{w}</span>)}
        {cells}
      </div>
    </div>
  );
}

/**
 * @param {{ run: any, now: Date, tab?: 'ahead' | 'read', at?: number, preview?: boolean,
 *   onTab?: (tab: 'ahead' | 'read') => void, onRead: (day: number, k?: string) => void, noteOf?: (day: number) => string | null }} props
 *   at: a day to bring into view (the road's section)
 */
export function PlanSchedule({ run, now, tab = 'ahead', at, preview = false, onTab, onRead, noteOf }) {
  const [sheet, setSheet] = React.useState(/** @type {number | null} */ (null));
  const [shown, setShown] = React.useState(tab);
  const days = schedule(run, now, bookTitle);
  const todayN = /** @type {number} */ (dayNum(todayKey(now)));
  const yesterday = dateOf(todayN - 1);
  const ahead = days.filter((d) => (d.done ? (d.doneOn || '') >= yesterday : true));
  const readDays = days.filter((d) => d.done).sort((a, b) => ((b.doneOn || '') < (a.doneOn || '') ? -1 : (b.doneOn || '') > (a.doneOn || '') ? 1 : b.day - a.day));
  const doneOn = new Set(days.map((d) => d.doneOn).filter(Boolean));
  const listRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  React.useEffect(() => {
    if (at == null || !listRef.current) return;
    const el = listRef.current.querySelector('[data-day="' + at + '"]');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }, [at]);
  const pick = (/** @type {'ahead' | 'read'} */ t) => { setShown(t); if (onTab) onTab(t); };
  return (
    <div className="root-screen plans-hub plan-schedule">
      {preview ? null : (
        <div className="ui-seg plan-seg" role="tablist" aria-label="Schedule">
          <button type="button" role="tab" aria-selected={shown === 'ahead'} className="ui-seg-item" onClick={() => pick('ahead')}>Coming up</button>
          <button type="button" role="tab" aria-selected={shown === 'read'} className="ui-seg-item" onClick={() => pick('read')}>What I’ve read</button>
        </div>
      )}
      {shown === 'ahead' || preview ? (
        <ol className="root-list plan-sched" ref={(el) => { listRef.current = el; }} aria-label="Coming up">
          {ahead.map((d) => (
            <React.Fragment key={d.day}>
              <DayRow d={d} run={run} onOpen={() => setSheet(d.day)} note={!!(noteOf && noteOf(d.day))} />
              {d.ends.map((name) => (
                <li key={'e' + name} className="plan-sched-end"><span aria-hidden="true">◆</span>{' ' + name + ' finished'}</li>
              ))}
            </React.Fragment>
          ))}
        </ol>
      ) : (
        <>
          <MonthHistory doneOn={doneOn} month={new Date(now.getFullYear(), now.getMonth(), 1, 12)} today={todayKey(now)} />
          {readDays.length ? (
            <ol className="root-list plan-sched" aria-label="What I’ve read">
              {readDays.map((d) => <DayRow key={d.day} d={d} run={run} read onOpen={() => setSheet(d.day)} note={!!(noteOf && noteOf(d.day))} />)}
            </ol>
          ) : (
            <div className="ui-card plan-empty">
              <p className="plan-empty-text">Each day you finish shows here, with the date you read it.</p>
              <button type="button" className="ui-btn is-primary" onClick={() => pick('ahead')}>See what’s coming up</button>
            </div>
          )}
        </>
      )}
      {sheet != null ? <DaySheet run={run} day={sheet} now={now} preview={preview} onClose={() => setSheet(null)} onRead={onRead} /> : null}
    </div>
  );
}

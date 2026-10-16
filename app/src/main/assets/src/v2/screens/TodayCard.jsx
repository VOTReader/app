/* TodayCard - today's reading on Home (zones dz24; pictures 9h one plan, 9i two; main's TodayCard).

   Only while a plan runs, under Recent: Continue and Recent stay one group, today's plan is the next thing. One plan:
   the day, the portion, the plan's name (and the days to catch up, as Reading plans says it), the progress line with
   main's percent, Listen and Read from the first chapter or letter of today not read. Two: a row per plan with main's
   round check, one Listen to today for the first plan not done, the days behind summed as a quiet link. Plans opens
   Reading plans. The facts are plans-facts.js's todayView (main's maths); what the taps open is the caller's. */
import { Icon } from '../Icon.jsx';

const days = (n) => n + (n === 1 ? ' day' : ' days');

/**
 * @param {{ view: import('../plans-facts.js').TodayView | null, markOff?: boolean, onPlans: () => void,
 *   onRead: (it: import('../plans-facts.js').PlanItem) => void, onListen: (it: import('../plans-facts.js').PlanItem) => void }} props
 */
export function TodayCard({ view, markOff = false, onPlans, onRead, onListen }) {
  if (!view || !view.running.length) return null;
  const head = (overline) => (
    <div className="tdy-h">
      <span className="overline">{overline}</span>
      <button type="button" className="textbtn sm" onClick={onPlans}>Plans</button>
    </div>
  );
  const foot = markOff ? <p className="fine">Mark as read is off, so days don’t tick. Turn it on in Settings.</p> : null;

  if (view.running.length === 1) {
    const r = view.running[0];
    const next = r.next;
    return (
      <section className="tdy" aria-label="Today’s reading">
        {head(r.overline)}
        <div className="tdy-t">{r.title}</div>
        <div className="tdy-s">{r.sub}</div>
        {!r.loading ? (
          <div className="tdy-p">
            <span className="dl-prog" aria-hidden="true"><i style={{ width: r.percent + '%' }} /></span>
            <span className="num">{r.percent + ' %'}</span>
          </div>
        ) : null}
        {next ? (
          <div className="actions">
            <button type="button" className="pill sm" aria-label={'Listen to ' + r.title} onClick={() => onListen(next)}>
              <Icon name="play" size={18} />Listen
            </button>
            <button type="button" className="btn2 sm" aria-label={'Read ' + r.title} onClick={() => onRead(next)}>Read</button>
          </div>
        ) : null}
        {foot}
      </section>
    );
  }

  const first = view.first;
  return (
    <section className="tdy two" aria-label="Today’s reading">
      {head('Today')}
      {view.running.map((r) => (
        <button key={r.id} type="button" className="tdy-r" disabled={!r.next}
          aria-label={'Read ' + r.title + ', ' + r.name + (r.done ? ', done' : '')}
          onClick={() => { if (r.next) onRead(r.next); }}>
          <span className={'tdy-c' + (r.done ? ' on' : '')}>{r.done ? <Icon name="check" /> : null}</span>
          <span className="tx"><span className="t">{r.title}</span><span className="s">{r.name}</span></span>
          <span className="chev"><Icon name="chev" /></span>
        </button>
      ))}
      {first ? (
        <button type="button" className="pill sm tdy-l" onClick={() => onListen(first)}><Icon name="play" size={18} />Listen to today</button>
      ) : null}
      {view.behind > 0 ? <button type="button" className="textbtn sm quiet tdy-b" onClick={onPlans}>{days(view.behind) + ' to catch up'}</button> : null}
      {foot}
    </section>
  );
}

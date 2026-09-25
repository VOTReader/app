/* ═══════════════════════════════════════════════════════════════════════
   TodayCard — today's reading-plan portion on Home (rp1)
   ═══════════════════════════════════════════════════════════════════════
   Built to the round-2 mockups (lanes/myweb/out/mockups/rp1/r2-home-one.png
   for one plan, r2-home-two.png for two). It sits between Home's title block
   and "Search library", and only while the reader follows a plan (the Library
   has the way in to start one).

   One plan: the day, the portion as the title, the plan's name, Read and
   Listen, a thin progress line. Two plans: a row each with a round check,
   and one Listen to today for the first plan not done yet. Nothing scores
   the reader: no streaks, and a day behind is a quiet line to the Plans
   screen. Read and Listen start at the first chapter or letter of today not
   read yet; what they open is the caller's (screen-routes).
   ═══════════════════════════════════════════════════════════════════════ */

import { readingPlansOf, todayRows } from '../../utils/reading-plan-view.js';
import { volumeSequence } from '../../data/reading-plans.js';

/** The Volumes in site order from the loaded corpus; [] until it is in. */
function volumesNow() {
  const g = /** @type {any} */ (globalThis);
  if (!g.READING_CHAIN || !g.COL_BY_KEY || typeof g.colLetterArr !== 'function' || typeof g.colPreface !== 'function') return [];
  return volumeSequence({ chain: g.READING_CHAIN, colByKey: g.COL_BY_KEY, letters: g.colLetterArr, preface: g.colPreface });
}

/**
 * Today's rows for the plans in settings. A Volumes plan loads the Volumes
 * (and re-reads them when they land); the date is read again whenever the app
 * comes back to the front, so the card turns over at midnight.
 * @param {any} readingPlans  settings.readingPlans
 * @param {(bid: string, cid: any) => boolean} isRead
 */
export function useTodayRows(readingPlans, isRead) {
  const plans = readingPlansOf({ readingPlans });
  const seq = useVolumesSeq(plans.some((p) => p.id === 'volumes'));
  const now = useNow();
  if (!plans.length || typeof isRead !== 'function') return [];
  return todayRows(plans, now, isRead, seq);
}

/**
 * The Volumes in site order while `wantsVolumes`: loads the corpus and reads
 * the sequence again when it lands. [] otherwise, or until then.
 * @param {boolean} wantsVolumes
 */
export function useVolumesSeq(wantsVolumes) {
  React.useEffect(() => {
    const load = /** @type {any} */ (window).__loadVotCorpus;
    if (wantsVolumes && typeof load === 'function') void load();
  }, [wantsVolumes]);
  const corpusVersion = React.useSyncExternalStore(
    React.useCallback((cb) => { const c = /** @type {any} */ (window).__votCorpus; return c ? c.subscribe(cb) : () => {}; }, []),
    () => { const c = /** @type {any} */ (window).__votCorpus; return c ? c.getVersion() : 0; },
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- corpusVersion is the trigger: volumesNow() reads globals the corpus load fills
  return React.useMemo(() => (wantsVolumes ? volumesNow() : []), [wantsVolumes, corpusVersion]);
}

/** The date, read again whenever the app comes back to the front (the card turns over at midnight). */
export function useNow() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);
  return now;
}

/**
 * @typedef {{ id: string, name: string, loading: boolean, label: string, done: boolean, day: number,
 *   totalDays: number, percent: number, behind: number, finished: boolean, next: any }} TodayRow
 */

/** @param {{ done: boolean }} props */
function Check({ done }) {
  return (
    <span className="today-check" data-done={done ? '1' : '0'} aria-hidden="true">
      {done ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12.5l4.2 4.2L19 7" /></svg> : null}
    </span>
  );
}

/** @param {TodayRow} r */
const portionOf = (r) => (r.loading ? 'Loading the Volumes…' : r.finished ? 'Plan complete' : r.label);

/**
 * @param {{ rows: TodayRow[], onRead: (next: any, planId: string) => void, onListen: (next: any, planId: string) => void,
 *   onOpenPlans: () => void, markAsReadEnabled?: boolean }} props
 */
export function TodayCard({ rows, onRead, onListen, onOpenPlans, markAsReadEnabled }) {
  if (!rows || !rows.length) return null;
  const behind = rows.reduce((n, r) => n + (r.behind || 0), 0);
  const foot = (
    <>
      {behind > 0 ? (
        <button type="button" className="today-link" onClick={onOpenPlans}>{behind + (behind === 1 ? ' day' : ' days') + ' to catch up'}</button>
      ) : null}
      {markAsReadEnabled === false ? (
        <p className="today-note">Mark as read is off, so days don’t tick. Turn it on in Settings.</p>
      ) : null}
    </>
  );

  if (rows.length === 1) {
    const r = rows[0];
    const ready = !r.loading && !!r.next;
    return (
      <section className="today-card" aria-label="Today’s reading">
        <div className="today-head">
          <span className="today-eyebrow">{r.loading ? 'Today' : 'Today · Day ' + (r.day + 1) + ' of ' + r.totalDays}</span>
          <button type="button" className="today-plans-link" onClick={onOpenPlans}>Plans</button>
        </div>
        <div className="today-one">
          <div className="today-one-text">
            <h2 className="today-title">{portionOf(r)}</h2>
            <span className="today-plan">{r.name}</span>
          </div>
          {ready ? (
            <div className="today-actions">
              <button type="button" className="today-btn" aria-label={'Read ' + r.label} onClick={() => onRead(r.next, r.id)}>Read</button>
              <button type="button" className="today-btn" aria-label={'Listen to ' + r.label} onClick={() => onListen(r.next, r.id)}>Listen</button>
            </div>
          ) : null}
        </div>
        {!r.loading ? (
          <div className="today-progress-row">
            <span className="today-progress" aria-hidden="true"><span style={{ width: Math.max(0, Math.min(100, r.percent)) + '%' }} /></span>
            <span className="today-percent">{r.percent + ' %'}</span>
          </div>
        ) : null}
        {foot}
      </section>
    );
  }

  const first = rows.find((r) => !r.loading && !r.done && r.next) || rows.find((r) => !r.loading && r.next);
  return (
    <section className="today-card" aria-label="Today’s reading">
      <div className="today-head">
        <span className="today-eyebrow">Today</span>
        <button type="button" className="today-plans-link" onClick={onOpenPlans}>Plans</button>
      </div>
      <ul className="today-rows">
        {rows.map((r) => (
          <li key={r.id} className="today-row">
            <button type="button" className="today-row-btn" disabled={r.loading || !r.next}
              aria-label={'Read ' + portionOf(r) + ', ' + r.name + (r.done ? ', done' : '')}
              onClick={() => { if (r.next) onRead(r.next, r.id); }}>
              <Check done={r.done} />
              <span className="today-row-text">
                <span className="today-row-title">{portionOf(r)}</span>
                <span className="today-plan">{r.name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {first ? (
        <button type="button" className="today-btn today-btn-wide" onClick={() => onListen(first.next, first.id)}>Listen to today</button>
      ) : null}
      {foot}
    </section>
  );
}

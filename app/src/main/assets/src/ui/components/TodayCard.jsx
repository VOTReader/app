/* ═══════════════════════════════════════════════════════════════════════
   TodayCard — Home's "up next" card (rp1; slimmed by the layout pass 2026-11-10)
   ═══════════════════════════════════════════════════════════════════════
   One slim row per running plan (two at most), then the Continue row Home
   passes in as children, all in one card (the hub's mock read.png). A plan
   row: the eyebrow "Today · Day 47 of 365" (the plan's name instead of
   "Today" when two run), the portion, a solid Read pill and a Listen pill
   that says how long today's portion plays ("12 min") once the lengths are
   known. Each state is ONE row (plans2, P2-plans-design.md 3.9):
     - no plan, offer not dismissed: "Start a reading plan ›" and a small ×
     - done today: "Done today · tomorrow Genesis 37-39" and Read ahead
     - not started: "Starts tomorrow" (or the date), no buttons
     - a plan just finished: "You finished Bible in a Year ›" until its page
       is opened or the row dismissed (never dropped silently)
     - 2235: the row's eyebrow carries the plan's one status (planStatus, the
       same words as the Plans list and the plan page): "On track · Day 47 of
       365", or "3 days behind · finishes Nov 14 ›", a tap that opens the plan
       page on Catch up. Its height is the same in every state.
     - a paused plan is one quiet line, "Bible in a Year · Paused" and Resume
       (2235), inside the same two-row limit
   A tap on the text opens the plan's own page. Read starts a reading
   session on the portion (screen-routes readPlanRow); Listen plays it.
   ═══════════════════════════════════════════════════════════════════════ */

import { volumeSequence } from '../../data/reading-plans.js';
import { usePlanRuns, runRow, saveRun, startsText } from '../../utils/plan-runs-view.js';
import { runName } from '../../data/plan-catalog.js';
import { finishUnseen, resumeRun } from '../../data/plan-engine.js';
import { useListenMinutes } from './OfflineAudioControls.jsx';

/** The Volumes in site order from the loaded corpus; [] until it is in. */
function volumesNow() {
  const g = /** @type {any} */ (globalThis);
  if (!g.READING_CHAIN || !g.COL_BY_KEY || typeof g.colLetterArr !== 'function' || typeof g.colPreface !== 'function') return [];
  return volumeSequence({ chain: g.READING_CHAIN, colByKey: g.COL_BY_KEY, letters: g.colLetterArr, preface: g.colPreface });
}

/**
 * Today's rows for the plans being followed (ReadingPlanStore, mw18). rp1's
 * settings.readingPlans are moved into the store on the way (usePlanRuns), and
 * `onLegacyMoved` clears them from settings; the date is read again whenever the
 * app comes back to the front, so the card turns over at midnight.
 * @param {any} readingPlans  settings.readingPlans (rp1, moved in once)
 * @param {(bid: string, cid: any) => boolean} isRead
 * @param {(left: any[]) => void} [onLegacyMoved]
 */
export function useTodayRows(readingPlans, isRead, onLegacyMoved) {
  const runs = usePlanRuns({ legacy: readingPlans, isRead, onLegacyMoved });
  const now = useNow();
  // plans2 3.7: a plan finished and not yet seen keeps a row ("You finished ...") until opened or dismissed.
  const store = /** @type {any} */ (globalThis).ReadingPlanStore;
  const done = (store && typeof store.all === 'function' ? store.all() : []).filter(finishUnseen);
  return runs.map((r) => runRow(r, now)).concat(done.map((/** @type {any} */ r) => ({ ...runRow(r, now), finished: true, name: runName(r, null) })));
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

/** The date, read again whenever the app comes back to the front and at local midnight while it stays
    open (the card turns over at midnight). */
export function useNow() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);
  // Re-armed from each new `now`; setHours(24) is the next local midnight, DST included. A timer that
  // wakes early reads the same day and simply re-arms.
  React.useEffect(() => {
    const midnight = new Date(now.getTime());
    midnight.setHours(24, 0, 0, 50);
    const t = setTimeout(() => setNow(new Date()), Math.max(0, midnight.getTime() - Date.now()));
    return () => clearTimeout(t);
  }, [now]);
  return now;
}

/**
 * @typedef {{ id: string, name: string, loading: boolean, label: string, done: boolean, day: number,
 *   totalDays: number, behind: number, finished: boolean, next: any, again?: any, listen?: any[], tomorrow?: string,
 *   todayTicked?: number, todayCount?: number, minutes?: number, minutesLeft?: number, paused?: boolean, notStarted?: boolean, start?: string,
 *   status?: { key: string, text: string, behind: number } }} TodayRow
 */

/** The most plans the card shows; the rest are on the Reading plans screen. */
export const TODAY_MAX_ROWS = 2;

/** What Listen plays: today's portion from the first item not read yet (C5); the next item for an older row. @param {TodayRow} r */
const listenOf = (r) => (Array.isArray(r.listen) && r.listen.length ? r.listen : r.next ? [r.next] : []);

const PLAY_ICON = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z" /></svg>
);

/**
 * A plan's Listen with how long today's portion plays (C5, player brief 3f): "Listen · 14 min" once every recording
 * of it has a known length (the lazy lengths table), plain "Listen" until then. `tracksOf` turns the refs into the
 * tracks Listen will play (screen-routes planTracks); absent, the button is the plain one. `pill` draws Home's
 * up-next pill instead: a play mark and "14 min" (or "Listen" until the length is known).
 * @param {{ refs: any[], tracksOf?: (refs: any[]) => any[], label: string, disabled?: boolean, onListen: () => void, pill?: boolean }} props
 */
export function PlanListen({ refs, tracksOf, label, disabled = false, onListen, pill = false }) {
  const key = (Array.isArray(refs) ? refs : []).map((r) => (r ? r.bid + ':' + r.cid : '')).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the refs' text: a new array each render must not rebuild
  const tracks = React.useMemo(() => (tracksOf && key ? tracksOf(refs) || [] : []), [key, tracksOf]);
  const minutes = useListenMinutes(tracks, true);
  const name = label + (minutes ? ', about ' + minutes + ' min' : '');
  if (pill) {
    return (
      <button type="button" className="upnext-pill" aria-label={name} disabled={disabled} onClick={onListen}>
        {PLAY_ICON}<span aria-hidden="true">{minutes ? minutes + ' min' : 'Listen'}</span>
      </button>
    );
  }
  return (
    <button type="button" className="ui-btn" aria-label={name} disabled={disabled} onClick={onListen}>
      {minutes ? 'Listen · ' + minutes + ' min' : 'Listen'}
    </button>
  );
}

/**
 * One plan's row. A tap on its text opens the plan's own page.
 * @param {{ r: TodayRow, many: boolean, onRead: (next: any, planId: string) => void, onListen: (items: any[], planId: string) => void,
 *   onOpenPlan?: (planId: string, opt?: { catchUp?: boolean }) => void, onOpenPlans: () => void, tracksOf?: (refs: any[]) => any[], now: Date }} props
 */
function PlanRow({ r, many, onRead, onListen, onOpenPlan, onOpenPlans, tracksOf, now }) {
  const open = () => (onOpenPlan ? onOpenPlan(r.id) : onOpenPlans());
  if (r.paused && !r.finished) {
    // 2235: a paused plan is one quiet line and the one way back.
    return (
      <div className="upnext-row upnext-paused" data-plan={r.id}>
        <button type="button" className="upnext-go upnext-paused-open" onClick={open} aria-label={'Open ' + r.name + ': paused'}>
          <span className="upnext-paused-text">{r.name}<span className="upnext-paused-tag"> · Paused</span></span>
        </button>
        <button type="button" className="upnext-textlink" aria-label={'Resume ' + r.name} onClick={() => {
          const store = /** @type {any} */ (globalThis).ReadingPlanStore;
          const run = store && typeof store.get === 'function' ? store.get(r.id) : null;
          if (run) saveRun(resumeRun(run, new Date()));
        }}>Resume</button>
      </div>
    );
  }
  if (r.finished) {
    return (
      <div className="upnext-row upnext-offer upnext-plan" data-plan={r.id}>
        <button type="button" className="upnext-go" onClick={open}>
          <span className="upnext-text"><span className="upnext-title">{'You finished ' + r.name}</span></span>
          <span className="upnext-chev" aria-hidden="true">›</span>
        </button>
        <button type="button" className="upnext-x" aria-label="Dismiss" title="Dismiss" onClick={() => {
          const store = /** @type {any} */ (globalThis).ReadingPlanStore;
          const run = store && typeof store.get === 'function' ? store.get(r.id) : null;
          if (run) saveRun({ ...run, seen: true });
        }}>×</button>
      </div>
    );
  }
  const dayText = r.loading || r.notStarted ? '' : 'Day ' + (r.day + 1) + ' of ' + r.totalDays;
  // 2235: the plan's one status, in the words every plan surface uses; behind is the way to Catch up.
  const st = r.status || { key: '', text: '', behind: 0 };
  const behind = !r.loading && st.key === 'behind';
  const eyebrow = behind ? [many ? r.name : '', st.text].filter(Boolean).join(' · ')
    : [many ? r.name : (st.key === 'ontrack' ? 'On track' : 'Today'), many && st.key === 'ontrack' ? 'On track' : dayText].filter(Boolean).join(' · ');
  const doneToday = !r.loading && r.done;
  const ready = !r.loading && !r.done && !r.notStarted && !!r.next;
  const title = r.loading ? 'Loading the Volumes…' : r.notStarted ? startsText(r.start || '', now)
    : doneToday ? 'Done today' + (r.tomorrow ? ' · tomorrow ' + r.tomorrow : '') : r.label;
  return (
    <div className="upnext-row upnext-plan" data-plan={r.id}>
      {behind && onOpenPlan ? (
        <button type="button" className="upnext-eyebrow upnext-status-btn" onClick={() => onOpenPlan(r.id, { catchUp: true })}
          aria-label={(many ? r.name + ': ' : '') + st.text + '. Catch up'}>{eyebrow}<span aria-hidden="true"> ›</span></button>
      ) : <span className="upnext-eyebrow">{eyebrow}</span>}
      {r.loading ? (
        <div className="upnext-text"><span className="upnext-title">{title}</span></div>
      ) : (
        <button type="button" className="upnext-text upnext-open" onClick={open} aria-label={'Open ' + r.name + ': ' + title}>
          <span className="upnext-title">{title}</span>
          {ready && (r.minutesLeft || r.minutes) ? <span className="upnext-sub">{(r.minutesLeft || r.minutes) + ' min left'}</span> : null}
        </button>
      )}
      {ready ? (
        <div className="upnext-actions">
          <button type="button" className="upnext-pill upnext-pill-solid" aria-label={'Read ' + r.label} onClick={() => onRead(r.next, r.id)}>Read</button>
          <PlanListen pill refs={listenOf(r)} tracksOf={tracksOf} label={'Listen to ' + r.label} onListen={() => onListen(listenOf(r), r.id)} />
        </div>
      ) : null}
      {doneToday && r.next ? (
        <button type="button" className="upnext-textlink" onClick={() => onRead(r.next, r.id)}>Read ahead</button>
      ) : null}
    </div>
  );
}

/**
 * Home's up-next card: a row per running plan (at most TODAY_MAX_ROWS), or the offer to start one, then `children`
 * (Home's Continue row) as the last row. Draws nothing when it would be empty.
 * A paused plan is one line with Resume (2235); more than TODAY_MAX_ROWS plans end in "+N more", which opens Reading plans.
 * @param {{ rows: TodayRow[], onRead: (next: any, planId: string) => void, onListen: (items: any[], planId: string) => void,
 *   onOpenPlans: () => void, onOpenPlan?: (planId: string, opt?: { catchUp?: boolean }) => void, markAsReadEnabled?: boolean, onEnableMarkAsRead?: () => void,
 *   offerStart?: boolean, onHideOffer?: () => void, tracksOf?: (refs: any[]) => any[], children?: any }} props
 *   markAsReadEnabled / onEnableMarkAsRead: no longer drawn (plans2: a plan's reads count with Mark as read off)
 */
export function TodayCard({ rows, onRead, onListen, onOpenPlans, onOpenPlan, offerStart, onHideOffer, tracksOf, children }) {
  const now = useNow();
  // Running plans first, then paused ones (one line each, 2235), then a finish not yet seen.
  const all = rows || [];
  const live = all.filter((r) => !r.paused && !r.finished).concat(all.filter((r) => r.paused && !r.finished), all.filter((r) => r.finished));
  const shown = live.slice(0, TODAY_MAX_ROWS);
  const more = live.length - shown.length;
  const full = shown.filter((r) => !(r.paused && !r.finished)).length;
  const offer = !shown.length && !!offerStart;
  if (!shown.length && !offer && !children) return null;
  return (
    <section className="upnext" aria-label="Up next">
      {shown.map((r) => (
        <PlanRow key={r.id} r={r} many={full > 1} onRead={onRead} onListen={onListen} onOpenPlans={onOpenPlans}
          onOpenPlan={onOpenPlan} tracksOf={tracksOf} now={now} />
      ))}
      {more > 0 ? <button type="button" className="upnext-textlink upnext-more" onClick={onOpenPlans}>{'+' + more + ' more'}</button> : null}
      {offer ? (
        <div className="upnext-row upnext-offer">
          <button type="button" className="upnext-go" onClick={onOpenPlans}>
            <span className="upnext-text"><span className="upnext-title">Start a reading plan</span></span>
            <span className="upnext-chev" aria-hidden="true">›</span>
          </button>
          {onHideOffer ? <button type="button" className="upnext-x" aria-label="Not now" title="Not now" onClick={onHideOffer}>×</button> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

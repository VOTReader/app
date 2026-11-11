/* ═══════════════════════════════════════════════════════════════════════
   TodayCard — Home's "up next" card (rp1; slimmed by the layout pass 2026-11-10)
   ═══════════════════════════════════════════════════════════════════════
   One slim row per running plan (two at most), then the Continue row Home
   passes in as children, all in one card (the hub's mock read.png). A plan
   row: the eyebrow "Today · Day 47 of 365" (the plan's name instead of
   "Today" when two run), the portion, a solid Read pill and a Listen pill
   that says how long today's portion plays ("12 min") once the lengths are
   known. Each state is ONE row:
     - no plan, offer not dismissed: "Start a reading plan ›" and a small ×
     - done today: "Today's reading is done" and a "Read ahead" link
     - behind: the portion row with a small "3 days to catch up" line
     - Mark as read off: a small "Turn on Mark as read to track this" link
   Nothing scores the reader: no streaks. Plans themselves live in the
   Library; the card has no "Plans" link. Read and Listen start at the first
   chapter or letter of today not read yet; what they open is the caller's
   (screen-routes).
   ═══════════════════════════════════════════════════════════════════════ */

import { volumeSequence } from '../../data/reading-plans.js';
import { usePlanRuns, runRow } from '../../utils/plan-runs-view.js';
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
  return runs.map((r) => runRow(r, now));
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
 *   todayTicked?: number, todayCount?: number, minutes?: number }} TodayRow
 */

/** The most plans the card shows; the rest are on the Reading plans screen. */
export const TODAY_MAX_ROWS = 2;

/** @param {TodayRow} r */
const portionOf = (r) => (r.loading ? 'Loading the Volumes…' : r.finished ? 'Plan complete' : r.label);

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
  const minutes = useListenMinutes(tracks);
  const name = label + (minutes ? ', about ' + minutes + ' min' : '');
  if (pill) {
    return (
      <button type="button" className="upnext-pill" aria-label={name} disabled={disabled} onClick={onListen}>
        {PLAY_ICON}<span aria-hidden="true">{minutes ? minutes + ' min' : 'Listen'}</span>
      </button>
    );
  }
  return (
    <button type="button" className="today-btn" aria-label={name} disabled={disabled} onClick={onListen}>
      {minutes ? 'Listen · ' + minutes + ' min' : 'Listen'}
    </button>
  );
}

/**
 * One plan's row.
 * @param {{ r: TodayRow, many: boolean, onRead: (next: any, planId: string) => void, onListen: (items: any[], planId: string) => void,
 *   onOpenPlans: () => void, markAsReadEnabled?: boolean, onEnableMarkAsRead?: () => void, tracksOf?: (refs: any[]) => any[] }} props
 */
function PlanRow({ r, many, onRead, onListen, onOpenPlans, markAsReadEnabled, onEnableMarkAsRead, tracksOf }) {
  const dayText = r.loading || r.finished ? '' : 'Day ' + (r.day + 1) + ' of ' + r.totalDays;
  const eyebrow = [many ? r.name : 'Today', dayText].filter(Boolean).join(' · ');
  const doneToday = !r.loading && r.done && !r.finished;
  const ready = !r.loading && !r.finished && !r.done && !!r.next;
  let sub = null;
  if (!r.loading && !r.finished) {
    if (markAsReadEnabled === false) {
      sub = onEnableMarkAsRead
        ? <button type="button" className="upnext-sub" onClick={onEnableMarkAsRead}>Turn on Mark as read to track this</button>
        : <span className="upnext-sub">Turn on Mark as read in Settings to track this</span>;
    } else if (r.behind > 0) {
      sub = <button type="button" className="upnext-sub" onClick={onOpenPlans}>{r.behind + (r.behind === 1 ? ' day' : ' days') + ' to catch up'}</button>;
    }
  }
  return (
    <div className="upnext-row" data-plan={r.id}>
      <div className="upnext-text">
        <span className="upnext-eyebrow">{eyebrow}</span>
        <span className="upnext-title">{doneToday ? 'Today’s reading is done' : portionOf(r)}</span>
        {sub}
      </div>
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
 * @param {{ rows: TodayRow[], onRead: (next: any, planId: string) => void, onListen: (items: any[], planId: string) => void,
 *   onOpenPlans: () => void, markAsReadEnabled?: boolean, onEnableMarkAsRead?: () => void,
 *   offerStart?: boolean, onHideOffer?: () => void, tracksOf?: (refs: any[]) => any[], children?: any }} props
 */
export function TodayCard({ rows, onRead, onListen, onOpenPlans, markAsReadEnabled, onEnableMarkAsRead, offerStart, onHideOffer, tracksOf, children }) {
  const shown = (rows || []).slice(0, TODAY_MAX_ROWS);
  const offer = !shown.length && !!offerStart;
  if (!shown.length && !offer && !children) return null;
  return (
    <section className="upnext" aria-label="Up next">
      {shown.map((r) => (
        <PlanRow key={r.id} r={r} many={shown.length > 1} onRead={onRead} onListen={onListen} onOpenPlans={onOpenPlans}
          markAsReadEnabled={markAsReadEnabled} onEnableMarkAsRead={onEnableMarkAsRead} tracksOf={tracksOf} />
      ))}
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

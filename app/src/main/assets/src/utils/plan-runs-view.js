/* ═══════════════════════════════════════════════════════════════════════
   plan-runs-view — what Home and the Plans screen read from the plan runs
   ═══════════════════════════════════════════════════════════════════════
   mw18: the plans moved from settings.readingPlans into ReadingPlanStore
   (stores/reading-plan-store.js), one record per run, with the flexible
   engine (data/plan-engine.js). This turns runs into the rows the Today card
   and the Plans screen draw, and moves rp1's settings plans in once.

   ReadingPlanStore is reached as a window global (bundle-b publishes it;
   this file is bundle-d), so it is read at call time, never imported.
   ═══════════════════════════════════════════════════════════════════════ */

import { runStatus, dayItems, itemsLabel, itemsWords, minutesFor, todayKey } from '../data/plan-engine.js';
import { bookTitle, runName, migrateRp1 } from '../data/plan-catalog.js';
import { countItemWords } from './word-count.js';
import { supported as reminderSupported, syncPlanReminders, onReminderOpen } from './plan-reminder.js';

/** @typedef {import('../data/plan-engine.js').PlanRun} PlanRun */
/** @typedef {import('../data/plan-catalog.js').LetterSource} LetterSource */

/** The store, or null where bundle-b has not published it. */
const _store = () => { const s = /** @type {any} */ (globalThis).ReadingPlanStore; return s && typeof s.all === 'function' ? s : null; };

/** The loaded Volumes as a LetterSource, or null until they are in. @returns {LetterSource | null} */
export function letterSource() {
  const g = /** @type {any} */ (globalThis);
  const c = g.__votCorpus;
  if (c && c.loaded === false) return null;
  if (!g.COL_BY_KEY || typeof g.colLetterArr !== 'function' || typeof g.colPreface !== 'function') return null;
  if (!g.READING_CHAIN) return null;
  return { colByKey: g.COL_BY_KEY, letters: g.colLetterArr, preface: g.colPreface, words: countItemWords };
}

/** '<bid>:<cid>' as the read record's { bid, cid } (a numeric chapter as a number). @param {string} k */
export function itemRef(k) {
  const i = k.lastIndexOf(':');
  const cid = k.slice(i + 1);
  return { bid: k.slice(0, i), cid: /^\d+$/.test(cid) ? Number(cid) : cid };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'YYYY-MM-DD' as "Oct 21, 2027". @param {string} key */
export function shortDate(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  return m ? MONTHS[Number(m[2]) - 1] + ' ' + Number(m[3]) + ', ' + m[1] : '';
}

/** One of today's items as its check: a chapter's number, a letter's title. @param {import('../data/plan-engine.js').PlanItem} it */
const itemShort = (it) => (it.t ? it.t : it.k.slice(it.k.lastIndexOf(':') + 1));

/** What the items are, counted: "chapters", "letters" or "chapters and letters". @param {PlanRun} run */
function unitOf(run) {
  let ch = false, le = false;
  for (const tr of run.tracks) for (const it of tr.items) { if (it.t) le = true; else ch = true; if (ch && le) return 'chapters and letters'; }
  return le ? 'letters' : 'chapters';
}

/**
 * A run's row for the Today card and the Plans screen.
 * @param {PlanRun} run @param {Date} now
 */
export function runRow(run, now) {
  const st = runStatus(run, now);
  const ticks = run.ticks || {};
  const today = st.todayItems;
  const prev = st.day > 0 ? dayItems(run, st.day - 1) : [];
  const shown = st.doneToday ? prev : today;
  const nextItem = today.find((it) => !(it.k in ticks)) || today[0] || null;
  const from = nextItem ? today.indexOf(nextItem) : 0;
  const words = itemsWords(today);
  // C10: counts, never a percentage rounded down; the finish is the honest one (behind moves it).
  const fmt = (/** @type {number} */ n) => n.toLocaleString('en-US');
  const pace = st.finished ? '' : st.behind > 0 ? st.behind + (st.behind === 1 ? ' day' : ' days') + ' behind · new finish ' + shortDate(st.projected)
    : st.ahead > 0 ? st.ahead + (st.ahead === 1 ? ' day' : ' days') + ' ahead · finish ' + shortDate(st.projected)
      : 'on pace to finish ' + shortDate(st.projected);
  return {
    id: run.id, plan: run.plan, name: runName(run, null), loading: false,
    label: st.finished ? '' : itemsLabel(shown, bookTitle),
    tomorrow: st.doneToday ? itemsLabel(today, bookTitle) : '',
    done: st.doneToday, day: st.doneToday ? st.day - 1 : st.day, totalDays: st.total,
    percent: st.total ? Math.floor(st.doneDays * 100 / st.total) : 0,
    behind: st.behind, ahead: st.ahead, finished: st.finished, paused: st.paused,
    next: nextItem ? itemRef(nextItem.k) : null,
    // Read again: the day just finished, from its start.
    again: st.doneToday && prev.length ? itemRef(prev[0].k) : null,
    // Listen: today's portion from the first item not read yet, and no further (C5).
    listen: today.slice(from).map((it) => itemRef(it.k)),
    items: shown.map((it) => ({ k: it.k, short: itemShort(it), label: itemsLabel([it], bookTitle), done: it.k in ticks })),
    todayTicked: st.todayTicked, todayCount: today.length, minutes: words ? minutesFor(words) : 0,
    itemsDone: st.itemsDone, itemsTotal: st.itemsTotal, projected: st.projected, target: st.target,
    counts: fmt(st.itemsDone) + ' of ' + fmt(st.itemsTotal) + ' ' + unitOf(run), pace,
  };
}

/**
 * The runs being followed, re-read whenever the store changes; rp1's settings plans are moved in once
 * (the Volumes plan when the Volumes have loaded) and `onLegacyMoved` clears them from settings.
 * @param {{ legacy?: any, isRead?: (bid: string, cid: any) => boolean, onLegacyMoved?: (left: any[]) => void }} [opt]
 * @returns {PlanRun[]}
 */
export function usePlanRuns(opt = {}) {
  const store = _store();
  const version = React.useSyncExternalStore(
    React.useCallback((cb) => (store ? store.subscribe(cb) : () => {}), [store]),
    () => (store ? store.getVersion() : 0),
  );
  const corpusVersion = React.useSyncExternalStore(
    React.useCallback((cb) => { const c = /** @type {any} */ (window).__votCorpus; return c ? c.subscribe(cb) : () => {}; }, []),
    () => { const c = /** @type {any} */ (window).__votCorpus; return c ? c.getVersion() : 0; },
  );
  const { legacy, isRead, onLegacyMoved } = opt;
  const legacyList = Array.isArray(legacy) ? legacy : [];
  const wantsVolumes = legacyList.some((p) => p && p.id === 'volumes');
  React.useEffect(() => {
    const load = /** @type {any} */ (window).__loadVotCorpus;
    if (wantsVolumes && typeof load === 'function') void load();
  }, [wantsVolumes]);
  React.useEffect(() => {
    if (!store || !legacyList.length || typeof isRead !== 'function') return;
    if (typeof store.getState === 'function' && store.getState() !== 'loaded') return;
    const moved = migrateRp1(legacyList, isRead, letterSource(), store.all(), new Date());
    for (const r of moved) store.put(r);
    const has = (/** @type {any} */ p) => store.all().some((r) => r.plan === p.id && r.start === p.start);
    const left = legacyList.filter((p) => p && (p.id === 'bible-year' || p.id === 'volumes') && !has(p));
    if (left.length === legacyList.length || typeof onLegacyMoved !== 'function') return;
    // Settings let go of the old plans only once the runs are on disk: a failed save keeps them to move next time.
    const saved = typeof store.whenSaved === 'function' ? store.whenSaved() : Promise.resolve(true);
    void saved.then((ok) => { if (ok) onLegacyMoved(left); }, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version / corpusVersion are the triggers: a store load or the Volumes landing lets the move run
  }, [store, version, corpusVersion, legacyList.length]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the trigger: the store's array is read at call time
  return React.useMemo(() => (store ? store.active() : []), [store, version]);
}

/** Save a changed run. @param {PlanRun} run */
export function saveRun(run) { const s = _store(); if (s) s.put(run); }

/** Stop a run: it stays on the device, stopped (finished runs are the archive; stopped ones are not shown). */
export function stopRun(run, now) { saveRun({ ...run, status: 'stopped', updated: now.getTime(), stopped: todayKey(now) }); }

/* rp-s1: a tapped reminder asks the Plans screen to open that plan's details. The ask waits here until the
   screen takes it (a cold start reaches the screen after the tap), and a screen already showing hears it. */
let _openAsk = /** @type {string | null} */ (null);
const _openSubs = new Set();
/** @param {string} id */
export function askPlanOpen(id) { _openAsk = id; for (const f of _openSubs) f(id); }
/** The plan a reminder asked to open, once. @returns {string | null} */
export function takePlanOpen() { const id = _openAsk; _openAsk = null; return id; }
/** @param {(id: string) => void} f @returns {() => void} */
export function onPlanOpenAsk(f) { _openSubs.add(f); return () => { _openSubs.delete(f); }; }

/**
 * rp-s1, mounted once at the app: hands the native reminder the runs on every store change and at boot (a stop,
 * pause or Clear All drops a reminder because the run is no longer running), and opens the plan a tapped reminder
 * names. A no-op on the web. @param {() => void} openPlans
 */
export function usePlanReminders(openPlans) {
  const store = _store();
  const version = React.useSyncExternalStore(
    React.useCallback((cb) => (store ? store.subscribe(cb) : () => {}), [store]),
    () => (store ? store.getVersion() : 0),
  );
  React.useEffect(() => {
    if (!store || !reminderSupported()) return;
    // Before the store has loaded its runs are not known yet: an empty list now would cancel every reminder.
    if (typeof store.getState === 'function' && store.getState() !== 'loaded') return;
    const src = letterSource();
    syncPlanReminders(store.all(), { nameOf: (r) => runName(r, src) });
  }, [store, version]);
  const openRef = React.useRef(openPlans);
  React.useEffect(() => { openRef.current = openPlans; });
  React.useEffect(() => onReminderOpen((id) => { askPlanOpen(id); openRef.current(); }), []);
}

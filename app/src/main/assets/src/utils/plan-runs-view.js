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
  const words = itemsWords(today);
  return {
    id: run.id, plan: run.plan, name: runName(run, null), loading: false,
    label: st.finished ? '' : itemsLabel(shown, bookTitle),
    tomorrow: st.doneToday ? itemsLabel(today, bookTitle) : '',
    done: st.doneToday, day: st.doneToday ? st.day - 1 : st.day, totalDays: st.total,
    // The old line read floor(percent) (0 % for days); landing 1 shows counts instead (C10).
    percent: st.total ? Math.floor(st.doneDays * 100 / st.total) : 0,
    behind: st.behind, finished: st.finished, paused: st.paused,
    next: nextItem ? itemRef(nextItem.k) : null,
    todayTicked: st.todayTicked, todayCount: today.length, minutes: words ? minutesFor(words) : 0,
    itemsDone: st.itemsDone, itemsTotal: st.itemsTotal, projected: st.projected, target: st.target,
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
    if (left.length !== legacyList.length && typeof onLegacyMoved === 'function') onLegacyMoved(left);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version / corpusVersion are the triggers: a store load or the Volumes landing lets the move run
  }, [store, version, corpusVersion, legacyList.length]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the trigger: the store's array is read at call time
  return React.useMemo(() => (store ? store.active() : []), [store, version]);
}

/** Save a changed run. @param {PlanRun} run */
export function saveRun(run) { const s = _store(); if (s) s.put(run); }

/** Stop a run: it stays on the device, stopped (finished runs are the archive; stopped ones are not shown). */
export function stopRun(run, now) { saveRun({ ...run, status: 'stopped', updated: now.getTime(), stopped: todayKey(now) }); }

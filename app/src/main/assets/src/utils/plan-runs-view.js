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

import { runStatus, dayNum, dayItems, itemsLabel, itemsWords, minutesFor, todayKey, resumeRun, newRun, againPace, replaceContents, freshFromDated } from '../data/plan-engine.js';
import { bookTitle, runName, migrateRp1 } from '../data/plan-catalog.js';
import { countItemWords } from './word-count.js';
import { supported as reminderSupported, syncPlanReminders, onReminderOpen } from './plan-reminder.js';
import { openPlanNav } from './plan-nav.js';

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

/** What the items are, counted: "chapters", "letters" or "chapters and letters"; singular for one. @param {PlanRun} run */
export function unitOf(run) {
  let ch = false, le = false, n = 0;
  for (const tr of run.tracks) for (const it of tr.items) { n++; if (it.t) le = true; else ch = true; }
  if (ch && le) return 'chapters and letters';
  return le ? (n === 1 ? 'letter' : 'letters') : (n === 1 ? 'chapter' : 'chapters');
}

/** "1 day", "4 days". @param {number} n */
export const daysWord = (n) => n.toLocaleString('en-US') + (n === 1 ? ' day' : ' days');

/**
 * A finished plan's reading as its reader lived it: from its first dated read (or its start, when that came first)
 * to the finish, at least one day. A plan read through before a later start date began on its first read, never on a
 * start it did not reach (My Progress read "Started Nov 29 · finished Nov 26"). Stored dates are left as they are.
 * @param {{ start?: string, finished?: string, ticks?: Record<string, string> }} r
 * @returns {{ from: string, days: number }}
 */
export function readSpan(r) {
  let from = r.start || '';
  for (const v of Object.values(r.ticks || {})) if (typeof v === 'string' && dayNum(v) != null && (!from || v < from)) from = v;
  if (r.finished && from > r.finished) from = r.finished;
  const a = dayNum(from), b = dayNum(r.finished || '');
  return { from, days: a != null && b != null ? Math.max(1, b - a + 1) : 0 };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** 'YYYY-MM-DD' as "Nov 14", with the year when it is not `now`'s ("Nov 10, 2027"). @param {string} key @param {Date} now */
export function finishDate(key, now) {
  const full = shortDate(key);
  return full.endsWith(', ' + now.getFullYear()) ? full.slice(0, -6) : full;
}

/** 'YYYY-MM-DD' as "Sat Nov 28" (with the year when it is not `now`'s). @param {string} key @param {Date} now */
export function weekdayDate(key, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return WEEKDAYS[d.getUTCDay()] + ' ' + finishDate(key, now);
}

/** "Starts tomorrow" or "Starts Fri Nov 20". @param {string} start @param {Date} now */
export function startsText(start, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start || '');
  if (!m) return 'Starts soon';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const t = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (d.getTime() === t.getTime()) return 'Starts tomorrow';
  return 'Starts ' + WEEKDAYS[d.getUTCDay()] + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

/**
 * THE one status of a plan, in the same words on Home's card, the Plans list and the plan's own page (task 2235,
 * Corbin 11-16: "intuitive and easy to understand at a glance"). One phrase, kind and plain: a paused plan or one not
 * started is never behind, and nothing is red.
 * - behind: READING days of schedule slip (runStatus.behind), never calendar lateness: a Mon-Fri plan that missed a
 *   Friday is "1 day behind" though its finish moves three calendar days (the finish date carries that). It shrinks
 *   as the reader catches up and goes once Catch up keeps the daily amount or finishes on time; the dates that went
 *   unread stay on the week strip and in the month (streak / monthCells), as history.
 * @param {PlanRun} run @param {Date} now @param {ReturnType<typeof runStatus>} [st]
 * @returns {{ key: 'stopped' | 'finished' | 'paused' | 'starts' | 'behind' | 'done' | 'ontrack', text: string, behind: number }}
 */
export function planStatus(run, now, st = runStatus(run, now)) {
  if (run.status === 'stopped') return { key: 'stopped', text: run.stopped ? 'Stopped ' + finishDate(run.stopped, now) : 'Stopped', behind: 0 };
  if (st.finished) return { key: 'finished', text: 'Finished', behind: 0 };
  if (st.paused) return { key: 'paused', text: 'Paused', behind: 0 };
  // 0130: a plan not started says so, then when it starts ("Not started · starts Sat Nov 21").
  if (st.notStarted) { const s = startsText(run.start, now); return { key: 'starts', text: 'Not started · ' + s.charAt(0).toLowerCase() + s.slice(1), behind: 0 }; }
  if (st.behind > 0) return { key: 'behind', text: daysWord(st.behind) + ' behind · finishes ' + finishDate(st.projected, now), behind: st.behind };
  if (st.doneToday) return { key: 'done', text: 'Done today', behind: 0 };
  return { key: 'ontrack', text: 'On track', behind: 0 };
}

/**
 * A run's row for the Today card and the Plans screen.
 * @param {PlanRun} run @param {Date} now
 */
export function runRow(run, now) {
  const st = runStatus(run, now);
  const ticks = run.ticks || {};
  const today = st.todayItems;
  // The day just read: the last day with readings (a spread-out plan's empty days are never "read").
  const prev = st.lastDay >= 0 ? dayItems(run, st.lastDay) : [];
  const shown = st.doneToday ? prev : today;
  const nextItem = today.find((it) => !(it.k in ticks)) || today[0] || null;
  const from = nextItem ? today.indexOf(nextItem) : 0;
  const words = itemsWords(today);
  // C10: counts; the finish is the honest one. plans2: one phrase when it moved, "N days later than planned"
  // (never behind, missed or catch up), and a paused plan or one not started is never late.
  const fmt = (/** @type {number} */ n) => n.toLocaleString('en-US');
  const pace = st.finished ? '' : 'Finishes ' + finishDate(st.projected, now) + (st.late > 0 ? ' · ' + daysWord(st.late) + ' later than planned' : '');
  return {
    id: run.id, plan: run.plan, name: runName(run, null), loading: false,
    label: st.finished ? '' : itemsLabel(shown, bookTitle),
    tomorrow: st.doneToday ? itemsLabel(today, bookTitle) : '',
    // When the next reading is not tomorrow (a spread-out plan's empty days lie between): its day, "Sat Nov 28".
    nextWhen: st.spreadOn ? weekdayDate(st.spreadOn, now) : '',
    // An empty day of a spread-out plan, nothing read today: no reading is due until nextWhen.
    rest: !st.doneToday && !!st.spreadOn,
    // day: the plan's own day today ("Day N of M"; a spread-out plan's empty day is its own day); itemsDay: the day
    // `items` belong to (on an empty day, the next reading's), for the reading ribbon.
    done: st.doneToday, day: st.todayDay, itemsDay: st.doneToday ? st.lastDay : st.day, totalDays: st.total,
    percent: st.percent,
    behind: st.behind, ahead: st.ahead, late: st.late, finished: st.finished, paused: st.paused, notStarted: st.notStarted, start: run.start,
    next: nextItem ? itemRef(nextItem.k) : null,
    // Read again: the day just finished, from its start.
    again: st.doneToday && prev.length ? itemRef(prev[0].k) : null,
    // Listen: today's portion from the first item not read yet, and no further (C5).
    listen: today.slice(from).map((it) => itemRef(it.k)),
    items: shown.map((it) => ({ k: it.k, short: itemShort(it), label: itemsLabel([it], bookTitle), done: it.k in ticks })),
    todayTicked: st.todayTicked, todayCount: today.length, minutes: words ? minutesFor(words) : 0,
    // plans2 3.9: what is left of today's portion, in minutes (the Read tab's "7 min left")
    minutesLeft: (() => { const w = itemsWords(today.filter((it) => !(it.k in ticks))); return w ? minutesFor(w) : 0; })(),
    itemsDone: st.itemsDone, itemsTotal: st.itemsTotal, projected: st.projected, target: st.target,
    counts: fmt(st.itemsDone) + ' of ' + fmt(st.itemsTotal) + ' ' + unitOf(run), pace,
    status: planStatus(run, now, st),
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

/** Stop a run: it stays on the device, stopped, and is listed under Past plans (2235) with Continue and Start over. */
export function stopRun(run, now) { saveRun({ ...run, status: 'stopped', updated: now.getTime(), stopped: todayKey(now) }); }

/**
 * Continue a stopped run where it stopped (2235): the days it was stopped become a pause, so they are neither missed
 * nor behind, and the planned finish moves on by them (resumeRun). @param {PlanRun} run @param {Date} now @returns {PlanRun}
 */
export function continueRun(run, now) {
  const { stopped, ...rest } = run;
  // Stopped while paused (Stop is offered on a paused plan): the pause began first, so it runs from there.
  const from = rest.paused && (!stopped || rest.paused <= stopped) ? rest.paused : (stopped || todayKey(now));
  const asPaused = /** @type {PlanRun} */ ({ ...rest, status: 'paused', paused: from });
  return resumeRun(asPaused, now);
}

/**
 * Start a run over from its first day (2235): a new run of the same plan, pace and days from today; the old one is
 * kept, stopped, under Past plans with its ticks. Returns [old as stopped, new]. @param {PlanRun} run @param {Date} now
 */
export function startOverRun(run, now) {
  const fresh = newRun({ plan: run.plan, name: run.name, tracks: run.tracks, share: run.share, pace: againPace(run), weekdays: run.weekdays }, now);
  if (run.remind) fresh.remind = run.remind;
  if (run.autoAudio === false) fresh.autoAudio = false;
  const old = run.status === 'stopped' ? run : { ...run, status: /** @type {'stopped'} */ ('stopped'), updated: now.getTime(), stopped: todayKey(now) };
  return [old, fresh];
}

/**
 * "Count only this plan's reading" (0450): [the old run as stopped, the new run from today holding its dated ticks]
 * (freshFromDated), or null when the run counts nothing from before it began. @param {PlanRun} run @param {Date} now
 * @returns {null | [PlanRun, PlanRun]}
 */
export function countOwnOnlyRun(run, now) {
  const fresh = freshFromDated(run, now);
  if (!fresh) return null;
  return [{ ...run, status: /** @type {'stopped'} */ ('stopped'), updated: now.getTime(), stopped: todayKey(now) }, fresh];
}

/**
 * Save a custom plan's new contents (2310): null when nothing changed; the run renamed in place when only its name
 * did; else [the old run as stopped, the new run] (replaceContents: the old stays under Past plans with its ticks and
 * day notes, the new carries every tick of an item still in it). @param {PlanRun} run
 * @param {{ plan: string, name?: string, tracks: import('../data/plan-engine.js').PlanTrack[], share?: 'side' | 'serial',
 *   weekdays?: boolean[], pace: import('../data/plan-engine.js').PlanPace }} spec @param {Date} now
 * @returns {null | [PlanRun] | [PlanRun, PlanRun]}
 */
export function editRun(run, spec, now) {
  const fresh = replaceContents(run, spec, now);
  const shape = (/** @type {PlanRun} */ r) => JSON.stringify([r.tracks.map((t) => [t.kind, t.by, t.items.map((it) => it.k)]), r.share, r.pace || null, r.weekdays]);
  if (shape(fresh) === shape(run)) {
    const name = spec.name || run.name;
    return name === run.name ? null : [{ ...run, name, updated: now.getTime() }];
  }
  // stopped as stopRun stops a plan, so Past plans and Continue read it the same way
  return [{ ...run, status: /** @type {'stopped'} */ ('stopped'), updated: now.getTime(), stopped: todayKey(now) }, fresh];
}

/**
 * rp-s1, mounted once at the app: hands the native reminder the runs on every store change and at boot (a stop,
 * pause or Clear All drops a reminder because the run is no longer running), and opens the plan a tapped reminder
 * names (plans2: on that plan's own page). A no-op on the web. @param {() => void} openPlans
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
  React.useEffect(() => onReminderOpen((id) => { openPlanNav([{ v: 'list' }, { v: 'plan', id }]); openRef.current(); }), []);
}

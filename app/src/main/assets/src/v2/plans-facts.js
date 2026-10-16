/* plans-facts.js - what Reading plans (picture 9a-plans) shows (zv1, 2026-10-15).

   Main's plans re-shown, nothing migrated: a plan is vot-state settings.readingPlans ([{ id, start, pace? }], main's
   utils/reading-plan-view.js), a day is done when main's read record says so (readItems 'v1:<bid>:<cid>'), and Start /
   Stop write the same key main's Plans screen writes. Read opens the first chapter or letter of the day not read yet;
   Listen plays from it as main's Today card does (a chapter on through its book, a letter on through its collection),
   and opens it when there is no recording. A gate boot shows the picture's plans and every control is inert.
   dz24 (pictures 9a redrawn, 9h, 9i): each running plan's month (main's monthDays), and Home's Today card (todayView). */
import { readingPlansOf, todayRows, startPlan, stopPlan, planPortion, monthDays, PLAN_NAMES } from '../utils/reading-plan-view.js';
import { BIBLE_CHAPTER_COUNT, volumeSequence } from '../data/reading-plans.js';
import { resolveBibleAudio } from '../utils/audio-track.js';
import { savedSettings, writeSetting } from './settings-pages.js';

const g = /** @type {any} */ (globalThis);

export { PLAN_NAMES, startPlan, stopPlan };

/** The letters-a-day choices main offers for the Volumes. */
export const PACES = [1, 2, 3];

/** The plans there are, in the order the page offers them. */
export const PLAN_IDS = ['bible-year', 'volumes'];

/**
 * @typedef {{ bid: string, cid: string | number }} PlanItem
 * @typedef {{ date: number, state: 'done' | 'missed' | 'today' | 'ahead' | 'none', done: boolean, label: string }} MonthDay
 * @typedef {{ name: string, lead: number, days: MonthDay[] }} MonthView
 * @typedef {{ id: string, name: string, overline: string, title: string, sub: string, percent: number,
 *   next: PlanItem | null, catchUp: PlanItem | null, loading?: boolean, done?: boolean, behind?: number,
 *   month?: MonthView | null }} RunningPlan
 * @typedef {{ id: string, name: string, sub: string, paces: boolean }} PlanOffer
 * @typedef {{ running: RunningPlan[], offers: PlanOffer[] }} PlansView
 * @typedef {{ running: RunningPlan[], first: PlanItem | null, behind: number }} TodayView
 */

/** Main's month words (ReadingPlansScreen). */
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A plan's month as main draws it (monthDays over `now`'s month): the lead blanks before the 1st, then each day's state;
 * the label is main's ("15, today, done").
 * @param {{ id: string, start: string, pace?: number }} plan @param {Date} now
 * @param {(bid: string, cid: any) => boolean} isRead @param {any[]} seq
 * @returns {MonthView}
 */
export function monthView(plan, now, isRead, seq) {
  const ds = monthDays(plan, now, isRead, seq);
  return {
    name: MONTHS[now.getMonth()],
    lead: ds.length ? ds[0].weekday : 0,
    days: ds.map((d) => ({
      date: d.date, state: d.state, done: d.done,
      label: d.date + (d.state === 'none' ? '' : ', ' + (d.state === 'today' ? (d.done ? 'today, done' : 'today') : d.state)),
    })),
  };
}

/** A run as the picture prints it: "Numbers 11-13" -> "Numbers 11–13", "Genesis 50 - Exodus 3" with an en dash. */
export function dashed(label) {
  return String(label || '').replace(/(\d)-(\d)/g, '$1–$2').replace(/ - /g, ' – ');
}

const days = (n) => n + (n === 1 ? ' day' : ' days');

/**
 * The page: the plans running (today's portion, the progress line, Listen / Read / Catch up), then the plans not
 * started (Start; the Volumes with its pace).
 * @param {{ plans: Array<{ id: string, start: string, pace?: number }>, now: Date,
 *   isRead: (bid: string, cid: any) => boolean, seq: any[], pace: number }} input
 * @returns {PlansView}
 */
export function plansView({ plans, now, isRead, seq, pace }) {
  const running = runningPlans(plans, now, isRead, seq);
  const on = new Set(plans.map((p) => p.id));
  const p = Math.max(1, Math.floor(pace) || 1);
  const offers = PLAN_IDS.filter((id) => !on.has(id)).map((id) => (id === 'bible-year'
    ? { id, name: PLAN_NAMES[id], sub: BIBLE_CHAPTER_COUNT.toLocaleString('en-US') + ' chapters · 365 days', paces: false }
    : { id, name: PLAN_NAMES[id], sub: 'Every letter in site order' + (seq.length ? ' · ' + Math.ceil(seq.length / p) + ' days' : ''), paces: true }));
  return { running, offers };
}

/**
 * Home's Today card (main's TodayCard over the same plans): each plan's day as Reading plans shows it; `first` is what
 * Listen to today plays (the first plan not done today, else the first with a portion); `behind` sums the days to catch up.
 * Null when no plan runs: no plan, no card.
 * @param {{ plans: Array<{ id: string, start: string, pace?: number }>, now: Date,
 *   isRead: (bid: string, cid: any) => boolean, seq: any[] }} input
 * @returns {TodayView | null}
 */
export function todayView({ plans, now, isRead, seq }) {
  if (!plans.length) return null;
  const running = runningPlans(plans, now, isRead, seq);
  const first = running.find((r) => !r.loading && !r.done && r.next) || running.find((r) => !r.loading && r.next);
  return { running, first: first ? first.next : null, behind: running.reduce((n, r) => n + (r.behind || 0), 0) };
}

/**
 * Each running plan's day: the overline, portion, sub, progress, Read / Listen's item, Catch up's, and its month.
 * @param {Array<{ id: string, start: string, pace?: number }>} plans @param {Date} now
 * @param {(bid: string, cid: any) => boolean} isRead @param {any[]} seq
 * @returns {RunningPlan[]}
 */
function runningPlans(plans, now, isRead, seq) {
  const rows = todayRows(plans, now, isRead, seq);
  /** @param {any} plan @param {number} day @returns {PlanItem | null} */
  const firstUnread = (plan, day) => {
    const items = planPortion(plan, day, seq).items;
    return items.find((it) => !isRead(it.bid, it.cid)) || items[0] || null;
  };
  return plans.map((plan) => {
    const r = rows.find((x) => x.id === plan.id);
    const name = PLAN_NAMES[plan.id];
    if (!r || r.loading) {
      return { id: plan.id, name, overline: 'Today', title: 'Loading the Volumes…', sub: name, percent: 0, next: null, catchUp: null,
        loading: true, done: false, behind: 0, month: null };
    }
    const overline = 'Today · Day ' + (r.day + 1) + ' of ' + r.totalDays;
    const month = monthView(plan, now, isRead, seq);
    if (r.finished) {
      return { id: plan.id, name, overline, title: 'Plan complete', sub: name, percent: 100, next: null, catchUp: null,
        loading: false, done: r.done, behind: 0, month };
    }
    const behind = r.behind > 0 && r.catchUpDay >= 0;
    return {
      id: plan.id, name, overline, title: dashed(r.label),
      sub: name + (behind ? ' · ' + days(r.behind) + ' to catch up' : r.done ? ' · Done for today' : ''),
      percent: Math.max(0, Math.min(100, r.percent)),
      next: r.next || null,
      catchUp: behind ? firstUnread(plan, r.catchUpDay) : null,
      loading: false, done: r.done, behind: behind ? r.behind : 0, month,
    };
  });
}

/* The pictures' plans (states.json 9a, 9h, 9i), as main would compute them on 2026-10-15: Bible in a Year started
   2026-09-06 (day 40, Numbers 11-13) with every day to Oct 13 read and Oct 14's Numbers 8-10 not; the Volumes (9i), one a
   day from 2026-10-02, read to today (day 14). A gate boot never reads storage: these stand in for settings.readingPlans
   and the read record, and main's own maths draws the rest. */
const GATE_NOW = '2026-10-15T12:00:00';
const GATE_BIBLE = { id: 'bible-year', start: '2026-09-06' };
const GATE_VOLUMES = { id: 'volumes', start: '2026-10-02', pace: 1 };
/** Day indexes read, per plan: Bible days 0-37 (to Oct 13), the Volumes' 0-13 (to today). */
const GATE_READ = { 'bible-year': 38, volumes: 14 };

/** The read record a gate's plans stand for: every item of each plan's first GATE_READ[id] days. */
export function gateIsRead(plans, seq) {
  const read = new Set();
  for (const plan of plans) {
    for (let d = 0; d < (GATE_READ[plan.id] || 0); d++) planPortion(plan, d, seq).items.forEach((it) => read.add(it.bid + ':' + it.cid));
  }
  return (bid, cid) => read.has(bid + ':' + cid);
}

/** A gate's Home plans: 9h one plan, 9i two. @param {number} n */
export function gateToday(n) {
  return { now: GATE_NOW, plans: n > 1 ? [GATE_BIBLE, GATE_VOLUMES] : [GATE_BIBLE] };
}

/** The picture's page (states.json 9a: Bible in a Year on day 40 of 365, Numbers 11-13, a day behind, 10 % done, and
 *  October; the Volumes not started, 2 a day chosen, 730 letters = 365 days: the offer is drawn, as the letters never load
 *  on this gate). */
export function gatePlans() {
  const plans = [GATE_BIBLE];
  return {
    pace: 2,
    view: /** @type {PlansView} */ ({
      running: runningPlans(plans, new Date(GATE_NOW), gateIsRead(plans, []), []),
      offers: [{ id: 'volumes', name: 'The Volumes in Order', sub: 'Every letter in site order · 365 days', paces: true }],
    }),
  };
}

/** The reader's plans (settings.readingPlans), read only: [] before the store loads. */
export function savedPlans(gl = g) {
  return readingPlansOf(savedSettings(gl));
}

/** Keeps the plans where main keeps them; false when the store has not loaded (nothing written). */
export function writePlans(plans, gl = g) {
  return writeSetting('readingPlans', plans, gl);
}

/** Main's read record as a predicate, read once: (bid, cid) -> read. */
export function liveIsRead(gl = g) {
  let items = {};
  try {
    const store = gl.StateStore;
    const s = store && typeof store.isReady === 'function' && store.isReady() ? store.get() : null;
    if (s && s.readItems && typeof s.readItems === 'object') items = s.readItems;
  } catch (_e) { /* nothing read */ }
  const v = typeof gl.READ_VERSION_ID === 'string' ? gl.READ_VERSION_ID : 'v1';
  return (bid, cid) => !!items[v + ':' + bid + ':' + cid];
}

/** The Volumes in site order from the loaded corpus (main's TodayCard source); [] until it is in. */
export function liveSequence(gl = g) {
  if (!gl.READING_CHAIN || !gl.COL_BY_KEY || typeof gl.colLetterArr !== 'function' || typeof gl.colPreface !== 'function') return [];
  try {
    return volumeSequence({ chain: gl.READING_CHAIN, colByKey: gl.COL_BY_KEY, letters: gl.colLetterArr, preface: gl.colPreface });
  } catch (_e) {
    return [];
  }
}

/** The collection a read-record key belongs to (a Volumes item's bid is its collection's readKey), else null. */
function colForReadKey(bid, gl) {
  const cols = Array.isArray(gl.COLLECTIONS) ? gl.COLLECTIONS
    : gl.COL_BY_KEY && typeof gl.COL_BY_KEY.values === 'function' ? [...gl.COL_BY_KEY.values()] : [];
  return cols.find((c) => c && c.readKey === bid) || null;
}

/**
 * The page a plan item opens: a letter (its number, or the preface) or a Bible chapter. Back from it says Reading plans.
 * @param {PlanItem} it @returns {Record<string, any> | null}
 */
export function itemRoute(it, gl = g) {
  if (!it) return null;
  const col = colForReadKey(it.bid, gl);
  if (!col) return { place: 'bible-chapter', book: it.bid, chapter: Number(it.cid) };
  const pre = col.prefaceGlobal ? gl[col.prefaceGlobal] : null;
  if (pre && String(pre.id) === String(it.cid)) return { place: 'letter', collection: col.volKey, preface: true };
  const list = Array.isArray(gl[col.globalName]) ? gl[col.globalName] : [];
  const letter = list.find((l) => l && String(l.id) === String(it.cid));
  return letter && typeof letter.num === 'number' ? { place: 'letter', collection: col.volKey, n: letter.num } : { place: 'collection', collection: col.volKey };
}

/**
 * Plays a plan item as main's Today card does; false when there is no recording (the caller then opens it).
 * @param {PlanItem} it
 */
export function listenItem(it, gl = g) {
  const player = gl.AudioPlayer;
  if (!it || !player) return false;
  try {
    const col = colForReadKey(it.bid, gl);
    if (col) {
      if (typeof player.collectionHasAudio !== 'function' || !player.collectionHasAudio(col.volKey)) return false;
      const pref = typeof gl.colPreface === 'function' ? gl.colPreface(col) : null;
      const arr = (typeof gl.colLetterArr === 'function' ? gl.colLetterArr(col) : null) || [];
      return player.playCollection({ volKey: col.volKey, items: pref ? [pref, ...arr] : arr, collectionLabel: col.label, startId: it.cid }) !== false;
    }
    const ed = resolveBibleAudio({ settings: savedSettings(gl), bookId: it.bid }).offer;
    if (!ed || typeof player.playBibleBook !== 'function') return false;
    player.playBibleBook({ volKey: ed.volKey, bookId: it.bid, label: ed.label, chapterNum: Number(it.cid) });
    return true;
  } catch (_e) {
    return false;
  }
}

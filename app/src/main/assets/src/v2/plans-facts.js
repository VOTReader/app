/* plans-facts.js - what Reading plans (picture 9a-plans) shows (zv1, 2026-10-15).

   Main's plans re-shown, nothing migrated: a plan is vot-state settings.readingPlans ([{ id, start, pace? }], main's
   utils/reading-plan-view.js), a day is done when main's read record says so (readItems 'v1:<bid>:<cid>'), and Start /
   Stop write the same key main's Plans screen writes. Read opens the first chapter or letter of the day not read yet;
   Listen plays from it as main's Today card does (a chapter on through its book, a letter on through its collection),
   and opens it when there is no recording. A gate boot shows the picture's plans and every control is inert. */
import { readingPlansOf, todayRows, startPlan, stopPlan, planPortion, PLAN_NAMES } from '../utils/reading-plan-view.js';
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
 * @typedef {{ id: string, name: string, overline: string, title: string, sub: string, percent: number,
 *   next: PlanItem | null, catchUp: PlanItem | null }} RunningPlan
 * @typedef {{ id: string, name: string, sub: string, paces: boolean }} PlanOffer
 * @typedef {{ running: RunningPlan[], offers: PlanOffer[] }} PlansView
 */

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
  const rows = todayRows(plans, now, isRead, seq);
  /** @param {any} plan @param {number} day @returns {PlanItem | null} */
  const firstUnread = (plan, day) => {
    const items = planPortion(plan, day, seq).items;
    return items.find((it) => !isRead(it.bid, it.cid)) || items[0] || null;
  };
  const running = plans.map((plan) => {
    const r = rows.find((x) => x.id === plan.id);
    const name = PLAN_NAMES[plan.id];
    if (!r || r.loading) return { id: plan.id, name, overline: 'Today', title: 'Loading the Volumes…', sub: name, percent: 0, next: null, catchUp: null };
    const overline = 'Today · Day ' + (r.day + 1) + ' of ' + r.totalDays;
    if (r.finished) return { id: plan.id, name, overline, title: 'Plan complete', sub: name, percent: 100, next: null, catchUp: null };
    const behind = r.behind > 0 && r.catchUpDay >= 0;
    return {
      id: plan.id, name, overline, title: dashed(r.label),
      sub: name + (behind ? ' · ' + days(r.behind) + ' to catch up' : r.done ? ' · Done for today' : ''),
      percent: Math.max(0, Math.min(100, r.percent)),
      next: r.next || null,
      catchUp: behind ? firstUnread(plan, r.catchUpDay) : null,
    };
  });
  const on = new Set(plans.map((p) => p.id));
  const p = Math.max(1, Math.floor(pace) || 1);
  const offers = PLAN_IDS.filter((id) => !on.has(id)).map((id) => (id === 'bible-year'
    ? { id, name: PLAN_NAMES[id], sub: BIBLE_CHAPTER_COUNT.toLocaleString('en-US') + ' chapters · 365 days', paces: false }
    : { id, name: PLAN_NAMES[id], sub: 'Every letter in site order' + (seq.length ? ' · ' + Math.ceil(seq.length / p) + ' days' : ''), paces: true }));
  return { running, offers };
}

/** The picture's page (states.json 9a: Bible in a Year on day 40 of 365, Numbers 11-13, a day behind, 11 % done; the
 *  Volumes not started, 2 a day chosen, 730 letters = 365 days). Seeded as drawn: a gate boot never reads storage. */
export function gatePlans() {
  return {
    pace: 2,
    view: /** @type {PlansView} */ ({
      running: [{
        id: 'bible-year', name: 'Bible in a Year', overline: 'Today · Day 40 of 365', title: 'Numbers 11–13',
        sub: 'Bible in a Year · 1 day to catch up', percent: 11,
        next: { bid: 'numbers', cid: 11 }, catchUp: { bid: 'numbers', cid: 8 },
      }],
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

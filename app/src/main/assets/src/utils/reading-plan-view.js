/* ═══════════════════════════════════════════════════════════════════════
   reading-plan-view — what the Today card and the Plans screen show (rp1)
   ═══════════════════════════════════════════════════════════════════════
   The plans live in settings.readingPlans ([{ id, start: 'YYYY-MM-DD',
   pace? }], vot-state, so they back up and sync with the rest of the
   reader's settings). Whether a day is done is never stored: it is read from
   the app's own read record through `isRead(bid, cid)` (data/reading-plans.js
   says why). Nothing here scores the reader: a day behind is a day to catch
   up, never a failure, and there are no streaks.

   Pure: no state, no DOM, no storage.
   ═══════════════════════════════════════════════════════════════════════ */

import { planStatus, biblePortion, volumesPortion, dayIndex, localDateKey } from '../data/reading-plans.js';

/** The plans there are, by id, and what they are called. */
export const PLAN_NAMES = Object.freeze({ 'bible-year': 'Bible in a Year', volumes: 'The Volumes in Order' });

/**
 * The reader's plans from settings: known ids with a start date, once each.
 * @param {any} settings
 * @returns {{ id: string, start: string, pace?: number }[]}
 */
export function readingPlansOf(settings) {
  const list = settings && Array.isArray(settings.readingPlans) ? settings.readingPlans : [];
  const seen = new Set();
  /** @type {{ id: string, start: string, pace?: number }[]} */ const out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object' || !PLAN_NAMES[p.id] || typeof p.start !== 'string' || !p.start || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/**
 * Today's line for each plan. A Volumes plan waits (loading) until the
 * Volumes sequence is in.
 * @param {{ id: string, start: string, pace?: number }[]} plans
 * @param {Date} now
 * @param {(bid: string, cid: string | number) => boolean} isRead
 * @param {any[]} seq  the Volumes in site order (volumeSequence), [] until loaded
 */
export function todayRows(plans, now, isRead, seq) {
  return plans.map((p) => {
    const st = planStatus(p, now, isRead, seq);
    if (!st) return { id: p.id, name: PLAN_NAMES[p.id], loading: true, label: '', done: false, day: 0, totalDays: 0, percent: 0, behind: 0, finished: false, next: null, catchUpDay: -1 };
    const items = st.today.items;
    const next = items.find((it) => !isRead(it.bid, it.cid)) || items[0] || null;
    return {
      id: p.id, name: PLAN_NAMES[p.id], loading: false, label: st.today.label, done: st.todayDone,
      day: st.day, totalDays: st.totalDays, percent: st.percent, behind: st.behind, finished: st.finished,
      next, catchUpDay: st.catchUpDay,
    };
  });
}

/**
 * The portion of one day of a plan (the Plans screen's Catch up opens it).
 * @param {{ id: string, pace?: number }} plan @param {number} day @param {any[]} seq
 * @returns {{ items: { bid: string, cid: any }[], label: string }}
 */
export function planPortion(plan, day, seq) {
  return plan.id === 'bible-year' ? biblePortion(day) : volumesPortion(seq || [], day, plan.pace || 1);
}

/**
 * Start a plan today; a plan already running is left as it is.
 * @param {{ id: string, start: string, pace?: number }[]} plans
 * @param {string} id @param {Date} now @param {number} [pace]
 */
export function startPlan(plans, id, now, pace) {
  if (plans.some((p) => p.id === id)) return plans;
  /** @type {{ id: string, start: string, pace?: number }} */ const plan = { id, start: localDateKey(now) };
  if (id === 'volumes') plan.pace = Math.max(1, Math.floor(pace || 1));
  return plans.concat([plan]);
}

/** @param {{ id: string }[]} plans @param {string} id */
export function stopPlan(plans, id) {
  return plans.filter((p) => p.id !== id);
}

/**
 * The days of `now`'s month for one plan: done / missed / today / ahead, and
 * 'none' outside the plan. weekday is 0 (Sunday) to 6.
 * @param {{ id: string, start: string, pace?: number }} plan
 * @param {Date} now
 * @param {(bid: string, cid: string | number) => boolean} isRead
 * @param {any[]} seq
 * @returns {{ date: number, weekday: number, state: 'done' | 'missed' | 'today' | 'ahead' | 'none', done: boolean }[]}
 */
export function monthDays(plan, now, isRead, seq) {
  const y = now.getFullYear(), m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const today = dayIndex(plan.start, now);
  const st = planStatus(plan, now, isRead, seq);
  const total = st ? st.totalDays : 0;
  const out = [];
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m, d, 12);
    const i = dayIndex(plan.start, date);
    const items = st && i >= 0 && i < total ? planPortion(plan, i, seq).items : [];
    const done = items.length > 0 && items.every((it) => isRead(it.bid, it.cid));
    /** @type {'done' | 'missed' | 'today' | 'ahead' | 'none'} */
    let state = 'none';
    if (items.length) state = i === today ? 'today' : i > today ? 'ahead' : done ? 'done' : 'missed';
    out.push({ date: d, weekday: date.getDay(), state, done });
  }
  return out;
}

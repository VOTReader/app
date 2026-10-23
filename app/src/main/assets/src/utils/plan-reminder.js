/* ═══════════════════════════════════════════════════════════════════════
   plan-reminder — the page's side of the daily Android reading-plan reminder
   ═══════════════════════════════════════════════════════════════════════
   rp-s1 (reading plans S1, Corbin's call 4A, 2026-10-22): one local
   notification a day at most across all plans, at a time the reader picks per
   plan, silent once today is done, quiet after 7 untouched days, off unless
   the reader says yes. The alarm and the notification are native
   (PlanReminder.kt) because the reminder must arrive with the app closed; this
   file turns the plan runs into the list the native side keeps, and wraps the
   rest of the bridge.

   A run carries its reminder as `remind: 'HH:MM'` (absent = off). Call
   syncPlanReminders(runs) whenever runs change (a tick, pause, resume, a new
   time, a stop, Clear All) and once at boot: the native side decides every
   later day from that list alone. On the web (no AndroidBridge) every call is
   a quiet no-op and `supported()` is false, so the page shows its in-app nudge
   instead.

   window.AndroidBridge is read at call time (the same direct, guarded pattern
   as snapshot-sink.js); tests pass `bridge`.
   ═══════════════════════════════════════════════════════════════════════ */

import { runStatus, dayItems, todayKey, dayNum, dateOf } from '../data/plan-engine.js';

/** @typedef {import('../data/plan-engine.js').PlanRun & { remind?: string }} RemindRun */
/** @typedef {{ ok: boolean, allowed: boolean, next: number, quiet: string[] }} ReminderStatus */

const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** @param {any} [b] */
function bridgeOf(b) {
  const x = b || /** @type {any} */ (typeof window !== 'undefined' ? window : {}).AndroidBridge;
  return x && typeof x.planReminderSet === 'function' ? x : null;
}

/** Whether this shell can post the reminder (the Android app). @param {any} [bridge] */
export function supported(bridge) { return !!bridgeOf(bridge); }

/** Whether `s` is a reminder time the native side takes ('HH:MM', 24 h). @param {unknown} s */
export function isReminderTime(s) { return typeof s === 'string' && TIME.test(s); }

/**
 * The date the reader last touched a run: its start, a resume, any tick, any change it saved.
 * @param {RemindRun} run @returns {string}
 */
export function lastActive(run) {
  let best = dayNum(run.start) ?? -Infinity;
  for (const v of Object.values(run.ticks || {})) { const n = dayNum(v); if (n != null && n > best) best = n; }
  for (const p of run.pauses || []) { const n = dayNum(p && p[1]); if (n != null && n + 1 > best) best = n + 1; }
  if (typeof run.updated === 'number' && Number.isFinite(run.updated)) {
    const n = dayNum(todayKey(new Date(run.updated)));
    if (n != null && n > best) best = n;
  }
  return best === -Infinity ? '' : dateOf(best);
}

/**
 * Whether the reader finished a day of the run today (read ahead into the next day included), so today's reminder
 * has nothing left to say. @param {RemindRun} run @param {Date} now
 */
export function doneToday(run, now) {
  const st = runStatus(run, now);
  if (st.doneToday) return true;
  if (st.day <= 0) return false;
  const today = todayKey(now);
  const prev = dayItems(run, st.day - 1);
  const ticks = run.ticks || {};
  return prev.length > 0 && prev.some((it) => ticks[it.k] === today);
}

/**
 * The list PlanReminder.set takes: each running plan with a reminder on.
 * @param {RemindRun[]} runs @param {Date} now @param {(run: RemindRun) => string} [nameOf]
 */
export function reminderPayload(runs, now, nameOf) {
  const plans = [];
  for (const run of runs || []) {
    if (!run || run.status !== 'running' || run.paused || !isReminderTime(run.remind)) continue;
    /** @type {Record<string, any>} */
    const p = {
      id: String(run.id),
      name: String((nameOf && nameOf(run)) || run.name || 'Your reading plan'),
      time: run.remind,
      active: lastActive(run),
    };
    if (Array.isArray(run.weekdays) && run.weekdays.length === 7) p.weekdays = run.weekdays.map(Boolean);
    if (doneToday(run, now)) p.done = todayKey(now);
    plans.push(p);
  }
  return { plans };
}

/** @param {string} s @returns {ReminderStatus | null} */
function parseStatus(s) {
  try {
    const o = JSON.parse(String(s || ''));
    if (!o || typeof o !== 'object') return null;
    return { ok: !!o.ok, allowed: !!o.allowed, next: Number(o.next) || 0, quiet: Array.isArray(o.quiet) ? o.quiet.map(String) : [] };
  } catch (_e) { return null; }
}

let _lastSent = '';

/**
 * Hand the native side the runs' reminders. The same list twice in a row is sent once.
 * @param {RemindRun[]} runs @param {{ now?: Date, nameOf?: (run: RemindRun) => string, bridge?: any, force?: boolean }} [opt]
 * @returns {ReminderStatus | null} null on the web or when the bridge failed
 */
export function syncPlanReminders(runs, opt = {}) {
  const b = bridgeOf(opt.bridge);
  if (!b) return null;
  const json = JSON.stringify(reminderPayload(runs, opt.now || new Date(), opt.nameOf));
  if (json === _lastSent && !opt.force) return reminderStatus(b);
  try {
    const st = parseStatus(b.planReminderSet(json));
    if (st && st.ok) _lastSent = json;
    return st;
  } catch (_e) { return null; }
}

/** The native status without changing anything. @param {any} [bridge] @returns {ReminderStatus | null} */
export function reminderStatus(bridge) {
  const b = bridgeOf(bridge);
  if (!b || typeof b.planReminderStatus !== 'function') return null;
  try { return parseStatus(b.planReminderStatus()); } catch (_e) { return null; }
}

/**
 * Ask for the notification permission (the reader just said yes to a reminder). `onAnswer(allowed)` runs once with
 * the answer. @param {(allowed: boolean) => void} [onAnswer] @param {any} [bridge]
 */
export function askForReminders(onAnswer, bridge) {
  const b = bridgeOf(bridge);
  if (!b || typeof b.planReminderAsk !== 'function') { if (onAnswer) onAnswer(false); return; }
  if (onAnswer) {
    const w = /** @type {any} */ (typeof window !== 'undefined' ? window : {});
    const prev = w.__votNotificationsResult;
    w.__votNotificationsResult = (/** @type {any} */ granted) => {
      w.__votNotificationsResult = prev;
      if (typeof prev === 'function') { try { prev(granted); } catch (_e) { /* the other asker's own */ } }
      onAnswer(!!granted);
    };
  }
  try { b.planReminderAsk(); } catch (_e) { if (onAnswer) onAnswer(false); }
}

/** Open the app's notification settings (Android stops asking after two refusals). @param {any} [bridge] */
export function openReminderSettings(bridge) {
  const b = bridgeOf(bridge);
  if (b && typeof b.planReminderSettings === 'function') { try { b.planReminderSettings(); } catch (_e) { /* nothing to open */ } }
}

/**
 * Run `open(planId)` when the reader taps a reminder: now, for a tap that cold-started the app, and on every later
 * tap while the page runs. Returns the uninstall. @param {(planId: string) => void} open @param {any} [bridge]
 */
export function onReminderOpen(open, bridge) {
  const b = bridgeOf(bridge);
  if (!b || typeof b.planReminderOpened !== 'function') return () => {};
  const take = () => { try { return String(b.planReminderOpened() || ''); } catch (_e) { return ''; } };
  const w = /** @type {any} */ (typeof window !== 'undefined' ? window : {});
  const handler = (/** @type {any} */ id) => { const kept = take(); const plan = String(id || kept || ''); if (plan) open(plan); };
  w.__votPlanReminderOpen = handler;
  const cold = take();
  if (cold) open(cold);
  return () => { if (w.__votPlanReminderOpen === handler) delete w.__votPlanReminderOpen; };
}

/** Tests: forget the last list sent. */
export function _resetForTests() { _lastSent = ''; }

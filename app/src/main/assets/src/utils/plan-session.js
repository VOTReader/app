/* ═══════════════════════════════════════════════════════════════════════
   plan-session — reading inside a plan (plans2, 2026-11-10)
   ═══════════════════════════════════════════════════════════════════════
   A session is one sitting of one plan day, started from the plan page's
   Today card, a day sheet, Home's plan row or the reminder. While it runs
   the reader shows a slim strip under its top bar ("Bible in a Year ·
   Day 12", "2 of 3 · 5 min left") and, at the end of each item, a panel:
   "Genesis 35 read", NEXT · GENESIS 36 (or FINISH DAY 12), Not read yet,
   Stop for now.

   Reaching the end of an item inside a session counts it as read: no
   hidden timer (outside a session the read detector's time rule decides,
   unchanged). The tick goes through the read record (host.markRead), so
   the plan and Progress agree; Not read yet takes back what the session
   wrote. Next moves the reader in place and carries its way back along, so
   Back returns to where the session started.

   The navigation lives in screen-routes, which registers it here each
   render (setPlanSessionHost): a module registry, not a window bridge.
   Bundle-d only. The run store is bundle-b's ReadingPlanStore, read at
   call time.
   ═══════════════════════════════════════════════════════════════════════ */

import { untickItem, dayItems, tickItem, todayKey } from '../data/plan-engine.js';

/**
 * @typedef {{ runId: string, day: number, keys: string[], name: string, wrote: string[], undone: string[] }} PlanSession
 * @typedef {{ move: (ref: { bid: string, cid: any }) => void, back: () => void, markRead: (bid: string, cid: any) => void,
 *   unmarkRead: (bid: string, cid: any) => void, isRead: (bid: string, cid: any) => boolean,
 *   openPlans: (views: any[]) => void, openNote: (runId: string, day: number) => void }} PlanSessionHost
 */

/** @type {PlanSession | null} */
let _s = null;
/** @type {PlanSessionHost | null} */
let _host = null;
let _version = 0;
const _subs = new Set();
const _bump = () => { _version++; for (const f of _subs) f(); };

const _store = () => { const s = /** @type {any} */ (globalThis).ReadingPlanStore; return s && typeof s.get === 'function' ? s : null; };
/** '<bid>:<cid>' as { bid, cid } (a numeric chapter as a number). @param {string} k */
export const refOf = (k) => { const i = k.lastIndexOf(':'); const c = k.slice(i + 1); return { bid: k.slice(0, i), cid: /^\d+$/.test(c) ? Number(c) : c }; };

/** @param {PlanSessionHost} host */
export function setPlanSessionHost(host) { _host = host; }
/** @returns {PlanSessionHost | null} */
export const planSessionHost = () => _host;

/** The session, or null. */
export const planSession = () => _s;

/**
 * Begin a sitting of day `day` of run `runId` (the caller opens the first item).
 * @param {{ runId: string, day: number, name: string }} p
 * @returns {PlanSession | null}
 */
export function beginPlanSession({ runId, day, name }) {
  const s = _store();
  const run = s ? s.get(runId) : null;
  if (!run) return null;
  const keys = dayItems(run, day).map((it) => it.k);
  if (!keys.length) return null;
  _s = { runId, day, keys, name, wrote: [], undone: [] };
  _bump();
  return _s;
}

export function endPlanSession() { if (_s) { _s = null; _bump(); } }

/** The open item's key in the session, or null when it is not part of it. @param {string} bid @param {any} cid */
export function sessionKeyOf(bid, cid) {
  if (!_s) return null;
  const keys = bid === 'matthew' ? ['matthew:' + cid, 'matthew-plain:' + cid] : [bid + ':' + cid];
  return _s.keys.find((k) => keys.includes(k)) || null;
}

/** The session's run as stored now. */
export function sessionRun() { const s = _store(); return _s && s ? s.get(_s.runId) : null; }

/** Whether key k is ticked in the session's run. @param {string} k */
export function sessionTicked(k) { const run = sessionRun(); return !!(run && run.ticks && k in run.ticks); }

/**
 * The end of item k was reached inside the session: it counts as read, through the read record (which ticks the
 * plan). A "Not read yet" on it holds it back until the reader counts it again (force).
 * @param {string} k @param {boolean} [force]
 */
export function sessionReachedEnd(k, force) {
  if (!_s || !_host || !_s.keys.includes(k)) return;
  if (!force && _s.undone.includes(k)) return;
  if (sessionTicked(k)) return;
  const ref = refOf(k);
  const was = _host.isRead(ref.bid, ref.cid);
  _host.markRead(ref.bid, ref.cid);
  // The read record ticks the plan; a record that could not (a deferred store) still leaves the plan ticked.
  if (!sessionTicked(k)) {
    const s = _store(); const run = sessionRun();
    if (s && run) s.put(tickItem(run, k, todayKey(new Date()), Date.now()));
  }
  _s = { ..._s, wrote: was ? _s.wrote : [..._s.wrote, k], undone: _s.undone.filter((x) => x !== k) };
  _bump();
}

/** "Not read yet": the item is unticked in the session's plan, and the read mark the session wrote goes too. @param {string} k */
export function sessionNotRead(k) {
  if (!_s) return;
  const s = _store(); const run = sessionRun();
  if (s && run) s.put(untickItem(run, k, new Date()));
  if (_host && _s.wrote.includes(k)) { const ref = refOf(k); _host.unmarkRead(ref.bid, ref.cid); }
  _s = { ..._s, wrote: _s.wrote.filter((x) => x !== k), undone: _s.undone.includes(k) ? _s.undone : [..._s.undone, k] };
  _bump();
}

/** The next item of the day not read yet, after k (wrapping to any earlier one left), or null. @param {string} k */
export function sessionNextKey(k) {
  if (!_s) return null;
  const run = sessionRun();
  const ticked = (/** @type {string} */ x) => !!(run && run.ticks && x in run.ticks);
  const i = _s.keys.indexOf(k);
  const after = _s.keys.slice(i + 1).find((x) => !ticked(x));
  return after || _s.keys.slice(0, Math.max(0, i)).find((x) => !ticked(x)) || null;
}

/** The session, re-rendered on every change (and on every store change, for the ticks). */
export function usePlanSession() {
  React.useSyncExternalStore(
    React.useCallback((cb) => { _subs.add(cb); return () => { _subs.delete(cb); }; }, []),
    () => _version,
  );
  const store = _store();
  React.useSyncExternalStore(
    React.useCallback((cb) => (store && typeof store.subscribe === 'function' ? store.subscribe(cb) : () => {}), [store]),
    () => (store && typeof store.getVersion === 'function' ? store.getVersion() : 0),
  );
  return _s;
}

/** Tests. */
export function _resetPlanSessionForTests() { _s = null; _host = null; _bump(); }

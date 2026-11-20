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

   FIXB: a session is one sitting. screen-routes tells it, each render,
   what the screen shows (notePlanSessionPlace); once the reader has shown
   one of the day's items, a screen that shows none of them (Back, the tab
   bar, another app tab, any other screen or chapter) ends the session.
   Without that it went on in every tab, and a later read of one of the
   day's items on his own showed the strip and ticked the plan.
   Bundle-d only. The run store is bundle-b's ReadingPlanStore, read at
   call time.

   Container (Corbin 11-19: plans "more of a 'container' or special
   instance, sort of like holy days album"): inside a sitting the reader's
   swipes and arrows move between the day's readings only
   (sessionNeighbours), and leaving another way (a link, search, a tab)
   PAUSES the sitting instead of ending it. The paused sitting is kept in
   its own key, PLAN_SESSION_KEY, so it outlives an app restart; a reader
   page outside the day then offers Resume. Only the sitting's own exits
   end it: Stop for now, the strip's close, Back from the first reading,
   Done. A sitting paused on an earlier date is not offered again, and an
   app that reopens on one of its readings is back inside the plan.
   ═══════════════════════════════════════════════════════════════════════ */

import { untickItem, dayItems, tickItem, todayKey } from '../data/plan-engine.js';

/**
 * @typedef {{ runId: string, day: number, keys: string[], name: string, wrote: string[], undone: string[], span?: number, again?: boolean }} PlanSession
 *   span: how many days the sitting holds, from `day` (2, "Read two days today" from Catch up, 2235; absent is 1)
 * @typedef {{ move: (ref: { bid: string, cid: any }) => void, open: (ref: { bid: string, cid: any }) => void, back: () => void, markRead: (bid: string, cid: any) => void,
 *   unmarkRead: (bid: string, cid: any) => void, isRead: (bid: string, cid: any) => boolean,
 *   openPlans: (views: any[]) => void, openNote: (runId: string, day: number) => void }} PlanSessionHost
 */

/** @type {PlanSession | null} */
let _s = null;
/** Whether the reader has shown an item of the session yet (a session starts before its first item opens). */
let _shown = false;
/** The item the screen showed last (its session key, or null: none of the session's). */
let _placeKey = /** @type {string | null} */ (null);
let _placeTimer = /** @type {any} */ (null);
/** @type {PlanSessionHost | null} */
let _host = null;
let _version = 0;
/** The sitting is paused: kept (and saved) for Resume, but the reader shows no strip for it and ticks nothing by it. */
let _paused = false;
/** The paused sitting came from storage (an app restart) and the screen has not been noted since. */
let _fromStorage = false;
let _hydrated = false;
/** The last reading of the sitting the screen showed (for the saved record). */
let _at = /** @type {string | null} */ (null);

/** Where a sitting is kept while it runs or is paused (additive; the plan record 'vot-reading-plans' is untouched). */
export const PLAN_SESSION_KEY = 'vot-plan-session';
const _today = () => todayKey(new Date());
function _save() {
  try {
    if (!_s) { localStorage.removeItem(PLAN_SESSION_KEY); return; }
    localStorage.setItem(PLAN_SESSION_KEY, JSON.stringify({ runId: _s.runId, day: _s.day, span: _s.span || 1, name: _s.name,
      wrote: _s.wrote, undone: _s.undone, at: _at, on: _today() }));
  } catch (_e) { /* storage full or blocked: the sitting still runs in memory */ }
}
/** An app restart: the saved sitting comes back paused. */
function _hydrate() {
  if (_hydrated) return;
  _hydrated = true;
  if (_s) return;
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(PLAN_SESSION_KEY) || 'null'); } catch (_e) { rec = null; }
  if (!rec || typeof rec.runId !== 'string' || !Number.isFinite(rec.day)) return;
  if (rec.on !== _today()) { try { localStorage.removeItem(PLAN_SESSION_KEY); } catch (_e) { /* blocked */ } return; }
  const st = _store();
  const run = st ? st.get(rec.runId) : null;
  if (!run) { _hydrated = false; return; }   // the store has not loaded it yet: ask again later, throw nothing away
  const span = Math.max(1, Math.min(2, Math.floor(rec.span) || 1));
  /** @type {string[]} */ const keys = [];
  for (let d = rec.day; d < rec.day + span; d++) for (const it of dayItems(run, d)) keys.push(it.k);
  if (!keys.length) return;
  const arr = (/** @type {any} */ v) => (Array.isArray(v) ? v.filter((x) => keys.includes(x)) : []);
  _s = { runId: rec.runId, day: rec.day, keys, name: String(rec.name || ''), wrote: arr(rec.wrote), undone: arr(rec.undone), ...(span > 1 ? { span } : {}) };
  _at = keys.includes(rec.at) ? rec.at : null;
  _paused = true;
  _fromStorage = true;
}
const _subs = new Set();
const _bump = () => { _version++; _save(); for (const f of _subs) f(); };

const _store = () => { const s = /** @type {any} */ (globalThis).ReadingPlanStore; return s && typeof s.get === 'function' ? s : null; };
/** '<bid>:<cid>' as { bid, cid } (a numeric chapter as a number). @param {string} k */
export const refOf = (k) => { const i = k.lastIndexOf(':'); const c = k.slice(i + 1); return { bid: k.slice(0, i), cid: /^\d+$/.test(c) ? Number(c) : c }; };

/** @param {PlanSessionHost} host */
export function setPlanSessionHost(host) { _host = host; }
/** @returns {PlanSessionHost | null} */
export const planSessionHost = () => _host;

/** The session the reader is inside, or null (none, or paused). */
export const planSession = () => (_paused ? null : _s);

/** The paused sitting (left by a link, search or a tab, or kept over a restart), or null. Every reading of it read
 * means there is nothing left to come back to. */
export function pausedPlanSession() {
  _hydrate();
  if (!_s || !_paused) return null;
  const run = sessionRun(true);
  if (run && _s.keys.every((k) => run.ticks && k in run.ticks)) return null;
  return _s;
}

/** Back inside the paused sitting (the caller opens the reading: sessionOpenKey()). */
export function resumePlanSession() {
  if (!pausedPlanSession()) return null;
  _paused = false;
  _fromStorage = false;
  _shown = false;
  _bump();
  return _s;
}

/** The reading a sitting opens on: k when it is one of the day's, else the first not read yet, else the first. @param {string} [k] */
export function sessionOpenKey(k) {
  if (!_s) return null;
  if (k && _s.keys.includes(k)) return k;
  const run = sessionRun(true);
  return _s.keys.find((x) => !(run && run.ticks && x in run.ticks)) || _s.keys[0];
}

/** The readings either side of k in the day's order; none past either end (a swipe never leaves the day). @param {string} k */
export function sessionNeighbours(k) {
  const i = _s ? _s.keys.indexOf(k) : -1;
  if (!_s || i < 0) return { prev: null, next: null };
  return { prev: i > 0 ? _s.keys[i - 1] : null, next: i < _s.keys.length - 1 ? _s.keys[i + 1] : null };
}

/**
 * Begin a sitting of day `day` of run `runId` (the caller opens the first item); `days` 2 holds the next day's
 * portion too (Catch up's "Read two days today").
 * @param {{ runId: string, day: number, name: string, days?: number }} p
 * @returns {PlanSession | null}
 */
export function beginPlanSession({ runId, day, name, days = 1 }) {
  const s = _store();
  const run = s ? s.get(runId) : null;
  if (!run) return null;
  const span = Math.max(1, Math.min(2, Math.floor(days) || 1));
  /** @type {string[]} */ const keys = [];
  for (let d = day; d < day + span; d++) for (const it of dayItems(run, d)) keys.push(it.k);
  if (!keys.length) return null;
  _hydrate();
  // The same day again (Home's Read, the plan page, Resume) picks the sitting up with what it wrote and held back.
  const same = _s && _s.runId === runId && _s.day === day && (_s.span || 1) === span && _s.keys.join() === keys.join() ? _s : null;
  // again: every reading of the day was read before this sitting began (a finished day opened from the plan page).
  const again = keys.every((k) => run.ticks && k in run.ticks);
  _s = { runId, day, keys, name, wrote: same ? same.wrote : [], undone: same ? same.undone : [], ...(span > 1 ? { span } : {}), ...(again ? { again } : {}) };
  if (!same) _at = null;
  _paused = false;
  _fromStorage = false;
  _shown = false;
  _bump();
  return _s;
}

/** The items of the sitting, in order (one day's, or two). @param {any} run @param {PlanSession} s */
export function sessionItems(run, s) {
  const out = [];
  for (let d = s.day; d < s.day + (s.span || 1); d++) out.push(...dayItems(run, d));
  return out;
}

/** "day 12", or "days 12–13" for a two-day sitting. @param {PlanSession} s */
export const sessionDaysLabel = (s) => ((s.span || 1) > 1 ? 'days ' + (s.day + 1) + '–' + (s.day + (s.span || 1)) : 'day ' + (s.day + 1));

/** The sitting's own exits (Stop for now, the strip's close, Back from the first reading, Done): it is forgotten. */
export function endPlanSession() {
  _hydrate();
  _shown = false; _paused = false; _fromStorage = false; _at = null;
  if (_s) { _s = null; _bump(); } else _save();
}

/** Left another way: the sitting is kept for Resume. */
function pausePlanSession() {
  if (!_s || _paused) return;
  _paused = true;
  _shown = false;
  _bump();
}

/**
 * What the screen shows now (screen-routes, every render): the open reader item, or nothing (bid null) for any
 * screen that is not a reader. A session whose item was shown ends once the screen shows none of its items; the end
 * waits a tick, since this runs while the app renders.
 * @param {string | null} bid @param {any} [cid]
 */
export function notePlanSessionPlace(bid, cid) {
  _hydrate();
  if (!_s) return;
  if (_paused) {
    // An app that reopens on a reading of the sitting it kept is back inside the plan; after that first screen a
    // reading of the day opened on its own stays outside (FIXB).
    const k = bid ? _keyIn(_s, bid, cid) : null;
    const back = _fromStorage && !!k;
    _fromStorage = false;
    if (back) { _paused = false; _placeKey = k; _at = k; _shown = true; _bump(); }
    return;
  }
  _placeKey = bid ? sessionKeyOf(bid, cid) : null;
  if (_placeKey) { _shown = true; if (_placeKey !== _at) { _at = _placeKey; _save(); } return; }
  if (!_shown || _placeTimer) return;
  _placeTimer = setTimeout(() => {
    _placeTimer = null;
    if (_s && !_paused && _shown && !_placeKey) pausePlanSession();
  }, 0);
}

/** @param {PlanSession} s @param {string} bid @param {any} cid */
function _keyIn(s, bid, cid) {
  const keys = bid === 'matthew' ? ['matthew:' + cid, 'matthew-plain:' + cid] : [bid + ':' + cid];
  return s.keys.find((k) => keys.includes(k)) || null;
}

/** The open item's key in the session, or null when it is not part of it. @param {string} bid @param {any} cid */
export function sessionKeyOf(bid, cid) {
  if (!_s || _paused) return null;
  return _keyIn(_s, bid, cid);
}

/** The session's run as stored now (a paused sitting's too, with `paused`). @param {boolean} [paused] */
export function sessionRun(paused) { const s = _store(); return _s && s && (paused || !_paused) ? s.get(_s.runId) : null; }

/** Whether key k is ticked in the session's run. @param {string} k */
export function sessionTicked(k) { const run = sessionRun(); return !!(run && run.ticks && k in run.ticks); }

/**
 * The end of item k was reached inside the session: it counts as read, through the read record (which ticks the
 * plan). A "Not read yet" on it holds it back until the reader counts it again (force).
 * @param {string} k @param {boolean} [force]
 */
export function sessionReachedEnd(k, force) {
  if (!_s || _paused || !_host || !_s.keys.includes(k)) return;
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

/** The session the reader is inside (null while paused), re-rendered on every change (and on every store change, for the ticks). */
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
  return _paused ? null : _s;
}

/** Tests. keepStorage: the module starts again over what was saved (an app restart). @param {{ keepStorage?: boolean }} [o] */
export function _resetPlanSessionForTests(o) {
  _s = null; _host = null; _shown = false; _placeKey = null; _at = null; _paused = false; _fromStorage = false; _hydrated = false;
  if (_placeTimer) { clearTimeout(_placeTimer); _placeTimer = null; }
  if (o && o.keepStorage) { _version++; for (const f of _subs) f(); } else _bump();
}

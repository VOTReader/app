/* ═══════════════════════════════════════════════════════════════════════
   update-hold — the app-update reload waits for unsaved work (ds2, 2026-10-13)
   ═══════════════════════════════════════════════════════════════════════

   sw-register.js reloads an open page onto a new build wherever the reader is
   (Corbin 2026-09-10), and the app's own restore carries the screen, scroll and
   playback across. Three things it cannot carry: a note being typed (NoteSheet
   keeps the text in React state only), a voice memo (MediaRecorder's chunks
   live in memory until stop) and a backup import (a reload mid-apply aborts it,
   or leaves the media replaced and the stores still old). While one of them is
   open it holds the reload here, and the reload runs once the last one lets go.

   The same holds stop HydrationGate's late-load remount (id-datasafe 80, s01.5),
   which would throw a typed note or a take in progress away just the same. The
   journal editor holds only that remount (`remountOnly`): it saves as it goes,
   so an update reload restores it, but a remount before its store has loaded
   would flush its last words into a store that is not there yet.

   Bundle-b: sw-register reads it directly; every other bundle reaches it through
   the window globals `holdUpdateReload` and `useUpdateHold` (_entry-b.js), so
   there is one list per page. */

/** @type {Map<number, { reason: string, reload: boolean }>} */
const _holds = new Map();
let _next = 1;
/** @type {Array<() => void>} */
let _waiters = [];

/** @returns {number} how many holds stop the reload (a remountOnly hold does not) */
function _reloadHoldCount() {
  let n = 0;
  for (const h of _holds.values()) if (h.reload) n++;
  return n;
}

/**
 * Hold the app-update reload, and the late-load remount, until the returned release runs
 * (calling it twice is harmless).
 * @param {string} reason - what is open, for the diagnostic log ('note', 'recording', 'backup')
 * @param {{ remountOnly?: boolean }} [opts] - remountOnly: hold the late-load remount only
 * @returns {() => void}
 */
export function holdUpdateReload(reason, opts) {
  const id = _next++;
  const reload = !(opts && opts.remountOnly);
  _holds.set(id, { reason: String(reason || 'unnamed'), reload });
  return () => {
    if (!_holds.delete(id) || !reload || _reloadHoldCount()) return;
    const run = _waiters;
    _waiters = [];
    for (const fn of run) { try { fn(); } catch (_e) { /* one waiter must not stop the next */ } }
  };
}

/** What holds the reload now; empty when nothing does. @returns {string[]} */
export function updateHolds() {
  return [..._holds.values()].filter((h) => h.reload).map((h) => h.reason);
}

/** What holds HydrationGate's late-load remount now (every hold does). @returns {string[]} */
export function remountHolds() {
  return [..._holds.values()].map((h) => h.reason);
}

/** Run `fn` once nothing holds the reload: now when nothing does, else on the last release. @param {() => void} fn */
export function whenUpdateUnheld(fn) {
  if (!_reloadHoldCount()) { fn(); return; }
  _waiters.push(fn);
}

export function _resetForTests() {
  _holds.clear();
  _waiters = [];
  _next = 1;
}

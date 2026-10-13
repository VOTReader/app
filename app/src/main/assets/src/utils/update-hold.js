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

   Bundle-b: sw-register reads it directly; every other bundle reaches it through
   the window globals `holdUpdateReload` and `useUpdateHold` (_entry-b.js), so
   there is one list per page. */

/** @type {Map<number, string>} */
const _holds = new Map();
let _next = 1;
/** @type {Array<() => void>} */
let _waiters = [];

/**
 * Hold the app-update reload until the returned release runs (calling it twice is harmless).
 * @param {string} reason - what is open, for the diagnostic log ('note', 'recording', 'backup')
 * @returns {() => void}
 */
export function holdUpdateReload(reason) {
  const id = _next++;
  _holds.set(id, String(reason || 'unnamed'));
  return () => {
    if (!_holds.delete(id) || _holds.size) return;
    const run = _waiters;
    _waiters = [];
    for (const fn of run) { try { fn(); } catch (_e) { /* one waiter must not stop the next */ } }
  };
}

/** What holds the reload now; empty when nothing does. @returns {string[]} */
export function updateHolds() {
  return [..._holds.values()];
}

/** Run `fn` once nothing holds the reload: now when nothing does, else on the last release. @param {() => void} fn */
export function whenUpdateUnheld(fn) {
  if (!_holds.size) { fn(); return; }
  _waiters.push(fn);
}

export function _resetForTests() {
  _holds.clear();
  _waiters = [];
  _next = 1;
}

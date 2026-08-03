/* ═══════════════════════════════════════════════════════════════════════
   useReadingDwell — reading-position cursor + the streak dwell timer
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   SEMANTICS (changed 2026-07-19, owner-reported): the reading POSITION
   (activeReadKey + the caller's commitFn cursor write) commits
   IMMEDIATELY at setActiveReadKey time — the resume dot must point at
   wherever the user actually last WAS. It used to be gated behind a
   completed dwell (dwellMs, default 20s, timer RESET on every re-arm):
   read a chapter for less than the dwell and it never became your
   resume point, so the dot jumped to wherever the LAST completed dwell
   happened — an older chapter or a different book ("takes me somewhere
   unexpected"). The dwell timer survives, but it now gates ONLY the
   ReadingStreakStore day record — the honest "actually read today"
   signal wants a real dwell; the resume cursor does not.

   OWNS:
     - activeReadKey state (init from initialActiveReadKey for cold-start
                            restore; persisted back to vot-state by
                            usePersistedState in App())
     - setActiveReadKeyRaw    (hook-internal; NOT returned)
     - dwellTimerRef          (hook-internal ref)
     - dwellAccRef            (hook-internal ref — accumulated dwell ms)
     - dwellStartRef          (hook-internal ref — last resume timestamp)
     - dwellKeyRef            (hook-internal ref — key being timed)
     - DWELL_MS()             (hook-internal; reads the dwellMs param)
     - cancelDwell            (returned — also used by setActiveReadKey)
     - scheduleDwell          (hook-internal plain arrow fn)
     - pauseDwell             (hook-internal plain arrow fn)
     - setActiveReadKey       (returned — public setter; commits the
                               position NOW + re-arms the streak dwell)
     - visibilitychange effect (pauses dwell on hidden, resumes on
                               visible; dep [] — mounted once)

   DOES NOT OWN:
     - The per-volume mark-as-read writes (setLastReadForVol, markRead,
       etc.) remain in App() — they depend on App-local helpers and per-
       collection knowledge; this hook only owns the timing gate.
     - Mark-as-read completion detection — that is use-read-tracker.js
       (ScreenLayout), a separate visibility-honest clock. (The old
       window.__onDwellCommit bridge that once let ScreenLayout force a
       dwell commit was DELETED 2026-08-03 — it had no callers.)

   PARAMS:
     dwellMs             — settings.dwellMs (useSettings) — number or
                           falsy. If falsy, defaults to 20000 ms (20 s).
     initialActiveReadKey — saved.activeReadKey from useSavedState (the
                           cold-start restore value). MUST be passed
                           explicitly so the hook initialises useState
                           with the persisted value. Passing null here
                           would silently break the reading-dot indicator
                           on relaunch.

   RETURNS: { activeReadKey, setActiveReadKey, cancelDwell }

   STORAGE:
     None directly. activeReadKey rides along in the vot-state JSON
     written by usePersistedState (P6k+1) via the returned value.

   WINDOW: none (the __onDwellCommit bridge was deleted 2026-08-03).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Reading-dwell tracker. Owns the dwell-timer state machine + the
 * setActiveReadKey / cancelDwell / commitDwellNow surface. The visibility
 * change effect pauses the timer when the app backgrounds and resumes
 * when it returns.
 *
 * @param {{ dwellMs: number | null | undefined, initialActiveReadKey: string | null }} args
 * @returns {{
 *   activeReadKey: string | null,
 *   setActiveReadKey: (key: string | null, commitFn?: (() => void) | null) => void,
 *   cancelDwell: () => void
 * }}
 */
/**
 * Record today as a reading day on the ReadingStreakStore (the days-
 * reading streak on My Progress). Called from both dwell-commit sites —
 * a dwell commit is the one honest "the user actually read today"
 * signal (manual mark-as-read toggles don't count). Bare-name +
 * typeof-guarded (cluster-B idiom) so bare test hosts need no stub;
 * same-day repeat calls are store-side no-ops.
 */
function _recordReadingDay() {
  if (typeof ReadingStreakStore !== 'undefined' && ReadingStreakStore) {
    try { ReadingStreakStore.recordReadingDay(Date.now()); }
    catch (e) { console.warn('reading-streak record failed', e); }
  }
}

export function useReadingDwell({ dwellMs, initialActiveReadKey }) {
  // ── State ──────────────────────────────────────────────────────────────
  const [activeReadKey, setActiveReadKeyRaw] = React.useState(initialActiveReadKey);

  // ── Refs ───────────────────────────────────────────────────────────────
  const dwellTimerRef = React.useRef(null);
  const dwellAccRef = React.useRef(0);
  const dwellStartRef = React.useRef(null);
  const dwellKeyRef = React.useRef(null);

  // ── DWELL_MS ───────────────────────────────────────────────────────────
  // Returns the effective dwell threshold in ms. Reads the dwellMs param.
  const DWELL_MS = () => dwellMs ? Number(dwellMs) : 20000;

  // ── Plain arrow functions ──────────────────────────────────────────────
  // Local plain functions operating only on the dwell refs via .current —
  // stable behavior regardless of identity, so no useCallback needed.
  // (The old __onDwellCommit window bridge — a per-render re-bound
  // "commit now" hook for ScreenLayout — was removed 2026-08-03: nothing
  // had called it since the 07-19 position-is-immediate change, and the
  // read tracker (use-read-tracker.js) now owns all screen-side signals.)

  const cancelDwell = () => {
    if (dwellTimerRef.current) {clearTimeout(dwellTimerRef.current);dwellTimerRef.current = null;}
    dwellAccRef.current = 0;dwellStartRef.current = null;dwellKeyRef.current = null;
  };

  const scheduleDwell = () => {
    if (!dwellKeyRef.current || dwellTimerRef.current) return;
    const remaining = DWELL_MS() - dwellAccRef.current;
    dwellStartRef.current = Date.now();
    dwellTimerRef.current = setTimeout(() => {
      dwellTimerRef.current = null;dwellAccRef.current = 0;
      dwellStartRef.current = null;dwellKeyRef.current = null;
      _recordReadingDay();
    }, remaining);
  };

  const pauseDwell = () => {
    if (!dwellTimerRef.current || !dwellStartRef.current) return;
    clearTimeout(dwellTimerRef.current);dwellTimerRef.current = null;
    dwellAccRef.current += Date.now() - dwellStartRef.current;
    dwellStartRef.current = null;
  };

  const setActiveReadKey = (key, commitFn) => {
    cancelDwell();
    if (!key) return; // null = cancel only — never clears a committed position
    // POSITION IS IMMEDIATE (2026-07-19): the resume cursor tracks wherever
    // the user actually IS the moment they land there. Gating it behind a
    // completed dwell sent the reading dot to wherever the LAST completed
    // dwell happened — an older chapter or a different book. The commitFn
    // (the caller's lastReadChapters / lastReadForVol write) runs NOW; the
    // re-armed timer below gates only the reading-streak day record.
    try { if (commitFn) commitFn(); }
    catch (e) { console.warn('read-position commit failed', e); }
    setActiveReadKeyRaw(key);
    dwellKeyRef.current = key;
    if (document.visibilityState === 'visible') scheduleDwell();
  };

  // ── visibilitychange effect ────────────────────────────────────────────
  // Pause dwell timer when the app is hidden; resume when visible again.
  React.useEffect(() => {
    const onVis = () => {if (document.visibilityState === 'hidden') pauseDwell();else scheduleDwell();};
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only listener attach. pauseDwell + scheduleDwell are local plain functions (per the file's "Do NOT useCallback" invariant) whose bodies operate only on dwellTimerRef/dwellAccRef/dwellStartRef/dwellKeyRef/pendingReadCommitRef via .current — stable behavior regardless of identity. Stale-safe.
  }, []);

  // ── Return ─────────────────────────────────────────────────────────────
  return { activeReadKey, setActiveReadKey, cancelDwell };
}

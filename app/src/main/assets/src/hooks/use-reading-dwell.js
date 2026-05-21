/* ═══════════════════════════════════════════════════════════════════════
   useReadingDwell — dwell-timer mark-as-read tracking
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js via tools/build.py.

   OWNS:
     - activeReadKey state (init from initialActiveReadKey for cold-start
                            restore; persisted back to vot-state by
                            useSavedState in App())
     - setActiveReadKeyRaw    (hook-internal; NOT returned)
     - dwellTimerRef          (hook-internal ref)
     - dwellAccRef            (hook-internal ref — accumulated dwell ms)
     - dwellStartRef          (hook-internal ref — last resume timestamp)
     - dwellKeyRef            (hook-internal ref — key being timed)
     - pendingReadCommitRef   (hook-internal ref — optional commit fn)
     - DWELL_MS()             (hook-internal; reads the dwellMs param)
     - commitDwellNow         (hook-internal plain arrow fn; identity
                               churn each render is intentional — the
                               __onDwellCommit bridge effect deps on it)
     - cancelDwell            (returned — also used by setActiveReadKey)
     - scheduleDwell          (hook-internal plain arrow fn)
     - pauseDwell             (hook-internal plain arrow fn)
     - setActiveReadKey       (returned — public setter; wraps
                               cancelDwell + scheduleDwell)
     - __onDwellCommit bridge effect (binds commitDwellNow onto window
                               so ScreenLayout's scroll/fit checks can
                               call it; dep [commitDwellNow] re-binds
                               every render — this is intentional)
     - visibilitychange effect (pauses dwell on hidden, resumes on
                               visible; dep [] — mounted once)

   DOES NOT OWN:
     - window.__onDwellCommit is the cross-module bridge: ScreenLayout.js
       (a Cluster D module) reads it directly. commitDwellNow is exposed
       only through that bridge, not through the hook's return value.
     - The per-volume mark-as-read writes (setLastReadForVol, markRead,
       etc.) remain in App() — they depend on App-local helpers and per-
       collection knowledge; this hook only owns the timing gate.

   PARAMS:
     dwellMs             — current value of settings.dwellMs (number or
                           falsy). If falsy, defaults to 20000 ms (20 s).
     initialActiveReadKey — saved.activeReadKey from useSavedState (the
                           cold-start restore value). MUST be passed
                           explicitly so the hook initialises useState
                           with the persisted value. Passing null here
                           would silently break the reading-dot indicator
                           on relaunch.

   RETURNS: { activeReadKey, setActiveReadKey, cancelDwell }

   STORAGE:
     None directly. activeReadKey is mirrored back into the vot-state
     JSON by useSavedState in App() via the returned activeReadKey value.
   ═══════════════════════════════════════════════════════════════════════ */

export function useReadingDwell({ dwellMs, initialActiveReadKey }) {
  // ── State ──────────────────────────────────────────────────────────────
  const [activeReadKey, setActiveReadKeyRaw] = React.useState(initialActiveReadKey);

  // ── Refs ───────────────────────────────────────────────────────────────
  const dwellTimerRef = React.useRef(null);
  const dwellAccRef = React.useRef(0);
  const dwellStartRef = React.useRef(null);
  const dwellKeyRef = React.useRef(null);
  const pendingReadCommitRef = React.useRef(null);

  // ── DWELL_MS ───────────────────────────────────────────────────────────
  // Returns the effective dwell threshold in ms. Reads the dwellMs param.
  const DWELL_MS = () => dwellMs ? Number(dwellMs) : 20000;

  // ── Plain arrow functions ──────────────────────────────────────────────
  // Do NOT convert any of these to useCallback. commitDwellNow in
  // particular MUST be a plain function recreated each render — the
  // __onDwellCommit bridge effect's [commitDwellNow] dep relies on that
  // identity churn to re-bind the window hook each render.

  const commitDwellNow = () => {
    if (!dwellKeyRef.current) return;
    if (dwellTimerRef.current) {clearTimeout(dwellTimerRef.current);dwellTimerRef.current = null;}
    if (pendingReadCommitRef.current) {pendingReadCommitRef.current();pendingReadCommitRef.current = null;}
    setActiveReadKeyRaw(dwellKeyRef.current);
    dwellAccRef.current = 0;dwellStartRef.current = null;dwellKeyRef.current = null;
  };

  const cancelDwell = () => {
    if (dwellTimerRef.current) {clearTimeout(dwellTimerRef.current);dwellTimerRef.current = null;}
    dwellAccRef.current = 0;dwellStartRef.current = null;dwellKeyRef.current = null;
    pendingReadCommitRef.current = null;
  };

  const scheduleDwell = () => {
    if (!dwellKeyRef.current || dwellTimerRef.current) return;
    const remaining = DWELL_MS() - dwellAccRef.current;
    dwellStartRef.current = Date.now();
    dwellTimerRef.current = setTimeout(() => {
      if (pendingReadCommitRef.current) {pendingReadCommitRef.current();pendingReadCommitRef.current = null;}
      setActiveReadKeyRaw(dwellKeyRef.current);
      dwellTimerRef.current = null;dwellAccRef.current = 0;
      dwellStartRef.current = null;dwellKeyRef.current = null;
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
    dwellKeyRef.current = key;
    pendingReadCommitRef.current = commitFn || null;
    if (document.visibilityState === 'visible') scheduleDwell();
  };

  // ── __onDwellCommit bridge effect ──────────────────────────────────────
  // Expose the commit-now callback for ScreenLayout's scroll/fit checks.
  // dep [commitDwellNow]: identity churn each render intentionally
  // re-binds the bridge so ScreenLayout always holds a fresh reference.
  React.useEffect(() => {
    window.__onDwellCommit = commitDwellNow;
    return () => {if (window.__onDwellCommit === commitDwellNow) window.__onDwellCommit = null;};
  }, [commitDwellNow]);

  // ── visibilitychange effect ────────────────────────────────────────────
  // Pause dwell timer when the app is hidden; resume when visible again.
  React.useEffect(() => {
    const onVis = () => {if (document.visibilityState === 'hidden') pauseDwell();else scheduleDwell();};
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ── Return ─────────────────────────────────────────────────────────────
  return { activeReadKey, setActiveReadKey, cancelDwell };
}

/* ═══════════════════════════════════════════════════════════════════════
   AutoScrollControl — Cluster D (esbuild bundle-d.js)
   ───────────────────────────────────────────────────────────────────────
   The on-screen transport for hands-free reading. ScreenLayout renders it
   on reading screens only (`pager` is passed exclusively by the four
   reading screens) and never inside an inert pager peek — the inert branch
   returns before this point, so a peek can never portal a second control
   onto the live viewport (the duplicate-FAB class of bug).

   PORTALED TO <body>. A position:fixed element rendered inside
   .pager-track is displaced by the swipe-settle transform — a transformed
   ancestor becomes the containing block for fixed descendants. Same fix,
   same reason, as ScriptureSheet / FootnoteSheet / ProphecyExpandToggle.

   DESIGN NOTES:
   - Adjusting speed must never interrupt reading, so ± sit ON the pill.
     (A drag-to-scrub is nicer still and is the obvious v2, but it is also
     the fiddliest interaction here; discrete taps buy the same
     never-leave-the-page property at a fraction of the risk.)
   - IDLE FADE. After ~3s of uninterrupted motion the pill drops to a
     whisper; any touch restores it. Reading text is the product, and
     chrome that stays bright competes with it.
   - MOTION HONESTY. The page never moves without a visible reason: text
     stops, the countdown appears, then the page changes. An unannounced
     jump is the single thing most likely to make this feel broken.
   ═══════════════════════════════════════════════════════════════════════ */

import { useAutoScroll, clampLpm } from '../../hooks/use-autoscroll.js';

/**
 * Reading-transport configuration, provided by App (ReadingChromeProvider).
 * Screen wiring (the scroll container, the pager) arrives as props instead —
 * config is app-wide, wiring is per-screen.
 */
export const AutoScrollContext = React.createContext(null);

const DIM_AFTER_MS = 3000;

function fmtRemaining(ms) {
  if (!ms || ms < 0) return '';
  const mins = Math.round(ms / 60000);
  if (mins >= 1) return '~' + mins + ' min left';
  const secs = Math.max(5, Math.round(ms / 5000) * 5);
  return '~' + secs + 's left';
}

export function AutoScrollControl({ scrollRef, pager, placeKey }) {
  const cfg = React.useContext(AutoScrollContext);
  const enabled = !!(cfg && cfg.enabled);

  const auto = useAutoScroll(scrollRef, {
    enabled,
    speedLpm: cfg ? cfg.speedLpm : 16,
    autoNext: cfg ? cfg.autoNext : false,
    endDwellMs: cfg ? cfg.endDwellMs : 2500,
    keepScreenOnPref: cfg ? cfg.keepScreenOnPref : true,
    placeKey,
    pager,
  });

  const { state, running, advanceAt, start, stop, getProgress } = auto;

  // Marks the app as carrying the pill, so bottom-centre chrome that would
  // collide (the first-run annotation tip) can stand down. Distinct from
  // .autoscroll-running, which the controller toggles per motion.
  React.useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    const on = enabled && !!pager;
    document.body.classList.toggle('autoscroll-on', on);
    return () => document.body.classList.remove('autoscroll-on');
  }, [enabled, pager]);

  // ── Idle fade ────────────────────────────────────────────────────────
  const [dim, setDim] = React.useState(false);
  React.useEffect(() => {
    if (!running) { setDim(false); return undefined; }
    setDim(false);
    const t = setTimeout(() => setDim(true), DIM_AFTER_MS);
    const wake = () => { setDim(false); clearTimeout(t); };
    document.addEventListener('touchstart', wake, { capture: true, passive: true });
    document.addEventListener('pointerdown', wake, { capture: true, passive: true });
    return () => {
      clearTimeout(t);
      document.removeEventListener('touchstart', wake, true);
      document.removeEventListener('pointerdown', wake, true);
    };
  }, [running, state]);

  // ── Readouts ─────────────────────────────────────────────────────────
  // Remaining time while running; the end-dwell countdown while it runs.
  // Both are cheap intervals rather than per-frame state (a 60 Hz setState
  // would re-render the reading screen's whole subtree while it scrolls).
  const [remainingMs, setRemainingMs] = React.useState(0);
  React.useEffect(() => {
    if (state !== 'running') return undefined;
    const read = () => setRemainingMs(getProgress().remainingMs);
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [state, getProgress]);

  const [countdown, setCountdown] = React.useState(0);
  React.useEffect(() => {
    if (state !== 'enddwell' || !advanceAt) { setCountdown(0); return undefined; }
    const read = () => setCountdown(Math.max(0, Math.ceil((advanceAt - Date.now()) / 1000)));
    read();
    const id = setInterval(read, 200);
    return () => clearInterval(id);
  }, [state, advanceAt]);

  if (!enabled || !pager) return null;
  if (typeof document === 'undefined' || !document.body) return null;

  const speed = clampLpm(cfg.speedLpm);
  const bump = (delta) => {
    if (cfg && cfg.onSpeedChange) cfg.onSpeedChange(clampLpm(speed + delta));
  };

  let body;
  if (state === 'enddwell') {
    body = (
      <React.Fragment>
        <span className="ascroll-readout ascroll-readout-wide">
          {countdown > 0 ? 'Next in ' + countdown : 'Next…'}
        </span>
        <button type="button" className="ascroll-btn ascroll-cancel" onClick={stop} aria-label="Cancel auto-advance">
          Cancel
        </button>
      </React.Fragment>
    );
  } else {
    const atEnd = state === 'ended';
    body = (
      <React.Fragment>
        <button
          type="button"
          className="ascroll-btn ascroll-step"
          onClick={() => bump(-2)}
          disabled={speed <= 4}
          aria-label="Slower"
        >−</button>
        <button
          type="button"
          className="ascroll-btn ascroll-toggle"
          onClick={running ? stop : start}
          aria-pressed={running}
          aria-label={running ? 'Pause auto-scroll' : 'Start auto-scroll'}
        >
          {running ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
          )}
        </button>
        <button
          type="button"
          className="ascroll-btn ascroll-step"
          onClick={() => bump(2)}
          disabled={speed >= 40}
          aria-label="Faster"
        >+</button>
        <span className="ascroll-readout" role="status" aria-live="polite">
          {atEnd ? 'End of text'
            : running ? (fmtRemaining(remainingMs) || 'Reading')
              : speed + ' lines/min'}
        </span>
      </React.Fragment>
    );
  }

  return ReactDOM.createPortal(
    <div className={'ascroll-pill' + (dim ? ' is-dim' : '') + (running ? ' is-running' : '')}>
      {body}
    </div>,
    document.body
  );
}

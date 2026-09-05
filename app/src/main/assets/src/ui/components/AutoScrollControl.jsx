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
   - The auto-continue PAUSE is adjustable from here too, for the same
     reason ± are: the moment you want to change it is the moment the
     countdown is on screen, and that is the worst moment to open Settings.
     It rides a second row that only appears when asked, because the
     always-visible pill is already four controls wide on a phone.
   - The words/min readout is MEASURED, not assumed (see measureWordsPerLine).
     If the page cannot be measured, no number is shown — a made-up rate is
     worse than none.
   ═══════════════════════════════════════════════════════════════════════ */

import { useAutoScroll, clampLpm, clampEndDwell, lineHeightOf } from '../../hooks/use-autoscroll.js';
import { onIdle } from '../../utils/on-idle.js';

/**
 * Reading-transport configuration, provided by App (ReadingChromeProvider).
 * Screen wiring (the scroll container, the pager) arrives as props instead —
 * config is app-wide, wiring is per-screen.
 */
export const AutoScrollContext = React.createContext(null);

const DIM_AFTER_MS = 3000;
// Same grain as the Settings slider, so the two writers agree on the values
// that exist. Small enough to fine-tune, big enough that 0→15s is ~30 taps.
const DWELL_STEP_MS = 500;

function fmtRemaining(ms) {
  if (!ms || ms < 0) return '';
  const mins = Math.round(ms / 60000);
  if (mins >= 1) return '~' + mins + ' min left';
  const secs = Math.max(5, Math.round(ms / 5000) * 5);
  return '~' + secs + 's left';
}

/** Dwell label, rendered exactly as the Settings row renders it. */
function fmtDwell(ms) {
  const secs = Math.round(ms / 100) / 10;
  return secs === 0 ? 'None' : secs + 's';
}

/**
 * Words per LAID-OUT LINE on the page currently in front of the reader.
 *
 * The point of this is honesty. Speed is stored in lines/minute; turning it
 * into words/minute needs the one number nothing else in the app knows —
 * how many words a line actually holds. That varies enormously (poetry
 * lines are short and `white-space:nowrap`, verse text is dense, letter
 * prose sits in between), so it is MEASURED per page rather than assumed.
 *
 * COUNTING THE LINES is the only subtle part, because `data-hl-key` is not
 * always on the same kind of box. On a letter it is on the `<p class=
 * "letter-para">` itself — a BLOCK, whose getClientRects() is a single
 * border box no matter how many lines it wraps to. On the verse screens it
 * lands on inline spans, where getClientRects() IS one rect per visual line
 * and height/line-height is a line short (an inline's box spans font boxes,
 * not full line boxes). Taking the LARGER of the two is exact in both
 * regimes and needs no display sniffing.
 *
 * Two things must be skipped. The annotation engine also hangs data-hl-key
 * on the note ICON (zero words — it would drag the average down), and
 * `.letter-para` carries `content-visibility:auto`, so a paragraph the
 * reader has scrolled past is not laid out and collapses to zero height
 * while still reporting all of its text. A zero-height box therefore means
 * "no measurement here", never "one line".
 *
 * COST: this forces synchronous layout. It must never run on the frame path
 * — see the 07-28 responsiveness session. Once per page, in idle time.
 *
 * @returns {number} words per line, or 0 when nothing measurable is on screen
 */
export function measureWordsPerLine(el) {
  if (!el || typeof el.querySelectorAll !== 'function') return 0;
  let words = 0;
  let lines = 0;
  const nodes = el.querySelectorAll('[data-hl-key]');
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const w = String((node && node.textContent) || '').trim().split(/\s+/).filter(Boolean).length;
    if (!w) continue;
    const h = node.getBoundingClientRect ? node.getBoundingClientRect().height : 0;
    if (!(h > 0)) continue;
    const lh = lineHeightOf(node);
    const rects = node.getClientRects ? node.getClientRects().length : 0;
    const n = Math.max(rects, lh > 0 ? Math.round(h / lh) : 0);
    if (!n) continue;
    words += w;
    lines += n;
  }
  return lines > 0 ? words / lines : 0;
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

  // ── Measured words/line ──────────────────────────────────────────────
  // ONCE per page, after paint, off the frame path. requestIdleCallback also
  // keeps the forced layout clear of the post-advance scroll restore, which
  // runs its own frame loop for up to ~1.5s.
  const [wordsPerLine, setWordsPerLine] = React.useState(0);
  React.useEffect(() => {
    setWordsPerLine(0);
    const el = scrollRef && scrollRef.current;
    if (!el) return undefined;
    const read = () => setWordsPerLine(measureWordsPerLine(el));
    // onIdle, not a bare requestIdleCallback: WebKit has never shipped that
    // API, so every iOS reader takes the timer path. utils/on-idle.js.
    return onIdle(read, { timeout: 1500, fallbackDelay: 0 });
  }, [scrollRef, placeKey]);

  // ── Dwell row ────────────────────────────────────────────────────────
  const [dwellOpen, setDwellOpen] = React.useState(false);

  if (!enabled || !pager) return null;
  if (typeof document === 'undefined' || !document.body) return null;

  const speed = clampLpm(cfg.speedLpm);
  const bump = (delta) => {
    if (cfg && cfg.onSpeedChange) cfg.onSpeedChange(clampLpm(speed + delta));
  };

  // MEASURED words/min. lines/min × words-per-line, both real numbers; shown
  // only when the page yielded a measurement.
  const wpm = wordsPerLine > 0 ? Math.round(wordsPerLine * speed) : 0;

  // The dwell knob only exists when there is a dwell: with auto-continue off
  // nothing ever waits, so the button would open a row that controls nothing.
  const dwellMs = clampEndDwell(cfg.endDwellMs);
  const canDwell = !!cfg.autoNext;
  const stepDwell = (delta) => {
    if (cfg && cfg.onDwellChange) cfg.onDwellChange(clampEndDwell(dwellMs + delta));
  };
  /** One ± step. Disabled where the clamp would swallow it. */
  const dwellBtn = (delta, label) => (
    <button
      type="button"
      className="ascroll-btn ascroll-step"
      onClick={() => stepDwell(delta)}
      disabled={clampEndDwell(dwellMs + delta) === dwellMs}
      aria-label={label}
    >{delta < 0 ? '−' : '+'}</button>
  );
  // While the countdown is up, the ± sit inline beside it — so the second row
  // would be a duplicate control (and a duplicate accessible name).
  const showDwellRow = dwellOpen && canDwell && state !== 'enddwell';

  let body;
  if (state === 'enddwell') {
    body = (
      <React.Fragment>
        {dwellBtn(-DWELL_STEP_MS, 'Shorter pause before the next page')}
        <span className="ascroll-readout ascroll-readout-wide">
          {countdown > 0 ? 'Next in ' + countdown : 'Next…'}
        </span>
        {dwellBtn(DWELL_STEP_MS, 'Longer pause before the next page')}
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
        {canDwell ? (
          <button
            type="button"
            className="ascroll-btn ascroll-step ascroll-timer"
            onClick={() => setDwellOpen((v) => !v)}
            aria-pressed={dwellOpen}
            aria-label="Adjust the pause before the next page"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.8 1.7M9 2.6h6" />
            </svg>
          </button>
        ) : null}
        <span className="ascroll-readout" role="status" aria-live="polite">
          {/* [27] wpm leads once measured: pace is a number people know in
              words/min, so ± effectively SETS a wpm target. lines/min stays
              the stored unit (it survives text resizing) and trails. */}
          {atEnd ? 'End of text'
            : running ? (fmtRemaining(remainingMs) || 'Reading')
              : (wpm > 0 ? '~' + wpm + ' wpm · ' + speed + ' lines/min' : speed + ' lines/min')}
        </span>
      </React.Fragment>
    );
  }

  return ReactDOM.createPortal(
    <div className={'ascroll-pill' + (dim ? ' is-dim' : '') + (running ? ' is-running' : '') + (showDwellRow ? ' is-expanded' : '')}>
      <div className="ascroll-row">{body}</div>
      {showDwellRow ? (
        <div className="ascroll-row ascroll-dwell-row">
          <span className="ascroll-dwell-label">Pause</span>
          {dwellBtn(-DWELL_STEP_MS, 'Shorter pause before the next page')}
          <span className="ascroll-dwell-value">{fmtDwell(dwellMs)}</span>
          {dwellBtn(DWELL_STEP_MS, 'Longer pause before the next page')}
        </div>
      ) : null}
    </div>,
    document.body
  );
}

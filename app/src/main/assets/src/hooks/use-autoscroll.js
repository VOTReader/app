/* ═══════════════════════════════════════════════════════════════════════
   useAutoScroll — hands-free reading transport
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-d.js (imported by
   AutoScrollControl, which ScreenLayout renders on reading screens only).

   WHAT THIS IS: not an animation — a TRANSPORT. It owns the reading
   container's scrollTop over time, competes with the user for that same
   property, and must yield instantly and losslessly. Both ways an
   autoscroller feels bad (it fights the finger, or it moves in visible
   steps) are controller problems, not CSS problems.

   STRUCTURE mirrors usePagerGesture: a PURE controller factory
   (`createAutoScroll`) driven by injected I/O — element accessor, frame
   source, clock, metrics, navigation — so it unit-tests with a manual
   clock and no DOM. `useAutoScroll` is the thin React wrapper.

   ┌─ THE SCROLLTOP LEASE ─────────────────────────────────────────────┐
   │ FOUR writers touch this container's scrollTop:                    │
   │   1. the user's finger                                            │
   │   2. use-scroll-memory's startRestore (up to 90 rAF attempts,     │
   │      writing every frame, flagged by body.scroll-restoring)       │
   │   3. the pager's swipe settle                                     │
   │   4. this controller                                              │
   │ At most ONE may write at a time. Every pause rule below is that   │
   │ one invariant applied to a different revoker — which is why the   │
   │ restore interlock, the pointer yield, and the external-nav stop   │
   │ are the same mechanism rather than three ad-hoc special cases.    │
   └───────────────────────────────────────────────────────────────────┘

   MOTION MODEL:
     - rAF + a FLOAT position accumulator, written straight to scrollTop.
       scrollTo({behavior:'smooth'}) is browser-owned and uninterruptible;
       scrollBy() on an interval quantizes to integers and visibly steps.
       The WebView floor is chrome108, where fractional scrollTop is
       native — no integer-batching fallback is needed or wanted.
     - READ-FIRST, then write. Reading scrollTop back AFTER writing it is
       a forced synchronous layout, 60×/second, on the same main thread
       that owns the scroll. We read at the top of the tick and compare
       against the value we last wrote: same information, no thrash.
     - dt is CLAMPED (MAX_DT). A GC pause or a backgrounded tab hands back
       a multi-second delta; without the clamp that teleports the reader
       half a chapter. A dropped frame must lose motion, never bank it.
     - Constant velocity while reading — easing the steady state reads as
       stuttering. Easing lives ONLY in the transitions (ramp in/out), and
       in the brake that glides the page to a stop exactly at the end of
       the body text.

   DRIFT ABSORB IS NOT A PAUSE SIGNAL. Chrome's scroll anchoring rewrites
   scrollTop whenever content above the viewport reflows — lazy images,
   content-visibility resolving real heights, note icons injecting inline.
   That is a legitimate external write to absorb, and emphatically NOT
   user intent. Conflating the two would fire spurious pauses on exactly
   the screens carrying the most annotations. So: POINTER EVENTS OWN
   PAUSE; scroll deltas own resync only.

   END OF PAGE = THE `.reading-end` SENTINEL, not scrollHeight. That
   sentinel sits at the end of BODY TEXT — before the footnote list, the
   ornament divider and the chain-nav cards (LetterView.jsx) — and
   ScreenLayout's reading-progress effect already measures against it.
   Scrolling to scrollHeight would grind the reader through the entire
   footnote apparatus of a Format A letter before advancing. Motion stops
   when the sentinel reaches the viewport bottom; pressing play again
   scrolls on through the footnotes to true bottom.

   AUTO-ADVANCE reuses the pager's own neighbor descriptor, so the
   boundary policy is inherited rather than reimplemented:
     peek('next') === null        → dead end, cannot advance
     desc.kind === 'boundary'     → cross-collection edge, do not auto-cross
     desc.kind === 'screen'       → advance freely
   The navigation runs through commitReadingNav (the same atomic
   flushSync + annotation-apply contract the swipe commit uses), so the
   new page is painted WITH its highlights before the first frame of
   resumed motion.

   NO skipRestore PLUMBING. After an advance the controller waits out
   body.scroll-restoring and then RESYNCS its accumulator from whatever
   scrollTop the app's own scroll memory landed on. That respects the
   existing resume contract, needs no new flag threaded through nav, and
   is robust to the restore doing something we didn't predict.

   RUNAWAY GUARDS (a phone in a pocket must not read the whole Bible):
     - MIN_PAGE_MS floors time-on-page, so a run of short WTLB entries or
       an unscrollable page cannot chain-advance at timer speed.
     - MAX_CHAIN caps consecutive advances with zero user interaction.
   ═══════════════════════════════════════════════════════════════════════ */

import { commitReadingNav } from './use-pager-gesture.js';

// A stall or background tab must lose motion, not bank it.
const MAX_DT = 50;
// Divergence between what we wrote and what we read back that counts as
// "somebody else moved this".
//
// MEASURED (Chromium, devicePixelRatio 1.25): scrollTop accepts fractional
// values but SNAPS them to device pixels — writing 1.3 reads back 1.6, i.e.
// multiples of 1/DPR. So every frame's read-back legitimately differs from
// what we wrote by up to 0.5/DPR px (worst case 0.5 at DPR 1). This
// threshold sits clear of that, so device-pixel snapping is never mistaken
// for an external write, while a real user scroll (orders of magnitude
// larger) still resyncs immediately.
//
// The same measurement is why there is no integer-batching fallback: our
// float accumulator keeps climbing even when a single frame's motion is
// below one device pixel, so slow speeds advance in small visual steps
// rather than stalling.
const DRIFT_PX = 1.5;
const RAMP_IN_MS = 350;
const RAMP_OUT_MS = 250;
// Stillness after the last finger lift before a soft (touch) pause resumes.
const RESUME_IDLE_MS = 1200;
// Floor on time-on-page before an auto-advance may fire.
const MIN_PAGE_MS = 4000;
// Consecutive auto-advances with no user interaction at all.
const MAX_CHAIN = 20;
// Metrics (line height + end target) are re-measured on this cadence rather
// than every frame — a 250 ms-stale line height is invisible, and it keeps
// the per-frame cost to one scrollTop read and one scrollTop write.
const METRICS_TTL_MS = 250;
// Bound on how long we wait for a post-advance scroll restore to settle.
const SETTLE_MAX_MS = 2000;

const MIN_LPM = 4;
const MAX_LPM = 40;
const DEFAULT_LPM = 16;

/** Clamp a lines-per-minute speed into the supported range. */
export function clampLpm(v) {
  const n = parseFloat(String(v));
  if (!Number.isFinite(n)) return DEFAULT_LPM;
  return Math.min(MAX_LPM, Math.max(MIN_LPM, n));
}

/**
 * Resolve the reading line height (px) for a scroll container.
 *
 * Speed is stored as lines/minute, never px/second: this app has a
 * continuous 80–160% text-size slider, and a px/s speed would silently
 * change reading pace by up to 2× when the reader resizes text. Deriving
 * px from a MEASURED line height keeps the stored speed scale-invariant.
 *
 * Probes `[data-hl-key]` — the annotation engine's marker, carried by body
 * text on all four reading screens (verses, letter paragraphs, poetry
 * lines, WTLB entries) — so this is screen-agnostic. getComputedStyle can
 * return the keyword "normal", hence the font-size fallback.
 */
export function measureLineHeight(el) {
  if (!el || typeof el.querySelector !== 'function') return null;
  const probe = el.querySelector('[data-hl-key]');
  if (!probe || typeof getComputedStyle !== 'function') return null;
  let cs;
  try { cs = getComputedStyle(probe); } catch (_e) { return null; }
  if (!cs) return null;
  const lh = parseFloat(cs.lineHeight);
  if (Number.isFinite(lh) && lh > 0) return lh;
  const fs = parseFloat(cs.fontSize);
  if (Number.isFinite(fs) && fs > 0) return fs * 1.5;
  return null;
}

/**
 * scrollTop at which the `.reading-end` sentinel sits at the viewport
 * bottom — i.e. the last body-text line is fully read. Falls back to the
 * true scroll maximum on screens with no sentinel.
 */
export function computeEndTarget(el) {
  if (!el) return 0;
  const max = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
  const sentinel = typeof el.querySelector === 'function' ? el.querySelector('.reading-end') : null;
  if (!sentinel || typeof sentinel.getBoundingClientRect !== 'function') return max;
  const contentTop = (sentinel.getBoundingClientRect().top - el.getBoundingClientRect().top) + el.scrollTop;
  return Math.max(0, Math.min(max, Math.round(contentTop - (el.clientHeight || 0))));
}

/** Smoothstep — eases the ramp without touching the steady-state velocity. */
function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Pure autoscroll controller. See the module header for the model.
 *
 * @param {{
 *   getScrollEl: () => any,
 *   requestFrame: (cb: (ts:number) => void) => any,
 *   cancelFrame: (token:any) => void,
 *   schedule: (fn: () => void, ms:number) => any,
 *   cancelScheduled: (token:any) => void,
 *   now: () => number,
 *   getSpeedLpm: () => number,
 *   autoNext: () => boolean,
 *   endDwellMs: () => number,
 *   canAdvance: () => boolean,
 *   advance: () => void,
 *   isRestoring: () => boolean,
 *   isModalOpen: () => boolean,
 *   hasSelection: () => boolean,
 *   reducedMotion: () => boolean,
 *   setKeepScreenOn: (on:boolean) => void,
 *   setRunningClass: (on:boolean) => void,
 *   onState: (snap:any) => void,
 *   trace: (msg:string) => void
 * }} io
 */
export function createAutoScroll(io) {
  /** @type {'idle'|'running'|'paused'|'enddwell'|'ended'|'advancing'} */
  let state = 'idle';
  let pauseReason = null;
  let destroyed = false;

  // Transport
  let pos = 0;            // float accumulator — the authoritative position
  let lastWritten = 0;    // what we last assigned to scrollTop
  let lastTs = null;
  let gain = 0;           // 0..1 ramp scalar
  let gainTarget = 0;
  let frameToken = null;

  // Metrics cache
  let lineHeight = 0;
  let endTarget = 0;
  let metricsAt = 0;

  // Advance bookkeeping
  let pageStartedAt = 0;
  let chain = 0;
  let advanceAt = 0;
  let dwellToken = null;
  let resumeToken = null;
  let settleToken = null;
  let rampToken = null;
  // A state committed once the ramp-out finishes, rather than instantly.
  let pendingState = null;

  const trace = (msg) => {
    try { if (io.trace) io.trace(msg); } catch (_e) { /* trace must never wedge */ }
  };

  function snapshot() {
    return {
      state,
      pauseReason,
      advanceAt: state === 'enddwell' ? advanceAt : 0,
      speedLpm: clampLpm(io.getSpeedLpm()),
      running: state === 'running' || state === 'advancing',
    };
  }
  function emit() {
    try { if (io.onState) io.onState(snapshot()); } catch (e) { trace('onState threw: ' + e); }
  }
  function setState(next, reason) {
    if (state === next && pauseReason === (reason || null)) return;
    state = next;
    pauseReason = reason || null;
    const active = next === 'running' || next === 'advancing';
    try { io.setRunningClass(active); } catch (_e) { /* cosmetic */ }
    try { io.setKeepScreenOn(active); } catch (_e) { /* best effort */ }
    emit();
  }

  function clearTimers() {
    if (rampToken != null) { try { io.cancelScheduled(rampToken); } catch (_e) { /* ignore */ } rampToken = null; }
    if (dwellToken != null) { try { io.cancelScheduled(dwellToken); } catch (_e) { /* ignore */ } dwellToken = null; }
    if (resumeToken != null) { try { io.cancelScheduled(resumeToken); } catch (_e) { /* ignore */ } resumeToken = null; }
    if (settleToken != null) { try { io.cancelFrame(settleToken); } catch (_e) { /* ignore */ } settleToken = null; }
  }
  function stopFrames() {
    if (frameToken != null) { try { io.cancelFrame(frameToken); } catch (_e) { /* ignore */ } frameToken = null; }
    lastTs = null;
  }

  function refreshMetrics(el, force) {
    const t = io.now();
    if (!force && metricsAt && (t - metricsAt) < METRICS_TTL_MS) return;
    metricsAt = t;
    const lh = measureLineHeight(el);
    if (lh) lineHeight = lh;
    endTarget = computeEndTarget(el);
  }

  function pxPerSec() {
    const lh = lineHeight > 0 ? lineHeight : 24;
    return clampLpm(io.getSpeedLpm()) * lh / 60;
  }

  /** Resync the accumulator + metrics to a freshly-owned container. */
  function resetForPage(el) {
    pos = el.scrollTop || 0;
    lastWritten = pos;
    lastTs = null;
    metricsAt = 0;
    refreshMetrics(el, true);
    pageStartedAt = io.now();
  }

  function beginRunning() {
    const el = io.getScrollEl();
    if (!el) { setState('ended', 'no-container'); return; }
    clearTimers();
    pendingState = null;
    pos = el.scrollTop || 0;
    lastWritten = pos;
    lastTs = null;
    refreshMetrics(el, true);
    gainTarget = 1;
    if (io.reducedMotion()) gain = 1;
    setState('running');
    if (frameToken == null) frameToken = io.requestFrame(tick);
  }

  /**
   * Yield the lease.
   *
   * `instant` is the default for every involuntary revoker (finger down, a
   * modal opening, the tab hiding): the user is touching the screen and a
   * ramped stop reads as lag. Only a DELIBERATE stop — the control's own
   * pause button, or gliding into the end of the text — decelerates.
   */
  function pause(reason, opts) {
    const instant = !(opts && opts.ramp) || io.reducedMotion();
    const target = (reason === 'end') ? 'endreached' : 'paused';
    if (state !== 'running') {
      // Not moving, but a dwell countdown or a queued resume may still be
      // armed and would restart motion behind the pause. Kill both, and
      // record the intent so the reason is honest in the snapshot.
      clearTimers();
      stopFrames();
      setState('paused', reason);
      return;
    }
    if (resumeToken != null) { try { io.cancelScheduled(resumeToken); } catch (_e) { /* ignore */ } resumeToken = null; }
    if (instant) {
      gain = 0; gainTarget = 0;
      stopFrames();
      commitStop(target, reason);
      return;
    }
    gainTarget = 0;
    pendingState = { target, reason };
    // RAMP WATCHDOG. A ramped stop commits when the ramp reaches zero — which
    // requires frames. If they stop arriving mid-ramp (the tab hides, the
    // engine throttles rAF), the pending stop would never commit and we would
    // hold the wake lock + the capture-suppressing body class indefinitely.
    // Timers still fire when frames don't, so this is the honest backstop.
    if (rampToken != null) { try { io.cancelScheduled(rampToken); } catch (_e) { /* ignore */ } }
    rampToken = io.schedule(() => {
      rampToken = null;
      if (destroyed || !pendingState) return;
      trace('ramp-out did not complete in time — forcing the stop');
      gain = 0; gainTarget = 0;
      stopFrames();
      const p = pendingState;
      commitStop(p.target, p.reason);
    }, RAMP_OUT_MS * 4);
  }

  function commitStop(target, reason) {
    pendingState = null;
    if (rampToken != null) { try { io.cancelScheduled(rampToken); } catch (_e) { /* ignore */ } rampToken = null; }
    if (target === 'endreached') { reachedEnd(); return; }
    setState('paused', reason);
  }

  /** End of body text. Decide between chaining onward and stopping. */
  function reachedEnd() {
    stopFrames();
    if (!io.autoNext()) { setState('ended', 'end-of-page'); return; }
    if (!io.canAdvance()) { setState('ended', 'boundary'); return; }
    if (chain >= MAX_CHAIN) { trace('chain cap reached (' + chain + ') — stopping'); setState('ended', 'chain-cap'); return; }
    // The dwell is whichever is longer: the configured end dwell, or the
    // remainder of the minimum time-on-page. A page shorter than the
    // viewport reaches "the end" immediately and would otherwise chain at
    // timer speed.
    const configured = Math.max(0, io.endDwellMs());
    const minRemain = (pageStartedAt + MIN_PAGE_MS) - io.now();
    const wait = Math.max(configured, minRemain, 0);
    advanceAt = io.now() + wait;
    setState('enddwell', 'end-of-page');
    dwellToken = io.schedule(doAdvance, wait);
  }

  function doAdvance() {
    dwellToken = null;
    if (destroyed || state !== 'enddwell') return;
    chain += 1;
    setState('advancing');
    try {
      io.advance();
    } catch (e) {
      trace('advance threw: ' + e);
      setState('ended', 'advance-failed');
      return;
    }
    waitForSettle();
  }

  /**
   * After navigating, the app's own scroll restore may own scrollTop for up
   * to ~1.5s (startRestore's 90-frame loop). Wait it out, then resync to
   * wherever it landed rather than assuming top.
   */
  function waitForSettle() {
    const deadline = io.now() + SETTLE_MAX_MS;
    const step = () => {
      settleToken = null;
      if (destroyed || state !== 'advancing') return;
      const el = io.getScrollEl();
      const timedOut = io.now() > deadline;
      if (el && (!io.isRestoring() || timedOut)) {
        if (timedOut) trace('post-advance restore did not settle within ' + SETTLE_MAX_MS + 'ms');
        resetForPage(el);
        beginRunning();
        return;
      }
      if (!el && timedOut) { setState('ended', 'no-container'); return; }
      settleToken = io.requestFrame(step);
    };
    settleToken = io.requestFrame(step);
  }

  function tick(ts) {
    frameToken = null;
    if (destroyed) return;
    const el = io.getScrollEl();
    if (!el) { stopFrames(); setState('ended', 'no-container'); return; }

    // A modal can open without any pointer landing on the reader (a deep
    // link, a bridge callback). Map.size — cheap enough per frame.
    if (io.isModalOpen()) { gain = 0; gainTarget = 0; stopFrames(); commitStop('paused', 'modal'); return; }

    const t = (typeof ts === 'number' && Number.isFinite(ts)) ? ts : io.now();
    const dt = lastTs == null ? 0 : Math.min(Math.max(t - lastTs, 0), MAX_DT);
    lastTs = t;

    // LEASE INTERLOCK — startRestore owns scrollTop right now. Idle the
    // frame: do not write, do not accumulate, do not treat its writes as
    // user intent. Track its position so we resume from where it lands.
    if (io.isRestoring()) {
      pos = el.scrollTop || 0;
      lastWritten = pos;
      frameToken = io.requestFrame(tick);
      return;
    }

    // READ-FIRST drift absorb (never a pause — see the module header).
    const actual = el.scrollTop || 0;
    if (Math.abs(actual - lastWritten) > DRIFT_PX) pos = actual;

    refreshMetrics(el, false);

    // Ramp toward the current target.
    if (io.reducedMotion()) {
      gain = gainTarget;
    } else if (gain !== gainTarget) {
      const rampMs = gainTarget > gain ? RAMP_IN_MS : RAMP_OUT_MS;
      const step = rampMs > 0 ? (dt / rampMs) : 1;
      gain = gainTarget > gain ? Math.min(gainTarget, gain + step) : Math.max(gainTarget, gain - step);
    }

    const speed = pxPerSec();
    const remaining = endTarget - pos;

    // BRAKE — begin decelerating just before the end so the page glides to
    // rest exactly at the last line of body text instead of stopping dead.
    if (gainTarget === 1 && remaining <= (speed * (RAMP_OUT_MS / 1000) * 0.5)) {
      gainTarget = 0;
      pendingState = { target: 'endreached', reason: 'end' };
    }

    if (dt > 0 && gain > 0) pos += speed * smoothstep(gain) * (dt / 1000);
    if (pos >= endTarget) pos = endTarget;
    if (pos < 0) pos = 0;

    el.scrollTop = pos;
    lastWritten = pos;

    // Ramp finished — commit whatever stop was queued.
    if (gainTarget === 0 && gain <= 0) {
      stopFrames();
      if (pendingState) { const p = pendingState; commitStop(p.target, p.reason); }
      else setState('paused', pauseReason || 'user');
      return;
    }
    // Reached the end without the brake having had room to run (a very
    // short page, or a speed change mid-glide).
    if (pos >= endTarget && gainTarget === 1) {
      gainTarget = 0;
      pendingState = { target: 'endreached', reason: 'end' };
    }
    frameToken = io.requestFrame(tick);
  }

  return {
    /** Begin (or resume) reading motion. */
    start() {
      if (destroyed) return;
      if (state === 'running') return;
      if (io.isModalOpen() || io.hasSelection()) { setState('paused', 'blocked'); return; }
      chain = 0;
      beginRunning();
    },
    /** Deliberate stop — this one decelerates. */
    stop() {
      if (destroyed) return;
      clearTimers();
      if (state === 'running') pause('user', { ramp: true });
      else { stopFrames(); setState('paused', 'user'); }
    },
    toggle() {
      if (state === 'running' || state === 'enddwell' || state === 'advancing') this.stop();
      else this.start();
    },
    /**
     * A finger landed on the reader. Yield instantly — latency here is felt
     * directly — and remember that a soft resume is owed.
     */
    pointerDown() {
      if (destroyed) return;
      // Any real interaction clears the runaway chain: the reader is present.
      chain = 0;
      if (resumeToken != null) { try { io.cancelScheduled(resumeToken); } catch (_e) { /* ignore */ } resumeToken = null; }
      if (state === 'running') pause('touch');
      else if (state === 'enddwell') { clearTimers(); setState('paused', 'touch'); }
    },
    /** Finger lifted — resume after stillness, unless something blocks it. */
    pointerUp() {
      if (destroyed) return;
      if (state !== 'paused' || pauseReason !== 'touch') return;
      if (resumeToken != null) { try { io.cancelScheduled(resumeToken); } catch (_e) { /* ignore */ } }
      resumeToken = io.schedule(() => {
        resumeToken = null;
        if (destroyed || state !== 'paused' || pauseReason !== 'touch') return;
        // A live selection or an open sheet converts the soft pause into a
        // hard one — resuming under either is hostile.
        if (io.hasSelection() || io.isModalOpen()) { setState('paused', 'blocked'); return; }
        beginRunning();
      }, RESUME_IDLE_MS);
    },
    /**
     * A navigation this controller did not initiate (a swipe, a tap, a deep
     * link). Always a hard stop: motion continuing onto a page the reader
     * chose themselves is disorienting.
     */
    externalNav() {
      if (destroyed) return;
      clearTimers();
      stopFrames();
      gain = 0; gainTarget = 0; pendingState = null;
      if (state !== 'idle') setState('paused', 'nav');
    },
    /** Tab hidden. Pause and STAY paused — never resume motion unwatched. */
    hidden() {
      if (destroyed) return;
      clearTimers();
      if (state === 'idle' || state === 'paused') return;
      gain = 0; gainTarget = 0; pendingState = null;
      stopFrames();
      setState('paused', 'hidden');
    },
    /** Live speed change — no restart, no discontinuity. */
    setSpeed() {
      if (destroyed) return;
      const el = io.getScrollEl();
      if (el) refreshMetrics(el, true);
      emit();
    },
    /** Remaining reading time at the current speed, for the control's readout. */
    getProgress() {
      const el = io.getScrollEl();
      if (!el) return { remainingMs: 0, atEnd: true };
      const speed = pxPerSec();
      const remaining = Math.max(0, endTarget - pos);
      return {
        remainingMs: speed > 0 ? Math.round((remaining / speed) * 1000) : 0,
        atEnd: remaining <= 1,
      };
    },
    getState() { return snapshot(); },
    destroy() {
      destroyed = true;
      clearTimers();
      stopFrames();
      try { io.setRunningClass(false); } catch (_e) { /* ignore */ }
      try { io.setKeepScreenOn(false); } catch (_e) { /* ignore */ }
    },
    // TEST-ONLY introspection.
    _internals() { return { pos, gain, endTarget, lineHeight, chain }; },
  };
}

/**
 * React wrapper. Owns the listeners and the browser-side I/O; the
 * controller owns every decision.
 *
 * @param {{current:any}} scrollRef  the live `.screen-scroll` element ref
 * @param {{
 *   enabled: boolean,
 *   speedLpm: number,
 *   autoNext: boolean,
 *   endDwellMs: number,
 *   keepScreenOnPref: boolean,
 *   placeKey: string,
 *   pager: any
 * }} opts
 */
export function useAutoScroll(scrollRef, opts) {
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  const ctrlRef = React.useRef(null);
  const [snap, setSnap] = React.useState({ state: 'idle', pauseReason: null, advanceAt: 0, speedLpm: DEFAULT_LPM, running: false });
  // Distinguishes our own auto-advance from a navigation the user drove.
  const selfNavRef = React.useRef(false);

  const enabled = !!opts.enabled;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return undefined;

    const ctrl = createAutoScroll({
      getScrollEl: () => scrollRef.current,
      requestFrame: (cb) => (typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(cb)
        : setTimeout(() => cb(Date.now()), 16)),
      cancelFrame: (tok) => {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(tok);
        clearTimeout(tok);
      },
      schedule: (fn, ms) => setTimeout(fn, ms),
      cancelScheduled: (tok) => clearTimeout(tok),
      now: () => Date.now(),
      getSpeedLpm: () => optsRef.current.speedLpm,
      autoNext: () => !!optsRef.current.autoNext,
      endDwellMs: () => optsRef.current.endDwellMs,
      canAdvance: () => {
        const p = optsRef.current.pager;
        if (!p || typeof p.peek !== 'function') return false;
        let desc = null;
        try { desc = p.peek('next'); } catch (_e) { return false; }
        // A boundary card is a cross-collection edge (end of a book, of a
        // volume, of a study) — stop there rather than silently crossing.
        return !!(desc && desc.kind === 'screen');
      },
      advance: () => {
        const p = optsRef.current.pager;
        if (!p || !p.onNext) return;
        selfNavRef.current = true;
        // Same atomic contract as the swipe commit: the new DOM plus its
        // annotation layers land in ONE task, so motion never resumes over
        // an unmarked page that then reflows as note icons inject.
        commitReadingNav(() => p.onNext());
      },
      isRestoring: () => typeof document !== 'undefined'
        && !!document.body && document.body.classList.contains('scroll-restoring'),
      isModalOpen: () => {
        try { return typeof modalRegistry !== 'undefined' && modalRegistry.isAnyOpen(); }
        catch (_e) { return false; }
      },
      hasSelection: () => {
        try {
          return typeof window !== 'undefined' && !!window.getSelection
            && String(window.getSelection()).length > 0;
        } catch (_e) { return false; }
      },
      reducedMotion: () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      setKeepScreenOn: (on) => {
        try {
          if (typeof PlatformBridge === 'undefined' || !PlatformBridge.setKeepScreenOn) return;
          // Releasing must not clobber the user's own global preference —
          // MainViewModel defaults keepScreenOnEnabled true and MainActivity
          // re-applies it on resume, so we re-assert that value rather than
          // blindly turning the flag off.
          PlatformBridge.setKeepScreenOn(on ? true : !!optsRef.current.keepScreenOnPref);
        } catch (_e) { /* best effort */ }
      },
      setRunningClass: (on) => {
        try {
          if (typeof document === 'undefined' || !document.body) return;
          document.body.classList.toggle('autoscroll-running', !!on);
        } catch (_e) { /* cosmetic */ }
      },
      onState: (s) => setSnap(s),
      trace: (msg) => {
        try { console.warn('[autoscroll] ' + msg); } catch (_e) { /* never wedge */ }
        try {
          if (typeof DiagnosticLog !== 'undefined' && DiagnosticLog && DiagnosticLog.error) {
            DiagnosticLog.error('autoscroll', msg);
          }
        } catch (_e) { /* ignore */ }
      },
    });
    ctrlRef.current = ctrl;

    const onDown = () => ctrl.pointerDown();
    const onUp = () => ctrl.pointerUp();
    const onVis = () => { if (document.visibilityState === 'hidden') ctrl.hidden(); };
    // Capture phase, passive: the yield must not be starvable by the pager's
    // or the tap-suppressor's own handlers, and it never needs to cancel.
    el.addEventListener('touchstart', onDown, { capture: true, passive: true });
    el.addEventListener('mousedown', onDown, { capture: true, passive: true });
    document.addEventListener('touchend', onUp, { capture: true, passive: true });
    document.addEventListener('touchcancel', onUp, { capture: true, passive: true });
    document.addEventListener('mouseup', onUp, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVis);
    // Wheel means the reader took over deliberately (desktop).
    const onWheel = () => { ctrl.pointerDown(); ctrl.pointerUp(); };
    el.addEventListener('wheel', onWheel, { capture: true, passive: true });

    return () => {
      el.removeEventListener('touchstart', onDown, true);
      el.removeEventListener('mousedown', onDown, true);
      el.removeEventListener('wheel', onWheel, true);
      document.removeEventListener('touchend', onUp, true);
      document.removeEventListener('touchcancel', onUp, true);
      document.removeEventListener('mouseup', onUp, true);
      document.removeEventListener('visibilitychange', onVis);
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, [scrollRef, enabled]);

  // A navigation we did not initiate is a hard stop. Our own auto-advance
  // sets selfNavRef first, so it passes through without stopping itself.
  const placeKey = opts.placeKey;
  React.useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    if (selfNavRef.current) { selfNavRef.current = false; return; }
    ctrl.externalNav();
  }, [placeKey]);

  // Live speed edits reach the running controller without a restart.
  const speedLpm = opts.speedLpm;
  React.useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.setSpeed();
  }, [speedLpm]);

  return {
    state: snap.state,
    running: snap.running,
    advanceAt: snap.advanceAt,
    pauseReason: snap.pauseReason,
    toggle: React.useCallback(() => { if (ctrlRef.current) ctrlRef.current.toggle(); }, []),
    start: React.useCallback(() => { if (ctrlRef.current) ctrlRef.current.start(); }, []),
    stop: React.useCallback(() => { if (ctrlRef.current) ctrlRef.current.stop(); }, []),
    getProgress: React.useCallback(() => (ctrlRef.current ? ctrlRef.current.getProgress() : { remainingMs: 0, atEnd: true }), []),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   usePagerGesture — visible finger-follow page swipe (ViewPager2-style)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-d.js (imported by ScreenLayout).

   Replaces the invisible release-only `useSwipeNav`. The page (the
   `.pager-track` wrapper) translates 1:1 with the finger in real time while an
   INERT neighbor preview (PagerPeek, pager-preview.jsx) slides in from the
   edge; on release past a distance/velocity threshold it settles and commits
   via the SAME onNext/onPrev the screen already computes; below threshold it
   springs back. Rubber-bands at true ends. Honors prefers-reduced-motion
   (no animation → behaves like the old instant swap).

   STRUCTURE: a PURE controller factory (`createPagerGesture`) holds all the
   logic and is driven by injected I/O (element accessors + callbacks), so it
   unit-tests with plain synthetic touch objects — no real TouchEvent/DOM
   needed. `usePagerGesture` is the thin React wrapper that wires the
   controller to the scroll container's touch listeners and owns the peek
   mount state. The decision primitives (decideAxis / isCommit / rubberBand /
   velocityFromSamples) are exported for direct testing.

   COEXISTENCE: touchstart/touchmove are element-level bubble-phase;
   ScreenLayout's capture-phase tap-suppressor still sees touches first. They
   partition on axis — the suppressor only acts on vertical lifts (dy>8 &&
   dy>dx), the pager only engages on horizontal intent (|dx|>|dy|*1.3) — so
   neither fights the other. __scrollEl, scroll-memory, and the annotation
   engine are untouched: a child transform changes no scrollTop/scrollHeight,
   and the peek carries no data-hl-* so every annotation pass ignores it.

   ROBUSTNESS (press-drag parity, 2026-07-18): the same lifecycle hardening
   the four drag surfaces got in the tab-drag rebuild:
     - touchend/touchcancel are handled at DOCUMENT CAPTURE — propagation's
       first node, which nothing can starve. The documented on-device WebView
       failure (a gesture's end delivered non-bubbling, e4d0be8) can therefore
       never strand a swipe with the page frozen mid-slide.
     - The gesture tracks its OWN touch identifier. Foreign fingers landing,
       moving, or lifting mid-swipe are ignored entirely — a stray second
       touch can no longer end (or corrupt the dx of) the primary drag.
     - A move event whose touch list no longer contains our finger means the
       OS dropped the stream without telling us → the gesture ends NOW with
       the commit decision its frozen position earns (drags commit — same
       policy as press-drag's pointercancel), and traces.
     - ZOMBIE WATCHDOG: a gesture whose stream has been event-silent >2.5s
       ends itself the same way (armed per event; a silent gesture can't
       keep the track translated forever).
     - FORCE-RESET: a new touchstart while a leaked gesture is live resets
       the track + peeks instantly and starts clean — no wedged state can
       ever refuse the next swipe.
     - Every abnormal path traces via io.trace → "[pageswipe] …" (console +
       DiagnosticLog) so a failing device names itself.
   ═══════════════════════════════════════════════════════════════════════ */

// Begin a gesture only past this px slop; matches ScreenLayout's tap-suppressor.
const SLOP = 8;
// Settle animation: a decelerate curve ≈ Android FastOutSlowInInterpolator.
const SETTLE_MS = 300;            // ≥ the CSS transition (280ms) + a small buffer
const SETTLE_TRANSITION = 'transform 0.28s cubic-bezier(0.2, 0, 0, 1)';

/**
 * Lock the gesture axis on the first significant move. Horizontal must clearly
 * dominate (×1.3) so vertical reading-scroll wins ties — reading-scroll is
 * sacred. Returns 'x' (pager), 'y' (native scroll), or null (below slop).
 * @param {number} dx @param {number} dy @param {number} [slop]
 * @returns {'x'|'y'|null}
 */
export function decideAxis(dx, dy, slop = SLOP) {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
}

/**
 * Native-feel commit decision (retuned 2026-07-19, owner-directed — the old
 * 35%-width + 0.5px/ms flick committed nearly every partial drag, so
 * "release part-way and return to the page you were on" effectively never
 * happened and slow drags snapped early). ViewPager2 semantics:
 *   - a REAL flick (>0.65 px/ms) TOWARD the neighbor commits from a modest
 *     distance (10% width) — a quick page-turn gesture stays effortless;
 *   - a release while clearly moving BACK toward the origin (>0.25 px/ms)
 *     never commits, even past halfway — the user changed their mind;
 *   - a slow release commits only past HALF the viewport — the page follows
 *     the finger, and wherever most of the screen sits at release wins.
 * @param {number} dx @param {number} vx @param {number} width
 * @returns {boolean}
 */
export function isCommit(dx, vx, width) {
  const adx = Math.abs(dx);
  if (width <= 0 || dx === 0) return false;
  const sameDir = dx < 0 ? vx < 0 : vx > 0;
  if (sameDir && Math.abs(vx) > 0.65 && adx > width * 0.1) return true;
  if (!sameDir && Math.abs(vx) > 0.25) return false;
  return adx > width * 0.5;
}

/**
 * Asymptotic resistance for a drag with no target (dead end) — the page can be
 * tugged a little but never escapes, and always springs back.
 * @param {number} dx @param {number} width @returns {number}
 */
export function rubberBand(dx, width) {
  if (width <= 0) return 0;
  const sign = dx < 0 ? -1 : 1;
  const a = Math.abs(dx);
  return sign * width * 0.18 * (1 - 1 / (a / (width * 0.55) + 1));
}

// Below this many ms of temporal separation there isn't enough signal to
// trust a velocity — return 0 rather than dividing by a near-zero dt (which
// would manufacture a huge "flick" from coalesced/degenerate timestamps and
// commit a tiny drag that should spring back). ~half a frame; a real flick's
// window is ~30ms (see the scan below), well clear of this.
const MIN_VELOCITY_DT = 8;

/**
 * Fling velocity (px/ms) from recent {x,t} samples — the delta over the last
 * ~30ms+ window. 0 when there isn't enough signal.
 * @param {{x:number,t:number}[]} samples @returns {number}
 */
export function velocityFromSamples(samples) {
  if (!samples || samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let ref = samples[0];
  for (let i = samples.length - 2; i >= 0; i--) {
    ref = samples[i];
    if (last.t - samples[i].t >= 30) break;
  }
  const dt = last.t - ref.t;
  if (dt < MIN_VELOCITY_DT) return 0;
  return (last.x - ref.x) / dt;
}

/**
 * Pure gesture controller. All logic; no React, no real DOM required.
 *
 * Both neighbor peeks are pre-mounted by ScreenLayout and parked off-screen
 * at their CSS ±100% defaults. The controller drives whichever peek is active
 * via getPeek(dir). No React state is mutated during the swipe — eliminating
 * the main-thread stall + late-mount snap that caused visual artifacts.
 *
 * @param {{
 *   getWidth: () => number,
 *   getTrack: () => any,
 *   getPeek: (dir: 'prev'|'next') => any,
 *   peekFor: (side: 'prev'|'next') => any,
 *   commit: (side: 'prev'|'next') => void,
 *   reducedMotion: () => boolean,
 *   schedule: (fn: () => void, ms?: number) => any,
 *   cancelScheduled?: (token: any) => void,
 *   hasSelection?: () => boolean,
 *   trace?: (msg: string) => void
 * }} io
 */
// A gesture whose stream has produced no events for this long is a zombie
// (silently-killed touch stream — the on-device WebView failure).
const SWIPE_SILENT_MS = 2500;
// Watchdog check delay — re-armed on every event, so when it fires the
// gesture is guaranteed silent for its full delay.
const SWIPE_WATCHDOG_MS = 3000;

export function createPagerGesture(io) {
  let s = null;          // active gesture, or null
  let settling = false;  // true while a settle animation is running
  let settleToken = null; // pending settle timer (cancelled on dispose)
  let watchdogToken = null; // pending zombie check (re-armed per event)

  const trace = (msg) => { try { if (io.trace) io.trace(msg); } catch (_e) { /* trace must never wedge */ } };

  /** Find OUR touch in a TouchList-ish array by identifier. */
  const findTouch = (touches, id) => {
    if (!touches) return null;
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === id) return touches[i];
    }
    return null;
  };

  const setStyle = (el, transition, transform) => {
    if (!el || !el.style) return;
    el.style.transition = transition;
    el.style.transform = transform;
  };

  // Park a peek back at its CSS rest position (off-screen at ±100%) and
  // de-promote it. Used when the finger reverses across the origin so the
  // no-longer-active peek can't stay stuck half-on-screen.
  function parkPeek(dir) {
    const pk = io.getPeek(dir);
    if (pk && pk.style) { pk.style.transition = 'none'; pk.style.transform = ''; pk.style.willChange = ''; }
  }

  // Reset the track to its rest position with NO animation. Used by the
  // force-reset path — a leaked gesture may have left the track translated
  // mid-drag, and the new gesture must begin from a clean baseline
  // immediately (a spring-back settle here would set `settling` and refuse
  // the very touchstart that triggered the reset).
  function resetTrack() {
    const tr = io.getTrack();
    if (tr && tr.style) { tr.style.transition = 'none'; tr.style.transform = ''; tr.style.willChange = ''; }
  }

  function disarmWatchdog() {
    if (watchdogToken != null && io.cancelScheduled) io.cancelScheduled(watchdogToken);
    watchdogToken = null;
  }

  // Re-armed on every gesture event, so a firing check means the stream has
  // been silent for the full delay. Synchronous-scheduler test hosts self-
  // neutralize here (silent≈0 → no-op, no re-arm → no recursion).
  function armWatchdog() {
    disarmWatchdog();
    watchdogToken = io.schedule(() => {
      watchdogToken = null;
      if (!s) return;
      const silent = Date.now() - s.lastEventTs;
      if (silent < SWIPE_SILENT_MS) return;
      endGesture('commit-decide', s.axis === 'x' ? 'zombie swipe healed (stream silent ' + silent + 'ms)' : null);
    }, SWIPE_WATCHDOG_MS);
  }

  // Park BOTH peeks back to their CSS rest position. Called at the start of every
  // gesture so a new swipe begins from a known-clean baseline even if a prior
  // gesture left a peek mid-transform (a stream that died silently, a foreign
  // state leak). The committed peek used to sit at translateX(0) covering the
  // screen until a deferred rAF parked it — that window is gone (finishSettle
  // now parks synchronously, see ATOMIC REVEAL below) — but this stays as the
  // belt-and-braces guarantee that two panes can never coexist ("split screen").
  function parkAllPeeks() {
    parkPeek('prev');
    parkPeek('next');
  }

  // Resolve the active direction + its target descriptor and promote the track +
  // the active peek to a compositing layer. Called at axis-lock AND whenever the
  // finger reverses past the start point mid-drag: the page must follow into the
  // OPPOSITE neighbor (ViewPager2 behavior) instead of sliding into empty space
  // with the wrong peek frozen off-screen — that stale state is what "cut off
  // the screen" on a part-swipe-then-reverse. The previously-active peek (if any)
  // is parked first so only one neighbor is ever in flight.
  function setDir(st, dir) {
    if (st.dir === dir) return;
    if (st.dir) parkPeek(st.dir);
    st.dir = dir;
    st.desc = io.peekFor(dir) || null;     // null = dead end → rubber-band only
    const trk = io.getTrack();
    const pk = io.getPeek(dir);
    if (trk && trk.style) trk.style.willChange = 'transform';
    if (pk && pk.style) pk.style.willChange = 'transform';
  }

  function applyDrag(dx, dir, width) {
    setStyle(io.getTrack(), 'none', `translateX(${dx}px)`);
    const pk = io.getPeek(dir);
    if (pk) {
      const base = dir === 'next' ? width : -width;
      setStyle(pk, 'none', `translateX(${base + dx}px)`);
    }
  }

  function finishSettle(committed, dir) {
    settling = false;
    settleToken = null;
    const tr = io.getTrack();
    const pk = io.getPeek(dir);
    // Snap the track back to its rest position (transform: none).
    if (tr && tr.style) { tr.style.transition = 'none'; tr.style.transform = ''; }
    if (committed) {
      // ATOMIC REVEAL (2026-07-19). io.commit is a SYNCHRONOUS contract: the
      // React wrapper flushes the navigation render (flushSync — new DOM plus
      // layout effects, so the scroll restore is applied) AND the imperative
      // annotation paint before returning. The live pane is therefore fully
      // presentable the moment commit returns, and the peek parks in this
      // SAME task — no intermediate frame can ever paint. The old path queued
      // the commit (async default-priority render under createRoot) and
      // parked the peek on a blind rAF, assuming React's MessageChannel task
      // would beat the next vsync; when it lost that race (routine on a
      // loaded Android main thread) the browser painted ONE FRAME of the OLD
      // page snapped back to rest — old scroll, no marks — before the render
      // landed: the owner's brief per-swipe glitch. Never reintroduce a
      // scheduled gap between commit and the peek park.
      if (pk && pk.style) { pk.style.transition = 'none'; }
      io.commit(dir);
      if (tr && tr.style) tr.style.willChange = '';
      if (pk && pk.style) { pk.style.transform = ''; pk.style.willChange = ''; }
    } else {
      // Spring-back: park the peek and de-promote both layers immediately.
      if (pk && pk.style) { pk.style.transition = 'none'; pk.style.transform = ''; pk.style.willChange = ''; }
      if (tr && tr.style) tr.style.willChange = '';
    }
  }

  // Boundary commit (the target is the next/prev BOOK, not a same-collection
  // page): navigate NOW, in the touchend task, with track + peek reset to rest
  // in the same tick. The card peek is honest feedback DURING the drag, but it
  // is not the destination — animating it fullscreen for SETTLE_MS and only
  // then navigating read as "a black screen with a card flashes before the
  // next book" (owner-reported). React flushes the discrete-event update
  // before the next paint, so the reveal is one atomic frame: old page and
  // card gone, next book on screen. No settle state → nothing to dispose,
  // and the settle-outlives-the-screen double-commit hazard can't exist here.
  function instantCommit(dir) {
    const tr = io.getTrack();
    const pk = io.getPeek(dir);
    if (tr && tr.style) { tr.style.transition = 'none'; tr.style.transform = ''; tr.style.willChange = ''; }
    if (pk && pk.style) { pk.style.transition = 'none'; pk.style.transform = ''; pk.style.willChange = ''; }
    io.commit(dir);
  }

  function beginSettle(committed, dir, width) {
    const trackEnd = committed ? (dir === 'next' ? -width : width) : 0;
    const peekEnd = committed ? 0 : (dir === 'next' ? width : -width);
    if (io.reducedMotion()) { finishSettle(committed, dir); return; }
    settling = true;
    setStyle(io.getTrack(), SETTLE_TRANSITION, `translateX(${trackEnd}px)`);
    const pk = io.getPeek(dir);
    if (pk) setStyle(pk, SETTLE_TRANSITION, `translateX(${peekEnd}px)`);
    settleToken = io.schedule(() => finishSettle(committed, dir), SETTLE_MS);
  }

  // THE single exit path — every ending (normal lift, cancel, heal, force-
  // reset) funnels through here, idempotently (a second call finds s null).
  //   mode 'commit-decide' — full threshold/velocity decision (normal end,
  //                          finger-gone heal, zombie heal)
  //   mode 'spring'        — spring back, never commit (touchcancel)
  //   mode 'instant-reset' — no animation at all (force-reset at a new
  //                          touchstart; the caller starts a fresh gesture
  //                          in the same tick)
  function endGesture(mode, traceMsg) {
    if (!s) return;
    const st = s;
    s = null;
    disarmWatchdog();
    if (traceMsg) trace(traceMsg + ' — dx ' + Math.round(st.dx));
    if (st.axis !== 'x') return;               // never engaged: nothing to unwind
    if (mode === 'instant-reset') { resetTrack(); parkAllPeeks(); return; }
    if (mode === 'spring') { beginSettle(false, st.dir, st.width); return; }
    const hasSel = io.hasSelection ? io.hasSelection() : false;
    const vx = velocityFromSamples(st.samples);
    const committed = !hasSel && !!st.desc && isCommit(st.dx, vx, st.width);
    if (committed && st.desc.kind === 'boundary') { instantCommit(st.dir); return; }
    beginSettle(committed, st.dir, st.width);
  }

  return {
    start(e) {
      if (settling) return;
      // A live gesture whose finger is STILL down means this touchstart is a
      // foreign second finger — ignore it entirely (identifier tracking keeps
      // the primary drag clean; a stray touch can no longer end it early).
      if (s && e.touches && findTouch(e.touches, s.touchId)) return;
      // FORCE-RESET (press-drag parity): a live gesture at a new touchstart
      // whose finger is GONE means the previous stream died silently. Reset
      // instantly and start clean — no wedged state can refuse the swipe.
      if (s) endGesture('instant-reset', s.axis === 'x' ? 'force-reset of a leaked swipe at new touchstart' : null);
      if (!e.touches || e.touches.length !== 1) return;
      // Start clean: clear any leftover peek transform a prior gesture leaked
      // (a silently-died stream) so this swipe can never coexist with a stale
      // neighbor pane.
      parkAllPeeks();
      const t0 = e.touches[0];
      // No start-element guard: a swipe must work from ANYWHERE, including on
      // scripture refs / study notes (which can fill most of the page) — the
      // gesture is behaviorally identical to tapping a nav arrow. A tap on a
      // ref still opens it: axis only locks on real horizontal travel, and a
      // multi-px drag cancels the browser's synthetic click. The text-selection
      // guard (in endGesture) still blocks a flip while selecting.
      s = {
        touchId: t0.identifier, startX: t0.clientX, startY: t0.clientY,
        axis: null, dir: null, desc: null, dx: 0, samples: [],
        width: io.getWidth(), lastEventTs: Date.now(),
      };
      armWatchdog();
    },

    move(e) {
      if (!s || settling) return;
      // Track OUR finger by identifier — a second finger's moves can't
      // corrupt the dx, and ordering in e.touches is irrelevant.
      const t = findTouch(e.touches, s.touchId);
      if (!t) {
        // A move arrived and the OS's active-touch list no longer contains
        // our finger — its end was swallowed (non-bubbling delivery / the
        // stream was claimed). Heal NOW with the commit decision the frozen
        // position earns; the new stream scrolls natively, unclaimed.
        endGesture('commit-decide', s.axis === 'x' ? 'swipe finger vanished from the touch list (end swallowed)' : null);
        return;
      }
      s.lastEventTs = Date.now();
      armWatchdog();
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;
      if (s.axis === null) {
        const ax = decideAxis(dx, dy);
        if (ax === null) return;
        if (ax === 'y') { endGesture('spring', null); return; }   // vertical → release to native scroll
        s.axis = 'x';
        // Lock direction + promote the track/peek to a compositing layer (cleared
        // in finishSettle so the live page renders on the main thread at rest).
        setDir(s, dx < 0 ? 'next' : 'prev');
      } else if (dx !== 0) {
        // Axis already locked: re-resolve direction so a finger that reverses
        // past the start point flips to the opposite neighbor instead of
        // dragging the wrong (frozen) peek into empty space.
        setDir(s, dx < 0 ? 'next' : 'prev');
      }
      if (e.cancelable !== false && typeof e.preventDefault === 'function') e.preventDefault();
      s.dx = dx;
      s.samples.push({ x: dx, t: e.timeStamp || 0 });
      if (s.samples.length > 6) s.samples.shift();
      applyDrag(s.desc ? dx : rubberBand(dx, s.width), s.dir, s.width);
    },

    end(e) {
      if (!s) return;
      // Only OUR finger lifting ends the gesture; a foreign finger's lift is
      // ignored. Calls without an event (tests / unmount) end unconditionally.
      if (e && e.changedTouches && !findTouch(e.changedTouches, s.touchId)) return;
      endGesture('commit-decide', null);
    },

    cancel(e) {
      if (!s) return;
      if (e && e.changedTouches && e.changedTouches.length > 0 && !findTouch(e.changedTouches, s.touchId)) return;
      endGesture('spring', s.axis === 'x' ? 'touchcancel — browser claimed the stream, sprung back' : null);
    },

    isSettling() { return settling; },

    // Cancel pending timers — called on ScreenLayout unmount so a settle
    // that was mid-flight when the screen changed (e.g. a boundary commit that
    // remounts a different screen type) can't fire its commit twice.
    dispose() {
      if (settleToken != null && io.cancelScheduled) io.cancelScheduled(settleToken);
      settleToken = null;
      settling = false;
      disarmWatchdog();
      s = null;
    },
  };
}

/**
 * React wrapper. Wires a `createPagerGesture` controller to the scroll
 * container's touch events. Both peeks are pre-mounted by ScreenLayout
 * (parked at CSS ±100%); this hook hands their refs to the controller so it
 * can drive them imperatively with no React state during the swipe.
 *
 * @param {{ current: any }} scrollRef  the `.screen-scroll` element ref
 * @param {{
 *   peek: (side: 'prev'|'next') => any,
 *   onPrev: () => void,
 *   onNext: () => void
 * } | null | undefined} pager
 * @returns {{ trackRef: {current:any}, peekPrevRef: {current:any}, peekNextRef: {current:any} }}
 */
export function usePagerGesture(scrollRef, pager) {
  const trackRef = React.useRef(null);
  const peekPrevRef = React.useRef(null);
  const peekNextRef = React.useRef(null);
  const pagerRef = React.useRef(pager);
  pagerRef.current = pager;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pagerRef.current) return undefined;
    const mounted = { v: true };
    const ctrl = createPagerGesture({
      getWidth: () => el.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0) || 0,
      getTrack: () => trackRef.current,
      getPeek: (dir) => dir === 'prev' ? peekPrevRef.current : peekNextRef.current,
      peekFor: (side) => { const p = pagerRef.current; return p && typeof p.peek === 'function' ? p.peek(side) : null; },
      commit: (side) => {
        const p = pagerRef.current;
        if (!mounted.v || !p) return; // a settle that outlived this screen must not re-navigate
        const go = () => {
          if (side === 'next') { if (p.onNext) p.onNext(); } else if (p.onPrev) p.onPrev();
        };
        // ATOMIC REVEAL, part 1 — flush the navigation SYNCHRONOUSLY. Under
        // createRoot, a setState from the settle timer is an async default-
        // priority update; the controller parks the covering peek the moment
        // commit returns, so the new page's DOM must be committed by then.
        // flushSync also runs layout effects, so the scroll restore
        // (use-scroll-memory Effect 3) lands inside this call.
        if (typeof ReactDOM !== 'undefined' && ReactDOM.flushSync) ReactDOM.flushSync(go);
        else go();
        // Part 2 — the imperative annotation layers (letters/WTLB highlights,
        // links, bookmarks, note icons) normally repaint via a passive effect
        // + setTimeout(0) (use-dom-annotation-sync) — frames AFTER the reveal.
        // The peek being replaced was fully painted, so the freshly revealed
        // live pane flashed unmarked, then the inline note icons popped in and
        // reflowed the text. Paint the layers NOW, in the commit task, so the
        // reveal frame already carries them. Each pass is idempotent and
        // sig-skipped per element — the effect's later re-run is a cheap no-op.
        try { if (typeof applyDOMHighlights === 'function') applyDOMHighlights(); } catch (e) { console.error('applyDOMHighlights failed', e); }
        try { if (typeof applyDOMLinks === 'function') applyDOMLinks(); } catch (e) { console.error('applyDOMLinks failed', e); }
        try { if (typeof applyDOMBookmarks === 'function') applyDOMBookmarks(); } catch (e) { console.error('applyDOMBookmarks failed', e); }
        try { if (typeof applyNoteIcons === 'function') applyNoteIcons(); } catch (e) { console.error('applyNoteIcons failed', e); }
        try { if (typeof applyActiveNoteState === 'function') applyActiveNoteState(); } catch (e) { console.error('applyActiveNoteState failed', e); }
      },
      reducedMotion: () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      schedule: (fn, ms) => {
        if (ms) return setTimeout(fn, ms);
        return (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(fn) : setTimeout(fn, 0);
      },
      cancelScheduled: (tok) => clearTimeout(tok),
      hasSelection: () => typeof window !== 'undefined' && !!window.getSelection && !!String(window.getSelection()),
      trace: (msg) => {
        try { console.warn('[pageswipe] ' + msg); } catch (_e) { /* trace must never wedge */ }
        try {
          if (typeof DiagnosticLog !== 'undefined' && DiagnosticLog && DiagnosticLog.error) DiagnosticLog.error('pageswipe', msg);
        } catch (_e) { /* ignore */ }
      },
    });
    const onStart = (e) => ctrl.start(e);
    const onMove = (e) => ctrl.move(e);
    const onEnd = (e) => ctrl.end(e);
    const onCancel = (e) => ctrl.cancel(e);
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    // touchend/touchcancel at DOCUMENT CAPTURE — propagation's first node,
    // which nothing can starve. The on-device WebView failure delivers a
    // gesture's end at document-capture but NOT to bubble listeners
    // (e4d0be8); with the terminators here, a swipe can never be stranded
    // mid-slide by non-bubbling delivery. The controller filters by touch
    // identifier, so foreign end/cancel events are ignored.
    document.addEventListener('touchend', onEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', onCancel, { passive: true, capture: true });
    return () => {
      mounted.v = false;
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd, { capture: true });
      document.removeEventListener('touchcancel', onCancel, { capture: true });
      ctrl.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attach once per ScreenLayout instance; scrollRef.current is stable for the instance's life, and `pager` is read call-time-fresh via pagerRef. Re-running on pager identity churn would needlessly re-bind listeners every render.
  }, []);

  return { trackRef, peekPrevRef, peekNextRef };
}

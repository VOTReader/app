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

   COEXISTENCE: listeners are bubble-phase; ScreenLayout's capture-phase
   tap-suppressor still sees touches first. They partition on axis — the
   suppressor only acts on vertical lifts (dy>8 && dy>dx), the pager only
   engages on horizontal intent (|dx|>|dy|*1.3) — so neither fights the other.
   __scrollEl, scroll-memory, and the annotation engine are untouched: a child
   transform changes no scrollTop/scrollHeight, and the peek carries no
   data-hl-* so every annotation pass ignores it.
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
 * Commit when the drag passes 35% of the viewport width, OR a fast flick
 * (>0.5 px/ms) clears a small minimum (8% width).
 * @param {number} dx @param {number} vx @param {number} width
 * @returns {boolean}
 */
export function isCommit(dx, vx, width) {
  const adx = Math.abs(dx);
  if (width <= 0) return false;
  if (adx > width * 0.35) return true;
  if (Math.abs(vx) > 0.5 && adx > width * 0.08) return true;
  return false;
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
 *   hasSelection?: () => boolean
 * }} io
 */
export function createPagerGesture(io) {
  let s = null;          // active gesture, or null
  let settling = false;  // true while a settle animation is running
  let settleToken = null; // pending settle timer (cancelled on dispose)

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

  // Park BOTH peeks back to their CSS rest position. Called at the start of every
  // gesture so a new swipe begins from a known-clean baseline even if a prior
  // gesture left a peek mid-transform — most importantly the just-committed peek,
  // which sits at translateX(0) covering the screen between finishSettle (which
  // clears `settling`) and its deferred rAF de-promote. In that window a new
  // gesture is allowed to start and would drive the OTHER peek while this one
  // still covers the view → two panes on screen at once (the "split screen").
  // Clearing both here closes that window regardless of rAF timing.
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
      // Peek is at translateX(0) and z-index:50 (CSS), covering the track while
      // React renders the new screen. Queue the commit now — React 18's scheduler
      // uses MessageChannel which fires before rAF in the browser task queue, so
      // the new content will be in the DOM before the peek parks.
      if (pk && pk.style) { pk.style.transition = 'none'; }
      io.commit(dir);
      // Park the peek on the next animation frame. By the time this fires, the
      // MessageChannel flush has rendered the new content — the reveal is clean.
      // De-promote both layers in the same rAF so the live page is back on the
      // main-thread paint path before it's uncovered: no stale GPU rasterization.
      io.schedule(() => {
        if (tr && tr.style) tr.style.willChange = '';
        if (pk && pk.style) { pk.style.transform = ''; pk.style.willChange = ''; }
      });
    } else {
      // Spring-back: park the peek and de-promote both layers immediately.
      if (pk && pk.style) { pk.style.transition = 'none'; pk.style.transform = ''; pk.style.willChange = ''; }
      if (tr && tr.style) tr.style.willChange = '';
    }
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

  return {
    start(e) {
      if (settling) return;
      if (!e.touches || e.touches.length !== 1) { s = null; return; }
      // Start clean: clear any leftover peek transform from a prior gesture (e.g.
      // a committed peek still covering the screen before its rAF de-promote) so
      // this swipe can never coexist with a stale neighbor pane.
      parkAllPeeks();
      const t0 = e.touches[0];
      // No start-element guard: a swipe must work from ANYWHERE, including on
      // scripture refs / study notes (which can fill most of the page) — the
      // gesture is behaviorally identical to tapping a nav arrow. A tap on a
      // ref still opens it: axis only locks on real horizontal travel, and a
      // multi-px drag cancels the browser's synthetic click. The text-selection
      // guard (in end()) still blocks a flip while selecting.
      s = { startX: t0.clientX, startY: t0.clientY, axis: null, dir: null, desc: null, dx: 0, samples: [], width: io.getWidth() };
    },

    move(e) {
      if (!s || settling) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;
      if (s.axis === null) {
        const ax = decideAxis(dx, dy);
        if (ax === null) return;
        if (ax === 'y') { s = null; return; }   // vertical → release to native scroll
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

    end() {
      if (!s) return;
      const st = s;
      s = null;
      if (st.axis !== 'x') return;               // not a horizontal gesture
      const hasSel = io.hasSelection ? io.hasSelection() : false;
      const vx = velocityFromSamples(st.samples);
      const committed = !hasSel && !!st.desc && isCommit(st.dx, vx, st.width);
      beginSettle(committed, st.dir, st.width);
    },

    cancel() {
      if (!s) return;
      const st = s;
      s = null;
      if (st.axis === 'x') beginSettle(false, st.dir, st.width);
    },

    isSettling() { return settling; },

    // Cancel a pending settle — called on ScreenLayout unmount so a settle
    // that was mid-flight when the screen changed (e.g. a boundary commit that
    // remounts a different screen type) can't fire its commit twice.
    dispose() {
      if (settleToken != null && io.cancelScheduled) io.cancelScheduled(settleToken);
      settleToken = null;
      settling = false;
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
        if (side === 'next') { if (p.onNext) p.onNext(); } else if (p.onPrev) p.onPrev();
      },
      reducedMotion: () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      schedule: (fn, ms) => {
        if (ms) return setTimeout(fn, ms);
        return (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(fn) : setTimeout(fn, 0);
      },
      cancelScheduled: (tok) => clearTimeout(tok),
      hasSelection: () => typeof window !== 'undefined' && !!window.getSelection && !!String(window.getSelection()),
    });
    const onStart = (e) => ctrl.start(e);
    const onMove = (e) => ctrl.move(e);
    const onEnd = () => ctrl.end();
    const onCancel = () => ctrl.cancel();
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      mounted.v = false;
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
      ctrl.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attach once per ScreenLayout instance; scrollRef.current is stable for the instance's life, and `pager` is read call-time-fresh via pagerRef. Re-running on pager identity churn would needlessly re-bind listeners every render.
  }, []);

  return { trackRef, peekPrevRef, peekNextRef };
}

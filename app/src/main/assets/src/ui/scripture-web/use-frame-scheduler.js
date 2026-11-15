/* ═══════════════════════════════════════════════════════════════════════
   useFrameScheduler — the Scripture Web's one frame loop.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen unchanged (F0, 2026-10-18): the dirty-flag
   rAF (schedule() asks for one frame; the frame calls whatever draw is in
   drawRef), the gesture ease that thins My Web's corridors while a gesture
   is live (live(), capFractionNow()), and the revive that keeps a frame
   requested while the page was hidden from freezing the view for good.
   Nothing here is React state: gestures run it hundreds of times a second.

   animate(step, onEnd) is the camera's one motion (the navigation stream,
   w3): a fly (use-web-camera.js flyTo) or a fling (gestures.js) runs its
   step inside this same frame, just before the draw, so a moving camera
   never needs a second requestAnimationFrame. One motion at a time: a newer
   one ends the one running (its onEnd(false)), as stop() does; a step that
   returns false has arrived (onEnd(true)), and one that throws has not: it
   ends there (onEnd(false)), so a fly's promise never says it landed.

   onFrame(fn) (the navigation stream, w3) runs fn after each frame's draw,
   for the DOM that rides the camera (the go-to's verse chip and its edge
   chips): it is placed in the same frame the web moved in, and reads the
   camera the draw just used. It returns its own unsubscribe. */

// r2 (Orchestrator's ruling, 2026-09-11): see live() below.
const LIVE_HOLD_MS = 150;
const FADE_MS = 250;
/** The most fade time one drawn frame may cover (myweb-pop): a third of the fade, so it always shows in >= 3 frames. */
const FADE_STEP_MS = FADE_MS / 3;

/**
 * One frame of a motion: ms since its last frame (16 on its first). Return false when it has
 * arrived; anything else asks for another frame.
 * @typedef {(ms: number, now: number) => (boolean | void)} MotionStep
 */
/**
 * @returns {{ drawRef: { current: () => void }, schedule: () => void,
 *   live: () => void, capFractionNow: () => number,
 *   animate: (step: MotionStep, onEnd?: ((arrived: boolean) => void) | null) => () => void,
 *   onFrame: (fn: () => void) => () => void }}
 */
export function useFrameScheduler() {
  const rafRef = React.useRef(0);
  // Per-frame work is reached through refs, not through the dependency graph:
  // schedule() must keep a stable identity (gesture listeners bind it once and
  // run it hundreds of times a second), so it calls the LATEST draw via a ref
  // rather than closing over one. The screen's pointer handlers ride a ref the same way.
  const drawRef = React.useRef(() => {});

  // the camera's one motion: { step, onEnd, last } (animate, below)
  const motionRef = React.useRef(null);
  // what runs after each draw (onFrame, below)
  const afterRef = React.useRef(/** @type {Set<() => void>} */ (new Set()));

  // false once the screen has gone: a frame asked for after that (a gesture listener's last event,
  // a fade's next step) is never requested (leak hunt #60, item 2)
  const aliveRef = React.useRef(true);

  const schedule = React.useCallback(() => {
    if (rafRef.current || !aliveRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const m = motionRef.current;
      if (m) {
        const now = performance.now();
        const ms = m.last ? now - m.last : 16;
        m.last = now;
        let more = false, threw = false;
        try { more = m.step(ms, now) !== false; } catch (_e) { threw = true; }
        if (motionRef.current === m) {
          if (more) schedule();
          // s26.1: a step that threw ended the motion as arrived
          else { motionRef.current = null; if (m.onEnd) m.onEnd(!threw); }
        }
      }
      drawRef.current();
      for (const fn of afterRef.current) { try { fn(); } catch (_e) { /* one listener never stops the frame */ } }
    });
  }, []);

  const onFrame = React.useCallback((fn) => {
    afterRef.current.add(fn);
    return () => { afterRef.current.delete(fn); };
  }, []);

  const animate = React.useCallback((step, onEnd) => {
    const prev = motionRef.current;
    const m = { step, onEnd: onEnd || null, last: 0 };
    motionRef.current = m;
    if (prev && prev.onEnd) prev.onEnd(false);
    schedule();
    return () => {
      if (motionRef.current !== m) return;
      motionRef.current = null;
      if (m.onEnd) m.onEnd(false);
    };
  }, [schedule]);
  // a motion running when the screen goes ends there, so a fly's promise never hangs; and the
  // frame still pending is cancelled with the after-frame callbacks, so the last draw and the
  // DOM that rides the camera never run against a screen that is gone, and My Web's fade
  // (capFractionNow) cannot ask for another
  React.useEffect(() => {
    aliveRef.current = true;
    const after = afterRef.current; // one Set for the hook's life
    return () => {
      aliveRef.current = false;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      after.clear();
      const m = motionRef.current;
      motionRef.current = null;
      if (m && m.onEnd) m.onEnd(false);
    };
  }, []);

  // r2 (Orchestrator's ruling, 2026-09-11): while a gesture is live the
  // context's corridors keep LIVE_CAP layers a bin (a phone's frame budget);
  // at rest every layer (the approved picture). A wheel notch holds "live"
  // for LIVE_HOLD_MS so a run of notches never flickers between the two, and
  // the way back is a FADE_MS coverage ease, brightness only: nothing is
  // re-laid-out or re-bucketed, the cap is the one knob.
  const liveUntilRef = React.useRef(0);
  const releaseAtRef = React.useRef(0);
  // the fade's last drawn fraction and when it was drawn (capFractionNow)
  const fadeRef = React.useRef({ f: 0, at: 0 });
  const live = React.useCallback(() => {
    liveUntilRef.current = performance.now() + LIVE_HOLD_MS;
    releaseAtRef.current = 0;
  }, []);

  /** 0 while live, rising to 1 over FADE_MS after the hold; schedules the next frame while fading. */
  const capFractionNow = React.useCallback(() => {
    const now = performance.now();
    // a frame is kept pending through the hold, so the fade starts the moment
    // it ends even when the last gesture event drew the last frame
    if (now < liveUntilRef.current) { schedule(); return 0; }
    if (!liveUntilRef.current) return 1;
    if (!releaseAtRef.current) { releaseAtRef.current = now; fadeRef.current = { f: 0, at: now }; }
    // myweb-pop (vot-ui 11-15): the fade advances from the LAST drawn fraction by at most FADE_STEP_MS of time a
    // frame. On desktop about half the releases hit one 94-124 ms frame (the first full-layer draws); on the pure
    // clock the next frame landed at ~0.47 and the reader saw the rails jump halfway, then a ~60 ms ramp. Capped,
    // a stall delays the fade instead of skipping it; at a normal 16-40 ms cadence this is the clock exactly. A
    // second call in the same frame has dt ~0 and does not move it.
    const last = fadeRef.current;
    const f = Math.min(1, last.f + Math.min(now - last.at, FADE_STEP_MS) / FADE_MS);
    fadeRef.current = { f, at: now };
    if (f >= 1) { liveUntilRef.current = 0; releaseAtRef.current = 0; return 1; }
    schedule();
    return f;
  }, [schedule]);

  // A frame requested while the page is hidden never runs, so rafRef stays
  // set and EVERY later schedule() short-circuits — the view would come back
  // from the background permanently frozen, redrawing for nothing. Clearing
  // the stale handle on the way back is what keeps that from happening.
  React.useEffect(() => {
    const revive = () => {
      if (document.visibilityState === 'hidden') return;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      schedule();
    };
    document.addEventListener('visibilitychange', revive);
    window.addEventListener('pageshow', revive);
    window.addEventListener('focus', revive);
    return () => {
      document.removeEventListener('visibilitychange', revive);
      window.removeEventListener('pageshow', revive);
      window.removeEventListener('focus', revive);
    };
  }, [schedule]);

  return { drawRef, schedule, live, capFractionNow, animate, onFrame };
}

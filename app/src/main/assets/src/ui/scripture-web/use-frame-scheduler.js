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

  const schedule = React.useCallback(() => {
    if (rafRef.current) return;
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
  // a motion running when the screen goes ends there, so a fly's promise never hangs
  React.useEffect(() => () => {
    const m = motionRef.current;
    motionRef.current = null;
    if (m && m.onEnd) m.onEnd(false);
  }, []);

  // r2 (Orchestrator's ruling, 2026-09-11): while a gesture is live the
  // context's corridors keep LIVE_CAP layers a bin (a phone's frame budget);
  // at rest every layer (the approved picture). A wheel notch holds "live"
  // for LIVE_HOLD_MS so a run of notches never flickers between the two, and
  // the way back is a FADE_MS coverage ease, brightness only: nothing is
  // re-laid-out or re-bucketed, the cap is the one knob.
  const liveUntilRef = React.useRef(0);
  const releaseAtRef = React.useRef(0);
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
    if (!releaseAtRef.current) releaseAtRef.current = now;
    const f = Math.min(1, (now - releaseAtRef.current) / FADE_MS);
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

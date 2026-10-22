/* ═══════════════════════════════════════════════════════════════════════
   useForcedLandscape — the Scripture Web is landscape on a phone.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen unchanged (F0, 2026-10-18): whether the
   root is CSS-rotated (a portrait phone: Q11, below), the orientation lock where
   the platform offers one, immersive mode while the web is open (and the
   unlock on the way out), and loc(), which maps a pointer's viewport
   coordinates into the rotated screen's own CSS space. */

import { rotatePointer } from '../../utils/scripture-web/geometry.js';

/** The longest short side, CSS px, that is a phone's (Q11): past it a portrait viewport is a
 * tablet or a window, and keeps its own orientation. */
export const PHONE_SHORT_SIDE = 600;

/**
 * Whether the web turns itself on its side (Q11, the navigation stream's G3): a portrait
 * viewport, a coarse primary pointer, and a phone's short side. A desktop window or a tablet
 * held upright keeps its own orientation.
 * @returns {boolean}
 */
export function wantsRotation() {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth, h = window.innerHeight;
  if (!(h > w) || w > PHONE_SHORT_SIDE) return false;
  try {
    return typeof window.matchMedia === 'function' && !!window.matchMedia('(pointer: coarse)').matches;
  } catch (_e) { return false; }
}

/**
 * @param {() => void} schedule  the frame loop's (use-frame-scheduler.js)
 * @param {{ current: Element | null }} [rootRef]  the screen's root: loc() measures pointers from its box
 * @returns {{ rotated: boolean, loc: (e: { clientX: number, clientY: number }) => { x: number, y: number } }}
 */
export function useForcedLandscape(schedule, rootRef) {
  // A canon needs its width. On a phone the Scripture Web presents in
  // LANDSCAPE, always (owner call, 2026-09-10: "landscape by default, no
  // rotate option"). Where the platform will flip the display,
  // screen.orientation.lock('landscape') does it; where that is refused,
  // absent, or resolves without flipping, the root is CSS-rotated 90° in a
  // portrait phone — chrome included — so the reader turns the phone and sees
  // landscape either way. No hint, no control, no preference. Q11 (decided,
  // 2026-10) gates it to phones: his words were said of the phone, and a
  // desktop window or a tablet turned on its side went further than them
  // (wantsRotation, above). Pointer coords are mapped back through loc(). A
  // real flip arrives as a resize, and the resize handler un-rotates by
  // itself; there is nothing to settle.
  const [rotated, setRotated] = React.useState(wantsRotation);
  React.useEffect(() => {
    const onResize = () => setRotated(wantsRotation());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const rotatedRef = React.useRef(rotated);
  React.useEffect(() => {
    if (!rotated) return undefined;
    const orientation = typeof screen !== 'undefined' && screen.orientation;
    if (!orientation || typeof orientation.lock !== 'function') return undefined;
    // A refusal is not an error here: the CSS rotation already covers it.
    // lock() can reject OR throw synchronously depending on the browser.
    const ask = () => {
      try { Promise.resolve(orientation.lock('landscape')).catch(() => {}); } catch (_e) { /* covered */ }
    };
    ask();
    // Chrome refuses a lock outside fullscreen ("The page needs to be fullscreen"), and this
    // effect runs before immersive mode's requestFullscreen has landed (w4 device check, the
    // S22). Ask once more when fullscreen is in place: a real lock flips the display, so the
    // keyboard, the fullscreen toast and the system bars come up landscape too. The rotation
    // stays the fallback for a refusal there.
    if (typeof document === 'undefined' || document.fullscreenElement) return undefined;
    const onFull = () => {
      if (!document.fullscreenElement) return;
      document.removeEventListener('fullscreenchange', onFull);
      ask();
    };
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, [rotated]);

  /** Viewport coords -> the screen's own CSS space, measured from the root's box: it covers the window from 0,0 on
   *  main, so this is rotatePointer(clientX, clientY, innerWidth) or the raw coords; v2 starts it further in (its laptop
   *  draws the web in the pane beside the rail; its turned phone web keeps the live insets, under the status bar). */
  const loc = React.useCallback((e) => {
    const r = rootRef && rootRef.current ? rootRef.current.getBoundingClientRect() : null;
    if (rotatedRef.current) return rotatePointer(e.clientX, e.clientY - (r ? r.top : 0), r ? r.right : window.innerWidth);
    return { x: e.clientX - (r ? r.left : 0), y: e.clientY - (r ? r.top : 0) };
  }, [rootRef]);

  // Immersive while the web is open — it is a full-bleed instrument.
  React.useEffect(() => {
    if (typeof PlatformBridge !== 'undefined') PlatformBridge.setImmersiveMode(true);
    return () => {
      if (typeof PlatformBridge !== 'undefined') PlatformBridge.setImmersiveMode(false);
      // The rotation effect above may have locked landscape;
      // leaving without unlocking strands every OTHER screen rotated (F27).
      // No orientation API, and unlock() rejecting/throwing when nothing was
      // locked, are both normal — swallow either.
      try { screen.orientation.unlock(); } catch (_e) { /* nothing to unlock */ }
    };
  }, []);

  // loc() reads the rotation from a ref so it can stay identity-stable; keep
  // that ref in step with the state it mirrors, and repaint
  React.useEffect(() => { rotatedRef.current = rotated; schedule(); }, [rotated, schedule]);

  return { rotated, loc };
}

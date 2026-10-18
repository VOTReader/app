/* ═══════════════════════════════════════════════════════════════════════
   useForcedLandscape — the Scripture Web is landscape, always.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen unchanged (F0, 2026-10-18): whether the
   root is CSS-rotated (any portrait viewport), the orientation lock where
   the platform offers one, immersive mode while the web is open (and the
   unlock on the way out), and loc(), which maps a pointer's viewport
   coordinates into the rotated screen's own CSS space. */

import { rotatePointer } from '../../utils/scripture-web/geometry.js';

/**
 * @param {() => void} schedule  the frame loop's (use-frame-scheduler.js)
 * @returns {{ rotated: boolean, loc: (e: { clientX: number, clientY: number }) => { x: number, y: number } }}
 */
export function useForcedLandscape(schedule) {
  // A canon needs its width. The Scripture Web presents in LANDSCAPE, always
  // (owner call, 2026-09-10: "landscape by default, no rotate option"). Where
  // the platform will flip the display, screen.orientation.lock('landscape')
  // does it; where that is refused, absent, or resolves without flipping, the
  // root is CSS-rotated 90° in ANY portrait viewport — chrome included — so
  // the reader turns the phone and sees landscape either way. No hint, no
  // control, no preference, no pointer-type gate. Pointer coords are mapped
  // back through loc(). A real flip arrives as a resize, and the resize
  // handler un-rotates by itself; there is nothing to settle.
  const [rotated, setRotated] = React.useState(
    typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  React.useEffect(() => {
    const onResize = () => setRotated(window.innerHeight > window.innerWidth);
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
    try { Promise.resolve(orientation.lock('landscape')).catch(() => {}); } catch (_e) { /* covered */ }
    return undefined;
  }, [rotated]);

  /** Viewport coords -> the rotated screen's own CSS space. */
  const loc = React.useCallback((e) => (rotatedRef.current
    ? rotatePointer(e.clientX, e.clientY, window.innerWidth)
    : { x: e.clientX, y: e.clientY }), []);

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

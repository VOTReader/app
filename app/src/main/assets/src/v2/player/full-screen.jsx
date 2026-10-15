/* player/full-screen.js - double-tap a letter's open text to read full screen (rv1, picture 9b-full-screen; Corbin
   10-14 00:23: "Yes to the double tap going fullscreen and winning over audio jump").

   v2's own copy of main's gesture (hooks/use-fullscreen-gesture.js, bundle-b: not imported, it would bundle a second
   PlatformBridge and toast): two taps on the page within DOUBLE_TAP_MS and MAX_TAP_DISTANCE_PX toggle full screen,
   every bar hides, Android goes immersive through PlatformBridge (bundle-b's global; the browser's Fullscreen API on the
   web). It fires main's FULLSCREEN_GESTURE_EVENT on document, so read-along's first-tap jump is undone as on main (ra3).
   The hint toast shows at most HINT_LIMIT times a session, counted in memory: v2 writes nothing to storage here. */
import { DOUBLE_TAP_MS, MAX_TAP_DISTANCE_PX, FULLSCREEN_GESTURE_EVENT } from '../../utils/fullscreen-gesture-event.js';

const g = /** @type {any} */ (globalThis);
export const HINT = 'Full screen. Double-tap to come back.';
export const HINT_LIMIT = 3;
export const HINT_MS = 2600;
/** A press that travels this far is a scroll or a drag, not a tap. */
const MAX_DRAG_PX = 18;
/** Taps on these are the control's, never the page's. */
const CONTROLS = 'a, button, input, select, textarea, label, summary, [role="button"], [role="slider"], [role="dialog"], '
  + '[contenteditable], [data-fullscreen-gesture-ignore], .nextcard, .toast';

let hintsShown = 0;
/** Tests: a fresh session. */
export function resetHints() { hintsShown = 0; }

/** True for a tap on the open page (text or margin), not on a control. @param {any} target */
export function isOpenArea(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return !target.closest(CONTROLS) && !!target.closest('.content.reader');
}

function immersive(on) {
  const bridge = g.PlatformBridge;
  try { if (bridge && typeof bridge.setImmersiveMode === 'function') bridge.setImmersiveMode(on); } catch (_e) { /* best effort, as main */ }
}

/**
 * @param {{ enabled: boolean, gate?: { player?: { full?: boolean, toast?: string } } | null }} args
 *   enabled: a letter is open and the reader has not turned the gesture off (Settings: doubleTapFullscreen)
 * @returns {{ full: boolean, toast: string | null, exit: () => boolean }}
 */
export function useFullScreen({ enabled, gate = null }) {
  const seed = gate && gate.player ? gate.player : null;
  const [full, setFull] = React.useState(() => !!(seed && seed.full));
  const [toast, setToast] = React.useState(() => (seed && seed.toast) || null);
  const fullRef = React.useRef(full);
  fullRef.current = full;
  const gateRef = React.useRef(!!gate);
  gateRef.current = !!gate;

  // Leaving the letter (or the setting going off) leaves full screen.
  React.useEffect(() => {
    if (enabled || !fullRef.current) return;
    setFull(false);
    setToast(null);
    if (!gateRef.current) immersive(false);
  }, [enabled]);

  // The hint goes by itself (a gate's stays put: it is part of the picture).
  React.useEffect(() => {
    if (!toast || gateRef.current) return undefined;
    const t = setTimeout(() => setToast(null), HINT_MS);
    return () => clearTimeout(t);
  }, [toast]);

  React.useEffect(() => {
    if (!enabled) return undefined;
    /** @type {null | { x: number, y: number, id: number }} */
    let down = null;
    /** @type {null | { x: number, y: number, t: number }} */
    let last = null;
    const onDown = (e) => {
      down = isOpenArea(e.target) ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
      if (!down) last = null;
    };
    const onUp = (e) => {
      if (e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const d = down;
      down = null;
      if (!d || !isOpenArea(e.target) || Math.hypot(e.clientX - d.x, e.clientY - d.y) > MAX_DRAG_PX) { last = null; return; }
      const now = e.timeStamp || Date.now();
      const point = { x: e.clientX, y: e.clientY, t: now };
      if (last && now - last.t <= DOUBLE_TAP_MS && Math.hypot(point.x - last.x, point.y - last.y) <= MAX_TAP_DISTANCE_PX) {
        last = null;
        const entering = !fullRef.current;
        fullRef.current = entering;
        setFull(entering);
        immersive(entering);
        if (entering && hintsShown < HINT_LIMIT) { hintsShown += 1; setToast(HINT); } else setToast(null);
        document.dispatchEvent(new CustomEvent(FULLSCREEN_GESTURE_EVENT, { detail: { x: point.x, y: point.y } }));
        return;
      }
      last = point;
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
    };
  }, [enabled]);

  const exit = React.useCallback(() => {
    if (!fullRef.current) return false;
    fullRef.current = false;
    setFull(false);
    setToast(null);
    if (!gateRef.current) immersive(false);
    return true;
  }, []);
  return { full, toast, exit };
}

/** The hint, where the picture draws it (inside .content.reader). @param {{ text: string | null }} props */
export function FullScreenToast({ text }) {
  if (!text) return null;
  return <div className="toast-wrap hi" role="status"><div className="toast">{text}</div></div>;
}

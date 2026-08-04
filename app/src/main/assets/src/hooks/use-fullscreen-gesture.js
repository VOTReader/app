// @ts-check
/*
   useFullscreenGesture — double-tap/click an open area to toggle fullscreen

   One pointer-up listener covers mouse, touch, and pen on the shared web UI.
   PlatformBridge supplies the platform split: the browser Fullscreen API for
   desktop/PWA, and Android system-bar immersive mode for the APK.
*/

import { PlatformBridge } from '../utils/platform-bridge.js';
import { showToast } from '../utils/toast.js';
import { useRefMirror } from './use-ref-mirror.js';

const DOUBLE_TAP_MS = 420;
const MAX_TAP_DISTANCE_PX = 32;
const MAX_DRAG_DISTANCE_PX = 18;
const FULLSCREEN_HINT_LIMIT = 3;

// Semantic controls plus the app's interactive surface naming convention.
// Reading text and plain screen background deliberately do not match.
const INTERACTIVE_SELECTOR = [
  'a', 'button', 'input', 'select', 'textarea', 'summary', 'label', 'option',
  'video', 'audio', 'iframe', '[contenteditable]', '[aria-haspopup="true"]',
  '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="switch"]',
  '[role="tab"]', '[role="menuitem"]', '[role="option"]', '[role="slider"]',
  '[role="textbox"]', '[role="combobox"]', '[role="dialog"]', '[role="alertdialog"]',
  '[tabindex]:not([tabindex="-1"])', '[data-fullscreen-gesture-ignore]',
  '[class*="-btn"]', '[class*="-button"]', '[class*="-toggle"]', '[class*="-control"]',
  '[class*="-input"]', '[class*="-slider"]', '[class*="-nav"]', '[class*="-card"]',
  '[class*="-row"]', '[class*="-sheet"]', '[class*="-modal"]', '[class*="-overlay"]',
  '[class*="-toolbar"]', '[class*="-picker"]', '[class*="-tab"]',
].join(', ');

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Returns true only for an open, non-control part of the current screen. */
export function isFullscreenGestureTarget(target) {
  if (!target || typeof /** @type {any} */ (target).closest !== 'function') return false;
  // A modal owns the whole visible surface, including its backdrop.
  if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')) return false;
  const interactiveAncestor = /** @type {Element} */ (target).closest(INTERACTIVE_SELECTOR);
  // `body.history-in-nav` describes a layout mode, not an interactive
  // surface. Never let a broad class convention turn the whole app inert.
  return !interactiveAncestor || interactiveAncestor === document.body || interactiveAncestor === document.documentElement;
}

/**
 * @param {{ enabled: boolean, hintCount: unknown, onHintShown: (count: number) => void }} args
 */
export function useFullscreenGesture({ enabled, hintCount, onHintShown }) {
  const previousTapRef = React.useRef(null);
  const pointerDownRef = React.useRef(null);
  // Android's bridge has no readback API. This ref stays correct because this
  // hook owns the gesture and resets while GardenView (which owns immersive
  // mode itself) is active.
  const androidFullscreenRef = React.useRef(false);
  const safeHintCount = Math.min(FULLSCREEN_HINT_LIMIT, Math.max(0, Math.floor(Number(hintCount) || 0)));
  // Mirrored, NOT in the effect's dep list. App() passes onHintShown as an
  // inline arrow, so a dep on it tore down and re-added both capture-phase
  // document listeners on EVERY App render (measured: one full resubscribe
  // per render). Listener churn on the app root is the exact shape of the
  // input-lag class this app has been bitten by before. Mirroring the two
  // read-only inputs lets the effect depend on `enabled` alone.
  const hintCountRef = useRefMirror(safeHintCount);
  const onHintShownRef = useRefMirror(onHintShown);

  React.useEffect(() => {
    if (!enabled) {
      previousTapRef.current = null;
      pointerDownRef.current = null;
      androidFullscreenRef.current = false;
      return undefined;
    }

    const onPointerDown = (event) => {
      if (!isFullscreenGestureTarget(event.target)) {
        previousTapRef.current = null;
        pointerDownRef.current = null;
        return;
      }
      pointerDownRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    };

    const onPointerUp = (event) => {
      if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (!isFullscreenGestureTarget(event.target)) {
        previousTapRef.current = null;
        pointerDownRef.current = null;
        return;
      }

      const point = { x: event.clientX, y: event.clientY };
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (down && (down.pointerId == null || event.pointerId == null || down.pointerId === event.pointerId)
        && distance(down, point) > MAX_DRAG_DISTANCE_PX) {
        previousTapRef.current = null;
        return;
      }

      const now = event.timeStamp || Date.now();
      const previous = previousTapRef.current;
      if (!previous || now - previous.time > DOUBLE_TAP_MS || distance(previous, point) > MAX_TAP_DISTANCE_PX) {
        previousTapRef.current = { ...point, time: now };
        return;
      }

      previousTapRef.current = null;
      const entering = PlatformBridge.isAndroid
        ? !androidFullscreenRef.current
        : !document.fullscreenElement;
      PlatformBridge.setImmersiveMode(entering);
      if (PlatformBridge.isAndroid) androidFullscreenRef.current = entering;

      const count = hintCountRef.current;
      if (entering && count < FULLSCREEN_HINT_LIMIT) {
        showToast({
          id: 'vot-toast-fullscreen-hint',
          className: 'vot-toast',
          text: 'Fullscreen on. Double-tap or double-click an open area to return to regular view.',
          durationMs: 4000,
          ariaLive: 'polite',
        });
        onHintShownRef.current(count + 1);
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
    };
  }, [enabled, hintCountRef, onHintShownRef]);
}

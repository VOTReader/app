/* ═══════════════════════════════════════════════════════════════════════
   root-exit-toast — "Press back again to exit" UX for PWA root nav
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   WHY THIS EXISTS (per [[root-of-history-pwa]]):
     PWAs have no "minimize" equivalent. When the user presses browser
     back at the root of the navigation stack, popstate fires, the
     browser consumes a history entry, and — if not intercepted — the
     PWA window closes silently. That's destructive UX: the user might
     have meant a small wrist motion, not "kill this PWA."

     The Android system back button has the same problem on the OS
     level, solved by every Android app via the well-known
     "press back again to exit" double-tap-with-toast pattern. This
     module is the web-side equivalent.

   THE FLOW THIS POWERS (W1.5(d)'s popstate handler):
     - First back at root: arm() → toast appears, 2-second timer starts.
       The caller also pushState's a REPLACEMENT entry so the browser
       stack stays one-deep (so the next back has something to consume).
     - Within 2 seconds, second back: the popstate handler checks
       isArmed(), sees true, does NOT push the replacement entry; the
       previously-consumed-by-popstate state means the next gesture
       exits the PWA naturally. Caller also calls disarm() to clean up.
     - After 2 seconds with no second back: timer fires, disarm() runs,
       toast fades. Next first-back at root gets a fresh toast.

   THE TIMER-CLEAR-ON-FORWARD-NAV INVARIANT (per [[root-of-history-pwa]]):
     If the user arms the toast at root, then taps a tile (forward
     navigation), then later returns to root and presses back, the
     toast must show FRESH — not skip because the timer is still
     running from the earlier cycle. useHistorySync calls disarm()
     before every legitimate forward pushState; that ensures the
     armed state is always tied to "the most recent root-back press"
     rather than any earlier one.

   IMPLEMENTATION:
     Module-level state (singleton). DOM manipulation directly into
     document.body so the toast is independent of the React tree — it
     mounts/unmounts based on raw events without going through React.
     Equivalent to how the existing journal milestone toast works
     (jrnShowMilestoneToast in journal-stats-store.js), keeping the
     pattern consistent.

   API:
     arm(durationMs = 2000) — show toast, start timer.
     disarm()               — clear timer, hide toast.
     isArmed()              — boolean.
     _reset()               — TEST-ONLY. Synchronous clear without
                              animation; for vitest beforeEach.
   ═══════════════════════════════════════════════════════════════════════ */

/** @type {ReturnType<typeof setTimeout> | null} */
let _timer = null;
let _armed = false;
/** @type {HTMLElement | null} */
let _toastEl = null;

const TOAST_ID = 'vot-root-exit-toast';

function _ensureToast() {
  if (_toastEl) return _toastEl;
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.id = TOAST_ID;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = 'Press back again to exit';
  el.style.cssText = [
    'position:fixed',
    // Above all overlays; lower than the Welcome modal (z 9999) which
    // wouldn't be open at root anyway, but be defensive.
    'z-index:9998',
    'left:50%',
    'transform:translateX(-50%)',
    // Anchor near the bottom; respect safe-area inset for notched devices.
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 2rem)',
    'background:rgba(20,20,24,0.92)',
    'color:#f0e6d2',
    'border:1px solid rgba(255,215,140,0.35)',
    'border-radius:24px',
    'padding:10px 18px',
    "font-family:'Cinzel',serif",
    'font-size:0.72rem',
    'letter-spacing:0.08em',
    'text-transform:uppercase',
    'box-shadow:0 6px 24px rgba(0,0,0,0.45)',
    'pointer-events:none',
    'opacity:0',
    'transition:opacity 180ms ease-out',
  ].join(';');
  document.body.appendChild(el);
  _toastEl = el;
  return el;
}

function _showToast() {
  const el = _ensureToast();
  if (!el) return;
  // Force reflow then set opacity → smooth fade-in.
  void el.offsetHeight;
  el.style.opacity = '1';
}

function _hideToast() {
  if (!_toastEl) return;
  _toastEl.style.opacity = '0';
}

/**
 * Show the "press back again to exit" toast and arm the second-tap
 * window. Call from the popstate handler's root-of-stack branch ONLY
 * after handleAndroidBack returns "false". The CALLER is also
 * responsible for pushing a replacement history entry so the browser
 * stack stays one-deep.
 *
 * @param {number} [durationMs] - how long the second-tap window stays
 *                                open (default 2000ms).
 * @returns {void}
 */
export function arm(durationMs = 2000) {
  if (_timer != null) clearTimeout(_timer);
  _armed = true;
  _showToast();
  _timer = setTimeout(() => {
    _armed = false;
    _timer = null;
    _hideToast();
  }, durationMs);
}

/**
 * Clear the armed state + cancel the second-tap timer + hide the toast.
 * Called from:
 *   - The popstate handler's second-back-within-window branch (the
 *     "exit" path).
 *   - useHistorySync's effect when a forward navigation is about to
 *     pushState (the TIMER-CLEAR-ON-FORWARD-NAV invariant — a fresh
 *     nav cycle means the OLD root-back-press should not bleed into
 *     a future root-back press).
 *
 * Idempotent.
 *
 * @returns {void}
 */
export function disarm() {
  if (_timer != null) {
    clearTimeout(_timer);
    _timer = null;
  }
  _armed = false;
  _hideToast();
}

/**
 * Is the toast currently armed (within the second-tap window)?
 * popstate's root-branch reads this to decide between "first back —
 * arm + push replacement" vs. "second back — exit, no push."
 *
 * @returns {boolean}
 */
export function isArmed() {
  return _armed;
}

/**
 * TEST-ONLY. Synchronous reset for vitest beforeEach. Tears down the
 * toast element + clears the timer immediately (no fade animation).
 *
 * @returns {void}
 */
export function _reset() {
  if (_timer != null) {
    clearTimeout(_timer);
    _timer = null;
  }
  _armed = false;
  if (_toastEl && _toastEl.parentNode) {
    _toastEl.parentNode.removeChild(_toastEl);
  }
  _toastEl = null;
}

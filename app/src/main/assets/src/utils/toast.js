/* ═══════════════════════════════════════════════════════════════════════
   toast — transient bottom-of-screen notification primitive
   ═══════════════════════════════════════════════════════════════════════
   Generic show/hide-and-auto-dismiss for in-app toast notifications.
   Consolidates the "create-or-reuse a DOM element + classList.add('show')
   + setTimeout to remove" pattern that previously lived bespoke inside
   jrnShowMilestoneToast (journal-stats-store.js). The 4 W2.6 alert()
   sites (export-success, export-failed, import-not-recognized, import-
   complete) call into the same primitive.

   The CSS appearance is the CALLER's concern via the `className` option;
   this utility owns ONLY the lifecycle. Each consumer's stylesheet
   defines the toggle from hidden → visible via `.show` (or the caller's
   chosen class).

   ROOT-EXIT-TOAST EXCEPTION:
   src/utils/root-exit-toast.js intentionally manages its own DOM with
   inline styles + opacity-controlled show/hide because 14 vitest cases
   pin its contract (el.style.opacity === '1' when armed, etc.). The
   arm/disarm/isArmed semantics are unique (two-tap-to-exit window) and
   the inline-style contract is load-bearing for those tests. A future
   tidy pass can consolidate it; this utility ignores it for now.

   API:
     showToast({ id, html, className, durationMs, ariaLive })
       Show or update a toast. Reuses the DOM element with the given id
       if it already exists; creates it otherwise. After durationMs,
       auto-hides via `.show` class removal. durationMs=0 means show
       indefinitely (caller must hideToast manually).

     hideToast(id)
       Hide a toast immediately + cancel its pending auto-hide timer.
       Idempotent; safe to call on an unknown id.

     _resetToasts()
       TEST-ONLY. Tear down every tracked toast element + clear every
       pending timer. Used by vitest beforeEach for isolation.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Per-id auto-hide timers so a re-show before the previous duration
 * elapses cancels the pending hide (preventing the new content from
 * fading prematurely).
 *
 * @type {Map<string, ReturnType<typeof setTimeout>>}
 */
const _hideTimers = new Map();

/**
 * Show a transient toast. Creates the DOM element with the given id on
 * first call; reuses it on subsequent calls (so repeated show()s
 * present updated content without flashing).
 *
 * @param {object} opts
 * @param {string} opts.id          - stable DOM id (e.g. 'vot-toast-info')
 * @param {string} opts.html        - content (innerHTML; caller is
 *                                    responsible for escaping)
 * @param {string} [opts.className] - CSS class (defaults to opts.id)
 * @param {number} [opts.durationMs] - auto-hide after this many ms;
 *                                     0 or negative = no auto-hide
 *                                     (default 3000)
 * @param {string} [opts.ariaLive]   - aria-live attribute (default
 *                                     'polite'; pass 'assertive' for
 *                                     errors / urgent notices)
 * @returns {void}
 */
export function showToast(opts) {
  if (typeof document === 'undefined') return;
  const id = opts && opts.id;
  if (!id) return;
  const html = (opts && opts.html != null) ? opts.html : '';
  const className = (opts && opts.className) || id;
  const durationMs = (opts && opts.durationMs != null) ? opts.durationMs : 3000;
  const ariaLive = (opts && opts.ariaLive) || 'polite';

  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = className;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', ariaLive);
    document.body.appendChild(el);
  }
  // Update content; force reflow so the .show transition kicks in even
  // when called on an already-visible toast.
  el.innerHTML = html;
  void el.offsetHeight;
  el.classList.add('show');

  // Cancel any pending auto-hide for this id; re-arm if requested.
  const prev = _hideTimers.get(id);
  if (prev != null) clearTimeout(prev);
  if (durationMs > 0) {
    _hideTimers.set(id, setTimeout(function () {
      hideToast(id);
    }, durationMs));
  } else {
    _hideTimers.delete(id);
  }
}

/**
 * Hide a toast immediately. Removes the `.show` class (CSS handles
 * the fade-out transition); leaves the DOM element in place for
 * reuse on the next showToast() call.
 *
 * Idempotent — safe to call on an unknown id.
 *
 * @param {string} id
 * @returns {void}
 */
export function hideToast(id) {
  if (typeof document === 'undefined' || !id) return;
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
  const prev = _hideTimers.get(id);
  if (prev != null) {
    clearTimeout(prev);
    _hideTimers.delete(id);
  }
}

/**
 * TEST-ONLY. Tear down every tracked toast DOM element + clear every
 * pending auto-hide timer. Used by vitest beforeEach for isolation.
 *
 * @returns {void}
 */
export function _resetToasts() {
  for (const id of _hideTimers.keys()) {
    const timer = _hideTimers.get(id);
    if (timer != null) clearTimeout(timer);
  }
  _hideTimers.clear();
  if (typeof document === 'undefined') return;
  // Remove every toast element matching `[id^="vot-toast"]` AND known
  // legacy ids (jrn-milestone-toast). Cheaper than tracking all ids.
  const selectors = [
    '[id^="vot-toast"]',
    '#jrn-milestone-toast',
  ];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }
}

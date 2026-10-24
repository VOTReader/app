/* ═══════════════════════════════════════════════════════════════════════
   toast — transient bottom-of-screen notification primitive
   ═══════════════════════════════════════════════════════════════════════
   Generic show/hide-and-auto-dismiss for in-app toast notifications.
   Consolidates the "create-or-reuse a DOM element + classList.add('show')
   + setTimeout to remove" pattern that previously lived bespoke inside
   the journal's milestone toast (removed 2026-10-05). The 4 W2.6 alert()
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
     showToast({ id, html, className, durationMs, ariaLive, onHide })
       Show or update a toast. Reuses the DOM element with the given id
       if it already exists; creates it otherwise. After durationMs,
       auto-hides via `.show` class removal. durationMs=0 means show
       indefinitely (caller must hideToast manually). onHide runs once
       when this showing ends (hide, timer, or the next show of the id).

     hideToast(id)
       Hide a toast immediately + cancel its pending auto-hide timer.
       Disables the buttons inside it (a faded toast is no target).
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
 * W55: per-id "this showing ended" callbacks (showToast's opts.onHide). A
 * toast that IS a control (the update toast's "Tap to continue listening.")
 * wires its element, and the element outlives the showing; its owner takes
 * the wiring off here.
 *
 * @type {Map<string, () => void>}
 */
const _onHide = new Map();

/** @param {string} id */
function _endShowing(id) {
  const fn = _onHide.get(id);
  if (!fn) return;
  _onHide.delete(id);
  try { fn(); } catch (_e) { /* one caller's cleanup never breaks the toast */ }
}

/**
 * Show a transient toast. Creates the DOM element with the given id on
 * first call; reuses it on subsequent calls (so repeated show()s
 * present updated content without flashing).
 *
 * @param {object} opts
 * @param {string} opts.id          - stable DOM id (e.g. 'vot-toast-info')
 * @param {string} [opts.text]      - content set via textContent (SAFE — the
 *                                    recommended path for any dynamic/runtime
 *                                    string). Takes precedence over opts.html.
 * @param {string} [opts.html]      - content set via innerHTML — TRUSTED STATIC
 *                                    markup ONLY (e.g. a <b>/<button>/styled
 *                                    <span>). NEVER pass user/corpus text here;
 *                                    use opts.text instead. (SEC-2)
 * @param {string} [opts.className] - CSS class (defaults to opts.id)
 * @param {number} [opts.durationMs] - auto-hide after this many ms;
 *                                     0 or negative = no auto-hide
 *                                     (default 3000)
 * @param {string} [opts.ariaLive]   - aria-live attribute (default
 *                                     'polite'; pass 'assertive' for
 *                                     errors / urgent notices)
 * @param {() => void} [opts.onHide] - runs once when this showing ends:
 *                                     hideToast, the auto-hide timer, or
 *                                     the next showToast of the same id
 * @returns {void}
 */
export function showToast(opts) {
  if (typeof document === 'undefined') return;
  const id = opts && opts.id;
  // Wave-0: an id-less call used to return SILENTLY — a bare-string call
  // (showToast('msg')) looked like it worked and showed nothing. Warn so the
  // mistake surfaces in the console during development instead of shipping
  // as a dead toast.
  if (!id) {
    try { console.warn('showToast called without opts.id — toast suppressed:', opts); } catch (_e) { /* console can throw in exotic hosts */ }
    return;
  }
  const html = (opts && opts.html != null) ? opts.html : '';
  const className = (opts && opts.className) || id;
  const durationMs = (opts && opts.durationMs != null) ? opts.durationMs : 3000;
  const ariaLive = (opts && opts.ariaLive) || 'polite';

  // The previous showing of this id ends here: its content is replaced below.
  _endShowing(id);
  if (opts && typeof opts.onHide === 'function') _onHide.set(id, opts.onHide);

  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = className;
    document.body.appendChild(el);
  }
  // n198: reapplied on every call, so a later showToast on the same id gets its own ariaLive
  // instead of keeping whatever the first call set.
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', ariaLive);
  // n138: Cinzel suits a short line; a long message reads in the body face (.vot-toast.is-long).
  el.classList.toggle('is-long', !!(opts && opts.text != null && String(opts.text).length > 60));
  // Update content; force reflow so the .show transition kicks in even when called on
  // an already-visible toast. SEC-2: textContent (opts.text) is the safe default for any
  // dynamic string; opts.html is for TRUSTED static markup only.
  if (opts && opts.text != null) {
    el.textContent = opts.text;
  } else {
    el.innerHTML = html;
  }
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
  if (el) {
    el.classList.remove('show');
    // W55: opacity 0 leaves a button in Tab order and under the finger (the CSS
    // drops the pointer for .vot-toast-action/-undo); disabled takes it out of
    // both and keeps the text readable. Every show rewrites the content, so the
    // next showing brings fresh buttons.
    el.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
  }
  _endShowing(id);
  const prev = _hideTimers.get(id);
  if (prev != null) {
    clearTimeout(prev);
    _hideTimers.delete(id);
  }
}

/**
 * A toast whose one button puts things back ("Stopped · Undo", "History cleared · Undo"). Toasts share one spot, and
 * this one carries an action, so any other toast up steps aside. The text goes in as text; the button is built.
 * @param {string} id @param {string} text @param {() => void} onUndo
 * @param {{ label?: string, durationMs?: number }} [opts]
 * @returns {void}
 */
export function showUndoToast(id, text, onUndo, opts) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.vot-toast.show').forEach((el) => { if (el.id && el.id !== id) hideToast(el.id); });
  showToast({ id, className: 'vot-toast vot-toast-undo', durationMs: (opts && opts.durationMs) || 5000, text });
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelectorAll('.vot-undo-btn').forEach((b) => b.remove());   // a second action inside the window re-uses the toast
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'vot-undo-btn';
  undo.textContent = (opts && opts.label) || 'Undo';
  undo.addEventListener('click', () => {
    onUndo();
    hideToast(id);
  }, { once: true });
  el.appendChild(undo);
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
  _onHide.clear();
  if (typeof document === 'undefined') return;
  // Remove every toast element matching `[id^="vot-toast"]`. Cheaper than
  // tracking all ids.
  const selectors = [
    '[id^="vot-toast"]',
  ];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }
}

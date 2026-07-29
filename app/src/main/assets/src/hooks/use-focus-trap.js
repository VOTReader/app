/* ═══════════════════════════════════════════════════════════════════════
   useFocusTrap — keyboard focus containment for modal dialogs (W10 / [13])
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   Sheets and dialogs registered with useModalRegistry already own Escape
   (the W1.5(c) dispatcher) — but Tab still walked OUT of an open dialog
   into the inert page behind it (desktop PWA keyboard nav; the code half
   of the "deep accessibility" track — the TalkBack device walk stays
   owner-side). This hook contains Tab/Shift+Tab inside the dialog,
   focuses the dialog on open, and restores focus to the previously
   focused element on close.

   USAGE (2 lines per dialog):
     const trapRef = useFocusTrap(isOpen);
     <div className="my-dialog" ref={trapRef}>…</div>

   BEHAVIOR:
     - On activate: remembers document.activeElement, then focuses the
       first element carrying [data-autofocus], else the first focusable,
       else the container itself (tabIndex -1 is applied if absent).
     - Tab on the last focusable wraps to the first; Shift+Tab on the
       first wraps to the last. Focus that escaped the container (e.g.
       a programmatic .focus() elsewhere) is pulled back on the next Tab.
     - On deactivate/unmount: restores focus to the remembered element
       when it is still in the document.

   STACKED MODALS: a module-level stack tracks every active trap; only
   the TOPMOST trap's keydown handler acts. Without this, a dialog opened
   over another (NoteSheet → NotebookPicker) would have BOTH traps
   fighting over every Tab press.

   NO VISIBILITY FILTER (deliberate): the focusable query does not probe
   offsetParent/getClientRects — a modal's content is visible by
   construction, and those probes read as always-hidden under jsdom,
   which would make the trap untestable. A dialog that conditionally
   hides controls should disable them instead.
   ═══════════════════════════════════════════════════════════════════════ */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** @type {HTMLElement[]} stack of active trap containers; last = topmost */
const _trapStack = [];

/**
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
function _focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR));
}

/**
 * Contain keyboard focus inside a dialog while `active` is true.
 *
 * @param {boolean} active - trap engaged while true (same flag that renders
 *   the dialog; the ref must be attached to the dialog's root element).
 * @returns {{ current: HTMLElement | null }} ref to attach to the dialog root
 */
export function useFocusTrap(active) {
  const ref = React.useRef(/** @type {HTMLElement | null} */ (null));

  React.useEffect(() => {
    if (!active) return undefined;
    const root = ref.current;
    if (!root) return undefined;

    const prev = /** @type {HTMLElement | null} */ (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    _trapStack.push(root);

    // Initial focus: if the dialog already focused something of its own
    // (React autoFocus on the wipe input / note textarea), respect it —
    // the trap must never fight a dialog's designed focus. Otherwise:
    // [data-autofocus] wins, else first focusable, else the container
    // itself (given tabIndex -1 so .focus() works on a plain div).
    const already = document.activeElement;
    if (!(already instanceof Node && root.contains(already))) {
      const preferred = /** @type {HTMLElement | null} */ (root.querySelector('[data-autofocus]'));
      const list = _focusables(root);
      const target = preferred || list[0] || root;
      if (target === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
      try { target.focus(); } catch (_e) { /* best-effort */ }
    }

    /** @param {KeyboardEvent} e */
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      // Stacked modals: only the topmost trap steers Tab.
      if (_trapStack[_trapStack.length - 1] !== root) return;
      const items = _focusables(root);
      if (items.length === 0) { e.preventDefault(); try { root.focus(); } catch (_e2) { /* best-effort */ } return; }
      const first = items[0];
      const last = items[items.length - 1];
      const cur = document.activeElement;
      const inside = cur instanceof Node && root.contains(cur);
      if (e.shiftKey) {
        if (!inside || cur === first) { e.preventDefault(); last.focus(); }
      } else if (!inside || cur === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const i = _trapStack.lastIndexOf(root);
      if (i !== -1) _trapStack.splice(i, 1);
      // Restore focus to where the user was before the dialog opened.
      if (prev && prev.isConnected && document.contains(prev)) {
        try { prev.focus(); } catch (_e) { /* best-effort */ }
      }
    };
  }, [active]);

  return ref;
}

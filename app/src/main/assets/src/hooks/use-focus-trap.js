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
       first element carrying [data-autofocus] (or, when that element is a
       container that cannot take focus, its first focusable), else the
       first focusable, else the container itself (tabIndex -1 is applied
       if absent). A root marked [data-focus-self] takes focus itself, so a
       card opened by a TAP does not open with a focus ring on its first
       control; Tab still walks into it (the Scripture Web's cards, sw1).
     - Tab on the last focusable wraps to the first; Shift+Tab on the
       first wraps to the last. Focus that escaped the container (e.g.
       a programmatic .focus() elsewhere) is pulled back on the next Tab.
     - On deactivate/unmount: restores focus to the remembered element
       when it is still in the document, or to where opts.returnFocus
       names, when the dialog knows better (the Scripture Web's go-to: a
       place chosen sends the keyboard home to the web, not back to the
       search button that opened the box).

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
 * @param {{ modal?: boolean, returnFocus?: () => (HTMLElement | null | undefined) }} [opts] -
 *   `modal: false` (the companion rail's docked panels) neither takes focus nor contains
 *   Tab; it only returns focus on close (see _returnFocusOnClose). `returnFocus` (a modal
 *   trap's) is asked on close where focus goes in place of the element focused when the
 *   dialog opened; null or undefined keeps that element. Read at close, so it may change
 *   from render to render.
 * @returns {{ current: HTMLDivElement | null }} ref to attach to the dialog root
 *   (every dialog root in the app is a <div>)
 */
export function useFocusTrap(active, opts) {
  const ref = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const modal = !(opts && opts.modal === false);
  const returnRef = React.useRef(opts && opts.returnFocus);
  returnRef.current = opts && opts.returnFocus;

  React.useEffect(() => {
    if (!active) return undefined;
    const root = ref.current;
    if (!root) return undefined;

    const prev = /** @type {HTMLElement | null} */ (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!modal) return _returnFocusOnClose(root, prev);
    _trapStack.push(root);

    // Initial focus: if the dialog already focused something of its own
    // (React autoFocus on the wipe input / note textarea), respect it —
    // the trap must never fight a dialog's designed focus. Otherwise:
    // [data-autofocus] wins, else first focusable, else the container
    // itself (given tabIndex -1 so .focus() works on a plain div).
    const already = document.activeElement;
    if (!(already instanceof Node && root.contains(already))) {
      let preferred = /** @type {HTMLElement | null} */ (root.querySelector('[data-autofocus]'));
      // [data-autofocus] may mark a region (the Answers commandment sheet marks
      // its topic list): .focus() on a plain div is a silent no-op, so a
      // container that cannot take focus hands it to its first focusable.
      if (preferred && !preferred.matches(FOCUSABLE_SELECTOR)) {
        preferred = /** @type {HTMLElement | null} */ (preferred.querySelector(FOCUSABLE_SELECTOR));
      }
      const list = _focusables(root);
      const target = root.hasAttribute('data-focus-self') ? root : (preferred || list[0] || root);
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
      // the container itself ([data-focus-self]): Tab steps in to the first, Shift+Tab to the last
      if (cur === root) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
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
      // Restore focus to where the user was before the dialog opened, or where the dialog says.
      const ask = returnRef.current;
      const to = (typeof ask === 'function' && ask()) || prev;
      if (to && to.isConnected && document.contains(to)) {
        try { to.focus(); } catch (_e) { /* best-effort */ }
      }
    };
  }, [active, modal]);

  return ref;
}

/* A NON-modal panel (sweep mw10: the rail's docked footnote / scripture panel) takes no focus and traps
   nothing, but closing it makes it inert, and focus inside an inert panel falls to <body>: the reader
   loses their place in the Tab order. So when it closes with focus inside it (or lost from inside it),
   focus goes back to where it was when the panel opened (the marker that opened it). Focus the reader
   moved elsewhere is left alone.
   @param {HTMLElement} root @param {HTMLElement | null} prev @returns {() => void} */
function _returnFocusOnClose(root, prev) {
  let inside = root.contains(document.activeElement);
  const onIn = () => { inside = true; };
  /** @param {FocusEvent} e */
  const onOut = (e) => { if (e.relatedTarget instanceof Node && !root.contains(e.relatedTarget)) inside = false; };
  root.addEventListener('focusin', onIn);
  root.addEventListener('focusout', onOut);
  return () => {
    root.removeEventListener('focusin', onIn);
    root.removeEventListener('focusout', onOut);
    const cur = document.activeElement;
    const lost = !cur || cur === document.body || root.contains(cur);
    if (inside && lost && prev && prev !== document.body && prev.isConnected && !root.contains(prev)) {
      try { prev.focus({ preventScroll: true }); } catch (_e) { /* best-effort */ }
    }
  };
}

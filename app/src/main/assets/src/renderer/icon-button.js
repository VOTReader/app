/* ═══════════════════════════════════════════════════════════════════════
   icon-button — the inline note, bookmark and link icons as real buttons
   ═══════════════════════════════════════════════════════════════════════
   W65 (sweep 2026-10-13): the icons in the reading text were bare spans
   with a click listener: no Tab stop, no role, no name, no Enter. A
   keyboard or screen-reader reader could never open a note, bookmark or
   link from the text. Each is now a named button the way
   FootnoteListSection's number is (role=button, tabIndex 0, Enter and
   Space run the click's own path), and its svg is out of the
   accessibility tree. Two shapes: the DOM-built icons (dom-links,
   dom-bookmarks, applyNoteIcons) and the React ones (renderNoteIcon,
   BookmarkIcon, LinkIcon).
   ═══════════════════════════════════════════════════════════════════════ */

/** @param {KeyboardEvent | { key: string }} e */
function _isActivateKey(e) { return e.key === 'Enter' || e.key === ' '; }

/**
 * A DOM-built icon becomes a named button; Enter or Space calls `activate`
 * with the key event (and neither scrolls the page nor reaches the text).
 * @param {HTMLElement} el
 * @param {string} label
 * @param {(e: KeyboardEvent) => void} activate
 */
export function makeIconButton(el, label, activate) {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', label);
  el.querySelectorAll('svg').forEach(function (s) { s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); });
  el.addEventListener('keydown', function (e) {
    if (!_isActivateKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    activate(e);
  });
}

/**
 * The same for a React-rendered icon: spread onto its span (the svg takes
 * aria-hidden itself).
 * @param {string} label
 * @param {(e: any) => void} activate
 */
export function iconButtonProps(label, activate) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onKeyDown: (/** @type {any} */ e) => {
      if (!_isActivateKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      activate(e);
    },
  };
}

/**
 * Where a keyboard-opened popover goes: just under the icon, where a tap's
 * point would have been.
 * @param {Element} el
 * @returns {{ x: number, y: number }}
 */
export function iconPoint(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom + 4 };
}

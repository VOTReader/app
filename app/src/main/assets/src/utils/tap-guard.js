/* ═══════════════════════════════════════════════════════════════════════
   tap-guard — tap-to-hide text that is also text
   ═══════════════════════════════════════════════════════════════════════
   Bundled into bundle-d (BibleChapterView, ChapterView). The reading
   screens' section headings, chapter title and study summary hide on a tap:
   they are readable words AND controls. Two ways that went wrong (cp1
   sweep, 2026-09-26, measured on John 7 in desktop Chrome):

   - a double-click on "Rivers of Living Water" hid all 13 headings on its
     FIRST click, and its SECOND click landed on the verse that slid up into
     the heading's place: a word of it ("who") was selected and the
     selection toolbar opened over the text. swallowFollowUpClicks() eats the
     rest of that multi-click, so a double-click does what one click does.
   - a drag across a heading's own words (to select them) ended in a click
     on the heading, which hid them. clickEndedSelection() tells that apart
     from a tap: the reader was selecting.
   ═══════════════════════════════════════════════════════════════════════ */

/** How long the rest of a multi-click is swallowed after the control acted
    (a double-click's second press lands well inside it). */
const FOLLOW_UP_MS = 500;

/**
 * True when the click that is ending now finished a text selection inside
 * `el` (the reader dragged or double-clicked over its words), not a tap.
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function clickEndedSelection(el) {
  try {
    const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
    if (!el || !sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    return sel.getRangeAt(0).intersectsNode(el) && String(sel).trim() !== '';
  } catch (_e) {
    return false;
  }
}

/**
 * Swallow the rest of a multi-click (the presses with detail > 1) for a
 * moment, so a control that removed itself on the first click cannot hand
 * the second one to whatever took its place. Single presses pass untouched.
 * @param {number} [ms]
 */
export function swallowFollowUpClicks(ms = FOLLOW_UP_MS) {
  if (typeof document === 'undefined') return;
  const until = Date.now() + ms;
  const types = ['mousedown', 'mouseup', 'click', 'dblclick'];
  /** @param {Event} ev */
  const eat = (ev) => {
    if (Date.now() > until) { off(); return; }
    if (/** @type {MouseEvent} */ (ev).detail > 1) { ev.preventDefault(); ev.stopPropagation(); }
  };
  const off = () => types.forEach((t) => document.removeEventListener(t, eat, true));
  types.forEach((t) => document.addEventListener(t, eat, true));
  setTimeout(off, ms);
}

/**
 * A show/hide tap on reading chrome (a heading, the chapter title, the
 * summary, their "+ Show" pills): runs `act` for a tap, not for the end of a
 * selection, and keeps the rest of a double-click off the content that
 * slides into the control's place.
 * @param {(() => void) | null | undefined} act
 * @returns {(e: { currentTarget: any }) => void}
 */
export function tapToggle(act) {
  return (e) => {
    if (clickEndedSelection(e && e.currentTarget)) return;
    if (act) act();
    swallowFollowUpClicks();
  };
}

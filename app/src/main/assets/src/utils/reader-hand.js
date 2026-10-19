/* ═══════════════════════════════════════════════════════════════════════
   reader-hand — the reader's own hand on a reading page (search200 UX B1)
   ═══════════════════════════════════════════════════════════════════════
   Imported by ui/components/InstallCard.jsx (bundle-d) and
   hooks/use-reading-position-nav.js (bundle-b). DOM events only; each
   watch keeps its own last-hand time and nothing else.

   A drag, a wheel, the scrollbar or a scroll key moves the page by the
   reader's hand. A tap is not (the find pill's next and a link jump the
   page from a tap), and nor is a scroll with no hand near it (a search
   jump, a restore, autoscroll, read-along's follow). Two places ask:
     - the install card's "reached the end": a search jump that lands at
       the end is not the reader finishing the chapter;
     - the end of a search look: the place a hit opened records nothing
       until the reader reads it, and their own scroll says they are.
   ═══════════════════════════════════════════════════════════════════════ */

/** A scroll this soon after the hand is the hand's (a fling's momentum included, once it has counted). */
export const READER_SCROLL_MS = 1000;
/** The events that carry the hand. Listened for in the capture phase, passive. */
export const READER_HANDS = ['touchmove', 'wheel', 'pointerdown', 'keydown'];
const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Spacebar']);

/**
 * The live reading page's scroller: a .screen-scroll outside a peek clone ([inert]).
 * @param {any} el
 * @returns {boolean}
 */
export function isReadingScroller(el) {
  return !!el && el.nodeType === 1 && el.classList.contains('screen-scroll') && !el.closest('[inert]');
}

/**
 * Whether `e` is the reader's hand on the page.
 * @param {Event} e
 * @param {Element | null} scroller  the page's scroller; null takes any live reading scroller
 * @returns {boolean}
 */
export function isReaderHand(e, scroller) {
  if (e.type === 'touchmove' || e.type === 'wheel') return true;
  // The scrollbar is the scroller's own.
  if (e.type === 'pointerdown') return scroller ? e.target === scroller : isReadingScroller(e.target);
  if (e.type !== 'keydown' || !SCROLL_KEYS.has(/** @type {KeyboardEvent} */ (e).key)) return false;
  const t = /** @type {HTMLElement | null} */ (e.target);
  return !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
}

/**
 * Calls `onReaderScroll` for each scroll of the page that comes within
 * READER_SCROLL_MS of the reader's hand. `scroller` null watches every live
 * reading scroller (the document captures their scrolls; scroll does not bubble).
 * @param {Element | null} scroller
 * @param {() => void} onReaderScroll
 * @returns {() => void} stops watching
 */
export function watchReaderScroll(scroller, onReaderScroll) {
  let handAt = -Infinity;
  const onHand = (/** @type {Event} */ e) => { if (isReaderHand(e, scroller)) handAt = Date.now(); };
  const onScroll = (/** @type {Event} */ e) => {
    if (!scroller && !isReadingScroller(e.target)) return;
    if (Date.now() - handAt < READER_SCROLL_MS) onReaderScroll();
  };
  const scrollTarget = scroller || document;
  const scrollCapture = !scroller;
  for (const t of READER_HANDS) document.addEventListener(t, onHand, { capture: true, passive: true });
  scrollTarget.addEventListener('scroll', onScroll, { capture: scrollCapture, passive: true });
  return () => {
    for (const t of READER_HANDS) document.removeEventListener(t, onHand, true);
    scrollTarget.removeEventListener('scroll', onScroll, scrollCapture);
  };
}

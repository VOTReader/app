/* ═══════════════════════════════════════════════════════════════════════
   keep-line — a text size change keeps the reader's line (U10.1)
   ═══════════════════════════════════════════════════════════════════════
   UX wave 3 (2026-10-22): A+ kept the same scrollTop, so the line being read
   jumped 286 px down the screen. keepReadersLine(change) notes the first block
   of text whose bottom is below the scroller's top and how far its top sits
   from there, runs the change (the --font-scale write), then scrolls so that
   block's top sits the same distance from the scroller's top again. Layout is
   read straight after the change, so nothing paints in between.
   ═══════════════════════════════════════════════════════════════════════ */

/** The blocks a reader's place is kept by: the reading text's own blocks. */
const BLOCKS = '[data-hl-key]';

/**
 * Run `change` without moving the reader's line. With no scroller on the page (or no text in it) it just runs.
 * @param {() => void} change
 * @param {Document} [doc]
 */
export function keepReadersLine(change, doc = document) {
  const scroller = /** @type {HTMLElement | null} */ (doc.querySelector('.screen-scroll'));
  let anchor = /** @type {Element | null} */ (null);
  let offset = 0;
  if (scroller && scroller.scrollTop > 0) {
    const top = scroller.getBoundingClientRect().top;
    for (const el of scroller.querySelectorAll(BLOCKS)) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > top) { anchor = el; offset = r.top - top; break; }
    }
  }
  change();
  if (!scroller || !anchor || !anchor.isConnected) return;
  const top = scroller.getBoundingClientRect().top;
  const moved = anchor.getBoundingClientRect().top - top - offset;
  if (Math.abs(moved) >= 1) scroller.scrollTop += moved;
}

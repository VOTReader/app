/* reading-bars.js - on the phone, the bars step aside while a recording plays on a reading page (1b-letter-playing:
   "scrolled into the text, bars hidden"; the rule agreed with readalong 2026-10-15). Once the page head has gone under
   the top bar, the top bar and the tab bar hide and the text takes the screen (the mini player stays); they come back
   when the reader scrolls the head into view or the playing stops. A playing page whose head still shows keeps Back.

   No jump: when the top bar goes or comes, the page moves by exactly what the scroller's top edge moved, so every line
   stays where it was on the screen (and the read-along's follow sees no lurch). The head is always judged against one
   line - where the top bar's bottom edge is when it shows - so the move itself can never flip the bars back. A new page
   starts with the bars shown and is never moved. */

/** The pages that read (a letter, a Bible chapter). */
export const READING_PLACES = ['letter', 'bible-chapter'];

/**
 * True when the page head's bottom is at or above `line` (the top bar's bottom edge on the screen), i.e. the head has
 * gone under the bar. A page with no head counts as gone once it has scrolled at all; a head with no box (not laid out
 * yet, or hidden) never does.
 * @param {HTMLElement} scroller @param {number} line
 */
export function headGone(scroller, line) {
  const head = scroller.querySelector('.page-head');
  if (!head) return scroller.scrollTop > 0;
  const r = head.getBoundingClientRect();
  return r.height > 0 && r.bottom <= line;
}

/**
 * The shell's bars state for the phone. `on` = the phone, a reading place, the player playing, not full screen; `page`
 * = the route shown (a new one resets). Returns whether the bars are hidden and `check`, which the shell calls on
 * scroll (and after a gate's scroll).
 * @param {{ scrollRef: { current: HTMLElement | null }, on: boolean, page: any }} args
 */
export function useReadingBars({ scrollRef, on, page }) {
  const [st, setSt] = React.useState(() => ({ page, hidden: false }));
  const hidden = on && st.page === page && st.hidden;
  const line = React.useRef(/** @type {number | null} */ (null));
  const top = React.useRef(/** @type {number | null} */ (null));
  const shownOn = React.useRef(page);

  const check = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // the line is measured while the bars show: the scroller then starts right under the top bar
    if (!hidden) line.current = el.getBoundingClientRect().top;
    const gone = on && line.current != null && headGone(el, line.current);
    setSt((s) => (s.page === page && s.hidden === gone ? s : { page, hidden: gone }));
  }, [scrollRef, on, page, hidden]);

  // the bars went or came on this page: move the page by what its top edge moved (a new page is never moved)
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const now = el.getBoundingClientRect().top;
    if (shownOn.current === page && top.current != null && now !== top.current) el.scrollTop += now - top.current;
    shownOn.current = page;
    top.current = now;
  }, [hidden, page, scrollRef]);

  // playing starts or stops while the page sits still
  React.useEffect(() => { check(); }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  return { hidden, check };
}

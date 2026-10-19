/* ═══════════════════════════════════════════════════════════════════════
   SrchSnippet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The first line a result's snippet box shows (search200 UX D5): whole lines only, the
 * line holding the first mark in the middle row where the text allows, a mark wrapped
 * over two lines shown whole (its start always in view), and never past the last lines
 * that fill the box. Pure.
 * @param {{ startMid: number, endMid: number, lineHeight: number, height: number, rows: number }} m
 *   startMid / endMid: the middle of the mark's first and last line fragments, from the
 *   text's top (px); height: the whole text's height (px); rows: the lines the box shows
 * @returns {number} a line index; 0 when the text fits or the measure is unusable
 */
export function firstLineShown({ startMid, endMid, lineHeight, height, rows }) {
  if (!(lineHeight > 0) || !(height > 0) || !(rows >= 1)) return 0;
  const last = Math.round(height / lineHeight) - rows;
  if (!(last > 0)) return 0;
  const start = Math.floor(startMid / lineHeight);
  const end = Math.max(start, Math.floor(endMid / lineHeight));
  let first = start - Math.floor((rows - 1) / 2);
  if (end > first + rows - 1) first = Math.min(start, end - rows + 1);
  return Math.min(last, Math.max(0, first));
}

/** `start` (a placed hit's placeStart): the snippet opens there, where the tap lands (sweep W33).
 *  `typed`: the words the reader typed, apart from the engine's forms in `terms` (search200 B7). */
export function SrchSnippet({ text, terms, maxLen = 180, start = undefined, typed = undefined }) {
  const ref = React.useRef(null);

  /* THE FIRST MARK IN VIEW, IN WHOLE LINES (search200 UX D5). The box scrolled to put
     the mark's middle at its own middle, and a mark wrapped over two lines has its middle
     on the line between them: the box stopped half a line in and cut its top and bottom
     lines through the letters ("the false prophet", Revelation 20:10 at Text Size 140%).
     The text moves up by whole lines (firstLineShown) in a box exactly three lines tall
     (app.css .srch-snippet-scroll), as the text's own margin in em, so it holds at any
     Text Size and on any pixel grid. On EVERY render, not only the first: Book order
     re-sorts a group in place and React moves the card's element (review of 74a9c334). */
  React.useLayoutEffect(() => {
    const box = ref.current;
    const lines = box && /** @type {HTMLElement|null} */ (box.firstElementChild);
    if (!lines) return;
    if (box.scrollTop) box.scrollTop = 0;
    const mark = lines.querySelector('mark');
    const frags = mark ? mark.getClientRects() : null;
    let shift = '';
    if (frags && frags.length) {
      const cs = getComputedStyle(lines);
      const lh = parseFloat(cs.lineHeight);
      const fs = parseFloat(cs.fontSize);
      const at = lines.getBoundingClientRect();
      const first = frags[0];
      const last = frags[frags.length - 1];
      const line = firstLineShown({
        startMid: (first.top + first.bottom) / 2 - at.top,
        endMid: (last.top + last.bottom) / 2 - at.top,
        lineHeight: lh,
        height: at.height,
        rows: Math.round(box.getBoundingClientRect().height / lh),
      });
      if (line > 0 && fs > 0) shift = '-' + Number((line * lh / fs).toFixed(4)) + 'em';
    }
    if (lines.style.marginTop !== shift) lines.style.marginTop = shift;
  });

  if (!text) return null;
  const sm = window.VotSearchMini;
  const snippet = typeof start !== 'number' ? sm.snippet(text, terms || [], maxLen) :
    typeof sm.snippetAt === 'function' ? sm.snippetAt(text, start, maxLen) :
    sm.snippet(text.slice(start), terms || [], maxLen);
  const spans = window.VotSearchMini.highlightSpans(snippet, terms || [], typed);
  return (
    <div ref={ref} className="srch-snippet-scroll">
      <div className="srch-snippet-lines">
        {spans.map((s, i) =>
          s.hit ? (
            <mark key={i} className="search-highlight">{s.text}</mark>
          ) : (
            <React.Fragment key={i}>{s.text}</React.Fragment>
          )
        )}
      </div>
    </div>
  );
}

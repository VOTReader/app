/* ═══════════════════════════════════════════════════════════════════════
   WebFallbackList — the Scripture Web read as a list (A7, 2026-09-22)
   Cluster F (esbuild bundle-f.js). Rendered by ScriptureWebScreen when the
   device cannot draw the web (no WebGL2, or a GPU reset that never restores).

   It used to be a dead end ("The web can't be drawn right now", Try again,
   Go back). Now it answers the question the map answers, a chapter at a
   time: which passages connect here. Layout chosen from three rounds of
   Codex mockups (lanes/myweb/out/mockups/round3-imagegen/fallback-3.png):
   a chapter stepper, a quiet note with Try again, then one card per verse
   of the chapter ("Verse 16 · 3 connections"), each row the other end's
   reference, its verse in the reader's translation, and its tier.
   Data: utils/scripture-web/chapter-connections.js (the Famous view's
   threads, the same ranking the map uses).
   ═══════════════════════════════════════════════════════════════════════ */

import { chapterConnections } from '../../utils/scripture-web/chapter-connections.js';

const plural = (n, one) => n + ' ' + one + (n === 1 ? '' : 's');

/* n6-05: where to reopen after the list sends the reader away. Following a
   connection reads a verse, which History records, so the screen's
   initialChapter (History's newest chapter) came back as the chapter just
   visited, and Try again remounts the list: both lost the reader's place.
   Set by those two exits, used once by the next mount; any other way in
   opens on History's chapter as before. */
/** @type {number | null} */
let resumeChapter = null;

/** Tests only: forget the resume point between cases. */
export function _resetFallbackPlace() { resumeChapter = null; }

/**
 * @param {{ graph: any, initialChapter: number, onOpen: (ref: any) => void,
 *   onRetry: () => void, onBack: () => void, verseText: (ref: any) => string }} props
 */
export function WebFallbackList({ graph, initialChapter, onOpen, onRetry, onBack, verseText }) {
  const [ci, setCi] = React.useState(() => {
    const at = resumeChapter;
    resumeChapter = null;
    return at != null && graph.chapters[at] ? at : initialChapter;
  });
  const data = React.useMemo(() => chapterConnections(graph, ci), [graph, ci]);
  const ch = graph.chapters[ci];
  const book = ch ? graph.books[ch[0]] : null;
  const label = book ? book.title + ' ' + ch[1] : '';
  const last = graph.chapters.length - 1;
  // n6-06: the label opens a picker under the stepper (book select + chapter grid).
  const [picking, setPicking] = React.useState(false);
  const toggleRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  const closePicker = React.useCallback(() => {
    setPicking(false);
    const el = toggleRef.current;
    if (el) el.focus();
  }, []);
  const go = React.useCallback((/** @type {number} */ at) => { setCi(at); closePicker(); }, [closePicker]);
  return (
    <div className="sw-fallback-list" data-chapter={label}>
      <div className="swf-head">
        {/* the list covers the screen's chrome, so the way back sits at the top, not after 500 rows */}
        <button type="button" className="swf-back" onClick={onBack} aria-label="Go back">‹ Back</button>
        <h1 className="swf-title">Scripture Web</h1>
        <div className="swf-sub">Connections from {label}</div>
      </div>
      <div className="swf-stepper" role="group" aria-label="Chapter">
        <button type="button" className="swf-step" aria-label="Previous chapter" disabled={ci <= 0}
          onClick={() => setCi((c) => Math.max(0, c - 1))}>‹</button>
        <button type="button" ref={toggleRef} className="swf-step-label" aria-live="polite"
          aria-label={label + ', choose a chapter'} aria-expanded={picking} aria-controls="swf-picker"
          onClick={() => (picking ? closePicker() : setPicking(true))}>
          {label}
        </button>
        <button type="button" className="swf-step" aria-label="Next chapter" disabled={ci >= last}
          onClick={() => setCi((c) => Math.min(last, c + 1))}>›</button>
      </div>
      {picking && ch && <ChapterPicker key={ci} graph={graph} ci={ci} onGo={go} onClose={closePicker} />}
      <div className="swf-note">
        <span>The map can’t be drawn on this device right now.</span>
        <button type="button" className="swf-retry" onClick={() => { resumeChapter = ci; onRetry(); }}>Try again</button>
      </div>
      <div className="swf-count-row">
        <h2 className="swf-h2">Connected passages</h2>
        <span className="swf-count">{plural(data.total, 'connection')}</span>
      </div>
      {data.groups.map((grp) => (
        <section key={grp.verse.label} className="swf-card" aria-label={'Verse ' + grp.verse.verse}>
          <div className="swf-card-head">
            <span className="swf-card-verse">Verse {grp.verse.verse}</span>
            <span className="swf-card-count"> · {plural(grp.rows.length, 'connection')}</span>
          </div>
          <ul className="swf-rows">
            {grp.rows.map((row) => (
              <li key={row.index}>
                <button type="button" className="swf-row" onClick={() => { resumeChapter = ci; onOpen(row.other); }}
                  aria-label={row.other.label + (row.tier === 'essential' ? ', essential' : ', famous')}>
                  <span className="swf-row-top">
                    <span className="swf-ref">{row.other.label}</span>
                    <span className="swf-tier">{row.tier === 'essential' ? 'Essential' : 'Famous'}</span>
                  </span>
                  <span className="swf-snip">{verseText(row.other)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {data.total === 0 && <div className="swf-empty">Nothing in the Famous view connects to {label}.</div>}
    </div>
  );
}

/** The canon's first 39 books are the Old Testament (the graph keeps canonical order). */
const OT_BOOKS = 39;

/**
 * n6-06: the chapter picker under the stepper. One select for the book (grouped
 * Old/New Testament when the graph holds the 66), then that book's chapters as
 * a grid; the current chapter is marked, a tap goes there. Choosing a book
 * alone goes nowhere. Escape closes it.
 * @param {{ graph: any, ci: number, onGo: (ci: number) => void, onClose: () => void, key?: number }} props
 */
function ChapterPicker({ graph, ci, onGo, onClose }) {
  const [bi, setBi] = React.useState(() => graph.chapters[ci][0]);
  const books = graph.books;
  /** @type {number[]} chapter indexes of the chosen book, in order */
  const own = React.useMemo(() => {
    const out = [];
    for (let i = 0; i < graph.chapters.length; i++) if (graph.chapters[i][0] === bi) out.push(i);
    return out;
  }, [graph, bi]);
  const title = books[bi] ? books[bi].title : '';
  // Psalms 119 sits far down a 150-chapter grid: open with the current chapter in view.
  const gridRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  React.useLayoutEffect(() => {
    const grid = gridRef.current;
    const cur = grid && /** @type {HTMLElement | null} */ (grid.querySelector('[aria-current]'));
    if (grid && cur) grid.scrollTop = Math.max(0, cur.offsetTop - grid.offsetTop - (grid.clientHeight - cur.offsetHeight) / 2);
  }, []);
  /** @param {number} from @param {number} to */
  const options = (from, to) => books.slice(from, to).map((/** @type {any} */ b, /** @type {number} */ k) => (
    <option key={b.id} value={String(from + k)}>{b.title}</option>
  ));
  return (
    <div className="swf-picker" id="swf-picker" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <label className="swf-picker-cap" htmlFor="swf-picker-book">Book</label>
      <select id="swf-picker-book" className="swf-picker-book" value={String(bi)} onChange={(e) => setBi(Number(e.target.value))}>
        {books.length === 66
          ? [<optgroup key="ot" label="Old Testament">{options(0, OT_BOOKS)}</optgroup>,
            <optgroup key="nt" label="New Testament">{options(OT_BOOKS, 66)}</optgroup>]
          : options(0, books.length)}
      </select>
      <div className="swf-picker-cap" aria-hidden="true">Chapter</div>
      <div ref={gridRef} className="swf-picker-grid" role="group" aria-label={'Chapters of ' + title}>
        {own.map((i) => (
          <button key={i} type="button" className="swf-picker-ch" aria-label={title + ' ' + graph.chapters[i][1]}
            aria-current={i === ci ? 'true' : undefined} onClick={() => onGo(i)}>{graph.chapters[i][1]}</button>
        ))}
      </div>
    </div>
  );
}
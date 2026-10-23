/** @jsx h */
/** @jsxFrag Fragment */
/* ═══════════════════════════════════════════════════════════════════════
   AnswersContents — an Answers topic's "On this page" (Cluster D, bundle-d)
   ═══════════════════════════════════════════════════════════════════════
   AOGCG final design f10: every site section with its number (from the
   site's heading levels) and its sub ("7 passages", "1 chart", "See: 2
   links"); the current one marked "Reading now" with its passages under it.
   The same rows make the desktop rail (f07/f08 desktop), without the
   passages. Topics over 8,000 words offer Fold (f10b). The page owns the
   jump (it knows its scroller, its running head and its pulse), and runs it
   after the sheet has closed and given focus back without scrolling
   (use-focus-trap.js preventScroll), so the jump is never undone (U4).
   Rows come from utils/answers-topic.js answersTocRows.
   ═══════════════════════════════════════════════════════════════════════ */

import { h, Fragment } from '../jsx-h.js';
import { AnsSheet } from '../sheets/AnswersSheets.jsx';
import { Chev } from './AnswersParts.jsx';
import { SEP } from '../../utils/answers-browse.js';

/** f10b: the Fold switch (the kit toggle), off by default, remembered per topic by the page. */
export function FoldRow({ on, onChange }) {
  return (
    <div className="ans-row is-2">
      <span className="ans-row-body"><span className="ans-row-title">Fold sections</span><span className="ans-row-sub">Show headings only. Find and search still open them.</span></span>
      <label className="settings-toggle">
        <input type="checkbox" role="switch" checked={on} aria-checked={on} aria-label="Fold sections" onChange={(e) => onChange(e.target.checked)} />
        <span className="settings-toggle-track" /><span className="settings-toggle-thumb" />
      </label>
    </div>
  );
}

/**
 * The section rows; the current one carries "Reading now" and (withEx) its passages, three of them
 * and "Show N more" past four.
 * @param {{ rows: import('../../utils/answers-topic.js').AnswersTocRow[], cur: number, withEx: boolean,
 *   onSection: (k: number) => void, onExcerpt: (at: number) => void }} props
 */
export function TocRows({ rows, cur, withEx, onSection, onExcerpt }) {
  // "Show N more" opens the current row's list only: a new current row starts at three again
  const [moreAt, setMoreAt] = React.useState(-1);
  const more = moreAt === cur;
  return rows.map((r, k) => {
    const current = k === cur;
    const l2 = r.level === 2 ? ' is-l2' : '';
    const ex = current && withEx ? r.ex : [];
    const shown = ex.length > 4 && !more ? ex.slice(0, 3) : ex;
    return (
      <React.Fragment key={r.at + ':' + r.anchor}>
        <a className={'ans-row ans-toc-sec' + l2 + (current ? ' is-current' : '')} href={'#' + r.anchor} aria-current={current ? 'location' : undefined}
          onClick={(e) => { e.preventDefault(); onSection(k); }}>
          <span className="ans-num">{r.num}</span>
          <span className="ans-row-body">
            <span className="ans-row-title">{r.title}</span>
            {r.sub || current ? <span className="ans-row-sub">{r.sub}{current ? <>{r.sub ? SEP : ''}<span className="ans-now">Reading now</span></> : null}</span> : null}
          </span>
        </a>
        {shown.map((x) => (
          <a key={x.at} className={'ans-row ans-toc-ex' + l2} href="#" aria-label={'“' + x.title + '”, ' + x.collection} onClick={(e) => { e.preventDefault(); onExcerpt(x.at); }}>
            <span className="ans-row-body"><span className="ans-row-sub">{'“' + x.title + '”'}</span></span>
          </a>
        ))}
        {ex.length > 4 && !more ? (
          <button type="button" className={'ans-textbtn ans-toc-more' + l2} aria-expanded="false" onClick={() => setMoreAt(cur)}>{'Show ' + (ex.length - 3) + ' more'}<Chev dir="down" /></button>
        ) : null}
      </React.Fragment>
    );
  });
}

/**
 * f10: "On this page", opened from the running head or the hero's contents line; it opens scrolled
 * so the current row shows. Tall at Text Size 2 and up (ts2).
 * @param {{ title: string, rows: any[], cur: number, meta: string, foldable: boolean, foldOn: boolean, ts2?: boolean,
 *   onFold: (on: boolean) => void, onSection: (k: number) => void, onExcerpt: (at: number) => void, onClose: () => void }} props
 */
export function AnswersContentsSheet({ title, rows, cur, meta, foldable, foldOn, ts2, onFold, onSection, onExcerpt, onClose }) {
  const ref = React.useRef(/** @type {HTMLHeadingElement | null} */ (null));
  React.useEffect(() => {
    const sheet = ref.current && ref.current.closest('.ans-sheet');
    const row = sheet && /** @type {HTMLElement | null} */ (sheet.querySelector('.ans-toc-sec.is-current'));
    const head = sheet && /** @type {HTMLElement | null} */ (sheet.querySelector('.ans-sheet-head'));
    // only when the row (and its passages under it) would sit below the sheet's fold
    if (!sheet || !row) return;
    const shown = row.offsetTop + row.offsetHeight * 2 <= sheet.scrollTop + sheet.clientHeight;
    if (!shown) sheet.scrollTop = Math.max(0, row.offsetTop - (head ? head.offsetHeight : 0) - 8);
  }, [cur]);
  return (
    <AnsSheet label="On this page" tall={!!ts2} onClose={onClose} head={<p className="ans-label">On this page</p>}>
      <h2 className="ans-h2" ref={ref}>{title}</h2>
      <p className="ans-meta">{meta}</p>
      {foldable ? <FoldRow on={foldOn} onChange={onFold} /> : null}
      <TocRows rows={rows} cur={cur} withEx={true} onSection={onSection} onExcerpt={onExcerpt} />
    </AnsSheet>
  );
}

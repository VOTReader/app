/* FindStrip - Find in this page (mw7, v2-gaps 13; design dz15 1i; main's FindInUnit, given a field): a strip under the top
   bar, in the flow, holding one rounded field as a browser's find bar does: the word, "1 of 3", Previous place / Next
   place (off under two places), a divider, and Close (which takes the marks away). Every place is marked (find.js); the
   current one wears 5c's gold wash and is brought into view a third of the way down when it is off the screen. Enter
   steps to the next place, Shift+Enter back, Escape closes. The marks follow the page: when its text changes under them
   (a page that was still loading, a highlight painted) they are made again, the current place kept. */
import { Icon } from './Icon.jsx';
import { markFind, showCurrent, unmarkFind, placeFrom } from './find.js';
import { placeAtThird } from './search-landing.js';

/** How long typing settles before the page is marked again (ms). */
const TYPE_MS = 90;

/**
 * Brings `el` into view a third of the way down when any of it is outside what shows between the bars.
 * @param {HTMLElement | null} el
 */
export function bringIntoView(el) {
  if (!el) return;
  const sc = /** @type {HTMLElement | null} */ (el.closest('.main') || el.closest('.content'));
  if (!sc) return;
  const doc = el.ownerDocument;
  const s = sc.getBoundingClientRect();
  const over = ['.tb', '.fnd'].map((q) => doc.querySelector(q)).filter(Boolean)
    .reduce((top, x) => Math.max(top, /** @type {Element} */ (x).getBoundingClientRect().bottom), s.top);
  const tabs = doc.querySelector('.tabbar');
  const bottom = Math.min(s.bottom, tabs ? tabs.getBoundingClientRect().top : s.bottom);
  const r = el.getBoundingClientRect();
  if (r.top >= over && r.bottom <= bottom) return;
  placeAtThird(el);
}

/**
 * @param {{ rootRef: { current: HTMLElement | null }, noun: string, start?: { q?: string, near?: Element | null },
 *   gate?: any, onClose: () => void }} props
 *   rootRef the page's scroller (its reading blocks are searched); noun main's word for the page ('entry', 'letter',
 *   'topic', 'chapter'); start what the strip opens with (a search landing's words and its block)
 */
export function FindStrip({ rootRef, noun, start = {}, gate = null, onClose }) {
  const [q, setQ] = React.useState(start.q || '');
  const [found, setFound] = React.useState({ count: 0, cur: 0 });
  const marks = React.useRef(/** @type {HTMLElement[][]} */ ([]));
  const cur = React.useRef(0);
  const input = React.useRef(/** @type {HTMLInputElement | null} */ (null));
  const near = React.useRef(start.near || null);
  const opened = React.useRef(start.q || '');   // what the strip opened with: marked at once, typing settles first

  React.useEffect(() => {
    if (!gate && input.current) input.current.focus();
  }, [gate]);

  // mark the page for `q`, and again whenever its text changes under the marks (never for find's own marking)
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let first = true;
    /** @type {MutationObserver | null} */
    let obs = null;
    const watch = { childList: true, subtree: true, characterData: true };
    const build = () => {
      if (obs) obs.disconnect();
      unmarkFind(root);
      const out = markFind(root, q);
      marks.current = out.marks;
      let at = Math.min(cur.current, Math.max(0, out.marks.length - 1));
      if (first) at = near.current ? placeFrom(out.marks, near.current) : 0;
      cur.current = at;
      showCurrent(out.marks, at);
      setFound({ count: out.count, cur: at });
      if (first && out.marks.length && !gate) bringIntoView(out.marks[at][0]);
      if (out.marks.length) first = false;
      if (obs) { obs.takeRecords(); obs.observe(root, watch); }
    };
    let t = setTimeout(build, q === opened.current ? 0 : TYPE_MS);
    if (typeof MutationObserver === 'function') {
      // a gate boot marks at once, so the page it says is ready already wears its marks
      obs = new MutationObserver(() => { clearTimeout(t); if (gate) build(); else t = setTimeout(build, 120); });
      obs.observe(root, watch);
    }
    return () => {
      clearTimeout(t);
      if (obs) obs.disconnect();
      unmarkFind(root);
      marks.current = [];
    };
  }, [q, rootRef, gate]);

  const step = (/** @type {number} */ d) => {
    const list = marks.current;
    if (list.length < 2) return;
    const at = (cur.current + d + list.length) % list.length;
    cur.current = at;
    near.current = null;
    showCurrent(list, at);
    setFound((f) => ({ ...f, cur: at }));
    bringIntoView(list[at][0]);
  };
  const close = () => { onClose(); };
  const onKey = (/** @type {any} */ e) => {
    if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  const many = found.count > 1;
  const count = !q.trim() ? '' : found.count ? (found.cur + 1) + ' of ' + found.count : 'Not found';
  return (
    <div className="fnd" role="toolbar" aria-label={'Search words in this ' + noun}>
      <div className={'fld' + (gate ? ' on' : '')}>
        <Icon name="search" />
        {gate
          ? <><span className="q">{q}</span><span className="caret" /></>
          : <input ref={input} className="q" type="search" value={q} aria-label={'Find in this ' + noun} enterKeyHint="next"
              autoComplete="off" autoCorrect="off" spellCheck={false} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />}
        <span className="cnt num" role="status">{count}</span>
        <button type="button" className="ic" aria-label="Previous place" disabled={!many} onClick={() => step(-1)}><Icon name="down2" flip /></button>
        <button type="button" className="ic" aria-label="Next place" disabled={!many} onClick={() => step(1)}><Icon name="down2" /></button>
        <span className="sep" />
        <button type="button" className="ic" aria-label="Close" onClick={close}><Icon name="close" /></button>
      </div>
    </div>
  );
}

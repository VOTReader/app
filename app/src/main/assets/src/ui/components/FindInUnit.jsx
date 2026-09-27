/* ═══════════════════════════════════════════════════════════════════════
   FindInUnit — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   A unit opened from search (a letter, a WTLB / Blessed / Holy Days entry,
   an Answers topic, a study chapter) marks every place the search words
   appear and carries a small pill to step between them: "flood  2 of 3
   ‹ › ×" (Brianna, 2026-09-26). The result card already lists the places;
   this is the same list, on the page.

   WHAT IT READS. The rendered unit: the text nodes under the host's body
   (mainRef), footnote numbers, controls and hidden text skipped, block
   elements and line breaks read as a space, so a place is found in the words
   the reader sees. The places are the search's own (VotSearchMini.findPlaces
   over that text, with the terms the result card marked): the same runs a
   card lists, the rarer word leading when the words never meet.

   HOW IT MARKS. The CSS Custom Highlight API, like ReadAlongHighlight: Ranges
   over the text nodes, registered as ::highlight(vot-find) (every place) and
   ::highlight(vot-find-current) (the place being looked at). No DOM mutation,
   so annotations, selection and the read detector are untouched. A browser
   without the API (iOS before 17.2) still gets the pill and the stepping,
   unmarked. A DOM change under the body (the annotation paint, a re-render)
   rebuilds the Ranges, debounced.

   HOW IT MOVES. A step is the reader's own tap, so it scrolls the way the
   search landing and the Answers contents jump do: ONE scrollTo on the
   `.screen-scroll` container, the reader-initiated one-shot class of write
   that the lease in use-autoscroll.js's header leaves with the finger. The
   place goes 40% down the view, clear of the pill. The first place is the
   one the reader tapped; once the host's landing scroll has settled (and no
   scroll restore is running) it is brought into view only if the landing
   left it out, which a long block does (the landing centres its middle).

   Live pane only (never an inert peek: one registration per highlight name),
   portaled to <body> like the autoscroll pill, so a swipe transform on
   `.pager-track` cannot carry it off.
   ═══════════════════════════════════════════════════════════════════════ */

import { scrollBehavior } from '../../utils/reduced-motion.js';

const HL_ALL = 'vot-find';
const HL_CURRENT = 'vot-find-current';
/** Text in these is not the unit's words: footnote numbers, controls, icons. */
const SKIP = '.fn-ref, sup, button, svg, [aria-hidden="true"], script, style';
const PLACE_LEN = 120;
const LETTER = /\p{L}/u;

/**
 * The unit's words as the reader sees them, and where each run of them lives:
 * `flat` joins the text nodes in document order (a block element, a line
 * break and a hidden run break it with one space), `segs` maps flat offsets
 * back to text nodes.
 * @param {Element | null} root
 * @returns {{ flat: string, segs: Array<{ node: Text, start: number, end: number }> }}
 */
export function readUnitText(root) {
  /** @type {Array<{ node: Text, start: number, end: number }>} */
  const segs = [];
  let flat = '';
  if (!root) return { flat, segs };
  const sep = () => { if (flat && !/\s$/.test(flat)) flat += ' '; };
  const view = root.ownerDocument && root.ownerDocument.defaultView;
  /** @param {Element} el */
  const walk = (el) => {
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) {
        const t = /** @type {Text} */ (c);
        if (!t.data) continue;
        segs.push({ node: t, start: flat.length, end: flat.length + t.data.length });
        flat += t.data;
        continue;
      }
      if (c.nodeType !== 1) continue;
      const e = /** @type {Element} */ (c);
      if (e.tagName === 'BR') { sep(); continue; }
      if (e.matches(SKIP)) continue;
      const display = view ? view.getComputedStyle(e).display : 'inline';
      if (display === 'none') continue;
      const block = display !== 'contents' && !display.startsWith('inline');
      if (block) sep();
      walk(e);
      if (block) sep();
    }
  };
  walk(root);
  return { flat, segs };
}

/**
 * A Range over flat[a, b), or null when either end falls between text nodes.
 * @param {Array<{ node: Text, start: number, end: number }>} segs
 * @param {number} a
 * @param {number} b
 * @returns {Range | null}
 */
export function rangeFor(segs, a, b) {
  const find = (/** @type {number} */ i) => {
    let lo = 0;
    let hi = segs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (i < segs[mid].start) hi = mid - 1;
      else if (i >= segs[mid].end) lo = mid + 1;
      else return segs[mid];
    }
    return null;
  };
  const sa = find(a);
  const sb = find(b - 1);
  if (!sa || !sb) return null;
  const r = sa.node.ownerDocument.createRange();
  r.setStart(sa.node, a - sa.start);
  r.setEnd(sb.node, b - sb.start);
  return r;
}

/**
 * Where the landing excerpt (search-index text, whitespace squashed) starts in
 * `flat`: its head is looked for at 40, then 24, then 12 characters, the way
 * excerptLanding does, in a squashed copy of flat mapped back. -1 when absent.
 * @param {string} flat
 * @param {string} excerpt
 * @returns {number}
 */
export function locate(flat, excerpt) {
  const want = String(excerpt || '').replace(/\s+/g, ' ').trim();
  if (!want) return -1;
  let sq = '';
  /** @type {number[]} */
  const map = [];
  let space = true;
  for (let i = 0; i < flat.length; i++) {
    if (/\s/.test(flat[i])) {
      if (!space) { sq += ' '; map.push(i); space = true; }
    } else {
      sq += flat[i]; map.push(i); space = false;
    }
  }
  for (const len of [40, 24, 12]) {
    const head = want.slice(0, len);
    if (!head) break;
    const at = sq.indexOf(head);
    if (at >= 0) return map[at];
  }
  return -1;
}

/** @param {string} flat @param {number} i  the end of the word a hit starts */
function wordEnd(flat, i) {
  while (i < flat.length && LETTER.test(flat[i])) i++;
  return i;
}

/**
 * @param {Array<{ start: number }>} places
 * @param {number} at
 * @returns {number} the place starting nearest `at` (0 when `at` is unknown)
 */
function nearest(places, at) {
  if (at < 0 || !places.length) return 0;
  let best = 0;
  for (let i = 1; i < places.length; i++) {
    if (Math.abs(places[i].start - at) < Math.abs(places[best].start - at)) best = i;
  }
  return best;
}

/** The API is there (chrome 105+, Safari 17.2+). */
function canMark() {
  return typeof CSS !== 'undefined' && !!(/** @type {any} */ (CSS).highlights) && typeof (/** @type {any} */ (window).Highlight) === 'function';
}

function unmark() {
  if (!canMark()) return;
  /** @type {any} */ (CSS).highlights.delete(HL_ALL);
  /** @type {any} */ (CSS).highlights.delete(HL_CURRENT);
}

/**
 * @param {Array<{ ranges: Range[] }>} places
 * @param {number} cur
 */
function mark(places, cur) {
  if (!canMark()) return;
  const H = /** @type {any} */ (window).Highlight;
  const rest = [];
  for (let i = 0; i < places.length; i++) if (i !== cur) rest.push(...places[i].ranges);
  const all = new H(...rest);
  all.priority = 1;
  const now = new H(...(places[cur] ? places[cur].ranges : []));
  now.priority = 2;
  /** @type {any} */ (CSS).highlights.set(HL_ALL, all);
  /** @type {any} */ (CSS).highlights.set(HL_CURRENT, now);
}

/** Where a range is on screen; its text's element where a Range cannot say. */
function rectOf(/** @type {Range} */ range) {
  if (typeof range.getBoundingClientRect === 'function') return range.getBoundingClientRect();
  const el = range.startContainer && range.startContainer.parentElement;
  return el ? el.getBoundingClientRect() : null;
}

/**
 * Scroll a place 40% down the reading view (one reader-initiated write).
 * @param {Element} root
 * @param {{ ranges: Range[] }} place
 */
function reveal(root, place) {
  const sc = root.closest('.screen-scroll');
  if (!sc || !place || !place.ranges.length) return;
  const r = rectOf(place.ranges[0]);
  if (!r || (r.top === 0 && r.bottom === 0)) return;
  const sr = sc.getBoundingClientRect();
  const top = sc.scrollTop + (r.top - sr.top) - sr.height * 0.4;
  sc.scrollTo({ top: Math.max(0, top), behavior: /** @type {ScrollBehavior} */ (scrollBehavior()) });
}

/**
 * Is the place in the comfortable part of the view (not under the top edge,
 * not under the pill)?
 * @param {Element} root
 * @param {{ ranges: Range[] }} place
 */
function inView(root, place) {
  const sc = root.closest('.screen-scroll');
  if (!sc || !place || !place.ranges.length) return true;
  const r = rectOf(place.ranges[0]);
  if (!r) return true;
  const sr = sc.getBoundingClientRect();
  return r.top >= sr.top + sr.height * 0.08 && r.bottom <= sr.bottom - sr.height * 0.22;
}

/**
 * @param {Object} props
 * @param {any} props.anchor  the host's surpriseAnchor; a search landing carries `find: { terms, label }`
 * @param {string} props.unitId  the unit on screen (the anchor names the one it was made for)
 * @param {{ current: Element | null }} props.mainRef  the unit's body
 * @param {string} [props.noun]  "letter", "entry", "topic", "chapter": the pill's accessible name
 */
export function FindInUnit({ anchor, unitId, mainRef, noun = 'letter' }) {
  const find = (anchor && anchor.type === 'excerpt' && anchor.find && Array.isArray(anchor.find.terms) && anchor.find.terms.length
    && (!anchor.letterId || anchor.letterId === unitId)) ? anchor.find : null;
  const [closed, setClosed] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const [cur, setCur] = React.useState(0);
  /** @type {{ current: Array<{ start: number, ranges: Range[] }> }} */
  const placesRef = React.useRef([]);
  const curRef = React.useRef(0);
  const active = !!find && !closed;

  // A new landing (or a new unit under the same anchor) opens a fresh find.
  React.useEffect(() => { setClosed(false); }, [anchor, unitId]);

  React.useEffect(() => {
    if (!active) return undefined;
    const root = mainRef.current;
    const sm = /** @type {any} */ (window).VotSearchMini;
    if (!root || !sm || typeof sm.findPlaces !== 'function') return undefined;
    let first = true;
    const build = () => {
      const { flat, segs } = readUnitText(root);
      /** @type {Array<{ start: number, ranges: Range[] }>} */
      const places = [];
      for (const p of sm.findPlaces(flat, find.terms, PLACE_LEN)) {
        const ranges = [];
        for (const h of p.hits) {
          const r = rangeFor(segs, h.idx, wordEnd(flat, h.idx + h.len));
          if (r) ranges.push(r);
        }
        if (ranges.length) places.push({ start: p.start, ranges });
      }
      placesRef.current = places;
      if (first) { first = false; curRef.current = nearest(places, locate(flat, anchor.text)); }
      else if (curRef.current >= places.length) curRef.current = Math.max(0, places.length - 1);
      setCount(places.length);
      setCur(curRef.current);
      mark(places, curRef.current);
    };
    build();

    // Bring the tapped place into view once the landing has settled, unless the
    // reader has put a finger on the page in the meantime: then it is theirs.
    let tries = 0;
    let last = -1;
    let still = 0;
    let settle = /** @type {any} */ (null);
    const scroller = root.closest('.screen-scroll');
    const handsOn = () => clearInterval(settle);
    const HANDS = ['pointerdown', 'touchstart', 'wheel'];
    if (scroller) for (const ev of HANDS) scroller.addEventListener(ev, handsOn, { passive: true });
    settle = setInterval(() => {
      tries++;
      const restoring = document.body.classList.contains('scroll-restoring');
      const top = scroller ? scroller.scrollTop : 0;
      // The host's landing scroll starts 150 ms in: judge nothing before it has.
      if (tries <= 5) { last = top; return; }
      still = (!restoring && top === last) ? still + 1 : 0;
      last = top;
      if (still >= 2 || tries > 40) {
        clearInterval(settle);
        const place = placesRef.current[curRef.current];
        if (place && !restoring && !inView(root, place)) reveal(root, place);
      }
    }, 60);

    let timer = /** @type {any} */ (null);
    const mo = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(build, 120); })
      : null;
    if (mo) mo.observe(root, { childList: true, characterData: true, subtree: true });
    return () => {
      clearInterval(settle);
      if (scroller) for (const ev of HANDS) scroller.removeEventListener(ev, handsOn);
      clearTimeout(timer);
      if (mo) mo.disconnect();
      unmark();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `find` is anchor.find: the anchor is its identity; mainRef is a stable ref.
  }, [active, anchor, unitId]);

  const go = (/** @type {number} */ delta) => {
    const places = placesRef.current;
    if (!places.length || !mainRef.current) return;
    curRef.current = (curRef.current + delta + places.length) % places.length;
    setCur(curRef.current);
    mark(places, curRef.current);
    reveal(mainRef.current, places[curRef.current]);
  };

  if (!active || !count || typeof document === 'undefined' || !document.body) return null;
  return ReactDOM.createPortal(
    <div className="find-pill" role="toolbar" aria-label={'Search words in this ' + noun}>
      <span className="find-pill-word">{find.label || find.terms[0]}</span>
      <span className="find-pill-count" role="status" aria-live="polite">{(cur + 1) + ' of ' + count}</span>
      <button type="button" className="find-pill-btn" aria-label="Previous place" disabled={count < 2} onClick={() => go(-1)}>‹</button>
      <button type="button" className="find-pill-btn" aria-label="Next place" disabled={count < 2} onClick={() => go(1)}>›</button>
      <button type="button" className="find-pill-btn find-pill-close" aria-label="Close" onClick={() => setClosed(true)}>×</button>
    </div>,
    document.body
  );
}

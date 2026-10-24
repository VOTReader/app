/* ═══════════════════════════════════════════════════════════════════════
   FindInUnit — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   A unit opened from search (a letter, a WTLB / Blessed / Holy Days entry,
   an Answers topic, a study chapter) marks every place the search words
   appear and carries a small pill to step between them: "flood  2 of 3
   ‹ › ×" (Brianna, 2026-09-26); at the unit's top, before a step, it counts
   them: "flood  3 places ‹ › ×". The result card already lists the places;
   this is the same list, on the page.

   WHAT IT READS. The unit's own reading blocks as rendered: the elements
   under the host's body (mainRef) keyed with the unit's annotation prefix
   (`letter:<id>:` / `wtlb:<id>:`), footnote numbers, controls and hidden text
   skipped, block elements and line breaks read as a space. The body also holds
   the footnote list, Related Topics and Also Read links, the songs and install
   cards; reading it whole counted their words as places (review of b3841d3e),
   and the search never indexed them. The places are the search's own (VotSearchMini.findPlaces
   over that text, with the terms the result card marked): the same runs a
   card lists, the rarer word leading when the words never meet.

   HOW IT MARKS. The CSS Custom Highlight API, like ReadAlongHighlight: Ranges
   over the text nodes, registered as ::highlight(vot-find) (every place) and
   ::highlight(vot-find-current) (the place being looked at), and what search
   matched for a typed word (a form, a synonym, one of His names) apart, as
   ::highlight(vot-find-related): a place holding only those is counted apart,
   "1 of 2 · 4 related" (search200 ideas D, splitPlaces). No DOM mutation,
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

   FIND IN THIS LETTER (idea 160, Corbin yes 2026-10-23). The pill was reachable
   only through a library search. The ⋯ menu now offers "Find in this letter"
   (entry, topic, chapter) on every unit this mounts in (utils/page-menu.js):
   it opens the same pill with a text field where the search words sit. What
   the reader types is found by the same findPlaces over the same text and
   marked with the same highlights (typedFind: the words typed, a phrase of
   them, small words dropped among real ones); Enter steps to the next place,
   Shift+Enter the previous one, × or Escape / Android Back (the modal
   registry) closes it, and "No matches" says so in the count's own place.
   The first place is the first one from where the reader is reading (the top
   of the view as the field opened), brought into view only if it is out of
   it. Closing it, a new unit or a new search landing ends it: nothing of it
   outlives the unit it was typed in.
   ═══════════════════════════════════════════════════════════════════════ */

import { scrollBehavior } from '../../utils/reduced-motion.js';
import { usePageMenu } from '../../utils/page-menu.js';
import { markStopWords } from '../screens/search-model.js';

const HL_ALL = 'vot-find';
const HL_CURRENT = 'vot-find-current';
/** What search matched for a typed word (a form, a synonym, one of His names): a dotted underline, no wash (search200 ideas D). */
const HL_REL = 'vot-find-related';
/** Text in these is not the unit's words: footnote numbers, controls, icons. */
const SKIP = '.fn-ref, sup, button, svg, [aria-hidden="true"], script, style';
const PLACE_LEN = 120;
const LETTER = /\p{L}/u;

/**
 * The unit's words as the reader sees them, and where each run of them lives:
 * `flat` joins the text nodes in document order (a block element, a line
 * break and a hidden run break it with one space), `segs` maps flat offsets
 * back to text nodes. With `keyPrefix`, only the blocks whose data-hl-key
 * starts with it are read (the outermost ones; a hidden one is skipped).
 * @param {Element | null} root
 * @param {string} [keyPrefix]
 * @returns {{ flat: string, segs: Array<{ node: Text, start: number, end: number }> }}
 */
export function readUnitText(root, keyPrefix) {
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
  if (!keyPrefix) { walk(root); return { flat, segs }; }
  /** @param {Element} el */
  const hidden = (el) => {
    for (let n = /** @type {Element | null} */ (el); n && n !== root; n = n.parentElement) {
      if (view && view.getComputedStyle(n).display === 'none') return true;
    }
    return false;
  };
  for (const b of root.querySelectorAll('[data-hl-key]')) {
    if (!(b.getAttribute('data-hl-key') || '').startsWith(keyPrefix)) continue;
    const outer = b.parentElement && b.parentElement.closest('[data-hl-key]');
    if (outer && root.contains(outer)) continue;
    if (hidden(b)) continue;
    sep();
    walk(b);
    sep();
  }
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
 * The place the landing is in: the one whose span holds `at` (a few characters of
 * slack for the index-vs-page drift), else the one starting nearest it. A card
 * groups its places around what its snippet already shows, so a tapped place can
 * start inside one of these rather than at its start (review of b3841d3e).
 * @param {Array<{ start: number, span: number }>} places
 * @param {number} at
 * @returns {number} 0 when `at` is unknown
 */
export function placeAt(places, at) {
  if (at < 0 || !places.length) return 0;
  for (let i = 0; i < places.length; i++) {
    if (at >= places[i].start - 3 && at <= places[i].start + places[i].span + 3) return i;
  }
  let best = 0;
  for (let i = 1; i < places.length; i++) {
    if (Math.abs(places[i].start - at) < Math.abs(places[best].start - at)) best = i;
  }
  return best;
}

/**
 * What the reader typed into the find field, as the pill's find: the words, and the
 * words as one phrase when there are several (a run of them leads its place). A small
 * word typed among real ones ("the flood") is glue, as the search card treats it
 * (expandSnippetTerms): only the real words count. Every word is one the reader typed,
 * so nothing is counted apart as related. null until a word of two letters is typed.
 * @param {string} q
 * @param {Set<string> | null} [stop]  the words a card does not mark (markStopWords)
 * @returns {{ terms: string[], label: string, typed: string[] } | null}
 */
export function typedFind(q, stop) {
  const label = String(q || '').replace(/\s+/g, ' ').trim();
  const words = (label.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu) || []).filter((w) => w.length >= 2);
  if (!words.length) return null;
  const real = stop ? words.filter((w) => !stop.has(w)) : words;
  const own = real.length ? real : words;
  const terms = words.length > 1 ? [words.join(' ')].concat(own.filter((w) => w !== words.join(' '))) : own;
  return { terms, label, typed: own };
}

/**
 * Where the reader is reading: the flat offset of the first text that ends below the
 * top of the view (the top 8% is under the bar's edge). 0 without a scroller or layout.
 * @param {Element} root
 * @param {Array<{ node: Text, start: number, end: number }>} segs
 * @returns {number}
 */
function readingAt(root, segs) {
  const sc = root.closest('.screen-scroll');
  if (!sc) return 0;
  const sr = sc.getBoundingClientRect();
  const edge = sr.top + sr.height * 0.08;
  for (const s of segs) {
    const el = s.node.parentElement;
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > edge && (r.top !== 0 || r.bottom !== 0)) return s.start;
  }
  return 0;
}

/** The API is there (chrome 105+, Safari 17.2+). */
function canMark() {
  return typeof CSS !== 'undefined' && !!(/** @type {any} */ (CSS).highlights) && typeof (/** @type {any} */ (window).Highlight) === 'function';
}

function unmark() {
  if (!canMark()) return;
  /** @type {any} */ (CSS).highlights.delete(HL_ALL);
  /** @type {any} */ (CSS).highlights.delete(HL_CURRENT);
  /** @type {any} */ (CSS).highlights.delete(HL_REL);
}

/**
 * @param {Array<{ ranges: Range[], rel: Range[], near?: boolean }>} places  the places the pill steps through
 * @param {number} cur
 * @param {Range[]} [related]  the related words of the places it does not step through
 */
function mark(places, cur, related = []) {
  if (!canMark()) return;
  const H = /** @type {any} */ (window).Highlight;
  const rest = [];
  const rel = related.slice();
  for (let i = 0; i < places.length; i++) {
    // a related place stepped to (no place holds a word typed) is marked as the current one, else as related
    if (i !== cur) (places[i].near ? rel : rest).push(...places[i].ranges);
    rel.push(...places[i].rel);
  }
  const all = new H(...rest);
  all.priority = 1;
  const now = new H(...(places[cur] ? places[cur].ranges : []));
  now.priority = 2;
  const near = new H(...rel);
  near.priority = 1;
  /** @type {any} */ (CSS).highlights.set(HL_ALL, all);
  /** @type {any} */ (CSS).highlights.set(HL_CURRENT, now);
  /** @type {any} */ (CSS).highlights.set(HL_REL, near);
}

/**
 * EXACT PLACES AND RELATED ONES (search200 ideas D, 2026-10-22). The places holding a word the reader typed
 * are the places the pill counts and steps through; a place holding only what search matched for one (a word
 * form, a synonym, one of His names: a hit's `rel`) is counted apart and marked apart. With no place of a
 * typed word, the related places are the ones it steps through. Pure.
 * @template {{ ranges: Range[], rel: Range[] }} P
 * @param {P[]} places  every place, in text order
 * @returns {{ steps: Array<P & { near?: boolean }>, aside: Range[], related: number, relOnly: boolean }}
 */
export function splitPlaces(places) {
  const exact = places.filter((p) => p.ranges.length);
  const near = places.filter((p) => !p.ranges.length);
  if (!exact.length) return { steps: near.map((p) => ({ ...p, ranges: p.rel, rel: [], near: true })), aside: [], related: 0, relOnly: near.length > 0 };
  /** @type {Range[]} */
  const aside = [];
  for (const p of near) aside.push(...p.rel);
  return { steps: exact, aside, related: near.length, relOnly: false };
}

/** Where a range is on screen; its text's element where a Range cannot say. */
function rectOf(/** @type {Range} */ range) {
  if (typeof range.getBoundingClientRect === 'function') return range.getBoundingClientRect();
  const el = range.startContainer && range.startContainer.parentElement;
  return el ? el.getBoundingClientRect() : null;
}

/**
 * The part of the scroller the reader can see the unit's text in. Its top is where the
 * page stops being covered (the sticky back row and its title band), found by asking the
 * page what is under the column's centre; without that answer, 8% down. Its bottom is
 * above the soft keyboard (Chrome and the PWA shrink the visual viewport for it) and
 * above the find pill (lifted over the keyboard in the APK), so a place brought into view
 * while the reader types is left under neither (S22 look, 2026-10-23).
 * @param {Element} root  the unit's body
 * @param {Element} sc  its scroller
 * @returns {{ sr: DOMRect, top: number, bottom: number }}
 */
function viewOf(root, sc) {
  const sr = sc.getBoundingClientRect();
  let bottom = sr.bottom;
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv && vv.height > 0) bottom = Math.min(bottom, vv.offsetTop + vv.height);
  const pill = document.querySelector('.find-pill');
  if (pill) {
    const p = pill.getBoundingClientRect();
    if (p.height > 0 && p.top > sr.top) bottom = Math.min(bottom, p.top - 8);
  }
  let top = sr.top + sr.height * 0.08;
  if (typeof document.elementFromPoint === 'function' && sr.height > 0) {
    const rr = root.getBoundingClientRect();
    const x = rr.left + rr.width / 2;
    // covered: under something pinned over the page (sticky or fixed), not just page content above the text
    const pinned = (/** @type {Element} */ el) => {
      for (let n = /** @type {Element | null} */ (el); n && n !== sc; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === 'sticky' || pos === 'fixed') return true;
      }
      return false;
    };
    for (let y = sr.top + 2; y < bottom; y += 6) {
      const el = document.elementFromPoint(x, y);
      if (el && (root.contains(el) || !pinned(el))) { top = y; break; }
    }
  }
  return { sr, top, bottom: Math.max(top, bottom) };
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
  const v = viewOf(root, sc);
  const sr = v.sr;
  // jsdom and a scroller with no layout keep the plain 40% of its height
  const at = sr.height > 0 ? (v.top - sr.top) + (v.bottom - v.top) * 0.4 : sr.height * 0.4;
  const top = sc.scrollTop + (r.top - sr.top) - at;
  sc.scrollTo({ top: Math.max(0, top), behavior: /** @type {ScrollBehavior} */ (scrollBehavior()) });
}

/**
 * Is the place in the comfortable part of the view (not under the top edge,
 * not under the pill or the keyboard)?
 * @param {Element} root
 * @param {{ ranges: Range[] }} place
 */
function inView(root, place) {
  const sc = root.closest('.screen-scroll');
  if (!sc || !place || !place.ranges.length) return true;
  const r = rectOf(place.ranges[0]);
  if (!r) return true;
  const v = viewOf(root, sc);
  const sr = v.sr;
  return r.top >= v.top && r.bottom <= Math.min(sr.bottom - sr.height * 0.22, v.bottom);
}

/**
 * @param {Object} props
 * @param {any} props.anchor  the host's surpriseAnchor; a search landing carries `find: { terms, label }`
 * @param {string} props.unitId  the unit on screen (the anchor names the one it was made for)
 * @param {{ current: Element | null }} props.mainRef  the unit's body
 * @param {string} [props.noun]  "letter", "entry", "topic", "chapter": the pill's accessible name
 * @param {string} [props.keyPrefix]  the unit's block keys ('letter:<id>:'): only those blocks are read
 */
export function FindInUnit({ anchor, unitId, mainRef, noun = 'letter', keyPrefix = '' }) {
  const searchFind = (anchor && anchor.type === 'excerpt' && anchor.find && Array.isArray(anchor.find.terms) && anchor.find.terms.length
    && (!anchor.letterId || anchor.letterId === unitId)) ? anchor.find : null;
  const [closed, setClosed] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const [cur, setCur] = React.useState(0);
  const [related, setRelated] = React.useState({ n: 0, only: false });
  // Find in this letter (idea 160): the field is open (`asking`), what it holds (`q`), and the find it makes (`typed`).
  const [asking, setAsking] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [typed, setTyped] = React.useState(/** @type {{ terms: string[], label: string, typed: string[] } | null} */ (null));
  /** @type {{ current: Array<{ start: number, span: number, ranges: Range[], rel: Range[], near?: boolean }> }} */
  const placesRef = React.useRef([]);
  /** @type {{ current: Range[] }} the related words of the places the pill does not step through */
  const asideRef = React.useRef([]);
  const curRef = React.useRef(0);
  /** where the reader was reading as the field opened (a flat offset): a typed find starts there */
  const fromRef = React.useRef(0);
  const inputRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));
  const find = asking ? typed : (closed ? null : searchFind);
  const fromSearch = !asking;
  const active = !!find;

  // A new landing (or a new unit under the same anchor) opens a fresh find, and a new search's words replace typed ones.
  React.useEffect(() => {
    setClosed(false);
    if (searchFind) { setAsking(false); setQ(''); setTyped(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchFind is anchor.find: the anchor is its identity.
  }, [anchor, unitId]);
  // ...and a typed find belongs to the unit it was typed in.
  React.useEffect(() => { setAsking(false); setQ(''); setTyped(null); }, [unitId]);

  // The field's words, a beat after the last key, as the pill's find (the same terms object while they mean the same).
  React.useEffect(() => {
    if (!asking) return undefined;
    const t = setTimeout(() => {
      const next = typedFind(q, markStopWords(/** @type {any} */ (window).VotSearchData));
      setTyped((o) => (o && next && o.terms.join('\u0001') === next.terms.join('\u0001') ? o : next));
    }, 150);
    return () => clearTimeout(t);
  }, [q, asking]);

  const openAsk = () => {
    const root = mainRef.current;
    fromRef.current = root ? readingAt(root, readUnitText(root, keyPrefix).segs) : 0;
    setQ('');
    setTyped(null);
    setAsking(true);
  };
  const openAskRef = React.useRef(openAsk);
  openAskRef.current = openAsk;
  const closeAsk = () => { setAsking(false); setQ(''); setTyped(null); setClosed(true); };

  // The ⋯ menu's "Find in this letter", while this unit is the one on screen.
  const menuItems = React.useMemo(() => [{ key: 'find-in-unit', label: 'Find in this ' + noun, icon: /** @type {'find'} */ ('find'), onSelect: () => openAskRef.current() }], [noun]);
  usePageMenu(menuItems);
  // Escape and Android Back close the field through the registry (the single dispatcher), never a listener here.
  useModalRegistry({ id: 'find-in-unit', dismiss: closeAsk, active: asking });
  // The field takes the focus as it opens (the menu that opened it has closed).
  React.useEffect(() => {
    if (asking && inputRef.current) inputRef.current.focus();
  }, [asking]);

  React.useEffect(() => {
    if (!active) return undefined;
    const root = mainRef.current;
    const sm = /** @type {any} */ (window).VotSearchMini;
    if (!root || !sm || typeof sm.findPlaces !== 'function') return undefined;
    let first = true;
    const build = () => {
      const { flat, segs } = readUnitText(root, keyPrefix);
      /** @type {Array<{ start: number, span: number, ranges: Range[], rel: Range[] }>} */
      const found = [];
      // `typed`: the words the reader typed, so a hit says whether it is one of them (findPlaces' `rel`)
      for (const p of sm.findPlaces(flat, find.terms, PLACE_LEN, Array.isArray(find.typed) ? find.typed : undefined)) {
        /** @type {Range[]} */ const ranges = [];
        /** @type {Range[]} */ const rel = [];
        for (const h of p.hits) {
          const r = rangeFor(segs, h.idx, wordEnd(flat, h.idx + h.len));
          if (r) (h.rel ? rel : ranges).push(r);
        }
        if (ranges.length || rel.length) found.push({ start: p.start, span: p.span, ranges, rel });
      }
      const split = splitPlaces(found);
      const places = split.steps;
      placesRef.current = places;
      asideRef.current = split.aside;
      setRelated((o) => (o.n === split.related && o.only === split.relOnly ? o : { n: split.related, only: split.relOnly }));
      let show = false;
      if (first && !fromSearch) {
        // A typed find starts at the first place from where the reader is reading (the last one wraps to the first).
        first = false;
        const at = places.findIndex((p) => p.start + p.span >= fromRef.current);
        curRef.current = places.length ? Math.max(0, at) : 0;
        show = places.length > 0;
      } else if (first) {
        // A landing at the unit's top (a title named, search200 B5) is on no place: none is current until a step.
        first = false;
        curRef.current = anchor.top ? -1 : placeAt(places, locate(flat, anchor.text));
      } else if (curRef.current >= places.length) curRef.current = Math.max(0, places.length - 1);
      setCount(places.length);
      setCur(curRef.current);
      mark(places, curRef.current, asideRef.current);
      // the reader's own typing: one write, and only when the place is out of the comfortable view
      if (show && !inView(root, places[curRef.current])) reveal(root, places[curRef.current]);
    };
    build();

    // Bring the tapped place into view once the landing has settled, and only
    // then: never while another writer holds the page (a scroll restore, the
    // autoscroll transport), never without the page having come to rest, and not
    // at all once the reader has touched anything (the page, the autoscroll pill,
    // a key): then the page is theirs (review of b3841d3e).
    let tries = 0;
    let last = -1;
    let still = 0;
    let settle = /** @type {any} */ (null);
    const scroller = root.closest('.screen-scroll');
    const handsOn = () => clearInterval(settle);
    const HANDS = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    // A landing at the top has no place to bring into view: the page stays at the title. A typed find has no landing to wait for.
    const landing = fromSearch && !anchor.top;
    if (landing) for (const ev of HANDS) document.addEventListener(ev, handsOn, { capture: true, passive: true });
    if (landing) settle = setInterval(() => {
      tries++;
      const busy = document.body.classList.contains('scroll-restoring') || document.body.classList.contains('autoscroll-running');
      const top = scroller ? scroller.scrollTop : 0;
      // The host's landing scroll starts 150 ms in: judge nothing before it has.
      if (tries <= 5) { last = top; return; }
      still = (!busy && top === last) ? still + 1 : 0;
      last = top;
      if (still >= 2) {
        clearInterval(settle);
        const place = placesRef.current[curRef.current];
        if (place && !inView(root, place)) reveal(root, place);
      } else if (tries > 40) {
        clearInterval(settle);   // it never came to rest: leave it where it is
      }
    }, 60);

    let timer = /** @type {any} */ (null);
    const mo = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(build, 120); })
      : null;
    if (mo) mo.observe(root, { childList: true, characterData: true, subtree: true });
    return () => {
      clearInterval(settle);
      for (const ev of HANDS) document.removeEventListener(ev, handsOn, { capture: true });
      clearTimeout(timer);
      if (mo) mo.disconnect();
      placesRef.current = [];
      unmark();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `find` is anchor.find (the anchor is its identity) or the typed find; mainRef is a stable ref.
  }, [find, anchor, unitId]);

  const go = (/** @type {number} */ delta) => {
    const places = placesRef.current;
    if (!places.length || !mainRef.current) return;
    // from the top (no place current), › goes to the first place and ‹ to the last
    const from = curRef.current < 0 ? (delta > 0 ? -1 : 0) : curRef.current;
    curRef.current = (from + delta + places.length) % places.length;
    setCur(curRef.current);
    mark(places, curRef.current, asideRef.current);
    reveal(mainRef.current, places[curRef.current]);
  };

  if (typeof document === 'undefined' || !document.body) return null;
  if (asking) {
    // The same pill, the field where the search words sit: "[faith ]  2 of 7  ‹ › ×".
    const where = 'Find in this ' + noun;
    const status = !typed ? '' : !count ? 'No matches' : (Math.max(0, cur) + 1) + ' of ' + count;
    const onKey = (/** @type {any} */ e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      // Enter before the beat has passed finds what the field holds now; after it, steps on.
      const now = typedFind(q, markStopWords(/** @type {any} */ (window).VotSearchData));
      if (!typed || !now || now.terms.join('\u0001') !== typed.terms.join('\u0001')) { setTyped(now); return; }
      go(e.shiftKey ? -1 : 1);
    };
    return ReactDOM.createPortal(
      <div className="find-pill find-pill-ask" role="search" aria-label={where}>
        <svg className="find-pill-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
        </svg>
        <input
          ref={inputRef}
          className="find-pill-input"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={where}
          aria-label={where}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <span className={'find-pill-count' + (typed && !count ? ' find-pill-none' : '')} role="status" aria-live="polite">{status}</span>
        <button type="button" className="find-pill-btn" aria-label="Previous place" disabled={!typed || count < 2} onClick={() => go(-1)}>‹</button>
        <button type="button" className="find-pill-btn" aria-label="Next place" disabled={!typed || count < 2} onClick={() => go(1)}>›</button>
        <button type="button" className="find-pill-btn find-pill-close" aria-label="Close find" onClick={closeAsk}>×</button>
      </div>,
      document.body
    );
  }
  if (!active || !count) return null;
  // At the top (no place current) the pill counts the places: "0 of 3" read as none found (search200 UX B6).
  // The related places come after ("1 of 2 · 4 related"), or are the count when no place holds a word typed.
  const counted = related.only ? (cur < 0 ? count + ' related' : (cur + 1) + ' of ' + count + ' related')
    : cur < 0 ? count + (count === 1 ? ' place' : ' places') : (cur + 1) + ' of ' + count;
  const aside = !related.only && related.n ? ' · ' + related.n + ' related' : '';
  return ReactDOM.createPortal(
    <div className="find-pill" role="toolbar" aria-label={'Search words in this ' + noun}>
      <span className="find-pill-word">{find.label || find.terms[0]}</span>
      <span className="find-pill-count" role="status" aria-live="polite">{counted}{aside ? <span className="find-pill-related">{aside}</span> : null}</span>
      <button type="button" className="find-pill-btn" aria-label="Previous place" disabled={count < 2 && cur >= 0} onClick={() => go(-1)}>‹</button>
      <button type="button" className="find-pill-btn" aria-label="Next place" disabled={count < 2 && cur >= 0} onClick={() => go(1)}>›</button>
      <button type="button" className="find-pill-btn find-pill-close" aria-label="Close" onClick={() => setClosed(true)}>×</button>
    </div>,
    document.body
  );
}

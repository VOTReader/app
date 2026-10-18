/* ═══════════════════════════════════════════════════════════════════════
   goto — the Scripture Web's go-to (search a book, chapter or verse) and
   what a tap on a drawn name does. Cluster F (bundle-d), used by
   ui/screens/ScriptureWebScreen.jsx and ui/scripture-web/use-web-selection.js.
   The navigation stream owns this file (CONTRACTS.md section 10).
   ═══════════════════════════════════════════════════════════════════════

   Two contracts other streams call (CONTRACTS.md sections 4 and 9):

     useGoTo(web)   the go-to's state and its two render nodes. `button` is
                    the header slot: the screen renders it first inside the
                    chrome's control row (the 40 px search button, spec 4.1);
                    `box` is everything the go-to puts over the canvas: the
                    box itself while it is open (spec 4.5), the chip naming
                    the verse it went to ("John 3:16 · 64 connections"), and
                    the edge chips naming where lit threads go off the frame
                    ("‹ Genesis 22:2", tap = Follow). Null at rest, so the
                    DOM is as it was until the reader asks.
     routeOverlayHit(hit, nav)
                    what a tap on something the overlay drew does: a book
                    name frames the book, a chapter numeral frames the chapter
                    and opens its group, a "+n" pill opens its group; true
                    when it handled the tap, so the tap stops before the line
                    picking. Each camera move is a journey arrival.

   The box reads what is typed through the app's own reference parser
   (utils/scripture-web/ref-parse.js over search/ref-parser.js: no parser of
   its own). Enter closes it and the camera eases there (flyTo, 600-900 ms,
   instant under reduced motion): a book fills the canvas area, a chapter
   about 70 % of it with its group open, a verse the five chapters around it
   with its threads lit and the panel in verse mode. The keys the web's root
   takes for it (use-web-keys.js): / and Ctrl+K open it, Escape closes it
   first, Enter or Space choose the line at the centre (selectCentre), [ and ]
   step through the lines at the chosen verse (step).

   The chips ride the camera: the frame loop's onFrame places them in the
   frame the web moved in (DOM style, never React state per frame); React
   state changes only when what they name changes.

   start (CONTRACTS.md section 8) is consumed once per mount, as soon as the
   camera exists: the web opens on that place, instantly, over the resume
   point. */

import { goToRows, frameOf, startPlace, bookPlace, chapterPlace, chapterIndexOf } from '../../utils/scripture-web/ref-parse.js';
import { arcsTouching, nearbyThreads, refOfVerse, verseToX, xToVerse } from '../../utils/scripture-web/pick.js';
import { litKeyOf } from '../../utils/scripture-web/focus-state.js';

/**
 * @typedef {{ button: any, box: any, isOpen: boolean, open: (query?: string) => void, close: () => void,
 *   selectCentre: () => boolean, step: (dir: number) => boolean }} GoTo
 *   button  the header slot's node (null: nothing in the header)
 *   box     what the go-to puts over the canvas (null: nothing)
 *   open    opens the box, optionally with a query typed in; close closes it
 *   selectCentre, step (additive, for use-web-keys.js): Enter / Space and [ ]
 */

/** The hint under the rows (spec 4.5). */
export const GOTO_HINT = 'Try “Isaiah 53”, “Romans”, “Gen 1:1”';
/** At most this many rows: PC, and the phone (its keyboard takes the rest). */
export const GOTO_ROWS = 5;
export const GOTO_ROWS_COMPACT = 3;

/** The PC box (spec 4.5): its width, its top, its field's height, and the gutter it keeps. */
export const GOTO_BOX_W = 640;
export const GOTO_BOX_TOP = 24;
const GOTO_FIELD_H = 56;
const GOTO_GUTTER = 24;
/** Narrower than this between the title and the control row, the box drops under them. */
export const GOTO_BOX_MIN = 480;

/**
 * Where the PC box sits (spec 4.5, r3-04): 640 px at top 24, centred over the canvas area, and
 * clear of the chrome in its band. It sits in the gap between the title block and the control row,
 * moved along when the canvas area's centre would put it over either; where that gap is under
 * 480 px (1366 and the other laptop widths), it drops under the chrome at the canvas area's
 * width. The review of 2026-10-18 found it centred over the canvas area at every width, over the
 * search button that opens it and half of "Scripture" below about 1900 px. Pure, so the rule is
 * pinned without a layout; CSS px in the root's own frame (transform-free, so a rotated root too).
 * @param {{ W: number, inset?: number,
 *   chrome: Array<{ l: number, t: number, r: number, b: number } | null> }} m
 *   W the root's width; inset the panel's (right); chrome the title block and the control row
 *   (null or empty: not shown)
 * @returns {{ x: number, w: number, top: number }}  x the box's centre
 */
export function gotoBoxPlace({ W, inset, chrome }) {
  const right = Math.max(0, W - (inset || 0));
  const mid = right / 2;
  let lo = 0, hi = right, under = 0;
  for (const c of chrome || []) {
    if (!c || !(c.r > c.l) || !(c.b > c.t)) continue;
    // only what shares the box's band at the top; the rows below it fall clear of the chrome
    if (c.b <= GOTO_BOX_TOP || c.t >= GOTO_BOX_TOP + GOTO_FIELD_H) continue;
    under = Math.max(under, c.b);
    if ((c.l + c.r) / 2 <= mid) lo = Math.max(lo, c.r);
    else hi = Math.min(hi, c.l);
  }
  const gap = hi - lo - 2 * GOTO_GUTTER;
  if (gap >= GOTO_BOX_MIN) {
    const w = Math.min(GOTO_BOX_W, gap);
    return { x: Math.min(Math.max(mid, lo + GOTO_GUTTER + w / 2), hi - GOTO_GUTTER - w / 2), w, top: GOTO_BOX_TOP };
  }
  return { x: mid, w: Math.max(0, Math.min(GOTO_BOX_W, right - 2 * GOTO_GUTTER)), top: under ? under + 8 : GOTO_BOX_TOP };
}

/** An element's box in its offset parent (the root), or null when it is not laid out. */
function offsetBox(el) {
  if (!el || !el.offsetParent) return null;
  return { l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight };
}

/** The lazy Bible corpus's signal (window.__bibleCorpus), typeof-guarded: inert where it is absent. */
const subscribeBible = (cb) => (typeof window.__bibleCorpus !== 'undefined' ? window.__bibleCorpus.subscribe(cb) : () => {});
const bibleCorpusVersion = () => (typeof window.__bibleCorpus !== 'undefined' ? window.__bibleCorpus.getVersion() : 0);

/** "64 connections", "1 connection". */
export function connectionsText(n) {
  return n.toLocaleString() + (n === 1 ? ' connection' : ' connections');
}

const NO_GOTO = Object.freeze({
  button: null, box: null, isOpen: false,
  open() {}, close() {}, selectCentre() { return false; }, step() { return false; },
});

/**
 * What a journey crumb reopens on Back, from what is open now: the panel's spec (with the lit
 * threads, when there are any), or null when nothing is open, so Back closes whatever a later step
 * opened. A card no spec reopens (a bundle's sheet, a My Web card) counts as nothing: Back closes
 * it rather than leave a panel up over a view that no longer shows it. Pure, for its own tests.
 * @param {any} panel  use-web-selection.js's panel ({ spec, info } | null)
 * @param {ArrayLike<number> | null} lit  focus.lit
 * @returns {any}  a PanelSpec (plus `lit`), or null
 */
export function reopenOf(panel, lit) {
  const spec = panel && panel.spec;
  if (!spec || spec.myWeb) return null;
  if (spec.mode === 'group' && !(spec.ids && spec.ids.length) && !(spec.chapter >= 0)) return null;
  return lit && lit.length ? Object.assign({}, spec, { lit }) : spec;
}

/**
 * The go-to. `web` is what it needs from the screen (CONTRACTS.md section 9): the graph, flyTo,
 * openPanel, the journey, lightThreads, the live region's setAnnounce and the start prop; and
 * (the navigation stream's additions on its own call line) closePanel and panel (what is open,
 * so a journey crumb records it), the density and mode, the camera's refs and viewFor, the frame
 * loop's onFrame and the root.
 * @param {{ graph?: any, flyTo?: Function, openPanel?: Function, journey?: any,
 *   lightThreads?: Function, setAnnounce?: Function, start?: any, closePanel?: Function, panel?: any,
 *   density?: any, mode?: string, camRef?: any, viewRef?: any, focusRef?: any, panelInsetRef?: any,
 *   viewFor?: Function, onFrame?: Function, rootRef?: any }} web
 * @returns {GoTo}
 */
export function useGoTo(web) {
  const {
    graph, flyTo, openPanel, journey, lightThreads, setAnnounce, start, closePanel, panel,
    density, mode, camRef, viewRef, focusRef, panelInsetRef, viewFor, onFrame, rootRef,
  } = web || {};
  // what is open, read when a crumb is recorded (here), not when this render ran
  const panelRef = React.useRef(panel);
  panelRef.current = panel;
  const live = !!(camRef && viewRef && focusRef && flyTo && openPanel);
  const [isOpen, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const [chip, setChip] = React.useState(/** @type {null | { lo: number, hi: number, label: string, count: number, litKey: string, ids: Int32Array }} */ (null));
  const [edges, setEdges] = React.useState(/** @type {{ left: any, right: any }} */ ({ left: null, right: null }));
  const inputRef = React.useRef(null);
  // the box is a dialog: Tab stays in it, and focus goes home when it closes (useFocusTrap,
  // the app's free-global hook; dialog-focus-contract.test.js)
  const boxRef = useFocusTrap(isOpen);
  const buttonRef = React.useRef(null);
  const openerRef = React.useRef(null);
  const chipRef = React.useRef(chip);
  chipRef.current = chip;
  const chipElRef = React.useRef(null);
  const edgeKeyRef = React.useRef('|');
  const stepRef = React.useRef({ verse: -1, list: /** @type {number[]} */ ([]) });
  const startedRef = React.useRef(false);

  const say = React.useCallback((s) => { if (typeof setAnnounce === 'function') setAnnounce(s); }, [setAnnounce]);

  /** The canvas area beside the panel, device px. */
  const area = React.useCallback(() => {
    const v = viewRef.current;
    const inset = (panelInsetRef && panelInsetRef.current && panelInsetRef.current.right) || 0;
    return Math.max(1, v.W - inset * (v.DPR || 1));
  }, [viewRef, panelInsetRef]);

  /** The verse at the canvas area's centre. */
  const centreVerse = React.useCallback(() => {
    const cam = camRef.current, v = viewRef.current;
    const c = Math.floor(xToVerse(cam, v.W, area() / 2));
    return Math.max(0, Math.min(graph.total - 1, c));
  }, [camRef, viewRef, area, graph]);

  /** Where the reader is, as a journey entry: the go-to's lit verse or else the centre verse, the
   * span in view, and what is open there (reopenOf): Back opens it again, or closes what a later
   * step opened when nothing was. */
  const here = React.useCallback(() => {
    const cam = camRef.current, v = viewRef.current;
    if (!graph || !cam || !v.W) return null;
    const c = chipRef.current;
    const f = focusRef.current;
    const lit = c && f.litKey === c.litKey;
    const verse = lit ? c.lo : centreVerse();
    return {
      verse, label: lit ? c.label : refOfVerse(graph, verse).label,
      span: [xToVerse(cam, v.W, 0), xToVerse(cam, v.W, area())],
      open: reopenOf(panelRef.current, f.lit),
    };
  }, [graph, camRef, viewRef, focusRef, centreVerse, area]);

  // the journey's Back reopens through the panel API, and asks here where a trail sets out from
  React.useEffect(() => {
    if (journey && typeof journey.connect === 'function') journey.connect({ openPanel, closePanel, lightThreads, here });
  }, [journey, openPanel, closePanel, lightThreads, here]);

  const close = React.useCallback(() => {
    setOpen(false);
    const back = openerRef.current;
    openerRef.current = null;
    const root = rootRef && rootRef.current;
    const to = back && back.isConnected && back !== document.body ? back : root;
    if (to && typeof to.focus === 'function') to.focus();
  }, [rootRef]);

  const open = React.useCallback((q = '') => {
    if (!live || mode === 'personal') return;
    if (!isOpen) {
      // opened from nowhere (no focus on the page): the web itself is where focus goes home to
      const root = rootRef && rootRef.current;
      const a = document.activeElement;
      if ((!a || a === document.body) && root && typeof root.focus === 'function') root.focus({ preventScroll: true });
      openerRef.current = document.activeElement;
    }
    setQuery(typeof q === 'string' ? q : '');
    setSel(0);
    setOpen(true);
  }, [live, mode, isOpen, rootRef]);

  // the box takes the keyboard when it opens
  React.useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  // where the PC box sits (gotoBoxPlace), measured before it paints and again when the window
  // resizes, so it keeps clear of the title and the control row; compact mode's place is the CSS
  // rule's (spec 4.5: 64 px in from each side at top 8). Unmeasured (no layout): the CSS default.
  const [place, setPlace] = React.useState(/** @type {null | { x: number, w: number, top: number }} */ (null));
  const insetNow = (panelInsetRef && panelInsetRef.current && panelInsetRef.current.right) || 0;
  const measure = React.useCallback(() => {
    const root = rootRef && rootRef.current;
    const W = root ? root.clientWidth : 0;
    const v = viewRef && viewRef.current;
    const compact = !!(v && v.H && v.H / (v.DPR || 1) <= 500);
    const next = W > 0 && !compact ? gotoBoxPlace({
      W, inset: (panelInsetRef && panelInsetRef.current && panelInsetRef.current.right) || 0,
      chrome: [offsetBox(root.querySelector('.sw-topbar')), offsetBox(root.querySelector('.sw-controls'))],
    }) : null;
    setPlace((was) => (was && next && was.x === next.x && was.w === next.w && was.top === next.top ? was : next));
  }, [rootRef, viewRef, panelInsetRef]);
  React.useLayoutEffect(() => {
    if (!isOpen) return undefined;
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isOpen, insetNow, measure]);

  // a press anywhere outside the box (and its button) closes it
  React.useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (boxRef.current && boxRef.current.contains(t)) return;
      if (buttonRef.current && buttonRef.current.contains(t)) return;
      setOpen(false);
      openerRef.current = null;
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [isOpen, boxRef]);

  /**
   * Take the reader to a place: the panel and the lit set first (so the panel slides in while
   * the camera flies and the fly lands beside it), the journey before the camera moves (its
   * origin is where the camera still is), then the fly; the verse chip once it lands.
   * @param {any} place  ref-parse's Place, or { kind: 'letter', letterKey }
   * @param {{ push?: boolean, instant?: boolean }} [how]
   */
  const go = React.useCallback((place, how = /** @type {{ push?: boolean, instant?: boolean }} */ ({})) => {
    const push = how.push !== false;
    if (!graph || !place || !live) return false;
    if (place.kind === 'letter') return !!openPanel({ mode: 'letter', letterKey: place.letterKey });
    if (!camRef.current || !viewRef.current.W) return false;
    // where the reader set out from, read before the panel or the camera changes
    const origin = push ? here() : null;
    const frame = frameOf(graph, place);
    const lights = place.kind === 'verse' || place.kind === 'range';
    const ids = lights ? Int32Array.from(arcsTouching(graph, place.lo, place.hi, density, 0)) : null;
    let entryOpen;
    if (place.kind === 'chapter') {
      entryOpen = { mode: 'group', chapter: place.chapterIndex };
      openPanel(entryOpen);
    } else if (lights) {
      entryOpen = { mode: 'verse', verse: place.lo, lit: ids };
      openPanel({ mode: 'verse', verse: place.lo });
      if (lightThreads) lightThreads(ids);
    }
    setChip(null);
    if (push && journey) {
      journey.push({ verse: place.lo, label: place.label, open: entryOpen, span: [frame.x0, frame.x1] }, origin);
    }
    const litKey = ids ? litKeyOf(ids) : '';
    const done = () => {
      if (ids && focusRef.current.litKey === litKey) {
        setChip({ lo: place.lo, hi: place.hi, label: place.label, count: ids.length, litKey, ids });
      }
    };
    Promise.resolve(flyTo(frame, how && how.instant ? { reduceMotion: true } : undefined)).then(done, done);
    say(ids ? place.label + ', ' + connectionsText(ids.length) : place.label);
    return true;
  }, [graph, live, openPanel, camRef, viewRef, density, lightThreads, journey, here, focusRef, flyTo, say]);

  // a verse row's text is the Bible corpus's, which loads lazily: a box open before it lands takes
  // the text when it does (review 2026-10-18; the signal hooks/use-lazy-bundles.js reads). The
  // version is a dependency the memo's body never names: verseTextFor reads the corpus itself
  const bibleVersion = React.useSyncExternalStore(subscribeBible, bibleCorpusVersion);
  const rows = React.useMemo(() => {
    if (!isOpen || !graph) return [];
    const v = viewRef && viewRef.current;
    const compact = !!(v && v.H && v.H / (v.DPR || 1) <= 500);
    return goToRows(graph, query, { density, limit: compact ? GOTO_ROWS_COMPACT : GOTO_ROWS });
  }, [isOpen, graph, query, density, viewRef, bibleVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const selAt = rows.length ? Math.min(sel, rows.length - 1) : -1;

  const choose = React.useCallback((row) => {
    if (!row) return;
    setOpen(false);
    openerRef.current = null;
    const root = rootRef && rootRef.current;
    if (root && typeof root.focus === 'function') root.focus();
    go(row.place);
  }, [go, rootRef]);

  const onInputKey = React.useCallback((e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length) setSel((selAt + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selAt >= 0) choose(rows[selAt]);
      else if (query.trim()) say('No book, chapter or verse called ' + query.trim());
    } else if (e.key === 'Escape') {
      // the box is the top layer: Escape closes it and goes no further (not the panel, not the web)
      e.preventDefault(); e.stopPropagation();
      close();
    }
  }, [rows, selAt, choose, query, say, close]);

  /** Enter / Space: the line at the centre - the drawn thread with a foot nearest the canvas
   * area's centre, the strongest among the nearest. */
  const selectCentre = React.useCallback(() => {
    if (!graph || !live || !camRef.current || !viewRef.current.W || mode === 'personal') return false;
    const cam = camRef.current, v = viewRef.current;
    const c = centreVerse() + 0.5;
    const lo = Math.max(0, Math.floor(xToVerse(cam, v.W, 0))), hi = Math.min(graph.total - 1, Math.ceil(xToVerse(cam, v.W, area())));
    let best = -1, bestD = Infinity, bestW = -Infinity;
    for (const i of arcsTouching(graph, lo, hi, density, 0)) {
      const d = Math.min(Math.abs(graph.from[i] + 0.5 - c), Math.abs(graph.to[i] + 0.5 - c));
      if (d < bestD || (d === bestD && graph.votes[i] > bestW)) { best = i; bestD = d; bestW = graph.votes[i]; }
    }
    if (best < 0) { say('No line in view'); return false; }
    return !!openPanel({ mode: 'connection', arc: best });
  }, [graph, live, camRef, viewRef, mode, centreVerse, area, density, say, openPanel]);

  /** [ and ]: the next or the previous line at the chosen verse (a verse open, or the end of the
   * chosen line nearer the centre, or else the centre verse), the strongest first. */
  const step = React.useCallback((dir) => {
    if (!graph || !live || !camRef.current || !viewRef.current.W || mode === 'personal') return false;
    const f = focusRef.current;
    const s = stepRef.current;
    let verse;
    if (f.arc >= 0 && s.verse >= 0 && s.list.indexOf(f.arc) >= 0) verse = s.verse;
    else if (f.arc >= 0 && f.arc < graph.count) {
      const c = centreVerse(), a = graph.from[f.arc], b = graph.to[f.arc];
      verse = Math.abs(a - c) <= Math.abs(b - c) ? a : b;
    } else if (f.range && f.range[0] === f.range[1]) verse = f.range[0];
    else verse = centreVerse();
    const list = s.verse === verse && s.list.length ? s.list : nearbyThreads(graph, verse, verse, density, 0);
    stepRef.current = { verse, list };
    if (!list.length) { say('No lines at ' + refOfVerse(graph, verse).label); return false; }
    const at = list.indexOf(f.arc);
    const next = at < 0 ? (dir > 0 ? 0 : list.length - 1) : (at + (dir > 0 ? 1 : list.length - 1)) % list.length;
    return !!openPanel({ mode: 'connection', arc: list[next] });
  }, [graph, live, camRef, viewRef, mode, focusRef, centreVerse, density, say, openPanel]);

  /** An edge chip's tap: Follow that thread off the frame - the camera goes to its far end at the
   * same zoom, and the line opens there (on landing, so its own Follow names the way back). */
  const follow = React.useCallback((side) => {
    const e = edges[side];
    if (!e || !graph || !live) return;
    const open = { mode: 'connection', arc: e.arc };
    if (journey) journey.push({ verse: e.verse, label: e.label, open }, here());
    // the chip goes once that end is in view, and the keyboard with it to the body (review
    // 2026-10-18): it goes home to the web first, which does not scroll the page
    const root = rootRef && rootRef.current;
    if (root && typeof root.focus === 'function') root.focus({ preventScroll: true });
    Promise.resolve(flyTo({ x: e.verse + 0.5 })).then((ok) => { if (ok) openPanel(open); }, () => {});
  }, [edges, graph, live, journey, here, flyTo, openPanel, rootRef]);

  /** One frame's placing: the verse chip at its verse's foot, the edge chips' names. */
  const placeChips = React.useCallback(() => {
    const cam = camRef && camRef.current, v = viewRef && viewRef.current;
    if (!graph || !cam || !v || !v.W || !focusRef) return;
    const dpr = v.DPR || 1;
    const f = focusRef.current;
    const right = area();
    const c = chipRef.current;
    if (c && f.litKey !== c.litKey) { chipRef.current = null; setChip(null); }
    else if (c && chipElRef.current && viewFor) {
      const va = viewFor();
      const x = verseToX(cam, v.W, (c.lo + c.hi + 1) / 2) / dpr;
      // at the verse's foot, but never under the panel (CONTRACTS.md section 5: chips keep out of
      // panelInsetRef): over a bottom sheet the chip stands on the sheet's top edge
      const sheetTop = v.H / dpr - ((panelInsetRef && panelInsetRef.current && panelInsetRef.current.bottom) || 0);
      const y = Math.min((va.base + (va.camY || 0)) / dpr, sheetTop);
      const el = chipElRef.current;
      el.style.transform = 'translate(' + Math.round(x + 10) + 'px,' + Math.round(y - 12) + 'px) translateY(-100%)';
      el.style.visibility = x >= 0 && x <= right / dpr - 40 && y <= v.H / dpr ? 'visible' : 'hidden';
    }
    let left = null, rightEnd = null;
    const lit = f.lit;
    if (lit && lit.length) {
      const vl = xToVerse(cam, v.W, 0), vr = xToVerse(cam, v.W, right);
      for (let k = 0; k < lit.length; k++) {
        const i = lit[k];
        if (!(i >= 0 && i < graph.count)) continue;
        const a = graph.from[i] + 0.5, b = graph.to[i] + 0.5;
        const aIn = a >= vl && a <= vr, bIn = b >= vl && b <= vr;
        if (aIn === bIn) continue;
        const out = aIn ? graph.to[i] : graph.from[i];
        const w = graph.votes[i];
        if (out + 0.5 < vl) { if (!left || w > left.w) left = { arc: i, verse: out, w }; }
        else if (!rightEnd || w > rightEnd.w) rightEnd = { arc: i, verse: out, w };
      }
    }
    const key = (left ? left.arc + ':' + left.verse : '') + '|' + (rightEnd ? rightEnd.arc + ':' + rightEnd.verse : '');
    if (key !== edgeKeyRef.current) {
      edgeKeyRef.current = key;
      const named = (e) => (e ? { arc: e.arc, verse: e.verse, label: refOfVerse(graph, e.verse).label } : null);
      setEdges({ left: named(left), right: named(rightEnd) });
    }
  }, [graph, camRef, viewRef, focusRef, area, viewFor, panelInsetRef]);

  /** The start prop, once: as soon as the camera exists. */
  const tryStart = React.useCallback(() => {
    if (startedRef.current || !start || !graph || !live || !camRef.current || !viewRef.current.W) return;
    startedRef.current = true;
    const p = startPlace(graph, start);
    if (p) go(p, { push: false, instant: true });
  }, [start, graph, live, camRef, viewRef, go]);
  React.useEffect(() => { tryStart(); }, [tryStart]);

  const latest = React.useRef({ placeChips, tryStart });
  latest.current = { placeChips, tryStart };
  React.useEffect(() => {
    if (typeof onFrame !== 'function') return undefined;
    return onFrame(() => { latest.current.tryStart(); latest.current.placeChips(); });
  }, [onFrame]);
  // a chip just mounted is placed before it paints
  React.useLayoutEffect(() => { if (chip) placeChips(); }, [chip, placeChips]);

  if (!live) return NO_GOTO;

  const button = mode === 'personal' ? null : (
    <button type="button" ref={buttonRef} className="sw-btn sw-btn-icon sw-goto-btn"
      aria-label="Go to a book, chapter or verse" title="Go to ( / )" aria-haspopup="dialog" aria-expanded={isOpen}
      onClick={() => (isOpen ? close() : open())}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20.5 20.5" />
      </svg>
    </button>
  );

  const v = viewRef.current;
  const compact = !!(v && v.H && v.H / (v.DPR || 1) <= 500);
  const inset = (panelInsetRef && panelInsetRef.current && panelInsetRef.current.right) || 0;
  const optId = (k) => 'sw-goto-opt-' + k;
  const boxStyle = /** @type {any} */ ({ '--sw-goto-inset': inset + 'px' });
  if (place && !compact) {
    boxStyle['--sw-goto-x'] = place.x + 'px';
    boxStyle['--sw-goto-w'] = place.w + 'px';
    boxStyle['--sw-goto-top'] = place.top + 'px';
  }
  const theBox = isOpen ? (
    <div className={'sw-goto' + (compact ? ' is-compact' : '')} ref={boxRef} role="dialog" aria-label="Go to"
      style={boxStyle}>
      <div className="sw-goto-field">
        <svg className="sw-goto-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20.5 20.5" />
        </svg>
        <input ref={inputRef} className="sw-goto-input" type="text" value={query}
          placeholder="Book, chapter or verse" aria-label="Go to a book, chapter or verse"
          role="combobox" aria-expanded={rows.length > 0} aria-controls="sw-goto-list" aria-autocomplete="list"
          aria-activedescendant={selAt >= 0 ? optId(selAt) : undefined}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go"
          onChange={(e) => { setQuery(e.target.value); setSel(0); }} onKeyDown={onInputKey} />
      </div>
      {rows.length ? (
        <ul id="sw-goto-list" className="sw-goto-list" role="listbox" aria-label="Places">
          {rows.map((row, k) => (
            <li key={row.key} id={optId(k)} role="option" aria-selected={k === selAt}
              className={'sw-goto-row' + (k === selAt ? ' is-sel' : '')}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setSel(k)} onClick={() => choose(row)}>
              <span className="sw-goto-ref">{row.label}</span>
              {row.sub ? <span className="sw-goto-sub">{' · ' + row.sub}</span> : null}
              {row.text ? <span className="sw-goto-text">{' — ' + row.text}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="sw-goto-hint">{GOTO_HINT}</div>
    </div>
  ) : null;

  const theChip = chip ? (
    <div className={'sw-goto-chip' + (compact ? ' is-compact' : '')} ref={chipElRef} aria-hidden="true">
      {chip.label + ' · ' + connectionsText(chip.count)}
    </div>
  ) : null;
  const edgeChip = (side) => {
    const e = edges[side];
    if (!e) return null;
    return (
      <button type="button" className={'sw-goto-edge sw-goto-edge-' + side + (compact ? ' is-compact' : '')} onClick={() => follow(side)}
        style={side === 'right' ? { right: 'calc(' + inset + 'px + var(--sw-goto-gutter, 24px))' } : undefined}
        aria-label={'Follow the line to ' + e.label}>
        {side === 'left' ? '‹ ' + e.label : e.label + ' ›'}
      </button>
    );
  };
  const box = theBox || theChip || edges.left || edges.right
    ? <>{theBox}{theChip}{edgeChip('left')}{edgeChip('right')}</> : null;

  return { button, box, isOpen, open, close, selectCentre, step };
}

/**
 * Route a tap on an overlay target (CONTRACTS.md section 4): a book name frames the book, a
 * chapter numeral frames the chapter (about 70 % of the canvas area) and opens its group, a pill
 * opens its group. A camera move is a journey arrival, pushed before the camera moves (the trail
 * asks the go-to where it set out from).
 * @param {import('./overlay-renderer.js').OverlayHit | null} hit
 * @param {{ graph: any, flyTo: Function, openPanel: Function, journey: any }} nav
 * @returns {boolean} whether the tap was handled
 */
export function routeOverlayHit(hit, nav) {
  if (!hit || !nav || !nav.graph) return false;
  const g = nav.graph;
  if (hit.kind === 'book' || hit.kind === 'chapter') {
    const ci = hit.kind === 'chapter' ? chapterIndexOf(g, hit.book, hit.chapter) : -1;
    if (hit.kind === 'chapter' && ci < 0) return false;
    const place = hit.kind === 'book' ? bookPlace(g, hit.book) : chapterPlace(g, ci);
    if (!place) return false;
    const frame = frameOf(g, place);
    const open = hit.kind === 'chapter' ? { mode: 'group', chapter: ci } : undefined;
    if (nav.journey) nav.journey.push({ verse: place.lo, label: place.label, open, span: [frame.x0, frame.x1] });
    if (open && typeof nav.openPanel === 'function') nav.openPanel(open);
    if (typeof nav.flyTo === 'function') nav.flyTo(frame);
    return true;
  }
  if (hit.kind === 'pill') {
    return typeof nav.openPanel === 'function' && !!nav.openPanel({ mode: 'group', ids: hit.ids, label: hit.label });
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/overlay-renderer — Cluster F (bundle-d)

   The Canvas2D overlay (#ui, .sw-canvas-ui) the Scripture Web paints over
   its WebGL threads, once per frame. Since w3 (the canvas stream: digest
   C2, C6, Q1a, Q3; build spec §3, §4.2-4.4) it is the web's wayfinding:

   - under the baseline, the ruler. At the overview (r2-01a): a strip of
     gold ticks on the verses the Volumes cite, the chapter-length bars
     shaded book by book, and the book names on two rows, the six major
     books first. Past about 6x (r3-03) the overview hands over to the deep
     band: the cited strip, the "+n" pills, chapter numerals (the primary
     mark; the centre chapter's in gold over a 10 % gold wash), chapter and
     verse ticks, dots under cited verses, verse numerals once there is
     room, and the book names, the one the frame is inside stuck to the
     left edge ("‹ ISAIAH") and the next one at the right when it is near;
   - over the baseline, the labels: chips at the feet of the threads
     ("Isa 53:5 · 1 Pet 2:24"), and from the verse-numeral zoom the far end
     of each thread written beside its leg. A label engine places them
     (utils/scripture-web/label-engine.js): the chosen line first, then the
     threads with a foot on the frame by votes, each kept off the others,
     the corner buttons, the panel and the top chrome, with hysteresis;
   - the top scrim behind the header, the sky's altitude ruler and
     elevator (landing 9), and on My Web the reader's links and the
     scripture rail's book names.

   Every text is the app's book serif (EB Garamond, the shipped file, under
   the web's own family name) at full DPR and never under 12 CSS px. What
   it draws that a tap can land on (a book name, a chapter numeral, a pill)
   it records as boxes (paintCanonOverlay's hits; hitOverlay reads them).

   Two entry points, each one clear and then the painters, as (ctx,
   frameState): paintCanonOverlay and paintMyWebOverlay. A null context
   (jsdom) still gets what a frame computes without one - the altitude
   marks, the elevator's box - and the screen publishes the results.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  verseToX, xToVerse, arcShape, arcHeightAt, arcAnchored, footX, fitPPV, maxCamY, ALTITUDE_MARKS, spanAtHeight, spanT,
} from '../../utils/scripture-web/geometry.js';
import { refOfVerse, labelFeed, eachLabelThread } from '../../utils/scripture-web/pick.js';
import { filterSerial } from '../../utils/scripture-web/filters.js';
import { fansOf, bucketDrawCount } from '../../utils/scripture-web/decode.js';
import { distanceRampRGB } from '../../utils/scripture-web/palette.js';
import { placeRailLabelsRanked } from '../../utils/scripture-web/rail-labels.js';
import { css, ink, inkWidth, TAP_CONTEXT } from '../../utils/scripture-web/sw-ink.js';
import { citationsForVerse } from '../../utils/scripture-web/vot-citations.js';
import {
  canvasFont, fontPx, setFont, measure, boxesMeet, createGrid, placeRanked, ensureWebFont,
} from '../../utils/scripture-web/label-engine.js';
import { drawPersonalWeb, railFrame, segmentSpan } from './rail-renderer.js';
import { frameSet } from '../../utils/scripture-web/frame-set.js';
import { exitCensus, exitIds, fanGroups, areaLabel } from '../../utils/scripture-web/exits.js';

/**
 * @typedef {object} CanonFrame
 * @property {any} g             the decoded graph
 * @property {any} cam           the canon camera
 * @property {any} view          the frame's render arguments (viewFor(): base, squash, localize, ...)
 * @property {{W:number, H:number, DPR:number}} v  the view size, device px
 * @property {any} chrome        the chrome tokens (readChromeTokens)
 * @property {number} canvasH    the overlay canvas's own height, the clear's
 * @property {number} inset      where the sky starts under the top chrome, device px (0: hidden)
 * @property {any} yFrame        the camera's y frame (yFrameFor), or null
 * @property {import('../../utils/scripture-web/decode.js').Density} density
 * @property {number} focusArc   the chosen OpenBible thread, or -1 (view.focusArc: a chosen prophecy
 *                               pair is view.focusProphecy; the rest of the focus is on view too)
 * @property {any} bundles       the convergence pills' counts (bundlesFor)
 * @property {[number, number]|null} lens  the lit chapter's verse range, or null
 * @property {number} lensDim
 * @property {import('../../utils/scripture-web/web-frame.js').CentreChapter|null} [centre]
 *                               the centre chapter (web-frame.centreOf, GL-computed): the overlay
 *                               paints its wash and gold numeral at centre.t and dims nothing
 * @property {{right:number, bottom:number}} [panelInset]  CSS px the open panel covers at the
 *                               right edge (docked) or the bottom (the sheet under 560 px); labels,
 *                               chips and pills keep out of it
 * @property {Box[]|null} [keepOut]  CSS px boxes the page's own chips stand in over the canvas (the
 *                               go-to's verse chip, goto.jsx): the labels keep out of them as they
 *                               keep out of the panel
 * @property {OverlayBox[]} [hits]  what the last paint made tappable; the draw copies
 *                               paintCanonOverlay's result here so hitOverlay can read it
 * @property {any} [ask]         what a column's fan is asked about (focus.ask, use-web-selection.js):
 *                               a "+n" pill's cell, or a fan chip's (its cell, side and books), or null
 * @property {Box|null} [fanZone]  the ground of the fan the last paint drew (fanAt reads it)
 */

/**
 * @typedef {{ kind: 'book', book: number }
 *   | { kind: 'chapter', book: number, chapter: number }
 *   | { kind: 'pill', ids: ArrayLike<number>, label: string, cell?: {lo:number, hi:number} }
 *   | { kind: 'exit', ids: ArrayLike<number>, label: string, key: string, side: 'left'|'right',
 *       lo: number, hi: number, count: number, cell: {lo:number, hi:number},
 *       area: {label:string, lo:number, hi:number} }
 *   | { kind: 'thread', index: number }} OverlayHit
 *   book: an index into g.books; chapter: its number (1-based); ids: the OpenBible
 *   arc ids a "+n" pill counts, label: what the panel's group mode is titled, cell: its verses;
 *   exit: a chip of a column's fan (exits.js): the legs it counts, from the cell to the books lo..hi
 *   on `side`; area: the cell in words
 */
/** @typedef {{ x0:number, y0:number, x1:number, y1:number, hit: OverlayHit, core?: Box }} OverlayBox
 *   device px: the tap target, at least TAP_MIN CSS px each way; `core` is what is drawn there */
/** @typedef {{ x0:number, y0:number, x1:number, y1:number, ax?:number, ay?:number, ang?:number }} Box  device px (ax, ay, ang: a comb tag's anchor and angle) */

/**
 * What the overlay drew under a CSS-px point, for the tap path: the tap tries it
 * after the elevator's track and before the badges and the threads, so a book
 * name, a chapter numeral or a pill is never read as the line beneath it.
 * The canvas stream records the boxes (paintCanonOverlay's `hits`) as it
 * paints and owns this lookup; the navigation stream routes the result
 * (goto.jsx routeOverlayHit). A tap on what is drawn (a box's core) takes
 * it, the box painted last on top; else, among the tap targets the point is
 * in (each a finger wide, so neighbours' overlap), the one drawn nearest.
 * @param {CanonFrame|null} fs  the last painted frame (useWebRenderer's overlayFrameRef)
 * @param {number} xCss @param {number} yCss
 * @returns {OverlayHit|null}
 */
export function hitOverlay(fs, xCss, yCss) {
  const hits = fs && fs.hits;
  if (!hits || !hits.length) return null;
  const dpr = (fs.v && fs.v.DPR) || 1;
  const px = xCss * dpr, py = yCss * dpr;
  /** @param {Box} b */
  const inside = (b) => px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1;
  for (let i = hits.length - 1; i >= 0; i--) {
    if (inside(hits[i].core || hits[i])) return hits[i].hit;
  }
  /** @type {OverlayHit|null} */
  let best = null;
  let bestD = Infinity;
  for (let i = hits.length - 1; i >= 0; i--) {
    const b = hits[i];
    if (!inside(b)) continue;
    const c = b.core || b;
    const dx = Math.max(c.x0 - px, 0, px - c.x1), dy = Math.max(c.y0 - py, 0, py - c.y1);
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = b.hit; }
  }
  return best;
}

/** A tap target is at least this big each way, CSS px: a finger (WCAG 2.5.5; the platforms' 44 pt / 48 dp). */
export const TAP_MIN = 44;

/**
 * The tap target for what is drawn at `core`: `area` (the drawn box with its
 * own margin, or a chapter's whole span) grown to TAP_MIN each way about its
 * centre, then slid into the ruler band (under the baseline, on the canvas,
 * left of the open panel) so it never reaches up into the threads. Device px.
 * @param {Box} core @param {Box} area @param {OverlayHit} hit @param {any} L  layoutOf's
 * @returns {OverlayBox}
 */
function tapTarget(core, area, hit, L) {
  const m = TAP_MIN * L.s;
  /** @param {number} a @param {number} b @param {number} lo @param {number} hi @returns {[number, number]} */
  const fit = (a, b, lo, hi) => {
    if (b - a < m) { const c = (a + b) / 2; a = c - m / 2; b = c + m / 2; }
    if (a < lo) { b += lo - a; a = lo; }
    if (b > hi) { a = Math.max(lo, a - (b - hi)); b = hi; }
    return [a, b];
  };
  const [x0, x1] = fit(area.x0, area.x1, 0, L.Wc);
  const [y0, y1] = fit(area.y0, area.y1, L.base, L.H);
  const c = {
    x0: Math.min(Math.max(core.x0, x0), x1), x1: Math.min(Math.max(core.x1, x0), x1),
    y0: Math.min(Math.max(core.y0, y0), y1), y1: Math.min(Math.max(core.y1, y0), y1),
  };
  return { x0, y0, x1, y1, core: c, hit };
}

/* ── the numbers (CSS px unless named otherwise) ────────────────────────── */

/** EB Garamond's cap (and lining-figure) height, em: rows are laid out by what the eye sees. */
const CAP = 0.66;
/** The overview ruler hands over to the deep band between these zooms (x fit), eased: done by
    6x, where the centre chapter's emphasis starts (spec §4.4). */
export const DEEP_FROM = 4;
export const DEEP_FULL = 5.5;
/** CSS px per verse: verse ticks fade in from here (to twice it). */
const VERSE_TICK_PPV = 2;
/** ... the dots under cited verses from here (to 1.5x). */
const CITED_DOT_PPV = 4;
/** ... verse numerals at every 5th verse from here, in full ink by VERSE_NUM_FIFTH_FULL, at every
    verse from VERSE_NUM_ALL (spec §4.3; from 6 to 8 they were barely begun at r3-03's phone
    frame, 6 px a verse, which has them in full, w4 review). */
const VERSE_NUM_FIFTH = 4.5;
const VERSE_NUM_FIFTH_FULL = 6;
const VERSE_NUM_ALL = 22;
/** ... and from the verse-numeral zoom the far end of each thread is written beside its leg. */
export const LEG_PPV_CSS = 22;
/** How many heights a far end may try beside its leg: a short column of names over each crowded
    verse, and the sky above it left to the threads (C2: "fully zoomed in must look good and clean");
    on a phone's short sky three, or the column is a wall of text (w3 review). */
const LEG_SLOTS = 5;
const LEG_SLOTS_COMPACT = 3;
/** The clear space a far end keeps from its neighbours on its row, CSS px, so two never read as
    one: on a phone about a word's width ("Gen" at 12 px), where the names run closer. */
const LEG_CLEAR = 8;
const LEG_CLEAR_COMPACT = 24;
/** While a line is chosen the other labels step back with the threads, two thirds of the
    threads' way (to TAP_CONTEXT): the chosen line reads first, the rest stay readable (C3). */
export const LABEL_RECEDE = 1 - (1 - TAP_CONTEXT) * 0.65;
/** Up in the sky, at most this many crossing threads are named at their bodies. */
const FLY_LABELS = 12;
/** The corner buttons keep this much clear around them (spec §3: their rectangles + 8). */
const ZONE_PAD = 8;
/** The black fade a stuck book name stands on: this wide (CSS px), solid to this share of it. */
const FADE_SPAN = 160;
const FADE_SOLID = 0.55;
/** The deep band's left and right gutter, where the sticky book names stand. */
const GUTTER = 16;
/** Chapter-numeral strides at depth: the smallest whose numerals do not collide. */
const STRIDES = [1, 2, 5, 10, 25, 50, 100];
/** The major books (spec §3), drawn in the brighter weight and placed before their neighbours. */
const MAJOR_BOOKS = ['genesis', 'psalms', 'isaiah', 'matthew', 'john', 'revelation'];
/** The other books r2-01a's one row names on a PC, placed after the majors and before the rest, in
    canon order (w4 readdown: JUDG, MARK and ROM went where 2KGS, 2SAM and 1COR, a few verses longer,
    were placed first). At 1600 px the run from Matthew to 1 Corinthians has room for six names a word
    apart, not r2-01a's seven: in canon order the epistles begin at ROM, and 1COR gives way. */
const PICTURE_BOOKS = ['exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua', 'judges', 'mark', 'luke', 'acts', 'romans', '1corinthians'];
/** The DOM chrome the canvas keeps its text off (the round buttons; the strip when it sits low). */
const ZONE_SELECTORS = ['.sw-hide-all', '.sw-guide-btn', '.sw-controls'];

/** Type sizes, PC / compact (spec §3, §4.3; the compact sizes under 12 are lifted to the 12 floor). */
const SIZES = {
  pc: { label: 13, num: 28, name: 16, vnum: 13, chip: 14, pill: 12, chosen: 16, leg: 13, every: 160 },
  compact: { label: 12, num: 20, name: 13, vnum: 12, chip: 12.5, pill: 12, chosen: 14, leg: 12, every: 120 },
};

/* The two ruler stacks, CSS px down from the baseline, as the spec draws them
   (§3 / §4.3). A short band (a PC without the 212 px ruler has 100) keeps
   every row and closes the gaps between them; a flexible row (the bars) gives
   some of its height last.
   w4 (the band stream): the overview's names stand on one row, and on a PC the
   rows spread over the ruler as r2-01a's do (the cited strip, the bars, the
   names; a chosen foot's label cuts its notch in the bars, r2-06; the spec's +12..+42 bars and
   +52 / +70 names left 98 px of black above the legend, and w4's +16..+64 bars and +90 row still
   78; the w4 review's +16..+82 and +110 moved that black above the names, 58 px under the common
   bars). w4 review 2: the names hang just under the bars (+16..+60, the row at +78: half the
   bars end within 41 px of the names, the longest 18 above them, r2-01a's 38 and 15), and the
   PC baseline came down to H - 180 (web-frame.js RULER_PC) so the band is r2-01a's depth and the
   names stand about 55 px over the legend with no black on either side. On a phone the names
   end above the corner buttons' zone (+44) and the deep band's numerals do too,
   so a button never takes a numeral or the sticky name. */
const OV_PC = { rows: [{ k: 'cited', top: 5, h: 5 }, { k: 'bars', top: 16, h: 44, min: 12 }, { k: 'row0', top: 78, h: 13 * CAP }], end: 92 };
const OV_COMPACT = { rows: [{ k: 'cited', top: 3, h: 4 }, { k: 'bars', top: 10, h: 18, min: 8 }, { k: 'row0', top: 35, h: 12 * CAP }], end: 44 };
const DEEP_PC = {
  rows: [
    { k: 'cited', top: 4, h: 5 }, { k: 'pills', top: 16, h: 20 }, { k: 'nums', top: 72.5, h: 28 * CAP },
    { k: 'ticks', top: 108, h: 12 }, { k: 'dot', top: 124, h: 4, opt: true }, { k: 'vnums', top: 145.6, h: 13 * CAP, opt: true },
  ],
  end: 175,
};
const DEEP_COMPACT = {
  rows: [
    { k: 'cited', top: 3, h: 4 }, { k: 'pills', top: 9, h: 16 }, { k: 'nums', top: 29, h: 20 * CAP },
    { k: 'ticks', top: 47, h: 12 }, { k: 'dot', top: 61, h: 3, opt: true }, { k: 'vnums', top: 65.5, h: 12 * CAP, opt: true },
  ],
  end: 74,
};

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Lay a stack of rows into `avail` CSS px: the natural layout when it fits;
 * else the gaps close (to a quarter at most), then the flexible rows give up
 * height to their `min`; and where even that is too tall, an optional row at
 * the foot (the verse numerals, the cited dots) is left out rather than
 * printed through the legend: it comes back `off`, with no height. Pure,
 * exported for the tests.
 * @param {Array<{k:string, top:number, h:number, min?:number, opt?:boolean}>} rows  natural tops, in order
 * @param {number} end  the natural bottom
 * @param {number} avail
 * @returns {Record<string, {top:number, h:number, off?:boolean}> & {end:number}}
 */
export function stackRows(rows, end, avail) {
  let list = rows, e = end;
  /** @type {string[]} */
  const off = [];
  for (;;) {
    let R = 0;
    for (const r of list) R += r.h;
    const G = Math.max(0, e - R);
    const raw = e > avail ? (G > 0 ? (avail - R) / G : 0) : 1;
    const last = list[list.length - 1];
    if (raw < 0.25 && last && last.opt && list.length > 1) {
      off.push(last.k);
      e = last.top;
      list = list.slice(0, -1);
      continue;
    }
    let k = 1, shrink = 0;
    if (e > avail) {
      k = Math.max(0.25, raw);
      const over = R + G * k - avail;
      if (over > 0) {
        let flex = 0;
        for (const r of list) if (r.min != null) flex += r.h - r.min;
        shrink = flex > 0 ? Math.min(1, over / flex) : 0;
      }
    }
    /** @type {any} */
    const out = {};
    let y = 0, prev = 0;
    for (const r of list) {
      y += (r.top - prev) * k;
      const h = r.min != null ? r.h - (r.h - r.min) * shrink : r.h;
      out[r.k] = { top: y, h };
      y += h;
      prev = r.top + r.h;
    }
    out.end = y + (e - prev) * k;
    for (const k2 of off) out[k2] = { top: out.end, h: 0, off: true };
    return out;
  }
}

/** A CSS stack to device px under `base`. */
function toDevice(st, base, s) {
  /** @type {any} */
  const out = {};
  for (const k of Object.keys(st)) {
    if (k === 'end') out.end = base + st.end * s;
    else out[k] = { top: base + st[k].top * s, h: st[k].h * s, off: !!st[k].off };
  }
  return out;
}

/* ── per-graph tables ──────────────────────────────────────────────────── */

/** @type {WeakMap<object, Array<[number, number]>>} */
const SPANS = new WeakMap();
/** Each book's verse span [first, one past last]. */
function bookSpans(g) {
  let s = SPANS.get(g);
  if (s) return s;
  s = [];
  for (const c of g.chapters) {
    if (!s[c[0]]) s[c[0]] = [c[2], c[2] + c[3]];
    s[c[0]][1] = c[2] + c[3];
  }
  SPANS.set(g, s);
  return s;
}

/** The cited strip's density reference is read over runs of this many verses (about a PC column at fit). */
const CITED_REF_RUN = 20;
/** A column holding a cited verse keeps at least this share of the cited ink ... */
const CITED_FLOOR = 0.25;
/** ... and reaches the full ink at the reference density, along this power (> 1: the clusters stand out). */
const CITED_GAMMA = 2;
/** The strip's inks are quantized to this many steps, one path each. */
const CITED_LEVELS = 12;

/** @type {WeakMap<object, {pre: Int32Array, count: number, ref: number}>} */
const CITED = new WeakMap();
/**
 * Which verses the Volumes cite (Q1 a), as prefix sums so a pixel column of
 * the overview asks one subtraction. A verse is cited exactly when the
 * panel's CITED IN THE VOLUMES list for it is not empty: the list's own
 * function (vot-citations.citationsForVerse) answers for every verse any
 * citation reaches, so the strip and the panel cannot disagree. `ref` is
 * the strip's reference density: the 90th percentile of the cited share
 * over the canon's runs of CITED_REF_RUN verses that hold any.
 * @param {any} g
 */
export function citedVerses(g) {
  let c = CITED.get(g);
  if (c) return c;
  const total = g && g.total > 0 ? g.total | 0 : 0;
  const pre = new Int32Array(total + 1);
  const edges = g && Array.isArray(g.votEdges) ? g.votEdges : [];
  if (edges.length && total) {
    const reach = new Uint8Array(total);
    for (const e of edges) {
      if (!e || !(e.v >= 0) || e.v >= total) continue;
      let end = e.v;
      if (Array.isArray(e.at)) for (const at of e.at) if (at && at.ve > end) end = at.ve;
      for (let x = e.v; x <= Math.min(end, total - 1); x++) reach[x] = 1;
    }
    for (let x = 0; x < total; x++) pre[x + 1] = pre[x] + (reach[x] && citationsForVerse(g, x, null).length ? 1 : 0);
  }
  const shares = [];
  for (let x = 0; x < total; x += CITED_REF_RUN) {
    const hi = Math.min(total, x + CITED_REF_RUN);
    if (pre[hi] > pre[x]) shares.push((pre[hi] - pre[x]) / (hi - x));
  }
  shares.sort((a, b) => a - b);
  c = { pre, count: pre[total], ref: shares.length ? shares[Math.floor(0.9 * (shares.length - 1))] : 1 };
  CITED.set(g, c);
  return c;
}

/**
 * The share of the cited ink a strip column takes when `share` of the verses
 * it holds are cited: CITED_FLOOR for a lone cited verse among many, rising
 * along CITED_GAMMA to the full ink at the reference density `ref`, quantized
 * to CITED_LEVELS steps. 0 for none.
 * @param {number} share @param {number} ref
 */
export function citedInk(share, ref) {
  if (!(share > 0)) return 0;
  const t = Math.pow(Math.min(1, share / (ref > 0 ? ref : 1)), CITED_GAMMA);
  return Math.max(1, Math.round((CITED_FLOOR + (1 - CITED_FLOOR) * t) * CITED_LEVELS)) / CITED_LEVELS;
}

/**
 * The label pass's memory per graph: the chips and leg labels placed last frame (hysteresis),
 * and the chip keepers and the leg feed of the last camera, so a frame that did not move (a
 * hover, a font) reuses them.
 * @typedef {{ chips: Map<any, number>, legs: Map<any, number>, comb: Map<any, number>,
 *   chipCache: {key: string, recs: ChipFoot[]}|null, feedCache: {key: string, feed: any[]}|null }} LabelMemo
 */
/** @type {WeakMap<object, LabelMemo>} */
const MEMO = new WeakMap();
const memoOf = (g) => {
  let m = MEMO.get(g);
  if (!m) { m = { chips: new Map(), legs: new Map(), comb: new Map(), chipCache: null, feedCache: null }; MEMO.set(g, m); }
  return m;
};

const isMajor = (book) => {
  const id = String((book && book.id) || '').toLowerCase();
  return MAJOR_BOOKS.some((m) => id === m || id.startsWith(m + '-'));
};
/** "1Pet" -> "1 Pet": the spec's chip writes a numbered book with a space. */
const spaced = (abbr) => String(abbr || '').replace(/^(\d)(\D)/, '$1 $2');
/** A verse as the chips write it: "Isa 53:5". */
function shortRef(g, verse) {
  const r = refOfVerse(g, verse);
  return spaced(r.abbr) + ' ' + r.chapter + ':' + r.verse;
}
const fmtCount = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));

/** Two inks mixed, a over b by t, opaque. */
function mixInk(a, b, t) {
  const A = ink(a).hex, B = ink(b).hex;
  const ch = (h, i) => parseInt(h.slice(i, i + 2), 16);
  const k = Math.min(1, Math.max(0, t));
  return 'rgb(' + [1, 3, 5].map((i) => Math.round(ch(A, i) + (ch(B, i) - ch(A, i)) * k)).join(',') + ')';
}

function roundRectPath(ctx, b, r) {
  const rr = Math.max(0, Math.min(r, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2));
  ctx.beginPath();
  ctx.moveTo(b.x0 + rr, b.y0);
  ctx.arcTo(b.x1, b.y0, b.x1, b.y1, rr);
  ctx.arcTo(b.x1, b.y1, b.x0, b.y1, rr);
  ctx.arcTo(b.x0, b.y1, b.x0, b.y0, rr);
  ctx.arcTo(b.x0, b.y0, b.x1, b.y0, rr);
  ctx.closePath();
}

/** A linear gradient, or null where the context has none (the tests' recorders). */
function gradient(ctx, x0, y0, x1, y1, stops) {
  const gr = typeof ctx.createLinearGradient === 'function' ? ctx.createLinearGradient(x0, y0, x1, y1) : null;
  if (!gr || typeof gr.addColorStop !== 'function') return null;
  for (const [at, colour] of stops) gr.addColorStop(Math.min(1, Math.max(0, at)), colour);
  return gr;
}

/**
 * What is left of the rect (x, y, w, h) outside the boxes, as rects [x0, y0, x1, y1]: the band's
 * marks (ticks, rules, bars, the cited strip) run up to the corner buttons' zones and the chosen
 * feet's labels and stop there, so a button stands on black and a label on clear ground (w4).
 * @param {number} x @param {number} y @param {number} w @param {number} h @param {Box[]} boxes
 */
function rectsOutside(x, y, w, h, boxes) {
  let parts = [[x, y, x + w, y + h]];
  for (const b of boxes) {
    /** @type {number[][]} */
    const next = [];
    for (const p of parts) {
      const [x0, y0, x1, y1] = p;
      if (b.x1 <= x0 || b.x0 >= x1 || b.y1 <= y0 || b.y0 >= y1) { next.push(p); continue; }
      if (b.y0 > y0) next.push([x0, y0, x1, b.y0]);
      if (b.y1 < y1) next.push([x0, b.y1, x1, y1]);
      const ya = Math.max(y0, b.y0), yb = Math.min(y1, b.y1);
      if (b.x0 > x0) next.push([x0, ya, b.x0, yb]);
      if (b.x1 < x1) next.push([b.x1, ya, x1, yb]);
    }
    parts = next;
  }
  return parts;
}
const meetsAny = (x, y, w, h, boxes) => {
  for (const b of boxes) if (b.x1 > x && b.x0 < x + w && b.y1 > y && b.y0 < y + h) return true;
  return false;
};
/** ctx.rect into the open path, outside the boxes. */
function rectOut(ctx, x, y, w, h, boxes) {
  if (!boxes.length || !meetsAny(x, y, w, h, boxes)) { ctx.rect(x, y, w, h); return; }
  for (const [x0, y0, x1, y1] of rectsOutside(x, y, w, h, boxes)) ctx.rect(x0, y0, x1 - x0, y1 - y0);
}
/** ctx.fillRect outside the boxes. */
function fillOut(ctx, x, y, w, h, boxes) {
  if (!boxes.length || !meetsAny(x, y, w, h, boxes)) { ctx.fillRect(x, y, w, h); return; }
  for (const [x0, y0, x1, y1] of rectsOutside(x, y, w, h, boxes)) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

/* ── the chrome the canvas keeps off ───────────────────────────────────── */

const NO_CHROME = { zones: /** @type {Box[]} */ ([]), legendTop: Infinity };
/** @type {WeakMap<object, {key: string, at: number, val: any}>} */
const CHROME = new WeakMap();
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
/**
 * The round buttons' boxes (+ ZONE_PAD) and the legend's top, device px in the
 * canvas's frame, from the screen's own root (the canvas's ancestor, never a
 * document query: two roots can be mounted). Layout metrics, so the rotated
 * portrait root measures the same; read at most every half second, and at
 * once when the frame's size, the root's class or the docked panel changes
 * (the buttons move with the panel, Q12).
 * @param {any} ctx @param {{W:number, H:number, DPR:number}} v
 * @param {{right:number, bottom:number}|null} [pi]  the open panel's inset, CSS px
 */
function chromeBoxes(ctx, v, pi) {
  const canvas = ctx && ctx.canvas;
  const root = canvas && typeof canvas.closest === 'function' ? canvas.closest('.sw-root') : null;
  if (!root) return NO_CHROME;
  const key = v.W + '|' + v.H + '|' + v.DPR + '|' + root.className + '|' + ((pi && pi.right) || 0) + '|' + ((pi && pi.bottom) || 0);
  const cached = CHROME.get(root);
  const t = now();
  if (cached && cached.key === key && t - cached.at < 500) return cached.val;
  const s = v.DPR || 1;
  const at = (el) => {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft || 0; y += n.offsetTop || 0; n = n.offsetParent; }
    return n === root ? { x, y } : null;
  };
  const c0 = at(canvas) || { x: 0, y: 0 };
  const box = (el, pad) => {
    if (!el || !(el.offsetWidth > 0) || !(el.offsetHeight > 0)) return null;
    const p = at(el);
    if (!p) return null;
    return {
      x0: (p.x - c0.x - pad) * s, y0: (p.y - c0.y - pad) * s,
      x1: (p.x - c0.x + el.offsetWidth + pad) * s, y1: (p.y - c0.y + el.offsetHeight + pad) * s,
    };
  };
  const zones = [];
  for (const sel of ZONE_SELECTORS) {
    const b = box(root.querySelector(sel), ZONE_PAD);
    if (b) zones.push(b);
  }
  const legend = box(root.querySelector('.sw-legend'), 0);
  const val = { zones, legendTop: legend ? legend.y0 : Infinity };
  CHROME.set(root, { key, at: t, val });
  return val;
}

/* ── the frame's layout ────────────────────────────────────────────────── */

function layoutOf(ctx, fs) {
  const { v, view, cam } = fs;
  const s = v.DPR || 1, W = v.W, H = v.H;
  const pi = fs.panelInset || null;
  const right = pi && pi.right > 0 ? pi.right * s : 0;
  const bottom = pi && pi.bottom > 0 ? pi.bottom * s : 0;
  const Wc = Math.max(0, W - right);
  const base = view.base;
  const compact = H / s <= 500;
  const zoom = cam.ppv / fitPPV(cam, W);
  const deepT = zoom > 0 ? smooth(Math.log(DEEP_FROM), Math.log(DEEP_FULL), Math.log(zoom)) : 0;
  const chrome = chromeBoxes(ctx, v, pi);
  const zones = chrome.zones.slice();
  if (right > 0) zones.push({ x0: Wc, x1: W, y0: 0, y1: H });
  if (bottom > 0) zones.push({ x0: 0, x1: W, y0: H - bottom, y1: H });
  // the ruler band ends above the legend line (or the frame's foot)
  let bandBottom = H - 4 * s;
  if (chrome.legendTop > base + 24 * s && chrome.legendTop - 4 * s < bandBottom) bandBottom = chrome.legendTop - 4 * s;
  // the overview's name row ends above the corner buttons: the right-end names (2COR, HEB,
  // REV) printed under them (#20)
  let zoneTop = bandBottom;
  for (const z of chrome.zones) if (z.y0 > base + 12 * s && z.y0 < zoneTop) zoneTop = z.y0;
  const ovSpec = compact ? OV_COMPACT : OV_PC;
  const ov = toDevice(stackRows(ovSpec.rows, ovSpec.end, (zoneTop - base) / s), base, s);
  const dpSpec = compact ? DEEP_COMPACT : DEEP_PC;
  const dp = toDevice(stackRows(dpSpec.rows, dpSpec.end, (bandBottom - base) / s), base, s);
  const inset = fs.inset > 0 ? fs.inset : 0;
  // the verse zoom (sweb-z1): past the tap rule the band's text and the labels hand over, by CSS px a verse
  const ppvCss = cam.ppv / s;
  const plateT = smooth(PLATE_FROM, PLATE_FULL, ppvCss), combT = smooth(COMB_FROM, COMB_FULL, ppvCss);
  return {
    ppvCss, plateT, combT,
    s, W, H, Wc, base, camY: cam.y > 0 ? cam.y : 0, compact, zoom, deepT, zones, bandBottom, ov, dp,
    sz: compact ? SIZES.compact : SIZES.pc, inset, skyTop: inset + 8 * s, gutter: GUTTER * s,
    bg: (fs.chrome && fs.chrome.bg) || '#000000',
  };
}

/**
 * The canon web's overlay for one frame. One clear; the top scrim; the
 * ruler (the overview's, or the deep band's, eased across 5x-6.5x); the
 * sky's altitude ruler and elevator; then the labels: the chosen line, the
 * pills, the chips at the feet and the far ends beside the legs, each kept
 * off everything placed before it. The ruler is drawn whether or not the
 * chrome is hidden: the books along the bottom are how the reader knows where
 * in scripture the web is (Corbin, 2026-09-11: "keep the web legend (the
 * books at the bottom, etc)").
 * @param {CanvasRenderingContext2D|null} ctx
 * @param {CanonFrame} fs
 * @returns {{marks:number[], altitudeSpan:number, elevator:any, labels:number, badges:any[], hits:OverlayBox[],
 *   fan:any[], fanZone:Box|null}}  fan: the column fan's chips as drawn (CSS px, for the walk); fanZone:
 *   the fan's ground (fanAt)
 */
export function paintCanonOverlay(ctx, fs) {
  const { g, cam, view, v, chrome, inset } = fs;
  if (ctx) ctx.clearRect(0, 0, v.W, fs.canvasH);
  /** @type {OverlayBox[]} */
  const hits = [];
  /** @type {any[]} */
  const badges = [];
  const usable = !!(ctx && g && g.total > 0 && g.chapters && g.chapters.length && g.chapterOfVerse);
  const L = usable ? layoutOf(ctx, fs) : null;
  const grid = createGrid();
  // the chosen feet's references, known before the ruler so it leaves their ground clear
  const ch = L ? chosenOf(ctx, g, cam, L, fs) : null;
  if (L) {
    ensureWebFont();   // the screen repaints when it loads (onWebFontReady)
    for (const z of L.zones) grid.add(z);
    const holes = footHoles(ch, L.s);
    drawScrim(ctx, L);
    drawBaseline(ctx, L);
    drawCited(ctx, g, cam, L, holes);
    drawOverview(ctx, g, cam, L, 1 - L.deepT, hits, holes);
    // the verse zoom: the deep band's numerals, ticks and names give way to the verses' own text
    drawDeep(ctx, g, cam, L, L.deepT * (1 - L.plateT), fs.centre, grid, hits);
    if (L.plateT > 0.01) drawPlates(ctx, g, cam, L, fs, grid);
    // the centre chapter's wash over the band it marks: over the sticky names' fades (no dark box
    // in the gold) and with its gold top edge over the baseline
    drawCentreWash(ctx, cam, L, fs.centre);
  }
  // the sky's chrome (landing 9): the altitude ruler on the left, only above
  // the baseline, and the elevator on the right once there is a sky to climb;
  // both reserve their boxes, so the labels keep off
  /** @type {Box[]} */
  const reserved = [];
  const altitude = { span: 0 };
  const marks = drawAltitude(ctx, g, cam, Object.assign({}, view, { inset, reserved }), v, chrome, altitude);
  const elevator = drawElevator(ctx, cam, Object.assign({}, view, { inset, reserved, total: g ? g.total : 0 }), v, chrome, fs.yFrame);
  if (!L) return { marks, altitudeSpan: altitude.span, elevator, labels: 0, badges, hits, fan: [], fanZone: null };
  for (const b of reserved) grid.add(b);
  // the page's chips over the canvas (CSS px): no label is drawn under one
  const dpr = v.DPR || 1;
  for (const b of fs.keepOut || []) grid.add({ x0: b.x0 * dpr, x1: b.x1 * dpr, y0: b.y0 * dpr, y1: b.y1 * dpr });
  /** threads labelled this frame: OpenBible ids, and 'p<n>' for a prophecy pair */
  const labelled = new Set();
  const chosen = drawChosen(ctx, g, cam, L, fs, grid, labelled, ch);
  // a column's fan, asked for: placed before the feet's chips and the far ends, which keep off it
  const fan = drawFan(ctx, g, cam, L, fs, grid, hits);
  drawPills(ctx, g, cam, L, fs, grid, hits, badges);
  if (g.count > 0 && L.deepT >= 0.5) {
    const memo = memoOf(g);
    const quiet = chosen ? LABEL_RECEDE : 1;
    // the verse zoom: the comb names every leg along itself first; the chips and the leg columns
    // hand over to it (they name what it has not placed, fading out as it comes in)
    if (L.combT > 0.01) memo.comb = drawComb(ctx, g, L, fs, legFeed(g, cam, L, fs, memo), grid, memo.comb, labelled, hits, quiet * L.combT);
    if (L.combT < 0.99) {
      memo.chips = drawChips(ctx, g, cam, L, fs, grid, memo, labelled, quiet * (1 - L.combT));
      if (cam.ppv / L.s >= LEG_PPV_CSS) memo.legs = drawLegs(ctx, g, L, fs, legFeed(g, cam, L, fs, memo), grid, memo.legs, labelled, quiet * (1 - L.combT));
    }
  }
  return {
    marks, altitudeSpan: altitude.span, elevator, labels: labelled.size, badges, hits,
    fan: fan ? fan.chips : [], fanZone: fan ? fan.zone : null,
  };
}

/**
 * My Web's overlay for one frame: one clear, the reader's links over the
 * Volumes and scripture rails (rail-renderer.js), then the scripture rail's
 * book names. The rail stays under the hidden chrome: it is the legend of
 * the web, not a control (Corbin, 2026-09-11).
 * @param {CanvasRenderingContext2D|null} ctx
 * @param {{personal:any, rail:any, g:any, cam:any, view:any, v:{W:number, H:number, DPR:number}, chrome:any,
 *   panelInset?:{right:number, bottom:number}|null}} fs  panelInset: CSS px the docked panel covers
 */
export function paintMyWebOverlay(ctx, fs) {
  if (!ctx) return;
  const { personal: p, v } = fs;
  ctx.clearRect(0, 0, v.W, v.H);
  ensureWebFont();
  drawPersonalWeb(ctx, p && p.graph, p && p.underlay, fs.rail);
  drawRulerOnly(ctx, fs.g, fs.cam, fs.view, v, fs.panelInset || null);
}

/* ── the ground: scrim, wash, baseline, the cited strip ────────────────── */

/** The top scrim behind the header (#21): the spec's #000 at .65 to transparent, 0-104 / 0-64. */
function drawScrim(ctx, L) {
  if (!(L.inset > 0)) return;
  // A phone's header is one row ("The Scripture Web  63,418 connections") with its count at about
  // 0.6 of the old 64 px ramp, where the scrim had fallen to .36 and a lit gold bundle read through
  // the count at two thirds of its ink (w5 minor: s08 phone). There the dark end holds to the
  // header's bottom (L.inset) and only then fades, over 24 px; PC's taller ramp is as it was.
  const h = L.compact ? Math.max(64 * L.s, L.inset + 24 * L.s) : Math.max(104 * L.s, L.inset + 16 * L.s);
  const hold = L.compact ? Math.min(0.85, L.inset / h) : 0.55;
  const gr = gradient(ctx, 0, 0, 0, h, [[0, css('scrim')], [hold, css('scrim', L.compact ? 0.9 : 0.6)], [1, css('scrim', 0)]]);
  if (!gr) return;
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.rect(0, 0, L.W, h); ctx.fill();
}

/**
 * The centre chapter (§4.4, Q2): a 10 % gold wash from the baseline to the
 * ruler's foot under its span, a 1 px gold top edge, no hard sides, at the
 * GL's own ease (centre.t). Nothing else changes and nothing dims.
 */
function drawCentreWash(ctx, cam, L, centre) {
  if (!centre || !(centre.t > 0)) return;
  const { s, W } = L;
  const x0 = verseToX(cam, W, centre.x0), x1 = verseToX(cam, W, centre.x1);
  if (!(x1 > 0) || x0 >= W) return;
  const a = Math.max(x0, -2 * s), b = Math.min(x1, W + 2 * s);
  const y0 = L.base, y1 = Math.max(L.base + 4 * s, Math.min(L.bandBottom, L.dp.end));
  const wash = css('centreWash', centre.t), clear = css('centreWash', 0);
  const soft = Math.min(8 * s, (x1 - x0) / 4);
  const fIn = x0 > a ? 0 : soft / (b - a), fOut = x1 < b ? 1 : 1 - soft / (b - a);
  const gr = gradient(ctx, a, 0, b, 0, x0 >= a && x1 <= b
    ? [[0, clear], [soft / (b - a), wash], [1 - soft / (b - a), wash], [1, clear]]
    : [[0, x0 >= a ? clear : wash], [fIn, wash], [fOut, wash], [1, x1 <= b ? clear : wash]]);
  ctx.fillStyle = gr || wash;
  ctx.beginPath(); ctx.rect(a, y0, b - a, y1 - y0); ctx.fill();
  ctx.fillStyle = css('centreEdge', centre.t);
  ctx.beginPath(); ctx.rect(Math.max(x0, 0), y0, Math.min(x1, W) - Math.max(x0, 0), inkWidth('centreEdge') * s); ctx.fill();
}

function drawBaseline(ctx, L) {
  ctx.fillStyle = css('baseline');
  ctx.fillRect(0, L.base, L.W, 1 * L.s);
}

/**
 * The cited strip (Q1 a): a gold tick at every verse the Volumes cite, just
 * under the baseline. Below 2 device px a verse, a tick on every device pixel
 * column that holds a cited verse (so the overview is honest at any width),
 * its ink by how much of the column is cited (citedInk): one cited verse
 * among nineteen is faint and the clusters stand out, where one full tick per
 * lit column made the New Testament a solid gold rule (w3 review; r2-01a's
 * strip is sparse). Past 2 px a verse, one tick per cited verse at its centre,
 * in the full ink.
 */
function drawCited(ctx, g, cam, L, holes) {
  const cited = citedVerses(g);
  if (!cited.count) return;
  const { s, W } = L;
  const row = L.deepT < 0.5 ? L.ov.cited : L.dp.cited;
  const cut = (holes || []).concat(L.zones);
  const pre = cited.pre, total = g.total;
  if (cam.ppv < 2 * s) {
    /** @type {number[][]} runs [x, w, ...] by ink level */
    const runs = [];
    let level = 0, from = 0;
    for (let c = 0; c <= W; c++) {
      let l = 0;
      if (c < W) {
        const lo = Math.max(0, Math.floor(xToVerse(cam, W, c)));
        const hi = Math.min(total, Math.ceil(xToVerse(cam, W, c + 1)));
        if (hi > lo && pre[hi] > pre[lo]) l = Math.round(citedInk((pre[hi] - pre[lo]) / (hi - lo), cited.ref) * CITED_LEVELS);
      }
      if (l === level) continue;
      if (level > 0) (runs[level] || (runs[level] = [])).push(from, c - from);
      level = l;
      from = c;
    }
    for (let l = 1; l < runs.length; l++) {
      const r = runs[l];
      if (!r) continue;
      ctx.fillStyle = css('cited', l / CITED_LEVELS);
      ctx.beginPath();
      for (let k = 0; k < r.length; k += 2) rectOut(ctx, r[k], row.top, r[k + 1], row.h, cut);
      ctx.fill();
    }
    return;
  }
  ctx.fillStyle = css('cited');
  ctx.beginPath();
  const v0 = Math.max(0, Math.floor(xToVerse(cam, W, 0))), v1 = Math.min(total - 1, Math.ceil(xToVerse(cam, W, W)));
  const w = Math.max(1, Math.min(cam.ppv * 0.5, 2 * s));
  for (let x = v0; x <= v1; x++) if (pre[x + 1] > pre[x]) rectOut(ctx, verseToX(cam, W, x + 0.5) - w / 2, row.top, w, row.h, cut);
  ctx.fill();
}

/* ── the overview ruler (r2-01a) ───────────────────────────────────────── */

/** The chapter-length bars stand at least this far apart, CSS px (r2-01a: a thin bar every few px). */
const BAR_PITCH = 3;
/** A bar's length runs on this power of its chapters' length against the canon's longest (Psalm
    119): softened, so the short chapters still read, and never saturated, so the long ones stand
    out (at 64 verses or more for the full bar Psalm 119 stood no taller than Numbers 7, w4 review);
    at 0.4 the common chapter's bar is about half the full one, r2-01a's ragged edge (at 0.5 two
    fifths, and the tall band left most bars short of the names). */
const BAR_GAMMA = 0.4;
/** @type {WeakMap<object, number>} */
const LONGEST = new WeakMap();
/** The canon's longest chapter, verses. */
function longestChapter(g) {
  let m = LONGEST.get(g);
  if (m) return m;
  m = 1;
  for (const c of g.chapters) if (c[3] > m) m = c[3];
  LONGEST.set(g, m);
  return m;
}

/**
 * The chapter-length bars (r2-01a): thin bars hanging from one line, their
 * LENGTH the chapter's against the canon's longest on a softened curve
 * (BAR_GAMMA: Psalm 119 the one full bar, the short psalms around it short),
 * the books alternately shaded; then the book names. Where the chapters
 * stand closer than BAR_PITCH, neighbours share a bar, their mean length by
 * verse (a verse's chapter's length, averaged over the bar's verses: Psalm
 * 119 keeps its peak beside the three short psalms it shares a run with),
 * grouped from the canon's start in runs of a power of two verses so a
 * pan never regroups them and a book's start begins a run: one bar per
 * chapter at the overview's 1,189 over 1,600 px was a solid grey strip, and
 * the longest of each run made every bar nearly the same (w4). A bar is a
 * device pixel or two wide, whatever the zoom.
 * @param {Box[]} holes  the chosen feet's references' ground (chosenOf), kept clear
 */
function drawOverview(ctx, g, cam, L, t, hits, holes) {
  if (!(t > 0.01)) return;
  const { s, W } = L;
  ctx.save();
  ctx.globalAlpha = t;
  const top = L.ov.bars.top, maxH = L.ov.bars.h;
  const shade = [css('chapterBar'), css('chapterBar', 0.5625)];
  const cut = (holes || []).concat(L.zones);
  const run = Math.pow(2, Math.ceil(Math.log2(Math.max(1e-6, (BAR_PITCH * s) / cam.ppv))));
  const bw = Math.max(1, Math.min(Math.round(1.5 * s), Math.round(0.3 * run * cam.ppv)));
  const vLo = xToVerse(cam, W, -4 * s), vHi = xToVerse(cam, W, W + 4 * s);
  const longest = longestChapter(g);
  let fill = -1;
  const bar = (start, book, len) => {
    if (start < vLo || start > vHi) return;
    const f = book % 2;
    if (f !== fill) { ctx.fillStyle = shade[f]; fill = f; }
    const h = Math.max(1.5 * s, maxH * Math.pow(Math.min(1, len / longest), BAR_GAMMA));
    fillOut(ctx, Math.round(verseToX(cam, W, start)), top, bw, h, cut);
  };
  // a book's start begins a bar when it stands far enough from the last one: a whole number of
  // device pixels by the zoom alone, so the two bars, drawn at rounded x, are never closer than
  // that (Math.round is floor(x + 0.5), and floor(u + d) >= floor(u) + floor(d): rounding never
  // brings two starts closer than the floor of their distance, and minGap is a pixel or more wider
  // than a bar at every DPR), and a pan never regroups them (it was the rounded x's difference,
  // which a sub-pixel pan moved by a pixel: bars came and went, w4 review)
  const minGap = Math.ceil(0.84 * BAR_PITCH * s);
  let from = -1, book = -1, sum = 0, n = 0;
  for (let i = 0; i < g.chapters.length; i++) {
    const c = g.chapters[i];
    const d = c[2] - from;
    if (from < 0 || d >= run || (c[0] !== book && d * cam.ppv >= minGap)) {
      if (from >= 0) bar(from, book, sum / n);
      from = c[2]; book = c[0]; sum = 0; n = 0;
      if (from > vHi) { from = -1; break; }
    }
    // by verse: each chapter weighs as many verses as it holds
    sum += c[3] * c[3]; n += c[3];
  }
  if (from >= 0) bar(from, book, sum / n);
  // the names hand over in halves (the overview's out by the middle, the deep band's in
  // from it), so two sets of names never print over each other
  const tt = Math.min(1, Math.max(0, 2 * t - 1));
  if (tt > 0.01) {
    ctx.globalAlpha = tt;
    drawBookLabels(ctx, g, cam, L, [L.ov.row0], L.sz.label, tt > 0.25 ? hits : null, 'canon');
  }
  ctx.restore();
}

/** Two book names on a row keep this much clear between them, CSS px: a word apart, so two never
    read as one ("PSALMS PROV", "DEUT JUDG" on a phone, w4). */
const NAME_GAP = 14;
/** The gap a name that slides along its book looks for first, CSS px: slid a bare word clear it sat
    hard against its neighbour ("LUKE |JOHN| ACTS" 13 px apart where the rest stand 17 to 65, w4 fix 2);
    it takes NAME_GAP only where its book has no more room, and no name goes for it. */
const NAME_ROOM = 22;
/** The form the names take, per graph and rail: 'abbr' or 'full', kept between frames. */
/** @type {WeakMap<object, Map<string, string>>} */
const FORMS = new WeakMap();
/**
 * One form for every name on the frame (w4: "GENESIS EXOD LEV" mixed them): the abbreviations
 * (GEN EXOD LEV ... r2-01a) until the books whose titles fit inside their own spans hold most of
 * the rail (r2-06: ISAIAH JEREMIAH EZEKIEL), then the titles; a band between the two thresholds
 * keeps the last frame's form, so a pan never flickers it.
 * @param {any} g @param {string} tag @param {number} share  of the rail's width
 */
function nameForm(g, tag, share) {
  let m = FORMS.get(g);
  if (!m) { m = new Map(); FORMS.set(g, m); }
  const was = m.get(tag) || 'abbr';
  const form = share >= 0.55 ? 'full' : share <= 0.45 ? 'abbr' : was;
  m.set(tag, form);
  return form;
}

/**
 * The book names along the rail, in one form (nameForm): each centred on
 * what the frame holds of its book and kept wholly on the frame (the old
 * clamp to 30 px printed "ECHARIAH"), and only while it is under twice its
 * span (three times for a major book: REV on a phone), save the canon's first
 * and last books wholly on the frame at its edge, whose name, held to that
 * edge, can only stand over the canon's end (REV at 667 px, w4 review).
 * Placed by the ranked law (rail-labels.js): the six major books first, then on a PC the
 * other books r2-01a's row names (PICTURE_BOOKS, in canon order), then the longer books
 * before the shorter, each a word (NAME_GAP) from its neighbours, a row under
 * a corner button refused; the canon's overview has one row (r2-01a). A name
 * that meets a neighbour slides along its own book to the nearest place a word
 * clear, its centre still over that book (LUKE and ACTS beside JOHN went for 3-5
 * px, w4 review 2), first looking for one NAME_ROOM clear so it does not sit
 * hard against its neighbour; where no such place is free, its neighbours give
 * way along their own books to make one, keeping the row's roomy cells roomy
 * (r2-01a's names on a PC may close them to a word: JUDG, MARK and ROM), and
 * it goes only where even that leaves no room. The
 * major books, and only they, are in the bold and the brighter ink. A thin
 * rule stands between each two neighbouring names, as r2-01a's cells: at the
 * right one's book start where that lies clear of both names, else midway
 * (the start alone left most names without one, w4).
 * @param {string} tag  whose rail ('canon', 'rail'): each keeps its own form
 */
function drawBookLabels(ctx, g, cam, L, rows, size, hits, tag) {
  const { s, W, Wc } = L;
  const spans = bookSpans(g);
  const fpx = fontPx(size, s), sp = 0.10 * fpx, capH = fpx * CAP;
  const fontN = canvasFont(size, s), fontM = canvasFont(size, s, 600);
  const edge = 8 * s, gap = NAME_GAP * s, roomy = NAME_ROOM * s;
  const books = [];
  let roomAll = 0, roomFull = 0;
  for (let bi = 0; bi < spans.length; bi++) {
    const span = spans[bi], book = g.books[bi];
    if (!span || !book) continue;
    const x0 = verseToX(cam, W, span[0]), x1 = verseToX(cam, W, span[1]);
    if (x1 <= 0 || x0 >= Wc) continue;
    const major = isMajor(book);
    const pictured = !L.compact && PICTURE_BOOKS.includes(String(book.id || '').toLowerCase());
    const font = major ? fontM : fontN;
    const vis0 = Math.max(x0, 0), vis1 = Math.min(x1, Wc), room = vis1 - vis0;
    const full = String(book.title || book.abbr || '').toUpperCase(), abbr = String(book.abbr || book.title || '').toUpperCase();
    const wF = full ? measure.width(ctx, font, full, sp) : Infinity;
    roomAll += room;
    if (wF <= room - gap) roomFull += room;
    // the canon's first or last book wholly on the frame, its outer end on the frame's edge
    const atEnd = (bi === 0 && x0 >= -0.5 && x1 <= Wc) || (bi === spans.length - 1 && x0 >= 0 && x1 <= Wc + 0.5);
    books.push({ bi, major, pictured, font, x0, vis0, vis1, room, full, abbr, wF, atEnd, verses: span[1] - span[0] });
  }
  const form = nameForm(g, tag || 'canon', roomAll > 0 ? roomFull / roomAll : 0);
  const names = [];
  for (const b of books) {
    const label = form === 'full' ? b.full : b.abbr;
    if (!label) continue;
    const w = form === 'full' ? b.wF : measure.width(ctx, b.font, label, sp);
    if (!(w <= b.room * (b.major ? 3 : 2)) && !(b.atEnd && w <= Wc - 2 * edge)) continue;
    const cx = Math.min(Math.max((b.vis0 + b.vis1) / 2, edge + w / 2), Wc - edge - w / 2);
    if (cx - w / 2 >= b.vis1 || cx + w / 2 <= b.vis0) continue;   // it would name none of its own book
    // where it meets a neighbour it may slide along its own book, its centre over what the frame
    // holds of it and the name wholly on the frame (w4 review 2: LUKE and ACTS went for 3-5 px)
    const lo = Math.max(edge, b.vis0 - w / 2), hi = Math.min(Wc - edge - w, b.vis1 - w / 2);
    const left = cx - w / 2;
    names.push({ bi: b.bi, label, font: b.font, major: b.major, x0: b.x0, verses: b.verses, rank: b.major ? -1e9 : b.pictured ? -1e8 + b.bi : -b.verses,
      squeeze: b.pictured, left, right: left + w, lo: lo <= hi ? lo : left, hi: lo <= hi ? hi : left });
  }
  const boxAt = (n, r) => ({ x0: n.left, x1: n.right, y0: rows[r].top, y1: rows[r].top + capH });
  const zones = L.zones || [];
  /** @type {number[]} */
  const at = [];
  const placed = placeRailLabelsRanked(names, gap, rows.length, names.map((n) => n.rank),
    (i, r, x) => zones.some((z) => boxesMeet(boxAt({ left: x, right: x + names[i].right - names[i].left }, r), z)), at, roomy);
  names.forEach((n, i) => { if (placed[i] >= 0 && at[i] !== n.left) { n.right += at[i] - n.left; n.left = at[i]; } });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const rule = css('chapterTick');
  const rw = Math.max(1, Math.round(0.6 * s));
  ctx.fillStyle = rule;
  for (let r = 0; r < rows.length; r++) {
    const row = names.filter((_n, j) => placed[j] === r).sort((p, q) => p.left - q.left);
    for (let k = 1; k < row.length; k++) {
      const a = row[k - 1], b = row[k];
      const x = b.x0 > a.right + 7 * s && b.x0 < b.left - 7 * s ? b.x0 : (a.right + b.left) / 2;
      fillOut(ctx, Math.round(x), rows[r].top - 4 * s, rw, capH + 8 * s, zones);
    }
  }
  names.forEach((n, i) => {
    const r = placed[i];
    if (r < 0) return;
    const b = boxAt(n, r);
    setFont(ctx, n.font, sp);
    ctx.fillStyle = css(n.major ? 'bookLabelMajor' : 'bookLabel');
    ctx.fillText(n.label, n.left, b.y1);
    if (hits) hits.push(tapTarget(b, { x0: b.x0 - 3 * s, y0: b.y0 - 5 * s, x1: b.x1 + 3 * s, y1: b.y1 + 5 * s }, { kind: 'book', book: n.bi }, L));
  });
  setFont(ctx, fontN, 0);
}

/* ── the deep band (r3-03, spec §4.3) ──────────────────────────────────── */

function drawDeep(ctx, g, cam, L, t, centre, grid, hits) {
  if (!(t > 0.01)) return;
  const { s, W, Wc, dp, sz } = L;
  const X = (x) => verseToX(cam, W, x);
  const ppvCss = cam.ppv / s;
  const v0 = Math.max(0, Math.floor(xToVerse(cam, W, 0)));
  const v1 = Math.min(g.total - 1, Math.ceil(xToVerse(cam, W, W)));
  if (v1 < v0) return;
  const ci0 = g.chapterOfVerse[v0], ci1 = g.chapterOfVerse[v1];
  const ticksBottom = dp.ticks.top + dp.ticks.h;
  // the text comes in over the second half of the hand-over (the ticks over all of it)
  const tt = Math.min(1, Math.max(0, 2 * t - 1));
  const takeHits = tt > 0.25;
  ctx.save();
  ctx.globalAlpha = t;
  // the corner buttons' zones (their rectangles + ZONE_PAD, in the grid): a text keeps out of
  // them at their own edge, not a second pad further (the right end's numerals went, w4), and
  // the ticks, rules and dots stop at them, so a button stands on black
  const zones = L.zones;
  const isZone = (b) => zones.includes(b);
  const inZone = (b) => zones.some((z) => boxesMeet(b, z));

  // the book names first: they outrank the numerals for the row
  const names = tt > 0.01 ? deepNames(ctx, g, cam, L, v0, v1, grid) : null;

  // verse ticks, every 5th taller
  const tickA = smooth(VERSE_TICK_PPV, VERSE_TICK_PPV * 2, ppvCss);
  if (tickA > 0) {
    ctx.globalAlpha = t * tickA;
    ctx.fillStyle = css('verseTick');
    ctx.beginPath();
    const tw = Math.max(1, Math.round(s));
    for (let x = v0; x <= v1; x++) {
      const n = x - g.chapters[g.chapterOfVerse[x]][2] + 1;
      rectOut(ctx, Math.round(X(x + 0.5) - tw / 2), dp.ticks.top, tw, n % 5 === 0 ? dp.ticks.h : dp.ticks.h / 2, zones);
    }
    ctx.fill();
  }
  // the cited verses' dots under their ticks
  const dotA = dp.dot.off ? 0 : smooth(CITED_DOT_PPV, CITED_DOT_PPV * 1.5, ppvCss);
  if (dotA > 0) {
    const pre = citedVerses(g).pre;
    const r = Math.min(dp.dot.h, inkWidth('citedDot') * s) / 2, cy = dp.dot.top + dp.dot.h / 2;
    ctx.globalAlpha = t * dotA;
    ctx.fillStyle = css('citedDot');
    ctx.beginPath();
    for (let x = v0; x <= v1; x++) {
      if (!(pre[x + 1] > pre[x])) continue;
      const cx = X(x + 0.5);
      if (meetsAny(cx - r, cy - r, 2 * r, 2 * r, zones)) continue;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = t;

  // the chapters: a stride so the numerals never collide, ticks at their starts
  const numFont = canvasFont(sz.num, s);
  const need = measure.width(ctx, numFont, '888') + 16 * s;
  const avg = (cam.ppv * (v1 - v0 + 1)) / (ci1 - ci0 + 1);
  let stride = STRIDES[STRIDES.length - 1];
  for (const st of STRIDES) if (st * avg >= need) { stride = st; break; }
  // the centre chapter is always numbered, and placed first: its gold numeral is the frame's "you are here".
  // Under a stride a book's chapter 1 is not numbered: its name and its rule mark it, and a bare "1"
  // where the name has no room names nothing
  const centreCi = centre && centre.chapterIndex >= ci0 && centre.chapterIndex <= ci1 ? centre.chapterIndex : -1;
  const numbered = (c, ci) => stride === 1 || ci === centreCi || (c[1] !== 1 && c[1] % stride === 0);
  setFont(ctx, numFont, 0);
  const plain = css('chapterNumeral');
  /** @type {OverlayBox[]} */
  const chapterHits = [];
  const order = [];
  if (centreCi >= 0) order.push(centreCi);
  for (let ci = ci0; ci <= ci1; ci++) if (ci !== centreCi) order.push(ci);
  // place the numerals before any rule is drawn: a tall rule stands only for a numeral that was
  // placed (or a book's start), and never through a numeral or a name
  const nums = [];
  const placedCi = new Set();
  for (const ci of tt > 0.01 ? order : []) {
    const c = g.chapters[ci];
    if (!numbered(c, ci)) continue;
    const x0 = X(c[2]), x1 = X(c[2] + c[3]);
    const text = String(c[1]);
    const w = measure.width(ctx, numFont, text);
    const a = Math.max(x0, 0), b = Math.min(x1, Wc);
    let lx, lo, hi;
    if (b - a >= w + 8 * s && (stride === 1 || ci === centreCi)) {
      lx = Math.min(Math.max((a + b) / 2 - w / 2, a + 4 * s), b - 4 * s - w);
      lo = a + 4 * s; hi = b - 4 * s;
    } else if (stride === 1) {
      continue;
    } else {
      lx = x0 + 5 * s;
      lo = lx; hi = Math.max(lx + w, Math.min(x1, Wc));   // a strided numeral may run past its chapter, as before
    }
    // wholly on the frame, or not at all; where a corner button takes its place, beside the
    // button inside its own chapter
    const y0n = dp.nums.top, y1n = dp.nums.top + dp.nums.h;
    const tries = [lx];
    for (const z of zones) if (z.y0 < y1n && z.y1 > y0n && z.x0 < lx + w && z.x1 > lx) tries.push(z.x0 - w, z.x1);
    let box = null;
    for (const x of tries) {
      if (x < lo - 1e-6 || x + w > hi + 1e-6) continue;
      const bx = { x0: x, x1: x + w, y0: y0n, y1: y1n };
      if (bx.x0 < 0 || bx.x1 > Wc || inZone(bx) || grid.hits(bx, 8 * s, isZone)) continue;
      box = bx;
      break;
    }
    if (!box) continue;
    lx = box.x0;
    grid.add(box);
    nums.push({ ci, text, lx, box });
    placedCi.add(ci);
    if (takeHits) {
      const hit = { kind: /** @type {'chapter'} */ ('chapter'), book: c[0], chapter: c[1] };
      chapterHits.push(tapTarget(box, stride === 1
        ? { x0: Math.max(x0, 0), x1: Math.min(x1, Wc), y0: box.y0 - 6 * s, y1: box.y1 + 6 * s }
        : { x0: box.x0 - 6 * s, x1: box.x1 + 6 * s, y0: box.y0 - 6 * s, y1: box.y1 + 6 * s }, hit, L));
    }
  }
  // the rules at the chapters' starts: a book's tallest, a numbered chapter's to its numeral, the
  // rest only through the tick row; a tall rule that would cut a numeral or a name stops under it
  const texts = nums.map((n) => n.box).concat(names ? names.list.map((n) => n.box) : []);
  const underText = (x) => texts.some((b) => x >= b.x0 - 1.5 * s && x <= b.x1 + 1.5 * s);
  ctx.globalAlpha = t;
  ctx.fillStyle = css('chapterTick');
  const tw = Math.max(1, Math.round(s));
  for (let ci = ci0; ci <= ci1; ci++) {
    const c = g.chapters[ci];
    const x0 = X(c[2]);
    if (x0 < 0 || x0 > W) continue;
    const xr = Math.round(x0);
    const tall = (c[1] === 1 || placedCi.has(ci)) && !underText(xr);
    if (tall && c[1] === 1) fillOut(ctx, xr, dp.nums.top - 8 * s, tw, ticksBottom + 4 * s - (dp.nums.top - 8 * s), zones);
    else if (tall) fillOut(ctx, xr, dp.nums.top - 2 * s, tw, ticksBottom - dp.nums.top + 2 * s, zones);
    else if (c[1] === 1 || X(c[2] + c[3]) - x0 >= 3 * s) fillOut(ctx, xr, dp.ticks.top, tw, dp.ticks.h, zones);
  }
  // the stuck names' fades, under every numeral
  ctx.globalAlpha = tt;
  paintDeepFades(ctx, L, names);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, numFont, 0);
  ctx.globalAlpha = tt;
  for (const n of nums) {
    const isCentre = !!centre && n.ci === centre.chapterIndex;
    ctx.fillStyle = isCentre ? mixInk('chapterNumeral', 'centreNumeral', centre.t) : plain;
    ctx.fillText(n.text, n.lx, n.box.y1);
  }

  // verse numerals: every 5th from 4.5 px a verse (full by 6), every verse from 22
  const every = dp.vnums.off || !(tt > 0.01) ? 0 : ppvCss >= VERSE_NUM_ALL ? 1 : ppvCss >= VERSE_NUM_FIFTH ? 5 : 0;
  if (every) {
    const vf = canvasFont(sz.vnum, s);
    setFont(ctx, vf, 0);
    ctx.textAlign = 'center';
    ctx.fillStyle = css('verseNumeral');
    ctx.globalAlpha = tt * (every === 5 ? smooth(VERSE_NUM_FIFTH, VERSE_NUM_FIFTH_FULL, ppvCss) : 1);
    const y0 = dp.vnums.top, y1 = dp.vnums.top + dp.vnums.h;
    for (let x = v0; x <= v1; x++) {
      const n = x - g.chapters[g.chapterOfVerse[x]][2] + 1;
      if (every === 5 && n % 5) continue;
      const text = String(n);
      const cx = X(x + 0.5), w = measure.width(ctx, vf, text);
      const box = { x0: cx - w / 2, x1: cx + w / 2, y0, y1 };
      if (box.x1 < 0 || box.x0 > Wc || L.zones.some((z) => boxesMeet(box, z))) continue;
      if (names && (box.x0 < names.fade.left || box.x1 > names.fade.right)) continue;   // under a fade's solid part
      ctx.fillText(text, cx, y1);
    }
  }

  // the names over their fades
  ctx.globalAlpha = tt;
  if (names) paintDeepNames(ctx, L, names);
  ctx.restore();
  if (takeHits && names) {
    for (const h of chapterHits) hits.push(h);
    for (const n of names.list) {
      hits.push(tapTarget(n.box, { x0: n.box.x0 - 4 * s, y0: n.box.y0 - 8 * s, x1: n.box.x1 + 4 * s, y1: n.box.y1 + 8 * s }, { kind: 'book', book: n.bi }, L));
    }
  }
}

/**
 * Where the deep band's book names go: each book that starts on the frame,
 * at its start (the full title while it fits the book, else the
 * abbreviation); the book the frame's left edge is inside, stuck to the left
 * gutter as "‹ ISAIAH" and pushed out by the next book's name; and, when the
 * next book starts within one frame width past the right edge, "MATTHEW ›"
 * at the right gutter, stepped left off a corner button. Each reserves its
 * box in the grid before the numerals are placed, and a stuck name (either
 * side) the solid part of the black fade it stands on (FADE_SOLID of
 * FADE_SPAN), so no numeral is placed where the fade would ghost it.
 */
function deepNames(ctx, g, cam, L, v0, v1, grid) {
  const { s, W, Wc, dp, sz, gutter } = L;
  const spans = bookSpans(g);
  const fpx = fontPx(sz.name, s), sp = 0.12 * fpx, capH = fpx * CAP;
  const font = canvasFont(sz.name, s, 500);
  const y0 = dp.nums.top + (dp.nums.h - capH) / 2, y1 = y0 + capH;
  const gap = 6 * s;
  const wArrow = measure.width(ctx, font, '‹');
  const bookOf = (x) => g.chapters[g.chapterOfVerse[Math.max(0, Math.min(g.total - 1, x))]][0];
  const left = bookOf(Math.floor(xToVerse(cam, W, gutter)));
  const last = bookOf(v1);
  const list = [];
  const zones = L.zones;
  const isZone = (b) => zones.includes(b);
  const free = (box, pad) => !zones.some((z) => boxesMeet(box, z)) && !grid.hits(box, pad, isZone);
  const dodge = (box) => {
    for (const z of zones) {
      if (boxesMeet(box, z)) { const dx = box.x1 - (z.x0 - 4 * s); box.x0 -= dx; box.x1 -= dx; }
    }
    return box;
  };
  // where the sticky name may stand: at the gutter, else just right of a corner button over the
  // row (the panel open on a phone parks ? and hide-UI there: "JOHN" went under them, w4)
  const stickyAt = [gutter];
  for (const z of zones) if (z.y0 < y1 && z.y1 > y0 && z.x1 > gutter && z.x0 < Wc / 2) stickyAt.push(z.x1 + 4 * s);
  stickyAt.sort((p, q) => p - q);
  let stuck = false, after = false;
  for (let bi = left; bi <= last && bi < spans.length; bi++) {
    const span = spans[bi], book = g.books[bi];
    if (!span || !book) continue;
    const startX = verseToX(cam, W, span[0]), endX = verseToX(cam, W, span[1]);
    const full = String(book.title || '').toUpperCase();
    if (bi === left && startX + gap < gutter) {
      // the sticky name, pushed along by the next book's: when the title no longer fits before the
      // next book it gives way to the abbreviation, then goes; it never slides off the frame clipped
      const nextX = bi + 1 < spans.length && spans[bi + 1] ? verseToX(cam, W, spans[bi + 1][0]) : Infinity;
      const abbr = String(book.abbr || '').toUpperCase();
      for (const text of abbr && abbr !== full ? [full, abbr] : [full]) {
        const w = measure.width(ctx, font, text, sp);
        const total = wArrow + gap + w;
        let box = null;
        for (const at of stickyAt) {
          const x = Math.min(at, nextX - 2 * gap - total);
          const bx = { x0: x, x1: x + total, y0, y1 };
          if (x < 0 || !free(bx, 0)) continue;
          box = bx;
          break;
        }
        if (!box) continue;
        grid.add(box);
        list.push({ bi, text, w, box, arrow: 'left' });
        stuck = true;
        break;
      }
      continue;
    }
    if (startX >= Wc) break;
    // the full title, else the abbreviation: the first that fits the book and its row
    const abbr = String(book.abbr || '').toUpperCase();
    for (const text of abbr && abbr !== full ? [full, abbr] : [full]) {
      const w = measure.width(ctx, font, text, sp);
      if (startX + gap + w > Math.min(endX, Wc) - gap) continue;
      const box = dodge({ x0: startX + gap, x1: startX + gap + w, y0, y1 });
      if (box.x0 < startX || !free(box, 10 * s)) continue;
      grid.add(box);
      list.push({ bi, text, w, box, arrow: null });
      break;
    }
  }
  const next = last + 1;
  if (next < spans.length && spans[next] && g.books[next]) {
    const edgeV = xToVerse(cam, W, Wc);
    const startV = spans[next][0];
    if (startV > edgeV && (startV - edgeV) * cam.ppv <= Wc) {
      const text = String(g.books[next].title || '').toUpperCase();
      const w = measure.width(ctx, font, text, sp);
      const total = w + gap + wArrow;
      const box = dodge({ x0: Wc - gutter - total, x1: Wc - gutter, y0, y1 });
      if (box.x0 > 0 && free(box, 10 * s)) {
        grid.add(box);
        list.push({ bi: next, text, w, box, arrow: 'right' });
        after = true;
      }
    }
  }
  // the fades the stuck names stand on (paintDeepFades): their rows, and the solid part of each
  // reserved, so no numeral is placed under it
  // (below the pills' row: on a phone it ends 4 px over the numerals, and the fade took the "+n" there)
  const top = Math.max(dp.nums.top - 10 * s, dp.pills.top + dp.pills.h + 4 * s);
  const bottom = Math.max(top + 1, Math.min(L.bandBottom, dp.end));
  const solid = FADE_SOLID * FADE_SPAN * s;
  // a name stepped off a corner button carries its solid part with it
  const lName = list.find((n) => n.arrow === 'left'), rName = list.find((n) => n.arrow === 'right');
  const fade = {
    top, bottom,
    left: stuck ? solid + (lName ? Math.max(0, lName.box.x0 - gutter) : 0) : 0,
    right: after ? Wc - solid - (rName ? Math.max(0, Wc - gutter - rName.box.x1) : 0) : Wc,
  };
  if (stuck) grid.add({ x0: 0, x1: fade.left, y0: top, y1: bottom });
  if (after) grid.add({ x0: fade.right, x1: Wc, y0: top, y1: bottom });
  return { list, font, sp, stuck, after, y1, wArrow, gap, fade };
}

/**
 * The black fades the stuck names stand on, so the ticks and rules pass
 * under them: solid to FADE_SOLID of FADE_SPAN, then clear. Painted before
 * the numerals (one beside the solid part is drawn over the fade, never
 * ghosted by it) and before the centre chapter's wash (which veils it).
 */
function paintDeepFades(ctx, L, names) {
  if (!names || !names.list.length) return;
  const { s, Wc } = L;
  const { top, bottom } = names.fade;
  const clearSpan = (1 - FADE_SOLID) * FADE_SPAN * s;
  const stops = (k) => [[0, 'rgba(0,0,0,1)'], [k, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']];
  if (names.stuck) {
    const span = names.fade.left + clearSpan;
    const gr = gradient(ctx, 0, 0, span, 0, stops(names.fade.left / span));
    if (gr) { ctx.fillStyle = gr; ctx.beginPath(); ctx.rect(0, top, span, bottom - top); ctx.fill(); }
  }
  if (names.after) {
    const span = Wc - names.fade.right + clearSpan;
    const gr = gradient(ctx, Wc, 0, Wc - span, 0, stops((Wc - names.fade.right) / span));
    if (gr) { ctx.fillStyle = gr; ctx.beginPath(); ctx.rect(Wc - span, top, span, bottom - top); ctx.fill(); }
  }
}

function paintDeepNames(ctx, L, names) {
  if (!names.list.length) return;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = css('stickyBook');
  for (const n of names.list) {
    if (n.arrow === 'left') {
      setFont(ctx, names.font, 0);
      ctx.fillText('‹', n.box.x0, names.y1);
      setFont(ctx, names.font, names.sp);
      ctx.fillText(n.text, n.box.x0 + names.wArrow + names.gap, names.y1);
    } else if (n.arrow === 'right') {
      setFont(ctx, names.font, names.sp);
      ctx.fillText(n.text, n.box.x0, names.y1);
      setFont(ctx, names.font, 0);
      ctx.fillText('›', n.box.x1 - names.wArrow, names.y1);
    } else {
      setFont(ctx, names.font, names.sp);
      ctx.fillText(n.text, n.box.x0, names.y1);
    }
  }
  setFont(ctx, names.font, 0);
}


/* ── THE VERSE ZOOM (sweb-z1) ───────────────────────────────────────────────
   Corbin, 2026-10-21: "I feel like we should be able to zoom way, way, way in. All the way to a
   single linked verse". Past the tap rule (44 CSS px a verse) the camera goes on to one verse 0.8
   of the frame (geometry.deepZoomFor), and every thread keeps the structure law: a verse's threads
   leave from their own feet across its cell (footX), so its sheaf opens into one near-vertical leg
   per link. Two things take over from the tap rule's furniture as it opens:
   - THE PLATE: the band's chapter numerals, ticks, dots, verse numerals and book names give way to
     each verse's own text in its cell, headed by its number in gold (a running head "PSALMS 139"
     over the verse that holds the frame), wrapped to the cell and set as large as it fits;
   - THE COMB: the chips at the feet and the leg columns give way to each leg's far end written
     ALONG it, from just over its foot (a dot in the thread's own colour), in canon order across the
     cell because the feet are (decode.fansOf); up to three tiers up the leg where neighbours stand
     close. Every tag is a tap target for its thread (hit kind 'thread').
   The laws do not move: the alpha, stroke, span-ink and density laws are flat past the tap rule
   (each clamps at or before it), and the tap rule stays their reference. */

/** CSS px a verse over which the plate eases in (and the deep band's furniture out). */
export const PLATE_FROM = 96;
export const PLATE_FULL = 144;
/** CSS px a verse over which the comb eases in (and the chips and leg columns out). */
export const COMB_FROM = 72;
export const COMB_FULL = 112;
/** The plate's type, CSS px: the largest that holds the verse, down to the floor (then cut with "…"). */
const PLATE_TYPE = { pc: { min: 13, max: 26, head: 13 }, compact: { min: 12, max: 17, head: 12 } };
/** The plate's padding inside a verse's cell, CSS px, and its line height, em. */
const PLATE_PAD = 12;
const PLATE_LEAD = 1.3;
/** A cell narrower than this (CSS px) carries no plate: its divider only. */
const PLATE_MIN_CSS = 40;
/** A cell this share of the canvas area or more is the one the frame holds: its running head, the rest dimmed. */
const PLATE_HOLD = 0.45;
/** The comb: a tag starts this high over the baseline (CSS px), this far beside its leg, in up to this many tiers. */
const COMB_H0 = 12;
const COMB_GAP = 3;
const COMB_TIERS = 3;
/** The foot's dot at the verse zoom, CSS px radius. */
const FOOT_DOT = 2.5;

/** @type {WeakMap<object, {fn: any, map: Map<number, string>}>} the verses' text, per graph and per reader's Bible */
const TEXTS = new WeakMap();
/** One verse's text for the plate (fs.textOf, the screen's: the reader's own translation), '' until the corpus lands. */
function plateText(g, fs, v) {
  const fn = fs && fs.textOf;
  if (typeof fn !== 'function') return '';
  let c = TEXTS.get(g);
  if (!c || c.fn !== fn) { c = { fn, map: new Map() }; TEXTS.set(g, c); }
  let t = c.map.get(v);
  if (t === undefined) {
    t = String(fn(v) || '').replace(/\s+/g, ' ').trim();
    if (t) c.map.set(v, t);
  }
  return t;
}

/** Words into lines no wider than `width` (device px), the first after `indent`; at most `rows`
 *  lines, the last cut with "…" when `cut`, else null when they need more. */
function wrapWords(ctx, font, words, width, indent, rows, cut) {
  const lines = [];
  let line = '', avail = width - indent;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const t = line ? line + ' ' + w : w;
    if (!line || measure.width(ctx, font, t) <= avail) { line = t; continue; }
    lines.push(line);
    if (lines.length >= rows) {
      if (!cut) return null;
      let last = lines[rows - 1];
      const room = rows === 1 ? width - indent : width;
      while (last.indexOf(' ') > 0 && measure.width(ctx, font, last + ' …') > room) last = last.replace(/\s*\S+$/, '');
      lines[rows - 1] = last + ' …';
      return lines;
    }
    line = w; avail = width;
  }
  if (line) lines.push(line);
  return lines.length > rows ? null : lines;
}

/** @type {WeakMap<object, Map<string, any>>} the plates' layouts, per graph: a verse at a cell width, rows and type */
const PLATES = new WeakMap();

/**
 * The plates (the verse zoom): each verse on the frame wide enough gets its text in its own cell
 * under the pills, a thin divider at each cell's edge. Laid out on the whole cell and clipped to the
 * canvas area less the corner buttons, so a plate never reflows as the reader pans.
 */
function drawPlates(ctx, g, cam, L, fs, grid) {
  const { s, W, Wc, dp, compact } = L;
  const t = L.plateT;
  const type = compact ? PLATE_TYPE.compact : PLATE_TYPE.pc;
  const top = dp.pills.top + dp.pills.h + 6 * s;
  const bottom = Math.min(L.bandBottom, dp.end) - 3 * s;
  if (!(bottom - top > 10 * s)) return;
  const v0 = Math.max(0, Math.floor(xToVerse(cam, W, 0)));
  const v1 = Math.min(g.total - 1, Math.ceil(xToVerse(cam, W, Wc)));
  const pad = PLATE_PAD * s;
  let layouts = PLATES.get(g);
  if (!layouts) { layouts = new Map(); PLATES.set(g, layouts); }
  if (layouts.size > 400) layouts.clear();
  ctx.save();
  // the canvas area less the corner buttons' zones
  ctx.beginPath();
  ctx.rect(0, top - 2 * s, Wc, bottom - top + 4 * s);
  for (const z of L.zones) if (z.x0 < Wc) ctx.rect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
  ctx.clip('evenodd');
  // the dividers, at every cell's edge
  ctx.globalAlpha = t;
  ctx.fillStyle = css('verseTick');
  const tw = Math.max(1, Math.round(s));
  for (let v = v0; v <= v1 + 1; v++) {
    const x = Math.round(verseToX(cam, W, v));
    if (x >= 0 && x <= Wc) ctx.fillRect(x, top, tw, bottom - top);
  }
  const cells = [];
  for (let v = v0; v <= v1; v++) {
    const x0 = verseToX(cam, W, v), x1 = verseToX(cam, W, v + 1);
    if (x1 - x0 < PLATE_MIN_CSS * s || x1 < 0 || x0 > Wc) continue;
    cells.push({ v, x0, x1 });
  }
  const hold = cells.find((c) => c.x1 - c.x0 >= PLATE_HOLD * Wc && (c.x0 + c.x1) / 2 > 0 && (c.x0 + c.x1) / 2 < Wc) || null;
  for (const c of cells) {
    const r = refOfVerse(g, c.v);
    const body = plateText(g, fs, c.v);
    const isHold = c === hold;
    // the number: "23", or "140:1" where a chapter starts; the held verse names its chapter (a running
    // head over it, or on a phone's short band its reference in place of the number)
    const num = r.verse === 1 ? r.chapter + ':1' : String(r.verse);
    const head = isHold && !compact ? String(r.bookTitle).toUpperCase() + ' ' + r.chapter : '';
    const prefix = isHold && compact ? spaced(r.abbr) + ' ' + r.chapter + ':' + r.verse : num;
    const width = c.x1 - c.x0 - 2 * pad;
    // keyed on the words themselves (s25.6: on their length, a translation whose verse ran to the
    // same length drew the other's lines)
    const key = [c.v, Math.round(width), Math.round(bottom - top), compact ? 1 : 0, head ? 1 : 0, prefix, body].join('|');
    let lay = layouts.get(key);
    if (!lay) {
      const words = body ? body.split(' ') : [];
      const headH = head ? fontPx(type.head, s) * 1.7 : 0;
      for (let size = type.max; size >= type.min; size--) {
        const font = canvasFont(size, s), numFont = canvasFont(size, s, 600);
        const lh = fontPx(size, s) * PLATE_LEAD;
        const rows = Math.max(1, Math.floor((bottom - top - headH) / lh));
        const indent = measure.width(ctx, numFont, prefix) + fontPx(size, s) * 0.45;
        const lines = wrapWords(ctx, font, words, width, indent, rows, size === type.min);
        if (lines) { lay = { size, font, numFont, lh, indent, lines, headH }; break; }
      }
      layouts.set(key, lay);
    }
    if (!lay) continue;
    ctx.globalAlpha = t * (hold && !isHold ? 0.5 : 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const lx = c.x0 + pad;
    let y = top;
    if (head) {
      const hf = canvasFont(type.head, s, 500);
      setFont(ctx, hf, 0.12 * fontPx(type.head, s));
      ctx.fillStyle = css('centreNumeral');
      ctx.fillText(head, Math.max(lx, L.gutter), y + fontPx(type.head, s) * CAP + 2 * s);
      setFont(ctx, hf, 0);
      y += lay.headH;
    }
    const capY = fontPx(lay.size, s) * 0.95;
    setFont(ctx, lay.numFont, 0);
    ctx.fillStyle = css('centreNumeral');
    ctx.fillText(prefix, lx, y + capY);
    setFont(ctx, lay.font, 0);
    ctx.fillStyle = css('textBody', 0.92);
    for (let k = 0; k < lay.lines.length; k++) {
      ctx.fillText(lay.lines[k], lx + (k === 0 ? lay.indent : 0), y + capY + k * lay.lh);
    }
  }
  ctx.restore();
  // the plates' ground is the verses': nothing else is written on it
  grid.add({ x0: 0, x1: Wc, y0: top, y1: bottom });
}

/** The comb's slots for one foot's tag, `w` long: up its leg from COMB_H0 in tiers, each a rotated
 *  box along the leg's chord over the tag's height ({x0..y1}: its bounds; ax, ay, ang: how it is drawn). */
function combSlots(f, side, w, thick, L) {
  const { s, Wc, base, camY } = L;
  const yb = base + camY;
  const R = (f.x1 - f.x0) / 2, cx = (f.x0 + f.x1) / 2, A = f.A;
  const legX = (h) => {
    const u = Math.sqrt(Math.max(0, 1 - (h / A) * (h / A)));
    return side ? cx + R * u : cx - R * u;
  };
  const out = [];
  for (let k = 0; k < COMB_TIERS; k++) {
    const h = COMB_H0 * s + k * (w + 14 * s);
    if (!(h + w < A * 0.97)) break;
    const xa = legX(h), xb = legX(h + w);
    let dx = xb - xa, dy = -w;
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    // a leg leaning past about 25 degrees over the tag is a dome's shoulder, not a leg: no tag along it
    if (Math.abs(dx) > 0.42) break;
    const nx = -dy, ny = dx;    // the leg's right-hand normal on screen: the side the glyphs stand on
    const ax = xa + nx * COMB_GAP * s, ay = yb - h + ny * COMB_GAP * s;
    const xs = [ax, ax + dx * w, ax + nx * thick, ax + dx * w + nx * thick];
    const ys = [ay, ay + dy * w, ay + ny * thick, ay + dy * w + ny * thick];
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), ax, ay, ang: Math.atan2(dy, dx) };
    out.push(box.x0 < 2 * s || box.x1 > Wc - 2 * s || box.y0 < L.skyTop || box.y1 > yb ? null : box);
  }
  return out;
}

/**
 * THE COMB (the verse zoom): every foot on the frame gets a dot in its thread's colour, and its far
 * end written along its leg. Ranked as the chips are (the centre chapter's threads, then votes),
 * remembered frame to frame; a tag is a tap target for its thread. Returns the memory.
 */
function drawComb(ctx, g, L, fs, feed, grid, memo, labelled, hits, alpha) {
  const { s, Wc, base, camY, sz } = L;
  const yb = base + camY;
  const font = canvasFont(sz.leg, s), fpx = fontPx(sz.leg, s);
  const thick = fpx * 1.05;
  const centre = fs.centre;
  const cands = [];
  ctx.save();
  // the feet's dots first, under every tag
  ctx.globalAlpha = alpha;
  for (const f of feed) {
    const rgb = distanceRampRGB(spanT(g.to[f.i] - g.from[f.i], g.total));
    for (const side of [0, 1]) {
      if (!(side ? f.toOn : f.fromOn)) continue;
      const fx = side ? f.x1 : f.x0;
      if (fx < 0 || fx > Wc) continue;
      ctx.fillStyle = 'rgb(' + rgb.join(',') + ')';
      ctx.beginPath(); ctx.arc(fx, yb, FOOT_DOT * s, 0, Math.PI * 2); ctx.fill();
      const near = side ? g.to[f.i] : g.from[f.i], far = side ? g.from[f.i] : g.to[f.i];
      const inCentre = !!centre && near >= centre.x0 && near < centre.x1;
      /** @type {any} */
      const c = { key: f.i * 2 + side, i: f.i, tier: inCentre ? 1 : 2, score: g.votes ? g.votes[f.i] : 0, text: '', slots: null };
      c.slots = () => {
        c.text = shortRef(g, far);
        return combSlots(f, side, measure.width(ctx, font, c.text), thick, L);
      };
      cands.push(c);
    }
  }
  const res = placeRanked(cands, memo,
    (b) => !grid.hits(b, 1.5 * s),
    (b, c) => { grid.add(b); labelled.add(c.i); });
  setFont(ctx, font, 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const fill = css('textBody', 0.88);
  for (const p of res.placed) {
    // a comb tag's box carries its anchor and angle (combSlots)
    const b = /** @type {{ x0:number, y0:number, x1:number, y1:number, ax:number, ay:number, ang:number }} */ (p.box);
    ctx.save();
    ctx.translate(b.ax, b.ay);
    ctx.rotate(b.ang);
    haloText(ctx, p.cand.text, 0, -fpx * 0.08, fill, L);
    ctx.restore();
    // TAP_MIN each way about the tag's centre (s25.2: a line of type plus 4 px a side was some 20 px
    // tall); the core still wins where two targets overlap (hitOverlay)
    const cx = (b.x0 + b.x1) / 2, half = Math.max((b.x1 - b.x0) / 2, (TAP_MIN * s) / 2);
    const cy = (b.y0 + b.y1) / 2, halfY = Math.max((b.y1 - b.y0) / 2 + 4 * s, (TAP_MIN * s) / 2);
    hits.push({ x0: cx - half, x1: cx + half, y0: cy - halfY, y1: cy + halfY, core: { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 },
      hit: { kind: 'thread', index: p.cand.i } });
  }
  ctx.restore();
  return res.memory;
}

/* ── the chosen line ───────────────────────────────────────────────────── */

/** The leg beside which a far end is written: boxes at rising heights h0, h0 + step, ... */
function legBoxes(x0, x1, A, side, w, half, step, h0, L) {
  const { s, Wc, base, camY } = L;
  const R = (x1 - x0) / 2, cx = (x0 + x1) / 2, yb = base + camY;
  /** @type {Array<Box|null>} */
  const out = [];
  const slots = L.compact ? LEG_SLOTS_COMPACT : LEG_SLOTS;
  for (let k = 0; k < slots; k++) {
    const h = h0 + k * step;
    if (!(h < A * 0.97)) break;
    const y = yb - h;
    if (y - half < L.skyTop) break;
    const u = Math.sqrt(Math.max(0, 1 - (h / A) * (h / A)));
    const lx = side ? cx + R * u : cx - R * u;
    if (lx < 0 || lx > Wc) break;
    const box = side
      ? { x0: lx - 5 * s - w, x1: lx - 5 * s, y0: y - half, y1: y + half }
      : { x0: lx + 5 * s, x1: lx + 5 * s + w, y0: y - half, y1: y + half };
    out.push(box.x0 < 2 * s || box.x1 > Wc - 2 * s || box.y1 > base - 2 * s ? null : box);
  }
  return out;
}

/** The point of a body nearest the middle of what the frame holds of it, in the sky (pick.bodyMidpoint's walk). */
function bodyPoint(x0, x1, A, L, margin) {
  const xa = Math.max(0, x0), xb = Math.min(L.Wc, x1);
  if (!(xb > xa)) return null;
  const yb = L.base + L.camY, mid = (xa + xb) / 2;
  for (let k = 0; k <= 16; k++) {
    for (const dir of k === 0 ? [1] : [1, -1]) {
      const x = mid + (dir * (xb - xa) * k) / 32;
      const y = yb - arcHeightAt(x, x0, x1, A);
      if (y >= L.skyTop + margin && y <= L.base - margin) return { x, y };
    }
  }
  return null;
}

function haloText(ctx, text, x, y, fill, L) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3 * L.s;
  ctx.strokeStyle = L.bg;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/**
 * The chosen line and where its feet's references go, before the ruler is
 * painted: the bars and the cited strip leave the ground under them clear
 * (w4: "Isa 7:14" printed through the bars). Each reference stands just under
 * the cited strip (r2-02: under the baseline, above the book names); one under
 * a corner button's zone, or off the frame's foot, is not written. Null when
 * no line is chosen.
 * @returns {null|{a:number, b:number, x0:number, x1:number, on0:boolean, on1:boolean, key:any,
 *   font:string, fpx:number, feet:Array<{text:string, box:Box}>}}
 */
function chosenOf(ctx, g, cam, L, fs) {
  const view = fs.view || {};
  let a = -1, b = -1, fa = 0, fb = 0, key = null;
  if (view.focusProphecy >= 0 && g.prophecy && g.prophecy[view.focusProphecy]) {
    const p = g.prophecy[view.focusProphecy];
    a = Math.min(p.a, p.b); b = Math.max(p.a, p.b); key = 'p' + view.focusProphecy;
  } else if (fs.focusArc >= 0 && fs.focusArc < g.count) {
    const i = fs.focusArc, fan = fansOf(g);
    a = g.from[i]; b = g.to[i]; fa = fan.fanA[i]; fb = fan.fanB[i]; key = i;
  }
  if (key === null) return null;
  const { s, W, Wc, base, camY, sz } = L;
  const x0 = footX(cam, W, a, fa), x1 = footX(cam, W, b, fb);
  // a foot under the open panel is off the frame the reader sees (Q12)
  const on0 = x0 >= 0 && x0 <= Wc, on1 = x1 >= 0 && x1 <= Wc;
  const font = canvasFont(sz.chosen, s, 600), fpx = fontPx(sz.chosen, s);
  const strip = L.deepT < 0.5 ? L.ov.cited : L.dp.cited;
  const y0 = base + camY + (strip.top + strip.h - base) + 2 * s;
  const feet = [];
  for (const [on, x, verse] of /** @type {Array<[boolean, number, number]>} */ ([[on0, x0, a], [on1, x1, b]])) {
    if (!on) continue;
    const text = shortRef(g, verse);
    const w = measure.width(ctx, font, text);
    const lx = Math.min(Math.max(x - w / 2, 2 * s), Wc - 2 * s - w);
    const box = { x0: lx, x1: lx + w, y0, y1: y0 + fpx * CAP };
    if (box.y1 > L.H || L.zones.some((z) => boxesMeet(box, z))) continue;
    feet.push({ text, box });
  }
  return { a, b, x0, x1, on0, on1, key, font, fpx, feet };
}

/** The ground a chosen foot's reference keeps clear: its box and the halo round it. */
const footHoles = (ch, s) => (ch ? ch.feet.map((f) => ({ x0: f.box.x0 - 4 * s, x1: f.box.x1 + 4 * s, y0: f.box.y0 - 3 * s, y1: f.box.y1 + 3 * s })) : []);

/**
 * The chosen line (OpenBible or prophecy): its feet marked on the baseline it
 * stands on (an 8 px gold dot in a 2 px black ring), each foot's reference in
 * gold just under the baseline (chosenOf), an end off the frame written beside
 * its leg (or at the body's middle when neither foot is on the frame). Placed
 * before every other label and over them; only the chrome's zones refuse it.
 * Returns whether a line is chosen.
 */
function drawChosen(ctx, g, cam, L, fs, grid, labelled, ch) {
  if (!ch) return false;
  const view = fs.view || {};
  const { a, b, x0, x1, on0, on1, key, font, fpx } = ch;
  const { s, camY, base } = L;
  const yb = base + camY;
  for (const [on, x] of [[on0, x0], [on1, x1]]) {
    if (!on) continue;
    ctx.fillStyle = css('chosenFootRing');
    ctx.beginPath(); ctx.arc(x, yb, 4 * s + inkWidth('chosenFootRing') * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = css('chosenFoot');
    ctx.beginPath(); ctx.arc(x, yb, 4 * s, 0, Math.PI * 2); ctx.fill();
  }
  setFont(ctx, font, 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const gold = css('chosenLabel');
  let any = false;
  const outOfZones = (box) => !L.zones.some((z) => boxesMeet(box, z));
  for (const f of ch.feet) {
    grid.add(f.box);
    haloText(ctx, f.text, f.box.x0, f.box.y1, gold, L);
    any = true;
  }
  const A = arcShape((x1 - x0) * 0.5, view.squash).A;
  ctx.textBaseline = 'middle';
  if (on0 !== on1) {
    const side = on0 ? 0 : 1;
    const text = side ? '← ' + shortRef(g, a) : shortRef(g, b) + ' →';
    const w = measure.width(ctx, font, text);
    const slots = legBoxes(x0, x1, A, side, w, fpx * 0.55, fpx * 1.4, camY + 24 * s, L);
    const box = slots.find((q) => q && outOfZones(q));
    if (box) { grid.add(box); haloText(ctx, text, box.x0, (box.y0 + box.y1) / 2, gold, L); any = true; }
  } else if (!on0 && !on1) {
    const pt = bodyPoint(x0, x1, A, L, fpx);
    if (pt) {
      const text = shortRef(g, a) + ' · ' + shortRef(g, b);
      const w = measure.width(ctx, font, text);
      const box = { x0: pt.x - w / 2, x1: pt.x + w / 2, y0: pt.y - fpx * 0.55, y1: pt.y + fpx * 0.55 };
      if (outOfZones(box)) { grid.add(box); haloText(ctx, text, box.x0, pt.y, gold, L); any = true; }
    }
  }
  if (any) labelled.add(key);
  return true;
}

/* ── the convergence pills ─────────────────────────────────────────────
   Every thread is drawn (the structure law); what converges is counted
   where it lands. At each in-view foot cell (pick.footBundles: a verse at
   depth, a chapter or a run of narrow chapters otherwise) a "+n" pill under
   the baseline says how many anchored threads have a foot there. Past the
   overview only (localize > 0), only where two or more meet, and only where
   the pill fits its cell (a pill wider than its cell lies). Tapping one
   opens the bundle; the box is recorded both as a pill hit (hitOverlay, the
   navigation stream's route) and, until that route lands, as the old badge
   box the tap path reads. Nothing is dimmed by the lens any more (Q2). */

/** The arc ids a pill counts: the drawn threads with a foot in [lo, hi], anchored at that camera. */
function pillIds(g, cam, width, density, lo, hi) {
  const { fanA, fanB } = fansOf(g);
  const out = [];
  for (const bucket of g.buckets) {
    const end = bucket.off + bucketDrawCount(bucket, density);
    for (let i = bucket.off; i < end; i++) {
      const a = g.from[i], b = g.to[i];
      if (!((a >= lo && a <= hi) || (b >= lo && b <= hi))) continue;
      if (!arcAnchored(footX(cam, width, a, fanA[i]), footX(cam, width, b, fanB[i]), width)) continue;
      out.push(i);
    }
  }
  return Int32Array.from(out);
}

/** What the panel's group mode is titled for a cell: "Isaiah 53:5", "Isaiah 53", "Isaiah 52-54". */
function cellLabel(g, cell) {
  if (cell.verse) return refOfVerse(g, cell.lo).label;
  const a = g.chapters[cell.chapterLo], b = g.chapters[cell.chapterHi];
  const ta = g.books[a[0]].title, tb = g.books[b[0]].title;
  if (cell.chapterLo === cell.chapterHi) return ta + ' ' + a[1];
  return a[0] === b[0] ? ta + ' ' + a[1] + '-' + b[1] : ta + ' ' + a[1] + ' - ' + tb + ' ' + b[1];
}

function drawPills(ctx, g, cam, L, fs, grid, hits, badges) {
  const bundles = fs.bundles;
  if (!g.count || !bundles || !bundles.cells || !(fs.view.localize > 0) || !(L.deepT > 0.01)) return;
  const { s, W, Wc, dp, camY } = L;
  if (camY > 2 * s) return;
  const font = canvasFont(L.sz.pill, s, 600);
  const h = dp.pills.h, y0 = dp.pills.top + camY, y1 = y0 + h;
  const snap = { x: cam.x, ppv: cam.ppv, total: cam.total, y: cam.y };
  const density = fs.density;
  setFont(ctx, font, 0);
  ctx.save();
  ctx.globalAlpha = L.deepT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const cell of bundles.cells) {
    const n = cell.drawn + (cell.hidden || 0);
    if (!(n > 1)) continue;
    const cx = ((cell.lo + cell.hi + 1) / 2 - cam.x) * cam.ppv + W / 2;
    const wCell = (cell.hi - cell.lo + 1) * cam.ppv;
    const text = '+' + fmtCount(n);
    const w = Math.max(h, measure.width(ctx, font, text) + 16 * s);
    if (w > wCell + 2 * s) continue;
    const box = { x0: cx - w / 2, x1: cx + w / 2, y0, y1 };
    if (box.x0 < 2 * s || box.x1 > Wc - 2 * s || grid.hits(box, 3 * s)) continue;
    grid.add(box);
    roundRectPath(ctx, box, h / 2);
    ctx.fillStyle = css('pillFill');
    ctx.fill();
    ctx.lineWidth = inkWidth('pillBorder') * s;
    ctx.strokeStyle = css('pillBorder');
    ctx.stroke();
    ctx.fillStyle = css('pillText');
    ctx.fillText(text, cx, (y0 + y1) / 2 + 0.05 * h);
    badges.push(Object.assign({ x0: box.x0, x1: box.x1, y0: box.y0, y1: box.y1 }, { cell }));
    const lo = cell.lo, hi = cell.hi;
    // the cell whose fan is up (exits): the pill wears the lit ink's ring
    const ask = fs.ask;
    if (ask && ask.cell && ask.cell.lo === lo && ask.cell.hi === hi) {
      roundRectPath(ctx, box, h / 2);
      ctx.lineWidth = 1.5 * s;
      ctx.strokeStyle = css('lit');
      ctx.stroke();
    }
    // counted on the first read only (a tap), and then kept: the walk visits every thread
    /** @type {Int32Array|null} */
    let ids = null;
    /** @type {any} */
    const hit = {
      kind: 'pill', label: cellLabel(g, cell), cell: { lo, hi },
      get ids() { return ids || (ids = pillIds(g, snap, W, density, lo, hi)); },
    };
    hits.push(tapTarget(box, box, hit, L));
  }
  ctx.restore();
}

/* ── a column's fan (exits.js) ─────────────────────────────────────────
   The curtain, read. Deep in, the frame is mostly legs, threads with one
   foot here and the other in another book; the structure law keeps every
   one whole, so the overlay says where they go. A "+n" pill's cell asked
   for (the pill hovered, or its group card open) raises its column's fan:
   the legs standing there by the book (or run of books) of their far foot,
   with how many, in two stacks beside the column, left-going on the left
   and right-going on the right, the nearest destination lowest (altitude IS
   span), each chip's swatch the distance ramp's colour of its legs' spans
   (C7: colour is distance). Hovering a chip lights its legs, a tap lists
   them in the panel's exits mode; neither dims anything (the lit ink over
   the web, the top pass). */

/** A fan's chips, CSS px: their height, and the gap between them. */
const EXIT_H = 22, EXIT_H_COMPACT = 20, EXIT_GAP = 6;
/** A column's fan holds at most this many chips a side (runs of books fold the rest in). */
export const FAN_MOST = 5, FAN_MOST_COMPACT = 4;

/**
 * A chip's tap target: the chip grown to TAP_MIN each way about its centre, kept on the canvas area
 * and above the baseline (the fan stands in the sky: tapTarget's slide into the ruler band is not
 * its). Device px.
 * @param {Box} core @param {OverlayHit} hit @param {any} L @returns {OverlayBox}
 */
function chipTarget(core, hit, L) {
  const m = TAP_MIN * L.s;
  /** @returns {[number, number]} */
  const grow = (a, b, lo, hi) => {
    if (b - a < m) { const c = (a + b) / 2; a = c - m / 2; b = c + m / 2; }
    return [Math.max(lo, a), Math.min(hi, b)];
  };
  const [x0, x1] = grow(core.x0, core.x1, 0, L.Wc);
  const [y0, y1] = grow(core.y0, core.y1, 0, L.base);
  return { x0, y0, x1, y1, core: { x0: core.x0, x1: core.x1, y0: core.y0, y1: core.y1 }, hit };
}

/** A chip's pieces: its width and its words' widths, device px. */
function exitChip(ctx, grp, L, f) {
  const s = L.s;
  const arrow = grp.side === 'left' ? '‹' : '›';
  const count = fmtCount(grp.count);
  const wa = measure.width(ctx, f.name, arrow), wn = measure.width(ctx, f.name, grp.name), wc = measure.width(ctx, f.count, count);
  const pad = 8 * s, g1 = 4 * s, sw = 2 * s, g2 = 5 * s;
  return { w: pad + wa + g1 + sw + g2 + wn + g1 + wc + pad, arrow, count, wa, wn, wc, pad, g1, sw, g2 };
}

/**
 * One chip: the pill's ground and border (the lit ink's when it is the one asked for), the arrow
 * on its side, the swatch, the name and the count. Returns its box, device px.
 */
function paintExitChip(ctx, grp, chip, x0, y0, h, L, f, asked) {
  const s = L.s;
  const box = { x0, x1: x0 + chip.w, y0, y1: y0 + h };
  roundRectPath(ctx, box, h / 2);
  ctx.fillStyle = css('pillFill');
  ctx.fill();
  ctx.lineWidth = (asked ? 1.5 : inkWidth('pillBorder')) * s;
  ctx.strokeStyle = asked ? css('lit') : css('pillBorder');
  ctx.stroke();
  const cy = y0 + h / 2 + 0.05 * h;
  const rgb = distanceRampRGB(grp.t).join(',');
  const swatch = (x) => {
    ctx.fillStyle = 'rgba(' + rgb + ',0.95)';
    ctx.fillRect(x, y0 + h * 0.24, chip.sw, h * 0.52);
  };
  const nameInk = css(asked ? 'chipText' : 'pillText');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let x = x0 + chip.pad;
  setFont(ctx, f.name, 0);
  if (grp.side === 'left') {
    ctx.fillStyle = css('pillText'); ctx.fillText(chip.arrow, x, cy); x += chip.wa + chip.g1;
    swatch(x); x += chip.sw + chip.g2;
    ctx.fillStyle = nameInk; ctx.fillText(grp.name, x, cy); x += chip.wn + chip.g1;
    setFont(ctx, f.count, 0);
    ctx.fillStyle = css('textMuted'); ctx.fillText(chip.count, x, cy);
  } else {
    ctx.fillStyle = nameInk; ctx.fillText(grp.name, x, cy); x += chip.wn + chip.g1;
    setFont(ctx, f.count, 0);
    ctx.fillStyle = css('textMuted'); ctx.fillText(chip.count, x, cy); x += chip.wc + chip.g2;
    swatch(x); x += chip.sw + chip.g1;
    setFont(ctx, f.name, 0);
    ctx.fillStyle = css('pillText'); ctx.fillText(chip.arrow, x, cy);
  }
  return box;
}

/** The view numbers a chip's lazy ids re-ask the frame's visible set with (frame-set.frameSet). */
const viewSnap = (view) => ({ density: view.density, width: view.width, base: view.base, squash: view.squash, dpr: view.dpr });

/** A chip as the walk reads it (data-exit-fan), CSS px. */
const chipRecord = (grp, box, s, extra) => Object.assign({
  side: grp.side, label: grp.name, count: grp.count, lo: grp.lo, hi: grp.hi, books: grp.books, kind: grp.kind, t: Math.round(grp.t * 1000) / 1000,
  x0: Math.round(box.x0 / s), y0: Math.round(box.y0 / s), x1: Math.round(box.x1 / s), y1: Math.round(box.y1 / s),
}, extra || null);

/**
 * A column's fan (see above): for the cell asked for (fs.ask.cell, a "+n" pill's), its legs by
 * destination in two stacks beside the column, left-going on the left and right-going on the right,
 * nearest lowest; each chip a tap target of its own (the legs from the cell to those books), and the
 * ground under the stacks (`zone`) where a resting pointer keeps the fan up. Null when no cell is
 * asked, the deep band has not begun (deepT < 0.5), the cell is off the canvas area or none of its
 * threads leaves the frame. The census runs only here, so with no fan up nothing counts.
 * @returns {null | { chips: any[], zone: Box }}
 */
function drawFan(ctx, g, cam, L, fs, grid, hits) {
  const ask = fs.ask;
  if (!ask || !ask.cell || !g.count || !(L.deepT >= 0.5) || !fs.view || !(fs.view.width > 0)) return null;
  const s = L.s, cell = ask.cell;
  const cx = ((cell.lo + cell.hi + 1) / 2 - cam.x) * cam.ppv + L.W / 2;
  if (!(cx >= 0 && cx <= L.Wc)) return null;
  const set = frameSet(g, cam, fs.view);
  const census = exitCensus(g, set, L.Wc, cell);
  if (!census.legs) return null;
  const fan = fanGroups(g, census, L.compact ? FAN_MOST_COMPACT : FAN_MOST);
  const size = L.compact ? 12 : 13;
  const f = { name: canvasFont(size, s, 600), count: canvasFont(size, s, 400) };
  const h = (L.compact ? EXIT_H_COMPACT : EXIT_H) * s, step = h + EXIT_GAP * s;
  // the lowest chip stands over the feet's chips (drawChips: just over the baseline)
  const yb = L.base + L.camY - (L.compact ? 30 : 36) * s;
  const snap = { x: cam.x, y: cam.y, ppv: cam.ppv, total: cam.total };
  const vs = viewSnap(fs.view), Wc = L.Wc;
  // a fan's lines stand on its column: they come from the cell, not from the whole frame
  const area = { label: areaLabel(g, cell.lo, cell.hi), lo: cell.lo, hi: cell.hi };
  const out = [];
  let zx0 = cx - 12 * s, zx1 = cx + 12 * s, zy0 = yb;
  // the stacks' chips that stand in the sky, and the two stacks moved as one block to keep the
  // gutters at the frame's edges: a column near an edge keeps its fan beside it, and one stack
  // never slides over the other
  const stacks = [fan.left, fan.right].map((list) => list.map((grp, k) => ({ grp, k, chip: exitChip(ctx, grp, L, f) }))
    .filter((c) => yb - c.k * step - h >= L.skyTop));
  const wl = Math.max(0, ...stacks[0].map((c) => c.chip.w)), wr = Math.max(0, ...stacks[1].map((c) => c.chip.w));
  const reachL = cx - 8 * s - wl, reachR = cx + 8 * s + wr;
  const dx = reachL < L.gutter ? L.gutter - reachL : reachR > L.Wc - L.gutter ? L.Wc - L.gutter - reachR : 0;
  ctx.save();
  for (const list of stacks) {
    list.forEach(({ grp, k, chip }) => {
      const y1 = yb - k * step, y0 = y1 - h;
      const x0 = grp.side === 'left' ? cx + dx - 8 * s - chip.w : cx + dx + 8 * s;
      const asked = !!ask.books && ask.side === grp.side && ask.books[0] <= grp.hi && ask.books[1] >= grp.lo;
      const box = paintExitChip(ctx, grp, chip, x0, y0, h, L, f, asked);
      grid.add({ x0: box.x0 - 3 * s, x1: box.x1 + 3 * s, y0: box.y0 - 3 * s, y1: box.y1 + 3 * s });
      zx0 = Math.min(zx0, box.x0); zx1 = Math.max(zx1, box.x1); zy0 = Math.min(zy0, box.y0);
      /** @type {Int32Array|null} */
      let ids = null;
      /** @type {any} */
      const hit = {
        kind: 'exit', key: 'c' + cell.lo + '-' + cell.hi + ':' + grp.side[0] + ':' + grp.lo + '-' + grp.hi, side: grp.side,
        lo: grp.lo, hi: grp.hi, label: grp.title, count: grp.count, cell: { lo: cell.lo, hi: cell.hi }, area,
        get ids() { return ids || (ids = exitIds(g, frameSet(g, snap, vs), Wc, grp.side, grp.lo, grp.hi, cell)); },
      };
      hits.push(chipTarget(box, hit, L));
      out.push(chipRecord(grp, box, s, asked ? { asked: true } : null));
    });
  }
  ctx.restore();
  // the fan's ground, from its top chip down past the pills, device px: no tap of its own, a
  // resting pointer there keeps the fan up on its way from the pill to the chips (fanAt)
  const zone = { x0: zx0 - 8 * s, x1: zx1 + 8 * s, y0: zy0 - 8 * s, y1: L.dp.pills.top + L.dp.pills.h + 6 * s };
  return { chips: out, zone };
}

/**
 * Whether a CSS-px point is on the ground of the fan the last frame drew (the hover keeps a
 * hovered pill's fan up there, between the pill and its chips).
 * @param {CanonFrame|null} fs @param {number} xCss @param {number} yCss
 */
export function fanAt(fs, xCss, yCss) {
  const z = fs && fs.fanZone;
  if (!z) return false;
  const dpr = (fs.v && fs.v.DPR) || 1;
  const px = xCss * dpr, py = yCss * dpr;
  return px >= z.x0 && px <= z.x1 && py >= z.y0 && py <= z.y1;
}

/* ── the labels over the baseline ──────────────────────────────────────── */

/**
 * A foot that may carry a chip: key = thread * 2 + side (0 the from-foot, 1 the to-foot);
 * tier 1 in the centre chapter, else 2; score its thread's votes; fx its x, device px.
 * @typedef {{ key:number, i:number, side:number, tier:number, score:number, fx:number, text?:string }} ChipFoot
 */

/** @type {WeakMap<object, Uint8Array>} the feet placed last frame, marked by key (set and cleared per pass) */
const MARKS = new WeakMap();

/**
 * The chips' candidates for one frame: in each `bucketW` of foot x (from
 * x 0), the best `keep` feet on [left, right] by tier, then placed last frame,
 * then votes, then key; and every foot the memory placed last frame, whatever
 * its rank, so its chip can stay where it was (hysteresis). One pass over
 * labelFeed's walk (pick.eachLabelThread) with no sort and nothing made for a
 * foot that cannot win: at 6x the frame holds some 17,000 threads and keeps a
 * few dozen chips, and sorting every bucket made panning 8 ms a frame (w3
 * review). Exported for the tests, which hold it to the sort it replaced.
 * @param {any} g @param {any} cam
 * @param {{width:number, base:number, squash:number, density:any, inset?:number}} view  labelFeed's
 * @param {{ left:number, right:number, bucketW:number, keep:number,
 *   centre?: {x0:number, x1:number}|null, memory?: Map<any, number>|null }} o
 * @returns {ChipFoot[]}
 */
export function chipKeepers(g, cam, view, o) {
  if (!g || !(g.count > 0) || !(o.bucketW > 0) || !(o.keep > 0)) return [];
  const { left, right, bucketW, keep } = o;
  const c0 = o.centre ? o.centre.x0 : 0, c1 = o.centre ? o.centre.x1 : 0;
  let mark = MARKS.get(g);
  if (!mark || mark.length !== 2 * g.count) { mark = new Uint8Array(2 * g.count); MARKS.set(g, mark); }
  const memory = o.memory || null;
  if (memory) for (const k of memory.keys()) if (k >= 0 && k < mark.length) mark[k] = 1;
  const nb = Math.max(1, Math.floor(Math.max(0, right) / bucketW) + 1), size = nb * keep;
  const bKey = new Int32Array(size).fill(-1), bTier = new Uint8Array(size), bWas = new Uint8Array(size);
  const bScore = new Float64Array(size), bFx = new Float64Array(size);
  const votes = g.votes, from = g.from, to = g.to;
  /** @type {ChipFoot[]} */
  const recs = [];
  const take = (key, i, fx, near) => {
    const tier = near >= c0 && near < c1 ? 1 : 2, was = mark[key] ? 0 : 1, score = votes ? votes[i] : 0;
    if (!was) recs.push({ key, i, side: key & 1, tier, score, fx });
    const b0 = Math.floor(fx / bucketW) * keep;
    // > 0: this foot ranks under the one in slot q (an empty slot ranks under everything)
    const under = (q) => bKey[q] >= 0 && ((tier - bTier[q]) || (was - bWas[q]) || (bScore[q] - score) || (key - bKey[q])) > 0;
    if (under(b0 + keep - 1)) return;   // most feet: no better than the bucket's last keeper
    let j = 0;
    while (j < keep && under(b0 + j)) j++;
    for (let q = b0 + keep - 1; q > b0 + j; q--) {
      bKey[q] = bKey[q - 1]; bTier[q] = bTier[q - 1]; bWas[q] = bWas[q - 1]; bScore[q] = bScore[q - 1]; bFx[q] = bFx[q - 1];
    }
    const q = b0 + j;
    bKey[q] = key; bTier[q] = tier; bWas[q] = was; bScore[q] = score; bFx[q] = fx;
  };
  eachLabelThread(g, cam, view, null, (i, x0, x1, _A, fromOn, toOn) => {
    if (fromOn && x0 >= left && x0 <= right) take(i * 2, i, x0, from[i]);
    if (toOn && x1 >= left && x1 <= right) take(i * 2 + 1, i, x1, to[i]);
  });
  if (memory) for (const k of memory.keys()) if (k >= 0 && k < mark.length) mark[k] = 0;
  for (let q = 0; q < size; q++) {
    const key = bKey[q];
    if (key >= 0 && bWas[q]) recs.push({ key, i: key >> 1, side: key & 1, tier: bTier[q], score: bScore[q], fx: bFx[q] });
  }
  return recs;
}

/**
 * The chips at the feet (spec §4.3): "Isa 53:5 · 1 Pet 2:24", the near foot
 * first, 12 px over the baseline, about one per 160 / 120 px. The candidates
 * are chipKeepers' (cached by the camera and the layout); the threads in the
 * centre chapter rank first, then by votes; a chip takes its foot's centre,
 * else steps right or left of it; one per thread. Returns the memory for the
 * next frame.
 */
function drawChips(ctx, g, cam, L, fs, grid, m, labelled, quiet) {
  const memo = m.chips;
  const { s, W, Wc, base, camY, sz, gutter, inset } = L;
  const font = canvasFont(sz.chip, s), fpx = fontPx(sz.chip, s);
  const h = fpx + 8 * s;
  const y1 = base + camY - 12 * s, y0 = y1 - h;
  if (y0 < L.skyTop || y1 > base) return memo;
  const every = sz.every * s;
  const centre = fs.centre || null;
  const view = fs.view;
  // the same camera and layout as last frame keep last frame's keepers: the memory the pass
  // would read is last frame's placement, which was chosen from them, so none of it is lost
  const key = [cam.x, cam.ppv, camY, fs.density, W, Wc, gutter, every, view.base, view.squash, inset,
    centre ? centre.x0 : -1, centre ? centre.x1 : -1, filterSerial(g)].join('|');
  if (!m.chipCache || m.chipCache.key !== key) {
    m.chipCache = {
      key,
      recs: chipKeepers(g, cam, { width: W, base: view.base, squash: view.squash, density: fs.density, inset },
        { left: gutter, right: Wc - gutter, bucketW: every / 4, keep: 3, centre, memory: memo }),
    };
  }
  /** @type {any[]} */
  const cands = m.chipCache.recs.map((r) => {
    /** @type {any} */
    const c = { key: r.key, i: r.i, tier: r.tier, score: r.score, text: '', slots: null };
    c.slots = () => {
      if (!r.text) {
        const near = r.side ? g.to[r.i] : g.from[r.i], far = r.side ? g.from[r.i] : g.to[r.i];
        r.text = shortRef(g, near) + ' · ' + shortRef(g, far);
      }
      c.text = r.text;
      const w = measure.width(ctx, font, c.text) + 20 * s;
      return [r.fx - w / 2, r.fx - 12 * s, r.fx + 12 * s - w].map((x0) => ({ x0, x1: x0 + w, y0, y1 }));
    };
    return c;
  });
  const spacing = createGrid(256 * s);
  const room = (b) => { const cx = (b.x0 + b.x1) / 2; return { x0: cx - every / 2, x1: cx + every / 2, y0, y1 }; };
  const res = placeRanked(cands, memo,
    (b, c) => !labelled.has(c.i) && b.x0 >= 2 * s && b.x1 <= Wc - 2 * s && !grid.hits(b, 6 * s) && !spacing.hits(room(b)),
    (b, c) => { grid.add(b); spacing.add(room(b)); labelled.add(c.i); });
  ctx.save();
  ctx.globalAlpha = L.deepT * quiet;
  setFont(ctx, font, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = inkWidth('chipBorder') * s;
  for (const p of res.placed) {
    roundRectPath(ctx, p.box, 6 * s);
    ctx.fillStyle = css('chipFill');
    ctx.fill();
    ctx.strokeStyle = css('chipBorder');
    ctx.stroke();
    ctx.fillStyle = css('chipText');
    ctx.fillText(p.cand.text, (p.box.x0 + p.box.x1) / 2, (p.box.y0 + p.box.y1) / 2 + 0.06 * fpx);
  }
  ctx.restore();
  return res.memory;
}

/** The leg labels' feed (labelFeed with the fly-overs), kept while the camera and the frame stand still. */
function legFeed(g, cam, L, fs, m) {
  const view = fs.view;
  const key = [cam.x, cam.ppv, L.camY, fs.density, L.W, view.base, view.squash, L.inset, filterSerial(g)].join('|');
  if (!m.feedCache || m.feedCache.key !== key) {
    m.feedCache = {
      key,
      feed: labelFeed(g, cam, { width: L.W, base: view.base, squash: view.squash, density: fs.density, inset: L.inset }, { flyovers: true }),
    };
  }
  return m.feedCache.feed;
}

/**
 * From the verse-numeral zoom, the far end of each thread with one foot on
 * the frame, written level beside its near leg ("Matt 8:17 →" inside the
 * arc of a from-foot, "← Gen 22:2" of a to-foot), at the lowest height where
 * it meets nothing: the legs rise steeply here, so a column of feet carries
 * a column of names. A thread with neither foot on the frame but its body in
 * the sky is named "a · b" at the body's middle, after every leg. Ranked
 * like the chips; the chips' threads are already named.
 */
function drawLegs(ctx, g, L, fs, feed, grid, memo, labelled, quiet) {
  const { s, Wc, camY, sz } = L;
  const font = canvasFont(sz.leg, s), fpx = fontPx(sz.leg, s);
  // the column starts over the chips' band, so a name never waits on a chip for its slot
  const half = fpx * 0.55, step = fpx * 1.4, h0 = camY + (12 + 8 + 6) * s + fontPx(sz.chip, s) + half;
  const centre = fs.centre;
  const cands = [];
  let flies = 0, placedFly = 0;
  for (const f of feed) {
    if (f.fromOn !== f.toOn) {
      const side = f.fromOn ? 0 : 1;
      const fx = side ? f.x1 : f.x0;
      if (fx < 0 || fx > Wc) continue;
      const near = side ? g.to[f.i] : g.from[f.i], far = side ? g.from[f.i] : g.to[f.i];
      const inCentre = !!centre && near >= centre.x0 && near < centre.x1;
      const c = { key: f.i, i: f.i, tier: inCentre ? 1 : 2, score: g.votes ? g.votes[f.i] : 0, text: '', slots: null };
      c.slots = () => {
        c.text = side ? '← ' + shortRef(g, far) : shortRef(g, far) + ' →';
        return legBoxes(f.x0, f.x1, f.A, side, measure.width(ctx, font, c.text), half, step, h0, L);
      };
      cands.push(c);
    } else if (!f.fromOn && camY > 0 && flies < 200) {
      // up in the sky (the feet below the frame) the threads crossing it are named at
      // their bodies; at the baseline the feet carry the names, and the sky stays clear
      flies++;
      const c = { key: f.i, i: f.i, tier: 3, score: g.votes ? g.votes[f.i] : 0, text: '', slots: null };
      c.slots = () => {
        const pt = bodyPoint(f.x0, f.x1, f.A, L, half + 2 * s);
        if (!pt) return [];
        c.text = shortRef(g, g.from[f.i]) + ' · ' + shortRef(g, g.to[f.i]);
        const w = measure.width(ctx, font, c.text);
        return [0, -1.6, 1.6].map((k) => ({ x0: pt.x - w / 2, x1: pt.x + w / 2, y0: pt.y + k * step - half, y1: pt.y + k * step + half }))
          .map((b) => (b.x0 < 2 * s || b.x1 > Wc - 2 * s || b.y0 < L.skyTop || b.y1 > L.base - 2 * s ? null : b));
      };
      cands.push(c);
    }
  }
  const clear = (L.compact ? LEG_CLEAR_COMPACT : LEG_CLEAR) * s;
  const res = placeRanked(cands, memo,
    // a name keeps clear of its neighbours on the row, so two never read as one
    (b, c) => !labelled.has(c.i) && !grid.hits({ x0: b.x0 - clear, x1: b.x1 + clear, y0: b.y0, y1: b.y1 }, 2 * s)
      && (c.tier < 3 || placedFly++ < FLY_LABELS),
    (b, c) => { grid.add(b); labelled.add(c.i); });
  ctx.save();
  ctx.globalAlpha = quiet;
  setFont(ctx, font, 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const fill = css('textBody', 0.85);
  for (const p of res.placed) haloText(ctx, p.cand.text, p.box.x0, (p.box.y0 + p.box.y1) / 2, fill, L);
  ctx.restore();
  return res.memory;
}

/* ── the sky's chrome (landing 9) ──────────────────────────────────────── */

/**
 * The altitude ruler (landing 9): only while the camera is above the
 * baseline. Each mark stands where a thread of that span would crown -
 * y = base + camY - arcShape(span * ppv / 2, squash).A - in the canon
 * ramp's colour for that span, so the height reads in the web's own key: a
 * chapter, a book, a testament, the canon. The marks in view are returned
 * (and published as data-altitude) whether or not there is a 2D context;
 * the labels reserve their boxes so the thread labels keep off them.
 *
 * The named marks are a chapter, a book, a testament and the canon - a
 * factor of 30 apart, so most heights have none in view (at the ceiling
 * a chapter crowns 422 px up; a book 14,000). The frame's middle row
 * therefore always carries a live readout of its own span ("~150
 * verses"), published as data-altitude-span, so the height is never
 * nameless.
 * @returns {number[]} the marks' spans in view, bottom to top
 */
function drawAltitude(ctx, g, cam, view, v, chrome, out) {
  const shown = [];
  const camY = cam.y > 0 ? cam.y : 0;
  if (out) out.span = 0;
  if (!(camY > 0) || !g || !(g.total > 0)) return shown;
  const DPR = v.DPR, base = view.base, top = view.inset > 0 ? view.inset : 0;
  const size = Math.max(12, (chrome && chrome.fsRuler) || 12);
  const fs = fontPx(size, DPR);
  const bg = (chrome && chrome.bg) || '#000000';
  if (ctx) {
    ctx.save();
    setFont(ctx, canvasFont(size, DPR), 0);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineWidth = DPR;
  }
  const marksY = [];
  for (const m of ALTITUDE_MARKS) {
    const y = base + camY - arcShape((m.span * cam.ppv) / 2, view.squash).A;
    if (y < top + fs || y > base - fs) continue;
    shown.push(m.span);
    if (!ctx) continue;
    const rgb = distanceRampRGB(Math.pow(m.span / g.total, 0.40)).join(',');
    const text = m.span.toLocaleString('en-US') + ' · ' + m.name;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.85)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(14 * DPR, y); ctx.stroke();
    const w = ctx.measureText(text).width;
    const box = { x0: 18 * DPR, x1: 18 * DPR + w, y0: y - fs * 0.7, y1: y + fs * 0.7 };
    ctx.lineWidth = 3 * DPR;
    ctx.strokeStyle = bg;
    ctx.strokeText(text, box.x0, y);
    ctx.lineWidth = DPR;
    ctx.fillStyle = 'rgba(' + rgb + ',0.95)';
    ctx.fillText(text, box.x0, y);
    if (view.reserved) view.reserved.push(box);
    marksY.push(y);
  }
  // the live readout at the frame's middle row
  const yMid = (top + base) / 2;
  const span = spanAtHeight(base + camY - yMid, cam.ppv, view.squash);
  if (span >= 1 && out) out.span = Math.round(span);
  if (ctx && span >= 1 && !marksY.some((y) => Math.abs(y - yMid) < fs * 1.6)) {
    const rgb = distanceRampRGB(Math.pow(Math.min(span, g.total) / g.total, 0.40)).join(',');
    const text = '~' + Math.round(span).toLocaleString('en-US') + ' verses';
    ctx.strokeStyle = 'rgba(' + rgb + ',0.6)';
    ctx.beginPath(); ctx.moveTo(0, yMid); ctx.lineTo(8 * DPR, yMid); ctx.stroke();
    const w = ctx.measureText(text).width;
    const box = { x0: 12 * DPR, x1: 12 * DPR + w, y0: yMid - fs * 0.7, y1: yMid + fs * 0.7 };
    ctx.lineWidth = 3 * DPR;
    ctx.strokeStyle = bg;
    ctx.strokeText(text, box.x0, yMid);
    ctx.lineWidth = DPR;
    // in the chrome's ink, the ramp's colour kept for its tick: in that colour it blended into the
    // threads of the same span behind it (w4 device check, d06 / d07 at 30-40x)
    ctx.fillStyle = css('textBody', 0.92);
    ctx.fillText(text, box.x0, yMid);
    if (view.reserved) view.reserved.push(box);
  }
  if (ctx) ctx.restore();
  return shown;
}

/** The elevator's tap zone, CSS px in from the right edge. */
const ELEVATOR_ZONE_CSS = 24;

/**
 * The elevator (landing 9): a thin track down the right edge from the top
 * chrome to the baseline, its thumb at camY / maxCamY - the top is the
 * tallest apex, the bottom the baseline. Drawn only on the canon web once
 * there is a sky to climb (maxCamY > 0: past the overview). Returns the
 * track's tap box (the right ELEVATOR_ZONE_CSS px), the height its top
 * stands for and the thumb's fraction, or null; the tap callback reads it.
 * @returns {{x0:number, x1:number, y0:number, y1:number, maxY:number, at:number}|null}
 */
function drawElevator(ctx, cam, view, v, chrome, yf) {
  if (!yf) return null;
  const maxY = maxCamY(cam, yf);
  if (!(maxY > 0)) return null;
  const DPR = v.DPR, W = v.W, base = view.base, top = view.inset > 0 ? view.inset : 0;
  const y0 = top + 8 * DPR, y1 = base - 8 * DPR;
  if (!(y1 > y0)) return null;
  const camY = cam.y > 0 ? cam.y : 0;
  const at = Math.min(1, camY / maxY);
  const box = { x0: W - ELEVATOR_ZONE_CSS * DPR, x1: W, y0, y1, maxY, at };
  if (view.reserved) view.reserved.push({ x0: box.x0, x1: box.x1, y0, y1 });
  if (!ctx) return box;
  const x = W - 10 * DPR;
  ctx.save();
  ctx.lineWidth = 1.5 * DPR;
  ctx.strokeStyle = css('textBody', 0.28);
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  // the altitude marks on the track, in the ramp's colour: where a chapter,
  // a book, a testament and the canon crown, so the reader knows how far
  // up each lies before going there (g.total for the ramp's scale)
  if (view.total > 0) {
    for (const m of ALTITUDE_MARKS) {
      const f = arcShape((m.span * cam.ppv) / 2, view.squash).A / maxY;
      if (!(f > 0.005) || f > 1) continue;
      const my = y1 - f * (y1 - y0);
      ctx.strokeStyle = 'rgba(' + distanceRampRGB(Math.pow(m.span / view.total, 0.40)).join(',') + ',0.9)';
      ctx.beginPath(); ctx.moveTo(x - 5 * DPR, my); ctx.lineTo(x + 5 * DPR, my); ctx.stroke();
    }
  }
  // the thumb: a short rounded bar, gold once the reader has left the baseline
  const th = 18 * DPR, tw = 6 * DPR, cy = y1 - at * (y1 - y0);
  const ty0 = Math.max(y0, Math.min(y1 - th, cy - th / 2)), r = tw / 2;
  ctx.beginPath();
  ctx.moveTo(x - r, ty0 + r); ctx.arc(x, ty0 + r, r, Math.PI, 0);
  ctx.lineTo(x + r, ty0 + th - r); ctx.arc(x, ty0 + th - r, r, 0, Math.PI); ctx.closePath();
  ctx.fillStyle = camY > 0 ? css('gold', 0.95) : css('textBody', 0.6);
  ctx.fill();
  ctx.restore();
  return box;
}

/**
 * r2: what the rails show, published for the browser walk (data-rails on the
 * root): every visible Volumes band and every visible Bible book with its
 * on-screen span in CSS px, and where the two rails sit. A walk that zooms
 * the top rail to Rebuke and the bottom to Isaiah reads this to know the
 * zoom took before it reads a pixel. Written to the screen's own root (bug
 * #5: a document query found the first .sw-root mounted, not this one).
 * @param {any} ro @param {any} p @param {any} g @param {any} cam @param {any} camV
 * @param {{W:number, H:number, DPR:number}} v
 * @param {HTMLElement|null} [root]  the screen's .sw-root (useWebRenderer's wrapRef)
 */
export function publishRails(ro, p, g, cam, camV, v, root) {
  const el = ro && ro.width && root && typeof root.setAttribute === 'function' ? root : null;
  if (!el || !g) return;
  const rails = railFrame({ H: v.H, DPR: v.DPR, inset: ro.inset }, ro.base);   // as drawn (fix-review #7)
  const top = [];
  if (p && p.votRail && p.votRail.segments) {
    for (const seg of p.votRail.segments) {
      if (!seg.count) continue;
      const span = segmentSpan(seg, ro);
      if (span) top.push({ label: (seg.short || seg.label), x0: +(span.x0 / v.DPR).toFixed(1), x1: +(span.x1 / v.DPR).toFixed(1) });
    }
  }
  const bottom = [];
  const span = bookSpans(g);
  for (let bi = 0; bi < span.length; bi++) {
    if (!span[bi]) continue;
    const x0 = verseToX(cam, v.W, span[bi][0]), x1 = verseToX(cam, v.W, span[bi][1]);
    if (x1 < 0 || x0 > v.W) continue;
    bottom.push({ label: g.books[bi].title, x0: +(x0 / v.DPR).toFixed(1), x1: +(x1 / v.DPR).toFixed(1) });
  }
  el.setAttribute('data-rails', JSON.stringify({
    topY: +(rails.topY / v.DPR).toFixed(1), bottomY: +(rails.bottomY / v.DPR).toFixed(1),
    top, bottom, camV: camV ? { x: camV.x, ppv: camV.ppv, total: camV.total } : null, cam: { x: cam.x, ppv: cam.ppv, total: cam.total },
  }));
  el.style.setProperty('--sw-rail-top', (rails.topY / v.DPR).toFixed(0) + 'px');
  el.style.setProperty('--sw-rail-bottom', (rails.bottomY / v.DPR).toFixed(0) + 'px');
}

/**
 * The scripture rail under the personal web, read as the canon overview
 * reads it: the same names, the same law, the same face, on ONE row as the
 * canon's (w4 integration: r2-05 names the Bible on one; its second row, 48 px
 * under the baseline, cascaded JOSH, 2SAM, DAN, MARK), at My Web's own depth
 * (36 px under its baseline), within the canvas area
 * as the canon's are: the frame less the docked panel (w4 review: "REV" was
 * cut by the panel's edge).
 * @param {any} ctx @param {any} g @param {any} cam @param {any} view
 * @param {{W:number, H:number, DPR:number}} v
 * @param {{right:number, bottom:number}|null} [pi]  the docked panel's inset, CSS px
 */
function drawRulerOnly(ctx, g, cam, view, v, pi) {
  if (!g || !g.chapters || !g.chapters.length) return;
  const s = v.DPR || 1;
  const right = pi && pi.right > 0 ? pi.right * s : 0;
  const Wc = Math.max(0, v.W - right);
  const zones = chromeBoxes(ctx, v, pi).zones.slice();
  if (right > 0) zones.push({ x0: Wc, x1: v.W, y0: 0, y1: v.H });
  const L = { s, W: v.W, Wc, zones };
  const capH = fontPx(12, s) * CAP;
  const rows = [{ top: view.base + 36 * s, h: capH }];
  drawBookLabels(ctx, g, cam, L, rows, 12, null, 'rail');
}

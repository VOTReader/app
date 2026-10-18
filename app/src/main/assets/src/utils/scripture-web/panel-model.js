/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/panel-model — what the docked panel lists. Cluster F (bundle-d)
   ═══════════════════════════════════════════════════════════════════════

   The panel's modes (connection, verse, group, letter; spec 4.6) as plain
   data, so the lists are pinned without a mount: a verse's full text in the
   reader's translation, the Volumes' citations of it (excerpt and the
   endpoint that opens the letter at the citing paragraph), and its other
   threads grouped by the book they go to, strongest first.

   EVERYTHING HERE IS READ AT RENDER, never frozen into the described hit:
   the panel opened before the Bible or the Volumes bundle landed fills in
   when they do (digest B5, item 14), because the panel asks again on every
   render and re-renders when a corpus lands (web-panel.jsx). The words
   (plurals, the meta line) come from describe.js.

   Free globals (resolveVerseText, translateVerse) are resolved at call
   time, the free-global pattern the rest of bundle-d uses.
   ═══════════════════════════════════════════════════════════════════════ */

import { refOfVerse, arcsTouching, countTouching, chapterRange } from './pick.js';
import { clampCamera, fitPPV, verseToX, xToVerse } from './geometry.js';
import { citationsForVerse, letterCiteSites, endpointFor } from './vot-citations.js';
import { verseEndpoint } from './describe.js';

/** A group shows this many rows before "Show n more" (a verse can hold hundreds of threads). */
export const GROUP_ROWS = 40;

/**
 * One verse's text in the reader's translation, or '' until the Bible corpus has landed (the
 * panel re-renders when it does). The NKJV base comes from the app's resolver; translateVerse
 * swaps in the chosen edition when it is loaded and falls back to that base when it is not.
 * @param {{ bookId: string, chapter: number, verse: number }} ref
 * @param {string} [translation]  settings.translation ('nkjv' when absent)
 * @returns {string}
 */
export function verseText(ref, translation) {
  if (!ref || typeof resolveVerseText !== 'function') return '';
  let base = '';
  try {
    base = resolveVerseText({ type: 'bible', bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse }) || '';
  } catch (_e) { return ''; }
  if (!base || !translation || translation === 'nkjv' || typeof translateVerse !== 'function') return base;
  try {
    return translateVerse(ref.bookId, ref.chapter, { n: ref.verse, text: base }, translation) || base;
  } catch (_e) { return base; }
}

/**
 * A short reference for a crumb or a tag: "Isa 7:14" (the book's abbreviation).
 * @param {any} g @param {number} verse
 */
export function shortRef(g, verse) {
  const r = refOfVerse(g, verse);
  return (r.abbr || r.bookTitle) + ' ' + r.chapter + ':' + r.verse;
}

/**
 * A cited passage's label: "John 3:16", "John 3:16-18", "John 3:36-4:2" (ASCII hyphen, always:
 * Permanent Rule 1).
 * @param {any} g @param {number} v @param {number} [ve]
 */
export function passageLabel(g, v, ve) {
  const a = refOfVerse(g, v);
  if (!(ve > v)) return a.label;
  const b = refOfVerse(g, ve);
  if (b.bookId !== a.bookId) return a.label + '-' + b.label;
  return a.label + '-' + (b.chapter === a.chapter ? String(b.verse) : b.chapter + ':' + b.verse);
}

/**
 * The Volumes' citations of these verses, the first verse's first, one per (letter, paragraph)
 * and one per (letter, excerpt):
 * each with the passage it cites, the excerpt read from the corpus NOW ('' before it lands) and
 * the endpoint that opens the letter at the citing paragraph (vot-citations endpointFor).
 * @param {any} g
 * @param {number[]} verses  graph verse ids
 * @param {any} corpus  vot-citations' CitationCorpus (windowCorpus(window))
 */
export function citedRows(g, verses, corpus) {
  const seen = new Set();
  const out = [];
  for (const v of verses) {
    if (!(v >= 0)) continue;
    for (const c of citationsForVerse(g, v, corpus)) {
      const key = c.letterKey + '#' + c.paragraph + (c.sub ? ':' + c.sub.join(':') : '');
      // one entry per place, and one per letter for the same words: a Bible Study quotes the
      // verse in each of its sections' scripture blocks, and the panel would show it twice
      const words = c.excerpt ? c.letterKey + '|' + c.excerpt : '';
      if (seen.has(key) || (words && seen.has(words))) continue;
      seen.add(key);
      if (words) seen.add(words);
      out.push(Object.assign({}, c, { key, cites: passageLabel(g, c.verse, c.verseEnd), endpoint: endpointFor(c) }));
    }
  }
  return out;
}

/**
 * @typedef {{ index: number, here: ReturnType<typeof refOfVerse>, hereVerse: number,
 *   other: ReturnType<typeof refOfVerse>, otherVerse: number, votes: number }} ThreadRow
 * @typedef {{ book: number, title: string, rows: ThreadRow[] }} ThreadGroup
 */

/**
 * The threads touching a verse range at the reader's density, grouped by the book of their OTHER
 * end in canonical order, strongest first inside each group (then in canon order). `skip` leaves one
 * arc out (the chosen connection, listed above). A thread with both ends inside the range is
 * listed from its lower end. The ids are every row's arc, for the lit set.
 * @param {any} g @param {number} lo @param {number} hi  inclusive verse ids
 * @param {any} density  'famous' | 'essential'
 * @param {number} [skip]
 * @returns {{ total: number, groups: ThreadGroup[], ids: number[] }}
 */
export function threadsFrom(g, lo, hi, density, skip = -1) {
  /** @type {Map<number, ThreadRow[]>} */
  const byBook = new Map();
  const ids = [];
  for (const i of arcsTouching(g, lo, hi, density, 0)) {
    if (i === skip) continue;
    const a = g.from[i], b = g.to[i];
    const aIn = a >= lo && a <= hi;
    const here = aIn && (!(b >= lo && b <= hi) || a <= b) ? a : b;
    const other = here === a ? b : a;
    const ref = refOfVerse(g, other);
    const book = g.chapters[ref.chapterIndex][0];
    if (!byBook.has(book)) byBook.set(book, []);
    /** @type {ThreadRow[]} */ (byBook.get(book)).push({ index: i, here: refOfVerse(g, here), hereVerse: here, other: ref, otherVerse: other, votes: g.votes[i] });
    ids.push(i);
  }
  const groups = [...byBook.keys()].sort((x, y) => x - y).map((book) => {
    const rows = /** @type {ThreadRow[]} */ (byBook.get(book));
    rows.sort((x, y) => y.votes - x.votes || x.otherVerse - y.otherVerse);
    return { book, title: g.books[book].title, rows };
  });
  return { total: ids.length, groups, ids };
}

/**
 * The chooser's rows (a tap that landed between several threads, a "+n" pill): each arc with its
 * two ends in canon order, strongest first (A5: "sort rows by strength and say which").
 * @param {any} g @param {ArrayLike<number>} ids
 */
export function chooserRows(g, ids) {
  const rows = [];
  for (const i of Array.from(ids || [])) {
    if (!(i >= 0 && i < g.count)) continue;
    const lo = Math.min(g.from[i], g.to[i]), hi = Math.max(g.from[i], g.to[i]);
    rows.push({ index: i, a: refOfVerse(g, lo), b: refOfVerse(g, hi), votes: g.votes[i], span: hi - lo });
  }
  return rows.sort((x, y) => y.votes - x.votes || x.span - y.span || x.index - y.index);
}

/**
 * The chapter a group's "Zoom to <chapter>" row flies to: the chapter most of its threads' feet
 * stand in (the lower verse's chapter on a tie), or -1 with no threads.
 * @param {any} g @param {ArrayLike<number>} ids
 */
export function zoomChapterOf(g, ids) {
  /** @type {Map<number, number>} */
  const count = new Map();
  let best = -1, bestN = 0;
  for (const i of Array.from(ids || [])) {
    if (!(i >= 0 && i < g.count)) continue;
    for (const v of [g.from[i], g.to[i]]) {
      const ci = g.chapterOfVerse[v];
      const n = (count.get(ci) || 0) + 1;
      count.set(ci, n);
      if (n > bestN || (n === bestN && ci < best)) { best = ci; bestN = n; }
    }
  }
  return best;
}

/**
 * The chapter under a tap: the one whose verses stand at device x on the baseline, or -1 off the
 * canon (or with no graph). The chooser's "Zoom to <chapter>" flies there, where the reader
 * tapped; zoomChapterOf (where most feet stand, the lowest on a tie) is only the fallback when no
 * tap is known (w3 review: a mid-overview tap offered Numbers 5).
 * @param {any} g
 * @param {{ x: number, ppv: number }} cam  ppv in device px a verse
 * @param {number} W  the view's width, device px
 * @param {number} x  the tap, device px
 * @returns {number}
 */
export function chapterAtX(g, cam, W, x) {
  if (!g || !g.chapterOfVerse || !g.chapters || !(g.total > 0) || !cam || !(cam.ppv > 0)) return -1;
  const v = Math.floor(xToVerse(cam, W, x));
  if (!(v >= 0 && v < g.total)) return -1;
  const ci = g.chapterOfVerse[v];
  return ci >= 0 && ci < g.chapters.length ? ci : -1;
}

/** A chapter's name for the zoom row: "Isaiah 7". @param {any} g @param {number} ci */
export function chapterName(g, ci) {
  const ch = g.chapters[ci];
  return ch ? g.books[ch[0]].title + ' ' + ch[1] : '';
}

/**
 * One verse as the panel shows it: its reference, its full text now, and its reader endpoint.
 * @param {any} g @param {number} verse @param {string} [translation]
 */
export function verseBlock(g, verse, translation) {
  const ref = refOfVerse(g, verse);
  return { verse, ref, text: verseText(ref, translation), endpoint: verseEndpoint(ref) };
}

/**
 * Connection mode (spec 4.6): both ends in canon order with their full text, the Volumes'
 * citations of either (the first end's first), and MORE FROM each end, the chosen thread left out.
 * @param {any} g
 * @param {any} info  describe.js's arc (from, to, index, votes, span, prophecy)
 * @param {{ density: any, translation?: string, corpus?: any }} opts
 */
export function connectionModel(g, info, { density, translation, corpus }) {
  const lo = Math.min(info.from, info.to), hi = Math.max(info.from, info.to);
  const ends = [verseBlock(g, lo, translation), verseBlock(g, hi, translation)];
  return {
    ends,
    cited: citedRows(g, [lo, hi], corpus),
    more: ends.map((e) => Object.assign({ ref: e.ref, verse: e.verse }, threadsFrom(g, e.verse, e.verse, density, info.index))),
  };
}

/**
 * Verse mode: the verse in full, its citations, and every thread it carries grouped by book. The
 * ids are its lit set (verse mode lights its threads, CONTRACTS section 6).
 * @param {any} g @param {number} verse
 * @param {{ density: any, translation?: string, corpus?: any }} opts
 */
export function verseModel(g, verse, { density, translation, corpus }) {
  const block = verseBlock(g, verse, translation);
  const threads = threadsFrom(g, verse, verse, density);
  return Object.assign(block, { cited: citedRows(g, [verse], corpus), threads });
}

/**
 * Group mode over a verse range (a chapter, a bundle): its threads grouped by the book they go
 * to, strongest first in each, and the chapter its zoom row flies to.
 * @param {any} g @param {number} lo @param {number} hi @param {any} density
 */
export function rangeModel(g, lo, hi, density) {
  const threads = threadsFrom(g, lo, hi, density);
  return { threads, zoom: g.chapterOfVerse[lo] };
}

/**
 * The verses a letter cites, one row per cited passage in the order it cites them (its first
 * citation of each), each with its text now. A passage is a verse-to-verseEnd pair, the same key
 * describe.js letterOf counts as `passages`, so the list's header and the live region agree.
 * @param {any} g @param {string} letterKey @param {string} [translation]
 */
export function letterRows(g, letterKey, translation) {
  const seen = new Set();
  const rows = [];
  for (const site of letterCiteSites(g, letterKey)) {
    const key = site.verse + '-' + site.verseEnd;
    if (seen.has(key)) continue;
    seen.add(key);
    const ref = refOfVerse(g, site.verse);
    rows.push({ verse: site.verse, verseEnd: site.verseEnd, ref, label: passageLabel(g, site.verse, site.verseEnd),
      text: verseText(ref, translation), endpoint: verseEndpoint(ref), paragraph: site.paragraph });
  }
  return rows;
}

/**
 * How many threads touch a verse at the reader's density (the verse mode meta's count).
 * @param {any} g @param {number} verse @param {any} density
 */
export function connectionsAt(g, verse, density) {
  return countTouching(g, verse, verse, density);
}

/**
 * A chapter's verse range, padded for the zoom row so the chapter fills about 70 % of the canvas
 * area (CONTRACTS section 3: the caller pads).
 * @param {any} g @param {number} ci
 * @returns {{ x0: number, x1: number } | null}
 */
export function chapterFrame(g, ci) {
  if (!g || !g.chapters[ci]) return null;
  const [lo, hi] = chapterRange(g, ci);
  const w = hi + 1 - lo;
  const pad = w * (1 / 0.7 - 1) / 2;
  return { x0: lo - pad, x1: hi + 1 + pad };
}

/**
 * A connection's frame (spec section 3, A3): both feet inside the canvas area with 10 % side
 * margins, so the feet span 80 % of it. Never narrower than MIN_FRAME verses, so a thread between
 * neighbouring verses keeps its chapter's context in view instead of driving the camera to the
 * zoom ceiling.
 * @param {number} from @param {number} to
 */
export function connectionFrame(from, to) {
  const lo = Math.min(from, to), hi = Math.max(from, to) + 1;
  const w = Math.max(hi - lo, MIN_FRAME);
  const mid = (lo + hi) / 2;
  const half = (w / 0.8) / 2;
  return { x0: mid - half, x1: mid + half };
}

/** The narrowest connection frame, in verses (connectionFrame). */
export const MIN_FRAME = 24;

/**
 * Where flyTo leaves the camera for a target (CONTRACTS.md section 3, its pinned maths): the zoom
 * clamped to [fit, fit x cap], the target at the CANVAS AREA's centre, then the camera's own clamp
 * (geometry.js clampCamera), which never lets the view run past either end of the canon. A copy;
 * the camera is not touched.
 * @param {{ x: number, ppv: number, total: number }} cam  ppv in device px a verse
 * @param {number} W  the view's width, device px
 * @param {number} right  what the panel covers on the right, device px
 * @param {{ x0: number, x1: number } | { x: number, zoom?: number }} target  a FlyTarget
 * @param {number} cap  the zoom ceiling, a multiple of fit (web-frame.js maxZoomOf)
 * @returns {{ x: number, ppv: number, total: number, y?: number }}
 */
export function landingOf(cam, W, right, target, cap) {
  const fit = fitPPV(cam, W);
  const areaW = Math.max(1, W - right);
  const t = /** @type {any} */ (target);
  let ppv = cam.ppv, cx = t.x;
  if ('x0' in t && t.x1 > t.x0) { ppv = areaW / (t.x1 - t.x0); cx = (t.x0 + t.x1) / 2; }
  else if (t.zoom > 0) ppv = fit * t.zoom;
  ppv = Math.min(Math.max(ppv, fit), fit * cap);
  return clampCamera({ x: cx + right / (2 * ppv), ppv, total: cam.total, y: 0 }, W, cap);
}

/**
 * A flyTo target that brings canon x into the canvas area (spec section 3) whatever the camera's
 * clamp allows (w3 review, the major finding): centred at the reader's zoom where it can be, as
 * before. Near the canon's end the clamp stops the camera before x reaches the area's centre, so a
 * verse there stayed under the docked panel (John 3:16 at 888 of a 960 px area; Revelation's
 * threads hidden). The zoom then rises to the least at which x sits at the area's centre, or failing
 * that inside its inner 90 %, never past the ceiling; where even the ceiling cannot bring it out
 * (the canon's last few verses), the zoom is left alone, because a dive that ends under the panel
 * gains nothing. The canon's start needs nothing: the clamp holds Genesis at the left edge, in the
 * area. The zoom never falls below the reader's.
 * @param {{ x: number, ppv: number, total: number }} cam
 * @param {number} W @param {number} right  device px, as landingOf
 * @param {number} x  the canon x to bring in (verse v's middle is v + 0.5)
 * @param {number} cap  the zoom ceiling, a multiple of fit
 * @returns {{ x: number, zoom?: number }}
 */
export function centreTarget(cam, W, right, x, cap) {
  const fit = fitPPV(cam, W);
  const top = fit * cap;
  const ppv0 = Math.min(Math.max(cam.ppv, fit), top);
  const areaW = Math.max(1, W - right);
  // where x lands, view px, centred at ppv; it falls as the zoom rises while the clamp holds the
  // camera at the canon's end
  const land = (/** @type {number} */ ppv) => verseToX(landingOf(cam, W, right, { x, zoom: ppv / fit }, cap), W, x);
  if (!(right > 0) || land(ppv0) <= areaW / 2 + 1) return { x };
  for (const goal of [areaW / 2 + 0.25, 0.9 * areaW]) {
    if (land(top) > goal) continue;
    let lo = Math.log(ppv0), hi = Math.log(top);
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (land(Math.exp(mid)) <= goal) hi = mid; else lo = mid;
    }
    return { x, zoom: Math.exp(hi) / fit };
  }
  return { x };
}

/**
 * Whether a connection's frame holds both its feet inside the canvas area once flyTo and the clamp
 * have had their say: a thread wider than the area at fit cannot be framed whole (the zoom stops at
 * fit), nor can one the clamp keeps from being centred.
 * @param {{ x: number, ppv: number, total: number }} cam
 * @param {number} W @param {number} right  device px
 * @param {{ x0: number, x1: number }} frame  connectionFrame's
 * @param {number} from @param {number} to  the thread's verses
 * @param {number} cap
 */
export function frameHolds(cam, W, right, frame, from, to, cap) {
  const c = landingOf(cam, W, right, frame, cap);
  const areaW = Math.max(1, W - right);
  const a = verseToX(c, W, Math.min(from, to) + 0.5), b = verseToX(c, W, Math.max(from, to) + 0.5);
  return a >= 0 && b <= areaW;
}

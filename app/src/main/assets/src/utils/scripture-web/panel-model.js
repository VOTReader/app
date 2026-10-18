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
 * citation of each), each with its text now.
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

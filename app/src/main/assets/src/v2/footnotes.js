/* footnotes.js - a letter's footnotes and Scripture references, as main reads them (mw6, v2-gaps 1-4; pictures 1e, 1f, 1g).

   Footnotes are not a setting (main): every letter that keeps `footnotes` shows its numbers, its list and its sheet, and a
   Format B entry of a footnotes-mode collection (Holy Days, Answers: excerpt-pieces.js formatBFootnotesMode) turns its
   non-trailing {{ref:}}s into numbered Scripture footnotes (format-b-dom-text.js formatBRefScan, main's numbering).
   A verse's words come from the letter's own dictionary, then Words To Live By's, then main's Bible (NKJV), as main's
   sheets read them; "Go to" opens the chapter at the verse once main's Bible can name the book. Read only. */
import { formatBRefScan } from '../utils/format-b-dom-text.js';
import { formatBFootnotesMode } from '../utils/excerpt-pieces.js';
import { _fnTextRedundantWithLink } from '../ui/components/VerseWithNumbers.jsx';

const g = /** @type {any} */ (globalThis);

/**
 * One footnote: main's corpus shape. A note has `text` and maybe `link` ({ collection, letterTitle, excerpt }) and `url`;
 * a Scripture footnote a `ref` and maybe `seeAlso`.
 * @typedef {{ type?: string, text?: string, url?: string, ref?: string,
 *   link?: { collection?: string, letterTitle?: string, excerpt?: string },
 *   seeAlso?: { collection?: string, letterTitle?: string, excerpt?: string, label?: string } }} Footnote
 * @typedef {{ num: string, fn: Footnote }} FootnoteItem
 */

/** True for a Format B entry (paragraphs, no blocks). @param {any} letter */
export function isFormatB(letter) {
  return !!letter && !Array.isArray(letter.blocks) && Array.isArray(letter.paragraphs);
}

/**
 * A Format B entry's reference scan (main's numbering): each paragraph's references, and in a footnotes-mode collection
 * their numbers. Same object for the same entry, so memoised paragraphs keep their props.
 * @param {any} letter @param {string} volKey
 */
export function formatBRefs(letter, volKey) {
  return formatBRefScan(isFormatB(letter) ? letter.paragraphs : [], formatBFootnotesMode(volKey));
}

/** Footnote keys in main's order: numeric where they are numbers ("2" before "10"). @param {Record<string, any>} footnotes */
function orderedKeys(footnotes) {
  return Object.keys(footnotes).sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

/**
 * The letter's footnotes in order: its `footnotes`, or a footnotes-mode entry's numbered references. [] when it has none.
 * @param {any} letter @param {string} volKey @param {ReturnType<typeof formatBRefs> | null} [scan] @returns {FootnoteItem[]}
 */
export function footnoteItems(letter, volKey, scan = null) {
  if (!letter) return [];
  if (isFormatB(letter)) {
    const s = scan || formatBRefs(letter, volKey);
    return s.orderedRefs.map((ref) => ({ num: String(s.refNumMap[ref]), fn: { type: 'scripture', ref } }));
  }
  const all = letter.footnotes && typeof letter.footnotes === 'object' ? letter.footnotes : null;
  return all ? orderedKeys(all).map((num) => ({ num, fn: all[num] || {} })) : [];
}

/** A note's words, unless they only repeat the letter its link opens (main's rule: never the same title twice). @param {Footnote} fn */
export function noteWords(fn) {
  const text = fn && fn.text ? String(fn.text) : '';
  if (!text) return '';
  return fn.link && _fnTextRedundantWithLink(text, fn.link) ? '' : text;
}

/**
 * A reference's verse words: the letter's own dictionary (nkjv / scriptures), Words To Live By's, then main's Bible.
 * @param {string} ref @param {any} [letter] @returns {string | null}
 */
export function verseWords(ref, letter = null) {
  if (!ref) return null;
  const own = letter && ((letter.nkjv && letter.nkjv[ref]) || (letter.scriptures && letter.scriptures[ref]));
  if (own) return own;
  const dict = g.WTLB_SCRIPTURES;
  if (dict && dict[ref]) return dict[ref];
  try {
    return typeof g.lookupVersesFromBooks === 'function' ? g.lookupVersesFromBooks(ref) || null : null;
  } catch (_e) {
    return null;   // the Bible not loaded or a ref it cannot parse: "not available", as main
  }
}

/** The edition a reference's words are in: its tag ("John 14:6 (KJV)"), else NKJV (main's Bible and dictionaries). @param {string} ref */
export function translationOf(ref) {
  const m = /\(([A-Za-z]{2,6})\)\s*$/.exec(String(ref || ''));
  return m ? m[1].toUpperCase() : 'NKJV';
}

/**
 * The places a reference names (main's splitCompoundRef: "Psalm 118:14; Isaiah 12:2" is two), each with its label and
 * parse; [] when none reads as a Bible reference.
 * @param {string} ref @returns {Array<{ ref: string, parsed: any }>}
 */
export function refParts(ref) {
  try {
    const parts = typeof g.splitCompoundRef === 'function' ? g.splitCompoundRef(ref) : [];
    return Array.isArray(parts) ? parts.filter((p) => p && p.parsed) : [];
  } catch (_e) {
    return [];
  }
}

/**
 * What a reference's sheet shows: one passage, or each passage of a compound cite under its own heading (its words from
 * its own lookup, else its share of the dictionary's "A — words | B — words"). `parsed` is null when the passage does not
 * read as a Bible reference (no Go to then).
 * @param {string} ref @param {any} [letter] @returns {Array<{ label: string, text: string | null, parsed: any }>}
 */
export function passages(ref, letter = null) {
  const parts = refParts(ref);
  if (parts.length <= 1) return [{ label: ref, text: verseWords(ref, letter), parsed: parts.length ? parts[0].parsed : null }];
  const whole = verseWords(ref, letter);
  const shares = whole && whole.indexOf(' | ') >= 0 ? whole.split(' | ') : null;
  return parts.map((p, i) => {
    const share = shares && shares[i] ? shares[i].replace(/^[^—]*—\s*/, '') : null;
    return { label: p.ref, text: verseWords(p.ref, letter) || share, parsed: p.parsed };
  });
}

/** The v2 route of a parsed reference's chapter (at its verse), or null until main's Bible can name the book. */
export function chapterRoute(parsed) {
  if (!parsed || typeof g.findBook !== 'function') return null;
  const book = g.findBook(parsed.rawBook);
  if (!book) return null;
  /** @type {{ place: 'bible-chapter', book: string, chapter: number, verse?: number }} */
  const route = { place: 'bible-chapter', book, chapter: Number(parsed.chapter) };
  if (parsed.verse != null) route.verse = Number(parsed.verse);
  return route;
}

/** How long "Go to" waits for main's Bible to load before it gives up (main's GoToRefButton: 40 x 250 ms). */
export const GO_WAIT_MS = 10000;

/**
 * Resolves the chapter route of a parsed reference, loading main's Bible first when it is not there yet (index.html's
 * window.__loadBibleCorpus); null when it still cannot be named.
 * @param {any} parsed @returns {Promise<ReturnType<typeof chapterRoute>>}
 */
export function findChapterRoute(parsed, waitMs = GO_WAIT_MS) {
  const now = chapterRoute(parsed);
  if (now) return Promise.resolve(now);
  const load = g.__loadBibleCorpus;
  const loaded = Promise.resolve(typeof load === 'function' ? load() : null).catch(() => null);
  return loaded.then(() => new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const r = chapterRoute(parsed);
      if (r || Date.now() - start >= waitMs) { resolve(r); return; }
      setTimeout(tick, 250);
    };
    tick();
  }));
}

/**
 * A verse's words in pieces: several verses as { n, text } each (main's splitIntoVerses), one verse as one piece with no
 * number.
 * @param {string} text @param {string} ref @param {(text: string, ref: string) => any} split
 * @returns {Array<{ n: string | null, text: string }>}
 */
export function versePieces(text, ref, split) {
  const clean = (s) => String(s || '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, '');
  let segs = null;
  try { segs = split(text, ref); } catch (_e) { segs = null; }
  if (!Array.isArray(segs) || !segs.length) return [{ n: null, text: clean(text) }];
  return segs.map((s) => ({ n: String(s.vNum), text: clean(s.text) }));
}

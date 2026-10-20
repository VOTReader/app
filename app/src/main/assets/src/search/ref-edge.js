/* ═══════════════════════════════════════════════════════════════════════
   search/ref-edge.js — a reference typed with words (search200 fix1)
   ═══════════════════════════════════════════════════════════════════════
   parseReference reads a reference only when it is the whole query. Typed with
   the words it holds ("john 3 16 for god so loved the world", "the wages of sin
   is death romans 6 23") it was words: its numbers were typed tokens no verse
   holds, its book's name a word the verse never says, and a study printing the
   verse beside its reference outranked the verse (the refwords hunt, 57 of its
   80 cases). edgeReading reads the reference at the query's start or end, the
   longest first: its card leads, and the rest of the query (`text`) is what is
   searched under the card.

   A reading is checked against the index in use (engine.js refFacts): the verse
   it names is a verse there, and no word of the rest is one only the other texts
   use ("psalm 23 with yahushua as my shepherd" asks for a text putting the name
   there, so it stays words). A rest of the words that frame a reference ("bible
   verse", "in the kjv") makes the card alone.
   ═══════════════════════════════════════════════════════════════════════ */

import { parseReference, resolveBookToken } from './ref-parser.js';
import { searchData } from './search-data.js';
import { kjvEncode } from './tokenize.js';

/**
 * What a reading is checked against: the index in use (engine.js refFacts).
 * @typedef {{ hasVerse: (book: string, chapter: number, verse: number) => boolean, bibleHolds: (word: string) => boolean, textsHold: (word: string) => boolean }} RefFacts
 */

/** The longest reference read at an edge, in typed tokens. */
const EDGE_TOKENS = 10;
/** The edition tags typed beside a reference, and the words naming the Bible or a verse: they frame a reference. */
const EDITION_TAGS = new Set(['kjv', 'nkjv', 'niv', 'esv']);
const FRAME_WORDS = new Set(['bible', 'bibles', 'verse', 'verses']);
/* Book abbreviations that are English words, or a word's start typed alone ("is" Isaiah, "am" Amos, "act" Acts):
   a verse makes them a reference ("is 53 5"), a chapter alone does not ("is 1 thing"). */
const WORDISH = new Set(['is', 'am', 'ex', 'de', 'le', 'ne', 'es', 'la', 'da', 'ho', 'na', 'mi', 'mr', 'so', 'ob', 'act', 'pro', 'mat', 'est', 'num', 'gen', 'lam', 'dan', 'jon', 'tit']);

/** The index keys Matthew's plain chapters as 'matthew' (engine.js VERSE_IDS). */
const bookKey = (/** @type {string} */ id) => (id === 'matthew-plain' ? 'matthew' : id);

/**
 * Does the index hold the reading's chapter (its first verse), its verse and its end?
 * @param {any} r @param {RefFacts} facts
 */
function exists(r, facts) {
  const b = bookKey(r.bookId);
  const has = (/** @type {number} */ c, /** @type {number} */ v) => facts.hasVerse(b, c, v);
  return has(r.chapter, 1) && (!r.chapterEnd || has(r.chapterEnd, 1))
    && (r.verseStart == null || has(r.chapter, r.verseStart))
    && (r.verseEnd == null || has(r.chapterEnd || r.chapter, r.verseEnd));
}

/**
 * A string read whole as a Bible reference the index holds; null otherwise.
 * @param {string} str @param {{corpus?: string}} opts @param {RefFacts} facts
 */
function bibleRef(str, opts, facts) {
  const r = parseReference(str, opts);
  return r && r.kind === 'ref-bible' && exists(r, facts) ? r : null;
}

/**
 * The words of a reference's rest a text would hold: no small word, number, edition tag or frame word.
 * @param {string} rest
 * @returns {string[]}
 */
export function restWords(rest) {
  const stop = searchData().STOP_WORDS_TRIMMED;
  return kjvEncode(rest).filter((w) => !(stop && stop.has(w)) && !/^[\d#]/.test(w) && !EDITION_TAGS.has(w) && !FRAME_WORDS.has(w));
}

/** Is a word of the rest one other texts hold and the Bible never does? @param {string} rest @param {RefFacts} facts */
function outsideWord(rest, facts) {
  return restWords(rest).some((w) => facts.textsHold(w) && !facts.bibleHolds(w));
}

/** A wordish book abbreviation with a chapter and no verse ("is 3"): no reference. @param {any} r @param {string} refPart */
function wordishChapter(r, refPart) {
  const t = refPart.toLowerCase().replace(/^(?:[123]|first|second|third|1st|2nd|3rd)\s*/, '').match(/^[a-z]+/);
  return !!t && WORDISH.has(t[0]) && r.verseStart == null;
}

/* A small word before the book ("in leviticus 23 5 6 passover begins the days of", a study's sentence): prose citing
   the reference, which parseReference reads whole as a slip of the book's name ("in leviticus"). A frame's article
   ("the book of ruth 1") and a book's own abbreviation ("is 53 5") stay. */
function proseLead(/** @type {string} */ refPart) {
  const first = refPart.toLowerCase().split(/\s+/)[0] || '';
  const stop = searchData().STOP_WORDS_TRIMMED;
  return !!stop && stop.has(first) && first !== 'the' && !resolveBookToken(first);
}

/** Letters beside the edition tags: a rest that may be words. */
const hasWords = (/** @type {string} */ s) => /[a-z]/i.test(s.replace(/\b(?:kjv|nkjv|niv|esv)\b/gi, ''));

/**
 * The card with its rest searched under it; the card alone when the rest only frames it.
 * @param {any} r @param {string} rest
 */
function withRest(r, rest) {
  return restWords(rest).length ? { ...r, alsoText: true, text: rest } : r;
}

/**
 * A Bible reference at a text query's start or end (the longest first, the start before the end), or null.
 * @param {string} query  a query parseReference read as words
 * @param {{corpus?: string}} opts  the parse's own (a tab reading no Bible reference reads none here)
 * @param {RefFacts} facts
 * @returns {any}
 */
export function edgeReading(query, opts, facts) {
  const raw = String(query).trim().split(/\s+/);
  const n = raw.length;
  // at the start, a citation's brackets off ("(John 3:16) For God so loved")
  for (let k = Math.min(n - 1, EDGE_TOKENS); k >= 2; k--) {
    const refPart = raw.slice(0, k).join(' ').replace(/^[([]+|[)\].,;:!?]+$/g, '');
    const rest = raw.slice(k).join(' ').replace(/^[\s\-\u2010-\u2015:,.;]+/, '');
    if (!hasWords(rest) || proseLead(refPart)) continue;
    const r = bibleRef(refPart, opts, facts);
    if (!r || wordishChapter(r, refPart)) continue;
    if (outsideWord(rest, facts)) break;
    return withRest(r, rest);
  }
  // at the end ("the wages of sin is death romans 6:23", "... John 3:16 (KJV)")
  for (let k = Math.min(n - 1, EDGE_TOKENS); k >= 2; k--) {
    const refPart = raw.slice(n - k).join(' ').replace(/^[([]+|[)\].,;!?]+$/g, '');
    const rest = raw.slice(0, n - k).join(' ').replace(/[\s\-\u2010-\u2015:,;]+$/, '');
    if (!hasWords(rest) || proseLead(refPart)) continue;
    const r = bibleRef(refPart, opts, facts);
    if (!r || wordishChapter(r, refPart)) continue;
    if (outsideWord(rest, facts)) break;
    return withRest(r, rest);
  }
  return null;
}

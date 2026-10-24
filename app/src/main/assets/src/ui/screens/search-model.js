/* ═══════════════════════════════════════════════════════════════════════
   search-model.js — SearchScreen's pure helpers (search200 audit n237, s22.3)
   ═══════════════════════════════════════════════════════════════════════
   What the Search screen works out without React or the page: the words a card marks, a reference card's
   quote, a letter reference's cards, a scope the tab cannot reach, the count label, the site-order groups,
   the corrected query and the key a search is kept under. SearchScreen.jsx imports them (and still
   exports the ones it exported). */

import { kjvEncode } from '../../search/tokenize.js';
import { applyCorrections } from '../../search/query-parse.js';
import { verseText } from '../../utils/scripture-web/panel-model.js';

/** A verse reference card quotes at most this many verses of its range. */
const REF_QUOTE_VERSES = 3;
/**
 * The words a Bible reference card quotes (search200 bugcheck #2): the verse, or a range's first verses, in the
 * reader's edition; '' for a chapter, a range across chapters, or a Bible not yet loaded.
 * @param {any} p  a ref-bible parse
 * @param {string} translation
 */
export function refQuote(p, translation) {
  if (!p || p.kind !== 'ref-bible' || !p.verseStart || p.chapterEnd) return '';
  const last = Math.min(p.verseEnd || p.verseStart, p.verseStart + REF_QUOTE_VERSES - 1);
  const said = [];
  for (let v = p.verseStart; v <= last; v++) {
    const t = verseText({ bookId: p.bookId, chapter: p.chapter, verse: v }, translation);
    if (t) said.push(t);
  }
  return said.join(' ') + (said.length && (p.verseEnd || p.verseStart) > last ? ' …' : '');
}

/**
 * SRCH4: build the snippet-highlight term list. SrchSnippet only marks the terms
 * we hand it, so when synonym search is ON we expand each LITERAL query term
 * through the SAME SYNONYM_MAP the engine matched on — otherwise a verse surfaced
 * by a synonym (search "shepherd" → a "pastor" verse) shows the matched word
 * unhighlighted. Phrases are exempt (the engine never synonym-expands a phrase).
 * Cross-translation spelling variants (KJV "armour" vs NKJV "armor") have no such
 * map and stay unhighlighted — rare + acceptable. Pure for testability.
 * @param {{kind?:string, phrase?:string, run?:string}|null} parsed
 * @param {string[]} parsedTerms
 * @param {Record<string,string[]>|null|undefined} synMap
 * @param {boolean} synonymsOn
 * @param {Set<string>|null} [stop]  the stop words: dropped when real words were typed too
 * @returns {string[]}
 */
export function expandSnippetTerms(parsed, parsedTerms, synMap, synonymsOn, stop) {
  if (!parsed || parsed.kind !== 'text') return [];
  // A stop word typed among real words ("faith is the substance") ranks, but is not
  // a word to mark or count as a place (search audit 2026-09-27: the find pill read
  // "1 of 22" on a lone "is").
  const isStop = (/** @type {string} */ t) => isStopTerm(t, stop);
  const typed = (parsedTerms || []).some((t) => !isStop(t)) ? (parsedTerms || []).filter((t) => !isStop(t)) : (parsedTerms || []);
  // `run`: the engine found the typed words in a row, one real word among small ones ("for you to embrace me").
  const base = [parsed.phrase, parsed.run].filter(Boolean).concat(typed);
  if (!synonymsOn || !synMap) return base;
  const out = new Set(base);
  for (const t of (parsedTerms || [])) {
    const grp = synMap[String(t).toLowerCase()];
    if (Array.isArray(grp)) grp.forEach((g) => out.add(g));
  }
  return [...out];
}

/** @param {string} t @param {Set<string>|null|undefined} stop */
export function isStopTerm(t, stop) {
  const toks = kjvEncode(t);
  return !!stop && toks.length > 0 && toks.every((w) => stop.has(w));
}

/**
 * The small words the reader typed (search200 B7 review), lowercase: a card leaves the engine's
 * forms of them unmarked ("who" brought "whom"). Pure.
 * @param {{kind?:string}|null} parsed
 * @param {string[]} parsedTerms
 * @param {Set<string>|null} stop
 * @returns {string[]}
 */
export function typedStopWords(parsed, parsedTerms, stop) {
  if (!parsed || parsed.kind !== 'text' || !stop) return [];
  return (parsedTerms || []).filter((t) => isStopTerm(t, stop)).map((t) => String(t).toLowerCase());
}

/* THE WORDS A CARD DOES NOT MARK when real words were typed (search200 B7): the engine's
   trimmed stop list (the words it does not search) and the fuller one (who, which, not,
   all...), which it searches for their meaning but which marked as glue ("those who
   mourn" marked every "who"). One set per tables object. */
/** @type {WeakMap<object, Set<string>>} */
const MARK_STOP = new WeakMap();
/** @param {any} SD  window.VotSearchData @returns {Set<string>|null} */
export function markStopWords(SD) {
  if (!SD || (!SD.STOP_WORDS_TRIMMED && !SD.STOP_WORDS)) return null;
  let s = MARK_STOP.get(SD);
  if (!s) { s = new Set([...(SD.STOP_WORDS_TRIMMED || []), ...(SD.STOP_WORDS || [])]); MARK_STOP.set(SD, s); }
  return s;
}

/* A LETTER REFERENCE OPENS A LETTER THAT EXISTS (search audit 2026-09-27). "letter 55"
   made a card for Volume Two's Letter 55, which does not exist, and the tap did nothing;
   "volume 7 letter 99" the same. The numbered collections, in the site's order. */
const NUMBERED_LETTERS = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'timothy', 'flock', 'rebuke'];

/**
 * A scope the tab cannot reach (search200 B2): a book of the Bible under the Volumes tab, a collection of the
 * Volumes under the Scriptures tab. Luke under Volumes said "No results in Luke". The Matthew study is a book and
 * a collection at once, so it is never one. Pure.
 * @param {any} scope  the search scope ({kind:'book', bookId} | {kind:'volume', volumeId})
 * @param {string} corpus  the tab
 * @returns {{ home: string, tab: string } | null}
 */
export function scopeConflict(scope, corpus) {
  if (!scope) return null;
  if (corpus === 'volumes' && scope.bookId && scope.bookId !== 'matthew') return { home: 'the Scriptures', tab: 'Volumes' };
  if (corpus === 'scriptures' && scope.volumeId && String(scope.volumeId).indexOf('matthew') !== 0) return { home: 'the Volumes', tab: 'Scriptures' };
  return null;
}

/**
 * The cards a letter reference offers, each naming the letter's title: the letter
 * named when its collection holds it; for "letter N" alone, each numbered collection
 * that holds a letter N. A collection whose letters have not loaded yet gets the card
 * as parsed (its tap resolves once they have). `missing` says a letter is not there.
 * @param {any} p  a ref-letter parse
 * @param {any} D  VotSearchData
 * @param {any} win  where the collections' letters live (window)
 * @returns {{ cards: Array<{__label:string, __sub:string, ref:any}>, missing: string|null }}
 */
export function letterRefCards(p, D, win) {
  const cols = (D && D.VOLUME_COLLECTIONS) || [];
  /** undefined: not loaded; null: not there */
  const letterOf = (/** @type {any} */ vc, /** @type {number} */ num) => {
    const arr = vc.dataVar && win ? win[vc.dataVar] : null;
    if (!Array.isArray(arr)) return undefined;
    if (num === 0) return (vc.prefaceVar && win[vc.prefaceVar]) || arr.find((l) => l && l.num === 0) || null;
    return arr.find((l) => l && l.num === num) || null;
  };
  const card = (/** @type {any} */ vc, /** @type {any} */ L, /** @type {string} */ label) => ({
    __label: label,
    __sub: (L && L.title) || 'Open letter',
    ref: { ...p, anyVolume: false, volumeId: vc.id, volumeScreen: vc.screen, letterId: (L && L.id) || null },
  });
  if (p.anyVolume) {
    const cards = [];
    let unknown = false;
    for (const id of NUMBERED_LETTERS) {
      const vc = cols.find((/** @type {any} */ c) => c.id === id);
      if (!vc) continue;
      const L = letterOf(vc, p.letterNum);
      if (L === undefined) unknown = true;
      else if (L) cards.push(card(vc, L, vc.label + ' · Letter ' + p.letterNum));
    }
    if (cards.length) return { cards, missing: null };
    if (unknown) return { cards: [{ __label: p.label, __sub: 'Open letter', ref: p }], missing: null };
    return { cards: [], missing: 'No collection has a Letter ' + p.letterNum + '.' };
  }
  const vc = cols.find((/** @type {any} */ c) => c.id === p.volumeId);
  if (!vc) return { cards: [{ __label: p.label, __sub: 'Open letter', ref: p }], missing: null };
  const L = letterOf(vc, p.letterNum);
  if (L === null) {
    const arr = win[vc.dataVar] || [];
    let hi = 0;
    for (const l of arr) if (l && typeof l.num === 'number' && l.num > hi) hi = l.num;
    const what = p.letterNum === 0 ? 'a preface' : (/^v\d$/.test(vc.id) || NUMBERED_LETTERS.indexOf(vc.id) >= 0 ? 'Letter ' : 'number ') + p.letterNum;
    return { cards: [], missing: vc.label + ' has no ' + what + (hi ? ' (it runs 1 to ' + hi + ').' : '.') };
  }
  return { cards: [card(vc, L, p.label)], missing: null };
}

/**
 * The one string a search's results, and what was opened in them, are kept under.
 * @param {string} q  the query, trimmed
 * @param {any} settings
 * @param {any} scope
 * @returns {string}
 */
export function searchMemo(q, settings, scope) {
  const s = settings || {};
  return [q, s.searchCorpus || 'all', s.translation || 'nkjv', s.searchUseStopWords !== false, s.searchSynonyms !== false, scope ? JSON.stringify(scope) : ''].join('\u0001');
}

/**
 * Honest result-count label: "<count>+" when the engine cut the results short
 * (a collection hit its cap, or the total did), else the exact count, grouped
 * ("1,290"). Pure for testability.
 * @param {number} count
 * @param {boolean} [more] the engine cut the results short
 * @returns {string}
 */
export function matchCountLabel(count, more) {
  return count.toLocaleString('en-US') + (more ? '+' : '');
}

/**
 * Bucket results by collection and list the buckets in the SITE's order
 * (SRCH_GROUP_META `order`: the Bible, then the collections as
 * trumpetcallofgodonline.com lists them). Relevance used to order the buckets, so
 * Volume Seven could sit above Volume Two and the list reshuffled on every
 * query; a reader who navigates by collection now finds each one where it
 * always is (Brianna, 2026-09-26). Relevance keeps its place in each bucket's
 * own order and in the Best Matches row above the buckets. Pure for testability.
 * @param {Array<{doc:Object}>} results  the engine's hits, relevance order
 * @param {(doc:Object) => string} groupKey
 * @param {Record<string, {order?:number}>} meta
 * @returns {Array<{key:string, items:Array<{doc:Object}>}>}
 */
export function groupInSiteOrder(results, groupKey, meta) {
  const groups = Object.create(null);
  const keys = [];
  for (const entry of results) {
    const g = groupKey(entry.doc);
    if (!groups[g]) { groups[g] = []; keys.push(g); }
    groups[g].push(entry);
  }
  const rank = (k) => (meta[k] && meta[k].order) || 99;
  // Array.prototype.sort is stable: two unknown keys keep their first-seen order.
  keys.sort((a, b) => rank(a) - rank(b));
  return keys.map((k) => ({ key: k, items: groups[k] }));
}

/**
 * The query with each corrected word put in (the engine's `corrections`: a typed
 * word that found nothing of its own, searched as the nearest indexed word). The
 * note under the corpus row offers it: "Showing results for the lord is my
 * shepherd". A query word is matched the way the engine read it (kjvEncode: any
 * case, accents and apostrophes folded), so an accented typo is rewritten too
 * (review of 875dff9f). Pure.
 * @param {string} query
 * @param {Array<{from:string, to:string}>} corrections
 * @returns {string}
 */
export function correctedQuery(query, corrections) {
  return applyCorrections(query, corrections);
}

/* "plan" or "reading plan" asks for the Reading plans screen (rp-c8s, mw18 C8). Only a query that names the plans and
   nothing more: a few lead words ("my", "bible", "start a", "daily") then "plan(s)" or "reading plan(s)". A longer
   phrase ("the plan of salvation", "god's plan") is a search of words and gets no row. */
const PLANS_QUERY = /^(?:(?:start|begin|open|my|a|the|bible|daily|scripture|scriptures|volumes)\s+)*(?:reading\s+)?plans?$/;

/**
 * Whether a query asks for the Reading plans screen by name. Case, extra spaces and end punctuation are ignored. Pure.
 * @param {string} query
 * @returns {boolean}
 */
export function isPlansQuery(query) {
  const q = String(query || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return PLANS_QUERY.test(q);
}

/* ═══════════════════════════════════════════════════════════════════════
   search/engine.js — MiniSearch engine facade (window.VotSearchMini)
   ═══════════════════════════════════════════════════════════════════════
   The public surface, method-compatible with the Classic engine so the UI can
   call either one (see SearchScreen / SrchSnippet engine selection). A single
   in-memory MiniSearch index over the narrow doc set (index-builder.js); NO
   IndexedDB cache (the device is fast + single-user — rebuild fresh per session,
   reuse in-memory for every search that session).

   Search pipeline (faithful to the audited multi-signal ranking, with BM25 as
   the per-unit scorer + native fuzzy/prefix):
     1. parse → command / reference / named-passage short-circuit to a nav card
     2. stop-word filter + synonym expansion + word forms → search "units"
     3. one MiniSearch BM25 search per unit (literal = fuzzy+prefix; synonym =
        exact-only), accumulating per-doc score + a term-coverage bitmask
     4. re-rank: KIND_BOOST · coverage multiplier · phrase-proximity boost ·
        synonym-only demotion
     5. filter (corpus / scope / quoted-phrase / +must / -mustNot) + dedup + cap
     6. emit { score, doc, terms } — doc carries the routing/display contract
        fields; terms carries the doc-side matched words (fuzzy/prefix-
        corrected) for snippet highlighting. Classic results have no terms.
   ═══════════════════════════════════════════════════════════════════════ */

import MiniSearch from './vendor/minisearch.js';
import { searchData } from './search-data.js';
import { buildMiniSearchOptions, MS_STORE_FIELDS, MS_SEARCH_DEFAULTS } from './search-config.js';
import { buildDocs } from './index-builder.js';
import { parseReference, fuzzyBookSuggest, levenshtein } from './ref-parser.js';
import { parseTextQuery, applyCorrections } from './query-parse.js';
import { expandQueryTerms } from './synonyms.js';
import { wordForms } from './word-forms.js';
import { kjvEncode } from './tokenize.js';
import { snippet, highlightSpans, matchExcerpt, morePlaces, findPlaces } from './snippet.js';
import {
  KIND_BOOST, coverageMultiplier, popcount, PHRASE_BOOST, SYNONYM_DEMOTION,
  BM25_PARAMS, KEYWORD_BM25, KEYWORD_CONTENT_WORDS, KEYWORD_WORDS, joinApostropheS, SYNONYM_WEIGHT, FORM_WEIGHT, NEAR_PHRASE_MIN, ORIGINAL_BOOST, REPRINT_KINDS, nearPhrase, titleMatch,
} from './ranking.js';
import { loadCached, saveCached, clearCached, dataSignature } from './cache.js';
import { onIdle } from '../utils/on-idle.js';
import { lemma, bestWindow } from './passage.js';

/**
 * The parse kinds a direct-nav card answers ALONE.
 *
 * A POSITIVE LIST, not `kind !== 'text'` (search-2). These three are addresses
 * and actions — an explicit chapter or verse, a volume/letter ref, a command —
 * and text hits beneath them would be noise. Everything else falls through to
 * the text pipeline, so a kind added later is VISIBLE rather than inheriting
 * silence from a catch-all `else`.
 */
const NAV_ONLY_KINDS = new Set(['ref-bible', 'ref-letter', 'command']);

/**
 * How many text hits ride under a nav card. Five, the same count the search
 * screen's own preview slice uses — a bare `Psalms` matches thousands of verses,
 * and an uncapped wall of them reads as though the card had been buried.
 */
const NAV_TEXT_LIMIT = 5;

/* Typo tolerance is a FALLBACK (2026-09-22). MiniSearch rounds fuzzy 0.2 to ONE edit
   on a three-letter word, so a correctly spelled "one" also matched "owe" and "gone",
   "son" matched "sun", "peace" matched "place": verses the reader never asked for, with
   the near-miss highlighted as if it were the hit. A literal unit now searches exact +
   prefix first and retries with FUZZY only when that finds nothing, which is exactly the
   typo ("shephard" -> shepherd). search/fuzzy-fallback.test.js pins both halves.

   The retry corrects to ONE word (ux4, 2026-09-24): taking every word in reach at once
   let "shephard" (8 letters, 2 edits) bring Chephar and Mount Shepher, place names in
   one verse each that outrank a common word on BM25. searchCorrected() below. */
const FUZZY = 0.2;

/** True when `run` occurs in `toks` as consecutive tokens (an empty run always does). */
function hasTokenRun(toks, run) {
  if (!run.length) return true;
  for (let i = 0; i + run.length <= toks.length; i++) {
    let j = 0;
    while (j < run.length && toks[i + j] === run[j]) j++;
    if (j === run.length) return true;
  }
  return false;
}

/* SHORT WORDS, APOSTROPHES (search audit 2026-09-27). A literal word was also
   searched as a prefix, so every one- and two-letter word ("a", "i", the "s" an
   apostrophe leaves of "Lord's") and every stop word ("the" reaching these, them,
   their) matched thousands of words, and the longest texts, holding all of them,
   won: "a virgin shall conceive" ranked Isaiah 7:14 45th ("virgin shall conceive":
   1st), "The Lord's Table" #8, "lord's supper" put four topics highlighting
   "skillful" and "smoke" above 1 Cor 11:20. Only a word of three letters or more
   that is not a stop word reaches forward now; the rest match whole words. */
/** @param {string} term */
function prefixable(term) {
  const stop = searchData().STOP_WORDS_TRIMMED;
  return term.length >= 3 && !(stop && stop.has(term));
}
/** A typed term whose words are all stop words ("the", "me." with its period). */
function isStopTerm(term) {
  const toks = kjvEncode(term);
  const STOP = searchData().STOP_WORDS_TRIMMED;
  return !!STOP && toks.length > 0 && toks.every((t) => STOP.has(t));
}
/** "Lord's" searches Lord: a possessive's "s" is not a word the reader meant. */
function withoutPossessive(term) {
  const toks = kjvEncode(term);
  return toks.length >= 2 && toks[toks.length - 1] === 's' ? toks.slice(0, -1).join(' ') : term;
}
/* A negative contraction is its two words, as the text mostly spells them: "don't
   look back" found its letter at #119, "do not look back" at #1. */
const NT_BASE = { wo: 'will', sha: 'shall', ai: 'am' };   // the base the pattern leaves: wo|n't, sha|n't
/** @param {string} q */
export function expandContractions(q) {
  return String(q).replace(/\b([a-z]+)n['\u2019]t\b/gi, (m, base) => {
    const b = base.toLowerCase();
    if (b === 'ca') return 'cannot';
    return (NT_BASE[b] || base) + ' not';
  });
}

/**
 * One unit's BM25 search, the body and the title scored apart and summed per text:
 * BM25 as published (BM25_PARAMS), or with MiniSearch's floor for a keyword search
 * (KEYWORD_BM25, where the reason is). A unit of several words (a quoted phrase)
 * matches when the body holds them all, or the title does.
 * @param {string} term
 * @param {Object} opts
 * @param {boolean} [keyword]
 * @returns {any[]}
 */
function searchUnit(term, opts, keyword) {
  const bm25 = keyword ? KEYWORD_BM25 : BM25_PARAMS;
  const body = msIndex.search(term, { ...opts, fields: ['text'], bm25 }) || [];
  const title = msIndex.search(term, { ...opts, fields: ['title'], bm25 }) || [];
  if (!title.length) return body;
  const byId = new Map();
  for (let i = 0; i < body.length; i++) byId.set(body[i].id, body[i]);
  for (let i = 0; i < title.length; i++) {
    const t = title[i];
    const b = byId.get(t.id);
    if (!b) { body.push(t); continue; }
    b.score += t.score;
    for (let w = 0; w < t.terms.length; w++) if (b.terms.indexOf(t.terms[w]) < 0) b.terms.push(t.terms[w]);
  }
  return body;
}

/** Is `term` a word of the index? (The index's own term map; a search where it lacks one.) */
function termExists(term) {
  const idx = msIndex && msIndex._index;
  if (idx && typeof idx.has === 'function') return idx.has(term);
  return !!(msIndex && msIndex.search(term, { prefix: false, fuzzy: false }).length);
}

/**
 * The slip that turns `word` into `cand`, as a rank (search audit 2026-09-27): a
 * swapped pair (0: beleive, recieve, wrold), a letter left out (1: fxed, rightousness),
 * a letter too many (2: sond), a wrong letter (3: babilon), anything further (4). A
 * swapped pair is two edits to Levenshtein, so a word of seven letters or fewer never
 * reached its word ("wrold" and "beleive" found nothing, "recieve" became "relieve");
 * and ranking the neighbours by how many texts hold them alone chose "wrath" for
 * "erath" and "earth" for "warth".
 */
function slipRank(word, cand) {
  const a = word.length;
  const b = cand.length;
  if (a === b) {
    const diff = [];
    for (let i = 0; i < a; i++) if (word[i] !== cand[i]) diff.push(i);
    if (diff.length === 2 && diff[1] === diff[0] + 1 && word[diff[0]] === cand[diff[1]] && word[diff[1]] === cand[diff[0]]) return 0;
    if (diff.length === 1) return 3;
    return 4;
  }
  const inside = (/** @type {string} */ s, /** @type {string} */ l) => { let i = 0; for (let j = 0; j < l.length && i < s.length; j++) if (s[i] === l[j]) i++; return i === s.length; };
  if (b === a + 1 && inside(word, cand)) return 1;
  if (a === b + 1 && inside(cand, word)) return 2;
  return 4;
}

/**
 * A word written as a compound the text spells in parts: "abednego" (Abed-Nego),
 * "mahershalalhashbaz", "immanuel" (Immanu El). The split into two to four indexed
 * words, each of two letters or more, fewest parts first; null when none.
 * @param {string} word
 * @returns {string[]|null}
 */
function splitCompound(word) {
  if (word.length < 6) return null;
  /** @type {Map<number, string[]|null>} */
  const memo = new Map();
  const from = (/** @type {number} */ i, /** @type {number} */ partsLeft) => {
    if (i === word.length) return [];
    if (partsLeft === 0) return null;
    const key = i * 8 + partsLeft;
    if (memo.has(key)) return /** @type {string[]|null} */ (memo.get(key));
    let best = null;
    for (let j = word.length; j >= i + 2; j--) {
      const part = word.slice(i, j);
      if (j - i === word.length) continue;   // the whole word is not a split
      if (!termExists(part)) continue;
      const rest = from(j, partsLeft - 1);
      if (rest && (!best || rest.length + 1 < best.length)) best = [part].concat(rest);
    }
    memo.set(key, best);
    return best;
  };
  return from(0, 4);
}

/**
 * The typo fallback for one literal unit that found nothing as typed.
 *
 * First a compound the text spells in parts (splitCompound), searched as those words
 * in a row. Then the nearest indexed word by the slip that makes it (slipRank: a
 * swapped pair, a letter left out, one too many, a wrong one), and among words at the
 * same slip the one in the most documents (ties alphabetical). The edit budget is
 * MiniSearch's own, round(0.2 x length) capped at maxFuzzy, counted the Damerau way
 * (a swapped pair is one slip). That word is then searched as if typed, exact + prefix.
 * A multi-word unit (a quoted phrase) keeps the plain fuzzy retry.
 * `to` names what was searched in the typed word's place, so the screen can say so
 * ("Showing results for shepherd"); null for a phrase's fuzzy retry.
 * @param {string} term
 * @param {Object} opts  the unit's exact + prefix options
 * @param {boolean} [keyword]  searchUnit's
 * @returns {{ res: any[], to: string | null }}
 */
function searchCorrected(term, opts, keyword) {
  const tokens = kjvEncode(term);
  if (tokens.length !== 1) return { res: searchUnit(term, { ...opts, fuzzy: FUZZY }, keyword), to: null };
  const word = tokens[0];
  const parts = splitCompound(word);
  // A split into a little word is a guess, not a name typed whole: "isreal" is Israel a letter
  // swapped, not "is real" (search benchmark, 2026-10-05). The nearest word goes first then.
  const stop = searchData().STOP_WORDS_TRIMMED;
  const weakSplit = !!parts && parts.some((w) => w.length <= 2 || (stop && stop.has(w)));
  const split = () => {
    if (!parts) return null;
    const res = searchUnit(parts.join(' '), { ...opts, prefix: false, combineWith: 'AND' }, keyword)
      .filter((h) => hasTokenRun(kjvEncode((h.text || '') + ' ' + (h.title || '')), parts));
    return res.length ? { res, to: parts.join(' ') } : null;
  };
  if (!weakSplit) { const s = split(); if (s) return s; }
  /* A name the text splits, typed whole AND a letter off: "abednigo" (Abed-Nego) is a split
     plus a slip, beyond either alone (search benchmark, 2026-10-05). Two parts, one of them an
     indexed word and the other one slip from one, both of three letters or more. */
  if (word.length >= 7) {
    for (let i = 3; i <= word.length - 3; i++) {
      const a = word.slice(0, i);
      const b = word.slice(i);
      /** The word itself when indexed, else its one-slip neighbours (nigo: nigh, nego, ...). */
      const near = (/** @type {string} */ w) => {
        if (termExists(w)) return [w];
        const out = [];
        for (const h of msIndex.search(w, { prefix: false, fuzzy: 1, combineWith: 'OR' }) || []) {
          for (const t of h.terms || []) if (t !== w && out.indexOf(t) < 0 && slipRank(w, t) < 4) out.push(t);
          if (out.length >= 8) break;
        }
        return out;
      };
      if (!termExists(a) && !termExists(b)) continue;
      for (const pa of near(a)) for (const pb of near(b)) {
        const run = [pa, pb];
        const res = searchUnit(run.join(' '), { ...opts, prefix: false, combineWith: 'AND' }, keyword)
          .filter((h) => hasTokenRun(kjvEncode((h.text || '') + ' ' + (h.title || '')), run));
        if (res.length) return { res, to: run.join(' ') };
      }
    }
  }
  const budget = Math.max(1, Math.min(MS_SEARCH_DEFAULTS.maxFuzzy, Math.round(word.length * FUZZY)));
  // Levenshtein reach one wider than the budget, so a swapped pair (two Levenshtein
  // edits, one slip) is in reach; slipRank then keeps what is within the budget.
  const near = msIndex.search(word, { ...opts, prefix: false, fuzzy: Math.min(budget + 1, MS_SEARCH_DEFAULTS.maxFuzzy) }) || [];
  const docs = Object.create(null);
  for (let r = 0; r < near.length; r++) {
    const ts = near[r].terms || [];
    for (let t = 0; t < ts.length; t++) docs[ts[t]] = (docs[ts[t]] || 0) + 1;
  }
  let best = null;
  let bestRank = 9;
  for (const w in docs) {
    if (w === word) continue;
    const rank = slipRank(word, w);
    if (rank === 4 && budget < 2) continue;   // beyond one slip for a word of seven letters or fewer
    if (best === null || rank < bestRank || (rank === bestRank && (docs[w] > docs[best] || (docs[w] === docs[best] && w < best)))) {
      best = w;
      bestRank = rank;
    }
  }
  if (best) return { res: searchUnit(best, opts, keyword), to: best };
  return (weakSplit && split()) || { res: [], to: null };
}

/** @type {any} */ let msIndex = null;

/* A text's tokens, kept for the phrase ranking: the same few hundred candidates come
   back on every keystroke of a query. Bounded by total tokens (a long Answers topic is
   20,000), oldest out first; emptied when the index is rebuilt. */
/** @type {Map<string, string[]>} */
const TOKEN_CACHE = new Map();
let tokenCacheSize = 0;
/** @param {string} id @param {{ text?: string, title?: string }} doc */
function docTokens(id, doc) {
  let t = TOKEN_CACHE.get(id);
  if (t) return t;
  t = joinApostropheS(kjvEncode((doc.text || '') + ' ' + (doc.title || '')));
  TOKEN_CACHE.set(id, t);
  tokenCacheSize += t.length;
  while (tokenCacheSize > 1500000 && TOKEN_CACHE.size > 1) {
    const oldest = /** @type {string} */ (TOKEN_CACHE.keys().next().value);
    tokenCacheSize -= /** @type {string[]} */ (TOKEN_CACHE.get(oldest)).length;
    TOKEN_CACHE.delete(oldest);
  }
  return t;
}
/** The phrase ranking reads at most this many of the best-scored texts. */
const PHRASE_CANDIDATES = 500;

/* THE BEST PASSAGE (search benchmark, 2026-10-05). A remembered sentence in the reader's own words
   shares only a few words with the text, and a long topic holds those few somewhere, far apart: it
   came first and the passage meant sat 2nd to 20th (paraphrase 12 of 75). The first PASSAGE_REACH
   results are re-ordered by their best passage (passage.js bestWindow), the engine's own order
   breaking near-ties, unless the first already holds the query together, the search is a keyword
   or a quote, or a result's title is what the query names (it keeps the top). An Answers topic
   reprints the verses and letters, so its best passage ties theirs: it yields to an original
   holding as much (REPRINT_COST), and does not keep its place for holding the query together. */
const PASSAGE_REACH = 30;
/** The first result holding this share of the query in one passage keeps its place. */
const PASSAGE_HELD = 0.9;
/** How much a place lower in the engine's order costs, against the passage share (0..1). */
const PASSAGE_RANK_COST = 0.01;
/** How much more of the query a passage must hold to take the engine's first place. */
const PASSAGE_MARGIN = 0.15;
/** How much less of the query an original's passage may hold and still come before an Answers topic. */
const REPRINT_COST = 0.05;
/** @type {Map<string, string[]>} doc id -> its tokens' lemmas, alongside TOKEN_CACHE */
const LEMMA_CACHE = new Map();
/** How many texts hold `term` (the index's own term data). */
function docFreq(term) {
  const data = msIndex && msIndex._index && msIndex._index.get(term);
  if (!data) return 0;
  let n = 0;
  for (const docs of data.values()) if (docs.size > n) n = docs.size;
  return n;
}
/**
 * @param {Array<{score:number, doc:any, terms?:string[]}>} out
 * @param {Map<any, string>} idOf
 * @param {Array<{term:string, origin:number, literal?:boolean}>} units  the search's units: each typed
 *   word (literal) with its synonyms, names and forms (same origin)
 * @param {(term:string) => boolean} stop
 * @param {(doc:any) => boolean} named
 */
function bestPassageFirst(out, idOf, units, stop, named) {
  const n = msIndex.documentCount || 1;
  const seen = new Set();
  const query = [];
  let typed = 0;
  for (const u of units) {
    if (!u.literal || stop(u.term)) continue;
    for (const w of kjvEncode(u.term)) {
      typed++;
      const lem = lemma(w);
      if (seen.has(lem)) continue;
      seen.add(lem);
      const df = docFreq(w);
      const syn = new Set();
      for (const v of units) if (v.origin === u.origin && v !== u) for (const x of kjvEncode(v.term)) syn.add(lemma(x));
      query.push({ lem, weight: Math.log(1 + (n - df + 0.5) / (df + 0.5)), syn });
    }
  }
  if (query.length < 3) return;
  const span = Math.max(12, Math.round(typed * 1.6));
  const top = out.slice(0, PASSAGE_REACH).map((e, i) => {
    const id = idOf.get(e) || String(i);
    const lem = docLemmas(id, e.doc.text || '');
    const share = named(e.doc) ? 2 : bestWindow(query, lem, span);
    return { e, i, share, key: share - PASSAGE_RANK_COST * i - (e.doc.kind === 'answers' && share < 2 ? REPRINT_COST : 0) };
  });
  if (!top.length) return;
  const first = top[0];
  const reprint = first.e.doc.kind === 'answers' && first.share < 2;
  if (first.share >= PASSAGE_HELD && !reprint) return;
  top.sort((a, b) => b.key - a.key);
  // The engine's first is overtaken only by a passage holding clearly more of the query; an
  // Answers topic, by an original holding as much (it reprints them).
  if (top[0] !== first && top[0].share < first.share + (reprint ? -REPRINT_COST : PASSAGE_MARGIN)) { top.splice(top.indexOf(first), 1); top.unshift(first); }
  for (let i = 0; i < top.length; i++) out[i] = top[i].e;
}

/* THE ORIGINAL BEFORE ITS REPRINT (search benchmark, 2026-10-05). Answers, Holy Days and
   the studies reprint letters, Words To Live By and verses word for word, and a long Answers
   topic holds every word of most queries: a remembered letter sentence came back with the
   topic that quotes it first and the letter below it (74 of the benchmark's 187 open
   misses, 9 of them exact quotes). Every sentence of an original text (a verse, a letter,
   Words To Live By, The Blessed) is keyed by its words; a reprint near the top whose matched
   sentence is one of them gives its place to that original (ORIGINAL_TIER: who reprints whom). */
/** Reprints read for an original: the first this many results. */
const ORIGINAL_REACH = 10;
/** Who reprints whom: a text yields only to an original of a LOWER tier (Words To Live By excerpts the letters). */
const ORIGINAL_TIER = { verse: 0, letter: 0, wtlb: 1, blessed: 1, 'holy-day': 2, 'bible-study': 3, answers: 4 };
const ORIGINAL_KINDS = new Set(['verse', 'letter', 'wtlb', 'blessed']);
/** @type {Map<string, string[]>|null} sentence key -> original doc ids */ let ORIGINALS = null;
/** @type {Map<string, any>|null} original doc id -> its stored fields */ let ORIGINAL_DOCS = null;
/** The sentences of a text, as character spans (a sentence ends at . ! ? ; or a line's end). */
function sentenceSpans(text) {
  const out = [];
  const re = /[^.!?;\n]+[.!?;]*/g;
  let m;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  return out;
}
/** A sentence's key: its words as the index reads them; null under five words (too common to mean one text). */
function sentenceKey(s) {
  const toks = kjvEncode(s);
  return toks.length >= 5 ? toks.join(' ') : null;
}
/* Words To Live By cuts its excerpts mid-sentence and the Answers reprints re-punctuate, so a
   whole-sentence key misses them: a letter, Words To Live By or Blessed text is also keyed by
   runs of SHINGLE words, a content-chosen quarter of them (hash % 4 === 0), which both sides
   pick alike wherever the run falls. Verses are short: their sentence keys suffice. */
const SHINGLE = 8;
/** @type {Map<number, string[]>|null} shingle hash -> original doc ids */ let SHINGLES = null;
/** FNV-1a over a run of tokens. */
function runHash(toks, from) {
  let h = 0x811c9dc5;
  for (let i = from; i < from + SHINGLE; i++) {
    const t = toks[i];
    for (let c = 0; c < t.length; c++) h = Math.imul(h ^ t.charCodeAt(c), 16777619);
    h = Math.imul(h ^ 32, 16777619);
  }
  return h >>> 0;
}
/** @param {string[]} toks @param {(h:number) => void} each */
function eachShingle(toks, each) {
  for (let i = 0; i + SHINGLE <= toks.length; i++) { const h = runHash(toks, i); if (h % 4 === 0) each(h); }
}
const addTo = (/** @type {Map<any, string[]>} */ m, /** @type {any} */ k, /** @type {string} */ id) => {
  const list = m.get(k);
  if (!list) m.set(k, [id]);
  else if (list[list.length - 1] !== id) list.push(id);
};
function originals() {
  if (ORIGINALS) return ORIGINALS;
  const O = new Map();
  const S = new Map();
  ORIGINAL_DOCS = new Map();
  const ids = msIndex._documentIds;
  for (const [shortId, f] of msIndex._storedFields) {
    if (!f || !ORIGINAL_KINDS.has(f.kind) || !f.text) continue;
    const id = ids.get(shortId);
    ORIGINAL_DOCS.set(id, f);
    for (const sp of sentenceSpans(f.text)) {
      const k = sentenceKey(sp.text);
      if (k) addTo(O, k, id);
    }
    if (f.kind !== 'verse') eachShingle(kjvEncode(f.text), (h) => addTo(S, h, id));
  }
  SHINGLES = S;
  ORIGINALS = O;
  return O;
}
/* AN ANSWERS EXCERPT NAMES ITS LETTER (search benchmark, 2026-10-05). An Answers topic is a
   chain of letter excerpts, each closed by its source: "~ [From “The Alarm of War” ~ Volume 7]"
   (1,421 of its 1,434 excerpts name a letter, Words To Live By or Blessed text by title). A
   sentence the reader put in other words matches no sentence or run of the letter word for word,
   so the excerpt holding most of the query names the original instead (47 of the 108 open misses
   had an Answers topic first). */
const CITE = /\[\s*From\s+[“"](.+)[”"]\s*~\s*([^\]]*)\]/;
/** A citation's collection, as the corpus names it. */
const CITE_VOLUME = {
  "the lord's rebuke": 'rebuke', "letters to the lord's little flock": 'flock', 'letters from timothy': 'timothy',
  'words to live by: part one': 'wtlb1', 'words to live by: part two': 'wtlb2', 'the blessed': 'blessed',
};
/** How much less of the query the cited letter may hold than its excerpt (an edge word cut). */
const CITE_SLACK = 0.05;
const citeKey =(/** @type {string} */ s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();
/** @type {Map<string, string[]>|null} an original's title (citeKey) -> its doc ids */ let CITED = null;
/** @type {Map<string, Array<{toks: Set<string>, lem: string[], src: string|null}>>} Answers doc id -> its excerpts */
const EXCERPT_CACHE = new Map();
/** An Answers topic's excerpts (each with its words and the original it cites), read once a session. */
function excerpts(/** @type {string} */ id, /** @type {string} */ text) {
  let pieces = EXCERPT_CACHE.get(id);
  if (!pieces) {
    try { originals(); } catch { /* no citations: coverage still reads the excerpts */ }
    pieces = text.split('✦').map((p) => {
      const t = kjvEncode(p);
      return { toks: new Set(t), lem: t.map(lemma), src: ORIGINAL_DOCS ? citedId(p) : null };
    });
    EXCERPT_CACHE.set(id, pieces);
  }
  return pieces;
}
/** The original an excerpt's citation names, or null. */
function citedId(/** @type {string} */ piece) {
  const m = piece.match(CITE);
  if (!m) return null;
  if (!CITED) {
    CITED = new Map();
    for (const [id, f] of /** @type {Map<string, any>} */ (ORIGINAL_DOCS)) if (f.kind !== 'verse' && f.title) addTo(CITED, citeKey(f.title), id);
  }
  const ids = CITED.get(citeKey(m[1].replace(/[”"]\s*$/, '')));
  if (!ids) return null;
  const vol = m[2].trim().toLowerCase().replace(/[’‘]/g, "'");
  const v = /^volume (\d+)$/.exec(vol);
  const want = v ? 'v' + v[1] : CITE_VOLUME[vol];
  const D = /** @type {Map<string, any>} */ (ORIGINAL_DOCS);
  return ids.find((x) => D.get(x).volumeId === want) || (ids.length === 1 ? ids[0] : null);
}
/* AN ANSWERS TOPIC COVERS A QUERY ONE EXCERPT AT A TIME (search benchmark, 2026-10-05). A
   topic of up to 127,000 characters holds nearly any query's every word somewhere, and coverage
   (ranking.js coverageMultiplier, 15x for eight words) paid it as if it held them together: an
   Answers topic came first in 47 of the 108 open misses, over the verse or letter meant. Its
   coverage counts the query words its best single excerpt holds. */
/**
 * @param {string} id  the Answers doc's id
 * @param {string} text
 * @param {Array<[number, string[]]>} hits  each matched word list with the query words (bits) it counts for
 * @returns {number}
 */
function excerptCover(id, text, hits) {
  let best = 0;
  for (const p of excerpts(id, text)) {
    let mask = 0;
    for (const [bits, terms] of hits) if (terms.some((t) => p.toks.has(t))) mask |= bits;
    const c = popcount(mask);
    if (c > best) best = c;
  }
  return best;
}
/** The query's content words as bestWindow reads them, rare words weighing more, and the window's reach. */
function passageQuery(/** @type {string[]} */ words) {
  const n = msIndex.documentCount || 1;
  const seen = new Set();
  const query = [];
  for (const w of words) {
    const lem = lemma(w);
    if (seen.has(lem)) continue;
    seen.add(lem);
    const df = docFreq(w);
    query.push({ lem, weight: Math.log(1 + (n - df + 0.5) / (df + 0.5)), syn: new Set() });
  }
  return { query, span: Math.max(12, Math.round(words.length * 1.6)) };
}
/** A text's tokens, lemmatized (LEMMA_CACHE). */
function docLemmas(/** @type {string} */ id, /** @type {string} */ text) {
  let lem = LEMMA_CACHE.get(id);
  if (!lem) {
    lem = kjvEncode(text).map(lemma);
    LEMMA_CACHE.set(id, lem);
    if (LEMMA_CACHE.size > 400) LEMMA_CACHE.delete(/** @type {string} */ (LEMMA_CACHE.keys().next().value));
  }
  return lem;
}
/** The original `src` holds the query as well as its reprint's passage does (`share`): a reprint words some passages its own way. */
function holdsAsWell(/** @type {string} */ src, /** @type {ReturnType<typeof passageQuery>} */ pq, /** @type {number} */ share) {
  const f = /** @type {Map<string, any>} */ (ORIGINAL_DOCS).get(src);
  return !!f && bestWindow(pq.query, docLemmas(src, f.text), pq.span) >= share - CITE_SLACK;
}
/**
 * The original cited by the Answers excerpt that holds most of the query, or null when none holds half.
 * @param {string} id  the Answers doc's id
 * @param {string} text
 * @param {string[]} words  the query's words, encoded
 */
function citedOriginal(id, text, words) {
  const pq = passageQuery(words);
  let best = 0.5;
  let src = null;
  for (const p of excerpts(id, text)) {
    if (!p.src) continue;
    const s = bestWindow(pq.query, p.lem, pq.span);
    if (s > best) { best = s; src = p.src; }
  }
  return src && holdsAsWell(src, pq, best) ? src : null;
}
/* A WORDS TO LIVE BY ENTRY IS A LETTER CONDENSED (search benchmark, 2026-10-05). Its lines are
   cut from one letter and joined by "...", re-broken and re-capitalized, so no sentence of it is
   the letter's word for word and the matched place alone carries too few of the letter's runs
   (10 open misses: the entry first, its letter below). The whole entry's runs vote once for its
   letter. */
/** @type {Map<string, string|null>} entry id -> the letter it condenses */
const SOURCE_CACHE = new Map();
function condensedFrom(/** @type {string} */ id, /** @type {string} */ text, /** @type {number} */ tier) {
  if (SOURCE_CACHE.has(id)) return SOURCE_CACHE.get(id) || null;
  const D = /** @type {Map<string, any>} */ (ORIGINAL_DOCS);
  /** @type {Map<string, number>} */ const votes = new Map();
  eachShingle(kjvEncode(text), (h) => {
    for (const x of /** @type {Map<number, string[]>} */ (SHINGLES).get(h) || []) if (x !== id && ORIGINAL_TIER[D.get(x).kind] < tier) votes.set(x, (votes.get(x) || 0) + 1);
  });
  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  const src = ranked.length && ranked[0][1] >= 3 && (ranked.length < 2 || ranked[0][1] >= 2 * ranked[1][1]) ? ranked[0][0] : null;
  SOURCE_CACHE.set(id, src);
  return src;
}
/**
 * Move each original ahead of a reprint of it near the top (in place).
 * @param {Array<{score:number, doc:any, terms?:string[]}>} out  ranked, best first
 * @param {Map<any, string>} idOf  each entry's doc id
 * @param {string[]} terms  the words a landing marks (the query's own)
 * @param {(doc:any) => boolean} allowed  the search's corpus and scope filters
 * @param {(doc:any) => boolean} named  the query names this text's title: it keeps its place
 * @param {(id:string, doc:any) => number} near  how nearly a text holds the typed words in a row (0..1)
 */
function originalsFirst(out, idOf, terms, allowed, named, near) {
  if (!terms.length) return;
  let O;
  try { O = originals(); } catch { return; }
  const D = /** @type {Map<string, any>} */ (ORIGINAL_DOCS);
  // The matched sentence must hold a fair share of the query's words, not one word of a title.
  const words = [...new Set(terms.flatMap((t) => kjvEncode(t)))];
  const need = Math.min(3, Math.ceil(words.length / 2));
  for (let i = 0; i < Math.min(out.length, ORIGINAL_REACH); i++) {
    const e = out[i];
    const tier = ORIGINAL_TIER[e.doc.kind];
    if (!tier || !e.doc.text || named(e.doc)) continue;
    const ex = matchExcerpt(e.doc.text, terms);
    const at = ex ? e.doc.text.indexOf(ex) : -1;
    const lower = (/** @type {string[]|undefined} */ ids) => (ids || []).filter((x) => D.has(x) && ORIGINAL_TIER[D.get(x).kind] < tier);
    let found = null;
    if (at >= 0) for (const sp of sentenceSpans(e.doc.text)) {
      if (sp.end < at || sp.start > at + ex.length) continue;
      const k = sentenceKey(sp.text);
      if (!k || words.filter((w) => (' ' + k + ' ').indexOf(' ' + w + ' ') >= 0).length < need) continue;
      const l = lower(O.get(k));
      if (l.length) { found = l; break; }
    }
    if (!found && at >= 0) {
      // The matched place, a little either side (its edge words may be cut), by its shingles.
      const win = kjvEncode(e.doc.text.slice(Math.max(0, at - 40), at + ex.length + 40)).slice(1, -1);
      if (words.filter((w) => win.indexOf(w) >= 0).length >= need) {
        /** @type {Map<string, number>} */ const votes = new Map();
        eachShingle(win, (h) => { for (const x of lower(/** @type {Map<number, string[]>} */ (SHINGLES).get(h))) votes.set(x, (votes.get(x) || 0) + 1); });
        for (const [x, n] of votes) if (n < 2) votes.delete(x);   // two runs shared, not one stray run at the window's edge
        if (votes.size) found = [...votes.keys()].sort((a, b) => /** @type {number} */ (votes.get(b)) - /** @type {number} */ (votes.get(a)));
      }
    }
    if (!found && e.doc.kind === 'answers') {
      const id = idOf.get(e) || '';
      const src = citedOriginal(id, e.doc.text, words);
      // A quote of the Answers' own wording stays with it, when the letter words it otherwise.
      const own = src ? near(id, e.doc) : 0;
      if (src && (own < NEAR_PHRASE_MIN || near(src, D.get(src)) >= own - 0.1)) found = lower([src]);
    }
    if (!found && (e.doc.kind === 'wtlb' || e.doc.kind === 'blessed')) {
      const id = idOf.get(e) || '';
      const src = condensedFrom(id, e.doc.text, tier);
      const pq = passageQuery(words);
      const share = src ? bestWindow(pq.query, docLemmas(id, e.doc.text), pq.span) : 0;
      const own = src ? near(id, e.doc) : 0;
        if (src && share >= 0.5 && holdsAsWell(src, pq, share) && (own < NEAR_PHRASE_MIN || near(src, D.get(src)) >= own - 0.1)) found = [src];
    }
    if (!found || !found.length) continue;
    // The first original of all: a letter before the Words To Live By entry that condenses it.
    const top = Math.min(...found.map((x) => ORIGINAL_TIER[D.get(x).kind]));
    found = found.filter((x) => ORIGINAL_TIER[D.get(x).kind] === top);
    // The original already ranked highest, else the first that the filters allow.
    let j = -1;
    for (let r = 0; r < out.length; r++) if (found.indexOf(idOf.get(out[r]) || '') >= 0) { j = r; break; }
    if (j >= 0 && j < i) continue;
    let entry;
    if (j > i) entry = out.splice(j, 1)[0];
    else {
      const id = found.find((x) => D.has(x) && allowed(D.get(x)));
      if (!id) continue;
      entry = { score: e.score, doc: reshapeDoc(D.get(id)), terms: e.terms || [] };
      idOf.set(entry, id);
    }
    out.splice(i, 0, entry);
    i++;   // the reprint now sits under it
  }
}
/** @type {Promise<boolean>|null} */ let building = null;
let ready = false;
/** @type {Error|null} */ let buildError = null;
/** @type {{docCount?:number, buildMs?:number, collectMs?:number, insertMs?:number, cached?:boolean, translation?:string}} */ let stats = {};

function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

/** Pick only the contract fields onto a clean result doc. */
function reshapeDoc(r) {
  const doc = {};
  for (let i = 0; i < MS_STORE_FIELDS.length; i++) {
    const f = MS_STORE_FIELDS[i];
    doc[f] = r[f];
  }
  return doc;
}

/** Build the in-memory index for one translation (chunked for onProgress). */
async function build(options) {
  options = options || {};
  // a new index is new texts behind the same ids (a translation change): the phrase
  // ranking's token cache must not outlive the index it was read from
  TOKEN_CACHE.clear();
  tokenCacheSize = 0;
  ORIGINALS = null;
  ORIGINAL_DOCS = null;
  SHINGLES = null;
  CITED = null;
  LEMMA_CACHE.clear();
  EXCERPT_CACHE.clear();
  SOURCE_CACHE.clear();
  const code = options.translation || 'nkjv';
  const sig = dataSignature(code);

  // Warm cache: restore the serialized index (~0.3s) instead of rebuilding (~10s).
  try {
    const cachedJson = await loadCached(sig);
    if (cachedJson) {
      const tc = now();
      msIndex = MiniSearch.loadJSON(cachedJson, buildMiniSearchOptions());
      ready = true;
      buildError = null;
      stats = { docCount: msIndex.documentCount, buildMs: Math.round(now() - tc), cached: true, translation: code };
      if (options.onProgress) options.onProgress(stats.docCount, stats.docCount);
      return;
    }
  } catch { /* corrupt / blocked cache — fall through to a fresh build */ }

  // Cold build: collect docs (fast, ~55ms) then index (the slow part, ~10s —
  // chunked so the progress bar animates and the UI stays responsive).
  const t0 = now();
  const docs = buildDocs({ translation: code });
  const t1 = now();
  const ms = new MiniSearch(buildMiniSearchOptions());
  // 500 at a time: a chunk of 2,000 held the main thread for about a second on a
  // slow phone (UI audit 2026-09-27), and the box stalled under the reader's typing.
  const CHUNK = 500;
  for (let i = 0; i < docs.length; i += CHUNK) {
    ms.addAll(docs.slice(i, i + CHUNK));
    if (options.onProgress) options.onProgress(Math.min(i + CHUNK, docs.length), docs.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (options.onProgress) options.onProgress(docs.length, docs.length);
  const t2 = now();
  msIndex = ms;
  ready = true;
  buildError = null;
  stats = {
    docCount: docs.length,
    buildMs: Math.round(t2 - t0),
    collectMs: Math.round(t1 - t0), // buildDocs (tokenizer-bound)
    insertMs: Math.round(t2 - t1), // MiniSearch addAll (index-bound)
    cached: false,
    translation: code,
  };
  // Persist for next session (fire-and-forget) once the reader is not waiting on it:
  // serializing the index is one long task (1.7 s on a slow phone), and it ran the
  // moment the build finished, so the first search froze behind it (UI audit
  // 2026-09-27).
  onIdle(() => { saveCached(sig, JSON.stringify(ms)).catch(() => {}); }, { timeout: 15000, fallbackDelay: 3000 });
}

function sameTranslation(opts) {
  return !opts || !opts.translation || stats.translation === opts.translation;
}

/**
 * Build (or rebuild on translation change) the index. Concurrent calls share
 * one in-flight build. SearchScreen calls this once on mount.
 * @param {{translation?:string, onProgress?:(done:number,total:number)=>void}} [options]
 * @returns {Promise<boolean>}
 */
function init(options) {
  options = options || {};
  if (ready && sameTranslation(options)) return Promise.resolve(true);
  if (building) return building;
  building = build(options)
    .then(() => { building = null; return true; })
    .catch((e) => { building = null; buildError = e; throw e; });
  return building;
}

async function ensureReady(options) {
  if (ready && sameTranslation(options)) return;
  await init(options);
}

/**
 * Execute a search.
 * @param {string} query
 * `limit` caps the hits in all; `perVolume`, when given, caps each collection's own
 * (doc.volumeId: 'bible', 'v7', 'answers'...). A single total let the Bible's verses
 * fill the whole budget in the All corpus: "love" kept 90 of its 379 volume hits and
 * "lord" 125 of 890, with no sign anything was missing. `capped` names every
 * collection that hit its cap (it may hold more), `truncated` says the total did.
 * `_corrected` is the engine's own: this search is a corrected query's re-run.
 * @param {{translation?:string, useStopWords?:boolean, synonyms?:boolean, scope?:{bookId?:string,volumeId?:string}|null, corpus?:string, limit?:number, perVolume?:number, allWords?:boolean, _corrected?:boolean, _unquoted?:boolean}} [options]
 * `corrections` lists each typed word that found nothing of its own and was
 * searched as the nearest indexed word instead ({ from: 'shephard', to: 'shepherd' }).
 * @returns {Promise<{parsed:Object|null, results:Array<{score:number, doc:Object, terms?:string[]}>, parsedTerms?:string[], textQuery?:Object|null, capped?:string[], truncated?:boolean, corrections?:Array<{from:string, to:string}>, stopWordsOnly?:boolean, unquoted?:string}>}
 */
async function search(query, options) {
  options = options || {};
  let limit = options.limit || 200;
  const corpus = options.corpus || 'all';

  /* THE PARSE GOES FIRST, BECAUSE IT NEEDS NO INDEX (search-6). `parseReference`
     reads only the `searchData()` tables, which ship in bundle-a and are loaded
     before the app renders — the suggest box already relies on that, answering at
     one character with no index at all.

     `await ensureReady` used to sit above this line, so a command and every
     structured reference waited for a ~10 s cold build and then returned
     `results: []` without ever touching MiniSearch. The reader typed "gen 1" and
     got nothing for ten seconds, for a lookup the index has no part in.

     ONLY THE TEXT BRANCH WAITS NOW, and it waits in the same place it always did
     — the wait was moved, not removed. A case asserts a text query still builds,
     because "the index was not built" is otherwise satisfied by a search() that
     stopped building for everything. */
  query = expandContractions(query);
  const parsed = parseReference(query, { corpus });
  if (!parsed) return { parsed: null, results: [] };
  // Command + structured references (bible / book / letter / named-passage) are
  // answered by a direct-nav card built in the UI — skip text search entirely.
  if (NAV_ONLY_KINDS.has(parsed.kind)) return { parsed, results: [], parsedTerms: [], textQuery: null };

  await ensureReady(options);

  /* search-2 — A BARE BOOK NAME AND A NAMED-PASSAGE KEY KEEP THEIR CARD AND ALSO
     RUN THE TEXT PIPELINE. Until now every non-text parse returned `results: []`,
     so a reader who typed "Revelation" got a card to the book and not one verse
     containing the word. The cost landed on the book names that are also ordinary
     English words: Numbers, Judges, Kings, Chronicles, Job, Psalms, Proverbs,
     Song, Acts, Revelation, Lamentations, James, Jude.

     The card is untouched — SearchScreen already renders direct entries ABOVE the
     results list — so the reader who wanted the book loses nothing and the reader
     who wanted the word stops being told there is nothing. Owner's decision
     (2026-09-06): card first, text below, capped.

     `parsed` stays the NAV kind, because that is what builds the card; the text
     pipeline needs the same query parsed as TEXT, which is what `p` is. Two
     readings of one query, and the return carries both. */
  const navAlso = parsed.kind !== 'text';
  const p = navAlso ? parseTextQuery(query) : parsed;
  // `allWords`: the reader asked for every match under the card (SearchScreen).
  if (navAlso && !options.allWords) limit = Math.min(limit, NAV_TEXT_LIMIT);
  const D = searchData();
  const terms = (p.phrase ? p.phrase.split(/\s+/) : p.terms.map(withoutPossessive)).concat(p.must);
  const useStop = options.useStopWords !== false;

  // All-stop-word query → no searchable content.
  if (useStop && terms.length && terms.every(isStopTerm)) {
    return { parsed, results: [], parsedTerms: [], textQuery: null, stopWordsOnly: true };
  }
  let filtered;
  if (!useStop || terms.length <= 4) filtered = terms.slice();
  else { filtered = terms.filter((t) => !isStopTerm(t)); if (!filtered.length) filtered = terms; }
  if (!filtered.length && !p.phrase) return { parsed, results: [], parsedTerms: filtered, textQuery: p };

  // Build search units (literal + synonyms).
  let units;
  let didExpand = false;
  if (p.phrase) {
    units = [{ term: p.phrase, origin: 0, literal: true }];
  } else {
    const ex = expandQueryTerms(filtered, { enabled: options.synonyms !== false });
    units = ex.units;
    didExpand = ex.didExpand;
    /* WORD FORMS (2026-09-26). A literal word reaches only forward through its
       prefix ("flood" finds flooding; "flooding" never finds flood), so typing
       "prayed" missed 397 of the 463 pray-family results. Each one-word literal
       adds its family (word-forms.js) as exact, non-literal units under the
       same origin: they count toward the word's coverage, a doc found only
       through them takes the synonym demotion, so the typed form ranks first,
       and a form not in the index finds nothing. Never for a phrase. */
    const had = new Set(units.map((u) => String(u.term).toLowerCase()));
    const forms = [];
    for (const u of units) {
      if (!u.literal) continue;
      const toks = kjvEncode(u.term);
      if (toks.length !== 1) continue;
      for (const f of wordForms(toks[0], (w) => D.STOP_WORDS_TRIMMED.has(w))) {
        if (had.has(f)) continue;
        had.add(f);
        forms.push({ term: f, origin: u.origin, literal: false, form: true });
      }
    }
    if (forms.length) { units = units.concat(forms); didExpand = true; }
    /* A NAME TYPED IN PARTS (search audit 2026-09-27). The Volumes write HaMashiach
       and YahuShua as one word, so "Ha Mashiach" found only the texts that split it.
       Two typed words side by side that the index holds as one word are searched as
       that word too, standing for both (its `cover`). */
    for (let i = 0; i + 1 < filtered.length && i + 1 < 31; i++) {
      const a = kjvEncode(filtered[i]);
      const b = kjvEncode(filtered[i + 1]);
      if (a.length !== 1 || b.length !== 1) continue;
      // not with a stop word: "in deed" is not "indeed"
      if (D.STOP_WORDS_TRIMMED && (D.STOP_WORDS_TRIMMED.has(a[0]) || D.STOP_WORDS_TRIMMED.has(b[0]))) continue;
      const joined = a[0] + b[0];
      if (joined.length < 5 || had.has(joined) || !termExists(joined)) continue;
      had.add(joined);
      units.push({ term: joined, origin: i, cover: (1 << i) | (1 << (i + 1)), literal: false, joined: true });
      didExpand = true;
    }
  }

  // One BM25 search per unit; accumulate score + coverage bitmask.
  const scoreMap = Object.create(null);
  const termMask = Object.create(null);
  const literalHit = Object.create(null);
  const matchedTerms = Object.create(null);
  /** @type {Record<string, Array<[number, string[]]>>} an Answers topic's matched words, each with the query words it counts for */
  const answersHits = Object.create(null);
  const docLookup = Object.create(null);
  const unitOpts = (unit) => ({ prefix: unit.literal ? prefixable : false, fuzzy: false, combineWith: 'AND', boost: MS_SEARCH_DEFAULTS.boost });
  // A stop word the reader typed among real words ranks, but is not a word to mark:
  // its matches do not ride on the result for the snippet and the find bar.
  const contentTyped = units.some((u) => u.literal && !isStopTerm(u.term));
  /* A word or two is a keyword search, and a word in a title is the strongest sign of
     the text meant ("144000", "false prophets"). More is a passage or a title typed out,
     and the original of a passage comes before the texts that reprint it. */
  const STOP_TRIMMED = D.STOP_WORDS_TRIMMED;
  const contentWords = p.phrase
    ? kjvEncode(p.phrase).filter((t) => !(STOP_TRIMMED && STOP_TRIMMED.has(t))).length
    : units.filter((u) => u.literal && !isStopTerm(u.term)).length;
  const keyword = contentWords <= KEYWORD_CONTENT_WORDS && kjvEncode(p.phrase || query).length <= KEYWORD_WORDS;
  /** @param {any} unit @param {any[]} res */
  const accumulate = (unit, res) => {
    const weight = unit.literal || unit.joined ? 1 : unit.form ? FORM_WEIGHT : SYNONYM_WEIGHT;
    for (let r = 0; r < res.length; r++) {
      const hit = res[r];
      const id = hit.id;
      scoreMap[id] = (scoreMap[id] || 0) + hit.score * weight;
      if (!docLookup[id]) docLookup[id] = hit;
      if (unit.literal || unit.joined) literalHit[id] = true;   // a text found only through a form or a synonym is demoted below: the typed form first
      if ((unit.literal || unit.form || unit.joined) && !(contentTyped && isStopTerm(unit.term))) {
        // hit.terms is the DOC-side vocabulary that matched (MiniSearch derives
        // it from the match map), so for a fuzzy/prefix hit it's the corrected
        // word — query "sheperd" carries "shepherd" here. The snippet
        // highlighter only knows the literal typed terms, so these ride along
        // on the result for the UI to merge in (v1.1 gap: corrected words
        // rendered unmarked). A word-form unit's hit ("flood" for a typed
        // "flooding") rides the same way, or its snippet would show no mark.
        // Not synonym units: they match exactly, and SRCH4's
        // expandSnippetTerms already covers those.
        if (hit.terms) {
          const mt = matchedTerms[id] || (matchedTerms[id] = []);
          for (let t = 0; t < hit.terms.length && mt.length < 12; t++) {
            if (mt.indexOf(hit.terms[t]) < 0) mt.push(hit.terms[t]);
          }
        }
      }
      if (unit.origin < 31) {
        termMask[id] = (termMask[id] || 0) | (unit.cover || (1 << unit.origin));
        if (hit.kind === 'answers' && hit.terms) (answersHits[id] || (answersHits[id] = [])).push([unit.cover || (1 << unit.origin), hit.terms]);
      }
    }
  };
  const heard = Object.create(null);   // origin -> some unit of that word found something
  const unheard = [];                  // literal units that found nothing as typed
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    let res;
    try { res = searchUnit(unit.term, unitOpts(unit), keyword); } catch { continue; }
    if (res && res.length) { heard[unit.origin] = true; accumulate(unit, res); }
    else if (unit.literal) unheard.push(unit);
  }
  /* THE TYPO FALLBACK WAITS FOR THE WHOLE FAMILY (2026-09-26). A typed word that
     finds nothing as typed but whose forms or synonyms do is a real word this
     corpus happens to inflect differently ("prays", where the text says pray and
     prayed); correcting it to the nearest spelling instead could land on any
     one-edit neighbour with more documents ("rays"). Only a word nothing of its
     own reached is a typo, and the correction is reported so the screen can say
     "Showing results for shepherd" rather than change the reader's words
     silently. */
  const corrections = [];
  // Under a card (a book name, a named passage) the card answers the query: no typo
  // guess ("Beatitudes", the quick pick, showed "Showing results for platitudes").
  for (let u = 0; u < (navAlso ? 0 : unheard.length); u++) {
    const unit = unheard[u];
    if (heard[unit.origin]) continue;
    if (/\d/.test(unit.term)) continue;   // a number is not a typo: "316" is not "16"
    let fixed;
    try { fixed = searchCorrected(unit.term, unitOpts(unit), keyword); } catch { continue; }
    if (!fixed.res.length) continue;
    accumulate(unit, fixed.res);
    const typed = kjvEncode(unit.term);
    if (fixed.to && typed.length === 1 && typed[0] !== fixed.to) corrections.push({ from: typed[0], to: fixed.to });
  }
  /* A CORRECTED QUERY IS SEARCHED AS THAT QUERY (2026-09-27). "Showing results for
     shepherd" showed 152 results where "shepherd" shows 171 (the UI walk): the
     corrected word was searched bare, without the synonyms, forms and phrase ranking
     the same word gets when typed. Re-run the query with the corrections put in, and
     report them. */
  if (corrections.length && !options._corrected) {
    const fixedQuery = applyCorrections(query, corrections);
    if (fixedQuery !== query.trim()) {
      const again = await search(fixedQuery, { ...options, _corrected: true });
      return { ...again, corrections: corrections.concat(again.corrections || []) };
    }
  }

  /* THE WORDS THAT COUNT (2026-09-27). Coverage and the phrase ranking ask whether a
     doc holds every word the reader typed; that is every origin with a literal unit.
     A word typed twice has one unit (synonyms.js), at its first place, so counting
     the typed terms themselves ("dust you are and to dust you shall return": dust
     twice) asked for a coverage no doc could reach and the phrase never ranked. */
  let requiredMask = 0;
  for (let u = 0; u < units.length; u++) if (units[u].literal && units[u].origin < 31) requiredMask |= (1 << units[u].origin);
  const required = popcount(requiredMask);

  const rankedIds = Object.keys(scoreMap);
  // KIND_BOOST (once).
  for (let i = 0; i < rankedIds.length; i++) {
    const d = docLookup[rankedIds[i]];
    const kb = d && KIND_BOOST[d.kind];
    if (kb) scoreMap[rankedIds[i]] *= kb;
  }
  // Coverage multiplier (distinct original terms matched); an Answers topic's, within one excerpt.
  for (let i = 0; i < rankedIds.length; i++) {
    const id = rankedIds[i];
    const cc = answersHits[id] ? excerptCover(id, docLookup[id].text || '', answersHits[id]) : popcount(termMask[id] || 0);
    if (cc > 1) scoreMap[rankedIds[i]] *= coverageMultiplier(cc);
  }
  /* THE PHRASE RANKING, graded (search audit 2026-09-27). A text holding the typed
     words together outranks one that scatters them: the exact run of every typed word
     x PHRASE_BOOST as before; a run one word off (a word swapped, dropped or added)
     by how much of it the text holds together (ranking.js nearPhrase). Read on the
     PHRASE_CANDIDATES best-scored texts holding every typed word, or all but one of
     three or more. A corrected word counts as the word it was corrected to, so "the
     lord is my shephard" ranks Psalm 23:1 the way the phrase spelled right does. */
  const fixedTo = Object.create(null);
  /** @type {Record<string, number>} the phrase pass's reading: how nearly a text holds the typed words in a row */
  const nearOf = Object.create(null);
  for (let c = 0; c < corrections.length; c++) fixedTo[corrections[c].from] = corrections[c].to;
  const typedTokens = joinApostropheS(kjvEncode(query).map((t) => fixedTo[t] || t));
  const STOP = D.STOP_WORDS_TRIMMED;
  if (!p.phrase && required > 1 && typedTokens.length > 1) {
    const needCover = required >= 3 ? required - 1 : required;
    const cands = rankedIds.filter((id) => popcount((termMask[id] || 0) & requiredMask) >= needCover)
      .sort((a, b) => scoreMap[b] - scoreMap[a])
      .slice(0, PHRASE_CANDIDATES);
    for (const id of cands) {
      const d = docLookup[id];
      if (!d) continue;
      const toks = docTokens(id, d);
      const exact = hasTokenRun(toks, typedTokens);
      const near = exact ? 1 : nearPhrase(toks, typedTokens, STOP);
      nearOf[id] = near;
      if (exact) scoreMap[id] *= PHRASE_BOOST;
      else if (near >= NEAR_PHRASE_MIN) scoreMap[id] *= 1 + (PHRASE_BOOST - 1) * near * near;
      // the original before a reprint when both hold the phrase
      if (near >= 0.9 && !keyword && !REPRINT_KINDS.has(d.kind)) scoreMap[id] *= ORIGINAL_BOOST;
    }
  }
  // A quoted phrase: every text shown holds it (the filter below), so the original first.
  if (p.phrase) {
    for (let i = 0; i < rankedIds.length; i++) {
      const d = docLookup[rankedIds[i]];
      if (d && !REPRINT_KINDS.has(d.kind)) scoreMap[rankedIds[i]] *= ORIGINAL_BOOST;
    }
  }
  // A title typed whole, or a run of it, ranks its unit up (ranking.js titleMatch).
  if (typedTokens.length) {
    for (let i = 0; i < rankedIds.length; i++) {
      const d = docLookup[rankedIds[i]];
      if (!d || !d.title || d.kind === 'verse') continue;
      const tm = titleMatch(kjvEncode(d.title), typedTokens, STOP);
      if (tm > 1) scoreMap[rankedIds[i]] *= tm;
    }
  }
  // Synonym-only demotion.
  if (didExpand) {
    for (let i = 0; i < rankedIds.length; i++) {
      if (!literalHit[rankedIds[i]]) scoreMap[rankedIds[i]] *= SYNONYM_DEMOTION;
    }
  }

  rankedIds.sort((a, b) => scoreMap[b] - scoreMap[a]);

  // Post-ranking filters + dedup + cap.
  const out = [];
  /** @type {Map<any, string>} */ const idOf = new Map();
  const seen = Object.create(null);
  // A quoted phrase and +/- words match WORDS, on the index's own tokens
  // (kjvEncode folds case, accents and both apostrophes, and splits on every
  // punctuation mark). The raw substring test this replaces missed "shepherd; I"
  // and the curly "Lord’s", and read "heart" as containing "art" (v07-02).
  const phraseToks = p.phrase ? kjvEncode(p.phrase) : null;
  const hasMust = !!(p.must && p.must.length);
  const hasMustNot = !!(p.mustNot && p.mustNot.length);
  const mustToks = hasMust ? p.must.map((t) => kjvEncode(t)) : [];
  const mustNotToks = hasMustNot ? p.mustNot.map((t) => kjvEncode(t)).filter((run) => run.length) : [];
  const scope = options.scope || null;
  const scopeBookId = scope && scope.bookId ? scope.bookId : null;
  const scopeVolumeId = scope && scope.volumeId ? scope.volumeId : null;
  const corpusFilter = corpus === 'all' ? null : corpus;
  const perVolume = options.perVolume || 0;
  const volCount = Object.create(null);
  const capped = Object.create(null);

  let h = 0;
  for (; h < rankedIds.length && out.length < limit; h++) {
    const id = rankedIds[h];
    const doc = docLookup[id];
    if (!doc) continue;
    if (corpusFilter && doc.corpus !== corpusFilter) continue;
    if (scopeBookId && doc.bookId !== scopeBookId) continue;
    if (scopeVolumeId && doc.volumeId !== scopeVolumeId) continue;
    // Before the word filters, which tokenise the whole doc: a full collection
    // costs nothing more to pass over. (A doc the filters would have refused can
    // mark its collection capped, so "400+" may mean exactly 400; never fewer.)
    const vid = doc.volumeId || '';
    if (perVolume && (volCount[vid] || 0) >= perVolume) { capped[vid] = true; continue; }
    if (phraseToks || hasMust || hasMustNot) {
      const toks = kjvEncode((doc.text || '') + ' ' + (doc.title || '') + ' ' + (doc.heading || '') + ' ' + (doc.ref || ''));
      if (phraseToks && !hasTokenRun(toks, phraseToks)) continue;
      if (hasMust && !mustToks.every((run) => hasTokenRun(toks, run))) continue;
      if (mustNotToks.some((run) => hasTokenRun(toks, run))) continue;
    }
    const dedupKey = doc.kind + '|' + (doc.ref || '') + '|' + (doc.text || '').slice(0, 60);
    if (seen[dedupKey]) continue;
    seen[dedupKey] = true;
    volCount[vid] = (volCount[vid] || 0) + 1;
    const entry = { score: scoreMap[id], doc: reshapeDoc(doc), terms: matchedTerms[id] || [] };
    idOf.set(entry, id);
    out.push(entry);
  }
  // A title the query names keeps its place; in a keyword search, a title holding one of its words ("144,000").
  const named = (/** @type {any} */ d) => {
    if (!d.title) return false;
    const tt = kjvEncode(d.title);
    return titleMatch(tt, typedTokens, STOP) > 1 || (keyword && typedTokens.some((w) => !(STOP && STOP.has(w)) && tt.indexOf(w) >= 0));
  };
  // A first result holding the typed words in a row, or one word off, is a quote found: no re-ordering.
  const quoted = out.length && (nearOf[idOf.get(out[0]) || ''] || 0) >= NEAR_PHRASE_MIN;
  if (!keyword && !p.phrase && !quoted) bestPassageFirst(out, idOf, units, isStopTerm, named);
  originalsFirst(out, idOf, (p.phrase ? [p.phrase] : []).concat(filtered.filter((t) => !isStopTerm(t))), (d) =>
    (!corpusFilter || d.corpus === corpusFilter) && (!scopeBookId || d.bookId === scopeBookId) && (!scopeVolumeId || d.volumeId === scopeVolumeId),
    named, (id, d) => nearOf[id] ?? (typedTokens.length > 1 ? nearPhrase(docTokens(id, d), typedTokens, STOP) : 0));
  /* MATTHEW ONCE (search plan S1, 2026-10-05). Matthew is in the corpus twice, the Study Bible's
     restored text under The Volumes and the plain chapter under Scriptures, so "judge not" showed
     Matthew 7:1 twice, one under the other. Across both collections a verse shows once, as whichever
     of the two the query found first; a search kept to one collection still finds its own. */
  if (!corpusFilter) {
    const seenVerse = new Set();
    let w = 0;
    for (let r = 0; r < out.length; r++) {
      const d = out[r].doc;
      if (d.kind === 'verse' && (d.bookId === 'matthew' || d.bookId === 'matthew-plain')) {
        const k = d.chapterNum + ':' + d.verseNum;
        if (seenVerse.has(k)) continue;
        seenVerse.add(k);
      }
      out[w++] = out[r];
    }
    out.length = w;
  }

  /* A QUOTED PHRASE NOTHING HOLDS IS SEARCHED AS ITS WORDS (search audit 2026-09-27).
     A quote remembered one word off ("the earth shall grow old like a garment", where
     the letter says "will") showed "No results" with the letter a word away; the
     reader had to know to take the quote marks off. `unquoted` names the phrase, so
     the screen can say what it did. */
  if (p.phrase && !out.length && !options._unquoted) {
    const again = await search(String(query).replace(/["\u201C\u201D\u201E\u201F]/g, ' '), { ...options, _unquoted: true });
    if (again.results && again.results.length) return { ...again, unquoted: p.phrase };
  }
  return { parsed, results: out, parsedTerms: filtered, textQuery: p, capped: Object.keys(capped), truncated: out.length >= limit && h < rankedIds.length, corrections };
}

/**
 * Autocomplete suggestions (named passages + book names + commands).
 * @param {string} query
 * @param {{max?:number}} [opts]
 * @returns {Array<{kind:string, label:string, query:string, hint?:string}>}
 */
function suggest(query, opts) {
  opts = opts || {};
  const max = opts.max || 10;
  const out = [];
  if (!query || query.length < 1) return out;
  const D = searchData();
  const q = query.trim().toLowerCase();

  for (let i = 0; i < D.NAMED_PASSAGES.length && out.length < max; i++) {
    const np = D.NAMED_PASSAGES[i];
    for (let k = 0; k < np.keys.length; k++) {
      if (np.keys[k].indexOf(q) === 0) {
        out.push({
          kind: 'passage',
          label: np.keys[k].replace(/\b\w/g, (c) => c.toUpperCase()),
          query: np.keys[k],
          hint: (D.BOOK_DISPLAY[np.bookId] || np.bookId) + ' ' + np.chapter + (np.verseStart ? ':' + np.verseStart + (np.verseEnd ? '-' + np.verseEnd : '') : ''),
        });
        break;
      }
    }
  }

  const bookSeen = Object.create(null);
  const abbrevKeys = Object.keys(D.BOOK_ABBREVS);
  for (let b = 0; b < abbrevKeys.length && out.length < max; b++) {
    const k2 = abbrevKeys[b];
    if (k2.length < 2) continue;
    if (k2.indexOf(q) === 0) {
      const bid = D.BOOK_ABBREVS[k2];
      if (bookSeen[bid]) continue;
      bookSeen[bid] = true;
      out.push({ kind: 'book', label: D.BOOK_DISPLAY[bid] || bid, query: D.BOOK_DISPLAY[bid] || bid, hint: 'Book' });
    }
  }

  for (let c = 0; c < D.COMMANDS.length && out.length < max; c++) {
    for (let cc = 0; cc < D.COMMANDS[c].keys.length; cc++) {
      if (D.COMMANDS[c].keys[cc].indexOf(q) === 0) {
        out.push({ kind: 'command', label: D.COMMANDS[c].label, query: D.COMMANDS[c].keys[cc], hint: 'Command' });
        break;
      }
    }
  }
  return out;
}

/** Drop the in-memory index and rebuild for the active (or given) translation. */
function rebuild(options) {
  options = options || {};
  const code = options.translation || stats.translation || 'nkjv';
  ready = false;
  msIndex = null;
  clearCached().catch(() => {});
  return init({ translation: code });
}

function getState() {
  return {
    ready,
    building: !!building,
    error: buildError ? buildError.message : null,
    docCount: stats.docCount || 0,
    translation: stats.translation || null,
  };
}

function getStats() {
  return Object.assign({}, stats);
}

export const VotSearchMini = {
  init,
  rebuild,
  parse: parseReference,
  search,
  suggest,
  snippet,
  matchExcerpt,
  morePlaces,
  findPlaces,
  highlightSpans,
  levenshtein,
  fuzzyBookSuggest,
  getState,
  getStats,
};

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
import { snippet, snippetAt, highlightSpans, matchExcerpt, morePlaces, findPlaces } from './snippet.js';
import {
  KIND_BOOST, coverageMultiplier, popcount, PHRASE_BOOST, SYNONYM_DEMOTION,
  BM25_PARAMS, KEYWORD_BM25, KEYWORD_CONTENT_WORDS, KEYWORD_WORDS, joinApostropheS, SYNONYM_WEIGHT, FORM_WEIGHT, NEAR_PHRASE_MIN, ORIGINAL_BOOST, REPRINT_KINDS, nearPhrase, titleMatch, TITLE_EXACT_BOOST,
} from './ranking.js';
import { loadCached, saveCached, clearCached, dataSignature } from './cache.js';
import { onIdle } from '../utils/on-idle.js';
import { lemma, bestWindow } from './passage.js';
import { startSemantic, semanticDocs, semanticStatus, semanticReady, docUnitKey } from './semantic.js';
import { KJV_ALIAS, KJV_ALIAS_BOOKS } from './kjv-alias.js';
import { searchWorker } from './worker-client.js';
import { indexAssembler } from './index-transfer.js';

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
/** The query without its -words, each +word as its word: what the reader wants found. @param {string} q */
function wantedQuery(q) {
  return String(q).split(/\s+/).filter((t) => !(t.length > 1 && t[0] === '-')).map((t) => (t.length > 1 && t[0] === '+' ? t.slice(1) : t)).join(' ');
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
/* A negative contraction typed without its apostrophe ("dont") is no typo (sr11 t216): it
   may be read as the word a text's own contraction leaves ("don't" -> don + t), never as
   another word. The corrector read "cant" as "chant", "wasnt" as "want", "shouldnt" as
   "should", "arent" as "parent", said so ("Showing results for chant"), and the meaning
   model was asked the same. Read as two words instead it lost a sealed query whose text
   contracts. "wont" is no such word here: the KJV's ("the ox was wont to gore"). */
const NT_BARE = /^(ca|do|does|did|is|are|was|were|has|have|had|could|would|should|must|need|sha|ai)nt$/;

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

/* A KJV WORD THE INDEX NEVER HEARD (search plan S1, 2026-10-05). The index holds the reader's
   edition, so "begat", "mitre", "pretence" or "wist" found nothing in the NKJV and the typo
   fallback turned them into beat, mire, presence and wits. kjv-alias.js (generated from
   bible-kjv.js) lists each word no indexed text holds with the verses the KJV holds it in; such
   a word finds those verses, scored as a rare word in a verse, and is never corrected. */
/** @type {Map<string, string>|null} word -> its encoded verses */ let ALIAS = null;
/** @type {Map<string, string>|null} 'bookId:c:v' -> the verse's doc id in this index */ let VERSE_IDS = null;
/** @type {Map<string, string>|null} unitKey -> doc id in this index: how a meaning hit (semantic.js) names its document */ let UNIT_IDS = null;
/**
 * The verses of this index the KJV holds `term` in, as search hits; null when it is no such word.
 * @param {string} term
 * @returns {Array<{id: string, score: number, terms: string[]}>|null}
 */
function kjvAliasHits(term) {
  if (!ALIAS) {
    ALIAS = new Map();
    for (const line of KJV_ALIAS.split('\n')) { const t = line.indexOf('\t'); ALIAS.set(line.slice(0, t), line.slice(t + 1)); }
  }
  const enc = ALIAS.get(term);
  if (!enc) return null;
  if (!VERSE_IDS) {
    VERSE_IDS = new Map();
    const ids = msIndex._documentIds;
    for (const [shortId, f] of msIndex._storedFields) {
      if (!f || f.kind !== 'verse') continue;
      // Matthew's plain chapter, not the Study Bible's restored text (both index it)
      const key = (f.bookId === 'matthew-plain' ? 'matthew' : f.bookId) + ':' + f.chapterNum + ':' + f.verseNum;
      if (f.bookId !== 'matthew' || !VERSE_IDS.has(key)) VERSE_IDS.set(key, ids.get(shortId));
    }
  }
  const refs = enc.split(',');
  const n = msIndex.documentCount || 1;
  const score = Math.log(1 + (n - refs.length + 0.5) / (refs.length + 0.5));
  const out = [];
  let book = '';
  for (const r of refs) {
    const p = r.split('.');
    // the alias names Matthew's verses by the plain chapter's book id; VERSE_IDS keys them 'matthew' (sweep W29)
    if (p.length === 3) { book = KJV_ALIAS_BOOKS[parseInt(p.shift() || '', 36)]; if (book === 'matthew-plain') book = 'matthew'; }
    const id = VERSE_IDS.get(book + ':' + parseInt(p[0], 36) + ':' + parseInt(p[1], 36));
    if (id) out.push({ id, score, terms: [term] });
  }
  return out;
}

/** A KJV verb's modern form the index holds: seeth -> sees, cometh -> comes, seest -> see, knowest -> know. */
function modernForm(/** @type {string} */ t) {
  const m = /^(.{2,})(eth|est)$/.exec(t);
  if (!m) return null;
  const cands = m[2] === 'eth' ? [m[1] + 'es', m[1] + 's'] : [m[1], m[1] + 'e'];
  for (const c of cands) if (c !== t && termExists(c)) return c;
  return null;
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
    // beyond one slip for a word of seven letters or fewer, unless it is the same word by ear
    if (rank === 4 && budget < 2 && !(word[0] === w[0] && skeleton(word) === skeleton(w))) continue;
    if (best === null || rank < bestRank || (rank === bestRank && (docs[w] > docs[best] || (docs[w] === docs[best] && w < best)))) {
      best = w;
      bestRank = rank;
    }
  }
  if (best) return { res: searchUnit(best, opts, keyword), to: best };
  return (weakSplit && split()) || { res: [], to: null };
}

/** A word's consonants as heard: vowels and h dropped, doubles single ("shepard" and "shepherd": sprd). */
function skeleton(/** @type {string} */ w) {
  return w.replace(/[aeiouyh]/g, '').replace(/(.)\1+/g, '$1');
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
/** A close match holds this share of the query's content words in one passage, rare words weighing most (sr13). */
const CLOSE_SHARE = 0.75;

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

/* WHERE IT LANDS, BY MEANING (path to 500, 2026-10-05). A text the words found opens where the
   typed words sit thickest (use-search matchExcerpt). For a reader who described the passage,
   those words can sit in the wrong place: "everyone struggling and burdened come to me for rest"
   cut its excerpt at a "come" two paragraphs from the passage. The first results open on the
   passage the model matched instead, when it means the query clearly more nearly than the
   passage holding the excerpt (LAND_MARGIN). A passage is three sentences and the reader's words
   point at one of them (search sr10, 2026-10-14): a text opened on a passage opens on the sentence
   of it holding most of the typed words, not on its first ("every preacher speaks blasphemy and
   every church altar is corrupted" opened a sentence above "blasphemy is heard from every pulpit"). */
const LAND_REACH = 3;
const LAND_MARGIN = 0.1;
/** The sentences of a matched passage read for the one the typed words point at. */
const LAND_SENTENCES = 3;
/**
 * The start of the sentence, among a passage's first LAND_SENTENCES, holding most of the typed words
 * (the first of equals); the passage's own start when none holds one.
 * @param {string} text
 * @param {number} start  the passage's start
 * @param {Set<string>} words  the typed content words, as lemmas
 */
function sentenceAt(text, start, words) {
  let best = start;
  let most = 0;
  for (const sp of sentenceSpans(text.slice(start, start + MEANING_SPAN)).slice(0, LAND_SENTENCES)) {
    const held = new Set(kjvEncode(sp.text).map(lemma).filter((l) => words.has(l))).size;
    if (held > most) { most = held; best = start + sp.start + (sp.text.length - sp.text.trimStart().length); }
  }
  return best;
}
/**
 * @param {Array<{doc:any, placeStart?:number, terms?:string[]}>} out
 * @param {Map<any, string>} idOf
 * @param {Array<{id:string, start:number, passages: () => Array<[number, number]>}>} sem
 * @param {string[]} terms
 */
function meaningLanding(out, idOf, sem, terms) {
  const byId = new Map(sem.map((s) => [s.id, s]));
  for (const e of out.slice(0, LAND_REACH)) {
    if (e.doc.kind === 'verse' || typeof e.placeStart === 'number' || !e.doc.text) continue;
    const s = byId.get(idOf.get(e) || '');
    if (!s || s.start < 0) continue;
    const ex = terms.length ? matchExcerpt(e.doc.text, terms, undefined, e.terms) : '';
    const at = ex ? e.doc.text.indexOf(ex) : -1;
    if (at < 0) continue;
    const ps = s.passages();
    let lex = null;
    for (const pp of ps) if (pp[0] <= at) lex = pp;
    const bestScore = Math.max(...ps.map((pp) => pp[1]));
    if (lex && bestScore - lex[1] > LAND_MARGIN && s.start !== lex[0]) e.placeStart = s.start;
  }
  // Every text opened on a matched passage (here, or meaningFirst's own finds): on its sentence the words point at.
  const words = new Set(terms.flatMap((t) => kjvEncode(t)).filter((w) => !isStopTerm(w)).map(lemma));
  if (!words.size) return;
  for (const e of out) {
    if (typeof e.placeStart === 'number' && e.placeStart >= 0 && e.doc.text) e.placeStart = sentenceAt(e.doc.text, e.placeStart, words);
  }
}

/** unitKey -> this index's doc id: how a meaning hit (semantic.js) names its document. */
function unitId(/** @type {string} */ key) {
  if (!UNIT_IDS) {
    UNIT_IDS = new Map();
    const ids = msIndex._documentIds;
    for (const [shortId, f] of msIndex._storedFields) {
      const k = docUnitKey(f);
      if (k && !UNIT_IDS.has(k)) UNIT_IDS.set(k, ids.get(shortId));
    }
  }
  return UNIT_IDS.get(key);
}

/* MEANING FIRST (path to 500, step 1, 2026-10-05). The on-device model (semantic.js)
   ranks every passage by what it means; the words engine ranks by what it says. Their
   two orders are fused over the words engine's top MEANING_REACH (reciprocal rank,
   k = MEANING_K), and the model's own best MEANING_ADD documents join them even when
   no typed word reaches them ("god says he lives among israel and his people will
   never be ashamed" -> Joel 2:27). The meaning weighs more the less of the query the
   words found together in one passage (a quote typed nearly right stays the words'
   find); a title the query names keeps the lead. A document only the meaning found
   opens on the passage the model matched (entry.placeStart, which use-search lands
   on); one the words found too lands where they do. Measured on the benchmark
   (lanes/search/out/p5): 413 -> 424/500.
   SURE AND UNSURE (search sr10, 2026-10-14). The model's score says how sure it is. Its clear
   first (MEANING_SURE ahead of the next text it ranks) leads, unless a named title does or the
   words hold the whole query in one passage: on the benchmark its right picks led by 0.05-0.09
   (Joel 2:27 for the query above came 3rd, behind letters holding its words) and its wrong ones
   by 0-0.02. Two texts it ranks within MEANING_TIE it cannot tell apart: the original kind goes
   first (ORIGINAL_TIER), as a reprint gives way to its original. 440 -> 445/500, none lost. */
const MEANING_REACH = 30;
const MEANING_ADD = 10;
/** How many of the model's best documents a search kept to a collection or scope reads (else semanticDocs' 60). */
const MEANING_FILTERED = 300;
const MEANING_K = 10;
/** How much text from a matched passage's start names its original (a unit is three sentences). */
const MEANING_SPAN = 400;
/** Runs it must share with an original to be its reprint: more than the typed-words rule's 2, since no typed word
    vouches for the passage (2 and 3 moved a stray letter up; 4 only true copies, on the benchmark). */
const MEANING_VOTES = 4;
/** The meaning's weight when no passage holds any of the query; it falls as the words hold more (1 - held). */
const MEANING_WEIGHT = 2;
/** How far (cosine) the model's first must lead the next text it ranks to lead the results: 0.025-0.05 gained the same on the benchmark. */
const MEANING_SURE = 0.04;
/** What a clear first adds to its key: past any order the two ranks give (at most 0.1 + 0.2), short of a named title's 1. */
const MEANING_SURE_LEAD = 0.5;
/** Texts the model ranks this near (cosine) it cannot tell apart: 0.006-0.014 gained, none lost, on the benchmark. */
const MEANING_TIE = 0.012;
/** Two copies of one passage score alike to the float: a reprint is no next text. */
const MEANING_SAME = 1e-4;
/**
 * @param {Array<{score:number, doc:any, terms?:string[], placeStart?:number, meaningStart?:number}>} out
 * @param {Map<any, string>} idOf
 * @param {Array<{id:string, score:number, start:number}>} sem  best first
 * @param {(doc:any) => boolean} named
 * @param {number} held  the most of the query one passage of the words engine's top holds (bestPassageFirst)
 * @param {(doc:any) => boolean} admit  marks a document the meaning adds shown: false for a text already shown
 */
function meaningFirst(out, idOf, sem, named, held, admit) {
  const w = MEANING_WEIGHT * Math.max(0, 1 - held);
  // The model's clear first: far enough ahead of the next text it ranks (its own copies aside).
  let sure = '';
  if (w > 0 && sem.length) {
    const next = sem.find((s) => sem[0].score - s.score > MEANING_SAME);
    if (!next || sem[0].score - next.score >= MEANING_SURE) sure = sem[0].id;
  }
  // Its order, with texts it cannot tell apart taken original first.
  const tierOf = (/** @type {string} */ id) => { const f = msIndex.getStoredFields(id); return (f && ORIGINAL_TIER[f.kind]) ?? 5; };
  const order = sem.map((s) => ({ s, t: tierOf(s.id) }));
  for (let j = 1; j < order.length; j++) {
    for (let r = j; r > 0 && order[r - 1].s.score - order[r].s.score <= MEANING_TIE && order[r].t < order[r - 1].t; r--) {
      const x = order[r]; order[r] = order[r - 1]; order[r - 1] = x;
    }
  }
  const semRank = new Map(order.map((o, i) => [o.s.id, i]));
  const semStart = new Map(sem.map((s) => [s.id, s.start]));
  const top = out.slice(0, MEANING_REACH);
  const rest = out.slice(MEANING_REACH);
  const inTop = new Set(top.map((e) => idOf.get(e)));
  const added = new Set();
  for (const s of sem.slice(0, MEANING_ADD)) {
    if (inTop.has(s.id)) continue;
    const j = rest.findIndex((e) => idOf.get(e) === s.id);
    let e = j >= 0 ? rest.splice(j, 1)[0] : null;
    if (!e) {
      const f = msIndex.getStoredFields(s.id);
      if (!f || !admit(f)) continue;
      e = { score: 0, doc: reshapeDoc(f), terms: [] };
      idOf.set(e, s.id);
    }
    top.push(e);
    inTop.add(s.id);
    added.add(e);
  }
  const key = (/** @type {any} */ e, /** @type {number} */ i) => (named(e.doc) ? 1 : 0) + 1 / (MEANING_K + Math.min(i, MEANING_REACH)) +
    w / (MEANING_K + (semRank.get(idOf.get(e)) ?? 1e6)) + (idOf.get(e) === sure ? MEANING_SURE_LEAD : 0);
  const keyed = top.map((e, i) => ({ e, i, k: key(e, i) }));
  keyed.sort((a, b) => b.k - a.k);
  for (const e of top) {
    const st = semStart.get(idOf.get(e));
    if (st == null || st < 0 || e.doc.kind === 'verse') continue;
    e.meaningStart = st; // where the model matched it: originalsFirst reads a reprint's original there
    if (added.has(e)) e.placeStart = st;
  }
  out.length = 0;
  for (const k of keyed) out.push(k.e);
  for (const e of rest) out.push(e);
}
/**
 * @param {Array<{score:number, doc:any, terms?:string[]}>} out
 * @param {Map<any, string>} idOf
 * @param {Array<{term:string, origin:number, literal?:boolean}>} units  the search's units: each typed
 *   word (literal) with its synonyms, names and forms (same origin)
 * @param {(term:string) => boolean} stop
 * @param {(doc:any) => boolean} named
 * @param {Record<string, Set<string>>} kjvHeld  a verse found by kjv-alias.js -> the lemmas of the KJV words it holds
 */
function bestPassageFirst(out, idOf, units, stop, named, kjvHeld) {
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
  if (query.length < 3) return 0;
  const span = Math.max(12, Math.round(typed * 1.6));
  const top = out.slice(0, PASSAGE_REACH).map((e, i) => {
    const id = idOf.get(e) || String(i);
    const lem = docLemmas(id, e.doc.text || '');
    const share = named(e.doc) ? 2 : bestWindow(query, lem, span, kjvHeld[id]);
    return { e, i, share, key: share - PASSAGE_RANK_COST * i - (e.doc.kind === 'answers' && share < 2 ? REPRINT_COST : 0) };
  });
  if (!top.length) return 0;
  const held = Math.max(...top.map((t) => (t.share < 2 ? t.share : 0)));
  const first = top[0];
  const reprint = first.e.doc.kind === 'answers' && first.share < 2;
  if (first.share >= PASSAGE_HELD && !reprint) return held;
  top.sort((a, b) => b.key - a.key);
  // The engine's first is overtaken only by a passage holding clearly more of the query; an
  // Answers topic, by an original holding as much (it reprints them).
  if (top[0] !== first && top[0].share < first.share + (reprint ? -REPRINT_COST : PASSAGE_MARGIN)) { top.splice(top.indexOf(first), 1); top.unshift(first); }
  for (let i = 0; i < top.length; i++) out[i] = top[i].e;
  return held;
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
/** How far below an Answers topic a study or Holy Days text that holds the query as well is looked for. */
const STUDY_REACH = 3;
/** Named titles read for one the query names more nearly than the first's, and by how much more. */
const TITLE_REACH = 5;
const TITLE_NEARER = 0.2;
/** Typed words, one of them a content word, that read as a quote when held in a row. */
const SMALL_RUN_MIN = 4;
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
/* HIS NAME AS THE EDITIONS PRINT IT (sr11, 2026-10-15). The studies and the Matthew Study Bible restore His name
   in the verses they quote ("When YahuShua heard these things, He marveled at him"), and the edition the index
   holds prints "Jesus" (Luke 7:9): the study's sentence never met its verse's key, and the study led the verse. */
const RESTORED_NAME = /^(?:yahushua|yeshua|yahshua|yahusha|yeshu)$/;
const nameAsPrinted = (/** @type {string} */ t) => (RESTORED_NAME.test(t) ? 'jesus' : t);
/** A sentence's key: its words as the index reads them, His name as printed; null under five words (too common to mean one text). */
function sentenceKey(s) {
  const toks = kjvEncode(s).map(nameAsPrinted);
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
/* A LETTER'S HEADING IS NO ONE'S WORDS (sr11, 2026-10-15). Every Answers excerpt opens with the heading of the letter
   it comes from ("1/29/05 From The Lord, Our God and Savior The Word of The Lord Spoken to Timothy For The Lord's
   Little Flock, and For All Those Who Have Ears to Hear"), and a letter with an addendum or a second word holds one in
   its text (Volume One's "Christmas", Volume Four's "Obey God"). Keyed, that heading's runs named "Obey God" the
   original of any Answers passage the model matched next to a heading, and it led searches about other things
   (benchmark t320 "keep watch", t401 "come out of the churches"). A heading is never keyed. */
const HEADING = /(?:\d{1,2}\/\d{1,2}\/\d{2,4}\s+)?(?:From [^.!?\n]{0,80}?Savior\s+)?[^.!?\n]{0,40}?(?:to|from) Timothy\s+For [^.!?\n]{0,120}?Ears to Hear/gi;
/** Key one stored doc if it is an original: its sentences and, past a verse, its runs of words. */
function addOriginal(/** @type {Map<string, string[]>} */ O, /** @type {Map<number, string[]>} */ S, /** @type {Map<string, any>} */ D, /** @type {string} */ id, /** @type {any} */ f) {
  if (!f || !ORIGINAL_KINDS.has(f.kind) || !f.text) return;
  D.set(id, f);
  const text = f.kind !== 'verse' && /ears to hear/i.test(f.text) ? f.text.replace(HEADING, '\n') : f.text;
  for (const sp of sentenceSpans(text)) {
    const k = sentenceKey(sp.text);
    if (k) addTo(O, k, id);
  }
  if (f.kind !== 'verse') eachShingle(kjvEncode(text), (h) => addTo(S, h, id));
}
/** The originals, read in one pass if they are not read yet (node; a search that raced a swap). */
function originals() {
  if (ORIGINALS) return ORIGINALS;
  const O = new Map();
  const S = new Map();
  const D = new Map();
  const ids = msIndex._documentIds;
  for (const [shortId, f] of msIndex._storedFields) addOriginal(O, S, D, ids.get(shortId), f);
  ORIGINAL_DOCS = D;
  SHINGLES = S;
  ORIGINALS = O;
  return O;
}
/* THE ORIGINALS ARE READ A SLICE AT A TIME (sweep W68, 2026-10-14). Reading them is one pass over
   every verse and letter, 440-500 ms on a desktop and seconds on a phone, and the first search after
   each build made it in one block: the page froze under the reader's typing. In a browser they are
   read from an idle moment after the index swaps in, SLICE_MS at a time with the page
   running between slices, and a search that comes first waits for that read before it ranks (the
   Answers coverage reads them as well as originalsFirst). They take effect whole, at the end: CITED
   is built once from ORIGINAL_DOCS and must not be built from a half. Node (the bench, the tools)
   reads them in one pass, as before. */
/** How long a sliced read or ranking holds the page before it gives it a turn (W68, sr7). */
const SLICE_MS = 8;
/** @type {{ms: any, done: Promise<void>}|null} the read under way and the index it reads */ let ORIGINALS_BUILD = null;
/** Give the page a turn: scheduler.yield where the browser has it, else a timer. */
function yieldToPage() {
  const s = /** @type {any} */ (globalThis).scheduler;
  return s && typeof s.yield === 'function' ? s.yield() : new Promise((r) => setTimeout(r, 0));
}
/** Read the originals of `ms` in slices; dropped when another index swaps in or a one-pass read finished first. */
async function readOriginals(/** @type {any} */ ms) {
  const O = new Map();
  const S = new Map();
  const D = new Map();
  const ids = ms._documentIds;
  const it = ms._storedFields[Symbol.iterator]();
  let step = it.next();
  while (!step.done) {
    const end = now() + SLICE_MS;
    for (; !step.done && now() < end; step = it.next()) addOriginal(O, S, D, ids.get(step.value[0]), step.value[1]);
    if (step.done) break;
    await yieldToPage();
    if (msIndex !== ms || ORIGINALS) return;
  }
  if (msIndex !== ms || ORIGINALS) return;
  ORIGINAL_DOCS = D;
  SHINGLES = S;
  ORIGINALS = O;
}
/* THE ANSWERS EXCERPTS ARE READ AT IDLE TOO (sr7, 2026-10-14). A first search split every Answers topic
   it touched into its excerpts (excerptCover reads a topic one excerpt at a time): 64-140 ms of a first
   search's ranking on a desktop, 1-3 ms of a later one's. After the originals they are read the same way,
   a slice at a time from the idle read; a search that comes first reads those it needs in its own slices.
   The first search filled this cache anyway: a session holds no more than it did. */
/** @type {any} the index whose Answers excerpts are read, or being read */ let EXCERPTS_FOR = null;
async function warmExcerpts(/** @type {any} */ ms) {
  if (EXCERPTS_FOR === ms || msIndex !== ms) return;
  EXCERPTS_FOR = ms;
  const ids = ms._documentIds;
  let end = now() + SLICE_MS;
  for (const [shortId, f] of ms._storedFields) {
    if (!f || f.kind !== 'answers' || !f.text) continue;
    if (now() >= end) {
      await yieldToPage();
      if (msIndex !== ms) return;
      end = now() + SLICE_MS;
    }
    excerpts(ids.get(shortId), f.text);
  }
}
/** Resolves once the index in use has its originals read (or has been replaced); never rejects. */
function warmOriginals() {
  if (ORIGINALS || !msIndex) return Promise.resolve();
  if (typeof document === 'undefined') {
    try { originals(); } catch { /* read again, and caught, where they are used */ }
    return Promise.resolve();
  }
  if (ORIGINALS_BUILD && ORIGINALS_BUILD.ms === msIndex) return ORIGINALS_BUILD.done;
  const ms = msIndex;
  const done = readOriginals(ms).catch(() => { if (ORIGINALS_BUILD && ORIGINALS_BUILD.done === done) ORIGINALS_BUILD = null; });
  ORIGINALS_BUILD = { ms, done };
  return done;
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
/** The query's content words as bestWindow reads them, rare words weighing more, and the window's reach;
    `asTyped`: the words themselves, to read a text's tokens (docTokens) rather than its lemmas. */
function passageQuery(/** @type {string[]} */ words, asTyped = false) {
  const n = msIndex.documentCount || 1;
  const seen = new Set();
  const query = [];
  for (const w of words) {
    const lem = asTyped ? w : lemma(w);
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
/* A QUOTE THAT NAMES ITS VERSE (sr11, 2026-10-15). A study quotes Scripture as the KJV words it (“All have sinned,
   and come short of the glory of God.” – Romans 3:23) and the edition the index holds words it otherwise ("fall
   short"), so no key of the verse meets the study's sentence: the reference the study writes after it does. */
const CITED_AFTER = /^[\s"'“”‘’)]*[–—-]\s*((?:[1-3]\s?)?[A-Z][A-Za-z]+(?: of [A-Z][a-z]+| [A-Z][a-z]+)?\.? \d{1,3}:\d{1,3}(?:\s?[-–]\s?\d{1,3})?)/;
/** How many verses of a cited range are read for the one the sentence quotes. */
const CITED_RANGE = 12;
/**
 * The verse a sentence's citation names, when it holds `need` of the query's words; else null.
 * @param {string} after  the text just after the sentence
 * @param {string[]} words  the query's words, encoded
 * @param {number} need
 */
function citedVerse(after, words, need) {
  const m = CITED_AFTER.exec(after);
  if (!m) return null;
  let p;
  try { p = parseReference(m[1]); } catch { return null; }
  if (!p || p.kind !== 'ref-bible' || !p.bookId || !p.chapter || !p.verseStart) return null;
  const D = /** @type {Map<string, any>} */ (ORIGINAL_DOCS);
  const books = p.bookId === 'matthew' || p.bookId === 'matthew-plain' ? ['matthew-study/matthew', 'bible/matthew-plain'] : ['bible/' + p.bookId];
  let best = null;
  let most = need - 1;
  const last = Math.min(p.verseEnd || p.verseStart, p.verseStart + CITED_RANGE - 1);
  for (let v = p.verseStart; v <= last; v++) {
    for (const b of books) {
      const id = unitId(b + ':' + p.chapter + ':' + v);
      const f = id && D.get(id);
      if (!f || f.kind !== 'verse') continue;
      const toks = new Set(kjvEncode(f.text).map(nameAsPrinted));
      const held = words.filter((w) => toks.has(w)).length;
      if (held > most) { most = held; best = id; }
    }
  }
  return best;
}
/**
 * The originals of the sentence(s) an excerpt falls in: the sentence's key, or the verse it cites.
 * @param {string} text
 * @param {string} ex  the excerpt
 * @param {number} at  where it starts
 * @param {Map<string, string[]>} O
 * @param {(ids: string[]|undefined) => string[]} lower  the ids of a lower tier than the reprint's
 * @param {string[]} keyWords  the query's words as a key reads them
 * @param {number} need
 * @param {boolean} cite  the reader typed the quote's words in a row: the verse it cites is its original
 * @returns {string[]|null}
 */
function sentenceOriginal(text, ex, at, O, lower, keyWords, need, cite) {
  if (at < 0) return null;
  for (const sp of sentenceSpans(text)) {
    if (sp.end < at || sp.start > at + ex.length) continue;
    const k = sentenceKey(sp.text);
    if (!k || keyWords.filter((w) => (' ' + k + ' ').indexOf(' ' + w + ' ') >= 0).length < need) continue;
    const l = lower(O.get(k));
    if (l.length) return l;
    if (!cite) continue;
    const v = citedVerse(text.slice(sp.end, sp.end + 48), keyWords, need);
    if (v && lower([v]).length) return [v];
  }
  return null;
}
/**
 * The sentence of the passage the model matched (MEANING_SPAN from `start`) holding the most of the query's words,
 * when it holds more of them than the sentences the excerpt falls in; else null. Its edge characters are left off,
 * so it touches no neighbouring sentence (sentenceOriginal reads every sentence an excerpt touches).
 * @param {string} text
 * @param {number} start  where the model's passage starts
 * @param {string} ex  the excerpt
 * @param {number} at  where it starts
 * @param {string[]} words  the query's words, encoded
 * @returns {{text: string, start: number}|null}
 */
function meantSentence(text, start, ex, at, words) {
  const spans = sentenceSpans(text);
  const held = (/** @type {string} */ s) => { const t = new Set(kjvEncode(s)); return words.filter((w) => t.has(w)).length; };
  let most = held(spans.filter((sp) => sp.end >= at && sp.start <= at + ex.length).map((sp) => sp.text).join(' '));
  let best = null;
  for (const sp of spans) {
    if (sp.end <= start) continue;
    if (sp.start >= start + MEANING_SPAN) break;
    const h = held(sp.text);
    if (h > most) { most = h; best = sp; }
  }
  return best && best.text.length > 2 ? { text: best.text.slice(1, -1), start: best.start + 1 } : null;
}
/**
 * Move each original ahead of a reprint of it near the top (in place).
 * @param {Array<{score:number, doc:any, terms?:string[], meaningStart?:number}>} out  ranked, best first (meaningStart: meaningFirst's matched passage)
 * @param {Map<any, string>} idOf  each entry's doc id
 * @param {string[]} terms  the words a landing marks (the query's own)
 * @param {(doc:any) => boolean} allowed  the search's corpus and scope filters
 * @param {(doc:any) => boolean} named  the query names this text's title so: it keeps its place
 * @param {(id:string, doc:any) => number} near  how nearly a text holds the typed words in a row (0..1)
 * @param {string[]} [typed]  every typed word, the small ones too: a quote's excerpt is cut by them
 */
function originalsFirst(out, idOf, terms, allowed, named, near, typed = []) {
  if (!terms.length) return;
  let O;
  try { O = originals(); } catch { return; }
  const D = /** @type {Map<string, any>} */ (ORIGINAL_DOCS);
  // The matched sentence must hold a fair share of the query's words, not one word of a title.
  const words = [...new Set(terms.flatMap((t) => kjvEncode(t)))];
  const keyWords = words.map(nameAsPrinted);
  const need = Math.min(3, Math.ceil(words.length / 2));
  for (let i = 0; i < Math.min(out.length, ORIGINAL_REACH); i++) {
    const e = out[i];
    const tier = ORIGINAL_TIER[e.doc.kind];
    if (!tier || !e.doc.text || named(e.doc)) continue;
    // The typed words alone here, not their engine-matched forms the landing reads too: a form tipped one
    // reprint's tie onto a sentence of another letter and the original lost first place (sr11, t158).
    let ex = matchExcerpt(e.doc.text, terms);
    let at = ex ? e.doc.text.indexOf(ex) : -1;
    const lower = (/** @type {string[]|undefined} */ ids) => (ids || []).filter((x) => D.has(x) && ORIGINAL_TIER[D.get(x).kind] < tier);
    // A study's citation names the original of a quote of it, not of a passage described in other words
    // ("passover study about the lamb when god struck the egyptians" asks for the study, not Exodus 12:27).
    const quoted = near(idOf.get(e) || '', e.doc) >= NEAR_PHRASE_MIN;
    let found = sentenceOriginal(e.doc.text, ex, at, O, lower, keyWords, need, quoted);
    // A reprint the model found is read where it matched, when that sentence holds more of the query than the
    // excerpt's does and names an original of its own (sr11 t324): the excerpt is the stretch thickest with typed
    // words, and in an Answers topic that was a line of another letter it quotes, which then led the search.
    if (typeof e.meaningStart === 'number' && e.meaningStart >= 0 && at >= 0) {
      const m = meantSentence(e.doc.text, e.meaningStart, ex, at, words);
      const f = m && sentenceOriginal(e.doc.text, m.text, m.start, O, lower, keyWords, need, quoted);
      if (m && f) { found = f; ex = m.text; at = m.start; }
    }
    // A quote held nearly word for word sits where its small words are too ("blessed be the name of our lord":
    // the content words sit thickest in "Blessed are those who Bless the name of The Lord", a line above it).
    if (!found && typed.length > terms.length && quoted) {
      const ex2 = matchExcerpt(e.doc.text, typed);
      const at2 = ex2 ? e.doc.text.indexOf(ex2) : -1;
      if (at2 >= 0 && at2 !== at) {
        found = sentenceOriginal(e.doc.text, ex2, at2, O, lower, keyWords, need, true);
        if (found) { ex = ex2; at = at2; }
      }
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
    // A reprint the meaning brought up (meaningFirst noted the passage it matched): that passage's
    // own runs name its original, with no typed word in it to cut an excerpt by.
    if (!found && typeof e.meaningStart === 'number' && e.meaningStart >= 0) {
      /** @type {Map<string, number>} */ const votes = new Map();
      eachShingle(kjvEncode(e.doc.text.slice(e.meaningStart, e.meaningStart + MEANING_SPAN)), (h) => { for (const x of lower(/** @type {Map<number, string[]>} */ (SHINGLES).get(h))) votes.set(x, (votes.get(x) || 0) + 1); });
      for (const [x, n] of votes) if (n < MEANING_VOTES) votes.delete(x);
      if (votes.size) found = [...votes.keys()].sort((a, b) => /** @type {number} */ (votes.get(b)) - /** @type {number} */ (votes.get(a)));
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
      // The entry is cut from its letter: whatever of the query it holds, a letter holding as much comes first
      // (sr11, 2026-10-15: a bar of half the query kept "history has an end and christ is coming" on the entry at
      // 0.46 with its letter holding the same 0.46; Corbin, DECISIONS 10-14: the original first, the reprint second).
      if (src && share > 0 && holdsAsWell(src, pq, share) && (own < NEAR_PHRASE_MIN || near(src, D.get(src)) >= own - 0.1)) found = [src];
    }
    if (!found && e.doc.kind === 'answers') {
      // A study or Holy Days text just below that holds the query as well, in one passage and in a row: it is what Answers reprints.
      // A topic holding none of it (the model found it) is no measure: any text below held "as much" (sr11, 2026-10-15).
      const id = idOf.get(e) || '';
      const pq = passageQuery(words);
      const share = bestWindow(pq.query, docLemmas(id, e.doc.text || ''), pq.span);
      const own = near(id, e.doc);
      for (let r = i + 1; r < Math.min(out.length, i + 1 + STUDY_REACH); r++) {
        const f = out[r];
        const t = ORIGINAL_TIER[f.doc.kind];
        if (t === undefined || t >= tier || !f.doc.text) continue;
        const fid = idOf.get(f) || '';
        if (share > 0 && bestWindow(pq.query, docLemmas(fid, f.doc.text), pq.span) >= share - REPRINT_COST && near(fid, f.doc) >= own - 0.1) {
          out.splice(r, 1);
          out.splice(i, 0, f);
          i++;
          break;
        }
      }
      continue;
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
/* THE REPRINT RIGHT AFTER ITS ORIGINAL (sr11, 2026-10-15). Corbin (DECISIONS 10-14) on a letter that Words To Live
   By later excerpts: "what surfaces first? The original, yes. But both should surface, with WTLB being second."
   With the original first, a reprint of the passage it was found by sat anywhere below it (#7, #15, #100 on the
   benchmark). The first text below that holds the passage's words in a row comes up second. A verse first keeps
   its order: the letters quoting it are no reprints of it. */
/** How far below the first result a reprint of its passage is looked for. */
const REPRINT_REACH = 200;
/** Words in a row a reprint shares with the passage (fewer when the sentence is shorter, five at least). */
const REPRINT_RUN = 8;
/**
 * @param {Array<{doc:any, placeStart?:number, terms?:string[]}>} out  ranked, best first
 * @param {string[]} terms  the words a landing marks
 */
function reprintSecond(out, terms) {
  if (out.length < 3 || !terms.length) return;
  const first = out[0];
  const d = first.doc;
  if (!d.text || !(d.kind === 'letter' || d.kind === 'wtlb' || d.kind === 'blessed')) return;
  // the passage it was found by: the sentence it opens on, else the one where the typed words sit thickest
  let st = typeof first.placeStart === 'number' && first.placeStart >= 0 ? first.placeStart : -1;
  if (st < 0) { const ex = matchExcerpt(d.text, terms, undefined, first.terms); st = ex ? d.text.indexOf(ex) : -1; }
  if (st < 0) return;
  const sp = sentenceSpans(d.text).find((x) => x.end > st);
  const toks = sp ? kjvEncode(sp.text) : [];
  if (toks.length < 5) return;
  const runs = toks.length <= REPRINT_RUN ? [toks] : [0, (toks.length - REPRINT_RUN) >> 1, toks.length - REPRINT_RUN].map((i) => toks.slice(i, i + REPRINT_RUN));
  const esc = (/** @type {string} */ t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const res = runs.map((run) => new RegExp('(?:^|[^a-z0-9])' + run.map(esc).join('[^a-z0-9]+') + '(?![a-z0-9])', 'i'));
  for (let r = 1; r < Math.min(out.length, REPRINT_REACH); r++) {
    const t = out[r].doc.text;
    if (!t || out[r].doc.kind === 'verse') continue;
    if (res.some((re) => re.test(t))) { if (r > 1) out.splice(1, 0, out.splice(r, 1)[0]); return; }
  }
}
/** @type {Promise<boolean>|null} */ let building = null;
/** The edition the build under way is for. */
/** @type {string|null} */ let buildingFor = null;
let ready = false;
/** @type {Error|null} */ let buildError = null;
/** `sig`: what the index was built from (cache.js dataSignature), for the check that it still is. */
/** `restoredIn`: where a warm index was read, the search worker or the page (sr9). */
/** @type {{docCount?:number, buildMs?:number, collectMs?:number, insertMs?:number, cached?:boolean, translation?:string, sig?:string, restoredIn?:string}} */ let stats = {};

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

/** Put a built or restored index in use. The caches read from the last one go with it: a new index is
    new texts behind the same ids (a translation change), and the phrase ranking's token cache must not
    outlive the index it was read from. Cleared here, at the swap, not when the build starts: a search on
    the old index while the new one builds would fill them again with the old texts. */
function swapIn(/** @type {any} */ ms, /** @type {typeof stats} */ st) {
  TOKEN_CACHE.clear();
  tokenCacheSize = 0;
  ORIGINALS = null;
  ORIGINALS_BUILD = null;
  EXCERPTS_FOR = null;
  ORIGINAL_DOCS = null;
  SHINGLES = null;
  CITED = null;
  VERSE_IDS = null;
  UNIT_IDS = null;
  LEMMA_CACHE.clear();
  EXCERPT_CACHE.clear();
  SOURCE_CACHE.clear();
  msIndex = ms;
  ready = true;
  buildError = null;
  stats = st;
  if (typeof document !== 'undefined') onIdle(() => { warmOriginals().then(() => warmExcerpts(ms)).catch(() => {}); }, { timeout: 2000, fallbackDelay: 300 });
}

/* THE WARM INDEX IS READ ON THE SEARCH WORKER (sr9, 2026-10-14). MiniSearch.loadJSON restored it in one block on
   the page's thread: JSON.parse of ~21 MB, then a Map per document field and per term, 244-262 ms on the S22
   inside init. The search worker (worker-client.js) reads and parses it and hands it over in parts
   (index-transfer.js), each received in a short task here. Where there is no worker (node, a WebView that does
   not hand one the app's files, a worker that failed or does not answer) the page reads it, as before.
   The worker is given up when it sends nothing for RESTORE_QUIET_MS: each part starts the wait again, so a slow
   phone's restore is never cut off while its parts are still coming (sr9 refuter r1). */
const RESTORE_QUIET_MS = 20000;
/* "REBUILD THE INDEX" BUILDS IT (sweep 2026-10-14 v100). rebuild() dropped the warm cache without waiting, and the
   build it started read the cache before the delete landed and swapped the same index back in. The next build
   after a rebuild() reads no cache, whichever call starts it (a search waiting on the index can). */
let coldNext = false;
/** The cached index for `sig`, or null when there is none. @returns {Promise<{ms: any, where: string}|null>} */
async function restoreIndex(/** @type {string} */ sig) {
  const w = searchWorker();
  if (w) {
    try {
      /** @type {ReturnType<typeof indexAssembler>|null} */ let asm = null;
      const r = await w.request('restore', { sig }, (/** @type {any} */ m) => {
        if (m.head) asm = indexAssembler(MiniSearch, m.head, buildMiniSearchOptions());
        else if (asm) asm.add(m.part, m.entries);
        else throw new Error('search worker: a part before the head');
      }, RESTORE_QUIET_MS);
      // a miss is checked here too: a worker with no Cache API sees none where the page has one
      if (!r.miss && asm) return { ms: /** @type {any} */ (asm).ms, where: 'worker' };
    } catch { /* the page reads it */ }
  }
  const json = await loadCached(sig);
  return json ? { ms: MiniSearch.loadJSON(json, buildMiniSearchOptions()), where: 'page' } : null;
}

/** Build the in-memory index for one translation (chunked for onProgress). `persist: false` keeps it
    out of the warm cache (a corpus failed to load: that index must not replace a whole one there). */
async function build(options) {
  options = options || {};
  const code = options.translation || 'nkjv';
  const sig = dataSignature(code);

  // Warm cache: restore the serialized index (~0.3s) instead of rebuilding (~10s), unless rebuild() asked.
  const cold = coldNext;
  coldNext = false;
  if (!cold) {
    try {
      const tc = now();
      const restored = await restoreIndex(sig);
      if (restored) {
        const ms = restored.ms;
        swapIn(ms, { docCount: ms.documentCount, buildMs: Math.round(now() - tc), cached: true, translation: code, sig, restoredIn: restored.where });
        if (options.onProgress) options.onProgress(ms.documentCount, ms.documentCount);
        return;
      }
    } catch { /* corrupt / blocked cache — fall through to a fresh build */ }
  }

  // Cold build: collect docs (fast, ~55ms) then index (the slow part, ~10s —
  // chunked so the progress bar animates and the UI stays responsive). The
  // signature is read again with the docs, in the same task: a corpus that
  // arrived while the cache was read is in both or in neither.
  const t0 = now();
  const builtSig = dataSignature(code);
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
  swapIn(ms, {
    docCount: docs.length,
    buildMs: Math.round(t2 - t0),
    collectMs: Math.round(t1 - t0), // buildDocs (tokenizer-bound)
    insertMs: Math.round(t2 - t1), // MiniSearch addAll (index-bound)
    cached: false,
    translation: code,
    sig: builtSig,
  });
  if (options.persist === false) return;
  // Persist for next session (fire-and-forget) once the reader is not waiting on it:
  // serializing the index is one long task (1.7 s on a slow phone), and it ran the
  // moment the build finished, so the first search froze behind it (UI audit
  // 2026-09-27).
  onIdle(() => { saveCached(builtSig, JSON.stringify(ms)).catch(() => {}); }, { timeout: 15000, fallbackDelay: 3000 });
}

/* EVERY TEXT, FOR THE READER'S EDITION, BEFORE THE INDEX IS BUILT (sweep W2, 2026-10-13). buildDocs
   reads the lazy corpus globals and skips, silently, any not loaded yet. Search waited for them on
   mount only, so a query already there ("search this", a restored tab) or typed while they loaded
   built from what had arrived: VOT letters, Answers or the studies could be missing from every search
   for the session, and that partial index was cached over the whole one. A mount with no edition
   built NKJV for a KJV reader, and a search during it was answered in NKJV words. So init loads the
   corpora itself, whoever calls it, and builds for the edition asked; an index built from other data
   than the corpora hold now (the signature differs: another edition, a corpus loaded since) is built
   again, and a build under way for other data is followed by one for this, never returned for it. */
/** The lazy loaders of every corpus the index reads (index.html, translations.js), each a window global. */
const CORPUS_LOADERS = ['__loadBibleCorpus', '__loadMatthewCorpus', '__loadVotCorpus', '__loadAnswersCorpus', 'loadBibleStudies'];

/** Load every corpus and the edition's own text. Resolves true when all of them loaded: a failed load
    leaves its global out, which the signature records, so the index is built again once it loads. */
function loadCorpora(/** @type {string} */ code) {
  const w = /** @type {any} */ (globalThis);
  const call = (/** @type {any} */ fn, /** @type {any[]} */ args) => Promise.resolve().then(() => fn(...args)).then((r) => r !== false, () => false);
  const loads = CORPUS_LOADERS.filter((n) => typeof w[n] === 'function').map((n) => call(w[n], []));
  if (code !== 'nkjv' && typeof w.loadTranslation === 'function') {
    loads.push(call(w.loadTranslation, [code]).then((ok) => ok && !!w['BIBLE_' + code.toUpperCase()]));
  }
  return Promise.all(loads).then((oks) => oks.every(Boolean));
}

/** The edition a call means: the one it names, else the one built or being built, else NKJV. */
function editionOf(/** @type {{translation?:string}|undefined} */ options) {
  return (options && options.translation) || buildingFor || stats.translation || 'nkjv';
}

/** Whether the index in use was built for this edition from the data the corpora hold now. */
function isCurrent(/** @type {{translation?:string}|undefined} */ options) {
  const code = editionOf(options);
  return ready && stats.translation === code && stats.sig === dataSignature(code);
}

/**
 * Build (or rebuild) the index for an edition from every corpus. Concurrent calls
 * for the same data share one build. SearchScreen calls this on mount.
 * @param {{translation?:string, onProgress?:(done:number,total:number)=>void}} [options]
 * @returns {Promise<boolean>}
 */
function init(options) {
  const code = editionOf(options);
  const opts = { ...options, translation: code };
  // One build at a time (each swaps in its index): this call is looked at again when it ends.
  // A build for this edition that fails fails this call; one for another edition does not.
  if (building) return buildingFor === code ? building.then(() => init(opts)) : building.then(() => init(opts), () => init(opts));
  return loadCorpora(code).then((all) => {
    if (building) return init(opts); // another call started one while the corpora loaded
    if (isCurrent(opts)) return true;
    buildingFor = code;
    building = build({ ...opts, persist: all })
      .then(() => { building = null; buildingFor = null; startMeaningWhenIdle(); return true; })
      .catch((e) => { building = null; buildingFor = null; buildError = e; throw e; });
    return building;
  });
}

/** The meaning search loads once the words index is up, when the page is idle (the browser only: node callers start it). */
function startMeaningWhenIdle() {
  if (typeof document === 'undefined') return;
  onIdle(() => { startSemantic(); }, { timeout: 20000, fallbackDelay: 5000 });
}

async function ensureReady(options) {
  if (isCurrent(options)) return;
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
 * @param {{translation?:string, useStopWords?:boolean, synonyms?:boolean, scope?:{bookId?:string,volumeId?:string}|null, corpus?:string, limit?:number, perVolume?:number, allWords?:boolean, _corrected?:boolean, _unquoted?:boolean, signal?:{aborted:boolean}}} [options]
 * `signal`: when it is aborted the search stops at its next turn and returns `aborted: true`, no results (sr7).
 * `corrections` lists each typed word that found nothing of its own and was
 * searched as the nearest indexed word instead ({ from: 'shephard', to: 'shepherd' }).
 * `meaningLater`: a text search the meaning model was not ready for ran on the words alone; whenMeaningReady() says when to ask again.
 * @returns {Promise<{parsed:Object|null, results:Array<{score:number, doc:Object, terms?:string[], close?:boolean}>, parsedTerms?:string[], textQuery?:Object|null, capped?:string[], truncated?:boolean, corrections?:Array<{from:string, to:string}>, stopWordsOnly?:boolean, unquoted?:string, aborted?:boolean, meaningLater?:boolean}>}
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
  // ...unless the reference may be words too ("rebuke one": ref-parser's alsoText), which are searched under the card.
  if (NAV_ONLY_KINDS.has(parsed.kind) && !parsed.alsoText) return { parsed, results: [], parsedTerms: [], textQuery: null };

  await ensureReady(options);
  await warmOriginals();
  // rebuild() dropped the index while this search waited (sweep 2026-10-14 v061): it waits for the new one
  if (!msIndex) return search(query, options);

  /* THE RANKING GIVES THE PAGE TURNS (sr7, 2026-10-14). With the originals read, a first search still
     ranked in one block: 110-400 ms on a desktop, about 350 ms on the S22, under the reader's typing. In
     a browser it gives the page a turn whenever SLICE_MS is spent, in its loops over units, hits and
     candidates (node, the bench and the tools, ranks in one pass). An index swapped in meanwhile (another
     edition) starts the search over on it; a search the screen has moved past (`signal` aborted) stops
     at its next turn instead of ranking for nobody. */
  const inUse = msIndex;
  const sliced = typeof document !== 'undefined';
  let sliceEnd = now() + SLICE_MS;
  const spent = () => sliced && now() >= sliceEnd;
  /** The page's turn: null to go on, else what this search returns (stopped, or run again on the new index). */
  const pause = async () => {
    await yieldToPage();
    sliceEnd = now() + SLICE_MS;
    if (options.signal && options.signal.aborted) return { parsed, results: [], aborted: true };
    if (msIndex !== inUse) return search(query, options);
    return null;
  };

  /* search-2— A BARE BOOK NAME AND A NAMED-PASSAGE KEY KEEP THEIR CARD AND ALSO
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
  const useStop = options.useStopWords !== false;
  const read = navAlso ? parseTextQuery(query) : parsed;
  /* A BARE WORD BESIDE A QUOTED PHRASE IS A WORD THE TEXT HOLDS (sweep 2026-10-14 v001). Only the phrase was
     searched, so '"love one another" brethren' showed every text holding the phrase, ranked and marked as if
     "brethren" was never typed. It narrows the phrase as a +word does (a small word aside); a phrase and word
     no text holds together fall back to the words unquoted, as a quote nothing holds does. */
  const p = read.phrase && read.terms && read.terms.length
    ? { ...read, must: read.must.concat(read.terms.map(withoutPossessive).filter((t) => !(useStop && isStopTerm(t)))), terms: [] }
    : read;
  // `allWords`: the reader asked for every match under the card (SearchScreen).
  if (navAlso && !options.allWords) limit = Math.min(limit, NAV_TEXT_LIMIT);
  const D = searchData();
  const terms = (p.phrase ? p.phrase.split(/\s+/) : p.terms.map(withoutPossessive)).concat(p.must);

  // All-stop-word query → no searchable content. Not a quoted phrase: "and it was so" (Genesis 1), quoted,
  // means those words in that order, which the phrase filter checks (sweep 2026-10-14 v016).
  if (useStop && !p.phrase && terms.length && terms.every(isStopTerm)) {
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
  /** @type {Record<string, string>} a KJV word the index lacks -> the modern form it holds (seeth -> sees) */
  const modernOf = Object.create(null);
  /** @type {Record<string, Set<string>>} a verse found by its KJV wording -> the lemmas of those KJV words */
  const kjvHeld = Object.create(null);
  const unheard = [];                  // literal units that found nothing as typed
  for (let u = 0; u < units.length; u++) {
    if (spent()) { const r = await pause(); if (r) return r; }
    const unit = units[u];
    let res;
    try { res = searchUnit(unit.term, unitOpts(unit), keyword); } catch { continue; }
    if (res && res.length) { heard[unit.origin] = true; accumulate(unit, res); continue; }
    if (unit.literal) {
      const tok = kjvEncode(unit.term);
      const alias = tok.length === 1 && !termExists(tok[0]) ? kjvAliasHits(tok[0]) : null;
      if (alias && alias.length) {
        for (const h of alias) {
          if (!docLookup[h.id]) docLookup[h.id] = { id: h.id, ...msIndex.getStoredFields(h.id) };
          (kjvHeld[h.id] || (kjvHeld[h.id] = new Set())).add(lemma(tok[0]));
        }
        heard[unit.origin] = true;
        accumulate(unit, alias);
        // ...and its modern form, as a form of the word, which the phrase ranking reads it as
        const modern = modernForm(tok[0]);
        if (modern) {
          modernOf[tok[0]] = modern;
          try { accumulate({ ...unit, term: modern, literal: false, form: true }, searchUnit(modern, unitOpts(unit), keyword)); } catch { /* the KJV verses suffice */ }
        }
      } else unheard.push(unit);
    }
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
    if (spent()) { const r = await pause(); if (r) return r; }
    if (/\d/.test(unit.term)) continue;   // a number is not a typo: "316" is not "16"
    let fixed;
    try { fixed = searchCorrected(unit.term, unitOpts(unit), keyword); } catch { continue; }
    if (!fixed.res.length) continue;
    const typed = kjvEncode(unit.term);
    if (typed.length === 1 && NT_BARE.test(typed[0]) && fixed.to !== typed[0].slice(0, -1)) continue;
    accumulate(unit, fixed.res);
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
    if (spent()) { const r = await pause(); if (r) return r; }
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
  for (const k in modernOf) fixedTo[k] = modernOf[k];
  /* What the reader wants found: a -word is ruled out, not typed, and a +word is its word (sweep 2026-10-14 v002).
     Read as typed, "Q -x" asked the texts to hold the run "Q x", so the passage quoted lost its phrase and
     original boosts to a word the reader excluded. */
  const wanted = (p.must && p.must.length) || (p.mustNot && p.mustNot.length) ? wantedQuery(query) : query;
  const typedTokens = joinApostropheS(kjvEncode(wanted).map((t) => fixedTo[t] || t));
  const STOP = D.STOP_WORDS_TRIMMED;
  if (!p.phrase && required > 1 && typedTokens.length > 1) {
    const needCover = required >= 3 ? required - 1 : required;
    const cands = rankedIds.filter((id) => popcount((termMask[id] || 0) & requiredMask) >= needCover)
      .sort((a, b) => scoreMap[b] - scoreMap[a])
      .slice(0, PHRASE_CANDIDATES);
    for (const id of cands) {
      if (spent()) { const r = await pause(); if (r) return r; }
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
  // One word that means anything among small ones ("for you to embrace me"): the texts holding the typed run exactly.
  // The card marks the run, so its excerpt and the landing go to it, not the word's first place (textQuery.run).
  let run = '';
  if (!p.phrase && required === 1 && typedTokens.length >= SMALL_RUN_MIN) {
    const cands = rankedIds.slice().sort((a, b) => scoreMap[b] - scoreMap[a]).slice(0, PHRASE_CANDIDATES);
    for (const id of cands) {
      if (spent()) { const r = await pause(); if (r) return r; }
      const d = docLookup[id];
      if (!d || !hasTokenRun(docTokens(id, d), typedTokens)) continue;
      run = wanted.trim().replace(/\s+/g, ' ').toLowerCase();
      nearOf[id] = 1;
      scoreMap[id] *= PHRASE_BOOST;
      if (!keyword && !REPRINT_KINDS.has(d.kind)) scoreMap[id] *= ORIGINAL_BOOST;
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
      if (spent()) { const r = await pause(); if (r) return r; }
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

  /* ONE TEST OF WHAT A SEARCH MAY SHOW (sweep W1, 2026-10-13). After this loop the meaning search
     adds the model's best texts and originalsFirst puts an original above its reprint, and both took
     documents straight from the index: a Scriptures-only search, a book or volume scope, the link
     picker's corpus chip or a -word let up to ten texts from outside it into the top 30. Every
     document a search shows passes `allowed` (the reader's collection and scope, and the quoted, +
     and - words), and shows once; what the meaning and originalsFirst add counts in its collection's cap. */
  const inScope = (/** @type {any} */ d) => (!corpusFilter || d.corpus === corpusFilter) &&
    (!scopeBookId || d.bookId === scopeBookId) && (!scopeVolumeId || d.volumeId === scopeVolumeId);
  const holdsWords = (/** @type {any} */ d) => {
    if (!phraseToks && !hasMust && !hasMustNot) return true;
    const toks = kjvEncode((d.text || '') + ' ' + (d.title || '') + ' ' + (d.heading || '') + ' ' + (d.ref || ''));
    if (phraseToks && !hasTokenRun(toks, phraseToks)) return false;
    if (hasMust && !mustToks.every((run) => hasTokenRun(toks, run))) return false;
    return !mustNotToks.some((run) => hasTokenRun(toks, run));
  };
  const allowed = (/** @type {any} */ d) => inScope(d) && holdsWords(d);
  /** A text not shown yet, marked shown (the dedup). */
  const fresh = (/** @type {any} */ d) => {
    const dedupKey = d.kind + '|' + (d.ref || '') + '|' + (d.text || '').slice(0, 60);
    if (seen[dedupKey]) return false;
    seen[dedupKey] = true;
    return true;
  };

  let h = 0;
  for (; h < rankedIds.length && out.length < limit; h++) {
    if (spent()) { const r = await pause(); if (r) return r; }
    const id = rankedIds[h];
    const doc = docLookup[id];
    if (!doc || !inScope(doc)) continue;
    // Before the word filters, which tokenise the whole doc: a full collection
    // costs nothing more to pass over. (A doc the filters would have refused can
    // mark its collection capped, so "400+" may mean exactly 400; never fewer.)
    const vid = doc.volumeId || '';
    if (perVolume && (volCount[vid] || 0) >= perVolume) { capped[vid] = true; continue; }
    if (!holdsWords(doc) || !fresh(doc)) continue;
    volCount[vid] = (volCount[vid] || 0) + 1;
    const entry = { score: scoreMap[id], doc: reshapeDoc(doc), terms: matchedTerms[id] || [] };
    idOf.set(entry, id);
    out.push(entry);
  }
  /** What the words found; the meaning and originalsFirst bring in more below. */
  const byWords = new Set(out);
  // A title the query names keeps its place; in a keyword search, a title holding its every word
  // ("144,000"), not one of two ("lord from aforetime" quotes a letter, not "Regarding the Day of The Lord").
  const typedContent = typedTokens.filter((w) => !(STOP && STOP.has(w)));
  const named = (/** @type {any} */ d) => {
    if (!d.title) return false;
    const tt = kjvEncode(d.title);
    return titleMatch(tt, typedTokens, STOP) > 1 || (keyword && typedContent.length > 0 && typedContent.every((w) => tt.indexOf(w) >= 0));
  };
  // Two titles the query names: the one it names more nearly leads ("the high holy days" names The Holy Days, not Regarding The Holy Days of God).
  if (out.length > 1 && out[0].doc.title && !keyword) {
    const tm = (/** @type {any} */ d) => (d.title ? titleMatch(kjvEncode(d.title), typedTokens, STOP) : 1);
    const t0 = tm(out[0].doc);
    if (t0 > 1) {
      let b = 0;
      let bt = t0;
      for (let r = 1; r < Math.min(out.length, TITLE_REACH); r++) { const t = tm(out[r].doc); if (t > bt + TITLE_NEARER) { b = r; bt = t; } }
      if (b) out.unshift(out.splice(b, 1)[0]);
    }
  }
  // A first result holding the typed words in a row, or one word off, is a quote found: no re-ordering.
  const quoted = out.length && (nearOf[idOf.get(out[0]) || ''] || 0) >= NEAR_PHRASE_MIN;
  const held = !keyword && !p.phrase && !quoted ? bestPassageFirst(out, idOf, units, isStopTerm, named, kjvHeld) : 1;
  /** @type {Awaited<ReturnType<typeof semanticDocs>>} */ let sem = null;
  // A search the model was not ready for: its words' order stands, and says the meaning comes later (semanticReady).
  let meaningLater = false;
  // The index the words were read from. While the model runs, a build for another edition (the reader
  // changed translation) can swap its own in: from then on this search reads nothing more by id, since
  // that index would hand back the other edition's text. The words' results stand alone.
  if (!keyword && !p.phrase && !quoted && parsed.kind === 'text') {
    // The model reads what the reader wants, not what they ruled out: no -word, and +word as the word.
    const meant = String(wanted);
    // Kept to a collection or scope, the model's best of everything may hold few of its texts: it reads further.
    sem = await semanticDocs(meant, unitId, corpusFilter || scopeBookId || scopeVolumeId ? MEANING_FILTERED : undefined);
    meaningLater = !sem && semanticStatus().status !== 'ready';
    if (msIndex !== inUse) sem = null;
    if (sem) sem = sem.filter((s) => { const f = msIndex.getStoredFields(s.id); return !!f && allowed(f); });
    if (sem && sem.length) meaningFirst(out, idOf, sem, named, held, fresh);
  }
  const nearTyped = (/** @type {string} */ id, /** @type {any} */ d) => nearOf[id] ?? (typedTokens.length > 1 ? nearPhrase(docTokens(id, d), typedTokens, STOP) : 0);
  /* A TITLE NAMED IN PASSING (sr11, 2026-10-15). A title the query names keeps its text's place, but a Words To
     Live By entry's title is often a line of the letter it condenses: a reader quoting the letter ("attained by
     human means": the entry "Not By Human Means") or describing it ("letter explaining that history has an end and
     christ is coming": "History Has an End") named the entry and got it above its letter. Corbin (DECISIONS
     10-14): the original first, the reprint second. A title typed whole, or one the query is mostly made of, still
     keeps its text's place; one the query holds beside more of its own words, or that a quote of the text's own
     words runs through (the text holds more of the query in a row than the title does), does not. */
  const namedSo = (/** @type {any} */ d) => {
    if (!named(d)) return false;
    const tt = kjvEncode(d.title);
    if (titleMatch(tt, typedTokens, STOP) >= TITLE_EXACT_BOOST) return true;
    const tl = new Set(tt.map(lemma));
    const inTitle = typedContent.filter((w) => tl.has(lemma(w))).length;
    const beside = typedContent.length - inTitle;
    if (beside > inTitle) return false;
    if (!beside) return true;
    const body = nearPhrase(kjvEncode(d.text || ''), typedTokens, STOP);
    return !(body >= NEAR_PHRASE_MIN && body > nearPhrase(tt, typedTokens, STOP));
  };
  if (msIndex === inUse) originalsFirst(out, idOf, (p.phrase ? [p.phrase] : []).concat(filtered.filter((t) => !isStopTerm(t))), (d) => allowed(d) && fresh(d),
    namedSo, nearTyped, typedTokens);
  // What those two added counts in its collection. A full one does not refuse it (the words' 400th
  // verse is no reason to drop the model's best text or an original): its last text gives way.
  if (perVolume) {
    const n = Object.create(null);
    for (const e of out) n[e.doc.volumeId || ''] = (n[e.doc.volumeId || ''] || 0) + 1;
    for (let r = out.length - 1; r >= 0; r--) {
      const v = out[r].doc.volumeId || '';
      if (n[v] > perVolume) { n[v]--; capped[v] = true; out.splice(r, 1); }
    }
  }
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
  // And in all: an original originalsFirst brought in from outside the results (or the model's best text) was one
  // text past the limit (sweep low, REPORT.md:645). The last gives way, and the result says texts were left.
  const over = out.length > limit;
  if (over) out.length = limit;
  if (sem && sem.length) meaningLanding(out, idOf, sem, (p.phrase ? [p.phrase] : []).concat(filtered.filter((t) => !isStopTerm(t))));
  // ...by the passage the screen lands on: the card marks the phrase or the typed run with the words (textQuery.run).
  reprintSecond(out, (p.phrase ? [p.phrase] : run ? [run] : []).concat(filtered.filter((t) => !isStopTerm(t))));

  /* CLOSE MATCHES (sr13, 2026-10-15). Book order lists the results in reading order, and most of a passage
     search's results hold a word or two of it: "I am The Lord and I do not change" found 1,344 texts, and Book
     order opened on Genesis 4:9 ("Am I my brother's keeper?"). Each result of a passage search says whether it
     holds the typed words together: most of them in a row (nearPhrase, as the phrase ranking reads it, so one
     word off still counts) and most of their weight in one place (bestWindow: "I am the LORD, and there is no
     other" holds the run's start but not "change", the word that names the saying; a word no text holds, one the
     reader misremembered, weighs nothing). The screen lists the close ones first. A keyword search and a quoted
     phrase mark none: every text they show holds what was typed. Read where the phrase ranking read (its 500 best
     holding the words, nearOf) and on what the meaning and originalsFirst brought in (a reprint's original sits
     with it); past that reach a text holds the words apart, as the ranking scored it. */
  if (!keyword && !p.phrase && typedTokens.length > 1 && typedContent.length) {
    // on the tokens the phrase ranking read (docTokens: cached, the title's words in them)
    const pq = passageQuery(typedContent.filter((w) => docFreq(w) > 0), true);
    for (const e of out) {
      if (spent()) { const r = await pause(); if (r) return r; }
      const id = /** @type {string} */ (idOf.get(e));
      let near = nearOf[id];
      if (near === undefined) near = byWords.has(e) ? 0 : nearPhrase(docTokens(id, e.doc), typedTokens, STOP);
      /** @type {{close?: boolean}} */ (e).close = near >= NEAR_PHRASE_MIN && bestWindow(pq.query, docTokens(id, e.doc), pq.span) >= CLOSE_SHARE;
    }
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
  return { parsed, results: out, parsedTerms: filtered, textQuery: run ? { ...p, run } : p, capped: Object.keys(capped), truncated: over || (out.length >= limit && h < rankedIds.length), corrections, meaningLater };
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
  // trimmed first: a space alone was a prefix of every key (sweep 2026-10-14 v053)
  const q = String(query || '').trim().toLowerCase();
  if (!q) return out;
  const D = searchData();

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

/** Drop the in-memory index and the warm cache, and build again for the active (or given) translation. */
function rebuild(options) {
  options = options || {};
  const code = options.translation || stats.translation || 'nkjv';
  ready = false;
  msIndex = null;
  coldNext = true;
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
    // the originals (originalsFirst): read, being read a slice at a time, or not yet
    originals: ORIGINALS ? 'ready' : (ORIGINALS_BUILD && ORIGINALS_BUILD.ms === msIndex ? 'building' : 'none'),
  };
}

function getStats() {
  return Object.assign({}, stats);
}

export const VotSearchMini = {
  init,
  isCurrent,
  // the on-device meaning search: its state ({status, failure, units}), and a start for callers that need it now
  meaningStatus: semanticStatus,
  startMeaning: startSemantic,
  whenMeaningReady: semanticReady,
  rebuild,
  parse: parseReference,
  search,
  suggest,
  snippet,
  snippetAt,
  matchExcerpt,
  morePlaces,
  findPlaces,
  highlightSpans,
  levenshtein,
  fuzzyBookSuggest,
  getState,
  getStats,
};

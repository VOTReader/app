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
     2. stop-word filter + synonym expansion → search "units"
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
import { parseTextQuery } from './query-parse.js';
import { expandQueryTerms } from './synonyms.js';
import { kjvEncode } from './tokenize.js';
import { snippet, highlightSpans, matchExcerpt } from './snippet.js';
import { KIND_BOOST, coverageMultiplier, popcount, phraseTokenMatch, PHRASE_BOOST, SYNONYM_DEMOTION } from './ranking.js';
import { loadCached, saveCached, clearCached, dataSignature } from './cache.js';

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

/**
 * The typo fallback for one literal unit that found nothing as typed.
 *
 * A one-word term is corrected to the NEAREST word in the index: one edit before
 * two, and among words at the same distance the one in the most documents (the
 * word a reader most likely meant; ties alphabetical, so the answer never depends
 * on insertion order). That word is then searched as if it had been typed, exact +
 * prefix, so "shephard" finds "shepherd" AND "shepherds" and nothing at two edits.
 * The edit budget stays MiniSearch's own: round(0.2 x length), capped at maxFuzzy
 * (one edit for 3-7 letters, two for 8+), so a short word never widens to two.
 * A multi-word unit (a quoted phrase) keeps the plain fuzzy retry.
 * @param {string} term
 * @param {Object} opts  the unit's exact + prefix options
 */
function searchCorrected(term, opts) {
  const tokens = kjvEncode(term);
  if (tokens.length !== 1) return msIndex.search(term, { ...opts, fuzzy: FUZZY });
  const word = tokens[0];
  const maxEdits = Math.min(MS_SEARCH_DEFAULTS.maxFuzzy, Math.round(word.length * FUZZY));
  for (let edits = 1; edits <= maxEdits; edits++) {
    const near = msIndex.search(word, { ...opts, prefix: false, fuzzy: edits });
    if (!near || !near.length) continue;
    const docs = Object.create(null);
    for (let r = 0; r < near.length; r++) {
      const ts = near[r].terms || [];
      for (let t = 0; t < ts.length; t++) docs[ts[t]] = (docs[ts[t]] || 0) + 1;
    }
    let best = null;
    for (const w in docs) {
      if (best === null || docs[w] > docs[best] || (docs[w] === docs[best] && w < best)) best = w;
    }
    if (best) return msIndex.search(best, opts);
  }
  return [];
}

/** @type {any} */ let msIndex = null;
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
  const CHUNK = 2000;
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
  // Persist for next session (fire-and-forget; ~0.5s serialize + IDB write).
  saveCached(sig, JSON.stringify(ms)).catch(() => {});
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
 * @param {{translation?:string, useStopWords?:boolean, synonyms?:boolean, scope?:{bookId?:string,volumeId?:string}|null, corpus?:string, limit?:number}} [options]
 * @returns {Promise<{parsed:Object|null, results:Array<{score:number, doc:Object, terms?:string[]}>, parsedTerms?:string[], textQuery?:Object|null}>}
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
  if (navAlso) limit = Math.min(limit, NAV_TEXT_LIMIT);
  const D = searchData();
  const terms = (p.phrase ? p.phrase.split(/\s+/) : p.terms.slice()).concat(p.must);
  const useStop = options.useStopWords !== false;

  // All-stop-word query → no searchable content.
  if (useStop && terms.length && terms.every((t) => D.STOP_WORDS_TRIMMED.has(t.toLowerCase()))) {
    return { parsed, results: [], parsedTerms: [], textQuery: null };
  }
  let filtered;
  if (!useStop || terms.length <= 4) filtered = terms.slice();
  else { filtered = terms.filter((t) => !D.STOP_WORDS_TRIMMED.has(t.toLowerCase())); if (!filtered.length) filtered = terms; }
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
  }

  // One BM25 search per unit; accumulate score + coverage bitmask.
  const scoreMap = Object.create(null);
  const termMask = Object.create(null);
  const literalHit = Object.create(null);
  const matchedTerms = Object.create(null);
  const docLookup = Object.create(null);
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    let res;
    try {
      const opts = { prefix: unit.literal, fuzzy: false, combineWith: 'AND', boost: MS_SEARCH_DEFAULTS.boost };
      res = msIndex.search(unit.term, opts);
      if (unit.literal && (!res || !res.length)) res = searchCorrected(unit.term, opts);
    } catch { continue; }
    if (!res) continue;
    for (let r = 0; r < res.length; r++) {
      const hit = res[r];
      const id = hit.id;
      scoreMap[id] = (scoreMap[id] || 0) + hit.score;
      if (!docLookup[id]) docLookup[id] = hit;
      if (unit.literal) {
        literalHit[id] = true;
        // hit.terms is the DOC-side vocabulary that matched (MiniSearch derives
        // it from the match map), so for a fuzzy/prefix hit it's the corrected
        // word — query "sheperd" carries "shepherd" here. The snippet
        // highlighter only knows the literal typed terms, so these ride along
        // on the result for the UI to merge in (v1.1 gap: corrected words
        // rendered unmarked). Literal units only: synonym units match exactly,
        // and SRCH4's expandSnippetTerms already covers those.
        if (hit.terms) {
          const mt = matchedTerms[id] || (matchedTerms[id] = []);
          for (let t = 0; t < hit.terms.length && mt.length < 12; t++) {
            if (mt.indexOf(hit.terms[t]) < 0) mt.push(hit.terms[t]);
          }
        }
      }
      if (unit.origin < 31) termMask[id] = (termMask[id] || 0) | (1 << unit.origin);
    }
  }

  const rankedIds = Object.keys(scoreMap);
  // KIND_BOOST (once).
  for (let i = 0; i < rankedIds.length; i++) {
    const d = docLookup[rankedIds[i]];
    const kb = d && KIND_BOOST[d.kind];
    if (kb) scoreMap[rankedIds[i]] *= kb;
  }
  // Coverage multiplier (distinct original terms matched).
  for (let i = 0; i < rankedIds.length; i++) {
    const cc = popcount(termMask[rankedIds[i]] || 0);
    if (cc > 1) scoreMap[rankedIds[i]] *= coverageMultiplier(cc);
  }
  // Phrase-proximity boost (multi-word non-phrase queries, full-coverage docs).
  const qTokens = (!p.phrase && filtered.length > 1) ? kjvEncode(query) : null;
  if (qTokens) {
    for (let i = 0; i < rankedIds.length; i++) {
      const id = rankedIds[i];
      if (popcount(termMask[id] || 0) === filtered.length) {
        const d = docLookup[id];
        if (d && phraseTokenMatch((d.text || '') + ' ' + (d.title || ''), qTokens)) scoreMap[id] *= PHRASE_BOOST;
      }
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

  for (let h = 0; h < rankedIds.length && out.length < limit; h++) {
    const id = rankedIds[h];
    const doc = docLookup[id];
    if (!doc) continue;
    if (corpusFilter && doc.corpus !== corpusFilter) continue;
    if (scopeBookId && doc.bookId !== scopeBookId) continue;
    if (scopeVolumeId && doc.volumeId !== scopeVolumeId) continue;
    if (phraseToks || hasMust || hasMustNot) {
      const toks = kjvEncode((doc.text || '') + ' ' + (doc.title || '') + ' ' + (doc.heading || '') + ' ' + (doc.ref || ''));
      if (phraseToks && !hasTokenRun(toks, phraseToks)) continue;
      if (hasMust && !mustToks.every((run) => hasTokenRun(toks, run))) continue;
      if (mustNotToks.some((run) => hasTokenRun(toks, run))) continue;
    }
    const dedupKey = doc.kind + '|' + (doc.ref || '') + '|' + (doc.text || '').slice(0, 60);
    if (seen[dedupKey]) continue;
    seen[dedupKey] = true;
    out.push({ score: scoreMap[id], doc: reshapeDoc(doc), terms: matchedTerms[id] || [] });
  }

  return { parsed, results: out, parsedTerms: filtered, textQuery: p };
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
  highlightSpans,
  levenshtein,
  fuzzyBookSuggest,
  getState,
  getStats,
};

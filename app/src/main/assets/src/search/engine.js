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
     6. emit { score, doc } — doc carries the routing/display contract fields
   ═══════════════════════════════════════════════════════════════════════ */

import MiniSearch from './vendor/minisearch.js';
import { searchData } from './search-data.js';
import { buildMiniSearchOptions, MS_STORE_FIELDS, MS_SEARCH_DEFAULTS } from './search-config.js';
import { buildDocs } from './index-builder.js';
import { parseReference, fuzzyBookSuggest, levenshtein } from './ref-parser.js';
import { expandQueryTerms } from './synonyms.js';
import { kjvEncode } from './tokenize.js';
import { snippet, highlightSpans } from './snippet.js';
import { KIND_BOOST, coverageMultiplier, popcount, phraseTokenMatch, PHRASE_BOOST, SYNONYM_DEMOTION } from './ranking.js';
import { loadCached, saveCached, clearCached, dataSignature } from './cache.js';

const FUZZY = 0.2;

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
 * @returns {Promise<{parsed:Object|null, results:Array<{score:number, doc:Object}>, parsedTerms?:string[], textQuery?:Object|null}>}
 */
async function search(query, options) {
  options = options || {};
  const limit = options.limit || 200;
  const corpus = options.corpus || 'all';
  await ensureReady(options);

  const parsed = parseReference(query, { corpus });
  if (!parsed) return { parsed: null, results: [] };
  // Command + structured references (bible / book / letter / named-passage) are
  // answered by a direct-nav card built in the UI — skip text search entirely.
  if (parsed.kind !== 'text') return { parsed, results: [], parsedTerms: [], textQuery: null };

  const p = parsed;
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
  const docLookup = Object.create(null);
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    let res;
    try {
      res = msIndex.search(unit.term, {
        prefix: unit.literal,
        fuzzy: unit.literal ? FUZZY : false,
        combineWith: 'AND',
        boost: MS_SEARCH_DEFAULTS.boost,
      });
    } catch { continue; }
    if (!res) continue;
    for (let r = 0; r < res.length; r++) {
      const hit = res[r];
      const id = hit.id;
      scoreMap[id] = (scoreMap[id] || 0) + hit.score;
      if (!docLookup[id]) docLookup[id] = hit;
      if (unit.literal) literalHit[id] = true;
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
  const phraseLower = p.phrase ? p.phrase.toLowerCase() : null;
  const hasMust = !!(p.must && p.must.length);
  const hasMustNot = !!(p.mustNot && p.mustNot.length);
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
    let combined = null;
    if (phraseLower || hasMust || hasMustNot) {
      combined = ((doc.text || '') + ' ' + (doc.title || '') + ' ' + (doc.heading || '') + ' ' + (doc.ref || '')).toLowerCase();
    }
    if (phraseLower && combined.indexOf(phraseLower) < 0) continue;
    if (hasMust) {
      let ok = true;
      for (let mi = 0; mi < p.must.length; mi++) if (combined.indexOf(p.must[mi]) < 0) { ok = false; break; }
      if (!ok) continue;
    }
    if (hasMustNot) {
      let ok = true;
      for (let mn = 0; mn < p.mustNot.length; mn++) if (combined.indexOf(p.mustNot[mn]) >= 0) { ok = false; break; }
      if (!ok) continue;
    }
    const dedupKey = doc.kind + '|' + (doc.ref || '') + '|' + (doc.text || '').slice(0, 60);
    if (seen[dedupKey]) continue;
    seen[dedupKey] = true;
    out.push({ score: scoreMap[id], doc: reshapeDoc(doc) });
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
  highlightSpans,
  levenshtein,
  fuzzyBookSuggest,
  getState,
  getStats,
};

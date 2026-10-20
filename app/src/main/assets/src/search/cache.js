/* ═══════════════════════════════════════════════════════════════════════
   search/cache.js — MiniSearch warm-index cache (IndexedDB)
   ═══════════════════════════════════════════════════════════════════════
   MEASURED (real corpus, 31,832 docs): a fresh build is ~10s (MiniSearch's
   addAll over ~1M tokens from the long VOT letter bodies — buildDocs itself is
   ~55ms), but JSON.stringify is ~0.5s and MiniSearch.loadJSON restores the whole
   index in ~0.3s. So the index is built ONCE (behind the progress bar), cached as
   one ~21 MB JSON blob, and warm-opened in ~0.3s every time after — a 30× win.
   Far simpler than the Classic engine's FlexSearch export/import callback dance:
   one key, one blob, restore via the static MiniSearch.loadJSON.

   Invalidation: a structural signature (corpus array lengths + book/chapter
   counts) busts the cache on any add/remove. MS_INDEX_VERSION busts it on a
   doc-shape / search-config change. CORPUS_CONTENT_VERSION (below) busts it
   on a content-only corpus edit (a reworded verse of the same length is
   structurally invisible): the pre-commit/CI corpus gate
   (tools/check-corpus-version.js, SRCH1) fails closed unless it equals the
   service worker's CORPUS_VERSION, so the corpus-edit → CORPUS_VERSION bump
   also rebuilds the search index. (This invariant lived in the retired
   Classic engine's assets/search.js; it moved here 2026-07-02 with the
   Classic retirement.)

   NOTE (verify gotcha): to test a fresh build in preview you must wipe this DB
   too — indexedDB.deleteDatabase('vot-minisearch-cache') — or it warm-restores.
   ═══════════════════════════════════════════════════════════════════════ */

const DB_NAME = 'vot-minisearch-cache';     // retired 2026-10-11 (below): only reclaimed now

/** Bump on any index-builder doc-shape OR search-config change (busts all caches). */
/* m2 (2026-08-04): the Matthew Study Bible's 1,071 verses now reach the
   index — the builder had been looping over a `sections` key matthew.js
   never had, so every cached index built before this is missing them and
   MUST be discarded rather than reused.
   m3 (2026-09-03): Hidden Manna left the index (owner policy — Matthew study
   chain only). Every index cached before this still CONTAINS its titles and
   bodies, so the builder change alone would keep serving the leak to every
   installed client forever; the bump is what discards them. */
export const MS_INDEX_VERSION = 'm19';  // m19: kjvEncode reads a pronoun contraction as its two words, typed bare ("youre" -> you are, "im" -> i am) or written (the "re" of "you’re" after its pronoun is "are") (search200 fix1, 2026-10-20); an m18 index holds "you re". PREVIOUS m18: kjvEncode reads a name written with an inner apostrophe as one word ("Sha’ul" -> shaul, "Ba‘al" -> baal), while a clitic after one (a possessive's s, n't, 're, 'll, 've, 'd, 'm) stays apart (search200 fix1, 2026-10-20); an m17 index holds "sha ul". PREVIOUS m17: kjvEncode reads a number however it is written (one through twenty, the tens and their ordinals as digits, "twenty-four" as 24, "144 000" as 144000), "&" as "and", and a negative contraction as its two words ("don't" -> do not, "can't" -> cannot) (search200 B2, 2026-10-18); an m16 index holds the words as written. PREVIOUS m16: a Bible Study chapter's poems are in its body, line by line (71 poetry blocks were on screen and unsearchable, sweep W30, 2026-10-14); an m15 index lacks them, and the meaning pack was rebuilt for the passages they move. PREVIOUS m15: the tokenizer's archaic table is a table of its own keys, so a text saying 'constructor' indexes it as the word (sweep W24, 2026-10-14); no shipped text says one, so an m14 index holds the same words and the bump is tokenize.js's gate. PREVIOUS m14: a collection's preface as the corpus holds it (its prefaceVar, no num) indexes its ref as 'Volume One · Preface'; m11 fixed only num 0, and five prefaces (V1/V7/Timothy/Flock/Rebuke) still showed 'Letter ?' (search plan S1, 2026-10-05); an m13 index holds the old ref. PREVIOUS m13: an Answers topic's cross-reference lines ("The Truth: ...", "Also See: ...") are not indexed as its words (search audit, 2026-09-27); an m12 index holds them. PREVIOUS m12: a letter's closing line is in its body (blockReadText reads a closing block's text), a number with thousands separators is one token ("144,000" -> 144000), and the KJV auxiliaries fold to their modern form (shalt -> shall, hath -> has ...) (search audit, 2026-09-27); an m11 index holds none of the three. PREVIOUS m11: a collection's preface letter (num 0) indexes its ref as 'Volume One · Preface', not 'Volume One · Letter ?' (2026-09-26); an m10 index holds the old ref. PREVIOUS m10: segmentRenderText no longer puts a seam space after an opening quote or before a closing one, so 187 Bible Study passages index as '"I will' not '" I will' (sweep-2 v14-corpus-01, 2026-09-26); an m9 index holds the old text. PREVIOUS m9: nothing indexed changes. segment-dom-text.js (fingerprinted) gained segmentsDomPieces for the link excerpt picker; the text index-builder reads is the same (2026-09-25)
// m8: WTLB, The Blessed, Holy Days and Answers bodies without their **bold** / _italic_ markers (2026-09-25)
// m7: letter and study bodies in the reader's text: no footnote numbers, letter-link labels, the renderer's spacing (2026-09-25)
// m6: KJV-R verses from the KJV base, block-shaped Holy Days bodies, studies always in (REPORT #8, 2026-09-24)
// m5: Answers Only God Can Give joins the index as its own kind (2026-09-22)

/** MUST equal service-worker.js CORPUS_VERSION — gate-enforced (SRCH1, see
 *  header). Busts the cached index on content-only corpus edits. */
export const CORPUS_CONTENT_VERSION = 'c72';

function ln(v) { return (v && typeof v.length === 'number') ? v.length : 0; }
function kc(v) { return (v && typeof v === 'object') ? Object.keys(v).length : 0; }
function g(name) { return (typeof window !== 'undefined' && typeof window[name] !== 'undefined') ? window[name] : undefined; }

function bookChapterCount() {
  const BOOKS = g('BOOKS');
  if (!BOOKS) return 0;
  let n = 0;
  const keys = Object.keys(BOOKS);
  for (let i = 0; i < keys.length; i++) {
    const b = BOOKS[keys[i]];
    if (b && Array.isArray(b.chapters)) n += b.chapters.length;
  }
  return n;
}

/**
 * A sparse overlay's base edition (KJV-R -> KJV) fills every verse the overlay
 * does not carry, so whether it was in memory shapes the index as much as the
 * overlay does (v07-04). '' for an edition with no non-NKJV base.
 * @param {string} translation
 * @returns {string}
 */
function baseFlag(translation) {
  const opts = g('TRANSLATION_OPTIONS');
  const opt = Array.isArray(opts) ? opts.find((o) => o && o.id === translation) : null;
  const base = opt && opt.base;
  if (!base || base === 'nkjv') return '';
  return '+' + (g('BIBLE_' + String(base).toUpperCase()) ? '1' : '0');
}

/* ANOTHER BUILD'S CORPUS (sweep W27, 2026-10-13). Offline, an incomplete corpus update reads the
   previous library's files, and right after a deploy the network can hand this page the next build's.
   The service worker marks every corpus file it serves from another build: the file runs one more
   line, pushing its path onto window.__votOtherCorpus (service-worker.js otherBuildCopy). An index
   built from one carries the count in its signature and is never kept (saveCached), so no later
   session searches that wording under this build's name, and the whole index already kept survives.
   Nothing marked: the signature is unchanged, so no client rebuilds for this. */
const OTHER_BUILD = '|ob:';

/**
 * Structural cache signature for the current corpus + translation.
 * @param {string} translation
 * @returns {string}
 */
export function dataSignature(translation) {
  const other = g('__votOtherCorpus');
  const sig = baseSignature(translation);
  return Array.isArray(other) && other.length ? sig + OTHER_BUILD + other.length : sig;
}

/** @param {string} translation @returns {string} */
function baseSignature(translation) {
  const MATTHEW = g('MATTHEW');
  return [
    'v:' + MS_INDEX_VERSION,
    'cv:' + CORPUS_CONTENT_VERSION,
    'tr:' + (translation || 'nkjv'),
    // Whether the alt-translation DATA was actually in memory when the index
    // was built. buildDocs reads window['BIBLE_<CODE>'] once and builds with no
    // alt text at all when it is absent — silently, because an absent global and
    // a translation with nothing to add are the same value to it. Without this
    // component that partial index caches under the SAME key as a complete one
    // and is served for the life of the corpus version. NKJV is baked into BOOKS
    // and has no global, so it is 'n' rather than a flapping 0.
    'alt:' + (!translation || translation === 'nkjv'
      ? 'n'
      : (g('BIBLE_' + translation.toUpperCase()) ? '1' : '0') + baseFlag(translation)),
    'bk:' + kc(g('BOOKS')) + '.' + bookChapterCount(),
    'mt:' + (MATTHEW && MATTHEW.chapters ? MATTHEW.chapters.length : 0),
    'v1:' + ln(g('LETTERS_V1')), 'v2:' + ln(g('LETTERS')), 'v3:' + ln(g('LETTERS_V3')),
    'v4:' + ln(g('LETTERS_V4')), 'v5:' + ln(g('LETTERS_V5')), 'v6:' + ln(g('LETTERS_V6')), 'v7:' + ln(g('LETTERS_V7')),
    'tm:' + ln(g('LETTERS_TIMOTHY')), 'fl:' + ln(g('LETTERS_FLOCK')), 'rb:' + ln(g('LETTERS_REBUKE')),
    'w1:' + ln(g('WTLB_ONE')), 'w2:' + ln(g('WTLB_TWO')), 'bl:' + ln(g('THE_BLESSED')),
    // No 'hm:' component — Hidden Manna is not indexed, so its length can no
    // longer shape the index and must not invalidate the cache.
    'hd:' + ln(g('HOLY_DAYS')), 'bs:' + ln(g('BIBLE_STUDIES')),
    // Answers is its own lazy file: an index built while it could not load
    // (offline, first visit) must not be served once it can.
    'an:' + ln(g('ANSWERS')),
  ].join('|');
}

/* ─── Where the warm index lives: the Cache API (2026-10-11) ───────────────
   It used to be one IndexedDB value of ~21 MB (DB 'vot-minisearch-cache'): a
   blob file in the same store as the reader's library, which the owner's
   WebView destroyed three times ("Unknown corruption", stores/idb-chunks.js
   header), and the biggest write the app made. CacheStorage is a separate
   backend: whatever happens to it costs one ~10 s rebuild, never the library.
   One entry, the signature in a header. No Cache API (a non-secure origin, an
   old engine) means no warm cache: search builds the index each session.
   app.jsx deletes the retired database once, where it still exists. */

/** The CacheStorage cache holding the warm index. */
export const SEARCH_CACHE_NAME = 'vot-search-index';
/** The retired IndexedDB database the index used to live in (app.jsx reclaims it). */
export const LEGACY_SEARCH_DB = DB_NAME;
/** The entry's key: a same-origin URL nothing ever fetches. */
const ENTRY_URL = '/__vot/search-index';
const SIG_HEADER = 'x-vot-index-sig';

/** @returns {Promise<Cache | null>} */
async function openCache() {
  const cs = /** @type {any} */ (globalThis).caches;
  if (!cs || typeof cs.open !== 'function') return null;
  return cs.open(SEARCH_CACHE_NAME);
}

/**
 * Return the cached serialized index IFF its signature matches, else null.
 * @param {string} sig
 * @returns {Promise<string|null>}
 */
export async function loadCached(sig) {
  try {
    const cache = await openCache();
    if (!cache) return null;
    const res = await cache.match(ENTRY_URL);
    if (!res || res.headers.get(SIG_HEADER) !== sig) return null;
    const json = await res.text();
    return json || null;
  } catch {
    return null; // unavailable / blocked — fall back to a fresh build
  }
}

/**
 * Persist the serialized index under the current signature (single entry).
 * @param {string} sig
 * @param {string} json
 * @returns {Promise<boolean>}
 */
export async function saveCached(sig, json) {
  if (sig.indexOf(OTHER_BUILD) >= 0) return false;   // built from another build's corpus: this session's alone
  try {
    const cache = await openCache();
    if (!cache) return false;
    await cache.put(ENTRY_URL, new Response(json, { headers: { 'content-type': 'application/json', [SIG_HEADER]: sig } }));
    return true;
  } catch {
    return false; // quota / unavailable — search still works, just rebuilds next time
  }
}

/** Clear the cache (used by "/rebuild index" and Clear All). @returns {Promise<boolean>} */
export async function clearCached() {
  try {
    const cs = /** @type {any} */ (globalThis).caches;
    if (!cs || typeof cs.delete !== 'function') return false;
    await cs.delete(SEARCH_CACHE_NAME);
    return true;
  } catch {
    return false;
  }
}

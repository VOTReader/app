/* ═══════════════════════════════════════════════════════════════════════
   search/search-config.js — MiniSearch index configuration (single source)
   ═══════════════════════════════════════════════════════════════════════
   The ONE place the MiniSearch index shape is defined, so build-time and any
   future serialize/restore use identical options.

   INDEX SCOPE (user directive): only "pure target material" is indexed —
   verse text, letter/entry names (titles), and letter/entry body text. Footnote
   refs, chapter summaries/titles, section headings (inline topic breaks), study
   notes, and cross-refs are NOT emitted as docs (see index-builder.js).

   • fields ['text','title'] — verse docs leave `title` empty (text-only, so a
     search never matches a verse on its reference, the old SRCH-1 burying bug);
     letter/entry docs fill both. `heading`/`ref` are STORED for display but
     never indexed.
   • processTerm + tokenize both delegate to kjvEncode → index-time and query-
     time folding/archaic-normalization are identical.
   • Kind weighting is applied by the engine after BM25 accumulation (ranking.js
     KIND_BOOST), NOT via boostDocument, because the engine runs one search per
     query unit and a per-search boostDocument would compound it.
   ═══════════════════════════════════════════════════════════════════════ */

import { kjvEncode } from './tokenize.js';

/** Indexed (searchable) fields. */
export const MS_FIELDS = ['text', 'title'];

/** Fields kept on each result for routing + display (see engine result contract). */
export const MS_STORE_FIELDS = [
  'kind', 'bookId', 'chapterNum', 'verseNum', 'letterId', 'letterNum',
  'volumeId', 'translation', 'testament', 'genre', 'title', 'heading', 'text', 'ref', 'corpus',
];

/** Default per-search options. The engine overrides prefix/fuzzy per unit
 *  (literal terms fuzzy+prefix; synonyms exact-only). */
export const MS_SEARCH_DEFAULTS = {
  boost: { title: 3, text: 1 },
  combineWith: 'AND', // a multi-word unit ("holy spirit") must co-occur
  prefix: true,
  fuzzy: 0.2,
  maxFuzzy: 2,
};

/**
 * Build the options object passed to `new MiniSearch(...)`.
 * @returns {Object}
 */
export function buildMiniSearchOptions() {
  return {
    idField: 'id',
    fields: MS_FIELDS,
    storeFields: MS_STORE_FIELDS,
    /** @param {string} term */
    processTerm: (term) => {
      const t = kjvEncode(term);
      if (!t.length) return null;
      return t.length === 1 ? t[0] : t;
    },
    /** @param {string} text */
    tokenize: (text) => kjvEncode(text),
    searchOptions: MS_SEARCH_DEFAULTS,
  };
}

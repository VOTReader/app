/* ═══════════════════════════════════════════════════════════════════════
   search/search-data.js — shared search reference-data accessor
   ═══════════════════════════════════════════════════════════════════════
   SINGLE SOURCE OF TRUTH. The book-abbreviation / named-passage / synonym /
   stop-word / volume-registry / command tables are owned by the classic
   script `assets/search-data.js` (window.VotSearchData), which ships in
   bundle-d (a side-effect import in src/ui/_entry-d.js since lz1, 2026-10-13;
   it left bundle-a 2026-09-22, see tools/build.py). The MiniSearch engine
   reads them through this thin accessor instead of duplicating ~590 lines of
   tables ([[consolidate-dont-duplicate]]); the Classic engine that once
   shared them was retired 2026-07-02, so the data could move into this module
   wholesale one day (and this accessor would become the owner). Read lazily
   (per call, not snapshotted) so load order never matters: bundle-d's
   search-data.js has always run by the time search does.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} SearchData
 * @property {Set<string>} STOP_WORDS
 * @property {Set<string>} STOP_WORDS_TRIMMED
 * @property {Object<string,string[]>} SYNONYM_MAP
 * @property {Object<string,string>} BOOK_ABBREVS
 * @property {Object<string,string>} [BOOK_NAMES_ES]  Spanish book names, exact lookup only (es1)
 * @property {Object<string,string>} BOOK_DISPLAY
 * @property {Array<Object>} NAMED_PASSAGES
 * @property {Object<string,Object>} NAMED_PASSAGE_INDEX
 * @property {Object<string,number>} WORD_NUMS
 * @property {Object<string,number>} ROMAN_NUMS
 * @property {Array<Object>} VOLUME_COLLECTIONS
 * @property {Object<string,Object>} VOLUME_TOKEN_MAP
 * @property {string[]} OT_BOOK_IDS
 * @property {string[]} NT_BOOK_IDS
 * @property {Object<string,string[]>} GENRE_GROUPS
 * @property {Array<Object>} COMMANDS
 * @property {Object<string,Object>} COMMAND_MAP
 */

/** A table of its own keys: no 'constructor' (sweep W24). */
const bare = () => Object.create(null);

/** Empty fallback so callers never crash if the classic data bundle is absent. */
/** @type {SearchData} */
const EMPTY = {
  STOP_WORDS: new Set(),
  STOP_WORDS_TRIMMED: new Set(),
  SYNONYM_MAP: bare(),
  BOOK_ABBREVS: bare(),
  BOOK_NAMES_ES: bare(),
  BOOK_DISPLAY: bare(),
  NAMED_PASSAGES: [],
  NAMED_PASSAGE_INDEX: bare(),
  WORD_NUMS: bare(),
  ROMAN_NUMS: bare(),
  VOLUME_COLLECTIONS: [],
  VOLUME_TOKEN_MAP: bare(),
  OT_BOOK_IDS: [],
  NT_BOOK_IDS: [],
  GENRE_GROUPS: bare(),
  COMMANDS: [],
  COMMAND_MAP: bare(),
};

/**
 * The shared search-data tables (`window.VotSearchData`), or an empty fallback
 * if the classic data bundle hasn't loaded yet.
 * @returns {SearchData}
 */
export function searchData() {
  return (typeof window !== 'undefined' && window.VotSearchData) || EMPTY;
}

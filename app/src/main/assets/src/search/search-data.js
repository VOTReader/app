/* ═══════════════════════════════════════════════════════════════════════
   search/search-data.js — shared search reference-data accessor
   ═══════════════════════════════════════════════════════════════════════
   SINGLE SOURCE OF TRUTH. The book-abbreviation / named-passage / synonym /
   stop-word / volume-registry / command tables are owned by the classic
   `assets/search-data.js` (bundle-a, window.VotSearchData) and SHARED by BOTH
   search engines. The MiniSearch engine reads them through this thin accessor
   instead of duplicating ~590 lines of tables — duplication would be an
   edit-both-places hazard during the Classic/MiniSearch coexistence period
   ([[consolidate-dont-duplicate]]). This mirrors how the app shares React /
   BOOKS / COLLECTIONS as cross-bundle globals. If Classic is ever retired, the
   data can move into this module wholesale (and this accessor becomes the
   owner). Read lazily (per call, not snapshotted) so load order never matters:
   bundle-a/search-data.js is always present by the time search runs.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} SearchData
 * @property {Set<string>} STOP_WORDS
 * @property {Set<string>} STOP_WORDS_TRIMMED
 * @property {Object<string,string[]>} SYNONYM_MAP
 * @property {Object<string,string>} BOOK_ABBREVS
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

/** Empty fallback so callers never crash if the classic data bundle is absent. */
/** @type {SearchData} */
const EMPTY = {
  STOP_WORDS: new Set(),
  STOP_WORDS_TRIMMED: new Set(),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: {},
  BOOK_DISPLAY: {},
  NAMED_PASSAGES: [],
  NAMED_PASSAGE_INDEX: {},
  WORD_NUMS: {},
  ROMAN_NUMS: {},
  VOLUME_COLLECTIONS: [],
  VOLUME_TOKEN_MAP: {},
  OT_BOOK_IDS: [],
  NT_BOOK_IDS: [],
  GENRE_GROUPS: {},
  COMMANDS: [],
  COMMAND_MAP: {},
};

/**
 * The shared search-data tables (`window.VotSearchData`), or an empty fallback
 * if the classic data bundle hasn't loaded yet.
 * @returns {SearchData}
 */
export function searchData() {
  return (typeof window !== 'undefined' && window.VotSearchData) || EMPTY;
}

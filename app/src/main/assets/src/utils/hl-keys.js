/* ===================================================================
   hlKey builders — uniform localStorage key format for annotation/link/bookmark storage
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - bibleHlKey
   - letterHlKey
   - wtlbHlKey
   - studyHlKey
   =================================================================== */


/**
 * Build the canonical hlKey for a Bible verse anchor.
 * Format: `bible:<bookId>:<chapter>:<verse>`.
 *
 * @param {string} bookId
 * @param {number} chapter
 * @param {number} verse
 * @returns {string}
 */
export function bibleHlKey(bookId, chapter, verse) { return 'bible:' + bookId + ':' + chapter + ':' + verse; }

/**
 * Build the canonical hlKey for a Letter block anchor.
 * Format: `letter:<letterId>:<blockIdx>`.
 *
 * @param {string} letterId
 * @param {number} blockIdx
 * @returns {string}
 */
export function letterHlKey(letterId, blockIdx) { return 'letter:' + letterId + ':' + blockIdx; }

/**
 * Build the canonical hlKey for a WTLB paragraph anchor.
 * Format: `wtlb:<entryId>:<paraIdx>`.
 *
 * @param {string} entryId
 * @param {number} paraIdx
 * @returns {string}
 */
export function wtlbHlKey(entryId, paraIdx) { return 'wtlb:' + entryId + ':' + paraIdx; }

/**
 * Build the canonical hlKey for a MATTHEW STUDY BIBLE anchor (ChapterView —
 * verse numbers, plus suffixed study-note containers like `12-s0`). The
 * letter-format Bible Studies (BibleStudyChapterView → LetterView shim) key
 * their blocks with letterHlKey instead — two namespaces, one per surface.
 * Format: `study:<chapterId>:<blockIdx>`.
 *
 * @param {string} chapterId
 * @param {number | string} blockIdx
 * @returns {string}
 */
export function studyHlKey(chapterId, blockIdx) { return 'study:' + chapterId + ':' + blockIdx; }


/**
 * The Regarding The Holy Days entries LetterView renders. screen-routes.jsx
 * sends a Holy Days entry of type 'wtlb' to WtlbEntryView (wtlb:<id>:<n>) and
 * every other one to LetterView (letter:<id>:<n>). Written out rather than read
 * from HOLY_DAYS because LinkStore repairs saved links before that corpus has
 * loaded; hl-keys.test.js holds this list to data/holy-days.js.
 */
export const HOLY_DAYS_LETTER_IDS = new Set([
  'walking-in-the-footsteps-of-the-messiahs-passion',
  'do-this-in-remembrance-of-me',
  'i-am-the-passover-and-the-lamb-the-new-covenant-with-men',
  'keep-the-passover',
  'unleavened',
  'devotion',
  'i-am-risen',
  'i-shall-remove-my-hand-and-my-spirit-shall-be-withdrawn-and-that-purposed-from-the-beginning-shall-be-done-it-shall-be-accomplished-swiftly',
  'pentecost',
  'to-be-set-apart',
  'atonement',
]);

/**
 * The `<space>:<entryId>` a Format B entry's link endpoint is keyed under: the
 * space its reader paints, so the chain icon shows and a tap scrolls to the
 * block. `type` is the endpoint type (wtlb / blessed / holy-days); ids are only
 * unique within a collection ("devotion" is in WTLB One and Holy Days).
 *
 * @param {string} type
 * @param {string} entryId
 * @returns {string}
 */
export function entryHlBase(type, entryId) {
  return (type === 'holy-days' && HOLY_DAYS_LETTER_IDS.has(entryId) ? 'letter:' : 'wtlb:') + entryId;
}

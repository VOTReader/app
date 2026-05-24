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
 * Build the canonical hlKey for a Bible Study chapter block anchor.
 * Format: `study:<chapterId>:<blockIdx>`.
 *
 * @param {string} chapterId
 * @param {number} blockIdx
 * @returns {string}
 */
export function studyHlKey(chapterId, blockIdx) { return 'study:' + chapterId + ':' + blockIdx; }


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


export function bibleHlKey(bookId, chapter, verse) { return 'bible:' + bookId + ':' + chapter + ':' + verse; }

export function letterHlKey(letterId, blockIdx) { return 'letter:' + letterId + ':' + blockIdx; }

export function wtlbHlKey(entryId, paraIdx) { return 'wtlb:' + entryId + ':' + paraIdx; }

export function studyHlKey(chapterId, blockIdx) { return 'study:' + chapterId + ':' + blockIdx; }


/* ═══════════════════════════════════════════════════════════════════════
   answers-from-search — Search's "Or ask: Answers Only God Can Give" (PL-SEARCH 2)

   Search's nothing-found screen offers the Answers landing. Opened that way,
   the landing holds the words he typed in Search, and Back (the bar's and
   the phone's) returns to Search, not Home. This is the one fact both the
   landing and the Back handlers read: the words carried over, or null when
   the landing was not opened from Search. Module memory, like the landing's
   own (AnswersHome.jsx): a fresh start forgets it and Back goes Home.
   ═══════════════════════════════════════════════════════════════════════ */

/** @type {string | null} */
let _carried = null;

/** The words Search handed the Answers landing, or null when it was not opened from Search. */
export function answersFromSearch() { return _carried; }

/** @param {string | null} q the typed words (trimmed), or null to forget */
export function setAnswersFromSearch(q) { _carried = q == null ? null : String(q).trim(); }

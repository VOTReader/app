/* ═══════════════════════════════════════════════════════════════════════
   answers-from-search — Search's "Or ask: Answers Only God Can Give" (PL-SEARCH 2)

   Search's nothing-found screen offers the Answers landing. Opened that way,
   the landing holds the words he typed in Search, and Back (the bar's and
   the phone's) returns to Search, not Home. This is the one fact both the
   landing and the Back handlers read: the words carried over, or null when
   the landing was not opened from Search. Module memory, like the landing's
   own (AnswersHome.jsx): a fresh start forgets it and Back goes Home.

   bundles-n1 (audit 2026-11-23): bundle-d sets it (Search, AnswersHome) and
   bundle-b reads it (use-android-back), and each bundle has its own copy of
   this module, so it lives in sharedState: one value for both copies.
   ═══════════════════════════════════════════════════════════════════════ */

import { sharedState } from './shared-state.js';

/** @type {{ carried: string | null }} */
const _s = sharedState('answers-from-search', () => ({ carried: null }));

/** The words Search handed the Answers landing, or null when it was not opened from Search. */
export function answersFromSearch() { return _s.carried; }

/** @param {string | null} q the typed words (trimmed), or null to forget */
export function setAnswersFromSearch(q) { _s.carried = q == null ? null : String(q).trim(); }

/* ═══════════════════════════════════════════════════════════════════════
   search-visit — the reader's side of a search hit (search200 UX B1)
   ═══════════════════════════════════════════════════════════════════════
   Imported by hooks/use-search.js and hooks/use-reading-position-nav.js
   (bundle-b) and by ui/screen-routes.jsx (bundle-d). Pure: no state, no DOM.

   A search hit opens a reading place for a look. Two things follow from that:

   1. The reader's own back returns to the results. The system back (Android
      back / Escape, hooks/use-android-back.js) always did; the on-screen ‹ went
      to the parent index instead, so a letter could never get back to its
      results by the arrows and a Bible chapter took two taps.
      searchBackActive() says when the ‹ and the "Back to results" pill must go
      to the results. It mirrors the handler's precedence exactly (a later
      breadcrumb — a tap-through stack, a WTLB {{nav}} hop, a Matthew card, a
      Surprise — owns the back first), and search-visit.test.js drives the real
      handler across every state to keep the two in step.

   2. The look records no reading progress. useSearch names the place a hit
      opens (readingPlaceKey, kept in the searchLanding tab field); the
      catch-all arm skips it and the routes switch the read tracker off for it.
      Any other reading place is reading again.
   ═══════════════════════════════════════════════════════════════════════ */

import { COL_BY_LETTER_SC, LETTER_SCREEN_SET } from '../data/scripture-resolution.js';

/** Registry lookups that read "no" rather than throw before the registry exists (tests stub it per case). */
const isLetterScreen = (screen) => !!COL_BY_LETTER_SC && COL_BY_LETTER_SC.has(screen);
const isLetterShaped = (screen) => !!LETTER_SCREEN_SET && LETTER_SCREEN_SET.has(screen);

/** The destination's name: the ‹ reads "Back to results" (LibraryNav adds "Back to"). */
export const RESULTS_LABEL = 'results';

/**
 * One key per reading place, or null for a half-populated place or a screen
 * that is not for reading. Matthew's study chapters are keyed by chapter alone:
 * the screen fixes the book.
 * @param {{ screen?: string | null, bookId?: string | null, chapterNum?: number | string | null,
 *   letterId?: string | null, studyId?: string | null, studyChapterId?: string | null }} place
 * @returns {string | null}
 */
export function readingPlaceKey({ screen, bookId, chapterNum, letterId, studyId, studyChapterId }) {
  if (screen === 'bible-ch') return bookId && chapterNum != null ? 'bible-ch:' + bookId + ':' + chapterNum : null;
  if (screen === 'matthew-ch') return chapterNum != null ? 'matthew-ch:' + chapterNum : null;
  if (screen === 'bible-study-chapter') return studyId && studyChapterId ? 'bible-study-chapter:' + studyId + ':' + studyChapterId : null;
  if (screen && isLetterScreen(screen)) return letterId ? screen + ':' + letterId : null;
  return null;
}

/**
 * Whether the reader's back from this screen ends at the search results — the
 * same answer handleAndroidBack gives (use-android-back.js), state for state.
 * @param {{ screen: string | null, fromSearch: boolean, fromSurprise?: boolean, fromWtlb?: string | null,
 *   fromMatthewCh?: any, stackLength?: number, backActive?: boolean }} s
 * @returns {boolean}
 */
export function searchBackActive({ screen, fromSearch, fromSurprise, fromWtlb, fromMatthewCh, stackLength, backActive }) {
  if (!fromSearch || fromSurprise || !screen) return false;
  // The tap-through stack pops first on every letter-shaped screen (study chapters too).
  if (isLetterShaped(screen) && (stackLength || 0) > 0) return false;
  if (screen === 'bible-ch' || screen === 'matthew-ch') {
    if (backActive) return false;                       // a live tap-through pill wins
    return !(screen === 'bible-ch' && fromWtlb);        // a WTLB {{nav}} hop returns to its entry
  }
  if (screen === 'bible-study-chapter') return true;
  if (isLetterScreen(screen)) return !fromMatthewCh;   // a Matthew card's letter returns to Matthew
  return false;
}

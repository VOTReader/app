/* ═══════════════════════════════════════════════════════════════════════
   answers-retired — where the retired Answers screens send a saved place
   ═══════════════════════════════════════════════════════════════════════
   The AOGCG redesign (Browse stage, 2026-10-22) retires the app's nine
   subject tiles ('answers-subject', letterId = the subject's id) and the
   separate A–Z screen ('answers-az'): the landing lists the site's own
   contents, with A–Z as its second tab. A tab, a history row or the
   resume record saved before the redesign still names them, so each one
   reopens where its topics now live: a subject that is (nearly) one of the
   site's numbered groups opens that group's shelf ('answers-group',
   letterId = the group's number), any other subject and the A–Z screen open
   the landing. Kept tiny and free of imports: use-saved-state (bundle-b)
   reads it on every restore.
   ═══════════════════════════════════════════════════════════════════════ */

/** A retired subject id → the site group ('1'..'12') that holds its topics. */
export const ANSWERS_SUBJECT_GROUP = Object.freeze({
  'sin-repentance-and-salvation': '7',
  'walking-with-god': '10',
  'churches-and-doctrines-of-men': '4',
  'marriage-family-and-body': '11',
});

/** The shelves 'answers-group' opens: the twelve groups by number, and Other Topics. */
export function isAnswersGroupKey(key) {
  const k = String(key == null ? '' : key);
  if (k === 'other') return true;
  const n = Number(k);
  return String(n) === k && Number.isInteger(n) && n >= 1 && n <= 12;
}

/**
 * Rewrite a saved place on a retired Answers screen (or a shelf with no key) to where it lives
 * now. Mutates `s` and returns it, like use-saved-state's _validateTabState.
 * @template {{ screen?: string, letterId?: string | null }} T
 * @param {T} s
 * @returns {T}
 */
export function answersRetiredPlace(s) {
  if (!s) return s;
  if (s.screen === 'answers-subject') {
    const g = /** @type {Record<string, string>} */ (ANSWERS_SUBJECT_GROUP)[String(s.letterId || '')];
    if (g) { s.screen = 'answers-group'; s.letterId = g; } else { s.screen = 'answers-home'; s.letterId = null; }
  } else if (s.screen === 'answers-az') {
    s.screen = 'answers-home';
  } else if (s.screen === 'answers-group' && !isAnswersGroupKey(s.letterId)) {
    s.screen = 'answers-home';
    s.letterId = null;
  }
  return s;
}

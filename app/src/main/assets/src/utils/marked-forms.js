/* ═══════════════════════════════════════════════════════════════════════
   marked-forms — which of the engine's matched forms a search marks
   ═══════════════════════════════════════════════════════════════════════
   One rule for the result card's <mark>s (SrchCard) and the words the unit
   opened from it finds (use-search.js excerptAnchor, the FindInUnit pill):
   the pill counted "whom" and "whoever" in a letter opened from a lone "who",
   words its card left unmarked (search200 UX D6). Moved from SrchCard.jsx. */

/** One letter apart: one added, dropped or changed. @param {string} a @param {string} b */
function oneEdit(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) === 1;
}

/**
 * A TYPED SMALL WORD MARKS ONLY ITSELF (search200 B7 review). The engine prefix-matches
 * a typed word, small ones too, and its forms come in the card's terms as if typed:
 * "christ who strengthens me" marked "whom all things", a lone "who" marked whom,
 * whoredoms and whosoever. A form that extends a typed stop word, or is a letter off
 * it, is left out, unless it was typed or extends (or is a letter off) a typed real word.
 * A word under three letters reaches no forms (the engine's `prefixable`), so "is" never
 * takes "Israel" from a typed "isreal". Pure.
 * @param {string[]} forms  the engine's matched forms (entry.terms)
 * @param {string[]} terms  the screen's terms (the typed words, their synonyms)
 * @param {string[]} stopTyped  the small words typed, lowercase
 * @returns {string[]}
 */
export function formsToMark(forms, terms, stopTyped) {
  const reaching = (stopTyped || []).filter((s) => s.length >= 3);
  if (!reaching.length) return forms;
  const typed = (terms || []).map((t) => String(t).toLowerCase());
  const real = typed.filter((t) => stopTyped.indexOf(t) < 0);
  const near = (/** @type {string} */ f, /** @type {string} */ w) => f.startsWith(w) || oneEdit(f, w);
  return forms.filter((form) => {
    const f = String(form).toLowerCase();
    if (typed.indexOf(f) >= 0 || stopTyped.indexOf(f) >= 0) return true;
    if (!reaching.some((s) => near(f, s))) return true;
    return real.some((t) => near(f, t));
  });
}

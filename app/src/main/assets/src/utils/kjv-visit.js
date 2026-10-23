/* ═══════════════════════════════════════════════════════════════════════
   kjv-visit — the edition a verse found in its KJV wording opens in
   ═══════════════════════════════════════════════════════════════════════
   search200 idea A (2026-10-22, PICKS.md A). Every verse is searched in its
   KJV wording beside the reader's edition (search/kjv-twin.js), and a verse
   that wording found (the engine's `kjvWording`) shows on its card in the
   KJV words it matched and opens in the KJV for that visit only, under
   "Shown in KJV, as you searched · Read in <edition>". The twin file is
   the plain KJV (data/bible-kjv.js), so the visit is the plain KJV for
   every reader, a restored-name one included: those are the words typed.
   A KJV reader already reads them. Pure. */

/**
 * @param {string | undefined | null} readerEdition  the edition the index (and the reader) reads
 * @returns {string | null}  the edition to open in for the visit, or null for none
 */
export function kjvVisitEdition(readerEdition) {
  return (readerEdition || 'nkjv') === 'kjv' ? null : 'kjv';
}

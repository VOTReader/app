/* What a collection calls one of its pieces: letters, a study's chapters, or entries for the WTLB and Blessed
   families. The Holy Days hold letters: their Read tile says 'N Letters' (VolumesHome), and every screen names a
   collection's pieces alike (L4). Pure, so any bundle may import it (Listen, History and Continue use it). */

/** @param {any} col @param {number} count @returns {string} */
export function itemNoun(col, count) {
  if (col && col.kind === 'chapter') return count === 1 ? 'chapter' : 'chapters';
  const entry = !!(col && col.kind && col.kind !== 'letter' && col.kind !== 'holy-days');
  return count === 1 ? (entry ? 'entry' : 'letter') : (entry ? 'entries' : 'letters');
}

/** The collections whose pieces carry no number a reader would know: an Answers topic's is only its place in the file. */
const UNNUMBERED = new Set(['answers']);

/**
 * A piece's number in its collection's words, "Letter 4" or "Entry 31", or null where it has none to show (no
 * number, or an Answers topic). History, Continue and a bookmark's line say it alike.
 * @param {any} col @param {unknown} n @returns {string | null}
 */
export function itemNumber(col, n) {
  if (n == null || n === '' || (col && UNNUMBERED.has(col.volKey))) return null;
  const noun = itemNoun(col, 1);
  return noun.charAt(0).toUpperCase() + noun.slice(1) + ' ' + n;
}

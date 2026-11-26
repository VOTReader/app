/* What a collection calls one of its pieces: letters, a study's chapters, or entries for the WTLB and Blessed
   families. The Holy Days hold letters: their Read tile says 'N Letters' (VolumesHome), and every screen names a
   collection's pieces alike (L4). Pure, so any bundle may import it (Listen, History and Continue use it). */

/** @param {any} col @param {number} count @returns {string} */
export function itemNoun(col, count) {
  if (col && col.kind === 'chapter') return count === 1 ? 'chapter' : 'chapters';
  const entry = !!(col && col.kind && col.kind !== 'letter' && col.kind !== 'holy-days');
  return count === 1 ? (entry ? 'entry' : 'letter') : (entry ? 'entries' : 'letters');
}

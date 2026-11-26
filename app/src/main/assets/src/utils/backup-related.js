// @ts-check
/* backup-related.js — the parts of a backup that are computed from another part's records.

   A restore skips a part that fails its shape check (backup.js _applyStoresAndFlags and the V1 fallback), so the
   phone keeps its own copy. A part computed from that skipped part's records must stay with it: written alone it
   would describe the backup's records, which never landed, and drop the ones the phone kept.

   One group today, found by reading the stores (review 11-26):
     vot-journal → vot-journal-index   the reverse-link index ("N journal entries on this letter"), built only from
                                       entries' refs by JournalStore._reindex / removeEntry / clear
                                       (store-merge.js calls it a derived store);
                   vot-journal-stats   totalEntries counts the entries and the streak follows their dates; only
                                       JournalStore's create and remove cascades write it.
   Not a group, and why:
     vot-journal-notebooks, vot-notebooks   user-made kinds with rows of their own; entries and notes point at them,
                                            they are not computed from entries or notes.
     vot-reading-streak, vot-reading-stats  ledgers the read detector records as reads happen, not computed from
                                            vot-state's read marks (and vot-state also carries the settings).
     vot-audio-positions                    keyed by recording URL, not computed from vot-audio-library.
     journal media                          handled already: any skipped part makes the media a no-delete merge.

   Pure data, no store imports: shared by backup.js (the restore), backup-verify.js (the counts sheet and Verify)
   and backup-flow.js (the restore's result toast). */

/** @type {Readonly<Record<string, readonly string[]>>} */
export const STORES_DERIVED_FROM = Object.freeze({
  'vot-journal': Object.freeze(['vot-journal-index', 'vot-journal-stats']),
});

/**
 * The parts that go with the given unwritten ones: each part computed from one of them that `carries` says the
 * backup holds, not already in the list, in group order.
 * @param {readonly string[]} unwritten  parts the restore does not write (refused by the shape check, or unparsed)
 * @param {(name: string) => boolean} carries
 * @returns {string[]}
 */
export function storesSkippedWith(unwritten, carries) {
  /** @type {string[]} */ const out = [];
  for (const name of unwritten) {
    for (const d of STORES_DERIVED_FROM[name] || []) {
      if (unwritten.indexOf(d) < 0 && out.indexOf(d) < 0 && carries(d)) out.push(d);
    }
  }
  return out;
}

/**
 * Whether a skipped part was skipped only because its source was: it is computed from another part in the list.
 * @param {string} name
 * @param {readonly string[]} skipped
 * @returns {boolean}
 */
export function isSkippedWithSource(name, skipped) {
  return skipped.some((src) => src !== name && (STORES_DERIVED_FROM[src] || []).indexOf(name) >= 0);
}

/* list-members — what a list store's replaceAll keeps of a list it is handed (data-6, audit 2026-11-23).
   ═══════════════════════════════════════════════════════════════════════
   A backup or a restore can hand a store a list with a null, a number or a
   member with no id in it. Kept as they came, a null broke every reader that
   does `e.id` and an id-less member could be neither opened, edited nor
   deleted. So:
     - a member that is an object is KEPT; one with no usable id gets a new one
       (the reader's words are never thrown away for a missing id);
     - a member that is not an object (null, a number, a string, an array)
       holds nothing a reader wrote and is dropped;
     - either one is reported in the diagnostic log, by store and count.
   ES module, bundle-b. */

import { DiagnosticLog } from '../utils/diagnostic-log.js';

/**
 * @param {any} list   the list handed to replaceAll (anything)
 * @param {() => string} mintId   the store's own id maker
 * @param {string} storeName   for the report
 * @returns {{ list: any[], dropped: number, minted: number }}
 */
export function keepListMembers(list, mintId, storeName) {
  if (!Array.isArray(list)) return { list: [], dropped: 0, minted: 0 };
  /** @type {any[]} */
  const out = [];
  let dropped = 0;
  let minted = 0;
  for (const m of list) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) { dropped++; continue; }
    if (typeof m.id !== 'string' || !m.id) { out.push({ ...m, id: mintId() }); minted++; continue; }
    out.push(m);
  }
  if (dropped || minted) {
    try {
      DiagnosticLog.warn('import', storeName + ': dropped ' + dropped + ' member(s) that were not records, gave ' + minted + ' record(s) a new id');
    } catch (_e) { /* logging must never break a restore */ }
  }
  return { list: out, dropped, minted };
}

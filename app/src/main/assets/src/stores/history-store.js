/* ══════════════════════════════════════════════════════════════════════
   HistoryStore — vot-history reading-history persistence
   ══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.

   Owns the reading-history array previously written to
   localStorage['vot-history'] by useHistory. Migrated to IDB under
   W2.3b. No lsShim — history isn't read at boot, so the array lives
   entirely in IDB after the legacy LS migration completes.

   Entry shape — see use-history.js for the full schema:
     { type: 'chapter' | 'letter' | 'study-chapter',
       ...type-specific fields...,
       key: dedup key (used by pruneDay),
       ts: Date.now() at record time }

   Cap: 2000 entries, newest-first. The cap is enforced on every
   add(); pruneDay() additionally dedupes within one calendar day.

   API:
     HistoryStore.list()                    → HistoryEntry[]
     HistoryStore.add(entry)                → void  (prepend + cap)
     HistoryStore.clear()                   → void
     HistoryStore.pruneDay(year,month,day)  → void  (dedup within day)
     HistoryStore.setAll(entries)           → void  (full replacement;
                                                    used by import path)

   Granular ops (not just setAll) so the W2.2 rebase queue can replay
   semantic operations rather than full-snapshot replacement. Pre-W2
   the hook held React state and wrote LS as a side-effect; now the
   store IS the source of truth and the hook subscribes via
   useSyncExternalStore.
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/**
 * @typedef {{
 *   type: 'chapter' | 'letter' | 'study-chapter',
 *   key?: string,
 *   ts?: number,
 *   [k: string]: any
 * }} HistoryEntry
 */

/**
 * Compute the dedup key for an entry — matches the addToHistory
 * implementation in use-history.js exactly so pruneDay's dedup
 * semantics carry over unchanged.
 *
 * @param {HistoryEntry} entry
 * @returns {string}
 */
function _historyKey(entry) {
  return entry.type === 'letter'
    ? 'lt:' + entry.letterId
    : 'ch:' + entry.bookId + ':' + entry.chapterNum;
}

export const HistoryStore = extendStore(
  CachedStore('vot-history', /** @type {HistoryEntry[]} */ ([]), { idb: true }),
  {
    /**
     * The full history array, newest first. Live cache reference —
     * callers must NOT mutate; use add/clear/pruneDay/setAll for
     * writes.
     * @returns {HistoryEntry[]}
     */
    list() { return this._load(); },

    /**
     * Prepend an entry with stamped key + ts. Caps the result at
     * 2000. Caller is responsible for the historyEnabled gate (the
     * hook does this so the gate isn't tied to the store API).
     * @param {HistoryEntry} entry
     * @returns {void}
     */
    add(entry) {
      if (!entry) return;
      if (this._shouldDefer('add', entry)) return;
      const stamped = { ...entry, key: _historyKey(entry), ts: Date.now() };
      this._cache = [stamped, ...this._load()].slice(0, 2000);
      this._save();
      this._bump();
    },

    /**
     * Wipe the history. Idempotent.
     * @returns {void}
     */
    clear() {
      if (this._shouldDefer('clear')) return;
      this._cache = [];
      this._save();
      this._bump();
    },

    /**
     * Within the calendar day starting at (year, month, day), keep
     * only the most-recent visit per dedup key. Entries outside the
     * day are unaffected. (History is newest-first, so the FIRST
     * occurrence in iteration is the most-recent visit.)
     * @param {number} year
     * @param {number} month
     * @param {number} day
     * @returns {void}
     */
    pruneDay(year, month, day) {
      if (this._shouldDefer('pruneDay', year, month, day)) return;
      const dayStart = new Date(year, month, day).getTime();
      const dayEnd = new Date(year, month, day + 1).getTime();
      const seen = new Set();
      /** @type {HistoryEntry[]} */
      const out = [];
      for (const e of this._load()) {
        const ts = e.ts || 0;
        const inDay = ts >= dayStart && ts < dayEnd;
        if (inDay) {
          if (seen.has(e.key)) continue;
          seen.add(e.key);
        }
        out.push(e);
      }
      this._cache = out;
      this._save();
      this._bump();
    },

    /**
     * Replace the full array. Used by the import path (W2.6).
     * @param {HistoryEntry[]} entries
     * @returns {void}
     */
    setAll(entries) {
      if (this._shouldDefer('setAll', entries)) return;
      this._cache = Array.isArray(entries) ? entries.slice(0, 2000) : [];
      this._save();
      this._bump();
    },
  }
);

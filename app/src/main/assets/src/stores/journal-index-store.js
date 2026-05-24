/* ═══════════════════════════════════════════════════════════════
   JOURNAL INDEX STORE — reverse-link index
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (defined earlier in main script block).

   For each external resource a journal entry references, this index
   stores the list of entry IDs that reference it. Letter/chapter views
   query the index to display "X journal entries on this letter" chips
   without walking every entry's blocks on every render.

   Reference key format (one entry per kind):
     'letter:<collection-volKey>/<letterId>'   — letter card or inline link
     'chapter:<bookId>:<chapter>'              — Bible chapter card
     'verse:<bookId>:<chapter>:<verse>'        — full verse-block embed
     'study:<studyId>:<chapterId>'             — Matthew/Bible Study chapter
     'bookmark:<bookmarkId>'                   — bookmark card or inline
     'note:<noteGroupId>'                      — note card
     'journal:<entryId>'                       — intra-journal link
     'scripture:<rawRef>'                      — inline {{ref:Book X:Y}} mark

   Data shape:
     vot-journal-index: { [refKey]: Array<journalEntryId> }

   API:
     JournalIndexStore.entriesReferencing(refKey)   → Array<entryId>
     JournalIndexStore.rebuildForEntry(entry)       — caller: provides
       refs[] computed by JournalHelpers.collectRefs(entry).
     JournalIndexStore.removeEntry(entryId)         — strips entryId
       from every key (when an entry is deleted).
     JournalIndexStore.refsForEntry(entryId)        → Array<refKey>
       — reverse lookup: which refKeys does THIS entry contribute to?
═══════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/**
 * Reverse-index shape: refKey → array of journal-entry ids that
 * reference that resource. See the file header for the refKey grammar.
 *
 * @typedef {Record<string, string[]>} JournalIndexData
 */

export var JournalIndexStore = extendStore(
  CachedStore('vot-journal-index', /** @type {JournalIndexData} */ ({})),
  {
    /**
     * Journal-entry ids that reference `refKey`. Returns a defensive copy
     * (callers can mutate without affecting the cache). Empty array for
     * unknown keys.
     * @param {string | null | undefined} refKey
     * @returns {string[]}
     */
    entriesReferencing(refKey) {
      if (!refKey) return [];
      var data = this._load();
      return (data[refKey] || []).slice();
    },

    /**
     * Cheap "any references?" check — used by the inbound-chip render
     * guard. Avoids the array copy that entriesReferencing makes.
     * @param {string | null | undefined} refKey
     * @returns {boolean}
     */
    hasReferences(refKey) {
      if (!refKey) return false;
      var data = this._load();
      return Array.isArray(data[refKey]) && data[refKey].length > 0;
    },

    /**
     * Sync the index against one entry's current refs. Removes entryId
     * from every refKey it used to point at but no longer does, then
     * adds it to every new refKey. Net effect: the index is consistent
     * with this entry's current state.
     *
     * Caller computes `refs` via JournalHelpers.collectRefs(entry).
     *
     * @param {string} entryId
     * @param {string[]} refs
     * @returns {void}
     */
    rebuildForEntry(entryId, refs) {
      if (!entryId) return;
      var data = this._load();
      /** @type {Record<string, boolean>} */
      var newSet = {};
      (refs || []).forEach(function(r) { newSet[r] = true; });
      // Pass 1: remove entryId from any refKey not in newSet
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (newSet[k]) continue;
        var list = data[k];
        if (!Array.isArray(list)) continue;
        var idx = list.indexOf(entryId);
        if (idx >= 0) {
          list.splice(idx, 1);
          if (list.length === 0) delete data[k];
        }
      }
      // Pass 2: add entryId to every new refKey
      Object.keys(newSet).forEach(function(k) {
        if (!Array.isArray(data[k])) data[k] = [];
        if (data[k].indexOf(entryId) < 0) data[k].push(entryId);
      });
      this._save();
    },

    /**
     * Strip entryId from every refKey list. Called on entry deletion.
     * Prunes empty buckets as it goes.
     * @param {string} entryId
     * @returns {void}
     */
    removeEntry(entryId) {
      if (!entryId) return;
      var data = this._load();
      var keys = Object.keys(data);
      var changed = false;
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var list = data[k];
        if (!Array.isArray(list)) continue;
        var idx = list.indexOf(entryId);
        if (idx >= 0) {
          list.splice(idx, 1);
          changed = true;
          if (list.length === 0) delete data[k];
        }
      }
      if (changed) this._save();
    },

    /**
     * Slow-path reverse lookup: which refKeys does this entry contribute
     * to. Used rarely — only on entry deletion if we want to know which
     * inbound chips will lose a count. Most callers should use
     * entriesReferencing() instead.
     * @param {string} entryId
     * @returns {string[]}
     */
    refsForEntry(entryId) {
      if (!entryId) return [];
      var data = this._load();
      /** @type {string[]} */
      var out = [];
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (Array.isArray(data[k]) && data[k].indexOf(entryId) >= 0) out.push(k);
      }
      return out;
    },

    /**
     * Wipe everything. Used when journal is fully cleared via import or
     * "Clear All Personal Data".
     * @returns {void}
     */
    clear() {
      this._cache = {};
      this._save();
    }
  }
);

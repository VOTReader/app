/* ═══════════════════════════════════════════════════════════════
   BOOKMARK STORE — saved passage anchors
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (defined earlier in the main script block).

   Data model:
     vot-bookmarks: Array<{
       id:      string,    // bkmId()
       hlKey:   string,    // container hlKey, with optional ":start-end" suffix
       label:   string,    // user-provided OR auto-derived from selection text
       thought: string,    // optional free-text — the user's reason WHY they
                           //   bookmarked this passage. Empty by default;
                           //   editable from the BookmarkPopover and
                           //   BookmarksScreen rows. Deliberately not called
                           //   "note" — notes are a separate feature.
       created: number,    // Date.now() at creation
       updated: number     // Date.now() at last edit
     }>

   Schema notes:
     - hlKey follows the same convention as LinkStore endpoint keys:
         "letter:the-wide-path:2"             (whole block)
         "letter:the-wide-path:2:10-40"       (selection range within block)
         "bible:genesis:1:3"                  (verse)
         "wtlb:matters-of-the-heart:0:5-20"   (range within WTLB paragraph)
     - Tags are deliberately out of scope for this version. The schema
       is tag-free so tags can be added as an additive follow-up.
     - label is required — on creation, auto-derive from snapped selection
       text if the user doesn't provide one.
═══════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';
import { mergeArrayStore } from './store-merge.js';

/**
 * A bookmark record — see the file header schema for field semantics.
 *
 * @typedef {{
 *   id: string,
 *   hlKey: string,
 *   label: string,
 *   thought?: string,
 *   created: number,
 *   updated: number
 * }} Bookmark
 */

/**
 * Generate a fresh bookmark id. Parallel to lnkId in link-store.js;
 * timestamp + random suffix gives microsecond-level uniqueness even
 * across rapid-fire creates.
 *
 * @returns {string}
 */
export function bkmId() { return 'bkm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

export const BookmarkStore = extendStore(
  CachedStore('vot-bookmarks', /** @type {Bookmark[]} */ ([]), { idb: true, crossTabMerge: mergeArrayStore }),
  {
    /**
     * Look up a bookmark by id.
     * @param {string} id
     * @returns {Bookmark | null}
     */
    get(id) {
      return this._load().find(function(b) { return b.id === id; }) || null;
    },

    /**
     * The full bookmark list (mutation through it persists on _save()).
     * @returns {Bookmark[]}
     */
    all() { return this._load(); },

    /**
     * Total bookmark count.
     * @returns {number}
     */
    count() { return this._load().length; },

    /**
     * Get all bookmarks whose hlKey exactly matches `key`, OR whose
     * key's prefix (everything before the last colon) matches — this
     * second branch lets a verse-level key match a bookmark stored on
     * the whole verse plus selection range.
     * @param {string} key
     * @returns {Bookmark[]}
     */
    getForKey(key) {
      return this._load().filter(function(b) { return b.hlKey === key || b.hlKey.split(':').slice(0, -1).join(':') === key; });
    },

    /**
     * Get all bookmarks whose hlKey shares a block-level prefix with
     * `prefix`, OR whose stored key is itself a prefix of `prefix`.
     * Mirrors the LinkStore.getForKeyPrefix() convention used by inline
     * icon scanners.
     * @param {string} prefix
     * @returns {Bookmark[]}
     */
    getForKeyPrefix(prefix) {
      return this._load().filter(function(b) {
        var k = b.hlKey;
        return k === prefix || k.indexOf(prefix + ':') === 0 || prefix.indexOf(k + ':') === 0;
      });
    },

    /**
     * Append a bookmark. No-op when bookmark is null or missing id/hlKey.
     * Stamps created/updated if absent.
     * @param {Bookmark | null | undefined} bookmark
     * @returns {void}
     */
    add(bookmark) {
      if (!bookmark || !bookmark.id || !bookmark.hlKey) return;
      if (this._shouldDefer('add', bookmark)) return;
      // Default-stamping happens AFTER the defer guard so the deferred
      // queue entry isn't pre-mutated. Symmetric with annotation-store.
      var ts = Date.now();
      if (!bookmark.created) bookmark.created = ts;
      if (!bookmark.updated) bookmark.updated = ts;
      this._load().push(bookmark);
      this._save();
      this._bump();
    },

    /**
     * Patch an existing bookmark — typically used to update label/thought.
     * No-op when id is unknown. Bumps updated.
     * @param {string} id
     * @param {Partial<Bookmark>} patch
     * @returns {void}
     */
    update(id, patch) {
      if (this._shouldDefer('update', id, patch)) return;
      var data = this._load();
      var idx = data.findIndex(function(b) { return b.id === id; });
      if (idx < 0) return;
      data[idx] = Object.assign({}, data[idx], patch, { updated: Date.now() });
      this._save();
      this._bump();
    },

    /**
     * Delete a bookmark by id. Idempotent.
     * @param {string} id
     * @returns {void}
     */
    remove(id) {
      if (this._shouldDefer('remove', id)) return;
      this._cache = this._load().filter(function(b) { return b.id !== id; });
      this._save();
      this._bump();
    },

    /**
     * Replace the entire bookmark list (W2.6 import path).
     * @param {Bookmark[] | null | undefined} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      this._cache = Array.isArray(data) ? data.slice() : [];
      this._save();
      this._bump();
    }
  }
);

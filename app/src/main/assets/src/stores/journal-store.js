/* ═══════════════════════════════════════════════════════════════
   JOURNAL STORE — entries CRUD + auto-index updates
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore, JournalIndexStore, JournalHelpers
     (collectRefs, defaultBlocks).

   Data model — vot-journal:
     { list: Array<JournalEntry> }

   JournalEntry:
     id              string  'j_<ts>_<rand>'
     title           string  ''  = untitled (auto-render uses date + first text)
     blocks          array   ordered list of block records — see journal-helpers
     mood            null | 'silver' | 'deep' | 'quiet'   (null = default gold)
     tags            string[]  ('#prayer' style — but stored WITHOUT the '#')
     notebookIds     string[]  ([] = Uncategorized; multi-membership)
     pinned          boolean
     created         ms
     updated         ms

   Notebook integration: uses a SEPARATE store (JournalNotebookStore on
   vot-journal-notebooks) so cascading delete via NotebookStore.remove
   doesn't impact note↔notebook relationships. The two stores have
   identical APIs.

   API summary:
     JournalStore.all()                 → entries (newest first by updated)
     JournalStore.allByCreated()        → entries sorted by created desc
     JournalStore.get(id)               → entry | null
     JournalStore.add(seed?)            → newly-created entry
     JournalStore.update(id, patch)     → bumps `updated`, rebuilds index
     JournalStore.remove(id)            → cascades index + stats
     JournalStore.setPinned(id, bool)
     JournalStore.togglePin(id)
     JournalStore.toggleNotebook(id, nbId)
     JournalStore.pruneNotebook(nbId)   → called by JournalNotebookStore.remove
     JournalStore.count()
     JournalStore.search(q)             → entries with q in title/preview/source label
     JournalStore.collectAllMediaIds()  → for orphan cleanup
═══════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';
import { mergeListStore } from './store-merge.js';

/**
 * A journal entry. Block contents are intentionally `any[]` — block shape
 * is heterogeneous (text / image / audio / letter-card / chapter-card /
 * bookmark-card / note-card / inline-link / etc.); see journal-helpers.js
 * for the full vocabulary.
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   blocks: any[],
 *   mood: null | 'silver' | 'deep' | 'quiet',
 *   tags: string[],
 *   notebookIds: string[],
 *   pinned: boolean,
 *   created: number,
 *   updated: number
 * }} JournalEntry
 */

/**
 * @typedef {{ list: JournalEntry[] }} JournalStoreData
 */

/**
 * Notebook record for the separate journal-notebooks store. Same shape
 * as the main NotebookStore's Notebook — kept parallel deliberately so
 * the journal/notes notebook surfaces are symmetric.
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   sortIndex: number,
 *   created: number,
 *   updated: number
 * }} JournalNotebook
 */

/**
 * @typedef {{ list: JournalNotebook[] }} JournalNotebookStoreData
 */

/**
 * Internal scan-result shape from _scanAssociated. `annKeys`/`noteGroupIds`/
 * `bookmarkIds`/`linkIds` are the cascade targets; the count fields drive
 * the delete-confirmation copy.
 *
 * @typedef {{
 *   annKeys: string[],
 *   noteGroupIds: string[],
 *   bookmarkIds: string[],
 *   linkIds: string[],
 *   highlights: number,
 *   underlines: number,
 *   notes: number,
 *   bookmarks: number,
 *   links: number
 * }} AssociatedScan
 */

/**
 * Generate a fresh journal-entry id.
 * @returns {string}
 */
export function jrnId() {
  return 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

export var JournalStore = extendStore(
  CachedStore('vot-journal', /** @type {JournalStoreData} */ ({ list: [] }), { idb: true, crossTabMerge: mergeListStore }),
  {
    /**
     * All entries, newest first by `updated` (falling back to `created`).
     * @returns {JournalEntry[]}
     */
    all() {
      var data = this._load();
      return (data.list || []).slice().sort(function(a, b) {
        return (b.updated || b.created || 0) - (a.updated || a.created || 0);
      });
    },

    /**
     * All entries sorted by created date (newest first). Used by the hub
     * when the user toggles to "by created" instead of "by updated".
     * @returns {JournalEntry[]}
     */
    allByCreated() {
      var data = this._load();
      return (data.list || []).slice().sort(function(a, b) {
        return (b.created || 0) - (a.created || 0);
      });
    },

    /**
     * Look up an entry by id.
     * @param {string | null | undefined} id
     * @returns {JournalEntry | null}
     */
    get(id) {
      if (!id) return null;
      var data = this._load();
      return (data.list || []).find(function(e) { return e.id === id; }) || null;
    },

    /**
     * Total entry count.
     * @returns {number}
     */
    count() {
      return (this._load().list || []).length;
    },

    /**
     * Create a new entry. `seed` optionally provides initial blocks (e.g.
     * when opened from parallel mode pre-attaching a letter card) and
     * other top-level fields (title, notebookIds, mood). Returns the
     * fresh entry record.
     *
     * @param {Partial<JournalEntry> | null | undefined} [seed]
     * @returns {JournalEntry}
     */
    add(seed) {
      seed = seed || {};
      var ts = Date.now();
      /** @type {JournalEntry} */
      var entry = {
        id: jrnId(),
        title: seed.title || '',
        blocks: Array.isArray(seed.blocks) ? seed.blocks.slice() : (typeof JournalHelpers !== 'undefined' ? JournalHelpers.defaultBlocks() : []),
        mood: seed.mood || null,
        tags: Array.isArray(seed.tags) ? seed.tags.slice() : [],
        notebookIds: Array.isArray(seed.notebookIds) ? seed.notebookIds.slice() : [],
        pinned: !!seed.pinned,
        created: ts,
        updated: ts
      };
      if (this._shouldDefer('add', entry)) return entry;
      var data = this._load();
      if (!data.list) data.list = [];
      data.list.push(entry);
      this._save();
      this._bump();
      this._reindex(entry);
      return entry;
    },

    /**
     * Apply a patch to an entry. `updated` is auto-bumped. When `blocks`
     * is in the patch, the reverse-link index is rebuilt for this entry.
     * Returns the updated entry or null when id is unknown.
     *
     * @param {string} id
     * @param {Partial<JournalEntry>} patch
     * @returns {JournalEntry | null}
     */
    update(id, patch) {
      if (!id || !patch) return null;
      if (this._shouldDefer('update', id, patch)) return null;
      var data = this._load();
      var list = data.list || [];
      var idx = list.findIndex(function(e) { return e.id === id; });
      if (idx < 0) return null;
      list[idx] = Object.assign({}, list[idx], patch, { updated: Date.now() });
      this._save();
      this._bump();
      if (patch.blocks) this._reindex(list[idx]);
      return list[idx];
    },

    /**
     * Enumerate every annotation/bookmark/link/note tied to an entry's
     * own block keys (prefix `journal:<id>:`). Drives both the delete-
     * confirmation copy (informed consent) AND the cascade. Counts are
     * per LOGICAL mark (a multi-block highlight = 1), matching how the
     * Library hubs count. Never throws — a counting hiccup must not
     * block a deletion the user asked for.
     *
     * @param {string} id
     * @returns {AssociatedScan}
     */
    _scanAssociated(id) {
      var prefix = 'journal:' + id + ':';
      /** @type {Record<string, 1>} */ var hlG = {};
      /** @type {Record<string, 1>} */ var ulG = {};
      /** @type {Record<string, 1>} */ var noteG = {};
      /** @type {string[]} */ var annKeys = [];
      /** @type {string[]} */ var bkmIds = [];
      /** @type {string[]} */ var linkIds = [];
      try {
        if (typeof AnnotationStore !== 'undefined') {
          var all = AnnotationStore.all() || {};
          Object.keys(all).forEach(function(k) {
            if (k.indexOf(prefix) !== 0) return;
            annKeys.push(k);
            (all[k] || []).forEach(function(a) {
              var gid = a.groupId || a.id;
              if (a.kind === 'note') noteG[gid] = 1;
              else if (a.kind === 'underline') ulG[gid] = 1;
              else hlG[gid] = 1;
            });
          });
        }
        if (typeof NoteStore !== 'undefined' && NoteStore._load) {
          var nraw = NoteStore._load() || {};
          Object.keys(nraw).forEach(function(gid) {
            var keys = (nraw[gid] && nraw[gid].keys) || [];
            if (keys.some(function(k) { return String(k).indexOf(prefix) === 0; })) noteG[gid] = 1;
          });
        }
        if (typeof BookmarkStore !== 'undefined' && BookmarkStore.getForKeyPrefix) {
          // getForKeyPrefix appends its own ':' (matches k.indexOf(prefix+':')),
          // so pass the entry prefix WITHOUT the trailing colon. The extra ':'
          // it adds also prevents substring-id false matches
          // (journal:j_1_ab vs journal:j_1_abc).
          (BookmarkStore.getForKeyPrefix('journal:' + id) || []).forEach(function(b) { bkmIds.push(b.id); });
        }
        if (typeof LinkStore !== 'undefined') {
          (LinkStore.all() || []).forEach(function(ln) {
            var s = ln.source || {}, t = ln.target || {};
            var hit =
              (s.key && String(s.key).indexOf(prefix) === 0) ||
              (t.key && String(t.key).indexOf(prefix) === 0) ||
              (s.type === 'journal' && s.entryId === id) ||
              (t.type === 'journal' && t.entryId === id);
            if (hit) linkIds.push(ln.id);
          });
        }
      } catch (_e) { /* counting must never block deletion */ }
      return {
        annKeys: annKeys, noteGroupIds: Object.keys(noteG),
        bookmarkIds: bkmIds, linkIds: linkIds,
        highlights: Object.keys(hlG).length, underlines: Object.keys(ulG).length,
        notes: Object.keys(noteG).length, bookmarks: bkmIds.length, links: linkIds.length
      };
    },

    /**
     * Just the count summary for the delete-confirmation modal.
     * @param {string} id
     * @returns {{ highlights: number, underlines: number, notes: number, bookmarks: number, links: number, total: number }}
     */
    associatedDataCounts(id) {
      var s = this._scanAssociated(id);
      return {
        highlights: s.highlights, underlines: s.underlines, notes: s.notes,
        bookmarks: s.bookmarks, links: s.links,
        total: s.highlights + s.underlines + s.notes + s.bookmarks + s.links
      };
    },

    /**
     * Human-readable summary phrase for the delete confirmation
     * ("2 highlights, 1 bookmark and 1 link"). Null when nothing is tied.
     * @param {string} id
     * @returns {string | null}
     */
    associatedDataSummary(id) {
      var c = this.associatedDataCounts(id);
      if (!c.total) return null;
      /** @type {string[]} */
      var parts = [];
      function p(/** @type {number} */ n, /** @type {string} */ s) { if (n > 0) parts.push(n + ' ' + s + (n === 1 ? '' : 's')); }
      p(c.highlights, 'highlight'); p(c.underlines, 'underline'); p(c.notes, 'note');
      p(c.bookmarks, 'bookmark'); p(c.links, 'link');
      var last = parts.pop();
      return parts.length ? parts.join(', ') + ' and ' + last : (last || null);
    },

    /**
     * Cascade-delete every annotation/bookmark/link tied to an entry.
     * Best-effort: a failure in one store doesn't block the others or
     * the parent entry deletion.
     * @param {string} id
     * @returns {void}
     */
    _purgeAssociated(id) {
      var s = this._scanAssociated(id);
      try {
        s.noteGroupIds.forEach(function(gid) {
          if (typeof NoteStore !== 'undefined') NoteStore.remove(gid);
          if (typeof AnnotationStore !== 'undefined') AnnotationStore.removeGroup(gid);
        });
        if (typeof AnnotationStore !== 'undefined') {
          s.annKeys.forEach(function(k) { AnnotationStore.removeAllForKey(k); });
        }
        if (typeof BookmarkStore !== 'undefined') {
          s.bookmarkIds.forEach(function(bid) { BookmarkStore.remove(bid); });
        }
        if (typeof LinkStore !== 'undefined') {
          s.linkIds.forEach(function(lid) { LinkStore.remove(lid); });
        }
      } catch (e) { console.warn('_purgeAssociated: cascade step failed for', id, e); }
    },

    /**
     * Delete an entry. Cascades FIRST so journal-scoped annotations/
     * bookmarks/links can't dangle. Centralized here because every
     * delete path (hub card menu, viewer) routes through remove() — it
     * cannot be bypassed.
     * @param {string} id
     * @returns {void}
     */
    remove(id) {
      if (!id) return;
      if (this._shouldDefer('remove', id)) return;
      // D6 — the cross-store cascade + index/stats updates are DURABLE
      // real-apply effects; they must NOT fire during the pending/degraded
      // overlay simulation (_applyToPendingCache → _applyingPending=true).
      // There the entry deletion is only QUEUED (not yet durable), but
      // _scanAssociated reads the loaded TARGET stores by key-prefix — so the
      // cascade would durably purge the associations (NoteStore/Annotation/
      // Bookmark/Link writes) + decrement stats immediately. If hydration
      // never completes (app closed while degraded), the delete is then
      // half-applied: associations gone but the entry kept = orphan; and the
      // cascade/stats also re-fire at replay (double recordDeletion). Gating
      // on !_applyingPending makes the whole delete atomic — it runs exactly
      // once, on the loaded path or on queue replay, never during the overlay.
      // The local list mutation below always runs so the overlay still
      // reflects the deletion immediately for the UI.
      if (!this._applyingPending) this._purgeAssociated(id);
      var data = this._load();
      data.list = (data.list || []).filter(function(e) { return e.id !== id; });
      this._save();
      this._bump();
      if (!this._applyingPending) {
        if (typeof JournalIndexStore !== 'undefined') JournalIndexStore.removeEntry(id);
        if (typeof JournalStatsStore !== 'undefined') JournalStatsStore.recordDeletion();
      }
    },

    /**
     * Set the pin flag explicitly.
     * @param {string} id
     * @param {boolean} pinned
     * @returns {JournalEntry | null}
     */
    setPinned(id, pinned) { return this.update(id, { pinned: !!pinned }); },

    /**
     * Toggle the pin flag.
     * @param {string} id
     * @returns {JournalEntry | null}
     */
    togglePin(id) {
      var e = this.get(id);
      if (!e) return null;
      return this.update(id, { pinned: !e.pinned });
    },

    /**
     * Toggle a notebook membership on an entry.
     * @param {string} id
     * @param {string} notebookId
     * @returns {JournalEntry | null}
     */
    toggleNotebook(id, notebookId) {
      var e = this.get(id);
      if (!e || !notebookId) return null;
      var ids = (e.notebookIds || []).slice();
      var i = ids.indexOf(notebookId);
      if (i >= 0) ids.splice(i, 1); else ids.push(notebookId);
      return this.update(id, { notebookIds: ids });
    },

    /**
     * Strip a deleted notebookId from every entry that referenced it.
     * Symmetric with NoteStore.pruneNotebook.
     * @param {string} notebookId
     * @returns {void}
     */
    pruneNotebook(notebookId) {
      if (!notebookId) return;
      if (this._shouldDefer('pruneNotebook', notebookId)) return;
      var data = this._load();
      var list = data.list || [];
      var changed = false;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.notebookIds || !e.notebookIds.length) continue;
        var before = e.notebookIds.length;
        e.notebookIds = e.notebookIds.filter(function(n) { return n !== notebookId; });
        if (e.notebookIds.length !== before) { e.updated = Date.now(); changed = true; }
      }
      if (changed) { this._save(); this._bump(); }
    },

    /**
     * Case-insensitive substring search across entry title, block text,
     * and tags. Empty query returns all() (sorted newest first).
     * @param {string | null | undefined} q
     * @returns {JournalEntry[]}
     */
    search(q) {
      var query = (q || '').trim().toLowerCase();
      if (!query) return this.all();
      return this.all().filter(function(e) {
        if ((e.title || '').toLowerCase().indexOf(query) >= 0) return true;
        var blocks = e.blocks || [];
        for (var i = 0; i < blocks.length; i++) {
          var b = blocks[i];
          var t = b.text || b.caption || b.label || b.title || '';
          if (typeof t === 'string' && t.toLowerCase().indexOf(query) >= 0) return true;
        }
        if (e.tags && e.tags.join(' ').toLowerCase().indexOf(query) >= 0) return true;
        return false;
      });
    },

    /**
     * Every mediaId referenced by every entry. Drives the orphan-cleanup
     * pass that identifies stale IDB blobs.
     * @returns {string[]}
     */
    collectAllMediaIds() {
      /** @type {string[]} */
      var ids = [];
      var list = (this._load().list || []);
      for (var i = 0; i < list.length; i++) {
        var blocks = list[i].blocks || [];
        for (var j = 0; j < blocks.length; j++) {
          var b = blocks[j];
          if ((b.type === 'image' || b.type === 'audio') && b.mediaId) ids.push(b.mediaId);
        }
      }
      return ids;
    },

    /**
     * True iff `mediaId` is referenced by a block in ANY entry other
     * than `exceptEntryId`. Drives shared-media protection — a journal→
     * journal embed shares the source's mediaId, so wiping the blob
     * just because the SOURCE block is deleted would break every embed
     * of it.
     * @param {string | null | undefined} mediaId
     * @param {string} exceptEntryId
     * @returns {boolean}
     */
    isMediaReferencedElsewhere(mediaId, exceptEntryId) {
      if (!mediaId) return false;
      var list = (this._load().list || []);
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === exceptEntryId) continue;
        var blocks = list[i].blocks || [];
        for (var j = 0; j < blocks.length; j++) {
          var b = blocks[j];
          if ((b.type === 'image' || b.type === 'audio') && b.mediaId === mediaId) return true;
        }
      }
      return false;
    },

    /**
     * Rebuild the JournalIndexStore reverse-index for an entry. Called
     * automatically on add() and on update() when blocks change.
     * No-op if JournalIndexStore or JournalHelpers is unavailable
     * (defensive — entries can still be created/edited if the index
     * isn't loaded yet).
     * @param {JournalEntry} entry
     * @returns {void}
     */
    _reindex(entry) {
      if (typeof JournalIndexStore === 'undefined' || typeof JournalHelpers === 'undefined') return;
      try {
        var refs = JournalHelpers.collectRefs(entry);
        JournalIndexStore.rebuildForEntry(entry.id, refs);
      } catch (e) { console.warn('Journal index update failed', e); }
    },

    /**
     * Wipe everything (entries + reverse-index). Used by "Clear All
     * Personal Data" in Settings.
     * @returns {void}
     */
    clear() {
      if (this._shouldDefer('clear')) return;
      this._cache = { list: [] };
      this._save();
      this._bump();
      if (typeof JournalIndexStore !== 'undefined') JournalIndexStore.clear();
    },

    /**
     * Replace the entire journal-entry list (W2.6 import path). The
     * imported payload is presumed self-consistent — index rebuild
     * happens at the import-handler layer after every store is
     * written, not per-store.
     * @param {JournalStoreData | null | undefined} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      var list = (data && typeof data === 'object' && Array.isArray(data.list)) ? data.list : [];
      this._cache = /** @type {any} */ ({ list: list });
      this._save();
      this._bump();
    }
  }
);

/* ── Notebook store: parallel to NotebookStore, separate localStorage key. ── */
export var JournalNotebookStore = extendStore(
  CachedStore('vot-journal-notebooks', /** @type {JournalNotebookStoreData} */ ({ list: [] }), { idb: true, crossTabMerge: mergeListStore }),
  {
    /**
     * All journal-notebooks sorted by sortIndex, then created.
     * @returns {JournalNotebook[]}
     */
    list() {
      var data = this._load();
      return (data.list || []).slice().sort(function(a, b) {
        return (a.sortIndex || 0) - (b.sortIndex || 0) || (a.created || 0) - (b.created || 0);
      });
    },

    /**
     * Look up a notebook by id.
     * @param {string} id
     * @returns {JournalNotebook | null}
     */
    get(id) { return (this._load().list || []).find(function(n) { return n.id === id; }) || null; },

    /**
     * Create a notebook with the given name. Returns null when name is
     * blank. NOT case-insensitive dedup (unlike NotebookStore) — callers
     * have not requested it for the journal side.
     * @param {string | null | undefined} name
     * @returns {JournalNotebook | null}
     */
    add(name) {
      var trimmed = (name || '').trim();
      if (!trimmed) return null;
      if (this._shouldDefer('add', name)) return null;
      var data = this._load();
      if (!data.list) data.list = [];
      var id = 'jnb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      var ts = Date.now();
      /** @type {JournalNotebook} */
      var nb = { id: id, name: trimmed, sortIndex: data.list.length, created: ts, updated: ts };
      data.list.push(nb);
      this._save();
      this._bump();
      return nb;
    },

    /**
     * Rename a notebook in place. No-op when name is blank or id is unknown.
     * @param {string} id
     * @param {string | null | undefined} name
     * @returns {void}
     */
    rename(id, name) {
      var trimmed = (name || '').trim();
      if (!trimmed) return;
      if (this._shouldDefer('rename', id, name)) return;
      var data = this._load();
      var nb = (data.list || []).find(function(n) { return n.id === id; });
      if (nb) { nb.name = trimmed; nb.updated = Date.now(); this._save(); this._bump(); }
    },

    /**
     * Delete a notebook AND cascade — strip its id from every journal
     * entry that referenced it (via JournalStore.pruneNotebook).
     * @param {string} id
     * @returns {void}
     */
    remove(id) {
      if (this._shouldDefer('remove', id)) return;
      var data = this._load();
      data.list = (data.list || []).filter(function(n) { return n.id !== id; });
      this._save();
      this._bump();
      if (typeof JournalStore !== 'undefined') JournalStore.pruneNotebook(id);
    },

    /**
     * Replace the entire journal-notebook list (W2.6 import path).
     * @param {JournalNotebookStoreData | null | undefined} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      var list = (data && typeof data === 'object' && Array.isArray(data.list)) ? data.list : [];
      this._cache = /** @type {any} */ ({ list: list });
      this._save();
      this._bump();
    }
  }
);

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
     JournalStore.update(id, patch, opts?) → bumps `updated` (1 ms with { keepDate: true }), rebuilds index
     JournalStore.remove(id)            → cascades index + stats
     JournalStore.setPinned(id, bool)   → keeps the entry's date (a pin is not an edit)
     JournalStore.togglePin(id)         → keeps the entry's date
     JournalStore.toggleNotebook(id, nbId)
     JournalStore.pruneNotebook(nbId)   → called by JournalNotebookStore.remove
     JournalStore.count()
     JournalStore.search(q)             → entries with q in title/preview/source label
     JournalStore.collectAllMediaIds()  → for orphan cleanup
═══════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';
import { mergeListStore } from './store-merge.js';
import { rekeyJournalMarks, JOURNAL_REKEY_STAMP } from './journal-mark-rekey.js';
import { AnnotationStore } from './annotation-store.js';
import { BookmarkStore } from './bookmark-store.js';
import { DiagnosticLog } from '../utils/diagnostic-log.js';
import { JournalHelpers } from '../data/journal-helpers.js';
import { JournalIndexStore } from './journal-index-store.js';
import { JournalStatsStore } from './journal-stats-store.js';
import { LinkStore } from './link-store.js';
import { NoteStore } from './note-store.js';

/**
 * While rekeyMarks() waits for a store that is still loading: the unsubscribers
 * of its watch on each such store; null when nothing waits.
 * @type {Array<() => void> | null}
 */
var rekeyWait = null;

/**
 * n4-07: every journal block has an id - marks key on it (v05-01,
 * journal:<entryId>:<blockId>) and the viewer renders by it. A block that
 * arrives without one (the hub's recovered voice memo did) gets one here, in
 * JournalHelpers.blockId's b_<time>_<random> shape; the ones it has stay.
 * @param {any[]} blocks
 * @returns {any[]}
 */
function withBlockIds(blocks) {
  var n = 0;
  return blocks.map(function(b) {
    if (!b || typeof b !== 'object' || b.id) return b;
    n++;
    return Object.assign({ id: 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6) + n }, b);
  });
}

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
 *   noteTrims: Array<{ groupId: string, keys: string[] }>,
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
     * IDENTITY CONTRACT — a caller-supplied `id` (and `created`/`updated`)
     * is HONOURED, not overwritten. This is what makes add() idempotent
     * under deferred hydration: the entry is built BEFORE _shouldDefer,
     * and _shouldDefer re-invokes add() with the built entry as the seed
     * twice more (once onto the pending overlay, once at replay). Minting
     * unconditionally gave those two re-invocations fresh ids while the
     * caller was already holding the first one, so every later update()
     * addressed an entry that existed in no cache and the reader's work
     * was lost. Honouring the seed keeps all three passes on one identity.
     *
     * @param {Partial<JournalEntry> | null | undefined} [seed]
     * @returns {JournalEntry}
     */
    add(seed) {
      seed = seed || {};
      var ts = Date.now();
      /** @type {JournalEntry} */
      var entry = {
        id: seed.id || jrnId(),
        title: seed.title || '',
        blocks: Array.isArray(seed.blocks) ? withBlockIds(seed.blocks) : (typeof JournalHelpers !== 'undefined' ? JournalHelpers.defaultBlocks() : []),
        mood: seed.mood || null,
        tags: Array.isArray(seed.tags) ? seed.tags.slice() : [],
        notebookIds: Array.isArray(seed.notebookIds) ? seed.notebookIds.slice() : [],
        pinned: !!seed.pinned,
        created: seed.created || ts,
        updated: seed.updated || ts
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
     * Apply a patch to an entry. `updated` is auto-bumped to now. When
     * `blocks` is in the patch, the reverse-link index is rebuilt for this
     * entry. Returns the updated entry or null when id is unknown.
     *
     * `opts.keepDate` (v05-05) is for a change that is not an edit (a pin).
     * `updated` serves two readers: the hub dates and sorts its cards by
     * it, and every save merges the cache onto the stored copy by it
     * (store-merge.js: the newer `updated` wins, a tie goes to the stored
     * copy). So a pin cannot leave it alone (the next save would drop the
     * pin) and must not set it to now (a year-old entry would show today's
     * date at the top of the list): it moves 1 ms past the entry's stamp.
     *
     * @param {string} id
     * @param {Partial<JournalEntry>} patch
     * @param {{ keepDate?: boolean }} [opts]
     * @returns {JournalEntry | null}
     */
    update(id, patch, opts) {
      if (!id || !patch) return null;
      if (this._shouldDefer('update', id, patch, opts)) return null;
      var data = this._load();
      var list = data.list || [];
      var idx = list.findIndex(function(e) { return e.id === id; });
      if (idx < 0) return null;
      var cur = list[idx];
      var stamp = (opts && opts.keepDate) ? (cur.updated || cur.created || 0) + 1 : Date.now();
      if (Array.isArray(patch.blocks)) patch = Object.assign({}, patch, { blocks: withBlockIds(patch.blocks) });
      list[idx] = Object.assign({}, cur, patch, { updated: stamp });
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
     * With `blockId` (n4-06) the scan is ONE block's marks: keys
     * journal:<id>:<blockId> and journal:<id>:<blockId>:<start>-<end>. A note
     * whose segments are all on that block is the block's; one that also
     * spans other blocks is listed in `noteTrims` (it keeps its other keys).
     * Whole-entry links are never a block's.
     *
     * @param {string} id
     * @param {string} [blockId]
     * @returns {AssociatedScan}
     */
    _scanAssociated(id, blockId) {
      var prefix = 'journal:' + id + ':';
      var blockKey = blockId != null ? prefix + blockId : null;
      /** @param {any} k */
      var mine = function(k) {
        var s = String(k);
        if (blockKey === null) return s.indexOf(prefix) === 0;
        return s === blockKey || (s.indexOf(blockKey) === 0 && /^:\d+-\d+$/.test(s.slice(blockKey.length)));
      };
      /** @type {Record<string, 1>} */ var hlG = {};
      /** @type {Record<string, 1>} */ var ulG = {};
      /** @type {Record<string, 1>} */ var noteG = {};
      /** @type {Record<string, 1>} */ var noteShown = {};
      /** @type {Array<{ groupId: string, keys: string[] }>} */ var noteTrims = [];
      /** @type {string[]} */ var annKeys = [];
      /** @type {string[]} */ var bkmIds = [];
      /** @type {string[]} */ var linkIds = [];
      try {
        if (typeof AnnotationStore !== 'undefined') {
          var all = AnnotationStore.all() || {};
          Object.keys(all).forEach(function(k) {
            if (!mine(k)) return;
            annKeys.push(k);
            (all[k] || []).forEach(function(a) {
              var gid = a.groupId || a.id;
              // a legacy note segment: a whole-entry scan purges its group; one block's only its segments
              if (a.kind === 'note') { if (blockKey === null) noteG[gid] = 1; else noteShown[gid] = 1; }
              else if (a.kind === 'underline') ulG[gid] = 1;
              else hlG[gid] = 1;
            });
          });
        }
        if (typeof NoteStore !== 'undefined' && NoteStore._load) {
          var nraw = NoteStore._load() || {};
          Object.keys(nraw).forEach(function(gid) {
            var keys = (nraw[gid] && nraw[gid].keys) || [];
            var on = keys.filter(mine);
            if (!on.length) return;
            if (on.length === keys.length) noteG[gid] = 1;
            else noteTrims.push({ groupId: gid, keys: keys.filter(function(k) { return !mine(k); }) });
          });
        }
        if (blockKey !== null && typeof BookmarkStore !== 'undefined' && BookmarkStore.all) {
          (BookmarkStore.all() || []).forEach(function(b) { if (b && b.hlKey && mine(b.hlKey)) bkmIds.push(b.id); });
        } else if (typeof BookmarkStore !== 'undefined' && BookmarkStore.getForKeyPrefix) {
          // getForKeyPrefix appends its own ':' (matches k.indexOf(prefix+':')),
          // so pass the entry prefix WITHOUT the trailing colon. The extra ':'
          // it adds also prevents substring-id false matches
          // (journal:j_1_ab vs journal:j_1_abc).
          (BookmarkStore.getForKeyPrefix('journal:' + id) || []).forEach(function(b) { bkmIds.push(b.id); });
        }
        if (typeof LinkStore !== 'undefined') {
          (LinkStore.all() || []).forEach(function(ln) {
            /** @type {Partial<import('./link-store.js').LinkEndpoint>} */
            var s = ln.source || {};
            /** @type {Partial<import('./link-store.js').LinkEndpoint>} */
            var t = ln.target || {};
            var hit =
              (s.key && mine(s.key)) ||
              (t.key && mine(t.key)) ||
              (blockKey === null && s.type === 'journal' && s.entryId === id) ||
              (blockKey === null && t.type === 'journal' && t.entryId === id);
            if (hit) linkIds.push(ln.id);
          });
        }
      } catch (_e) { /* counting must never block deletion */ }
      return {
        annKeys: annKeys, noteGroupIds: Object.keys(noteG), noteTrims: noteTrims,
        bookmarkIds: bkmIds, linkIds: linkIds,
        highlights: Object.keys(hlG).length, underlines: Object.keys(ulG).length,
        // a note that spans other blocks survives the block's delete: not counted (refuter F3)
        notes: Object.keys(Object.assign({}, noteG, noteShown)).length,
        bookmarks: bkmIds.length, links: linkIds.length
      };
    },

    /**
     * Move every journal mark still keyed by block POSITION onto its block's
     * ID (v05-01): annotations, notes, bookmarks and link ends keyed
     * journal:<id>:<n>. The rules are journal-mark-rekey.js; this reads the
     * four stores and writes back only the ones where something moved.
     * HydrationGate runs it at every boot before anything renders a journal,
     * so a restored old backup is moved on the boot after its reload. Once
     * nothing is keyed by position it writes nothing. Never throws.
     *
     * It moves nothing until all five stores have loaded: a store whose read
     * outlived the gate's 3 s timeout serves an empty stand-in, and a pass over
     * it would move a note without its segments, or miss the segments for
     * good. It waits for that store instead and runs the moment every one has
     * loaded (the refutation's F8).
     *
     * A tab still on an older version can have edited a mark under its old key
     * after this pass read it; the save's cross-tab merge then keeps that edit
     * AND this move (an edit beats a delete), and the mark is there twice. So
     * once the pass's writes have landed it runs once more: the returned copy
     * moves too, and one copy stays, the newer (the refutation's F7).
     * The first pass that is not waiting stamps localStorage (n4-03): every
     * pass after it moves a mark only onto its own words, never onto whatever
     * block now sits at its old position. Its settling pass keeps its rules.
     * @param {boolean} [again] - this is that one settling pass
     * @param {boolean} [firstRules] - the settling pass of the stamping pass
     * @returns {{ moved: number, left: number, waiting?: number }}
     */
    rekeyMarks(again, firstRules) {
      try {
        var self = this;
        /** @type {Array<{ isReady: () => boolean, subscribe: (cb: () => void) => () => void }>} */
        var loading = /** @type {any} */ ([this,
          typeof AnnotationStore !== 'undefined' ? AnnotationStore : null,
          typeof NoteStore !== 'undefined' ? NoteStore : null,
          typeof BookmarkStore !== 'undefined' ? BookmarkStore : null,
          typeof LinkStore !== 'undefined' ? LinkStore : null
        ].filter(function(s) { return s && typeof s.isReady === 'function' && !s.isReady(); }));
        if (loading.length) {
          if (!rekeyWait && !again) {
            rekeyWait = loading.map(function(s) {
              return s.subscribe(function() {
                if (!rekeyWait || !loading.every(function(l) { return l.isReady(); })) return;
                rekeyWait.forEach(function(off) { off(); });
                rekeyWait = null;
                // after the load that woke this has finished its own save and notify
                Promise.resolve().then(function() { self.rekeyMarks(); });
              });
            });
          }
          return { moved: 0, left: 0, waiting: loading.length };
        }
        // n4-03: after the first finished pass only a mark's own words move it
        var stamped = false;
        if (!firstRules) {
          try { stamped = !!localStorage.getItem(JOURNAL_REKEY_STAMP); } catch (_e) { /* no storage: every pass is a first */ }
        }
        var next = rekeyJournalMarks(this._load().list || [], {
          annotations: typeof AnnotationStore !== 'undefined' ? AnnotationStore.all() : null,
          notes: typeof NoteStore !== 'undefined' ? NoteStore.all() : null,
          bookmarks: typeof BookmarkStore !== 'undefined' ? BookmarkStore.all() : null,
          links: typeof LinkStore !== 'undefined' ? LinkStore.all() : null,
          noPosition: stamped
        });
        /** @type {any[]} */ var written = [];
        if (next.annotations) { AnnotationStore.replaceAll(next.annotations); written.push(AnnotationStore); }
        if (next.notes) { NoteStore.replaceAll(next.notes); written.push(NoteStore); }
        if (next.bookmarks) { BookmarkStore.replaceAll(next.bookmarks); written.push(BookmarkStore); }
        if (next.links) { LinkStore.replaceAll(next.links); written.push(LinkStore); }
        // The stamp waits for this pass's moves to be on disk (the n4-03 refuter):
        // stamped first, a tab closed mid-save would leave a mark that only its
        // old position could place, and no later pass would place it.
        var stamp = function() {
          try { localStorage.setItem(JOURNAL_REKEY_STAMP, 'v1'); } catch (_e) { /* best-effort */ }
          // n4-04: the one trace this migration leaves; it rides the next backup's diagnostics
          if (next.moved + next.left > 0 && typeof DiagnosticLog !== 'undefined') {
            try { DiagnosticLog.warn('journal-rekey', 'moved ' + next.moved + ', left ' + next.left); } catch (_e) { /* logging must never break the pass */ }
          }
        };
        if (written.length && !again) {
          Promise.all(written.map(function(s) { return s.whenSaved(); }))
            .then(function(saved) {
              if (!stamped && saved.every(Boolean)) stamp();
              self.rekeyMarks(true, !stamped);
            });
        } else if (!stamped && !again) {
          stamp();
        }
        return { moved: next.moved, left: next.left };
      } catch (_e) {
        return { moved: 0, left: 0 };
      }
    },

    /**
     * Just the count summary for the delete-confirmation modal; with blockId,
     * one block's (the editor's block-delete confirm, n4-06).
     * @param {string} id
     * @param {string} [blockId]
     * @returns {{ highlights: number, underlines: number, notes: number, bookmarks: number, links: number, total: number }}
     */
    associatedDataCounts(id, blockId) {
      var s = this._scanAssociated(id, blockId);
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
     * @param {string} [blockId] - one block's marks (n4-06)
     * @returns {string | null}
     */
    associatedDataSummary(id, blockId) {
      var c = this.associatedDataCounts(id, blockId);
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
     * n4-06: remove the marks of a block the reader deleted, once its Undo
     * window has passed. Nothing is removed while the entry still holds a
     * block with that id (an Undo, or a re-add, put it back): the blocks the
     * caller passes (the open editor's, newer than its debounced save), else the
     * stored entry's.
     * @param {string} id @param {string} blockId @param {any[]} [blocks]
     * @returns {number} how many marks went (0 when the block is back)
     */
    purgeBlockMarks(id, blockId, blocks) {
      try {
        if (!id || !blockId) return 0;
        var e = this.get(id);
        var now = Array.isArray(blocks) ? blocks : (e && e.blocks) || [];
        if (now.some(function(/** @type {any} */ b) { return b && b.id === blockId; })) return 0;
        var c = this.associatedDataCounts(id, blockId);
        if (c.total) this._purgeAssociated(id, blockId);
        return c.total;
      } catch (_e) { return 0; }
    },

    /**
     * Cascade-delete every annotation/bookmark/link tied to an entry.
     * Best-effort: a failure in one store doesn't block the others or
     * the parent entry deletion. With blockId, one block's marks (n4-06): a
     * note that spans other blocks keeps its other keys.
     * @param {string} id
     * @param {string} [blockId]
     * @returns {void}
     */
    _purgeAssociated(id, blockId) {
      var s = this._scanAssociated(id, blockId);
      try {
        s.noteTrims.forEach(function(n) { if (typeof NoteStore !== 'undefined') NoteStore.update(n.groupId, { keys: n.keys }); });
      } catch (e) { console.warn('_purgeAssociated: note trim failed for', id, e); }
      try {
        s.noteGroupIds.forEach(function(gid) {
          if (typeof NoteStore !== 'undefined') NoteStore.remove(gid);
          // one block's purge (n4-06 refuter F2): its own keys' segments go below; a note whose
          // stored keys are out of date may still have a segment on a block that stays
          if (blockId == null && typeof AnnotationStore !== 'undefined') AnnotationStore.removeGroup(gid);
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
     * @param {{ skipStats?: boolean }} [opts]
     *   skipStats: omit the JournalStatsStore.recordDeletion() cascade.
     *   Used by the editor's blank-entry prune-on-exit — that entry's
     *   stats were never recorded (recording happens at the first
     *   non-empty save), so a decrement would under-count real entries.
     * @returns {void}
     */
    remove(id, opts) {
      if (!id) return;
      if (this._shouldDefer('remove', id, opts)) return;
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
        if (!(opts && opts.skipStats) && typeof JournalStatsStore !== 'undefined') JournalStatsStore.recordDeletion();
      }
    },

    /**
     * Set the pin flag explicitly. Keeps the entry's date: a pin is not an
     * edit (update's keepDate).
     * @param {string} id
     * @param {boolean} pinned
     * @returns {JournalEntry | null}
     */
    setPinned(id, pinned) { return this.update(id, { pinned: !!pinned }, { keepDate: true }); },

    /**
     * Toggle the pin flag. Keeps the entry's date (update's keepDate).
     * @param {string} id
     * @returns {JournalEntry | null}
     */
    togglePin(id) {
      var e = this.get(id);
      if (!e) return null;
      return this.update(id, { pinned: !e.pinned }, { keepDate: true });
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

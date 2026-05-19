/* ═══════════════════════════════════════════════════════════════
   JOURNAL STORE — entries CRUD + auto-index updates
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
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

function jrnId() {
  return 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

var JournalStore = Object.assign(CachedStore('vot-journal', { list: [] }), {
  all() {
    var data = this._load();
    return (data.list || []).slice().sort(function(a, b) {
      return (b.updated || b.created || 0) - (a.updated || a.created || 0);
    });
  },

  allByCreated() {
    var data = this._load();
    return (data.list || []).slice().sort(function(a, b) {
      return (b.created || 0) - (a.created || 0);
    });
  },

  get(id) {
    if (!id) return null;
    var data = this._load();
    return (data.list || []).find(function(e) { return e.id === id; }) || null;
  },

  count() {
    return (this._load().list || []).length;
  },

  /* Create a new entry. `seed` optionally provides initial blocks (e.g.
     when opened from parallel mode pre-attaching a letter card) and
     other top-level fields (title, notebookIds, mood). Returns the
     fresh entry record. */
  add(seed) {
    seed = seed || {};
    var ts = Date.now();
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
    var data = this._load();
    if (!data.list) data.list = [];
    data.list.push(entry);
    this._save();
    this._reindex(entry);
    return entry;
  },

  /* Apply patch. `patch` may include any top-level fields. `updated`
     is auto-bumped. If `blocks` is in the patch, the reverse-link
     index is rebuilt for this entry. */
  update(id, patch) {
    if (!id || !patch) return null;
    var data = this._load();
    var list = data.list || [];
    var idx = list.findIndex(function(e) { return e.id === id; });
    if (idx < 0) return null;
    list[idx] = Object.assign({}, list[idx], patch, { updated: Date.now() });
    this._save();
    if (patch.blocks) this._reindex(list[idx]);
    return list[idx];
  },

  /* Personal data the user created INSIDE a journal entry is keyed by
     `journal:<entryId>:<blockIdx>` (annotations/bookmarks) or carries a
     journal endpoint (links). If the entry is deleted without cleaning
     these up they dangle — still listed in the Library hubs but tapping
     them navigates nowhere. _scanAssociated enumerates every such
     record so the delete flow can both REPORT it (informed consent) and
     CASCADE-remove it. Counts are per logical mark (a multi-block
     highlight = 1), matching how the Library hubs count. Never throws —
     a counting hiccup must not block a deletion the user asked for. */
  _scanAssociated(id) {
    var prefix = 'journal:' + id + ':';
    var hlG = {}, ulG = {}, noteG = {}, annKeys = [], bkmIds = [], linkIds = [];
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
    } catch (e) { /* counting must never block deletion */ }
    return {
      annKeys: annKeys, noteGroupIds: Object.keys(noteG),
      bookmarkIds: bkmIds, linkIds: linkIds,
      highlights: Object.keys(hlG).length, underlines: Object.keys(ulG).length,
      notes: Object.keys(noteG).length, bookmarks: bkmIds.length, links: linkIds.length
    };
  },

  associatedDataCounts(id) {
    var s = this._scanAssociated(id);
    return {
      highlights: s.highlights, underlines: s.underlines, notes: s.notes,
      bookmarks: s.bookmarks, links: s.links,
      total: s.highlights + s.underlines + s.notes + s.bookmarks + s.links
    };
  },

  /* Human phrase for the delete confirmation, or null if nothing tied. */
  associatedDataSummary(id) {
    var c = this.associatedDataCounts(id);
    if (!c.total) return null;
    var parts = [];
    function p(n, s) { if (n > 0) parts.push(n + ' ' + s + (n === 1 ? '' : 's')); }
    p(c.highlights, 'highlight'); p(c.underlines, 'underline'); p(c.notes, 'note');
    p(c.bookmarks, 'bookmark'); p(c.links, 'link');
    var last = parts.pop();
    return parts.length ? parts.join(', ') + ' and ' + last : last;
  },

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
    } catch (e) { /* best-effort cascade; entry deletion still proceeds */ }
  },

  remove(id) {
    if (!id) return;
    // Cascade FIRST so journal-scoped annotations/bookmarks/links can't
    // dangle. Centralized here because every delete path (hub card menu,
    // viewer) routes through remove() — it cannot be bypassed.
    this._purgeAssociated(id);
    var data = this._load();
    data.list = (data.list || []).filter(function(e) { return e.id !== id; });
    this._save();
    if (typeof JournalIndexStore !== 'undefined') JournalIndexStore.removeEntry(id);
    if (typeof JournalStatsStore !== 'undefined') JournalStatsStore.recordDeletion();
  },

  setPinned(id, pinned) { return this.update(id, { pinned: !!pinned }); },
  togglePin(id) {
    var e = this.get(id);
    if (!e) return null;
    return this.update(id, { pinned: !e.pinned });
  },

  toggleNotebook(id, notebookId) {
    var e = this.get(id);
    if (!e || !notebookId) return null;
    var ids = (e.notebookIds || []).slice();
    var i = ids.indexOf(notebookId);
    if (i >= 0) ids.splice(i, 1); else ids.push(notebookId);
    return this.update(id, { notebookIds: ids });
  },

  /* Called when a notebook is deleted — strip its id from every entry
     that referenced it. Symmetric with NoteStore.pruneNotebook. */
  pruneNotebook(notebookId) {
    if (!notebookId) return;
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
    if (changed) this._save();
  },

  /* Returns entries with matching title, body text, or source label.
     `q` is a free-text query; matches are case-insensitive substring. */
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

  /* Collect every mediaId referenced by every entry. Used by the
     orphan cleanup pass to determine which IDB blobs are stale. */
  collectAllMediaIds() {
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

  /* True if `mediaId` is referenced by a block in ANY entry other than
     `exceptEntryId`. The editor calls this before hard-deleting a media
     blob: a journal→journal embed shares the source's mediaId, so wiping
     the blob just because the SOURCE block is deleted would break every
     embed of it. Shared-media protection must be symmetric. */
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

  _reindex(entry) {
    if (typeof JournalIndexStore === 'undefined' || typeof JournalHelpers === 'undefined') return;
    try {
      var refs = JournalHelpers.collectRefs(entry);
      JournalIndexStore.rebuildForEntry(entry.id, refs);
    } catch (e) { console.warn('Journal index update failed', e); }
  },

  /* Wipe everything — used by "Clear All Personal Data". */
  clear() {
    this._cache = { list: [] };
    this._save();
    if (typeof JournalIndexStore !== 'undefined') JournalIndexStore.clear();
  }
});

/* ── Notebook store: parallel to NotebookStore, separate localStorage key. ── */
var JournalNotebookStore = Object.assign(CachedStore('vot-journal-notebooks', { list: [] }), {
  list() {
    var data = this._load();
    return (data.list || []).slice().sort(function(a, b) {
      return (a.sortIndex || 0) - (b.sortIndex || 0) || (a.created || 0) - (b.created || 0);
    });
  },
  get(id) { return (this._load().list || []).find(function(n) { return n.id === id; }) || null; },
  add(name) {
    var trimmed = (name || '').trim();
    if (!trimmed) return null;
    var data = this._load();
    if (!data.list) data.list = [];
    var id = 'jnb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    var ts = Date.now();
    var nb = { id: id, name: trimmed, sortIndex: data.list.length, created: ts, updated: ts };
    data.list.push(nb);
    this._save();
    return nb;
  },
  rename(id, name) {
    var trimmed = (name || '').trim();
    if (!trimmed) return;
    var data = this._load();
    var nb = (data.list || []).find(function(n) { return n.id === id; });
    if (nb) { nb.name = trimmed; nb.updated = Date.now(); this._save(); }
  },
  remove(id) {
    var data = this._load();
    data.list = (data.list || []).filter(function(n) { return n.id !== id; });
    this._save();
    if (typeof JournalStore !== 'undefined') JournalStore.pruneNotebook(id);
  }
});

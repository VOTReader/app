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

  remove(id) {
    if (!id) return;
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

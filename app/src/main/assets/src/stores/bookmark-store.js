/* ═══════════════════════════════════════════════════════════════
   BOOKMARK STORE — saved passage anchors
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html; no import/export.
   Depends on: CachedStore (defined earlier in the main script block).

   Data model:
     vot-bookmarks: Array<{
       id:      string,    // bkmId()
       hlKey:   string,    // container hlKey, with optional ":start-end" suffix
       label:   string,    // user-provided OR auto-derived from selection text
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

/* ID generator for bookmarks — parallel to lnkId in link-store.js */
function bkmId() { return 'bkm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

const BookmarkStore = Object.assign(CachedStore('vot-bookmarks', []), {
  get(id) {
    return this._load().find(function(b) { return b.id === id; }) || null;
  },
  all() { return this._load(); },
  count() { return this._load().length; },

  /* Get all bookmarks whose hlKey exactly matches `key`. */
  getForKey(key) {
    return this._load().filter(function(b) { return b.hlKey === key || b.hlKey.split(':').slice(0, -1).join(':') === key; });
  },

  /* Get all bookmarks whose hlKey starts with `prefix` (block-level match),
     or whose prefix portion of the key starts with `prefix`.
     Mirrors the LinkStore.getForKeyPrefix() convention. */
  getForKeyPrefix(prefix) {
    return this._load().filter(function(b) {
      var k = b.hlKey;
      return k === prefix || k.indexOf(prefix + ':') === 0 || prefix.indexOf(k + ':') === 0;
    });
  },

  add(bookmark) {
    if (!bookmark || !bookmark.id || !bookmark.hlKey) return;
    var ts = Date.now();
    if (!bookmark.created) bookmark.created = ts;
    if (!bookmark.updated) bookmark.updated = ts;
    this._load().push(bookmark);
    this._save();
  },

  /* Replace the label on an existing bookmark. */
  update(id, patch) {
    var data = this._load();
    var idx = data.findIndex(function(b) { return b.id === id; });
    if (idx < 0) return;
    data[idx] = Object.assign({}, data[idx], patch, { updated: Date.now() });
    this._save();
  },

  remove(id) {
    this._cache = this._load().filter(function(b) { return b.id !== id; });
    this._save();
  }
});

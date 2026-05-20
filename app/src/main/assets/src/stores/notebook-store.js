/* ══════════════════════════════════════════════════════════════════════
   NotebookStore — named buckets for grouping notes
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: CachedStore (loaded first), NoteStore (used at CALL
   time only — remove() cascades via NoteStore.pruneNotebook).
   ═══════════════════════════════════════════════════════════════════════ */

/* NotebookStore — named buckets for grouping notes. Notebooks have
   no color (kept simple by user direction); the color belongs to the
   note. A note can live in 0, 1, or many notebooks (multi-membership
   via NoteStore.notebookIds[]). */
const NotebookStore = Object.assign(CachedStore('vot-notebooks', { list: [] }), {
  list() {
    const data = this._load();
    return (data.list || []).slice().sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0) || (a.created || 0) - (b.created || 0));
  },
  get(id) { return (this._load().list || []).find(n => n.id === id) || null; },
  add(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const data = this._load();
    if (!data.list) data.list = [];
    // Dedup by case-insensitive name — return the existing notebook so
    // tapping "Create" twice (or re-creating "Devotional") never spawns
    // indistinguishable duplicate cards/tags.
    const existing = data.list.find(n => (n.name || '').trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const id = 'nb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const ts = Date.now();
    const nb = { id, name: trimmed, sortIndex: data.list.length, created: ts, updated: ts };
    data.list.push(nb);
    this._save();
    return nb;
  },
  rename(id, name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const data = this._load();
    const nb = (data.list || []).find(n => n.id === id);
    if (nb) { nb.name = trimmed; nb.updated = Date.now(); this._save(); }
  },
  remove(id) {
    const data = this._load();
    data.list = (data.list || []).filter(n => n.id !== id);
    this._save();
    // Cascade: strip the deleted notebook from every note that referenced it
    NoteStore.pruneNotebook(id);
  }
});

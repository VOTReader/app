/* ── Recent navigations (LinkPicker history) ── */
const RecentNavStore = Object.assign(CachedStore('vot-recent-nav', []), {
  list() { return this._load().slice(0, 20); },
  add(item) {
    if (!item || !item.kind) return;
    let data = this._load();
    const sig = JSON.stringify({ kind: item.kind, bookId: item.bookId, chapter: item.chapter, letterId: item.letterId, entryId: item.entryId });
    data = data.filter(x => JSON.stringify({ kind: x.kind, bookId: x.bookId, chapter: x.chapter, letterId: x.letterId, entryId: x.entryId }) !== sig);
    data.unshift({ ...item, ts: Date.now() });
    data = data.slice(0, 30);
    this._cache = data;
    this._save();
  }
});

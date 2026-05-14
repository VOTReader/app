/* ── LinkStore ── bidirectional cross-references between passages ── */
const LinkStore = Object.assign(CachedStore('vot-links', []), {
  getForKey(key) {
    return this._load().filter(lnk => lnk.a.key === key || lnk.b.key === key);
  },
  getForKeyPrefix(prefix) {
    return this._load().filter(lnk => {
      const aMatch = lnk.a.key === prefix || lnk.a.key.startsWith(prefix + ':') || prefix.startsWith(lnk.a.key + ':');
      const bMatch = lnk.b.key === prefix || lnk.b.key.startsWith(prefix + ':') || prefix.startsWith(lnk.b.key + ':');
      return aMatch || bMatch;
    });
  },
  all() { return this._load(); },
  add(link) {
    this._load().push(link);
    this._save();
  },
  remove(linkId) {
    this._cache = this._load().filter(l => l.id !== linkId);
    this._save();
  }
});

function lnkId() { return 'lnk_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

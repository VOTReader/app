/* ── One-time migration: vot-highlights → vot-annotations + vot-notes ── */
function migrateAnnotations() {
  try {
    if (localStorage.getItem('vot-ann-migrated') === '1') return;
    const oldRaw = localStorage.getItem('vot-highlights');
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      const newAnn = {};
      const newNotes = {};
      Object.keys(old).forEach(function(key) {
        const segs = old[key] || [];
        const byGroup = new Map();
        segs.forEach(function(s) {
          const gid = s.groupId || s.id;
          if (!byGroup.has(gid)) byGroup.set(gid, []);
          byGroup.get(gid).push(s);
        });
        const out = [];
        byGroup.forEach(function(entries, gid) {
          const hasNote = entries.some(function(e) { return e.note && e.note.trim(); });
          const kind = hasNote ? 'note' : (entries[0].style === 'underline' ? 'underline' : 'highlight');
          entries.forEach(function(e) {
            out.push({
              id: e.id, groupId: gid, kind: kind, color: e.color || 'yellow',
              start: e.start, end: e.end, text: e.text || '',
              created: e.created || Date.now(), updated: e.created || Date.now()
            });
          });
          if (hasNote) {
            const bodySrc = entries.reduce(function(acc, e) {
              const t = (e.note || '').trim();
              return t.length > acc.length ? t : acc;
            }, '');
            const fullText = entries.map(function(e) { return e.text || ''; }).join(' … ');
            newNotes[gid] = {
              groupId: gid, notebookIds: [], body: bodySrc,
              color: entries[0].color || 'yellow', fullText: fullText,
              keys: [key], created: entries[0].created || Date.now(),
              updated: entries[0].created || Date.now()
            };
          }
        });
        if (out.length) newAnn[key] = out;
      });
      localStorage.setItem('vot-annotations', JSON.stringify(newAnn));
      localStorage.setItem('vot-notes', JSON.stringify(newNotes));
    }
    localStorage.setItem('vot-ann-migrated', '1');
  } catch (e) {
    console.warn('annotation migration failed; will retry next launch', e);
  }
}
migrateAnnotations();

/* AnnotationStore — segment-level records. */
const AnnotationStore = Object.assign(CachedStore('vot-annotations', {}), {
  get(key) { return this._load()[key] || []; },
  all() { return this._load(); },
  add(key, ann) {
    if (!ann.groupId) ann.groupId = ann.id;
    if (!ann.kind) ann.kind = 'highlight';
    if (!ann.created) ann.created = Date.now();
    ann.updated = Date.now();
    const data = this._load();
    if (!data[key]) data[key] = [];
    data[key].push(ann);
    this._save();
  },
  update(key, annId, patch) {
    const data = this._load();
    const arr = data[key];
    if (!arr) return;
    const idx = arr.findIndex(h => h.id === annId);
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...patch, updated: Date.now() }; this._save(); }
  },
  remove(key, annId) {
    const data = this._load();
    if (!data[key]) return;
    data[key] = data[key].filter(h => h.id !== annId);
    if (data[key].length === 0) delete data[key];
    this._save();
  },
  removeAllForKey(key) {
    const data = this._load();
    delete data[key];
    this._save();
  },
  removeGroup(groupId) {
    const data = this._load();
    Object.keys(data).forEach(k => {
      data[k] = data[k].filter(h => h.groupId !== groupId);
      if (data[k].length === 0) delete data[k];
    });
    this._cache = data;
    this._save();
  },
  getByGroup(groupId) {
    const data = this._load();
    const out = [];
    Object.keys(data).forEach(k => data[k].forEach(h => { if (h.groupId === groupId) out.push({ key: k, ann: h }); }));
    return out;
  },
  // Recolor every segment in a group to a new color. One save.
  recolorGroup(groupId, color) {
    const data = this._load();
    const ts = Date.now();
    Object.keys(data).forEach(k => data[k].forEach(h => {
      if (h.groupId === groupId) { h.color = color; h.updated = ts; }
    }));
    this._save();
  },
  // Convert a group from one kind to another (e.g. highlight → note).
  convertGroup(groupId, kind) {
    const data = this._load();
    const ts = Date.now();
    Object.keys(data).forEach(k => data[k].forEach(h => {
      if (h.groupId === groupId) { h.kind = kind; h.updated = ts; }
    }));
    this._save();
  }
});
const HighlightStore = AnnotationStore; // back-compat alias

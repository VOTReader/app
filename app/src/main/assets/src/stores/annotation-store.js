/* ══════════════════════════════════════════════════════════════════════
   AnnotationStore (+ HighlightStore alias) + one-time migration
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: CachedStore (loaded first). Runs migrateAnnotations()
   at module load, exactly once per browser profile (gated by the
   vot-ann-migrated localStorage flag).
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore } from './cached-store.js';

/* ── One-time migration: vot-highlights → vot-annotations + vot-notes ──
   Old shape (per-segment): { id, groupId?, color, style:'highlight'|'underline',
     text, note?, start, end, created }
   New shape (per-segment): { id, groupId, kind:'highlight'|'underline'|'note',
     color, text, start, end, created, updated }
   Notes split off into vot-notes keyed by groupId:
     { groupId, notebookIds:[], body, color, fullText, keys[], created, updated }
   The old key vot-highlights is left in place as a backup. */
export function migrateAnnotations() {
  try {
    if (localStorage.getItem('vot-ann-migrated') === '1') return;
    const oldRaw = localStorage.getItem('vot-highlights');
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      const newAnn = {};
      const newNotes = {};
      Object.keys(old).forEach(function(key) {
        const segs = old[key] || [];
        // Group orphan singles by id so they each get their own groupId
        const byGroup = new Map();
        segs.forEach(function(s) {
          const gid = s.groupId || s.id;
          if (!byGroup.has(gid)) byGroup.set(gid, []);
          byGroup.get(gid).push(s);
        });
        const out = [];
        byGroup.forEach(function(entries, gid) {
          // Determine kind for the whole group: any entry with a non-empty
          // note promotes the entire group to kind:'note'.
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
            // Pull the longest non-empty note as the canonical body
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

/* AnnotationStore — segment-level records. Aliased as HighlightStore for
   back-compat with existing call sites. Every entry has a kind field
   ('highlight' | 'underline' | 'note') and a groupId (always present;
   single-segment annotations get a unique groupId == id at create time). */
export const AnnotationStore = Object.assign(CachedStore('vot-annotations', {}), {
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
  // Caller is responsible for creating/removing the corresponding NoteStore record.
  convertGroup(groupId, kind) {
    const data = this._load();
    const ts = Date.now();
    Object.keys(data).forEach(k => data[k].forEach(h => {
      if (h.groupId === groupId) { h.kind = kind; h.updated = ts; }
    }));
    this._save();
  },
  // Find the group that covers the given range in `key`, if any.
  groupAt(key, start, end) {
    const arr = this.get(key);
    const hit = arr.find(h => h.start <= start && h.end >= end);
    return hit || null;
  }
});
// Back-compat alias — existing references throughout the file still work.
export const HighlightStore = AnnotationStore;

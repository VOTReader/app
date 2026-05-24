// @ts-nocheck -- Q4.1 placeholder; will be removed when this file gets proper JSDoc in Q4.2 (utils) or Q4.3 (stores).
/* ══════════════════════════════════════════════════════════════════════
   NoteStore — note bodies as first-class records (keyed by groupId)
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: CachedStore (loaded first).
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore } from './cached-store.js';

/* NoteStore — note bodies as first-class records keyed by groupId.
   A note exists iff its group's kind === 'note'. */
export const NoteStore = Object.assign(CachedStore('vot-notes', {}), {
  get(groupId) { return this._load()[groupId] || null; },
  all() { return this._load(); },
  list() {
    const data = this._load();
    return Object.keys(data).map(k => data[k]).sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
  },
  count() { return Object.keys(this._load()).length; },
  set(groupId, fields) {
    const data = this._load();
    const existing = data[groupId];
    const ts = Date.now();
    data[groupId] = {
      groupId, notebookIds: [], body: '', color: 'yellow',
      fullText: '', keys: [], created: ts,
      ...(existing || {}),
      ...fields,
      updated: ts
    };
    this._save();
  },
  update(groupId, patch) {
    const data = this._load();
    if (!data[groupId]) return;
    data[groupId] = { ...data[groupId], ...patch, updated: Date.now() };
    this._save();
  },
  remove(groupId) {
    const data = this._load();
    delete data[groupId];
    this._save();
  },
  // Toggle a notebook membership on a note. No-op if the note doesn't exist.
  toggleNotebook(groupId, notebookId) {
    const data = this._load();
    const note = data[groupId];
    if (!note) return;
    const ids = Array.isArray(note.notebookIds) ? note.notebookIds.slice() : [];
    const i = ids.indexOf(notebookId);
    if (i >= 0) ids.splice(i, 1); else ids.push(notebookId);
    data[groupId] = { ...note, notebookIds: ids, updated: Date.now() };
    this._save();
  },
  // Strip a notebook from every note (used when a notebook is deleted).
  pruneNotebook(notebookId) {
    const data = this._load();
    const ts = Date.now();
    Object.keys(data).forEach(k => {
      const ids = (data[k].notebookIds || []).filter(id => id !== notebookId);
      if (ids.length !== (data[k].notebookIds || []).length) {
        data[k] = { ...data[k], notebookIds: ids, updated: ts };
      }
    });
    this._save();
  }
});

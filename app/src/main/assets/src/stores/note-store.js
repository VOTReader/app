/* ══════════════════════════════════════════════════════════════════════
   NoteStore — note bodies as first-class records (keyed by groupId)
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (loaded first).
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/**
 * A note record — exists iff its group's kind === 'note' in AnnotationStore.
 * `keys` lists every hlKey the note anchors to (multi-paragraph notes have
 * multiple keys). `notebookIds` controls notebook membership (0..N).
 *
 * @typedef {{
 *   groupId: string,
 *   notebookIds: string[],
 *   body: string,
 *   color: string,
 *   fullText: string,
 *   keys: string[],
 *   created: number,
 *   updated: number
 * }} Note
 */

/* NoteStore — note bodies as first-class records keyed by groupId.
   A note exists iff its group's kind === 'note'. */
export const NoteStore = extendStore(
  CachedStore('vot-notes', /** @type {Record<string, Note>} */ ({})),
  {
    /**
     * Look up a note by its groupId.
     * @param {string} groupId
     * @returns {Note | null}
     */
    get(groupId) { return this._load()[groupId] || null; },

    /**
     * The full underlying map (groupId → Note). Mutations through this
     * persist on next _save() but callers should prefer the typed methods.
     * @returns {Record<string, Note>}
     */
    all() { return this._load(); },

    /**
     * All notes, newest first (by `updated`, falling back to `created`).
     * @returns {Note[]}
     */
    list() {
      const data = this._load();
      return Object.keys(data).map(k => data[k]).sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
    },

    /**
     * Total number of notes.
     * @returns {number}
     */
    count() { return Object.keys(this._load()).length; },

    /**
     * Upsert a note. Merges with the existing record (preserving created/
     * notebookIds when not overridden); stamps updated to now.
     * @param {string} groupId
     * @param {Partial<Note>} fields
     * @returns {void}
     */
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

    /**
     * Patch an existing note's fields. No-op when groupId is unknown.
     * @param {string} groupId
     * @param {Partial<Note>} patch
     * @returns {void}
     */
    update(groupId, patch) {
      const data = this._load();
      if (!data[groupId]) return;
      data[groupId] = { ...data[groupId], ...patch, updated: Date.now() };
      this._save();
    },

    /**
     * Delete a note record. Idempotent.
     * @param {string} groupId
     * @returns {void}
     */
    remove(groupId) {
      const data = this._load();
      delete data[groupId];
      this._save();
    },

    /**
     * Toggle a notebook membership on a note. No-op when the note doesn't
     * exist. Mutates the notebookIds list in place + bumps updated.
     * @param {string} groupId
     * @param {string} notebookId
     * @returns {void}
     */
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

    /**
     * Strip a notebookId from every note (called when a notebook is
     * deleted). Only touches notes that actually had the membership.
     * @param {string} notebookId
     * @returns {void}
     */
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
  }
);

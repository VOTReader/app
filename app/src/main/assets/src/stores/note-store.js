/* ══════════════════════════════════════════════════════════════════════
   NoteStore — note bodies as first-class records (keyed by groupId)
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (loaded first).
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';
import { mergeMapStore } from './store-merge.js';

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
  CachedStore('vot-notes', /** @type {Record<string, Note>} */ ({}), { idb: true, crossTabMerge: mergeMapStore }),
  {
    /**
     * APP1: bump only the per-hlKey versions a note anchors to (note.keys), so a
     * note change re-renders just the verse(s) it touches instead of every verse in
     * the chapter (HighlightableText subscribes to getVersionForKey, not the whole-
     * store getVersion). _bumpKey also bumps the global version, so the imperative
     * DOM note-icon pass (a whole-store getVersion subscriber) still wakes. Falls
     * back to a global _bump when the note has no keys.
     * @param {Note | null | undefined} note
     * @returns {void}
     */
    _bumpKeys(note) {
      const keys = note && Array.isArray(note.keys) ? note.keys : null;
      if (keys && keys.length) { for (const k of keys) this._bumpKey(k); }
      else this._bump();
    },

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
      if (this._shouldDefer('set', groupId, fields)) return;
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
      this._bumpKeys(data[groupId]);
    },

    /**
     * Patch an existing note's fields. No-op when groupId is unknown.
     * @param {string} groupId
     * @param {Partial<Note>} patch
     * @returns {void}
     */
    update(groupId, patch) {
      if (this._shouldDefer('update', groupId, patch)) return;
      const data = this._load();
      if (!data[groupId]) return;
      data[groupId] = { ...data[groupId], ...patch, updated: Date.now() };
      this._save();
      this._bumpKeys(data[groupId]);
    },

    /**
     * Delete a note record. Idempotent.
     * @param {string} groupId
     * @returns {void}
     */
    remove(groupId) {
      if (this._shouldDefer('remove', groupId)) return;
      const data = this._load();
      const note = data[groupId];   // capture keys BEFORE delete so its verses re-check has-note
      delete data[groupId];
      this._save();
      this._bumpKeys(note);
    },

    /**
     * Toggle a notebook membership on a note. No-op when the note doesn't
     * exist. Mutates the notebookIds list in place + bumps updated.
     * @param {string} groupId
     * @param {string} notebookId
     * @returns {void}
     */
    toggleNotebook(groupId, notebookId) {
      if (this._shouldDefer('toggleNotebook', groupId, notebookId)) return;
      const data = this._load();
      const note = data[groupId];
      if (!note) return;
      const ids = Array.isArray(note.notebookIds) ? note.notebookIds.slice() : [];
      const i = ids.indexOf(notebookId);
      if (i >= 0) ids.splice(i, 1); else ids.push(notebookId);
      data[groupId] = { ...note, notebookIds: ids, updated: Date.now() };
      this._save();
      this._bumpKeys(data[groupId]);
    },

    /**
     * Strip a notebookId from every note (called when a notebook is
     * deleted). Only touches notes that actually had the membership.
     * @param {string} notebookId
     * @returns {void}
     */
    /**
     * Replace the entire note map (W2.6 import path).
     * @param {Record<string, Note> | null | undefined} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      this._cache = (data && typeof data === 'object' && !Array.isArray(data)) ? data : /** @type {any} */ ({});
      this._save();
      this._bump();
    },

    pruneNotebook(notebookId) {
      if (this._shouldDefer('pruneNotebook', notebookId)) return;
      const data = this._load();
      const ts = Date.now();
      Object.keys(data).forEach(k => {
        const ids = (data[k].notebookIds || []).filter(id => id !== notebookId);
        if (ids.length !== (data[k].notebookIds || []).length) {
          data[k] = { ...data[k], notebookIds: ids, updated: ts };
        }
      });
      this._save();
      this._bump();
    }
  }
);

/* ══════════════════════════════════════════════════════════════════════
   NotebookStore — named buckets for grouping notes
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (loaded first), NoteStore (used at CALL
   time only — remove() cascades via NoteStore.pruneNotebook).
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';
import { NoteStore } from './note-store.js';

/**
 * A notebook record. Notebooks have no color (the color belongs to the
 * member notes); they're a pure tag-bucket. `sortIndex` controls display
 * order in the Notes hub.
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   sortIndex: number,
 *   created: number,
 *   updated: number
 * }} Notebook
 */

/**
 * On-disk shape: { list: Notebook[] } (wrapped so future fields can be
 * added at the top level without migration).
 *
 * @typedef {{ list: Notebook[] }} NotebookStoreData
 */

/* NotebookStore — named buckets for grouping notes. Notebooks have
   no color (kept simple by user direction); the color belongs to the
   note. A note can live in 0, 1, or many notebooks (multi-membership
   via NoteStore.notebookIds[]). */
export const NotebookStore = extendStore(
  CachedStore('vot-notebooks', /** @type {NotebookStoreData} */ ({ list: [] })),
  {
    /**
     * All notebooks sorted by sortIndex, then created. Returns a copy
     * (callers can mutate without affecting the cache).
     * @returns {Notebook[]}
     */
    list() {
      const data = this._load();
      return (data.list || []).slice().sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0) || (a.created || 0) - (b.created || 0));
    },

    /**
     * Look up a notebook by id.
     * @param {string} id
     * @returns {Notebook | null}
     */
    get(id) { return (this._load().list || []).find(n => n.id === id) || null; },

    /**
     * Create (or return existing dup) a notebook by name. Case-insensitive
     * dedup means tapping "Create" twice on "Devotional" returns the same
     * notebook both times. Returns null when name is blank.
     * @param {string | null | undefined} name
     * @returns {Notebook | null}
     */
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
      /** @type {Notebook} */
      const nb = { id, name: trimmed, sortIndex: data.list.length, created: ts, updated: ts };
      data.list.push(nb);
      this._save();
      return nb;
    },

    /**
     * Rename a notebook in place. No-op when name is blank or id is unknown.
     * @param {string} id
     * @param {string | null | undefined} name
     * @returns {void}
     */
    rename(id, name) {
      const trimmed = (name || '').trim();
      if (!trimmed) return;
      const data = this._load();
      const nb = (data.list || []).find(n => n.id === id);
      if (nb) { nb.name = trimmed; nb.updated = Date.now(); this._save(); }
    },

    /**
     * Delete a notebook AND strip its id from every note that referenced
     * it (cascading via NoteStore.pruneNotebook). Notes themselves are
     * preserved — they just lose this notebook tag.
     * @param {string} id
     * @returns {void}
     */
    remove(id) {
      const data = this._load();
      data.list = (data.list || []).filter(n => n.id !== id);
      this._save();
      // Cascade: strip the deleted notebook from every note that referenced it
      NoteStore.pruneNotebook(id);
    }
  }
);

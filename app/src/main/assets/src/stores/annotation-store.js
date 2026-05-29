/* ══════════════════════════════════════════════════════════════════════
   AnnotationStore (+ HighlightStore alias)
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (loaded first).

   (The pre-W2 vot-highlights → vot-annotations/vot-notes bootstrap migration
   was retired in W7.1. Live data is already in the current shape; future
   shape changes go through the CachedStore versioned-migration framework,
   not an ad-hoc one-shot.)
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/**
 * A single annotation segment. Multi-paragraph annotations share a
 * `groupId` across their segments. `kind` discriminates highlights
 * (yellow background), underlines (colored underline), and notes
 * (paired with a NoteStore record on the same groupId).
 *
 * @typedef {{
 *   id: string,
 *   groupId: string,
 *   kind: 'highlight' | 'underline' | 'note',
 *   color: string,
 *   start: number,
 *   end: number,
 *   text: string,
 *   created: number,
 *   updated: number
 * }} Annotation
 */

/**
 * On-disk shape: hlKey → list of segments for that anchor.
 * @typedef {Record<string, Annotation[]>} AnnotationData
 */


/* AnnotationStore — segment-level records. Aliased as HighlightStore for
   back-compat with existing call sites. Every entry has a kind field
   ('highlight' | 'underline' | 'note') and a groupId (always present;
   single-segment annotations get a unique groupId == id at create time). */
export const AnnotationStore = extendStore(
  CachedStore('vot-annotations', /** @type {AnnotationData} */ ({}), { idb: true }),
  {
    /**
     * All annotation segments anchored at `key`. Empty array if none.
     * @param {string} key
     * @returns {Annotation[]}
     */
    get(key) { return this._load()[key] || []; },

    /**
     * The full map (hlKey → segments). Mutations through it persist on
     * next _save(); callers prefer the typed methods.
     * @returns {AnnotationData}
     */
    all() { return this._load(); },

    /**
     * Append an annotation segment. Stamps defaults (groupId → id, kind
     * → 'highlight', created/updated) when missing.
     * @param {string} key
     * @param {Partial<Annotation> & { id: string, start: number, end: number }} ann
     * @returns {void}
     */
    add(key, ann) {
      if (this._shouldDefer('add', key, ann)) return;
      // Spread-copy first so the stamps don't mutate the caller's ann
      // reference. Symmetric with HistoryStore.add (history-store.js)
      // which constructs `const stamped = { ...entry, key, ts }`. The
      // stored record carries the stamps; the caller's literal stays
      // pristine. Default-stamping runs AFTER _shouldDefer so deferred
      // queue entries aren't pre-mutated and the stamps reflect the
      // actual write time, not the first-attempt time.
      const stamped = { ...ann };
      if (!stamped.groupId) stamped.groupId = stamped.id;
      if (!stamped.kind) stamped.kind = 'highlight';
      if (!stamped.created) stamped.created = Date.now();
      stamped.updated = Date.now();
      const data = this._load();
      if (!data[key]) data[key] = [];
      data[key].push(/** @type {Annotation} */ (stamped));
      this._save();
      this._bump();
    },

    /**
     * Patch a single annotation by id (within key's bucket). No-op when
     * key or id is unknown. Bumps updated.
     * @param {string} key
     * @param {string} annId
     * @param {Partial<Annotation>} patch
     * @returns {void}
     */
    update(key, annId, patch) {
      if (this._shouldDefer('update', key, annId, patch)) return;
      const data = this._load();
      const arr = data[key];
      if (!arr) return;
      const idx = arr.findIndex(h => h.id === annId);
      if (idx >= 0) { arr[idx] = { ...arr[idx], ...patch, updated: Date.now() }; this._save(); this._bump(); }
    },

    /**
     * Remove a single annotation by id. Deletes the key's bucket when it
     * becomes empty.
     * @param {string} key
     * @param {string} annId
     * @returns {void}
     */
    remove(key, annId) {
      if (this._shouldDefer('remove', key, annId)) return;
      const data = this._load();
      if (!data[key]) return;
      data[key] = data[key].filter(h => h.id !== annId);
      if (data[key].length === 0) delete data[key];
      this._save();
      this._bump();
    },

    /**
     * Remove every annotation under `key`.
     * @param {string} key
     * @returns {void}
     */
    removeAllForKey(key) {
      if (this._shouldDefer('removeAllForKey', key)) return;
      const data = this._load();
      delete data[key];
      this._save();
      this._bump();
    },

    /**
     * Remove every segment belonging to a group across all keys. Cleans
     * up empty key buckets as it goes.
     * @param {string} groupId
     * @returns {void}
     */
    removeGroup(groupId) {
      if (this._shouldDefer('removeGroup', groupId)) return;
      const data = this._load();
      Object.keys(data).forEach(k => {
        data[k] = data[k].filter(h => h.groupId !== groupId);
        if (data[k].length === 0) delete data[k];
      });
      this._cache = data;
      this._save();
      this._bump();
    },

    /**
     * All segments belonging to a group, with each tagged by its key.
     * Used by NoteSheet/MultiNotePopover to gather the multi-paragraph
     * pieces of a single note.
     * @param {string} groupId
     * @returns {{ key: string, ann: Annotation }[]}
     */
    getByGroup(groupId) {
      const data = this._load();
      /** @type {{ key: string, ann: Annotation }[]} */
      const out = [];
      Object.keys(data).forEach(k => data[k].forEach(h => { if (h.groupId === groupId) out.push({ key: k, ann: h }); }));
      return out;
    },

    /**
     * Recolor every segment in a group. Single _save() for the whole
     * batch. Bumps updated on each touched segment.
     * @param {string} groupId
     * @param {string} color
     * @returns {void}
     */
    recolorGroup(groupId, color) {
      if (this._shouldDefer('recolorGroup', groupId, color)) return;
      const data = this._load();
      const ts = Date.now();
      Object.keys(data).forEach(k => data[k].forEach(h => {
        if (h.groupId === groupId) { h.color = color; h.updated = ts; }
      }));
      this._save();
      this._bump();
    },

    /**
     * Convert a group from one kind to another (e.g. highlight → note).
     * Caller is responsible for creating/removing the corresponding
     * NoteStore record — this method only touches AnnotationStore.
     * @param {string} groupId
     * @param {'highlight' | 'underline' | 'note'} kind
     * @returns {void}
     */
    convertGroup(groupId, kind) {
      if (this._shouldDefer('convertGroup', groupId, kind)) return;
      const data = this._load();
      const ts = Date.now();
      Object.keys(data).forEach(k => data[k].forEach(h => {
        if (h.groupId === groupId) { h.kind = kind; h.updated = ts; }
      }));
      this._save();
      this._bump();
    },

    /**
     * Find the group whose segment spans the given range within `key`.
     * Returns the FIRST matching segment (which carries the groupId);
     * null if no segment fully covers [start, end].
     * @param {string} key
     * @param {number} start
     * @param {number} end
     * @returns {Annotation | null}
     */
    groupAt(key, start, end) {
      const arr = this.get(key);
      const hit = arr.find(h => h.start <= start && h.end >= end);
      return hit || null;
    },

    /**
     * Replace the entire annotation map (W2.6 import path). Coerces
     * non-object input to `{}` so a malformed payload doesn't write
     * a bad shape into the cache.
     * @param {AnnotationData | null | undefined} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      this._cache = (data && typeof data === 'object' && !Array.isArray(data)) ? data : /** @type {any} */ ({});
      this._save();
      this._bump();
    }
  }
);

// Back-compat alias — existing references throughout the file still work.
export const HighlightStore = AnnotationStore;

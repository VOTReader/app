/* ══════════════════════════════════════════════════════════════════════
   AnnotationStore (+ HighlightStore alias) + one-time migration
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (loaded first). Runs migrateAnnotations()
   at module load, exactly once per browser profile (gated by the
   vot-ann-migrated localStorage flag).
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

/* ── One-time migration: vot-highlights → vot-annotations + vot-notes ──
   Old shape (per-segment): { id, groupId?, color, style:'highlight'|'underline',
     text, note?, start, end, created }
   New shape (per-segment): { id, groupId, kind:'highlight'|'underline'|'note',
     color, text, start, end, created, updated }
   Notes split off into vot-notes keyed by groupId:
     { groupId, notebookIds:[], body, color, fullText, keys[], created, updated }
   The old key vot-highlights is left in place as a backup. */

/**
 * Migrate legacy `vot-highlights` records into the current shape. No-op
 * after the first successful run (idempotent via the `vot-ann-migrated`
 * flag). Catches all errors and logs — a failed migration retries on the
 * next launch instead of crashing the app.
 *
 * @returns {void}
 */
export function migrateAnnotations() {
  try {
    if (localStorage.getItem('vot-ann-migrated') === '1') return;
    const oldRaw = localStorage.getItem('vot-highlights');
    if (oldRaw) {
      /** @type {Record<string, any[]>} */
      const old = JSON.parse(oldRaw);
      /** @type {AnnotationData} */
      const newAnn = {};
      /** @type {Record<string, any>} */
      const newNotes = {};
      Object.keys(old).forEach(function(key) {
        const segs = old[key] || [];
        // Group orphan singles by id so they each get their own groupId
        /** @type {Map<string, any[]>} */
        const byGroup = new Map();
        segs.forEach(function(s) {
          const gid = s.groupId || s.id;
          if (!byGroup.has(gid)) byGroup.set(gid, []);
          /** @type {any[]} */ (byGroup.get(gid)).push(s);
        });
        /** @type {Annotation[]} */
        const out = [];
        byGroup.forEach(function(entries, gid) {
          // Determine kind for the whole group: any entry with a non-empty
          // note promotes the entire group to kind:'note'.
          const hasNote = entries.some(function(e) { return e.note && e.note.trim(); });
          const kind = /** @type {'highlight' | 'underline' | 'note'} */ (
            hasNote ? 'note' : (entries[0].style === 'underline' ? 'underline' : 'highlight')
          );
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
    }
  }
);

// Back-compat alias — existing references throughout the file still work.
export const HighlightStore = AnnotationStore;

/* ══════════════════════════════════════════════════════════════════════
   STORE-MERGE — 3-way merge helpers for cross-tab-safe store flushes
   ══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js. No dependencies.

   WHY (STORE-1): every IDB-backed CachedStore flushes its WHOLE cache under
   one key 'v', and each tab hydrates that key once at boot and never re-reads.
   Two PWA tabs therefore clobber each other: Tab A commits X, Tab B (whose
   cache predates X) later writes its stale whole-cache and silently destroys X.
   The fix re-reads the freshly-committed IDB value before each flush and MERGES
   the local cache onto it (under a per-store navigator.locks mutex so two tabs
   can't interleave a read-modify-write). This module is the merge brain; the
   serialization + base tracking live in cached-store.js `_save`. PWA-only —
   the Android APK is a single WebView and never hits this.

   THE THREE-WAY MERGE. Last-writer-wins on a whole blob is wrong (it clobbers).
   A 2-way union is also wrong (it RESURRECTS deletes — a record the sibling
   removed reappears because we still hold it). Correct resolution needs the
   common ancestor: `base` = the IDB snapshot THIS tab last synced with (set at
   hydrate + after each merge-write). With base, ours, and theirs we can tell a
   delete ("in base, gone from theirs, we didn't touch it") apart from an
   addition ("in theirs, never in base"):

     - add / add (id in only one side)      → keep it
     - delete vs untouched                  → honor the delete (drop)
     - delete vs edit                       → keep the edit (never lose content)
     - edit vs edit (same id both sides)    → newer `updated` wins

   NOTE on delete-vs-edit: "keep the edit" means a record one tab DELETES while
   another tab concurrently EDITS is RESURRECTED (with the edit's content). This
   is a deliberate bias — for precious, hand-authored content, silently losing an
   edit is worse than a record reappearing — but it is a real, observable
   behavior: if you delete an entry in one tab and edit it in another, it comes
   back. (Concurrent edit of a just-deleted record is rare in single-user use.)

   Records are matched by `.id` (arrays) or object key (maps). Conflict
   resolution reads `updated` (fallback `created`); records with NO timestamp
   (e.g. immutable links — add/delete only) are treated as never-edited, so
   their deletes are always honored and their adds always kept — exactly right.

   TOTALITY. Every helper is total: it never throws and coerces null/undefined/
   wrong-typed inputs to empty. It runs in the precious write path, so a bad
   input must degrade to "merge what we can," never crash a save.
   ═══════════════════════════════════════════════════════════════════════ */

/** @param {any} x @returns {any[]} */
function _arr(x) { return Array.isArray(x) ? x : []; }

/** @param {any} x @returns {Record<string, any>} */
function _obj(x) { return (x && typeof x === 'object' && !Array.isArray(x)) ? x : {}; }

/**
 * Index an array of records by `.id`. Records without an id are skipped
 * (they can't be merged identity-wise). Later duplicates overwrite earlier.
 * @param {any} x
 * @returns {Map<any, any>}
 */
function _byId(x) {
  const m = new Map();
  for (const r of _arr(x)) { if (r && r.id != null) m.set(r.id, r); }
  return m;
}

/**
 * A record's change-tracking timestamp: `updated`, else `created`, else 0.
 * @param {any} r
 * @returns {number}
 */
function _stamp(r) {
  if (!r || typeof r !== 'object') return 0;
  if (typeof r.updated === 'number') return r.updated;
  if (typeof r.created === 'number') return r.created;
  return 0;
}

/**
 * Newer of two records by `_stamp`. Ties resolve to `theirs` (the already-
 * committed sibling value) so the result is deterministic regardless of which
 * tab flushes second.
 * @param {any} ours
 * @param {any} theirs
 * @returns {any}
 */
function _newer(ours, theirs) {
  return _stamp(ours) > _stamp(theirs) ? ours : theirs;
}

/**
 * Did `cur` change since `base`? Drives the delete-vs-edit decision.
 *   - present↔absent transitions count as changed
 *   - both timestamped → changed iff `cur` is strictly newer
 *   - neither timestamped (booleans, immutable records) → structural compare
 * @param {any} base
 * @param {any} cur
 * @returns {boolean}
 */
function _changed(base, cur) {
  if (base === undefined || base === null) return !(cur === undefined || cur === null);
  if (cur === undefined || cur === null) return true;
  const bt = _stamp(base), ct = _stamp(cur);
  if (bt || ct) return ct > bt;
  try { return JSON.stringify(base) !== JSON.stringify(cur); }
  catch (_e) { return true; }
}

/**
 * Default per-key value resolver for `mergeMapByKey`: newer of ours/theirs.
 * @param {any} _baseVal
 * @param {any} ourVal
 * @param {any} theirVal
 * @returns {any}
 */
function _defaultValueMerge(_baseVal, ourVal, theirVal) {
  return _newer(ourVal, theirVal);
}

/**
 * 3-way merge of two arrays of records keyed by `.id`. Preserves OUR order
 * (kept/edited records stay where they were), then appends sibling-only
 * additions. See the file header for the conflict matrix.
 *
 * @param {any} base    last-synced snapshot
 * @param {any} ours    local cache
 * @param {any} theirs  freshly-read committed state
 * @returns {any[]}     a new array
 */
export function mergeRecordsById(base, ours, theirs) {
  const B = _byId(base), T = _byId(theirs);
  /** @type {any[]} */ const out = [];
  const seen = new Set();
  // 1. Walk ours in order — keep / replace-with-newer / drop-on-honored-delete.
  for (const rec of _arr(ours)) {
    const id = rec && rec.id;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    if (T.has(id)) out.push(_newer(rec, T.get(id)));                 // both → newer wins
    else if (B.has(id) && !_changed(B.get(id), rec)) { /* their delete, unedited → drop */ }
    else out.push(rec);                                              // our add, or our edit beats their delete
  }
  // 2. Append sibling-only records (their adds, or their edit beats our delete).
  for (const rec of _arr(theirs)) {
    const id = rec && rec.id;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    if (B.has(id) && !_changed(B.get(id), rec)) { /* our delete, unedited → drop */ }
    else out.push(rec);
  }
  return out;
}

/**
 * 3-way merge of two plain objects keyed by property. A key present in BOTH
 * ours and theirs is resolved by `valueMerge(baseVal, ourVal, theirVal)`
 * (default: newer by `updated`). Add/delete/edit semantics mirror
 * `mergeRecordsById`. Used for keyed-record maps (notes), segment-bucket maps
 * (annotations — pass a bucket value-merge), and id-list maps (journal-index —
 * pass a union value-merge).
 *
 * subMerge (STOR1): when the value is itself a mergeable SUB-COLLECTION (the
 * annotation segment buckets), a key present on only one side is NOT a
 * whole-bucket delete-vs-edit — it means "every member on the absent side is
 * gone". In that mode we run `valueMerge` over the UNION of keys with each
 * absent side coerced to undefined (→ the value-merge reads it as empty), so a
 * member the local tab deleted is honored even when a sibling concurrently
 * edited the same bucket — instead of resurrecting the whole bucket (and our
 * just-deleted segment with it). A bucket that merges to empty is pruned. Flat
 * scalar maps (notes) and union maps (journal-index) keep the default
 * key-presence semantics, where delete-vs-edit deliberately resurrects.
 *
 * @param {any} base
 * @param {any} ours
 * @param {any} theirs
 * @param {(baseVal: any, ourVal: any, theirVal: any) => any} [valueMerge]
 * @param {boolean} [subMerge] treat values as mergeable sub-collections (see above)
 * @returns {Record<string, any>}
 */
export function mergeMapByKey(base, ours, theirs, valueMerge, subMerge) {
  const B = _obj(base), O = _obj(ours), T = _obj(theirs);
  const merge = valueMerge || _defaultValueMerge;
  /** @type {Record<string, any>} */ const out = {};
  if (subMerge) {
    for (const k of new Set([...Object.keys(B), ...Object.keys(O), ...Object.keys(T)])) {
      const merged = merge((k in B) ? B[k] : undefined, (k in O) ? O[k] : undefined, (k in T) ? T[k] : undefined);
      const empty = merged == null || (Array.isArray(merged) ? merged.length === 0 : Object.keys(merged).length === 0);
      if (!empty) out[k] = merged;
    }
    return out;
  }
  for (const k of Object.keys(O)) {
    if (k in T) out[k] = merge((k in B) ? B[k] : undefined, O[k], T[k]);   // both → resolve
    else if ((k in B) && !_changed(B[k], O[k])) { /* their delete, unedited → drop */ }
    else out[k] = O[k];                                                    // our add / our edit beats delete
  }
  for (const k of Object.keys(T)) {
    if (k in O) continue;
    if ((k in B) && !_changed(B[k], T[k])) { /* our delete, unedited → drop */ }
    else out[k] = T[k];                                                    // their add / their edit beats delete
  }
  return out;
}

/**
 * Order-preserving union of two string arrays (dedup, ours-first). For
 * journal-index buckets — derived `entryId[]` lists with no per-id timestamp,
 * so additions from either tab are unioned. A stale id (an entry the sibling
 * deleted) may linger but is cosmetic and self-heals on the next reindex of
 * that entry; never losing a real reference is the safer bias for a derived
 * index that drives "N entries reference this" chips.
 *
 * @param {any} ours
 * @param {any} theirs
 * @returns {string[]}
 */
export function unionStrings(ours, theirs) {
  /** @type {string[]} */ const out = [];
  const seen = new Set();
  for (const x of _arr(ours).concat(_arr(theirs))) {
    if (!seen.has(x)) { seen.add(x); out.push(x); }
  }
  return out;
}

/* ─── Pre-built per-store strategies (passed as opts.crossTabMerge) ───
   Each takes (base, ours, theirs) and returns the merged whole-cache value
   in that store's native shape, so cached-store can assign it straight back
   to `_cache`. */

/** Bare id-bearing arrays: bookmarks, links. */
export function mergeArrayStore(base, ours, theirs) {
  return mergeRecordsById(base, ours, theirs);
}

/** `{ list: Record[] }` wrappers: journal, journal-notebooks, notebooks. */
export function mergeListStore(base, ours, theirs) {
  return { list: mergeRecordsById(_obj(base).list, _obj(ours).list, _obj(theirs).list) };
}

/** Keyed record maps with `updated`: notes. */
export function mergeMapStore(base, ours, theirs) {
  return mergeMapByKey(base, ours, theirs);
}

/** Annotations: `{ hlKey: Annotation[] }` — merge buckets by segment id.
    subMerge=true (STOR1): a bucket the local tab emptied (deleting its last
    segment → the hlKey is removed) merges member-wise against base instead of
    being resurrected whole by a sibling's concurrent edit to the same hlKey. */
export function mergeAnnotationsStore(base, ours, theirs) {
  return mergeMapByKey(base, ours, theirs, function (b, o, t) { return mergeRecordsById(b, o, t); }, true);
}

/** Journal index: `{ refKey: entryId[] }` — union the id lists per key. */
export function mergeJournalIndexStore(base, ours, theirs) {
  return mergeMapByKey(base, ours, theirs, function (_b, o, t) { return unionStrings(o, t); });
}

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
     - edit vs untouched (same id both sides) → keep the edit, whatever the
                                              clocks say (dl1, below)
     - edit vs edit (same id both sides)    → newer `updated` wins

   dl1 (2026-11-04): "edit vs untouched" used to be decided by the stamps
   alone, newer wins and a tie to theirs. In ONE tab `theirs` is this tab's
   own last save, so an edit stamped no later than that save lost to it and
   the edit was gone from memory as well as disk: a device clock that steps
   back (a manual time change, a network-time correction) reverted every edit
   to a record last saved under the faster clock, and two saves of one record
   in one millisecond reverted the second. A side that is still the base copy
   now gives way to the side that changed. A record's stamp moves on every
   change its writers make, so the same stamp as the base copy means
   unchanged; a record with no stamp at all is compared whole.

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

import { DiagnosticLog } from '../utils/diagnostic-log.js';

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
 * Did `cur` change since `base`? Drives the delete-vs-edit decision and the
 * edit-vs-untouched one (`_resolve`).
 *   - present↔absent transitions count as changed
 *   - either timestamped → changed iff the stamp moved. dl1: it was "strictly
 *     newer", so an edit stamped under a clock set back read as untouched and a
 *     sibling's delete took it.
 *   - neither timestamped (booleans, immutable records) → structural compare
 * @param {any} base
 * @param {any} cur
 * @returns {boolean}
 */
function _changed(base, cur) {
  if (base === undefined || base === null) return !(cur === undefined || cur === null);
  if (cur === undefined || cur === null) return true;
  const bt = _stamp(base), ct = _stamp(cur);
  if (bt || ct) return ct !== bt;
  try { return JSON.stringify(base) !== JSON.stringify(cur); }
  catch (_e) { return true; }
}

/**
 * Both sides hold the record: the copy to keep (dl1, file header). A side that
 * did not change it since `base` gives way to the side that did, so this tab's
 * own edit survives its own last save whatever the clock did. Changed on both
 * sides (two tabs edited it), or no ancestor to tell by: the newer stamp, a
 * tie to theirs, as always.
 * @param {any} baseRec
 * @param {any} ours
 * @param {any} theirs
 * @returns {any}
 */
function _resolve(baseRec, ours, theirs) {
  if (baseRec !== undefined && baseRec !== null) {
    if (!_changed(baseRec, theirs)) return ours;
    if (!_changed(baseRec, ours)) return theirs;
  }
  return _newer(ours, theirs);
}

/**
 * Default per-key value resolver for `mergeMapByKey`: the changed side, else
 * the newer of ours/theirs (`_resolve`).
 * @param {any} baseVal
 * @param {any} ourVal
 * @param {any} theirVal
 * @returns {any}
 */
function _defaultValueMerge(baseVal, ourVal, theirVal) {
  return _resolve(baseVal, ourVal, theirVal);
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
  // 1. Walk ours in order — keep / resolve / drop-on-honored-delete.
  for (const rec of _arr(ours)) {
    const id = rec && rec.id;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    if (T.has(id)) out.push(_resolve(B.get(id), rec, T.get(id)));    // both → the changed side, else newer
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

/* Reading plan runs (vot-reading-plans, mw18). */
/**
 * Cross-tab merge: records by id (the newer copy of a run wins, deletions
 * honoured), then the ticks of both copies merge three ways against the base:
 * a chapter read in one tab is never lost to a pace change made in another,
 * and one un-marked in one tab (C4) stays un-marked unless the other tab
 * changed it too.
 * @param {any} base @param {any} ours @param {any} theirs
 * @returns {any[]}
 */
export function mergePlanStore(base, ours, theirs) {
  const merged = mergeRecordsById(base, ours, theirs);
  const byId = (/** @type {any} */ arr) => new Map((Array.isArray(arr) ? arr : []).filter((/** @type {any} */ r) => r && typeof r.id === 'string').map((r) => [r.id, r]));
  const B = byId(base), O = byId(ours), T = byId(theirs);
  return merged.map((/** @type {any} */ r) => {
    const o = O.get(r && r.id), t = T.get(r && r.id);
    if (!o || !t) return r;
    const b = (B.get(r.id) || {}).ticks || {}, ot = o.ticks || {}, tt = t.ticks || {};
    /** @type {Record<string, string>} */
    const ticks = {};
    for (const k of new Set([...Object.keys(ot), ...Object.keys(tt)])) {
      // In the base and missing from either side: that side un-marked it.
      if (k in b && (!(k in ot) || !(k in tt))) continue;
      ticks[k] = k in ot ? ot[k] : tt[k];
    }
    return { ...r, ticks };
  });
}

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

/* ─── The reading history and the tallies (dl2, 2026-11-04) ─────────────
   vot-history, vot-reading-stats, vot-reading-streak and vot-journal-stats
   saved their whole value blind. Each tab loads it once, at boot, so a second
   tab's save wrote the copy it had loaded over everything the first had saved
   since: the visits it recorded, the words it credited, the reading days and
   the journal count. Each merges here the way its writers change it: the
   history as a log (a visit either tab added stays; one either tab removed, a
   clear or the cap, goes), a total as the stored total plus what this tab
   added to it since the base, a streak from both tabs' latest days.
   With no base there is no telling what this tab added, so each keeps this
   tab's copy, the old blind write (a total merged without its ancestor would
   count the stored copy twice). A store saves only once it has loaded, and
   loading sets the base, so that is a test store forced 'loaded'. In one tab
   the stored copy is the base, and every merge here returns this tab's copy. */

/** The most visits the history keeps (history-store.js add). */
const HISTORY_CAP = 2000;
/** The day buckets and in-progress places the words-read ledger keeps (reading-stats-store.js). */
const STATS_MAX_DAYS = 400;
const STATS_MAX_SAMPLES = 50;
const STATS_MAX_PROGRESS = 50;

/** A finite, non-negative number, else 0 (reading-stats-store.js _count). @param {any} x @returns {number} */
function _tally(x) {
  const n = (typeof x === 'number' || typeof x === 'string') ? Number(x) : NaN;
  return isFinite(n) && n > 0 ? n : 0;
}

/** The stored total plus what this tab added since the base. @param {any} b @param {any} o @param {any} t */
function _addedTo(b, o, t) {
  return Math.max(0, _tally(t) + (_tally(o) - _tally(b)));
}

/** @param {any} x @returns {boolean} */
function _isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

/** @param {any} v @returns {string} */
function _json(v) {
  try { return JSON.stringify(v); } catch (_e) { return String(v); }
}

/** A visit's identity: what was read, and when. @param {any} e @returns {string} */
function _visitId(e) {
  if (e && typeof e === 'object') return 'v\u0000' + String(e.type) + '\u0000' + String(e.key) + '\u0000' + String(e.ts);
  return 'j\u0000' + _json(e);
}

/** @param {any} e @returns {number} */
function _visitTs(e) {
  return (e && typeof e === 'object' && typeof e.ts === 'number' && isFinite(e.ts)) ? e.ts : 0;
}

/**
 * vot-history (newest first, capped). A visit either tab added is kept; one the
 * other tab no longer holds (its clear, or the cap) goes. This tab's list keeps
 * its order and the other tab's visits are woven in by time, so one tab alone
 * gets back exactly what it wrote.
 * @param {any} base @param {any} ours @param {any} theirs
 * @returns {any[]}
 */
export function mergeHistoryStore(base, ours, theirs) {
  if (!Array.isArray(base) || !Array.isArray(theirs)) return _arr(ours);   // nothing stored yet: this tab's copy
  const inBase = new Set(base.map(_visitId));
  const inOurs = new Set(_arr(ours).map(_visitId));
  const inTheirs = new Set(_arr(theirs).map(_visitId));
  /** @type {any[]} */ const mine = [];
  for (const e of _arr(ours)) {
    const id = _visitId(e);
    if (!inBase.has(id) || inTheirs.has(id)) mine.push(e);                        // else: the other tab removed it
  }
  /** @type {any[]} */ const added = [];
  for (const e of _arr(theirs)) {
    const id = _visitId(e);
    if (!inOurs.has(id) && !inBase.has(id)) added.push(e);                        // the other tab's visit
  }
  if (!added.length) return mine.slice(0, HISTORY_CAP);
  /** @type {any[]} */ const out = [];
  let i = 0, j = 0;
  while ((i < mine.length || j < added.length) && out.length < HISTORY_CAP) {
    if (j >= added.length || (i < mine.length && _visitTs(mine[i]) >= _visitTs(added[j]))) out.push(mine[i++]);
    else out.push(added[j++]);
  }
  return out;
}

/** How many times each item occurs, by its JSON. @param {any} x @returns {Map<string, number>} */
function _counted(x) {
  /** @type {Map<string, number>} */ const m = new Map();
  for (const s of _arr(x)) { const k = _json(s); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

/**
 * A rolling window of samples, merged as a multiset: the stored ones less those
 * this tab dropped since the base (trimmed off the front, or a reset), then the
 * ones this tab added. In one tab that is this tab's own list.
 * @param {any} b @param {any} o @param {any} t
 * @returns {any[]}
 */
function _mergeSamples(b, o, t) {
  const B = _counted(b), O = _counted(o);
  /** @type {Map<string, number>} */ const dropped = new Map();
  for (const [k, n] of B) { const d = n - (O.get(k) || 0); if (d > 0) dropped.set(k, d); }
  /** @type {any[]} */ const out = [];
  for (const s of _arr(t)) {
    const k = _json(s), d = dropped.get(k) || 0;
    if (d > 0) dropped.set(k, d - 1); else out.push(s);
  }
  for (const s of _arr(o)) {
    const k = _json(s), n = B.get(k) || 0;
    if (n > 0) B.set(k, n - 1); else out.push(s);   // this tab's own new sample
  }
  return out;
}

/**
 * A set of strings three ways: kept when either side has it, unless the base
 * had it and either side has let it go (mergePlanStore's ticks, the same rule).
 * @param {any} b @param {any} o @param {any} t
 * @returns {string[]}
 */
function _mergeStringSet(b, o, t) {
  const B = new Set(_arr(b)), O = new Set(_arr(o)), T = new Set(_arr(t));
  return unionStrings(o, t).filter((x) => !(B.has(x) && (!O.has(x) || !T.has(x))));
}

/** One in-progress place: the side that touched it since the base, else the later touch. @param {any} b @param {any} o @param {any} t */
function _progressMerge(b, o, t) {
  if (b !== undefined && b !== null) {
    if (!_changed(b, t)) return o;
    if (!_changed(b, o)) return t;
  }
  return _tally(o && o.t) >= _tally(t && t.t) ? o : t;
}

/**
 * vot-reading-stats. Totals and each day's words: the stored figure plus what
 * this tab credited since the base. Pace samples: the stored ones and this tab's
 * new ones, the last 50. In-progress places merge by item, the latest 50 kept.
 * @param {any} base @param {any} ours @param {any} theirs
 * @returns {any}
 */
export function mergeReadingStatsStore(base, ours, theirs) {
  if (!_isObj(base) || !_isObj(theirs)) return ours;   // nothing stored yet: this tab's copy
  const B = _obj(base), O = _obj(ours), T = _obj(theirs);
  /** @type {Record<string, any>} */ const out = Object.assign({}, T, O);
  for (const f of ['totalWordsRead', 'totalActiveMs', 'totalCompletions', 'rereads']) out[f] = _addedTo(B[f], O[f], T[f]);
  const bd = _obj(B.wordsByDay), od = _obj(O.wordsByDay), td = _obj(T.wordsByDay);
  /** @type {Record<string, number>} */ const days = {};
  for (const d of new Set([...Object.keys(od), ...Object.keys(td)])) {
    const n = _addedTo(bd[d], od[d], td[d]);
    if (n > 0) days[d] = n;
  }
  const dayKeys = Object.keys(days).sort();   // YYYY-MM-DD sorts by date
  for (let i = 0; i < dayKeys.length - STATS_MAX_DAYS; i++) delete days[dayKeys[i]];
  out.wordsByDay = days;
  out.wpmSamples = _mergeSamples(B.wpmSamples, O.wpmSamples, T.wpmSamples).slice(-STATS_MAX_SAMPLES);
  const progress = mergeMapByKey(B.progress, O.progress, T.progress, _progressMerge);
  const items = Object.keys(progress);
  if (items.length > STATS_MAX_PROGRESS) {
    items.sort((a, z) => _tally(progress[a] && progress[a].t) - _tally(progress[z] && progress[z].t));
    for (let k = 0; k < items.length - STATS_MAX_PROGRESS; k++) delete progress[items[k]];
  }
  out.progress = progress;
  if (Array.isArray(O.milestonesUnlocked) || Array.isArray(T.milestonesUnlocked)) out.milestonesUnlocked = _mergeStringSet(B.milestonesUnlocked, O.milestonesUnlocked, T.milestonesUnlocked);
  return out;
}

/** A stored YYYY-MM-DD day, or '' for none. @param {any} d @returns {string} */
function _day(d) { return typeof d === 'string' ? d : ''; }

/** Whole local days from d1 to d2 (journal-stats-store.js _jrnDaysBetween). @param {string} d1 @param {string} d2 */
function _daysApart(d1, d2) {
  return Math.round((new Date(d2 + 'T00:00:00').getTime() - new Date(d1 + 'T00:00:00').getTime()) / 86400000);
}

/**
 * Both tabs moved a streak on: the run ending on the later day, joined to the
 * earlier tab's run when that ended the day before (the tab with the later day
 * may never have seen it: a tab left open overnight restarts at 1).
 * @param {Record<string, any>} O @param {Record<string, any>} T @param {string} field the last-day field
 * @returns {{ last: any, current: number }}
 */
function _latestRun(O, T, field) {
  const oDay = _day(O[field]), tDay = _day(T[field]);
  if (oDay === tDay) return { last: O[field] || T[field] || null, current: Math.max(_tally(O.currentStreak), _tally(T.currentStreak)) };
  const late = oDay > tDay ? O : T, early = oDay > tDay ? T : O;
  const lateDay = _day(late[field]), earlyDay = _day(early[field]);
  let current = _tally(late.currentStreak);
  if (earlyDay && _daysApart(earlyDay, lateDay) === 1) current = Math.max(current, _tally(early.currentStreak) + 1);
  return { last: late[field], current };
}

/**
 * vot-reading-streak. Total reading days: the stored total plus the days this
 * tab counted since the base, the shared latest day once.
 * @param {any} base @param {any} ours @param {any} theirs
 * @returns {any}
 */
export function mergeReadingStreakStore(base, ours, theirs) {
  if (!_isObj(base) || !_isObj(theirs)) return ours;   // nothing stored yet: this tab's copy
  const B = _obj(base), O = _obj(ours), T = _obj(theirs);
  if (!_changed(B, T)) return ours;
  if (!_changed(B, O)) return theirs;
  const bTotal = _tally(B.totalDays);
  const oNew = Math.max(0, _tally(O.totalDays) - bTotal), tNew = Math.max(0, _tally(T.totalDays) - bTotal);
  const run = _latestRun(O, T, 'lastReadDate');
  const shared = _day(O.lastReadDate) === _day(T.lastReadDate) && oNew > 0 && tNew > 0 ? 1 : 0;
  return Object.assign({}, T, O, {
    currentStreak: run.current,
    lastReadDate: run.last,
    totalDays: bTotal + oNew + tNew - shared,
    longestStreak: Math.max(_tally(O.longestStreak), _tally(T.longestStreak), run.current),
  });
}

/**
 * vot-journal-stats. Entries: the stored count plus this tab's new entries less
 * its deletes since the base. No entries left: no live streak (J5).
 * @param {any} base @param {any} ours @param {any} theirs
 * @returns {any}
 */
export function mergeJournalStatsStore(base, ours, theirs) {
  if (!_isObj(base) || !_isObj(theirs)) return ours;   // nothing stored yet: this tab's copy
  const B = _obj(base), O = _obj(ours), T = _obj(theirs);
  if (!_changed(B, T)) return ours;
  if (!_changed(B, O)) return theirs;
  const totalEntries = Math.max(0, _tally(T.totalEntries) + (_tally(O.totalEntries) - _tally(B.totalEntries)));
  const run = _latestRun(O, T, 'lastEntryDate');
  const currentStreak = totalEntries === 0 ? 0 : run.current;
  /** @type {Record<string, any>} */ const out = Object.assign({}, T, O, {
    totalEntries,
    currentStreak,
    lastEntryDate: run.last,
    longestStreak: Math.max(_tally(O.longestStreak), _tally(T.longestStreak), currentStreak),
  });
  if (Array.isArray(O.milestonesUnlocked) || Array.isArray(T.milestonesUnlocked)) out.milestonesUnlocked = _mergeStringSet(B.milestonesUnlocked, O.milestonesUnlocked, T.milestonesUnlocked);
  return out;
}

/* ─── The listening library and the places in recordings (h1104-16) ─────
   vot-audio-library and vot-audio-positions saved their whole value blind, so a
   second PWA tab's save wrote the copy it loaded over what the first had saved
   since: a recording saved, a song kept, a place inside a recording. The same
   rules as dl2: no base, or nothing stored yet, keeps this tab's copy; in one
   tab the stored copy is the base and this tab's copy comes back as it is. */

/** The caps the two stores keep (audio-library-store.js, audio-positions-store.js). */
const AUDIO_SAVED_CAP = 100;
const AUDIO_RECENT_CAP = 30;
const SONG_SAVED_CAP = 500;
const SONG_RECENT_CAP = 30;
const SONG_KEPT_CAP = 5000;
const AUDIO_POSITIONS_CAP = 200;

/** A recording's identity in the library: its release URL. @param {any} r @returns {string} */
function _trackUrl(r) { return (r && typeof r === 'object' && typeof r.url === 'string') ? r.url : ''; }

/** First copy of each URL. @param {any} x @returns {Map<string, any>} */
function _byUrl(x) {
  /** @type {Map<string, any>} */ const m = new Map();
  for (const r of _arr(x)) { const u = _trackUrl(r); if (u && !m.has(u)) m.set(u, r); }
  return m;
}

/** A field three ways: the side that changed it since the base, else ours (the tab writing now). @param {any} b @param {any} o @param {any} t */
function _field3(b, o, t) {
  if (_json(b) === _json(o) && _json(b) !== _json(t)) return t;
  return o;
}

/**
 * A shelf of recordings (saved: savedAt; recent: playedAt), by URL. One either
 * tab added stays; one either tab removed since the base goes unless the other
 * tab changed it; one both hold is the side that changed it, else the later
 * stamp. Newest first, capped (the store sorts the same way on every read).
 * @param {any} b @param {any} o @param {any} t @param {string} stampKey @param {number} cap
 * @returns {any[]}
 */
function _mergeTracks(b, o, t, stampKey, cap) {
  const B = _byUrl(b), O = _byUrl(o), T = _byUrl(t);
  /** @type {any[]} */ const out = [];
  for (const [u, r] of O) {
    if (T.has(u)) {
      const base = B.get(u), theirs = T.get(u);
      if (base && _json(base) === _json(theirs)) out.push(r);
      else if (base && _json(base) === _json(r)) out.push(theirs);
      else out.push(_tally(r[stampKey]) >= _tally(theirs[stampKey]) ? r : theirs);
    } else if (!(B.has(u) && _json(B.get(u)) === _json(r))) out.push(r);   // else: the other tab removed it
  }
  for (const [u, r] of T) {
    if (O.has(u)) continue;
    if (!(B.has(u) && _json(B.get(u)) === _json(r))) out.push(r);          // else: this tab removed it
  }
  out.sort((x, z) => _tally(z[stampKey]) - _tally(x[stampKey]));
  return out.slice(0, cap);
}

/** The recordings-started count, with the store's lower bound for a pre-counter record. @param {Record<string, any>} x */
function _plays(x) {
  return Object.prototype.hasOwnProperty.call(x, 'plays') ? _tally(x.plays) : _arr(x.recent).length;
}

/**
 * vot-audio-library. The two recording shelves by URL; the three song shelves
 * as three-way sets; plays and completions as the stored count plus this tab's
 * new ones; the playback rate from the tab that changed it.
 * @param {any} base @param {any} ours @param {any} theirs
 * @returns {any}
 */
export function mergeAudioLibraryStore(base, ours, theirs) {
  if (!_isObj(base) || !_isObj(theirs)) return ours;   // nothing stored yet: this tab's copy
  if (!_changed(base, theirs)) return ours;             // one tab, or the other tab saved nothing since
  const B = _obj(base), O = _obj(ours), T = _obj(theirs);
  if (!_changed(B, O)) return theirs;
  return Object.assign({}, T, O, {
    saved: _mergeTracks(B.saved, O.saved, T.saved, 'savedAt', AUDIO_SAVED_CAP),
    recent: _mergeTracks(B.recent, O.recent, T.recent, 'playedAt', AUDIO_RECENT_CAP),
    rate: _field3(B.rate, O.rate, T.rate),
    plays: _addedTo(_plays(B), _plays(O), _plays(T)),
    completions: _addedTo(B.completions, O.completions, T.completions),
    songSaved: _mergeStringSet(B.songSaved, O.songSaved, T.songSaved).slice(0, SONG_SAVED_CAP),
    songRecent: _mergeStringSet(B.songRecent, O.songRecent, T.songRecent).slice(0, SONG_RECENT_CAP),
    songKept: _mergeStringSet(B.songKept, O.songKept, T.songKept).slice(0, SONG_KEPT_CAP),
  });
}

/** One place in a recording: the side that moved it since the base, else the later touch. @param {any} b @param {any} o @param {any} t */
function _positionMerge(b, o, t) {
  if (b !== undefined && b !== null) {
    if (!_changed(b, t)) return o;
    if (!_changed(b, o)) return t;
  }
  return _tally(o && o.at) >= _tally(t && t.at) ? o : t;
}

/**
 * vot-audio-positions ({ v, positions: { url: { t, d, at } } }, oldest touch
 * first). Per URL the side that moved it, else the later `at`; a place either
 * tab cleared since the base stays cleared; the 200 freshest kept.
 * @param {any} base @param {any} ours @param {any} theirs
 * @returns {any}
 */
export function mergeAudioPositionsStore(base, ours, theirs) {
  if (!_isObj(base) || !_isObj(theirs)) return ours;   // nothing stored yet: this tab's copy
  if (!_changed(base, theirs)) return ours;
  const B = _obj(base), O = _obj(ours), T = _obj(theirs);
  if (!_changed(B, O)) return theirs;
  const map = mergeMapByKey(B.positions, O.positions, T.positions, _positionMerge);
  const urls = Object.keys(map).sort((x, z) => _tally(map[x] && map[x].at) - _tally(map[z] && map[z].at));
  /** @type {Record<string, any>} */ const positions = {};
  for (const u of urls.slice(Math.max(0, urls.length - AUDIO_POSITIONS_CAP))) positions[u] = map[u];
  return Object.assign({}, T, O, { positions });
}

/**
 * A read count, normalized. `readItems` values are counts, but pre-2026-08-03
 * data holds `true` — one read.
 * @param {any} v
 * @returns {number}
 */
function _count(v) {
  if (v === true) return 1;
  return (typeof v === 'number' && isFinite(v)) ? v : 0;
}

/** Value-merge for read counts: the higher count, keeping its original shape
 *  (so a legacy `true` survives as `true` and never becomes `1` gratuitously). */
function _higherCount(_b, o, t) { return _count(o) >= _count(t) ? o : t; }

/** Value-merge for "where I was last": the writing tab is the recent one. */
function _oursWins(_b, o, _t) { return o; }

/**
 * vot-state — the ONE store where the two halves want opposite policies,
 * so the merge is field-discriminating rather than one shape (C2-D [D4]).
 *
 * SESSION FIELDS — tabs, activeTabIdx, theme, settings, activeReadKey —
 * stay LAST-WRITER-WINS, deliberately. They describe where this window is
 * and how it is configured, and a stomped write costs nothing durable: the
 * losing tab still holds its own copy in memory and rewrites it on its next
 * change (usePersistedState flushes the whole 8-field union on every tick).
 * Merging two tab strips would be worse than the problem — it would
 * resurrect tabs the reader closed and invent an arrangement neither window
 * had. "The layout I most recently had" IS the right answer here.
 *
 * ACCUMULATING MAPS — readItems, lastReadChapters, lastReadLetterMap — are
 * merged, because for them a stomped write is permanent. readItems is the
 * marked-as-read ledger that feeds My Progress, the streak and 84
 * achievements; a mark made in tab A and clobbered by tab B's stale write
 * is gone, since B never had it and A will only rewrite it if A changes
 * again. That is the loss this whole item exists for.
 *
 * All three merge through `mergeMapByKey` with `base`, so a DELETE is still
 * honored: unmarkRead / clearReadForBook / clearAllProgress remove keys, and
 * a base-blind union would resurrect every one of them on the next sibling
 * write. Read counts resolve to the higher of the two (they only ever climb,
 * and two tabs crediting the same chapter must not double it); the two
 * last-read cursors resolve to OURS (the tab writing now is the tab that
 * just read something).
 *
 * @param {any} base
 * @param {any} ours
 * @param {any} theirs
 * @param {{ noGuard?: boolean }} [opts] noGuard: skip the progress-wipe guard (useSavedState's leave-record merge)
 * @returns {Record<string, any>}
 */
export function mergeStateStore(base, ours, theirs, opts) {
  const B = _obj(base), O = _obj(ours), T = _obj(theirs);
  // Start from theirs so a field only a sibling knows about (a newer app
  // version's addition) survives, then let ours win every session field.
  const out = Object.assign({}, T, O);
  // The progress-wipe guard (below): a ledger a write would empty keeps the disk copy.
  if (!(opts && opts.noGuard) && _wipesLedger(B, O, T)) {
    out.readItems = Object.assign({}, _obj(T.readItems));
    out.lastReadChapters = mergeMapByKey(null, O.lastReadChapters, T.lastReadChapters, _oursWins);
    out.lastReadLetterMap = mergeMapByKey(null, O.lastReadLetterMap, T.lastReadLetterMap, _oursWins);
    return out;
  }
  out.readItems = mergeMapByKey(B.readItems, O.readItems, T.readItems, _higherCount);
  out.lastReadChapters = mergeMapByKey(B.lastReadChapters, O.lastReadChapters, T.lastReadChapters, _oursWins);
  out.lastReadLetterMap = mergeMapByKey(B.lastReadLetterMap, O.lastReadLetterMap, T.lastReadLetterMap, _oursWins);
  return out;
}

/* ─── The progress-wipe guard (datasafe 2026-10-05) ───────────────────────
   A write whose read ledger is EMPTY while the disk copy holds a real one is
   how a slow cold start used to erase a reader's data: the App rendered on
   degraded defaults, the store then loaded, and the next write carried the
   defaults - a 3-way merge reads every key missing from ours as a delete.
   usePersistedState no longer writes from an unloaded mount; this is the net
   under it. Only an explicit clear (clearAllProgress / clearReadForBook arm it
   just before they empty the map) may take a ledger the BASE held (this tab
   saw it) to nothing. Otherwise the disk ledger is kept whole, the two
   last-read cursors union, and the session fields merge as usual; the
   diagnostic log says so. Keyed on the base, not the disk: a tab whose base
   never had the keys (a sibling's import) deletes nothing and is not refused.
   useSavedState's leave-record merge passes { noGuard } - the token that
   armed a clear lived in the page that left. useMarkAsRead and this
   module share bundle-b, so a module-scope token is enough (no window bridge). */
const PROGRESS_GUARD_MIN_KEYS = 10;
const PROGRESS_CLEAR_WINDOW_MS = 60000;
let _progressClearAt = 0;

/** Arm the guard for a deliberate progress clear (good for one minute). It also tells the
 *  next boot's data-health check (utils/data-safety.js) that the smaller ledger is the reader's own.
 *  W9: its own token (data-safety.js PROGRESS_RESET_KEY), which leaves out only the read marks;
 *  the whole-library skip it used to set hid a wipe at the next cold start. */
export function allowProgressClear() {
  _progressClearAt = Date.now();
  try { localStorage.setItem('vot-health-progress', '1'); } catch (_e) { /* no storage */ }
}

/** TEST-ONLY: disarm the clear token between cases. */
export function _resetProgressClearForTests() { _progressClearAt = 0; }

function _progressClearArmed() {
  return _progressClearAt > 0 && Date.now() - _progressClearAt <= PROGRESS_CLEAR_WINDOW_MS;
}

/**
 * True when `ours` would empty a read ledger the base held, with no clear armed.
 * @param {Record<string, any>} B @param {Record<string, any>} O @param {Record<string, any>} T
 */
function _wipesLedger(B, O, T) {
  const baseKeys = Object.keys(_obj(B.readItems)).length;
  if (baseKeys < PROGRESS_GUARD_MIN_KEYS) return false;
  if (Object.keys(_obj(O.readItems)).length !== 0) return false;
  if (Object.keys(_obj(T.readItems)).length === 0) return false;
  if (_progressClearArmed()) return false;
  try { DiagnosticLog.warn('state-guard', 'kept ' + Object.keys(_obj(T.readItems)).length + ' read marks a vot-state write would have emptied'); } catch (_e) { /* logging must never break a save */ }
  return true;
}

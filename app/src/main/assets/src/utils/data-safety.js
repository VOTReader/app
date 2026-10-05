/* ═══════════════════════════════════════════════════════════════════════
   DataSafety — automatic snapshots + the boot-time data-health check
   ═══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b; exposed on window for bundle-d (the
   StorageHealthBanner's Restore button, Clear All, Import).

   datasafe 2026-10-05. The owner's phone lost its whole library on 10-02 (55
   highlights, 6 notes, 3 links, 627 read marks, a 48-day streak): the
   WebView's database came back empty with no reinstall and no clear, and the
   only copy that survived was a manual export from 09-24. So:

   1. SNAPSHOT (run, once a day): after EVERY registered store has loaded, the
      raw store records (exactly what an export carries, media excluded) go to
      snapshot-sink - the app's private files on the phone app, OPFS on the
      web - which keeps 7 daily + 4 weekly. A library that looks damaged (2) is
      never snapshotted, so a loss cannot roll the good copies out.
   2. HEALTH CHECK (run, every boot, before 1): the library is scored
      (highlights + notes + links + bookmarks + 3 x journal entries + notebooks
      + read marks / 10) and compared with the newest snapshot. Score under
      half of a snapshot that scored at least MIN_SCORE, with no import or
      Clear All just done (HEALTH_SKIP_KEY), raises StorageHealth's
      data-missing banner and a data-health diagnostic line.
   3. RESTORE (restoreMissing, the banner's button): MERGE the snapshot into
      the live data store by store - record by record, the newer edit wins,
      read counts keep the higher, history unions - so nothing made since the
      snapshot is dropped, then reload. Never a replace.

   Never on the boot path: run() is called by HydrationGate after a delay.
   ═══════════════════════════════════════════════════════════════════════ */

import { IDBAdapter } from '../stores/idb-adapter.js';
import { storesNotLoaded, registeredStores, setStoreWriteFence } from '../stores/cached-store.js';
import {
  mergeAnnotationsStore, mergeMapStore, mergeArrayStore, mergeListStore, mergeJournalIndexStore, mergeStateStore,
} from '../stores/store-merge.js';
import { DiagnosticLog } from './diagnostic-log.js';
import { StorageHealth } from './storage-health.js';
import { snapshotSink, snapshotTime } from './snapshot-sink.js';

/** Set (localStorage) by an import or Clear All just before its reload: the next boot's
 *  smaller library is the reader's own doing, so it is not compared. In LS_SKIP_LIST. */
export const HEALTH_SKIP_KEY = 'vot-health-skip';
/** A snapshot scoring under this is too small to judge a drop against. */
export const MIN_SCORE = 5;
/** Never snapshot a manifest bigger than this (SnapshotStore refuses 24 MB). */
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
/** Stores never snapshotted: song bytes (gigabytes; they come back from the song sites). */
const SKIP_STORES = new Set(['offline-songs']);

/** @param {any} v */
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
/** @param {any} v */
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * What a library holds, in reader terms.
 * @param {Record<string, any>} stores raw store records by name
 */
export function summarize(stores) {
  const s = obj(stores);
  const state = obj(s['vot-state']);
  return {
    highlights: Object.values(obj(s['vot-annotations'])).reduce((n, list) => n + arr(list).length, 0),
    notes: Object.keys(obj(s['vot-notes'])).length,
    links: arr(s['vot-links']).length,
    bookmarks: arr(s['vot-bookmarks']).length,
    journal: arr(obj(s['vot-journal']).list).length,
    notebooks: arr(obj(s['vot-notebooks']).list).length + arr(obj(s['vot-journal-notebooks']).list).length,
    readMarks: Object.keys(obj(state.readItems)).length,
    history: arr(s['vot-history']).length,
  };
}

/** @param {ReturnType<typeof summarize>} m */
export function score(m) {
  return m.highlights + m.notes + m.links + m.bookmarks + 3 * m.journal + m.notebooks + Math.floor(m.readMarks / 10);
}

/**
 * True when `now` looks like a loss against `then`.
 * @param {ReturnType<typeof summarize>} then @param {ReturnType<typeof summarize>} now
 */
export function looksDamaged(then, now) {
  const before = score(then);
  return before >= MIN_SCORE && score(now) < before / 2;
}

/** Every registered store's record straight from the database. @returns {Promise<Record<string, any>>} */
async function collectStores() {
  /** @type {Record<string, any>} */ const out = {};
  for (const store of registeredStores()) {
    const name = store._idbStoreName;
    if (!name || SKIP_STORES.has(name)) continue;
    const v = await IDBAdapter.get(name, 'v');
    if (v !== undefined) out[name] = v;
  }
  return out;
}

/** A local calendar day key. @param {number} ms */
const dayOf = (ms) => new Date(ms).toDateString();

/**
 * The boot-time pass: check health, then take today's snapshot. Quiet on every
 * failure. Resolves to what it did, for tests and the diagnostic log.
 * @param {{ now?: () => number, sink?: any }} [opts]
 * @returns {Promise<'no-sink' | 'not-loaded' | 'damaged' | 'snapshotted' | 'fresh' | 'empty' | 'failed'>}
 */
export async function run(opts) {
  const now = (opts && opts.now) || Date.now;
  const sink = (opts && opts.sink) || snapshotSink();
  if (!sink) return 'no-sink';
  if (storesNotLoaded().length) return 'not-loaded';
  try {
    const stores = await collectStores();
    const summary = summarize(stores);
    const list = await sink.list();
    const newest = list[0];
    let skip = false;
    try { skip = localStorage.getItem(HEALTH_SKIP_KEY) != null; localStorage.removeItem(HEALTH_SKIP_KEY); } catch (_e) { /* no storage */ }
    if (newest && !skip) {
      const snap = _parse(await sink.read(newest.name));
      const then = snap ? (snap.summary || summarize(snap.stores)) : null;
      if (then && looksDamaged(then, summary)) {
        DiagnosticLog.warn('data-health', 'library looks smaller than snapshot ' + newest.name + ': ' + JSON.stringify(then) + ' -> ' + JSON.stringify(summary));
        StorageHealth.setDataMissing({ name: newest.name, at: newest.at || snapshotTime(newest.name), then, now: summary });
        return 'damaged';
      }
    }
    if (newest && dayOf(newest.at || snapshotTime(newest.name)) === dayOf(now())) return 'fresh';
    if (score(summary) === 0 && summary.history === 0) return 'empty';
    const json = JSON.stringify({
      app: 'VOTReader', exportVersion: 3, snapshot: true, exportDate: new Date(now()).toISOString(),
      summary, data: {}, media: [], stores,
    });
    if (json.length > MAX_SNAPSHOT_BYTES) return 'failed';
    return (await sink.save(json)) ? 'snapshotted' : 'failed';
  } catch (e) {
    DiagnosticLog.warn('data-health', 'snapshot pass failed: ' + ((e && /** @type {any} */ (e).name) || e));
    return 'failed';
  }
}

/** @param {string} text */
function _parse(text) {
  try { const o = JSON.parse(text); return o && typeof o === 'object' && o.stores ? o : null; } catch (_e) { return null; }
}

/** Newest wins by `ts`, de-duplicated by key + time. @param {any} a @param {any} b */
function _unionHistory(a, b) {
  const seen = new Set();
  const out = [];
  for (const e of arr(a).concat(arr(b))) {
    const k = (e && e.key) + '|' + (e && e.ts);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.sort((x, y) => (y.ts || 0) - (x.ts || 0)).slice(0, 2000);
}

/**
 * One store's restore: the live record (ours) merged with the snapshot's
 * (theirs), base-less, so a record either side has survives.
 * @param {string} name @param {any} live @param {any} snap
 */
export function mergeForRestore(name, live, snap) {
  if (live === undefined || live === null) return snap;
  if (snap === undefined || snap === null) return live;
  switch (name) {
    case 'vot-annotations': return mergeAnnotationsStore(null, live, snap);
    case 'vot-notes': return mergeMapStore(null, live, snap);
    case 'vot-links': case 'vot-bookmarks': return mergeArrayStore(null, live, snap);
    case 'vot-notebooks': case 'vot-journal': case 'vot-journal-notebooks': return mergeListStore(null, live, snap);
    case 'vot-journal-index': return mergeJournalIndexStore(null, live, snap);
    case 'vot-state': return mergeStateStore(null, live, snap, { noGuard: true });
    case 'vot-history': return _unionHistory(live, snap);
    default: {
      if (live === true || snap === true) return true;            // a flag either side set
      const empty = (v) => v == null || (Array.isArray(v) ? v.length === 0 : typeof v === 'object' && Object.keys(v).length === 0);
      return empty(live) ? snap : live;                            // the live one unless it is empty
    }
  }
}

/**
 * The banner's Restore: merge the flagged snapshot into the live data and
 * reload. Resolves false (and changes nothing) when there is nothing to restore.
 * @param {{ reload?: () => void, sink?: any }} [opts]
 * @returns {Promise<boolean>}
 */
export async function restoreMissing(opts) {
  const sink = (opts && opts.sink) || snapshotSink();
  const missing = StorageHealth.getReport().dataMissing;
  if (!sink || !missing || storesNotLoaded().length) return false;
  const snap = _parse(await sink.read(missing.name));
  if (!snap) return false;
  const live = await collectStores();
  const w = /** @type {any} */ (window);
  // The live writers would put their pre-restore state back: flush, then freeze (as an import does).
  if (typeof w.__flushPersistState === 'function') w.__flushPersistState();
  if (typeof w.__freezePersistState === 'function') w.__freezePersistState(true);
  for (const name of Object.keys(snap.stores)) {
    if (SKIP_STORES.has(name)) continue;
    const merged = mergeForRestore(name, live[name], snap.stores[name]);
    if (merged !== live[name]) await IDBAdapter.put(name, 'v', merged);
  }
  setStoreWriteFence(true);
  DiagnosticLog.warn('data-health', 'restored from ' + missing.name + ' (merge)');
  try { localStorage.setItem(HEALTH_SKIP_KEY, '1'); } catch (_e) { /* no storage */ }
  ((opts && opts.reload) || (() => window.location.reload()))();
  return true;
}

/** Clear All My Data: the snapshots go with the data they copy. */
export async function clearSnapshots() {
  const sink = snapshotSink();
  return sink ? sink.clear() : true;
}

export const DataSafety = { run, restoreMissing, clearSnapshots, summarize, score, looksDamaged, mergeForRestore, HEALTH_SKIP_KEY };

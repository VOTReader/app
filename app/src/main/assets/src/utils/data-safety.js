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
      half of a snapshot that scored at least MIN_SCORE - in total or in any one
      category - with no import, Clear All or progress reset just done
      (HEALTH_SKIP_KEY), raises StorageHealth's data-missing banner and a
      data-health diagnostic line. The banner's "Keep as is" (acceptCurrent)
      says the drop was the reader's own: today's snapshot is taken at once.
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
import { showToast } from './toast.js';

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

/** Each category's weight in the score, judged on its own too. @param {ReturnType<typeof summarize>} m */
const parts = (m) => [m.highlights, m.notes, m.links, m.bookmarks, 3 * m.journal, m.notebooks, Math.floor(m.readMarks / 10)];

/**
 * True when `now` looks like a loss against `then`: the whole score, or any one
 * category that weighed MIN_SCORE or more, fell under half. Per category so a
 * single store's loss (all 55 highlights, the rest intact) is not hidden by the
 * total, and its snapshot never becomes the newest.
 * @param {ReturnType<typeof summarize>} then @param {ReturnType<typeof summarize>} now
 */
export function looksDamaged(then, now) {
  const before = score(then);
  if (before >= MIN_SCORE && score(now) < before / 2) return true;
  const a = parts(then), b = parts(now);
  return a.some((v, i) => v >= MIN_SCORE && b[i] < v / 2);
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
 * @param {{ now?: () => number, sink?: any, force?: boolean, weeklyBridge?: any }} [opts] force: snapshot now, no comparison (acceptCurrent); weeklyBridge: a stand-in for AndroidBridge (tests)
 * @returns {Promise<'no-sink' | 'not-loaded' | 'damaged' | 'snapshotted' | 'fresh' | 'empty' | 'failed'>}
 */
export async function run(opts) {
  const now = (opts && opts.now) || Date.now;
  let skip = false;
  try { skip = localStorage.getItem(HEALTH_SKIP_KEY) != null; localStorage.removeItem(HEALTH_SKIP_KEY); } catch (_e) { /* no storage */ }
  const sink = (opts && opts.sink) || snapshotSink();
  if (!sink) return 'no-sink';
  if (storesNotLoaded().length) return 'not-loaded';
  try {
    const stores = await collectStores();
    const summary = summarize(stores);
    const list = await sink.list();
    const newest = list[0];
    if (newest && !skip && !(opts && opts.force)) {
      const snap = _parse(await sink.read(newest.name));
      const then = snap ? (snap.summary || summarize(snap.stores)) : null;
      if (then && looksDamaged(then, summary)) {
        DiagnosticLog.warn('data-health', 'library looks smaller than snapshot ' + newest.name + ': ' + JSON.stringify(then) + ' -> ' + JSON.stringify(summary));
        StorageHealth.setDataMissing({ name: newest.name, at: newest.at || snapshotTime(newest.name), then, now: summary });
        return 'damaged';
      }
    }
    // An import, a restore of the reader's choosing or a reset (skip) changed the
    // library on purpose: snapshot it now, not tomorrow.
    if (!(opts && opts.force) && !skip && newest && dayOf(newest.at || snapshotTime(newest.name)) === dayOf(now())) return 'fresh';
    if (score(summary) === 0 && summary.history === 0) return 'empty';
    const json = JSON.stringify({
      app: 'VOTReader', exportVersion: 3, snapshot: true, exportDate: new Date(now()).toISOString(),
      summary, data: {}, media: [], stores,
    });
    if (json.length > MAX_SNAPSHOT_BYTES) return 'failed';
    if (_cleared) return 'empty';                 // Clear All ran while this pass read
    const saved = await sink.save(json);
    // The weekly copy rides the same healthy pass: never from a library that looked
    // damaged or empty above, so a loss can never rotate the good copies out.
    await weeklyCopy({ now, stores, bridge: opts && opts.weeklyBridge });
    return saved ? 'snapshotted' : 'failed';
  } catch (e) {
    DiagnosticLog.warn('data-health', 'snapshot pass failed: ' + ((e && /** @type {any} */ (e).name) || e));
    return 'failed';
  }
}

/** Set by clearSnapshots: a pass already reading must not save a copy of the cleared data. */
let _cleared = false;

/**
 * The banner's "Keep as is": the smaller library is the reader's own doing.
 * Clears the finding and takes today's snapshot from it at once.
 * @param {{ sink?: any }} [opts]
 */
export async function acceptCurrent(opts) {
  StorageHealth.setDataMissing(null);
  DiagnosticLog.warn('data-health', 'reader kept the smaller library');
  return run({ sink: opts && opts.sink, force: true });
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

/** Union two lists by key, the live entry first and winning. @param {any[]} a @param {any[]} b @param {(e: any) => any} key */
function _unionBy(a, b, key) {
  const seen = new Set(a.map(key));
  return a.concat(b.filter((e) => !seen.has(key(e))));
}

/** A record's time, whatever this store calls it. @param {any} r */
const _t = (r) => (r && (r.t || r.updatedAt || r.updated || r.at || r.savedAt)) || 0;

/** Key-wise, the record with the later time wins (b on a tie). @param {any} a @param {any} b */
function _newerByTime(a, b) {
  const out = Object.assign({}, obj(a));
  for (const [k, v] of Object.entries(obj(b))) if (!(k in out) || _t(v) >= _t(out[k])) out[k] = v;
  return out;
}

/**
 * Two plain records with nothing more specific known: keys from both, numbers
 * keep the higher (counters and totals only climb), nested objects recurse
 * (wordsByDay), a map of timestamped records keeps the newer record
 * (progress), and the live side wins anything else.
 * @param {any} live @param {any} snap
 */
function _deepUnion(live, snap) {
  const out = Object.assign({}, obj(snap));
  for (const [k, v] of Object.entries(obj(live))) {
    const s = out[k];
    if (typeof v === 'number' && typeof s === 'number') out[k] = Math.max(v, s);
    else if (v && s && typeof v === 'object' && typeof s === 'object' && !Array.isArray(v) && !Array.isArray(s)) {
      const timed = Object.values(v).concat(Object.values(s)).some((x) => x && typeof x === 'object' && 't' in x);
      out[k] = timed ? _newerByTime(s, v) : _deepUnion(v, s);
    } else out[k] = v;
  }
  return out;
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
    case 'vot-reading-streak': {
      const later = String(obj(snap).lastReadDate || '') > String(obj(live).lastReadDate || '') ? snap : live;
      return Object.assign({}, snap, live, {
        currentStreak: obj(later).currentStreak, lastReadDate: obj(later).lastReadDate,
        longestStreak: Math.max(+obj(live).longestStreak || 0, +obj(snap).longestStreak || 0, +obj(live).currentStreak || 0, +obj(snap).currentStreak || 0),
        totalDays: Math.max(+obj(live).totalDays || 0, +obj(snap).totalDays || 0),
      });
    }
    case 'vot-audio-positions': return Object.assign({}, snap, live, { positions: _newerByTime(obj(snap).positions, obj(live).positions) });
    case 'vot-audio-library': return Object.assign({}, snap, live, {
      recent: _unionBy(arr(obj(live).recent), arr(obj(snap).recent), (e) => e && e.key),
      saved: _unionBy(arr(obj(live).saved), arr(obj(snap).saved), (e) => e && (e.key || e.url)),
    });
    default: {
      if (live === true || snap === true) return true;            // a flag either side set
      if (Array.isArray(live) || Array.isArray(snap)) return arr(live).length ? live : snap;
      if (typeof live === 'object' && typeof snap === 'object') return _deepUnion(live, snap);
      return live;
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
  const w = /** @type {any} */ (window);
  // The live writers would put their pre-restore state back: flush the persist
  // sink, freeze it, fence every store (not the adapter: the puts below go
  // through it), and let any save already in flight land BEFORE reading.
  if (typeof w.__flushPersistState === 'function') w.__flushPersistState();
  if (typeof w.__freezePersistState === 'function') w.__freezePersistState(true);
  setStoreWriteFence(true, { storesOnly: true });
  try {
    await Promise.all(registeredStores().map((s) => (typeof s.whenSaved === 'function' ? s.whenSaved() : true)));
    const live = await collectStores();
    for (const name of Object.keys(snap.stores)) {
      if (SKIP_STORES.has(name)) continue;
      const merged = mergeForRestore(name, live[name], snap.stores[name]);
      if (merged !== live[name]) await IDBAdapter.put(name, 'v', merged);
    }
  } catch (e) {
    // Nothing reloads: lift the fence and the freeze so this session keeps saving
    // (an edit the fence held is saved now), and say so. The finding stays up.
    setStoreWriteFence(false);
    if (typeof w.__freezePersistState === 'function') w.__freezePersistState(false);
    DiagnosticLog.warn('data-health', 'restore from ' + missing.name + ' failed: ' + ((e && /** @type {any} */ (e).name) || e));
    try {
      showToast({ id: 'vot-toast-restore', className: 'vot-toast', text: 'Could not restore just now. Your data is unchanged; try again in a moment.', durationMs: 5000 });
    } catch (_e) { /* no document */ }
    return false;
  }
  setStoreWriteFence(true);
  DiagnosticLog.warn('data-health', 'restored from ' + missing.name + ' (merge)');
  // No HEALTH_SKIP_KEY: the next boot checks the restored library like any other,
  // so a restore that missed something is offered again, never buried.
  ((opts && opts.reload) || (() => window.location.reload()))();
  return true;
}

/**
 * Your Data's "Automatic snapshots" line: where they live, how many, the newest's time.
 * @param {{ sink?: any }} [opts]
 * @returns {Promise<{ where: 'phone' | 'browser' | null, count: number, newestAt: number }>}
 */
export async function status(opts) {
  const sink = (opts && opts.sink) || snapshotSink();
  if (!sink) return { where: null, count: 0, newestAt: 0 };
  const list = await sink.list();
  return { where: sink.kind === 'android' ? 'phone' : 'browser', count: list.length, newestAt: list.length ? (list[0].at || snapshotTime(list[0].name)) : 0 };
}

/** Clear All My Data: the snapshots go with the data they copy. */
export async function clearSnapshots() {
  _cleared = true;
  const sink = snapshotSink();
  if (!sink) return true;
  const ok = (await sink.clear()) || (await sink.clear());
  if (!ok) DiagnosticLog.warn('data-health', 'Clear All could not delete the automatic snapshots');
  return ok;
}

// ─── The weekly copy in Downloads/VOTReader (dl-weekly, phone app only) ─────
// A snapshot lives in the app's files dir: it outlives a WebView storage wipe but
// not an uninstall. Once a week the same stores also go to a file the reader can
// see (DownloadsCopy.kt keeps the newest 4), which Import reads like any backup and
// which carries the data to another build of the app. On by default; the reader
// can turn it off in Your Data.

export const WEEKLY_OFF_KEY = 'vot-weekly-copy-off';
/** A copy is due 6.5 days after the last, so a daily pass at a slightly earlier hour keeps the week. */
const WEEKLY_DUE_MS = 6.5 * 86400000;

/** @param {any} [b] */
function weeklyBridge(b) {
  const w = /** @type {any} */ (typeof window !== 'undefined' ? window : {});
  const x = b || w.AndroidBridge;
  return x && typeof x.weeklyCopySave === 'function' && typeof x.weeklyCopyStatus === 'function' ? x : null;
}

/** On unless the reader turned it off. */
export function weeklyOn() {
  try { return localStorage.getItem(WEEKLY_OFF_KEY) !== '1'; } catch (_e) { return true; }
}

/** @param {boolean} on */
export function setWeeklyOn(on) {
  try { if (on) localStorage.removeItem(WEEKLY_OFF_KEY); else localStorage.setItem(WEEKLY_OFF_KEY, '1'); } catch (_e) { /* no storage */ }
}

/** `{ supported, on, count, newestAt }`; supported is false off the phone app and before Android 10. @param {{ bridge?: any }} [opts] */
export function weeklyStatus(opts) {
  const none = { supported: false, on: false, count: 0, newestAt: 0 };
  const b = weeklyBridge(opts && opts.bridge);
  if (!b) return none;
  try {
    const st = JSON.parse(String(b.weeklyCopyStatus() || '{}'));
    if (!st || !st.supported) return none;
    return { supported: true, on: weeklyOn(), count: +st.count || 0, newestAt: +st.newestAt || 0 };
  } catch (_e) { return none; }
}

/**
 * The weekly copy's file: a v2 JSON backup Import accepts (validateImportEnvelope).
 * No `media` key at all - an import of `media: {}` would prune every journal photo
 * on the phone; without one the import leaves media alone. `data` carries the
 * boot-shim keys a real export does (backup.js DEFAULT_DATA_LS_KEYS).
 * @param {Record<string, any>} stores @param {number} nowMs
 */
export function weeklyCopyJson(stores, nowMs) {
  /** @type {Record<string, string>} */ const data = {};
  try { const v = localStorage.getItem('vot-state'); if (typeof v === 'string') data['vot-state'] = v; } catch (_e) { /* no storage */ }
  return JSON.stringify({ app: 'VOTReader', exportVersion: 2, weeklyCopy: true, exportDate: new Date(nowMs).toISOString(), data, stores });
}

/**
 * Write this week's copy when one is due. Returns 'off' | 'unsupported' | 'recent' | 'written' | 'failed'.
 * @param {{ now: () => number, stores: Record<string, any>, bridge?: any }} p
 */
export async function weeklyCopy(p) {
  if (!weeklyOn()) return 'off';
  const b = weeklyBridge(p.bridge);
  const st = weeklyStatus({ bridge: b });
  if (!b || !st.supported) return 'unsupported';
  const t = p.now();
  if (st.newestAt && t - st.newestAt < WEEKLY_DUE_MS) return 'recent';
  try {
    if (b.weeklyCopySave(weeklyCopyJson(p.stores, t))) return 'written';
  } catch (_e) { /* quiet */ }
  DiagnosticLog.warn('data-health', 'weekly copy to Downloads failed');
  return 'failed';
}

export const DataSafety = { weeklyStatus, setWeeklyOn, run, restoreMissing, acceptCurrent, clearSnapshots, status, summarize, score, looksDamaged, mergeForRestore, HEALTH_SKIP_KEY };

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

   2026-10-11: the same phone's database was thrown away again (idb-adapter.js
   header: Chromium found it corrupt at open and recreated it empty). The banner
   came up and Restore ran, but the reader still lost a day and saw the app
   reset. So:

   4. A SNAPSHOT EVERY TIME THE READER LEAVES (saveLatest): once this boot's
      health pass found the library healthy, the page going hidden, pagehide,
      the browser force-closing the database, and every PERIODIC_MS while
      visible each save one, if anything changed. On the phone app it is taken
      from the stores' MEMORY (one page, so memory is the library: no wait on a
      save the kill may cut short, and it works when the database is failing);
      on the web from the database (another tab may hold what this one never
      saw), memory only when that cannot be read. It is judged like the boot
      pass: a library under half of the last one raises the finding instead.
      Never while a restore, import or Clear All has fenced the stores, nor
      after another tab deleted or upgraded the database. The daily prune keeps
      the newest of each day, so a wipe now costs nothing made before the
      reader last left the app, instead of up to a day.
   5. AUTO-RESTORE: a library that comes back with NOTHING in it (no
      highlights, notes, links, bookmarks, journal, notebooks, read marks or
      history) beside a snapshot that had something is a thrown-away
      database, not a reader's choice (Clear All and an import set the skip
      token; Android's "Clear storage" and an uninstall take the snapshots
      too). It is restored at once and the page reloads, at most once an hour
      per snapshot (a store that keeps coming back empty gets the banner, not
      a reload loop). Any smaller drop still asks. Either restore leaves a
      note, and the next boot's toast says which copy came back. An empty
      library the reader chose (the skip token, or Keep as is) IS snapshotted,
      so no later boot measures it against an older full copy and undoes it.
   6. A restore after a total wipe takes the snapshot's settings, theme and
      tabs: the live ones are the wipe's defaults (it was the reader's own
      translation, dark theme and open tabs that stayed reset on 10-11).
      Counters keep the higher value and id lists union, field by field.

   Never on the boot path: run() is called by HydrationGate after a delay, or
   at once when this boot met a freshly created database (freshDatabase()).
   ═══════════════════════════════════════════════════════════════════════ */

import { IDBAdapter } from '../stores/idb-adapter.js';
import { storesNotLoaded, registeredStores, setStoreWriteFence, isStoreWriteFenced } from '../stores/cached-store.js';
import {
  mergeAnnotationsStore, mergeMapStore, mergeArrayStore, mergeListStore, mergeJournalIndexStore, mergeStateStore,
} from '../stores/store-merge.js';
import { DiagnosticLog } from './diagnostic-log.js';
import { StorageHealth } from './storage-health.js';
import { snapshotSink, snapshotTime } from './snapshot-sink.js';
import { showToast } from './toast.js';
import { announceLibraryChange, heldByOtherTab } from './other-tabs.js';
import { withBackupLockIfFree } from './backup-lock.js';

/** Set (localStorage) by an import or Clear All just before its reload: the next boot's
 *  smaller library is the reader's own doing, so it is not compared. In LS_SKIP_LIST. */
export const HEALTH_SKIP_KEY = 'vot-health-skip';
/** A snapshot scoring under this is too small to judge a drop against. */
export const MIN_SCORE = 5;
/** Never snapshot a manifest bigger than this (SnapshotStore refuses 24 MB). */
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
/** Stores never snapshotted: song bytes (gigabytes; they come back from the song sites). */
const SKIP_STORES = new Set(['offline-songs']);
/** localStorage {name, at} of the last auto-restore: once an hour per snapshot (5). In LS_SKIP_LIST. */
export const AUTO_RESTORE_KEY = 'vot-auto-restore';
const AUTO_RESTORE_WINDOW_MS = 3600000;
/** localStorage {at, auto}: a restore just ran; the next boot's toast says from when. In LS_SKIP_LIST. */
export const RESTORED_NOTE_KEY = 'vot-restored-note';
/** A snapshot while the reader is in the app, if anything changed (4). */
const PERIODIC_MS = 10 * 60000;
/** Two hidden events this close are one leave (an unchanged library is never saved twice anyway). */
const HIDDEN_GAP_MS = 2000;
/** The vot-state fields that describe the reader's setup, not their library (6). */
const SESSION_FIELDS = ['settings', 'theme', 'tabs', 'activeTabIdx', 'activeReadKey'];

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

/**
 * Every registered store's record as the page holds it now (4): what the reader
 * sees, a save still in flight included, and readable when the database is not.
 * Null when any store has not loaded its real data (its memory is defaults).
 * @returns {Record<string, any> | null}
 */
function collectMemory() {
  /** @type {Record<string, any>} */ const out = {};
  for (const store of registeredStores()) {
    const name = store._idbStoreName;
    if (!name || SKIP_STORES.has(name)) continue;
    if (typeof store.getState === 'function' && store.getState() !== 'loaded') return null;
    const v = typeof store._load === 'function' ? store._load() : undefined;
    if (v !== undefined && v !== null) out[name] = v;
  }
  return out;
}

/** Nothing at all in it: the shape of a database the browser threw away (5). @param {ReturnType<typeof summarize>} m */
function isWiped(m) {
  return score(m) === 0 && m.readMarks === 0 && m.history === 0;
}

/** True when this boot's open had to create the database: run the pass at once (HydrationGate). */
export function freshDatabase() {
  try { const info = IDBAdapter.openInfo && IDBAdapter.openInfo(); return !!info && info.oldVersion === 0; } catch (_e) { return false; }
}

/** A local calendar day key. @param {number} ms */
const dayOf = (ms) => new Date(ms).toDateString();

/** The snapshot manifest. @param {Record<string, any>} stores @param {ReturnType<typeof summarize>} summary @param {number} ms */
function snapshotJson(stores, summary, ms) {
  return JSON.stringify({ app: 'VOTReader', exportVersion: 3, snapshot: true, exportDate: new Date(ms).toISOString(), summary, data: {}, media: [], stores });
}

/** What the database told this boot, for the data-health line. */
function _openNote() {
  const info = IDBAdapter.openInfo && IDBAdapter.openInfo();
  if (!info) return '';
  const lost = !!info.dataLoss && info.dataLoss !== 'none';
  if (info.oldVersion !== 0 && !lost) return '';            // an ordinary schema upgrade (v12 -> v13)
  return '; database ' + (info.oldVersion === 0 ? 'created this boot' : 'reset by the browser this boot') +
    (lost ? ', dataLoss ' + info.dataLoss + (info.dataLossMessage ? ' (' + info.dataLossMessage + ')' : '') : '');
}

/** May this boot restore `name` on its own? Once an hour per snapshot (5). @param {string} name @param {number} ms */
function _mayAutoRestore(name, ms) {
  try {
    const last = JSON.parse(localStorage.getItem(AUTO_RESTORE_KEY) || 'null');
    if (last && last.name === name && ms - (+last.at || 0) < AUTO_RESTORE_WINDOW_MS) return false;
    localStorage.setItem(AUTO_RESTORE_KEY, JSON.stringify({ name, at: ms }));
    return true;
  } catch (_e) { return false; }                 // no storage, no guard: never restore on our own
}

/** The toast after a restore's reload: which copy came back. Shown once. */
function _showRestoredNote() {
  /** @type {any} */ let note = null;
  try {
    const raw = localStorage.getItem(RESTORED_NOTE_KEY);
    if (!raw) return;
    localStorage.removeItem(RESTORED_NOTE_KEY);
    note = JSON.parse(raw);
  } catch (_e) { return; }
  let when = 'earlier';
  try { if (note && note.at) when = new Date(note.at).toLocaleString(undefined, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (_e) { /* keep 'earlier' */ }
  try {
    showToast({ id: 'vot-toast-restored', className: 'vot-toast', text: 'Your library was restored from the copy saved ' + when + '.', durationMs: 6000 });
  } catch (_e) { /* no document */ }
}

/**
 * The boot-time pass: check health, then take today's snapshot. Quiet on every
 * failure. Resolves to what it did, for tests and the diagnostic log.
 * @param {{ now?: () => number, sink?: any, force?: boolean, weeklyBridge?: any, reload?: () => void }} [opts] force: snapshot now, no comparison (acceptCurrent); weeklyBridge: a stand-in for AndroidBridge (tests); reload: the auto-restore's reload (tests)
 * @returns {Promise<'no-sink' | 'not-loaded' | 'damaged' | 'restored' | 'snapshotted' | 'fresh' | 'empty' | 'failed'>}
 */
export async function run(opts) {
  const now = (opts && opts.now) || Date.now;
  _showRestoredNote();
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
        DiagnosticLog.warn('data-health', 'library looks smaller than snapshot ' + newest.name + ': ' + JSON.stringify(then) + ' -> ' + JSON.stringify(summary) + _openNote());
        StorageHealth.setDataMissing({ name: newest.name, at: newest.at || snapshotTime(newest.name), then, now: summary });
        // (5) Nothing at all left: the database was thrown away. Put it back now.
        if (isWiped(summary) && _mayAutoRestore(newest.name, now())) {
          if (await restoreMissing({ sink, reload: opts && opts.reload, auto: true })) return 'restored';
        }
        return 'damaged';
      }
    }
    // An import, a restore of the reader's choosing or a reset (skip) changed the
    // library on purpose: snapshot it now, not tomorrow.
    if (!(opts && opts.force) && !skip && newest && dayOf(newest.at || snapshotTime(newest.name)) === dayOf(now())) {
      _arm(sink, summary, '');
      return 'fresh';
    }
    if (score(summary) === 0 && summary.history === 0) {
      // Emptied on purpose (a reset, Clear All, Keep as is): record it, or the boot after
      // next would compare it with an older full snapshot and restore over the choice (5).
      if ((skip || (opts && opts.force)) && newest && !_cleared && await sink.save(snapshotJson(stores, summary, now()))) {
        _arm(sink, summary, _memoryJson());
        return 'snapshotted';
      }
      _arm(sink, summary, '');
      return 'empty';
    }
    const json = snapshotJson(stores, summary, now());
    if (json.length > MAX_SNAPSHOT_BYTES) return 'failed';
    if (_cleared) return 'empty';                 // Clear All ran while this pass read
    const saved = await sink.save(json);
    // The weekly copy rides the same healthy pass: never from a library that looked
    // damaged or empty above, so a loss can never rotate the good copies out. Nor
    // after a Clear All that landed while the snapshot saved (vs3).
    if (!_cleared) await weeklyCopy({ now, stores, bridge: opts && opts.weeklyBridge });
    if (!saved) return 'failed';
    _arm(sink, summary, _memoryJson());
    return 'snapshotted';
  } catch (e) {
    DiagnosticLog.warn('data-health', 'snapshot pass failed: ' + ((e && /** @type {any} */ (e).name) || e));
    return 'failed';
  }
}

/** Set by clearSnapshots: a pass already reading must not save a copy of the cleared data. */
let _cleared = false;

// ─── (4) A snapshot every time the reader leaves the app ─────────────────────

/** This boot's health pass found the library healthy; saveLatest may run. */
let _healthy = false;
/** The summary of the last snapshot this page took or judged healthy: the bar saveLatest holds to. */
let _lastSummary = /** @type {ReturnType<typeof summarize> | null} */ (null);
/** The stores JSON of the last snapshot this page saved, to skip saving the same thing twice. */
let _lastStoresJson = '';
let _lastHiddenSaveAt = 0;
/** @type {any} */ let _autoSink = null;
/** @type {Promise<string> | null} */ let _saving = null;
/** A leave came while a save was in flight: save once more when it lands. */
let _again = false;
/** The browser force-closed the database: only memory is left to read. */
let _dbClosed = false;
/** @type {(() => void) | null} */ let _disarm = null;

/** The stores in memory as JSON ('' when one has not loaded). */
function _memoryJson() {
  const m = collectMemory();
  return m ? JSON.stringify(m) : '';
}

/**
 * The library is healthy: let saveLatest run, against `summary`, and hook the
 * moments the reader leaves (once per page).
 * @param {any} sink @param {ReturnType<typeof summarize>} summary @param {string} savedJson
 */
function _arm(sink, summary, savedJson) {
  _healthy = true;
  _lastSummary = summary;
  _lastStoresJson = savedJson;
  _autoSink = sink;
  if (_disarm || typeof document === 'undefined') return;
  const hidden = () => {
    if (document.visibilityState !== 'hidden' || Date.now() - _lastHiddenSaveAt < HIDDEN_GAP_MS) return;
    _lastHiddenSaveAt = Date.now();
    saveLatest({ sink: _autoSink });
  };
  const pagehide = () => { saveLatest({ sink: _autoSink }); };
  const timer = setInterval(() => { if (document.visibilityState === 'visible') saveLatest({ sink: _autoSink }); }, PERIODIC_MS);
  const offClose = typeof IDBAdapter.onBrowserClose === 'function' ? IDBAdapter.onBrowserClose(() => { _dbClosed = true; saveLatest({ sink: _autoSink }); }) : null;
  // Another tab deleted (Clear All) or upgraded the database: this page's memory is
  // no longer the library, so it saves nothing more until it reloads.
  const offVersion = typeof IDBAdapter.onVersionChange === 'function' ? IDBAdapter.onVersionChange(() => { _healthy = false; }) : null;
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', pagehide);
  _disarm = () => {
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', pagehide);
    clearInterval(timer);
    if (offClose) offClose();
    if (offVersion) offVersion();
  };
}

/**
 * The library to snapshot on a leave. The phone app has one page, so its memory is
 * the library and is read at once (no wait on a save the kill may cut short). On the
 * web a second tab may have saved what this tab's memory never saw, so the database
 * is read, once this tab's own saves have landed; memory only when it cannot be read.
 * @param {any} sink
 * @returns {Promise<Record<string, any> | null>}
 */
async function _collectForLeave(sink) {
  if ((sink && sink.kind === 'android') || _dbClosed) return collectMemory();
  try {
    await Promise.all(registeredStores().map((s) => (typeof s.whenSaved === 'function' ? s.whenSaved() : true)));
    return await collectStores();
  } catch (_e) { return collectMemory(); }
}

/**
 * Snapshot the library as the page holds it, if this boot found it healthy and
 * it changed since the last one (header, 4). Quiet on every failure.
 * @param {{ sink?: any, now?: () => number }} [opts]
 * @returns {Promise<'off' | 'no-sink' | 'not-loaded' | 'empty' | 'damaged' | 'unchanged' | 'snapshotted' | 'failed'>}
 */
export async function saveLatest(opts) {
  if (_saving) { _again = true; return /** @type {any} */ (_saving); }
  const p = _saveLatest(opts);
  _saving = p;
  try { return /** @type {any} */ (await p); } finally {
    if (_saving === p) _saving = null;
    if (_again) { _again = false; saveLatest(opts); }
  }
}

/** @param {{ sink?: any, now?: () => number }} [opts] */
async function _saveLatest(opts) {
  const now = (opts && opts.now) || Date.now;
  if (!_healthy || _cleared || isStoreWriteFenced() || StorageHealth.getReport().dataMissing) return 'off';
  const sink = (opts && opts.sink) || _autoSink || snapshotSink();
  if (!sink) return 'no-sink';
  try {
    if (storesNotLoaded().length) return 'not-loaded';
    const stores = await _collectForLeave(sink);
    if (!stores) return 'not-loaded';
    if (!_healthy || _cleared || isStoreWriteFenced()) return 'off';     // changed while it read
    const summary = summarize(stores);
    let chosen = false;                            // a reset the reader asked for (skip token)
    try { chosen = localStorage.getItem(HEALTH_SKIP_KEY) != null; } catch (_e) { /* no storage */ }
    if (score(summary) === 0 && summary.history === 0 && !chosen) return 'empty';
    if (!chosen && _lastSummary && looksDamaged(_lastSummary, summary)) {
      _healthy = false;
      const newest = (await sink.list())[0];
      DiagnosticLog.warn('data-health', 'library in memory looks smaller than the last snapshot: ' + JSON.stringify(_lastSummary) + ' -> ' + JSON.stringify(summary));
      if (newest) StorageHealth.setDataMissing({ name: newest.name, at: newest.at || snapshotTime(newest.name), then: _lastSummary, now: summary });
      return 'damaged';
    }
    const storesJson = JSON.stringify(stores);
    if (storesJson === _lastStoresJson) return 'unchanged';
    const json = snapshotJson(stores, summary, now());
    if (json.length > MAX_SNAPSHOT_BYTES) return 'failed';
    if (_cleared || isStoreWriteFenced()) return 'off';
    if (!(await sink.save(json))) return 'failed';
    _lastStoresJson = storesJson;
    _lastSummary = summary;
    return 'snapshotted';
  } catch (e) {
    DiagnosticLog.warn('data-health', 'leave snapshot failed: ' + ((e && /** @type {any} */ (e).name) || e));
    return 'failed';
  }
}

/** TEST-ONLY: forget this page's state (a new boot). */
export function _resetForTests() {
  if (_disarm) _disarm();
  _disarm = null;
  _healthy = false;
  _lastSummary = null;
  _lastStoresJson = '';
  _lastHiddenSaveAt = 0;
  _autoSink = null;
  _saving = null;
  _again = false;
  _dbClosed = false;
  _cleared = false;
}

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

/** Union two lists by key, the live entry first and winning. An entry with no key is
 *  kept unless the live list holds the same one (one keyless entry must not stand for
 *  them all). @param {any[]} a @param {any[]} b @param {(e: any) => any} key */
function _unionBy(a, b, key) {
  const seen = new Set(a.map(key).filter((k) => k != null));
  const same = new Set(a.map((e) => JSON.stringify(e)));
  return a.concat(b.filter((e) => { const k = key(e); return k != null ? !seen.has(k) : !same.has(JSON.stringify(e)); }));
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
    } else if (Array.isArray(v) && Array.isArray(s)) {
      // A list of ids (milestones unlocked) unions; any other list (samples) is never
      // emptied by a wiped live side (6).
      out[k] = v.concat(s).every((x) => typeof x === 'string') ? Array.from(new Set(v.concat(s))) : (v.length ? v : s);
    } else out[k] = v;
  }
  return out;
}

/** Whole days from local date `a` to `b` ('YYYY-MM-DD'). @param {string} a @param {string} b */
function _daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
}

/**
 * The streak after a restore. The later reading day decides the run; when a wipe
 * cut a run the reader kept up (the live run began the day after the snapshot's
 * last day), the two runs join, and a wipe's fresh day count adds to the old one.
 * @param {any} live @param {any} snap @param {boolean} wiped
 */
function _mergeStreak(live, snap, wiped) {
  const L = obj(live), S = obj(snap);
  const ld = String(L.lastReadDate || ''), sd = String(S.lastReadDate || '');
  const lc = +L.currentStreak || 0, sc = +S.currentStreak || 0;
  let currentStreak = lc, lastReadDate = L.lastReadDate;
  if (!ld || sd > ld) { currentStreak = sc; lastReadDate = S.lastReadDate; }
  else if (sd === ld) currentStreak = Math.max(lc, sc);
  else if (sd && lc >= 1 && _daysBetween(sd, ld) - (lc - 1) === 1) currentStreak = sc + lc;
  const totalDays = wiped && sd && ld > sd ? (+S.totalDays || 0) + (+L.totalDays || 0) : Math.max(+L.totalDays || 0, +S.totalDays || 0);
  return Object.assign({}, S, L, {
    currentStreak, lastReadDate,
    longestStreak: Math.max(+L.longestStreak || 0, +S.longestStreak || 0, currentStreak),
    totalDays,
  });
}

/**
 * One store's restore: the live record (ours) merged with the snapshot's
 * (theirs), base-less, so a record either side has survives. `wiped`: the live
 * library came back with nothing in it, so its setup is the wipe's defaults and
 * the snapshot's setup wins (header, 6).
 * @param {string} name @param {any} live @param {any} snap @param {{ wiped?: boolean }} [opts]
 */
export function mergeForRestore(name, live, snap, opts) {
  if (live === undefined || live === null) return snap;
  if (snap === undefined || snap === null) return live;
  const wiped = !!(opts && opts.wiped);
  switch (name) {
    case 'vot-annotations': return mergeAnnotationsStore(null, live, snap);
    case 'vot-notes': return mergeMapStore(null, live, snap);
    case 'vot-links': case 'vot-bookmarks': return mergeArrayStore(null, live, snap);
    case 'vot-notebooks': case 'vot-journal': case 'vot-journal-notebooks': return mergeListStore(null, live, snap);
    case 'vot-journal-index': return mergeJournalIndexStore(null, live, snap);
    case 'vot-state': {
      const st = mergeStateStore(null, live, snap, { noGuard: true });
      if (wiped) for (const f of SESSION_FIELDS) if (f in obj(snap)) st[f] = snap[f];
      return st;
    }
    case 'vot-history': return _unionHistory(live, snap);
    case 'vot-reading-streak': return _mergeStreak(live, snap, wiped);
    case 'vot-audio-positions': return Object.assign({}, snap, live, { positions: _newerByTime(obj(snap).positions, obj(live).positions) });
    case 'vot-audio-library': {
      const L = obj(live), S = obj(snap);
      const out = Object.assign({}, S, L, {
        recent: _unionBy(arr(L.recent), arr(S.recent), (e) => e && e.key),
        saved: _unionBy(arr(L.saved), arr(S.saved), (e) => e && (e.key || e.url)),
      });
      for (const k of ['songSaved', 'songRecent']) if (Array.isArray(L[k]) || Array.isArray(S[k])) out[k] = _unionBy(arr(L[k]), arr(S[k]), (e) => e && (e.key || e.id || e.url));
      for (const k of ['plays', 'completions']) if (typeof L[k] === 'number' || typeof S[k] === 'number') out[k] = Math.max(+L[k] || 0, +S[k] || 0);
      if (wiped && 'rate' in S) out.rate = S.rate;            // the reader's speed, not the default
      return out;
    }
    default: {
      if (live === true || snap === true) return true;            // a flag either side set
      if (Array.isArray(live) || Array.isArray(snap)) return arr(live).length ? live : snap;
      if (typeof live === 'object' && typeof snap === 'object') return _deepUnion(live, snap);
      return live;
    }
  }
}

/**
 * A store's boot-script copy in localStorage (vot-state's theme and font, which the
 * first paint reads before the database loads), from what a restore just wrote, so
 * the reload does not open in the wipe's light theme.
 * @param {string} name @param {any} value
 */
function _syncShim(name, value) {
  for (const s of registeredStores()) {
    if (s._idbStoreName !== name || typeof s._idbLsShim !== 'function') continue;
    try { localStorage.setItem(name, JSON.stringify(s._idbLsShim(value))); } catch (_e) { /* the first paint uses the old theme once */ }
  }
}

/**
 * The banner's Restore, and the boot's own after a total wipe (`auto`): merge
 * the flagged snapshot into the live data and reload. Resolves false (and
 * changes nothing) when there is nothing to restore.
 * @param {{ reload?: () => void, sink?: any, auto?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export async function restoreMissing(opts) {
  const sink = (opts && opts.sink) || snapshotSink();
  const missing = StorageHealth.getReport().dataMissing;
  if (!sink || !missing || storesNotLoaded().length) return false;
  // W8: another tab changed the library under this one: this tab's writes would not land.
  if (heldByOtherTab()) return false;
  const snap = _parse(await sink.read(missing.name));
  if (!snap) return false;
  // W8 refuter round 2: an Import or Clear All in another tab holds the backup Web Lock while it
  // writes the library; a Restore holds it too, so two tabs never write the library at once (a
  // Restore's merge read the library before the import and would land over it). Another backup
  // operation running: nothing happens, the finding stays up and Restore can be tapped again.
  let restored = false;
  const ran = await withBackupLockIfFree(async () => {
    if (heldByOtherTab()) return;                // that operation finished just before the lock came free
    restored = await _restoreLocked(sink, missing, snap, opts);
  });
  if (!ran && !(opts && opts.auto)) {
    try {
      showToast({ id: 'vot-toast-restore', className: 'vot-toast', text: 'Another backup operation is running in a different tab. Try again when it has finished.', durationMs: 5000 });
    } catch (_e) { /* no document */ }
  }
  return restored;
}

/**
 * restoreMissing's writes, under the backup lock.
 * @param {any} sink @param {any} missing @param {any} snap
 * @param {{ reload?: () => void, auto?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function _restoreLocked(sink, missing, snap, opts) {
  const w = /** @type {any} */ (window);
  // The live writers would put their pre-restore state back: flush the persist
  // sink, freeze it, fence every store (not the adapter: the puts below go
  // through it), and let any save already in flight land BEFORE reading.
  if (typeof w.__flushPersistState === 'function') w.__flushPersistState();
  if (typeof w.__freezePersistState === 'function') w.__freezePersistState(true);
  setStoreWriteFence(true, { storesOnly: true });
  // W8: the other open tabs hold their saves from here (their old copy would land on the restore).
  announceLibraryChange('changing');
  let wrote = false;
  try {
    await Promise.all(registeredStores().map((s) => (typeof s.whenSaved === 'function' ? s.whenSaved() : true)));
    const live = await collectStores();
    const wiped = isWiped(summarize(live));
    for (const name of Object.keys(snap.stores)) {
      if (SKIP_STORES.has(name)) continue;
      const merged = mergeForRestore(name, live[name], snap.stores[name], { wiped });
      if (merged !== live[name]) { await IDBAdapter.put(name, 'v', merged); wrote = true; _syncShim(name, merged); }
    }
  } catch (e) {
    // Nothing reloads: lift the fence and the freeze so this session keeps saving
    // (an edit the fence held is saved now), and say so. The finding stays up.
    // The other tabs save again too, unless part of the restore landed.
    announceLibraryChange(wrote ? 'changed' : 'unchanged');
    setStoreWriteFence(false);
    if (typeof w.__freezePersistState === 'function') w.__freezePersistState(false);
    DiagnosticLog.warn('data-health', 'restore from ' + missing.name + ' failed: ' + ((e && /** @type {any} */ (e).name) || e));
    try {
      showToast({ id: 'vot-toast-restore', className: 'vot-toast', text: 'Could not restore just now. Your data is unchanged; try again in a moment.', durationMs: 5000 });
    } catch (_e) { /* no document */ }
    return false;
  }
  setStoreWriteFence(true);
  announceLibraryChange('changed');              // W8: the other tabs ask for a reload too
  _healthy = false;                              // nothing more from this page: it reloads
  DiagnosticLog.warn('data-health', 'restored from ' + missing.name + ' (merge' + (opts && opts.auto ? ', on its own after a total wipe' : '') + ')');
  try { localStorage.setItem(RESTORED_NOTE_KEY, JSON.stringify({ at: missing.at || snapshotTime(missing.name), auto: !!(opts && opts.auto) })); } catch (_e) { /* no note, no toast */ }
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
 * Clear All My Data (vs3): the weekly copies in Downloads hold the same journal, notes and
 * highlights, and outlive an uninstall, so they go too. True when none is left (and off the
 * phone app, where there are none). @param {{ bridge?: any }} [opts]
 */
export function clearWeeklyCopies(opts) {
  _cleared = true;
  const b = weeklyBridge(opts && opts.bridge);
  if (!b || typeof b.weeklyCopyClear !== 'function') return true;
  try { if (b.weeklyCopyClear()) return true; } catch (_e) { /* logged below */ }
  DiagnosticLog.warn('data-health', 'Clear All could not delete the weekly copies in Downloads');
  return false;
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

export const DataSafety = { weeklyStatus, setWeeklyOn, clearWeeklyCopies, run, saveLatest, freshDatabase, restoreMissing, acceptCurrent, clearSnapshots, status, summarize, score, looksDamaged, mergeForRestore, HEALTH_SKIP_KEY, _resetForTests };

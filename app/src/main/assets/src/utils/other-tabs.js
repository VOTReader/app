/* ═══════════════════════════════════════════════════════════════
   OTHER TABS — another tab's Clear All, Import or Restore is the library now (W8)
   ═══════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b: HydrationGate starts the watch; Clear All and
   Import (utils/backup-flow.js, bundle-d) reach announceLibraryChange through the
   window global _entry-b.js publishes; data-safety's Restore imports it.

   The bug (sweep 2026-10-13, W8). Tab A clears everything (deletes 'votreader') or
   imports a backup (writes into it). Tab B, still open on the old library, saved its
   history, reading stats, streak or audio positions next: a whole-value put that
   recreated the deleted database, or wrote the old copy over the import.

   Two signals reach tab B:
   - IndexedDB's versionchange (idb-adapter.js onVersionChange): another connection
     deleted the database, or a newer build is upgrading it. Every build sends it, so
     an old build's Clear All in another tab is caught too.
   - A message on the 'votreader-library' BroadcastChannel, for what versionchange
     cannot see (an Import or Restore writes into the database it keeps): 'changing'
     before the first write, then 'changed', or 'unchanged' when the operation stopped
     before writing anything.
   Told either, tab B raises the remote write fence (stores/cached-store.js): no save
   reaches the database, so nothing old lands on the new library, and StorageHealth's
   banner asks for a reload. Every announcement names its operation (one page can start
   two); once every operation that said 'changing' said 'unchanged', the fence comes down
   and every save it held runs. 'changed' is final for the page. A
   database a newer build upgraded gets the "newer version" banner instead (v04-03),
   with the same hold.

   This page's own operation announces 'changing' first, so the versionchange its own
   Clear All sends this page is not another tab's, and a second tab that merely TRIES an
   import meanwhile (the backup lock refuses it) does not hold the page that is writing:
   a hold asked for during this page's operation starts when it ends. A page already held
   refuses its own Import and Restore (heldByOtherTab): their writes would not land. A
   message carrying this page's id is never another tab's, even from a second copy of
   this module bundled elsewhere (BroadcastChannel delivers to every OTHER channel
   object, same page or not).
═══════════════════════════════════════════════════════════════ */

import { IDBAdapter } from '../stores/idb-adapter.js';
import { setRemoteWriteFence } from '../stores/cached-store.js';
import { StorageHealth } from './storage-health.js';
import { DiagnosticLog } from './diagnostic-log.js';

const CHANNEL = 'votreader-library';

/** This page's id, shared by every copy of this module in it. */
function _pageId() {
  const g = /** @type {any} */ (globalThis);
  if (!g.__votLibraryPageId) g.__votLibraryPageId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  return /** @type {string} */ (g.__votLibraryPageId);
}

/** @type {BroadcastChannel | null} */
let _channel = null;
/** @returns {BroadcastChannel | null} */
function _getChannel() {
  if (_channel) return _channel;
  try { if (typeof BroadcastChannel === 'function') _channel = new BroadcastChannel(CHANNEL); } catch (_e) { _channel = null; }
  return _channel;
}

/** Operations other tabs said were 'changing' and have not ended, as 'pageId|opId'. @type {Set<string>} */
const _changing = new Set();
/** Another tab changed the library or deleted the database: final for this page. */
let _changed = false;
/** A newer build upgraded the database: this build can never write it again. */
let _newer = false;
/** This page's own running operations (Clear All, Import, Restore), by the id 'changing' returned.
 *  One page can start two: its Restore holds the backup lock and writes while an Import tapped
 *  there meanwhile is refused (W8 refuter round 3). @type {Set<string>} */
const _ownOps = new Set();
let _opSeq = 0;
/** What the banner shows now. @type {'changing' | 'changed' | null} */
let _held = null;
/** @type {(() => void) | null} */
let _stop = null;

/**
 * Tell the other open tabs what this one is doing to the library. Never throws.
 * 'changing' starts one of this page's operations and returns its id; 'changed' or 'unchanged'
 * ends the operation that id names (every one of them when none is given).
 * @param {'changing' | 'changed' | 'unchanged'} kind
 * @param {string} [op]
 * @returns {string | undefined}
 */
export function announceLibraryChange(kind, op) {
  let id = op;
  if (kind === 'changing') { id = _pageId() + '#' + (++_opSeq); _ownOps.add(id); }
  else if (id) _ownOps.delete(id);
  else _ownOps.clear();
  const ch = _getChannel();
  if (ch) { try { ch.postMessage({ kind: kind, from: _pageId(), op: id }); } catch (_e) { /* best-effort: their versionchange still covers a Clear All */ } }
  if (!_ownOps.size) _sync();   // a hold another tab asked for while this page's operations ran starts now
  return kind === 'changing' ? id : undefined;
}

/**
 * Is another tab changing the library, or has one changed it, under this page? Then this page's
 * writes are held, and its own Import or Restore would land nothing (backup-flow, data-safety).
 * @returns {boolean}
 */
export function heldByOtherTab() { return _changed || _changing.size > 0; }

/** Bring the hold, the fence and the banner in line with what the other tabs said. */
function _sync() {
  const want = _changed ? 'changed' : (_changing.size ? 'changing' : null);
  // This page's own operation is writing: a hold another tab asks for meanwhile starts when it
  // ends (an import that tab tries is refused by the backup lock); one already up stays up.
  if (!(_ownOps.size && _held === null) && want !== _held) {
    _held = want;
    try { StorageHealth.setLibraryElsewhere(want); } catch (_e) { /* the fence is what matters */ }
    try {
      DiagnosticLog.warn('data-health', want === null ? 'another tab stopped before changing the library; this tab saves again'
        : 'another tab ' + (want === 'changing' ? 'is changing' : 'changed') + ' the library (Clear All, Import or Restore); this tab saves nothing until it reloads');
    } catch (_e) { /* logging never breaks the hold */ }
  }
  setRemoteWriteFence(_newer || _held !== null);
}

/** @param {any} data */
function _onMessage(data) {
  if (!data || typeof data !== 'object' || typeof data.from !== 'string' || data.from === _pageId()) return;
  const key = data.from + '|' + (typeof data.op === 'string' ? data.op : '');
  /** End the operation named, or every one of that page's when none is named. */
  const end = () => {
    if (typeof data.op === 'string') { _changing.delete(key); return; }
    for (const k of Array.from(_changing)) if (k.indexOf(data.from + '|') === 0) _changing.delete(k);
  };
  if (data.kind === 'changing') _changing.add(key);
  else if (data.kind === 'changed') { end(); _changed = true; }
  else if (data.kind === 'unchanged') end();
  else return;
  _sync();
}

/** @param {{ newVersion?: number | null }} ev */
function _onVersionChange(ev) {
  const next = ev && typeof ev.newVersion === 'number' ? ev.newVersion : null;
  if (next !== null && next > IDBAdapter.DB_VERSION) {
    _newer = true;
    try { StorageHealth.setVersionTooNew(true); } catch (_e) { /* the fence is what matters */ }
    try { DiagnosticLog.warn('data-health', 'a newer VOTReader (v' + next + ') upgraded the database in another tab; this tab saves nothing'); } catch (_e) { /* logging only */ }
    _sync();
    return;
  }
  // This page's own Clear All deleted it (it announced 'changing' first): its reload follows.
  if (_ownOps.size) return;
  _changed = true;
  _sync();
}

/**
 * Start watching for the other tabs (HydrationGate, once, before the stores load).
 * Idempotent. Returns the stop.
 * @returns {() => void}
 */
export function watchOtherTabs() {
  if (_stop) return _stop;
  const offVersion = typeof IDBAdapter.onVersionChange === 'function' ? IDBAdapter.onVersionChange(_onVersionChange) : null;
  const ch = _getChannel();
  /** @param {MessageEvent} e */
  const onMessage = (e) => _onMessage(e && e.data);
  if (ch) ch.addEventListener('message', onMessage);
  _stop = () => {
    if (offVersion) offVersion();
    if (ch) ch.removeEventListener('message', onMessage);
    _stop = null;
  };
  return _stop;
}

/** TEST-ONLY: stop the watch, close the channel, lift the hold. */
export function _resetOtherTabsForTests() {
  if (_stop) _stop();
  if (_channel) { try { _channel.close(); } catch (_e) { /* already closed */ } }
  _channel = null;
  _changing.clear();
  _changed = false;
  _newer = false;
  _ownOps.clear();
  _held = null;
  setRemoteWriteFence(false);
}

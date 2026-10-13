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
   banner asks for a reload. 'unchanged' after 'changing' lowers it again, and every
   save it held runs then. 'changed' is final for the page. A database a newer build
   upgraded gets the "newer version" banner instead (v04-03), with the same hold.

   This page's own Clear All raises its own fence before it deletes, so the versionchange
   its delete sends this page is not another tab's. And a message carrying this page's id
   is never another tab's either, even from a second copy of this module bundled
   elsewhere (BroadcastChannel delivers to every OTHER channel object, same page or not).
═══════════════════════════════════════════════════════════════ */

import { IDBAdapter } from '../stores/idb-adapter.js';
import { setRemoteWriteFence, isStoreWriteFenced } from '../stores/cached-store.js';
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

/** What another tab did to the library, as far as this page knows. @type {'changing' | 'changed' | null} */
let _state = null;
/** @type {(() => void) | null} */
let _stop = null;

/**
 * Tell the other open tabs what this one is doing to the library. Never throws.
 * @param {'changing' | 'changed' | 'unchanged'} kind
 */
export function announceLibraryChange(kind) {
  const ch = _getChannel();
  if (!ch) return;
  try { ch.postMessage({ kind: kind, from: _pageId() }); } catch (_e) { /* best-effort: their versionchange still covers a Clear All */ }
}

/** @param {'changing' | 'changed'} state @param {string} why */
function _hold(state, why) {
  if (_state === state) return;
  _state = state;
  setRemoteWriteFence(true);
  try { StorageHealth.setLibraryElsewhere(state); } catch (_e) { /* the hold is what matters */ }
  try { DiagnosticLog.warn('data-health', 'another tab ' + why + '; this tab saves nothing until it reloads'); } catch (_e) { /* logging never breaks the hold */ }
}

function _release() {
  _state = null;
  setRemoteWriteFence(false);
  try { StorageHealth.setLibraryElsewhere(null); } catch (_e) { /* the saves are back either way */ }
  try { DiagnosticLog.warn('data-health', 'another tab stopped before changing the library; this tab saves again'); } catch (_e) { /* logging only */ }
}

/** @param {any} data */
function _onMessage(data) {
  if (!data || typeof data !== 'object' || data.from === _pageId()) return;
  if (data.kind === 'changing') { if (_state !== 'changed') _hold('changing', 'is changing the library (Clear All, Import or Restore)'); }
  else if (data.kind === 'changed') _hold('changed', 'changed the library (Clear All, Import or Restore)');
  else if (data.kind === 'unchanged' && _state === 'changing') _release();
}

/** @param {{ newVersion?: number | null }} ev */
function _onVersionChange(ev) {
  const next = ev && typeof ev.newVersion === 'number' ? ev.newVersion : null;
  if (next !== null && next > IDBAdapter.DB_VERSION) {
    // A newer build is upgrading the database: this build can never write it again.
    setRemoteWriteFence(true);
    try { StorageHealth.setVersionTooNew(true); } catch (_e) { /* the hold is what matters */ }
    try { DiagnosticLog.warn('data-health', 'a newer VOTReader (v' + next + ') upgraded the database in another tab; this tab saves nothing'); } catch (_e) { /* logging only */ }
    return;
  }
  // This page's own Clear All raised its fence before deleting: its reload follows.
  if (_state === null && isStoreWriteFenced()) return;
  _hold('changed', 'deleted the database (Clear All)');
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
  _state = null;
  setRemoteWriteFence(false);
}

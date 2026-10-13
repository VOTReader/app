// @ts-nocheck
/* W8 (sweep 2026-10-13): other open tabs undid Clear All and Import.
   Tab A clears everything (deletes 'votreader') or imports a backup (writes into it); tab B,
   still open on the old library, saved its history, reading stats, streak or audio positions
   next - a whole-value put that recreated the deleted database or wrote the old copy over
   the import. And a tab left on an old build after a newer one upgraded the database said
   "storage is full" on every edit. Here tab B is this page (the real IDBAdapter + a real
   store on fake-indexeddb); tab A is a raw connection plus a channel of its own. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBAdapter } from '../stores/idb-adapter.js';
import { CachedStore, _resetStoreRegistry, setStoreWriteFence } from '../stores/cached-store.js';
import { StorageHealth } from './storage-health.js';
import { watchOtherTabs, announceLibraryChange, _resetOtherTabsForTests } from './other-tabs.js';

/** An in-memory BroadcastChannel: a message reaches every OTHER channel of the same name, a task later. */
const bus = new Set();
class FakeChannel {
  constructor(name) { this.name = name; this.listeners = new Set(); this.onmessage = null; bus.add(this); }
  postMessage(data) {
    for (const ch of bus) {
      if (ch === this || ch.name !== this.name) continue;
      const ev = { data: structuredClone(data) };
      setTimeout(() => { if (ch.onmessage) ch.onmessage(ev); for (const fn of ch.listeners) fn(ev); }, 0);
    }
  }
  addEventListener(type, fn) { if (type === 'message') this.listeners.add(fn); }
  removeEventListener(type, fn) { this.listeners.delete(fn); }
  close() { bus.delete(this); }
}

const tick = () => new Promise((r) => setTimeout(r, 5));
const deleteDb = () => new Promise((r) => { const q = indexedDB.deleteDatabase('votreader'); q.onsuccess = q.onerror = q.onblocked = () => r(); });

/** Tab A's own connection to the database (what another tab's import writes through). */
function tabADb(version = IDBAdapter.DB_VERSION) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('votreader', version);
    r.onupgradeneeded = () => { for (const n of IDBAdapter.STORE_NAMES) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tabAWrites(store, value) {
  const db = await tabADb();
  await new Promise((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, 'v'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}
async function onDisk(store) {
  const db = await tabADb();
  const v = await new Promise((resolve, reject) => { const g = db.transaction(store).objectStore(store).get('v'); g.onsuccess = () => resolve(g.result); g.onerror = () => reject(g.error); });
  db.close();
  return v;
}

const ids = (list) => (list || []).map((h) => h.id);
let history;
let other;
/** Tab B's own edit: a history row, saved the way every whole-value store saves. */
function tabBSaves(id) { history._load().push({ id }); history._save(); }

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  _resetOtherTabsForTests();
  IDBAdapter._resetForTests();
  await deleteDb();
  _resetStoreRegistry();
  StorageHealth._resetForTests();
  await StorageHealth.assess();
  await IDBAdapter.put('vot-history', 'v', [{ id: 'h1' }, { id: 'h2' }]);
  history = CachedStore('vot-history', [], { idb: true });
  await history._hydrate();
  other = new FakeChannel('votreader-library');
  watchOtherTabs();
});

afterEach(async () => {
  _resetOtherTabsForTests();
  other.close();
  setStoreWriteFence(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('W8: another tab cleared everything (the database was deleted under this one)', () => {
  it('this tab\'s next save does not bring the old library back, and it asks for a reload', async () => {
    await deleteDb();                         // tab A's Clear All: this page's connection gets versionchange and closes
    tabBSaves('h3');
    await history.whenSaved().catch(() => {});
    await tick();
    expect(await onDisk('vot-history'), 'the wipe stays a wipe').toBeUndefined();
    expect(StorageHealth.getReport().libraryElsewhere).toBe('changed');
  });

  it('CONTROL: this tab\'s own Clear All (its fence goes up first) is not another tab\'s, and a failed one keeps saving', async () => {
    setStoreWriteFence(true);
    await deleteDb();
    expect(StorageHealth.getReport().libraryElsewhere).toBeFalsy();
    setStoreWriteFence(false);                // the wipe "failed": no reload, this session goes on
    tabBSaves('h3');
    await history.whenSaved();
    expect(ids(await onDisk('vot-history'))).toEqual(['h1', 'h2', 'h3']);
  });
});

describe('W8: another tab imported a backup (or restored a snapshot) into the same database', () => {
  it('from its start this tab writes nothing over it, and after it this tab asks for a reload', async () => {
    other.postMessage({ kind: 'changing', from: 'tab-a' });
    await tick();
    expect(StorageHealth.getReport().libraryElsewhere).toBe('changing');
    await tabAWrites('vot-history', [{ id: 'imported' }]);
    tabBSaves('h3');                          // a background tab's save during the import...
    await tick();
    other.postMessage({ kind: 'changed', from: 'tab-a' });
    await tick();
    tabBSaves('h4');                          // ...and after it
    await tick();
    expect(ids(await onDisk('vot-history'))).toEqual(['imported']);
    expect(StorageHealth.getReport().libraryElsewhere).toBe('changed');
  });

  it('an import the other tab did not finish (refused, failed, cancelled) lifts the hold and saves what was edited meanwhile', async () => {
    other.postMessage({ kind: 'changing', from: 'tab-a' });
    await tick();
    tabBSaves('h3');
    await tick();
    expect(ids(await onDisk('vot-history'))).toEqual(['h1', 'h2']);
    other.postMessage({ kind: 'unchanged', from: 'tab-a' });
    await tick();
    await history.whenSaved();
    expect(ids(await onDisk('vot-history'))).toEqual(['h1', 'h2', 'h3']);
    expect(StorageHealth.getReport().libraryElsewhere).toBeFalsy();
  });

  it('once changed, a late "unchanged" (another tab\'s cancelled import) does not lift the hold', async () => {
    await deleteDb();                         // Clear All in one tab
    other.postMessage({ kind: 'unchanged', from: 'tab-c' });
    await tick();
    tabBSaves('h3');
    await tick();
    expect(await onDisk('vot-history')).toBeUndefined();
    expect(StorageHealth.getReport().libraryElsewhere).toBe('changed');
  });

  it('this page\'s own announcement never holds this page, even from a second copy of the module', async () => {
    const got = [];
    other.addEventListener('message', (e) => got.push(e.data));
    announceLibraryChange('changing');
    await tick();
    expect(got).toEqual([{ kind: 'changing', from: expect.any(String) }]);
    expect(StorageHealth.getReport().libraryElsewhere).toBeFalsy();
    other.postMessage({ kind: 'changing', from: got[0].from });   // a copy bundled twice speaks with this page's id
    await tick();
    expect(StorageHealth.getReport().libraryElsewhere).toBeFalsy();
    tabBSaves('h3');
    await history.whenSaved();
    expect(ids(await onDisk('vot-history'))).toEqual(['h1', 'h2', 'h3']);
  });
});

describe('W8: a newer build upgraded the database while this (older) tab was open', () => {
  it('says "newer version", not "storage is full", and writes nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const newer = await tabADb(IDBAdapter.DB_VERSION + 1);    // this page's connection gets versionchange and closes
    tabBSaves('h3');
    await history.whenSaved().catch(() => {});
    await tick();
    const r = StorageHealth.getReport();
    expect(r.versionTooNew).toBe(true);
    expect(r.writeFailedThisSession, 'no "storage is full" banner').toBe(false);
    expect(r.libraryElsewhere).toBeFalsy();
    newer.close();
  });
});

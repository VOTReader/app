/* Review 11-26 (C): when a restore skips the read-marks part (vot-state), the startup copy of the theme and text
   size in localStorage is still replaced from the backup's `data` (backup.js _reseedLsData). The question was
   whether a phone whose main database is empty then loses anything or shows something wrong. These pin what
   happens, on the real StateStore over fake-indexeddb, across the reload the restore ends with:

   - a phone with its own state in the database keeps its read marks, theme and text size. The startup copy holds
     the backup's theme and text size only until that reload's hydration rewrites it, so the first paint after the
     restore can show them before the phone's own come back;
   - a phone whose state is still only in the old localStorage copy (pre-W2) was moved into the database when its
     stores loaded, so it is the case above;
   - a phone with an empty database had nothing to keep: it boots with the backup's theme and text size (the two
     fields of the startup copy) and nothing else of the skipped part;
   - a v1 file whose vot-state is refused because it is not an object puts that value in the startup copy too; on an
     empty database the hydration reads it: that session's state is the refused value (an array) until the app's first
     write, and the database gets an empty state. Nothing is lost.
   No case loses a read mark. Nothing here is fixed; this file records the behaviour. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { applyImportPayload } from './backup.js';
import { validateStorePayload } from './import-validators.js';
import { IDBAdapter } from '../stores/idb-adapter.js';
import { hydrateAllStores } from '../stores/cached-store.js';
import { StateStore } from '../stores/state-store.js';
import { NoteStore } from '../stores/note-store.js';

const ALL = [StateStore, NoteStore];
const storesMap = () => ({
  'vot-notes': { store: NoteStore, method: 'replaceAll' },
  'vot-state': { store: StateStore, method: 'set' },
});
const noMedia = { allIds: async () => [], delete: async () => {}, put: async () => {} };
const deleteDb = () => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase('votreader');
  req.onsuccess = req.onerror = req.onblocked = () => resolve(undefined);
});
const flush = () => Promise.all(ALL.map((s) => s.whenSaved()));
/** The reload the restore ends with: drop every cache and read the stores back from the database. */
async function reload() {
  await flush();
  ALL.forEach((s) => s._resetForTests()); IDBAdapter._resetForTests();
  await hydrateAllStores();
  await flush();
}
const idbState = () => IDBAdapter.get('vot-state', 'v');
/** The startup copy index.html's boot script reads before React mounts. */
const startupCopy = () => JSON.parse(localStorage.getItem('vot-state') || 'null');

const BACKUP = { theme: 'dark', settings: { fontStyle: 'sans', fontScale: '2' } };
const PHONE = { theme: 'light', settings: { fontStyle: 'serif', fontScale: '1' }, readItems: { 'john-3': 1 }, tabs: [] };
const PHONE_SHIM = { theme: 'light', settings: { fontStyle: 'serif', fontScale: '1' } };
/** A v2 backup whose vot-state part fails its shape check; its startup copy is the backup's own. */
const V2_STATE_REFUSED = () => ({ exportVersion: 2, data: { 'vot-state': JSON.stringify(BACKUP) }, stores: { 'vot-state': 'junk', 'vot-notes': {} }, media: {} });

/** An empty state once the hydration's first save has filled in the read-mark ledgers' defaults. */
const EMPTY_SAVED = { readItems: {}, lastReadChapters: {}, lastReadLetterMap: {} };

const restore = (payload) => applyImportPayload(payload, {
  storesMap: storesMap(), flagMap: {}, mediaStore: noMedia, validateStorePayload, validateMediaRecord: () => [],
});

describe('a restore that skips vot-state: what the phone keeps', () => {
  beforeEach(async () => {
    await flush();
    IDBAdapter._resetForTests();
    await deleteDb();
    localStorage.clear();
    ALL.forEach((s) => s._resetForTests({ forceLoaded: true }));
  });

  it('a phone with its state in the database keeps its read marks, theme and text size; only the first paint can show the backup\'s', async () => {
    StateStore.set(PHONE); await flush();
    const res = await restore(V2_STATE_REFUSED());
    expect(res.skippedStores).toEqual(['vot-state']);
    expect(startupCopy()).toEqual(BACKUP);              // what the boot script paints with on the reload
    await reload();
    expect(StateStore.get()).toMatchObject(PHONE);
    expect(await idbState()).toMatchObject(PHONE);
    expect(startupCopy()).toEqual(PHONE_SHIM);          // the hydration rewrote it: the next boot is the phone's own
  });

  it('a phone whose state was only in the old localStorage copy keeps its read marks too (it was moved into the database at load)', async () => {
    localStorage.setItem('vot-state', JSON.stringify(PHONE));
    await reload();
    expect(await idbState()).toMatchObject(PHONE);
    const res = await restore(V2_STATE_REFUSED());
    expect(res.skippedStores).toEqual(['vot-state']);
    await reload();
    expect(StateStore.get()).toMatchObject(PHONE);
    expect(startupCopy()).toEqual(PHONE_SHIM);
  });

  it('a phone with an empty database boots with the backup\'s theme and text size and nothing else of the skipped part', async () => {
    expect(await idbState()).toBeUndefined();
    const res = await restore(V2_STATE_REFUSED());
    expect(res.skippedStores).toEqual(['vot-state']);
    await reload();
    expect(StateStore.get()).toEqual(BACKUP);
    expect(await idbState()).toEqual({ ...EMPTY_SAVED, ...BACKUP });
  });

  it('with no startup copy in the backup, an empty database stays empty', async () => {
    const res = await restore({ exportVersion: 2, data: {}, stores: { 'vot-state': 'junk', 'vot-notes': {} }, media: {} });
    expect(res.skippedStores).toEqual(['vot-state']);
    await reload();
    expect(StateStore.get()).toEqual({});
  });

  it('v1: a refused vot-state reaches an empty database through the startup copy and is saved as an empty state', async () => {
    const res = await restore({ exportVersion: 1, data: { 'vot-state': '[]', 'vot-notes': '{}' } });
    expect(res.skippedStores).toEqual(['vot-state']);
    expect(localStorage.getItem('vot-state')).toBe('[]');
    await reload();
    expect(StateStore.get()).toEqual([]);               // this session's copy is the refused value, read from the startup copy
    expect(await idbState()).toEqual(EMPTY_SAVED);      // the database got an empty state
    StateStore.set({ theme: 'light', readItems: { x: 1 }, tabs: [] });
    await reload();
    expect(StateStore.get()).toMatchObject({ theme: 'light', readItems: { x: 1 } });
  });

  it('v1: a vot-state that does not parse leaves an empty database empty', async () => {
    const res = await restore({ exportVersion: 1, data: { 'vot-state': '{bad', 'vot-notes': '{}' } });
    expect(res.importFailures).toBe(1);
    await reload();
    expect(StateStore.get()).toEqual({});
    expect(await idbState()).toEqual(EMPTY_SAVED);
  });
});

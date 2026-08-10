/* STORE-1 — cross-tab whole-store clobber: 2-tab integration harness.
   ─────────────────────────────────────────────────────────────────────
   Proves the fix end-to-end through the REAL code: cached-store's
   _saveMerged + the store-merge strategies + the navigator.locks shim
   (vitest.setup.js), over a single in-memory IDB SHARED by two store
   instances — exactly the two-PWA-tabs topology.

   Two halves:
     1. UNPROTECTED (no crossTabMerge) — reproduces the clobber: Tab B's
        stale whole-cache write destroys Tab A's committed record. This both
        documents the bug and confirms the shared-IDB mock is faithful.
     2. PROTECTED (crossTabMerge wired) — the same sequence now keeps BOTH
        records, honors deletes without resurrection, and serializes truly
        concurrent flushes through the lock.
   ───────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CachedStore, extendStore, _resetStoreRegistry } from './cached-store.js';
import { IDBAdapter } from './idb-adapter.js';
import { mergeListStore, mergeStateStore } from './store-merge.js';

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/* One shared in-memory IDB: { [storeName]: { [key]: value } }. get/put deep-
   clone (mirroring structured-clone) so the two tabs' caches and the store
   never alias — the faithful condition that makes the clobber reproduce. */
/** @type {any} */
let idb;
beforeEach(() => {
  idb = {};
  _resetStoreRegistry();
  vi.spyOn(IDBAdapter, 'get').mockImplementation((store, key) =>
    Promise.resolve(clone(idb[store] && idb[store][String(key)])));
  vi.spyOn(IDBAdapter, 'put').mockImplementation((store, key, val) => {
    if (!idb[store]) idb[store] = {};
    idb[store][String(key)] = clone(val);
    return Promise.resolve();
  });
  vi.spyOn(IDBAdapter, 'delete').mockImplementation((store, key) => {
    if (idb[store]) delete idb[store][String(key)];
    return Promise.resolve();
  });
});
afterEach(() => { vi.restoreAllMocks(); });

/* A journal-like store ({ list: Record[] }) with the same add/remove shape as
   the real precious stores. `merge` opts in to the cross-tab-safe flush. */
function makeJournalLikeStore(storeName, merge) {
  const base = CachedStore(storeName, { list: [] }, merge
    ? { idb: true, crossTabMerge: merge }
    : { idb: true });
  return extendStore(base, {
    list() { return (this._load().list || []).slice(); },
    add(entry) {
      if (this._shouldDefer('add', entry)) return entry;
      const data = this._load();
      if (!data.list) data.list = [];
      data.list.push(entry);
      this._save();
      this._bump();
      return entry;
    },
    remove(id) {
      if (this._shouldDefer('remove', id)) return;
      const data = this._load();
      data.list = (data.list || []).filter((e) => e.id !== id);
      this._save();
      this._bump();
    },
  });
}

const entry = (id, updated) => ({ id, updated: updated || 1, created: updated || 1 });
const idsIn = (store) => ((idb[store] && idb[store].v && idb[store].v.list) || []).map((e) => e.id).sort();

/* Two tabs = two instances over the same storeName + shared IDB. Hydrating
   the SECOND tab before the first writes makes its cache stale — the bug's
   precondition. */
async function twoTabs(storeName, merge) {
  const a = makeJournalLikeStore(storeName, merge);
  const b = makeJournalLikeStore(storeName, merge);
  await a._hydrate();
  await b._hydrate();
  return { a, b };
}

describe('STORE-1 unprotected (no merge) — the clobber reproduces', () => {
  it("Tab B's stale write destroys Tab A's committed record", async () => {
    const { a, b } = await twoTabs('vot-test-unprotected', null);
    a.add(entry('X'));
    await a.whenSaved();
    expect(idsIn('vot-test-unprotected')).toEqual(['X']);   // X committed
    b.add(entry('Y'));                                        // B is stale (pre-X)
    await b.whenSaved();
    // Last-writer-wins blob flush: B wrote its whole stale cache → X is gone.
    expect(idsIn('vot-test-unprotected')).toEqual(['Y']);    // BUG: X lost
  });
});

describe('STORE-1 protected (crossTabMerge) — committed data survives', () => {
  it('both tabs\' additions survive (the headline fix)', async () => {
    const { a, b } = await twoTabs('vot-test-merge-add', mergeListStore);
    a.add(entry('X'));
    await a.whenSaved();
    b.add(entry('Y'));            // still stale (hydrated before X)
    await b.whenSaved();
    expect(idsIn('vot-test-merge-add')).toEqual(['X', 'Y']);
  });

  it('honors a sibling delete — no resurrection of the removed record', async () => {
    const store = 'vot-test-merge-del';
    // Tab A creates 'shared' and commits it.
    const a = makeJournalLikeStore(store, mergeListStore);
    await a._hydrate();
    a.add(entry('shared'));
    await a.whenSaved();
    // Tab B hydrates NOW, so 'shared' is in B's common ancestor (base).
    const b = makeJournalLikeStore(store, mergeListStore);
    await b._hydrate();
    // A deletes 'shared'; B (still holding an UNCHANGED 'shared') adds its own.
    a.remove('shared');
    await a.whenSaved();
    expect(idsIn(store)).toEqual([]);
    b.add(entry('newByB'));
    await b.whenSaved();
    // 'shared' must NOT come back (B never edited it), and B's add is kept.
    expect(idsIn(store)).toEqual(['newByB']);
  });

  it('serializes truly concurrent flushes via the lock (no lost update)', async () => {
    const { a, b } = await twoTabs('vot-test-merge-race', mergeListStore);
    a.add(entry('A1'));
    b.add(entry('B1'));           // both dirty their caches before either flush lands
    await Promise.all([a.whenSaved(), b.whenSaved()]);
    expect(idsIn('vot-test-merge-race')).toEqual(['A1', 'B1']);
  });

  it('adopts the sibling record into the local cache after merge', async () => {
    const { a, b } = await twoTabs('vot-test-merge-adopt', mergeListStore);
    a.add(entry('X'));
    await a.whenSaved();
    b.add(entry('Y'));
    await b.whenSaved();
    // B's in-memory cache now contains X too (pulled in by the merge), so a
    // subsequent B render is consistent without a reload.
    expect(b.list().map((e) => e.id).sort()).toEqual(['X', 'Y']);
  });
});

/* C2-D [D4] — vot-state: the store where the two halves want opposite
   policies. Same two-tab topology, a state-shaped store (the real
   StateStore is a module singleton, so this rebuilds its exact opts:
   idb + lsShim + mergeStateStore). What is asserted here is the SPLIT —
   the accumulating ledger merges, the session fields do not. */

/** The boot-script shim, verbatim in shape from state-store.js. */
const bootShim = (full) => ({
  theme: full && full.theme,
  settings: { fontStyle: full && full.settings && full.settings.fontStyle },
});

function makeStateLikeStore(storeName, merge) {
  const base = CachedStore(storeName, {}, merge
    ? { idb: true, lsShim: bootShim, crossTabMerge: merge }
    : { idb: true, lsShim: bootShim });
  return extendStore(base, {
    get() { return this._load(); },
    /** usePersistedState's single write: the whole union, every tick. */
    set(full) {
      if (this._shouldDefer('set', full)) return;
      this._cache = full;
      this._save();
      this._bump();
    },
    /** Read the current union, apply a patch, write it back — how App() moves. */
    patch(fn) { const next = JSON.parse(JSON.stringify(this._load())); fn(next); this.set(next); },
  });
}

const stateIn = (store) => (idb[store] && idb[store].v) || {};

async function twoStateTabs(storeName, merge) {
  const a = makeStateLikeStore(storeName, merge);
  const b = makeStateLikeStore(storeName, merge);
  await a._hydrate();
  await b._hydrate();
  return { a, b };
}

describe('[D4] vot-state unprotected — a read mark dies in the clobber', () => {
  it("Tab B's stale write destroys the chapter Tab A marked read", async () => {
    const store = 'vot-test-state-unprotected';
    const { a, b } = await twoStateTabs(store, null);
    a.set({ tabs: [{ id: 'ta' }], readItems: { 'v1:john:3': 1 } });
    await a.whenSaved();
    b.set({ tabs: [{ id: 'tb' }], readItems: {} });
    await b.whenSaved();
    // The mark is gone from the only place it lived, and Tab B never had it.
    expect(stateIn(store).readItems).toEqual({});
  });
});

describe('[D4] vot-state protected — the ledger merges, the session does not', () => {
  it('keeps a read mark made in the other tab (the headline fix)', async () => {
    const store = 'vot-test-state-marks';
    const { a, b } = await twoStateTabs(store, mergeStateStore);
    a.set({ tabs: [{ id: 'ta' }], readItems: { 'v1:john:3': 1 } });
    await a.whenSaved();
    b.set({ tabs: [{ id: 'tb' }], readItems: { 'v1:genesis:1': 1 } });
    await b.whenSaved();
    expect(stateIn(store).readItems).toEqual({ 'v1:john:3': 1, 'v1:genesis:1': 1 });
  });

  it('leaves tabs / theme / settings LAST-WRITER-WINS, on purpose', async () => {
    const store = 'vot-test-state-session';
    const { a, b } = await twoStateTabs(store, mergeStateStore);
    a.set({ tabs: [{ id: 'ta' }], theme: 'light', settings: { fontScale: '120' }, readItems: {} });
    await a.whenSaved();
    b.set({ tabs: [{ id: 'tb' }], theme: 'dark', settings: { fontScale: '100' }, readItems: {} });
    await b.whenSaved();
    // Not merged, not unioned — B's window is the one that wrote last, and its
    // arrangement is the answer. Merging tab strips would invent a layout
    // neither window had and resurrect tabs the reader closed.
    expect(stateIn(store).tabs).toEqual([{ id: 'tb' }]);
    expect(stateIn(store).theme).toBe('dark');
    expect(stateIn(store).settings).toEqual({ fontScale: '100' });
  });

  it('honors unmarkRead — the cleared mark is not resurrected', async () => {
    const store = 'vot-test-state-unmark';
    const a = makeStateLikeStore(store, mergeStateStore);
    await a._hydrate();
    a.set({ readItems: { 'v1:john:3': 1 } });
    await a.whenSaved();
    // Tab B hydrates now, so the mark is in ITS common ancestor.
    const b = makeStateLikeStore(store, mergeStateStore);
    await b._hydrate();
    a.patch((s) => { delete s.readItems['v1:john:3']; });   // unmarkRead
    await a.whenSaved();
    b.patch((s) => { s.readItems['v1:luke:2'] = 1; });      // B marks something else
    await b.whenSaved();
    expect(stateIn(store).readItems).toEqual({ 'v1:luke:2': 1 });
  });

  it('takes the HIGHER read count rather than summing (no double credit)', async () => {
    const store = 'vot-test-state-counts';
    const a = makeStateLikeStore(store, mergeStateStore);
    await a._hydrate();
    a.set({ readItems: { 'v1:john:3': 1 } });
    await a.whenSaved();
    const b = makeStateLikeStore(store, mergeStateStore);
    await b._hydrate();
    a.patch((s) => { s.readItems['v1:john:3'] = 3; });
    await a.whenSaved();
    b.patch((s) => { s.readItems['v1:john:3'] = 2; });
    await b.whenSaved();
    expect(stateIn(store).readItems['v1:john:3']).toBe(3);
  });

  it('merges the two last-read cursors, resolving a conflict to the writer', async () => {
    const store = 'vot-test-state-cursors';
    const { a, b } = await twoStateTabs(store, mergeStateStore);
    a.set({ lastReadChapters: { john: 3 }, lastReadLetterMap: { one: 'the-wide-path' } });
    await a.whenSaved();
    b.set({ lastReadChapters: { genesis: 7, john: 9 }, lastReadLetterMap: {} });
    await b.whenSaved();
    // john: both sides have it, the writer wins. genesis: B's own. one: A's,
    // and B never touched it, so it survives instead of being clobbered.
    expect(stateIn(store).lastReadChapters).toEqual({ genesis: 7, john: 9 });
    expect(stateIn(store).lastReadLetterMap).toEqual({ one: 'the-wide-path' });
  });

  it('still writes the boot-script localStorage shim on the MERGED path', async () => {
    // The regression this fix could have introduced: _saveMerged returns
    // before _save's LS branch, and vot-state is the one lsShim store. A
    // stale shim is a wrong-theme flash on every cold boot — invisible to
    // every other assertion here.
    const store = 'vot-test-state-lsshim';
    const { a } = await twoStateTabs(store, mergeStateStore);
    localStorage.removeItem(store);
    a.set({ theme: 'light', settings: { fontStyle: 'modern' }, readItems: {} });
    await a.whenSaved();
    expect(JSON.parse(localStorage.getItem(store))).toEqual({
      theme: 'light', settings: { fontStyle: 'modern' },
    });
  });
});

/* STOR5 — navigator.locks unavailable (a sub-floor host below chrome108): the
   merge store must DEGRADE to the pre-STORE-1 blind blob write (data still
   persists, last-writer-wins) and trace the degrade exactly ONCE per store via
   DiagnosticLog. The shim (vitest.setup.js) makes every other test take the
   merge path; this is the ONLY coverage of the fallback (TEST5). */
describe('STOR5 — no navigator.locks: blind-write fallback + one-shot trace', () => {
  let origLocks; let origDiag;
  beforeEach(() => {
    origLocks = navigator.locks;
    /** @type {any} */ (navigator).locks = undefined; // Web Locks API absent
    origDiag = /** @type {any} */ (globalThis).DiagnosticLog;
    /** @type {any} */ (globalThis).DiagnosticLog = { warn: vi.fn(), error: vi.fn(), time: vi.fn() };
  });
  afterEach(() => {
    /** @type {any} */ (navigator).locks = origLocks;
    /** @type {any} */ (globalThis).DiagnosticLog = origDiag;
  });

  it('still persists the cache (blind write) and traces exactly once per store', async () => {
    const s = makeJournalLikeStore('vot-test-nolocks', mergeListStore);
    await s._hydrate();

    s.add(entry('X'));
    await s.whenSaved();
    // The merge was skipped, but the data still durably landed (last-writer-wins).
    expect(idsIn('vot-test-nolocks')).toEqual(['X']);
    // STOR5: the degrade is traced once, to the 'store' channel...
    const warn = /** @type {any} */ (globalThis).DiagnosticLog.warn;
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe('store');

    // ...and NOT again on a second save of the same store (_warnedNoLocks guard).
    s.add(entry('Y'));
    await s.whenSaved();
    expect(idsIn('vot-test-nolocks')).toEqual(['X', 'Y']);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

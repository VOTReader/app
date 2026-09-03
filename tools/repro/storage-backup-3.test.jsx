// @ts-nocheck
/* RED — storage-backup-3 (Verifier reproduction, 2026-09-03)
   ─────────────────────────────────────────────────────────────────────────
   Cold boot on a slow device: vot-state's IDB read takes longer than
   hydrationTimeoutMs (3000 ms), the store flips to 'degraded', HydrationGate
   resolves anyway and App mounts. useSavedState → StateStore.get() → _load()
   in a non-loaded state returns the memoised EMPTY default, so every hook
   seeds from defaults, and usePersistedState's mount write (bootCritical:
   prev === null) hands that default union to StateStore.set(), which queues
   it. When the real IDB read finally lands, _rebaseAndPromote installs the
   real state and then REPLAYS the queue on top of it — set(defaultUnion)
   replaces it wholesale — and _save() flushes the defaults to disk. Settings,
   tabs and the whole readItems / lastRead ledger are gone, and the merge
   cannot save them: mergeStateStore lets "ours" win every session field and
   honours a key that "ours" removed relative to base as a deletion.

   The REAL hooks run here (useSavedState + usePersistedState composed the way
   App composes them); only IDB's timing is controlled. Whether the fix skips
   the mount write while the store is not 'loaded', or makes the replay merge
   instead of replace, this contract is what has to hold.

   CONTRACT PINNED HERE: after a degraded-then-recovered hydration, the state
   the reader had (readItems, tabs, settings, theme) is still the state. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { IDBAdapter } from '../../app/src/main/assets/src/stores/idb-adapter.js';
import { StateStore } from '../../app/src/main/assets/src/stores/state-store.js';
import { useSavedState } from '../../app/src/main/assets/src/hooks/use-saved-state.js';
import { usePersistedState } from '../../app/src/main/assets/src/hooks/use-persisted-state.js';
import { DEFAULT_TAB } from '../../app/src/main/assets/src/hooks/use-tabs.js';

/** The previous session, exactly as IDB holds it. */
const REAL = {
  tabs: [{ ...DEFAULT_TAB, screen: 'bible-ch', bookId: 'john', chapterNum: 3 }],
  activeTabIdx: 0,
  theme: 'light',
  settings: { fontScale: 1.3, fontStyle: 'serif', readAlong: true },
  readItems: { 'bible:john:1': 1, 'bible:john:2': 1, 'vot-one:the-last-trump': 1 },
  lastReadChapters: { john: 2 },
  lastReadLetterMap: { one: 'the-last-trump' },
  activeReadKey: 'bible:john',
};

/** App's composition, reduced: every hook seeds from `saved` with its
    default (useTabs / useSettings / App-local useState do exactly this), and
    usePersistedState writes the union. */
function AppShape() {
  const saved = useSavedState();
  usePersistedState({
    tabs: Array.isArray(saved.tabs) && saved.tabs.length ? saved.tabs : [{ ...DEFAULT_TAB }],
    activeTabIdx: typeof saved.activeTabIdx === 'number' ? saved.activeTabIdx : 0,
    theme: saved.theme || 'dark',
    lastReadChapters: saved.lastReadChapters || {},
    lastReadLetterMap: saved.lastReadLetterMap || {},
    activeReadKey: saved.activeReadKey || null,
    settings: saved.settings || {},
    readItems: saved.readItems || {},
  });
  return saved;
}

let resolveGet;
let puts;

/** StateStore is a module singleton and _hydrate() memoises its promise, so
    the store must be put back to a cold-boot 'pending' between tests — the
    control would otherwise leave it 'loaded' and the RED could not time out. */
function resetStateStoreToColdBoot() {
  StateStore._resetForTests();
  return;
  const s = /** @type {any} */ (StateStore);
  s._state = 'pending';
  s._hydratePromise = null;
  s._cache = null;
  s._pendingCache = null;
  s._defaultRef = null;
  s._queue = [];
  s._base = null;
  s._replaying = false;
  s._applyingPending = false;
  s._lastWrite = null;
  if (s._writeRetryTimer) clearTimeout(s._writeRetryTimer);
  s._writeRetryTimer = null;
  s._writeRetryAttempt = 0;
}

beforeEach(() => {
  resetStateStoreToColdBoot();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('vot-scrollheal-1', '1');   // keep the one-time heal out of the picture
  vi.useFakeTimers();
  puts = [];
  vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise((r) => { resolveGet = r; }));
  vi.spyOn(IDBAdapter, 'put').mockImplementation((_store, _key, val) => {
    puts.push(JSON.parse(JSON.stringify(val)));
    return Promise.resolve();
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('storage-backup-3 — degraded-then-recovered vot-state hydration', () => {
  it('CONTROL: when IDB answers in time, the mount write keeps the real state', async () => {
    const hydrate = StateStore._hydrate();
    resolveGet(JSON.parse(JSON.stringify(REAL)));
    await hydrate;
    expect(StateStore.getState()).toBe('loaded');
    const { unmount } = renderHook(() => AppShape());
    await vi.advanceTimersByTimeAsync(0);
    expect(StateStore.get().readItems).toEqual(REAL.readItems);
    expect(StateStore.get().tabs[0]).toMatchObject({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    expect(StateStore.get().settings.fontScale).toBe(1.3);
    unmount();
  });

  it('RED: IDB answers AFTER the 3 s timeout — the boot defaults must not replay over the real state', async () => {
    // 1. Hydration times out → degraded; HydrationGate lets App mount anyway.
    const hydrate = StateStore._hydrate();
    vi.advanceTimersByTime(3000);
    await hydrate;
    expect(StateStore.getState()).toBe('degraded');

    // 2. App mounts on the empty default; usePersistedState's mount write fires.
    const { result, unmount } = renderHook(() => AppShape());
    expect(result.current).toEqual({});             // what useSavedState saw
    await vi.advanceTimersByTimeAsync(0);

    // 3. The slow IDB read finally lands with the reader's real state.
    resolveGet(JSON.parse(JSON.stringify(REAL)));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(StateStore.getState()).toBe('loaded');

    // 4. The ledger, the tabs and the settings the reader had are still there …
    const now = StateStore.get();
    expect(now.readItems).toEqual(REAL.readItems);
    expect(now.tabs[0]).toMatchObject({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    expect(now.settings.fontScale).toBe(1.3);
    expect(now.theme).toBe('light');
    expect(now.lastReadChapters).toEqual(REAL.lastReadChapters);

    // … and nothing that reached disk erased them.
    await vi.advanceTimersByTimeAsync(5000);        // past any debounce / retry
    const last = puts[puts.length - 1];
    expect(last, 'a write reached IDB').toBeDefined();
    expect(last.readItems).toEqual(REAL.readItems);
    unmount();
  });
});

/* useJournalMediaSweep — boot (+4s) hygiene sweep.
   ─────────────────────────────────────────────────────────────────────
   Two independent halves share one deferred timer slot:

     A) storage-backup-5 — sweep JournalMediaStore's import-staging store
        when no restore is in flight (RESTORE_INFLIGHT_KEY absent). A v3
        restore killed mid-stream never reaches commitImportReplace/
        commitImportMerge (the only things that otherwise clear staging),
        so the staged duplicate would sit forever without this.
     B) the pre-existing orphan sweep — prune live JournalMediaStore blobs
        no journal entry references any more, but only once JournalStore
        has fully hydrated.

   Both run from the SAME 4s setTimeout, independently guarded — the
   staging sweep runs even when JournalStore is undefined/not ready, and
   the orphan sweep runs even when the staging sweep itself throws. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useJournalMediaSweep } from './use-journal-media-sweep.js';
import { RESTORE_INFLIGHT_KEY } from './use-restore-guard.js';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('../stores/journal-media-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalMediaStore() { return /** @type {any} */ (globalThis).JournalMediaStore; } }; });
vi.mock('../stores/journal-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalStore() { return /** @type {any} */ (globalThis).JournalStore; } }; });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete /** @type {any} */ (globalThis).JournalMediaStore;
  delete /** @type {any} */ (globalThis).JournalStore;
});

describe('useJournalMediaSweep — storage-backup-5: stale import-staging cleanup', () => {
  it('REPRO: sweeps import-staging 4s after boot when no restore is in flight', async () => {
    const abortImportReplace = vi.fn().mockResolvedValue(undefined);
    /** @type {any} */ (globalThis).JournalMediaStore = { abortImportReplace };

    renderHook(() => useJournalMediaSweep());
    expect(abortImportReplace).not.toHaveBeenCalled(); // deferred, not immediate

    await vi.advanceTimersByTimeAsync(4000);

    expect(abortImportReplace).toHaveBeenCalledTimes(1);
  });

  it('does NOT sweep staging while a restore is genuinely in flight (marker present)', async () => {
    localStorage.setItem(RESTORE_INFLIGHT_KEY, String(Date.now()) + ':x');
    const abortImportReplace = vi.fn().mockResolvedValue(undefined);
    /** @type {any} */ (globalThis).JournalMediaStore = { abortImportReplace };

    renderHook(() => useJournalMediaSweep());
    await vi.advanceTimersByTimeAsync(4000);

    // Safety-critical: a live restore's staged blobs must never be wiped
    // out from under it.
    expect(abortImportReplace).not.toHaveBeenCalled();
  });

  it('does not throw when JournalMediaStore is unavailable', async () => {
    renderHook(() => useJournalMediaSweep());
    await expect(vi.advanceTimersByTimeAsync(4000)).resolves.not.toThrow();
  });

  it('a rejected abortImportReplace is caught (does not crash the timer callback)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    /** @type {any} */ (globalThis).JournalMediaStore = {
      abortImportReplace: vi.fn().mockRejectedValue(new Error('boom')),
    };

    renderHook(() => useJournalMediaSweep());
    await vi.advanceTimersByTimeAsync(4000);

    expect(warn.mock.calls.some((a) => /Stale import-staging sweep failed/.test(String(a[0])))).toBe(true);
  });

  it('unmounting before 4s cancels the sweep entirely', async () => {
    const abortImportReplace = vi.fn().mockResolvedValue(undefined);
    /** @type {any} */ (globalThis).JournalMediaStore = { abortImportReplace };

    const { unmount } = renderHook(() => useJournalMediaSweep());
    unmount();
    await vi.advanceTimersByTimeAsync(5000);

    expect(abortImportReplace).not.toHaveBeenCalled();
  });
});

describe('useJournalMediaSweep — pre-existing orphan sweep (regression guard)', () => {
  function fakeMediaStore(overrides) {
    return {
      abortImportReplace: vi.fn().mockResolvedValue(undefined),
      pruneOrphans: vi.fn().mockResolvedValue(0),
      ...overrides,
    };
  }

  it('prunes orphaned media once JournalStore is loaded', async () => {
    const pruneOrphans = vi.fn().mockResolvedValue(2);
    /** @type {any} */ (globalThis).JournalMediaStore = fakeMediaStore({ pruneOrphans });
    /** @type {any} */ (globalThis).JournalStore = {
      isReady: () => true,
      getState: () => 'loaded',
      collectAllMediaIds: () => ['a', 'b'],
    };

    renderHook(() => useJournalMediaSweep());
    await vi.advanceTimersByTimeAsync(4000);

    expect(pruneOrphans).toHaveBeenCalledWith(['a', 'b'], expect.any(Number));
  });

  it('skips the orphan prune when JournalStore is not ready (degraded/pending)', async () => {
    const pruneOrphans = vi.fn().mockResolvedValue(0);
    /** @type {any} */ (globalThis).JournalMediaStore = fakeMediaStore({ pruneOrphans });
    /** @type {any} */ (globalThis).JournalStore = {
      isReady: () => false,
      getState: () => 'degraded',
      collectAllMediaIds: () => ['a'],
    };

    renderHook(() => useJournalMediaSweep());
    await vi.advanceTimersByTimeAsync(4000);

    expect(pruneOrphans).not.toHaveBeenCalled();
  });

  it('the staging sweep and the orphan sweep both run from the same timer, independently', async () => {
    const abortImportReplace = vi.fn().mockResolvedValue(undefined);
    const pruneOrphans = vi.fn().mockResolvedValue(0);
    /** @type {any} */ (globalThis).JournalMediaStore = fakeMediaStore({ abortImportReplace, pruneOrphans });
    /** @type {any} */ (globalThis).JournalStore = {
      isReady: () => true,
      getState: () => 'loaded',
      collectAllMediaIds: () => [],
    };

    renderHook(() => useJournalMediaSweep());
    await vi.advanceTimersByTimeAsync(4000);

    expect(abortImportReplace).toHaveBeenCalledTimes(1);
    expect(pruneOrphans).toHaveBeenCalledTimes(1);
  });
});

/* W7 (sweep 2026-10-13): tab A restores a backup with media; tab B opens. Four
   seconds later B's sweep emptied A's import staging, so A's exact replace
   cleared live media and copied in only what was left. And B's orphan prune runs
   on B's journal, loaded before A's entries landed, so it would reclaim A's
   imported media. The backup Web Lock says a restore is live in another tab. */
describe('useJournalMediaSweep — W7: a restore live in another tab', () => {
  afterEach(() => { delete /** @type {any} */ (navigator.locks).query; });
  /** @param {() => boolean} held */
  function lockState(held) {
    /** @type {any} */ (navigator.locks).query = vi.fn(async () => ({
      held: held() ? [{ name: 'votreader-backup-import', mode: 'exclusive' }] : [], pending: [],
    }));
  }
  function loadedJournal() {
    return { isReady: () => true, getState: () => 'loaded', collectAllMediaIds: () => ['old'] };
  }
  /** Let the sweep's lock look (a microtask chain) settle after the timer fires. */
  async function settle() { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0); }

  it('leaves the staging and the live media alone while another tab holds the backup lock', async () => {
    lockState(() => true);
    const abortImportReplace = vi.fn().mockResolvedValue(undefined);
    const pruneOrphans = vi.fn().mockResolvedValue(0);
    /** @type {any} */ (globalThis).JournalMediaStore = { abortImportReplace, pruneOrphans };
    /** @type {any} */ (globalThis).JournalStore = loadedJournal();

    renderHook(() => useJournalMediaSweep());
    await vi.advanceTimersByTimeAsync(4000);
    await settle();

    expect(abortImportReplace).not.toHaveBeenCalled();
    expect(pruneOrphans).not.toHaveBeenCalled();
  });

  it('skips the orphan prune when a restore was live at boot, even if it ended before the sweep', async () => {
    let held = true;
    lockState(() => held);
    const pruneOrphans = vi.fn().mockResolvedValue(0);
    /** @type {any} */ (globalThis).JournalMediaStore = { abortImportReplace: vi.fn().mockResolvedValue(undefined), pruneOrphans };
    /** @type {any} */ (globalThis).JournalStore = loadedJournal();

    renderHook(() => useJournalMediaSweep());
    await settle();
    held = false;                      // the other tab's restore finished and it reloaded
    await vi.advanceTimersByTimeAsync(4000);
    await settle();

    expect(pruneOrphans).not.toHaveBeenCalled();
  });

  it('sweeps as before when no tab holds the lock', async () => {
    lockState(() => false);
    const abortImportReplace = vi.fn().mockResolvedValue(undefined);
    const pruneOrphans = vi.fn().mockResolvedValue(0);
    /** @type {any} */ (globalThis).JournalMediaStore = { abortImportReplace, pruneOrphans };
    /** @type {any} */ (globalThis).JournalStore = loadedJournal();

    renderHook(() => useJournalMediaSweep());
    await vi.advanceTimersByTimeAsync(4000);
    await settle();

    expect(abortImportReplace).toHaveBeenCalledTimes(1);
    expect(pruneOrphans).toHaveBeenCalledWith(['old'], expect.any(Number));
  });
});

describe('useJournalMediaSweep — W7 round 2: the restoring tab dies while this one is open', () => {
  afterEach(() => { delete /** @type {any} */ (navigator.locks).query; });

  it('sweeps the staging a dead restore left once the lock has stayed free; the orphan prune stays off', async () => {
    localStorage.setItem(RESTORE_INFLIGHT_KEY, 'tok-A');
    let held = true;
    /** @type {any} */ (navigator.locks).query = vi.fn(async () => ({
      held: held ? [{ name: 'votreader-backup-import', mode: 'exclusive' }] : [], pending: [],
    }));
    const abortImportReplace = vi.fn().mockResolvedValue(undefined);
    const pruneOrphans = vi.fn().mockResolvedValue(0);
    /** @type {any} */ (globalThis).JournalMediaStore = { abortImportReplace, pruneOrphans };
    /** @type {any} */ (globalThis).JournalStore = { isReady: () => true, getState: () => 'loaded', collectAllMediaIds: () => [] };

    renderHook(() => useJournalMediaSweep());
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(6000);
    expect(abortImportReplace).not.toHaveBeenCalled();
    held = false;                                  // tab A died: its marker stays, its staging is stale
    await vi.advanceTimersByTimeAsync(5000);

    expect(abortImportReplace).toHaveBeenCalledTimes(1);
    expect(pruneOrphans).not.toHaveBeenCalled();
  });
});

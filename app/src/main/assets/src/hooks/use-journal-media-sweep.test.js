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

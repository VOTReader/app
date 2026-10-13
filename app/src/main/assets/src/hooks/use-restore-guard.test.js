/* useRestoreGuard — boot warning when a restore died mid-apply.
   The write side (marker set before applyFn, removed on completion) is
   covered in SettingsScreen.test.jsx; the shared key literal is pinned on
   BOTH sides because the classic-script seam allows no import between them. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRestoreGuard, RESTORE_INFLIGHT_KEY } from './use-restore-guard.js';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('../utils/toast.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get showToast() { return /** @type {any} */ (globalThis).showToast; } }; });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { delete /** @type {any} */ (globalThis).showToast; });

describe('useRestoreGuard', () => {
  it('pins the key SettingsScreen writes (classic-script seam sync gate)', () => {
    expect(RESTORE_INFLIGHT_KEY).toBe('vot-restore-inflight');
  });

  it('warns once and clears the marker when the last restore never finished', () => {
    localStorage.setItem(RESTORE_INFLIGHT_KEY, '1234');
    const toast = vi.fn();
    /** @type {any} */ (globalThis).showToast = toast;

    renderHook(() => useRestoreGuard());

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatchObject({ id: 'vot-restore-guard', durationMs: 0 });
    expect(toast.mock.calls[0][0].text).toMatch(/restore may not have finished/i);
    // One-shot: the marker is consumed so every later boot stays quiet.
    expect(localStorage.getItem(RESTORE_INFLIGHT_KEY)).toBeNull();
  });

  it('does nothing on a clean boot', () => {
    const toast = vi.fn();
    /** @type {any} */ (globalThis).showToast = toast;

    renderHook(() => useRestoreGuard());

    expect(toast).not.toHaveBeenCalled();
  });

  it('still consumes the marker when the toast system is unavailable', () => {
    localStorage.setItem(RESTORE_INFLIGHT_KEY, '1');

    renderHook(() => useRestoreGuard()); // no showToast global — must not throw

    expect(localStorage.getItem(RESTORE_INFLIGHT_KEY)).toBeNull();
  });
});

/* W7 (sweep 2026-10-13): tab A restores; tab B opens. B used to consume A's live
   marker and show a false "may not have finished" toast. The backup Web Lock says
   whether a restore is live in another tab (utils/backup-lock.js). */
describe('useRestoreGuard — W7: a restore live in another tab', () => {
  afterEach(() => { delete /** @type {any} */ (navigator.locks).query; });
  /** @param {boolean} held */
  function lockState(held) {
    /** @type {any} */ (navigator.locks).query = vi.fn().mockResolvedValue({
      held: held ? [{ name: 'votreader-backup-import', mode: 'exclusive' }] : [], pending: [],
    });
  }

  it('leaves the marker and stays quiet while another tab holds the backup lock', async () => {
    localStorage.setItem(RESTORE_INFLIGHT_KEY, 'tok-A');
    lockState(true);
    const toast = vi.fn();
    /** @type {any} */ (globalThis).showToast = toast;

    renderHook(() => useRestoreGuard());
    await new Promise((r) => setTimeout(r, 0));

    expect(toast).not.toHaveBeenCalled();
    expect(localStorage.getItem(RESTORE_INFLIGHT_KEY)).toBe('tok-A');
  });

  it('still warns and consumes the marker when no tab holds the lock (the restoring tab died)', async () => {
    localStorage.setItem(RESTORE_INFLIGHT_KEY, 'tok-A');
    lockState(false);
    const toast = vi.fn();
    /** @type {any} */ (globalThis).showToast = toast;

    renderHook(() => useRestoreGuard());

    await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(RESTORE_INFLIGHT_KEY)).toBeNull();
  });
});

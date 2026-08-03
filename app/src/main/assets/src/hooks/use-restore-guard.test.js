/* useRestoreGuard — boot warning when a restore died mid-apply.
   The write side (marker set before applyFn, removed on completion) is
   covered in SettingsScreen.test.jsx; the shared key literal is pinned on
   BOTH sides because the classic-script seam allows no import between them. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRestoreGuard, RESTORE_INFLIGHT_KEY } from './use-restore-guard.js';

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

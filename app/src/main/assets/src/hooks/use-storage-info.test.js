/* W2.5 — useStorageInfo tests.
   ────────────────────────────
   Mocks navigator.storage to exercise:
     - estimate() resolves → quota/usage exposed
     - persisted() resolves true → persisted=true
     - persisted() resolves false → persisted=false
     - requestPersist() granted → persisted flips to true
     - requestPersist() denied → persistDenied flips to true
     - feature-detection fallback: navigator.storage undefined → 'unavailable'
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStorageInfo } from './use-storage-info.js';

let _origStorage;

beforeEach(() => {
  _origStorage = /** @type {any} */ (navigator).storage;
});

afterEach(() => {
  // Restore the real (or undefined) navigator.storage
  Object.defineProperty(navigator, 'storage', { value: _origStorage, configurable: true });
  vi.restoreAllMocks();
});

/** Helper: stub navigator.storage with the given methods. */
function stubStorage(impl) {
  Object.defineProperty(navigator, 'storage', { value: impl, configurable: true });
}

describe('useStorageInfo — feature detection', () => {
  it('navigator.storage undefined → status "unavailable"', async () => {
    stubStorage(undefined);
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.quota).toBeNull();
    expect(result.current.usage).toBeNull();
    expect(result.current.persisted).toBeNull();
  });

  it('navigator.storage.estimate missing → status "unavailable"', async () => {
    stubStorage({ /* no estimate method */ });
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });
});

describe('useStorageInfo — estimate + persisted resolution', () => {
  it('populates quota/usage/persisted from the storage API', async () => {
    stubStorage({
      estimate: vi.fn().mockResolvedValue({ quota: 2_400_000_000, usage: 45_000_000 }),
      persisted: vi.fn().mockResolvedValue(true),
    });
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.quota).toBe(2_400_000_000);
    expect(result.current.usage).toBe(45_000_000);
    expect(result.current.persisted).toBe(true);
    expect(result.current.persistDenied).toBe(false);
  });

  it('persisted false → exposed as persisted:false', async () => {
    stubStorage({
      estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 100 }),
      persisted: vi.fn().mockResolvedValue(false),
    });
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.persisted).toBe(false);
  });

  it('estimate rejects → quota/usage null but status still ready', async () => {
    stubStorage({
      estimate: vi.fn().mockRejectedValue(new Error('boom')),
      persisted: vi.fn().mockResolvedValue(false),
    });
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.quota).toBeNull();
    expect(result.current.usage).toBeNull();
  });

  it('persisted() not implemented → defaults to false', async () => {
    stubStorage({
      estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 100 }),
      /* no persisted method */
    });
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.persisted).toBe(false);
  });

  it('estimate returns missing fields → null for missing values', async () => {
    stubStorage({
      estimate: vi.fn().mockResolvedValue({ /* no quota or usage */ }),
      persisted: vi.fn().mockResolvedValue(true),
    });
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.quota).toBeNull();
    expect(result.current.usage).toBeNull();
  });
});

describe('useStorageInfo — requestPersist', () => {
  it('persist granted → persisted flips to true, persistDenied stays false', async () => {
    const persistFn = vi.fn().mockResolvedValue(true);
    stubStorage({
      estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 100 }),
      persisted: vi.fn().mockResolvedValue(false),
      persist: persistFn,
    });
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.persisted).toBe(false);

    await act(async () => { await result.current.requestPersist(); });

    expect(persistFn).toHaveBeenCalledTimes(1);
    expect(result.current.persisted).toBe(true);
    expect(result.current.persistDenied).toBe(false);
  });

  it('persist denied (resolves false) → persistDenied flips to true, persisted stays false', async () => {
    const persistFn = vi.fn().mockResolvedValue(false);
    stubStorage({
      estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 100 }),
      persisted: vi.fn().mockResolvedValue(false),
      persist: persistFn,
    });
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => { await result.current.requestPersist(); });

    expect(result.current.persisted).toBe(false);
    expect(result.current.persistDenied).toBe(true);
  });

  it('persist throws → persistDenied flips to true', async () => {
    const persistFn = vi.fn().mockRejectedValue(new Error('denied'));
    stubStorage({
      estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 100 }),
      persisted: vi.fn().mockResolvedValue(false),
      persist: persistFn,
    });
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => { await result.current.requestPersist(); });

    expect(result.current.persistDenied).toBe(true);
  });

  it('persist() unavailable in API → persistDenied flips to true', async () => {
    stubStorage({
      estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 100 }),
      persisted: vi.fn().mockResolvedValue(false),
      /* no persist method */
    });
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => { await result.current.requestPersist(); });

    expect(result.current.persistDenied).toBe(true);
  });

  it('requestPersist when storage API unavailable → persistDenied flips to true', async () => {
    stubStorage(undefined);
    const { result } = renderHook(() => useStorageInfo());
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    await act(async () => { await result.current.requestPersist(); });

    expect(result.current.persistDenied).toBe(true);
  });
});

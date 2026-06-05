/* W2.7d — useStorageInfo tests (rewired to StorageHealth).
   ────────────────────────────
   The hook now delegates to StorageHealth.getReport() + subscribe/getVersion
   instead of calling navigator.storage directly. Tests stub the StorageHealth
   global to exercise the hook's derived state logic.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStorageInfo } from './use-storage-info.js';

let _listeners;
let _version;
let _report;
let _requestPersistResult;

function _makeReport(overrides) {
  return {
    tier: 'healthy',
    quota: 2_400_000_000,
    usage: 45_000_000,
    persisted: false,
    lastAssessedAt: Date.now(),
    risks: [],
    platform: 'chrome',
    writeFailedThisSession: false,
    privateModeLikely: false,
    ...overrides,
  };
}

beforeEach(() => {
  _listeners = new Set();
  _version = 1;
  _report = _makeReport({});
  _requestPersistResult = true;

  /** @type {any} */ (globalThis).StorageHealth = {
    subscribe: (cb) => { _listeners.add(cb); return () => _listeners.delete(cb); },
    getVersion: () => _version,
    getReport: () => _report,
    requestPersistence: vi.fn(async () => {
      var granted = _requestPersistResult;
      if (granted) {
        _report = { ..._report, persisted: true };
        _version++;
        _listeners.forEach((cb) => cb());
      }
      return granted;
    }),
  };
});

afterEach(() => {
  delete /** @type {any} */ (globalThis).StorageHealth;
});

function _bump(reportOverrides) {
  if (reportOverrides) _report = { ..._report, ...reportOverrides };
  _version++;
  _listeners.forEach((cb) => cb());
}

describe('useStorageInfo — status derivation', () => {
  it('lastAssessedAt=0 → status "loading"', () => {
    _report = _makeReport({ lastAssessedAt: 0 });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.status).toBe('loading');
  });

  it('quota+usage both null → status "unavailable"', () => {
    _report = _makeReport({ quota: null, usage: null });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.status).toBe('unavailable');
    expect(result.current.quota).toBeNull();
    expect(result.current.usage).toBeNull();
  });

  it('quota+usage present → status "ready" with values', () => {
    _report = _makeReport({ quota: 2_400_000_000, usage: 45_000_000 });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.status).toBe('ready');
    expect(result.current.quota).toBe(2_400_000_000);
    expect(result.current.usage).toBe(45_000_000);
  });

  it('quota null but usage present → status "ready"', () => {
    _report = _makeReport({ quota: null, usage: 100 });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.status).toBe('ready');
  });

  it('usage null but quota present → status "ready"', () => {
    _report = _makeReport({ usage: null, quota: 1000 });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.status).toBe('ready');
  });
});

describe('useStorageInfo — persisted state', () => {
  it('report.persisted=true → persisted:true', () => {
    _report = _makeReport({ persisted: true });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.persisted).toBe(true);
    expect(result.current.persistDenied).toBe(false);
  });

  it('report.persisted=false → persisted:false', () => {
    _report = _makeReport({ persisted: false });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.persisted).toBe(false);
  });

  it('report.persisted=null → persisted:null', () => {
    _report = _makeReport({ persisted: null, quota: null, usage: null });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.persisted).toBeNull();
  });
});

describe('useStorageInfo — persistable (Settings button gating)', () => {
  it('not-persisted risk present → persistable:true', () => {
    _report = _makeReport({ persisted: false, risks: ['not-persisted'] });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.persistable).toBe(true);
  });

  it('no not-persisted risk → persistable:false (e.g. Chromium / installed / APK)', () => {
    _report = _makeReport({ persisted: false, risks: [] });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.persistable).toBe(false);
  });

  it('missing risks array → persistable:false (defensive)', () => {
    _report = _makeReport({ persisted: false, risks: undefined });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.persistable).toBe(false);
  });
});

describe('useStorageInfo — requestPersist', () => {
  it('granted → persisted flips to true, persistDenied stays false', async () => {
    _requestPersistResult = true;
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.persisted).toBe(false);

    await act(async () => { await result.current.requestPersist(); });

    expect(result.current.persisted).toBe(true);
    expect(result.current.persistDenied).toBe(false);
  });

  it('denied → persistDenied flips to true, persisted stays false', async () => {
    _requestPersistResult = false;
    const { result } = renderHook(() => useStorageInfo());

    await act(async () => { await result.current.requestPersist(); });

    expect(result.current.persisted).toBe(false);
    expect(result.current.persistDenied).toBe(true);
  });
});

describe('useStorageInfo — reactivity', () => {
  it('re-renders when StorageHealth bumps version', () => {
    _report = _makeReport({ usage: 100 });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.usage).toBe(100);

    act(() => { _bump({ usage: 999 }); });

    expect(result.current.usage).toBe(999);
  });

  it('transitions from loading to ready on version bump', () => {
    _report = _makeReport({ lastAssessedAt: 0 });
    const { result } = renderHook(() => useStorageInfo());
    expect(result.current.status).toBe('loading');

    act(() => { _bump({ lastAssessedAt: Date.now(), quota: 500, usage: 50 }); });

    expect(result.current.status).toBe('ready');
    expect(result.current.quota).toBe(500);
  });
});

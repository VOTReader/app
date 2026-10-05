/* NetStatus (Corbin 2026-10-05: "Disable certain features when offline"): navigator.onLine plus the app's own failed
   requests, recovering on 'online', on a success, or after RETRY_MS. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetStatus, RETRY_MS, isNetworkError } from './net-status.js';

const setOnLine = (v) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

beforeEach(() => { vi.useFakeTimers(); setOnLine(true); NetStatus._reset(); });
afterEach(() => { NetStatus._reset(); vi.useRealTimers(); setOnLine(true); });

describe('NetStatus', () => {
  it('is online by default and offline when the browser says so', () => {
    expect(NetStatus.isOffline()).toBe(false);
    setOnLine(false);
    expect(NetStatus.isOffline()).toBe(true);
  });

  it('a failed request turns it offline even while navigator.onLine is true, and tells subscribers once', () => {
    const cb = vi.fn();
    const off = NetStatus.subscribe(cb);
    NetStatus.reportFailure();
    NetStatus.reportFailure();
    expect(NetStatus.isOffline()).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('recovers on the browser online event', () => {
    const cb = vi.fn();
    const off = NetStatus.subscribe(cb);
    NetStatus.reportFailure();
    window.dispatchEvent(new Event('online'));
    expect(NetStatus.isOffline()).toBe(false);
    expect(cb).toHaveBeenCalledTimes(2);
    off();
  });

  it('recovers on a request that succeeded', () => {
    NetStatus.reportFailure();
    NetStatus.reportOk();
    expect(NetStatus.isOffline()).toBe(false);
  });

  it('offers the features again after RETRY_MS (the next real request asks again)', () => {
    NetStatus.reportFailure();
    vi.advanceTimersByTime(RETRY_MS - 1);
    expect(NetStatus.isOffline()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(NetStatus.isOffline()).toBe(false);
  });

  it('a success never hides the browser saying offline', () => {
    setOnLine(false);
    NetStatus.reportOk();
    expect(NetStatus.isOffline()).toBe(true);
  });

  it('only a network rejection is a failure: not an abort, not an HTTP error', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(false);
    expect(isNetworkError(new Error('lyrics 404'))).toBe(false);
  });
});

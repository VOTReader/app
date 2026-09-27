// @ts-nocheck
/* build-version.js — the page-side half of "which build is actually running?"
 *
 * The service worker is never loaded here: navigator.serviceWorker, MessageChannel
 * and fetch are all stand-ins, so these tests pin the PAGE's contract — every
 * failure path resolves null (Settings must never hang or throw on a missing or
 * old SW), and only a well-formed VERSION reply is believed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBuildVersion, fetchServerBuildVersion, formatBuildVersion } from './build-version.js';

const realSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
const realMC = globalThis.MessageChannel;
const realFetch = globalThis.fetch;

function setServiceWorker(value) {
  Object.defineProperty(navigator, 'serviceWorker', { value, configurable: true, writable: true });
}

/** A MessageChannel stand-in whose port2 is handed to the SW mock. */
class FakeChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { _channel: this };
  }
}

/** A controller that replies (asynchronously) with `reply` on port2. */
function controllerReplying(reply) {
  return {
    postMessage: vi.fn((msg, ports) => {
      const ch = ports[0]._channel;
      queueMicrotask(() => ch.port1.onmessage(reply));
    }),
  };
}

describe('getBuildVersion', () => {
  beforeEach(() => { globalThis.MessageChannel = FakeChannel; });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.MessageChannel = realMC;
    if (realSW) Object.defineProperty(navigator, 'serviceWorker', realSW);
    else delete navigator.serviceWorker;
  });

  it('resolves null when the browser has no serviceWorker (Android WebView)', async () => {
    delete navigator.serviceWorker;
    expect('serviceWorker' in navigator).toBe(false);
    await expect(getBuildVersion()).resolves.toBeNull();
  });

  it('resolves null when no SW controls the page yet (first visit)', async () => {
    setServiceWorker({ controller: null });
    await expect(getBuildVersion()).resolves.toBeNull();
  });

  it('resolves null when MessageChannel cannot be constructed', async () => {
    const ctrl = { postMessage: vi.fn() };
    setServiceWorker({ controller: ctrl });
    globalThis.MessageChannel = function () { throw new Error('no channels'); };
    await expect(getBuildVersion()).resolves.toBeNull();
    expect(ctrl.postMessage).not.toHaveBeenCalled();
  });

  it('asks with GET_VERSION over port2 and returns the VERSION reply', async () => {
    const ctrl = controllerReplying({ data: { type: 'VERSION', cacheVersion: 'v1.0.2-abc', corpusVersion: 'c42' } });
    setServiceWorker({ controller: ctrl });
    await expect(getBuildVersion()).resolves.toEqual({ cacheVersion: 'v1.0.2-abc', corpusVersion: 'c42' });
    const [msg, ports] = ctrl.postMessage.mock.calls[0];
    expect(msg).toEqual({ type: 'GET_VERSION' });
    expect(ports).toHaveLength(1);
  });

  it('coerces a missing corpusVersion to an empty string', async () => {
    setServiceWorker({ controller: controllerReplying({ data: { type: 'VERSION', cacheVersion: 'v1-a' } }) });
    await expect(getBuildVersion()).resolves.toEqual({ cacheVersion: 'v1-a', corpusVersion: '' });
  });

  it.each([
    ['a non-VERSION type', { data: { type: 'OTHER', cacheVersion: 'v1-a' } }],
    ['a non-string cacheVersion', { data: { type: 'VERSION', cacheVersion: 7 } }],
    ['an empty event', { data: null }],
    ['no event at all', undefined],
  ])('resolves null on %s', async (_label, reply) => {
    setServiceWorker({ controller: controllerReplying(reply) });
    await expect(getBuildVersion()).resolves.toBeNull();
  });

  it('resolves null when postMessage throws', async () => {
    setServiceWorker({ controller: { postMessage: () => { throw new Error('detached'); } } });
    await expect(getBuildVersion()).resolves.toBeNull();
  });

  it('times out to null after 3 s when an old SW never answers, and ignores a late reply', async () => {
    vi.useFakeTimers();
    let channel;
    setServiceWorker({ controller: { postMessage: (_m, ports) => { channel = ports[0]._channel; } } });
    const p = getBuildVersion();
    let result = 'pending';
    p.then((v) => { result = v; });
    await vi.advanceTimersByTimeAsync(2999);
    expect(result).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBeNull();
    // A reply arriving after the timeout must not re-resolve with a value.
    channel.port1.onmessage({ data: { type: 'VERSION', cacheVersion: 'late' } });
    await expect(p).resolves.toBeNull();
  });
});

describe('fetchServerBuildVersion', () => {
  afterEach(() => { globalThis.fetch = realFetch; });

  const respond = (text, ok = true) => vi.fn(async () => ({ ok, text: async () => text }));

  it('reads the deployed SW with cache:no-store and scrapes both literals', async () => {
    globalThis.fetch = respond("const CACHE_VERSION = 'v1.0.2-6ace992e72';\nconst CORPUS_VERSION = 'corpus-9';\n");
    await expect(fetchServerBuildVersion()).resolves.toEqual({ cacheVersion: 'v1.0.2-6ace992e72', corpusVersion: 'corpus-9' });
    expect(globalThis.fetch).toHaveBeenCalledWith('./service-worker.js', { cache: 'no-store' });
  });

  it('returns an empty corpusVersion when only CACHE_VERSION is present', async () => {
    globalThis.fetch = respond("const CACHE_VERSION = 'v2-ff';");
    await expect(fetchServerBuildVersion()).resolves.toEqual({ cacheVersion: 'v2-ff', corpusVersion: '' });
  });

  it('returns null when the SW text has no CACHE_VERSION', async () => {
    globalThis.fetch = respond("const CORPUS_VERSION = 'c';");
    await expect(fetchServerBuildVersion()).resolves.toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    globalThis.fetch = respond("const CACHE_VERSION = 'v1-a';", false);
    await expect(fetchServerBuildVersion()).resolves.toBeNull();
  });

  it('returns null when offline (fetch rejects)', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(fetchServerBuildVersion()).resolves.toBeNull();
  });
});

describe('formatBuildVersion', () => {
  it('splits a vX.Y.Z-hash into "version · hash"', () => {
    expect(formatBuildVersion('v1.0.2-6ace992e72')).toBe('v1.0.2 · 6ace992e72');
  });
  it('returns "unknown" for an empty value', () => {
    expect(formatBuildVersion('')).toBe('unknown');
    expect(formatBuildVersion(undefined)).toBe('unknown');
  });
  it('passes through a value that does not match the shape', () => {
    expect(formatBuildVersion('dev-build')).toBe('dev-build');
    expect(formatBuildVersion('v1.0.2-NOTHEX')).toBe('v1.0.2-NOTHEX');
  });
});

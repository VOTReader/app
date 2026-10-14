/* warmMeaningFiles (path to 500, 2026-10-05): on the web the meaning search's files come once,
   in the background, through the service worker's store; offline or refused, nothing throws.
   Sweep W35 (2026-10-13): only through the worker (a page it does not control downloaded ~55 MB
   the worker never stored, and fetched again later), and a file already stored is not read again. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { warmMeaningFiles, warmMeaningSearch } from './sw-register.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete /** @type {any} */ (navigator).serviceWorker;
});

/** navigator.serviceWorker with a controller (or none) that can announce a takeover. */
function stubWorker(/** @type {boolean} */ controlled) {
  const sw = Object.assign(new EventTarget(), { controller: controlled ? {} : null });
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  return sw;
}

/** fetch that names what it was asked for, and a manifest naming three files. */
function stubFetch(/** @type {string[]} */ got) {
  vi.stubGlobal('fetch', async (/** @type {URL} */ u) => {
    got.push(String(u).replace(/^.*\/semantic\//, ''));
    return String(u).endsWith('manifest.json')
      ? { ok: true, json: async () => ({ files: ['vocab.txt', 'model.onnx', 'units-1.bin'] }) }
      : { ok: true, blob: async () => new Blob(['x']) };
  });
}

describe('warmMeaningFiles', () => {
  it('fetches the manifest, then every file it names, reading each through', async () => {
    stubWorker(true);
    const got = [];
    stubFetch(got);
    await warmMeaningFiles();
    expect(got).toEqual(['manifest.json', 'vocab.txt', 'model.onnx', 'units-1.bin']);
  });
  it('offline: asks for nothing', async () => {
    stubWorker(true);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(false);
    await warmMeaningFiles();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('a refused fetch never throws', async () => {
    stubWorker(true);
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(warmMeaningFiles()).resolves.toBeUndefined();
  });
  it('a page the worker does not control asks for nothing: no worker would keep what it read', async () => {
    stubWorker(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await warmMeaningFiles();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('a file already in the worker’s store is not read again', async () => {
    stubWorker(true);
    const got = [];
    stubFetch(got);
    vi.stubGlobal('caches', {
      open: async (/** @type {string} */ name) => ({
        match: async (/** @type {string} */ u) => (name === 'vot-semantic-v1' && /\/(vocab\.txt|model\.onnx)$/.test(String(u)) ? { ok: true } : undefined),
      }),
    });
    await warmMeaningFiles();
    expect(got).toEqual(['manifest.json', 'units-1.bin']);
  });
});

describe('warmMeaningSearch', () => {
  it('a page the worker takes over later warms once it does', async () => {
    vi.useFakeTimers();
    const sw = stubWorker(false);
    const got = [];
    stubFetch(got);
    warmMeaningSearch();
    await vi.advanceTimersByTimeAsync(120 * 1000);
    expect(got).toEqual([]);
    sw.controller = {};
    sw.dispatchEvent(new Event('controllerchange'));
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(got).toEqual(['manifest.json', 'vocab.txt', 'model.onnx', 'units-1.bin']);
  });
});

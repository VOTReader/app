/* warmMeaningFiles (path to 500, 2026-10-05): on the web the meaning search's files come once,
   in the background, through the service worker's store; offline or refused, nothing throws. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { warmMeaningFiles } from './sw-register.js';

afterEach(() => { vi.unstubAllGlobals(); });

describe('warmMeaningFiles', () => {
  it('fetches the manifest, then every file it names, reading each through', async () => {
    const got = [];
    vi.stubGlobal('fetch', async (/** @type {URL} */ u) => {
      got.push(String(u).replace(/^.*\/semantic\//, ''));
      return String(u).endsWith('manifest.json')
        ? { ok: true, json: async () => ({ files: ['vocab.txt', 'model.onnx', 'units-1.bin'] }) }
        : { ok: true, blob: async () => new Blob(['x']) };
    });
    await warmMeaningFiles();
    expect(got).toEqual(['manifest.json', 'vocab.txt', 'model.onnx', 'units-1.bin']);
  });
  it('offline: asks for nothing', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(false);
    await warmMeaningFiles();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('a refused fetch never throws', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(warmMeaningFiles()).resolves.toBeUndefined();
  });
});

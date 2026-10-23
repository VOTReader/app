// audio-lengths: bytes and seconds baked by tools/gen-audio-lengths.py (downloads brief 2026-10-23, 3d).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lengthOf, bytesOf, secondsOf, lengthsLoaded, lengthsSettled } from './audio-lengths.js';

const g = /** @type {any} */ (globalThis);
const U = (asset, tag = 'audio-v1') => 'https://github.com/VOTReader/votreader-assets/releases/download/' + tag + '/' + asset + '.mp3';

afterEach(() => { delete g.AUDIO_LENGTHS; });

describe('audio-lengths', () => {
  it('answers a recording by the asset its URL names, on any tag', () => {
    g.AUDIO_LENGTHS = { 'abc-B': [6_000_000, 375], brm1_ruth_001: [4_000_000, 250] };
    expect(lengthOf(U('abc-B'))).toEqual({ bytes: 6_000_000, seconds: 375 });
    expect(bytesOf(U('brm1_ruth_001', 'audio-brm-v1'))).toBe(4_000_000);
    expect(secondsOf(U('brm1_ruth_001', 'audio-brm-v1'))).toBe(250);
    expect(lengthsLoaded()).toBe(true);
  });

  it('null for what it does not know: another file, not an mp3, a prototype name, no URL', () => {
    g.AUDIO_LENGTHS = { 'abc-B': [6_000_000, 375] };
    expect(lengthOf(U('other'))).toBeNull();
    expect(lengthOf('https://example.org/abc-B.ogg')).toBeNull();
    expect(lengthOf(U('constructor'))).toBeNull();
    expect(lengthOf(null)).toBeNull();
  });

  it('before the table lands it answers null and asks for it once', () => {
    const load = vi.fn(() => new Promise(() => {}));
    g.__makeLazyLoader = vi.fn(() => ({ corpus: { loaded: false, error: false, subscribe: () => () => {}, getVersion: () => 0 }, load }));
    try {
      expect(lengthOf(U('abc-B'))).toBeNull();
      expect(lengthsSettled()).toBe(false);
      expect(g.__makeLazyLoader).toHaveBeenCalledWith('audio-lengths', 'src/data/audio-lengths.js', null);
      expect(load).toHaveBeenCalled();
    } finally {
      delete g.__makeLazyLoader;
    }
  });
});

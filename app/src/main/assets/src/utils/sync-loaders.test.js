// @ts-nocheck -- drives the real module through a fake __makeLazyLoader installed on globalThis.
/* sync-loaders — the two lazy read-along timing files.
   ─────────────────────────────────────────────────────────────────────────
   audio-sync.js (letters) and bible-sync-<edition>.js (Bible) are fetched on
   demand through index.html's __makeLazyLoader factory. This module is the
   ONLY place their path literals live, and that is load-bearing: the deploy
   (tools/list-runtime-src-assets.js) and the APK gate (tools/check-apk-assets.js)
   derive what ships by scanning src/ for exactly these strings, and neither
   scans index.html — which is why the Bible loader moved out of it (c41).

   What these pin: every export is a no-op where the factory is absent (jsdom,
   boot order), one loader per file for the life of the page, the store's
   version is the corpus's own notify, a failed load resolves rather than
   throws, and the Bible key guard admits only `bible-<edition>`. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadAudioSync, audioSyncStore,
  loadBibleSync, bibleSyncStore,
  resetSyncLoadersForTests,
} from './sync-loaders.js';

/** A stand-in for index.html's __makeLazyLoader: records what was asked for
 *  and hands back a corpus whose notify() the test can fire. */
let made;
function installFactory() {
  made = [];
  globalThis.__makeLazyLoader = vi.fn((name, path, finishFn) => {
    const listeners = new Set();
    let version = 0;
    const corpus = {
      loaded: false,
      error: false,
      subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      getVersion() { return version; },
      notify() { this.loaded = true; version += 1; listeners.forEach((cb) => cb()); },
    };
    const l = { name, path, finishFn, corpus, load: vi.fn(() => Promise.resolve()) };
    made.push(l);
    return l;
  });
}
const byPath = (p) => made.find((l) => l.path === p) || null;

beforeEach(() => { resetSyncLoadersForTests(); });
afterEach(() => { resetSyncLoadersForTests(); delete globalThis.__makeLazyLoader; vi.restoreAllMocks(); });

describe('sync-loaders — without the factory', () => {
  it('every export is a no-op when __makeLazyLoader is not on the page', async () => {
    delete globalThis.__makeLazyLoader;
    await expect(loadAudioSync()).resolves.toBeUndefined();
    await expect(loadBibleSync('bible-brm-kjv')).resolves.toBeUndefined();
    expect(audioSyncStore.getVersion()).toBe(0);
    expect(bibleSyncStore.getVersion()).toBe(0);
    const un = audioSyncStore.subscribe(() => {});
    expect(typeof un).toBe('function');
    un();
  });
});

describe('sync-loaders — the letter timings', () => {
  beforeEach(installFactory);

  it('creates ONE loader for src/data/audio-sync.js, however often it is asked', async () => {
    await loadAudioSync();
    await loadAudioSync();
    await loadAudioSync();
    expect(globalThis.__makeLazyLoader).toHaveBeenCalledTimes(1);
    expect(globalThis.__makeLazyLoader).toHaveBeenCalledWith('audio-sync', 'src/data/audio-sync.js', null);
    expect(made).toHaveLength(1);
    expect(byPath('src/data/audio-sync.js').load).toHaveBeenCalledTimes(3);
  });

  it('the store version is the corpus version, and subscribers hear notify()', async () => {
    const cb = vi.fn();
    const un = audioSyncStore.subscribe(cb);
    await loadAudioSync();
    expect(audioSyncStore.getVersion()).toBe(0);
    byPath('src/data/audio-sync.js').corpus.notify();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(audioSyncStore.getVersion()).toBe(1);
    un();
    byPath('src/data/audio-sync.js').corpus.notify();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(audioSyncStore.getVersion()).toBe(2);
  });

  it('subscribing does not fetch — only loadAudioSync() does', () => {
    audioSyncStore.subscribe(() => {});
    const l = byPath('src/data/audio-sync.js');
    expect(l ? l.load.mock.calls.length : 0).toBe(0);
  });

  it('a failed load resolves rather than throws (the wash paints nothing, honestly)', async () => {
    await loadAudioSync();
    byPath('src/data/audio-sync.js').load.mockImplementation(() => Promise.reject(new Error('404')));
    await expect(loadAudioSync()).resolves.toBeUndefined();
  });
});

describe('sync-loaders — the Bible timings', () => {
  beforeEach(installFactory);

  it('one loader per edition, keyed by volKey, path built from the edition', async () => {
    await loadBibleSync('bible-brm-kjv');
    await loadBibleSync('bible-brm-kjv');
    await loadBibleSync('bible-wop-nkjv');
    expect(globalThis.__makeLazyLoader).toHaveBeenCalledTimes(2);
    expect(globalThis.__makeLazyLoader).toHaveBeenNthCalledWith(1, 'bible-sync-brm-kjv', 'src/data/bible-sync-brm-kjv.js', null);
    expect(globalThis.__makeLazyLoader).toHaveBeenNthCalledWith(2, 'bible-sync-wop-nkjv', 'src/data/bible-sync-wop-nkjv.js', null);
    expect(byPath('src/data/bible-sync-brm-kjv.js').load).toHaveBeenCalledTimes(2);
  });

  it('admits only bible-<edition> keys — never a prototype name or a letter volKey', async () => {
    const bad = ['toString', 'constructor', '__proto__', 'one', 'wtlb1', 'bible-', 'bible-BRM', 'bible-brm kjv', '', undefined, null, 42];
    for (const k of bad) {
      await expect(loadBibleSync(k)).resolves.toBeUndefined();
    }
    expect(globalThis.__makeLazyLoader).not.toHaveBeenCalled();
    expect(made).toHaveLength(0);
  });

  it('aggregates every edition into one version counter', async () => {
    const cb = vi.fn();
    const un = bibleSyncStore.subscribe(cb);
    await loadBibleSync('bible-brm-kjv');
    await loadBibleSync('bible-wop-nkjv');
    expect(bibleSyncStore.getVersion()).toBe(0);
    byPath('src/data/bible-sync-brm-kjv.js').corpus.notify();
    expect(bibleSyncStore.getVersion()).toBe(1);
    byPath('src/data/bible-sync-wop-nkjv.js').corpus.notify();
    expect(bibleSyncStore.getVersion()).toBe(2);
    expect(cb).toHaveBeenCalledTimes(2);
    un();
    byPath('src/data/bible-sync-brm-kjv.js').corpus.notify();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('a subscriber that throws does not silence the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    bibleSyncStore.subscribe(bad);
    bibleSyncStore.subscribe(good);
    await loadBibleSync('bible-brm-kjv');
    byPath('src/data/bible-sync-brm-kjv.js').corpus.notify();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it('a failed edition load resolves rather than throws', async () => {
    await loadBibleSync('bible-brm-kjv');
    byPath('src/data/bible-sync-brm-kjv.js').load.mockImplementation(() => Promise.reject(new Error('offline')));
    await expect(loadBibleSync('bible-brm-kjv')).resolves.toBeUndefined();
  });
});

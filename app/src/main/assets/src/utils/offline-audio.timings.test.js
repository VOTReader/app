/* audit-listen item 26: in the browser a download also fetches its read-along timings, so a recording saved with
   "Download all" and never played online still lights the text offline (the service worker keeps every
   src/data/*.js it has served). The phone app ships the timings as assets and warms nothing. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { loaders, web } = vi.hoisted(() => ({
  loaders: { loadAudioSync: vi.fn(), loadBibleSync: vi.fn(), loadAudioSyncSections: vi.fn() },
  web: { supported: () => true, offlineAudioState: () => JSON.stringify({ items: [], totalBytes: 0, freeBytes: 1e9, active: null, queued: [] }), offlineAudioSave: vi.fn() },
}));
vi.mock('./sync-loaders.js', () => loaders);
vi.mock('./offline-audio-web.js', () => ({ WebOfflineAudio: web }));
vi.mock('./audio-track.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    // The playing edition comes from the recording (the wash's rule); here: a key that names one.
    resolveBibleAudio: ({ track }) => ({ paint: track.key.indexOf('bible-web:') === 0 ? { volKey: 'bible-web' } : null }),
  };
});

import { OfflineAudio } from './offline-audio.js';

const REL = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/';
const LETTER = { url: REL + 'one-christmas-B.mp3', key: 'one:christmas', title: 'Christmas' };
const LETTER2 = { url: REL + 'one-wide-path-B.mp3', key: 'one:wide-path', title: 'Wide Path' };
const BIBLE = { url: REL + 'web-gen-1.mp3', key: 'bible-web:gen', title: 'Genesis 1' };
const UNKNOWN_ED = { url: REL + 'x-gen-1.mp3', key: 'bible-x:gen', title: 'Genesis 1' };
const COMPILATION = { url: REL + 'wtlb1-part-1.mp3', key: '', title: 'Part 1' };

beforeEach(() => { OfflineAudio._reset(); Object.values(loaders).forEach((f) => f.mockClear()); });
afterEach(() => { delete /** @type {any} */ (window).AndroidBridge; OfflineAudio._reset(); });

describe('a web download warms its read-along timings (item 26)', () => {
  it('letters, a Bible chapter (its playing edition) and a compilation each ask for their file once', () => {
    expect(OfflineAudio.download([LETTER, LETTER2, BIBLE, UNKNOWN_ED, COMPILATION])).toBe(true);
    expect(web.offlineAudioSave).toHaveBeenCalled();
    expect(loaders.loadAudioSync).toHaveBeenCalledTimes(1);
    expect(loaders.loadAudioSyncSections).toHaveBeenCalledTimes(1);
    expect(loaders.loadBibleSync.mock.calls).toEqual([['bible-web']]);
  });

  it('a letters-only download fetches no Bible or compilation timings', () => {
    OfflineAudio.download([LETTER]);
    expect(loaders.loadAudioSync).toHaveBeenCalledTimes(1);
    expect(loaders.loadAudioSyncSections).not.toHaveBeenCalled();
    expect(loaders.loadBibleSync).not.toHaveBeenCalled();
  });

  it('the phone app warms nothing (its timings are assets)', () => {
    /** @type {any} */ (window).AndroidBridge = {
      offlineAudioState: () => JSON.stringify({ items: [], totalBytes: 0, freeBytes: 1e9, active: null, queued: [] }),
      offlineAudioSave: vi.fn(), offlineAudioRemove: vi.fn(), offlineAudioCancel: vi.fn(), offlineAudioSizes: vi.fn(),
    };
    OfflineAudio.refresh();
    expect(OfflineAudio.download([LETTER, BIBLE, COMPILATION])).toBe(true);
    expect(loaders.loadAudioSync).not.toHaveBeenCalled();
    expect(loaders.loadAudioSyncSections).not.toHaveBeenCalled();
    expect(loaders.loadBibleSync).not.toHaveBeenCalled();
  });
});

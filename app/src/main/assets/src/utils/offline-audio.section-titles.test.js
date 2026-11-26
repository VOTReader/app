// @ts-nocheck -- drives the REAL OfflineAudio mirror over a fake phone store, and the real catalog over a fake lazy loader.
/* A WTLB compilation's name in Downloads (labels-r3 follow-up). A compilation track is named "Section 2" while the
   read-along timings are on their way (sectionTracks), and the queue takes "Section 2 · 31–58" when they land
   (sections.js). A Download asked before they land handed the store the bare name, the store kept it on disk, and
   nothing read it again: Downloads said "Section 2" for good. Now the mirror names a compilation file by what the
   player calls it now (sectionTitleOf, from the same timings), at the hand-over and wherever a download is listed;
   a name it cannot work out yet keeps what the store has. Nothing is downloaded again, nothing stored is rewritten.
   Synthetic fixtures only. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OfflineAudio } from './offline-audio.js';
import { sectionTracks, sectionTitleOf } from './audio-player/catalog.js';
import { trackUrl } from './audio-player/core.js';
import { loadAudioSyncSections, resetSyncLoadersForTests } from './sync-loaders.js';

const A1 = 'sec-part2-s1';
const A2 = 'sec-part2-s2';
const LABEL = 'Words To Live By: Part Two';
/* As AUDIO_SECTIONS labels it by hand: Section 2 really reads Entries 31-58. */
const HAND = [['Section 1 · Intro–28', A1, 'V'], ['Section 2 · 29–56', A2, 'V']];
const ENTRIES = [{ id: 'introduction', num: 1 }, ...Array.from({ length: 60 }, (_, i) => ({ id: 'e' + (i + 2), num: i + 2 }))];
const TABLE = {
  [A1]: { 'wtlb2:introduction': [[1, 0, 0, 9, 0]], 'wtlb2:e30': [[50, 0, 0, 9, 0]] },
  [A2]: { 'wtlb2:e31': [[1, 0, 0, 9, 0]], 'wtlb2:e58': [[50, 0, 0, 9, 0]] },
};
const LETTER = { url: 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/one-x-B.mp3', key: 'one:x', title: 'A Letter' };

let loader = null;
function installFactory() {
  globalThis.__makeLazyLoader = vi.fn((name, path) => {
    const listeners = new Set();
    let version = 0;
    const corpus = {
      loaded: false, error: false,
      subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      getVersion() { return version; },
      land() { this.loaded = true; version += 1; listeners.forEach((cb) => cb()); },
      fail() { this.error = true; version += 1; listeners.forEach((cb) => cb()); },
    };
    const l = { name, path, corpus, load: vi.fn(() => new Promise(() => {})) };
    if (name === 'audio-sync-sections') loader = l;
    return l;
  });
}
/** The timings land (the player asks for them when it plays a compilation, if nothing here did). */
function land() { if (!loader) void loadAudioSyncSections(); globalThis.AUDIO_SYNC_SECTIONS = TABLE; loader.corpus.land(); }
function fail() { if (!loader) void loadAudioSyncSections(); loader.corpus.fail(); }

/** The phone app's store: keeps each download as it was asked (title included), as OfflineAudioStore does. */
function fakePhone({ items = [] } = {}) {
  const store = { items: items.map((it) => ({ bytes: 5, savedAt: 1, ...it })), queue: [] };
  const b = {
    saves: [],
    offlineAudioState: () => JSON.stringify({ items: store.items, totalBytes: 0, freeBytes: 1e9, actives: [],
      queued: store.queue.map((q) => q.url), queue: store.queue }),
    offlineAudioSave: (json) => {
      for (const it of JSON.parse(json)) { b.saves.push(it); store.queue.push({ url: it.url, key: it.key, title: it.title, pri: 0 }); }
    },
    offlineAudioRemove() {}, offlineAudioCancel() {}, offlineAudioSizes() {},
    finish(url) {
      const q = store.queue.find((x) => x.url === url);
      store.queue = store.queue.filter((x) => x !== q);
      store.items.push({ url, key: q.key, title: q.title, bytes: 5, savedAt: 2 });
      window.__votOfflineAudio(JSON.stringify({ type: 'done', url }));
    },
    store,
  };
  window.AndroidBridge = b;
  return b;
}
const titleOf = (list, url) => (list.find((t) => t.url === url) || {}).title;
const S2 = () => trackUrl(A2);

beforeEach(() => {
  OfflineAudio._reset();
  globalThis.AUDIO_SECTIONS = { wtlb2: HAND };
  globalThis.COL_BY_KEY = new Map([['wtlb2', { volKey: 'wtlb2', label: LABEL, kind: 'wtlb' }]]);
  globalThis.colLetterArr = () => ENTRIES;
});

afterEach(() => {
  OfflineAudio._reset();
  resetSyncLoadersForTests();
  loader = null;
  delete window.AndroidBridge;
  for (const k of ['AUDIO_SECTIONS', 'AUDIO_SYNC_SECTIONS', 'COL_BY_KEY', 'colLetterArr', '__makeLazyLoader', '__votCorpus']) delete globalThis[k];
  vi.restoreAllMocks();
});

describe('a compilation downloaded before its timings land', () => {
  it('is named by them once they land: on its way, and on the phone', () => {
    installFactory();
    const phone = fakePhone();
    OfflineAudio.refresh();
    // What playSection queues (and Keep the next 3 ready hands over) while the timings are on their way.
    const track = sectionTracks('wtlb2', LABEL)[1];
    expect(track.title).toBe('Section 2');
    expect(OfflineAudio.download([{ url: track.url, key: '', title: track.title }])).toBe(true);
    expect(titleOf(OfflineAudio.queue(), S2())).toBe('Section 2');
    const heard = vi.fn();
    OfflineAudio.subscribe(heard);
    land();
    expect(titleOf(OfflineAudio.queue(), S2())).toBe('Section 2 · 31–58');
    expect(heard).toHaveBeenCalled();   // the screens listing it draw again
    phone.finish(S2());
    expect(titleOf(OfflineAudio.items(), S2())).toBe('Section 2 · 31–58');
    // Nothing downloaded again for a name.
    expect(phone.saves.map((s) => s.url)).toEqual([S2()]);
  });

  it('on the "will try again" list too', () => {
    installFactory();
    fakePhone();
    OfflineAudio.refresh();
    OfflineAudio.download([{ url: S2(), key: '', title: 'Section 2' }]);
    window.__votOfflineAudio(JSON.stringify({ type: 'failed', url: S2(), reason: 'network' }));
    land();
    expect(titleOf(OfflineAudio.pending().failed, S2())).toBe('Section 2 · 31–58');
    expect(titleOf(OfflineAudio.later(), S2())).toBe('Section 2 · 31–58');
  });

  it('one already on the phone with the bare name is named right on the next load, and nothing is written', () => {
    installFactory();
    const phone = fakePhone({ items: [{ url: S2(), key: '', title: 'Section 2' }] });
    OfflineAudio.refresh();
    expect(titleOf(OfflineAudio.items(), S2())).toBe('Section 2');
    // Listing it asks for the timings (they name it); an old hand range saved before labels-r3 is put right too.
    expect(loader && loader.load).toHaveBeenCalled();
    land();
    expect(titleOf(OfflineAudio.items(), S2())).toBe('Section 2 · 31–58');
    expect(phone.saves).toEqual([]);
  });

  it('while the timings load, a name saved with its synced range is kept, not cut back to the bare name', () => {
    installFactory();
    fakePhone({ items: [{ url: S2(), key: '', title: 'Section 2 · 31–58' }] });
    OfflineAudio.refresh();
    expect(titleOf(OfflineAudio.items(), S2())).toBe('Section 2 · 31–58');
  });

  it('when the timings fail to load, it takes the hand label, as the player does', () => {
    installFactory();
    fakePhone({ items: [{ url: S2(), key: '', title: 'Section 2' }] });
    OfflineAudio.refresh();
    OfflineAudio.items();
    fail();
    expect(titleOf(OfflineAudio.items(), S2())).toBe('Section 2 · 29–56');
  });
});

describe('a compilation downloaded with the timings in', () => {
  it('goes to the phone under the synced name, whatever title the caller had (a star saved with the hand range)', () => {
    installFactory();
    const phone = fakePhone();
    OfflineAudio.refresh();
    globalThis.AUDIO_SYNC_SECTIONS = TABLE;
    OfflineAudio.download([{ url: S2(), key: '', title: 'Section 2 · 29–56' }]);
    expect(phone.saves.map((s) => s.title)).toEqual(['Section 2 · 31–58']);
  });

  it('with the entries the timings name not loaded yet, keeps what it has; named once they are', () => {
    installFactory();
    fakePhone({ items: [{ url: S2(), key: '', title: 'Section 2' }] });
    globalThis.__votCorpus = { loaded: false, error: false };
    globalThis.colLetterArr = () => null;
    globalThis.AUDIO_SYNC_SECTIONS = { ...TABLE };   // timings of their own: a list worked out once is kept per timings
    OfflineAudio.refresh();
    expect(sectionTitleOf(S2())).toBe(null);
    expect(titleOf(OfflineAudio.items(), S2())).toBe('Section 2');
    globalThis.__votCorpus.loaded = true;
    globalThis.colLetterArr = () => ENTRIES;
    expect(titleOf(OfflineAudio.items(), S2())).toBe('Section 2 · 31–58');
  });
});

describe('what is not a compilation', () => {
  it('a letter keeps its own title, and asks for no compilation timings', () => {
    installFactory();
    const phone = fakePhone({ items: [{ ...LETTER }] });
    OfflineAudio.refresh();
    expect(titleOf(OfflineAudio.items(), LETTER.url)).toBe('A Letter');
    expect(loader).toBe(null);
    expect(sectionTitleOf(LETTER.url)).toBe(null);
    OfflineAudio.download([{ ...LETTER, url: LETTER.url.replace('one-x', 'one-y'), title: 'Another' }]);
    expect(phone.saves.map((s) => s.title)).toEqual(['Another']);
  });
});

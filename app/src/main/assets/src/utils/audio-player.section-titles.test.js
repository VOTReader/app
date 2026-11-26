// @ts-nocheck -- drives the REAL AudioPlayer singleton through a fake media element and a fake lazy loader.
/* A WTLB compilation's title in the player (r3 review, reader-behaviour-n4 follow-up). A section track's title is
   copied into the queue when it is queued or restored, and the saved snapshot keeps it. Before this, a compilation
   queued before audio-sync-sections.js landed kept its hand range ("Section 2 · 29–56", two entries behind) in the
   mini-player and Up next for the whole session. Now: names only until the timings land, then the synced range;
   the hand label again if they fail. syncedSections and its cache are pinned here too. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioPlayer } from './audio-player.js';
import { syncedSections } from './audio-player/catalog.js';
import * as core from './audio-player/core.js';
import { trackUrl } from './audio-player/core.js';
import { resetSyncLoadersForTests } from './sync-loaders.js';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this._src = ''; this.currentTime = 0; this.duration = 0; this.paused = true; this.readyState = 0;
    this.preload = ''; this.error = null; this.defaultPlaybackRate = 1; this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const A1 = 'sec-part2-s1';
const A2 = 'sec-part2-s2';
/* WTLB Part Two as AUDIO_SECTIONS labels it by hand: Section 2 really reads Entries 31-58. */
const HAND = [['Section 1 · Intro–28', A1, 'V'], ['Section 2 · 29–56', A2, 'V']];
const ENTRIES = [{ id: 'introduction', num: 1 }, ...Array.from({ length: 60 }, (_, i) => ({ id: 'e' + (i + 2), num: i + 2 }))];
const TABLE = {
  [A1]: { 'wtlb2:introduction': [[1, 0, 0, 9, 0]], 'wtlb2:e30': [[50, 0, 0, 9, 0]] },
  [A2]: { 'wtlb2:e31': [[1, 0, 0, 9, 0]], 'wtlb2:e58': [[50, 0, 0, 9, 0]] },
};

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
    if (name === 'audio-sync-sections') loader = { name, path, corpus, load: vi.fn(() => new Promise(() => {})) };
    return { name, path, corpus, load: () => new Promise(() => {}), ...(name === 'audio-sync-sections' ? loader : {}) };
  });
}
const titles = () => AudioPlayer.getState().queue.map((t) => t.title);

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = {};
  globalThis.AUDIO_SECTIONS = { wtlb2: HAND };
  globalThis.COL_BY_KEY = new Map([['wtlb2', { volKey: 'wtlb2', label: 'Words To Live By: Part Two', kind: 'wtlb' }]]);
  globalThis.colLetterArr = () => ENTRIES;
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});

afterEach(() => {
  AudioPlayer.stop();
  resetSyncLoadersForTests();
  loader = null;
  for (const k of ['Audio', 'AUDIO_MANIFEST', 'AUDIO_SECTIONS', 'AUDIO_SYNC_SECTIONS', 'COL_BY_KEY', 'colLetterArr',
    '__makeLazyLoader']) delete globalThis[k];
  localStorage.removeItem('vot-audio-pos');
  vi.restoreAllMocks();
});

describe('syncedSections: a compilation list labelled from its synced rows', () => {
  it('with no timings, is the list as AUDIO_SECTIONS has it', () => {
    expect(syncedSections(HAND)).toBe(HAND);
  });

  it('with the timings in, names the entries each file reads, and hands back the same array until they change', () => {
    globalThis.AUDIO_SYNC_SECTIONS = TABLE;
    const first = syncedSections(HAND);
    expect(first.map((s) => s[0])).toEqual(['Section 1 · Intro–30', 'Section 2 · 31–58']);
    expect(first[0][1]).toBe(A1);
    expect(syncedSections(HAND)).toBe(first);
    // Another list is its own cache entry; new timings are worked out again.
    const copy = HAND.map((s) => [...s]);
    expect(syncedSections(copy)).not.toBe(first);
    expect(syncedSections(copy)).toEqual(first);
    globalThis.AUDIO_SYNC_SECTIONS = { ...TABLE };
    const again = syncedSections(HAND);
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });

  it('asked before the entries land, is the hand list, and is worked out once they have (not kept as the hand list)', () => {
    globalThis.AUDIO_SYNC_SECTIONS = { ...TABLE };
    globalThis.colLetterArr = () => null;
    expect(syncedSections(HAND)).toBe(HAND);
    globalThis.colLetterArr = () => ENTRIES;
    expect(syncedSections(HAND).map((s) => s[0])).toEqual(['Section 1 · Intro–30', 'Section 2 · 31–58']);
  });
});

describe('the player names a compilation by what it reads', () => {
  it('queued before the timings land: names only, then the synced range once they do', () => {
    installFactory();
    AudioPlayer.playSection('wtlb2', 1, 'Words To Live By: Part Two');
    expect(titles()).toEqual(['Section 2']);
    globalThis.AUDIO_SYNC_SECTIONS = TABLE;
    loader.corpus.land();
    expect(titles()).toEqual(['Section 2 · 31–58']);
  });

  it('played from Downloads (key \'\') before the timings land: the synced range once they do', () => {
    installFactory();
    AudioPlayer.playTrack({ key: '', title: 'Section 2', url: trackUrl(A2), sub: null, readerCode: '', partLabel: null });
    expect(AudioPlayer.getState().queue.map((t) => t.key)).toEqual([null]);
    expect(titles()).toEqual(['Section 2']);
    globalThis.AUDIO_SYNC_SECTIONS = TABLE;
    loader.corpus.land();
    expect(titles()).toEqual(['Section 2 · 31–58']);
  });

  it('added to an idle queue: the synced range once the timings land', () => {
    installFactory();
    expect(AudioPlayer.addToQueue({ key: '', title: 'Section 1', url: trackUrl(A1) })).toBe(true);
    expect(titles()).toEqual(['Section 1']);
    globalThis.AUDIO_SYNC_SECTIONS = TABLE;
    loader.corpus.land();
    expect(titles()).toEqual(['Section 1 · Intro–30']);
  });

  it('removed before the timings land and put back after (Up next\'s Undo): the synced range, and no listener sees the edit half done', () => {
    installFactory();
    AudioPlayer.playSection('wtlb2', 0, 'Words To Live By: Part Two');
    const removed = AudioPlayer.getState().queue[1];
    expect(AudioPlayer.removeUpcoming(1)).toBe(true);
    globalThis.AUDIO_SYNC_SECTIONS = TABLE;
    loader.corpus.land();
    expect(titles()).toEqual(['Section 1 · Intro–30']);
    /** @type {Array<string | null>} */
    const seen = [];
    const off = AudioPlayer.subscribe(() => { seen.push(core._source ? core._source.mode : null); });
    try {
      expect(AudioPlayer.insertUpcoming(1, removed)).toBe(true);
    } finally { off(); }
    expect(titles()).toEqual(['Section 1 · Intro–30', 'Section 2 · 31–58']);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((m) => m === core._source.mode)).toBe(true);
  });

  it('when the timings fail to load, the hand label comes back', () => {
    installFactory();
    AudioPlayer.playSection('wtlb2', 0, 'Words To Live By: Part Two');
    expect(titles()).toEqual(['Section 1', 'Section 2']);
    loader.corpus.fail();
    expect(titles()).toEqual(['Section 1 · Intro–28', 'Section 2 · 29–56']);
  });

  it('with the timings already in, queues the synced range', () => {
    installFactory();
    globalThis.AUDIO_SYNC_SECTIONS = TABLE;
    AudioPlayer.playSection('wtlb2', 0, 'Words To Live By: Part Two');
    expect(titles()).toEqual(['Section 1 · Intro–30', 'Section 2 · 31–58']);
  });

  it('a restored compilation never shows the hand range its snapshot saved', async () => {
    installFactory();
    localStorage.setItem('vot-audio-pos', JSON.stringify({
      v: 2, mode: 'section', volKey: 'wtlb2', label: 'Words To Live By: Part Two', startIndex: 1, qi: 0, time: 90,
      track: { key: null, title: 'Section 2 · 29–56', sub: 'Words To Live By: Part Two', url: trackUrl(A2), readerCode: 'V', partLabel: null },
    }));
    vi.resetModules();
    const fresh = (await import('./audio-player.js')).AudioPlayer;
    try {
      expect(fresh.getState().queue.map((t) => t.title)).toEqual(['Section 2']);
      globalThis.AUDIO_SYNC_SECTIONS = TABLE;
      loader.corpus.land();
      expect(fresh.getState().queue.map((t) => t.title)).toEqual(['Section 2 · 31–58']);
    } finally {
      fresh.stop();
      (await import('./sync-loaders.js')).resetSyncLoadersForTests();
    }
  });
});

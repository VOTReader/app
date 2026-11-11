/* offline-audio, the saved queue's page side (dl-d2, downloads brief 3f and 7 item 1).
   ────────────────────────────────────────────────────────────────────────────────────────────────────────
   A whole edition (1,189 chapters) goes to the phone 400 urls a call: an older phone app took 400 and dropped
   the rest silently while every row said Downloading. The phone's queue says when it is paused, why it waits,
   what is left and how far the batch is; the page mirrors those words and can Pause / Resume all. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflineAudio } from './offline-audio.js';

const url = (i) => `https://github.com/VOTReader/votreader-assets/releases/download/audio-bible-v1/kjv-c${i}.mp3`;
const list = (n) => Array.from({ length: n }, (_, i) => ({ url: url(i + 1), key: `bible-kjv-${i + 1}`, title: `Chapter ${i + 1}`, bytes: 1000 + i }));

/** @type {any} */ let state;
function fakeBridge(extra = {}) {
  state = { items: [], totalBytes: 0, freeBytes: 5e9, active: null, queued: [] };
  const b = {
    offlineAudioState: vi.fn(() => JSON.stringify(state)),
    offlineAudioSave: vi.fn(),
    offlineAudioRemove: vi.fn(),
    offlineAudioCancel: vi.fn(),
    offlineAudioSizes: vi.fn(),
    offlineAudioPause: vi.fn(() => { state.paused = true; state.reason = 'paused'; }),
    offlineAudioResume: vi.fn(() => { state.paused = false; state.reason = null; }),
    ...extra,
  };
  /** @type {any} */ (window).AndroidBridge = b;
  return b;
}
const send = (o) => /** @type {any} */ (window).__votOfflineAudio(JSON.stringify(o));

beforeEach(() => { OfflineAudio._reset(); });
afterEach(() => { delete /** @type {any} */ (window).AndroidBridge; OfflineAudio._reset(); });

describe('offline-audio, a whole edition in one Download (dl-d2)', () => {
  it('hands 1,189 urls to the phone 400 at a time, with their bytes, and shows every one queued', () => {
    const b = fakeBridge();
    expect(OfflineAudio.download(list(1189))).toBe(true);
    const calls = b.offlineAudioSave.mock.calls.map((c) => JSON.parse(c[0]));
    expect(calls.map((c) => c.length)).toEqual([400, 400, 389]);
    expect(calls.flat().map((t) => t.url)).toEqual(list(1189).map((t) => t.url));
    expect(calls[0][0]).toEqual({ url: url(1), key: 'bible-kjv-1', title: 'Chapter 1', bytes: 1000, pri: 'bulk' });
    expect(OfflineAudio.statusOf(url(1189))).toBe('queued');
  });

  it('a phone app that refuses a later call leaves only what it took marked queued', () => {
    let n = 0;
    fakeBridge({ offlineAudioSave: vi.fn(() => { if (++n === 2) throw new Error('bridge'); }) });
    expect(OfflineAudio.download(list(900))).toBe(true);
    expect(OfflineAudio.statusOf(url(400))).toBe('queued');
    expect(OfflineAudio.statusOf(url(401))).toBe('none');
  });

  // dl-rework E (defect 31): a hand-over that stopped midway still read as success, and nothing said what was left out.
  it('a hand-over that stops midway says what was not queued, and keeps it for a Try again', () => {
    let n = 0;
    const b = fakeBridge({ offlineAudioSave: vi.fn(() => { if (++n === 2) throw new Error('bridge'); }) });
    OfflineAudio.download(list(900));
    expect(OfflineAudio.unsent().map((t) => t.url)).toEqual(list(900).slice(400).map((t) => t.url));
    expect(OfflineAudio.news().text).toBe('500 of 900 were not added to the downloads. Try again.');
    b.offlineAudioSave.mockImplementation(() => {});
    OfflineAudio.download(OfflineAudio.unsent());
    expect(OfflineAudio.unsent()).toEqual([]);
    expect(OfflineAudio.statusOf(url(900))).toBe('queued');
  });

  it('priorities: a few files are a tap, a set is bulk, automatic ones and kept songs go last; a caller may say', () => {
    const b = fakeBridge();
    OfflineAudio.download(list(2));
    OfflineAudio.download(list(10).slice(2));
    OfflineAudio.download([{ url: url(20), key: 'k', title: 't', wifi: true }]);
    OfflineAudio.download([{ url: 'https://votreader.github.io/songs-1/0123456789ab.mp3', key: 'song', title: 's' }]);
    OfflineAudio.download([{ url: url(30), key: 'k', title: 't' }], { priority: 'bulk' });
    const pri = b.offlineAudioSave.mock.calls.map((c) => JSON.parse(c[0])[0].pri);
    expect(pri).toEqual(['tap', 'bulk', 'auto', 'auto', 'bulk']);
  });

  it('remove and cancel go 400 at a time too; everything (*) is one call', () => {
    const b = fakeBridge();
    OfflineAudio.remove(list(900).map((t) => t.url));
    OfflineAudio.cancel(list(401).map((t) => t.url));
    expect(b.offlineAudioRemove.mock.calls.map((c) => JSON.parse(c[0]).length)).toEqual([400, 400, 100]);
    expect(b.offlineAudioCancel.mock.calls.map((c) => JSON.parse(c[0]).length)).toEqual([400, 1]);
    b.offlineAudioRemove.mockClear();
    OfflineAudio.removeAll();
    expect(b.offlineAudioRemove.mock.calls).toEqual([['["*"]']]);
  });
});

describe('offline-audio, the saved queue\'s words (dl-d2)', () => {
  it('mirrors paused, the reason, what is left and the batch', () => {
    fakeBridge();
    Object.assign(state, { queued: [url(2)], paused: false, reason: 'space', left: { count: 28, bytes: 214e6, unknown: 1 }, batch: { done: 3, total: 31, failed: 0 } });
    OfflineAudio.refresh();
    expect(OfflineAudio.paused()).toBe(false);
    expect(OfflineAudio.reason()).toBe('space');
    expect(OfflineAudio.left()).toEqual({ count: 28, bytes: 214e6, unknown: 1 });
    expect(OfflineAudio.batch()).toEqual(expect.objectContaining({ done: 3, total: 31, failed: 0 }));
  });

  // dl-rework E (defects 19, 26): the batch by bytes with both counts, a time left, and failures from the store.
  it('reads the batch by bytes, a time left once a rate is known, and the will-try-again list across a restart', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      fakeBridge();
      Object.assign(state, {
        queued: [url(5)], actives: [{ url: url(4), bytes: 0, total: 4e6 }], left: { count: 2, bytes: 6e6, unknown: 0 },
        batch: { done: 3, total: 5, failed: 1, bytes: 20e6, doneBytes: 12e6 },
        later: [{ url: url(9), key: 'bible-kjv-9', title: 'Chapter 9', reason: 'server', status: 503, tries: 5, at: 1_600_000 }],
        need: 0, closedRuns: true,
      });
      OfflineAudio.refresh();
      expect(OfflineAudio.overall()).toEqual(expect.objectContaining({ done: 3, total: 5, doneBytes: 12e6, totalBytes: 20e6, secondsLeft: null }));
      vi.setSystemTime(1_020_000);
      send({ type: 'progress', url: url(4), bytes: 2e6, total: 4e6 });   // 2 MB in 20 s: 100 kB/s
      const o = OfflineAudio.overall();
      expect(o.doneBytes).toBe(14e6);
      expect(Math.round(o.rate)).toBe(100000);
      expect(Math.round(/** @type {number} */ (o.secondsLeft))).toBe(60);
      expect(OfflineAudio.statusOf(url(9))).toBe('failed');
      expect(OfflineAudio.failureOf(url(9))).toBe('server');
      expect(OfflineAudio.failureStatusOf(url(9))).toBe(503);
      expect(OfflineAudio.pending().failed.map((t) => t.title)).toEqual(['Chapter 9']);
      expect(OfflineAudio.runsClosed()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an older phone app without the fields reads as not paused, nothing left', () => {
    fakeBridge();
    OfflineAudio.refresh();
    expect(OfflineAudio.paused()).toBe(false);
    expect(OfflineAudio.reason()).toBe(null);
    expect(OfflineAudio.left()).toEqual({ count: 0, bytes: 0, unknown: 0 });
  });

  it('lists the queue in order, the one downloading first, with what each was asked as', () => {
    fakeBridge();
    OfflineAudio.download(list(3));
    Object.assign(state, { active: { url: url(2), bytes: 10, total: 100 }, queued: [url(1), url(3), url(9)] });
    OfflineAudio.refresh();
    expect(OfflineAudio.queue().map((t) => t.url)).toEqual([url(2), url(1), url(3), url(9)]);
    expect(OfflineAudio.queue()[0].title).toBe('Chapter 2');
    expect(OfflineAudio.queue()[3]).toEqual({ url: url(9), key: '', title: '' });
  });

  it('Pause and Resume all go to the phone and re-read its state', () => {
    const b = fakeBridge();
    expect(OfflineAudio.pause()).toBe(true);
    expect(b.offlineAudioPause).toHaveBeenCalledTimes(1);
    expect(OfflineAudio.paused()).toBe(true);
    expect(OfflineAudio.reason()).toBe('paused');
    expect(OfflineAudio.resume()).toBe(true);
    expect(OfflineAudio.paused()).toBe(false);
  });

  it('an older phone app with no Pause says so (false), never throws', () => {
    fakeBridge({ offlineAudioPause: undefined, offlineAudioResume: undefined });
    expect(OfflineAudio.pause()).toBe(false);
    expect(OfflineAudio.resume()).toBe(false);
  });

  it('a wait for room tells a screen reader once, and the rows re-read', () => {
    fakeBridge();
    OfflineAudio.refresh();
    const cb = vi.fn();
    OfflineAudio.subscribe(cb);
    Object.assign(state, { queued: [url(1)], reason: 'space' });
    const before = OfflineAudio.news().seq;
    send({ type: 'waiting', url: url(1), reason: 'space' });
    expect(OfflineAudio.news().text).toMatch(/Not enough room/);
    expect(OfflineAudio.reason()).toBe('space');
    expect(cb).toHaveBeenCalled();
    send({ type: 'waiting', url: url(1), reason: 'space' });
    expect(OfflineAudio.news().seq).toBe(before + 1);
  });
});

/* h1104-19: the phone's queue counts every item in it, songs being kept too (song-keep queues them there), so the
   Downloads strip and the Library row said "Downloading 1 of 40 · 40 recordings to go" for 40 songs, and Cancel
   (which leaves songs alone by design) left the strip up. What is left is the recordings'. */
describe('offline-audio, what is left counts recordings, not songs being kept (h1104-19)', () => {
  const song = (i) => 'https://votreader.github.io/songs-1/' + String(i).padStart(12, 'a') + '.mp3';
  it('songs on their way are not recordings to go', () => {
    fakeBridge();
    Object.assign(state, { active: { url: song(1), bytes: 0, total: -1 }, queued: [song(2), url(1)], left: { count: 3, bytes: 1000, unknown: 2 } });
    OfflineAudio.refresh();
    expect(OfflineAudio.left()).toEqual({ count: 1, bytes: 1000, unknown: 0 });
  });
  it('only songs left: nothing is left to download as recordings', () => {
    fakeBridge();
    Object.assign(state, { queued: [song(2), song(3)], left: { count: 2, bytes: 0, unknown: 2 } });
    OfflineAudio.refresh();
    expect(OfflineAudio.left()).toEqual({ count: 0, bytes: 0, unknown: 0 });
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markDay, newRun, pauseRun } from '../data/plan-engine.js';
import { AUDIO_RELEASE_PREFIX } from './audio-track.js';
import { _resetAutoDownload, autoDownloadPass, planWeekRefs, unmeteredNow, upNextTracks } from './auto-download.js';

const at = (key) => new Date(key + 'T09:00:00');
/** A 30-day plan of one chapter a day: Psalms 1..30. */
const psalms = (now) => newRun({ id: 'p1', plan: 'psalms', tracks: [{ kind: 'bible', by: 'count',
  items: Array.from({ length: 30 }, (_, i) => ({ k: 'psalms:' + (i + 1), w: 300 })) }], pace: { mode: 'days', n: 30 } }, now);

/** A download store double: statusOf from a map, download/cancel recorded. */
function store(status = {}) {
  const s = {
    status: { ...status }, downloads: /** @type {any[][]} */ ([]), cancels: /** @type {string[][]} */ ([]), isPaused: false,
    statusOf: (url) => s.status[url] || 'none',
    items: () => Object.keys(s.status).filter((u) => s.status[u] === 'saved').map((url) => ({ url })),
    sizeOf: (url) => (url.endsWith('-p2.mp3') ? 4_000_000 : null),
    paused: () => s.isPaused,
    download(list) { s.downloads.push(list); for (const it of list) s.status[it.url] = 'queued'; return true; },
    taken: /** @type {string[]} */ ([]),
    cancel(urls) { s.cancels.push(urls); s.taken.push(...urls); for (const u of urls) delete s.status[u]; },
    takeCancels() { const out = s.taken; s.taken = []; return out; },
  };
  return s;
}
const track = (n) => ({ url: AUDIO_RELEASE_PREFIX + 'psalms-p' + n + '.mp3', key: 'k:' + n, title: 'Psalms ' + n, partLabel: null });
const SONG = 'https://votreader.github.io/songs-1/27009c0316ce.mp3';

describe('auto-download - what is wanted (dl-d5)', () => {
  it('a running plan wants its next 7 days from the day it is on, rolling as days are read', () => {
    let run = psalms(at('2026-10-20'));
    expect(planWeekRefs([run], at('2026-10-20')).map((r) => r.cid)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    run = markDay(run, 0, true, at('2026-10-20'));
    run = markDay(run, 1, true, at('2026-10-21'));
    expect(planWeekRefs([run], at('2026-10-22')).map((r) => r.cid)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it('a paused plan, a plan switched off and nothing at all want nothing', () => {
    const run = psalms(at('2026-10-20'));
    expect(planWeekRefs([pauseRun(run, at('2026-10-21'))], at('2026-10-21'))).toEqual([]);
    expect(planWeekRefs([{ ...run, autoAudio: false }], at('2026-10-20'))).toEqual([]);
    expect(planWeekRefs([{ ...run, autoAudio: true }], at('2026-10-20'))).toHaveLength(7);
    expect(planWeekRefs(null, at('2026-10-20'))).toEqual([]);
  });

  it('up next is the 3 after the one playing', () => {
    const queue = [1, 2, 3, 4, 5, 6].map(track);
    expect(upNextTracks({ queue, qi: 1 }).map((t) => t.title)).toEqual(['Psalms 3', 'Psalms 4', 'Psalms 5']);
    expect(upNextTracks({ queue, qi: 4 }).map((t) => t.title)).toEqual(['Psalms 6']);
    expect(upNextTracks(null)).toEqual([]);
    const withSong = [track(1), { url: SONG, title: 'A song' }, track(2), track(3), track(4)];
    expect(upNextTracks({ queue: withSong, qi: 0 }).map((t) => t.title)).toEqual(['Psalms 2', 'Psalms 3', 'Psalms 4']);   // songs keep their own shelf
  });
});

describe('auto-download - a pass (dl-d5)', () => {
  beforeEach(() => { localStorage.clear(); _resetAutoDownload(); });
  afterEach(() => { delete window.AndroidBridge; });

  it('on Wi-Fi it queues what is not on the phone, once, with the size it knows', () => {
    const off = store({ [track(1).url]: 'saved', [track(3).url]: 'downloading' });
    const r = autoDownloadPass({ off, tracks: [1, 2, 2, 3, 4].map(track), unmetered: true });
    expect(r.queued).toBe(2);
    expect(off.downloads[0]).toEqual([
      { url: track(2).url, key: 'k:2', title: 'Psalms 2', wifi: true, bytes: 4_000_000 },
      { url: track(4).url, key: 'k:4', title: 'Psalms 4', wifi: true },
    ]);
    off.status[track(2).url] = 'failed';
    off.status[track(4).url] = 'failed';
    expect(autoDownloadPass({ off, tracks: [2, 4].map(track), unmetered: true }).queued).toBe(0);   // not again this visit
  });

  it('on mobile data it queues nothing and takes back only its own that have not started', () => {
    const off = store({ [track(9).url]: 'queued' });   // the listener's own download
    autoDownloadPass({ off, tracks: [1, 2, 3].map(track), unmetered: true });
    off.status[track(1).url] = 'downloading';
    const r = autoDownloadPass({ off, tracks: [1, 2, 3, 4].map(track), unmetered: false });
    expect(r).toEqual({ queued: 0, withdrawn: 2 });
    expect(off.cancels).toEqual([[track(2).url, track(3).url]]);
    expect(off.status[track(9).url]).toBe('queued');
    expect(off.downloads).toHaveLength(1);
    // Back on Wi-Fi the withdrawn ones come back.
    expect(autoDownloadPass({ off, tracks: [1, 2, 3].map(track), unmetered: true }).queued).toBe(2);
  });

  it('it remembers its own across a restart, and forgets one once it is on the phone', () => {
    const off = store();
    autoDownloadPass({ off, tracks: [1].map(track), unmetered: true });
    _resetAutoDownload();   // the app opened again
    expect(autoDownloadPass({ off, tracks: [], unmetered: false }).withdrawn).toBe(1);
    autoDownloadPass({ off, tracks: [5].map(track), unmetered: true });
    off.status[track(5).url] = 'saved';
    autoDownloadPass({ off, tracks: [], unmetered: true });
    expect(JSON.parse(localStorage.getItem('vot-auto-downloads'))).toEqual([]);
  });

  it('one the listener cancelled from the queue is not queued again, on a later visit either', () => {
    const off = store();
    autoDownloadPass({ off, tracks: [1, 2].map(track), unmetered: true });
    off.cancel([track(1).url]);   // the listener's Cancel
    autoDownloadPass({ off, tracks: [1, 2].map(track), unmetered: true });
    _resetAutoDownload();
    autoDownloadPass({ off, tracks: [1, 2, 3].map(track), unmetered: true });
    expect(off.downloads.flat().map((it) => it.url)).toEqual([track(1).url, track(2).url, track(3).url]);
  });

  it('one that failed while the app was closed (off the queue, never cancelled) is asked for again next visit', () => {
    const off = store();
    autoDownloadPass({ off, tracks: [1].map(track), unmetered: true });
    delete off.status[track(1).url];   // the phone gave up on it; the page was not there to hear 'failed'
    _resetAutoDownload();               // the app opens again
    expect(autoDownloadPass({ off, tracks: [1].map(track), unmetered: true }).queued).toBe(1);
  });

  it('its own withdrawals on mobile data are not taken as the listener cancelling', () => {
    const off = store();
    autoDownloadPass({ off, tracks: [1].map(track), unmetered: true });
    expect(autoDownloadPass({ off, tracks: [1].map(track), unmetered: false }).withdrawn).toBe(1);
    expect(autoDownloadPass({ off, tracks: [1].map(track), unmetered: true }).queued).toBe(1);
  });

  it('one the listener removed from the phone is not downloaded again by itself, wanted then or not', () => {
    // 7 was downloaded by hand and is not wanted now; 1 is wanted and on the phone; 2 is queued here.
    const off = store({ [track(1).url]: 'saved', [track(7).url]: 'saved' });
    autoDownloadPass({ off, tracks: [1, 2].map(track), unmetered: true });
    off.status[track(2).url] = 'saved';
    autoDownloadPass({ off, tracks: [1, 2].map(track), unmetered: true });
    for (const n of [1, 2, 7]) delete off.status[track(n).url];   // removed
    autoDownloadPass({ off, tracks: [], unmetered: true });
    _resetAutoDownload();   // even on a later visit, and once 7 comes into the window
    expect(autoDownloadPass({ off, tracks: [1, 2, 3, 7].map(track), unmetered: true }).queued).toBe(1);
    expect(off.downloads[off.downloads.length - 1].map((it) => it.url)).toEqual([track(3).url]);
  });

  it('with downloads paused it adds nothing', () => {
    const off = store();
    off.isPaused = true;
    expect(autoDownloadPass({ off, tracks: [1].map(track), unmetered: true }).queued).toBe(0);
  });

  it('Wi-Fi is the phone app\'s word when it has one, else the browser\'s connection type', () => {
    window.AndroidBridge = { offlineAudioUnmetered: () => true };
    expect(unmeteredNow()).toBe(true);
    window.AndroidBridge = { offlineAudioUnmetered: () => { throw new Error('gone'); } };
    expect(unmeteredNow()).toBe(false);
    delete window.AndroidBridge;
    const had = Object.getOwnPropertyDescriptor(navigator, 'connection');
    try {
      Object.defineProperty(navigator, 'connection', { configurable: true, value: { type: 'wifi' } });
      expect(unmeteredNow()).toBe(true);
      Object.defineProperty(navigator, 'connection', { configurable: true, value: { type: 'cellular' } });
      expect(unmeteredNow()).toBe(false);
      Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
      expect(unmeteredNow()).toBe(false);   // a browser that cannot tell
    } finally {
      if (had) Object.defineProperty(navigator, 'connection', had); else delete /** @type {any} */ (navigator).connection;
    }
  });
});

// @ts-nocheck — drives a fake media element in jsdom
/* audio-player — the streaming audio-letter store.

   jsdom has no media pipeline, so `globalThis.Audio` is replaced with an
   EventTarget-backed FakeAudio and the module is re-imported per test
   (vi.resetModules + dynamic import) to reset its singleton state. The
   manifest globals are installed on globalThis in beforeEach, matching the
   classic-script `var AUDIO_MANIFEST` reality of src/data/audio-manifest.js. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Mimics the bits of HTMLAudioElement this module touches. */
class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = '';
    this.srcHistory = [];
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    this.played = false;
    this.preload = '';
    this.error = null;
    this.loadCalls = 0;
    this.defaultPlaybackRate = 1;
    this.playbackRate = 1;
  }
  // Assigning src resets the media element — real behavior, and it keeps the
  // prev()/next() tests honest about where currentTime stands after a switch.
  // The load algorithm also resets playbackRate to defaultPlaybackRate, which
  // is why _start() must apply the chosen rate AFTER pointing at the track.
  get src() { return this._src; }
  set src(v) { this._src = v; this.srcHistory.push(v); this.currentTime = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.played = true; this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() { this.loadCalls++; }
  // The queue warmer releases its connection via removeAttribute('src'),
  // which real elements have and EventTarget doesn't.
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const MANIFEST = {
  'vol1:preface': [['idPreface', 'B']],
  'vol1:letter-a': [['idA1', 'B', 'Part 1'], ['idA2', 'B', 'Part 2']],
  'vol1:letter-c': [['idC', 'T']],
  'vol2:solo': [['idSolo', 'M']],
};

const SECTIONS = {
  wtlb1: [
    ['Part 1 · Intro–19', 'sec1', 'V'],
    ['Part 2 · 20–39', 'sec2', 'V'],
    ['Part 3 · 40–59', 'sec3', 'V'],
  ],
};

const ITEMS = [
  { id: 'preface', title: 'Preface' },
  { id: 'letter-a', title: 'Letter A' },
  { id: 'letter-b', title: 'Letter B (no audio)' },
  { id: 'letter-c', title: 'Letter C' },
];

const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';

let AudioPlayer;
let AUDIO_TOAST_ID;
let trackUrl;
let toastMod;
let bridge;

/** Fresh module instance (the store is a module-level singleton). */
async function load() {
  vi.resetModules();
  const mod = await import('./audio-player.js');
  toastMod = await import('./toast.js');
  AudioPlayer = mod.AudioPlayer;
  AUDIO_TOAST_ID = mod.AUDIO_TOAST_ID;
  trackUrl = mod.trackUrl;
}

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

/** The element the module lazily created on first play. */
const el = () => FakeAudio.last;

beforeEach(async () => {
  FakeAudio.last = null;
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  globalThis.AUDIO_SECTIONS = SECTIONS;
  localStorage.removeItem('vot-audio-pos');   // no cross-test resume state
  setOnline(true);
  bridge = { setAudioActive: vi.fn() };
  window.AndroidBridge = bridge;
  await load();
});

afterEach(() => {
  if (toastMod) toastMod._resetToasts();
  const arbiter = globalThis.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  delete globalThis.AUDIO_MANIFEST;
  delete globalThis.AUDIO_SECTIONS;
  delete globalThis.AudioLibraryStore;
  delete globalThis.__votAudioArbiter;
  delete globalThis.Audio;
  delete window.AndroidBridge;
  setOnline(true);
});

describe('audio-player — trackUrl + readerLabel', () => {
  it('builds the GitHub release stream URL (Drive id = asset name)', () => {
    expect(trackUrl('abc123')).toBe('https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/abc123.mp3');
  });

  it('maps every reader code, null for unknown', () => {
    expect(AudioPlayer.readerLabel('B')).toBe('Read by Benjamin');
    expect(AudioPlayer.readerLabel('T')).toBe('Read by Timothy');
    expect(AudioPlayer.readerLabel('V')).toBe('Text-to-speech');
    expect(AudioPlayer.readerLabel('M')).toBe('AI reading with music');
    expect(AudioPlayer.readerLabel('Z')).toBe(null);
    expect(AudioPlayer.readerLabel(undefined)).toBe(null);
  });
});

describe('audio-player — manifest guards', () => {
  it('reports no audio at all when the lazy corpus globals are absent', async () => {
    delete globalThis.AUDIO_MANIFEST;
    delete globalThis.AUDIO_SECTIONS;
    await load();
    expect(AudioPlayer.hasAudio('vol1', 'letter-a')).toBe(false);
    expect(AudioPlayer.firstReaderCode('vol1', 'letter-a')).toBe(null);
    expect(AudioPlayer.collectionHasAudio('vol1')).toBe(false);
    expect(AudioPlayer.sectionsFor('wtlb1')).toBe(null);
  });

  it('firstReaderCode returns the first track’s reader, null when there is no entry', () => {
    expect(AudioPlayer.firstReaderCode('vol1', 'letter-a')).toBe('B'); // multi-part → part 1's reader
    expect(AudioPlayer.firstReaderCode('vol1', 'letter-c')).toBe('T');
    expect(AudioPlayer.firstReaderCode('vol2', 'solo')).toBe('M');
    expect(AudioPlayer.firstReaderCode('vol1', 'letter-b')).toBe(null);
    expect(AudioPlayer.firstReaderCode('vol9', 'nope')).toBe(null);
  });

  it('hasAudio matches on the "volKey:letterId" key', () => {
    expect(AudioPlayer.hasAudio('vol1', 'letter-a')).toBe(true);
    expect(AudioPlayer.hasAudio('vol1', 'letter-b')).toBe(false);
    expect(AudioPlayer.hasAudio('vol2', 'letter-a')).toBe(false);
  });

  it('collectionHasAudio answers per volKey prefix', () => {
    expect(AudioPlayer.collectionHasAudio('vol1')).toBe(true);
    expect(AudioPlayer.collectionHasAudio('vol2')).toBe(true);
    expect(AudioPlayer.collectionHasAudio('vol9')).toBe(false);
  });

  it('caches the per-volKey answer after the first real computation', () => {
    expect(AudioPlayer.collectionHasAudio('vol1')).toBe(true);
    delete globalThis.AUDIO_MANIFEST;
    // Cached — a manifest read would now return false.
    expect(AudioPlayer.collectionHasAudio('vol1')).toBe(true);
  });

  it('does NOT cache a pre-corpus "no" (the manifest arrives lazily)', () => {
    delete globalThis.AUDIO_MANIFEST;
    expect(AudioPlayer.collectionHasAudio('vol1')).toBe(false);
    globalThis.AUDIO_MANIFEST = MANIFEST;
    expect(AudioPlayer.collectionHasAudio('vol1')).toBe(true);
  });

  it('sectionsFor returns the section list or null', () => {
    expect(AudioPlayer.sectionsFor('wtlb1')).toHaveLength(3);
    expect(AudioPlayer.sectionsFor('wtlb2')).toBe(null);
  });
});

describe('audio-player — playLetter', () => {
  it('queues every part with its label and starts playback', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' }, collectionLabel: 'Volume One' });
    const s = AudioPlayer.getState();
    expect(s.status).not.toBe('idle');
    expect(s.qi).toBe(0);
    expect(s.queue).toEqual([
      { key: 'vol1:letter-a', title: 'Letter A', sub: 'Volume One', url: URL_OF('idA1'), readerCode: 'B', partLabel: 'Part 1' },
      { key: 'vol1:letter-a', title: 'Letter A', sub: 'Volume One', url: URL_OF('idA2'), readerCode: 'B', partLabel: 'Part 2' },
    ]);
    expect(el().src).toBe(URL_OF('idA1'));
    expect(el().played).toBe(true);
    expect(el().preload).toBe('none');
  });

  it('leaves partLabel null on a single-part letter', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    expect(AudioPlayer.getState().queue[0]).toMatchObject({ partLabel: null, sub: null, readerCode: 'T' });
  });

  it('is a no-op for a letter with no recording', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-b', title: 'Letter B' } });
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(AudioPlayer.getState().queue).toHaveLength(0);
    expect(el()).toBe(null); // never even constructed the element
  });

  it('queues the whole collection positioned at the letter when the registry is present', () => {
    // index.html registry globals — present in the real app, absent above so
    // the single-letter fallback tests stay honest.
    globalThis.COL_BY_KEY = new Map([['vol1', { volKey: 'vol1' }]]);
    globalThis.colPreface = () => ITEMS[0];
    globalThis.colLetterArr = () => ITEMS.slice(1);
    try {
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' }, collectionLabel: 'Volume One' });
      const s = AudioPlayer.getState();
      expect(s.queue.map((t) => t.url)).toEqual([URL_OF('idPreface'), URL_OF('idA1'), URL_OF('idA2'), URL_OF('idC')]);
      expect(s.qi).toBe(3);                       // starts AT the letter, not the preface
      expect(el().src).toBe(URL_OF('idC'));
      AudioPlayer.prev();                          // walks into the neighboring letter
      expect(AudioPlayer.getState().qi).toBe(2);
      expect(el().src).toBe(URL_OF('idA2'));
      // Persisted as a collection source so a restart rebuilds the same queue.
      expect(JSON.parse(localStorage.getItem('vot-audio-pos')).mode).toBe('collection');
    } finally {
      delete globalThis.COL_BY_KEY;
      delete globalThis.colPreface;
      delete globalThis.colLetterArr;
    }
  });
});

describe('audio-player — playCollection', () => {
  it('skips items without audio, expands parts, keeps caller order (preface first)', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    const q = AudioPlayer.getState().queue;
    expect(q.map((t) => t.url)).toEqual([URL_OF('idPreface'), URL_OF('idA1'), URL_OF('idA2'), URL_OF('idC')]);
    expect(q[0].title).toBe('Preface');
    expect(AudioPlayer.getState().qi).toBe(0);
  });

  it('honors startId by pointing qi at that letter’s first track', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, startId: 'letter-a' });
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(el().src).toBe(URL_OF('idA1'));
  });

  it('falls back to qi 0 when startId has no audio', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, startId: 'letter-b' });
    expect(AudioPlayer.getState().qi).toBe(0);
  });

  it('is a no-op when nothing in the collection has audio', () => {
    AudioPlayer.playCollection({ volKey: 'vol9', items: ITEMS });
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(AudioPlayer.getState().queue).toHaveLength(0);
  });
});

describe('audio-player — playSection', () => {
  it('queues ALL sections with qi at the requested index', () => {
    AudioPlayer.playSection('wtlb1', 2, 'Words To Live By');
    const s = AudioPlayer.getState();
    expect(s.queue).toHaveLength(3);
    expect(s.qi).toBe(2);
    expect(s.queue[2]).toEqual({
      key: null, title: 'Part 3 · 40–59', sub: 'Words To Live By',
      url: URL_OF('sec3'), readerCode: 'V', partLabel: null,
    });
    expect(el().src).toBe(URL_OF('sec3'));
  });

  it('clamps an out-of-range index and no-ops for a collection with no sections', () => {
    AudioPlayer.playSection('wtlb1', 99);
    expect(AudioPlayer.getState().qi).toBe(2);
    AudioPlayer.stop();
    AudioPlayer.playSection('wtlb2', 0);
    expect(AudioPlayer.getState().queue).toHaveLength(0);
  });
});

describe('audio-player — next / prev / seek / stop', () => {
  it('auto-advances to the next part when the track ends', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    el().dispatchEvent(new Event('ended'));
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(el().src).toBe(URL_OF('idA2'));
  });

  it('stops at the end of the queue (status idle, queue cleared, connection dropped)', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    el().dispatchEvent(new Event('ended'));
    const s = AudioPlayer.getState();
    expect(s.status).toBe('idle');
    expect(s.queue).toHaveLength(0);
    expect(s.qi).toBe(0);
    expect(el().src).toBe('');       // src cleared…
    expect(el().loadCalls).toBe(1);  // …and load() drops the Drive connection
  });

  it('prev restarts the current track when more than 3s in', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS });
    AudioPlayer.next();
    expect(AudioPlayer.getState().qi).toBe(1);
    el().duration = 100;
    el().currentTime = 12;
    AudioPlayer.prev();
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(el().currentTime).toBe(0);
    expect(AudioPlayer.getState().time).toBe(0);
  });

  it('prev steps back under 3s and clamps at the head of the queue', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS });
    AudioPlayer.next();
    el().currentTime = 1.5;
    AudioPlayer.prev();
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(el().src).toBe(URL_OF('idPreface'));
    AudioPlayer.prev();
    expect(AudioPlayer.getState().qi).toBe(0);
  });

  it('seek clamps to [0, duration]', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    el().duration = 60;
    el().dispatchEvent(new Event('durationchange'));
    AudioPlayer.seek(-5);
    expect(el().currentTime).toBe(0);
    AudioPlayer.seek(1000);
    expect(el().currentTime).toBe(60);
    AudioPlayer.seek(12.5);
    expect(AudioPlayer.getState().time).toBe(12.5);
  });

  it('toggle pauses a playing track and resumes a paused one; no-ops when idle', () => {
    AudioPlayer.toggle(); // idle — must not throw or build an element
    expect(el()).toBe(null);
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    el().dispatchEvent(new Event('playing'));
    expect(AudioPlayer.getState().status).toBe('playing');
    AudioPlayer.toggle();
    expect(AudioPlayer.getState().status).toBe('paused');
    el().played = false;
    AudioPlayer.toggle();
    expect(el().played).toBe(true);
  });

  it('pauseIfPlaying pauses a loading track before it can bleed into a recording', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    AudioPlayer.pauseIfPlaying();
    expect(el().paused).toBe(true);
    expect(AudioPlayer.getState().status).toBe('paused');
  });

  it('does not wedge or self-restart when paused during loading', () => {
    vi.useFakeTimers();
    try {
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
      expect(AudioPlayer.getState().status).toBe('loading');
      AudioPlayer.toggle();
      expect(el().paused).toBe(true);
      expect(AudioPlayer.getState().status).toBe('paused');
      const srcAssignments = el().srcHistory.length;
      vi.advanceTimersByTime(21000);
      expect(el().srcHistory).toHaveLength(srcAssignments);

      AudioPlayer.toggle();
      el().dispatchEvent(new Event('playing'));
      expect(AudioPlayer.getState().status).toBe('playing');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('audio-player — listening controls + arbitration', () => {
  it('uses the saved speed preference, records a trusted direct play, and rejects arbitrary URLs', () => {
    const library = {
      getPlaybackRate: vi.fn(() => 1.5),
      recordPlayed: vi.fn(),
      setPlaybackRate: vi.fn(),
    };
    globalThis.AudioLibraryStore = library;
    const direct = {
      key: 'vol2:solo', title: 'Solo', sub: 'Volume Two', url: URL_OF('idSolo'), readerCode: 'M', partLabel: null,
    };
    AudioPlayer.playTrack(direct);
    expect(AudioPlayer.getState().rate).toBe(1.5);
    // Both must hold AFTER the src assignment's load-algorithm reset.
    expect(el().playbackRate).toBe(1.5);
    expect(el().defaultPlaybackRate).toBe(1.5);
    expect(library.recordPlayed).toHaveBeenCalledWith(expect.objectContaining({ url: URL_OF('idSolo') }));

    AudioPlayer.setPlaybackRate(1.25);
    expect(el().playbackRate).toBe(1.25);
    expect(el().defaultPlaybackRate).toBe(1.25);
    expect(library.setPlaybackRate).toHaveBeenCalledWith(1.25);

    AudioPlayer.stop();
    AudioPlayer.playTrack({ ...direct, url: 'https://example.test/not-vot.mp3' });
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(AudioPlayer.getState().queue).toEqual([]);
  });

  it('pauses at the end of a session-only sleep timer without clearing the queue', () => {
    vi.useFakeTimers();
    try {
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
      el().dispatchEvent(new Event('playing'));
      expect(AudioPlayer.setSleepTimer(15)).toBe(true);
      expect(AudioPlayer.getSleepRemainingSeconds()).toBe(900);
      vi.advanceTimersByTime(15 * 60000);
      expect(AudioPlayer.getState().status).toBe('paused');
      expect(AudioPlayer.getState().queue).toHaveLength(1);
      expect(AudioPlayer.getState().sleepEndsAt).toBe(0);
      expect(el().paused).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('edits only future queue entries and persists an edited queue as a custom source', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    AudioPlayer.next(); // current = Letter A, part 1; keep it fixed while rearranging after it
    expect(AudioPlayer.moveUpcoming(3, 2)).toBe(true);
    expect(AudioPlayer.getState().queue.map((track) => track.url)).toEqual([
      URL_OF('idPreface'), URL_OF('idA1'), URL_OF('idC'), URL_OF('idA2'),
    ]);
    expect(AudioPlayer.removeUpcoming(3)).toBe(true);
    expect(AudioPlayer.removeUpcoming(1)).toBe(false); // current track is protected

    const snapshot = JSON.parse(localStorage.getItem('vot-audio-pos'));
    expect(snapshot).toMatchObject({ v: 2, mode: 'custom', qi: 1 });
    expect(snapshot.customQueue.map((track) => track.url)).toEqual([
      URL_OF('idPreface'), URL_OF('idA1'), URL_OF('idC'),
    ]);
  });

  it('pauses the VOT stream when a journal or other DOM audio element starts', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    el().dispatchEvent(new Event('playing'));
    const memo = document.createElement('audio');
    document.body.appendChild(memo);
    try {
      memo.dispatchEvent(new Event('play', { bubbles: true }));
      expect(AudioPlayer.getState().status).toBe('paused');
      expect(el().paused).toBe(true);
    } finally {
      memo.remove();
    }
  });
});

describe('audio-player — gentle queue prefetch', () => {
  /** Buffered stub covering [0, end). */
  const buffered = (end) => ({ length: 1, end: () => end });

  /** Start a collection, mark the current track fully buffered, tick 1s. */
  function primeFullyBuffered() {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    const main = FakeAudio.last;
    main.dispatchEvent(new Event('playing'));
    main.duration = 100;
    main.buffered = buffered(100);
    main.currentTime = 1;
    main.dispatchEvent(new Event('timeupdate'));
    return main;
  }

  it('warms the next two queued tracks once the current one is fully buffered', () => {
    const main = primeFullyBuffered();
    const warm = FakeAudio.last;
    expect(warm).not.toBe(main);            // a second, detached element
    expect(warm.preload).toBe('auto');
    expect(warm.played).toBe(false);        // a warmer, never a player
    expect(warm.src).toBe(URL_OF('idA1'));  // first upcoming after the preface

    warm.dispatchEvent(new Event('canplaythrough'));
    expect(FakeAudio.last).toBe(warm);      // element reused for the chain
    expect(warm.src).toBe(URL_OF('idA2')); // chain walked to the second target

    warm.dispatchEvent(new Event('canplaythrough'));
    expect(warm.src).toBe('');              // window exhausted — connection released
    // Window is 2: the third upcoming track (idC) is NOT warmed yet.
    expect(warm.srcHistory).not.toContain(URL_OF('idC'));

    // Advancing shifts the window: idC becomes warm-eligible on the next tick.
    AudioPlayer.next();
    main.duration = 100;
    main.buffered = buffered(100);
    main.currentTime = 2;
    main.dispatchEvent(new Event('timeupdate'));
    expect(warm.src).toBe(URL_OF('idC'));
  });

  it('never warms while the current track is still buffering', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    const main = FakeAudio.last;
    main.dispatchEvent(new Event('playing'));
    main.duration = 100;
    main.buffered = buffered(40);           // mid-download
    main.currentTime = 1;
    main.dispatchEvent(new Event('timeupdate'));
    expect(FakeAudio.last).toBe(main);      // no warmer created
  });

  it('never spends speculative bytes under Save-Data', () => {
    Object.defineProperty(window.navigator, 'connection', { configurable: true, value: { saveData: true } });
    try {
      const main = primeFullyBuffered();
      expect(FakeAudio.last).toBe(main);
    } finally {
      delete window.navigator.connection;
    }
  });

  it('a failed warm leaves the URL retryable and stop() releases the warmer', () => {
    const main = primeFullyBuffered();
    const warm = FakeAudio.last;
    warm.dispatchEvent(new Event('error'));  // transient failure
    expect(warm.src).toBe('');
    main.dispatchEvent(new Event('progress'));   // healthy again → retry
    expect(warm.src).toBe(URL_OF('idA1'));

    AudioPlayer.stop();
    expect(warm.src).toBe('');
    expect(AudioPlayer.getState().status).toBe('idle');
  });
});

describe('audio-player — offline', () => {
  it('playLetter leaves state idle and toasts the offline notice', () => {
    setOnline(false);
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(AudioPlayer.getState().queue).toHaveLength(0);
    const toast = document.getElementById(AUDIO_TOAST_ID);
    expect(toast).toBeTruthy();
    expect(toast.textContent).toBe('Playing audio requires an internet connection.');
    expect(toast.getAttribute('aria-live')).toBe('assertive');
    expect(toast.classList.contains('vot-toast')).toBe(true);
  });

  it('playCollection and playSection are blocked too', () => {
    setOnline(false);
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS });
    expect(AudioPlayer.getState().queue).toHaveLength(0);
    AudioPlayer.playSection('wtlb1', 0);
    expect(AudioPlayer.getState().queue).toHaveLength(0);
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(document.getElementById(AUDIO_TOAST_ID)).toBeTruthy();
  });
});

describe('audio-player — load errors', () => {
  it('a mid-play error pauses and toasts, keeping the queue for a retry', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    el().error = { code: 2 };
    el().dispatchEvent(new Event('error'));
    const s = AudioPlayer.getState();
    expect(s.status).toBe('paused');
    expect(s.queue).toHaveLength(2);
    expect(s.qi).toBe(0);
    expect(document.getElementById(AUDIO_TOAST_ID).textContent).toBe('Couldn’t load this track.');
  });

  it('reports the offline cause when the connection is the reason', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    setOnline(false);
    el().dispatchEvent(new Event('error'));
    expect(document.getElementById(AUDIO_TOAST_ID).textContent).toBe('Playing audio requires an internet connection.');
  });

  it('stop() teardown does not fire a spurious failure toast', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    AudioPlayer.stop();
    el().dispatchEvent(new Event('error')); // real browsers fire this on src=''
    expect(document.getElementById(AUDIO_TOAST_ID)).toBe(null);
  });

  it('toggle after an error re-loads the track and resumes from where it died', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    el().currentTime = 12.4;
    el().dispatchEvent(new Event('timeupdate'));
    el().error = { code: 2 };
    el().dispatchEvent(new Event('error'));

    el().played = false;
    AudioPlayer.toggle();
    expect(el().src).toBe(URL_OF('idC'));
    expect(el().played).toBe(true);
    expect(el().currentTime).toBe(0);              // src assignment reset it…
    el().dispatchEvent(new Event('loadedmetadata'));
    expect(el().currentTime).toBe(12.4);           // …and metadata restores it
  });
});

describe('audio-player — subscribe / version', () => {
  it('notifies on play and on pause, and stops after unsubscribe', () => {
    const seen = vi.fn();
    const off = AudioPlayer.subscribe(seen);
    const v0 = AudioPlayer.getVersion();

    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    expect(seen).toHaveBeenCalled();
    expect(AudioPlayer.getVersion()).toBeGreaterThan(v0);

    el().dispatchEvent(new Event('playing'));
    const afterPlaying = seen.mock.calls.length;
    AudioPlayer.toggle();
    expect(seen.mock.calls.length).toBeGreaterThan(afterPlaying);

    off();
    const afterOff = seen.mock.calls.length;
    AudioPlayer.stop();
    expect(seen.mock.calls.length).toBe(afterOff);
  });

  it('timeupdate notifies at most once per whole second', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    const seen = vi.fn();
    AudioPlayer.subscribe(seen);

    el().currentTime = 0.2;
    el().dispatchEvent(new Event('timeupdate'));
    expect(seen).toHaveBeenCalledTimes(1);

    el().currentTime = 0.7;
    el().dispatchEvent(new Event('timeupdate'));
    expect(seen).toHaveBeenCalledTimes(1);        // same whole second — no re-render
    expect(AudioPlayer.getState().time).toBe(0.7); // …but time is still current

    el().currentTime = 1.1;
    el().dispatchEvent(new Event('timeupdate'));
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe('audio-player — Android keep-alive bridge', () => {
  it('activates on playing and deactivates on pause and stop', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    expect(bridge.setAudioActive).not.toHaveBeenCalled(); // 'loading' is not playback

    el().dispatchEvent(new Event('playing'));
    expect(bridge.setAudioActive).toHaveBeenCalledWith(true);

    AudioPlayer.toggle();
    expect(bridge.setAudioActive).toHaveBeenLastCalledWith(false);

    el().dispatchEvent(new Event('playing'));
    AudioPlayer.stop();
    expect(bridge.setAudioActive).toHaveBeenLastCalledWith(false);
  });

  it('survives a missing bridge (the PWA has none)', () => {
    delete window.AndroidBridge;
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    expect(() => el().dispatchEvent(new Event('playing'))).not.toThrow();
    expect(AudioPlayer.getState().status).toBe('playing');
  });
});

describe('audio-player — Media Session', () => {
  it('publishes metadata for the starting track and clears handlers on stop', () => {
    const session = {
      metadata: null, handlers: {}, position: null, playbackState: 'none',
      setActionHandler(a, h) { this.handlers[a] = h; },
      setPositionState(state) { this.position = state; },
    };
    Object.defineProperty(window.navigator, 'mediaSession', { configurable: true, value: session });
    globalThis.MediaMetadata = class { constructor(o) { Object.assign(this, o); } };
    try {
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' }, collectionLabel: 'Volume One' });
      expect(session.metadata.title).toBe('Letter A — Part 1');
      expect(session.metadata.artist).toBe('The Volumes of Truth · Read by Benjamin');
      expect(session.metadata.album).toBe('Volume One');
      expect(typeof session.handlers.nexttrack).toBe('function');
      el().duration = 60;
      el().dispatchEvent(new Event('durationchange'));
      el().currentTime = 12;
      el().dispatchEvent(new Event('timeupdate'));
      expect(session.position).toEqual({ duration: 60, position: 12, playbackRate: 1 });
      el().dispatchEvent(new Event('playing'));
      expect(session.playbackState).toBe('playing');

      AudioPlayer.stop();
      expect(session.metadata).toBe(null);
      expect(session.handlers.nexttrack).toBe(null);
      expect(session.handlers.seekto).toBe(null);
      expect(session.playbackState).toBe('none');
    } finally {
      delete window.navigator.mediaSession;
      delete globalThis.MediaMetadata;
    }
  });
});

describe('audio-player — durable resume (position survives restart)', () => {
  const tick = (t) => {
    el().currentTime = t;
    el().dispatchEvent(new Event('timeupdate'));
  };
  const saved = () => JSON.parse(localStorage.getItem('vot-audio-pos'));

  it('persists position on pause and ~every 5s of playback', async () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    el().dispatchEvent(new Event('playing'));
    tick(1);
    expect(localStorage.getItem('vot-audio-pos')).toBe(null); // 1s in — still under the 5s throttle
    tick(6);
    expect(saved()).toBeTruthy();
    expect(saved().time).toBe(6);
    expect(saved().mode).toBe('collection');
    expect(saved().volKey).toBe('vol1');
    tick(8);
    expect(saved().time).toBe(6); // throttled
    el().pause();                 // walk-away point writes immediately
    expect(saved().time).toBe(8);
    expect(saved().track.title).toBe('Preface');
  });

  it('boot restore: bar comes back paused at the saved spot, no element created', async () => {
    localStorage.setItem('vot-audio-pos', JSON.stringify({
      v: 1, mode: 'collection', volKey: 'vol1', label: 'Volume One', qi: 2, key: 'vol1:letter-a', time: 123,
      track: { title: 'Letter A', sub: 'Volume One', readerCode: 'B', partLabel: 'Part 2', url: URL_OF('idA2'), key: 'vol1:letter-a' },
    }));
    await load();
    const st = AudioPlayer.getState();
    expect(st.status).toBe('paused');
    expect(st.time).toBe(123);
    expect(st.queue.length).toBe(1);
    expect(st.queue[0].title).toBe('Letter A');
    expect(st.queue[0].partLabel).toBe('Part 2');
    expect(FakeAudio.last).toBe(null); // display-only: no media element yet
  });

  it('toggle() after a boot restore rebuilds the real queue and resumes at the saved position', async () => {
    localStorage.setItem('vot-audio-pos', JSON.stringify({
      v: 1, mode: 'collection', volKey: 'vol1', label: 'Volume One', qi: 2, key: 'vol1:letter-a', time: 123,
      track: { title: 'Letter A', sub: 'Volume One', readerCode: 'B', partLabel: 'Part 2', url: URL_OF('idA2'), key: 'vol1:letter-a' },
    }));
    globalThis.COL_BY_KEY = new Map([['vol1', { volKey: 'vol1', label: 'Volume One' }]]);
    globalThis.colPreface = () => ITEMS[0];
    globalThis.colLetterArr = () => ITEMS.slice(1);
    try {
      await load();
      AudioPlayer.toggle();
      await new Promise((r) => setTimeout(r, 0));
      const st = AudioPlayer.getState();
      expect(st.queue.length).toBe(4);            // preface + A1 + A2 + C
      expect(st.qi).toBe(2);                      // saved part of the multi-part letter
      expect(st.queue[st.qi].url).toBe(URL_OF('idA2'));
      expect(el().played).toBe(true);
      el().duration = 500;
      el().dispatchEvent(new Event('loadedmetadata'));
      expect(el().currentTime).toBe(123);          // seek-back once seekable
    } finally {
      delete globalThis.COL_BY_KEY;
      delete globalThis.colPreface;
      delete globalThis.colLetterArr;
    }
  });

  it('restores a v2 custom queue without needing the lazy corpus', async () => {
    const first = { key: 'vol1:preface', title: 'Preface', sub: 'Volume One', readerCode: 'B', partLabel: null, url: URL_OF('idPreface') };
    const second = { key: 'vol1:letter-c', title: 'Letter C', sub: 'Volume One', readerCode: 'T', partLabel: null, url: URL_OF('idC') };
    localStorage.setItem('vot-audio-pos', JSON.stringify({
      v: 2, mode: 'custom', volKey: '', label: 'Volume One', qi: 1, key: second.key, time: 31,
      track: second, customQueue: [first, second],
    }));
    await load();
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(AudioPlayer.getState().queue).toHaveLength(1); // display-only boot placeholder

    AudioPlayer.toggle();
    expect(AudioPlayer.getState().queue.map((track) => track.url)).toEqual([URL_OF('idPreface'), URL_OF('idC')]);
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(el().src).toBe(URL_OF('idC'));
  });

  it('close (stop) clears the snapshot — the next boot stays idle', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' }, collectionLabel: 'Volume One' });
    el().dispatchEvent(new Event('playing'));
    tick(10);
    expect(saved()).toBeTruthy();
    AudioPlayer.stop();
    expect(localStorage.getItem('vot-audio-pos')).toBe(null);
    await load();
    expect(AudioPlayer.getState().status).toBe('idle');
  });
});

describe('audio-player — prewarm (instant-tap pipe warming)', () => {
  it('points the idle element at the letter’s first track without changing state', () => {
    AudioPlayer.prewarm('vol1', 'letter-a');
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(el()).not.toBe(null);
    expect(el().src).toBe(URL_OF('idA1'));
    expect(el().preload).toBe('metadata');
    expect(el().played).toBe(false);
  });

  it('playLetter after prewarm reuses the buffered element (no src reassignment)', () => {
    AudioPlayer.prewarm('vol1', 'letter-a');
    const assignsBefore = el().srcHistory.length;
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' }, collectionLabel: 'Volume One' });
    expect(el().srcHistory.length).toBe(assignsBefore); // same src kept
    expect(el().played).toBe(true);
  });

  it('never disturbs active playback, offline, or a restored bar; repeats are no-ops', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    const src = el().src;
    AudioPlayer.prewarm('vol1', 'letter-a');
    expect(el().src).toBe(src);                          // playing — untouched

    AudioPlayer.stop();
    setOnline(false);
    AudioPlayer.prewarm('vol1', 'letter-a');
    expect(el().src).toBe('');                           // offline — untouched
    setOnline(true);

    AudioPlayer.prewarm('vol1', 'letter-a');
    const assigns = el().srcHistory.length;
    AudioPlayer.prewarm('vol1', 'letter-a');
    expect(el().srcHistory.length).toBe(assigns);        // repeat — no-op
  });

  it('prewarm of a DIFFERENT letter than the one played still plays the right track', () => {
    AudioPlayer.prewarm('vol1', 'letter-a');
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    expect(el().src).toBe(URL_OF('idC'));
    expect(el().played).toBe(true);
  });
});

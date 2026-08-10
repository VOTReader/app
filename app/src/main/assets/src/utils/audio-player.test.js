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

/* Cross-reader alternates: a complete second reading of the same letter,
   ordered by reader rank. Only letters with a genuine alternate appear. */
const ALTERNATES = {
  'vol1:letter-c': [['V', [['idCv']]]],
  'vol1:letter-a': [['V', [['idA1v', 'Part 1'], ['idA2v', 'Part 2']]]],
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
  globalThis.AUDIO_ALTERNATES = ALTERNATES;
  localStorage.removeItem('vot-audio-pos');   // no cross-test resume state
  setOnline(true);
  bridge = { setAudioActive: vi.fn(), setAudioNowPlaying: vi.fn() };
  window.AndroidBridge = bridge;
  await load();
});

afterEach(() => {
  if (toastMod) toastMod._resetToasts();
  const arbiter = globalThis.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  delete globalThis.AUDIO_MANIFEST;
  delete globalThis.AUDIO_SECTIONS;
  delete globalThis.AUDIO_ALTERNATES;
  delete globalThis.AudioLibraryStore;
  delete globalThis.AudioPositionsStore;
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

  it('queues the collection FROM the letter onward when the registry is present', () => {
    // index.html registry globals — present in the real app, absent above so
    // the single-letter fallback tests stay honest.
    globalThis.COL_BY_KEY = new Map([['vol1', { volKey: 'vol1' }]]);
    globalThis.colPreface = () => ITEMS[0];
    globalThis.colLetterArr = () => ITEMS.slice(1);
    try {
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' }, collectionLabel: 'Volume One' });
      const s = AudioPlayer.getState();
      // Forward-only: Letter A's parts + Letter C follow; the preface stays behind.
      expect(s.queue.map((t) => t.url)).toEqual([URL_OF('idA1'), URL_OF('idA2'), URL_OF('idC')]);
      expect(s.qi).toBe(0);
      expect(el().src).toBe(URL_OF('idA1'));
      AudioPlayer.next();
      AudioPlayer.next();                          // walks forward into the neighboring letter
      expect(el().src).toBe(URL_OF('idC'));
      // Persisted as a collection source so a restart rebuilds the same queue.
      const snapshot = JSON.parse(localStorage.getItem('vot-audio-pos'));
      expect(snapshot.mode).toBe('collection');
      expect(snapshot.startKey).toBe('vol1:letter-a');
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

  it('startId sets a forward-only horizon — the letters behind it are not queued', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, startId: 'letter-a' });
    const s = AudioPlayer.getState();
    expect(s.qi).toBe(0);
    expect(s.queue.map((t) => t.url)).toEqual([URL_OF('idA1'), URL_OF('idA2'), URL_OF('idC')]);
    expect(el().src).toBe(URL_OF('idA1'));
  });

  it('prev at the chosen start clamps — it never walks into the letters behind it', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, startId: 'letter-a' });
    el().currentTime = 1.0;   // under the restart threshold
    AudioPlayer.prev();
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(el().src).toBe(URL_OF('idA1'));   // still Letter A, not the preface
  });

  it('falls back to the full queue when startId has no audio', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, startId: 'letter-b' });
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(AudioPlayer.getState().queue).toHaveLength(4);
  });

  it('is a no-op when nothing in the collection has audio', () => {
    AudioPlayer.playCollection({ volKey: 'vol9', items: ITEMS });
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(AudioPlayer.getState().queue).toHaveLength(0);
  });
});

describe('audio-player — playSection', () => {
  it('queues the chosen section and the ones after it (forward-only)', () => {
    AudioPlayer.playSection('wtlb1', 1, 'Words To Live By');
    const s = AudioPlayer.getState();
    expect(s.queue.map((t) => t.url)).toEqual([URL_OF('sec2'), URL_OF('sec3')]);
    expect(s.qi).toBe(0);
    expect(s.queue[1]).toEqual({
      key: null, title: 'Part 3 · 40–59', sub: 'Words To Live By',
      url: URL_OF('sec3'), readerCode: 'V', partLabel: null,
    });
    expect(el().src).toBe(URL_OF('sec2'));
  });

  it('clamps an out-of-range index and no-ops for a collection with no sections', () => {
    AudioPlayer.playSection('wtlb1', 99);
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(AudioPlayer.getState().queue).toHaveLength(1);   // clamped to the last section
    expect(el().src).toBe(URL_OF('sec3'));
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

describe('audio-player — listen completion counts', () => {
  it('notifies the read-count bridge when a letter plays to its end', () => {
    const listened = vi.fn();
    globalThis.__votAudioListened = listened;
    try {
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
      el().dispatchEvent(new Event('playing'));
      el().dispatchEvent(new Event('ended'));
      expect(listened).toHaveBeenCalledExactlyOnceWith('vol1', 'letter-c');
    } finally {
      delete globalThis.__votAudioListened;
    }
  });

  it('multi-part letters count once — on the LAST part only', () => {
    const listened = vi.fn();
    globalThis.__votAudioListened = listened;
    try {
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
      el().dispatchEvent(new Event('playing'));
      el().dispatchEvent(new Event('ended'));      // Part 1 → Part 2, same key
      expect(listened).not.toHaveBeenCalled();
      el().dispatchEvent(new Event('playing'));
      el().dispatchEvent(new Event('ended'));      // Part 2 = the letter's end
      expect(listened).toHaveBeenCalledExactlyOnceWith('vol1', 'letter-a');
    } finally {
      delete globalThis.__votAudioListened;
    }
  });

  it('range-compilation sections (key null) never notify', () => {
    const listened = vi.fn();
    globalThis.__votAudioListened = listened;
    try {
      AudioPlayer.playSection('wtlb1', 0, 'WTLB One');
      el().dispatchEvent(new Event('playing'));
      el().dispatchEvent(new Event('ended'));
      expect(listened).not.toHaveBeenCalled();
    } finally {
      delete globalThis.__votAudioListened;
    }
  });
});

describe('audio-player — honest play counting', () => {
  /** Only the transport methods the player touches; countPlay is the thing under test. */
  const fakeLibrary = () => ({ countPlay: vi.fn(), recordPlayed: vi.fn() });

  it('counts a Play All ONCE — not once per track the queue starts', () => {
    const library = fakeLibrary();
    globalThis.AudioLibraryStore = library;
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    el().dispatchEvent(new Event('ended'));   // preface → Letter A part 1
    el().dispatchEvent(new Event('ended'));   // → part 2
    el().currentTime = 1;                     // under the restart threshold
    AudioPlayer.prev();                       // → back to part 1
    expect(AudioPlayer.getState().qi).toBe(1);
    // The recent shelf still sees every start; the lifetime counter sees one tap.
    expect(library.recordPlayed).toHaveBeenCalledTimes(4);
    expect(library.countPlay).toHaveBeenCalledTimes(1);
  });

  it('counts playSection and playTrack once each; resuming a snapshot counts none', async () => {
    const library = fakeLibrary();
    globalThis.AudioLibraryStore = library;
    AudioPlayer.playSection('wtlb1', 0, 'Words To Live By');
    AudioPlayer.playTrack({
      key: 'vol2:solo', title: 'Solo', sub: 'Volume Two', url: URL_OF('idSolo'), readerCode: 'M', partLabel: null,
    });
    expect(library.countPlay).toHaveBeenCalledTimes(2);

    localStorage.setItem('vot-audio-pos', JSON.stringify({
      v: 2, mode: 'collection', volKey: 'vol1', label: 'Volume One', qi: 0, key: 'vol1:preface', time: 30,
      track: { key: 'vol1:preface', title: 'Preface', sub: 'Volume One', url: URL_OF('idPreface'), readerCode: 'B', partLabel: null },
    }));
    await load();
    library.countPlay.mockClear();
    AudioPlayer.toggle();                     // the resume rebuild
    await new Promise((r) => setTimeout(r, 0));
    expect(el().played).toBe(true);
    expect(library.countPlay).not.toHaveBeenCalled();
  });
});

describe('audio-player — reader-alternate renditions', () => {
  it('lists the primary rendition first, then one entry per alternate reader', () => {
    const list = AudioPlayer.renditionsFor('vol1', { id: 'letter-a', title: 'Letter A' }, 'Volume One');
    expect(list.map((r) => r.reader)).toEqual(['B', 'V']);
    expect(list[0].tracks.map((t) => t.url)).toEqual([URL_OF('idA1'), URL_OF('idA2')]);
    expect(list[1].tracks).toEqual([
      { key: 'vol1:letter-a', title: 'Letter A', sub: 'Volume One', url: URL_OF('idA1v'), readerCode: 'V', partLabel: 'Part 1' },
      { key: 'vol1:letter-a', title: 'Letter A', sub: 'Volume One', url: URL_OF('idA2v'), readerCode: 'V', partLabel: 'Part 2' },
    ]);
  });

  it('is the primary alone without alternates, and empty when the letter has no audio', () => {
    const preface = AudioPlayer.renditionsFor('vol1', { id: 'preface', title: 'Preface' }, 'Volume One');
    expect(preface.map((r) => r.reader)).toEqual(['B']);
    expect(preface[0].tracks.map((t) => t.url)).toEqual([URL_OF('idPreface')]);
    expect(AudioPlayer.renditionsFor('vol1', { id: 'letter-b', title: 'Letter B' }, null)).toEqual([]);
    expect(AudioPlayer.renditionsFor('vol1', null, null)).toEqual([]);
  });

  it('playCollection startReader swaps only the start letter; the next keeps its primary', () => {
    AudioPlayer.playCollection({
      volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One', startId: 'letter-a', startReader: 'V',
    });
    const s = AudioPlayer.getState();
    expect(s.queue.map((t) => t.url)).toEqual([URL_OF('idA1v'), URL_OF('idA2v'), URL_OF('idC')]);
    expect(s.queue.map((t) => t.readerCode)).toEqual(['V', 'V', 'T']);
    expect(el().src).toBe(URL_OF('idA1v'));
  });

  it('falls back to the primary rendition when that reader has none', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, startId: 'letter-a', startReader: 'M' });
    expect(AudioPlayer.getState().queue.map((t) => t.url)).toEqual([URL_OF('idA1'), URL_OF('idA2'), URL_OF('idC')]);
  });

  it('playLetter with a reader uses that rendition even without the collection registry', () => {
    AudioPlayer.playLetter({
      volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' }, collectionLabel: 'Volume One', reader: 'V',
    });
    expect(AudioPlayer.getState().queue.map((t) => t.url)).toEqual([URL_OF('idCv')]);
    expect(el().src).toBe(URL_OF('idCv'));
  });

  it('persists the chosen reader and resumes on that rendition after a reboot', async () => {
    globalThis.COL_BY_KEY = new Map([['vol1', { volKey: 'vol1', label: 'Volume One' }]]);
    globalThis.colPreface = () => ITEMS[0];
    globalThis.colLetterArr = () => ITEMS.slice(1);
    try {
      AudioPlayer.playCollection({
        volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One', startId: 'letter-a', startReader: 'V',
      });
      el().dispatchEvent(new Event('playing'));
      el().currentTime = 10;
      el().dispatchEvent(new Event('timeupdate'));
      const snapshot = JSON.parse(localStorage.getItem('vot-audio-pos'));
      expect(snapshot.startReader).toBe('V');
      expect(snapshot.track.url).toBe(URL_OF('idA1v'));

      await load();   // the reboot
      AudioPlayer.toggle();
      await new Promise((r) => setTimeout(r, 0));
      const st = AudioPlayer.getState();
      // The rebuilt default queue holds Letter A's PRIMARY tracks; the saved
      // reader's rendition takes their place so the position survives.
      expect(st.queue.map((t) => t.url)).toEqual([URL_OF('idA1v'), URL_OF('idA2v'), URL_OF('idC')]);
      expect(st.qi).toBe(0);
      expect(el().src).toBe(URL_OF('idA1v'));
    } finally {
      delete globalThis.COL_BY_KEY;
      delete globalThis.colPreface;
      delete globalThis.colLetterArr;
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
  it('activates on playing, HOLDS through pause, deactivates on stop', () => {
    // Media-card rework 2026-08-09: pause no longer releases the anchor —
    // the paused system media card needs the WebView (this player) alive for
    // its Play button to work, so only 'idle' (stop / queue end) deactivates.
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    expect(bridge.setAudioActive).not.toHaveBeenCalled(); // 'loading' is not playback

    el().dispatchEvent(new Event('playing'));
    expect(bridge.setAudioActive).toHaveBeenCalledWith(true);

    AudioPlayer.toggle();   // pause
    expect(bridge.setAudioActive).not.toHaveBeenCalledWith(false);
    expect(bridge.setAudioActive).toHaveBeenCalledTimes(1);

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

describe('audio-player — native media card (setAudioNowPlaying + __votMediaCommand)', () => {
  // The web MediaSession is inert inside the Android WebView, so the player
  // mirrors the same metadata to AndroidBridge.setAudioNowPlaying for the
  // system media card (QS carousel / lock screen), and receives the card's
  // transport taps back through window.__votMediaCommand.

  it('mirrors track metadata + state to the bridge on start and edges', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' }, collectionLabel: 'Volume One' });
    // Track start ('loading') already pushes metadata so the card titles
    // itself before the first byte arrives.
    expect(bridge.setAudioNowPlaying).toHaveBeenCalledWith(
      'Letter A — Part 1', 'The Volumes of Truth · Read by Benjamin',
      true,               // buffering counts as playing — same rule as the web session
      expect.any(Number), expect.any(Number), expect.any(Number)
    );
    el().dispatchEvent(new Event('playing'));
    expect(bridge.setAudioNowPlaying).toHaveBeenLastCalledWith(
      'Letter A — Part 1', expect.any(String), true,
      expect.any(Number), expect.any(Number), expect.any(Number)
    );
    AudioPlayer.toggle();   // pause edge → playing=false
    expect(bridge.setAudioNowPlaying).toHaveBeenLastCalledWith(
      expect.any(String), expect.any(String), false,
      expect.any(Number), expect.any(Number), expect.any(Number)
    );
  });

  it('does NOT sync natively on per-second timeupdates (edge-driven, not chatty)', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    el().dispatchEvent(new Event('playing'));
    const calls = bridge.setAudioNowPlaying.mock.calls.length;
    for (let t = 1; t <= 5; t++) {
      el().currentTime = t;
      el().dispatchEvent(new Event('timeupdate'));
    }
    // Five 1 Hz ticks, zero native updates — the card interpolates position
    // from (position, rate); per-second Intents would be binder churn.
    expect(bridge.setAudioNowPlaying.mock.calls.length).toBe(calls);
  });

  it('resyncs on seek (a position jump breaks the card interpolation)', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    el().dispatchEvent(new Event('playing'));
    el().duration = 60;
    el().dispatchEvent(new Event('durationchange'));
    const calls = bridge.setAudioNowPlaying.mock.calls.length;
    AudioPlayer.seek(42);
    expect(bridge.setAudioNowPlaying.mock.calls.length).toBe(calls + 1);
    const last = bridge.setAudioNowPlaying.mock.calls.at(-1);
    expect(last[3]).toBe(42);   // positionSec
    expect(last[4]).toBe(60);   // durationSec
  });

  it('routes system transport commands into the player', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    el().dispatchEvent(new Event('playing'));
    expect(typeof window.__votMediaCommand).toBe('function');

    window.__votMediaCommand('toggle', 0);
    expect(AudioPlayer.getState().status).toBe('paused');
    window.__votMediaCommand('play', 0);
    // The command reached the element (toggle -> el.play()); the status flips
    // on the 'playing' event, which the fake element doesn't auto-fire.
    expect(el().paused).toBe(false);
    el().dispatchEvent(new Event('playing'));
    expect(AudioPlayer.getState().status).toBe('playing');

    const beforeNext = AudioPlayer.getState().qi;
    window.__votMediaCommand('next', 0);
    expect(AudioPlayer.getState().qi).toBe(beforeNext + 1);
    window.__votMediaCommand('prev', 0);
    expect(AudioPlayer.getState().qi).toBe(beforeNext);

    el().duration = 90;
    el().dispatchEvent(new Event('durationchange'));
    window.__votMediaCommand('seekTo', 30000);   // ms in, seconds applied
    expect(AudioPlayer.getState().time).toBe(30);
  });

  it('a bad command never throws into the bridge', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    el().dispatchEvent(new Event('playing'));
    expect(() => window.__votMediaCommand('definitely-not-a-command', NaN)).not.toThrow();
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

  it('a startId queue persists its horizon and rebuilds forward-only after a reboot', async () => {
    globalThis.COL_BY_KEY = new Map([['vol1', { volKey: 'vol1', label: 'Volume One' }]]);
    globalThis.colPreface = () => ITEMS[0];
    globalThis.colLetterArr = () => ITEMS.slice(1);
    try {
      AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One', startId: 'letter-a' });
      el().dispatchEvent(new Event('playing'));
      tick(10);
      expect(saved().startKey).toBe('vol1:letter-a');

      await load();   // the reboot
      AudioPlayer.toggle();
      await new Promise((r) => setTimeout(r, 0));
      const st = AudioPlayer.getState();
      // The preface stays behind the horizon — only Letter A's parts + Letter C.
      expect(st.queue.map((t) => t.url)).toEqual([URL_OF('idA1'), URL_OF('idA2'), URL_OF('idC')]);
      expect(st.qi).toBe(0);
      expect(st.queue[st.qi].url).toBe(URL_OF('idA1'));
    } finally {
      delete globalThis.COL_BY_KEY;
      delete globalThis.colPreface;
      delete globalThis.colLetterArr;
    }
  });

  it('a mid-list section queue rebuilds from its chosen section after a reboot', async () => {
    AudioPlayer.playSection('wtlb1', 1, 'Words To Live By');
    el().dispatchEvent(new Event('playing'));
    tick(10);
    expect(saved().startIndex).toBe(1);

    await load();
    AudioPlayer.toggle();
    await new Promise((r) => setTimeout(r, 0));
    const st = AudioPlayer.getState();
    expect(st.queue.map((t) => t.url)).toEqual([URL_OF('sec2'), URL_OF('sec3')]);
    expect(st.qi).toBe(0);
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

describe('audio-player — durable per-recording positions', () => {
  /* AudioPositionsStore rides bundle-b; the player only ever sees it through
     the fail-quiet globalThis bridge, so an in-memory stand-in with the same
     three methods is the whole contract. */
  const urlOf = (value) => (typeof value === 'string' ? value : (value && value.url) || '');
  function installPositions(seed) {
    const map = new Map(Object.entries(seed || {}));
    const store = {
      map,
      getPosition: vi.fn((value) => map.get(urlOf(value)) || null),
      setPosition: vi.fn((value, t, d) => { map.set(urlOf(value), { t, d }); }),
      clearPosition: vi.fn((value) => { map.delete(urlOf(value)); }),
    };
    globalThis.AudioPositionsStore = store;
    return store;
  }
  const tick = (t) => { el().currentTime = t; el().dispatchEvent(new Event('timeupdate')); };
  const meta = (duration) => { el().duration = duration; el().dispatchEvent(new Event('loadedmetadata')); };
  const SOLO = { key: 'vol2:solo', title: 'Solo', sub: 'Volume Two', url: URL_OF('idSolo'), readerCode: 'M', partLabel: null };

  it('resumes a remembered recording five seconds before where it was left', () => {
    installPositions({ [URL_OF('idSolo')]: { t: 300, d: 1200 } });
    AudioPlayer.playTrack(SOLO);
    expect(el().src).toBe(URL_OF('idSolo'));
    expect(el().currentTime).toBe(0);      // pre-metadata the seek is deferred…
    meta(1200);
    expect(el().currentTime).toBe(295);    // …then lands with the context nudge
  });

  it('does not resume a recording barely begun (under 30s)', () => {
    installPositions({ [URL_OF('idSolo')]: { t: 29.9, d: 1200 } });
    AudioPlayer.playTrack(SOLO);
    meta(1200);
    expect(el().currentTime).toBe(0);
  });

  it('does not resume a recording already at its tail (97% or past)', () => {
    installPositions({ [URL_OF('idSolo')]: { t: 1164, d: 1200 } });   // exactly 97%
    AudioPlayer.playTrack(SOLO);
    meta(1200);
    expect(el().currentTime).toBe(0);
  });

  it('still resumes when the length was never recorded', () => {
    // Not knowing how long a recording runs is no reason to throw away an
    // hour of it — the tail test is simply skipped.
    installPositions({ [URL_OF('idSolo')]: { t: 3000, d: 0 } });
    AudioPlayer.playTrack(SOLO);
    meta(4000);
    expect(el().currentTime).toBe(2995);
  });

  it('a recording of ~31s or less can NEVER resume — emergent, and CORRECT', () => {
    // `t >= 30` and `t < 0.97 * d` have no common solution until d exceeds
    // 30 / 0.97 ≈ 30.93, so nothing at or under half a minute can ever resume,
    // whatever is stored for it. That is the RIGHT answer, not an oversight: a
    // clip that short is cheaper to hear again than to be dropped into, and the
    // 5s nudge would land at or before its own beginning. Pinned here so that
    // changing either threshold is a decision someone makes on purpose.
    const positions = installPositions({ [URL_OF('idSolo')]: { t: 29.9, d: 30 } });
    AudioPlayer.playTrack(SOLO);
    meta(30);
    expect(el().currentTime).toBe(0);          // below the 30s floor

    AudioPlayer.stop();
    positions.map.set(URL_OF('idSolo'), { t: 30, d: 30 });   // the only other candidate
    AudioPlayer.playTrack(SOLO);
    meta(30);
    expect(el().currentTime).toBe(0);          // …and it is already "finished"
  });

  it('playLetter resumes the letter it starts', () => {
    installPositions({ [URL_OF('idC')]: { t: 480, d: 1500 } });
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    meta(1500);
    expect(el().currentTime).toBe(475);
  });

  it('playCollection consults the STARTING track only', () => {
    installPositions({
      [URL_OF('idPreface')]: { t: 240, d: 900 },
      [URL_OF('idA1')]: { t: 500, d: 900 },
    });
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    meta(900);
    expect(el().currentTime).toBe(235);        // the preface's own remembered place

    // Walking forward starts the next recording at its beginning: only the
    // track the listener actually chose is consulted.
    AudioPlayer.next();
    el().dispatchEvent(new Event('loadedmetadata'));
    expect(el().currentTime).toBe(0);
  });

  it('a recording heard to its end is forgotten, and the advance cannot write it back', () => {
    const positions = installPositions();
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    el().dispatchEvent(new Event('playing'));
    tick(40);
    expect(positions.map.get(URL_OF('idC'))).toEqual({ t: 40, d: 0 });

    el().dispatchEvent(new Event('ended'));
    expect(positions.clearPosition).toHaveBeenCalledWith(URL_OF('idC'));
    expect(positions.map.has(URL_OF('idC'))).toBe(false);
  });

  it('attributes the clock to the track being LEFT, not the one starting (R8)', () => {
    const positions = installPositions();
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    el().dispatchEvent(new Event('playing'));
    el().duration = 420;
    tick(200);
    positions.setPosition.mockClear();

    AudioPlayer.next();
    expect(positions.setPosition).toHaveBeenCalledTimes(1);
    expect(positions.setPosition.mock.calls[0][0].url).toBe(URL_OF('idPreface'));
    expect(positions.setPosition.mock.calls[0][1]).toBe(200);
    expect(positions.map.get(URL_OF('idPreface'))).toEqual({ t: 200, d: 420 });
    expect(positions.map.has(URL_OF('idA1'))).toBe(false);   // nothing landed on the new track
  });

  it('closing the bar keeps the place in the recording', () => {
    const positions = installPositions();
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    el().dispatchEvent(new Event('playing'));
    el().duration = 3600;
    tick(1800);

    AudioPlayer.stop();
    expect(localStorage.getItem('vot-audio-pos')).toBe(null);                 // the one-slot snapshot goes
    expect(positions.map.get(URL_OF('idC'))).toEqual({ t: 1800, d: 3600 });   // the memory does not
  });

  it('writes at most once a second, and always at a boundary', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-09T12:00:00Z'));
      const positions = installPositions();
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
      el().duration = 600;
      el().dispatchEvent(new Event('durationchange'));

      AudioPlayer.seek(100);
      AudioPlayer.seek(150);
      AudioPlayer.seek(200);
      expect(positions.setPosition).toHaveBeenCalledTimes(1);   // a drag cannot storm the store

      vi.advanceTimersByTime(1100);
      AudioPlayer.seek(250);
      expect(positions.setPosition).toHaveBeenCalledTimes(2);

      AudioPlayer.stop();                                       // a boundary always lands
      expect(positions.setPosition).toHaveBeenCalledTimes(3);
      expect(positions.map.get(URL_OF('idC'))).toEqual({ t: 250, d: 600 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays exactly the same with no positions store, or one that throws', () => {
    delete globalThis.AudioPositionsStore;
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    el().dispatchEvent(new Event('playing'));
    tick(40);
    expect(AudioPlayer.getState().status).toBe('playing');
    AudioPlayer.stop();

    const boom = () => { throw new Error('store is on fire'); };
    globalThis.AudioPositionsStore = { getPosition: boom, setPosition: boom, clearPosition: boom };
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    el().dispatchEvent(new Event('playing'));
    tick(40);
    expect(AudioPlayer.getState().status).toBe('playing');
    el().dispatchEvent(new Event('ended'));
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

/* The whole-book shape is LEGACY as of 2026-08-09: every shipped edition is
   per-chapter (see the BRM/WOP describes below). It stays exercised because
   audio-bible-v1 is permanent — saved Listening Library recordings and
   pre-switch resume snapshots still point at those one-file-per-book tracks,
   and the code that plays them must keep working forever. */
describe('audio-player — whole-book Bible audiobooks (bible-* volKeys)', () => {
  const BURL = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-bible-v1/' + id + '.mp3';
  const BIBLE_MANIFEST = {
    'bible-brm-kjv:genesis': [['brm-kjv_genesis', '']],
    'bible-brm-kjv:exodus': [['brm-kjv_exodus', '']],
    'bible-brm-kjv:revelation': [['brm-kjv_revelation', '']],
  };
  const BIBLE_BOOKS = [['genesis', 'Genesis'], ['exodus', 'Exodus'], ['revelation', 'Revelation']];

  beforeEach(() => {
    globalThis.BIBLE_AUDIO_MANIFEST = BIBLE_MANIFEST;
    globalThis.BIBLE_AUDIO_BOOKS = BIBLE_BOOKS;
  });
  afterEach(() => {
    delete globalThis.BIBLE_AUDIO_MANIFEST;
    delete globalThis.BIBLE_AUDIO_BOOKS;
  });

  it('hasAudio routes bible- volKeys to the Bible manifest without touching the letter map', () => {
    expect(AudioPlayer.hasAudio('bible-brm-kjv', 'genesis')).toBe(true);
    expect(AudioPlayer.hasAudio('bible-brm-kjv', 'psalms')).toBe(false);   // not in this fixture
    expect(AudioPlayer.hasAudio('vol1', 'preface')).toBe(true);            // letters unaffected
    expect(AudioPlayer.collectionHasAudio('bible-brm-kjv')).toBe(true);
  });

  it('playBibleBook queues the tapped book and the books after it (forward-only), streaming from audio-bible-v1', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'exodus', label: 'KJV · Biblical Restoration Ministries' });
    const s = AudioPlayer.getState();
    expect(s.queue.map((t) => t.url)).toEqual([BURL('brm-kjv_exodus'), BURL('brm-kjv_revelation')]);
    expect(s.qi).toBe(0);
    expect(s.queue[0].title).toBe('Exodus');
    expect(s.queue[0].sub).toBe('KJV · Biblical Restoration Ministries');
    expect(el().src).toBe(BURL('brm-kjv_exodus'));
    // Bar next walks the FOLLOWING books; Genesis stays behind the horizon.
    AudioPlayer.next();
    expect(AudioPlayer.getState().queue[AudioPlayer.getState().qi].url).toBe(BURL('brm-kjv_revelation'));
  });

  it('never offers reader alternates — a whole-book edition has one voice', () => {
    globalThis.AUDIO_ALTERNATES = { 'bible-brm-kjv:exodus': [['V', [['brm-tts_exodus']]]] };
    const list = AudioPlayer.renditionsFor('bible-brm-kjv', { id: 'exodus', title: 'Exodus' }, null);
    expect(list).toHaveLength(1);
    expect(list[0].tracks.map((t) => t.url)).toEqual([BURL('brm-kjv_exodus')]);
  });

  it('never prefetch-warms whole-book Bible tracks (a warm = a full audiobook download)', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'genesis', label: null });
    const main = FakeAudio.last;
    main.dispatchEvent(new Event('playing'));
    main.duration = 100;
    main.buffered = { length: 1, end: () => 100 };   // fully buffered — letters would warm here
    main.currentTime = 1;
    main.dispatchEvent(new Event('timeupdate'));
    expect(FakeAudio.last).toBe(main);               // no warmer element created
  });

  it('restores a persisted Bible collection across a reboot without any corpus load', async () => {
    localStorage.setItem('vot-audio-pos', JSON.stringify({
      v: 2, mode: 'collection', volKey: 'bible-brm-kjv', label: 'KJV · Biblical Restoration Ministries',
      qi: 1, key: 'bible-brm-kjv:exodus', time: 120,
      track: { key: 'bible-brm-kjv:exodus', title: 'Exodus', sub: 'KJV · Biblical Restoration Ministries', url: BURL('brm-kjv_exodus'), readerCode: '' },
    }));
    await load();   // fresh module = the reboot
    let s = AudioPlayer.getState();
    expect(s.status).toBe('paused');                 // placeholder bar, zero network
    expect(s.queue.length).toBe(1);
    expect(s.queue[0].url).toBe(BURL('brm-kjv_exodus'));
    AudioPlayer.toggle();                            // first transport tap rebuilds
    await Promise.resolve(); await Promise.resolve();
    s = AudioPlayer.getState();
    expect(s.queue.length).toBe(3);                  // full edition rebuilt from BIBLE_AUDIO_BOOKS
    expect(s.qi).toBe(1);
    expect(el().src).toBe(BURL('brm-kjv_exodus'));
  });
});

describe('audio-player — Bible chapter seek (whole-book track + offset index)', () => {
  const BURL = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-bible-v1/' + id + '.mp3';

  beforeEach(() => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:jeremiah': [['brm-kjv_jeremiah', '']] };
    globalThis.BIBLE_AUDIO_BOOKS = [['jeremiah', 'Jeremiah']];
    globalThis.BIBLE_AUDIO_CHAPTERS = { 'bible-brm-kjv:jeremiah': [0, 184, 552, 1000, 1200, 1500, 1755] };
  });
  afterEach(() => {
    delete globalThis.BIBLE_AUDIO_MANIFEST;
    delete globalThis.BIBLE_AUDIO_BOOKS;
    delete globalThis.BIBLE_AUDIO_CHAPTERS;
  });

  it('bibleChapterStart maps chapters to offsets, 0 for ch1/unknown/uncovered', () => {
    expect(AudioPlayer.bibleChapterStart('bible-brm-kjv', 'jeremiah', 7)).toBe(1755);
    expect(AudioPlayer.bibleChapterStart('bible-brm-kjv', 'jeremiah', 2)).toBe(184);
    expect(AudioPlayer.bibleChapterStart('bible-brm-kjv', 'jeremiah', 1)).toBe(0);   // book start keeps the intro
    expect(AudioPlayer.bibleChapterStart('bible-brm-kjv', 'jeremiah', 99)).toBe(0);  // beyond the index
    expect(AudioPlayer.bibleChapterStart('bible-brm-kjv', 'genesis', 5)).toBe(0);    // no row
    expect(AudioPlayer.bibleChapterStart('bible-brm-kjv', 'jeremiah', null)).toBe(0);
  });

  it('playBibleBook with chapterNum seeks once metadata arrives', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jeremiah', label: 'KJV', chapterNum: 7 });
    expect(el().src).toBe(BURL('brm-kjv_jeremiah'));
    expect(el().currentTime).toBe(0);            // pre-metadata: seek deferred
    el().duration = 13414;
    el().dispatchEvent(new Event('loadedmetadata'));
    expect(el().currentTime).toBe(1755);
  });

  it('chapter 1 and books without a chapter row start from the book head', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jeremiah', label: 'KJV', chapterNum: 1 });
    el().duration = 13414;
    el().dispatchEvent(new Event('loadedmetadata'));
    expect(el().currentTime).toBe(0);
  });

  it('a remembered position resumes the book when no chapter was tapped', () => {
    globalThis.AudioPositionsStore = { getPosition: () => ({ t: 600, d: 13414 }), setPosition() {}, clearPosition() {} };
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jeremiah', label: 'KJV' });
    el().duration = 13414;
    el().dispatchEvent(new Event('loadedmetadata'));
    expect(el().currentTime).toBe(595);
  });

  it('an explicitly tapped chapter outranks a remembered position', () => {
    // Both deferred seeks are registered; the chapter's is added second and
    // therefore assigns last. A tap on chapter 7 must mean chapter 7.
    globalThis.AudioPositionsStore = { getPosition: () => ({ t: 600, d: 13414 }), setPosition() {}, clearPosition() {} };
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jeremiah', label: 'KJV', chapterNum: 7 });
    el().duration = 13414;
    el().dispatchEvent(new Event('loadedmetadata'));
    expect(el().currentTime).toBe(1755);
  });
});

describe('audio-player — per-chapter Bible edition (Word of Promise)', () => {
  const OT = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-wop-v1/' + id + '.mp3';
  const mkParts = (book, t, n) => Array.from({ length: n }, (_v, i) => {
    const c = String(i + 1).padStart(3, '0');
    return ['wop' + t + '_' + book + '_' + c, '', 'Chapter ' + (i + 1)];
  });

  beforeEach(() => {
    globalThis.BIBLE_AUDIO_MANIFEST = {
      'bible-wop-nkjv:jonah': mkParts('jonah', 1, 4),
      'bible-wop-nkjv:micah': mkParts('micah', 1, 7),
    };
    globalThis.BIBLE_AUDIO_BOOKS = [['jonah', 'Jonah'], ['micah', 'Micah']];
  });
  afterEach(() => {
    delete globalThis.BIBLE_AUDIO_MANIFEST;
    delete globalThis.BIBLE_AUDIO_BOOKS;
  });

  it('chapters are queue TRACKS with partLabels, streaming from the wop release', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-wop-nkjv', bookId: 'jonah', label: 'NKJV · The Word of Promise' });
    const s = AudioPlayer.getState();
    expect(s.queue.length).toBe(11);                       // 4 Jonah + 7 Micah, forward-only from Jonah
    expect(s.queue[0].url).toBe(OT('wop1_jonah_001'));
    expect(s.queue[0].partLabel).toBe('Chapter 1');
    expect(s.qi).toBe(0);
  });

  it('choosing chapter N positions the queue at that chapter track (no seek)', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-wop-nkjv', bookId: 'jonah', label: null, chapterNum: 3 });
    const s = AudioPlayer.getState();
    expect(s.queue[0].url).toBe(OT('wop1_jonah_003'));     // horizon starts AT the chapter
    expect(s.queue[0].partLabel).toBe('Chapter 3');
    expect(s.qi).toBe(0);
    expect(el().src).toBe(OT('wop1_jonah_003'));
    // next() walks to chapter 4, then into the next book's chapter 1.
    AudioPlayer.next();
    expect(AudioPlayer.getState().queue[AudioPlayer.getState().qi].url).toBe(OT('wop1_jonah_004'));
    AudioPlayer.next();
    expect(AudioPlayer.getState().queue[AudioPlayer.getState().qi].url).toBe(OT('wop1_micah_001'));
  });

  it('a chapterNum past the book clamps to its last chapter', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-wop-nkjv', bookId: 'jonah', label: null, chapterNum: 99 });
    expect(AudioPlayer.getState().queue[0].url).toBe(OT('wop1_jonah_004'));
  });
});

/* The BRM KJV edition became per-chapter on 2026-08-09 (1,189 files across
   audio-brm-v1 OT / audio-brm-v2 NT, replacing the 66 whole-book tracks).
   Parity with the Word of Promise describe above is the point: playBibleBook
   branches on SHAPE, not edition id, so both editions must behave identically. */
describe('audio-player — per-chapter Bible edition (BRM KJV)', () => {
  const OT = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v1/' + id + '.mp3';
  const NT = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v2/' + id + '.mp3';
  const mkParts = (book, t, n) => Array.from({ length: n }, (_v, i) => {
    const c = String(i + 1).padStart(3, '0');
    return ['brm' + t + '_' + book + '_' + c, '', 'Chapter ' + (i + 1)];
  });

  beforeEach(() => {
    globalThis.BIBLE_AUDIO_MANIFEST = {
      'bible-brm-kjv:jonah': mkParts('jonah', 1, 4),
      'bible-brm-kjv:micah': mkParts('micah', 1, 7),
      'bible-brm-kjv:jude': mkParts('jude', 2, 1),
    };
    globalThis.BIBLE_AUDIO_BOOKS = [['jonah', 'Jonah'], ['micah', 'Micah'], ['jude', 'Jude']];
  });
  afterEach(() => {
    delete globalThis.BIBLE_AUDIO_MANIFEST;
    delete globalThis.BIBLE_AUDIO_BOOKS;
  });

  it('chapters are queue TRACKS with partLabels, streaming from the brm release', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jonah', label: 'KJV · Biblical Restoration Ministries' });
    const s = AudioPlayer.getState();
    expect(s.queue.length).toBe(12);                       // 4 Jonah + 7 Micah + 1 Jude, forward-only
    expect(s.queue[0].url).toBe(OT('brm1_jonah_001'));
    expect(s.queue[0].partLabel).toBe('Chapter 1');
    expect(s.queue[0].title).toBe('Jonah');
    expect(s.qi).toBe(0);
    // The testament digit in the asset name — not the book — picks the tag.
    expect(s.queue[11].url).toBe(NT('brm2_jude_001'));
  });

  it('choosing chapter N positions the queue at that chapter track (no seek)', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jonah', label: null, chapterNum: 3 });
    const s = AudioPlayer.getState();
    expect(s.queue[0].url).toBe(OT('brm1_jonah_003'));     // horizon starts AT the chapter
    expect(s.queue[0].partLabel).toBe('Chapter 3');
    expect(s.qi).toBe(0);
    expect(el().src).toBe(OT('brm1_jonah_003'));
    // No whole-book seek is armed any more: the chapter IS the file.
    el().duration = 300;
    el().dispatchEvent(new Event('loadedmetadata'));
    expect(el().currentTime).toBe(0);
    // next() walks the remaining chapters, then into the next book's chapter 1.
    AudioPlayer.next();
    expect(AudioPlayer.getState().queue[AudioPlayer.getState().qi].url).toBe(OT('brm1_jonah_004'));
    AudioPlayer.next();
    expect(AudioPlayer.getState().queue[AudioPlayer.getState().qi].url).toBe(OT('brm1_micah_001'));
  });

  it('a chapterNum past the book clamps to its last chapter', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jonah', label: null, chapterNum: 99 });
    expect(AudioPlayer.getState().queue[0].url).toBe(OT('brm1_jonah_004'));
  });

  it('per-chapter tracks DO prefetch-warm — only the legacy whole-book release is skipped', () => {
    // The skip in _warmTargets tests exactly one prefix (audio-bible-v1), so
    // this falls out of the switch rather than needing its own rule: a chapter
    // file is letter-sized, and warming it is the same start-latency win.
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jonah', label: null });
    const main = FakeAudio.last;
    main.dispatchEvent(new Event('playing'));
    main.duration = 100;
    main.buffered = { length: 1, end: () => 100 };
    main.currentTime = 1;
    main.dispatchEvent(new Event('timeupdate'));
    const warm = FakeAudio.last;
    expect(warm).not.toBe(main);                           // a warmer WAS created
    expect(warm.src).toBe(OT('brm1_jonah_002'));
    expect(warm.played).toBe(false);
  });
});

/* R6 — the resume hazard of the whole-book → per-chapter switch. An installed
   app can hold a vot-audio-pos snapshot written by the PREVIOUS build: a
   whole-book audio-bible-v1 URL plus a clock measured against the entire book.
   Replayed verbatim against the new per-chapter queue that is a ~9,000s seek
   into a ~300s file — the element fires 'ended' at once and the place is lost. */
describe('audio-player — whole-book → per-chapter resume migration', () => {
  const LEGACY = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-bible-v1/' + id + '.mp3';
  const OT = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v1/' + id + '.mp3';
  const mkParts = (book, n) => Array.from({ length: n }, (_v, i) => {
    const c = String(i + 1).padStart(3, '0');
    return ['brm1_' + book + '_' + c, '', 'Chapter ' + (i + 1)];
  });
  /* Real BRM chapter-start offsets (the shipped BIBLE_AUDIO_CHAPTERS rows),
     so the arithmetic under test is the arithmetic that will run on device. */
  const GEN_STARTS = [0, 294, 485, 720, 939, 1114, 1326, 1527, 1716, 1955, 2149, 2350, 2531, 2686, 2891, 3067, 3211, 3477, 3781, 4126, 4309, 4562, 4784, 4959, 5560, 5802, 6093, 6530, 6738, 6988, 7313, 7793, 8057, 8226, 8475, 8684, 8973, 9244, 9481, 9663, 9835, 10270, 10592, 10915, 11201, 11435, 11700, 12013, 12272, 12672];

  /** Where the migration must land for a book-relative clock. */
  function expected(starts, saved) {
    let index = 0;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] > saved) break;
      index = i;
    }
    return { chapter: index + 1, offset: saved - starts[index] };
  }

  /** A snapshot written by the pre-switch build, then a reboot. */
  async function reboot(snapshot) {
    localStorage.setItem('vot-audio-pos', JSON.stringify(snapshot));
    await load();
    AudioPlayer.toggle();                       // first transport tap rebuilds
    await Promise.resolve(); await Promise.resolve();
    return AudioPlayer.getState();
  }

  beforeEach(() => {
    globalThis.BIBLE_AUDIO_MANIFEST = {
      'bible-brm-kjv:genesis': mkParts('genesis', 50),
      'bible-brm-kjv:exodus': mkParts('exodus', 40),
    };
    globalThis.BIBLE_AUDIO_BOOKS = [['genesis', 'Genesis'], ['exodus', 'Exodus']];
    globalThis.BIBLE_AUDIO_CHAPTERS = { 'bible-brm-kjv:genesis': GEN_STARTS };
  });
  afterEach(() => {
    delete globalThis.BIBLE_AUDIO_MANIFEST;
    delete globalThis.BIBLE_AUDIO_BOOKS;
    delete globalThis.BIBLE_AUDIO_CHAPTERS;
  });

  it('maps a deep whole-book position to the right chapter track and offset inside it', async () => {
    const SAVED = 9000;
    const want = expected(GEN_STARTS, SAVED);
    expect(want.chapter).toBe(37);              // fixture sanity: 9,000s in = Genesis 37
    expect(want.offset).toBe(27);

    const s = await reboot({
      v: 2, mode: 'collection', volKey: 'bible-brm-kjv', label: 'KJV · Biblical Restoration Ministries',
      qi: 0, key: 'bible-brm-kjv:genesis', time: SAVED,
      track: { key: 'bible-brm-kjv:genesis', title: 'Genesis', sub: 'KJV · Biblical Restoration Ministries', url: LEGACY('brm-kjv_genesis'), readerCode: '' },
    });

    const pad = String(want.chapter).padStart(3, '0');
    expect(s.queue[s.qi].url).toBe(OT('brm1_genesis_' + pad));
    expect(s.queue[s.qi].partLabel).toBe('Chapter ' + want.chapter);
    expect(el().src).toBe(OT('brm1_genesis_' + pad));
    // Without the migration this is chapter 1 seeked to 9,000s — the R6 bug.
    expect(s.qi).not.toBe(0);
    el().duration = 300;
    el().dispatchEvent(new Event('loadedmetadata'));
    expect(el().currentTime).toBe(want.offset);
    expect(el().currentTime).toBeLessThan(el().duration);
  });

  it('offsets the chapter within the whole rebuilt queue, not just within the book', async () => {
    const SAVED = 9000;
    const want = expected(GEN_STARTS, SAVED);
    // No startKey (the queue was never sliced), so Genesis' chapters sit at
    // the head and Exodus follows — the landing index is book-relative.
    const s = await reboot({
      v: 2, mode: 'collection', volKey: 'bible-brm-kjv', label: null,
      qi: 0, key: 'bible-brm-kjv:genesis', time: SAVED,
      track: { key: 'bible-brm-kjv:genesis', title: 'Genesis', sub: null, url: LEGACY('brm-kjv_genesis'), readerCode: '' },
    });
    expect(s.queue.length).toBe(90);            // 50 Genesis + 40 Exodus
    expect(s.qi).toBe(want.chapter - 1);
    expect(s.queue[s.qi].key).toBe('bible-brm-kjv:genesis');
  });

  it('falls back to chapter 1 at 0 when the book has no chapter index', async () => {
    // Exodus has no BIBLE_AUDIO_CHAPTERS row here. The failure mode being
    // avoided is a deep seek into a short file, so the only safe answer is the
    // book's start — never the saved clock.
    const s = await reboot({
      v: 2, mode: 'collection', volKey: 'bible-brm-kjv', label: null,
      qi: 1, key: 'bible-brm-kjv:exodus', time: 5000,
      track: { key: 'bible-brm-kjv:exodus', title: 'Exodus', sub: null, url: LEGACY('brm-kjv_exodus'), readerCode: '' },
    });
    expect(s.queue[s.qi].url).toBe(OT('brm1_exodus_001'));
    el().duration = 300;
    el().dispatchEvent(new Event('loadedmetadata'));
    expect(el().currentTime).toBe(0);
  });

  it('leaves a genuinely whole-book queue alone (a saved legacy recording still plays whole)', async () => {
    // A saved Listening Library track is mode 'custom': its queue holds the
    // legacy URL itself, so there is nothing to migrate and the clock is still
    // book-relative and correct. audio-bible-v1 is permanent for exactly this.
    const s = await reboot({
      v: 2, mode: 'custom', volKey: '', label: 'KJV · Biblical Restoration Ministries',
      qi: 0, key: 'bible-brm-kjv:genesis', time: 9000,
      track: { key: 'bible-brm-kjv:genesis', title: 'Genesis', sub: null, url: LEGACY('brm-kjv_genesis'), readerCode: '' },
      customQueue: [{ key: 'bible-brm-kjv:genesis', title: 'Genesis', sub: null, url: LEGACY('brm-kjv_genesis'), readerCode: '' }],
    });
    expect(s.queue[s.qi].url).toBe(LEGACY('brm-kjv_genesis'));
    el().duration = 13414;
    el().dispatchEvent(new Event('loadedmetadata'));
    expect(el().currentTime).toBe(9000);
  });
});

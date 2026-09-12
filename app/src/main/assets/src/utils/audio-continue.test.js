// @ts-nocheck — drives a fake media element in jsdom (the audio-player.test.js harness, trimmed)
/* w-audio-continue — RED first (Corbin, 2026-09-11, via the Orchestrator: a reader who pressed Listen once never
   touches the phone again; design-audio-continue.md in the 2026-09-11 session dir).

   Today next()'s last arm is stop(): a collection's last track ends and the bar goes idle. The order is that
   the queue is the SITE ORDER, materialised one unit ahead: when a unit's last track STARTS, the next carded
   collection (COLLECTIONS order, cardId non-null — Hidden Manna has none) is appended, so the pre-warm window
   already holds the boundary track; when the last track ENDS, the same ended → next() → _start() path assigns
   the next unit's first src synchronously on the one element (the activation stays); the source descriptor
   moves to the new collection at the crossing so the desk and the boot snapshot describe the queue truthfully;
   at the end of the order the arm still stop()s — the extension is refused twice (last track's _start, then
   next()'s arm) and both refusals are false by design. Bible queues walk BIBLE_AUDIO_BOOKS the same way. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.all.push(this);
    this._src = '';
    this.srcHistory = [];
    this.currentTime = 0;
    this.readyState = 0;
    this.duration = 0;
    this.paused = true;
    this.preload = '';
    this.error = null;
    this.defaultPlaybackRate = 1;
    this.playbackRate = 1;
    this.buffered = { length: 0, end: () => 0 };
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.srcHistory.push(v); this.currentTime = 0; this.readyState = 0; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}
FakeAudio.all = [];

const MANIFEST = {
  'vol1:letter-a': [['idA1', 'B', 'Part 1'], ['idA2', 'B', 'Part 2']],
  'vol1:letter-c': [['idC', 'T']],
  'vol2:solo': [['idSolo', 'M']],
  'vol3:last': [['idLast', 'B']],
  'hm:secret': [['idSecret', 'B']],
};
const ITEMS = {
  vol1: [{ id: 'letter-a', title: 'Letter A' }, { id: 'letter-b', title: 'Letter B (no audio)' }, { id: 'letter-c', title: 'Letter C' }],
  vol2: [{ id: 'solo', title: 'Solo' }],
  silent: [{ id: 'mute', title: 'Mute (no audio)' }],
  vol3: [{ id: 'last', title: 'Last' }],
  hm: [{ id: 'secret', title: 'Secret' }],
};
// Site order: vol1 → vol2 → silent (carded, no recordings: skipped) → vol3 → hm (no card: never entered).
const COLLECTIONS = [
  { volKey: 'vol1', cardId: 'v1', label: 'Volume One' },
  { volKey: 'vol2', cardId: 'v2', label: 'Volume Two' },
  { volKey: 'silent', cardId: 'vs', label: 'Silent Volume' },
  { volKey: 'vol3', cardId: 'v3', label: 'Volume Three' },
  { volKey: 'hm', cardId: null, label: 'Hidden Manna' },
];
const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';

let AudioPlayer;
const el = () => FakeAudio.all[0];          // the player's singleton is the first element constructed
const warmer = () => FakeAudio.all[1];      // the detached warmer, if the player made one

beforeEach(async () => {
  FakeAudio.all = [];
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  globalThis.COLLECTIONS = COLLECTIONS;
  globalThis.COL_BY_KEY = new Map(COLLECTIONS.map((c) => [c.volKey, c]));
  globalThis.colPreface = () => null;
  globalThis.colLetterArr = (col) => ITEMS[col.volKey] || [];
  localStorage.removeItem('vot-audio-pos');
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  window.AndroidBridge = { setAudioActive: vi.fn(), setAudioNowPlaying: vi.fn() };
  vi.resetModules();
  AudioPlayer = (await import('./audio-player.js')).AudioPlayer;
});

afterEach(() => {
  const arbiter = globalThis.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  for (const k of ['AUDIO_MANIFEST', 'COLLECTIONS', 'COL_BY_KEY', 'colPreface', 'colLetterArr', '__votAudioArbiter', 'Audio']) delete globalThis[k];
  delete window.AndroidBridge;
});

const urls = () => AudioPlayer.getState().queue.map((t) => t.url);
const ended = () => el().dispatchEvent(new Event('ended'));
/** Make the current track "fully buffered" and tick, the way _maybePrefetchNext is reached in the app. */
function tickBuffered() {
  const e = el();
  e.duration = 100;
  e.buffered = { length: 1, end: () => 100 };
  e.currentTime = 1;
  e.dispatchEvent(new Event('timeupdate'));
}

describe('w-audio-continue — the queue is the site order, one unit ahead', () => {
  it('when a collection\'s LAST track starts, the next carded collection is already in the queue and the warmer points at its first track', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS.vol1, collectionLabel: 'Volume One', startId: 'letter-c' });
    // Letter C is vol1's last recording, so this start IS the last track's start.
    expect(urls()).toEqual([URL_OF('idC'), URL_OF('idSolo')]);
    tickBuffered();
    expect(warmer() && warmer().src, 'the pre-warm window sees across the boundary').toBe(URL_OF('idSolo'));
    // During the last track the desk still describes Volume One.
    expect(AudioPlayer.getState().sourceMode).toBe('collection');
    expect(JSON.parse(localStorage.getItem('vot-audio-pos')).volKey).toBe('vol1');
  });

  it('ended on the last track starts the next collection\'s first track inside the same task, on the same element, and the source moves', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS.vol1, collectionLabel: 'Volume One', startId: 'letter-c' });
    const e = el();
    ended();
    expect(e.src, 'src assigned synchronously in the ended handler').toBe(URL_OF('idSolo'));
    expect(FakeAudio.all.filter((a) => a.srcHistory.some((u) => u === URL_OF('idSolo') && a === e)).length).toBe(1);
    expect(e.paused).toBe(false);
    const s = AudioPlayer.getState();
    expect(s.status).not.toBe('idle');
    expect(s.qi).toBe(1);
    // The crossing moved the descriptor: a restart now rebuilds VOLUME TWO around the saved track.
    const snap = JSON.parse(localStorage.getItem('vot-audio-pos'));
    expect(snap.volKey).toBe('vol2');
    expect(snap.key).toBe('vol2:solo');
    expect(snap.startKey).toBeFalsy();
    expect(s.queue[s.qi].sub).toBe('Volume Two');
  });

  it('a carded collection with no recordings is skipped, and Hidden Manna (no card) ends the order: stop(), not a wrap', () => {
    AudioPlayer.playCollection({ volKey: 'vol2', items: ITEMS.vol2, collectionLabel: 'Volume Two' });
    // vol2's only track is its last: the extension skips 'silent' and lands on vol3.
    expect(urls()).toEqual([URL_OF('idSolo'), URL_OF('idLast')]);
    ended();                                    // → vol3's track; vol3 is the last carded collection, so no extension
    expect(el().src).toBe(URL_OF('idLast'));
    expect(urls()).toEqual([URL_OF('idSolo'), URL_OF('idLast')]);
    ended();                                    // the order ends here: hm has no card
    const s = AudioPlayer.getState();
    expect(s.status).toBe('idle');
    expect(s.queue).toHaveLength(0);
    expect(el().srcHistory).not.toContain(URL_OF('idSecret'));
  });

  it('a single letter played alone (no registry) still ends cleanly — nothing to continue into', () => {
    delete globalThis.COLLECTIONS; delete globalThis.COL_BY_KEY; delete globalThis.colLetterArr; delete globalThis.colPreface;
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' }, collectionLabel: 'Volume One' });
    expect(urls()).toEqual([URL_OF('idC')]);
    ended();
    expect(AudioPlayer.getState().status).toBe('idle');
  });
});

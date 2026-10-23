// @ts-nocheck — drives a fake media element in jsdom
/* Close with Undo and the failure line (player brief 2026-10-22, 3a and 3g; L1).
   The bar's Close stopped at once with nothing to undo (section 7). stopWithUndo stops and hands back the record a
   reload restores from; undoStop brings the session back where it was, the way a reload does, and plays again when it
   was playing. A recording that fails to load says which failure on the bar (state.failed) until the next start. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = ''; this.currentTime = 0; this.readyState = 0; this.duration = 0; this.paused = true;
    this.preload = ''; this.error = null; this.defaultPlaybackRate = 1; this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; this.error = null; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const MANIFEST = {
  'vol1:preface': [['idPreface', 'B']],
  'vol1:letter-a': [['idA1', 'B', 'Part 1'], ['idA2', 'B', 'Part 2']],
  'vol1:letter-c': [['idC', 'T']],
};
const ITEMS = [
  { id: 'preface', title: 'A Word of Warning' },
  { id: 'letter-a', title: 'The Wide Path' },
  { id: 'letter-c', title: 'The Seventh Day' },
];
const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';

let AudioPlayer;
const el = () => FakeAudio.last;
const st = () => AudioPlayer.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  FakeAudio.last = null;
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  globalThis.AUDIO_ALTERNATES = {};
  // What a reload rebuilds a collection's queue from (the app's collection registry).
  globalThis.COL_BY_KEY = new Map([['vol1', { volKey: 'vol1' }]]);
  globalThis.colPreface = () => null;
  globalThis.colLetterArr = () => ITEMS;
  localStorage.removeItem('vot-audio-pos');
  vi.resetModules();
  AudioPlayer = (await import('./audio-player.js')).AudioPlayer;
});
afterEach(() => {
  AudioPlayer.stop();
  for (const k of ['AUDIO_MANIFEST', 'AUDIO_ALTERNATES', 'COL_BY_KEY', 'colPreface', 'colLetterArr', 'Audio']) delete globalThis[k];
  localStorage.removeItem('vot-audio-pos');
});

/** The whole collection, on the two-part letter's second part, 42 s in, playing. */
function playingAt42() {
  AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
  AudioPlayer.playAt(2);
  el().dispatchEvent(new Event('playing'));
  el().currentTime = 42;
  el().dispatchEvent(new Event('timeupdate'));
}

describe('stopWithUndo / undoStop (player brief 3a: Close shows "Stopped · Undo")', () => {
  it('Close stops; Undo brings the session back at its place and plays it again', async () => {
    playingAt42();
    const token = AudioPlayer.stopWithUndo();
    expect(token).not.toBeNull();
    expect(st().status).toBe('idle');
    expect(localStorage.getItem('vot-audio-pos')).toBeNull();   // a reload would not bring the closed bar back

    expect(AudioPlayer.undoStop(token)).toBe(true);
    await flush(); await flush();
    expect(el().src).toBe(URL_OF('idA2'));
    expect(st().queue.map((t) => t.url)).toEqual([URL_OF('idPreface'), URL_OF('idA1'), URL_OF('idA2'), URL_OF('idC')]);
    expect(st().qi).toBe(2);
    expect(st().time).toBe(42);
    expect(JSON.parse(localStorage.getItem('vot-audio-pos')).time).toBe(42);   // and a reload now would
  });

  it('a paused session comes back paused, at its place, with nothing loaded until Play', () => {
    playingAt42();
    AudioPlayer.toggle();
    expect(st().status).toBe('paused');
    const token = AudioPlayer.stopWithUndo();
    expect(el().src).toBe('');                       // Close let go of the stream
    expect(AudioPlayer.undoStop(token)).toBe(true);
    expect(st().status).toBe('paused');
    expect(st().restoring).toBe(true);
    expect(st().time).toBe(42);
    expect(st().queue[0].url).toBe(URL_OF('idA2'));
    expect(el().src).toBe('');                       // nothing loads until Play
  });

  it('once something else plays, Undo leaves it alone', () => {
    playingAt42();
    const token = AudioPlayer.stopWithUndo();
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'The Seventh Day' }, collectionLabel: 'Volume One' });
    expect(AudioPlayer.undoStop(token)).toBe(false);
    expect(st().queue[st().qi].url).toBe(URL_OF('idC'));
  });

  it('nothing playing: nothing to undo', () => {
    expect(AudioPlayer.stopWithUndo()).toBeNull();
    expect(AudioPlayer.undoStop(null)).toBe(false);
  });
});

describe('state.failed (player brief 3g: the bar says which failure)', () => {
  it('a recording that fails to load says so until the next start, and Close clears it', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    expect(st().failed).toBeNull();
    el().error = { code: 3 };
    el().dispatchEvent(new Event('error'));
    expect(st().status).toBe('paused');
    expect(st().failed).toBe('load');
    AudioPlayer.next();
    expect(st().failed).toBeNull();
    el().error = { code: 3 };
    el().dispatchEvent(new Event('error'));
    expect(st().failed).toBe('load');
    AudioPlayer.stop();
    expect(st().failed).toBeNull();
  });

  it('Retry (Play) clears it once the recording plays', () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
    el().error = { code: 3 };
    el().dispatchEvent(new Event('error'));
    AudioPlayer.toggle();
    el().dispatchEvent(new Event('playing'));
    expect(st().failed).toBeNull();
    expect(st().status).toBe('playing');
  });
});

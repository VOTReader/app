// @ts-nocheck — drives the REAL AudioPlayer singleton through a fake media element, on fake timers.
/* REPEAT THIS PASSAGE (rp1 part 3, 2026-09-25).
   ═══════════════════════════════════════════════════════════════════════
   A reader selects verses and presses REPEAT: the recording plays that span, jumps back to its start at its end,
   three times, and the bar says "Repeating Psalm 23:1-3 · 2 of 3". AudioPlayer.setLoop({ start, end, times, label })
   is the player's side. The wrap lands on the span's end, not a quarter second into the next verse (timeupdate fires
   ~4x a second, so the last stretch is timed); after the last pass the player pauses at the span's end. A seek out
   of the span, another recording or a stop ends the loop; a span that runs to the recording's end wraps from
   'ended' instead of advancing. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioPlayer } from './audio-player.js';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = ''; this.currentTime = 0; this.duration = 0; this.paused = true; this.readyState = 0;
    this.preload = ''; this.error = null; this.defaultPlaybackRate = 1; this.playbackRate = 1; this.volume = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.paused = false; this.readyState = 4; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const el = () => FakeAudio.last;
/** A timeupdate at clock `t`. */
const tick = (t, duration = 600) => { el().duration = duration; el().currentTime = t; el().dispatchEvent(new Event('timeupdate')); };
const play = () => AudioPlayer.playLetter({ volKey: 'one', letter: { id: 'a', title: 'A' }, collectionLabel: 'Volume One' });
const loop = () => AudioPlayer.getState().loop;

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = { 'one:a': [['idA', 'B'], ['idA2', 'B']], 'one:b': [['idB', 'B']] };
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});
afterEach(() => {
  AudioPlayer.stop();
  vi.useRealTimers();
  for (const k of ['Audio', 'AUDIO_MANIFEST', '__votAudioArbiter']) delete globalThis[k];
  localStorage.removeItem('vot-audio-pos');
});

describe('setLoop plays a span three times, then pauses at its end', () => {
  it('starts at the span, wraps at its end, counts the passes, pauses after the last', () => {
    play(); tick(5);
    expect(AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'Psalm 23:1-3' })).toBe(true);
    expect(el().currentTime, 'the first pass starts at the span').toBe(40);
    expect(loop()).toMatchObject({ label: 'Psalm 23:1-3', pass: 1, times: 3 });
    tick(50);
    expect(loop().pass).toBe(1);
    tick(60);
    expect(el().currentTime, 'back to the start at the end').toBe(40);
    expect(loop().pass).toBe(2);
    tick(60);
    expect(loop().pass).toBe(3);
    expect(el().currentTime).toBe(40);
    tick(60);
    expect(loop(), 'three passes heard: the loop is over').toBeNull();
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(el().paused).toBe(true);
  });

  it('wraps ON the end: the last quarter second is timed, not left to the next timeupdate', () => {
    play(); tick(5);
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    tick(59.8);                                   // 0.2 s left: the next timeupdate would land at ~60.05
    expect(loop().pass).toBe(1);
    el().currentTime = 60.0;
    vi.advanceTimersByTime(200);
    expect(loop().pass).toBe(2);
    expect(el().currentTime).toBe(40);
  });

  it('times the last stretch at the playing rate', () => {
    play(); AudioPlayer.setPlaybackRate(2); tick(5);
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    tick(59.6);                                   // 0.4 s of audio = 0.2 s of wall time at 2x
    el().currentTime = 60.0;
    vi.advanceTimersByTime(200);
    expect(loop().pass).toBe(2);
  });

  it('a seek out of the span ends the loop; a seek inside keeps it', () => {
    play(); tick(5);
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    AudioPlayer.seek(45);
    expect(loop()).not.toBeNull();
    AudioPlayer.seek(120);
    expect(loop()).toBeNull();
    tick(121);
    expect(el().currentTime).toBe(121);
  });

  it('another recording or a stop ends the loop', () => {
    play(); tick(5);
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    AudioPlayer.next();
    expect(loop()).toBeNull();
    play(); tick(5);
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    AudioPlayer.clearLoop();
    expect(loop()).toBeNull();
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    AudioPlayer.stop();
    expect(loop()).toBeNull();
  });

  it('a span to the end of the recording wraps from ended instead of going on to the next part', () => {
    play(); tick(5, 100);
    AudioPlayer.setLoop({ start: 80, end: 100, times: 2, label: 'x' });
    el().paused = true; el().currentTime = 100;
    el().dispatchEvent(new Event('ended'));
    expect(AudioPlayer.getState().qi, 'still the same part').toBe(0);
    expect(el().currentTime).toBe(80);
    expect(el().paused, 'playing again').toBe(false);
    expect(loop().pass).toBe(2);
    el().paused = true; el().currentTime = 100;
    el().dispatchEvent(new Event('ended'));
    expect(loop()).toBeNull();
    expect(AudioPlayer.getState().qi, 'the last pass pauses, it does not advance').toBe(0);
    expect(AudioPlayer.getState().status).toBe('paused');
  });

  it('refuses a span it cannot play: nothing loaded, or an end not after the start', () => {
    expect(AudioPlayer.setLoop({ start: 1, end: 5, times: 3, label: 'x' })).toBe(false);
    play(); tick(5);
    expect(AudioPlayer.setLoop({ start: 10, end: 10, times: 3, label: 'x' })).toBe(false);
    expect(AudioPlayer.setLoop({ start: NaN, end: 10, times: 3, label: 'x' })).toBe(false);
    expect(loop()).toBeNull();
  });

  it('says whether the recording plays natively (the web loop only: native hides REPEAT)', () => {
    expect(AudioPlayer.isNative()).toBe(false);
  });

  it('a new play of the same recording ends the loop (Listen again is not the passage)', () => {
    play(); tick(5);
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    play();
    expect(loop()).toBeNull();
  });

  it('a speed change drops the timed wrap set for the old speed; the next tick re-times it', () => {
    play(); AudioPlayer.setPlaybackRate(2); tick(5);
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    tick(59.6);                                   // timed for 0.2 s at 2x
    AudioPlayer.setPlaybackRate(1);
    el().currentTime = 59.8;
    vi.advanceTimersByTime(200);
    expect(loop().pass, 'no early wrap 0.2 s short of the end').toBe(1);
  });
});

describe('a bar restored after a restart', () => {
  it('takes the loop before it has an element; the first Play starts at the span with the loop on', async () => {
    const URL_A = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/idA.mp3';
    const track = { key: 'one:a', title: 'A', sub: 'Volume One', url: URL_A, readerCode: 'B', partLabel: null };
    localStorage.setItem('vot-audio-pos', JSON.stringify({ v: 2, mode: 'custom', volKey: 'one', label: 'Volume One', qi: 0, time: 5, key: 'one:a', track, customQueue: [track] }));
    vi.resetModules();
    const { AudioPlayer: P } = await import('./audio-player.js');
    try {
      expect(P.getState().status).toBe('paused');
      FakeAudio.last = null;
      expect(P.setLoop({ start: 40, end: 60, times: 3, label: 'x' })).toBe(true);
      expect(P.getState().time).toBe(40);
      P.toggle();
      await vi.advanceTimersByTimeAsync(0);
      expect(FakeAudio.last, 'the first Play made the element').not.toBeNull();
      expect(P.getState().loop).toMatchObject({ start: 40, pass: 1, waits: false });
      expect(P.getState().time).toBe(40);
    } finally { P.stop(); }
  });
});

// @ts-nocheck — drives the REAL AudioPlayer singleton through a fake media element, on fake timers.
/* THE SLEEP TIMER FADES OUT (listening item 5, 2026-09-22).
   ═══════════════════════════════════════════════════════════════════════
   Both sleep modes used to cut the voice off mid-word with a bare pause() — at bedtime, the one moment a
   listener most wants nothing sudden. Now the last SLEEP_FADE_S seconds ramp the element's volume down
   (the countdown by the clock, "end of track" by the recording's own remaining time at the playing rate),
   the pause lands at the same moment it always did, and the volume is back at 1 afterwards so the next
   Play is at full voice. Every way out of a fade restores it: the timer cleared, re-armed, playback stopped.
   The volume is recomputed on every timeupdate, so no single missed path can leave the player quiet. */
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
/** A timeupdate at clock `t` (the element fires these ~4 times a second while playing). */
const tick = (t, duration = 600) => { el().duration = duration; el().currentTime = t; el().dispatchEvent(new Event('timeupdate')); };
const play = () => AudioPlayer.playLetter({ volKey: 'one', letter: { id: 'a', title: 'A' }, collectionLabel: 'Volume One' });

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = { 'one:a': [['idA', 'B']], 'one:b': [['idB', 'B']] };
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});
afterEach(() => {
  AudioPlayer.stop();
  vi.useRealTimers();
  for (const k of ['Audio', 'AUDIO_MANIFEST', '__votAudioArbiter']) delete globalThis[k];
  localStorage.removeItem('vot-audio-pos');
});

describe('the countdown sleep timer fades out', () => {
  it('full voice until the last stretch, a falling volume through it, the pause on time, full volume after', () => {
    play();
    AudioPlayer.setSleepTimer(1);                        // 60 s
    vi.advanceTimersByTime(30000); tick(30);
    expect(el().volume, '30 s left: untouched').toBe(1);
    vi.advanceTimersByTime(20000); tick(50);
    expect(el().volume, '10 s left: halfway down a 20 s fade').toBeCloseTo(0.5, 1);
    vi.advanceTimersByTime(8000); tick(58);
    expect(el().volume).toBeLessThan(0.2);
    vi.advanceTimersByTime(2000);                        // the deadline
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(el().volume, 'the next Play is at full voice').toBe(1);
  });

  it('clearing the timer in the middle of the fade brings the voice straight back', () => {
    play();
    AudioPlayer.setSleepTimer(1);
    vi.advanceTimersByTime(50000); tick(50);
    expect(el().volume).toBeLessThan(1);
    AudioPlayer.clearSleepTimer();
    expect(el().volume).toBe(1);
    tick(51);
    expect(el().volume).toBe(1);
  });

  it('re-arming a longer timer in the middle of the fade restores the volume', () => {
    play();
    AudioPlayer.setSleepTimer(1);
    vi.advanceTimersByTime(55000); tick(55);
    AudioPlayer.setSleepTimer(15);
    expect(el().volume).toBe(1);
  });

  it('stop() in the middle of the fade leaves a full-volume element behind', () => {
    play();
    AudioPlayer.setSleepTimer(1);
    vi.advanceTimersByTime(55000); tick(55);
    AudioPlayer.stop();
    expect(el().volume).toBe(1);
  });
});

describe('"end of track" fades on the recording\'s own remaining time', () => {
  it('fades over the last stretch of the track, pauses at its end, restores the volume', () => {
    play();
    AudioPlayer.setSleepAtTrackEnd();
    tick(60, 100);
    expect(el().volume).toBe(1);
    tick(90, 100);                                       // 10 s left at 1x
    expect(el().volume).toBeCloseTo(0.5, 1);
    el().dispatchEvent(new Event('ended'));
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(el().volume).toBe(1);
  });

  it('counts the remaining time at the playing rate', () => {
    play();
    AudioPlayer.setPlaybackRate(2);
    AudioPlayer.setSleepAtTrackEnd();
    tick(90, 100);                                       // 10 s of audio = 5 s of wall time at 2x
    expect(el().volume).toBeCloseTo(0.25, 1);
  });

  it('no sleep armed: the volume is never touched', () => {
    play();
    tick(599, 600);
    expect(el().volume).toBe(1);
  });
});

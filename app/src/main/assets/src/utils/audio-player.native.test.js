// @ts-nocheck
/* audio-player on the native player (m3): in the APK the player drives native-audio.js's stand-in instead of <audio>.
   These pin the player's side of it: the recording and what comes next go to native, the WebView keep-alive stays
   out, a seam native crossed is filed as heard and adopted without a reload, and native is told when the next
   recording changes (sleep at the end of this one, the end of the order). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class FakeAudio extends EventTarget {
  constructor() { super(); FakeAudio.last = this; this.src = ''; this.currentTime = 0; this.readyState = 0; this.duration = 0; this.paused = true; this.error = null; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  removeAttribute() { this.src = ''; }
}

const MANIFEST = {
  'vol1:letter-a': [['idA1', 'B', 'Part 1'], ['idA2', 'B', 'Part 2']],
  'vol1:letter-c': [['idC', 'T']],
};
const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';

let AudioPlayer;
let bridge;

const send = (e) => window.__votNativeAudio(JSON.stringify(e));
const flush = () => new Promise((r) => setTimeout(r, 0));
const loads = () => bridge.audioLoad.mock.calls.map((c) => JSON.parse(c[0]));

beforeEach(async () => {
  FakeAudio.last = null;
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  localStorage.removeItem('vot-audio-pos');
  localStorage.setItem('vot.audioEngine', 'native');
  bridge = {
    setAudioActive: vi.fn(() => true), setAudioNowPlaying: vi.fn(),
    audioLoad: vi.fn(), audioPlay: vi.fn(), audioPause: vi.fn(), audioSeek: vi.fn(), audioRate: vi.fn(),
    audioVolume: vi.fn(), audioUpcoming: vi.fn(), audioRelease: vi.fn(), audioJournal: vi.fn(() => ''),
  };
  window.AndroidBridge = bridge;
  vi.resetModules();
  AudioPlayer = (await import('./audio-player.js')).AudioPlayer;
});

afterEach(() => {
  const arbiter = globalThis.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  delete globalThis.__votAudioArbiter;
  delete globalThis.__votAudioListened;
  delete globalThis.AUDIO_MANIFEST;
  delete globalThis.Audio;
  delete window.AndroidBridge;
  delete window.__votNativeAudio;
  localStorage.removeItem('vot.audioEngine');
});

describe('audio-player on the native player (m3)', () => {
  it('hands native the recording, its lock-screen text and the next part; the WebView keep-alive stays out', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' }, collectionLabel: 'Volume One' });
    expect(FakeAudio.last).toBeNull();   // no <audio> made
    const [load] = loads();
    expect(load.url).toBe(URL_OF('idA1'));
    expect(load.title).toBeTruthy();
    expect(load.upcoming.map((t) => t.url)).toEqual([URL_OF('idA2')]);
    expect(load.upcoming[0].rate).toBe(1);
    expect(bridge.audioPlay).toHaveBeenCalled();
    send({ type: 'state', url: URL_OF('idA1'), pos: 0, dur: 60000, playing: true, want: true });
    await flush();
    expect(AudioPlayer.getState().status).toBe('playing');
    expect(AudioPlayer.getState().duration).toBe(60);
    expect(bridge.setAudioActive).not.toHaveBeenCalled();
    expect(bridge.setAudioNowPlaying).not.toHaveBeenCalled();
  });

  it('a seam native crossed moves the queue on without a reload, and the letter is credited at its real end', async () => {
    const listened = vi.fn();
    globalThis.__votAudioListened = listened;
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    send({ type: 'state', url: URL_OF('idA1'), pos: 0, dur: 60000, playing: true, want: true });
    send({ type: 'transition', from: URL_OF('idA1'), url: URL_OF('idA2'), seq: 1, pos: 100, dur: 50000, playing: true, want: true });
    await flush();
    const s = AudioPlayer.getState();
    expect(s.qi).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.duration).toBe(50);
    expect(bridge.audioLoad).toHaveBeenCalledTimes(1);   // part 2 adopted, not loaded
    expect(listened).not.toHaveBeenCalled();            // part 1 is not the whole letter
    // Part 2 is the last: nothing comes after it, and native is told so.
    expect(bridge.audioUpcoming).toHaveBeenLastCalledWith('[]');
    send({ type: 'state', url: URL_OF('idA2'), pos: 50000, dur: 50000, playing: false, want: false, ended: true });
    expect(listened).toHaveBeenCalledWith('vol1', 'letter-a', 0);
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(bridge.audioRelease).toHaveBeenCalled();
  });

  it('sleep at the end of this recording empties what comes next, so native stops there', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    bridge.audioUpcoming.mockClear();
    expect(AudioPlayer.setSleepAtTrackEnd()).toBe(true);
    expect(bridge.audioUpcoming).toHaveBeenCalledWith('[]');
  });

  it('a pause from the lock screen pauses the player; the page\'s pause goes to native', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    send({ type: 'state', url: URL_OF('idC'), pos: 5000, dur: 60000, playing: true, want: true });
    await flush();
    send({ type: 'state', url: URL_OF('idC'), pos: 6000, dur: 60000, playing: false, want: false, reason: 4 });
    expect(AudioPlayer.getState().status).toBe('paused');
    AudioPlayer.toggle();
    expect(bridge.audioPlay).toHaveBeenCalledTimes(2);
    send({ type: 'state', url: URL_OF('idC'), pos: 6000, dur: 60000, playing: true, want: true });
    await flush();
    AudioPlayer.pauseIfPlaying();
    expect(bridge.audioPause).toHaveBeenCalled();
    expect(AudioPlayer.getState().status).toBe('paused');
  });

  it('without the choice (or in the PWA) it is the WebView\'s <audio>, keep-alive and all', async () => {
    localStorage.removeItem('vot.audioEngine');
    vi.resetModules();
    AudioPlayer = (await import('./audio-player.js')).AudioPlayer;
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    expect(FakeAudio.last).not.toBeNull();
    expect(bridge.audioLoad).not.toHaveBeenCalled();
    expect(bridge.setAudioActive).toHaveBeenCalledWith(true);
  });
});

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
const ITEMS = [{ id: 'letter-a', title: 'Letter A' }, { id: 'letter-c', title: 'Letter C' }];
function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}
async function downloaded(ids) {
  bridge.offlineAudioState = () => JSON.stringify({ items: ids.map((id) => ({ url: URL_OF(id), key: '', title: '', bytes: 1, savedAt: 1 })), totalBytes: ids.length, freeBytes: 1e9, active: null, queued: [] });
  const { OfflineAudio } = await import('./offline-audio.js');
  OfflineAudio.refresh();
}

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
    audioAskNotifications: vi.fn(), audioMeta: vi.fn(),
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
  setOnline(true);
  vi.restoreAllMocks();
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

  it('offline, native passes over what is not on the phone to the next recording that is, as the page would', async () => {
    await downloaded(['idA1', 'idC']);
    setOnline(false);
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS });
    expect(loads()[0].url).toBe(URL_OF('idA1'));
    expect(loads()[0].upcoming.map((t) => t.url)).toEqual([URL_OF('idC')]);   // idA2 is not on the phone
    send({ type: 'state', url: URL_OF('idA1'), pos: 0, dur: 60000, playing: true, want: true });
    send({ type: 'transition', from: URL_OF('idA1'), url: URL_OF('idC'), seq: 1, pos: 50, dur: 40000, playing: true, want: true });
    await flush();
    const s = AudioPlayer.getState();
    expect(s.queue[s.qi].url).toBe(URL_OF('idC'));
    expect(s.status).toBe('playing');
    expect(bridge.audioLoad).toHaveBeenCalledTimes(1);   // the page skipped the same way and adopted idC
  });

  it('offline with nothing on the phone ahead, native is told to stop at the end of this one', async () => {
    await downloaded(['idA1']);
    setOnline(false);
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS });
    expect(loads()[0].upcoming).toEqual([]);
  });

  it('a sleep timeout that runs late fires from the clock: paused at its time, not a minute of silence later', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    send({ type: 'state', url: URL_OF('idC'), pos: 0, dur: 600000, playing: true, want: true });
    await flush();
    const t0 = Date.now();
    expect(AudioPlayer.setSleepTimer(5)).toBe(true);
    vi.spyOn(Date, 'now').mockReturnValue(t0 + 5 * 60000 + 200);   // the timeout has not run (a hidden page's timers)
    send({ type: 'tick', url: URL_OF('idC'), pos: 300200, dur: 600000, playing: true, want: true });
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(AudioPlayer.getState().sleepEndsAt).toBe(0);
    expect(bridge.audioPause).toHaveBeenCalled();
  });

  it('a Next while playing stays loading through the new load, never paused (refutation M1 of the stand-in: M3)', async () => {
    AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS });
    send({ type: 'state', url: URL_OF('idA1'), pos: 5000, dur: 60000, playing: true, want: true });
    await flush();
    expect(AudioPlayer.getState().status).toBe('playing');
    AudioPlayer.next();
    expect(loads()[1].url).toBe(URL_OF('idA2'));
    // In order on native's main looper: the pause's event (names idA1: ignored), then the load's (not yet playing).
    send({ type: 'state', url: URL_OF('idA1'), pos: 5000, dur: 60000, playing: false, want: false });
    send({ type: 'state', url: URL_OF('idA2'), pos: 0, dur: 0, playing: false, want: false, buffering: true });
    await flush();
    expect(AudioPlayer.getState().status).toBe('loading');
    send({ type: 'state', url: URL_OF('idA2'), pos: 0, dur: 50000, playing: true, want: true });
    await flush();
    expect(AudioPlayer.getState().status).toBe('playing');
  });

  it('a seam journaled before this page loaded the recording is not replayed as its end (refutation M2)', async () => {
    const listened = vi.fn();
    globalThis.__votAudioListened = listened;
    bridge.audioJournal = vi.fn(() => JSON.stringify({ url: URL_OF('idC'), pos: 30000, dur: 600000, playing: true, want: true,
      seams: [{ seq: 1, from: URL_OF('idC'), url: URL_OF('idZ'), at: Date.now() - 3600000 }] }));
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    send({ type: 'state', url: URL_OF('idC'), pos: 30000, dur: 600000, playing: true, want: true });
    await flush();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(listened).not.toHaveBeenCalled();
    expect(bridge.audioRelease).not.toHaveBeenCalled();
    expect(AudioPlayer.getState().status).toBe('playing');
  });

  it('sleep at the end of this recording pauses native there, so a later seek does not play (refutation M1)', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    send({ type: 'state', url: URL_OF('idC'), pos: 5000, dur: 600000, playing: true, want: true });
    await flush();
    AudioPlayer.setSleepAtTrackEnd();
    bridge.audioPause.mockClear();
    // ExoPlayer at its end still wants to play (native also pauses itself there; the page does not rely on it).
    send({ type: 'state', url: URL_OF('idC'), pos: 600000, dur: 600000, playing: false, want: true, ended: true });
    await flush();
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(bridge.audioPause).toHaveBeenCalledTimes(1);
    send({ type: 'state', url: URL_OF('idC'), pos: 600000, dur: 600000, playing: false, want: false, ended: true });
    AudioPlayer.seek(100);
    expect(bridge.audioSeek).toHaveBeenCalledWith(100000);
    send({ type: 'state', url: URL_OF('idC'), pos: 100000, dur: 600000, playing: false, want: false });
    await flush();
    expect(AudioPlayer.getState().status).toBe('paused');
  });

  it('the media card\'s notification ask comes at playing, never over the tour card (n1-02)', async () => {
    globalThis.TourController = { getState: () => ({ active: true }) };
    try {
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
      send({ type: 'state', url: URL_OF('idC'), pos: 0, dur: 60000, playing: true, want: true });
      await flush();
      expect(AudioPlayer.getState().status).toBe('playing');
      expect(bridge.audioAskNotifications).not.toHaveBeenCalled();
      globalThis.TourController = { getState: () => ({ active: false }) };
      AudioPlayer.syncKeepAlive();               // the tour's end
      expect(bridge.audioAskNotifications).toHaveBeenCalledTimes(1);
    } finally { delete globalThis.TourController; }
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

  it('with the way back chosen (html), it is the WebView <audio>, keep-alive and all', async () => {
    localStorage.setItem('vot.audioEngine', 'html');
    vi.resetModules();
    AudioPlayer = (await import('./audio-player.js')).AudioPlayer;
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    expect(FakeAudio.last).not.toBeNull();
    expect(bridge.audioLoad).not.toHaveBeenCalled();
    expect(bridge.setAudioActive).toHaveBeenCalledWith(true);
  });
});

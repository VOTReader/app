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
    audioAskNotifications: vi.fn(), audioMeta: vi.fn(), audioLoop: vi.fn(),
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

  // W62 emulator look: Listen from here moved to part 2 and then seeked, but a seek right after a load fell where the
  // APK's player could not yet seek and was dropped: part 2 played from its top. The place rides the load now.
  it('(W62) playAt with a place loads that recording there: native gets it as the load\'s start, no seek after', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    send({ type: 'state', url: URL_OF('idA1'), pos: 1000, dur: 60000, playing: true, want: true });
    await flush();
    bridge.audioSeek.mockClear();
    AudioPlayer.playAt(1, 42.5);
    const last = loads()[loads().length - 1];
    expect(last.url).toBe(URL_OF('idA2'));
    expect(last.startMs).toBe(42500);
    expect(bridge.audioSeek).not.toHaveBeenCalled();
    expect(AudioPlayer.getState().time).toBe(42.5);
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

  // Sweep W60: native passed over a song not on the phone into the next kept one, but the page then paused on the
  // skipped song ("Not on this phone"), released native (silence) and 3 s later loaded the kept song from its top.
  it('(W60) offline songs: native already in the next kept song past one not on the phone is adopted, not stopped and reloaded', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { SONG_FIXTURE } = await import('./song-catalog.fixture.js');
      (await import('./song-catalog.js')).adoptSongCatalog(SONG_FIXTURE);
      expect(AudioPlayer.playSongs({ filter: {} })).toBe(true);
      const order = AudioPlayer.getState().queue.map((t) => t.url);
      AudioPlayer.stop();
      bridge.audioLoad.mockClear(); bridge.audioRelease.mockClear();
      expect(order.length).toBeGreaterThanOrEqual(3);
      bridge.offlineAudioState = () => JSON.stringify({ items: [order[0], order[2]].map((url) => ({ url, key: '', title: '', bytes: 1, savedAt: 1 })), totalBytes: 2, freeBytes: 1e9, active: null, queued: [] });
      (await import('./offline-audio.js')).OfflineAudio.refresh();
      setOnline(false);
      expect(AudioPlayer.playSongs({ filter: {} })).toBe(true);
      expect(loads()[0].url).toBe(order[0]);
      expect(loads()[0].upcoming.map((t) => t.url)).toEqual([order[2]]);   // native passes over order[1]
      send({ type: 'state', url: order[0], pos: 0, dur: 60000, playing: true, want: true });
      send({ type: 'transition', from: order[0], url: order[2], seq: 1, pos: 50, dur: 40000, playing: true, want: true });
      await Promise.resolve();
      vi.advanceTimersByTime(3500);
      const s = AudioPlayer.getState();
      expect(s.queue[s.qi].url).toBe(order[2]);
      expect(s.status).toBe('playing');
      expect(bridge.audioRelease).not.toHaveBeenCalled();     // no silence at the seam
      expect(bridge.audioLoad).toHaveBeenCalledTimes(1);      // no restart from the top
    } finally {
      vi.useRealTimers();
    }
  });

  // Sweep W61: after a load error the page stopped hearing native, but a headset, car or lock-screen Play makes
  // native prepare the recording it still holds and play it: audio under a paused bar the app ignored.
  it('(W61) after a load error, a Play native carries out itself is followed by the bar', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    send({ type: 'state', url: URL_OF('idA1'), pos: 0, dur: 60000, playing: true, want: true });
    send({ type: 'error', url: URL_OF('idA1'), pos: 12000, dur: 60000, playing: false, want: true, code: 2001, name: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' });
    await flush();
    expect(AudioPlayer.getState().status).toBe('paused');
    send({ type: 'state', url: URL_OF('idA1'), pos: 12000, dur: 60000, playing: false, want: true, buffering: true });
    send({ type: 'state', url: URL_OF('idA1'), pos: 12500, dur: 60000, playing: true, want: true });
    await flush();
    const s = AudioPlayer.getState();
    expect(s.status).toBe('playing');
    expect(s.time).toBeGreaterThanOrEqual(12.5);
    expect(bridge.audioLoad).toHaveBeenCalledTimes(1);   // native's own retry, adopted: not loaded again
    // and the page's pause reaches native again
    AudioPlayer.toggle();
    expect(bridge.audioPause).toHaveBeenCalled();
  });

  it('(W61) after a load error, native\'s idle news does not wake the bar, and the bar\'s Play still reloads', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    send({ type: 'state', url: URL_OF('idA1'), pos: 0, dur: 60000, playing: true, want: true });
    send({ type: 'error', url: URL_OF('idA1'), pos: 12000, dur: 60000, playing: false, want: true, code: 2001, name: 'x' });
    send({ type: 'state', url: URL_OF('idA1'), pos: 12000, dur: 60000, playing: false, want: true });
    await flush();
    expect(AudioPlayer.getState().status).toBe('paused');
    AudioPlayer.toggle();
    expect(bridge.audioLoad).toHaveBeenCalledTimes(2);
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

  it('a sleep timer or a recorder pause during a phone call reaches native, so it does not play on after (s2r S3)', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    send({ type: 'state', url: URL_OF('idC'), pos: 5000, dur: 600000, playing: true, want: true });
    await flush();
    const t0 = Date.now();
    AudioPlayer.setSleepTimer(1);
    send({ type: 'state', url: URL_OF('idC'), pos: 6000, dur: 600000, playing: false, want: true, suppressed: true });
    expect(AudioPlayer.getState().status).toBe('paused');
    bridge.audioPause.mockClear();
    vi.spyOn(Date, 'now').mockReturnValue(t0 + 61000);
    send({ type: 'tick', url: URL_OF('idC'), pos: 6000, dur: 600000, playing: false, want: true, suppressed: true });
    expect(bridge.audioPause).toHaveBeenCalledTimes(1);
    expect(AudioPlayer.getState().sleepEndsAt).toBe(0);
    vi.restoreAllMocks();
    // and the journal recorder's pause, the same way
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    send({ type: 'state', url: URL_OF('idC'), pos: 1000, dur: 600000, playing: true, want: true });
    await flush();
    send({ type: 'state', url: URL_OF('idC'), pos: 1000, dur: 600000, playing: false, want: true, suppressed: true });
    bridge.audioPause.mockClear();
    AudioPlayer.pauseIfPlaying();
    expect(bridge.audioPause).toHaveBeenCalledTimes(1);
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

  it('(W4) a restored bar resumes AT its place: native loads it there, and the clock never reads 0', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    send({ type: 'state', url: URL_OF('idC'), pos: 41000, dur: 600000, playing: true, want: true });
    await flush();
    AudioPlayer.toggle();                                    // paused at 0:41: the snapshot is written
    send({ type: 'state', url: URL_OF('idC'), pos: 41000, dur: 600000, playing: false, want: false });
    await flush();
    vi.resetModules();                                       // a new session
    bridge.audioLoad.mockClear();
    bridge.audioSeek.mockClear();
    AudioPlayer = (await import('./audio-player.js')).AudioPlayer;
    expect(AudioPlayer.getState().restoring).toBe(true);
    AudioPlayer.toggle();
    await vi.waitFor(() => expect(bridge.audioLoad).toHaveBeenCalled());
    expect(loads()[0].url).toBe(URL_OF('idC'));
    // The pause read the running clock a moment after native's 41 s: under load that is 41.001 (fast pool, 10-13).
    expect(loads()[0].startMs).toBeGreaterThanOrEqual(41000);
    expect(loads()[0].startMs).toBeLessThan(41100);
    // A 0 from native before metadata is the place it is on its way to, not a place: never the bar's, never saved.
    send({ type: 'state', url: URL_OF('idC'), pos: 0, dur: 0, playing: false, want: false, buffering: true });
    await flush();
    expect(Math.round(AudioPlayer.getState().time)).toBe(41);
    AudioPlayer.toggle();                                    // a pause while it loads saves the place, not 0
    await flush();
    expect(Math.round(JSON.parse(localStorage.getItem('vot-audio-pos')).time)).toBe(41);
    AudioPlayer.toggle();
    send({ type: 'state', url: URL_OF('idC'), pos: 41000, dur: 600000, playing: true, want: true });
    await flush();
    expect(bridge.audioSeek).not.toHaveBeenCalled();         // the load carried it: no second seek at metadata
    expect(Math.round(AudioPlayer.getState().time)).toBe(41);
  });

  it('(W4) a remembered place goes in with the load; a load that fails first keeps it for Retry and the next boot', async () => {
    globalThis.AudioPositionsStore = { getPosition: () => ({ t: 125, d: 600 }), setPosition: vi.fn(), clearPosition: vi.fn() };
    try {
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
      expect(loads()[0]).toMatchObject({ url: URL_OF('idC'), startMs: 120000 });   // 125 s less the 5 s rewind
      send({ type: 'state', url: URL_OF('idC'), pos: 0, dur: 0, playing: false, want: false, buffering: true });
      send({ type: 'error', url: URL_OF('idC'), code: 2001, name: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' });
      await flush();
      expect(AudioPlayer.getState().status).toBe('paused');
      expect(AudioPlayer.getState().time).toBe(120);
      expect(JSON.parse(localStorage.getItem('vot-audio-pos')).time).toBe(120);
      AudioPlayer.toggle();                                  // Retry
      expect(loads()).toHaveLength(2);
      expect(loads()[1]).toMatchObject({ url: URL_OF('idC'), startMs: 120000 });
    } finally { delete globalThis.AudioPositionsStore; }
  });

  it('(W4) a 0 with no duration stays not-a-place even after a state that says playing (refuter round 1)', async () => {
    globalThis.AudioPositionsStore = { getPosition: () => ({ t: 125, d: 600 }), setPosition: vi.fn(), clearPosition: vi.fn() };
    try {
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
      send({ type: 'state', url: URL_OF('idC'), pos: 0, dur: 0, playing: true, want: true });
      send({ type: 'state', url: URL_OF('idC'), pos: 0, dur: 0, playing: false, want: true, buffering: true });
      await flush();
      expect(AudioPlayer.getState().time).toBe(120);
      send({ type: 'error', url: URL_OF('idC'), code: 2001, name: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' });
      await flush();
      expect(JSON.parse(localStorage.getItem('vot-audio-pos')).time).toBe(120);
      AudioPlayer.toggle();                                  // Retry
      expect(loads()[1]).toMatchObject({ url: URL_OF('idC'), startMs: 120000 });
      // Native's own word ends it: a position it reports is where it is (a file it cannot seek in plays from its top).
      send({ type: 'state', url: URL_OF('idC'), pos: 1000, dur: 0, playing: true, want: true });
      await flush();
      expect(Math.round(AudioPlayer.getState().time)).toBe(1);
    } finally { delete globalThis.AudioPositionsStore; }
  });

  it('(W4) a resume of the recording native already holds seeks before it plays, once (refuter round 2)', async () => {
    globalThis.AudioPositionsStore = { getPosition: () => ({ t: 125, d: 600 }), setPosition: vi.fn(), clearPosition: vi.fn() };
    try {
      AudioPlayer.playCollection({ volKey: 'vol1', items: [{ id: 'letter-c', title: 'Letter C' }], noResume: true });
      expect(loads()[0].startMs).toBe(0);
      send({ type: 'state', url: URL_OF('idC'), pos: 3000, dur: 600000, playing: true, want: true });
      await flush();
      bridge.audioPlay.mockClear();
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
      expect(bridge.audioLoad).toHaveBeenCalledTimes(1);      // the same recording: kept, not reloaded
      expect(bridge.audioSeek).toHaveBeenCalledTimes(1);
      expect(bridge.audioSeek).toHaveBeenCalledWith(120000);
      expect(bridge.audioSeek.mock.invocationCallOrder[0]).toBeLessThan(bridge.audioPlay.mock.invocationCallOrder[0]);
    } finally { delete globalThis.AudioPositionsStore; }
  });

  it('(W4) a slow bridge play does not send the place twice (refuter round 3)', async () => {
    globalThis.AudioPositionsStore = { getPosition: () => ({ t: 125, d: 600 }), setPosition: vi.fn(), clearPosition: vi.fn() };
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    try {
      AudioPlayer.playCollection({ volKey: 'vol1', items: [{ id: 'letter-c', title: 'Letter C' }], noResume: true });
      send({ type: 'state', url: URL_OF('idC'), pos: 3000, dur: 600000, playing: true, want: true });
      await flush();
      bridge.audioPlay.mockImplementation(() => { clock += 25; });   // the bridge call takes 25 ms while native plays on
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
      expect(bridge.audioSeek.mock.calls).toEqual([[120000]]);
    } finally { delete globalThis.AudioPositionsStore; }
  });

  it('(W4) a seek before metadata goes to native at once, and the load\'s first 0 does not undo it', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    expect(loads()[0].startMs).toBe(0);
    AudioPlayer.seek(100);
    expect(bridge.audioSeek).toHaveBeenCalledWith(100000);
    send({ type: 'state', url: URL_OF('idC'), pos: 0, dur: 0, playing: false, want: false, buffering: true });
    await flush();
    expect(AudioPlayer.getState().time).toBe(100);
    send({ type: 'state', url: URL_OF('idC'), pos: 100000, dur: 600000, playing: true, want: true });
    await flush();
    expect(bridge.audioSeek).toHaveBeenCalledTimes(1);
    expect(Math.round(AudioPlayer.getState().time)).toBe(100);
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

/* Offline features (Corbin 2026-10-05): the hero Listen pills ask playableNow, the same rule the player refuses by. */
describe('AudioPlayer.playableNow', () => {
  it('online, every recorded letter can play', () => {
    setOnline(true);
    expect(AudioPlayer.playableNow('vol1', 'letter-a')).toBe(true);
  });

  it('offline, only a letter with a recording on the phone can play', async () => {
    await downloaded(['idA2']);
    setOnline(false);
    expect(AudioPlayer.playableNow('vol1', 'letter-a')).toBe(true);
    expect(AudioPlayer.playableNow('vol1', 'letter-c')).toBe(false);
  });
});

/* Repeat this passage on the APK's native player (ra2, 2026-10-13; Corbin uses it daily, and it was gone from the APK
   since m3): native plays the span round itself, so it keeps its verse with the screen off and the page asleep; the
   bar follows native's word on the pass. */
describe('repeat this passage on the native player (ra2)', () => {
  const loopsSent = () => bridge.audioLoop.mock.calls.map((c) => (c[0] ? JSON.parse(c[0]) : null));
  const upcomingUrls = () => JSON.parse(bridge.audioUpcoming.mock.calls.at(-1)[0]).map((t) => t.url);
  async function playing(id = 'letter-a', url = URL_OF('idA1')) {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id, title: 'L' } });
    send({ type: 'state', url, pos: 5000, dur: 600000, playing: true, want: true });
    await flush();
  }

  it('is offered, and native gets the span after the seek to its start, with nothing to play after it', async () => {
    await playing();
    expect(AudioPlayer.canLoop()).toBe(true);
    bridge.audioUpcoming.mockClear();
    expect(AudioPlayer.setLoop({ start: 40, end: 60.5, times: 3, label: 'Verse 4' })).toBe(true);
    expect(bridge.audioSeek).toHaveBeenLastCalledWith(40000);
    expect(bridge.audioSeek.mock.invocationCallOrder.at(-1)).toBeLessThan(bridge.audioLoop.mock.invocationCallOrder[0]);
    const { id } = AudioPlayer.getState().loop;
    expect(loopsSent()).toEqual([{ url: URL_OF('idA1'), id, startMs: 40000, endMs: 60500, times: 3, pass: 1 }]);
    expect(upcomingUrls()).toEqual([]);   // part 2 waits: a span to the end ends there, it does not cross
  });

  it('an APK from before it cannot loop: not offered, nothing moves', async () => {
    delete bridge.audioLoop;
    await playing();
    expect(AudioPlayer.canLoop()).toBe(false);
    bridge.audioSeek.mockClear();
    expect(AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' })).toBe(false);
    expect(bridge.audioSeek).not.toHaveBeenCalled();
    expect(AudioPlayer.getState().loop).toBeNull();
  });

  it('the bar follows native\'s pass; native pausing after the last ends the loop, and what comes next is back', async () => {
    await playing();
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    const { id } = AudioPlayer.getState().loop;
    const at = (pos, loop, more = {}) => send({ type: 'state', url: URL_OF('idA1'), pos, dur: 600000, playing: true, want: true, loop, ...more });
    at(40000, { id, pass: 1, times: 3 });
    expect(AudioPlayer.getState().loop.pass).toBe(1);
    at(40000, { id, pass: 2, times: 3 }, { type: 'seeked' });
    expect(AudioPlayer.getState().loop.pass).toBe(2);
    at(40000, { id, pass: 3, times: 3 }, { type: 'seeked' });
    expect(AudioPlayer.getState().loop.pass).toBe(3);
    bridge.audioUpcoming.mockClear();
    at(59970, null, { playing: false, want: false });   // the last pass: native paused at the span's end
    await flush();
    const s = AudioPlayer.getState();
    expect(s.loop).toBeNull();
    expect(s.status).toBe('paused');
    expect(s.qi).toBe(0);
    expect(upcomingUrls()).toEqual([URL_OF('idA2')]);
  });

  it('native\'s word about the loop it had does not end a new one it has not taken yet', async () => {
    await playing();
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    const first = AudioPlayer.getState().loop.id;
    const at = (pos, loop, more = {}) => send({ type: 'state', url: URL_OF('idA1'), pos, dur: 600000, playing: true, want: true, loop, ...more });
    at(45000, { id: first, pass: 2, times: 3 });
    AudioPlayer.setLoop({ start: 100, end: 120, times: 3, label: 'y' });   // another passage while the first plays
    const second = AudioPlayer.getState().loop.id;
    expect(second).not.toBe(first);
    at(46000, { id: first, pass: 2, times: 3 });   // in flight before native heard of the new one
    expect(AudioPlayer.getState().loop).toMatchObject({ id: second, start: 100, pass: 1 });
    at(100000, null, { type: 'seeked' });          // native's own seek out of the old span ended it
    expect(AudioPlayer.getState().loop).toMatchObject({ id: second });
    at(100000, { id: second, pass: 1, times: 3 });
    at(101000, null, { type: 'seeked' });          // taken: now native's silence is the loop's end (a lock-screen seek)
    expect(AudioPlayer.getState().loop).toBeNull();
  });

  it('a span to the recording\'s end goes round on native; the end it lets through is the last pass: paused, no credit', async () => {
    const listened = vi.fn();
    globalThis.__votAudioListened = listened;
    await playing('letter-c', URL_OF('idC'));
    AudioPlayer.setLoop({ start: 590, end: Infinity, times: 2, label: 'x' });
    const { id } = AudioPlayer.getState().loop;
    expect(loopsSent().at(-1)).toMatchObject({ startMs: 590000, endMs: -1, times: 2, pass: 1 });
    const at = (pos, loop, more = {}) => send({ type: 'state', url: URL_OF('idC'), pos, dur: 600000, playing: true, want: true, loop, ...more });
    at(590000, { id, pass: 1, times: 2 });
    // An end still naming a pass to come is native on its way round: the page leaves it be.
    at(600000, { id, pass: 1, times: 2 }, { playing: false, ended: true });
    await flush();
    expect(AudioPlayer.getState().loop).toMatchObject({ id });
    at(590000, { id, pass: 2, times: 2 }, { type: 'seeked' });
    await flush();
    expect(AudioPlayer.getState().loop.pass).toBe(2);
    expect(AudioPlayer.getState().status).toBe('playing');
    at(600000, null, { playing: false, ended: true });   // the last pass ran to the end
    await flush();
    const s = AudioPlayer.getState();
    expect(s.loop).toBeNull();
    expect(s.status).toBe('paused');
    expect(s.qi).toBe(0);
    expect(listened).not.toHaveBeenCalled();
    expect(bridge.audioRelease).not.toHaveBeenCalled();
  });

  it('a page seek out of the passage ends it on native too, and what comes next is back', async () => {
    await playing();
    AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'x' });
    bridge.audioLoop.mockClear();
    bridge.audioUpcoming.mockClear();
    AudioPlayer.seek(200);
    expect(AudioPlayer.getState().loop).toBeNull();
    expect(bridge.audioLoop).toHaveBeenCalledWith('');
    expect(upcomingUrls()).toEqual([URL_OF('idA2')]);
  });

  it('a restored bar\'s passage goes to native with its first load, after it, at the span\'s start', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    send({ type: 'state', url: URL_OF('idC'), pos: 41000, dur: 600000, playing: true, want: true });
    await flush();
    AudioPlayer.toggle();
    send({ type: 'state', url: URL_OF('idC'), pos: 41000, dur: 600000, playing: false, want: false });
    await flush();
    vi.resetModules();                                       // a new session: the bar is restored, no load yet
    bridge.audioLoad.mockClear();
    bridge.audioLoop.mockClear();
    AudioPlayer = (await import('./audio-player.js')).AudioPlayer;
    expect(AudioPlayer.getState().restoring).toBe(true);
    expect(AudioPlayer.setLoop({ start: 30, end: 50, times: 3, label: 'x' })).toBe(true);
    expect(bridge.audioLoop).not.toHaveBeenCalled();         // nothing loaded to loop yet
    AudioPlayer.toggle();
    await vi.waitFor(() => expect(bridge.audioLoad).toHaveBeenCalled());
    expect(loads()[0]).toMatchObject({ url: URL_OF('idC'), startMs: 30000, upcoming: [] });
    expect(bridge.audioLoad.mock.invocationCallOrder[0]).toBeLessThan(bridge.audioLoop.mock.invocationCallOrder[0]);
    expect(loopsSent()).toEqual([{ url: URL_OF('idC'), id: AudioPlayer.getState().loop.id, startMs: 30000, endMs: 50000, times: 3, pass: 1 }]);
  });
});

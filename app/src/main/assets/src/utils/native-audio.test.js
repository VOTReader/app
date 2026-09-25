// @ts-nocheck
/* native-audio (m3): the page's stand-in <audio> for the Android app's native player. It must behave like the
   element audio-player.js was written against, turn native's events into <audio>'s, and cross a seam native already
   crossed without reloading. The bridge is a set of spies; native events are fed through window.__votNativeAudio. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const A = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/a.mp3';
const B = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/b.mp3';
const C = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/c.mp3';
const X = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/x.mp3';

let NativeAudio;
let nativeAudioAvailable;
let bridge;
let clock;

const send = (e) => window.__votNativeAudio(JSON.stringify(e));
const state = (over) => send(Object.assign({ type: 'state', url: A, pos: 0, dur: 60000, buf: 0, rate: 1, playing: false, want: false, buffering: false, ended: false }, over));
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Every event the element fires, in order. */
function recorder(el) {
  const seen = [];
  for (const t of ['play', 'playing', 'pause', 'waiting', 'ended', 'error', 'loadedmetadata', 'durationchange', 'timeupdate', 'progress']) {
    el.addEventListener(t, () => seen.push(t));
  }
  return seen;
}

beforeEach(async () => {
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  bridge = {
    audioLoad: vi.fn(), audioPlay: vi.fn(), audioPause: vi.fn(), audioSeek: vi.fn(), audioRate: vi.fn(),
    audioVolume: vi.fn(), audioUpcoming: vi.fn(), audioRelease: vi.fn(), audioJournal: vi.fn(() => ''),
  };
  window.AndroidBridge = bridge;
  localStorage.setItem('vot.audioEngine', 'native');
  vi.resetModules();
  ({ NativeAudio, nativeAudioAvailable } = await import('./native-audio.js'));
});

afterEach(() => {
  vi.restoreAllMocks();
  delete window.AndroidBridge;
  delete window.__votNativeAudio;
  localStorage.removeItem('vot.audioEngine');
});

describe('native-audio - which engine', () => {
  it('is native in an APK whose bridge carries the player, unless the way back (html) is chosen', () => {
    expect(nativeAudioAvailable()).toBe(true);
    localStorage.setItem('vot.audioEngine', 'html');
    expect(nativeAudioAvailable()).toBe(false);
    localStorage.removeItem('vot.audioEngine');
    expect(nativeAudioAvailable()).toBe(true);
    localStorage.setItem('vot.audioEngine', 'native');
    window.AndroidBridge = { setAudioActive() {} };   // an older shell
    expect(nativeAudioAvailable()).toBe(false);
    delete window.AndroidBridge;                      // the PWA
    expect(nativeAudioAvailable()).toBe(false);
  });
});

describe('native-audio - the <audio> surface', () => {
  it('loads at the first play, where currentTime was set, with the lock-screen text and what comes next', () => {
    const el = new NativeAudio({
      meta: (url) => ({ title: 'Psalms 133', artist: 'KJV', album: url === A ? 'Psalms' : '' }),
      upcoming: () => [{ url: B, title: 'Psalms 134', rate: 1 }, { nope: 1 }, null],
    });
    const seen = recorder(el);
    el.preload = 'metadata';
    el.src = A;
    expect(bridge.audioLoad).not.toHaveBeenCalled();   // setting src fetches nothing (preload is ignored)
    el.currentTime = 41.5;
    el.playbackRate = 1.25;
    el.volume = 0.5;
    expect(bridge.audioSeek).not.toHaveBeenCalled();
    el.play();
    const load = JSON.parse(bridge.audioLoad.mock.calls[0][0]);
    expect(load).toEqual({ url: A, startMs: 41500, rate: 1.25, volume: 0.5, autoplay: false,
      title: 'Psalms 133', artist: 'KJV', album: 'Psalms', upcoming: [{ url: B, title: 'Psalms 134', rate: 1 }] });
    expect(bridge.audioPlay).toHaveBeenCalledTimes(1);
    expect(el.paused).toBe(false);
    expect(el.currentTime).toBe(41.5);
    expect(seen).toContain('play');
    el.play();   // a second play does not reload
    expect(bridge.audioLoad).toHaveBeenCalledTimes(1);
  });

  it('turns native state into metadata, playing, waiting and a running clock that stops 1.5 s past native', () => {
    const el = new NativeAudio();
    el.src = A;
    el.play();
    const seen = recorder(el);
    expect(el.readyState).toBe(0);
    expect(el.duration).toBeNaN();
    state({ want: true, buffering: true, dur: 0 });
    expect(seen).toEqual(['waiting', 'timeupdate']);
    state({ pos: 1000, dur: 60000, playing: true, want: true });
    expect(seen.slice(2)).toEqual(['loadedmetadata', 'durationchange', 'playing', 'timeupdate']);
    expect(el.readyState).toBe(4);
    expect(el.duration).toBe(60);
    clock += 500;
    expect(el.currentTime).toBeCloseTo(1.5);
    clock += 10000;
    expect(el.currentTime).toBeCloseTo(2.5);   // capped: native's next word decides
    state({ type: 'tick', pos: 5000, rate: 2, playing: true, want: true, buf: 30000 });
    expect(seen.slice(-2)).toEqual(['timeupdate', 'progress']);
    clock += 500;
    expect(el.currentTime).toBeCloseTo(6);     // 0.5 s at 2x
    expect(el.buffered.length).toBe(1);
    expect(el.buffered.end(0)).toBe(30);
  });

  it('seeks, rates and volumes go to native once loaded; a pause fires once', async () => {
    const el = new NativeAudio();
    el.src = A;
    el.play();
    state({ playing: true, want: true });
    const seen = recorder(el);
    el.currentTime = 12.25;
    expect(bridge.audioSeek).toHaveBeenCalledWith(12250);
    el.playbackRate = 1.5;
    el.playbackRate = 1.5;
    expect(bridge.audioRate).toHaveBeenCalledTimes(1);
    el.volume = 0.3;
    el.volume = 0.3004;
    el.volume = Number.NaN;
    expect(bridge.audioVolume).toHaveBeenCalledTimes(1);
    el.defaultPlaybackRate = 0;
    expect(el.defaultPlaybackRate).toBe(1);
    el.pause();
    el.pause();
    expect(bridge.audioPause).toHaveBeenCalledTimes(1);
    state({ pos: 12300, playing: false, want: false });   // native confirms: no second 'pause'
    await flush();
    expect(seen.filter((t) => t === 'pause')).toHaveLength(1);
    expect(el.paused).toBe(true);
  });

  it('follows native\'s own pause and play (focus lost, headphones out, the lock screen)', () => {
    const el = new NativeAudio();
    el.src = A;
    el.play();
    state({ playing: true, want: true });
    const seen = recorder(el);
    state({ playing: false, want: false, reason: 3 });
    expect(seen).toContain('pause');
    expect(el.paused).toBe(true);
    state({ playing: true, want: true });
    expect(seen.slice(-3)).toEqual(['play', 'playing', 'timeupdate']);
    expect(el.paused).toBe(false);
  });

  it('an end with nothing after it is a pause then an ended, once', () => {
    const el = new NativeAudio();
    el.src = A;
    el.play();
    state({ playing: true, want: true });
    const seen = recorder(el);
    state({ pos: 60000, ended: true });
    state({ pos: 60000, ended: true });
    expect(seen).toEqual(['pause', 'ended']);
    expect(el.ended).toBe(true);
    expect(el.paused).toBe(true);
  });

  it('an error is a MediaError the next play loads afresh', () => {
    const el = new NativeAudio();
    el.src = A;
    el.play();
    const seen = recorder(el);
    send({ type: 'error', url: A, code: 2004, name: 'ERROR_CODE_IO_BAD_HTTP_STATUS' });
    expect(seen).toEqual(['error']);
    expect(el.error.code).toBe(2);
    el.play();
    expect(bridge.audioLoad).toHaveBeenCalledTimes(2);
    send({ type: 'error', url: A, code: 0, name: 'not-playable' });
    expect(el.error.code).toBe(4);
  });

  it('src \'\' and removeAttribute(\'src\') let the recording go; a new src stops the old one', async () => {
    const el = new NativeAudio();
    el.src = A;
    el.play();
    el.src = B;
    expect(bridge.audioPause).toHaveBeenCalledTimes(1);
    expect(el.paused).toBe(true);
    expect(el.src).toBe(B);
    el.play();
    el.removeAttribute('src');
    el.load();
    expect(bridge.audioRelease).toHaveBeenCalled();
    expect(el.src).toBe('');
    el.src = '';
    await expect(el.play()).rejects.toThrow();
  });

  it('ignores events for a recording it has left, and bad JSON', () => {
    const el = new NativeAudio();
    el.src = A;
    el.play();
    el.src = B;
    el.play();
    const seen = recorder(el);
    state({ url: A, playing: true, want: true });   // native had not heard of B yet
    window.__votNativeAudio('{not json');
    el.handle(null);
    expect(seen).toEqual([]);
    state({ url: B, playing: true, want: true });
    expect(seen).toContain('playing');
  });
});

describe('native-audio - the seam', () => {
  /** An element playing A with B upcoming, whose 'ended' listener does what next() does: src = B, play(). */
  function playing(advanceTo = B) {
    const upcoming = vi.fn(() => [{ url: advanceTo, rate: 1 }]);
    const el = new NativeAudio({ upcoming });
    el.src = A;
    el.play();
    state({ playing: true, want: true, pos: 58000 });
    el.addEventListener('ended', () => { el.src = advanceTo; el.playbackRate = 1; el.play(); });
    return el;
  }

  it('native crossed: ended for the old, the next is ADOPTED - no reload, no pause, playing at native\'s clock', async () => {
    const el = playing();
    const seen = recorder(el);
    send({ type: 'transition', from: A, url: B, seq: 1, pos: 200, dur: 30000, playing: true, want: true });
    expect(seen[0]).toBe('ended');
    expect(el.src).toBe(B);
    expect(bridge.audioLoad).toHaveBeenCalledTimes(1);     // only A's
    expect(bridge.audioPause).not.toHaveBeenCalled();
    expect(el.ended).toBe(false);
    expect(el.duration).toBe(30);
    expect(el.currentTime).toBeCloseTo(0.2);
    await flush();
    expect(seen).toContain('playing');
    expect(seen).toContain('loadedmetadata');
  });

  it('each seam counts once (the live event and the journal carry the same number)', () => {
    const el = playing();
    const ended = vi.fn();
    el.addEventListener('ended', ended);
    send({ type: 'transition', from: A, url: B, seq: 1, playing: true, want: true });
    send({ type: 'transition', from: A, url: B, seq: 1, playing: true, want: true });
    bridge.audioJournal.mockReturnValue(JSON.stringify({ url: B, pos: 3000, dur: 30000, playing: true, want: true, last: 1,
      seams: [{ seq: 1, from: A, url: B, at: 1 }] }));
    el.reconcile();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('a page that slept through two seams replays both on its return, in order', () => {
    const el = new NativeAudio({ upcoming: () => [] });
    el.src = A;
    el.play();
    state({ playing: true, want: true });
    const heard = [];
    el.addEventListener('ended', () => {
      heard.push(el.src);
      el.src = el.src === A ? B : C;
      el.play();
    });
    bridge.audioJournal.mockReturnValue(JSON.stringify({ url: C, pos: 7000, dur: 90000, playing: true, want: true, last: 2,
      seams: [{ seq: 1, from: A, url: B, at: Date.now() + 1 }, { seq: 2, from: B, url: C, at: Date.now() + 2 }] }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(heard).toEqual([A, B]);
    expect(el.src).toBe(C);
    expect(el.currentTime).toBe(7);
    expect(el.duration).toBe(90);
    expect(bridge.audioLoad).toHaveBeenCalledTimes(1);
  });

  it('a seam the page is not on (it already moved elsewhere) fires nothing, and the old url is not adopted later', () => {
    const el = playing();
    el.src = C;      // the reader tapped another recording at the seam
    el.play();
    const ended = vi.fn();
    el.addEventListener('ended', ended);
    send({ type: 'transition', from: A, url: B, seq: 1, playing: true, want: true });
    expect(ended).not.toHaveBeenCalled();
    expect(bridge.audioLoad).toHaveBeenCalledTimes(2);   // A, then C
  });

  it('when the page advances somewhere else than native went, it loads that instead', () => {
    const el = playing(C);   // upcoming said C, but native reports B (a stale upcoming)
    send({ type: 'transition', from: A, url: B, seq: 1, playing: true, want: true });
    expect(el.src).toBe(C);
    expect(bridge.audioLoad).toHaveBeenCalledTimes(2);
    expect(JSON.parse(bridge.audioLoad.mock.calls[1][0]).url).toBe(C);
  });

  it('repeat one: after native used up the copy it held, the page hands over the next copy (refutation S1)', () => {
    const el = new NativeAudio({ upcoming: () => [{ url: A, rate: 1 }] });
    el.addEventListener('ended', () => { el.currentTime = 0; el.src = A; el.play(); el.syncUpcoming(); });
    el.src = A;
    el.play();
    expect(JSON.parse(bridge.audioLoad.mock.calls[0][0]).upcoming.map((t) => t.url)).toEqual([A]);
    state({ pos: 1000, playing: true, want: true });
    bridge.audioUpcoming.mockClear();
    send({ type: 'transition', from: A, url: A, seq: 1, pos: 0, dur: 60000, playing: true, want: true });
    expect(bridge.audioUpcoming).toHaveBeenCalledWith(JSON.stringify([{ url: A, rate: 1 }]));
  });

  it('a transition that lands after the page moved on is nobody\'s, and a later src loads (refutation S2)', () => {
    const el = new NativeAudio({ upcoming: () => [] });
    el.src = A;
    el.play();
    state({ pos: 59900, playing: true, want: true });
    el.src = X;
    el.play();
    send({ type: 'transition', from: A, url: B, seq: 1, pos: 0, dur: 60000, playing: true, want: true });
    state({ url: X, pos: 0, dur: 90000, playing: true, want: true });
    el.src = B;
    el.play();
    expect(bridge.audioLoad.mock.calls.map((c) => JSON.parse(c[0]).url)).toEqual([A, X, B]);
  });

  it('a journaled seam from before this load is not replayed (refutation M2)', () => {
    const el = new NativeAudio({ upcoming: () => [] });
    const ended = vi.fn();
    el.addEventListener('ended', ended);
    el.src = A;
    el.play();
    state({ pos: 30000, playing: true, want: true });
    bridge.audioJournal.mockReturnValue(JSON.stringify({ url: A, pos: 30000, dur: 600000, playing: true, want: true, last: 1,
      seams: [{ seq: 1, from: A, url: B, at: Date.now() - 60000 }] }));
    el.reconcile();
    expect(ended).not.toHaveBeenCalled();
    expect(el.paused).toBe(false);
  });

  it('a replayed seam does not resume what the listener paused since (refutation S5)', () => {
    const el = new NativeAudio({ upcoming: () => [] });
    el.addEventListener('ended', () => { el.src = B; el.play(); });
    el.src = A;
    el.play();
    state({ pos: 1000, playing: true, want: true });
    const plays = bridge.audioPlay.mock.calls.length;
    bridge.audioJournal.mockReturnValue(JSON.stringify({ url: B, pos: 4000, dur: 30000, playing: false, want: false, last: 1,
      seams: [{ seq: 1, from: A, url: B, at: Date.now() + 1 }] }));
    const seen = recorder(el);
    el.reconcile();
    expect(el.src).toBe(B);
    expect(bridge.audioPlay.mock.calls.length).toBe(plays);   // no resume sent
    expect(el.paused).toBe(true);
    expect(seen).not.toContain('playing');
  });

  it('events in flight when the page asked for play or pause are not native\'s own pause or play', async () => {
    const el = new NativeAudio();
    el.src = A;
    el.play();
    state({ playing: true, want: true });
    const seen = recorder(el);
    el.pause();
    await flush();
    state({ type: 'tick', pos: 2000, playing: true, want: true });   // sent before native heard the pause
    expect(seen).not.toContain('playing');
    expect(seen).not.toContain('play');
    expect(el.paused).toBe(true);
    state({ pos: 2100, playing: false, want: false });              // native heard it
    el.play();
    state({ pos: 2100, playing: false, want: false });              // sent before native heard the play
    await flush();
    expect(seen.filter((t) => t === 'pause')).toHaveLength(1);      // only the page's own pause
    expect(el.paused).toBe(false);
  });

  it('pausing an element that ended while native still wants to play tells native (refutation M1)', () => {
    const el = new NativeAudio();
    el.src = A;
    el.play();
    state({ playing: true, want: true });
    state({ pos: 60000, ended: true, want: true });
    expect(el.paused).toBe(true);
    bridge.audioPause.mockClear();
    el.pause();
    el.pause();
    expect(bridge.audioPause).toHaveBeenCalledTimes(1);
  });

  it('the page going away (reload, update, renderer rebuilt) lets native go (refutation S4)', () => {
    const el = new NativeAudio();
    el.src = A;
    el.play();
    window.dispatchEvent(new Event('pagehide'));
    expect(bridge.audioRelease).toHaveBeenCalled();
    expect(el.paused).toBe(true);
  });

  it('tells native what comes next only when it changed', () => {
    let next = [{ url: B, rate: 1 }];
    const el = new NativeAudio({ upcoming: () => next });
    el.syncUpcoming();                 // not loaded: nothing to tell
    el.src = A;
    el.play();
    el.syncUpcoming();
    expect(bridge.audioUpcoming).not.toHaveBeenCalled();
    next = [];
    el.syncUpcoming();
    el.syncUpcoming();
    expect(bridge.audioUpcoming).toHaveBeenCalledTimes(1);
    expect(bridge.audioUpcoming).toHaveBeenCalledWith('[]');
    const broken = new NativeAudio({ upcoming: () => { throw new Error('x'); }, meta: () => { throw new Error('y'); } });
    broken.src = A;
    broken.play();
    expect(JSON.parse(bridge.audioLoad.mock.calls.at(-1)[0]).upcoming).toEqual([]);
  });
});

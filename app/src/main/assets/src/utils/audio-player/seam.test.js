/* audio-player/seam — the web app's chapter seam on Android: a silent
   keeper holds Chrome's media session across the gap between recordings.
   Only core.js is mocked. The Audio constructor is stubbed per test, the
   user agent is set to Android Chrome, and URL.createObjectURL is stubbed —
   none of the three exist usefully in jsdom. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  native: false,
  state: /** @type {any} */ ({ status: 'idle', queue: [], qi: 0, sleepAtTrackEnd: false, sleepAtQueueEnd: false, loop: null }),
}));

vi.mock('./core.js', () => ({
  get _native() { return h.native; },
  get _state() { return h.state; },
}));

/** @type {typeof import('./seam.js')} */
let M;

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const origUA = navigator.userAgent;

const trackA = { key: 'vol1:letter1', url: 'https://cdn.example/a.mp3', title: 'A' };
const trackB = { key: 'vol1:letter2', url: 'https://cdn.example/b.mp3', title: 'B' };

/** @type {any} */
let keeper;
/** @type {any} */
let MockAudio;
/** @type {any} */
let origCreateObjectURL;

function makeKeeper() {
  const k = {
    loop: false, preload: '', paused: true, currentTime: 0, duration: 8,
    play: vi.fn(() => { k.paused = false; return Promise.resolve(); }),
    pause: vi.fn(() => { k.paused = true; }),
    addEventListener: vi.fn(),
  };
  return k;
}

function makeEl(/** @type {any} */ over = {}) {
  return { paused: false, currentTime: 99, duration: 100, playbackRate: 1, ...over };
}

function timeupdateCb() {
  const call = keeper.addEventListener.mock.calls.find((/** @type {any[]} */ c) => c[0] === 'timeupdate');
  return call && call[1];
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T08:00:00Z'));
  vi.resetModules();
  vi.clearAllMocks();
  keeper = makeKeeper();
  MockAudio = vi.fn(function () { return keeper; });
  vi.stubGlobal('Audio', MockAudio);
  Object.defineProperty(window.navigator, 'userAgent', { value: ANDROID_UA, configurable: true });
  origCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = () => 'blob:fake';
  const w = /** @type {any} */ (window);
  delete w.AndroidBridge;
  M = await import('./seam.js');
  h.native = false;
  h.state = {
    status: 'playing', queue: [trackA], qi: 0,
    sleepAtTrackEnd: false, sleepAtQueueEnd: false, loop: null,
  };
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(window.navigator, 'userAgent', { value: origUA, configurable: true });
  if (origCreateObjectURL === undefined) delete URL.createObjectURL;
  else URL.createObjectURL = origCreateObjectURL;
  const w = /** @type {any} */ (window);
  delete w.AndroidBridge;
});

describe('audio-player seam', () => {
  it('_seamTick starts a looping silent keeper in the last 2 seconds', () => {
    M._seamTick(makeEl());
    expect(MockAudio).toHaveBeenCalledTimes(1);
    expect(MockAudio).toHaveBeenCalledWith('blob:fake');
    expect(keeper.loop).toBe(true);
    expect(keeper.preload).toBe('auto');
    expect(keeper.play).toHaveBeenCalledTimes(1);
    expect(keeper.addEventListener).toHaveBeenCalledWith('timeupdate', expect.any(Function));
  });

  it('_seamTick keeps the keeper while the same track is still in its last seconds', () => {
    M._seamTick(makeEl());
    M._seamTick(makeEl({ currentTime: 99.5 }));
    expect(MockAudio).toHaveBeenCalledTimes(1);
    expect(keeper.play).toHaveBeenCalledTimes(1);
    expect(keeper.pause).not.toHaveBeenCalled();
  });

  it('_seamTick does nothing while paused, sleeping, looping, or at the queue end', () => {
    h.state.status = 'paused';
    M._seamTick(makeEl());
    h.state.status = 'playing';
    h.state.sleepAtTrackEnd = true;
    M._seamTick(makeEl());
    h.state.sleepAtTrackEnd = false;
    h.state.loop = { id: 1 };
    M._seamTick(makeEl());
    h.state.loop = null;
    h.state.sleepAtQueueEnd = true;
    M._seamTick(makeEl());
    expect(MockAudio).not.toHaveBeenCalled();
  });

  it('_seamTick does nothing with more than 2 seconds left', () => {
    M._seamTick(makeEl({ currentTime: 10 }));
    expect(MockAudio).not.toHaveBeenCalled();
  });

  it('_seamTick does nothing when native, off Android, or bridged', () => {
    h.native = true;
    M._seamTick(makeEl());
    h.native = false;
    Object.defineProperty(window.navigator, 'userAgent', { value: DESKTOP_UA, configurable: true });
    M._seamTick(makeEl());
    Object.defineProperty(window.navigator, 'userAgent', { value: ANDROID_UA, configurable: true });
    /** @type {any} */ (window).AndroidBridge = {};
    M._seamTick(makeEl());
    expect(MockAudio).not.toHaveBeenCalled();
  });

  it('_seamTick retries after a refused play', async () => {
    keeper.play.mockImplementationOnce(() => Promise.reject(new Error('no activation')));
    M._seamTick(makeEl());
    expect(keeper.play).toHaveBeenCalledTimes(1);
    await flush();
    M._seamTick(makeEl());
    expect(keeper.play).toHaveBeenCalledTimes(2);
  });

  it('_seamTick stops the keeper once the next track plays past half a second', () => {
    M._seamTick(makeEl());
    h.state.queue = [trackA, trackB];
    h.state.qi = 1;
    M._seamTick(makeEl({ currentTime: 1 }));
    expect(keeper.pause).toHaveBeenCalledTimes(1);
  });

  it('_seamTick stops the keeper after a seek back out of the last seconds', () => {
    M._seamTick(makeEl());
    M._seamTick(makeEl({ currentTime: 10 }));
    expect(keeper.pause).toHaveBeenCalledTimes(1);
  });

  it('_seamTick does not stop on the src-swap timeupdate at 0', () => {
    M._seamTick(makeEl());
    h.state.queue = [trackA, trackB];
    h.state.qi = 1;
    M._seamTick(makeEl({ currentTime: 0 }));
    expect(keeper.pause).not.toHaveBeenCalled();
  });

  it('_seamTick does not stop while the element is paused', () => {
    M._seamTick(makeEl());
    h.state.queue = [trackA, trackB];
    h.state.qi = 1;
    M._seamTick(makeEl({ paused: true, currentTime: 5 }));
    expect(keeper.pause).not.toHaveBeenCalled();
  });

  it('_seamStop is idempotent and survives a throwing pause', () => {
    M._seamTick(makeEl());
    M._seamStop();
    expect(keeper.pause).toHaveBeenCalledTimes(1);
    M._seamStop();
    expect(keeper.pause).toHaveBeenCalledTimes(1);
    keeper.pause.mockImplementationOnce(() => { throw new Error('detached'); });
    keeper.paused = false;
    expect(() => M._seamStop()).not.toThrow();
  });

  it('_seamStop with no keeper is a no-op', () => {
    expect(() => M._seamStop()).not.toThrow();
    expect(keeper.pause).not.toHaveBeenCalled();
  });

  it('the keeper watchdog stops it after 45 seconds', () => {
    M._seamTick(makeEl());
    const cb = timeupdateCb();
    expect(cb).toEqual(expect.any(Function));
    vi.advanceTimersByTime(46000);
    cb();
    expect(keeper.pause).toHaveBeenCalledTimes(1);
  });

  it('the keeper watchdog stops it when the status leaves playing or loading', () => {
    M._seamTick(makeEl());
    const cb = timeupdateCb();
    h.state.status = 'paused';
    cb();
    expect(keeper.pause).toHaveBeenCalledTimes(1);
  });

  it('the keeper watchdog leaves it up while loading inside 45 seconds', () => {
    M._seamTick(makeEl());
    const cb = timeupdateCb();
    h.state.status = 'loading';
    vi.advanceTimersByTime(1000);
    cb();
    expect(keeper.pause).not.toHaveBeenCalled();
  });

  it('_seamTick starts nothing when no silence URL can be made', () => {
    URL.createObjectURL = () => { throw new Error('no blob'); };
    expect(() => M._seamTick(makeEl())).not.toThrow();
    expect(MockAudio).not.toHaveBeenCalled();
  });
});

/* audio-player/loop — REPEAT THIS PASSAGE: a span of the playing recording
   heard N times. native-audio.js and core.js are mocked: the player's shared
   state is a plain object the cases set, the element is a fake with a native
   loop surface, and fake timers drive the timed wrap. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  el: /** @type {any} */ (null),
  native: false,
  nativeAudio: false,
  nativeLoop: false,
  pendingRestore: /** @type {any} */ (null),
  state: /** @type {any} */ ({ status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, loop: null, failed: null }),
  late: /** @type {any} */ ({}),
  notify: vi.fn(),
}));

vi.mock('../native-audio.js', () => ({
  nativeAudioAvailable: () => h.nativeAudio,
  nativeLoopAvailable: () => h.nativeLoop,
}));

vi.mock('./core.js', () => ({
  get _el() { return h.el; },
  late: h.late,
  get _native() { return h.native; },
  _notify: h.notify,
  get _pendingRestore() { return h.pendingRestore; },
  get _state() { return h.state; },
}));

/** @type {typeof import('./loop.js')} */
let L;

const track = { key: 'vol1:letter1', url: 'https://cdn.example/vol1.mp3', title: 'Letter 1' };

function makeEl(/** @type {any} */ over = {}) {
  return {
    currentTime: 0, duration: 60, paused: false,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    setLoop: vi.fn(),
    syncUpcoming: vi.fn(),
    loopState: null,
    ...over,
  };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  // late is a plain object the mock factory hands out by reference: mutate it
  // in place, never reassign it, or the module keeps the old one.
  Object.keys(h.late).forEach((k) => delete h.late[k]);
  Object.assign(h.late, {
    seek: vi.fn(),
    _markPaused: vi.fn(),
    _playRefused: vi.fn(),
  });
  L = await import('./loop.js');
  h.el = makeEl();
  h.native = false;
  h.nativeAudio = false;
  h.nativeLoop = false;
  h.pendingRestore = null;
  h.state = {
    status: 'playing', queue: [track], qi: 0, time: 0, duration: 60, rate: 1,
    loop: null, failed: null,
  };
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('audio-player loop', () => {
  it('setLoop starts a passage loop with pass 1 and seeks to its start', () => {
    expect(L.setLoop({ start: 10, end: 20 })).toBe(true);
    expect(h.state.loop).toEqual({
      id: 1, url: track.url, start: 10, end: 20, times: 3, pass: 1, label: '', waits: false,
    });
    expect(h.late.seek).toHaveBeenCalledWith(10);
    expect(h.el.setLoop).not.toHaveBeenCalled();
  });

  it('setLoop keeps the times and label the caller gave', () => {
    expect(L.setLoop({ start: 10, end: 20, times: 5, label: 'verse' })).toBe(true);
    expect(h.state.loop.times).toBe(5);
    expect(h.state.loop.label).toBe('verse');
    expect(L.setLoop({ start: 10, end: 20, times: 0 })).toBe(true);
    expect(h.state.loop.times).toBe(3);
    expect(L.setLoop({ start: 10, end: 20, times: 2.7 })).toBe(true);
    expect(h.state.loop.times).toBe(2);
  });

  it('setLoop refuses with no track, an idle bar, or a bad span', () => {
    h.state.queue = [];
    expect(L.setLoop({ start: 10, end: 20 })).toBe(false);
    h.state.queue = [track];
    h.state.status = 'idle';
    expect(L.setLoop({ start: 10, end: 20 })).toBe(false);
    h.state.status = 'playing';
    expect(L.setLoop({ start: NaN, end: 20 })).toBe(false);
    expect(L.setLoop({ start: -1, end: 20 })).toBe(false);
    expect(L.setLoop({ start: 20, end: 20 })).toBe(false);
    expect(L.setLoop({ start: 20, end: 10 })).toBe(false);
    expect(h.state.loop).toBeNull();
  });

  it('setLoop refuses on native without a loop, and hands native the loop when it loops', () => {
    h.native = true;
    h.nativeLoop = false;
    expect(L.setLoop({ start: 10, end: 20 })).toBe(false);
    h.nativeLoop = true;
    expect(L.setLoop({ start: 10, end: 20, times: 2 })).toBe(true);
    expect(h.el.setLoop).toHaveBeenCalledWith({ id: 1, start: 10, end: 20, times: 2, pass: 1 });
    expect(h.el.syncUpcoming).toHaveBeenCalledTimes(1);
  });

  it('setLoop waits when the bar is restored but has no element yet', () => {
    h.el = null;
    h.pendingRestore = { url: track.url };
    expect(L.setLoop({ start: 10, end: 20 })).toBe(true);
    expect(h.state.loop.waits).toBe(true);
    expect(h.late.seek).toHaveBeenCalledWith(10);
  });

  it('setLoop without an element and no matching restore refuses', () => {
    h.el = null;
    expect(L.setLoop({ start: 10, end: 20 })).toBe(false);
    h.pendingRestore = { url: 'https://cdn.example/other.mp3' };
    expect(L.setLoop({ start: 10, end: 20 })).toBe(false);
  });

  it('_loopTick is false with no loop or no element', () => {
    expect(L._loopTick()).toBe(false);
    L.setLoop({ start: 10, end: 20 });
    h.el = null;
    expect(L._loopTick()).toBe(false);
  });

  it('_loopTick clears the loop when the track moved on', () => {
    L.setLoop({ start: 10, end: 20 });
    h.state.queue = [{ key: 'vol1:letter2', url: 'https://cdn.example/other.mp3' }];
    expect(L._loopTick()).toBe(false);
    expect(h.state.loop).toBeNull();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('_loopTick wraps at the span end and counts the pass', () => {
    L.setLoop({ start: 10, end: 20, times: 3 });
    h.el.currentTime = 19.98;
    expect(L._loopTick()).toBe(true);
    expect(h.state.loop.pass).toBe(2);
    expect(h.late.seek).toHaveBeenCalledWith(10);
  });

  it('_loopTick on the last pass pauses at the span end', () => {
    L.setLoop({ start: 10, end: 20, times: 2 });
    h.el.currentTime = 19.98;
    expect(L._loopTick()).toBe(true);
    expect(h.state.loop.pass).toBe(2);
    h.el.currentTime = 19.98;
    expect(L._loopTick()).toBe(true);
    expect(h.state.loop).toBeNull();
    expect(h.el.pause).toHaveBeenCalledTimes(1);
    expect(h.late._markPaused).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('_loopTick times the last stretch instead of waiting for the next tick', () => {
    L.setLoop({ start: 10, end: 20, times: 3 });
    h.el.currentTime = 19.9;
    expect(L._loopTick()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(h.state.loop.pass).toBe(2);
    expect(h.late.seek).toHaveBeenCalledWith(10);
  });

  it('_loopTick timed wrap stands down on a pause or a seek back', () => {
    L.setLoop({ start: 10, end: 20, times: 3 });
    h.late.seek.mockClear();
    h.el.currentTime = 19.9;
    L._loopTick();
    vi.advanceTimersByTime(50);
    h.el.paused = true;
    vi.advanceTimersByTime(100);
    expect(h.state.loop.pass).toBe(1);
    expect(h.late.seek).not.toHaveBeenCalled();
    h.el.paused = false;
    h.el.currentTime = 19.9;
    L._loopTick();
    vi.advanceTimersByTime(50);
    h.el.currentTime = 9;
    vi.advanceTimersByTime(100);
    expect(h.state.loop.pass).toBe(1);
  });

  it('_loopTick sets no timer far from the end or while paused', () => {
    L.setLoop({ start: 10, end: 20, times: 3 });
    h.late.seek.mockClear();
    h.el.currentTime = 19;
    expect(L._loopTick()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(h.late.seek).not.toHaveBeenCalled();
    h.el.currentTime = 19.9;
    h.el.paused = true;
    expect(L._loopTick()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(h.late.seek).not.toHaveBeenCalled();
  });

  it('_loopTick follows native pass word, and clears when native goes silent after taking it', () => {
    h.native = true;
    h.nativeLoop = true;
    L.setLoop({ start: 10, end: 20, times: 3 });
    h.el.loopState = { id: 1, pass: 2 };
    expect(L._loopTick()).toBe(false);
    expect(h.state.loop.pass).toBe(2);
    expect(h.notify).toHaveBeenCalledTimes(1);
    h.el.loopState = null;
    expect(L._loopTick()).toBe(false);
    expect(h.state.loop).toBeNull();
  });

  it('_loopTick ignores native word about another loop', () => {
    h.native = true;
    h.nativeLoop = true;
    L.setLoop({ start: 10, end: 20, times: 3 });
    h.el.loopState = { id: 99, pass: 1 };
    expect(L._loopTick()).toBe(false);
    expect(h.state.loop).not.toBeNull();
  });

  it('_loopEnded returns empty and clears when it is not ours', () => {
    expect(L._loopEnded()).toBe('');
    L.setLoop({ start: 10, end: 20 });
    h.state.queue = [{ key: 'vol1:letter2', url: 'https://cdn.example/other.mp3' }];
    expect(L._loopEnded()).toBe('');
    expect(h.state.loop).toBeNull();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('_loopEnded wraps an earlier pass and plays on', async () => {
    L.setLoop({ start: 10, end: 20, times: 3 });
    expect(L._loopEnded()).toBe('wrap');
    expect(h.state.loop.pass).toBe(2);
    expect(h.late.seek).toHaveBeenCalledWith(10);
    expect(h.el.play).toHaveBeenCalledTimes(1);
    await flush();
    expect(h.late._playRefused).not.toHaveBeenCalled();
  });

  it('_loopEnded reports a refused play to _playRefused', async () => {
    L.setLoop({ start: 10, end: 20, times: 3 });
    h.el.play.mockImplementationOnce(() => Promise.reject(new Error('no play')));
    expect(L._loopEnded()).toBe('wrap');
    await flush();
    expect(h.late._playRefused).toHaveBeenCalledTimes(1);
  });

  it('_loopEnded is done on the last pass', () => {
    L.setLoop({ start: 10, end: 20, times: 2 });
    expect(L._loopEnded()).toBe('wrap');
    expect(L._loopEnded()).toBe('done');
    expect(h.state.loop).toBeNull();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('_loopEnded on native wraps while a pass is still to come', () => {
    h.native = true;
    h.nativeLoop = true;
    L.setLoop({ start: 10, end: 20, times: 3 });
    h.el.loopState = { id: 1, pass: 1 };
    expect(L._loopEnded()).toBe('wrap');
    expect(h.state.loop).not.toBeNull();
    h.el.loopState = { id: 1, pass: 3 };
    expect(L._loopEnded()).toBe('done');
    expect(h.state.loop).toBeNull();
  });

  it('clearLoop clears the timer and the loop and notifies', () => {
    L.setLoop({ start: 10, end: 20, times: 3 });
    h.late.seek.mockClear();
    h.el.currentTime = 19.9;
    L._loopTick();
    L.clearLoop();
    expect(h.state.loop).toBeNull();
    expect(h.notify).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(h.late.seek).not.toHaveBeenCalled();
  });

  it('_clearLoop with notify false stays silent', () => {
    L.setLoop({ start: 10, end: 20 });
    L._clearLoop(false);
    expect(h.state.loop).toBeNull();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('_clearLoopTimer clears only the timer', () => {
    L.setLoop({ start: 10, end: 20, times: 3 });
    h.late.seek.mockClear();
    h.el.currentTime = 19.9;
    L._loopTick();
    L._clearLoopTimer();
    vi.advanceTimersByTime(5000);
    expect(h.late.seek).not.toHaveBeenCalled();
    expect(h.state.loop).not.toBeNull();
  });

  it('clearLoop on native tells native the loop is over', () => {
    h.native = true;
    h.nativeLoop = true;
    L.setLoop({ start: 10, end: 20 });
    h.el.setLoop.mockClear();
    h.el.syncUpcoming.mockClear();
    L.clearLoop();
    expect(h.el.setLoop).toHaveBeenCalledWith(null);
    expect(h.el.syncUpcoming).toHaveBeenCalledTimes(1);
  });

  it('_loopToNative hands a waiting loop to native as null', () => {
    h.native = true;
    h.nativeLoop = true;
    h.state.loop = { id: 1, url: track.url, start: 10, end: 20, times: 3, pass: 1, label: '', waits: true };
    L._loopToNative();
    expect(h.el.setLoop).toHaveBeenCalledWith(null);
    h.state.loop.waits = false;
    L._loopToNative();
    expect(h.el.setLoop).toHaveBeenCalledWith({ id: 1, start: 10, end: 20, times: 3, pass: 1 });
  });

  it('_loopToNative is a no-op off native or without an element', () => {
    L.setLoop({ start: 10, end: 20 });
    L._loopToNative();
    expect(h.el.setLoop).not.toHaveBeenCalled();
    h.native = true;
    h.el = null;
    expect(() => L._loopToNative()).not.toThrow();
  });

  it('isNative and canLoop read the native surface', () => {
    expect(L.isNative()).toBe(false);
    expect(L.canLoop()).toBe(true);
    h.nativeAudio = true;
    expect(L.isNative()).toBe(true);
    expect(L.canLoop()).toBe(false);
    h.nativeLoop = true;
    expect(L.canLoop()).toBe(true);
    h.nativeAudio = false;
    h.native = true;
    expect(L.isNative()).toBe(true);
  });

  it('LOOP_SLACK_S is the half-second seek slack', () => {
    expect(L.LOOP_SLACK_S).toBe(0.5);
  });
});

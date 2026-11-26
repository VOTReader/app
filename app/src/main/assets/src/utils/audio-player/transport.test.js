/* audio-player/transport — the listener's controls on a live queue: play/pause,
   next/prev, jump, seek, speed, stop, and the pause other parts ask for.
   core.js and every sibling module are mocked: the player's shared state is a
   plain object the cases set, and the engine/persist/restore verbs are spies.
   The real normalizeAudioRate is NOT under test here — the mock pins the
   0.5–3 range the real one enforces; audio-track.js has its own tests. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  el: /** @type {any} */ (null),
  native: false,
  pendingRestore: /** @type {any} */ (null),
  source: /** @type {any} */ (null),
  skipSec: 10,
  readingRate: 1,
  errorTime: 0,
  lastTick: -1,
  lastPersistSec: -1,
  repeatMode: 'off',
  offlineRefuses: false,
  unreachable: false,
  holdsOtherForm: false,
  rebuildInFlight: false,
  rebuildResult: 'queue',
  isSong: false,
  library: /** @type {any} */ (null),
  undoSnapshot: /** @type {any} */ (null),
  applyUndo: true,
  state: /** @type {any} */ ({ status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, loop: null, failed: null }),
  notify: vi.fn(),
  toast: vi.fn(),
  setPendingRestore: vi.fn((v) => { h.pendingRestore = v || null; h.state.restoring = !!h.pendingRestore; }),
  setSource: vi.fn((v) => { h.source = v; }),
  setSkipSec: vi.fn((v) => { h.skipSec = v; }),
  setReadingRate: vi.fn((v) => { h.readingRate = v; }),
  setLastTick: vi.fn((v) => { h.lastTick = v; }),
  setErrorTime: vi.fn((v) => { h.errorTime = v; }),
  setPrewarmKey: vi.fn(),
  setLastPersistSec: vi.fn((v) => { h.lastPersistSec = v; }),
  markPaused: vi.fn(() => { h.state.status = 'paused'; }),
  start: vi.fn(),
  startAt: vi.fn(),
  seekOnMetadata: vi.fn(),
  clearLoop: vi.fn(),
  clearLoopTimer: vi.fn(),
  clearMediaSession: vi.fn(),
  setAudioActive: vi.fn(),
  syncMediaSessionPosition: vi.fn(),
  syncNative: vi.fn(),
  clearOfflineSkip: vi.fn(),
  clearStallWatchdog: vi.fn(),
  forgetLastGood: vi.fn(),
  persist: vi.fn(),
  clearPersist: vi.fn(),
  rememberCurrentPosition: vi.fn(),
  rememberOutgoingPosition: vi.fn(),
  stopWarming: vi.fn(),
  rebuildRestoredQueue: vi.fn(),
  toggleRebuildStart: vi.fn(),
  rebuildRestored: vi.fn(() => { h.pendingRestore = null; h.state.restoring = false; return Promise.resolve(h.rebuildResult); }),
  seamStop: vi.fn(),
  resetSectionFollow: vi.fn(),
  setSecLastT: vi.fn(),
  clearSleepTimer: vi.fn(),
  countPlay: vi.fn(),
  setSongRecordPending: vi.fn(),
  releaseObjectUrl: vi.fn(),
}));

vi.mock('./core.js', () => ({
  get _el() { return h.el; },
  get _readingRate() { return h.readingRate; },
  get _native() { return h.native; },
  get _pendingRestore() { return h.pendingRestore; },
  get _source() { return h.source; },
  get _state() { return h.state; },
  get _skipSec() { return h.skipSec; },
  _isSong: () => h.isSong,
  late: {},
  _library: () => h.library,
  _notify: h.notify,
  _toast: h.toast,
  _setPendingRestore: h.setPendingRestore,
  _setReadingRate: h.setReadingRate,
  _setSkipSec: h.setSkipSec,
  _setSource: h.setSource,
  SKIP_DEFAULT_SEC: 10,
  SKIP_MIN_SEC: 5,
  SKIP_MAX_SEC: 60,
  NEXT_OFFLINE_MSG: 'No connection. The next recording isn’t on this phone.',
  PREV_OFFLINE_MSG: 'No connection. The previous recording isn’t on this phone.',
  OFFLINE_MSG: 'Not on this phone. Connect to listen.',
}));

vi.mock('./credit.js', () => ({
  _countPlay: h.countPlay,
  _setSongRecordPending: h.setSongRecordPending,
}));

vi.mock('./engine.js', () => ({
  get _errorTime() { return h.errorTime; },
  get _lastTick() { return h.lastTick; },
  _clearOfflineSkip: h.clearOfflineSkip,
  _clearStallWatchdog: h.clearStallWatchdog,
  _forgetLastGood: h.forgetLastGood,
  _markPaused: h.markPaused,
  _seekOnMetadata: h.seekOnMetadata,
  _setErrorTime: h.setErrorTime,
  _setLastTick: h.setLastTick,
  _setPrewarmKey: h.setPrewarmKey,
  _start: h.start,
  _startAt: h.startAt,
}));

vi.mock('./loop.js', () => ({
  LOOP_SLACK_S: 0.5,
  _clearLoop: h.clearLoop,
  _clearLoopTimer: h.clearLoopTimer,
}));

vi.mock('./media-session.js', () => ({
  _clearMediaSession: h.clearMediaSession,
  _setAudioActive: h.setAudioActive,
  _syncMediaSessionPosition: h.syncMediaSessionPosition,
  _syncNative: h.syncNative,
}));

vi.mock('./offline.js', () => ({
  _holdsOtherForm: () => h.holdsOtherForm,
  _offlineRefuses: () => h.offlineRefuses,
  _srcFor: (/** @type {any} */ t) => t.url,
  _unreachable: () => h.unreachable,
}));

vi.mock('./persist.js', () => ({
  _applyUndoSnapshot: () => h.applyUndo,
  _clearPersist: h.clearPersist,
  _persist: h.persist,
  _rememberCurrentPosition: h.rememberCurrentPosition,
  _rememberOutgoingPosition: h.rememberOutgoingPosition,
  _setLastPersistSec: h.setLastPersistSec,
  _undoSnapshot: () => h.undoSnapshot,
}));

vi.mock('./prefetch.js', () => ({ _stopWarming: h.stopWarming }));

vi.mock('./restore.js', () => ({
  _rebuildInFlight: () => h.rebuildInFlight,
  _rebuildRestored: h.rebuildRestored,
  _rebuildRestoredQueue: h.rebuildRestoredQueue,
  _toggleRebuildStart: h.toggleRebuildStart,
}));

vi.mock('./seam.js', () => ({ _seamStop: h.seamStop }));

vi.mock('./sections.js', () => ({
  _resetSectionFollow: h.resetSectionFollow,
  _setSecLastT: h.setSecLastT,
}));

vi.mock('./sleep.js', () => ({ _clearSleepTimer: h.clearSleepTimer }));

vi.mock('./songs.js', () => ({ _repeatMode: () => h.repeatMode }));

vi.mock('../song-keep.js', () => ({ SongKeep: { releaseObjectUrl: h.releaseObjectUrl } }));

vi.mock('../audio-track.js', () => ({
  normalizeAudioRate: (/** @type {unknown} */ v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.min(3, Math.max(0.5, Math.round(n * 100) / 100));
  },
}));

/** The detached element: records play/pause/load, never loads anything. */
class FakeAudio {
  constructor() {
    this.src = '';
    this.currentTime = 0;
    this.duration = 0;
    this.ended = false;
    this.error = null;
    this.paused = true;
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this.readyState = 4;
    this.play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
    this.pause = vi.fn(() => { this.paused = true; });
    this.load = vi.fn();
  }
}

/** @type {typeof import('./transport.js')} */
let T;

const track = (/** @type {string} */ id) => ({ key: id, url: 'https://cdn.example/' + id + '.mp3', title: id.toUpperCase() });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  T = await import('./transport.js');
  h.native = false;
  h.pendingRestore = null;
  h.source = null;
  h.skipSec = 10;
  h.readingRate = 1;
  h.errorTime = 0;
  h.lastTick = -1;
  h.lastPersistSec = -1;
  h.repeatMode = 'off';
  h.offlineRefuses = false;
  h.unreachable = false;
  h.holdsOtherForm = false;
  h.rebuildInFlight = false;
  h.rebuildResult = 'queue';
  h.isSong = false;
  h.library = null;
  h.undoSnapshot = null;
  h.applyUndo = true;
  h.el = new FakeAudio();
  h.state = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, loop: null, failed: null };
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  const w = /** @type {any} */ (window);
  if (w.AndroidBridge) delete w.AndroidBridge;
});

describe('audio-player transport', () => {
  it('toggle on an idle bar is a no-op', () => {
    T.toggle();
    expect(h.el.pause).not.toHaveBeenCalled();
    expect(h.el.play).not.toHaveBeenCalled();
  });

  it('toggle while playing pauses the element and marks paused', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a')], qi: 0 };
    T.toggle();
    expect(h.el.pause).toHaveBeenCalled();
    expect(h.markPaused).toHaveBeenCalled();
    expect(h.state.status).toBe('paused');
  });

  it('a pending restore rebuilds the saved queue instead of toggling', () => {
    h.pendingRestore = { key: 'a' };
    h.state = { ...h.state, status: 'paused', queue: [track('a')], qi: 0 };
    T.toggle();
    expect(h.rebuildRestoredQueue).toHaveBeenCalled();
    expect(h.el.pause).not.toHaveBeenCalled();
    expect(h.el.play).not.toHaveBeenCalled();
  });

  it('a rebuild in flight takes the start back', () => {
    h.rebuildInFlight = true;
    h.state = { ...h.state, status: 'loading', queue: [track('a')], qi: 0 };
    T.toggle();
    expect(h.toggleRebuildStart).toHaveBeenCalled();
  });

  it('paused at the end of a recording moves on', () => {
    h.state = { ...h.state, status: 'paused', queue: [track('a'), track('b')], qi: 0 };
    h.el.ended = true;
    T.toggle();
    expect(h.state.qi).toBe(1);
    expect(h.start).toHaveBeenCalled();
  });

  it('paused at the end of the last recording plays it again from the top', () => {
    h.state = { ...h.state, status: 'paused', queue: [track('a')], qi: 0 };
    h.el.ended = true;
    h.el.src = track('a').url;
    T.toggle();
    expect(h.start).not.toHaveBeenCalled();
    expect(h.el.play).toHaveBeenCalled();
  });

  it('a failed element reloads from the error time and resumes', () => {
    h.state = { ...h.state, status: 'paused', queue: [track('a')], qi: 0, time: 30 };
    h.errorTime = 42;
    h.el.error = {};
    h.el.src = 'https://cdn.example/other.mp3';
    T.toggle();
    expect(h.el.src).toBe(track('a').url);
    expect(h.seekOnMetadata).toHaveBeenCalledWith(42);
    expect(h.el.play).toHaveBeenCalled();
  });

  it('an element holding another recording reloads from the state clock', () => {
    h.state = { ...h.state, status: 'paused', queue: [track('a')], qi: 0, time: 30 };
    h.errorTime = 42;
    h.holdsOtherForm = true;
    h.el.error = {};
    T.toggle();
    expect(h.seekOnMetadata).toHaveBeenCalledWith(30);
    expect(h.el.play).toHaveBeenCalled();
  });

  it('next on an empty queue is a no-op', () => {
    T.next();
    expect(h.start).not.toHaveBeenCalled();
  });

  it('next steps one track, starts it, and persists at once', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b'), track('c')], qi: 0 };
    T.next();
    expect(h.state.qi).toBe(1);
    expect(h.rememberOutgoingPosition).toHaveBeenCalled();
    expect(h.start).toHaveBeenCalled();
    expect(h.lastPersistSec).toBe(-1);
    expect(h.persist).toHaveBeenCalled();
  });

  it('next refuses offline when nothing ahead is on the phone', () => {
    h.offlineRefuses = true;
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 0 };
    T.next();
    expect(h.state.qi).toBe(0);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith('No connection. The next recording isn’t on this phone.');
  });

  it('at a seam the offline refusal does not apply', () => {
    h.offlineRefuses = true;
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 0 };
    T.next(true);
    expect(h.state.qi).toBe(1);
    expect(h.start).toHaveBeenCalled();
  });

  it('at the end of the order with repeat off, stops and leaves a Finished record', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 1 };
    T.next();
    expect(h.state.status).toBe('idle');
    expect(h.state.queue).toEqual([]);
    const fin = T.finished();
    expect(fin).toMatchObject({ label: '', portion: false, title: 'B' });
    expect(fin.queue).toEqual([track('a'), track('b')]);
  });

  it('at the end with repeat all, wraps to the top', () => {
    h.repeatMode = 'all';
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 1 };
    T.next();
    expect(h.state.qi).toBe(0);
    expect(h.start).toHaveBeenCalled();
  });

  it('a pending restore rebuilds, then steps when there is somewhere to go', async () => {
    h.pendingRestore = { key: 'a' };
    h.state = { ...h.state, status: 'paused', queue: [track('a'), track('b')], qi: 0 };
    T.next();
    expect(h.rebuildRestored).toHaveBeenCalled();
    await flush();
    expect(h.state.qi).toBe(1);
    expect(h.start).toHaveBeenCalled();
  });

  it('prev on an empty queue is a no-op', () => {
    T.prev();
    expect(h.start).not.toHaveBeenCalled();
  });

  it('prev more than 3 s in restarts the track', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 1, duration: 120, time: 10 };
    h.el.duration = 120;
    h.el.currentTime = 10;
    T.prev();
    expect(h.state.qi).toBe(1);
    expect(h.el.currentTime).toBe(0);
    expect(h.start).not.toHaveBeenCalled();
  });

  it('prev under the threshold steps back one', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 1, duration: 120, time: 2 };
    h.el.duration = 120;
    h.el.currentTime = 2;
    T.prev();
    expect(h.state.qi).toBe(0);
    expect(h.start).toHaveBeenCalled();
  });

  it('prev at the head restarts instead of reloading', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 0, duration: 120, time: 2 };
    h.el.duration = 120;
    h.el.currentTime = 2;
    T.prev();
    expect(h.state.qi).toBe(0);
    expect(h.el.currentTime).toBe(0);
    expect(h.start).not.toHaveBeenCalled();
  });

  it('prev refuses offline when the previous recording is not on the phone', () => {
    h.offlineRefuses = true;
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 1 };
    h.el.currentTime = 0;
    T.prev();
    expect(h.state.qi).toBe(1);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith('No connection. The previous recording isn’t on this phone.');
  });

  it('with no element and nothing to restore, a seek is a no-op', () => {
    h.el = null;
    T.seek(45);
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.persist).not.toHaveBeenCalled();
  });

  it("a restored bar's seek writes the descriptor's clock, unclamped", () => {
    h.el = null;
    h.pendingRestore = { key: 'a', time: 10 };
    h.state = { ...h.state, status: 'paused', queue: [track('a')], qi: 0, duration: 0, time: 10 };
    T.seek(45);
    expect(h.pendingRestore.time).toBe(45);
    expect(h.state.time).toBe(45);
    expect(h.lastTick).toBe(45);
    expect(h.lastPersistSec).toBe(45);
    expect(h.notify).toHaveBeenCalled();
    expect(h.persist).toHaveBeenCalled();
  });

  it('with no metadata yet the seek is deferred, not clamped to 0', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a')], qi: 0, duration: 0, time: 0 };
    h.el.duration = 0;
    T.seek(45);
    expect(h.seekOnMetadata).toHaveBeenCalledWith(45);
    expect(h.errorTime).toBe(45);
    expect(h.el.currentTime).toBe(0);
    expect(h.state.time).toBe(0);
    expect(h.persist).toHaveBeenCalled();
  });

  it('clamps the seek to the duration and to 0', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a')], qi: 0, duration: 120, time: 10 };
    h.el.duration = 120;
    T.seek(200);
    expect(h.state.time).toBe(120);
    expect(h.el.currentTime).toBe(120);
    T.seek(-5);
    expect(h.state.time).toBe(0);
    expect(h.el.currentTime).toBe(0);
  });

  it('leaving a looped passage clears the loop', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a')], qi: 0, duration: 120, time: 15, loop: { start: 10, end: 20 } };
    h.el.duration = 120;
    T.seek(15);
    expect(h.clearLoop).not.toHaveBeenCalled();
    T.seek(30);
    expect(h.clearLoop).toHaveBeenCalledWith(false);
  });

  it('skip moves relative to the clock', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a')], qi: 0, duration: 120, time: 30 };
    h.el.duration = 120;
    T.skip(15);
    expect(h.state.time).toBe(45);
    T.skip(-50);
    expect(h.state.time).toBe(0);
  });

  it.each([
    [undefined, 10], [null, 10], ['x', 10], [NaN, 10], [{}, 10],
    [3, 5], [5, 5], [10, 10], [15.4, 15], [15.6, 16], [60, 60], [99, 60], ['25', 25], ['  ', 10],
  ])('clampSkipSeconds(%s) is %s', (v, expected) => {
    expect(T.clampSkipSeconds(v)).toBe(expected);
  });

  it('skipSeconds returns the step in force', () => {
    expect(T.skipSeconds()).toBe(10);
    h.skipSec = 25;
    expect(T.skipSeconds()).toBe(25);
  });

  it('setSkipSeconds sets the step and notifies after the settings render', async () => {
    expect(T.setSkipSeconds(25)).toBe(25);
    expect(h.skipSec).toBe(25);
    expect(h.setSkipSec).toHaveBeenCalledWith(25);
    await flush();
    expect(h.notify).toHaveBeenCalled();
    expect(T.setSkipSeconds(25)).toBe(25);
    expect(h.setSkipSec).toHaveBeenCalledTimes(1);
  });

  it('setSkipSeconds clamps out-of-range input', () => {
    expect(T.setSkipSeconds(99)).toBe(60);
    expect(T.setSkipSeconds(1)).toBe(5);
    expect(T.setSkipSeconds('fast')).toBe(10);
  });

  it('setSkipSeconds tells the phone app the step once, through its bridge', () => {
    const audioSkip = vi.fn();
    /** @type {any} */ (window).AndroidBridge = { audioSkip };
    expect(T.setSkipSeconds(30)).toBe(30);
    expect(audioSkip).toHaveBeenCalledWith(30);
    expect(T.setSkipSeconds(30)).toBe(30);
    expect(audioSkip).toHaveBeenCalledTimes(1);
  });

  it('setPlaybackRate sets the reading speed, the element, and the library', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a')], qi: 0, rate: 1 };
    const setPlaybackRate = vi.fn();
    h.library = { setPlaybackRate };
    expect(T.setPlaybackRate(1.5)).toBe(1.5);
    expect(h.readingRate).toBe(1.5);
    expect(h.state.rate).toBe(1.5);
    expect(h.el.playbackRate).toBe(1.5);
    expect(setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(h.clearLoopTimer).toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalled();
  });

  it('a song stays at 1× while the reading speed moves', () => {
    h.isSong = true;
    h.state = { ...h.state, status: 'playing', queue: [track('a')], qi: 0, rate: 1 };
    const setPlaybackRate = vi.fn();
    h.library = { setPlaybackRate };
    expect(T.setPlaybackRate(2)).toBe(2);
    expect(h.readingRate).toBe(2);
    expect(h.state.rate).toBe(1);
    expect(h.el.playbackRate).toBe(1);
    expect(setPlaybackRate).toHaveBeenCalledWith(2);
    // Fix list 14: the Speed sheet shows the reading speed while a song plays, so a tap must redraw it.
    expect(T.readingRate()).toBe(2);
    expect(h.notify).toHaveBeenCalled();
  });

  it('setPlaybackRate falls back to 1× for a bad value and clamps the top', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a')], qi: 0, rate: 1 };
    expect(T.setPlaybackRate('fast')).toBe(1);
    expect(T.setPlaybackRate(9)).toBe(3);
    expect(h.readingRate).toBe(3);
  });

  it('playAt with an out-of-range index is a no-op', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 0 };
    T.playAt(2, 0);
    T.playAt(-1, 0);
    T.playAt(NaN, 0);
    expect(h.state.qi).toBe(0);
    expect(h.start).not.toHaveBeenCalled();
  });

  it('a pending restore blocks the jump', () => {
    h.pendingRestore = { key: 'a' };
    h.state = { ...h.state, status: 'paused', queue: [track('a'), track('b')], qi: 0 };
    T.playAt(1, 0);
    expect(h.state.qi).toBe(0);
    expect(h.start).not.toHaveBeenCalled();
  });

  it('a jump with no place just starts the track', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 0 };
    T.playAt(1);
    expect(h.state.qi).toBe(1);
    expect(h.start).toHaveBeenCalled();
    expect(h.startAt).not.toHaveBeenCalled();
  });

  it('a jump with a place rides the load', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 0 };
    T.playAt(1, 30);
    expect(h.state.qi).toBe(1);
    expect(h.startAt).toHaveBeenCalledTimes(1);
    const placeOf = h.startAt.mock.calls[0][0];
    expect(placeOf(h.state.queue[1])).toBe(30);
    expect(placeOf(h.state.queue[0])).toBe(0);
    expect(h.persist).toHaveBeenCalled();
  });

  it('a place into a recording that is not on the phone is refused', () => {
    h.unreachable = true;
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 0 };
    T.playAt(1, 30);
    expect(h.state.qi).toBe(0);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.startAt).not.toHaveBeenCalled();
  });

  it('stop clears the session and tears the element down', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 1, time: 50, duration: 100 };
    h.el.src = track('b').url;
    T.stop();
    expect(h.state).toMatchObject({ status: 'idle', qi: 0, time: 0, duration: 0, failed: null });
    expect(h.state.queue).toEqual([]);
    expect(h.el.src).toBe('');
    expect(h.el.load).toHaveBeenCalled();
    expect(h.releaseObjectUrl).toHaveBeenCalled();
    expect(h.clearPersist).toHaveBeenCalled();
    expect(h.setAudioActive).toHaveBeenCalledWith(false);
    expect(h.notify).toHaveBeenCalled();
    expect(h.lastTick).toBe(-1);
    expect(h.errorTime).toBe(0);
  });

  it('stopWithUndo hands back the snapshot and whether it was playing', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a')], qi: 0 };
    h.undoSnapshot = { queue: ['a'] };
    expect(T.stopWithUndo()).toEqual({ snap: { queue: ['a'] }, playing: true });
    expect(h.state.status).toBe('idle');
  });

  it('stopWithUndo on an idle bar returns null', () => {
    expect(T.stopWithUndo()).toBeNull();
  });

  it('undoStop brings the session back and persists it', () => {
    expect(T.undoStop({ snap: { queue: ['a'] }, playing: false })).toBe(true);
    expect(h.persist).toHaveBeenCalled();
  });

  it('undoStop fails without a snapshot, or when something is already playing', () => {
    h.applyUndo = false;
    expect(T.undoStop({ snap: {}, playing: false })).toBe(false);
    expect(h.persist).not.toHaveBeenCalled();
    h.applyUndo = true;
    h.state = { ...h.state, status: 'playing' };
    expect(T.undoStop({ snap: {}, playing: false })).toBe(false);
    expect(T.undoStop(null)).toBe(false);
  });

  it('finished() holds the record until dismissed', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 1 };
    T.next();
    expect(T.finished()).not.toBeNull();
    T.dismissFinished();
    expect(T.finished()).toBeNull();
    expect(h.notify).toHaveBeenCalled();
  });

  it('the Finished record clears itself after FINISHED_MS', () => {
    expect(T.FINISHED_MS).toBe(10000);
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 1 };
    T.next();
    expect(T.finished()).not.toBeNull();
    vi.advanceTimersByTime(9999);
    expect(T.finished()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(T.finished()).toBeNull();
  });

  it('replayFinished restarts the finished queue from the top', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 1 };
    T.next();
    expect(T.replayFinished()).toBe(true);
    expect(h.state.queue).toHaveLength(2);
    expect(h.state.qi).toBe(0);
    expect(h.countPlay).toHaveBeenCalled();
    expect(h.startAt).toHaveBeenCalled();
    expect(T.finished()).toBeNull();
  });

  it('replayFinished refuses offline and returns false with nothing finished', () => {
    expect(T.replayFinished()).toBe(false);
    h.state = { ...h.state, status: 'playing', queue: [track('a'), track('b')], qi: 1 };
    T.next();
    h.offlineRefuses = true;
    expect(T.replayFinished()).toBe(false);
    expect(h.toast).toHaveBeenCalledWith('Not on this phone. Connect to listen.');
  });

  it('pauseIfPlaying pauses only when playing', () => {
    h.state = { ...h.state, status: 'playing', queue: [track('a')], qi: 0 };
    T.pauseIfPlaying();
    expect(h.el.pause).toHaveBeenCalled();
    expect(h.state.status).toBe('paused');
    vi.clearAllMocks();
    h.state = { ...h.state, status: 'paused' };
    T.pauseIfPlaying();
    expect(h.el.pause).toHaveBeenCalledTimes(0);
  });

  it('with native holding silent, pauseIfPlaying still pauses the element', () => {
    h.native = true;
    h.state = { ...h.state, status: 'paused', queue: [track('a')], qi: 0 };
    T.pauseIfPlaying();
    expect(h.el.pause).toHaveBeenCalled();
  });

  it('a rebuild in flight takes the start back instead of pausing', () => {
    h.rebuildInFlight = true;
    h.state = { ...h.state, status: 'loading', queue: [track('a')], qi: 0 };
    T.pauseIfPlaying();
    expect(h.toggleRebuildStart).toHaveBeenCalled();
    expect(h.el.pause).not.toHaveBeenCalled();
  });
});

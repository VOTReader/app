/* audio-player/media-session — everything outside the page that shows or
   steers playback: the Android keep-alive (and the honest pause when Android
   refuses it), the web Media Session, the native media card and its
   transport commands, and the one-audible-recording arbiter. core.js,
   song-catalog.js, catalog.js, cover-art.js and sections.js are mocked: the
   player's shared state is a plain object the cases set, the bridge is a
   spy object on window.AndroidBridge, and the web MediaSession is a fake
   installed on navigator per case. audio-track.js is REAL — its song
   identity, Bible editions and reader names are part of what these tests
   pin, so the fixtures use real VOT audio URLs and real edition volKeys. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: /** @type {any} */ ({ status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, repeat: 'off', shuffle: false }),
  native: false,
  skipSec: 10,
  el: /** @type {any} */ (null),
  g: /** @type {any} */ ({}),
  secKey: /** @type {any} */ (null),
  lastMeta: /** @type {any} */ (null),
  toast: vi.fn(),
  late: {
    toggle: vi.fn(),
    pauseIfPlaying: vi.fn(),
    seek: vi.fn(),
    skip: vi.fn(),
    stop: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
  },
  bridge: {
    setAudioActive: vi.fn(),
    audioAskNotifications: vi.fn(),
    setAudioNowPlaying: vi.fn(),
  },
  songById: vi.fn(),
  songThumbUrl: vi.fn(),
  coverArt: vi.fn(),
  letterTitleOf: vi.fn(),
}));

class FakeMediaMetadata {
  /** @param {any} meta */
  constructor(meta) {
    Object.assign(this, meta);
    h.lastMeta = meta;
  }
}

vi.mock('./core.js', () => ({
  get _state() { return h.state; },
  get _native() { return h.native; },
  get _skipSec() { return h.skipSec; },
  get _el() { return h.el; },
  _g: () => h.g,
  _isBibleVol: (/** @type {unknown} */ k) => typeof k === 'string' && k.lastIndexOf('bible-', 0) === 0,
  _isSong: (/** @type {any} */ t) => !!t && (
    (typeof t.key === 'string' && /^song:[0-9a-f]{12}$/.test(t.key)) ||
    (typeof t.url === 'string' && /^https:\/\/votreader\.github\.io\/songs-\d+\/[0-9a-f]{12}\.mp3$/.test(t.url))
  ),
  _toast: h.toast,
  late: h.late,
}));

vi.mock('../song-catalog.js', () => ({
  songById: h.songById,
  songThumbUrl: h.songThumbUrl,
}));

vi.mock('./catalog.js', () => ({
  readerLabel: (/** @type {unknown} */ code) => {
    const names = /** @type {any} */ ({
      B: 'Read by Benjamin',
      T: 'Read by Timothy',
      V: 'Text-to-speech',
      M: 'Read with music',
    });
    return typeof code === 'string' ? (names[code] || null) : null;
  },
}));

vi.mock('./cover-art.js', () => ({
  coverArt: h.coverArt,
}));

vi.mock('./sections.js', () => ({
  get _secKey() { return h.secKey; },
  _letterTitleOf: h.letterTitleOf,
}));

/** @type {typeof import('./media-session.js')} */
let M;

const letterUrl = (/** @type {string} */ id) => (
  `https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/${id}.mp3`
);
const letterTrack = (/** @type {string} */ id = 'genesis-1') => (
  { key: id, url: letterUrl(id), title: 'Genesis 1', sub: null, readerCode: '', partLabel: null }
);
const songId = (/** @type {number} */ n) => n.toString(16).padStart(12, '0');
const songUrl = (/** @type {string} */ id) => `https://votreader.github.io/songs-1/${id}.mp3`;
const songTrack = (/** @type {string} */ id, /** @type {any} */ over = {}) => (
  { key: 'song:' + id, url: songUrl(id), title: 'Song ' + id, sub: null, readerCode: '', partLabel: null, ...over }
);
const bibleTrack = () => (
  { key: 'bible-brm-kjv:genesis-1', url: letterUrl('bible-genesis-1'), title: 'Genesis 1', sub: 'KJV', readerCode: '', partLabel: null }
);
const compilationTrack = () => /** @type {any} */ (
  { key: null, url: letterUrl('comp-1'), title: 'Letter 1', sub: 'Volume One', readerCode: '', partLabel: null }
);

const makeMediaSession = () => ({
  setActionHandler: vi.fn(),
  setPositionState: vi.fn(),
  metadata: /** @type {any} */ (null),
  playbackState: 'none',
});
/** @param {any} ms */
const installMediaSession = (ms) => {
  Object.defineProperty(window.navigator, 'mediaSession', { value: ms, configurable: true });
};
/** @param {any} ms @param {string} action */
const handlerFor = (ms, action) => {
  const calls = ms.setActionHandler.mock.calls.filter((/** @type {any} */ c) => c[0] === action);
  const call = calls[calls.length - 1];
  return call ? call[1] : undefined;
};
/** @param {boolean} hidden */
const setHidden = (hidden) => {
  Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
};
const audioEl = () => {
  const el = document.createElement('audio');
  Object.defineProperty(el, 'paused', { value: false, configurable: true });
  document.body.appendChild(el);
  return el;
};
/** @param {any} track @param {any} over */
const playingState = (track, over = {}) => {
  h.state = { ...h.state, status: 'playing', queue: [track], qi: 0, time: 30, duration: 180, rate: 1, ...over };
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  h.state = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, repeat: 'off', shuffle: false };
  h.native = false;
  h.skipSec = 10;
  h.el = null;
  h.secKey = null;
  h.lastMeta = null;
  h.g = { MediaMetadata: FakeMediaMetadata };
  h.songById.mockReset();
  h.songById.mockReturnValue(null);
  h.songThumbUrl.mockReset();
  h.songThumbUrl.mockReturnValue('');
  h.coverArt.mockReset();
  h.coverArt.mockReturnValue('');
  h.letterTitleOf.mockReset();
  h.letterTitleOf.mockReturnValue(null);
  h.bridge.setAudioActive.mockReset();
  h.bridge.setAudioActive.mockReturnValue(true);
  h.bridge.audioAskNotifications.mockReset();
  h.bridge.setAudioNowPlaying.mockReset();
  /** @type {any} */ (window).AndroidBridge = h.bridge;
  M = await import('./media-session.js');
  localStorage.clear();
});

afterEach(() => {
  const arbiter = h.g.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, 'mediaSession');
  Reflect.deleteProperty(window, 'AndroidBridge');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.body.innerHTML = '';
});

describe('audio-player media-session', () => {
  describe('syncKeepAlive and _raiseKeepAlive', () => {
    it('raises the keep-alive while playing', () => {
      playingState(letterTrack());
      M.syncKeepAlive();
      expect(h.bridge.setAudioActive).toHaveBeenCalledTimes(1);
      expect(h.bridge.setAudioActive).toHaveBeenCalledWith(true);
    });

    it('does nothing while loading, paused or idle', () => {
      for (const status of ['loading', 'paused', 'idle']) {
        h.state = { ...h.state, status, queue: [letterTrack()], qi: 0 };
        M.syncKeepAlive();
      }
      expect(h.bridge.setAudioActive).not.toHaveBeenCalled();
    });

    it('the tour holds the keep-alive back', () => {
      vi.stubGlobal('TourController', { getState: () => ({ active: true }) });
      playingState(letterTrack());
      M._raiseKeepAlive();
      expect(h.bridge.setAudioActive).not.toHaveBeenCalled();
      vi.advanceTimersByTime(0);
      expect(h.late.pauseIfPlaying).not.toHaveBeenCalled();
    });

    it('a throwing tour check reads as no tour', () => {
      vi.stubGlobal('TourController', { getState: () => { throw new Error('tour gone'); } });
      playingState(letterTrack());
      M._raiseKeepAlive();
      expect(h.bridge.setAudioActive).toHaveBeenCalledWith(true);
    });

    it('a refusal while hidden pauses once the start settles', () => {
      h.bridge.setAudioActive.mockReturnValue(false);
      setHidden(true);
      playingState(letterTrack());
      M._raiseKeepAlive();
      expect(h.late.pauseIfPlaying).not.toHaveBeenCalled();
      vi.advanceTimersByTime(0);
      expect(h.late.pauseIfPlaying).toHaveBeenCalledTimes(1);
    });

    it('a refusal on screen never pauses', () => {
      h.bridge.setAudioActive.mockReturnValue(false);
      playingState(letterTrack());
      M._raiseKeepAlive();
      vi.advanceTimersByTime(0);
      expect(h.late.pauseIfPlaying).not.toHaveBeenCalled();
    });

    it('a held keep-alive never pauses', () => {
      setHidden(true);
      playingState(letterTrack());
      M._raiseKeepAlive();
      vi.advanceTimersByTime(0);
      expect(h.late.pauseIfPlaying).not.toHaveBeenCalled();
    });

    it('the honest pause only fires for playing or loading', () => {
      h.bridge.setAudioActive.mockReturnValue(false);
      setHidden(true);
      h.state = { ...h.state, status: 'idle', queue: [letterTrack()], qi: 0 };
      M._raiseKeepAlive();
      vi.advanceTimersByTime(0);
      expect(h.late.pauseIfPlaying).not.toHaveBeenCalled();
      h.state = { ...h.state, status: 'loading' };
      M._raiseKeepAlive();
      vi.advanceTimersByTime(0);
      expect(h.late.pauseIfPlaying).toHaveBeenCalledTimes(1);
    });
  });

  describe('_onVisible', () => {
    const honestPause = () => {
      h.bridge.setAudioActive.mockReturnValue(false);
      setHidden(true);
      playingState(letterTrack());
      M._raiseKeepAlive();
      vi.advanceTimersByTime(0);
      expect(h.late.pauseIfPlaying).toHaveBeenCalledTimes(1);
      setHidden(false);
    };

    it('says why an honest pause happened, exactly once', () => {
      honestPause();
      M._onVisible();
      expect(h.toast).toHaveBeenCalledTimes(1);
      expect(h.toast).toHaveBeenCalledWith(
        'Paused while the screen was off: the phone would have played it silently. Press play to go on.'
      );
      M._onVisible();
      expect(h.toast).toHaveBeenCalledTimes(1);
    });

    it('re-raises the keep-alive on return, and says nothing without a pause', () => {
      playingState(letterTrack());
      M._onVisible();
      expect(h.toast).not.toHaveBeenCalled();
      expect(h.bridge.setAudioActive).toHaveBeenCalledWith(true);
    });
  });

  describe('_setAudioActive', () => {
    it('native asks for notifications when active, and always holds', () => {
      h.native = true;
      expect(M._setAudioActive(true)).toBe(true);
      expect(h.bridge.audioAskNotifications).toHaveBeenCalledTimes(1);
      expect(M._setAudioActive(false)).toBe(true);
      expect(h.bridge.audioAskNotifications).toHaveBeenCalledTimes(1);
    });

    it('native with no bridge still holds', () => {
      h.native = true;
      Reflect.deleteProperty(window, 'AndroidBridge');
      expect(M._setAudioActive(true)).toBe(true);
    });

    it('native swallows a throwing ask', () => {
      h.native = true;
      h.bridge.audioAskNotifications.mockImplementation(() => { throw new Error('bridge gone'); });
      expect(M._setAudioActive(true)).toBe(true);
    });

    it('a refusal reads as false, anything else as held', () => {
      h.bridge.setAudioActive.mockReturnValue(false);
      expect(M._setAudioActive(true)).toBe(false);
      h.bridge.setAudioActive.mockReturnValue(undefined);
      expect(M._setAudioActive(true)).toBe(true);
      h.bridge.setAudioActive.mockReturnValue(true);
      expect(M._setAudioActive(false)).toBe(true);
    });

    it('no bridge, or a throwing bridge, reads as held', () => {
      Reflect.deleteProperty(window, 'AndroidBridge');
      expect(M._setAudioActive(true)).toBe(true);
      /** @type {any} */ (window).AndroidBridge = h.bridge;
      h.bridge.setAudioActive.mockImplementation(() => { throw new Error('bridge gone'); });
      expect(M._setAudioActive(true)).toBe(true);
    });
  });

  describe('_pauseOtherDomAudio', () => {
    it('pauses the other playing recordings', () => {
      const a = audioEl();
      const b = audioEl();
      const pauseA = vi.spyOn(a, 'pause');
      const pauseB = vi.spyOn(b, 'pause');
      M._pauseOtherDomAudio(null);
      expect(pauseA).toHaveBeenCalledTimes(1);
      expect(pauseB).toHaveBeenCalledTimes(1);
    });

    it('skips the recording it was told to leave alone, and the paused ones', () => {
      const a = audioEl();
      const b = audioEl();
      const c = audioEl();
      Object.defineProperty(c, 'paused', { value: true, configurable: true });
      const pauseA = vi.spyOn(a, 'pause');
      const pauseB = vi.spyOn(b, 'pause');
      const pauseC = vi.spyOn(c, 'pause');
      M._pauseOtherDomAudio(b);
      expect(pauseA).toHaveBeenCalledTimes(1);
      expect(pauseB).not.toHaveBeenCalled();
      expect(pauseC).not.toHaveBeenCalled();
    });

    it('a throwing pause does not stop the others', () => {
      const a = audioEl();
      const b = audioEl();
      const pauseA = vi.spyOn(a, 'pause').mockImplementation(() => { throw new Error('detaching'); });
      const pauseB = vi.spyOn(b, 'pause');
      expect(() => M._pauseOtherDomAudio(null)).not.toThrow();
      expect(pauseA).toHaveBeenCalledTimes(1);
      expect(pauseB).toHaveBeenCalledTimes(1);
    });

    it('with no audio on the page it is a no-op', () => {
      expect(() => M._pauseOtherDomAudio(null)).not.toThrow();
    });
  });

  describe('_installMediaArbiter', () => {
    it('installs once: one play event pauses once', () => {
      const a = audioEl();
      const b = audioEl();
      const pauseA = vi.spyOn(a, 'pause');
      M._installMediaArbiter();
      M._installMediaArbiter();
      b.dispatchEvent(new Event('play'));
      expect(pauseA).toHaveBeenCalledTimes(1);
      expect(h.late.pauseIfPlaying).toHaveBeenCalledTimes(1);
    });

    it('a play event pauses the others, never itself', () => {
      const a = audioEl();
      const b = audioEl();
      const pauseA = vi.spyOn(a, 'pause');
      const pauseB = vi.spyOn(b, 'pause');
      M._installMediaArbiter();
      a.dispatchEvent(new Event('play'));
      expect(pauseA).not.toHaveBeenCalled();
      expect(pauseB).toHaveBeenCalledTimes(1);
      expect(h.late.pauseIfPlaying).toHaveBeenCalledTimes(1);
    });

    it('a previous arbiter is replaced, not stacked', () => {
      const oldHandler = vi.fn();
      h.g.__votAudioArbiter = oldHandler;
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      M._installMediaArbiter();
      expect(removeSpy).toHaveBeenCalledWith('play', oldHandler, true);
      expect(h.g.__votAudioArbiter).not.toBe(oldHandler);
      expect(typeof h.g.__votAudioArbiter).toBe('function');
      const a = audioEl();
      a.dispatchEvent(new Event('play'));
      expect(oldHandler).not.toHaveBeenCalled();
      expect(h.late.pauseIfPlaying).toHaveBeenCalledTimes(1);
      removeSpy.mockRestore();
    });

    it('records the handler where the next install can find it', () => {
      M._installMediaArbiter();
      expect(typeof h.g.__votAudioArbiter).toBe('function');
    });
  });

  describe('_mediaSession', () => {
    it('without a web session the native twin still runs', () => {
      const track = { ...letterTrack(), readerCode: 'B' };
      playingState(track);
      M._mediaSession(track);
      expect(h.bridge.setAudioNowPlaying).toHaveBeenCalledTimes(1);
      expect(h.bridge.setAudioNowPlaying).toHaveBeenCalledWith('Genesis 1', 'Read by Benjamin', true, 30, 180, 1);
      expect(typeof h.g.__votMediaCommand).toBe('function');
    });

    it('installs the web card: metadata plus the actions', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      const track = { ...letterTrack(), readerCode: 'B' };
      playingState(track);
      M._mediaSession(track);
      expect(ms.metadata).toBeInstanceOf(FakeMediaMetadata);
      expect(h.lastMeta).toMatchObject({ title: 'Genesis 1', artist: 'Read by Benjamin', album: '' });
      expect(ms.setActionHandler.mock.calls.map((/** @type {any} */ c) => c[0]).sort()).toEqual(
        ['nexttrack', 'pause', 'play', 'previoustrack', 'seekbackward', 'seekforward', 'seekto', 'stop']
      );
      expect(handlerFor(ms, 'previoustrack')).toBeNull();
      expect(handlerFor(ms, 'nexttrack')).toBeNull();
      expect(ms.playbackState).toBe('playing');
      expect(ms.setPositionState).toHaveBeenCalledWith({ duration: 180, position: 30, playbackRate: 1 });
      expect(h.bridge.setAudioNowPlaying).toHaveBeenCalledTimes(2);
    });

    it('the play action only plays from paused', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      const track = letterTrack();
      playingState(track, { status: 'paused' });
      M._mediaSession(track);
      handlerFor(ms, 'play')();
      expect(h.late.toggle).toHaveBeenCalledTimes(1);
      h.state = { ...h.state, status: 'playing' };
      handlerFor(ms, 'play')();
      expect(h.late.toggle).toHaveBeenCalledTimes(1);
    });

    it('seek actions wire through with the skip step as default', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      const track = letterTrack();
      playingState(track);
      M._mediaSession(track);
      handlerFor(ms, 'seekto')({ seekTime: 42 });
      expect(h.late.seek).toHaveBeenCalledWith(42);
      handlerFor(ms, 'seekto')();
      expect(h.late.seek).toHaveBeenCalledWith(0);
      handlerFor(ms, 'seekbackward')({ seekOffset: 7 });
      expect(h.late.skip).toHaveBeenCalledWith(-7);
      handlerFor(ms, 'seekbackward')();
      expect(h.late.skip).toHaveBeenCalledWith(-10);
      handlerFor(ms, 'seekforward')();
      expect(h.late.skip).toHaveBeenCalledWith(10);
      handlerFor(ms, 'stop')();
      expect(h.late.stop).toHaveBeenCalledTimes(1);
    });

    it('one unsupported action does not skip the rest', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      /** @type {Array<any>} */
      const registered = [];
      ms.setActionHandler.mockImplementation((/** @type {string} */ action, /** @type {any} */ handler) => {
        if (action === 'pause') throw new Error('unsupported action');
        registered.push([action, handler]);
      });
      const track = letterTrack();
      playingState(track);
      expect(() => M._mediaSession(track)).not.toThrow();
      expect(registered.map((/** @type {any} */ r) => r[0])).toContain('play');
      expect(registered.map((/** @type {any} */ r) => r[0])).toContain('stop');
      expect(registered.map((/** @type {any} */ r) => r[0])).not.toContain('pause');
    });

    it('a multi-track queue arms prev and next', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      const a = letterTrack('genesis-1');
      const b = letterTrack('genesis-2');
      h.state = { ...h.state, status: 'playing', queue: [a, b], qi: 0, time: 30, duration: 180, rate: 1 };
      M._mediaSession(a);
      handlerFor(ms, 'previoustrack')();
      expect(h.late.prev).toHaveBeenCalledTimes(1);
      handlerFor(ms, 'nexttrack')();
      expect(h.late.next).toHaveBeenCalledTimes(1);
    });

    it('a throwing metadata write never breaks playback', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      h.g = {
        MediaMetadata: class {
          constructor() { throw new Error('no metadata here'); }
        },
      };
      const track = letterTrack();
      playingState(track);
      expect(() => M._mediaSession(track)).not.toThrow();
      expect(h.bridge.setAudioNowPlaying).toHaveBeenCalled();
    });
  });

  describe('_syncMediaSessionActions', () => {
    it('arms prev/next only for a multi-track queue', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      const a = letterTrack('genesis-1');
      const b = letterTrack('genesis-2');
      h.state = { ...h.state, queue: [a], qi: 0 };
      M._syncMediaSessionActions();
      expect(handlerFor(ms, 'previoustrack')).toBeNull();
      expect(handlerFor(ms, 'nexttrack')).toBeNull();
      h.state = { ...h.state, queue: [a, b], qi: 0 };
      M._syncMediaSessionActions();
      handlerFor(ms, 'previoustrack')();
      expect(h.late.prev).toHaveBeenCalledTimes(1);
      handlerFor(ms, 'nexttrack')();
      expect(h.late.next).toHaveBeenCalledTimes(1);
    });

    it('no session, no-op', () => {
      expect(() => M._syncMediaSessionActions()).not.toThrow();
    });
  });

  describe('_syncMediaSessionPosition', () => {
    it('reports a clamped position and the rate', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      h.state = { ...h.state, time: 999, duration: 120, rate: 1.5 };
      M._syncMediaSessionPosition();
      expect(ms.setPositionState).toHaveBeenCalledWith({ duration: 120, position: 120, playbackRate: 1.5 });
      h.state = { ...h.state, time: -5, duration: 120, rate: 1 };
      M._syncMediaSessionPosition();
      expect(ms.setPositionState).toHaveBeenCalledWith({ duration: 120, position: 0, playbackRate: 1 });
    });

    it('stays quiet without a length', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      h.state = { ...h.state, time: 30, duration: 0 };
      M._syncMediaSessionPosition();
      h.state = { ...h.state, time: 30, duration: NaN };
      M._syncMediaSessionPosition();
      expect(ms.setPositionState).not.toHaveBeenCalled();
    });

    it('stays quiet when the host has no setPositionState', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      delete ms.setPositionState;
      h.state = { ...h.state, time: 30, duration: 120 };
      expect(() => M._syncMediaSessionPosition()).not.toThrow();
    });

    it('never wakes the native card', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      playingState(letterTrack());
      M._syncMediaSessionPosition();
      expect(h.bridge.setAudioNowPlaying).not.toHaveBeenCalled();
    });

    it('no session, no-op', () => {
      expect(() => M._syncMediaSessionPosition()).not.toThrow();
    });
  });

  describe('_syncMediaSessionState', () => {
    it('maps loading to playing, paused to paused, idle to none', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      M._syncMediaSessionState('loading');
      expect(ms.playbackState).toBe('playing');
      M._syncMediaSessionState('playing');
      expect(ms.playbackState).toBe('playing');
      M._syncMediaSessionState('paused');
      expect(ms.playbackState).toBe('paused');
      M._syncMediaSessionState('idle');
      expect(ms.playbackState).toBe('none');
    });

    it('syncs the native card first', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      playingState({ ...letterTrack(), readerCode: 'B' });
      M._syncMediaSessionState('playing');
      expect(h.bridge.setAudioNowPlaying).toHaveBeenCalledTimes(1);
      expect(h.bridge.setAudioNowPlaying).toHaveBeenCalledWith('Genesis 1', 'Read by Benjamin', true, 30, 180, 1);
    });

    it('no session still syncs native', () => {
      playingState({ ...letterTrack(), readerCode: 'B' }, { status: 'paused' });
      M._syncMediaSessionState('paused');
      expect(h.bridge.setAudioNowPlaying).toHaveBeenCalledWith('Genesis 1', 'Read by Benjamin', false, 30, 180, 1);
    });
  });

  describe('_clearMediaSession', () => {
    it('nulls every action, the metadata and the state', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      ms.metadata = new FakeMediaMetadata({ title: 'x' });
      ms.playbackState = 'playing';
      M._clearMediaSession();
      expect(ms.setActionHandler.mock.calls.map((/** @type {any} */ c) => c[0]).sort()).toEqual(
        ['nexttrack', 'pause', 'play', 'previoustrack', 'seekbackward', 'seekforward', 'seekto', 'stop']
      );
      const nulls = ms.setActionHandler.mock.calls.map((/** @type {any} */ c) => c[1]);
      expect(nulls).toEqual([null, null, null, null, null, null, null, null]);
      expect(ms.metadata).toBeNull();
      expect(ms.playbackState).toBe('none');
    });

    it('no session, no-op', () => {
      expect(() => M._clearMediaSession()).not.toThrow();
    });
  });

  describe('card lines', () => {
    describe('_cardArtist', () => {
      it('a song names the shelf and the version', () => {
        expect(M._cardArtist(songTrack(songId(1), { partLabel: 'Take 3' }))).toBe('Songs of the Letters · Take 3');
        expect(M._cardArtist(songTrack(songId(1)))).toBe('Songs of the Letters');
      });

      it('a Bible chapter names the edition, not the app', () => {
        expect(M._cardArtist(bibleTrack())).toBe('KJV · Biblical Restoration');
        expect(M._cardArtist({ ...bibleTrack(), key: 'bible-web:john-1' })).toBe('WEB');
      });

      it('an unknown Bible edition falls back to the reader, then the app', () => {
        expect(M._cardArtist({ ...bibleTrack(), key: 'bible-nope:genesis-1', readerCode: 'M' })).toBe('Read with music');
        expect(M._cardArtist({ ...bibleTrack(), key: 'bible-nope:genesis-1', readerCode: 'Z' })).toBe('The Volumes of Truth');
      });

      it('a letter names its reader', () => {
        expect(M._cardArtist({ ...letterTrack(), readerCode: 'T' })).toBe('Read by Timothy');
        expect(M._cardArtist(letterTrack())).toBe('The Volumes of Truth');
      });
    });

    describe('_cardTitle', () => {
      it('a song keeps its own title', () => {
        expect(M._cardTitle(songTrack(songId(1), { partLabel: 'Take 3' }))).toBe('Song ' + songId(1));
      });

      it('a letter carries its part after an em dash', () => {
        expect(M._cardTitle({ ...letterTrack(), partLabel: 'Part 2' })).toBe('Genesis 1 — Part 2');
        expect(M._cardTitle(letterTrack())).toBe('Genesis 1');
      });

      it('a live compilation shows the letter being read', () => {
        const track = compilationTrack();
        h.secKey = 'letter-9';
        h.letterTitleOf.mockReturnValue('The Ninth Letter');
        h.state = { ...h.state, queue: [track], qi: 0 };
        expect(M._cardTitle(track)).toBe('The Ninth Letter');
      });

      it('a compilation off the queue keeps its own title', () => {
        const track = compilationTrack();
        h.secKey = 'letter-9';
        h.letterTitleOf.mockReturnValue('The Ninth Letter');
        h.state = { ...h.state, queue: [letterTrack()], qi: 0 };
        expect(M._cardTitle(track)).toBe('Letter 1');
      });
    });

    describe('_cardAlbum', () => {
      it('a live compilation joins collection and title', () => {
        const track = compilationTrack();
        h.secKey = 'letter-9';
        h.letterTitleOf.mockReturnValue('The Ninth Letter');
        h.state = { ...h.state, queue: [track], qi: 0 };
        expect(M._cardAlbum(track)).toBe('Volume One · Letter 1');
      });

      it('a live compilation without a collection shows the title alone', () => {
        const track = compilationTrack();
        track.sub = null;
        h.secKey = 'letter-9';
        h.letterTitleOf.mockReturnValue('The Ninth Letter');
        h.state = { ...h.state, queue: [track], qi: 0 };
        expect(M._cardAlbum(track)).toBe('Letter 1');
      });

      it('a letter shows its collection, or nothing', () => {
        expect(M._cardAlbum({ ...letterTrack(), sub: 'Volume One' })).toBe('Volume One');
        expect(M._cardAlbum(letterTrack())).toBe('');
      });
    });

    describe('_cardArt', () => {
      it('a known song shows its cover thumb', () => {
        const id = songId(1);
        h.songById.mockReturnValue({ id });
        h.songThumbUrl.mockReturnValue('https://thumb.example/song.webp');
        expect(M._cardArt(songTrack(id))).toBe('https://thumb.example/song.webp');
        expect(h.songThumbUrl).toHaveBeenCalledWith({ id }, 512);
      });

      it('an unknown song has no picture', () => {
        expect(M._cardArt(songTrack(songId(1)))).toBe('');
      });

      it('a letter shows its collection cover', () => {
        h.coverArt.mockImplementation((/** @type {unknown} */ sub) => (sub ? 'data:image/png;base64,AAA' : ''));
        expect(M._cardArt({ ...letterTrack(), sub: 'Volume One' })).toBe('data:image/png;base64,AAA');
        expect(h.coverArt).toHaveBeenCalledWith('Volume One');
        expect(M._cardArt(letterTrack())).toBe('');
      });
    });

    describe('_cardKind', () => {
      it('songs are songs, everything else is spoken', () => {
        expect(M._cardKind(songTrack(songId(1)))).toBe('song');
        expect(M._cardKind(letterTrack())).toBe('spoken');
        expect(M._cardKind({ key: 'x', url: songUrl(songId(2)), title: 't', sub: null, readerCode: '', partLabel: null })).toBe('song');
      });
    });
  });

  describe('_syncNative', () => {
    it('the native player draws its own card', () => {
      h.native = true;
      playingState(letterTrack());
      M._syncNative();
      expect(h.bridge.setAudioNowPlaying).not.toHaveBeenCalled();
    });

    it('no bridge, or no track, is a quiet no-op', () => {
      Reflect.deleteProperty(window, 'AndroidBridge');
      playingState(letterTrack());
      expect(() => M._syncNative()).not.toThrow();
      /** @type {any} */ (window).AndroidBridge = h.bridge;
      h.state = { ...h.state, queue: [], qi: 0 };
      expect(() => M._syncNative()).not.toThrow();
      expect(h.bridge.setAudioNowPlaying).not.toHaveBeenCalled();
    });

    it('sends title, artist, state, clock and rate', () => {
      playingState({ ...letterTrack(), readerCode: 'B' });
      M._syncNative();
      expect(h.bridge.setAudioNowPlaying).toHaveBeenCalledWith('Genesis 1', 'Read by Benjamin', true, 30, 180, 1);
      h.state = { ...h.state, status: 'loading' };
      M._syncNative();
      expect(h.bridge.setAudioNowPlaying).toHaveBeenLastCalledWith('Genesis 1', 'Read by Benjamin', true, 30, 180, 1);
      h.state = { ...h.state, status: 'paused', rate: 0 };
      M._syncNative();
      expect(h.bridge.setAudioNowPlaying).toHaveBeenLastCalledWith('Genesis 1', 'Read by Benjamin', false, 30, 180, 1);
    });

    it('a throwing bridge never disturbs playback', () => {
      h.bridge.setAudioNowPlaying.mockImplementation(() => { throw new Error('bridge gone'); });
      playingState(letterTrack());
      expect(() => M._syncNative()).not.toThrow();
    });
  });

  describe('_nativeMeta', () => {
    it('an unknown url reads as an empty record', () => {
      playingState(letterTrack());
      expect(M._nativeMeta('https://elsewhere.example/x.mp3')).toEqual({ title: '', artist: '', album: '' });
    });

    it('the current track reads as its card', () => {
      const id = songId(1);
      const track = songTrack(id, { partLabel: 'Take 3' });
      h.songById.mockReturnValue({ id });
      h.songThumbUrl.mockReturnValue('https://thumb.example/song.webp');
      playingState(track);
      expect(M._nativeMeta(track.url)).toEqual({
        title: 'Song ' + id,
        artist: 'Songs of the Letters · Take 3',
        album: '',
        art: 'https://thumb.example/song.webp',
        kind: 'song',
      });
    });

    it('no track, empty record', () => {
      expect(M._nativeMeta(letterUrl('genesis-1'))).toEqual({ title: '', artist: '', album: '' });
    });
  });

  describe('__votMediaCommand', () => {
    /** @returns {any} */
    const command = () => {
      const track = letterTrack();
      playingState(track);
      M._mediaSession(track);
      return h.g.__votMediaCommand;
    };

    it('installs with the session', () => {
      expect(h.g.__votMediaCommand).toBeUndefined();
      command();
      expect(typeof h.g.__votMediaCommand).toBe('function');
    });

    it('next, prev and seekTo in seconds', () => {
      const cmd = command();
      cmd('next');
      expect(h.late.next).toHaveBeenCalledTimes(1);
      cmd('prev');
      expect(h.late.prev).toHaveBeenCalledTimes(1);
      cmd('seekTo', 42000);
      expect(h.late.seek).toHaveBeenCalledWith(42);
      cmd('seekTo', undefined);
      expect(h.late.seek).toHaveBeenCalledWith(0);
    });

    it('play only from paused, pause never plays', () => {
      const cmd = command();
      h.state = { ...h.state, status: 'paused' };
      cmd('play');
      expect(h.late.toggle).toHaveBeenCalledTimes(1);
      h.state = { ...h.state, status: 'playing' };
      cmd('play');
      expect(h.late.toggle).toHaveBeenCalledTimes(1);
      cmd('pause');
      expect(h.late.pauseIfPlaying).toHaveBeenCalledTimes(1);
    });

    it('refused is the honest pause, hidden only', () => {
      const cmd = command();
      setHidden(true);
      cmd('refused');
      expect(h.late.pauseIfPlaying).toHaveBeenCalledTimes(1);
      setHidden(false);
      cmd('refused');
      expect(h.late.pauseIfPlaying).toHaveBeenCalledTimes(1);
    });

    it('anything else toggles, and a bad command never throws', () => {
      const cmd = command();
      expect(() => cmd('bogus')).not.toThrow();
      expect(h.late.toggle).toHaveBeenCalledTimes(1);
      expect(() => cmd('seekTo', NaN)).not.toThrow();
      expect(h.late.seek).toHaveBeenCalledWith(0);
    });
  });

  describe('_refreshCardMetadata (via late)', () => {
    it('the import hands the module its refresh hook', () => {
      expect(typeof h.late._refreshCardMetadata).toBe('function');
    });

    it('native re-sends the card through the element', () => {
      const track = { ...letterTrack(), readerCode: 'B' };
      const setMeta = vi.fn();
      h.native = true;
      h.el = { setMeta };
      playingState(track);
      h.late._refreshCardMetadata(track);
      expect(setMeta).toHaveBeenCalledTimes(1);
      expect(setMeta).toHaveBeenCalledWith({
        title: 'Genesis 1',
        artist: 'Read by Benjamin',
        album: '',
        art: '',
        kind: 'spoken',
      });
    });

    it('native skips a track that is not playing', () => {
      const track = letterTrack();
      const setMeta = vi.fn();
      h.native = true;
      h.el = { setMeta };
      playingState(letterTrack('genesis-2'));
      h.late._refreshCardMetadata(track);
      expect(setMeta).not.toHaveBeenCalled();
    });

    it('the web card is re-sent', () => {
      const ms = makeMediaSession();
      installMediaSession(ms);
      const track = compilationTrack();
      h.secKey = 'letter-9';
      h.letterTitleOf.mockReturnValue('The Ninth Letter');
      playingState(track);
      h.lastMeta = null;
      h.late._refreshCardMetadata(track);
      expect(h.lastMeta).toMatchObject({ title: 'The Ninth Letter', album: 'Volume One · Letter 1' });
      expect(ms.metadata).toBeInstanceOf(FakeMediaMetadata);
    });
  });
});

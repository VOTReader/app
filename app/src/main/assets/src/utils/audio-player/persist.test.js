/* audio-player/persist — where the listener was: the per-recording position
   map, the boot snapshot (localStorage plus the durable IDB copy), and the
   paused bar a boot restores. core.js and song-catalog.js are mocked: the
   player's shared state is a plain object the cases set, the positions store
   and the IDB adapter are Map-backed fakes. audio-track.js is REAL — its
   constants (30 s floor, 0.97 tail, 5 s rewind) and its track normalizer are
   part of what these tests pin, so the fixtures use real VOT audio URLs. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: /** @type {any} */ ({ status: 'idle', queue: [], qi: 0, time: 0, duration: 0, repeat: 'off', shuffle: false }),
  source: /** @type {any} */ (null),
  pendingRestore: /** @type {any} */ (null),
  g: /** @type {any} */ ({ IDBAdapter: null }),
  idb: /** @type {any} */ (null),
  positions: /** @type {any} */ (null),
  posMap: /** @type {Map<string, any>} */ (new Map()),
  idbMap: /** @type {Map<string, any>} */ (new Map()),
  posStore: {
    setPosition: vi.fn((/** @type {any} */ track, /** @type {number} */ t, /** @type {number} */ d) => {
      h.posMap.set(track.url, { t, d, at: Date.now() });
    }),
    getPosition: vi.fn((/** @type {string} */ url) => h.posMap.get(url)),
    clearPosition: vi.fn((/** @type {string} */ url) => { h.posMap.delete(url); }),
  },
  idbAdapter: {
    put: vi.fn((/** @type {string} */ _store, /** @type {string} */ key, /** @type {any} */ value) => {
      h.idbMap.set(key, value);
      return Promise.resolve();
    }),
    get: vi.fn((/** @type {string} */ _store, /** @type {string} */ key) => (
      Promise.resolve(h.idbMap.has(key) ? h.idbMap.get(key) : null)
    )),
    delete: vi.fn((/** @type {string} */ _store, /** @type {string} */ key) => {
      h.idbMap.delete(key);
      return Promise.resolve();
    }),
  },
  notify: vi.fn(),
  followLibraryRate: vi.fn(),
  setPendingRestore: vi.fn((v) => { h.pendingRestore = v || null; }),
  loadSongCatalog: vi.fn(() => Promise.resolve()),
}));

vi.mock('./core.js', () => ({
  get _state() { return h.state; },
  get _source() { return h.source; },
  get _pendingRestore() { return h.pendingRestore; },
  _g: () => h.g,
  _positions: () => h.positions,
  _isSong: (/** @type {any} */ t) => !!t && typeof t.key === 'string' && t.key.indexOf('song:') === 0,
  _notify: h.notify,
  _followLibraryRate: h.followLibraryRate,
  _setPendingRestore: h.setPendingRestore,
}));

vi.mock('../song-catalog.js', () => ({
  cleanDownIds: (/** @type {unknown} */ d) => (
    Array.isArray(d) ? new Set(d) : (d instanceof Set ? d : null)
  ),
  cleanSongSwaps: (/** @type {unknown} */ s) => (
    s && typeof s === 'object' && !Array.isArray(s) ? s : null
  ),
  loadSongCatalog: h.loadSongCatalog,
  normalizeSongFilter: (/** @type {unknown} */ f) => (f ?? null),
}));

/** @type {typeof import('./persist.js')} */
let P;

const letterUrl = (/** @type {string} */ id) => (
  `https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/${id}.mp3`
);
const letterTrack = (/** @type {string} */ id = 'genesis-1') => (
  { key: id, url: letterUrl(id), title: 'Genesis 1', sub: null, readerCode: '', partLabel: null }
);
const songId = (/** @type {number} */ n) => n.toString(16).padStart(12, '0');
const songUrl = (/** @type {string} */ id) => `https://votreader.github.io/songs-1/${id}.mp3`;
const songTrack = (/** @type {string} */ id) => ({ key: 'song:' + id, url: songUrl(id), title: 'Song ' + id, sub: null, readerCode: '', partLabel: null });
const letterSource = (/** @type {any} */ over = {}) => (
  { mode: 'letter', volKey: 'v1', label: 'Letter 1', ...over }
);
const songsSource = (/** @type {any} */ over = {}) => (
  { mode: 'songs', volKey: '', label: 'Songs', ids: [songId(1), songId(2)], startKey: 'song:' + songId(1), seed: 7, shuffle: true, ...over }
);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  P = await import('./persist.js');
  h.state = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0, repeat: 'off', shuffle: false };
  h.source = null;
  h.pendingRestore = null;
  h.posMap = new Map();
  h.idbMap = new Map();
  h.idb = h.idbAdapter;
  h.g = { IDBAdapter: h.idb };
  h.positions = h.posStore;
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('audio-player persist', () => {
  describe('_resumeAt', () => {
    it('returns 0 with no positions store', () => {
      h.positions = null;
      expect(P._resumeAt(letterTrack())).toBe(0);
    });

    it('returns 0 when nothing is remembered', () => {
      expect(P._resumeAt(letterTrack())).toBe(0);
    });

    it('returns 0 for a track with no url, and for no track', () => {
      expect(P._resumeAt(null)).toBe(0);
      expect(P._resumeAt(/** @type {any} */ ({ key: 'x' }))).toBe(0);
    });

    it('refuses a position under the 30 s floor', () => {
      h.posMap.set(letterUrl('genesis-1'), { t: 10, d: 300, at: 1 });
      expect(P._resumeAt(letterTrack())).toBe(0);
    });

    it('resumes from the floor with an unknown length, minus the rewind', () => {
      h.posMap.set(letterUrl('genesis-1'), { t: 30, d: 0, at: 1 });
      expect(P._resumeAt(letterTrack())).toBe(25);
    });

    it('rewinds 5 s from a mid-recording position', () => {
      h.posMap.set(letterUrl('genesis-1'), { t: 100, d: 300, at: 1 });
      expect(P._resumeAt(letterTrack())).toBe(95);
    });

    it('reads the tail as finished, not as a place to return to', () => {
      h.posMap.set(letterUrl('genesis-1'), { t: 97, d: 100, at: 1 });
      expect(P._resumeAt(letterTrack())).toBe(0);
    });

    it('just short of the tail still resumes', () => {
      h.posMap.set(letterUrl('genesis-1'), { t: 96.9, d: 100, at: 1 });
      expect(P._resumeAt(letterTrack())).toBe(91.9);
    });

    it('a recording barely longer than the floor can resume at its floor', () => {
      h.posMap.set(letterUrl('genesis-1'), { t: 30, d: 31, at: 1 });
      expect(P._resumeAt(letterTrack())).toBe(25);
      h.posMap.set(letterUrl('genesis-1'), { t: 30, d: 30, at: 1 });
      expect(P._resumeAt(letterTrack())).toBe(0);
    });

    it('a song never resumes from the map', () => {
      const id = songId(1);
      h.posMap.set(songUrl(id), { t: 100, d: 180, at: 1 });
      expect(P._resumeAt(songTrack(id))).toBe(0);
    });

    it('a throwing store reads as no resume, not a crash', () => {
      h.posStore.getPosition.mockImplementationOnce(() => { throw new Error('idb gone'); });
      expect(P._resumeAt(letterTrack())).toBe(0);
    });

    it('coerces string clocks and lengths', () => {
      h.posMap.set(letterUrl('genesis-1'), { t: '100', d: '300', at: 1 });
      expect(P._resumeAt(letterTrack())).toBe(95);
    });
  });

  describe('_rememberCurrentPosition and _rememberOutgoingPosition', () => {
    it('stores a resumable position with its duration', () => {
      h.state = { ...h.state, queue: [letterTrack()], qi: 0, time: 45, duration: 120 };
      P._rememberCurrentPosition(false);
      expect(h.posStore.setPosition).toHaveBeenCalledWith(letterTrack(), 45, 120);
      expect(h.posMap.get(letterUrl('genesis-1'))).toMatchObject({ t: 45, d: 120 });
    });

    it('never stores a position under the floor, including zero', () => {
      h.state = { ...h.state, queue: [letterTrack()], qi: 0, time: 10, duration: 120 };
      P._rememberCurrentPosition(true);
      h.state = { ...h.state, time: 0 };
      P._rememberCurrentPosition(true);
      expect(h.posStore.setPosition).not.toHaveBeenCalled();
    });

    it('never stores a song position', () => {
      const id = songId(1);
      h.state = { ...h.state, queue: [songTrack(id)], qi: 0, time: 100, duration: 180 };
      P._rememberCurrentPosition(true);
      expect(h.posStore.setPosition).not.toHaveBeenCalled();
    });

    it('never stores with no track or no url', () => {
      h.state = { ...h.state, queue: [], qi: 0, time: 100, duration: 120 };
      P._rememberCurrentPosition(true);
      h.state = { ...h.state, queue: [{ key: 'x' }], qi: 0 };
      P._rememberCurrentPosition(true);
      expect(h.posStore.setPosition).not.toHaveBeenCalled();
    });

    it('throttles to one write a second unless forced', () => {
      h.state = { ...h.state, queue: [letterTrack()], qi: 0, time: 45, duration: 120 };
      P._rememberCurrentPosition(false);
      P._rememberCurrentPosition(false);
      expect(h.posStore.setPosition).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(999);
      P._rememberCurrentPosition(false);
      expect(h.posStore.setPosition).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      P._rememberCurrentPosition(false);
      expect(h.posStore.setPosition).toHaveBeenCalledTimes(2);
    });

    it('force bypasses the throttle at a deliberate boundary', () => {
      h.state = { ...h.state, queue: [letterTrack()], qi: 0, time: 45, duration: 120 };
      P._rememberCurrentPosition(false);
      P._rememberCurrentPosition(true);
      expect(h.posStore.setPosition).toHaveBeenCalledTimes(2);
    });

    it('the outgoing position is always forced', () => {
      h.state = { ...h.state, queue: [letterTrack()], qi: 0, time: 45, duration: 120 };
      P._rememberCurrentPosition(false);
      P._rememberOutgoingPosition();
      expect(h.posStore.setPosition).toHaveBeenCalledTimes(2);
    });

    it('never writes back the position of a track heard to its end', () => {
      const a = letterTrack('genesis-1');
      const b = letterTrack('genesis-2');
      P._setFinishedUrl(a.url);
      h.state = { ...h.state, queue: [a, b], qi: 0, time: 100, duration: 120 };
      P._rememberCurrentPosition(true);
      expect(h.posStore.setPosition).not.toHaveBeenCalled();
      h.state = { ...h.state, qi: 1 };
      P._rememberCurrentPosition(true);
      expect(h.posStore.setPosition).toHaveBeenCalledWith(b, 100, 120);
    });

    it('a missing store is a no-op, and a throwing store never blocks playback', () => {
      h.positions = null;
      h.state = { ...h.state, queue: [letterTrack()], qi: 0, time: 45, duration: 120 };
      expect(() => P._rememberCurrentPosition(true)).not.toThrow();
      h.positions = h.posStore;
      h.posStore.setPosition.mockImplementationOnce(() => { throw new Error('idb gone'); });
      expect(() => P._rememberCurrentPosition(true)).not.toThrow();
    });
  });

  describe('_forgetPosition', () => {
    it('clears the url’s record', () => {
      h.posMap.set(letterUrl('genesis-1'), { t: 100, d: 300, at: 1 });
      P._forgetPosition(letterUrl('genesis-1'));
      expect(h.posMap.has(letterUrl('genesis-1'))).toBe(false);
    });

    it('a null url or a missing store is a no-op', () => {
      expect(() => P._forgetPosition(null)).not.toThrow();
      h.positions = null;
      expect(() => P._forgetPosition(letterUrl('genesis-1'))).not.toThrow();
    });

    it('a throwing store never blocks the caller', () => {
      h.posStore.clearPosition.mockImplementationOnce(() => { throw new Error('idb gone'); });
      expect(() => P._forgetPosition(letterUrl('genesis-1'))).not.toThrow();
    });
  });

  describe('_persist and the boot snapshot', () => {
    it('writes the v2 snapshot to localStorage and the durable copy', () => {
      const a = letterTrack('genesis-1');
      const b = letterTrack('genesis-2');
      h.source = letterSource();
      h.state = { ...h.state, status: 'playing', queue: [a, b], qi: 1, time: 12.3456, duration: 200 };
      P._persist();
      const raw = localStorage.getItem('vot-audio-pos');
      expect(raw).not.toBeNull();
      const s = JSON.parse(/** @type {string} */ (raw));
      expect(s).toMatchObject({
        v: 2, mode: 'letter', volKey: 'v1', label: 'Letter 1',
        qi: 1, key: 'genesis-2', time: 12.346, track: { key: 'genesis-2', url: letterUrl('genesis-2') },
      });
      expect(typeof s.at).toBe('number');
      expect(h.idbAdapter.put).toHaveBeenCalledWith('meta', 'audio-snapshot', expect.objectContaining({ v: 2, key: 'genesis-2' }));
    });

    it('writes nothing with no source or no track', () => {
      h.state = { ...h.state, queue: [letterTrack()], qi: 0, time: 10, duration: 120 };
      P._persist();
      expect(localStorage.getItem('vot-audio-pos')).toBeNull();
      h.source = letterSource();
      h.state = { ...h.state, queue: [], qi: 0 };
      P._persist();
      expect(localStorage.getItem('vot-audio-pos')).toBeNull();
      expect(h.idbAdapter.put).not.toHaveBeenCalled();
    });

    it('advances past a finished recording instead of naming it', () => {
      const a = letterTrack('genesis-1');
      const b = letterTrack('genesis-2');
      P._setFinishedUrl(a.url);
      h.source = letterSource();
      h.state = { ...h.state, status: 'playing', queue: [a, b], qi: 0, time: 100, duration: 120 };
      P._persist();
      const s = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-audio-pos')));
      expect(s.qi).toBe(1);
      expect(s.key).toBe('genesis-2');
      expect(s.time).toBe(0);
    });

    it('clearing the last finished recording clears both copies', () => {
      const a = letterTrack('genesis-1');
      P._setFinishedUrl(a.url);
      h.source = letterSource();
      h.state = { ...h.state, status: 'playing', queue: [a], qi: 0, time: 100, duration: 120 };
      localStorage.setItem('vot-audio-pos', JSON.stringify({ v: 2 }));
      h.idbMap.set('audio-snapshot', { v: 2 });
      P._persist();
      expect(localStorage.getItem('vot-audio-pos')).toBeNull();
      expect(h.idbAdapter.delete).toHaveBeenCalledWith('meta', 'audio-snapshot');
      expect(h.posStore.setPosition).not.toHaveBeenCalled();
    });

    it('a pending restore keeps the finished guard from firing', () => {
      const a = letterTrack('genesis-1');
      P._setFinishedUrl(a.url);
      h.pendingRestore = { mode: 'letter', volKey: 'v1', label: 'Letter 1', qi: 0, key: 'genesis-1' };
      h.source = letterSource();
      h.state = { ...h.state, status: 'paused', queue: [a], qi: 0, time: 40, duration: 120 };
      P._persist();
      const raw = localStorage.getItem('vot-audio-pos');
      expect(raw).not.toBeNull();
      expect(JSON.parse(/** @type {string} */ (raw)).key).toBe('genesis-1');
    });

    it('a songs snapshot keeps the descriptor, never the queue', () => {
      const id1 = songId(1);
      const id2 = songId(2);
      h.source = songsSource();
      h.state = { ...h.state, status: 'playing', queue: [songTrack(id1), songTrack(id2)], qi: 0, time: 45, duration: 180, repeat: 'all' };
      P._persist();
      const s = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-audio-pos')));
      expect(s).toMatchObject({
        v: 2, mode: 'songs', qi: 0, key: 'song:' + id1, time: 45,
        startKey: 'song:' + id1, seed: 7, shuffle: true, repeat: 'all',
      });
      expect(s.ids).toEqual([id1, id2]);
      expect(s.track).toMatchObject({ key: 'song:' + id1, url: songUrl(id1) });
    });

    it('an ids list past 1000 persists the window from the playing song', () => {
      const ids = Array.from({ length: 1005 }, (_, i) => songId(i));
      const at = songId(10);
      h.source = songsSource({ ids, startKey: 'song:' + songId(0) });
      h.state = { ...h.state, status: 'playing', queue: [songTrack(at)], qi: 0, time: 45, duration: 180 };
      P._persist();
      const s = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-audio-pos')));
      expect(s.ids).toHaveLength(995);
      expect(s.ids[0]).toBe(at);
      expect(s.ids[994]).toBe(songId(1004));
      expect(s.startKey).toBeUndefined();
      expect(s.qi).toBe(0);
    });

    it('a custom snapshot saves the normalized queue', () => {
      const a = letterTrack('genesis-1');
      const b = letterTrack('genesis-2');
      h.source = { mode: 'custom', volKey: '', label: 'Custom' };
      h.state = { ...h.state, status: 'playing', queue: [a, b], qi: 1, time: 20, duration: 120 };
      P._persist();
      const s = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-audio-pos')));
      expect(s.mode).toBe('custom');
      expect(s.qi).toBe(1);
      expect(s.customQueue).toHaveLength(2);
      expect(s.customQueue[0]).toMatchObject({ key: 'genesis-1', url: letterUrl('genesis-1') });
    });
  });

  describe('_persistDurableOnly and _clearPersist', () => {
    it('writes only the durable copy, never localStorage', () => {
      h.source = letterSource();
      h.state = { ...h.state, status: 'playing', queue: [letterTrack()], qi: 0, time: 40, duration: 120 };
      P._persistDurableOnly();
      expect(localStorage.getItem('vot-audio-pos')).toBeNull();
      expect(h.idbAdapter.put).toHaveBeenCalledWith('meta', 'audio-snapshot', expect.objectContaining({ v: 2 }));
    });

    it('_persistDurableOnly writes nothing when the snapshot would clear', () => {
      const a = letterTrack('genesis-1');
      P._setFinishedUrl(a.url);
      h.source = letterSource();
      h.state = { ...h.state, status: 'playing', queue: [a], qi: 0, time: 100, duration: 120 };
      P._persistDurableOnly();
      expect(h.idbAdapter.put).not.toHaveBeenCalled();
    });

    it('_clearPersist removes both copies', () => {
      localStorage.setItem('vot-audio-pos', JSON.stringify({ v: 2 }));
      h.idbMap.set('audio-snapshot', { v: 2 });
      P._clearPersist();
      expect(localStorage.getItem('vot-audio-pos')).toBeNull();
      expect(h.idbAdapter.delete).toHaveBeenCalledWith('meta', 'audio-snapshot');
    });

    it('_clearPersist with no IDB bridge still clears localStorage', () => {
      localStorage.setItem('vot-audio-pos', JSON.stringify({ v: 2 }));
      h.g = { IDBAdapter: null };
      P._clearPersist();
      expect(localStorage.getItem('vot-audio-pos')).toBeNull();
      expect(h.idbAdapter.delete).not.toHaveBeenCalled();
    });
  });

  describe('_adoptDurableSnapshot', () => {
    const durableRec = () => ({
      v: 2, mode: 'letter', volKey: 'v1', label: 'Letter 1', qi: 0,
      key: 'genesis-1', time: 40, track: letterTrack('genesis-1'), at: 500,
    });

    it('adopts the durable copy onto an idle bar', async () => {
      h.idbMap.set('audio-snapshot', durableRec());
      await P._adoptDurableSnapshot();
      expect(h.pendingRestore).toMatchObject({ mode: 'letter', time: 40 });
      expect(h.state.status).toBe('paused');
      expect(h.state.queue).toHaveLength(1);
      expect(h.notify).toHaveBeenCalled();
    });

    it('does nothing with no IDB bridge or no record', async () => {
      h.g = { IDBAdapter: null };
      await P._adoptDurableSnapshot();
      await flush();
      h.g = { IDBAdapter: h.idb };
      await P._adoptDurableSnapshot();
      expect(h.pendingRestore).toBeNull();
      expect(h.notify).not.toHaveBeenCalled();
    });

    it('does nothing for a record without a stamp', async () => {
      h.idbMap.set('audio-snapshot', { v: 2, mode: 'letter', track: letterTrack() });
      await P._adoptDurableSnapshot();
      expect(h.pendingRestore).toBeNull();
      h.idbMap.set('audio-snapshot', null);
      await P._adoptDurableSnapshot();
      expect(h.pendingRestore).toBeNull();
    });

    it('does not adopt over a live session', async () => {
      h.idbMap.set('audio-snapshot', durableRec());
      h.state = { ...h.state, status: 'playing', queue: [letterTrack()], qi: 0, time: 10 };
      await P._adoptDurableSnapshot();
      expect(h.pendingRestore).toBeNull();
      expect(h.notify).not.toHaveBeenCalled();
    });

    it('does not adopt an older durable copy over a newer localStorage one', async () => {
      const lsRec = { ...durableRec(), time: 60, at: 1000 };
      localStorage.setItem('vot-audio-pos', JSON.stringify(lsRec));
      P._restoreFromSaved();
      expect(h.pendingRestore.time).toBe(60);
      vi.clearAllMocks();
      h.idbMap.set('audio-snapshot', durableRec());
      await P._adoptDurableSnapshot();
      expect(h.pendingRestore.time).toBe(60);
      expect(h.notify).not.toHaveBeenCalled();
    });

    it('a throwing IDB read is a no-op', async () => {
      h.idbAdapter.get.mockImplementationOnce(() => Promise.reject(new Error('idb gone')));
      await expect(P._adoptDurableSnapshot()).resolves.toBeUndefined();
      expect(h.pendingRestore).toBeNull();
    });
  });

  describe('_undoSnapshot and _applyUndoSnapshot', () => {
    it('hands back the record a reload would restore', () => {
      h.source = letterSource();
      h.state = { ...h.state, status: 'playing', queue: [letterTrack()], qi: 0, time: 40, duration: 120 };
      const snap = P._undoSnapshot();
      expect(snap).toMatchObject({ v: 2, mode: 'letter', key: 'genesis-1', time: 40 });
    });

    it('returns null with nothing to bring back, or when the snapshot clears', () => {
      expect(P._undoSnapshot()).toBeNull();
      const a = letterTrack('genesis-1');
      P._setFinishedUrl(a.url);
      h.source = letterSource();
      h.state = { ...h.state, status: 'playing', queue: [a], qi: 0, time: 100, duration: 120 };
      expect(P._undoSnapshot()).toBeNull();
    });

    it('applies a good undo record back onto the bar', () => {
      const rec = {
        v: 2, mode: 'letter', volKey: 'v1', label: 'Letter 1', qi: 0,
        key: 'genesis-1', time: 40, track: letterTrack('genesis-1'), at: 500,
      };
      expect(P._applyUndoSnapshot(rec)).toBe(true);
      expect(h.pendingRestore).toMatchObject({ mode: 'letter', time: 40 });
      expect(h.state.status).toBe('paused');
    });

    it('refuses a bad undo record', () => {
      const rec = {
        v: 3, mode: 'letter', volKey: 'v1', label: 'Letter 1', qi: 0,
        key: 'genesis-1', time: 40, track: letterTrack('genesis-1'), at: 500,
      };
      expect(P._applyUndoSnapshot(rec)).toBe(false);
      expect(h.pendingRestore).toBeNull();
    });
  });

  describe('_restoreFromSaved', () => {
    const letterRec = (/** @type {any} */ over = {}) => ({
      v: 2, mode: 'letter', volKey: 'v1', label: 'Letter 1', qi: 2,
      key: 'genesis-1', time: 45.5, track: letterTrack('genesis-1'), at: 123456, ...over,
    });

    it('restores the bar paused at the saved place', () => {
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec()));
      P._restoreFromSaved();
      expect(h.pendingRestore).toMatchObject({
        mode: 'letter', volKey: 'v1', label: 'Letter 1', qi: 2,
        key: 'genesis-1', url: letterUrl('genesis-1'), time: 45.5,
        queue: [], startKey: null, startIndex: null, startPartIndex: null,
        portion: false, filter: null, one: false, seed: 0, shuffle: false, ids: null,
      });
      expect(h.state.status).toBe('paused');
      expect(h.state.queue).toHaveLength(1);
      expect(h.state.queue[0]).toMatchObject({ key: 'genesis-1', url: letterUrl('genesis-1') });
      expect(h.state.qi).toBe(0);
      expect(h.state.time).toBe(45.5);
      expect(h.state.duration).toBe(0);
      expect(h.notify).toHaveBeenCalled();
      expect(h.followLibraryRate).toHaveBeenCalled();
    });

    it('accepts a legacy v1 snapshot', () => {
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({ v: 1 })));
      P._restoreFromSaved();
      expect(h.pendingRestore).toMatchObject({ mode: 'letter', time: 45.5 });
    });

    it('refuses an unknown version or an unknown mode', () => {
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({ v: 3 })));
      P._restoreFromSaved();
      expect(h.pendingRestore).toBeNull();
      expect(h.state.status).toBe('idle');
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({ mode: 'podcast' })));
      P._restoreFromSaved();
      expect(h.pendingRestore).toBeNull();
    });

    it('refuses a songs snapshot naming a letter track', () => {
      const id = songId(1);
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({
        mode: 'songs', track: letterTrack('genesis-1'), ids: [id],
      })));
      P._restoreFromSaved();
      expect(h.pendingRestore).toBeNull();
    });

    it('restores a songs snapshot and starts the catalog on its way', () => {
      const id = songId(1);
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({
        mode: 'songs', track: songTrack(id), ids: [id, songId(2)],
        seed: 9, shuffle: true, repeat: 'one', key: 'song:' + id,
      })));
      P._restoreFromSaved();
      expect(h.pendingRestore).toMatchObject({
        mode: 'songs', seed: 9, shuffle: true, ids: [id, songId(2)],
      });
      expect(h.loadSongCatalog).toHaveBeenCalled();
      expect(h.state.repeat).toBe('one');
      expect(h.state.shuffle).toBe(true);
    });

    it('a songs snapshot with repeat all keeps repeat all; a letter one does not', () => {
      const id = songId(1);
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({
        mode: 'songs', track: songTrack(id), ids: [id], repeat: 'all', key: 'song:' + id,
      })));
      P._restoreFromSaved();
      expect(h.state.repeat).toBe('all');
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({ repeat: 'one' })));
      P._restoreFromSaved();
      expect(h.state.repeat).toBe('off');
    });

    it('a songs snapshot trims ids past 1000', () => {
      const id = songId(1);
      const ids = Array.from({ length: 1005 }, (_, i) => songId(i));
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({
        mode: 'songs', track: songTrack(id), ids, key: 'song:' + id,
      })));
      P._restoreFromSaved();
      expect(h.pendingRestore.ids).toHaveLength(1000);
    });

    it('a custom snapshot with no queue is refused; with one it restores', () => {
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({
        mode: 'custom', customQueue: [], track: letterTrack('genesis-1'),
      })));
      P._restoreFromSaved();
      expect(h.pendingRestore).toBeNull();
      const a = letterTrack('genesis-1');
      const b = letterTrack('genesis-2');
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({
        mode: 'custom', customQueue: [a, b], track: b, key: 'genesis-2', qi: 1, time: 20,
      })));
      P._restoreFromSaved();
      expect(h.pendingRestore).toMatchObject({ mode: 'custom', qi: 1, time: 20 });
      expect(h.pendingRestore.queue).toHaveLength(2);
    });

    it('clamps a negative time and qi, floors a fractional qi', () => {
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({ time: -5, qi: 2.7 })));
      P._restoreFromSaved();
      expect(h.pendingRestore.time).toBe(0);
      expect(h.pendingRestore.qi).toBe(2);
      expect(h.state.time).toBe(0);
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({ qi: -3 })));
      P._restoreFromSaved();
      expect(h.pendingRestore.qi).toBe(0);
    });

    it('a part index of 0 means no part horizon; a later part keeps its number', () => {
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({ startPartIndex: 0 })));
      P._restoreFromSaved();
      expect(h.pendingRestore.startPartIndex).toBeNull();
      localStorage.setItem('vot-audio-pos', JSON.stringify(letterRec({ startPartIndex: 2 })));
      P._restoreFromSaved();
      expect(h.pendingRestore.startPartIndex).toBe(2);
    });

    it('no saved record and bad JSON are both quiet no-ops', () => {
      P._restoreFromSaved();
      expect(h.pendingRestore).toBeNull();
      localStorage.setItem('vot-audio-pos', '{not json');
      expect(() => P._restoreFromSaved()).not.toThrow();
      expect(h.pendingRestore).toBeNull();
      localStorage.setItem('vot-audio-pos', JSON.stringify({ v: 2, mode: 'letter' }));
      expect(() => P._restoreFromSaved()).not.toThrow();
      expect(h.pendingRestore).toBeNull();
    });
  });

  describe('module setters', () => {
    it('_setLastPersistSec writes the module binding', () => {
      P._setLastPersistSec(42);
      expect(P._lastPersistSec).toBe(42);
    });
  });
});

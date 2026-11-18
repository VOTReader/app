/* audio-player/songs — Songs of the Letters queues: playSongs, shuffle,
   repeat, a version switch. core.js and every sibling module are mocked: the
   player's shared state is a plain object the cases set, and the engine /
   persist / credit / offline verbs are spies. audio-track.js is REAL — the
   tests pin the real 12-hex song ids and the real songIdOfKey. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  el: /** @type {any} */ (null),
  native: false,
  pendingRestore: /** @type {any} */ (null),
  source: /** @type {any} */ (null),
  downIds: /** @type {string[]} */ ([]),
  filterSongs: /** @type {any[]} */ ([]),
  songsById: /** @type {any} */ ({}),
  offlineRefuses: false,
  state: /** @type {any} */ ({ status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, loop: null, failed: null, repeat: 'off' }),
  late: /** @type {any} */ ({}),
  songUrl: (/** @type {string} */ id) => 'https://cdn.example/songs/' + id + '.mp3',
  notify: vi.fn(),
  setPendingRestore: vi.fn((v) => { h.pendingRestore = v || null; }),
  setSource: vi.fn((v) => { h.source = v; }),
  countPlay: vi.fn(),
  setSongSkips: vi.fn(),
  start: vi.fn(),
  syncMediaSessionActions: vi.fn(),
  offlineNotice: vi.fn(),
  forgetPosition: vi.fn(),
  persist: vi.fn(),
  rememberOutgoingPosition: vi.fn(),
  setLastPersistSec: vi.fn(),
  seededShuffle: vi.fn((/** @type {string[]} */ ids) => [...ids].reverse()),
  weightedShuffle: vi.fn((/** @type {string[]} */ ids, /** @type {number} */ seed, /** @type {(id: string) => boolean} */ pred) => { void seed; return [...ids].sort((a, b) => Number(pred(a)) - Number(pred(b))); }),
}));

vi.mock('./core.js', () => ({
  get _el() { return h.el; },
  get _native() { return h.native; },
  get _pendingRestore() { return h.pendingRestore; },
  get _source() { return h.source; },
  get _state() { return h.state; },
  _isSong: (/** @type {any} */ t) => !!t && typeof t.key === 'string' && t.key.startsWith('song:'),
  late: h.late,
  _notify: h.notify,
  _setPendingRestore: h.setPendingRestore,
  _setSource: h.setSource,
}));

vi.mock('./catalog.js', () => ({
  _songTracks: (/** @type {any[]} */ songs) => songs.map((s) => ({
    key: s.key || 'song:' + s.id, url: s.url || h.songUrl(s.id), title: s.title || s.id, sub: '',
  })),
}));

vi.mock('../song-catalog.js', () => ({
  cleanSongSwaps: (/** @type {any} */ s) => s || null,
  normalizeSongFilter: (/** @type {any} */ f) => f || {},
  seededShuffle: h.seededShuffle,
  songById: (/** @type {string} */ id) => h.songsById[id] || null,
  songQueue: (/** @type {any} */ desc) => {
    if (desc.ids) {
      return desc.ids.map((/** @type {string} */ id) => ({
        id, f: 'fam-' + id.slice(0, 2), key: 'song:' + id, url: h.songUrl(id), title: 'Song ' + id,
      }));
    }
    const list = h.filterSongs.map((s) => ({ ...s }));
    if (desc.startKey) {
      const i = list.findIndex((s) => s.key === desc.startKey);
      if (i > 0) { const [first] = list.splice(i, 1); list.unshift(first); }
    }
    return list;
  },
  weightedShuffle: h.weightedShuffle,
}));

vi.mock('../song-votes.js', () => ({ downVotedIds: () => h.downIds }));

vi.mock('./credit.js', () => ({ _countPlay: h.countPlay }));

vi.mock('./engine.js', () => ({ _setSongSkips: h.setSongSkips, _start: h.start }));

vi.mock('./media-session.js', () => ({ _syncMediaSessionActions: h.syncMediaSessionActions }));

vi.mock('./offline.js', () => ({ _offlineNotice: h.offlineNotice, _offlineRefuses: () => h.offlineRefuses }));

vi.mock('./persist.js', () => ({
  _forgetPosition: h.forgetPosition,
  _persist: h.persist,
  _rememberOutgoingPosition: h.rememberOutgoingPosition,
  _setLastPersistSec: h.setLastPersistSec,
}));

/** @type {typeof import('./songs.js')} */
let S;

const A = 'abcdef123456';
const B = '0123456789ab';
const C = 'fedcba987654';
const D = '111111111111';
const E = '222222222222';

const songTrack = (/** @type {string} */ id) => ({
  key: 'song:' + id, url: h.songUrl(id), title: 'Song ' + id, sub: '',
});
const songObj = (/** @type {string} */ id, /** @type {string} */ fam) => ({
  id, f: fam, key: 'song:' + id, url: h.songUrl(id), title: 'Song ' + id,
});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  // late is a plain object the mock factory hands out by reference: mutate it
  // in place, never reassign it, or the module keeps the old one.
  Object.keys(h.late).forEach((k) => delete h.late[k]);
  Object.assign(h.late, {
    _rebuildRestoredQueue: vi.fn(() => { h.pendingRestore = null; return Promise.resolve(true); }),
  });
  S = await import('./songs.js');
  h.el = null;
  h.native = false;
  h.pendingRestore = null;
  h.source = null;
  h.downIds = [];
  h.filterSongs = [songObj(A, 'fam-ab'), songObj(B, 'fam-01'), songObj(C, 'fam-fe')];
  h.songsById = {
    [A]: { id: A, f: 'fam-ab' },
    [B]: { id: B, f: 'fam-01' },
    [C]: { id: C, f: 'fam-fe' },
    [D]: { id: D, f: 'fam-ab' },
    [E]: { id: E, f: 'fam-01' },
  };
  h.offlineRefuses = false;
  h.state = { status: 'playing', queue: [], qi: 0, time: 0, duration: 0, rate: 1, loop: null, failed: null, repeat: 'off' };
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('audio-player songs', () => {
  it('playSongs with explicit ids starts them in order', () => {
    expect(S.playSongs({ ids: [A, B] })).toBe(true);
    expect(h.setSongSkips).toHaveBeenCalledWith(0);
    expect(h.state.queue.map((/** @type {any} */ t) => t.key)).toEqual(['song:' + A, 'song:' + B]);
    expect(h.state.qi).toBe(0);
    expect(h.source.mode).toBe('songs');
    expect(h.source.label).toBe('Songs of the Letters');
    expect(h.source.ids).toEqual([A, B]);
    expect(h.countPlay).toHaveBeenCalledTimes(1);
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it('playSongs filters non-song ids and caps the list at 1000', () => {
    expect(S.playSongs({ ids: [A, 'not-an-id', B] })).toBe(true);
    expect(h.state.queue).toHaveLength(2);
    const many = Array.from({ length: 1001 }, (_, i) => String(i).padStart(12, '0').slice(0, 12).replace(/[^0-9a-f]/g, 'a'));
    // 1001 twelve-hex ids: the first 1000 start, the last is dropped.
    expect(S.playSongs({ ids: many })).toBe(true);
    expect(h.state.queue).toHaveLength(1000);
  });

  it('playSongs shuffles with the start song first, in the seeded order', () => {
    expect(S.playSongs({ ids: [A, B, C], shuffle: true, seed: 7, startId: B })).toBe(true);
    // rest [A, C] reversed by the seeded-shuffle mock, after the start song.
    expect(h.state.queue.map((/** @type {any} */ t) => t.key)).toEqual(['song:' + B, 'song:' + C, 'song:' + A]);
    expect(h.source.seed).toBe(7);
    expect(h.source.shuffle).toBe(true);
    // The explicit list is shuffled here, not in the catalog mock.
    expect(h.seededShuffle).toHaveBeenCalled();
    expect(h.weightedShuffle).not.toHaveBeenCalled();
  });

  it('playSongs shuffles down-voted songs less on an explicit list', () => {
    h.downIds = [A];
    expect(S.playSongs({ ids: [A, B, C], shuffle: true, seed: 7, startId: B })).toBe(true);
    expect(h.weightedShuffle).toHaveBeenCalled();
    expect(h.seededShuffle).not.toHaveBeenCalled();
    const pred = h.weightedShuffle.mock.calls[0][2];
    expect(pred(A)).toBe(true);
    expect(pred(C)).toBe(false);
    // The weighted order puts the down-voted song last among the rest.
    expect(h.state.queue.map((/** @type {any} */ t) => t.key)).toEqual(['song:' + B, 'song:' + C, 'song:' + A]);
  });

  it('playSongs from a filter defaults one-per-family to the shuffle flag', () => {
    expect(S.playSongs({ filter: { col: 'x' } })).toBe(true);
    expect(h.source.filter).toEqual({ col: 'x' });
    expect(h.source.one).toBe(false);
    expect(h.source.seed).toBe(0);
    expect(h.source.startKey).toBeNull();
    expect(h.state.queue).toHaveLength(3);
  });

  it('playSongs from a filter with shuffle defaults to one-per-family and records the down votes', () => {
    h.downIds = [A];
    expect(S.playSongs({ filter: {}, shuffle: true, seed: 3 })).toBe(true);
    expect(h.source.one).toBe(true);
    expect(h.source.down).toEqual([A]);
  });

  it('playSongs with no down votes uses the plain seeded shuffle', () => {
    expect(S.playSongs({ filter: {}, shuffle: true, seed: 3 })).toBe(true);
    expect(h.source.down).toBeNull();
  });

  it('playSongs returns false when nothing matched, and starts nothing', () => {
    h.filterSongs = [];
    expect(S.playSongs({ filter: {} })).toBe(false);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.countPlay).not.toHaveBeenCalled();
  });

  it('playSongs refused offline notifies and starts nothing', () => {
    h.offlineRefuses = true;
    expect(S.playSongs({ ids: [A, B] })).toBe(false);
    expect(h.offlineNotice).toHaveBeenCalledWith(expect.objectContaining({ key: 'song:' + A }));
    expect(h.start).not.toHaveBeenCalled();
    expect(h.countPlay).not.toHaveBeenCalled();
  });

  it('playSongs trims the label, caps it at 120, and defaults it', () => {
    S.playSongs({ ids: [A], label: '  Hi  ' });
    expect(h.source.label).toBe('Hi');
    S.playSongs({ ids: [A], label: 'x'.repeat(150) });
    expect(h.source.label).toHaveLength(120);
    S.playSongs({ ids: [A], label: '   ' });
    expect(h.source.label).toBe('Songs of the Letters');
  });

  it('playSongs draws a nonzero seed when shuffling without one', () => {
    S.playSongs({ filter: {}, shuffle: true });
    expect(Number.isInteger(h.source.seed)).toBe(true);
    expect(h.source.seed).toBeGreaterThan(0);
    expect(h.source.seed).toBeLessThanOrEqual(0xffffffff);
  });

  it('playSongs remembers the outgoing position and clears any pending restore', () => {
    S.playSongs({ ids: [A] });
    expect(h.rememberOutgoingPosition).toHaveBeenCalledTimes(1);
    expect(h.setPendingRestore).toHaveBeenCalledWith(null);
  });

  it('_repeatMode reads the songs source only', () => {
    h.source = { mode: 'songs' };
    h.state.repeat = 'all';
    expect(S._repeatMode()).toBe('all');
    h.source = { mode: 'letters' };
    expect(S._repeatMode()).toBe('off');
    h.source = null;
    expect(S._repeatMode()).toBe('off');
  });

  it('setRepeat sets, persists and notifies only on a change', () => {
    expect(S.setRepeat('one')).toBe('one');
    expect(h.state.repeat).toBe('one');
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(S.setRepeat('one')).toBe('one');
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(S.setRepeat('banana')).toBe('off');
    expect(h.state.repeat).toBe('off');
  });

  it('switchSongVersion refuses a bad id, the same id, and another family', () => {
    h.source = { mode: 'songs', one: true, ids: null };
    h.state.queue = [songTrack(A), songTrack(B)];
    expect(S.switchSongVersion('nope')).toBe(false);
    expect(S.switchSongVersion(A)).toBe(false);
    expect(S.switchSongVersion(C)).toBe(false);
    expect(h.start).not.toHaveBeenCalled();
  });

  it('switchSongVersion refuses when nothing songs is playing', () => {
    h.source = { mode: 'letters' };
    h.state.queue = [songTrack(A)];
    expect(S.switchSongVersion(D)).toBe(false);
    h.source = { mode: 'songs' };
    h.state.queue = [{ key: 'vol1:letter1', url: 'https://cdn.example/vol1.mp3' }];
    expect(S.switchSongVersion(D)).toBe(false);
  });

  it('switchSongVersion on a one-per-family queue records the swap', () => {
    h.source = { mode: 'songs', one: true, ids: null, swaps: null, label: 'Songs of the Letters' };
    h.state.queue = [songTrack(A), songTrack(B)];
    expect(S.switchSongVersion(D)).toBe(true);
    expect(h.state.queue.map((/** @type {any} */ t) => t.key)).toEqual(['song:' + D, 'song:' + B]);
    expect(h.state.qi).toBe(0);
    expect(h.source.swaps).toEqual({ [A]: D });
    expect(h.forgetPosition).toHaveBeenCalledWith(h.songUrl(D));
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.setLastPersistSec).toHaveBeenCalledWith(-1);
    expect(h.persist).toHaveBeenCalledTimes(1);
  });

  it('switchSongVersion back to the original take drops the swap', () => {
    h.source = { mode: 'songs', one: true, ids: null, swaps: { [A]: D } };
    h.state.queue = [songTrack(D), songTrack(B)];
    expect(S.switchSongVersion(A)).toBe(true);
    expect(h.source.swaps).toBeNull();
    expect(h.state.queue[0].key).toBe('song:' + A);
  });

  it('switchSongVersion on an explicit list rewrites the list in place', () => {
    h.source = { mode: 'songs', one: false, ids: [A, B], filter: { col: 'x' }, swaps: { [A]: D } };
    h.state.queue = [songTrack(A), songTrack(B)];
    expect(S.switchSongVersion(D)).toBe(true);
    expect(h.source.ids).toEqual([D, B]);
    expect(h.source.filter).toBeNull();
    expect(h.source.one).toBe(false);
    expect(h.source.swaps).toBeNull();
    expect(h.source.wrap).toBe(false);
    expect(h.source.startKey).toBeNull();
  });

  it('switchSongVersion holds the chosen take once in the queue', () => {
    h.source = { mode: 'songs', one: false, ids: [A, D], filter: null, swaps: null };
    h.state.queue = [songTrack(A), songTrack(D)];
    expect(S.switchSongVersion(D)).toBe(true);
    expect(h.state.queue.map((/** @type {any} */ t) => t.key)).toEqual(['song:' + D]);
    expect(h.state.qi).toBe(0);
  });

  it('switchSongVersion with a pending restore rebuilds, then retries once', async () => {
    h.pendingRestore = { url: h.songUrl(A) };
    h.source = { mode: 'songs', one: true, ids: null, swaps: null };
    h.state.queue = [songTrack(A), songTrack(B)];
    expect(S.switchSongVersion(D)).toBe(true);
    expect(h.late._rebuildRestoredQueue).toHaveBeenCalledTimes(1);
    await flush();
    expect(h.late._rebuildRestoredQueue).toHaveBeenCalledTimes(1);
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.state.queue[0].key).toBe('song:' + D);
  });

  it('setShuffle refuses when the queue is not songs or a restore is pending', () => {
    h.source = { mode: 'letters' };
    h.state.queue = [songTrack(A)];
    expect(S.setShuffle(true)).toBe(false);
    h.source = { mode: 'songs' };
    h.pendingRestore = { url: h.songUrl(A) };
    expect(S.setShuffle(true)).toBe(false);
  });

  it('setShuffle on reshuffles the rest of an explicit list, current song first', () => {
    h.source = { mode: 'songs', ids: [A, B, C], shuffle: false };
    h.state.queue = [songTrack(A), songTrack(B), songTrack(C)];
    expect(S.setShuffle(true)).toBe(true);
    // rest [B, C] reversed by the seeded-shuffle mock.
    expect(h.source.ids).toEqual([A, C, B]);
    expect(h.source.shuffle).toBe(true);
    expect(h.state.qi).toBe(0);
    expect(h.state.queue[0].key).toBe('song:' + A);
    expect(h.syncMediaSessionActions).toHaveBeenCalledTimes(1);
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('setShuffle off keeps an explicit list in its order', () => {
    h.source = { mode: 'songs', ids: [A, B, C], shuffle: true };
    h.state.queue = [songTrack(A), songTrack(B), songTrack(C)];
    expect(S.setShuffle(false)).toBe(true);
    expect(h.source.ids).toEqual([A, B, C]);
    expect(h.source.shuffle).toBe(false);
  });

  it('setShuffle on a filter queue starts at the song playing', () => {
    h.downIds = [B];
    h.source = { mode: 'songs', ids: null, filter: {}, one: true, shuffle: false };
    h.state.queue = [songTrack(B), songTrack(A), songTrack(C)];
    expect(S.setShuffle(true)).toBe(true);
    expect(h.source.shuffle).toBe(true);
    expect(h.source.startKey).toBe('song:' + B);
    expect(h.source.wrap).toBe(true);
    expect(h.source.down).toEqual([B]);
    expect(h.state.queue[0].key).toBe('song:' + B);
  });

  it('setShuffle fails when the rebuild does not open on the song playing', () => {
    h.filterSongs = [songObj(A, 'fam-ab'), songObj(C, 'fam-fe')];
    h.source = { mode: 'songs', ids: null, filter: {}, one: true, shuffle: false };
    h.state.queue = [songTrack(B), songTrack(A)];
    expect(S.setShuffle(true)).toBe(false);
    expect(h.setSource).not.toHaveBeenCalled();
  });

  it('_replayCurrent restarts the song from its top', () => {
    h.el = { currentTime: 5, pause: vi.fn(), play: vi.fn() };
    h.late._replayCurrent();
    expect(h.el.currentTime).toBe(0);
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it('_replayCurrent without an element still restarts', () => {
    h.el = null;
    expect(() => h.late._replayCurrent()).not.toThrow();
    expect(h.start).toHaveBeenCalledTimes(1);
  });
});

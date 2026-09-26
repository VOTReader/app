// @ts-check
/* audio-player/songs — Songs of the Letters queues: playSongs, shuffle, repeat, a version switch. */

import { isSongId, songIdOfKey } from '../audio-track.js';
import {
  cleanSongSwaps,
  normalizeSongFilter,
  seededShuffle,
  songById,
  songQueue,
  songTrack,
} from '../song-catalog.js';
import { _isSong, _notify, _state } from './core.js';
import { _countPlay } from './credit.js';
import { _el, _setSongSkips, _start } from './engine.js';
import { _syncMediaSessionActions } from './media-session.js';
import { _offlineNotice, _offlineRefuses } from './offline.js';
import {
  _forgetPosition,
  _pendingRestore,
  _persist,
  _rememberOutgoingPosition,
  _setLastPersistSec,
  _setPendingRestore,
  _setSource,
  _source,
} from './persist.js';
import { _rebuildRestoredQueue } from './restore.js';

/** @typedef {import('../audio-player.js').Track} Track */

/* ── Songs of the Letters (2026-09-24) ──────────────────────────────────────
   The flock's songs ride this one player (README §1.2) under `song:<id>` keys.
   A songs queue is DESCRIBED by `_source` (filter + seed, or explicit ids, and
   a start), so the boot snapshot of a 900-song shuffle stays tiny, and
   song-catalog.js's songQueue() is the one order both a fresh start and the
   boot rebuild use. What songs are kept OUT of lives beside each gate:
   _notifyListened (read credit, streaks, completions), _countPlay (recent
   shelf, lifetime plays), _rememberPosition/_resumeAt (the resume map), _start
   (the reading speed) and _extendQueue (no auto-continue into letters). */

/** Most ids a caller may hand playSongs — "every saved song" is the longest (500). */
const SONG_IDS_MAX = 1000;

/** @param {any[]} songs @returns {Track[]} */
export function _songTracks(songs) {
  /** @type {Track[]} */
  const out = [];
  for (const song of songs) { const t = songTrack(song); if (t) out.push(t); }
  return out;
}

/** A fresh shuffle seed (uint32, never 0 so a seeded source reads as one). @returns {number} */
function _newSeed() {
  return ((Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0) || 1;
}

/**
 * Play songs from the catalog. Either `ids` (an explicit list: a family's
 * versions, the saved songs) or a `filter` ({ col, style, letter, family, q,
 * lang, dl }; `{}` is every song). `shuffle` plays them in a seeded order
 * (`seed` makes it reproducible; one is drawn when absent). `onePerFamily`
 * queues ONE version of each song — the "Shuffle all songs" rule, so 912
 * different songs play before any repeats — and defaults to `shuffle`: a
 * shuffle started from a filter is one version per family unless the caller
 * says otherwise. `startId` is the song to begin with. False when nothing
 * started (no catalog, nothing matched, or offline).
 *
 * @param {{ ids?: string[], filter?: any, startId?: string, shuffle?: boolean, onePerFamily?: boolean, seed?: number, label?: string }} opts
 * @returns {boolean}
 */
export function playSongs(opts) {
  const o = opts || /** @type {any} */ ({});
  _setSongSkips(0);
  const shuffle = !!o.shuffle;
  const seed = shuffle ? ((Number.isInteger(o.seed) ? /** @type {number} */ (o.seed) >>> 0 : 0) || _newSeed()) : 0;
  const startKey = isSongId(o.startId) ? 'song:' + o.startId : null;
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 120) : 'Songs of the Letters';
  /** @type {any} */
  let desc;
  if (Array.isArray(o.ids)) {
    // An explicit list is ordered ONCE, here, and stored as played: shuffling
    // ids at every rebuild would reorder a queue the listener already hears.
    // A shuffled list opens on the chosen song, the rest in the seeded order; a
    // plain one is forward-only from it, like every other queue.
    const ids = o.ids.filter(isSongId).slice(0, SONG_IDS_MAX);
    const startId = startKey ? /** @type {string} */ (o.startId) : '';
    const order = shuffle ? (startId ? [startId] : []).concat(seededShuffle(ids.filter((id) => id !== startId), seed)) : ids;
    const list = songQueue({ ids: order, startKey: shuffle ? null : startKey });
    desc = { mode: 'songs', volKey: 'song', label, ids: list.map((s) => s.id), filter: null, one: false, seed, shuffle, startKey: null };
  } else {
    const one = typeof o.onePerFamily === 'boolean' ? o.onePerFamily : shuffle;
    desc = { mode: 'songs', volKey: 'song', label, ids: null, filter: normalizeSongFilter(o.filter), one, seed, shuffle, startKey };
  }
  const queue = _songTracks(songQueue(desc));
  if (!queue.length) return false;
  if (_offlineRefuses(queue)) { _offlineNotice(queue[0]); return false; }
  _rememberOutgoingPosition();   // R8b — the reading being left keeps its place
  _setPendingRestore(null);
  _setSource(desc);
  _state.queue = queue;
  _state.qi = 0;
  _countPlay();
  _start();
  return true;
}

/** The repeat mode in force — songs queues only; every other queue plays through. @returns {'off'|'one'|'all'} */
export function _repeatMode() {
  return _source && _source.mode === 'songs' ? _state.repeat : 'off';
}

/** Repeat 'one': the song that just ended starts again from its top. @returns {void} */
export function _replayCurrent() {
  if (_el) { try { _el.currentTime = 0; } catch (_e) { /* the load below restarts it anyway */ } }
  _start();
}

/**
 * Set the repeat mode: 'off', 'one' (replay the song at its end) or 'all'
 * (wrap to the top of the queue at its end). It governs songs queues only, and
 * any queue that is not songs resets it, so a letter never loops.
 * @param {unknown} mode
 * @returns {'off'|'one'|'all'}
 */
export function setRepeat(mode) {
  const next = mode === 'one' || mode === 'all' ? mode : 'off';
  if (_state.repeat !== next) {
    _state.repeat = next;
    _persist();
    _notify();
  }
  return next;
}

/**
 * Play another version of the song playing, from its start, IN ITS PLACE: the queue, its place in it (and so the
 * songs already heard), its label, shuffle and repeat all stay (README 3.6; sweep n3-02 - the desk rebuilt the queue
 * as a fresh list, which dropped shuffle, label and history and cut a restored queue to 50). A described queue keeps
 * the choice as a swap its rebuild replays; an explicit list swaps the id. False when nothing songs is playing or
 * `id` is not another version of the same song.
 * @param {unknown} id
 * @returns {boolean}
 */
export function switchSongVersion(id) {
  if (!isSongId(id)) return false;
  if (_pendingRestore) {
    // The restored bar stands in for a queue not built yet: build it, then switch in it.
    void _rebuildRestoredQueue().then(() => { switchSongVersion(id); });
    return true;
  }
  const src = _source;
  const cur = _state.queue[_state.qi];
  if (!src || src.mode !== 'songs' || !_isSong(cur)) return false;
  const curId = songIdOfKey(cur.key);
  const from = songById(curId);
  const to = songById(id);
  if (!from || !to || curId === id || to.f !== from.f) return false;
  const track = _songTracks([to])[0];
  if (!track) return false;
  // The chosen take is in the queue once, here: a queue of every take (the song page's) held it at another place
  // too, and it played twice (the refutation of s2r, M1).
  /** @type {Track[]} */
  const queue = [];
  let qi = 0;
  _state.queue.forEach((t, i) => {
    if (i === _state.qi) { qi = queue.length; queue.push(track); } else if (t.key !== track.key) queue.push(t);
  });
  /** @type {any} */
  let desc;
  if (src.one && !Array.isArray(src.ids)) {
    // One take per song ("Shuffle all songs", 900 of them): the descriptor stays small and keeps the choice as a
    // swap, keyed by the catalog's take at this place, which its rebuild replays over the same order.
    const swaps = { ...(cleanSongSwaps(src.swaps) || {}) };
    const orig = Object.keys(swaps).find((k) => swaps[k] === curId) || curId;
    if (orig === id) delete swaps[orig]; else swaps[orig] = /** @type {string} */ (id);
    desc = { ...src, swaps: Object.keys(swaps).length ? swaps : null };
  } else {
    // Otherwise the queue as it now stands becomes the explicit list, so a restart rebuilds exactly it (M2).
    desc = { ...src, ids: queue.map((t) => songIdOfKey(t.key)).filter(isSongId), filter: null, one: false, swaps: null, wrap: false, startKey: null };
  }
  _setSource(desc);
  _state.queue = queue;
  _state.qi = qi;
  _forgetPosition(track.url);   // from the start
  _start();
  _setLastPersistSec(-1);
  _persist();
  return true;
}

/**
 * Turn shuffle on or off for the songs queue that is playing. It REORDERS; it
 * never changes which songs are in the queue (one version per family stays
 * exactly as it was). The song playing keeps playing and becomes the head of a
 * queue rebuilt from the descriptor: on, the rest in a fresh seeded order; off,
 * the catalog order onward from it. An explicit list reshuffles its rest on,
 * and keeps its order off (the order before the shuffle is not kept). False
 * when the queue is not songs.
 * @param {unknown} on
 * @returns {boolean}
 */
export function setShuffle(on) {
  const src = _source;
  const cur = _state.queue[_state.qi];
  if (_pendingRestore || !src || src.mode !== 'songs' || !_isSong(cur)) return false;
  const want = !!on;
  const seed = want ? _newSeed() : 0;
  /** @type {any} */
  let desc;
  if (Array.isArray(src.ids)) {
    const curId = songIdOfKey(cur.key);
    const rest = src.ids.filter((id) => id !== curId);
    desc = { ...src, ids: [curId].concat(want ? seededShuffle(rest, seed) : rest), seed, shuffle: want, startKey: null };
  } else {
    // Off, the whole list turns to begin at the song playing: nothing is dropped (sweep n3-01).
    desc = { ...src, seed, shuffle: want, startKey: cur.key, wrap: true };
  }
  const queue = _songTracks(songQueue(desc));
  if (!queue.length || queue[0].url !== cur.url) return false;
  _setSource(desc);
  _state.queue = queue;
  _state.qi = 0;
  _syncMediaSessionActions();
  _persist();
  _notify();
  return true;
}

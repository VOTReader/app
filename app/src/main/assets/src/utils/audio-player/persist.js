// @ts-check
/* audio-player/persist — where the listener was: the source descriptor, the boot snapshot (localStorage
   plus the durable IDB copy), the per-recording position map, and the paused bar a boot restores. */

import {
  AUDIO_RESUME_END_FRACTION,
  AUDIO_RESUME_MIN_SEC,
  AUDIO_RESUME_REWIND_SEC,
  isSongId,
  isSongKey,
  normalizeAudioRate,
  normalizeAudioTrack,
  songIdOfKey,
} from '../audio-track.js';
import { cleanSongSwaps, loadSongCatalog, normalizeSongFilter } from '../song-catalog.js';
import {
  _g,
  _isSong,
  _library,
  _notify,
  _positions,
  _state,
} from './core.js';
import { _readingRate, _setReadingRate } from './engine.js';

/** @typedef {import('../audio-player.js').Track} Track */

/* ── position persistence (owner directive 2026-08-06) ────────────────────
   Playback position survives app close AND phone restart. A tiny throttled
   localStorage snapshot (~300 bytes) records HOW the queue was built (its
   source descriptor) + the current track's display fields + the clock; on
   the next boot the bar reappears PAUSED at that position with zero network
   and zero corpus loading — the full queue is rebuilt lazily from the
   manifest on the first transport tap (the VOT corpus is a lazy bundle; the
   snapshot's display fields are what let the bar render before it loads).
   stop() (the ✕) and finishing the queue both CLEAR the snapshot. */

const PERSIST_KEY = 'vot-audio-pos';
/** How the current queue was built — replayed to rebuild it after a boot.
 * `custom` persists a user-edited queue rather than rebuilding corpus order.
 * `startKey`/`startIndex` record the queue's forward-only horizon (where the
 * listener chose to begin), so a rebuilt queue never regrows the tracks that
 * were deliberately left behind it. `startReader` records the voice chosen for
 * the start letter, so the rebuild resumes on that rendition and not the
 * manifest's primary one.
 *
 * `startPartIndex` is the same promise ONE LEVEL DOWN, and it used to stop at
 * the boundary of this object: a multi-part letter shares one key across its
 * parts, so `startKey` alone rebuilds at part 1 however far in the listener
 * actually began. Recorded here, written by _persist and replayed by the boot
 * rebuild through the same slice playCollection uses.
 *
 * A SONGS queue (`mode: 'songs'`) is described, never listed: a `filter` plus a
 * `seed` (shuffle) or an explicit `ids` list, and `startKey`. A 900-song shuffle
 * is a few dozen bytes here, where a `custom` queue would re-serialize 900
 * tracks into IDB every second. song-catalog.js's songQueue() turns it back
 * into the same queue.
 * @type {{ mode: 'letter'|'collection'|'section'|'custom'|'songs', volKey: string, label: string|null, startKey?: string|null, startIndex?: number|null, startReader?: string|null, startPartIndex?: number|null, filter?: any, one?: boolean, seed?: number, shuffle?: boolean, ids?: string[] | null, wrap?: boolean, swaps?: Record<string, string> | null } | null} */
export let _source = null;
/** Descriptor waiting for its queue rebuild (set only by _restoreFromSaved). */
export let _pendingRestore = /** @type {any} */ (null);
/** Last persisted whole-second, so the 1 Hz tick writes every ~5s, not 1 Hz. */
export let _lastPersistSec = -1;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _lastPersistSec} v */
export function _setLastPersistSec(v) { _lastPersistSec = v; }

/* Both descriptors above are module-private, but the listening desk has to
   DESCRIBE the queue they define — "1 recording" and a Restart-labelled prev
   are lies while a restore placeholder stands in for an unknown queue, and a
   voice switch must warn before discarding a queue the listener edited. Each
   gets one writer that mirrors the fact the desk needs into public state, so
   the mirror cannot drift from the descriptor. */

/** @param {typeof _source} next @returns {void} */
export function _setSource(next) {
  _source = next;
  _state.sourceMode = next ? next.mode : '';
  // Shuffle is a fact about the songs descriptor; repeat is a songs-session
  // setting that no other queue may inherit (a letter must never loop).
  _state.shuffle = !!(next && next.mode === 'songs' && next.shuffle);
  if (!next || next.mode !== 'songs') _state.repeat = 'off';
}

/** @param {any} next @returns {void} */
export function _setPendingRestore(next) {
  _pendingRestore = next || null;
  _state.restoring = !!_pendingRestore;
}

/* ── durable per-recording positions (owner directive 2026-08-09) ─────────
   The snapshot above is ONE slot — it remembers the last thing playing, so
   starting anything else forgets where the reader was in everything else.
   AudioPositionsStore (bundle-b, reached by the fail-quiet globalThis bridge)
   holds the per-recording map beside it: URL → {t, d, at}.

   Everything here is best-effort by construction. Playback must never depend
   on the store: every call is wrapped, a missing bridge is a no-op, and the
   writes are throttled so a scrub or a busy tick can't become an IDB storm. */

/** Floor between position writes, ms. */
const POSITION_WRITE_MS = 1000;

/** Epoch ms of the last position write — the >= 1/s throttle. */
let _lastPositionWriteAt = 0;
/** URL of a track that just played to its end. Its record was deliberately
 *  deleted, so the advance it triggers must not write the position back. */
export let _finishedUrl = /** @type {string | null} */ (null);
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _finishedUrl} v */
export function _setFinishedUrl(v) { _finishedUrl = v; }

/**
 * Remember where a track was left — but only from a position that could ever
 * be RESUMED from.
 *
 * The floor is `AUDIO_RESUME_MIN_SEC`, applied uniformly (2026-08-10),
 * including at the forced stop/pause boundaries. It is not a throttle: a
 * position under 30 s can never resume — `_resumeAt` refuses it, and every
 * library row that quotes "N left" refuses it too — so storing one writes a
 * row that means exactly what having no row means, while consuming one of the
 * 200 LRU slots. Skipping chapters through a book used to file a dead row for
 * every chapter passed, evicting the real places the listener left. A zero
 * clock is covered by the same test, which matters because `_start()` sets
 * `_state.time = 0` before metadata lands and a piggybacked write there would
 * erase the very record a resume is about to read.
 *
 * @param {Track | null | undefined} track
 * @param {number} time
 * @param {number} duration
 * @param {boolean} [force] - bypass the throttle at a deliberate boundary
 *   (track change, stop, the ✕) where losing the write loses the position.
 * @returns {void}
 */
function _rememberPosition(track, time, duration, force) {
  try {
    const t = Number(time) || 0;
    // Songs start from the top, always: a three-minute song is not a place to
    // return to, and 1,000 of them would evict every real place from the
    // 200-slot map a reading needs.
    if (!track || !track.url || _isSong(track) || !(t >= AUDIO_RESUME_MIN_SEC)) return;
    if (_finishedUrl && track.url === _finishedUrl) return;
    const now = Date.now();
    if (!force && now - _lastPositionWriteAt < POSITION_WRITE_MS) return;
    const store = _positions();
    if (!store || typeof store.setPosition !== 'function') return;
    _lastPositionWriteAt = now;
    store.setPosition(track, t, Number(duration) || 0);
  } catch (_e) { /* position memory must never stand between a tap and audio */ }
}

/** Write the CURRENT track's position — the piggyback for `_persist()`. */
export function _rememberCurrentPosition(force) {
  _rememberPosition(_state.queue[_state.qi], _state.time, _state.duration, force);
}

/**
 * R8 — the position belongs to the track being LEFT. Every transport move that
 * mutates `_state.qi` calls this FIRST, or the outgoing clock lands on the
 * incoming recording.
 *
 * @returns {void}
 */
export function _rememberOutgoingPosition() {
  _rememberCurrentPosition(true);
}

/** @param {string | null} url @returns {void} */
export function _forgetPosition(url) {
  try {
    const store = _positions();
    if (url && store && typeof store.clearPosition === 'function') store.clearPosition(url);
  } catch (_e) { /* same rule: the map is an enhancement, never a dependency */ }
}

/**
 * Where a track should start, given what the map remembers. 0 means "from the
 * top" — either nothing is remembered, the listener barely began, or they
 * reached the tail (which reads as finished, not as a place to return to).
 *
 * A record with an UNKNOWN length (d = 0, metadata never arrived) resumes on
 * the clock alone: not knowing how long a recording runs is no reason to throw
 * away an hour of it.
 *
 * EMERGENT AND CORRECT: a recording shorter than ~31s can never resume, since
 * `t >= 30` and `t < 0.97 * d` together require d > 30 / 0.97 ≈ 30.9. Nothing
 * that brief is worth resuming — restarting it costs the listener half a
 * minute, and the rewind nudge would land at or before its beginning anyway.
 *
 * @param {Track | null | undefined} track
 * @returns {number} seconds to seek to, 0 for no resume
 */
export function _resumeAt(track) {
  try {
    const store = _positions();
    if (!track || !track.url || _isSong(track) || !store || typeof store.getPosition !== 'function') return 0;
    const saved = store.getPosition(track.url);
    if (!saved) return 0;
    const t = Number(saved.t) || 0;
    const d = Number(saved.d) || 0;
    if (!(t >= AUDIO_RESUME_MIN_SEC)) return 0;
    if (d > 0 && t >= d * AUDIO_RESUME_END_FRACTION) return 0;
    return Math.max(0, t - AUDIO_RESUME_REWIND_SEC);
  } catch (_e) { return 0; }
}

export function _persist() {
  // Durable per-recording memory rides the same call sites as the boot
  // snapshot, and ahead of its storage guards: the two are independent.
  _rememberCurrentPosition(false);
  let s;
  try { s = _snapshot(); } catch (_e) { return; }
  if (!s) return;
  if (s === 'clear') { _clearPersist(); return; }
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(PERSIST_KEY, JSON.stringify(s)); } catch (_e) { /* storage full/blocked — resume is best-effort */ }
  _persistDurable(s);
}

/** The one record both channels write. Null when there is nothing to remember;
 *  'clear' when the recording the listener heard to its end was the last one
 *  (see below). */
function _snapshot() {
  const src = _pendingRestore || _source;
  let qi = _pendingRestore ? _pendingRestore.qi : _state.qi;
  let track = _pendingRestore ? _state.queue[0] : _state.queue[_state.qi];
  // Exact to the millisecond (2026-09-11): it was floored, and a floor lost up
  // to a second at the one moment the reader cannot tap through — the close.
  let time = Math.round((_state.time || 0) * 1000) / 1000;
  /* THE SNAPSHOT MUST NOT NAME A RECORDING THE LISTENER HEARD TO ITS END, and
     until now only the OTHER writer refused to. `_rememberPosition` has this
     exact guard (`if (_finishedUrl && track.url === _finishedUrl) return;`) and
     the per-recording record is also dropped outright by `_forgetPosition`;
     the boot snapshot had neither.

     On the normal path the omission is invisible: next() moves qi and starts
     the new track BEFORE it persists, so the url no longer matches. The
     sleep-at-track-end path does not advance at all, so `_markPaused()` wrote
     the finished recording at its ending clock — and the next session resumed
     AT the end of something already heard. Pressing play fired `ended` again at
     once, which ran `_notifyListened` a SECOND time and counted the completion
     twice, then skipped a track the listener was not expecting to lose.

     ADVANCING rather than rewinding, because the recording is over: rewinding to
     0 would offer it again, which is the opposite of what finishing it means.
     And when it was the LAST one, the snapshot is cleared — the same answer
     next() reaches through stop(), whose own comment is "the boot snapshot is
     the part that must not resurrect the bar".

     THE LIVE BAR IS DELIBERATELY NOT TOUCHED. A reader who set a sleep timer
     wakes to the recording they finished, paused at its end: that is "this is
     where you got to", and it is the snapshot, not the bar, that the next
     session reads. */
  /* `!_pendingRestore` is a guard whose bad input cannot currently occur, and it
     is kept rather than deleted for what it would cost if it did. `_finishedUrl`
     is set only inside the `ended` handler, which needs a live media element,
     and `_pendingRestore` means there is not one yet — so a bite on this clause
     reddens nothing, correctly. But the restore placeholder is a ONE-track
     queue, so were it ever to fire, `qi + 1 >= length` would hold and the arm
     below would `_clearPersist()` — wiping the reader's resume point rather
     than advancing it. A destructive misfire is worth one clause. */
  if (!_pendingRestore && _finishedUrl && track && track.url === _finishedUrl) {
    if (qi + 1 >= _state.queue.length) return 'clear';
    qi += 1;
    track = _state.queue[qi];
    time = 0;
  }
  const savedTrack = normalizeAudioTrack(track);
  if (!src || !savedTrack) return null;
  const queueForCustomSource = _pendingRestore && Array.isArray(_pendingRestore.queue)
    ? _pendingRestore.queue
    : _state.queue;
  const customQueue = src.mode === 'custom'
    ? queueForCustomSource.map(normalizeAudioTrack).filter(Boolean)
    : undefined;
  const songs = src.mode === 'songs' ? _songsSnapshotFields(src, savedTrack, qi) : null;
  return {
    v: 2,
    mode: src.mode, volKey: src.volKey, label: src.label,
    qi: songs ? songs.qi : qi,
    key: savedTrack.key,
    time,
    track: savedTrack,
    customQueue,
    startKey: (songs ? songs.startKey : src.startKey) || undefined,
    startIndex: typeof src.startIndex === 'number' ? src.startIndex : undefined,
    startPartIndex: src.startPartIndex ? src.startPartIndex : undefined,
    startReader: src.startReader || undefined,
    filter: songs ? songs.filter : undefined,
    one: songs && songs.one ? true : undefined,
    seed: songs && songs.seed ? songs.seed : undefined,
    shuffle: songs && songs.shuffle ? true : undefined,
    ids: songs ? songs.ids : undefined,
    wrap: songs && songs.wrap ? true : undefined,
    swaps: songs && songs.swaps ? songs.swaps : undefined,
    repeat: songs && _state.repeat !== 'off' ? _state.repeat : undefined,
    at: Date.now(),   // which copy is newer, when the two channels disagree at boot
  };
}

/** How many ids an explicit songs list may persist. Longer lists persist the
 *  window FROM the playing song forward — the forward-only horizon every other
 *  rebuild keeps — so the snapshot stays small whatever the list. */
const SONG_IDS_PERSIST = 50;

/**
 * The songs half of a snapshot: the compact descriptor, never the queue. An
 * explicit ids list longer than SONG_IDS_PERSIST is cut to the window that
 * starts at the playing song, and the snapshot's startKey and qi move with it.
 * @param {any} src @param {Track} track @param {number} qi
 * @returns {{ filter: any, one: boolean, seed: number, shuffle: boolean, ids: string[] | undefined, startKey: string | null, qi: number, wrap: boolean, swaps: Record<string, string> | null }}
 */
function _songsSnapshotFields(src, track, qi) {
  let ids = Array.isArray(src.ids) ? src.ids.filter(isSongId) : undefined;
  let startKey = src.startKey || null;
  if (ids && ids.length > SONG_IDS_PERSIST) {
    const at = Math.max(0, ids.indexOf(songIdOfKey(track.key)));
    ids = ids.slice(at, at + SONG_IDS_PERSIST);
    startKey = null;
    qi = 0;
  }
  return { filter: ids ? undefined : normalizeSongFilter(src.filter), one: !ids && !!src.one, seed: Number(src.seed) >>> 0, shuffle: !!src.shuffle, ids, startKey, qi,
    wrap: !ids && !!src.wrap, swaps: ids ? null : cleanSongSwaps(src.swaps) };
}

export function _clearPersist() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(PERSIST_KEY); } catch (_e) { /* ditto */ }
  const idb = _idb();
  if (idb) { try { Promise.resolve(idb.delete(SNAPSHOT_STORE, SNAPSHOT_KEY)).catch(() => {}); } catch (_e) { /* ditto */ } }
}

/* ── THE DURABLE SNAPSHOT — the kill (2026-09-11, w-audio-kill-cadence) ──
   A kill fires no event, and localStorage does not survive one. Measured on
   this machine (probe-kill-durability.mjs): after an abrupt kill of the whole
   browser process tree — the phone's shape — LS came back at its FIRST commit
   and nothing after (5.0 s on a 12 s run, 5.0 s on a 33 s run: Chromium
   commits LS 5 s after the first write and then rate-limits commits to about
   60 an hour, so a value written every second reaches disk about once a
   minute), while IndexedDB came back with the LAST write, every time. The
   walk's kill arm then lost the snapshot ENTIRELY — the bar came back idle —
   so the durable record is the whole snapshot, not a clock beside it: the
   same object, put to IDB at every snapshot write and every whole second
   while playing (nothing when paused: timeupdate stops). LS keeps the
   synchronous first paint of the bar and older data; at boot the IDB copy
   wins unless the LS copy is stamped newer, which only an older build's data
   can be. IDBAdapter is bundle-b, reached through the globalThis bridge like
   the positions store; absent, all of this is a no-op. */
const SNAPSHOT_STORE = 'meta';
const SNAPSHOT_KEY = 'audio-snapshot';
const _idb = () => _g().IDBAdapter || null;
/** Epoch ms stamped on the copy the bar was restored from (0: none, or unstamped). */
let _restoredAt = 0;
function _persistDurable(s) {
  const idb = _idb();
  if (!idb) return;
  try { Promise.resolve(idb.put(SNAPSHOT_STORE, SNAPSHOT_KEY, s)).catch(() => {}); }
  catch (_e) { /* best-effort: the LS copy still has the last 5 s */ }
}
export function _persistDurableOnly() {
  let s;
  try { s = _snapshot(); } catch (_e) { return; }
  if (s && s !== 'clear') _persistDurable(s);
}
/** Boot: the durable copy outranks the LS one unless LS is stamped newer. A
 *  bar already rebuilt (the reader tapped Play in the milliseconds this read
 *  takes) keeps what it started from. The update reload's own record needs no
 *  guard here: its rebuild clears the pending restore before this resolves, and
 *  offline — where it stays pending — the IDB copy IS the reload's flush (same
 *  _persist() call, same clock, same stamp); a guard on it was bitten and no
 *  case could tell. */
export async function _adoptDurableSnapshot() {
  const idb = _idb();
  if (!idb) return;
  let rec = null;
  try { rec = await idb.get(SNAPSHOT_STORE, SNAPSHOT_KEY); } catch (_e) { return; }
  if (!rec || typeof rec !== 'object' || typeof rec.at !== 'number') return;
  if (_state.status !== 'idle' && !_pendingRestore) return;   // live already: the reader pressed Play
  if (_pendingRestore && rec.at < _restoredAt) return;         // the LS copy is newer
  if (_applySnapshot(rec)) _notify();
}

/**
 * Boot-time restore: show the bar paused at the saved position. Pure display
 * state — one placeholder queue entry from the snapshot; the real queue is
 * rebuilt by _rebuildRestoredQueue() on the first transport tap.
 * @returns {void}
 */
export function _restoreFromSaved() {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    _applySnapshot(JSON.parse(raw));
  } catch (_e) { _setPendingRestore(null); }
}

/**
 * Hand a snapshot record (either channel) to the bar as a pending restore.
 * @param {any} s
 * @returns {boolean} whether the record was usable
 */
function _applySnapshot(s) {
  try {
    if (!s || (s.v !== 1 && s.v !== 2)) return false;
    const track = normalizeAudioTrack(s.track);
    const mode = s.mode === 'letter' || s.mode === 'collection' || s.mode === 'section' || s.mode === 'custom' || s.mode === 'songs'
      ? s.mode
      : null;
    if (!track || !mode) return false;
    // A songs snapshot must name a song, and its descriptor is re-validated key
    // by key: it is stored data, and it decides what the rebuild will queue.
    if (mode === 'songs' && !_isSong(track)) return false;
    const songIds = mode === 'songs' && Array.isArray(s.ids) ? s.ids.filter(isSongId).slice(0, SONG_IDS_PERSIST) : null;
    const customQueue = mode === 'custom' && Array.isArray(s.customQueue)
      ? s.customQueue.map(normalizeAudioTrack).filter(Boolean)
      : [];
    if (mode === 'custom' && !customQueue.length) return false;
    _setPendingRestore({
      mode,
      volKey: typeof s.volKey === 'string' ? s.volKey : '',
      label: typeof s.label === 'string' ? s.label : null,
      qi: Math.max(0, Math.floor(Number(s.qi) || 0)),
      key: typeof s.key === 'string' ? s.key : track.key,
      url: track.url,
      time: Math.max(0, Number(s.time) || 0),
      queue: customQueue,
      startKey: typeof s.startKey === 'string' ? s.startKey : null,
      startIndex: Number.isInteger(s.startIndex) && s.startIndex >= 0 ? s.startIndex : null,
      // A legacy snapshot has no part index, and ABSENCE means "no part
      // horizon" rather than part 0 — the slice is a no-op either way, and
      // null keeps the two readings from being confused later.
      startPartIndex: Number.isInteger(s.startPartIndex) && s.startPartIndex > 0 ? s.startPartIndex : null,
      startReader: typeof s.startReader === 'string' ? s.startReader : null,
      filter: mode === 'songs' && !songIds ? normalizeSongFilter(s.filter) : null,
      one: mode === 'songs' && !songIds && s.one === true,
      seed: mode === 'songs' ? (Number(s.seed) >>> 0) : 0,
      shuffle: mode === 'songs' && s.shuffle === true,
      ids: songIds,
      wrap: mode === 'songs' && !songIds && s.wrap === true,
      swaps: mode === 'songs' && !songIds ? cleanSongSwaps(s.swaps) : null,
    });
    _restoredAt = typeof s.at === 'number' ? s.at : 0;
    _state.queue = [track];
    _state.qi = 0;
    _state.time = _pendingRestore.time;
    _state.duration = 0;
    _state.status = 'paused';
    // The desk shows the songs session's shuffle and repeat before the rebuild.
    _state.shuffle = !!_pendingRestore.shuffle;
    _state.repeat = mode === 'songs' && (s.repeat === 'one' || s.repeat === 'all') ? s.repeat : 'off';
    // The restored bar is a song: start the catalog on its way now (cover,
    // version, the queue the first tap rebuilds). Idempotent and fail-quiet.
    if (mode === 'songs') void loadSongCatalog();
    _followLibraryRate();
    _notify();
    return true;
  } catch (_e) { _setPendingRestore(null); return false; }
}

/* A paused restore puts the desk up before any track loads, and _load is where
   the rate is pulled from the library — so the readout said 1× over a store
   holding 1.37 (item 5 look, 2026-09-21; ra3). While the restore is pending the
   player follows the store instead: bundle-b hydrates IDB after this module
   evaluates, so the pull repeats on each store notify. Once a track is live
   the store is written BY the player and never drives it from behind. */
export let _libraryWatched = false;
export function _followLibraryRate() {
  const pull = () => {
    if (!_pendingRestore) return;
    const library = _library();
    if (!library || typeof library.getPlaybackRate !== 'function') return;
    _setReadingRate(normalizeAudioRate(library.getPlaybackRate()));
    const next = isSongKey(_pendingRestore.key) ? 1 : _readingRate;   // a restored song still plays at 1×
    if (next !== _state.rate) { _state.rate = next; _notify(); }
  };
  pull();
  if (_libraryWatched) return;
  const library = _library();
  if (library && typeof library.subscribe === 'function') { _libraryWatched = true; library.subscribe(pull); }
}

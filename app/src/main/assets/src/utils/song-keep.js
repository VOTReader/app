// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   song-keep — Songs of the Letters kept on this phone (K1; README 3.9, 6.3;
   work/04-hosting-offline-licensing.md section 5)
   ═══════════════════════════════════════════════════════════════════════
   "Keep on this phone" puts a song's mp3 on the phone so it plays with no
   signal. Two homes for the bytes, one API for every screen:

   - THE WEB (the PWA, any browser): the song sites are the page's own origin
     (Access-Control-Allow-Origin: * elsewhere), so the page fetches the mp3
     itself, checks it against the catalog's byte count, hashes it (SHA-256,
     crypto.subtle), writes it to the `offline-songs` IDB store (bundle-b's
     OfflineSongsStore), reads it back and hashes the stored copy again; a
     mismatch deletes the copy and tries once more. A kept song plays from
     URL.createObjectURL(blob) (media-src allows blob:), one URL alive at a
     time, revoked when the track changes. No service worker is involved.
   - THE ANDROID APP: the recording plays in ExoPlayer, outside the WebView,
     which cannot read a blob: URL. So the app keeps songs where it keeps the
     readings it downloads (listening item 8): the native OfflineAudioStore,
     which ExoPlayer and the WebView's <audio> both read from disk under the
     song's own URL. Its size is checked against the catalog here, once the
     file lands (a mismatch is removed and fetched once more).

   Sizes always come from the catalog's `b`, never from storage.estimate(),
   which is padded. Before a batch the free room is checked and a batch that
   cannot fit is refused early, in words ("Not enough room: needs 380 MB,
   212 MB free."). The first keep asks the browser to persist the origin's
   storage. An iPhone that has not added the app to its Home Screen cannot
   keep songs honestly (Safari clears a site's storage after about a week of
   not visiting it), so there the button says so instead.

   The LIST of kept ids is also written to vot-audio-library (`songKept`), so
   it rides the Settings backup; the bytes never do. After a restore the ids
   are there and the bytes are not: missing() names them, and the Kept list
   and Settings offer "Download your N songs again".

   Downloads run one at a time, while the app is open.
   ═══════════════════════════════════════════════════════════════════════ */

import { songById, songAssetUrl, SongCatalog } from './song-catalog.js';
import { isSongId, isSongUrl } from './audio-track.js';
import { OfflineAudio } from './offline-audio.js';

/** Permanent Rule 5's guard: a song is 2-7 MB; nothing larger is ever read into memory to be kept. */
const MAX_SONG_BYTES = 40e6;
/** The phone app keeps this much free beyond a download (OfflineAudioStore's SPACE_MARGIN). */
const NATIVE_MARGIN = 200 * 1024 * 1024;
export const IOS_TAB_TEXT = 'Add VOTReader to your Home Screen to keep songs';
const OFFLINE_TEXT = 'Keeping songs needs a connection.';

/** @type {Set<() => void>} */
const _listeners = new Set();
let _version = 0;
let _loaded = false;
/** @type {Promise<void> | null} */
let _loading = null;
/** @type {Map<string, { blob: Blob, bytes: number, keptAt: number }>} the web's kept songs, by id */
const _kept = new Map();
/** @type {string[]} waiting to be kept (web) */
let _queue = [];
/** @type {string | null} being kept now (web) */
let _active = null;
/** @type {AbortController | null} */
let _abort = null;
/** @type {Map<string, string>} id → why the last try failed (network | size | check | space) */
const _failed = new Map();
/** @type {Map<string, string>} a refusal, per asking surface */
const _notes = new Map();
/** @type {{ id: string, url: string } | null} the one object URL alive */
let _live = null;
let _nativeHooked = false;
/** @type {{ v: number, map: Map<string, { url: string, bytes: number, savedAt: number }> } | null} */
let _nativeIndex = null;
/** @type {Set<string>} native songs already fetched a second time after a size mismatch */
const _retried = new Set();
/** @type {Set<string>} native songs this build has already listed in songKept */
const _listed = new Set();
/** @type {Set<string>} native songs being removed for a size mismatch */
const _dropping = new Set();
/** @type {Set<string>} ...to be fetched again once they are gone */
const _redo = new Set();
let _inNative = false;

const _g = () => /** @type {any} */ (globalThis);
const _store = () => _g().OfflineSongsStore || null;
const _library = () => _g().AudioLibraryStore || null;

function _notify() {
  _version++;
  for (const cb of _listeners) {
    try { cb(); } catch (e) { console.warn('[song-keep] subscriber threw', e); }
  }
}

/** @returns {boolean} the Android app keeps songs natively */
function _native() {
  return OfflineAudio.available();
}

/** @param {unknown} url @returns {string} the song id of a shard URL, or '' */
function _idOfUrl(url) {
  if (!isSongUrl(url)) return '';
  const m = /\/([0-9a-f]{12})\.mp3$/.exec(String(url));
  return m ? m[1] : '';
}

/** The phone app's kept songs, by id (rebuilt when its downloads change). */
function _nativeSongs() {
  const v = OfflineAudio.getVersion();
  if (_nativeIndex && _nativeIndex.v === v) return _nativeIndex.map;
  /** @type {Map<string, { url: string, bytes: number, savedAt: number }>} */
  const map = new Map();
  for (const it of OfflineAudio.songItems()) {
    const id = _idOfUrl(it.url);
    if (id) map.set(id, { url: it.url, bytes: it.bytes, savedAt: it.savedAt });
  }
  _nativeIndex = { v, map };
  return map;
}

/**
 * The phone app's downloads changed: list the songs that landed in songKept (the backup's list). A song whose size
 * is not the catalog's is removed and, once it is gone, fetched once more (a second mismatch is a failure).
 */
function _onNative() {
  if (_inNative) return;   // a remove or download below notifies synchronously
  _inNative = true;
  try {
    const songs = _nativeSongs();
    /** @type {string[]} */
    const landed = [];
    for (const [id, it] of songs) {
      if (_dropping.has(id)) continue;
      const s = songById(id);
      if (s && s.b > 0 && it.bytes > 0 && it.bytes !== s.b) {
        _dropping.add(id);
        if (_retried.has(id)) _failed.set(id, 'size'); else { _retried.add(id); _redo.add(id); }
        OfflineAudio.remove([it.url]);
        continue;
      }
      if (!_listed.has(id)) { _listed.add(id); landed.push(id); }
    }
    for (const id of [..._listed]) if (!songs.has(id)) _listed.delete(id);
    for (const id of [..._dropping]) {
      if (songs.has(id)) continue;
      _dropping.delete(id);
      const s = _redo.delete(id) ? songById(id) : null;
      if (s) OfflineAudio.download([_nativeItem(s)]);
    }
    const lib = _library();
    if (landed.length && lib && typeof lib.setSongsKept === 'function') {
      const known = typeof lib.songKept === 'function' ? lib.songKept() : [];
      const fresh = landed.filter((id) => known.indexOf(id) < 0);
      if (fresh.length) lib.setSongsKept(fresh, true);
    }
  } finally { _inNative = false; }
  _notify();
}

function _hookNative() {
  if (_nativeHooked || !_native()) return;
  _nativeHooked = true;
  OfflineAudio.subscribe(_onNative);
  _onNative();
}

/** @param {any} s a catalog song @returns {{ url: string, key: string, title: string }} */
function _nativeItem(s) {
  return { url: songAssetUrl(s), key: 'song:' + s.id, title: (s.t || 'Song') + (s.v ? ' · ' + s.v : '') };
}

/** Read the web's kept songs once (IDB hands back Blob handles, not bytes). @returns {Promise<void>} */
function _ensureLoaded() {
  if (_loaded || _native()) return Promise.resolve();
  if (_loading) return _loading;
  const st = _store();
  if (!st || typeof st.all !== 'function') return Promise.resolve();
  _loading = Promise.resolve().then(() => st.all()).then((list) => {
    for (const rec of Array.isArray(list) ? list : []) {
      if (rec && isSongId(rec.id) && !_kept.has(rec.id)) _kept.set(rec.id, { blob: rec.blob, bytes: rec.bytes, keptAt: rec.keptAt });
    }
    _loaded = true;
    _notify();
  }, () => { _loading = null; });
  return _loading;
}

/** @returns {boolean} this display is an installed app (Home Screen / standalone) */
function _standalone() {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) return true;
  } catch (_e) { /* no media queries */ }
  return /** @type {any} */ (navigator).standalone === true;
}

/**
 * Can this phone keep songs? 'ok'; 'ios-tab' (an iPhone or iPad in a Safari tab: add to Home Screen first);
 * 'none' (a browser without IndexedDB, fetch or crypto.subtle).
 * @returns {'ok' | 'ios-tab' | 'none'}
 */
function availability() {
  if (_native()) return 'ok';
  if (typeof navigator === 'undefined' || typeof indexedDB === 'undefined' || typeof fetch !== 'function'
    || typeof Blob === 'undefined' || !_store()) return 'none';
  const subtle = typeof crypto !== 'undefined' && crypto ? crypto.subtle : null;
  if (!subtle || typeof subtle.digest !== 'function') return 'none';
  // navigator.standalone exists only on iOS Safari; there a site's storage is cleared after about a week unused.
  if (typeof (/** @type {any} */ (navigator)).standalone === 'boolean' && !_standalone()) return 'ios-tab';
  return 'ok';
}

/** @param {unknown} id @returns {boolean} this song plays with no signal */
function isKept(id) {
  if (!isSongId(id)) return false;
  if (_native()) { _hookNative(); return _nativeSongs().has(/** @type {string} */ (id)); }
  if (!_loaded) void _ensureLoaded();
  return _kept.has(/** @type {string} */ (id));
}

/** @returns {string[]} the kept songs' ids, newest first */
function keptIds() {
  if (_native()) {
    _hookNative();
    return [..._nativeSongs().entries()].sort((a, b) => b[1].savedAt - a[1].savedAt).map((e) => e[0]);
  }
  if (!_loaded) void _ensureLoaded();
  return [..._kept.entries()].sort((a, b) => b[1].keptAt - a[1].keptAt).map((e) => e[0]);
}

/** @param {unknown} id @returns {'kept' | 'keeping' | 'queued' | 'failed' | 'none'} */
function statusOf(id) {
  if (!isSongId(id)) return 'none';
  const sid = /** @type {string} */ (id);
  if (isKept(sid)) return 'kept';
  if (_native()) {
    const s = songById(sid);
    const url = s ? songAssetUrl(s) : '';
    const st = url ? OfflineAudio.statusOf(url) : 'none';
    if (st === 'downloading') return 'keeping';
    if (st === 'queued') return 'queued';
    if (st === 'failed' || _failed.has(sid)) return 'failed';
    return 'none';
  }
  if (_active === sid) return 'keeping';
  if (_queue.indexOf(sid) >= 0) return 'queued';
  if (_failed.has(sid)) return 'failed';
  return 'none';
}

/**
 * The size of songs as the catalog states it (a kept song the catalog no longer lists counts its own bytes).
 * @param {string[]} ids @returns {number}
 */
function bytesOf(ids) {
  let n = 0;
  for (const id of ids) {
    const s = songById(id);
    if (s && s.b > 0) { n += s.b; continue; }
    const web = _kept.get(id);
    const nat = _native() ? _nativeSongs().get(id) : null;
    n += (web && web.bytes) || (nat && nat.bytes) || 0;
  }
  return n;
}

/**
 * Where a set of songs stands: how many, how many kept, how many on their way, how many failed, and the bytes of
 * all of them and of what is not kept yet.
 * @param {string[]} ids
 */
function progressOf(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter(isSongId))];
  let kept = 0;
  let busy = 0;
  let failed = 0;
  /** @type {string[]} */
  const todo = [];
  for (const id of list) {
    const st = statusOf(id);
    if (st === 'kept') kept++;
    else if (st === 'keeping' || st === 'queued') busy++;
    else { if (st === 'failed') failed++; todo.push(id); }
  }
  return { total: list.length, kept, busy, failed, bytes: bytesOf(list), needBytes: bytesOf(todo) };
}

/** Room left for songs, in bytes, or -1 when this browser cannot say. @returns {Promise<number>} */
async function _room() {
  if (_native()) {
    const free = OfflineAudio.freeBytes();
    return free >= 0 ? Math.max(0, free - NATIVE_MARGIN) : -1;
  }
  try {
    const st = typeof navigator !== 'undefined' ? navigator.storage : null;
    if (!st || typeof st.estimate !== 'function') return -1;
    const est = await st.estimate();
    const quota = Number(est && est.quota);
    const usage = Number(est && est.usage) || 0;
    return quota > 0 ? Math.max(0, quota - usage) : -1;
  } catch (_e) { return -1; }
}

/** "3.4 MB", "64 MB", "3.8 GB" (decimal units, as a phone's storage screen shows them). @param {number} n */
export function formatSongBytes(n) {
  if (!(n > 0)) return '0 MB';
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + ' GB';
  const mb = n / 1e6;
  return (mb < 10 ? mb.toFixed(1).replace(/\.0$/, '') : String(Math.round(mb))) + ' MB';
}

/** @param {string} key @param {string} text @returns {{ ok: boolean, text: string }} */
function _say(key, text) {
  if (key) { if (text) _notes.set(key, text); else _notes.delete(key); }
  _notify();
  return { ok: !text, text };
}

/**
 * Keep songs on this phone. `key` names the surface asking, so a refusal shows beside the button that asked.
 * Resolves { ok, text }: text is the refusal in words when nothing was started.
 * @param {string[]} ids @param {string} [key]
 * @returns {Promise<{ ok: boolean, text: string }>}
 */
async function keep(ids, key = '') {
  const avail = availability();
  if (avail === 'ios-tab') return _say(key, IOS_TAB_TEXT + '.');
  if (avail === 'none') return _say(key, 'This browser cannot keep songs.');
  await _ensureLoaded();
  _hookNative();
  const seen = new Set();
  const todo = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (!isSongId(id) || seen.has(id)) continue;
    seen.add(id);
    const s = songById(id);
    if (!s || s.hid || !s.sh || !(s.b > 0) || s.b > MAX_SONG_BYTES || !songAssetUrl(s)) continue;
    const st = statusOf(id);
    if (st === 'none' || st === 'failed') todo.push(s);
  }
  if (!todo.length) return _say(key, '');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return _say(key, OFFLINE_TEXT);
  const need = todo.reduce((n, s) => n + s.b, 0);
  const room = await _room();
  if (room >= 0 && need > room) {
    return _say(key, 'Not enough room: needs ' + formatSongBytes(need) + ', ' + formatSongBytes(room) + ' free.');
  }
  for (const s of todo) _failed.delete(s.id);
  if (_native()) {
    for (const s of todo) _retried.delete(s.id);
    OfflineAudio.download(todo.map(_nativeItem));
    return _say(key, '');
  }
  // The first keep asks the browser not to evict this origin's storage under pressure (installed apps usually get it).
  if (!_kept.size) {
    try { const st = navigator.storage; if (st && typeof st.persist === 'function') void st.persist().catch(() => {}); } catch (_e) { /* best-effort */ }
  }
  for (const s of todo) if (_queue.indexOf(s.id) < 0 && _active !== s.id) _queue.push(s.id);
  _say(key, '');
  void _pump();
  return { ok: true, text: '' };
}

/** @param {ArrayBuffer} buf @returns {Promise<string>} lowercase hex SHA-256 */
async function _sha256(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  let hex = '';
  for (const b of new Uint8Array(digest)) hex += (b < 16 ? '0' : '') + b.toString(16);
  return hex;
}

/**
 * Keep one song (web): fetch, check the bytes against the catalog, hash, store, read back, hash the stored copy.
 * A mismatch anywhere deletes the copy and tries once more; a second mismatch throws.
 * @param {string} id
 */
async function _keepOne(id) {
  const s = songById(id);
  const url = s ? songAssetUrl(s) : '';
  const expected = s ? Number(s.b) : 0;
  const st = _store();
  if (!url || !(expected > 0) || expected > MAX_SONG_BYTES || !st) throw new Error('network');
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    _abort = ctl;
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    if (!res.ok) throw new Error('network');
    const buf = await res.arrayBuffer();
    if (buf.byteLength !== expected) { if (attempt) throw new Error('size'); continue; }
    const sha = await _sha256(buf);
    const keptAt = Date.now();
    try {
      await st.put({ id, blob: new Blob([buf], { type: 'audio/mpeg' }), bytes: expected, sha256: sha, keptAt });
    } catch (e) {
      const quota = !!(e && /** @type {any} */ (e).name === 'QuotaExceededError');
      throw new Error(quota ? 'space' : 'check');
    }
    const back = await st.get(id);
    const good = !!back && back.blob.size === expected && (await _sha256(await back.blob.arrayBuffer())) === sha;
    if (!good) {
      try { await st.delete(id); } catch (_e) { /* the next try overwrites it */ }
      if (attempt) throw new Error('check');
      continue;
    }
    _kept.set(id, { blob: back.blob, bytes: expected, keptAt });
    const lib = _library();
    if (lib && typeof lib.setSongsKept === 'function') lib.setSongsKept([id], true);
    return;
  }
}

/** Keep the next waiting song (web), one at a time. */
async function _pump() {
  if (_active || !_queue.length) return;
  const id = /** @type {string} */ (_queue.shift());
  _active = id;
  _notify();
  try {
    await _keepOne(id);
    _failed.delete(id);
  } catch (e) {
    const aborted = !!(e && /** @type {any} */ (e).name === 'AbortError');
    if (!aborted) _failed.set(id, e && /** @type {any} */ (e).message ? String(/** @type {any} */ (e).message) : 'network');
  } finally {
    _active = null;
    _abort = null;
    _notify();
  }
  if (_queue.length) void _pump();
}

/** Stop keeping `ids` (what waits comes off at once; the one on its way stops). @param {string[]} ids */
function cancel(ids) {
  const set = new Set(Array.isArray(ids) ? ids : []);
  if (_native()) {
    const urls = [];
    for (const id of set) {
      const s = songById(id);
      const url = s ? songAssetUrl(s) : '';
      const st = url ? OfflineAudio.statusOf(url) : 'none';
      if (st === 'queued' || st === 'downloading') urls.push(url);
    }
    if (urls.length) OfflineAudio.cancel(urls);
    return;
  }
  _queue = _queue.filter((id) => !set.has(id));
  if (_active && set.has(_active) && _abort) { try { _abort.abort(); } catch (_e) { /* done already */ } }
  _notify();
}

/** Take songs off this phone (their bytes and their place on the backup's list). @param {string[]} ids */
async function remove(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter(isSongId))];
  if (!list.length) return;
  cancel(list);
  const lib = _library();
  if (lib && typeof lib.setSongsKept === 'function') lib.setSongsKept(list, false);
  if (_native()) {
    const songs = _nativeSongs();
    const urls = list.map((id) => { const it = songs.get(id); return it ? it.url : ''; }).filter(Boolean);
    if (urls.length) OfflineAudio.remove(urls);
    _notify();
    return;
  }
  const st = _store();
  for (const id of list) {
    _kept.delete(id);
    _failed.delete(id);
    // The object URL of a song still playing stays alive until the track changes.
    if (st) { try { await st.delete(id); } catch (_e) { /* gone already */ } }
  }
  _notify();
}

/** Every kept song off this phone, and nothing more on its way. */
function removeAll() {
  const busy = _native() ? [] : _queue.concat(_active ? [_active] : []);
  cancel(busy);
  return remove(keptIds());
}

/**
 * Songs the backup lists as kept that are not on this phone (after a restore, or storage the browser cleared) and
 * that the catalog still shares. [] until the catalog is in.
 * @returns {string[]}
 */
function missing() {
  const lib = _library();
  if (!SongCatalog.loaded || !lib || typeof lib.songKept !== 'function') return [];
  if (!_native() && !_loaded) { void _ensureLoaded(); return []; }
  return lib.songKept().filter((id) => {
    const s = songById(id);
    return !!s && !s.hid && !!s.sh && s.b > 0 && statusOf(id) !== 'kept';
  });
}

/**
 * The playable URL of a kept song on the web: an object URL of its stored bytes, ONE alive at a time (asking for
 * another song's revokes the last). '' when it is not kept here, and always in the phone app (native reads the file).
 * @param {unknown} id @returns {string}
 */
function objectUrlFor(id) {
  if (_native() || !isSongId(id) || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  const rec = _kept.get(/** @type {string} */ (id));
  if (!rec) return '';
  if (_live && _live.id === id) return _live.url;
  const url = URL.createObjectURL(rec.blob);
  const old = _live;
  _live = { id: /** @type {string} */ (id), url };
  if (old) _revokeLater(old.url);
  return url;
}

/** The track moved off a kept song: let its object URL go. */
function releaseObjectUrl() {
  if (!_live) return;
  _revokeLater(_live.url);
  _live = null;
}

/** @param {string} url */
function _revokeLater(url) {
  // After the element has moved to its next source.
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_e) { /* gone */ } }, 1000);
}

/** The refusal last shown for a surface, or ''. @param {string} key */
function noteFor(key) {
  return _notes.get(key) || '';
}

/** @param {string} key */
function clearNote(key) {
  if (_notes.delete(key)) _notify();
}

export const SongKeep = {
  /** @param {() => void} cb @returns {() => void} */
  subscribe(cb) {
    _listeners.add(cb);
    _hookNative();
    if (!_loaded) void _ensureLoaded();
    return () => { _listeners.delete(cb); };
  },
  getVersion: () => _version,
  availability,
  isKept,
  keptIds,
  statusOf,
  bytesOf,
  progressOf,
  keep,
  cancel,
  remove,
  removeAll,
  missing,
  objectUrlFor,
  releaseObjectUrl,
  noteFor,
  clearNote,
  /** Resolves once the web's kept songs are read (tests, the boot restore). */
  ready: () => _ensureLoaded(),
  /** Tests only. */
  _reset() {
    _listeners.clear();
    _kept.clear(); _failed.clear(); _notes.clear(); _retried.clear(); _listed.clear(); _dropping.clear(); _redo.clear();
    _queue = []; _active = null; _abort = null; _live = null;
    _loaded = false; _loading = null; _nativeHooked = false; _nativeIndex = null; _version = 0;
  },
};

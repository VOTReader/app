// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   song-votes — 👍 / 👎 on songs: this device's votes, the outbox, the tallies
   ═══════════════════════════════════════════════════════════════════════
   Corbin 2026-10-22 (DECISIONS "Song voting"): one vote per song version,
   changeable, the lit one tapped again clears it. 👎 is PRIVATE: it never
   leaves the device and only lowers the song in this device's own shuffle.
   Only a 👍, or the clearing of one (v: 0), is ever sent, to sync's Worker
   (D:/VOTReader-studio/votes/README.md):

     POST https://votes.votreader.workers.dev/v1/vote
          {install, song, v: 1|0, at, traits: {w, h, dpr, tz}}  -> 204
     400 drop it (malformed) · 429, 5xx or no network: keep it, try later.

   The Worker is idempotent per (install, song, at), so the OUTBOX holds the
   latest state per song and resends freely: from the page (a vote, the link
   coming back, the app shown again), from the service worker's Background
   Sync ('song-votes', service-worker.js drainSongVotes) even with the app
   closed, and in the APK from native WorkManager (AndroidBridge.queueSongVote).

   Kept in IDB's `meta` store (no DB_VERSION bump; the service worker opens
   the same database to drain the outbox): `song-votes` {id: {v, at}},
   `song-votes-outbox` {id: vote body}, `song-votes-install`, the first-👎
   note flag, and `songs-votes` (the last good votes.json).

   The tallies come back as votes.json beside catalog.json, written by each
   daily publish (D:/FlockSync/songs_publish.py): {v: 1, min, songs: {id:
   [liked, liked_last_30d]}, popular: [ids], loved: [ids]}. A 404 (before the
   first publish) is "no votes yet". The app shows no numbers from it, ever
   (no like or play counts): only the order of the Popular and All-time loved
   shelves.

   Bundle-d beside song-catalog.js; bundle-h screens read the `SongVotes`
   global (ui/_entry-d.js), never by import.
   ═══════════════════════════════════════════════════════════════════════ */

import { isSongId } from './audio-track.js';

export const SONG_VOTE_URL = 'https://votes.votreader.workers.dev/v1/vote';
export const SONG_TALLY_URL = 'https://votreader.github.io/songs/votes.json';
/** The Background Sync tag the service worker drains the outbox on. */
export const SONG_VOTE_SYNC_TAG = 'song-votes';

const META = 'meta';
export const SONG_VOTE_KEYS = Object.freeze({
  votes: 'song-votes',
  outbox: 'song-votes-outbox',
  install: 'song-votes-install',
  downNote: 'song-votes-down-note',
  tally: 'songs-votes',
});
const INSTALL_RE = /^[A-Za-z0-9_-]{16,64}$/;
const FETCH_TIMEOUT_MS = 15000;
/** The tallies change once a day: asked again at most this often while the app runs. */
const TALLY_RECHECK_MS = 6 * 3600 * 1000;
/** A vote the Worker would refuse as too old (90 days) is dropped instead of retried forever. */
const MAX_AGE_MS = 89 * 24 * 3600 * 1000;

/** @typedef {1 | -1 | 0} VoteValue */
/** @typedef {{ v: 1 | -1, at: number }} VoteEntry */
/** @typedef {{ w: number, h: number, dpr: number, tz: string }} VoteTraits */
/** @typedef {{ install: string, song: string, v: 1 | 0, at: number, traits?: VoteTraits }} VoteBody */
/** @typedef {{ min: number, songs: Record<string, [number, number]>, popular: string[], loved: string[] }} VoteTally */

/** IDBAdapter is bundle-b, reached at call time (song-catalog's rule). */
const _idb = () => /** @type {any} */ (globalThis).IDBAdapter || null;
/** The APK's bridge when it can take votes (slice 4: native WorkManager sends them). */
const _bridge = () => {
  const b = typeof window !== 'undefined' ? /** @type {any} */ (window).AndroidBridge : null;
  return b && typeof b.queueSongVote === 'function' ? b : null;
};

/* ── state (store contract: subscribe / getVersion) ───────────────────── */

/** @type {Map<string, VoteEntry>} */
let _votes = new Map();
/** @type {Record<string, VoteBody>} */
let _outbox = {};
let _install = '';
let _downNoteSeen = false;
/** @type {VoteTally | null} */
let _tally = null;
let _tallyAt = 0;
let _version = 0;
/** @type {Promise<void> | null} */
let _loadPromise = null;
/** @type {Promise<void> | null} */
let _flushing = null;
/** @type {Promise<void> | null} */
let _tallyLoading = null;
let _gen = 0;
/** @type {(() => void) | null} */
let _unlisten = null;
/** @type {Set<() => void>} */
const _listeners = new Set();

function _bump() {
  _version++;
  for (const cb of _listeners) {
    try { cb(); } catch (e) { console.warn('[votes] subscriber threw', e); }
  }
}

/** @param {string} key @returns {Promise<any>} */
async function _get(key) {
  const idb = _idb();
  if (!idb || typeof idb.get !== 'function') return null;
  try { return await idb.get(META, key); } catch (_e) { return null; }
}

/** @param {string} key @param {unknown} value @returns {Promise<void>} */
async function _put(key, value) {
  const idb = _idb();
  if (!idb || typeof idb.put !== 'function') return;
  try { await idb.put(META, key, value); } catch (_e) { /* best effort: memory still holds it */ }
}

/* ── the install id ───────────────────────────────────────────────────── */

/** 16 random bytes as base64url (22 characters). */
function _randomId() {
  const bytes = new Uint8Array(16);
  const c = /** @type {any} */ (globalThis).crypto;
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The APK's id (ANDROID_ID, hashed, so a reinstall keeps it), else '' . */
function _bridgeInstall() {
  const b = typeof window !== 'undefined' ? /** @type {any} */ (window).AndroidBridge : null;
  if (!b || typeof b.songVoteInstallId !== 'function') return '';
  try { const id = String(b.songVoteInstallId() || ''); return INSTALL_RE.test(id) ? id : ''; } catch (_e) { return ''; }
}

/* ── load ─────────────────────────────────────────────────────────────── */

/** @param {unknown} raw @returns {Map<string, VoteEntry>} */
function _cleanVotes(raw) {
  /** @type {Map<string, VoteEntry>} */
  const out = new Map();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, e] of Object.entries(/** @type {Record<string, any>} */ (raw))) {
    if (!isSongId(id) || !e || (e.v !== 1 && e.v !== -1)) continue;
    out.set(id, { v: e.v, at: Number(e.at) || 0 });
  }
  return out;
}

/** @param {unknown} raw @returns {Record<string, VoteBody>} */
function _cleanOutbox(raw) {
  /** @type {Record<string, VoteBody>} */
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, b] of Object.entries(/** @type {Record<string, any>} */ (raw))) {
    if (isSongId(id) && b && b.song === id && (b.v === 1 || b.v === 0) && Number.isFinite(b.at)) out[id] = b;
  }
  return out;
}

/**
 * Read this device's votes, the outbox and the install id (once), then try to
 * send what waits. Resolves when the votes are in memory.
 * @returns {Promise<void>}
 */
export function loadSongVotes() {
  _listen();
  if (_loadPromise) return _loadPromise;
  const gen = _gen;
  _loadPromise = (async () => {
    const [votes, outbox, install, note] = await Promise.all([
      _get(SONG_VOTE_KEYS.votes), _get(SONG_VOTE_KEYS.outbox), _get(SONG_VOTE_KEYS.install), _get(SONG_VOTE_KEYS.downNote),
    ]);
    if (gen !== _gen) return;
    // A vote cast before the load finished stands over the stored one.
    const stored = _cleanVotes(votes);
    for (const [id, e] of _votes) stored.set(id, e);
    _votes = stored;
    _outbox = Object.assign(_cleanOutbox(outbox), _outbox);
    _downNoteSeen = _downNoteSeen || note === true;
    _install = _bridgeInstall() || (typeof install === 'string' && INSTALL_RE.test(install) ? install : '') || _install;
    if (!_install) { _install = _randomId(); void _put(SONG_VOTE_KEYS.install, _install); }
    // A vote cast before the load finished may carry a stand-in id: every waiting vote speaks as this install.
    for (const body of Object.values(_outbox)) body.install = _install;
    _bump();
    void flushSongVotes();
  })();
  return _loadPromise;
}

/** The link coming back, or the app shown again, sends what waits. Once per process. */
function _listen() {
  if (_unlisten || typeof window === 'undefined' || typeof document === 'undefined') return;
  const onOnline = () => { void flushSongVotes(); };
  const onShow = () => { if (document.visibilityState !== 'hidden') void flushSongVotes(); };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onShow);
  _unlisten = () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onShow);
  };
}

/* ── votes ────────────────────────────────────────────────────────────── */

/** This device's vote on a song: 1 liked, -1 not for me, 0 none. @param {unknown} id @returns {VoteValue} */
export function voteOf(id) {
  const e = typeof id === 'string' ? _votes.get(id) : null;
  return e ? e.v : 0;
}

/** The coarse traits a sent vote carries (the Worker's soft same-device dedupe), nothing else. @returns {VoteTraits} */
export function voteTraits() {
  const s = typeof screen !== 'undefined' ? screen : null;
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_e) { /* none */ }
  return {
    w: s ? Number(s.width) || 0 : 0,
    h: s ? Number(s.height) || 0 : 0,
    dpr: typeof devicePixelRatio === 'number' ? Math.round(devicePixelRatio * 100) / 100 : 1,
    tz: tz.slice(0, 40),
  };
}

/**
 * What a change of vote sends: a 👍 sends 1; leaving a 👍 (cleared, or turned
 * into 👎) sends 0; anything else about 👎 sends nothing (it never leaves).
 * @param {VoteValue} from @param {VoteValue} to @returns {1 | 0 | null}
 */
export function voteToSend(from, to) {
  if (to === 1) return from === 1 ? null : 1;
  return from === 1 ? 0 : null;
}

/**
 * Set this device's vote on a song (1, -1 or 0 to clear). Shows at once,
 * is saved on the device, and a 👍 or its clearing goes to the outbox.
 * @param {string} id @param {VoteValue} v @param {number} [now] @returns {VoteValue} the vote now
 */
export function setSongVote(id, v, now) {
  if (!isSongId(id) || (v !== 1 && v !== -1 && v !== 0)) return voteOf(id);
  if (!_loadPromise) void loadSongVotes();
  const from = voteOf(id);
  if (from === v) return v;
  const at = Math.max(Number(now) || Date.now(), 1);
  if (v) _votes.set(id, { v, at }); else _votes.delete(id);
  void _put(SONG_VOTE_KEYS.votes, Object.fromEntries(_votes));
  const send = voteToSend(from, v);
  if (send !== null) {
    if (!_install) _install = _bridgeInstall() || _randomId();
    _outbox[id] = { install: _install, song: id, v: send, at, traits: voteTraits() };
    // The id is stored by the load (which reads the stored one first); a vote before it carries a stand-in.
    void _put(SONG_VOTE_KEYS.outbox, _outbox);
  }
  _bump();
  if (send !== null) void flushSongVotes();
  return v;
}

/**
 * A tap on one of the pair: the lit one clears, the other takes its place.
 * @param {string} id @param {1 | -1} which @returns {VoteValue}
 */
export function tapSongVote(id, which) {
  return setSongVote(id, voteOf(id) === which ? 0 : which);
}

/** Songs this device marked 👎 (they play less in its shuffle). @returns {string[]} */
export function downVotedIds() {
  const out = [];
  for (const [id, e] of _votes) if (e.v === -1) out.push(id);
  return out;
}

/** Songs this device liked, the newest like first (the Songs hub's Liked Songs, so-liked 10-24). @returns {string[]} */
export function likedSongIds() {
  const out = [];
  for (const [id, e] of _votes) if (e.v === 1) out.push([id, e.at]);
  return out.sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}

/** Has the one-time "Only you see this" note been shown on this install? */
export function downNoteSeen() { return _downNoteSeen; }

export function markDownNoteSeen() {
  if (_downNoteSeen) return;
  _downNoteSeen = true;
  void _put(SONG_VOTE_KEYS.downNote, true);
  _bump();
}

/* ── the outbox ───────────────────────────────────────────────────────── */

/**
 * Send one vote. 'sent' (2xx), 'drop' (400 or too old: the Worker will never take it), or 'keep' (429, 5xx, no
 * network). Shared with the service worker's copy in spirit (service-worker.js postSongVote).
 * @param {VoteBody} body @param {number} [now] @returns {Promise<'sent' | 'drop' | 'keep'>}
 */
export async function postSongVote(body, now) {
  if ((Number(now) || Date.now()) - body.at > MAX_AGE_MS) return 'drop';
  const f = /** @type {any} */ (globalThis).fetch;
  if (typeof f !== 'function') return 'keep';
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await f(SONG_VOTE_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store', keepalive: true, signal: ctrl ? ctrl.signal : undefined,
    });
    if (res && res.status >= 200 && res.status < 300) return 'sent';
    if (res && res.status === 400) return 'drop';
    return 'keep';
  } catch (_e) {
    return 'keep';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Ask the service worker to send the outbox when the link is back, even with the app closed (PWA only). */
function _registerSync() {
  try {
    const sw = typeof navigator !== 'undefined' ? /** @type {any} */ (navigator).serviceWorker : null;
    if (!sw || !sw.ready) return;
    Promise.resolve(sw.ready).then((reg) => {
      if (reg && reg.sync && typeof reg.sync.register === 'function') return reg.sync.register(SONG_VOTE_SYNC_TAG);
      return undefined;
    }).catch(() => {});
  } catch (_e) { /* no Background Sync: the page sends on the next open */ }
}

/** Remove a sent or dropped vote, unless a newer one for the song took its place meanwhile. @param {VoteBody} body */
function _settleSent(body) {
  const cur = _outbox[body.song];
  if (cur && cur.at === body.at && cur.v === body.v) delete _outbox[body.song];
}

/**
 * Send what waits in the outbox, oldest first; stop at the first one the
 * Worker or the network turns away (it waits for the next try). In the APK
 * the votes go to native WorkManager instead, which sends them with the app
 * closed. One run at a time.
 * @returns {Promise<void>}
 */
export function flushSongVotes() {
  if (_flushing) return _flushing;
  const gen = _gen;
  _flushing = (async () => {
    // A tick first: an empty run must not clear _flushing before the assignment below has made it.
    await Promise.resolve();
    try {
      const list = Object.values(_outbox).sort((a, b) => a.at - b.at);
      if (!list.length) return;
      const bridge = _bridge();
      let kept = false;
      for (const body of list) {
        if (bridge) {
          // Native keeps it and sends it (true); false = not a vote it will ever send (drop); a throw = try later.
          try { bridge.queueSongVote(JSON.stringify(body)); } catch (_e) { kept = true; break; }
          _settleSent(body);
          continue;
        }
        const r = await postSongVote(body);
        if (gen !== _gen) return;
        if (r === 'keep') { kept = true; break; }
        _settleSent(body);
      }
      await _put(SONG_VOTE_KEYS.outbox, _outbox);
      if (kept && !bridge) _registerSync();
    } finally {
      if (gen === _gen) _flushing = null;
    }
  })();
  return _flushing;
}

/** What waits to be sent (tests, and a look from the console). @returns {VoteBody[]} */
export function pendingSongVotes() { return Object.values(_outbox); }

/* ── the tallies (votes.json) ─────────────────────────────────────────── */

/** @param {unknown} v @returns {string[]} */
const _ids = (v) => (Array.isArray(v) ? v.filter(isSongId).slice(0, 2000) : []);

/**
 * Validate a votes.json. Null when it is not one this build reads.
 * @param {unknown} raw @returns {VoteTally | null}
 */
export function normalizeSongTally(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = /** @type {any} */ (raw);
  if (r.v !== 1) return null;
  /** @type {Record<string, [number, number]>} */
  const songs = {};
  if (r.songs && typeof r.songs === 'object' && !Array.isArray(r.songs)) {
    for (const [id, pair] of Object.entries(r.songs)) {
      if (isSongId(id) && Array.isArray(pair)) songs[id] = [Math.max(0, Number(pair[0]) || 0), Math.max(0, Number(pair[1]) || 0)];
    }
  }
  const min = Number(r.min);
  return { min: Number.isFinite(min) && min > 0 ? min : 3, songs, popular: _ids(r.popular), loved: _ids(r.loved) };
}

/** @returns {Promise<{ raw: unknown } | 'none' | null>} the file, 'none' (404: no votes published yet), or null (failed) */
async function _fetchTally() {
  const f = /** @type {any} */ (globalThis).fetch;
  if (typeof f !== 'function') return null;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await f(SONG_TALLY_URL, { cache: 'no-cache', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined });
    if (res && res.status === 404) return 'none';
    if (!res || !res.ok) return null;
    return { raw: JSON.parse(await res.text()) };
  } catch (_e) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Load the tallies: network first, the last good copy when it fails. A 404
 * (nothing published yet) is an empty tally: Popular shows its empty card.
 * Asked again at most every TALLY_RECHECK_MS.
 * @returns {Promise<void>}
 */
export function loadSongTally() {
  if (_tallyLoading) return _tallyLoading;
  if (_tally && Date.now() - _tallyAt < TALLY_RECHECK_MS) return Promise.resolve();
  const gen = _gen;
  _tallyLoading = (async () => {
    await Promise.resolve();
    try {
      _tallyAt = Date.now();
      const fresh = await _fetchTally();
      if (gen !== _gen) return;
      const next = fresh === 'none' ? { min: 3, songs: {}, popular: [], loved: [] } : fresh ? normalizeSongTally(fresh.raw) : null;
      if (next) {
        _tally = next;
        if (fresh !== 'none') void _put(SONG_VOTE_KEYS.tally, /** @type {any} */ (fresh).raw);
        _bump();
        return;
      }
      if (!_tally) {
        const last = normalizeSongTally(await _get(SONG_VOTE_KEYS.tally));
        if (gen !== _gen) return;
        _tally = last || { min: 3, songs: {}, popular: [], loved: [] };
        _tallyAt = Date.now() - TALLY_RECHECK_MS + 60 * 1000;   // a failed ask may run again in a minute
        _bump();
      }
    } finally {
      if (gen === _gen) _tallyLoading = null;
    }
  })();
  return _tallyLoading;
}

/** Popular (liked lately, real agreement), ranked, one version per family. @returns {string[]} */
export function popularSongIds() { return _tally ? _tally.popular : []; }
/** All-time loved, ranked, one version per family. @returns {string[]} */
export function lovedSongIds() { return _tally ? _tally.loved : []; }

/* ── the store ────────────────────────────────────────────────────────── */

/** Test seam: forget everything in memory. */
export function _resetSongVotesForTests() {
  _votes = new Map();
  _outbox = {};
  _install = '';
  _downNoteSeen = false;
  _tally = null;
  _tallyAt = 0;
  _version = 0;
  _loadPromise = null;
  _flushing = null;
  _tallyLoading = null;
  _gen++;
  _listeners.clear();
  if (_unlisten) { _unlisten(); _unlisten = null; }
}

/** The one vote store. Bundle-h reads it as the `SongVotes` global. */
export const SongVotes = {
  /** @param {() => void} cb @returns {() => void} */
  subscribe(cb) { _listeners.add(cb); return () => { _listeners.delete(cb); }; },
  getVersion() { return _version; },
  load: loadSongVotes,
  loadTally: loadSongTally,
  get tallyLoaded() { return !!_tally; },
  voteOf,
  setVote: setSongVote,
  tap: tapSongVote,
  downVotedIds,
  likedIds: likedSongIds,
  downNoteSeen,
  markDownNoteSeen,
  flush: flushSongVotes,
  pending: pendingSongVotes,
  popularIds: popularSongIds,
  lovedIds: lovedSongIds,
};

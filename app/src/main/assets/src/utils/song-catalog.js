// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   song-catalog — Songs of the Letters: host, lookups, queue order (bundle-d)
   ═══════════════════════════════════════════════════════════════════════
   The flock's songs are NOT scripture and NOT readings (design:
   D:/Swarm/calls/ai-music/README.md §1): they ride the one AudioPlayer under
   their own `song:<id>` keys and never take a letter's. This module is the
   third audio registry beside audio-manifest.js (letters) and the Bible
   editions (audio-track.js): the host the mp3s live on, the catalog lookups
   the bar, the desk and the library screens need, and THE queue order a songs
   queue is built in — one pure function, so a fresh queue and its boot rebuild
   cannot disagree.

   The catalog is published beside the shards (contract:
   D:/Swarm/calls/ai-music/catalog-schema.md, schema 1) and is DATA, never a
   corpus file: it is not in src/data, so it never joins the CORPUS_VERSION
   fingerprint, and a daily catalog change costs nobody an 11 MB re-download.

   It lives in bundle-d beside the player that reads it. Bundle-h screens must
   reach it as the `SongCatalog` global (ui/_entry-d.js), never by import: a
   second bundled copy would be a second catalog state.
   ═══════════════════════════════════════════════════════════════════════ */

import { SONG_KEY_PREFIX, isSongId, isSongKey, isSongUrl, songIdOfKey } from './audio-track.js';

export { isSongKey };

/** The catalog schema this build reads. A catalog whose MAJOR differs is
 *  refused and the last good copy stays (catalog-schema.md "App side"). */
export const SONG_CATALOG_SCHEMA = 1;

/** THE host: GitHub Pages shard sites (Corbin, 2026-09-24). One origin holds
 *  the catalog, thumbs and lyrics (`/songs/`) and the mp3 shards
 *  (`/songs-<sh>/`). audio-track.js's exact song pattern is the trust
 *  boundary this has to satisfy; songAssetUrl re-checks it. */
export const SONGS_HOST = Object.freeze({
  id: 'pages',
  origin: 'https://votreader.github.io',
  catalogUrl: 'https://votreader.github.io/songs/catalog.json',
});

/** Shelf labels for the family collections that are not a letter collection. */
const COL_LABELS = Object.freeze({
  bible: 'Bible songs',
  inspired: 'Inspired by the letters',
  originals: 'Flock originals',
  prayers: 'Flock prayers',
});
const DEFAULT_ALBUM = 'Songs of the Letters';
const SRC_KINDS = ['letter', 'bible', 'study', 'none'];
const DELIVERIES = ['sung', 'spoken', 'instrumental'];
/** The filter vocabulary a songs queue descriptor may carry — all strings, so
 *  a restored snapshot can be validated key by key. */
const FILTER_KEYS = ['col', 'style', 'letter', 'family', 'q', 'lang', 'dl'];

/**
 * @typedef {{ k: string, id: string, c: string }} SongSource
 * @typedef {{ id: string, t: string, f: string, v: string, st: string[], dl: string, lang: string | null,
 *   src: SongSource, d: number, b: number, sh: number, cr: string | null, lyr: number, rd: string | null,
 *   fs: string, hid: boolean, dup: string | null, vb: number | null, vs: boolean }} Song
 * @typedef {{ id: string, t: string, feat: string, n: number, col: string, src: SongSource, lb: string,
 *   vs: boolean, vfeat: string, nvs: number }} SongFamily
 * @typedef {{ key: string, song: string | null, d: number }} SongReading
 * @typedef {{ schema: number, version: string, generated: string, songs: Song[], families: SongFamily[],
 *   readings: SongReading[], styles: Record<string, string>,
 *   byId: Map<string, Song>, famById: Map<string, SongFamily>, versions: Map<string, Song[]> }} SongCatalogData
 * @typedef {{ col?: string, style?: string, letter?: string, family?: string, q?: string, lang?: string, dl?: string }} SongFilter
 */

/* ── host ─────────────────────────────────────────────────────────────── */

/**
 * The mp3 URL of a song, from its id and shard — or '' when either is missing
 * or the result would fall outside the trust boundary.
 * @param {{ id?: unknown, sh?: unknown } | null | undefined} song
 * @returns {string}
 */
export function songAssetUrl(song) {
  const id = song && song.id;
  const sh = song && Number(song.sh);
  if (!isSongId(id) || !Number.isInteger(sh) || sh < 1) return '';
  const url = SONGS_HOST.origin + '/songs-' + sh + '/' + id + '.mp3';
  return isSongUrl(url) ? url : '';
}

/**
 * The square cover thumb the publisher cuts for every song (256 or 512 px).
 * @param {{ id?: unknown } | null | undefined} song
 * @param {number} [px]
 * @returns {string}
 */
export function songThumbUrl(song, px) {
  const id = song && song.id;
  if (!isSongId(id)) return '';
  return SONGS_HOST.origin + '/songs/thumbs/' + (px === 256 ? 256 : 512) + '/' + id + '.webp';
}

/* ── the loaded catalog (store contract: subscribe / getVersion) ─────── */

/** @type {SongCatalogData | null} */
let _catalog = null;
let _error = false;
let _version = 0;
/** @type {Set<() => void>} */
const _listeners = new Set();

function _bump() {
  _version++;
  for (const cb of _listeners) {
    try { cb(); } catch (e) { console.warn('[songs] subscriber threw', e); }
  }
}

/** @param {unknown} v @param {number} max @returns {string} */
const _str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** @param {unknown} v @returns {number} */
const _num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/** @param {unknown} v @returns {SongSource} */
function _source(v) {
  const raw = v && typeof v === 'object' ? /** @type {any} */ (v) : {};
  const k = SRC_KINDS.indexOf(raw.k) >= 0 ? raw.k : 'none';
  return { k, id: k === 'none' ? '' : _str(raw.id, 240), c: raw.c === 'h' || raw.c === 'm' ? raw.c : 'l' };
}

/** A source link is SHOWN only at high or medium confidence (README §1.4). */
function _shown(src) { return src.k !== 'none' && !!src.id && (src.c === 'h' || src.c === 'm'); }

/** @param {any} raw @returns {Song | null} */
function _song(raw) {
  if (!raw || typeof raw !== 'object' || !isSongId(raw.id)) return null;
  const sh = Number(raw.sh);
  return {
    id: raw.id,
    t: _str(raw.t, 240) || 'Untitled song',
    f: _str(raw.f, 160),
    v: _str(raw.v, 120),
    st: Array.isArray(raw.st) ? raw.st.filter((s) => typeof s === 'string' && s).slice(0, 16) : [],
    dl: DELIVERIES.indexOf(raw.dl) >= 0 ? raw.dl : 'sung',
    lang: _str(raw.lang, 12) || null,
    src: _source(raw.src),
    d: _num(raw.d),
    b: _num(raw.b),
    sh: Number.isInteger(sh) && sh > 0 ? sh : 0,
    cr: _str(raw.cr, 80) || null,
    lyr: raw.lyr === 1 || raw.lyr === 2 ? raw.lyr : 0,
    rd: _str(raw.rd, 240) || null,
    fs: _str(raw.fs, 32),
    hid: raw.hid === true,
    dup: isSongId(raw.dup) ? raw.dup : null,
    // The verbatim gate (catalog-schema.md): the song sings the letter's or the scripture's own words. Only a
    // literal `true` passes, so an older cached catalog without `vs` offers no "Hear it sung" and makes no claim.
    vb: typeof raw.vb === 'number' && raw.vb >= 0 && raw.vb <= 1 ? raw.vb : null,
    vs: raw.vs === true,
  };
}

/** @param {any} raw @returns {SongFamily | null} */
function _family(raw) {
  const id = raw && typeof raw === 'object' ? _str(raw.id, 160) : '';
  if (!id) return null;
  return {
    id, t: _str(raw.t, 240) || 'Untitled song', feat: isSongId(raw.feat) ? raw.feat : '',
    n: Math.floor(_num(raw.n)), col: _str(raw.col, 40), src: _source(raw.src), lb: _str(raw.lb, 60),
    vs: raw.vs === true, vfeat: isSongId(raw.vfeat) ? raw.vfeat : '', nvs: Math.floor(_num(raw.nvs)),
  };
}

/**
 * The schema MAJOR a catalog declares, or NaN. `1`, `1.3` and `"1.3"` are all major 1.
 * @param {unknown} schema @returns {number}
 */
function _major(schema) {
  const n = typeof schema === 'string' ? Number(schema.split('.')[0]) : Math.floor(Number(schema));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validate and index a raw catalog. Null when it is not one this build reads.
 * @param {unknown} value @returns {SongCatalogData | null}
 */
export function normalizeSongCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = /** @type {any} */ (value);
  if (_major(raw.schema) !== SONG_CATALOG_SCHEMA || !Array.isArray(raw.songs)) return null;
  /** @type {Map<string, Song>} */
  const byId = new Map();
  for (const row of raw.songs) {
    const song = _song(row);
    if (song && !byId.has(song.id)) byId.set(song.id, song);
  }
  if (!byId.size) return null;
  const songs = Array.from(byId.values());
  /** @type {Map<string, SongFamily>} */
  const famById = new Map();
  for (const row of Array.isArray(raw.families) ? raw.families : []) {
    const fam = _family(row);
    if (fam && !famById.has(fam.id)) famById.set(fam.id, fam);
  }
  /** @type {Map<string, Song[]>} */
  const versions = new Map();
  for (const song of songs) {
    if (!song.f) continue;
    if (!famById.has(song.f)) famById.set(song.f, { id: song.f, t: song.t, feat: '', n: 0, col: '', src: song.src, lb: '', vs: false, vfeat: '', nvs: 0 });
    const list = versions.get(song.f);
    if (list) list.push(song); else versions.set(song.f, [song]);
  }
  /** @type {Record<string, string>} */
  const styles = {};
  if (raw.styles && typeof raw.styles === 'object') {
    for (const k of Object.keys(raw.styles)) { const label = _str(raw.styles[k], 60); if (label) styles[k] = label; }
  }
  const readings = (Array.isArray(raw.readings) ? raw.readings : [])
    .filter((r) => r && typeof r.key === 'string' && r.key)
    .map((r) => ({ key: _str(r.key, 240), song: isSongId(r.song) ? r.song : null, d: _num(r.d) }));
  return {
    schema: SONG_CATALOG_SCHEMA, version: _str(raw.version, 64), generated: _str(raw.generated, 64),
    songs, families: Array.from(famById.values()), readings, styles, byId, famById, versions,
  };
}

/**
 * Make a raw catalog the live one. REFUSES (returns false, changes nothing)
 * anything normalizeSongCatalog rejects — an unknown schema major above all —
 * so a bad publish can never replace a good copy.
 * @param {unknown} value @returns {boolean}
 */
export function adoptSongCatalog(value) {
  const next = normalizeSongCatalog(value);
  if (!next) return false;
  _catalog = next;
  _adoptedPrint = '';   // _adoptFresh stamps it when the bytes came from the network
  _error = false;
  _bump();
  return true;
}

/* ── the loader: network first, the last good copy kept ───────────────────
   Once per launch (catalog-schema.md "App side"), and again while the app runs
   (n3-06, _recheckSoon below): fetch the published catalog
   from the network; adopt it and keep it as the LAST GOOD COPY in IDB (the
   `meta` store, the one store the backup exempts: this is not user data).
   When the network fails — offline, a 404, a timeout — or answers with a
   catalog this build refuses (an unknown schema major), adopt the last good
   copy instead, so a bad publish or a tunnel never empties the Songs shelf.
   The PWA's service worker answers this URL network-first (n3-06; its copy
   only when the network fails or takes over 4 s), so a takedown shows on the
   launch after it is published, not the one after that.
   Async-notify-only, like the lazy corpora (ARCHITECTURE "Lazy corpora"):
   load() never bumps synchronously, so a render-phase kick is safe. */

const LAST_GOOD_STORE = 'meta';
const LAST_GOOD_KEY = 'songs-catalog';
/** A wedged request must not hold the shelf hostage; the last good copy answers. */
const FETCH_TIMEOUT_MS = 15000;
/** @type {Promise<boolean> | null} */
let _loadPromise = null;

/** IDBAdapter is bundle-b, reached at call time (the audio snapshot's rule). */
const _idb = () => /** @type {any} */ (globalThis).IDBAdapter || null;

/* n3-06: the catalog is checked again while the app runs, not only once per
   process: a takedown or a new song otherwise waited for a cold launch (never,
   in an APK left running for days). Again when the reader comes back to the app,
   when the link returns, and when a screen asks load() — at most once per
   RECHECK_MS, never while the page is hidden. The same bytes again change
   nothing (no redraw, no IDB write); a failed check keeps what is loaded. */
export const SONG_CATALOG_RECHECK_MS = 30 * 60 * 1000;
/** A check that got no fresh answer may run again this soon (on the next trigger). */
const RETRY_MS = 60 * 1000;
/** The PWA's service worker marks an answer from its copy (offline, slow, a bad
    answer) with this header (service-worker.js networkFirstCatalog): not fresh. */
const FALLBACK_HEADER = 'X-VOT-Fallback';
/** When the network was last asked, ms (moved back after a check with no fresh answer: _settle). */
let _checkedAt = 0;
/** The last ask got no fresh answer (offline, a 404, not JSON, the worker's copy): the link coming back asks again at once. */
let _lastFailed = false;
/** Bumped by the test reset, so a check still in flight never writes into the next test. */
let _gen = 0;
/** Fingerprint of the bytes of the catalog adopted from the network, '' until one is. */
let _adoptedPrint = '';
/** @type {Promise<void> | null} */
let _recheck = null;
/** @type {(() => void) | null} */
let _unlisten = null;

/** A cheap fingerprint (FNV-1a over the text, plus its length): equal bytes, equal print. @param {string} s */
function _print(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return s.length + ':' + (h >>> 0).toString(36);
}

/** @returns {Promise<{ raw: unknown, print: string, stale: boolean } | null>} the catalog JSON, its print, and
    whether it is the service worker's copy rather than the network's; null when there is none */
async function _fetchCatalog() {
  const f = /** @type {any} */ (globalThis).fetch;
  if (typeof f !== 'function') return null;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await f(SONGS_HOST.catalogUrl, { cache: 'no-cache', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined });
    if (!res || !res.ok) return null;
    const text = await res.text();
    const stale = !!(res.headers && typeof res.headers.get === 'function' && res.headers.get(FALLBACK_HEADER) === '1');
    return { raw: JSON.parse(text), print: _print(text), stale };
  } catch (_e) {
    return null;   // offline, blocked, aborted, or not JSON — the last good copy answers
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** @returns {Promise<unknown>} */
async function _readLastGood() {
  const idb = _idb();
  if (!idb || typeof idb.get !== 'function') return null;
  try { return await idb.get(LAST_GOOD_STORE, LAST_GOOD_KEY); } catch (_e) { return null; }
}

/** @param {unknown} raw */
function _keepLastGood(raw) {
  const idb = _idb();
  if (!idb || typeof idb.put !== 'function') return;
  try { Promise.resolve(idb.put(LAST_GOOD_STORE, LAST_GOOD_KEY, raw)).catch(() => {}); } catch (_e) { /* best-effort */ }
}

/** @param {unknown} v @returns {number} a publish stamp's time, NaN when there is none */
const _stamp = (v) => (typeof v === 'string' && v ? Date.parse(v) : NaN);

/**
 * Adopt a network answer unless it is the bytes already adopted, or OLDER than
 * the catalog loaded (its `generated` stamp: a CDN edge or the worker's copy
 * must never undo a takedown). True when a catalog stands in memory.
 * @param {{ raw: unknown, print: string }} fresh
 */
function _adoptFresh(fresh) {
  if (_catalog && fresh.print === _adoptedPrint) return true;
  if (_catalog) {
    const raw = fresh.raw && typeof fresh.raw === 'object' ? /** @type {any} */ (fresh.raw) : {};
    if (_stamp(raw.generated) < _stamp(_catalog.generated)) return true;
  }
  if (!adoptSongCatalog(fresh.raw)) return false;
  _adoptedPrint = fresh.print;
  _keepLastGood(fresh.raw);
  return true;
}

const _hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * Record how a check went. With no fresh answer the next trigger may try again
 * after RETRY_MS, and the link coming back ('online') tries at once.
 * @param {{ stale: boolean } | null} fresh
 */
function _settle(fresh) {
  _lastFailed = !fresh || fresh.stale;
  if (_lastFailed) _checkedAt = Date.now() - SONG_CATALOG_RECHECK_MS + RETRY_MS;
}

/**
 * Check the network again when the last check is RECHECK_MS old (or `force`,
 * for the link coming back after a failed check). Only once a catalog is
 * loaded, and only while the page is seen; concurrent asks share one request.
 * @param {boolean} [force]
 */
function _recheckSoon(force) {
  if (!_catalog || _recheck || _hidden()) return;
  if (!force && Date.now() - _checkedAt < SONG_CATALOG_RECHECK_MS) return;
  _checkedAt = Date.now();
  const gen = _gen;
  /** @type {Promise<void>} */
  const run = (async () => {
    try {
      const fresh = await _fetchCatalog();
      if (gen !== _gen) return;
      _settle(fresh);
      if (fresh) _adoptFresh(fresh);
    } finally {
      if (_recheck === run) _recheck = null;
    }
  })();
  _recheck = run;
}

/** Coming back to the app, or the link coming back, re-checks. Once per process. */
function _listen() {
  if (_unlisten || typeof document === 'undefined' || typeof window === 'undefined') return;
  const onShow = () => { if (!_hidden()) _recheckSoon(false); };
  // The link coming back: a check with no fresh answer runs again at once, and
  // a launch that found no catalog anywhere tries again.
  const onOnline = () => { if (!_catalog && _error) void loadSongCatalog(); else _recheckSoon(_lastFailed); };
  document.addEventListener('visibilitychange', onShow);
  window.addEventListener('online', onOnline);
  _unlisten = () => {
    document.removeEventListener('visibilitychange', onShow);
    window.removeEventListener('online', onOnline);
  };
}

/**
 * Make the catalog available: network first, then the last good copy.
 * Resolves true when a catalog is loaded. Once it has succeeded it answers at
 * once from memory, and re-checks the network in the background when the last
 * check is RECHECK_MS old (n3-06); a load that found nothing anywhere (first
 * launch, offline) is retried by the next call, and flags `error` meanwhile.
 * @returns {Promise<boolean>}
 */
export function loadSongCatalog() {
  _listen();
  if (_loadPromise) {
    if (_catalog) _recheckSoon(false);
    return _loadPromise;
  }
  const run = (async () => {
    _checkedAt = Date.now();
    const fresh = await _fetchCatalog();
    _settle(fresh);
    if (fresh && _adoptFresh(fresh)) return true;
    // The network failed or published a catalog this build refuses: the copy
    // already in memory stands; else the last good one from IDB.
    if (!_catalog) {
      const last = await _readLastGood();
      if (last) adoptSongCatalog(last);
    }
    if (!_catalog) {
      _error = true;
      _bump();
      _loadPromise = null;   // nothing anywhere: the next ask tries again
    }
    return !!_catalog;
  })();
  _loadPromise = run;
  return run;
}

/* ── lookups ──────────────────────────────────────────────────────────── */

/** Every catalog song, hidden rows included. @returns {Song[]} */
function songs() { return _catalog ? _catalog.songs : []; }

/** Every family, in catalog order. @returns {SongFamily[]} */
function families() { return _catalog ? _catalog.families : []; }

/** A song by id, HIDDEN ROWS INCLUDED — a saved or kept id must still resolve
 *  (catalog-schema.md: `hid`). Null when unknown. @param {unknown} id @returns {Song | null} */
export function songById(id) {
  return (_catalog && typeof id === 'string' && _catalog.byId.get(id)) || null;
}

/** @param {unknown} id @returns {SongFamily | null} */
export function familyById(id) {
  return (_catalog && typeof id === 'string' && _catalog.famById.get(id)) || null;
}

/** @param {Song | null | undefined} song @returns {boolean} */
function _visible(song) { return !!song && !song.hid && !!song.sh; }

/**
 * The visible versions of a family, FEATURED FIRST, then catalog order.
 * @param {SongFamily | null | undefined} family @returns {Song[]}
 */
export function versionsOf(family) {
  const list = family && _catalog ? (_catalog.versions.get(family.id) || []).filter(_visible) : [];
  const at = list.findIndex((s) => s.id === family.feat);
  return at > 0 ? [list[at]].concat(list.slice(0, at), list.slice(at + 1)) : list;
}

/**
 * The family's featured version (the flock's first take), or its first
 * visible version when the featured one is hidden. Null when none is visible.
 * @param {SongFamily | null | undefined} family @returns {Song | null}
 */
export function featuredOf(family) {
  return versionsOf(family)[0] || null;
}

/**
 * A filter any caller or restored snapshot hands in, reduced to the known
 * keys with bounded string values. `{}` means every song.
 * @param {unknown} value @returns {SongFilter}
 */
export function normalizeSongFilter(value) {
  /** @type {any} */
  const out = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of FILTER_KEYS) {
      const v = _str(/** @type {any} */ (value)[k], 120);
      if (v) out[k] = v;
    }
  }
  return out;
}

/** Song-level predicates of a filter (style, letter, language, delivery). @param {Song} s @param {SongFilter} f */
function _songMatches(s, f) {
  if (!_visible(s)) return false;
  if (f.style && s.st.indexOf(f.style) < 0 && s.dl !== f.style && !(f.style === 'spanish' && s.lang === 'es')) return false;
  if (f.letter && !(s.src.k === 'letter' && s.src.id === f.letter && _shown(s.src))) return false;
  if (f.lang && s.lang !== f.lang) return false;
  if (f.dl && s.dl !== f.dl) return false;
  return true;
}

/** Family-level predicates (collection, family, words). @param {SongFamily} fam @param {SongFilter} f */
function _familyMatches(fam, f) {
  if (f.col && fam.col !== f.col) return false;
  if (f.family && fam.id !== f.family) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [fam.t].concat(versionsOf(fam).map((s) => s.t + ' ' + s.v + ' ' + (s.cr || ''))).join(' ').toLowerCase();
    if (hay.indexOf(q) < 0) return false;
  }
  return true;
}

/** @param {SongFamily} fam @param {SongFilter} f @returns {Song[]} */
function _matchingVersions(fam, f) {
  return versionsOf(fam).filter((s) => _songMatches(s, f));
}

/**
 * Families with at least one visible version the filter admits, in catalog order.
 * @param {unknown} filter @returns {SongFamily[]}
 */
export function familiesFor(filter) {
  const f = normalizeSongFilter(filter);
  return families().filter((fam) => _familyMatches(fam, f) && _matchingVersions(fam, f).length > 0);
}

/**
 * Does this song sing the letter's or the scripture's own words, verbatim
 * (catalog-schema.md "verbatim gate", Corbin 2026-09-25)? False for an
 * interpretation, for a song not judged yet, and for any row of an older
 * catalog that has no `vs`.
 * @param {Song | null | undefined} song @returns {boolean}
 */
export function isVerbatimSong(song) {
  return !!song && song.vs === true;
}

/**
 * The songs made from one letter (`volKey:letterId`), medium or high
 * confidence only — low is never shown (README §1.4). Grouped by family,
 * featured first.
 *
 * `{ verbatim: true }` keeps only the songs that sing the letter's own words
 * (the "Hear it sung" pill and the letter's songs card): a family with none
 * drops out, and each family leads with its `vfeat` (the version "Hear it
 * sung" plays), then its other verbatim versions.
 * @param {unknown} letterKey @param {{ verbatim?: boolean }} [opts] @returns {Song[]}
 */
export function songsForLetter(letterKey, opts) {
  if (typeof letterKey !== 'string' || !letterKey) return [];
  const verbatim = !!(opts && opts.verbatim === true);
  const f = { letter: letterKey };
  /** @type {Song[]} */
  const out = [];
  for (const fam of familiesFor(f)) {
    let list = _matchingVersions(fam, f);
    if (verbatim) {
      list = list.filter(isVerbatimSong);
      const at = list.findIndex((s) => s.id === fam.vfeat);
      if (at > 0) list = [list[at]].concat(list.slice(0, at), list.slice(at + 1));
    }
    for (const s of list) out.push(s);
  }
  return out;
}

/**
 * The shelf a song belongs to, as the media card's album line: its family's
 * letter collection, or Bible / Inspired / originals / prayers.
 * @param {Song | null | undefined} song @returns {string}
 */
export function songAlbumLabel(song) {
  const fam = song ? familyById(song.f) : null;
  const col = fam ? fam.col : '';
  if (col && Object.prototype.hasOwnProperty.call(COL_LABELS, col)) return COL_LABELS[/** @type {keyof typeof COL_LABELS} */ (col)];
  const reg = /** @type {any} */ (globalThis).COL_BY_KEY;
  const entry = col && reg && typeof reg.get === 'function' ? reg.get(col) : null;
  return (entry && typeof entry.label === 'string' && entry.label) || DEFAULT_ALBUM;
}

/* ── order ────────────────────────────────────────────────────────────── */

/** mulberry32: a tiny, well-mixed 32-bit PRNG — the same seed is the same order on every device. */
function _rng(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded Fisher–Yates shuffle (a new array; the input is untouched).
 * @template T @param {T[]} list @param {number} seed @returns {T[]}
 */
export function seededShuffle(list, seed) {
  const out = list.slice();
  const next = _rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/**
 * "Shuffle all songs": ONE version per family, so a listener hears every
 * different song before any repeats — the featured version, or the first
 * version the filter admits when the featured one does not (a Worship chip on
 * a family whose first take is Pop) — in a seeded order.
 * @param {unknown} filter @param {number} seed @returns {Song[]}
 */
export function shuffledFeatured(filter, seed) {
  return songQueue({ filter, one: true, shuffle: true, seed });
}

/**
 * Begin a list at the song the listener chose. The chosen song takes its own
 * SLOT — itself, or, in a one-version-per-family list, its family's pick (a
 * listener who chose take 6 hears take 6, not the featured take as well). A
 * shuffled list opens on it; a plain list is FORWARD-ONLY from its slot, the
 * rule every other queue in the player keeps.
 * @param {Song[]} list @param {string} startId @param {boolean} shuffled @param {boolean} one @param {boolean} [wrap]
 * @returns {Song[]}
 */
function _fromStart(list, startId, shuffled, one, wrap) {
  const start = startId ? songById(startId) : null;
  if (!_visible(start)) return list;
  const s = /** @type {Song} */ (start);
  const slot = (/** @type {Song} */ x) => (one ? x.f === s.f : x.id === s.id);
  if (shuffled) return [s].concat(list.filter((x) => !slot(x)));
  const at = list.findIndex(slot);
  if (at < 0) return [s].concat(list);
  // `wrap`: the whole list, rotated to begin here, the songs before it coming after the last (Shuffle off keeps
  // every song it had; sweep n3-01). Otherwise forward-only.
  return [s].concat(list.slice(at + 1), wrap ? list.slice(0, at).filter((x) => !slot(x)) : []);
}

/**
 * The listener's version choices in a described queue: {catalog version id: chosen version id}, kept only where
 * both are real songs of one family. At most 50.
 * @param {unknown} swaps @returns {Record<string, string> | null}
 */
export function cleanSongSwaps(swaps) {
  if (!swaps || typeof swaps !== 'object' || Array.isArray(swaps)) return null;
  /** @type {Record<string, string>} */
  const out = {};
  let n = 0;
  for (const [from, to] of Object.entries(/** @type {Record<string, unknown>} */ (swaps))) {
    if (n >= 50) break;
    if (!isSongId(from) || !isSongId(to) || from === to) continue;
    out[from] = /** @type {string} */ (to);
    n++;
  }
  return n ? out : null;
}

/**
 * THE order of a songs queue, from its compact descriptor — the one function
 * a fresh playSongs and the boot rebuild both call, so they cannot disagree.
 *   ids      an explicit list, ALREADY in play order (a shuffle of ids is
 *            applied once, when the queue is made, and the ids stored as
 *            played); hidden and unknown ids drop out.
 *   filter   otherwise: every admitted version, family by family, featured
 *            first — or, with `one`, ONE version per family (the featured one,
 *            or the first the filter admits), which is what "Shuffle all
 *            songs" plays so 912 different songs come before any repeat.
 *   shuffle  a seeded permutation (`seed`) of that same list. Turning shuffle
 *            on or off reorders a queue; it never changes which songs are in it.
 *   startKey `song:<id>` the queue begins at (see _fromStart).
 *   wrap     with startKey and no shuffle: the whole list rotated to begin there (what Shuffle off asks).
 *   swaps    {catalog version id: chosen version id}: the listener's version switches in a one-take-per-song queue.
 * @param {{ ids?: unknown, filter?: unknown, one?: unknown, shuffle?: unknown, seed?: unknown, startKey?: unknown, wrap?: unknown, swaps?: unknown } | null | undefined} desc
 * @returns {Song[]}
 */
export function songQueue(desc) {
  const d = desc || {};
  const startId = songIdOfKey(d.startKey);
  if (Array.isArray(d.ids)) {
    const seen = new Set();
    /** @type {Song[]} */
    const list = [];
    for (const id of d.ids) {
      const s = songById(id);
      if (_visible(s) && !seen.has(id)) { seen.add(id); list.push(/** @type {Song} */ (s)); }
    }
    return _fromStart(list, startId, false, false);
  }
  const f = normalizeSongFilter(d.filter);
  const one = !!d.one;
  /** @type {Song[]} */
  let list = [];
  for (const fam of familiesFor(f)) {
    const versions = _matchingVersions(fam, f);
    if (one) list.push(versions[0]); else for (const s of versions) list.push(s);
  }
  if (d.shuffle) list = seededShuffle(list, Number(d.seed) >>> 0);
  const ordered = _fromStart(list, startId, !!d.shuffle, one, !!d.wrap);
  // Swaps apply to the queue as ordered, so the start and its horizon are the catalog's; only a one-take-per-song
  // queue carries them (any other switch makes the queue an explicit list; refutation of s2r M1/M2).
  const swaps = one ? cleanSongSwaps(d.swaps) : null;
  if (!swaps) return ordered;
  return ordered.map((s) => {
    const to = swaps[s.id] ? songById(swaps[s.id]) : null;
    return to && _visible(to) && to.f === s.f ? /** @type {Song} */ (to) : s;
  });
}

/**
 * A song as a player Track. Cover, lyrics, letter and duration are looked up
 * by id from the catalog; they never ride the Track (normalizeAudioTrack would
 * drop them). Null when the song has no playable URL.
 * @param {Song | null | undefined} song
 * @returns {{ key: string, title: string, sub: string, url: string, readerCode: string, partLabel: string | null } | null}
 */
export function songTrack(song) {
  const url = song ? songAssetUrl(song) : '';
  if (!song || !url) return null;
  return { key: SONG_KEY_PREFIX + song.id, title: song.t, sub: songAlbumLabel(song), url, readerCode: '', partLabel: song.v || null };
}

/** Test seam: forget the loaded catalog. */
export function _resetSongCatalogForTests() {
  _catalog = null;
  _loadPromise = null;
  _error = false;
  _version = 0;
  _listeners.clear();
  _checkedAt = 0;
  _lastFailed = false;
  _adoptedPrint = '';
  _recheck = null;
  _gen++;
  if (_unlisten) { _unlisten(); _unlisten = null; }
}

/** The one catalog store. Bundle-h reads it as the `SongCatalog` global. */
export const SongCatalog = {
  get loaded() { return !!_catalog; },
  get error() { return _error; },
  /** @param {() => void} cb @returns {() => void} */
  subscribe(cb) { _listeners.add(cb); return () => { _listeners.delete(cb); }; },
  getVersion() { return _version; },
  /** The publisher's version stamp of the loaded catalog, or ''. */
  catalogVersion() { return _catalog ? _catalog.version : ''; },
  load: loadSongCatalog,
  songs,
  families,
  readings() { return _catalog ? _catalog.readings : []; },
  styles() { return _catalog ? _catalog.styles : {}; },
  songById,
  familyById,
  familiesFor,
  versionsOf,
  featuredOf,
  songsForLetter,
  isVerbatimSong,
  songAlbumLabel,
  songAssetUrl,
  songThumbUrl,
  isSongKey,
};

// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   sync-loaders — the lazy read-along timing files (bundle-d)
   ═══════════════════════════════════════════════════════════════════════
   Two timing corpora are fetched ON DEMAND — never on the cold-boot path and,
   since c41, never inside a corpus bundle either:

     src/data/audio-sync.js            AUDIO_SYNC / AUDIO_SYNC_ALT — the letter
                                       clause timings (tools/batch-align.py).
                                       Left bundle-a-vot on 2026-09-01: every
                                       reader who opened ANY letter was parsing
                                       ~400 KB of timings whether or not they
                                       ever pressed Play, and the bundle was
                                       140 KB from its byte ceiling.
     src/data/bible-sync-<edition>.js  BIBLE_SYNC_<EDITION> — verse timings, one
                                       file per recorded edition
                                       (tools/batch-align-bible.py).

   <edition> IS THE EDITION ID, NEVER THE VOLKEY. The shipper names both the
   file and the global from its own EDITIONS key, and for the WEB recording
   those two names differ: volKey 'bible-web', edition 'web-ebible'. This
   module used to slice 'bible-' off the volKey, which happens to be right for
   brm-kjv and wop-nkjv and would have asked for bible-sync-web.js — a clean,
   silent 404 — the night WEB shipped. bibleSyncEditionFor() in
   utils/audio-track.js owns the translation; nothing here guesses.

   Both ride index.html's __makeLazyLoader, the factory behind the corpus
   bundles: one cached in-flight download per file, a script tag with
   async=false, and a corpus object whose subscribe()/getVersion() notify on
   load. The files land as classic-script GLOBALS; the stores exported here
   are how a render learns they landed. ReadAlongHighlight reads the globals
   at render time and subscribes to these versions, so the arrival is a
   render input and the first letter a reader listens to paints (the c36
   lesson: a dep-less effect that reads the global once never repaints).

   WHY THE PATH LITERALS LIVE HERE AND NOWHERE ELSE. The Pages deploy stages
   a src/data file only if tools/list-runtime-src-assets.js can derive it,
   and the APK ignore list is checked only against paths
   tools/check-apk-assets.js can derive. Both scan src/ — never index.html —
   for the literal forms used below. The Bible loader used to live in
   index.html and shipped only by accident of translations.js's bible-
   prefix. Keep every timing-file path a LITERAL inside a __makeLazyLoader(…)
   call in THIS module: a template string, a const, or a move back to
   index.html hides it from both gates and the file silently stops shipping.

   Absent the factory (jsdom, boot order) every export is a no-op: nothing is
   constructed and nothing is fetched by accident.
   ═══════════════════════════════════════════════════════════════════════ */

import { bibleSyncEditionFor, BIBLE_AUDIO_EDITIONS } from './audio-track.js';

/**
 * @typedef {Object} LazyCorpus
 * @property {boolean} loaded
 * @property {boolean} error
 * @property {(cb: () => void) => () => void} subscribe
 * @property {() => number} getVersion
 */

/**
 * @typedef {Object} LazyLoader
 * @property {LazyCorpus} corpus
 * @property {() => Promise<void>} load
 */

/** @returns {boolean} whether index.html's factory is on the page */
function _hasFactory() {
  return typeof /** @type {any} */ (globalThis).__makeLazyLoader === 'function';
}

/** @type {LazyLoader | null} */
let _audio = null;
/** @type {Map<string, LazyLoader>} */
const _bible = new Map();
let _bibleVersion = 0;
/** @type {Set<() => void>} */
const _bibleListeners = new Set();

/**
 * The letter-timings loader, created on first need (creation fetches
 * nothing; only load() does). Null without the factory.
 * @returns {LazyLoader | null}
 */
function _audioLoader() {
  if (_audio) return _audio;
  if (!_hasFactory()) return null;
  // The path is a LITERAL in this call on purpose — see the header.
  _audio = /** @type {any} */ (globalThis).__makeLazyLoader('audio-sync', 'src/data/audio-sync.js', null);
  return _audio;
}

/**
 * Fetch the letter timings (AUDIO_SYNC / AUDIO_SYNC_ALT), once per page.
 * Resolves when the script has run — or immediately on failure and where the
 * factory is absent: the component paints nothing for rows it cannot find,
 * which is honest, and the loader keeps its error state for a later retry.
 * @returns {Promise<void>}
 */
export function loadAudioSync() {
  const l = _audioLoader();
  if (!l) return Promise.resolve();
  return l.load().catch(() => undefined);
}

/** useSyncExternalStore contract for the letter timings' arrival. */
export const audioSyncStore = {
  /** @param {() => void} cb */
  subscribe(cb) {
    const l = _audioLoader();
    return l ? l.corpus.subscribe(cb) : () => {};
  },
  getVersion() {
    return _audio ? _audio.corpus.getVersion() : 0;
  },
};

/**
 * Fetch one recorded edition's verse timings: loadBibleSync('bible-web') →
 * src/data/bible-sync-web-ebible.js → BIBLE_SYNC_WEB_EBIBLE. The volKey is
 * translated to its EDITION id by bibleSyncEditionFor (utils/audio-track.js)
 * — never sliced here — because the two names diverge for that very edition.
 * The key guard admits only `bible-<something>` syntax; an unregistered or
 * malformed volKey resolves without ever creating a loader or touching the
 * Map, so a letter volKey or a prototype name can never reach the network.
 * @param {unknown} volKey
 * @returns {Promise<void>}
 */
export function loadBibleSync(volKey) {
  if (typeof volKey !== 'string' || !/^bible-[a-z0-9-]+$/.test(volKey)) return Promise.resolve();
  const ed = bibleSyncEditionFor(volKey);
  if (!ed) return Promise.resolve();
  // An edition that declares itself untimed has no sync file and never will.
  // `=== false` is strict so ABSENCE means timed — no existing entry moves.
  //
  // WHY THIS IS NOT DOCUMENTATION. bibleSyncEditionFor is a LOOP over
  // BIBLE_AUDIO_EDITIONS, not a hand-written map, so a new entry passes the
  // `!ed` guard above the moment it exists and builds a lazy loader for a
  // bible-sync-<id>.js that will never be written. The retry inputs are the
  // reader's own — ReadAlongHighlight's effect carries `playerVersion`, chosen
  // deliberately so a real retry can succeed — so a permanently absent file is
  // one 404 per pause, resume, seek and track change, unbounded, for the whole
  // session. Not a loop (read-along-5 fixed that), but bounded by the reader's
  // fingers instead, which is no better a reason.
  //
  // It lands with the first `timed: false` entry rather than before it:
  // BIBLE_AUDIO_EDITIONS is Object.freeze'd, so no test can inject an untimed
  // edition, and shipping this line earlier would ship it ungated.
  // (Web Builder, 2026-09-06.)
  if (/** @type {any} */ (BIBLE_AUDIO_EDITIONS[ed]).timed === false) return Promise.resolve();
  let l = _bible.get(volKey);
  if (!l) {
    if (!_hasFactory()) return Promise.resolve();
    // The prefix is a LITERAL in this call on purpose — see the header.
    l = /** @type {any} */ (globalThis).__makeLazyLoader('bible-sync-' + ed, 'src/data/bible-sync-' + ed + '.js', null);
    _bible.set(volKey, /** @type {LazyLoader} */ (l));
    // One aggregated version across editions: a chapter view subscribes once
    // and re-renders whichever edition's file lands.
    /** @type {LazyLoader} */ (l).corpus.subscribe(() => {
      _bibleVersion += 1;
      _bibleListeners.forEach((cb) => {
        try { cb(); } catch (e) { console.warn('bible-sync subscriber threw', e); }
      });
    });
  }
  return /** @type {LazyLoader} */ (l).load().catch(() => undefined);
}

/** useSyncExternalStore contract for the Bible timings' arrival (any edition). */
export const bibleSyncStore = {
  /** @param {() => void} cb */
  subscribe(cb) {
    _bibleListeners.add(cb);
    return () => { _bibleListeners.delete(cb); };
  },
  getVersion() {
    return _bibleVersion;
  },
};

/* ── The WTLB compilation timings (AUDIO_SYNC_SECTIONS), a third lazy file ──
   One recording of many letters; rows per letter on the file's clock (shape
   agreed with the align lane 2026-09-20, D:/Swarm/lanes/align/wtlb-shape.md).
   The renderer (audio-player.js sectionLetterKeyAt, ReadAlongHighlight,
   use-audio-follow) landed first and reads these two exports; the DATA commit
   lights them by replacing the one `null` in _sectionsLoader with the
   __makeLazyLoader call for the sections file — the literal path is what the
   asset gates derive the lazy set from (see the header), so it must not appear
   here before the file exists on disk. Until then: no loader, load() resolves,
   the store never bumps, and every consumer answers "not landed". */
/** @type {LazyLoader | null} */
let _sections = null;

/** @returns {LazyLoader | null} */
function _sectionsLoader() {
  if (_sections) return _sections;
  if (!_hasFactory()) return null;
  _sections = /** @type {any} */ (globalThis).__makeLazyLoader('audio-sync-sections', 'src/data/audio-sync-sections.js', null);
  return _sections;
}

/**
 * Fetch the compilation timings (AUDIO_SYNC_SECTIONS), once per page. Resolves
 * on failure and where no loader exists, like loadAudioSync.
 * @returns {Promise<void>}
 */
export function loadAudioSyncSections() {
  const l = _sectionsLoader();
  if (!l) return Promise.resolve();
  return l.load().catch(() => undefined);
}

/** useSyncExternalStore contract for the compilation timings' arrival. */
export const audioSyncSectionsStore = {
  /** @param {() => void} cb */
  subscribe(cb) {
    const l = _sectionsLoader();
    return l ? l.corpus.subscribe(cb) : () => {};
  },
  getVersion() {
    return _sections ? _sections.corpus.getVersion() : 0;
  },
};

/* ── Answers Only God Can Give — src/data/answers.js (ANSWERS, ~2.5 MB) ──
   Not a timing file, but the same shape for the same reasons: one raw
   src/data file, fetched the first time a reader opens Answers, shipped by
   the gates only because its path is a literal below. Its finish hook is
   index.html's __finishVotInit, which links the entries' prev/next and
   rebuilds VOT_LETTER_REGISTRY from every corpus now on the page — the
   registry openInAppLetter resolves "Answers Only God Can Give" links by.

   ONE loader per page, published on window: screen-routes gates the Answers
   routes on window.__answersCorpus, and useLazyBundles (bundle-b) subscribes
   App to it, so the routes re-render the moment the topics land. It is
   created as this module evaluates — creating fetches nothing — so the
   corpus object is already there when App first subscribes. */
/** @type {LazyLoader | null} */
let _answers = null;

/** @returns {LazyLoader | null} */
function _answersLoader() {
  if (_answers) return _answers;
  const g = /** @type {any} */ (globalThis);
  if (g.__answersLoader) { _answers = g.__answersLoader; return _answers; }
  if (!_hasFactory()) return null;
  _answers = g.__makeLazyLoader('answers', 'src/data/answers.js', '__finishVotInit');
  g.__answersLoader = _answers;
  g.__answersCorpus = /** @type {LazyLoader} */ (_answers).corpus;
  g.__loadAnswersCorpus = () => /** @type {LazyLoader} */ (_answers).load();
  return _answers;
}
_answersLoader();

/**
 * Fetch the Answers corpus (ANSWERS), once per page. Resolves on failure and
 * where no loader exists; the corpus object keeps the error for a retry.
 * @returns {Promise<void>}
 */
export function loadAnswers() {
  const l = _answersLoader();
  if (!l) return Promise.resolve();
  return l.load().catch(() => undefined);
}

/** Test-only: forget every loader so a suite can install a fresh factory. */
export function resetSyncLoadersForTests() {
  _audio = null;
  _sections = null;
  _answers = null;
  const g = /** @type {any} */ (globalThis);
  delete g.__answersLoader;
  delete g.__answersCorpus;
  delete g.__loadAnswersCorpus;
  _bible.clear();
  _bibleVersion = 0;
  _bibleListeners.clear();
}

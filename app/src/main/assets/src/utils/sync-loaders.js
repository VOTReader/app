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
 * Fetch one recorded edition's verse timings: loadBibleSync('bible-brm-kjv')
 * → src/data/bible-sync-brm-kjv.js → BIBLE_SYNC_BRM_KJV. The key guard is the
 * contract: only `bible-<edition>` builds a path, so a letter volKey or a
 * prototype name can never reach the network or the Map.
 * @param {unknown} volKey
 * @returns {Promise<void>}
 */
export function loadBibleSync(volKey) {
  if (typeof volKey !== 'string' || !/^bible-[a-z0-9-]+$/.test(volKey)) return Promise.resolve();
  let l = _bible.get(volKey);
  if (!l) {
    if (!_hasFactory()) return Promise.resolve();
    const ed = volKey.slice('bible-'.length);
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

/** Test-only: forget every loader so a suite can install a fresh factory. */
export function resetSyncLoadersForTests() {
  _audio = null;
  _bible.clear();
  _bibleVersion = 0;
  _bibleListeners.clear();
}

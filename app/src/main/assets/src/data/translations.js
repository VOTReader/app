/* ===================================================================
   Translation loaders — lazy script tag injection for Bible alt translations + bible-studies
   ===================================================================
   ES module (G.2.3). Module-private state — moved out of index.html as
   part of the strict-mode conversion. `_bibleStudiesPromise` is reassigned
   from inside loadBibleStudies(), so it needs a module-scope `let` binding
   or strict mode throws.
   Bundled helpers (P5e):
   - loadTranslation
   - loadBibleStudies
   - translateVerse
   =================================================================== */

export const _translationPromises = {}; // code -> Promise that resolves when loaded
export const _translationLoaded = {};   // code -> true once global is available
export let _bibleStudiesPromise = null;

export function loadTranslation(code) {
  if (!code || code === 'nkjv') return Promise.resolve();
  // SE5: `code` originates from settings.translation, which is restorable from
  // an imported backup, and is concatenated into a <script> src below. Allow
  // only a bare lowercase token so a crafted value can never shape the URL
  // (path traversal, a second origin via "//host", a query/fragment). Every
  // real id (TRANSLATION_OPTIONS in index.html: web/bsb/hnv/kjv/asv/lsv/ylt/
  // rnkjv/rkjv) is 2–5 lowercase letters; an unknown-but-safe code just 404s
  // → NKJV fallback. Defense-in-depth over script-src 'self' + the
  // same-origin string wrap.
  if (!/^[a-z]{2,8}$/.test(code)) return Promise.resolve();
  // SCR1: only codes with a shipped bible-<code>.js bundle are loadable. Corpus
  // nkjv keys carry tags for translations with NO bundle (CJB/GNT/ESV/NLT/NAS/CEB);
  // those resolve from the per-letter dict directly. If the dict ever misses, skip
  // the doomed 404 fetch — which would render NKJV text under a foreign (CJB) cite —
  // and let translateVerse fall back to NKJV cleanly. TRANSLATION_OPTIONS
  // (index.html) is the single source of truth for shipped translations; guarded
  // so jsdom tests that never ran index.html behave exactly as before.
  if (typeof TRANSLATION_OPTIONS !== 'undefined' && !TRANSLATION_OPTIONS.some((o) => o.id === code)) return Promise.resolve();
  // A SPARSE overlay (registry `base`, e.g. rkjv over kjv) carries only its
  // changed verses; the base translation must be loaded alongside so
  // translateVerse can resolve the rest. rnkjv needs no `base` — its fallback
  // is verse.text (the NKJV base corpus) like every other translation.
  const base = _baseOf(code);
  if (base) return Promise.all([_loadTranslationScript(code), loadTranslation(base)]).then(() => {});
  return _loadTranslationScript(code);
}

/**
 * The registry `base` translation a sparse overlay falls back to, or null.
 * @param {string} code
 * @returns {string|null}
 */
function _baseOf(code) {
  if (typeof TRANSLATION_OPTIONS === 'undefined') return null;
  const opt = TRANSLATION_OPTIONS.find((o) => o.id === code);
  return (opt && opt.base) || null;
}

/** @param {string} code */
function _loadTranslationScript(code) {
  const globalName = 'BIBLE_' + code.toUpperCase();
  if (window[globalName]) {_translationLoaded[code] = true;return Promise.resolve();}
  if (_translationPromises[code]) return _translationPromises[code];
  _translationPromises[code] = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'src/data/bible-' + code + '.js';
    script.async = true;
    script.onload = () => {_translationLoaded[code] = true;resolve(undefined);};
    script.onerror = () => {
      // ERR2: don't cache the failure — clear the slot so a later open retries,
      // and trace it (the NKJV fallback is otherwise invisible: the user just
      // sees their chosen translation silently revert with no explanation).
      delete _translationPromises[code];
      try { if (window.DiagnosticLog) window.DiagnosticLog.warn('translation', 'failed to load ' + code); } catch (_e) {}
      resolve(undefined);
    };
    document.head.appendChild(script);
  });
  return _translationPromises[code];
}

export function loadBibleStudies() {
  if (typeof BIBLE_STUDIES !== 'undefined') return Promise.resolve(true);
  if (_bibleStudiesPromise) return _bibleStudiesPromise;
  _bibleStudiesPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'src/data/bible-studies.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      // ERR1: do NOT cache the failed promise — null it so a retry (or the next
      // Studies open) re-attempts the load, instead of stranding the user on a
      // permanent "Letter Studies coming soon." dead-end. Resolve FALSE so the
      // caller can surface a "Try again", and trace it (DiagnosticLog is the only
      // failure record under the no-telemetry policy).
      _bibleStudiesPromise = null;
      try { if (window.DiagnosticLog) window.DiagnosticLog.error('studies', 'failed to load bible-studies.js'); } catch (_e) {}
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return _bibleStudiesPromise;
}

/* Versification alias (data-corpus-4). The WEB and the HNV print the Romans
   doxology at the END of chapter 14 — their Romans 16 simply stops at verse 24
   (the HNV ships a 16:25 that is an empty string). BibleChapterView walks the
   NKJV verse list, so Romans 16:25-27 asked those translations for verses they
   do not have and got NKJV text under a WEB/HNV header, with no marker. This
   table maps the reference's verse onto the row the translation actually ships,
   so the doxology renders in the reader's chosen translation. Keyed
   `translation|bookId|chapter` -> { referenceVerse: [chapter, verse] }; add a
   row only for a real versification difference, never to paper over missing data. */
const _VERSIFICATION_ALIAS = {
  'web|romans|16': { 25: ['14', 24], 26: ['14', 25], 27: ['14', 26] },
  'hnv|romans|16': { 25: ['14', 24], 26: ['14', 25], 27: ['14', 26] },
};

// PERF-3: a tiny verse-index cache so translateVerse is O(1) per verse, not O(N)
// — a full chapter render was O(N²) (each of N verses linear-scanned the N-verse alt
// array). The reader shows ONE chapter at a time, so a handful of { n -> text } maps
// keyed by translation:bookId:chNum is enough. It was a SINGLE entry until the sparse
// Restored-Name overlays: a chain lookup (rkjv miss → kjv) alternates TWO keys per
// verse, which would rebuild the index on every call — the small LRU keeps both hot.
// Bounded, so it can't grow unbounded (alt-translation globals load whole, so no
// partial staleness — a cached index never goes stale because the data never mutates
// after its script loads, and _verseIndex is only reached once the global exists).
const _xlateCache = new Map();
const _xlateCacheMax = 8;
function _verseIndex(data, translation, bookId, chNum) {
  const key = translation + ':' + bookId + ':' + chNum;
  const hit = _xlateCache.get(key);
  if (hit) {
    _xlateCache.delete(key); _xlateCache.set(key, hit); // refresh recency
    return hit;
  }
  const verses = data[bookId] && data[bookId][chNum];
  const idx = Object.create(null);
  if (verses) { for (let i = 0; i < verses.length; i++) idx[verses[i].n] = verses[i].text; }
  _xlateCache.set(key, idx);
  if (_xlateCache.size > _xlateCacheMax) _xlateCache.delete(_xlateCache.keys().next().value);
  return idx;
}

/**
 * A verse value that would render a numbered row with nothing in it
 * (data-corpus-6, 2026-09-04). Blankness, NOT emptiness: the three shapes that
 * render the same blank row each took a different path through the old code —
 * `''` fell through `t !== undefined`, `null` did too (React renders it as
 * nothing), and `'   '` is TRUTHY so an early truthy test handed it straight
 * back. One predicate, checked everywhere a verse value is accepted.
 * @param {*} v
 * @returns {boolean}
 */
function _blank(v) {
  return typeof v !== 'string' || v.trim() === '';
}

export function translateVerse(bookId, chNum, verse, translation) {
  if (!translation || translation === 'nkjv') return verse.text;
  const data = window['BIBLE_' + translation.toUpperCase()];
  if (data) {
    const t = _verseIndex(data, translation, bookId, chNum)[verse.n];
    // A BLANK verse counts as a miss. The HNV ships five of them (luke 17:36,
    // acts 8:37, acts 15:34, acts 24:7, romans 16:25) — verses it does not
    // carry, stored as empty strings rather than left out — and returning one
    // gives the reader a numbered row with no scripture in it and no marker.
    // The alias below, the base hop, and the NKJV fallback all beat that.
    if (!_blank(t)) return t;
    const alias = _VERSIFICATION_ALIAS[translation + '|' + bookId + '|' + chNum];
    const to = alias && alias[verse.n];
    if (to) {
      const at = _verseIndex(data, translation, bookId, to[0])[to[1]];
      if (!_blank(at)) return at;
    }
    // Deliberately NO `if (t !== undefined) return t` here any more: a
    // non-blank value has already returned, so anything reaching this line is
    // blank and must fall through rather than be rendered.
  }
  // Sparse overlay miss (or overlay not yet loaded) → consult the registry
  // base translation (rkjv → kjv). nkjv-based overlays need no hop: falling
  // through to verse.text IS the NKJV base.
  const base = _baseOf(translation);
  if (base && base !== 'nkjv') {
    const bd = window['BIBLE_' + base.toUpperCase()];
    if (bd) {
      const t = _verseIndex(bd, base, bookId, chNum)[verse.n];
      if (!_blank(t)) return t;
    }
  }
  return verse.text; // not loaded / verse absent or blank → NKJV fallback
}

// ── Translation display labels ──────────────────────────────────────────
// The chrome that names the active Bible version (the home "Scriptures of
// Truth" card, the Scriptures hero eyebrow) must reflect settings.translation,
// not a hardcoded "NKJV". Both helpers read TRANSLATION_OPTIONS — the window
// global defined in index.html and the single source of truth for the list —
// so a new translation auto-flows everywhere with no extra wiring. Both fall
// back to the NKJV strings when the code is unknown or the registry isn't
// loaded (e.g. a jsdom test that never ran index.html).

/**
 * Short UI tag for a translation code, e.g. "nkjv" -> "NKJV", "kjv" -> "KJV".
 * @param {string} [code] settings.translation id (default "nkjv")
 * @returns {string}
 */
export function translationLabel(code) {
  const opts = (typeof TRANSLATION_OPTIONS !== 'undefined') ? TRANSLATION_OPTIONS : null;
  const found = opts && opts.find((o) => o.id === (code || 'nkjv'));
  return found ? found.label : 'NKJV';
}

/**
 * Full human name for a translation code, e.g. "nkjv" -> "New King James
 * Version". Derived from the registry `desc` (the part before the " — "
 * editorial note). Used for the Scriptures hero eyebrow.
 * @param {string} [code] settings.translation id (default "nkjv")
 * @returns {string}
 */
export function translationName(code) {
  const opts = (typeof TRANSLATION_OPTIONS !== 'undefined') ? TRANSLATION_OPTIONS : null;
  const found = opts && opts.find((o) => o.id === (code || 'nkjv'));
  if (!found) return 'New King James Version';
  return found.desc.split(/\s[—–-]\s/)[0];
}


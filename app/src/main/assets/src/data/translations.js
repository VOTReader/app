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
  // real id (TRANSLATION_OPTIONS in index.html: web/bsb/hnv/kjv/asv/lsv/ylt) is
  // 2–4 lowercase letters; an unknown-but-safe code just 404s → NKJV fallback.
  // Defense-in-depth over script-src 'self' + the same-origin string wrap.
  if (!/^[a-z]{2,8}$/.test(code)) return Promise.resolve();
  const globalName = 'BIBLE_' + code.toUpperCase();
  if (window[globalName]) {_translationLoaded[code] = true;return Promise.resolve();}
  if (_translationPromises[code]) return _translationPromises[code];
  _translationPromises[code] = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'src/data/bible-' + code + '.js';
    script.async = true;
    script.onload = () => {_translationLoaded[code] = true;resolve();};
    script.onerror = () => {resolve();}; // silent fail — NKJV fallback
    document.head.appendChild(script);
  });
  return _translationPromises[code];
}

export function loadBibleStudies() {
  if (typeof BIBLE_STUDIES !== 'undefined') return Promise.resolve();
  if (_bibleStudiesPromise) return _bibleStudiesPromise;
  _bibleStudiesPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'src/data/bible-studies.js';
    script.async = true;
    script.onload = () => { resolve(); };
    script.onerror = () => { resolve(); }; // silent fail — STUDIES stays []
    document.head.appendChild(script);
  });
  return _bibleStudiesPromise;
}

// PERF-3: a SINGLE-entry verse-index cache so translateVerse is O(1) per verse, not O(N)
// — a full chapter render was O(N²) (each of N verses linear-scanned the N-verse alt
// array). The reader shows ONE chapter at a time, so a single { n -> text } map keyed by
// translation:bookId:chNum is enough: it's built once when a chapter is first rendered,
// hit by every other verse + every re-render, and rebuilt on chapter/translation change —
// so it can't grow unbounded (alt-translation globals load whole, so no partial staleness).
let _xlateKey = null;
let _xlateIdx = null;
function _verseIndex(data, translation, bookId, chNum) {
  const key = translation + ':' + bookId + ':' + chNum;
  if (key === _xlateKey) return _xlateIdx;
  const verses = data[bookId] && data[bookId][chNum];
  const idx = Object.create(null);
  if (verses) { for (let i = 0; i < verses.length; i++) idx[verses[i].n] = verses[i].text; }
  _xlateKey = key;
  _xlateIdx = idx;
  return idx;
}

export function translateVerse(bookId, chNum, verse, translation) {
  if (!translation || translation === 'nkjv') return verse.text;
  const data = window['BIBLE_' + translation.toUpperCase()];
  if (!data) return verse.text; // not yet loaded → NKJV fallback
  const t = _verseIndex(data, translation, bookId, chNum)[verse.n];
  return (t !== undefined) ? t : verse.text;
}


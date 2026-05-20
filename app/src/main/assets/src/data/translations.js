/* ===================================================================
   Translation loaders — lazy script tag injection for Bible alt translations + bible-studies
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - loadTranslation
   - loadBibleStudies
   - translateVerse
   =================================================================== */


function loadTranslation(code) {
  if (!code || code === 'nkjv') return Promise.resolve();
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

function loadBibleStudies() {
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

function translateVerse(bookId, chNum, verse, translation) {
  if (!translation || translation === 'nkjv') return verse.text;
  const data = window['BIBLE_' + translation.toUpperCase()];
  if (!data) return verse.text; // not yet loaded → NKJV fallback
  const verses = data[bookId] && data[bookId][chNum];
  if (!verses) return verse.text;
  for (let i = 0; i < verses.length; i++) {
    if (verses[i].n === verse.n) return verses[i].text;
  }
  return verse.text;
}


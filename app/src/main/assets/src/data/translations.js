const _translationPromises = {};
const _translationLoaded = {};

function loadTranslation(code) {
  if (!code || code === 'nkjv') return Promise.resolve();
  const globalName = 'BIBLE_' + code.toUpperCase();
  if (window[globalName]) {_translationLoaded[code] = true;return Promise.resolve();}
  if (_translationPromises[code]) return _translationPromises[code];
  _translationPromises[code] = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'data/bible-' + code + '.js';
    script.async = true;
    script.onload = () => {_translationLoaded[code] = true;resolve();};
    script.onerror = () => {resolve();};
    document.head.appendChild(script);
  });
  return _translationPromises[code];
}

function translateVerse(bookId, chNum, verse, translation) {
  if (!translation || translation === 'nkjv') return verse.text;
  const data = window['BIBLE_' + translation.toUpperCase()];
  if (!data) return verse.text;
  const verses = data[bookId] && data[bookId][chNum];
  if (!verses) return verse.text;
  for (let i = 0; i < verses.length; i++) {
    if (verses[i].n === verse.n) return verses[i].text;
  }
  return verse.text;
}

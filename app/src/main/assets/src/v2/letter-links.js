/* letter-links - a letter the corpus names elsewhere ("Addendum to Hearts Changed": { collection: 'Volume Two',
   letterTitle }, or a letter id), as the v2 route that opens it. Reads main's collections (COL_BY_KEY) and their loaded
   letters only; null when the letter is not there (or its volume has not loaded yet). */

const g = /** @type {any} */ (globalThis);

/** A title as compared: case, curly or straight quotes and runs of spaces aside. @param {any} s */
const fold = (s) => String(s || '').toLowerCase().replace(/[“”‘’"']/g, '').replace(/\s+/g, ' ').trim();

/** Each collection with its loaded letters (its preface first when it has one). */
function* collections(gl) {
  const map = gl.COL_BY_KEY;
  if (!map || typeof map.forEach !== 'function') return;
  /** @type {Array<[string, any]>} */
  const all = [];
  map.forEach((col, key) => all.push([key, col]));
  for (const [key, col] of all) {
    if (!col) continue;
    const letters = Array.isArray(gl[col.globalName]) ? gl[col.globalName] : [];
    const preface = col.prefaceGlobal && gl[col.prefaceGlobal] && gl[col.prefaceGlobal].id ? gl[col.prefaceGlobal] : null;
    yield { volKey: col.volKey || key, label: col.label, letters, preface };
  }
}

/** @typedef {{ place: 'letter', collection: string, n?: number, preface?: boolean }} LetterRoute */

/** @param {string} volKey @param {any} letter @param {boolean} isPreface @returns {LetterRoute} */
function routeOf(volKey, letter, isPreface) {
  return isPreface ? { place: 'letter', collection: volKey, preface: true } : { place: 'letter', collection: volKey, n: letter.num };
}

/**
 * @param {{ collection?: string, letterTitle?: string, id?: string } | null | undefined} target
 * @returns {LetterRoute | null}
 */
export function letterRoute(target, gl = g) {
  if (!target) return null;
  if (target.id) {
    for (const c of collections(gl)) {
      if (c.preface && c.preface.id === target.id) return routeOf(c.volKey, c.preface, true);
      const l = c.letters.find((x) => x && x.id === target.id);
      if (l) return routeOf(c.volKey, l, false);
    }
    return null;
  }
  const label = fold(target.collection);
  const title = fold(target.letterTitle);
  if (!label || !title) return null;
  for (const c of collections(gl)) {
    if (fold(c.label) !== label) continue;
    if (c.preface && fold(c.preface.title) === title) return routeOf(c.volKey, c.preface, true);
    const l = c.letters.find((x) => x && fold(x.title) === title);
    return l ? routeOf(c.volKey, l, false) : null;
  }
  return null;
}

/**
 * letterRoute, loading the lazy corpus first when the letter's volume is not on the page yet (index.html's
 * window.__loadVotCorpus). Resolves null when it still is not there.
 * @param {Parameters<typeof letterRoute>[0]} target @returns {Promise<ReturnType<typeof letterRoute>>}
 */
export function findLetterRoute(target, gl = g) {
  const now = letterRoute(target, gl);
  if (now || typeof gl.__loadVotCorpus !== 'function') return Promise.resolve(now);
  return Promise.resolve(gl.__loadVotCorpus()).then(() => letterRoute(target, gl), () => null);
}

/* ═══════════════════════════════════════════════════════════════════════
   search/kjv-twin.js — every verse's King James wording, read beside the
   reader's edition (search200 fix1 "ed", 2026-10-19)
   ═══════════════════════════════════════════════════════════════════════
   The index holds the reader's edition (NKJV by default), and a reader who
   remembers a verse remembers it in the KJV as often as not ("the earth was
   without form, and void", "whereof", "begat"). kjv-alias.js reached the KJV
   one word at a time, and only a word no text held at all; a verse quoted in
   the KJV's words otherwise lost to texts holding its NKJV words. Every verse
   now carries its KJV wording too, read where its own is read, each wording
   alone, and scored the better of the two, never their sum:
   - BM25 (kjvReading): a unit is scored in the KJV wording on the index's own
     scale (its text count, its texts' mean length), a word's document count
     being every text that holds it in either wording (the index's holders and
     the verses holding it in the KJV alone). The KJV wording answers the
     unit's own words only: no prefix or fuzzy reach ("where" is no "whereof").
   - the token store, the passage lemmas and the sentence keys read a verse's
     KJV tokens after its own (engine.js: withKjv, twinSentences).
   The file (search-kjv-twin.json at the assets root, written by
   tools/build-kjv-twin.mjs from data/bible-kjv.js) holds every KJV verse's
   tokens as kjvEncode reads them, with a break where the engine's
   sentenceSpans breaks a sentence: the vocabulary, most frequent first, and
   each token as its number in one to three characters of a 92-character
   alphabet. It is fetched beside the index (setKjvTwinSource, as the
   substitution lexicon is); setKjvTwin sets one directly (the benchmark, tests).
   Pure but for the load; chrome108-safe.
   ═══════════════════════════════════════════════════════════════════════ */
import { kjvEncode } from './tokenize.js';

/** The file's shape; parseKjvTwin refuses another. */
export const KJV_TWIN_FORMAT = 1;

/* The token code: printable ASCII but the quote and the backslash, which JSON would escape. A number under ONE is one
   character; then TWO lead characters of two, then THREE of three; SENT ends a sentence, VERSE a verse. */
const ALPHABET = (() => {
  let s = '';
  for (let c = 0x21; c <= 0x7e; c++) if (c !== 0x22 && c !== 0x5c) s += String.fromCharCode(c);
  return s;
})();
const BASE = ALPHABET.length;
const ONE = 60;
const TWO = 28;
const THREE = 2;
const SENT = ONE + TWO + THREE;
const VERSE = SENT + 1;
const CAP = ONE + TWO * BASE + THREE * BASE * BASE;
const DIGIT = (() => {
  const d = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE; i++) d[ALPHABET.charCodeAt(i)] = i;
  return d;
})();

/** A text's sentences, as engine.js sentenceSpans splits them (a sentence ends at . ! ? ; or a line's end). */
function sentences(/** @type {string} */ text) {
  const out = [];
  const re = /[^.!?;\n]+[.!?;]*/g;
  let m;
  while ((m = re.exec(text))) out.push(m[0]);
  return out;
}

/**
 * The file for a Bible keyed as data/bible-kjv.js is (book -> chapter -> [{n, text}], chapters and verses numbered
 * from 1 in order). Throws on a gap in the numbering, or a verse whose sentences' tokens are not its own.
 * @param {Record<string, Record<string, Array<{n: number, text: string}>>>} bible
 * @param {string} about  the file's note on where it came from
 */
export function encodeKjvTwin(bible, about) {
  const books = Object.keys(bible);
  /** @type {number[][]} */ const chapters = [];
  /** @type {string[][][]} */ const all = [];
  /** @type {Map<string, number>} */ const freq = new Map();
  for (const b of books) {
    const chs = Object.keys(bible[b]).map(Number).sort((x, y) => x - y);
    chs.forEach((c, i) => { if (c !== i + 1) throw new Error(`kjv twin: ${b} chapter ${c} out of order`); });
    chapters.push(chs.map((c) => {
      const vs = bible[b][c];
      vs.forEach((v, i) => { if (Number(v.n) !== i + 1) throw new Error(`kjv twin: ${b} ${c}:${v.n} out of order`); });
      for (const v of vs) {
        const whole = kjvEncode(v.text || '');
        const sents = sentences(v.text || '').map((s) => kjvEncode(s)).filter((t) => t.length);
        if ([].concat(...sents).join(' ') !== whole.join(' ')) throw new Error(`kjv twin: ${b} ${c}:${v.n} reads otherwise in sentences`);
        for (const t of whole) freq.set(t, (freq.get(t) || 0) + 1);
        all.push(sents);
      }
      return vs.length;
    }));
  }
  const words = [...freq.keys()].sort((a, b) => /** @type {number} */ (freq.get(b)) - /** @type {number} */ (freq.get(a)) || (a < b ? -1 : 1));
  if (words.length > CAP) throw new Error(`kjv twin: ${words.length} words, the code holds ${CAP}`);
  const id = new Map(words.map((w, i) => [w, i]));
  const code = (/** @type {number} */ n) => {
    if (n < ONE) return ALPHABET[n];
    n -= ONE;
    if (n < TWO * BASE) return ALPHABET[ONE + Math.floor(n / BASE)] + ALPHABET[n % BASE];
    n -= TWO * BASE;
    return ALPHABET[ONE + TWO + Math.floor(n / (BASE * BASE))] + ALPHABET[Math.floor(n / BASE) % BASE] + ALPHABET[n % BASE];
  };
  const verses = all.map((ss) => ss.map((t) => t.map((w) => code(/** @type {number} */ (id.get(w)))).join('')).join(ALPHABET[SENT])).join(ALPHABET[VERSE]) + ALPHABET[VERSE];
  return { about, format: KJV_TWIN_FORMAT, books, chapters, words: words.join(' '), verses };
}

/**
 * @typedef {{
 *   words: string[], wordId: Map<string, number>, keyOf: Map<string, number>,
 *   tok: Uint16Array, vFrom: Uint32Array, sEnd: Uint32Array, vSent: Uint32Array, len: Uint16Array,
 *   pFrom: Uint32Array, pDoc: Uint32Array, pTf: Uint8Array
 * }} KjvTwin
 *   keyOf 'book:chapter:verse' -> the verse's number; a verse's tokens are tok[vFrom[v]..vFrom[v+1]), its sentences
 *   end at sEnd[vSent[v]..vSent[v+1]); len its distinct words (the text's field length, as MiniSearch counts it);
 *   each word's verses pDoc[pFrom[w]..pFrom[w+1]), each with the word's count there (pTf).
 */
/**
 * The file, read. Throws when it is no twin file of this shape.
 * @param {any} j
 * @returns {KjvTwin}
 */
export function parseKjvTwin(j) {
  if (!j || j.format !== KJV_TWIN_FORMAT || !Array.isArray(j.books) || !Array.isArray(j.chapters) ||
    typeof j.words !== 'string' || typeof j.verses !== 'string') throw new Error('kjv twin: not a twin file');
  const words = j.words.split(' ');
  /** @type {Map<string, number>} */ const keyOf = new Map();
  j.books.forEach((/** @type {string} */ b, /** @type {number} */ bi) => {
    (j.chapters[bi] || []).forEach((/** @type {number} */ nv, /** @type {number} */ ci) => {
      for (let v = 1; v <= nv; v++) keyOf.set(b + ':' + (ci + 1) + ':' + v, keyOf.size);
    });
  });
  const nV = keyOf.size;
  const s = j.verses;
  const tok = new Uint16Array(s.length);
  const vFrom = new Uint32Array(nV + 1);
  const vSent = new Uint32Array(nV + 1);
  /** @type {number[]} */ const sEnd = [];
  let n = 0;
  let v = 0;
  const digit = (/** @type {number} */ i) => {
    const d = i < s.length ? DIGIT[s.charCodeAt(i) & 127] : -1;
    if (d < 0) throw new Error('kjv twin: a bad code at ' + i);
    return d;
  };
  for (let i = 0; i < s.length;) {
    const c = digit(i++);
    if (c === VERSE || c === SENT) {
      sEnd.push(n);
      if (c === VERSE) { if (++v > nV) throw new Error('kjv twin: more verses than its chapters hold'); vFrom[v] = n; vSent[v] = sEnd.length; }
      continue;
    }
    let w = c;
    if (c >= ONE + TWO) { w = ONE + TWO * BASE + (c - ONE - TWO) * BASE * BASE + digit(i) * BASE + digit(i + 1); i += 2; }
    else if (c >= ONE) { w = ONE + (c - ONE) * BASE + digit(i); i += 1; }
    if (w >= words.length) throw new Error('kjv twin: a word past its vocabulary');
    tok[n++] = w;
  }
  if (v !== nV) throw new Error(`kjv twin: ${v} verses, its chapters hold ${nV}`);
  // each verse's distinct words, and each word's verses with its count there
  const nW = words.length;
  const len = new Uint16Array(nV);
  const last = new Int32Array(nW).fill(-1);
  const pFrom = new Uint32Array(nW + 1);
  for (let x = 0; x < nV; x++) {
    for (let k = vFrom[x]; k < vFrom[x + 1]; k++) { const t = tok[k]; if (last[t] !== x) { last[t] = x; len[x]++; pFrom[t + 1]++; } }
  }
  for (let t = 0; t < nW; t++) pFrom[t + 1] += pFrom[t];
  const pDoc = new Uint32Array(pFrom[nW]);
  const pTf = new Uint8Array(pFrom[nW]);
  const fill = pFrom.slice(0, nW);
  const at = new Uint32Array(nW);
  last.fill(-1);
  for (let x = 0; x < nV; x++) {
    for (let k = vFrom[x]; k < vFrom[x + 1]; k++) {
      const t = tok[k];
      if (last[t] !== x) { last[t] = x; at[t] = fill[t]++; pDoc[at[t]] = x; }
      if (pTf[at[t]] < 255) pTf[at[t]]++;
    }
  }
  return {
    words, wordId: new Map(words.map((w, i) => [w, i])), keyOf,
    tok: tok.slice(0, n), vFrom, sEnd: Uint32Array.from(sEnd), vSent, len, pFrom, pDoc, pTf,
  };
}

/**
 * @typedef {{ms: any, data: KjvTwin, text: number, verseOf: Int32Array, sidA: Int32Array, sidB: Int32Array,
 *   only: Map<string, number>, norm: Map<string, Float64Array>,
 *   acc: {stamp: number, at: Int32Array, score: Float64Array, seen: Uint16Array, has: Uint32Array, done: Int32Array}}} KjvView
 *   one index's verses with their KJV wording: verseOf[short id] the KJV verse (-1: none); a KJV verse's index texts
 *   sidA and sidB (Matthew is indexed twice, the Study Bible's and the plain chapter's); only each word's count of texts
 *   holding it in the KJV alone, norm each verse's BM25 length term per setting, acc a unit's scratch (scoreUnit)
 */
/**
 * The index's verses with their KJV wording; null when the index holds the KJV itself (a KJV reader's).
 * @param {KjvTwin} data @param {any} ms  a MiniSearch index
 * @returns {KjvView|null}
 */
export function twinView(data, ms) {
  const nV = data.vFrom.length - 1;
  const verseOf = new Int32Array(ms._nextId).fill(-1);
  const sidA = new Int32Array(nV).fill(-1);
  const sidB = new Int32Array(nV).fill(-1);
  for (const [sid, f] of ms._storedFields) {
    if (!f || f.kind !== 'verse') continue;
    if (f.translation === 'kjv') return null;
    // the KJV names Matthew 'matthew-plain'; the Study Bible's Matthew is 'matthew'
    const v = data.keyOf.get((f.bookId === 'matthew' ? 'matthew-plain' : f.bookId) + ':' + f.chapterNum + ':' + f.verseNum);
    if (v === undefined || sid >= verseOf.length) continue;
    verseOf[sid] = v;
    if (sidA[v] < 0) sidA[v] = sid; else sidB[v] = sid;
  }
  const acc = { stamp: 0, at: new Int32Array(nV), score: new Float64Array(nV), seen: new Uint16Array(nV), has: new Uint32Array(nV), done: new Int32Array(verseOf.length) };
  return { ms, data, text: ms._fieldIds.text, verseOf, sidA, sidB, only: new Map(), norm: new Map(), acc };
}

/** Each index text holding `word` in its KJV wording, by short id. */
export function twinHolders(/** @type {KjvView} */ V, /** @type {string} */ word, /** @type {(sid: number) => void} */ each) {
  const D = V.data;
  const w = D.wordId.get(word);
  if (w === undefined) return;
  for (let p = D.pFrom[w]; p < D.pFrom[w + 1]; p++) {
    const v = D.pDoc[p];
    if (V.sidA[v] >= 0) each(V.sidA[v]);
    if (V.sidB[v] >= 0) each(V.sidB[v]);
  }
}

/** The texts holding `word` in their KJV wording alone (the index does not find it in them). */
export function twinOnly(/** @type {KjvView} */ V, /** @type {string} */ word) {
  let n = V.only.get(word);
  if (n === undefined) {
    const data = V.ms._index.get(word);
    const own = data && data.get(V.text);
    let c = 0;
    twinHolders(V, word, (sid) => { if (!own || !own.has(sid)) c++; });
    V.only.set(word, (n = c));
  }
  return n;
}

/** Does KJV verse `v` hold `word`? */
function holds(/** @type {KjvTwin} */ D, /** @type {number} */ v, /** @type {string} */ word) {
  const w = D.wordId.get(word);
  for (let k = D.vFrom[v]; k < D.vFrom[v + 1]; k++) if (D.tok[k] === w) return true;
  return false;
}

/** A word's document count over both wordings: the index's text holders and the verses holding it in the KJV alone. */
function docCount(/** @type {KjvView} */ V, /** @type {string} */ word) {
  const data = V.ms._index.get(word);
  const own = data && data.get(V.text);
  return (own ? own.size : 0) + twinOnly(V, word);
}

/**
 * @typedef {{stamp: number, n: number, and: boolean, words: string[], found: number[]}} UnitScores
 *   a unit read in the KJV wording: the verses it finds (AND: holding every one of its n words), their scores in the
 *   view's scratch under `stamp`
 */
/**
 * A unit scored in the KJV wording of the index's verses, as MiniSearch scores its text field (search-config.js:
 * tokenize kjvEncode, processTerm the identity): the unit's words exact, combined as `opts.combineWith` says (AND by
 * default). The scores go to the view's scratch (no maps: a unit of common words walks tens of thousands of postings).
 * @param {KjvView} V @param {string} term
 * @param {{combineWith?: string, boost?: Record<string, number>, [option: string]: any}} opts  a unit's search options
 *   (prefix and fuzzy are the reader's edition's alone)
 * @param {{k: number, b: number, d: number}} bm25
 * @returns {UnitScores}
 */
function scoreUnit(V, term, opts, bm25) {
  const toks = kjvEncode(term);
  const D = V.data;
  const ms = V.ms;
  const and = String(opts.combineWith || 'AND').toLowerCase() === 'and';
  const A = V.acc;
  const stamp = ++A.stamp;
  /** @type {UnitScores} */ const r = { stamp, n: toks.length, and, words: [], found: [] };
  if (!toks.length) return r;
  const boost = (opts.boost && Object.prototype.hasOwnProperty.call(opts.boost, 'text') && opts.boost.text) || 1;
  const N = ms._documentCount;
  const { k, b, d } = bm25;
  // each verse's length term, k(1 - b + b len / mean), once per BM25 setting
  const key = k + ',' + b;
  let norm = V.norm.get(key);
  if (!norm) {
    const avg = ms._avgFieldLength[V.text] || 1;
    norm = new Float64Array(D.len.length);
    for (let v = 0; v < norm.length; v++) norm[v] = k * (1 - b + b * D.len[v] / avg);
    V.norm.set(key, norm);
  }
  /** @type {number[]} */ const touched = [];
  for (let j = 0; j < toks.length; j++) {
    const t = toks[j];
    const w = D.wordId.get(t);
    if (w === undefined) { if (and) return r; continue; }
    let u = r.words.indexOf(t);
    if (u < 0) { u = r.words.length; r.words.push(t); }
    const bit = u < 32 ? 2 ** u : 0;
    const df = docCount(V, t);
    const idf = boost * Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const first = j === 0 || !and;
    for (let p = D.pFrom[w]; p < D.pFrom[w + 1]; p++) {
      const v = D.pDoc[p];
      if (V.sidA[v] < 0) continue;
      const fresh = A.at[v] !== stamp;
      // AND: a verse stays only while every word so far holds it
      if (!first && (fresh || A.seen[v] !== j)) continue;
      const tf = D.pTf[p];
      const s = idf * (d + tf * (k + 1) / (tf + norm[v]));
      if (fresh) { A.at[v] = stamp; A.score[v] = s; A.seen[v] = 1; A.has[v] = bit; touched.push(v); }
      else { A.score[v] += s; A.seen[v]++; A.has[v] = (A.has[v] | bit) >>> 0; }
    }
  }
  r.found = and ? touched.filter((v) => A.seen[v] === toks.length) : touched;
  return r;
}

/** The unit's words verse `v` holds (AND: every one; past the 32 the mask keeps, read from its tokens). */
function wordsOf(/** @type {KjvView} */ V, /** @type {UnitScores} */ r, /** @type {number} */ v) {
  if (r.and) return r.words;
  /** @type {string[]} */ const out = [];
  for (let u = 0; u < r.words.length; u++) if (u < 32 ? V.acc.has[v] & (2 ** u) : holds(V.data, v, r.words[u])) out.push(r.words[u]);
  return out;
}

/**
 * A unit's BM25 hits in the KJV wording, as MiniSearch hands them: each hit's score times the distinct words it holds,
 * best first.
 * @param {KjvView} V @param {string} term @param {Parameters<typeof scoreUnit>[2]} opts @param {Parameters<typeof scoreUnit>[3]} bm25
 * @returns {Array<{id: string, score: number, terms: string[]}>}
 */
export function twinHits(V, term, opts, bm25) {
  const r = scoreUnit(V, term, opts, bm25);
  const out = [];
  for (const v of r.found) {
    const words = wordsOf(V, r, v);
    const score = V.acc.score[v] * words.length;
    for (const sid of [V.sidA[v], V.sidB[v]]) if (sid >= 0) out.push({ id: V.ms._documentIds.get(sid), score, terms: words.slice() });
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}

/**
 * A unit's hits in the reader's edition (MiniSearch's, `body`), each verse the unit finds in its KJV wording carrying
 * that reading's score apart (`kjv`; the search adds a verse's two readings up each on its own and keeps the better):
 * a verse found in the KJV alone joins after them, best first, with its stored fields as MiniSearch hands a hit, its
 * own reading's score 0 (`kjvOnly`). A hit's terms take the KJV wording's words too (the words the unit found).
 * @param {KjvView} V @param {any[]} body @param {string} term @param {Parameters<typeof scoreUnit>[2]} opts
 * @param {Parameters<typeof scoreUnit>[3]} bm25 @param {(id: string) => any} fieldsOf
 */
export function kjvReading(V, body, term, opts, bm25, fieldsOf) {
  const r = scoreUnit(V, term, opts, bm25);
  if (!r.found.length) return body;
  const A = V.acc;
  const ids = V.ms._idToShortId;
  for (const h of body) {
    const sid = ids.get(h.id);
    const v = sid === undefined || sid >= V.verseOf.length ? -1 : V.verseOf[sid];
    if (v < 0 || A.at[v] !== r.stamp || (r.and && A.seen[v] !== r.n)) continue;
    A.done[sid] = r.stamp;
    const words = wordsOf(V, r, v);
    h.kjv = A.score[v] * words.length;
    for (const w of words) if (h.terms.indexOf(w) < 0) h.terms.push(w);
  }
  const more = [];
  for (const v of r.found) {
    /** @type {string[]|null} */ let words = null;
    for (const sid of [V.sidA[v], V.sidB[v]]) {
      if (sid < 0 || A.done[sid] === r.stamp) continue;
      words = words || wordsOf(V, r, v);
      const id = V.ms._documentIds.get(sid);
      more.push(Object.assign({ id, score: 0, kjv: A.score[v] * words.length, kjvOnly: true, terms: words.slice() }, fieldsOf(id) || {}));
    }
  }
  more.sort((x, y) => y.kjv - x.kjv);
  for (const h of more) body.push(h);
  return body;
}

/** A verse's KJV tokens (kjvEncode's), by its short id; null when it has none here. */
export function twinTokens(/** @type {KjvView} */ V, /** @type {number} */ sid) {
  const v = sid < V.verseOf.length ? V.verseOf[sid] : -1;
  if (v < 0) return null;
  const D = V.data;
  const out = new Array(D.vFrom[v + 1] - D.vFrom[v]);
  for (let k = 0; k < out.length; k++) out[k] = D.words[D.tok[D.vFrom[v] + k]];
  return out;
}

/** A verse's KJV sentences, each as its tokens, by its short id; [] when it has none here. */
export function twinSentences(/** @type {KjvView} */ V, /** @type {number} */ sid) {
  const v = sid < V.verseOf.length ? V.verseOf[sid] : -1;
  if (v < 0) return [];
  const D = V.data;
  const out = [];
  let a = D.vFrom[v];
  for (let s = D.vSent[v]; s < D.vSent[v + 1]; s++) {
    const e = D.sEnd[s];
    const t = new Array(e - a);
    for (let k = 0; k < t.length; k++) t[k] = D.words[D.tok[a + k]];
    out.push(t);
    a = e;
  }
  return out;
}

/* THE FILE'S LOAD, as the substitution lexicon's (engine.js B7): named by setKjvTwinSource (ui/_entry-d.js), fetched
   on the first build beside the index, kept offline by the service worker (CORE_ASSETS, ASSET_INTEGRITY) and
   packaged in the APK (tools/check-apk-assets.js). A search waits for it at most KJV_TWIN_WAIT_MS, once; a file that
   does not load (offline and never cached, a 404, a redirect, a bad file) leaves the search as it is without one, and
   the next build tries again. */
/** @type {KjvTwin|null} */ let TWIN = null;
/** @type {string|null} */ let SOURCE = null;
/** @type {{url: string, done: Promise<void>, settled: boolean, failed: boolean, wait?: Promise<void>, waited?: boolean}|null} */
let LOAD = null;
/** @type {Array<() => void>} told when the wording in use changes */ const LISTENERS = [];
/** The longest a text search waits for the file (the first search after a cold start; it loads with the index). */
export const KJV_TWIN_WAIT_MS = 2000;

/** The KJV wording in use; null, none. */
export function kjvTwin() { return TWIN; }
/** Tell `fn` whenever the wording in use changes (engine.js reads its texts again). */
export function onKjvTwin(/** @type {() => void} */ fn) { LISTENERS.push(fn); }
function putInUse(/** @type {KjvTwin|null} */ t) {
  if (t === TWIN) return;
  TWIN = t;
  for (const fn of LISTENERS) fn();
}
/** Set the wording directly (null: none); the file named by setKjvTwinSource is no longer read. */
export function setKjvTwin(/** @type {KjvTwin|null} */ t) {
  SOURCE = null;
  LOAD = null;
  putInUse(t || null);
}
/** Name the file (relative to the page), fetched on the next build or text search; null: none. */
export function setKjvTwinSource(/** @type {string|null} */ url) {
  SOURCE = url || null;
  LOAD = null;
  putInUse(null);
}
/**
 * Start (or join) the file's load. `again`: a load that failed is tried once more (a build).
 * @param {boolean} again
 */
export function loadKjvTwin(again) {
  const url = SOURCE;
  if (!url || typeof fetch !== 'function') return null;
  if (LOAD && LOAD.url === url && !(again && LOAD.failed)) return LOAD;
  /** @type {{url: string, done: Promise<void>, settled: boolean, failed: boolean, wait?: Promise<void>, waited?: boolean}} */
  const load = { url, done: Promise.resolve(), settled: false, failed: false };
  LOAD = load;
  load.done = fetch(url)
    .then((r) => {
      // a redirected answer is a captive portal or a proxy, not the file
      if (!r.ok || r.redirected) throw new Error('kjv twin: ' + url + ' ' + (r.redirected ? 'redirected' : r.status));
      return r.json();
    })
    .then((j) => { const t = parseKjvTwin(j); if (LOAD === load) putInUse(t); })
    .catch(() => { load.failed = true; })
    .finally(() => { load.settled = true; });
  return load;
}
/**
 * Resolves when the file has loaded or failed, or KJV_TWIN_WAIT_MS has passed; at once when it is settled. The wait
 * is one per load, shared by the searches that join it (a held file must not cost every search the wait).
 */
export function kjvTwinReady() {
  const load = loadKjvTwin(false);
  if (!load || load.settled || load.waited) return Promise.resolve();
  if (!load.wait) {
    /** @type {any} */ let timer = 0;
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, KJV_TWIN_WAIT_MS); });
    load.wait = Promise.race([load.done, timeout]).finally(() => { clearTimeout(timer); load.waited = true; });
  }
  return load.wait;
}
/** What the status line says of it: 'ready', 'loading', 'failed' or 'none'. */
export function kjvTwinStatus() {
  if (TWIN) return 'ready';
  if (LOAD) return LOAD.failed ? 'failed' : 'loading';
  return 'none';
}

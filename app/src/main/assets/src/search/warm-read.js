/* ═══════════════════════════════════════════════════════════════════════
   search/warm-read.js — what the engine reads of an index once it is in use
   ═══════════════════════════════════════════════════════════════════════
   The originals' keys (a text's sentences, a letter's runs of words) and the token store, read from the index's
   stored fields after it swaps in, and the first search waits for them. Moved out of engine.js (search200 h8,
   2026-11-04) unchanged, so the search worker (worker-ops.js 'warm') reads them with the same code as the page:
   nothing here reads the engine's state; the KJV wording a verse is read with is passed in (`V`, kjv-twin.js). */
import { kjvEncode } from './tokenize.js';
import { twinTokens, twinSentences } from './kjv-twin.js';

/** A token no query holds, between a verse's two wordings. */
export const TWIN_SEP = '|';
/** Between a verse's two wordings: no typed run reaches across it, and a window or an alignment reads each alone
    (eachWording, wordingsOf). */
export const TWIN_GAP = new Array(12).fill(TWIN_SEP);
/** A text's tokens with its KJV wording after them (a verse worded otherwise in the KJV, in `V`); `own` as it is else. */
export function withKjvView(/** @type {import('./kjv-twin.js').KjvView|null} */ V, /** @type {any} */ ms, /** @type {number|undefined} */ sid, /** @type {string[]} */ own) {
  const kjv = V && V.ms === ms ? twinTokens(V, sid) : null;
  if (!kjv) return own;
  if (kjv.length === own.length) {
    let i = 0;
    while (i < own.length && own[i] === kjv[i]) i++;
    if (i === own.length) return own;
  }
  return own.concat(TWIN_GAP, kjv);
}
export const ORIGINAL_KINDS = new Set(['verse', 'letter', 'wtlb', 'blessed']);
/** The sentences of a text, as character spans (a sentence ends at . ! ? ; or a line's end). */
export function sentenceSpans(text) {
  const out = [];
  const re = /[^.!?;\n]+[.!?;]*/g;
  let m;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  return out;
}
/* HIS NAME AS THE EDITIONS PRINT IT (sr11, 2026-10-15). The studies and the Matthew Study Bible restore His name
   in the verses they quote ("When YahuShua heard these things, He marveled at him"), and the edition the index
   holds prints "Jesus" (Luke 7:9): the study's sentence never met its verse's key, and the study led the verse. */
export const RESTORED_NAME = /^(?:yahushua|yeshua|yahshua|yahusha|yeshu)$/;
export const nameAsPrinted = (/** @type {string} */ t) => (RESTORED_NAME.test(t) ? 'jesus' : t);
/** A sentence's key: its words as the index reads them, His name as printed; null under five words (too common to mean one text). */
export function sentenceKey(s) {
  return tokensKey(kjvEncode(s));
}
/** The key of a sentence read as tokens (a verse's KJV wording, kjv-twin.js). */
export function tokensKey(/** @type {string[]} */ toks) {
  return toks.length >= 5 ? toks.map(nameAsPrinted).join(' ') : null;
}
/* Words To Live By cuts its excerpts mid-sentence and the Answers reprints re-punctuate, so a
   whole-sentence key misses them: a letter, Words To Live By or Blessed text is also keyed by
   runs of SHINGLE words, a content-chosen quarter of them (hash % 4 === 0), which both sides
   pick alike wherever the run falls. Verses are short: their sentence keys suffice. */
export const SHINGLE = 8;
/** FNV-1a over a run of tokens. */
export function runHash(toks, from) {
  let h = 0x811c9dc5;
  for (let i = from; i < from + SHINGLE; i++) {
    const t = toks[i];
    for (let c = 0; c < t.length; c++) h = Math.imul(h ^ t.charCodeAt(c), 16777619);
    h = Math.imul(h ^ 32, 16777619);
  }
  return h >>> 0;
}
/** @param {string[]} toks @param {(h:number) => void} each */
export function eachShingle(toks, each) {
  for (let i = 0; i + SHINGLE <= toks.length; i++) { const h = runHash(toks, i); if (h % 4 === 0) each(h); }
}
export const addTo = (/** @type {Map<any, string[]>} */ m, /** @type {any} */ k, /** @type {string} */ id) => {
  const list = m.get(k);
  if (!list) m.set(k, [id]);
  else if (list[list.length - 1] !== id) list.push(id);
};
/* A LETTER'S HEADING IS NO ONE'S WORDS (sr11, 2026-10-15). Every Answers excerpt opens with the heading of the letter
   it comes from ("1/29/05 From The Lord, Our God and Savior The Word of The Lord Spoken to Timothy For The Lord's
   Little Flock, and For All Those Who Have Ears to Hear"), and a letter with an addendum or a second word holds one in
   its text (Volume One's "Christmas", Volume Four's "Obey God"). Keyed, that heading's runs named "Obey God" the
   original of any Answers passage the model matched next to a heading, and it led searches about other things
   (benchmark t320 "keep watch", t401 "come out of the churches"). A heading is never keyed. */
export const HEADING = /(?:\d{1,2}\/\d{1,2}\/\d{2,4}\s+)?(?:From [^.!?\n]{0,80}?Savior\s+)?[^.!?\n]{0,40}?(?:to|from) Timothy\s+For [^.!?\n]{0,120}?Ears to Hear/gi;
/** Key one stored doc if it is an original: its sentences (a verse's in its KJV wording too, `V`) and, past a verse,
    its runs of words. */
export function addOriginal(/** @type {Map<string, string[]>} */ O, /** @type {Map<number, string[]>} */ S, /** @type {Map<string, any>} */ D, /** @type {string} */ id, /** @type {any} */ f,
  /** @type {import('./kjv-twin.js').KjvView|null} */ V, /** @type {number} */ sid) {
  if (!f || !ORIGINAL_KINDS.has(f.kind) || !f.text) return;
  D.set(id, f);
  const text = f.kind !== 'verse' && /ears to hear/i.test(f.text) ? f.text.replace(HEADING, '\n') : f.text;
  for (const sp of sentenceSpans(text)) {
    const k = sentenceKey(sp.text);
    if (k) addTo(O, k, id);
  }
  if (f.kind !== 'verse') eachShingle(kjvEncode(text), (h) => addTo(S, h, id));
  else if (V) for (const toks of twinSentences(V, sid)) { const k = tokensKey(toks); if (k) addTo(O, k, id); }
}
/** A store being filled: `add` one stored doc, `done` the store; `V` the KJV wording its verses are read with. */
export function storeBuilder(/** @type {any} */ ms, /** @type {import('./kjv-twin.js').KjvView|null} */ V) {
  /** @type {Map<string, number>} */ const ids = new Map();
  /** @type {string[]} */ const words = [];
  /** @type {string[]} */ const keys = [];
  /** @type {number[]} */ const base = [];
  /** @type {number[]} */ const from = [];
  /** @type {number[]} */ const to = [];
  let toks = new Uint32Array(1 << 20);
  let n = 0;
  const idOf = (/** @type {string} */ key, /** @type {string} */ word, /** @type {number} */ b) => {
    let id = ids.get(key);
    if (id === undefined) { id = words.length; ids.set(key, id); words.push(word); keys.push(key); base.push(b); }
    return id;
  };
  const sId = idOf('s', 's', -1);
  return {
    add(/** @type {number} */ shortId, /** @type {any} */ f) {
      if (!f) return;
      const raw = withKjvView(V, ms, shortId, kjvEncode((f.text || '') + ' ' + (f.title || '')));
      if (n + raw.length > toks.length) {
        const t = new Uint32Array(Math.max(Math.ceil(toks.length * 1.5), n + raw.length));
        t.set(toks.subarray(0, n));
        toks = t;
      }
      const a = n;
      for (let i = 0; i < raw.length; i++) {
        const w = raw[i];
        if (w === 's' && n > a) {
          // joinApostropheS: the "s" joins the word before it
          const prev = toks[n - 1];
          toks[n - 1] = idOf(keys[prev] + "'s", words[prev] + 's', prev);
        } else {
          toks[n++] = idOf(w, w, -1);
        }
      }
      from[shortId] = a;
      to[shortId] = n;
    },
    /** @returns {import('./engine.js').TokenStore} */
    done() {
      return {
        ms, words, ids, sId,
        base: Int32Array.from(base),
        toks: n < toks.length * 0.9 ? toks.slice(0, n) : toks,
        from: Uint32Array.from(from, (x) => x || 0),
        to: Uint32Array.from(to, (x) => x || 0),
      };
    },
  };
}

/**
 * The originals' keys and the token store of an index, in one pass over its stored fields (the search worker's read,
 * worker-ops.js): what engine.js readOriginals and readStore make of it, but the docs map, which the page makes of
 * its own stored fields.
 * @param {any} ms  an index, or what of one this reads: _storedFields, _documentIds (and _nextId, _fieldIds for `V`)
 * @param {import('./kjv-twin.js').KjvView|null} V
 */
export function readWarm(ms, V) {
  /** @type {Map<string, string[]>} */ const O = new Map();
  /** @type {Map<number, string[]>} */ const S = new Map();
  const D = new Map();
  const ids = ms._documentIds;
  const b = storeBuilder(ms, V);
  for (const [sid, f] of ms._storedFields) addOriginal(O, S, D, ids.get(sid), f, V, sid);
  for (const [sid, f] of ms._storedFields) b.add(sid, f);
  return { O, S, store: b.done() };
}

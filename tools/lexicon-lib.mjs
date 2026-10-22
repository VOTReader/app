/* ═══════════════════════════════════════════════════════════════════════
   tools/lexicon-lib.mjs — what the substitution lexicons' builders share (search200 B7, 2026-10-18)
   ═══════════════════════════════════════════════════════════════════════
   build-wordnet-lex.mjs writes the lexicon the app ships (search-lexicon.json);
   build-slips.mjs writes the translations' slips, measured beside it and not
   shipped. Both keep a word pair only when both words are content words the
   corpus holds, and key it by light lemma (search/passage.js), so one pair
   covers a word's forms.

   Dropping the final -e makes some lemmas stand for two words: "not" is not and
   note, "car" car and care, "cloth" cloth and clothe. A key belongs to the word
   the corpus says more often: a pair through the other word would hand its
   partners to every reader typing the first (typed "not" met a text's "mark"
   and "notice", note's), so it is left out (underOtherWord).
   Pure but corpusVocabulary (it reads the corpus the benchmark reads).
   ═══════════════════════════════════════════════════════════════════════ */
import { docs as buildDocs } from './search-bench/corpus.mjs';

/**
 * Every token any searched text holds (text and title, tokenized as the index tokenizes), with its count.
 * @param {(s: string) => string[]} toks
 * @returns {Promise<Map<string, number>>}
 */
export async function corpusVocabulary(toks) {
  /** @type {Map<string, number>} */
  const vocab = new Map();
  for (const d of await buildDocs()) for (const t of toks((d.text || '') + ' ' + (d.title || ''))) vocab.set(t, (vocab.get(t) || 0) + 1);
  return vocab;
}

/** @type {WeakMap<Map<string, number>, Map<string, { bare: number, e: number }>>} */
const SIDES = new WeakMap();

/**
 * Is `w` the less said of two words its light lemma stands for (note under "not", whose forms start with
 * "note"; not, said far more, keeps the key)? False for a lemma that stands for one word.
 * @param {string} w @param {Map<string, number>} vocab  corpusVocabulary @param {(w: string) => string} lemma
 */
export function underOtherWord(w, vocab, lemma) {
  const l = lemma(w);
  const e = l + 'e';
  if (!vocab.has(l) || !vocab.has(e) || lemma(e) !== l) return false;
  let sides = SIDES.get(vocab);
  if (!sides) {
    sides = new Map();
    for (const [t, n] of vocab) {
      const k = lemma(t);
      if (!vocab.has(k) || !vocab.has(k + 'e') || lemma(k + 'e') !== k) continue;
      let s = sides.get(k);
      if (!s) sides.set(k, (s = { bare: 0, e: 0 }));
      if (t.startsWith(k + 'e')) s.e += n; else s.bare += n;
    }
    SIDES.set(vocab, sides);
  }
  const s = /** @type {{ bare: number, e: number }} */ (sides.get(l));
  return w.startsWith(e) ? s.e < s.bare : s.bare < s.e;
}

/* ── the translations' slips (build-slips.mjs) ── */

let dp = new Uint16Array(1);
/**
 * The one-for-one swaps of two tokenized verses: between two consecutive tokens of their LCS (the verses' ends
 * count), a gap of exactly one token on each side is [a's word, b's word].
 * @param {string[]} a @param {string[]} b
 * @returns {Array<[string, string]>}
 */
export function swaps(a, b) {
  const n = a.length;
  const m = b.length;
  const W = m + 1;
  if (dp.length < (n + 1) * W) dp = new Uint16Array((n + 1) * W * 2);
  for (let j = 0; j <= m; j++) dp[j] = 0;
  for (let i = 1; i <= n; i++) {
    const r = i * W;
    const p = r - W;
    dp[r] = 0;
    for (let j = 1; j <= m; j++) dp[r + j] = a[i - 1] === b[j - 1] ? dp[p + j - 1] + 1 : dp[p + j] >= dp[r + j - 1] ? dp[p + j] : dp[r + j - 1];
  }
  /** @type {Array<[number, number]>} anchors, last first */
  const anch = [[n, m]];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { anch.push([i - 1, j - 1]); i--; j--; } else if (dp[(i - 1) * W + j] >= dp[i * W + j - 1]) i--; else j--;
  }
  anch.push([-1, -1]);
  anch.reverse();
  /** @type {Array<[string, string]>} */
  const out = [];
  for (let k = 1; k < anch.length; k++) {
    const [pi, pj] = anch[k - 1];
    const [ci, cj] = anch[k];
    if (ci - pi === 2 && cj - pj === 2) out.push([a[pi + 1], b[pj + 1]]);
  }
  return out;
}

/**
 * For one verse pair: did a swap's word move rather than get traded (its lemma is in the other verse too)?
 * @param {string[]} a @param {string[]} b @param {(w: string) => string} lem
 * @returns {(la: string, lb: string) => boolean}  la: the lemma of a's word, lb: of b's
 */
export function movedIn(a, b, lem) {
  const inA = new Set(a.map(lem));
  const inB = new Set(b.map(lem));
  return (la, lb) => inB.has(la) || inA.has(lb);
}

/**
 * Normalized PMI of a pair over swap observations: 1 when the two only ever trade with each other, 0 when
 * they trade as often as chance would have them.
 * @param {number} c  the pair's observations @param {number} ca @param {number} cb  each lemma's, in all its pairs
 * @param {number} n  every observation
 */
export function npmi(c, ca, cb, n) {
  const pxy = c / n;
  return Math.log(pxy / ((ca / n) * (cb / n))) / -Math.log(pxy);
}

/** A slip pair's credit: 0.5 + 0.4 x NPMI, to a tenth (0.5..0.9); null for a pair with no positive association. */
export function slipCredit(/** @type {number} */ x) {
  if (!(x > 0)) return null;
  return Math.round((0.5 + 0.4 * Math.min(1, x)) * 10) / 10;
}

/* ── WordNet (build-wordnet-lex.mjs) ── */

/** A sense this far down a word's list, or nearer, is one of its most frequent. */
export const CLOSE_RANK = 2;

/**
 * A WordNet link's credit, close above loose: 0.7 one synset and 0.6 a similar-to link, both among the two words'
 * two most frequent senses; 0.5 either through a less frequent sense, and 0.5 a direct hypernym link (one a kind
 * of the other: tread, walk) among the most frequent senses; null for a hypernym link through a rarer sense.
 * @param {string} rel  syn, sim or hyp (tools/wordnet-pairs.py) @param {number} ra @param {number} rb  sense ranks
 * @returns {number|null}
 */
export function wordnetCredit(rel, ra, rb) {
  const close = Math.max(ra, rb) <= CLOSE_RANK;
  if (rel === 'hyp') return close ? 0.5 : null;
  if (!close) return 0.5;
  return rel === 'syn' ? 0.7 : 0.6;
}

/* ── the file the app loads ── */

/**
 * The lexicon file the app fetches beside the index (engine.js setAlignLexiconSource), as text: what it is, its
 * source and license whole, and the packed pairs (search/lexicon.js). Deterministic for one input.
 * @param {{ name: string, about: string, source: string, license: string, generator: string }} meta
 * @param {string} packed  formatLexicon's output
 */
export function lexiconAsset(meta, packed) {
  const pairs = packed ? packed.split('\n').reduce((k, l) => k + l.split(' ').length - 1, 0) : 0;
  const { name, about, source, license, generator } = meta;
  return JSON.stringify({ name, about, source, license, generator, pairs, lexicon: packed }, null, 2) + '\n';
}

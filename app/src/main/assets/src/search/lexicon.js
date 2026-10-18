/* ═══════════════════════════════════════════════════════════════════════
   search/lexicon.js — word-for-word substitution lexicons for align.js (search200 B7)
   ═══════════════════════════════════════════════════════════════════════
   A lexicon is a set of word pairs a reader trades for each other, each with a
   credit 0.5..0.9: align.js gives a typed word that share of its weight when
   the text says its partner in its place. Lexicons only credit a substitution
   inside alignment; they are never query terms and never widen recall, so a
   query typed as a text says it is untouched (no text holds the typed run
   whole and is aligned; the run itself is tier A).

   Keys are light lemmas (passage.js lemma), so one pair covers its forms:
   "astonish amaz" meets astonished/amazed and astonishes/amazing alike.

   The packed form (what the generated lexicon-*.js files hold): one line per
   head lemma, its partners after it, each partner's credit as a last digit
   (tenths): "amaz astonish8 marvel6". Every pair is written once, under the
   lemma that sorts first; parseLexicon reads both directions.
   Pure; chrome108-safe; no dependency.
   ═══════════════════════════════════════════════════════════════════════ */

/** @typedef {Map<string, Map<string, number>>} Lexicon  lemma -> partner lemma -> credit */

/**
 * The packed form of a list of pairs (a builder's output). Credits round to a tenth, 0.1..0.9;
 * a pair listed twice keeps its higher credit. Lemmas must be letters only.
 * @param {Array<[string, string, number]>} pairs
 * @returns {string}
 */
export function formatLexicon(pairs) {
  /** @type {Map<string, Map<string, number>>} */
  const by = new Map();
  for (const [a, b, s] of pairs) {
    if (!/^[a-z]+$/.test(a) || !/^[a-z]+$/.test(b) || a === b) throw new Error(`lexicon: bad pair ${a} ${b}`);
    const d = Math.max(1, Math.min(9, Math.round(s * 10)));
    const [h, p] = a < b ? [a, b] : [b, a];
    let m = by.get(h);
    if (!m) by.set(h, (m = new Map()));
    m.set(p, Math.max(m.get(p) || 0, d));
  }
  return [...by.keys()].sort().map((h) => {
    const m = /** @type {Map<string, number>} */ (by.get(h));
    return h + ' ' + [...m.keys()].sort().map((p) => p + m.get(p)).join(' ');
  }).join('\n');
}

/**
 * Read a packed lexicon, or several (a pair in two keeps its higher credit).
 * @param {...string} packed
 * @returns {Lexicon}
 */
export function parseLexicon(...packed) {
  /** @type {Lexicon} */
  const lex = new Map();
  const put = (/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ s) => {
    let m = lex.get(a);
    if (!m) lex.set(a, (m = new Map()));
    if (!(m.get(b) >= s)) m.set(b, s);
  };
  for (const str of packed) {
    if (typeof str !== 'string' || !str) continue;
    for (const line of str.split('\n')) {
      const parts = line.split(' ');
      const h = parts[0];
      if (!h) continue;
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        const d = p.charCodeAt(p.length - 1) - 48;
        if (p.length < 2 || d < 1 || d > 9) continue;
        const w = p.slice(0, -1);
        put(h, w, d / 10);
        put(w, h, d / 10);
      }
    }
  }
  return lex;
}

/**
 * The text words a lemma stands for that a token store may hold: the lemma itself, with -e, and their
 * endings (align.js opens windows on them). Only those whose own lemma is `l` are kept.
 * @param {string} l @param {(w: string) => string} lemmaOf
 * @returns {string[]}
 */
export function lemmaSurfaces(l, lemmaOf) {
  const bases = [l, l + 'e'];
  if (l.endsWith('y')) bases.push(l.slice(0, -1) + 'ie');
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const b of bases) {
    for (const e of ['', 's', 'd', 'ed', 'es', 'ing', 'eth', 'est', 'th', 'st']) {
      const w = b + e;
      if (seen.has(w)) continue;
      seen.add(w);
      if (lemmaOf(w) === l) out.push(w);
    }
  }
  return out;
}

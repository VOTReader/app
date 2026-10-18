/* ═══════════════════════════════════════════════════════════════════════
   search/align.js — how much of a misremembered quote one text holds (search200 B4)
   ═══════════════════════════════════════════════════════════════════════
   A reader quoting from memory makes slips: a tense ("walks" for walked), the
   modern word for the King James one (says/saith, to/unto, believes/believeth,
   will/shall), a synonym, a word of their own in a word's place (conquered for
   defeated), a clause left out, two words swapped, a real word for another
   (prey/pray), two clauses run together or put in the other order, a word
   joined or split ("forever" / "for ever"). The phrase pass (ranking.js
   nearPhrase) compares exact tokens, so every slip breaks its run.

   alignScore lines the typed words up against a text the way a reader would
   recognise it. Every typed word is met (itself 1; a form or register word 0.9;
   a synonym or a one-letter slip 0.6; a content word in its place, right after
   a met word, 0.3) or skipped (a charge); the text may hold words the reader
   left out (a smaller charge), two neighbours swapped, and one jump between two
   clauses, forward or back. It runs only in windows around the query's rarest
   words (a word the text repeats keeps its few windows that hold the most of
   the query), so a 20,000-word topic costs a few short windows. cov is the score over
   the query's whole weight (each word's idf), 0..1: 1 is the quote word for word.

   Tokens may be strings (kjvEncode) or a token store's numeric ids
   (alignClasses `id` / `word`); start/end are token indices into the text
   (end exclusive), so an offsets twin of the tokenizer turns start into a
   landing (placeStart). Pure and synchronous; chrome108-safe; no dependency
   outside search/.
   ═══════════════════════════════════════════════════════════════════════ */

import { lemma } from './passage.js';
import { wordForms } from './word-forms.js';
import { kjvEncode } from './tokenize.js';
import { searchData } from './search-data.js';
import { lemmaSurfaces } from './lexicon.js';

/** Credits (a share of a typed word's weight) and charges (PLAN B4); alignClasses `credits` overrides any. */
export const ALIGN = Object.freeze({
  FORM: 0.9, // the same lemma or word form: tense, number, -eth/-est
  REGISTER: 0.9, // the King James word for the modern one, a modal's other tense, a number word for its digits
  SYNONYM: 0.6, // a SYNONYM_MAP group
  EDIT: 0.6, // one letter off: a real word for another (prey/pray)
  JOIN: 1, // a word joined or split ("forever" / "for ever")
  SLOT: 0.3, // a content word in a typed content word's place, right after a met word (never two in a row)
  SKIP: 0.3, // x idf, a typed word the text lacks
  SKIP_STOP: 0.1, // a third of that for a stop word
  INSERT: 0.1, // a text word inside the span that the reader left out
  SWAP: 0.2, // x idf (the pair's mean), two neighbours swapped
  JUMP: 2, // one jump between two clauses, run together or put in the other order (about 20 left-out words)
  JUMP_FLOOR: 0.5, // a jump is tried only where it could lift cov this high (below it no ranking listens)
  PAD: 8, // a window reaches the query's length, plus this and a quarter of the length, past its anchor
  WINDOWS: 4, // an anchor the text repeats opens this many windows: the ones holding the most typed weight
});
/** @typedef {Record<keyof typeof ALIGN, number>} AlignK  ALIGN's numbers, any of them overridden */

/* The register table: words a reader trades for each other without noticing. Each line is one
   group, every member a match for every other; a word in two lines meets both, but the two lines
   never meet each other (why is not therefore). kjvEncode already folds the pronouns and shalt,
   wilt, hast, hath, doth, dost, didst, canst. The contraction pieces ("don t", "i m") are what the
   tokenizer leaves of don't and I'm. */
const REGISTER_GROUPS = [
  'shall will', 'will would', 'shall should', 'can could', 'may might',
  'is was are were am be been art wast', 'has have had', 'do does did doeth',
  'say says said saith', 'speak speaks spoke spake spoken', 'to unto', 'on upon', 'its thereof',
  'why wherefore', 'therefore wherefore', 'where whither', 'where whence', 'here hither', 'there thither',
  'truly verily', 'yes yea', 'no nay', 'whoever whoso whosoever', 'behold lo', 'look behold',
  'listen hearken', 'show shew', 'before ere', 'among amongst', 'while whilst', 'perhaps peradventure', 'often oft',
  'not t', 'do don', 'am m', 'will ll', 'are re', 'have ve',
];
const NUMBER_WORDS = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
const ORDINALS = 'first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth'.split(' ');
const SUFFIX = (/** @type {number} */ n) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
for (let n = 1; n <= 20; n++) REGISTER_GROUPS.push(NUMBER_WORDS[n - 1] + ' ' + n, ORDINALS[n - 1] + ' ' + n + SUFFIX(n));
REGISTER_GROUPS.push('thirty 30', 'forty 40', 'fifty 50', 'hundred 100', 'thousand 1000');
/** @type {Map<string, Set<string>>} */
const REGISTER = new Map();
for (const g of REGISTER_GROUPS) {
  const ws = g.split(' ');
  for (const w of ws) {
    let s = REGISTER.get(w);
    if (!s) REGISTER.set(w, (s = new Set()));
    for (const x of ws) if (x !== w) s.add(x);
  }
}

/* A SMALL WORD IS A CLOSED CLASS (search200 R4, 2026-10-18). The light lemma strips endings: it finds a content word's
   forms, and it guesses a small word's ("note" and "notes" key as "not", "here" as "her"). A stop word or a negation
   meets a content word by a form only where the small word's paradigm below lists it (said: saying); otherwise neither
   meets the other by a form, and two content words do not meet through a small word's key (here, hers). A negation
   takes no lexicon partner either (none keys as "non", the hour). */
const NEGATIONS = new Set(['not', 'no', 'nor', 'never', 'neither', 'none', 'nothing', 'nay', 'naught', 'nought']);
const PARADIGMS = [
  'be am is are was were been being art wast wert', 'have has had having hadst', 'do does did doing done doeth doest',
  'say says said saying saith sayest saidst', 'her hers', 'their theirs',
];
/** @type {Map<string, number>} a small word's paradigm, and its forms', by number */
const PARADIGM = new Map();
PARADIGMS.forEach((g, n) => { for (const w of g.split(' ')) PARADIGM.set(w, n); });

const VOWEL = /[aeiou]/;
const LETTERS = /^[a-z]+$/;

/**
 * One letter off, for words of 4+ letters: a letter changed, added or dropped, or two neighbours
 * swapped. Four-letter words meet only by a vowel for a vowel (pray/prey, live/love), never
 * lord/word; a letter added or dropped, or a swap, needs 5+.
 * @param {string} a @param {string} b
 */
function oneEdit(a, b) {
  const la = a.length;
  const lb = b.length;
  if (la < 4 || lb < 4 || la - lb > 1 || lb - la > 1 || !LETTERS.test(a) || !LETTERS.test(b)) return false;
  if (la === lb) {
    let i = 0;
    while (i < la && a[i] === b[i]) i++;
    if (i === la) return false;
    if (a.slice(i + 1) === b.slice(i + 1)) return la >= 5 || (VOWEL.test(a[i]) && VOWEL.test(b[i]));
    return la >= 5 && i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  if (la < 5 || lb < 5) return false;
  const s = la < lb ? a : b;
  const l = la < lb ? b : a;
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

/** The endings a typed word reaches forward (word-forms.js leaves out the forms a prefix search finds). */
const ENDINGS = ['s', 'es', 'ed', 'd', 'ing', 'eth', 'est', 'th', 'st'];

/** A typed word's family: its word forms, its forward endings, and a short King James form's base (goeth, seeth). */
function familyOf(/** @type {string} */ q, /** @type {(w: string) => boolean} */ isStop) {
  const out = new Set(wordForms(q, isStop));
  if (!LETTERS.test(q) || q.length < 3) return out;
  for (const e of ENDINGS) out.add(q + e);
  if (q.endsWith('e')) out.add(q.slice(0, -1) + 'ing');
  if (q.length >= 5 && /(eth|est)$/.test(q)) {
    for (const b of [q.slice(0, -3), q.slice(0, -3) + 'e', q.slice(0, -2)]) {
      if (b.length < 2) continue;
      out.add(b);
      out.add(b + 's');
      out.add(b + 'es');
      if (b.length >= 3) for (const f of wordForms(b, isStop)) out.add(f);
    }
  }
  out.delete(q);
  return out;
}

/**
 * @typedef {Object} AlignEntry
 * @property {number[]} c  pairs [query position (1-based), credit, ...]: the typed words this text token meets
 * @property {number} join  the 1-based position i when this token spells typed words i-1 and i run together, else 0
 * @property {number} stop  1 when this text token is a stop word
 * @property {number} pre  1 when this text token begins a typed word (it may be the first half of a split)
 */
/** @type {AlignEntry} */
const NO_ENTRY = Object.freeze({ c: [], join: 0, stop: 0, pre: 0 });
/** @type {AlignEntry} */
const NO_ENTRY_STOP = Object.freeze({ c: [], join: 0, stop: 1, pre: 0 });

/**
 * @typedef {Object} AlignClasses
 * @property {number} m  the query's length in tokens
 * @property {string[]} words  the typed words
 * @property {Uint8Array} stop  1 where the typed word is a stop word
 * @property {Array<Set<any>>} anchor  per typed word (0-based): the text tokens that open a window on it
 * @property {Array<Set<any>>} lexAnchor  per typed word (0-based): its lexicon partners' text tokens (none of anchor's),
 *   which open a window on it only in a text that holds none of its anchor tokens
 * @property {AlignK} k  the credits and charges in force
 * @property {(tok: any) => AlignEntry} entry  what one text token meets (memoized for the query's life)
 * @property {(a: any, b: any) => number} splitAt  the 1-based position of a typed word two text tokens spell, else 0
 */

/** A lexicon partner's text words (lexicon.js lemmaSurfaces), kept for the session: the lexicons are fixed. */
/** @type {Map<string, string[]>} */
const SURFACES = new Map();
function surfacesOf(/** @type {string} */ l) {
  let s = SURFACES.get(l);
  if (!s) {
    if (SURFACES.size > 20000) SURFACES.clear();
    SURFACES.set(l, (s = lemmaSurfaces(l, lemma)));
  }
  return s;
}

/**
 * A typed lemma's partners in the substitution lexicons (search200 B7): partner lemma -> credit, every
 * lexicon's highest; null when it has none.
 * @param {Array<import('./lexicon.js').Lexicon>} lexicons @param {string} l
 * @returns {Map<string, number>|null}
 */
function partnersOf(lexicons, l) {
  /** @type {Map<string, number>|null} */
  let out = null;
  let own = false;
  for (const L of lexicons) {
    const p = L.get(l);
    if (!p) continue;
    if (!out) { out = p; continue; }
    if (!own) { out = new Map(out); own = true; }
    for (const [k, v] of p) if (!(/** @type {Map<string, number>} */ (out).get(k) >= v)) out.set(k, v);
  }
  return out;
}

/**
 * The substitution classes of a query, built once and shared by every text it is aligned against:
 * word forms and lemmas (word-forms.js, passage.js), the register table, SYNONYM_MAP, and the
 * substitution lexicons when given (lexicon.js).
 * @param {string[]} words  the typed words, kjvEncode'd (the same tokenizer as the texts)
 * @param {{ stop?: Set<string> | ((w: string) => boolean), synonyms?: Object<string, string[]>,
 *   id?: (w: string) => any, word?: (tok: any) => string, credits?: Partial<AlignK>,
 *   lexicon?: import('./lexicon.js').Lexicon | Array<import('./lexicon.js').Lexicon> | null }} [opts]
 *   stop: the stop words (default STOP_WORDS_TRIMMED); synonyms: default SYNONYM_MAP;
 *   id / word: a token store's string -> id and id -> string (default: tokens are the strings);
 *   credits: any of ALIGN's numbers, overridden for this query;
 *   lexicon: word pairs a reader trades (search200 B7): a typed content word meets its partner at the pair's
 *   credit (the highest a word's lemmas reach, never above a form's), and its partner's words open windows
 * @returns {AlignClasses}
 */
export function alignClasses(words, opts) {
  const o = opts || {};
  const D = searchData();
  const K = /** @type {AlignK} */ (Object.assign({}, ALIGN, o.credits || {}));
  const stopSet = o.stop || D.STOP_WORDS_TRIMMED;
  /** @type {(w: string) => boolean} */
  const isStop = typeof stopSet === 'function' ? stopSet : (w) => !!stopSet && stopSet.has(w);
  const SYN = o.synonyms || D.SYNONYM_MAP || {};
  const toId = o.id || ((/** @type {string} */ w) => w);
  const toWord = o.word || ((/** @type {any} */ t) => (typeof t === 'string' ? t : String(t)));
  /** @type {Array<import('./lexicon.js').Lexicon>} */
  const lexicons = !o.lexicon ? [] : Array.isArray(o.lexicon) ? o.lexicon.filter(Boolean) : [o.lexicon];
  /** A stop word or a negation (NEGATIONS) */
  const small = (/** @type {string} */ w) => isStop(w) || NEGATIONS.has(w);
  /** Two words of one class, small or content, or of one small word's paradigm (said, saying) */
  const kin = (/** @type {string} */ a, /** @type {string} */ b) => small(a) === small(b) || (PARADIGM.has(a) && PARADIGM.get(a) === PARADIGM.get(b));
  /** A word's form key: its light lemma, set apart from a small word's when the word is no form of that word (note, here) */
  const keyOf = (/** @type {string} */ w) => { const l = lemma(w); return small(l) && !kin(w, l) ? l + '+' : l; };
  const m = words.length;
  const ws = words.map(String);
  const stop = new Uint8Array(m);
  const lem = [];
  /** @type {string[]} each typed word's form key (keyOf) */
  const key = [];
  const fam = [];
  const syn = [];
  const synLem = [];
  /** @type {Array<Map<string, number>|null>} each typed content word's lexicon partners (lemma -> credit) */
  const lex = [];
  const anchor = [];
  const lexAnchor = [];
  for (let i = 0; i < m; i++) {
    const q = ws[i];
    stop[i] = isStop(q) ? 1 : 0;
    lem.push(lemma(q));
    key.push(keyOf(q));
    // a small word's family holds no content word but its paradigm's, a content word's no small word
    const f = new Set([...familyOf(q, isStop)].filter((x) => kin(q, x)));
    fam.push(f);
    /** @type {Set<string>} */
    const s = new Set();
    const grp = Object.prototype.hasOwnProperty.call(SYN, q) ? SYN[q] : null;
    if (Array.isArray(grp)) {
      for (const x of grp) {
        const t = kjvEncode(String(x));
        if (t.length === 1 && t[0] !== q) s.add(t[0]);
      }
    }
    syn.push(s);
    synLem.push(new Set([...s].map(keyOf)));
    const lp = !stop[i] && !NEGATIONS.has(q) && lexicons.length ? partnersOf(lexicons, lem[i]) : null;
    lex.push(lp);
    const a = new Set();
    const add = (/** @type {string} */ w) => { const t = toId(w); if (t !== undefined && t !== null) a.add(t); };
    add(q);
    for (const w of REGISTER.get(q) || []) add(w);
    for (const w of f) add(w);
    for (const w of s) add(w);
    anchor.push(a);
    const la = new Set();
    if (lp) for (const l of lp.keys()) for (const w of surfacesOf(l)) { const t = toId(w); if (t !== undefined && t !== null && !a.has(t) && !small(w)) la.add(t); }
    lexAnchor.push(la);
  }
  /** @type {Map<string, number>} typed words i-1 and i run together -> i (1-based) */
  const joins = new Map();
  for (let i = 1; i < m; i++) { const j = ws[i - 1] + ws[i]; if (!joins.has(j)) joins.set(j, i + 1); }
  /** @type {Map<string, number>} a typed word a text may split in two -> its position (1-based) */
  const splits = new Map();
  /** @type {Set<string>} the first halves those splits can start with */
  const heads = new Set();
  for (let i = 0; i < m; i++) {
    if (ws[i].length < 2) continue;
    if (!splits.has(ws[i])) splits.set(ws[i], i + 1);
    for (let l = 1; l < ws[i].length; l++) heads.add(ws[i].slice(0, l));
  }

  /** @type {Map<any, AlignEntry>} */
  const memo = new Map();
  /** @param {any} tok @returns {AlignEntry} */
  function make(tok) {
    const d = toWord(tok);
    if (typeof d !== 'string' || !d) return NO_ENTRY;
    const dl = lemma(d);
    const dk = keyOf(d);
    const dStop = isStop(d) ? 1 : 0;
    const dNeg = NEGATIONS.has(d);
    const reg = REGISTER.get(d);
    /** @type {number[]} */
    const c = [];
    for (let i = 0; i < m; i++) {
      const q = ws[i];
      let cr = 0;
      if (d === q) cr = 1;
      else if (reg && reg.has(q)) cr = K.REGISTER;
      else if ((dk === key[i] && kin(q, d)) || fam[i].has(d)) cr = K.FORM;
      else if (!stop[i] && !dStop) {
        const lp = lex[i];
        const x = lp && !dNeg ? lp.get(dl) || 0 : 0;
        if (syn[i].has(d) || synLem[i].has(dk)) cr = K.SYNONYM > x ? K.SYNONYM : x;
        else if (x >= K.EDIT) cr = x;
        else if (oneEdit(q, d)) cr = K.EDIT;
        else cr = x;
      }
      if (cr) c.push(i + 1, cr);
    }
    const join = joins.get(d) || 0;
    const pre = heads.has(d) ? 1 : 0;
    return c.length || join || pre ? { c, join, stop: dStop, pre } : dStop ? NO_ENTRY_STOP : NO_ENTRY;
  }
  return {
    m,
    words: ws,
    stop,
    anchor,
    lexAnchor,
    k: K,
    entry(tok) {
      let e = memo.get(tok);
      if (e === undefined) {
        if (memo.size > 100000) memo.clear();
        e = make(tok);
        memo.set(tok, e);
      }
      return e;
    },
    splitAt(a, b) {
      const x = toWord(a);
      const y = toWord(b);
      return x && y ? splits.get(x + y) || 0 : 0;
    },
  };
}

/**
 * Each typed word's weight, the engine's BM25 idf: log(1 + (n - df + 0.5) / (df + 0.5)), held to `cap`
 * when given (a word of the reader's own that the corpus barely uses would otherwise outweigh the quote).
 * @param {string[]} words @param {(w: string) => number} docFreq @param {number} n  texts in the index
 * @param {number} [cap]
 * @returns {Float64Array}
 */
export function alignWeights(words, docFreq, n, cap) {
  const out = new Float64Array(words.length);
  for (let i = 0; i < words.length; i++) {
    const d = Math.max(0, docFreq(words[i]) || 0);
    const x = Math.log(1 + (n - d + 0.5) / (d + 0.5));
    out[i] = cap && x > cap ? cap : x;
  }
  return out;
}

/** @type {WeakMap<AlignClasses, Map<any, number[]>>} */
const LOOKS = new WeakMap();
/** Text token -> the typed words (1-based) it can anchor: every content word's family, built once per query;
    a lexicon partner's token as -k (it anchors typed word k only in a text holding none of k's own tokens). */
function lookOf(/** @type {AlignClasses} */ cls) {
  let look = LOOKS.get(cls);
  if (look) return look;
  look = new Map();
  let content = 0;
  for (let i = 0; i < cls.m; i++) if (!cls.stop[i]) content++;
  for (let k = 1; k <= cls.m; k++) {
    if (content && cls.stop[k - 1]) continue;
    for (const t of cls.anchor[k - 1]) {
      const l = look.get(t);
      if (l) { if (l.indexOf(k) < 0) l.push(k); } else look.set(t, [k]);
    }
    const lx = cls.lexAnchor ? cls.lexAnchor[k - 1] : null;
    if (lx) {
      for (const t of lx) {
        const l = look.get(t);
        if (l) { if (l.indexOf(-k) < 0) l.push(-k); } else look.set(t, [-k]);
      }
    }
  }
  LOOKS.set(cls, look);
  return look;
}

/**
 * The typed words a text holds none of its own tokens of, held where it says their lexicon partners: their
 * positions join `at`, and their hits join `ev` in text order.
 * @param {Array<number[] | undefined>} at @param {number[]} ev @param {Array<number[] | undefined>} atL
 * @param {number[]} evL @param {number} m
 * @returns {number[]}  the hits, those partners' among them
 */
function lexHeld(at, ev, atL, evL, m) {
  let fill = null;
  for (let k = 1; k <= m; k++) if (!at[k] && atL[k]) { at[k] = atL[k]; (fill || (fill = new Uint8Array(m + 1)))[k] = 1; }
  if (!fill) return ev;
  /** @type {number[]} */
  const out = [];
  let a = 0;
  let b = 0;
  while (a < ev.length || b < evL.length) {
    if (b < evL.length && !fill[evL[b + 1]]) { b += 2; continue; }
    if (b >= evL.length || (a < ev.length && ev[a] <= evL[b])) { out.push(ev[a], ev[a + 1]); a += 2; } else { out.push(evL[b], evL[b + 1]); b += 2; }
  }
  return out;
}

/**
 * Windows [lo, hi) of the text around its anchors: the two rarest typed words the text holds (or a
 * word of their family), and the rarest of the query's other half when both sit in one half, so two
 * clauses run together each open a window. A typed word the text holds none of its own tokens of is held
 * where the text says a lexicon partner of it (search200 B7), after every word the text holds itself, so a
 * text holding every typed word opens the windows it opened with no lexicon. A window reaches far enough either side to hold the whole
 * query; an anchor the text repeats keeps its K.WINDOWS windows that hold the most typed weight (each
 * typed word's family counted once); windows that touch merge. One read of the text.
 * @param {ArrayLike<any>} docIds @param {number[]} order  typed positions (1-based), rarest first
 * @param {number} m @param {AlignClasses} cls @param {Float64Array} w  the weights, 1-based
 * @returns {number[]}  flat [lo, hi, lo, hi, ...] in text order
 */
function windows(docIds, order, m, cls, w) {
  const look = lookOf(cls);
  const n = docIds.length;
  /** @type {Array<number[] | undefined>} where each typed word's family sits in the text */
  const at = [];
  /** @type {number[]} every hit in text order: its position, then the typed word */
  let ev = [];
  /** @type {Array<number[] | undefined>} where each typed word's lexicon partners sit */
  let atL = null;
  /** @type {number[]} the partners' hits in text order */
  let evL = null;
  for (let p = 0; p < n; p++) {
    const ks = look.get(docIds[p]);
    if (!ks) continue;
    for (let h = 0; h < ks.length; h++) {
      const k = ks[h];
      if (k > 0) { (at[k] || (at[k] = [])).push(p); ev.push(p, k); continue; }
      if (!atL) { atL = []; evL = []; }
      (atL[-k] || (atL[-k] = [])).push(p);
      /** @type {number[]} */ (evL).push(p, -k);
    }
  }
  if (atL) ev = lexHeld(at, ev, atL, /** @type {number[]} */ (evL), m);
  // the typed words the text holds, rarest first; those held only by a partner after every word it holds itself
  const own = (/** @type {number} */ k) => !atL || at[k] !== atL[k];
  const held = order.filter((k) => at[k] && own(k));
  if (atL) for (const k of order) if (at[k] && !own(k)) held.push(k);
  if (!held.length) return [];
  const anchors = held.slice(0, 2);
  const half = (/** @type {number} */ i) => (i - 1) * 2 < m;
  if (anchors.length === 2 && half(anchors[0]) === half(anchors[1])) {
    const other = held.find((i) => half(i) !== half(anchors[0]));
    if (other) anchors.push(other);
  }
  const pad = cls.k.PAD + (m >> 2);
  const keep = Math.max(1, cls.k.WINDOWS | 0);
  const seen = new Int32Array(m + 1);
  let stamp = 0;
  /** @type {Array<[number, number]>} */
  const iv = [];
  for (const k of anchors) {
    const ps = /** @type {number[]} */ (at[k]);
    /** @type {Array<[number, number, number]>} lo, hi, the typed weight inside */
    const mine = [];
    let e = 0;
    for (const p of ps) {
      const lo = Math.max(0, p - (k - 1) - pad);
      const hi = Math.min(n, p + (m - k) + pad + 1);
      let d = 0;
      if (ps.length > keep) {
        while (e < ev.length && ev[e] < lo) e += 2;
        stamp++;
        for (let x = e; x < ev.length && ev[x] < hi; x += 2) { const r = ev[x + 1]; if (seen[r] !== stamp) { seen[r] = stamp; d += w[r]; } }
      }
      mine.push([lo, hi, d]);
    }
    if (mine.length > keep) mine.sort((a, b) => b[2] - a[2] || a[0] - b[0]).length = keep;
    for (const v of mine) iv.push([v[0], v[1]]);
  }
  iv.sort((x, y) => x[0] - y[0]);
  const out = [iv[0][0], iv[0][1]];
  for (let i = 1; i < iv.length; i++) {
    const last = out.length - 1;
    if (iv[i][0] <= out[last]) { if (iv[i][1] > out[last]) out[last] = iv[i][1]; } else out.push(iv[i][0], iv[i][1]);
  }
  return out;
}

const NEG = -1e15;
const FAR = 0x7fffffff;
/** @type {{ cov: number, start: number, end: number, first: number }} */
const NONE = Object.freeze({ cov: 0, start: -1, end: -1, first: -1 });

/* Scratch shared by every call: alignScore is synchronous and never re-entered. State 0's columns are
   kept whole (the jump in state 1 reads them); everything else rolls over three columns. */
let H0 = new Float64Array(4096);
let S0 = new Int32Array(4096);
/** @type {AlignEntry[]} */
const COL_E = [];
/** @type {number[]} */
const COL_SP = [];

/**
 * How much of a typed query one text holds, its slips allowed for (PLAN B4).
 * @param {ArrayLike<any>} docIds  the text's tokens (strings, or a token store's ids)
 * @param {ArrayLike<any>} qIds  the typed words in the same token space (their length is the query's)
 * @param {ArrayLike<number>} idf  each typed word's weight (alignWeights)
 * @param {AlignClasses} classes  alignClasses(the typed words)
 * @returns {{ cov: number, start: number, end: number, first: number }}  cov 0..1; start/end the matched span's token
 *   indices in docIds (end exclusive), -1 when nothing aligns; first where the first typed words are met (the span's
 *   start, but for clauses typed in the other order: there the span opens on the clause typed last)
 */
export function alignScore(docIds, qIds, idf, classes) {
  const m = qIds ? qIds.length : 0;
  const n = docIds ? docIds.length : 0;
  if (!m || !n || !classes || classes.m !== m) return { ...NONE };
  const K = classes.k;
  const qStop = classes.stop;
  const w = new Float64Array(m + 1);
  const sp = new Float64Array(m + 1);
  let total = 0;
  for (let i = 1; i <= m; i++) {
    const x = +idf[i - 1];
    w[i] = x > 0 ? x : 0;
    sp[i] = w[i] * (qStop[i - 1] ? K.SKIP_STOP : K.SKIP);
    total += w[i];
  }
  if (!(total > 0)) return { ...NONE };

  // the typed words, rarest first: the windows open on the rarest the text holds
  const order = [];
  for (let i = 1; i <= m; i++) if (w[i] > 0) order.push(i);
  order.sort((a, b) => w[b] - w[a] || a - b);
  const win = windows(docIds, order, m, classes, w);
  if (!win.length) return { ...NONE };
  let cols = 0;
  for (let x = 0; x < win.length; x += 2) cols += win[x + 1] - win[x];
  const M1 = m + 1;
  if (H0.length < cols * M1) { H0 = new Float64Array(cols * M1 * 2); S0 = new Int32Array(cols * M1 * 2); }
  const SW = K.SWAP * 0.5;
  const INS = K.INSERT;
  const SLOT = K.SLOT;
  const JOIN = K.JOIN;
  const JUMP = K.JUMP;

  // ── pass 1, state 0: the query in one piece. Columns j-2 and j-1 roll; every column is kept in H0/S0. ──
  let Ca = new Float64Array(M1); let Cb = new Float64Array(M1);
  let Fa = new Uint8Array(M1); let Fb = new Uint8Array(M1); let Fc = new Uint8Array(M1); // the cell ended on a met word
  /** @type {Array<[Float64Array, Int32Array, Int32Array]>} state 0's best at each typed position in each window: a jump stays in one passage */
  const WG = [];
  /** @type {Float64Array[]} per window, the most credit each typed word meets in it */
  const WR = [];
  let best = NEG;
  let bestS = -1;
  let bestE = -1;
  let bestF = -1; // a jump back's first piece: where the first typed words are
  let col = 0;
  for (let x = 0; x < win.length; x += 2) {
    const lo = win[x];
    const hi = win[x + 1];
    Cb.fill(0); Fa.fill(0); Fb.fill(0);
    const wg = new Float64Array(M1).fill(NEG);
    const wgs = new Int32Array(M1).fill(-1);
    const wge = new Int32Array(M1).fill(-1);
    WG.push([wg, wgs, wge]);
    const R = new Float64Array(M1);
    WR.push(R);
    let prevTok = null;
    let prevPre = 0;
    for (let j = lo; j < hi; j++, col++) {
      const tok = docIds[j];
      const e = classes.entry(tok);
      const spl = j > lo && prevPre ? classes.splitAt(prevTok, tok) : 0;
      COL_E[col] = e;
      COL_SP[col] = spl;
      const Cc = Ca; Cc.fill(0);
      for (let k = 0; k < e.c.length; k += 2) { const p = e.c[k]; const v = e.c[k + 1]; Cc[p] = v; if (v > R[p]) R[p] = v; }
      const jn = e.join;
      const dStop = e.stop;
      if (jn) { if (JOIN > R[jn]) R[jn] = JOIN; if (JOIN > R[jn - 1]) R[jn - 1] = JOIN; }
      if (spl && JOIN > R[spl]) R[spl] = JOIN;
      const c0 = col * M1; // this column
      const b0 = j > lo ? c0 - M1 : -1; // the column before, in this window
      const a0 = j > lo + 1 ? c0 - 2 * M1 : -1;
      H0[c0] = 0; S0[c0] = -1; Fc[0] = 0;
      for (let i = 1; i <= m; i++) {
        const hb1 = b0 >= 0 ? H0[b0 + i - 1] : i === 1 ? 0 : NEG; // (i-1, j-1); before a window only position 0 is open
        let h = H0[c0 + i - 1] - sp[i]; // the typed word skipped
        let s = S0[c0 + i - 1];
        let f = 0;
        if (b0 >= 0) { const t = H0[b0 + i] - INS; if (t > h) { h = t; s = S0[b0 + i]; } } // a text word left out
        const c = Cc[i];
        if (c > 0) {
          const t = hb1 + c * w[i];
          if (t > h) { h = t; s = b0 >= 0 && S0[b0 + i - 1] >= 0 ? S0[b0 + i - 1] : j; f = 1; }
        } else if (SLOT > 0 && b0 >= 0 && Fb[i - 1] && !qStop[i - 1] && !dStop) {
          const t = hb1 + SLOT * w[i];
          if (t > h) { h = t; s = S0[b0 + i - 1]; }
        }
        if (i >= 2 && b0 >= 0) {
          const c1 = Cc[i - 1];
          const c2 = Cb[i];
          if (c1 > 0 && c2 > 0) { // typed i-1, i met as text j, j-1
            const ha = a0 >= 0 ? H0[a0 + i - 2] : i === 2 ? 0 : NEG;
            const t = ha + c1 * w[i - 1] + c2 * w[i] - SW * (w[i - 1] + w[i]);
            if (t > h) { h = t; s = a0 >= 0 && S0[a0 + i - 2] >= 0 ? S0[a0 + i - 2] : j - 1; f = 1; }
          }
        }
        if (jn === i) { // typed i-1, i run together in text j
          const hb2 = b0 >= 0 ? H0[b0 + i - 2] : i === 2 ? 0 : NEG;
          const t = hb2 + JOIN * (w[i - 1] + w[i]);
          if (t > h) { h = t; s = b0 >= 0 && S0[b0 + i - 2] >= 0 ? S0[b0 + i - 2] : j; f = 1; }
        }
        if (spl === i) { // typed i split in text j-1, j
          const ha = a0 >= 0 ? H0[a0 + i - 1] : i === 1 ? 0 : NEG;
          const t = ha + JOIN * w[i];
          if (t > h) { h = t; s = a0 >= 0 && S0[a0 + i - 1] >= 0 ? S0[a0 + i - 1] : j - 1; f = 1; }
        }
        H0[c0 + i] = h; S0[c0 + i] = s; Fc[i] = f;
        if (h > wg[i]) { wg[i] = h; wgs[i] = s; wge[i] = j; }
      }
      if (H0[c0 + m] > best && S0[c0 + m] >= 0) { best = H0[c0 + m]; bestS = S0[c0 + m]; bestE = j + 1; }
      let r = Ca; Ca = Cb; Cb = r; // Cb now holds this column's credits
      const rf = Fa; Fa = Fb; Fb = Fc; Fc = rf;
      prevTok = tok;
      prevPre = e.pre;
    }
  }

  // ── pass 2, state 1: the query in two pieces, one jump between them. A jump forward leaves from state 0's
  //    best at that typed position in any earlier column of its window; a jump back (clauses typed in the other
  //    order) from its best in the window, so long as the second piece ends before the first piece starts. Two
  //    clauses run together sit in one passage: a jump between windows read the quote's last words wherever the
  //    text said them again, far off, and opened there. ──
  // the most a jump can reach in each window (both pieces sit in it): the first piece's best there plus the most
  // each later typed word can earn there; a window that cannot beat the best so far is not read again
  const WB = new Float64Array(win.length >> 1);
  let bound = NEG;
  for (let x = 0; x < WB.length; x++) {
    const wg = WG[x][0];
    const R = WR[x];
    let bx = NEG;
    let tail = 0;
    for (let i = m; i >= 1; i--) {
      if (wg[i] + tail - JUMP > bx) bx = wg[i] + tail - JUMP;
      let u = R[i] > 0 ? R[i] * w[i] : -sp[i]; // met in the window, else skipped or (after a met word) a slot
      if (SLOT > 0 && i > 1 && R[i - 1] > 0 && !qStop[i - 1] && SLOT * w[i] > u) u = SLOT * w[i];
      tail += u;
    }
    WB[x] = bx;
    if (bx > bound) bound = bx;
  }
  if (bound > best && bound >= K.JUMP_FLOOR * total) {
    const M0 = new Float64Array(M1).fill(NEG);
    const MS0 = new Int32Array(M1).fill(-1);
    let A = new Float64Array(M1); let B = new Float64Array(M1); let C = new Float64Array(M1);
    let SA = new Int32Array(M1); let SB = new Int32Array(M1); let SC = new Int32Array(M1); // start
    let EA = new Int32Array(M1); let EB = new Int32Array(M1); let EC = new Int32Array(M1); // end, a jump back's first piece
    let LA = new Int32Array(M1); let LB = new Int32Array(M1); let LC = new Int32Array(M1); // the second piece ends by here
    let FA = new Uint8Array(M1); let FB = new Uint8Array(M1); let FC = new Uint8Array(M1);
    const Jv = new Float64Array(M1); const Js = new Int32Array(M1); const Je = new Int32Array(M1); const Jl = new Int32Array(M1);
    let CB = new Float64Array(M1); let CC = new Float64Array(M1);
    col = 0;
    const best1 = best;
    for (let x = 0; x < win.length; x += 2) {
      const lo = win[x];
      const hi = win[x + 1];
      if (!(WB[x >> 1] > best1)) { col += hi - lo; continue; }
      A.fill(NEG); B.fill(NEG); CB.fill(0); FA.fill(0); FB.fill(0);
      M0.fill(NEG); MS0.fill(-1);
      const [wg, wgs, wge] = WG[x >> 1];
      for (let j = lo; j < hi; j++, col++) {
        const e = COL_E[col];
        const spl = COL_SP[col];
        CC.fill(0);
        for (let k = 0; k < e.c.length; k += 2) CC[e.c[k]] = e.c[k + 1];
        const jn = e.join;
        const dStop = e.stop;
        // the jump into this column, after i typed words
        for (let i = 0; i <= m; i++) {
          Jv[i] = M0[i] - JUMP; Js[i] = MS0[i]; Je[i] = -1; Jl[i] = FAR;
          if (j < wgs[i] && wg[i] - JUMP > Jv[i]) { Jv[i] = wg[i] - JUMP; Js[i] = -1; Je[i] = wge[i] + 1; Jl[i] = wgs[i]; }
        }
        const first = j === lo;
        C[0] = NEG; SC[0] = -1; EC[0] = -1; LC[0] = FAR; FC[0] = 0;
        for (let i = 1; i <= m; i++) {
          let h = C[i - 1] - sp[i]; let s = SC[i - 1]; let en = EC[i - 1]; let li = LC[i - 1]; let f = 0;
          let t = B[i] - INS;
          if (!first && t > h) { h = t; s = SB[i]; en = EB[i]; li = LB[i]; }
          t = Jv[i] - INS;
          if (t > h) { h = t; s = Js[i]; en = Je[i]; li = Jl[i]; }
          const c = CC[i];
          if (c > 0) {
            if (!first) { t = B[i - 1] + c * w[i]; if (t > h) { h = t; s = SB[i - 1] >= 0 ? SB[i - 1] : j; en = EB[i - 1]; li = LB[i - 1]; f = 1; } }
            t = Jv[i - 1] + c * w[i];
            if (t > h) { h = t; s = Js[i - 1] >= 0 ? Js[i - 1] : j; en = Je[i - 1]; li = Jl[i - 1]; f = 1; }
          } else if (SLOT > 0 && !first && FB[i - 1] && !qStop[i - 1] && !dStop) {
            t = B[i - 1] + SLOT * w[i];
            if (t > h) { h = t; s = SB[i - 1]; en = EB[i - 1]; li = LB[i - 1]; }
          }
          if (i >= 2 && !first && j > lo + 1) {
            const c1 = CC[i - 1];
            const c2 = CB[i];
            if (c1 > 0 && c2 > 0) {
              t = A[i - 2] + c1 * w[i - 1] + c2 * w[i] - SW * (w[i - 1] + w[i]);
              if (t > h) { h = t; s = SA[i - 2] >= 0 ? SA[i - 2] : j - 1; en = EA[i - 2]; li = LA[i - 2]; f = 1; }
            }
          }
          if (jn === i && !first) {
            t = B[i - 2] + JOIN * (w[i - 1] + w[i]);
            if (t > h) { h = t; s = SB[i - 2] >= 0 ? SB[i - 2] : j; en = EB[i - 2]; li = LB[i - 2]; f = 1; }
          }
          if (spl === i && j > lo + 1) {
            t = A[i - 1] + JOIN * w[i];
            if (t > h) { h = t; s = SA[i - 1] >= 0 ? SA[i - 1] : j - 1; en = EA[i - 1]; li = LA[i - 1]; f = 1; }
          }
          C[i] = h; SC[i] = s; EC[i] = en; LC[i] = li; FC[i] = f;
        }
        if (C[m] > best && SC[m] >= 0 && j + 1 <= LC[m]) { best = C[m]; bestS = SC[m]; bestE = EC[m] >= 0 ? EC[m] : j + 1; bestF = LC[m] < FAR ? LC[m] : -1; }
        const c0 = col * M1;
        for (let i = 1; i <= m; i++) if (H0[c0 + i] > M0[i]) { M0[i] = H0[c0 + i]; MS0[i] = S0[c0 + i]; }
        let r = A; A = B; B = C; C = r;
        let ri = SA; SA = SB; SB = SC; SC = ri;
        ri = EA; EA = EB; EB = EC; EC = ri;
        ri = LA; LA = LB; LB = LC; LC = ri;
        const rf = FA; FA = FB; FB = FC; FC = rf;
        r = CB; CB = CC; CC = r;
      }
    }
  }
  COL_E.length = 0;
  if (!(best > 0) || bestS < 0) return { ...NONE };
  return { cov: Math.min(1, best / total), start: bestS, end: bestE, first: bestF >= 0 ? bestF : bestS };
}

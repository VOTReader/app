/* ═══════════════════════════════════════════════════════════════════════
   search/ref-edge.js — a reference typed with words (search200 fix1)
   ═══════════════════════════════════════════════════════════════════════
   parseReference reads a reference only when it is the whole query. Typed with
   the words it holds ("john 3 16 for god so loved the world", "the wages of sin
   is death romans 6 23") it was words: its numbers were typed tokens no verse
   holds, its book's name a word the verse never says, and a study printing the
   verse beside its reference outranked the verse (the refwords hunt, 57 of its
   80 cases). edgeReading reads the reference at the query's start or end, the
   longest first: its card leads, and the rest of the query (`text`) is what is
   searched under the card.

   A reading is checked against the index in use (engine.js refFacts): the verse
   it names is a verse there, and no word of the rest is one only the other texts
   use ("psalm 23 with yahushua as my shepherd" asks for a text putting the name
   there, so it stays words). A rest of the words that frame a reference ("bible
   verse", "in the kjv") makes the card alone. A named passage's name inside a
   longer query makes its card when the rest says the same passage (passageInside).
   ═══════════════════════════════════════════════════════════════════════ */

import { parseReference, passageKey, resolveBookToken } from './ref-parser.js';
import { searchData } from './search-data.js';
import { kjvEncode } from './tokenize.js';

/**
 * What a reading is checked against: the index in use (engine.js refFacts). verseWords is a verse's words
 * (kjvEncode), null when the index has no such verse; bibleHoldsRun says a verse of the Bible holds the words
 * (kjvEncode) in a row; namesTitle says the whole query is a text's whole title.
 * @typedef {{ hasVerse: (book: string, chapter: number, verse: number) => boolean, bibleHolds: (word: string) => boolean, textsHold: (word: string) => boolean, verseWords: (book: string, chapter: number, verse: number) => string[]|null, bibleHoldsRun: (run: string[]) => boolean, namesTitle: (query: string) => boolean }} RefFacts
 */

/** The longest reference read at an edge, in typed tokens. */
const EDGE_TOKENS = 10;
/** The edition tags typed beside a reference, and the words naming the Bible or a verse: they frame a reference. */
const EDITION_TAGS = new Set(['kjv', 'nkjv', 'niv', 'esv']);
const FRAME_WORDS = new Set(['bible', 'bibles', 'verse', 'verses']);
/* Book abbreviations that are English words, or a word's start typed alone ("is" Isaiah, "am" Amos, "act" Acts):
   a verse makes them a reference ("is 53 5"), a chapter alone does not ("is 1 thing"). */
const WORDISH = new Set(['is', 'am', 'ex', 'de', 'le', 'ne', 'es', 'la', 'da', 'ho', 'na', 'mi', 'mr', 'so', 'ob', 'act', 'pro', 'mat', 'est', 'num', 'gen', 'lam', 'dan', 'jon', 'tit']);

/** The index keys Matthew's plain chapters as 'matthew' (engine.js VERSE_IDS). */
const bookKey = (/** @type {string} */ id) => (id === 'matthew-plain' ? 'matthew' : id);

/**
 * Does the index hold the reading's chapter (its first verse), its verse and its end?
 * @param {any} r @param {RefFacts} facts
 */
function exists(r, facts) {
  const b = bookKey(r.bookId);
  const has = (/** @type {number} */ c, /** @type {number} */ v) => facts.hasVerse(b, c, v);
  return has(r.chapter, 1) && (!r.chapterEnd || has(r.chapterEnd, 1))
    && (r.verseStart == null || has(r.chapter, r.verseStart))
    && (r.verseEnd == null || has(r.chapterEnd || r.chapter, r.verseEnd));
}

/* ── A WHOLE REFERENCE IN A SHAPE parseReference DOES NOT READ (the refwords hunt's M5) ──
   A version spelled out ("john 3:16 king james"), the book in a frame ("the book of ruth chapter 1", "paul's first
   letter to the corinthians"), "chapter 3 of john verse 16", the numbers in words ("psalm twenty three"), a verse
   list or a range in words ("john 3 16 17", "romans 8 28 to 30", "genesis 1 through 3"): each was searched as
   words, and the numbers' words found Ezra's census ("twenty", "three"). refInWords writes such a query in the
   shape parseReference reads. */
const ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const own = (/** @type {object} */ o, /** @type {string} */ k) => Object.prototype.hasOwnProperty.call(o, k);
const isNumWord = (/** @type {string} */ t) => own(ONES, t) || own(TEENS, t) || own(TENS, t) || t === 'hundred';
/* ...but only a whole query says its numbers in words (the settle, the red team's rt1-rules). Beside other words a
   number word is prose's: "job seven sons and three daughters", "daniel three times a day", "judas one of the
   twelve", "for the father judges no one" made a chapter of a book's name at the query's edge ("job 7", "jude 1"),
   and its card led the verse the words are. */
const saysNumberWords = (/** @type {string} */ refPart) => refPart.toLowerCase().split(/[\s-]+/).some(isNumWord);

/**
 * Number words as digits, each number its own token: "twenty three" 23, "one hundred and nineteen" 119, "three
 * sixteen" 3 16.
 * @param {string[]} toks
 * @returns {string[]}
 */
export function foldNumberWords(toks) {
  /** @type {any} */ const O = ONES; /** @type {any} */ const T = TEENS; /** @type {any} */ const X = TENS;
  const out = [];
  let i = 0;
  while (i < toks.length) {
    let j = i; let v = 0; let got = false;
    const after = (/** @type {number} */ k) => (toks[k] === 'and' && (own(X, toks[k + 1]) || own(T, toks[k + 1]) || own(O, toks[k + 1])) ? k + 1 : k);
    if (own(O, toks[j]) && toks[j + 1] === 'hundred') { v = O[toks[j]] * 100; j = after(j + 2); got = true; } else if (toks[j] === 'hundred') { v = 100; j = after(j + 1); got = true; }
    if (own(X, toks[j])) { v += X[toks[j]]; j++; got = true; if (own(O, toks[j])) { v += O[toks[j]]; j++; } } else if (own(T, toks[j])) { v += T[toks[j]]; j++; got = true; } else if (own(O, toks[j])) { v += O[toks[j]]; j++; got = true; }
    if (got) { out.push(String(v)); i = j; } else { out.push(toks[i]); i++; }
  }
  return out;
}

const VERSION_TAIL = /\s+\(?(?:the\s+)?(?:new\s+king\s+james|king\s+james|authori[sz]ed|new\s+international|english\s+standard|new\s+american\s+standard|new\s+living|revised\s+standard|new\s+revised\s+standard|american\s+standard|(?:holman\s+)?christian\s+standard|world\s+english|young'?s\s+literal|amplified|the\s+message)(?:\s+(?:version|bible|translation))?\)?$/;
const FRAME_HEAD = /^(?:the\s+)?(?:(?:holy\s+)?(?:book|gospel|epistle|letter|epistles|letters)\s+(?:of|to|according\s+to)\s+(?:the\s+)?(?:(?:saint|st)\.?\s+)?|(?:(?:paul|peter|john|james|jude)'?s\s+)?(?:(first|second|third|1st|2nd|3rd)\s+)?(?:letter|epistle)\s+to\s+the\s+)/;
const ORDINAL = /** @type {Record<string, string>} */ ({ first: '1', '1st': '1', second: '2', '2nd': '2', third: '3', '3rd': '3' });

/** The book a token run starts with, and how many tokens name it; null when none does. @param {string[]} toks */
function bookAt(toks) {
  for (let n = Math.min(4, toks.length); n >= 1; n--) {
    const id = resolveBookToken(toks.slice(0, n).join(' '));
    if (id) return { id, n };
  }
  return null;
}

/**
 * A whole query (lower case) written in the shape parseReference reads; null when there is nothing to write.
 * @param {string} lower
 * @returns {string|null}
 */
export function refInWords(lower) {
  let s = ' ' + lower.replace(/[\u2018\u2019]/g, "'").replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u201C\u201D"]/g, ' ').trim();
  s = s.replace(VERSION_TAIL, '').trim();
  const fm = s.match(FRAME_HEAD);
  if (fm) {
    // "paul's first letter to the corinthians": the ordinal goes before the book
    const cand = (fm[1] ? ORDINAL[fm[1]] + ' ' : '') + s.slice(fm[0].length);
    if (bookAt(cand.split(/\s+/))) s = cand;
  } else if (/^the\s+/.test(s)) {
    // "the" before a book named in two words or more ("the song of solomon"): the book typed with its article
    const rest = s.replace(/^the\s+/, '');
    const b = bookAt(rest.split(/\s+/));
    if (b && b.n >= 2) s = rest;
  }
  // "chapter 3 of john verse 16" -> "john 3:16"
  const inv = s.match(/^(?:chapter|ch)\s+(\S+)\s+(?:of|in)\s+(?:the\s+book\s+of\s+|the\s+gospel\s+of\s+)?(.+?)(?:\s*,?\s+(?:verses?|v|vs)\s+(.+))?$/);
  if (inv) {
    const b = bookAt(inv[2].split(/\s+/));
    if (b && b.n === inv[2].split(/\s+/).length) s = inv[2] + ' ' + inv[1] + (inv[3] ? ':' + inv[3] : '');
  }
  const toks = s.split(/\s+/).filter(Boolean);
  if (own(ORDINAL, toks[0] || '')) toks[0] = ORDINAL[toks[0]];
  const b = bookAt(toks);
  if (!b) return null;
  // number words after the book, a hyphen between two of them a space ("twenty-three")
  let rest = toks.slice(b.n).flatMap((t) => (/^[a-z]+-[a-z]+$/.test(t) && t.split('-').every(isNumWord) ? t.split('-') : [t]));
  if (rest.some(isNumWord)) rest = foldNumberWords(rest);
  let r = rest.join(' ')
    .replace(/\b(?:chapter|chap|ch)\.?\s*(?=\d)/g, '')
    .replace(/(\d)\s*(?:verses|verse|vv|vs|v)\.?\s*(?=\d)/g, '$1:')
    .replace(/\s*:\s*/g, ':').trim();
  // a verse list or range in words: the range holding it, when it runs forward
  const forward = (/** @type {string} */ m, /** @type {string} */ a, /** @type {string} */ z, /** @type {string} */ out) => (+z > +a ? out : m);
  r = r.replace(/^(\d+)[: ](\d+)\s*(?:-|to|through|thru|and|&)\s*(\d+)$/, (m, c, v, v2) => forward(m, v, v2, `${c}:${v}-${v2}`));
  r = r.replace(/^(\d+) (\d+) (\d+)$/, (m, c, v, v2) => forward(m, v, v2, `${c}:${v}-${v2}`));
  r = r.replace(/^(\d+)\s*(?:to|through|thru|and|&)\s*(\d+)$/, (m, c, c2) => forward(m, c, c2, `${c}-${c2}`));
  const out = (toks.slice(0, b.n).join(' ') + ' ' + r).trim();
  return out === lower.trim() ? null : out;
}

/**
 * A string read whole as a Bible reference (as typed, else in refInWords' shape), held by the index when `facts`
 * are given; null otherwise.
 * @param {string} str @param {{corpus?: string}} opts @param {RefFacts|null} facts
 */
function bibleRef(str, opts, facts) {
  let r = parseReference(str, opts);
  if (!r || r.kind !== 'ref-bible') {
    const s = refInWords(String(str).toLowerCase());
    if (s) r = parseReference(s, opts);
  }
  return r && r.kind === 'ref-bible' && (!facts || exists(r, facts)) ? r : null;
}

/* A question round a whole reference ("what does romans 6 23 say", "the meaning of matthew 24", "what does the bible
   say about john 3 16"): its frame is no text's words. */
const Q_HEAD = /^(?:what\s+(?:does|do|is|did)\s+|what'?s\s+|whats\s+|the\s+meaning\s+of\s+|meaning\s+of\s+|explain\s+|read\s+|show\s+me\s+|open\s+|go\s+to\s+|turn\s+to\s+|look\s+up\s+|where\s+is\s+)/;
const Q_TAIL = /\s+(?:say|says|mean|means|teach|teaches|about|saying)\??$/;
const Q_BIBLE = /^(?:what\s+(?:does|do)\s+the\s+(?:bible|scriptures?)\s+say\s+(?:in|about|at|of)\s+)/;

/**
 * parseReference, and the whole references it does not read: in another shape (refInWords), a book in its frame
 * ("the book of ruth"), a reference inside a question. It needs no index, as parseReference does not.
 * @param {string} query
 * @param {{corpus?: string}} [opts]
 * @returns {any}
 */
export function readReference(query, opts) {
  const base = parseReference(query, opts);
  if (!base || base.kind !== 'text') return base;
  const lower = String(query).trim().toLowerCase();
  const r = bibleRef(lower, opts || {}, null);
  if (r) return r;
  const s = refInWords(lower);
  if (s) { const b = parseReference(s, opts); if (b && b.kind === 'ref-book') return b; }
  const m = lower.replace(Q_BIBLE, '').replace(Q_HEAD, '').replace(Q_TAIL, '').trim();
  if (m !== lower) { const q = bibleRef(m, opts || {}, null); if (q) return q; }
  return base;
}

/**
 * The words of a reference's rest a text would hold: no small word, number, edition tag or frame word.
 * @param {string} rest
 * @returns {string[]}
 */
export function restWords(rest) {
  const stop = searchData().STOP_WORDS_TRIMMED;
  return kjvEncode(rest).filter((w) => !(stop && stop.has(w)) && !/^[\d#]/.test(w) && !EDITION_TAGS.has(w) && !FRAME_WORDS.has(w));
}

/** Is a word of the rest one other texts hold and the Bible never does? @param {string} rest @param {RefFacts} facts */
function outsideWord(rest, facts) {
  return restWords(rest).some((w) => facts.textsHold(w) && !facts.bibleHolds(w));
}

/** A wordish book abbreviation with a chapter and no verse ("is 3"): no reference. @param {any} r @param {string} refPart */
function wordishChapter(r, refPart) {
  const t = refPart.toLowerCase().replace(/^(?:[123]|first|second|third|1st|2nd|3rd)\s*/, '').match(/^[a-z]+/);
  return !!t && WORDISH.has(t[0]) && r.verseStart == null;
}

/* A small word before the book ("in leviticus 23 5 6 passover begins the days of", a study's sentence): prose citing
   the reference, which parseReference reads whole as a slip of the book's name ("in leviticus"). A frame's article
   ("the book of ruth 1") and a book's own abbreviation ("is 53 5") stay. */
function proseLead(/** @type {string} */ refPart) {
  const first = refPart.toLowerCase().split(/\s+/)[0] || '';
  const stop = searchData().STOP_WORDS_TRIMMED;
  return !!stop && stop.has(first) && first !== 'the' && !resolveBookToken(first);
}

/** Letters beside the edition tags: a rest that may be words. */
const hasWords = (/** @type {string} */ s) => /[a-z]/i.test(s.replace(/\b(?:kjv|nkjv|niv|esv)\b/gi, ''));

/**
 * The card with its rest searched under it; the card alone when the rest only frames it.
 * @param {any} r @param {string} rest
 */
function withRest(r, rest) {
  return restWords(rest).length ? { ...r, alsoText: true, text: rest } : r;
}

/* ── A NAMED PASSAGE INSIDE A LONGER QUERY (the refwords hunt's P3) ──
   "the lords prayer in luke", "the shema hear o israel", "parable of the good samaritan who is my neighbor": a
   passage's name with more words was words, and texts naming it outranked it. The longest name inside the query
   makes the passage's card when the rest says the same passage: a reference overlapping it (or a parallel telling
   of it), its book, another of its names, or words one of its verses holds in a row. The whole query is searched
   under the card, or only the rest when the name is itself a reference ("isaiah 53 by his stripes we are healed").
   A verse typed inside the passage is left to the edge reading ("the lords prayer matthew 6 9"). */
/** Where else a passage's sayings are told: [one of its names, book, chapter, first verse, last verse]. */
const PARALLELS = [
  ["lord's prayer", 'luke', 11, 2, 4], ['beatitudes', 'luke', 6, 20, 23], ['sermon on the mount', 'luke', 6, 17, 49],
  ['golden rule', 'luke', 6, 31, 31], ['great commission', 'mark', 16, 15, 18], ['last supper', 'mark', 14, 12, 26],
  ['last supper', 'luke', 22, 7, 23], ['transfiguration', 'mark', 9, 2, 13], ['transfiguration', 'luke', 9, 28, 36],
  ['feeding of the 5000', 'mark', 6, 30, 44], ['feeding of the 5000', 'luke', 9, 10, 17], ['feeding of the 5000', 'john', 6, 1, 14],
  ['parable of the sower', 'mark', 4, 1, 20], ['parable of the sower', 'luke', 8, 4, 15], ['lost sheep', 'matthew', 18, 12, 14],
  ['ten commandments', 'deuteronomy', 5, 6, 21], ['baptism of jesus', 'mark', 1, 9, 11], ['baptism of jesus', 'luke', 3, 21, 22],
  ['temptation of christ', 'luke', 4, 1, 13], ['temptation of christ', 'mark', 1, 12, 13], ['triumphal entry', 'mark', 11, 1, 11],
  ['triumphal entry', 'luke', 19, 28, 40], ['triumphal entry', 'john', 12, 12, 19], ['walking on water', 'mark', 6, 45, 52],
  ['walking on water', 'john', 6, 16, 21], ['rich young ruler', 'mark', 10, 17, 31], ['rich young ruler', 'luke', 18, 18, 30],
  ['widows mite', 'luke', 21, 1, 4], ['garden of gethsemane', 'mark', 14, 32, 42], ['garden of gethsemane', 'luke', 22, 39, 46],
];
/** The small words a passage's rest is trimmed of, and that do not count among its words. */
const SMALL = new Set(['the', 'a', 'an', 'of', 'on', 'in', 'to', 'and', 'from', 'according', 'as', 'is', 'are', 'was', 'about', 'with', 'for', 'by', 'that', 'this']);
/* A SAYING IS THREE WORDS OR MORE (the settle, the red team's rt1-rules). Two words in a row ("when joshua", "i am",
   "shall be") sit in some verse of any long passage, so they told no passage apart: "when joshua was by jericho" made
   the fall of Jericho's card over Joshua 5:13, "i am the passover" Exodus 12's over the letter of that name. */
/** Words (kjvEncode) enough to be a saying a verse holds: three or more, its small words aside. @param {string[]} run */
const saying = (run) => run.filter((w) => !SMALL.has(w)).length >= 3;
/* WORDS ANOTHER VERSE HOLDS ARE THAT VERSE'S (the settle, the red team's rt1-shapes). "john 3 17 for god
   so loved the world", "psalm 23 4 the lord is my shepherd i shall not want": the reader quoted a verse and typed its
   neighbour's number, and the card of the verse typed led the verse quoted. A saying a verse of the Bible holds in a
   row, and none of the reading's verses does, makes no card: the whole query is searched as words. */
/**
 * Words a verse of the Bible holds in a row, and no verse of the reading does: that verse's words, not the reading's.
 * @param {any} r @param {string[]} run @param {RefFacts} facts
 */
const heldElsewhere = (r, run, facts) => saying(run) && !holdsRun(r, run, facts) && facts.bibleHoldsRun(run);
/** A verse typed inside the passage: the edge reading reads it, its rest no outside word's to refuse. */
const DEFER = { defer: true };
/** @type {WeakMap<object, Map<string, any>>} each passage list's names, in passageKey's shape */
const PASSAGES_BY_KEY = new WeakMap();
/** @param {any[]} list */
function passagesByKey(list) {
  let byKey = PASSAGES_BY_KEY.get(list);
  if (!byKey) {
    byKey = new Map();
    let most = 0;
    for (const np of list) for (const k of np.keys || []) {
      const pk = passageKey(k);
      if (pk && !byKey.has(pk)) byKey.set(pk, np);
      if (pk) most = Math.max(most, pk.split(' ').length);
    }
    PASSAGES_BY_KEY.set(list, byKey);
    KEY_WORDS_MOST.set(byKey, most);
  }
  return byKey;
}
/* A SPAN LONGER THAN ANY NAME IS NOT TRIED (search200 audit n218, s08.5). passageInside tried every span of a long
   query, each one folded through passageKey: ~1.4 ms on a desktop for a 42-word quote. A span holding more of the
   words passageKey keeps than the longest name has cannot be a name, so it is skipped before it is folded. */
/** @type {WeakMap<Map<string, any>, number>} the most words a name of the list has, in passageKey's shape */
const KEY_WORDS_MOST = new WeakMap();
/** The passage and its parallel tellings. @param {any} np @returns {any[]} */
function tellingsOf(np) {
  const keys = new Set((np.keys || []).map(passageKey));
  return [np, ...PARALLELS.filter((p) => keys.has(passageKey(String(p[0])))).map((p) => ({ bookId: p[1], chapter: p[2], verseStart: p[3], verseEnd: p[4] }))];
}
/** A reading's verses: its book, first chapter and verse, last chapter and verse. @param {any} x */
const span = (x) => ({ book: bookKey(x.bookId), c1: x.chapter, v1: x.verseStart || 1, c2: x.chapterEnd || x.chapter, v2: x.verseEnd || (x.verseStart && !x.chapterEnd ? x.verseStart : 999) });
const upTo = (/** @type {number} */ c, /** @type {number} */ v, /** @type {number} */ c2, /** @type {number} */ v2) => c < c2 || (c === c2 && v <= v2);
const overlaps = (/** @type {any} */ a, /** @type {any} */ b) => { const A = span(a); const B = span(b); return A.book === B.book && upTo(A.c1, A.v1, B.c2, B.v2) && upTo(B.c1, B.v1, A.c2, A.v2); };
const inside = (/** @type {any} */ a, /** @type {any} */ b) => { const A = span(a); const B = span(b); return A.book === B.book && upTo(B.c1, B.v1, A.c1, A.v1) && upTo(A.c2, A.v2, B.c2, B.v2); };
/** Does a verse of the reading hold the words `run`, every one, in a row? @param {any} x @param {string[]} run @param {RefFacts} facts */
function holdsRun(x, run, facts) {
  const A = span(x);
  for (let c = A.c1; c <= A.c2; c++) {
    for (let v = c === A.c1 ? A.v1 : 1; c < A.c2 || v <= A.v2; v++) {
      const t = facts.verseWords(A.book, c, v);
      if (!t) break;
      for (let i = 0; i + run.length <= t.length; i++) if (run.every((w, k) => t[i + k] === w)) return true;
    }
  }
  return false;
}

/**
 * A named passage inside the query, its card when the rest says the same passage; DEFER for a verse inside it;
 * null otherwise.
 * @param {string} query @param {{corpus?: string}} opts @param {RefFacts} facts
 * @returns {any}
 */
function passageInside(query, opts, facts) {
  const corpus = (opts && opts.corpus) || 'all';
  const list = searchData().NAMED_PASSAGES;
  if ((corpus !== 'all' && corpus !== 'scriptures') || !list || !list.length) return null;
  const byKey = passagesByKey(list);
  const raw = String(query).trim().split(/\s+/);
  /** @type {{w: string, i: number}[]} each word and the typed token it is in */ const words = [];
  raw.forEach((t, i) => { for (const w of t.toLowerCase().replace(/['‘’]/g, '').split(/[^a-z0-9]+/)) if (w) words.push({ w, i }); });
  if (words.length < 2) return null;
  const most = KEY_WORDS_MOST.get(byKey) || 0;
  /** @type {number[]} kept[i]: how many of the first i words passageKey keeps */ const kept = [0];
  for (const x of words) kept.push(kept[kept.length - 1] + (passageKey(x.w) ? 1 : 0));
  /** @type {{a: number, b: number, np: any}|null} */ let best = null;
  for (let a = 0; a < words.length; a++) {
    for (let b = words.length; b > a && (!best || b - a > best.b - best.a); b--) {
      if (b - a === words.length) continue;   // the whole query: parseReference's own reading
      if (kept[b] - kept[a] > most) continue;   // more words than any name has
      const np = byKey.get(passageKey(words.slice(a, b).map((x) => x.w).join(' ')));
      if (np) best = { a, b, np };
    }
  }
  if (!best) return null;
  const { np } = best;
  const ia = words[best.a].i; const ib = words[best.b - 1].i;
  const restToks = raw.filter((_, i) => i < ia || i > ib);
  while (restToks.length && SMALL.has(restToks[0].toLowerCase())) restToks.shift();
  while (restToks.length && SMALL.has(restToks[restToks.length - 1].toLowerCase())) restToks.pop();
  const rest = restToks.join(' ');
  const card = (/** @type {any} */ x, /** @type {string} */ text) => ({
    kind: 'named-passage', bookId: x.bookId, bookTitle: (searchData().BOOK_DISPLAY || {})[x.bookId] || x.bookId,
    chapter: x.chapter, chapterEnd: x.chapterEnd || null, verseStart: x.verseStart || null, verseEnd: x.verseEnd || null,
    label: query, alsoText: true, text,
  });
  if (!rest) return card(np, query);
  const tellings = tellingsOf(np);
  const ref = bibleRef(rest, opts, facts);
  if (ref) {
    const x = tellings.find((t) => overlaps(ref, t));
    if (!x) return null;   // another passage typed: the edge reading reads it as typed
    return inside(ref, x) && ref.verseStart != null ? DEFER : card(x, query);
  }
  const book = parseReference(rest, opts);
  if (book && book.kind === 'ref-book') {
    const x = tellings.find((t) => bookKey(t.bookId) === bookKey(book.bookId));
    return x ? card(x, query) : null;
  }
  if (byKey.get(passageKey(rest)) === np) return card(np, query);
  const run = kjvEncode(rest);
  if (!saying(run)) return null;
  const x = tellings.find((t) => holdsRun(t, run, facts));
  if (!x) return null;
  // the whole query a verse outside the passage holds in a row is that verse's words ("fed you in the wilderness
  // with manna", Deuteronomy 8:16, not the manna of Exodus 16)
  const all = kjvEncode(query);
  if (!tellings.some((t) => holdsRun(t, all, facts)) && facts.bibleHoldsRun(all)) return null;
  const nameIsRef = /\d/.test(words.slice(best.a, best.b).map((w) => w.w).join(' '));
  return card(x, nameIsRef ? rest : query);
}

/**
 * A named passage inside a longer query, or a Bible reference at its start or end (the longest first, the start
 * before the end); null when there is none.
 * @param {string} query  a query parseReference read as words
 * @param {{corpus?: string}} opts  the parse's own (a tab reading no Bible reference reads none here)
 * @param {RefFacts} facts
 * @returns {any}
 */
export function edgeReading(query, opts, facts) {
  const r = readEdges(query, opts, facts);
  /* A text's whole title typed is that text (the settle, the red team's rt1-shapes): "regarding noah ham and canaan
     genesis 9 20-27" is an Answers topic's title, and the card of the passage it names led the topic. */
  return r && facts.namesTitle(query) ? null : r;
}

/** edgeReading's readings, the title aside. @param {string} query @param {{corpus?: string}} opts @param {RefFacts} facts @returns {any} */
function readEdges(query, opts, facts) {
  const passage = passageInside(query, opts, facts);
  if (passage && passage !== DEFER) return passage;
  const inPassage = passage === DEFER;
  const raw = String(query).trim().split(/\s+/);
  const n = raw.length;
  // at the start, a citation's brackets off ("(John 3:16) For God so loved")
  for (let k = Math.min(n - 1, EDGE_TOKENS); k >= 2; k--) {
    const refPart = raw.slice(0, k).join(' ').replace(/^[([]+|[)\].,;:!?]+$/g, '');
    const rest = raw.slice(k).join(' ').replace(/^[\s\-\u2010-\u2015:,.;]+/, '');
    if (!hasWords(rest) || proseLead(refPart) || saysNumberWords(refPart)) continue;
    const r = bibleRef(refPart, opts, facts);
    if (!r || wordishChapter(r, refPart)) continue;
    if ((!inPassage && outsideWord(rest, facts)) || heldElsewhere(r, kjvEncode(rest), facts)) break;
    return withRest(r, rest);
  }
  // at the end ("the wages of sin is death romans 6:23", "... John 3:16 (KJV)")
  for (let k = Math.min(n - 1, EDGE_TOKENS); k >= 2; k--) {
    const refPart = raw.slice(n - k).join(' ').replace(/^[([]+|[)\].,;!?]+$/g, '');
    const rest = raw.slice(0, n - k).join(' ').replace(/[\s\-\u2010-\u2015:,;]+$/, '');
    if (!hasWords(rest) || proseLead(refPart) || saysNumberWords(refPart)) continue;
    const r = bibleRef(refPart, opts, facts);
    if (!r || wordishChapter(r, refPart)) continue;
    if ((!inPassage && outsideWord(rest, facts)) || heldElsewhere(r, kjvEncode(rest), facts)) break;
    return withRest(r, rest);
  }
  return null;
}

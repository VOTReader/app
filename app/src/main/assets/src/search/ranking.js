/* ═══════════════════════════════════════════════════════════════════════
   search/ranking.js — ranking signals MiniSearch BM25 can't express natively
   ═══════════════════════════════════════════════════════════════════════
   The engine runs one BM25 search per query "unit" (a literal term or a
   synonym), then accumulates per-doc scores. On top of that raw BM25 signal,
   three project-specific signals (ported from the audited FlexSearch ranking)
   re-order results:

     • KIND_BOOST       — gently order doc kinds (a verse and a letter rank
                          alike; a Bible-study chapter slightly lower). Title-
                          vs-body weighting is handled by MiniSearch's per-field
                          `boost`, so it's NOT duplicated here.
     • coverage         — how many DISTINCT original query terms a doc matched
                          (popcount of a per-doc term bitmask). A doc matching
                          more of the query's words outranks one matching fewer.
     • phrase proximity — a contiguous-token run of the FULL query (a remembered
                          verse) gets a decisive boost over docs that merely
                          scatter the same words.
     • synonym demotion — handled in the engine via the `literal` flag; a doc
                          that matched ONLY a synonym (no literal term) is halved
                          so the exact word always outranks its expansions.
   ═══════════════════════════════════════════════════════════════════════ */

import { kjvEncode } from './tokenize.js';
import { lemma } from './passage.js';

/**
 * Per-kind score multipliers. Only the kinds the narrow index emits appear here
 * (verse / letter / wtlb / blessed / holy-day / bible-study). Unknown kinds get
 * 1.0 via the lookup fallback at the call site.
 * @type {Object<string,number>}
 */
export const KIND_BOOST = {
  verse: 1.0,
  letter: 1.0,
  wtlb: 1.0,
  blessed: 1.0,
  'holy-day': 1.0,
  answers: 1.0,
  'bible-study': 0.8,
};

/** Coverage multiplier curve: cov2→3×, cov3→5×, cov4→7×, … (gentle, not a hard tier). */
export function coverageMultiplier(distinctTerms) {
  return distinctTerms > 1 ? 1 + (distinctTerms - 1) * 2 : 1;
}

/** Decisive boost when the full query appears as a contiguous token run. */
export const PHRASE_BOOST = 6;

/** Synonym-only hit demotion (matched no literal query term). */
export const SYNONYM_DEMOTION = 0.5;

/* ── Search audit 2026-09-27 (617 Bible + 3,706 Volumes queries on the real corpus) ── */

/** BM25 as published: no BM25+ floor. MiniSearch's default d = 0.5 pays every matched
 *  word a fixed amount whatever the text's length, so an Answers topic of 5,000 words
 *  holding every common word outranked the verse the reader quoted: 86 of 362 verse
 *  queries lost Best Matches to them ("I am the way, the truth, and the life":
 *  John 14:6 at #113). d = 0 lifted Best Matches from 267 to 339 of 408, lost none,
 *  and left the Scriptures ranking as it was. */
export const BM25_PARAMS = { k: 1.2, b: 0.7, d: 0 };

/** A keyword search keeps MiniSearch's BM25+ floor, in a text's title and its body.
 *  The title: a verse has no title, and MiniSearch averages a field's length over
 *  every document, so the average title is under one word and a title of five is
 *  scored as if it were thirteen times too long; without the floor a word in a title
 *  counted for almost nothing ("humility" put two short WTLB entries above "Humility
 *  and The Word of God"; "144000" put the False Doctrines index above "Regarding the
 *  144,000 Witnesses"). The body: a word or two is a topic, and a letter that says it
 *  again and again is about it; without the floor a text's length decided, and every
 *  short verse holding the word outranked the letter ("flood": Vengeance Is Mine #12
 *  in the Volumes, the passage Brianna was looking for, 2026-09-26). A longer query is
 *  a passage or a title typed out: BM25 as published (a floor paid on each of its
 *  words let any text sharing two of them outrank the verse quoted: "I am the
 *  resurrection, and the life" #6), and titleMatch answers a title typed out. The
 *  engine scores the body and the title apart (engine searchUnit). */
export const KEYWORD_BM25 = { k: 1.2, b: 0.7, d: 0.5 };
/** A keyword search, as against a passage or a title typed out: at most this many
 *  words that are not stop words, and this many in all ("false prophets", "mark of
 *  the beast"; "fear I am coming to" is a passage). */
export const KEYWORD_CONTENT_WORDS = 2;
export const KEYWORD_WORDS = 4;

/** What a synonym's or a word form's match is worth beside the typed word's. They
 *  added at full weight to any text that also held the typed word, so a one-word
 *  title lost to texts rich in its synonyms ("Sanctuary" #17, #1 with synonyms off). */
export const SYNONYM_WEIGHT = 0.5;
export const FORM_WEIGHT = 0.7;

/** The graded phrase boost starts at this much of the typed phrase held together. */
export const NEAR_PHRASE_MIN = 0.5;
/** A title typed whole; the leading words a title opens with that readers leave off. */
export const TITLE_EXACT_BOOST = 3;
const TITLE_LEAD = new Set(['regarding', 'the', 'a', 'an']);
/** The original over a reprint when both hold the typed words together: a letter, a
 *  verse, a Words To Live By or a Blessed entry over the Answers topic, Holy Days
 *  entry or Bible study that quotes it (they are compilations of the letters and
 *  verses). The Answers topic quoting a passage outranked its letter 14 times in 133
 *  quoted phrases ("to this day you persecute": Answers above Volume Two · Letter 29). */
export const ORIGINAL_BOOST = 2;
export const REPRINT_KINDS = new Set(['answers', 'holy-day', 'bible-study']);

/**
 * How much of the typed phrase a text holds TOGETHER, 0..1, the phrase ranking's
 * graded half (search audit 2026-09-27). The boost was all or nothing: every typed
 * word in a row, or nothing. A remembered phrase is often one word off ("will" for
 * "shall", a word dropped), and 111 of 185 such queries lost the letter from the top
 * 5. This scores the query's adjacent word PAIRS: the most of them found as adjacent
 * pairs within one stretch of the text a little longer than the phrase (a dropped,
 * swapped or added word or two), each pair weighted 1, or 0.35 when both words are
 * stop words ("of the" is everywhere). 1 = every pair; a phrase one word off keeps
 * most of them.
 * @param {string[]} toks  the text's tokens (kjvEncode)
 * @param {string[]} qTokens  the query's tokens (kjvEncode)
 * @param {Set<string>} stop
 * @returns {number}
 */
export function nearPhrase(toks, qTokens, stop) {
  const m = qTokens.length;
  if (!toks || m < 2) return 0;
  /** @type {Map<string, number[]>} */
  const pairAt = new Map();
  const weight = [];
  let total = 0;
  for (let i = 0; i + 1 < m; i++) {
    const w = stop && stop.has(qTokens[i]) && stop.has(qTokens[i + 1]) ? 0.35 : 1;
    weight.push(w);
    total += w;
    const key = qTokens[i] + ' ' + qTokens[i + 1];
    const list = pairAt.get(key);
    if (list) list.push(i); else pairAt.set(key, [i]);
  }
  /** @type {Array<[number, number]>} */
  const found = [];
  for (let j = 0; j + 1 < toks.length; j++) {
    const list = pairAt.get(toks[j] + ' ' + toks[j + 1]);
    if (list) for (const i of list) found.push([j, i]);
  }
  if (!found.length) return 0;
  const span = m + 4;
  let best = 0;
  let lo = 0;
  /** @type {Map<number, number>} */
  const inWin = new Map();
  let sum = 0;
  for (let hi = 0; hi < found.length; hi++) {
    const [jh, ih] = found[hi];
    inWin.set(ih, (inWin.get(ih) || 0) + 1);
    if (inWin.get(ih) === 1) sum += weight[ih];
    while (found[lo][0] < jh - span) {
      const il = found[lo][1];
      const n = /** @type {number} */ (inWin.get(il)) - 1;
      inWin.set(il, n);
      if (n === 0) sum -= weight[il];
      lo++;
    }
    if (sum > best) best = sum;
  }
  return total ? best / total : 0;
}

/**
 * The tokens with a possessive's or a contraction's lone "s" joined to its word:
 * the tokenizer splits "God's" into god + s, and a reader types "gods" ("gods
 * messengers", "whats in a name"), so a title or a phrase typed without its
 * apostrophe never matched its own words.
 * @param {string[]} toks
 * @returns {string[]}
 */
export function joinApostropheS(toks) {
  if (!toks || toks.indexOf('s') < 0) return toks;
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] === 's' && out.length) out[out.length - 1] += 's';
    else out.push(toks[i]);
  }
  return out;
}

/** The length of the longest common subsequence: the words two lists share in order. */
function commonInOrder(/** @type {string[]} */ a, /** @type {string[]} */ b) {
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/** How much of the typed words, in order, a title must hold before it counts. */
export const TITLE_QUERY_MIN = 0.75;

/**
 * How a unit's title answers the typed words: TITLE_EXACT_BOOST when the query is
 * the title (a leading "Regarding" / "The" aside, as readers type it: "tithing" is
 * "Regarding Tithing"); for a title typed in part or misremembered, by how many of
 * the typed words the title holds in order (at least TITLE_QUERY_MIN of them, and
 * two) and how much of the title they are ("Regarding the Days" of "Regarding the
 * Days of Noah"; "Pride Comes Before a Fall" for "Pride Goes Before a Fall"); 1
 * otherwise. There was no title signal beyond the field boost, and a title typed
 * whole lost to longer texts holding its words ("Wisdom" #2 behind "Discernment",
 * "The Truth" #6). Given the stop words, a title is also matched by its content words
 * in any order and form, a little less ("portion of the hypocrites" is "The Hypocrite's
 * Portion", "walk free" is "Walking Free", "pure in heart" is "The Pure of Heart":
 * search benchmark 2026-10-05).
 * @param {string[]} titleToks
 * @param {string[]} qTokens
 * @param {Set<string>} [stop]
 * @returns {number}
 */
export function titleMatch(titleToks, qTokens, stop) {
  const inOrder = titleInOrder(titleToks, qTokens);
  return stop && inOrder < TITLE_EXACT_BOOST ? Math.max(inOrder, titleWords(titleToks, qTokens, stop)) : inOrder;
}
/** A title's content words met in any order, by lemma: TITLE_BAG_RATE of the in-order score. */
export const TITLE_BAG_RATE = 0.9;
function titleWords(/** @type {string[]} */ titleToks, /** @type {string[]} */ qTokens, /** @type {Set<string>} */ stop) {
  const skip = (/** @type {string} */ w) => stop.has(w) || TITLE_LEAD.has(w);
  const content = (/** @type {string[]} */ x) => [...new Set(joinApostropheS(x).filter((w) => !skip(w)).map(lemma).filter((w) => !skip(w)))];
  const q = content(qTokens);
  const t = content(titleToks);
  if (q.length < 2 || !t.length) return 1;
  // Every word the reader meant, not most (out of order, most of a title's words are anywhere),
  // and the title give or take a word: "it is who you choose" quotes a letter, not "Who You Choose".
  if (!q.every((w) => t.indexOf(w) >= 0)) return 1;
  // ...and most of the title: "churches of men" names "Regarding the Churches of Men", not "False Doctrines Within the Churches of Men".
  if (q.length < TITLE_QUERY_MIN * t.length) return 1;
  const tl = new Set(joinApostropheS(titleToks).map(lemma));
  if (joinApostropheS(qTokens).filter((w) => !TITLE_LEAD.has(w) && !tl.has(lemma(w))).length > 1) return 1;
  return 1 + (TITLE_EXACT_BOOST - 1) * TITLE_BAG_RATE * (0.5 + 0.5 * q.length / t.length);
}
function titleInOrder(/** @type {string[]} */ titleToks, /** @type {string[]} */ qTokens) {
  if (!titleToks || !titleToks.length || !qTokens || !qTokens.length) return 1;
  const t = joinApostropheS(titleToks);
  const q = joinApostropheS(qTokens);
  const strip = (/** @type {string[]} */ x) => { let i = 0; while (i < x.length - 1 && TITLE_LEAD.has(x[i])) i++; return x.slice(i); };
  const tt = strip(t);
  const qq = strip(q);
  if (tt.length === qq.length && tt.every((w, i) => w === qq[i])) return TITLE_EXACT_BOOST;
  if (q.length < 2) return 1;
  const common = commonInOrder(q, t);
  if (common < 2) return 1;
  const qCov = common / q.length;
  if (qCov < TITLE_QUERY_MIN) return 1;
  const tCov = common / t.length;
  return 1 + (TITLE_EXACT_BOOST - 1) * qCov * qCov * (0.5 + 0.5 * tCov);
}

/**
 * Count set bits — the number of DISTINCT original query terms a doc matched.
 * @param {number} mask
 * @returns {number}
 */
export function popcount(mask) {
  let m = mask | 0;
  let n = 0;
  while (m) { m &= (m - 1); n++; }
  return n;
}

/**
 * Does `text` contain `qTokens` as a contiguous run? Tokenized via kjvEncode, so
 * it's punctuation- AND archaic-immune ("be still, and know" matches the query
 * "be still and know"; "thou art" matches "you are").
 * @param {string} text
 * @param {string[]} qTokens
 * @returns {boolean}
 */
export function phraseTokenMatch(text, qTokens) {
  if (!text || !qTokens || qTokens.length < 2) return false;
  const toks = kjvEncode(text);
  const n = toks.length;
  const m = qTokens.length;
  if (m > n) return false;
  for (let i = 0; i + m <= n; i++) {
    let ok = true;
    for (let j = 0; j < m; j++) {
      if (toks[i + j] !== qTokens[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

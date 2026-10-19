/* ═══════════════════════════════════════════════════════════════════════
   search/titles.js — a title typed the way a reader remembers it (search200 B5)
   ═══════════════════════════════════════════════════════════════════════
   A reader looking for a text by its name types it wrong in a handful of ways: a
   near-synonym ("unwavering" for "steadfast"), a word dropped and another wrong, the
   words reordered, a typo, a digit for a number word, or the collection's name beside
   the title ("... words to live by", "... volume 3"). BM25 scores the title as a field
   among the body's thousands of words, and the Answers topics, which reprint
   everything, lead such queries with the target past #30 (tri bench, title/hard 44/70).
   This module scores every title on its own, and names the one the query clearly
   means, so the engine can admit it as a candidate even when BM25 missed it.

   Titles: every prose unit (doc.title), a study chapter's own title (the part after
   " — "), each part of a title cut by "..." / ":" / " — ", and every Answers section
   heading (a centred, wholly bold paragraph). Built from the docs index-builder.js
   emits and the in-memory ANSWERS entries it reads; the corpus is not re-read.

   SCORE (0..1), the highest of:
     • level 4, 1.0: the title as typed (case, punctuation, possessives and numbers
       folded: "2 robes" is "Two Robes", "1st" is "First");
     • level 3, 0.98: equal once a leading The / A / An / Regarding is stripped;
     • level 2, coverage: the typed content words against the title's, both ways, each
       word weighted by its rarity among titles; a word meets another by form (lemma),
       by a typo, by a shared stem or by a near-synonym, at a credit each (CREDIT). Both
       sides must be covered TITLE_COVER_MIN; the order of the matched words counts a
       little ("is X king" still names "X Is King");
     • level 1, typo: character-trigram Jaccard of the whole title, TITLE_TRIGRAM_MIN
       or more ("spare therod").
   NUMBER VETO: a title whose numbers and the query's each hold one the other lacks
   ("Purity Part Five" for "part six") scores nothing.
   COLLECTION WORDS ("words to live by", "volume 3", "lord's rebuke", "answers only god
   can give"...) at the start or end of the query are stripped and scored as a second
   reading, which leans toward that collection (+0.04, and its long titles may be named
   by part) and away from the others (x0.85). The query as typed is scored too, so a
   title holding such a word ("Blessed Hope", "Vision Given to Timothy") still meets it.
   "Letter" is not a collection word: unit-gist queries use it.

   ADMISSION (admitTitles): the first title scores TITLE_ADMIT or more and leads the
   next title by TITLE_MARGIN. A gist that reads like two titles has no margin and is
   not admitted. Same-titled reprints and a numbered series ("Part 1", "Part 2") are
   one title for the margin and are admitted together, the closest first.

   ONE WORD WRONG (swapTitles, search200 last2): the title's shape typed with a content
   word of the reader's own in one place ("chosen to teach" for "Given to Teach"), read
   only where admitTitles names nothing and the shape fits one title alone.

   SEAM: coverage runs through titleCoverage(q, t), replaceable by setTitleCoverage()
   (B4's align.js can take its place). Pure; chrome108-safe; no dependency.
   ═══════════════════════════════════════════════════════════════════════ */

import { kjvEncode } from './tokenize.js';
import { lemma } from './passage.js';
import { joinApostropheS } from './ranking.js';
import { searchData } from './search-data.js';

/** Admission: the first title scores this much... */
export const TITLE_ADMIT = 0.75;
/** ...and leads the next different title by this much. */
export const TITLE_MARGIN = 0.15;
/** Coverage: each side's content words held at least this much. */
export const TITLE_COVER_MIN = 0.6;
/** Typo: the whole title's character-trigram Jaccard. */
export const TITLE_TRIGRAM_MIN = 0.6;

/** What a typed word is worth against a title word it is not. */
export const CREDIT = { same: 1, lemma: 0.95, typo: 0.8, synonym: 0.7, stem: 0.6 };
/** Typed content words a title may leave unmet: more, and the query is a sentence that holds the title. */
export const TITLE_UNMET_MAX = 1;
/** Words a query may run past the title's (lead words off): more, and it is a sentence that happens to cover a short title. */
export const TITLE_EXTRA_WORDS = 3;

const SCORE = { typed: 1, lead: 0.98, segment: 0.93, cover: 0.96 };
/** A title part (before or after "...") is a little less than the whole title. */
const PART_RATE = 0.97;
/** The stripped reading: a title in the named collection, and one outside it. */
const HINT_BONUS = 0.04;
const HINT_ELSEWHERE = 0.85;
/** In the named collection, a long title may be named by part: all the typed words, a third of the title's. */
const HINT_QUERY_MIN = 0.75;
const HINT_TITLE_MIN = 0.34;

/** The leading words a title opens with that readers leave off (ranking.js TITLE_LEAD, B1's level 3). */
const LEAD = new Set(['regarding', 'the', 'a', 'an']);
/** Words that are no title's content beside the stop words: "concerning creation" is "Regarding Creation". */
const FUNCTION_WORDS = new Set(['regarding', 'concerning', 'about', 'upon', 'unto', 'into', 'o']);

/** The order titles of one name are shown in (B1's ORIGINAL_TIER): letters, WTLB, Holy Days, studies, Answers. */
const TIER = Object.assign(Object.create(null), { letter: 0, wtlb: 1, blessed: 1, 'holy-day': 2, 'bible-study': 3, answers: 4 });
const HEADING_TIER = 5;

/* ── numbers ── */
const NUMBER_WORDS = Object.assign(Object.create(null), {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20,
});
/** A token's number (6, "6", "six", "sixth", "6th"), or null. Before and after B2's folding alike. */
export function numberOf(/** @type {string} */ t) {
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(\d+)(?:st|nd|rd|th)$/.exec(t);
  if (m) return Number(m[1]);
  const v = NUMBER_WORDS[t];
  return v === undefined ? null : v;
}

/** A title's or a query's words: kjvEncode, possessives joined, each number as "#n". */
export function titleWords(/** @type {string} */ str) {
  const toks = joinApostropheS(kjvEncode(str)) || [];
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const n = numberOf(toks[i]);
    out.push(n === null ? toks[i] : '#' + n);
  }
  return out;
}
const isNum = (/** @type {string} */ w) => w.charCodeAt(0) === 35; // '#'
const stripLead = (/** @type {string[]} */ w) => { let i = 0; while (i < w.length - 1 && LEAD.has(w[i])) i++; return i ? w.slice(i) : w; };
const lem = (/** @type {string} */ w) => (isNum(w) ? w : lemma(w));

/* ── near-synonyms of title words (title matching only; SYNONYM_MAP joins them at build) ──
   General English near-synonyms of the words titles are made of, so a title remembered
   with one word changed still meets itself. Words meet by lemma (passage.js). */
const TITLE_SYNONYMS = [
  'power strength might mighty powerful strong', 'true real genuine authentic sincere',
  'steadfast unwavering unshakable unshaken firm constant immovable resolute', 'always forever ever evermore eternally perpetually continually',
  'remain stay abide dwell tarry wait linger', 'hope promise expectation assurance', 'due just rightful deserved fitting fair',
  'discipline correction correct chastening chastisement chasten chastise reproof reprove', 'rod staff cane stick scepter',
  'wake waking awake awaken awakening awoke', 'rise arise risen rising raised', 'bread loaf manna',
  'chosen elect called appointed selected', 'given granted bestowed', 'teach instruct train educate', 'teaching doctrine dogma',
  'love charity affection', 'forgive pardon absolve forgiveness', 'mercy compassion pity kindness', 'wrath anger fury rage indignation',
  'world earth', 'people folk', 'nation country', 'church congregation assembly', 'sin iniquity transgression trespass',
  'wicked evil ungodly unrighteous', 'holy sacred hallowed sanctified', 'great big large grand', 'end finish', 'last final latter',
  'new renewed fresh', 'old ancient former', 'light brightness radiance', 'dark darkness gloom shadow', 'way path road',
  'speak say tell talk declare proclaim', 'come coming approach arrive', 'near close nigh', 'fear dread terror afraid',
  'joy gladness happiness delight glad', 'peace rest calm tranquility quiet', 'humble meek lowly modest humility meekness',
  'pride arrogance haughtiness conceit proud arrogant haughty', 'answer reply response', 'servant slave bondservant',
  'king ruler monarch sovereign', 'kingdom reign dominion', 'glory splendor majesty', 'honor respect esteem reverence',
  'warning caution admonition warn alarm', 'lie lying falsehood deceit deception deceive', 'false fake counterfeit', 'prophet seer',
  'sacrifice offering', 'reward recompense wages payment', 'punishment penalty retribution', 'vengeance revenge',
  'destroy destruction ruin', 'desolate desolation barren', 'faithful loyal devoted trustworthy', 'trust rely reliance confidence',
  'child kid offspring', 'bridegroom groom', 'marriage wedding matrimony', 'death dead die dying demise', 'life living alive',
  'heaven paradise', 'hell hades sheol gehenna', 'torment torture suffering anguish agony', 'sorrow grief mourning sadness lament',
  'spirit ghost', 'salvation redemption deliverance rescue', 'savior redeemer deliverer', 'hidden secret concealed',
  'revealed uncovered disclosed exposed unveiled', 'forsake abandon desert', 'obey heed follow', 'commandment command law statute decree',
  'watch watchful vigilant alert guard', 'fight battle war struggle combat', 'enemy foe adversary', 'stone rock', 'fire flame blaze',
  'sword blade', 'wise wisdom prudent', 'integrity honesty uprightness', 'perfect flawless complete perfection',
  'pure clean spotless undefiled unblemished purity', 'idle lazy slothful', 'envy jealousy covetousness greed',
  'adultery fornication infidelity', 'murder kill killing slay', 'abomination detestable abhorrent', 'tradition custom',
  'feast festival celebration', 'beginning start origin', 'alone only solely', 'little small', 'gather assemble collect',
  'harvest reaping reap', 'shepherd pastor', 'narrow strait', 'exalted uplifted lifted', 'weep cry wail', 'doubt unbelief disbelief',
  'healing cure heal', 'restore revive renew refresh restored revived', 'united unity union', 'separate apart divide division',
  'barrier wall', 'footstep step', 'evident plain clear obvious', 'banner flag', 'trumpet horn shofar', 'veil curtain covering',
  'fountain spring well', 'sundown sunset evening', 'morning dawn daybreak sunrise', 'embrace accept receive welcome',
  'choose select pick', 'mystery riddle', 'gift present', 'defend protect shield', 'beautiful lovely pretty', 'lord god',
  'silence silent quiet hush', 'error mistake', 'accord agreement harmony', 'vision view sight', 'hunger famine starvation',
  'cord rope bond chain', 'unique special singular', 'song hymn psalm', 'judge condemn', 'messenger envoy',
];

/* ── collection words: the COLLECTIONS registry's names (data/scripture-resolution.js label / registryLabel) as typed ── */
const COLLECTION_PHRASES = (function () {
  /** @type {Array<[string, string[]]>} phrase -> the volumeIds it names */
  const list = [];
  const add = (/** @type {string} */ phrase, /** @type {string[]} */ ids) => list.push([phrase, ids]);
  const VOL = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  for (let n = 1; n <= 7; n++) {
    for (const head of ['volume', 'vol', 'v']) { add(head + ' ' + n, ['v' + n]); add(head + ' ' + VOL[n - 1], ['v' + n]); }
    add('v' + n, ['v' + n]); add('vol' + n, ['v' + n]); add('volume' + n, ['v' + n]);
  }
  for (const [n, id] of [['one', 'wtlb1'], ['two', 'wtlb2'], ['1', 'wtlb1'], ['2', 'wtlb2']]) {
    add('words to live by part ' + n, [id]); add('words to live by ' + n, [id]); add('wtlb part ' + n, [id]); add('wtlb ' + n, [id]);
  }
  add('wtlb1', ['wtlb1']); add('wtlb2', ['wtlb2']);
  add('words to live by', ['wtlb1', 'wtlb2']); add('wtlb', ['wtlb1', 'wtlb2']);
  for (const p of ['letters from timothy', 'timothy']) add(p, ['timothy']);
  for (const p of ["letters to the lord's little flock", "lord's little flock", 'little flock', 'flock']) add(p, ['flock']);
  for (const p of ["a testament against the world the lord's rebuke", 'a testament against the world', "the lord's rebuke", "lord's rebuke", 'rebuke']) add(p, ['rebuke']);
  for (const p of ['the blessed', 'blessed']) add(p, ['blessed']);
  for (const p of ['regarding the holy days', 'holy days', 'holy day', 'holydays']) add(p, ['holydays']);
  for (const p of ['answers only god can give', 'answers']) add(p, ['answers']);
  for (const p of ['bible letter study', 'bible study', 'letter study', 'study', 'studies']) add(p, ['bible-studies']);
  return list.map(([p, ids]) => ({ w: titleWords(p), ids })).sort((a, b) => b.w.length - a.w.length);
})();

/** The query with the collection words at its start and end taken off, and the collections they name; null when none. */
export function stripCollections(/** @type {string[]} */ w) {
  let from = 0;
  let to = w.length;
  /** @type {Set<string>} */
  const ids = new Set();
  const at = (/** @type {number} */ i, /** @type {string[]} */ p) => { for (let k = 0; k < p.length; k++) if (w[i + k] !== p[k]) return false; return true; };
  for (let again = true; again && to - from > 1;) {
    again = false;
    for (const c of COLLECTION_PHRASES) {
      if (c.w.length >= to - from) continue;
      if (at(from, c.w)) { from += c.w.length; c.ids.forEach((x) => ids.add(x)); again = true; break; }
      if (at(to - c.w.length, c.w)) { to -= c.w.length; c.ids.forEach((x) => ids.add(x)); again = true; break; }
    }
  }
  return ids.size ? { w: w.slice(from, to), hints: ids } : null;
}

/* ── word relations ── */
/** Optimal-string-alignment distance, or max + 1 once it is past max. */
function editDistance(/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let p2 = null;
  let p1 = [];
  for (let j = 0; j <= b.length; j++) p1.push(j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      cur.push(v);
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    p2 = p1;
    p1 = cur;
  }
  return p1[b.length];
}
/** A typo: one edit in a word of 4+ letters, two in one of 8+. */
function typoClose(/** @type {string} */ a, /** @type {string} */ b) {
  const n = Math.min(a.length, b.length);
  if (n < 4) return false;
  const max = n >= 8 ? 2 : 1;
  return editDistance(a, b, max) <= max;
}
/** One stem: a shared opening of 4+ letters, half the longer word or more ("selfish", "selfless"; "faith", "faithful"). */
function stemClose(/** @type {string} */ a, /** @type {string} */ b) {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k >= 4 && k >= 0.5 * Math.max(a.length, b.length);
}

/**
 * Coverage of a query's content words by a title's, both ways (THE SEAM: setTitleCoverage
 * puts B4's alignment in its place). Each typed word takes its best title word once.
 * @param {Array<{tok: string, wt: number, rel: Map<string, number>}>} q  typed content words: weight, credit per title word
 * @param {Array<{tok: string, wt: number}>} t  the title's content words
 * @returns {{q: number, t: number, order: number, unmet?: number}}  weighted share of each side met, of the met words in order,
 *   and how many typed words met nothing
 */
export function titleCoverage(q, t) {
  /** @type {Array<[number, number, number]>} credit, i, j */
  const pairs = [];
  for (let i = 0; i < q.length; i++) {
    for (let j = 0; j < t.length; j++) {
      const c = q[i].rel.get(t[j].tok);
      if (c) pairs.push([c, i, j]);
    }
  }
  if (!pairs.length) return { q: 0, t: 0, order: 0 };
  pairs.sort((a, b) => b[0] - a[0] || Math.abs(a[1] / q.length - a[2] / t.length) - Math.abs(b[1] / q.length - b[2] / t.length));
  const usedQ = new Array(q.length).fill(false);
  const usedT = new Array(t.length).fill(false);
  let qs = 0; let ts = 0; let qw = 0; let tw = 0;
  /** @type {number[]} the title place each met typed word took, by typed place */
  const at = new Array(q.length).fill(-1);
  for (const [c, i, j] of pairs) {
    if (usedQ[i] || usedT[j]) continue;
    usedQ[i] = usedT[j] = true;
    qs += c * q[i].wt;
    ts += c * t[j].wt;
    at[i] = j;
  }
  for (const x of q) qw += x.wt;
  for (const x of t) tw += x.wt;
  // the met words in order: the longest increasing run of title places, over the met words
  const seq = at.filter((j) => j >= 0);
  const tails = [];
  for (const j of seq) { let lo = 0; let hi = tails.length; while (lo < hi) { const m = (lo + hi) >> 1; if (tails[m] < j) lo = m + 1; else hi = m; } tails[lo] = j; }
  return { q: qw ? qs / qw : 0, t: tw ? ts / tw : 0, order: seq.length > 1 ? tails.length / seq.length : 1, unmet: q.length - seq.length };
}
let coverFn = titleCoverage;
/** Replace the coverage function (B4's align.js); none restores titleCoverage. */
export function setTitleCoverage(/** @type {typeof titleCoverage | null} */ fn) { coverFn = typeof fn === 'function' ? fn : titleCoverage; }

/* ── the index ── */
const trigrams = (/** @type {string} */ s) => { const p = ' ' + s + ' '; const g = new Set(); for (let i = 0; i + 3 <= p.length; i++) g.add(p.slice(i, i + 3)); return g; };

/** An Answers paragraph that is a section heading: centred and wholly bold. */
const HEADING = /^\s*\*\*([^*]+)\*\*\s*$/;
/** The heading's words as the index reads them (index-builder formatBReadText, without its markers). */
const plain = (/** @type {string} */ s) => s.replace(/\{\{[^}]+\}\}/g, ' ').replace(/\*\*|_/g, '').replace(/\s+/g, ' ').trim();

/**
 * @typedef {Object} TitleEntry
 * @property {string} key  the title's own key: the unit's (volumeId/letterId; a study chapter by its chapter id), "#chapter", "#part<n>" or "#h<n>" after it
 * @property {string} uk   the unit it opens
 * @property {string} docId
 * @property {string} title
 * @property {string} kind  unit | chapter | part | heading
 * @property {string} collection  the doc's volumeId
 * @property {number} tier
 * @property {number} start  a heading's character offset in its doc's text, else -1
 */

/**
 * Precompute every title for scoring: tokens, lemmas, content words and weights, trigrams, number keys.
 * @param {Array<Object>} docs  index-builder buildDocs() output
 * @param {{answers?: Array<Object>}} [opts]  the ANSWERS entries index-builder read (their section headings)
 */
export function buildTitles(docs, opts) {
  const D = searchData();
  const stop = D.STOP_WORDS_TRIMMED || new Set();
  const skip = (/** @type {string} */ w) => stop.has(w) || LEAD.has(w) || FUNCTION_WORDS.has(w);
  /** @type {Array<any>} */
  const entries = [];
  const seen = new Set();
  const byDocLetter = new Map();
  const add = (/** @type {any} */ doc, /** @type {string} */ title, /** @type {string} */ kind, /** @type {string} */ key, /** @type {number} */ start) => {
    const w = titleWords(title);
    if (!w.length) return;
    const norm = w.join(' ');
    const uk = unitKeyOf(doc);
    if (seen.has(uk + '|' + norm)) return;
    seen.add(uk + '|' + norm);
    const s3 = stripLead(w);
    let content = w.filter((x) => !skip(x));
    if (!content.length) content = s3;
    content = content.filter((x, i) => content.indexOf(x) === i);
    entries.push({
      key, uk, docId: doc.id, title, kind, collection: doc.volumeId || '', tier: kind === 'heading' ? HEADING_TIER : (TIER[doc.kind] ?? 4), start,
      norm, norm3: s3.join(' '), toks: new Set(w), content, lems: content.map(lem), nums: new Set(w.filter(isNum)),
      series: content.filter((x) => !isNum(x)).join(' '), grams: trigrams(s3.join(' ')), w3: s3, l3: s3.map(lem),
    });
  };
  const PART_CUT = /\s*(?:\.\.\.|…|:|\s—\s)\s*/;
  const addWithParts = (/** @type {any} */ doc, /** @type {string} */ title, /** @type {string} */ kind, /** @type {string} */ key) => {
    add(doc, title, kind, key, -1);
    let parts = title.split(PART_CUT).filter((p) => p && /[A-Za-z0-9]/.test(p));
    // ...and at a comma, when every piece is a title of 3+ words ("Remembering the Ascension, Looking to the Blessed Hope")
    const commas = [];
    for (const p of parts) { const c = p.split(/,\s+/); if (c.length > 1 && c.every((x) => titleWords(x).length >= 3)) commas.push(...c); else commas.push(p); }
    parts = commas;
    if (parts.length > 1) parts.slice(0, 4).forEach((p, n) => add(doc, p, 'part', key + '#part' + n, -1));
  };
  for (const doc of docs || []) {
    if (!doc || doc.kind === 'verse' || !doc.title) continue;
    const uk = unitKeyOf(doc);
    if (doc.kind === 'bible-study') {
      add(doc, doc.title, 'unit', uk, -1);
      const at = doc.title.indexOf(' — ');
      if (at >= 0) addWithParts(doc, doc.title.slice(at + 3), 'chapter', uk + '#chapter');
    } else addWithParts(doc, doc.title, 'unit', uk);
    if (doc.kind === 'answers') byDocLetter.set(doc.letterId, doc);
  }
  const answers = opts && Array.isArray(opts.answers) ? opts.answers : [];
  for (const en of answers) {
    const doc = en && byDocLetter.get(en.id);
    if (!doc) continue;
    let from = 0;
    (en.paragraphs || []).forEach((p, i) => {
      const m = p && p.align === 'center' ? HEADING.exec(p.text || '') : null;
      if (!m) return;
      const text = plain(m[1]).replace(/^excerpt from:\s*/i, '');
      const at = text ? doc.text.indexOf(text, from) : -1;
      if (at >= 0) from = at + text.length;
      add(doc, text, 'heading', unitKeyOf(doc) + '#h' + i, at);
    });
  }
  // weights: rarity among titles, by lemma
  /** @type {Map<string, number>} */
  const df = new Map();
  for (const e of entries) for (const l of new Set(e.lems)) df.set(l, (df.get(l) || 0) + 1);
  const N = entries.length || 1;
  const weight = (/** @type {string} */ l) => Math.log(1 + N / Math.max(1, df.get(l) || 0));
  // synonym groups, by lemma
  /** @type {Map<string, number[]>} */
  const groups = new Map();
  let gid = 0;
  const addGroup = (/** @type {string[]} */ words) => {
    const id = gid++;
    for (const x of words) {
      const toks = titleWords(x);
      if (toks.length !== 1) continue;
      const l = lem(toks[0]);
      const a = groups.get(l);
      if (!a) groups.set(l, [id]); else if (a.indexOf(id) < 0) a.push(id);
    }
  };
  TITLE_SYNONYMS.forEach((g) => addGroup(g.split(' ')));
  const SYN = D.SYNONYM_MAP || {};
  for (const k of Object.keys(SYN)) if (Array.isArray(SYN[k])) addGroup([k].concat(SYN[k]));
  // the vocabulary: every content word, its lemma, groups and titles
  /** @type {Map<string, {lem: string, groups: number[] | undefined, num: boolean, titles: number[]}>} */
  const vocab = new Map();
  entries.forEach((e, idx) => {
    e.items = e.content.map((tok, k) => ({ tok, wt: weight(e.lems[k]) }));
    // a number the reader did not type is the series' mark, not a word left out ("calling you out" names "...Out! (Part 1)")
    const plainItems = e.items.filter((/** @type {any} */ x) => !isNum(x.tok));
    e.plainItems = plainItems.length ? plainItems : e.items;
    e.words = e.norm3.split(' ').length;
    for (const tok of e.content) {
      let v = vocab.get(tok);
      if (!v) { v = { lem: lem(tok), groups: groups.get(lem(tok)), num: isNum(tok), titles: [] }; vocab.set(tok, v); }
      if (v.titles[v.titles.length - 1] !== idx) v.titles.push(idx);
    }
  });
  /** @type {Map<string, number[]>} */
  const byNorm = new Map();
  /** @type {Map<string, number[]>} */
  const byNorm3 = new Map();
  /** @type {Map<string, number[]>} */
  const byGram = new Map();
  /** @type {Map<number, number[]>} the titles of each length, their lead word off (swapTitles) */
  const byWords = new Map();
  entries.forEach((e, idx) => {
    for (const [m, k] of [[byNorm, e.norm], [byNorm3, e.norm3]]) { const a = m.get(k); if (a) a.push(idx); else m.set(k, [idx]); }
    for (const g of e.grams) { const a = byGram.get(g); if (a) a.push(idx); else byGram.set(g, [idx]); }
    const a = byWords.get(e.w3.length);
    if (a) a.push(idx); else byWords.set(e.w3.length, [idx]);
  });
  const index = { entries, vocab, groups, weight, maxWeight: Math.log(1 + N), skip, byNorm, byNorm3, byGram, byWords };
  current = index;
  return index;
}
/** @type {any} */
let current = null;
/** The index scoreTitles uses by default (the last built). */
export function titleIndex() { return current; }

/** The unit a doc opens (tools/search-bench/corpus.mjs unitKey): a study chapter by its chapter id. */
function unitKeyOf(/** @type {any} */ doc) {
  if (doc.kind === 'bible-study') return 'bible-studies/' + (doc.studyChapterId || doc.letterId);
  return (doc.volumeId || '') + '/' + (doc.letterId || doc.id);
}

/** A typed word's credit against each title word it can meet. */
function relate(/** @type {any} */ ix, /** @type {string} */ tok) {
  /** @type {Map<string, number>} */
  const rel = new Map();
  if (ix.vocab.has(tok)) rel.set(tok, CREDIT.same);
  if (isNum(tok)) return rel;
  const l = lemma(tok);
  const gs = ix.groups.get(l);
  for (const [v, info] of ix.vocab) {
    if (v === tok || info.num) continue;
    let c = 0;
    if (info.lem === l) c = CREDIT.lemma;
    else if (typoClose(tok, v)) c = CREDIT.typo;
    else if (gs && info.groups && gs.some((g) => info.groups.indexOf(g) >= 0)) c = CREDIT.synonym;
    else if (stemClose(tok, v)) c = CREDIT.stem;
    if (c) rel.set(v, c);
  }
  return rel;
}

/**
 * @typedef {Object} TitleHit
 * @property {string} key
 * @property {string} uk
 * @property {string} docId
 * @property {string} title
 * @property {string} kind
 * @property {number} score  0..1
 * @property {number} level  4 typed, 3 lead word stripped, 2 coverage (or a title part typed, or one word wrong), 1 trigram typo
 * @property {string} collection
 * @property {string} via  typed | lead | part | cover | typo | swap, "+collection" when read with the collection words off
 * @property {boolean} hinted  in a collection the query named
 * @property {number} tier
 * @property {number} start  a heading's offset in its doc's text, else -1
 * @property {string} norm
 * @property {string} series  the title's content words without its numbers
 * @property {number} literal  2 the words as typed, 1.5 with the lead word off, else the share of typed words the title holds
 */

/**
 * The titles a query names, best first, one per unit.
 * @param {string} query
 * @param {{index?: any, limit?: number}} [opts]
 * @returns {TitleHit[]}
 */
export function scoreTitles(query, opts) {
  const ix = (opts && opts.index) || current;
  const limit = (opts && opts.limit) || 10;
  if (!ix || typeof query !== 'string') return [];
  const w = titleWords(query);
  if (!w.length) return [];
  /** @type {Map<number, any>} entry -> its best reading */
  const best = new Map();
  /** @type {Map<string, Map<string, number>>} */
  const rels = new Map();
  scoreReading(ix, w, null, best, rels);
  const st = stripCollections(w);
  if (st && st.w.length) scoreReading(ix, st.w, st.hints, best, rels);
  /** @type {Map<string, any>} */
  const byUnit = new Map();
  for (const h of best.values()) { const o = byUnit.get(h.uk); if (!o || order(h, o) < 0) byUnit.set(h.uk, h); }
  return [...byUnit.values()].sort(order).slice(0, limit);
}

/** Best first: score, the named collection, level, the title holding the typed words, tier, the lowest number not typed, key. */
function order(/** @type {any} */ a, /** @type {any} */ b) {
  return b.score - a.score || (b.hinted ? 1 : 0) - (a.hinted ? 1 : 0) || b.level - a.level || b.literal - a.literal || a.tier - b.tier
    || a.extraNum - b.extraNum || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
/** A unit's (or study chapter's) whole title typed, not a part of a longer one nor a heading inside a text. */
const whole = (/** @type {any} */ h) => (h.level >= 3 && (h.kind === 'unit' || h.kind === 'chapter') ? 1 : 0);
/** One name's titles shown in order: the named collection, a whole title over a part ("AWAKEN" over "Awaken... Partake
    of The Living Bread"), the title as typed, the original before its reprints (Corbin, DECISIONS 10-14), score. */
function nameOrder(/** @type {any} */ a, /** @type {any} */ b) {
  return (b.hinted ? 1 : 0) - (a.hinted ? 1 : 0) || whole(b) - whole(a) || b.literal - a.literal || a.tier - b.tier || order(a, b);
}

function scoreReading(/** @type {any} */ ix, /** @type {string[]} */ w, /** @type {Set<string> | null} */ hints, /** @type {Map<number, any>} */ best, /** @type {Map<string, Map<string, number>>} */ rels) {
  const qNums = new Set(w.filter(isNum));
  const keep = (/** @type {number} */ idx, /** @type {number} */ score, /** @type {number} */ level, /** @type {string} */ via) => {
    const e = ix.entries[idx];
    // the number veto: each side holds a number the other lacks
    if (qNums.size && e.nums.size) {
      let qOnly = false; let tOnly = false;
      qNums.forEach((n) => { if (!e.nums.has(n)) qOnly = true; });
      e.nums.forEach((/** @type {string} */ n) => { if (!qNums.has(n)) tOnly = true; });
      if (qOnly && tOnly) return;
    }
    let hinted = false;
    if (hints) {
      if (hints.has(e.collection)) { score += HINT_BONUS; hinted = true; } else score *= HINT_ELSEWHERE;
      via += '+collection';
    }
    score = Math.min(1, score);
    let extraNum = 0;
    e.nums.forEach((/** @type {string} */ n) => { if (!qNums.has(n)) { const v = Number(n.slice(1)); if (!extraNum || v < extraNum) extraNum = v; } });
    // how literally the title holds what was typed: 2 the words as typed, 1.5 with the lead word off, else the share of typed words it holds
    let literal = 0;
    if (w.join(' ') === e.norm) literal = 2;
    else if (w3.join(' ') === e.norm3) literal = 1.5;
    else { for (const x of w) if (e.toks.has(x)) literal++; literal /= w.length; }
    const o = best.get(idx);
    const h = { key: e.key, uk: e.uk, docId: e.docId, title: e.title, kind: e.kind, score, level, collection: e.collection, via, hinted, tier: e.tier, start: e.start, norm: e.norm3, series: e.series, extraNum, literal };
    if (!o || order(h, o) < 0) best.set(idx, h);
  };
  const w3 = stripLead(w);
  // levels 4 and 3: the title as typed, then with its lead word off (a title part typed whole is less)
  const asPart = (/** @type {number} */ idx) => ix.entries[idx].kind === 'part';
  for (const idx of ix.byNorm.get(w.join(' ')) || []) keep(idx, asPart(idx) ? SCORE.segment : SCORE.typed, asPart(idx) ? 2 : 4, asPart(idx) ? 'part' : 'typed');
  for (const idx of ix.byNorm3.get(w3.join(' ')) || []) keep(idx, asPart(idx) ? SCORE.segment : SCORE.lead, asPart(idx) ? 2 : 3, asPart(idx) ? 'part' : 'lead');
  // level 2: coverage
  let content = w.filter((x) => !ix.skip(x));
  if (!content.length) content = w3;
  content = content.filter((x, i) => content.indexOf(x) === i);
  const q = content.map((tok) => {
    let rel = rels.get(tok);
    if (!rel) { rel = relate(ix, tok); rels.set(tok, rel); }
    // a number typed is as telling as the rarest word: "part two" is no title without a 2
    return { tok, wt: isNum(tok) ? ix.maxWeight : ix.weight(lem(tok)), rel };
  });
  /** @type {Set<number>} */
  const cands = new Set();
  for (const x of q) for (const v of x.rel.keys()) for (const idx of ix.vocab.get(v).titles) cands.add(idx);
  for (const idx of cands) {
    const e = ix.entries[idx];
    const cov = coverFn(q, qNums.size ? e.items : e.plainItems);
    if ((cov.unmet || 0) > TITLE_UNMET_MAX || w3.length > e.words + TITLE_EXTRA_WORDS) continue;
    const ord = 0.92 + 0.08 * cov.order;
    let s = 0;
    if (cov.q >= TITLE_COVER_MIN && cov.t >= TITLE_COVER_MIN) s = SCORE.cover * (0.5 * cov.q + 0.5 * cov.t) * ord;
    if (hints && hints.has(e.collection) && cov.q >= HINT_QUERY_MIN && cov.t >= HINT_TITLE_MIN) s = Math.max(s, SCORE.cover * (0.75 * cov.q + 0.25 * cov.t) * ord);
    if (s > 0) keep(idx, e.kind === 'part' ? s * PART_RATE : s, 2, 'cover');
  }
  // level 1: a typo the words did not meet ("therod"), by the whole title's trigrams; a typo keeps the
  // title's length give or take a word (a title inside a longer query, or the reverse, shares trigrams too)
  const q3 = w3.join(' ');
  const qg = trigrams(q3);
  /** @type {Map<number, number>} */
  const shared = new Map();
  for (const g of qg) for (const idx of ix.byGram.get(g) || []) shared.set(idx, (shared.get(idx) || 0) + 1);
  for (const [idx, c] of shared) {
    const e = ix.entries[idx];
    if (Math.abs(e.words - w3.length) > 1 || Math.min(q3.length, e.norm3.length) < 0.8 * Math.max(q3.length, e.norm3.length)) continue;
    const J = c / (qg.size + e.grams.size - c);
    if (J >= TITLE_TRIGRAM_MIN) keep(idx, SCORE.cover * (0.5 + 0.5 * J) * (e.kind === 'part' ? PART_RATE : 1), 1, 'typo');
  }
}

/** One title for the margin: one unit, one name (a reprint), or one numbered series. */
const sameTitle = (/** @type {TitleHit} */ a, /** @type {TitleHit} */ b) => a.uk === b.uk || a.norm === b.norm || (!!a.series && a.series === b.series);

/**
 * The titles a query clearly means, to join the candidates even when BM25 missed them:
 * the first scores TITLE_ADMIT or more and leads the next different title by TITLE_MARGIN
 * (a title typed whole, level 3 or 4, needs no margin over a lesser match). Its reprints and
 * series come with it, in nameOrder: a reprint's title typed whole still shows the original first.
 * @param {TitleHit[]} hits  scoreTitles() output
 * @returns {TitleHit[]}
 */
export function admitTitles(hits) {
  const lead = hits && hits[0];
  if (!lead || lead.score < TITLE_ADMIT) return [];
  if (lead.level >= 3) return hits.filter((h) => h.score >= TITLE_ADMIT && (h.level >= 3 || sameTitle(h, lead))).sort(nameOrder);
  const next = hits.find((h) => !sameTitle(h, lead));
  if (next && lead.score - next.score < TITLE_MARGIN) return [];
  return hits.filter((h) => h.score >= TITLE_ADMIT && sameTitle(h, lead)).sort(looseOrder);
}

/** A unit's (or chapter's) own title before a longer title it is the first part of, when the name was remembered
    loosely too ("Serve Me As I Have Loved You" before "Serve Me as I Have Loved You, Says The Lord"); then nameOrder. */
const ownTitle = (/** @type {any} */ h) => (h.kind === 'unit' || h.kind === 'chapter' ? 1 : 0);
function looseOrder(/** @type {any} */ a, /** @type {any} */ b) {
  return (b.hinted ? 1 : 0) - (a.hinted ? 1 : 0) || ownTitle(b) - ownTitle(a) || nameOrder(a, b);
}

/* A TITLE TYPED WITH ONE WORD WRONG (search200 last2, 2026-10-18). A reader sure of a title's shape and unsure of one
   of its words types the shape with a word of their own in that word's place: "Given to Teach" as "chosen to teach".
   The word is no form, typo or near-synonym of the title's, so coverage holds half the typed words and names nothing;
   BM25 reads two words of three in the letter, and the Answers topics holding all three, far apart, lead it. The
   title's shape is the evidence: as many words as the title (their lead words off), each in its place the title's
   own word or a form of it, but for one, where the typed word and the title's are both content words (a small word,
   a negation or a number changed is another title), with a content word of the title's met beside it. TITLE_SWAP_MIN
   words or more (a two-word title one word off is one word typed). The weakest reading of all: it names a title only
   when it is the one reading. One title fits (its reprints, same-titled, are one), in the typed words or with a
   collection's words taken off (then in that collection only), and scoreTitles named no other. The engine reads it
   only when admitTitles names nothing, and only when no text holds the typed words together (search()). */
/** Title words, the lead word off, at least, for a title typed with one word wrong to be read as that title. */
export const TITLE_SWAP_MIN = 3;
/** A negation counts as a small word: "attained by human means" is not "Not By Human Means" with one word wrong. */
const NEGATIONS = new Set(['not', 'no', 'nor', 'never', 'neither', 'none', 'nothing', 'nay', 'naught', 'nought']);

/**
 * The title the query is with one word wrong, and its same-titled reprints (looseOrder); none when no title, or more
 * than one, fits, or when `hits` hold another title. Level 2, via "swap" ("+collection" read with its words off).
 * Each hit holds `swap` (the typed word and the title's) and `typed` (the words read, their lead word off).
 * @param {string} query
 * @param {{index?: any, hits?: TitleHit[]}} [opts]  hits: the titles scoreTitles named for the query
 * @returns {Array<TitleHit & {swap: [string, string], typed: string[]}>}
 */
export function swapTitles(query, opts) {
  const ix = (opts && opts.index) || current;
  if (!ix || !ix.byWords || typeof query !== 'string') return [];
  const w = titleWords(query);
  if (!w.length) return [];
  /** @type {Map<string, any>} unit -> its best reading */
  const byUnit = new Map();
  swapReading(ix, w, null, byUnit);
  const st = stripCollections(w);
  if (st && st.w.length) swapReading(ix, st.w, st.hints, byUnit);
  if (!byUnit.size) return [];
  const hits = [...byUnit.values()].sort(order);
  const lead = hits[0];
  if (hits.some((h) => !sameTitle(h, lead))) return [];
  if (((opts && opts.hits) || []).some((h) => !sameTitle(h, lead))) return [];
  return hits.sort(looseOrder);
}

function swapReading(/** @type {any} */ ix, /** @type {string[]} */ w, /** @type {Set<string> | null} */ hints, /** @type {Map<string, any>} */ byUnit) {
  const w3 = stripLead(w);
  if (w3.length < TITLE_SWAP_MIN) return;
  const l3 = w3.map(lem);
  const content = (/** @type {string} */ x) => !ix.skip(x) && !isNum(x) && !NEGATIONS.has(x);
  for (const idx of ix.byWords.get(w3.length) || []) {
    const e = ix.entries[idx];
    if (hints && !hints.has(e.collection)) continue;
    let at = -1;
    let met = false;
    let k = 0;
    for (; k < w3.length; k++) {
      const a = w3[k];
      const b = e.w3[k];
      if (a === b || (content(a) && content(b) && l3[k] === e.l3[k])) { if (content(b) || isNum(b)) met = true; continue; }
      if (at >= 0 || !content(a) || !content(b)) break;
      at = k;
    }
    if (k < w3.length || at < 0 || !met) continue;
    const hinted = !!hints;
    const h = {
      key: e.key, uk: e.uk, docId: e.docId, title: e.title, kind: e.kind, score: TITLE_ADMIT * (e.kind === 'part' ? PART_RATE : 1), level: 2,
      collection: e.collection, via: hinted ? 'swap+collection' : 'swap', hinted, tier: e.tier, start: e.start, norm: e.norm3, series: e.series,
      extraNum: 0, literal: (w3.length - 1) / w3.length, swap: [w3[at], e.w3[at]], typed: w3,
    };
    const o = byUnit.get(h.uk);
    if (!o || order(h, o) < 0) byUnit.set(h.uk, h);
  }
}

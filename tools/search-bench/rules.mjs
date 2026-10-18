/* Bench fairness rules (path to ~475, step 1, 2026-10-15): pure, so rules.test.js holds them before any re-run.
   ─────────────────────────────────────────────────────────────────
   CONTAINMENT  a whole-text target's class also takes any text that holds 80% of its word 3-grams in one place:
                a letter that a Words To Live By entry excerpts under another title is that entry's original.
   RECURRING    a sentence the Bible holds and at least 3 letters repeat has no one original (Corbin 10-14: "I am The
                Lord and I do not change ... It's in the bible and all throughout TVOT too"): any text holding it answers.
   REPRINT      when the original leads, its reprint shows too (Corbin 10-14: "both should surface, with WTLB being
                second"): another member of the class is among the Best Matches five (SearchScreen topResults: one card
                per text, so a copy with the same title and opening is the same card and counts as shown).
   NEAR COPY    a recurring line with a word or two changed ("the pride of man shall be bowed down" / "is bowed down"),
                which breaks a third of its 3-grams: 80% of its words AND of its content words in order, within a
                stretch at most 4 words longer (sr11 t276, 2026-10-15). Such a text answers the sentence too but is no
                original of it (Corbin 10-14: a phrase that recurs has no single original).
   NEAR QUOTE   (errata 2026-10-18, a blind 3-judge review of tri m246, 3 of 3) a sentence quoting a verse with a word or
                two changed ("seek, and you shall find" for the NKJV's "you will find") breaks too many 3-grams for the
                80% rule but holds the verse by NEAR COPY's measure, or the verse holds it. Such a verse answers the
                sentence as a near member: any holder of a recurring line counts, and the class's original is unchanged.
   NAMED COLLECTION  (errata 2026-10-18, tri n344, 3 of 3) a query naming the target's collection ("capital punishment
                answers only god can give") asks for that collection's own text: the target's own unit may lead though a
                better-tier text holds the same words (the original-first and reprint-shown checks yield). A name counts
                only where the query holds it and the target's title and sentence do not.
   ─────────────────────────────────────────────────────────────────── */

const gram = (w, i) => w[i] + ' ' + w[i + 1] + ' ' + w[i + 2];

/** The share of `target`'s distinct word 3-grams that `other` holds within one window 1.5x the target's length. */
export function heldShare(target, other) {
  const want = new Set();
  for (let i = 0; i + 3 <= target.length; i++) want.add(gram(target, i));
  if (want.size < 4) return 0;
  const W = Math.ceil(target.length * 1.5);
  const hits = [];
  for (let i = 0; i + 3 <= other.length; i++) { const g = gram(other, i); if (want.has(g)) hits.push([i, g]); }
  const n = new Map();
  let best = 0;
  for (let hi = 0, lo = 0; hi < hits.length; hi++) {
    n.set(hits[hi][1], (n.get(hits[hi][1]) || 0) + 1);
    for (; hits[hi][0] - hits[lo][0] >= W; lo++) { const g = hits[lo][1]; const c = n.get(g) - 1; if (c) n.set(g, c); else n.delete(g); }
    if (n.size > best) best = n.size;
  }
  return best / want.size;
}

/** A class with a verse in it and at least 3 letters holding the sentence: no one original. */
export const recurring = (members, isVerse, isLetter) => {
  const m = [...members];
  return m.some(isVerse) && m.filter(isLetter).length >= 3;
};

/** First hit `first` leads as the original: does another member of the class show in the Best Matches five?
    `hits`: the engine's results as { key, card } (card: the title|opening that makes one card); `same(a, b)`: one
    passage under two keys (Matthew Study and plain Matthew). */
export function reprintShown(hits, members, first, same = (a, b) => a === b) {
  const others = [...members].filter((k) => !same(k, first));
  if (!others.length) return true;
  const cards = new Set();
  let firstCard = null;
  for (const h of hits) {
    if (cards.has(h.card)) { if (h.card === firstCard && others.includes(h.key)) return true; continue; }
    cards.add(h.card);
    if (firstCard === null) { firstCard = h.card; continue; }
    if (others.includes(h.key)) return true;
    if (cards.size === 5) break;
  }
  return false;
}

/** Words a near copy must hold (fewer is a formula: "I am The Lord your God"), and content words among them. */
const NEAR_MIN_WORDS = 8;
const NEAR_MIN_CONTENT = 4;

/** How many of `a`'s words `b` holds in order (longest common subsequence). */
function inOrder(/** @type {string[]} */ a, /** @type {string[]} */ b) {
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Does `text` hold `sentence` with a word or two changed? Looked for where `anchor` (one of the sentence's words,
 * best a rare one) sits in both: 80% of the sentence's words, and 80% of its words not in `stop`, in order within
 * a stretch at most 4 words longer than it.
 * @param {string[]} sentence  normalized words
 * @param {string[]} text  normalized words
 * @param {Set<string>} stop
 * @param {string} anchor
 */
export function nearCopy(sentence, text, stop, anchor) {
  const L = sentence.length;
  const content = sentence.filter((x) => !stop.has(x));
  if (L < NEAR_MIN_WORDS || content.length < NEAR_MIN_CONTENT) return false;
  for (let p = text.indexOf(anchor); p >= 0; p = text.indexOf(anchor, p + 1)) {
    for (let r = sentence.indexOf(anchor); r >= 0; r = sentence.indexOf(anchor, r + 1)) {
      const win = text.slice(Math.max(0, p - r - 2), p - r + L + 2);
      if (inOrder(sentence, win) >= 0.8 * L && inOrder(content, win) >= 0.8 * content.length) return true;
    }
  }
  return false;
}

/* SHORT TITLE (tri bench, PLAN 1.6, fixed before any tri run): a study chapter is "Study — Chapter" on its card, and
   a reader types the chapter's own title. classOf files a study chapter under both, so a title target links it by the
   part after the first " — " ("Without Spot or Blemish" is a v4 letter and a Lamb of God chapter). Other units keep
   their one title. */
/** The titles a unit is filed under: its whole title, and for a study chapter the chapter title alone. */
export function titleForms(/** @type {string} */ title, /** @type {boolean} */ isStudy) {
  const t = String(title || '');
  if (!isStudy) return [t];
  const at = t.indexOf(' — ');
  const short = at >= 0 ? t.slice(at + 3).trim() : '';
  return short ? [t, short] : [t];
}

/** Does a Bible card's range ({chapter, chapterEnd, verseStart, verseEnd}) hold chapter:verse? (cardPasses, same book) */
export function rangeHolds(p, chapter, verse) {
  if (chapter < p.chapter || chapter > (p.chapterEnd || p.chapter)) return false;
  return !p.verseStart || (verse >= p.verseStart && verse <= (p.verseEnd || p.verseStart));
}

/** A merged Bible misquote's target is two adjacent verses of one chapter (verse, verse2): a card holding either passes. */
export const pairHolds = (p, c) => rangeHolds(p, c.chapter, c.verse) || (c.verse2 != null && rangeHolds(p, c.chapter, c.verse2));

/** NEAR QUOTE: does sentence `s` hold verse `v` with a word or two changed, or `v` hold `s` (nearCopy either way, at
    the two rarest content words the pair shares; `rank` orders words rarest first)? Normalized word arrays. */
export function nearQuote(/** @type {string[]} */ s, /** @type {string[]} */ v, /** @type {Set<string>} */ stop, /** @type {(w: string) => number} */ rank) {
  for (const [a, b] of [[v, s], [s, v]]) {
    const anchors = [...new Set(a)].filter((x) => !stop.has(x) && b.includes(x)).sort((x, y) => rank(x) - rank(y) || (x < y ? -1 : 1)).slice(0, 2);
    for (const x of anchors) if (nearCopy(a, b, stop, x)) return true;
  }
  return false;
}

/** NAMED COLLECTION: the names a reader types for each collection (normalized, as corpus.mjs norm). */
const VOL = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
export const COLLECTION_NAMES = {
  ...Object.fromEntries(VOL.map((w, i) => ['v' + (i + 1), ['volume ' + w, 'volume ' + (i + 1), 'vol ' + w, 'vol ' + (i + 1), 'v' + (i + 1)]])),
  timothy: ['letters from timothy'],
  flock: ['little flock', 'lords little flock'],
  rebuke: ['the lords rebuke', 'lords rebuke', 'rebuke'],
  wtlb1: ['words to live by', 'wtlb'],
  wtlb2: ['words to live by', 'wtlb'],
  blessed: ['the blessed'],
  holydays: ['holy days'],
  'bible-studies': ['bible study', 'bible studies', 'study', 'studies'],
  answers: ['answers only god can give', 'answers'],
};

/** Does query `q` name collection `col` where `own` (the target's title and sentence) does not? Both normalized
    with their padding spaces (" a b "). */
export function namesCollection(/** @type {string} */ q, /** @type {string} */ own, /** @type {string} */ col) {
  return (COLLECTION_NAMES[col] || []).some((p) => q.includes(' ' + p + ' ') && !own.includes(' ' + p + ' '));
}

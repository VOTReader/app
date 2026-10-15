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

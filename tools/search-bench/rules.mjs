/* Bench fairness rules (path to ~475, step 1, 2026-10-15): pure, so rules.test.js holds them before any re-run.
   ─────────────────────────────────────────────────────────────────
   CONTAINMENT  a whole-text target's class also takes any text that holds 80% of its word 3-grams in one place:
                a letter that a Words To Live By entry excerpts under another title is that entry's original.
   RECURRING    a sentence the Bible holds and at least 3 letters repeat has no one original (Corbin 10-14: "I am The
                Lord and I do not change ... It's in the bible and all throughout TVOT too"): any text holding it answers.
   REPRINT      when the original leads, its reprint shows too (Corbin 10-14: "both should surface, with WTLB being
                second"): another member of the class is among the Best Matches five (SearchScreen topResults: one card
                per text, so a copy with the same title and opening is the same card and counts as shown).
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

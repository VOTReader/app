/* ═══════════════════════════════════════════════════════════════════════
   search/passage.js — how much of a query one PASSAGE of a text holds
   ═══════════════════════════════════════════════════════════════════════
   A letter or an Answers topic is one search document, up to 23,790 words, so
   a query's words could sit thousands of words apart in it and still count as a
   full match: a remembered sentence put in the reader's own words lost to the
   longest topics (search benchmark 2026-10-05: paraphrase 12 of 75). This
   scores a text by its best WINDOW instead: the share of the query's weight
   (rare words count more) that falls within one stretch the length of the
   query and a half again, a synonym worth half. Words meet by a light lemma
   (cometh/comes/come, saith/says/said, men/man), so KJV and modern wording,
   tense and number do not keep them apart. Pure.
   ═══════════════════════════════════════════════════════════════════════ */

/** Irregular forms and archaic words, to one root each. */
const LEX = {
  saith: 'say', says: 'say', said: 'say', spake: 'speak', spoke: 'speak', spoken: 'speak', unto: 'to', upon: 'on',
  shew: 'show', begat: 'beget', art: 'are', wast: 'was', men: 'man', children: 'child', brethren: 'brother',
  feet: 'foot', went: 'go', gone: 'go', goes: 'go', came: 'come', comes: 'come', gave: 'give', given: 'give',
  took: 'take', taken: 'take', knew: 'know', known: 'know', saw: 'see', seen: 'see', made: 'make', heard: 'hear', an: 'a',
};
const KEEP_EST = /(rest|best|test|west|nest|feast|beast|least|priest|forest|honest|harvest)$/;
/** @type {Map<string, string>} */
const LEMMAS = new Map();

/**
 * A word's light lemma: -eth/-est, -ies, -s, -ing, -ed and a final -e dropped (love, loved, loves,
 * loveth all "lov"); irregular forms by table. Not a stemmer: words only need to MEET.
 * @param {string} t  a token as kjvEncode gives it
 * @returns {string}
 */
export function lemma(t) {
  let l = LEMMAS.get(t);
  if (l) return l;
  l = LEX[t];
  if (!l) {
    l = t;
    if (l.length > 5 && /eth$/.test(l)) l = l.slice(0, -3);
    else if (l.length > 5 && /est$/.test(l) && !KEEP_EST.test(l)) l = l.slice(0, -3);
    if (l.length > 4 && /ies$/.test(l)) l = l.slice(0, -3) + 'y';
    else if (l.length > 4 && /(ss|us|is)$/.test(l)) { /* kept: glass, Jesus, this */ } else if (l.length > 3 && /s$/.test(l)) l = l.slice(0, -1);
    if (l.length > 5 && /ing$/.test(l)) l = l.slice(0, -3);
    else if (l.length > 4 && /ed$/.test(l)) l = l.slice(0, -2);
  }
  // The final -e last, on the table's roots too: come, comes, came and cometh all meet as "com".
  if (l.length > 3 && /e$/.test(l)) l = l.slice(0, -1);
  if (LEMMAS.size > 50000) LEMMAS.clear();
  LEMMAS.set(t, l);
  return l;
}

/**
 * The share (0..1) of a query's weight that the best window of a text holds.
 * @param {Array<{ lem: string, weight: number, syn: Set<string> }>} query  content words, lemmatized,
 *   each with its weight (its rarity) and its synonyms' lemmas
 * @param {string[]} textLemmas  the text's tokens, lemmatized
 * @param {number} span  how far either side of an anchor word the window reaches
 * @param {Set<string>} [held]  query lemmas the text holds in another edition (a KJV word of a verse): in every window
 * @returns {number}
 */
export function bestWindow(query, textLemmas, span, held) {
  const total = query.reduce((a, q) => a + q.weight, 0);
  if (!total || !textLemmas.length) return 0;
  // A window opens on any word of the query (or a synonym): the reader's rarest words may be the
  // very ones the text words otherwise. One pass: the window slides forward from anchor to anchor,
  // counting the words that enter and leave it, so a 20,000-word topic costs one read.
  const anchors = new Set();
  for (const q of query) { anchors.add(q.lem); for (const s of q.syn) anchors.add(s); }
  /** @type {Map<string, number>} */
  const inWin = new Map();
  const has = (/** @type {string} */ w) => (inWin.get(w) || 0) > 0;
  const n = textLemmas.length;
  let lo = 0;
  let hi = 0;
  let best = 0;
  let always = 0;
  if (held) for (const q of query) if (held.has(q.lem)) always += q.weight;
  if (always) best = always;
  for (let p = 0; p < n; p++) {
    if (!anchors.has(textLemmas[p])) continue;
    const nlo = Math.max(0, p - span);
    const nhi = Math.min(n, p + span + 1);
    for (; hi < nhi; hi++) { const w = textLemmas[hi]; if (anchors.has(w)) inWin.set(w, (inWin.get(w) || 0) + 1); }
    for (; lo < nlo; lo++) { const w = textLemmas[lo]; if (anchors.has(w)) inWin.set(w, /** @type {number} */ (inWin.get(w)) - 1); }
    let sum = always;
    for (const q of query) {
      if (always && /** @type {Set<string>} */ (held).has(q.lem)) continue;
      if (has(q.lem)) sum += q.weight;
      else for (const s of q.syn) if (has(s)) { sum += 0.5 * q.weight; break; }
    }
    if (sum > best) { best = sum; if (best >= total) break; }
  }
  return best / total;
}

/* ═══════════════════════════════════════════════════════════════════════
   srch-reprints — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   BEST MATCHES FOLDS A REPRINT UNDER ITS ORIGINAL (search200 UX B10 item 2,
   mockup ux/mockups/2-reprints/PICK.png). "etched My words in stone" gave
   Volume Three's "Abide in the Doctrine" and the Answers topic "Regarding
   Obedience" two of the five places, the same passage word for word, and
   Volume Seven Letter 65 and "Regarding the Churches of Men" two more.

   The engine's results say nothing of which text reprints which (its reprint
   knowledge, the ORIGINALS sentence keys and the cited letter, stays inside
   engine.js), so the screen reads it from what each card shows: two hits of
   different standing whose shown passages are one passage are one card, under
   the original. Standing is REPRINT_TIER, the engine's own ORIGINAL_TIER order:
   a letter or a verse is an original, then an entry (WTLB, Blessed), then a
   Holy Day, a Bible study, an Answers topic. Two originals of one standing never
   fold (two letters, a letter and the verse it quotes), and nor does a title
   hit or a kind the table does not name; two compilations (two Answers topics)
   do, both reprinting one original. Pure.
   ═══════════════════════════════════════════════════════════════════════ */

/** @type {Record<string, number>} */
export const REPRINT_TIER = { verse: 0, letter: 0, wtlb: 1, blessed: 1, 'holy-day': 2, 'bible-study': 3, answers: 4 };
/* From this standing on a text is COMPILED from passages of the volumes (a Holy Day, a study chapter, an
   Answers topic): two of them showing one passage both reprint one original, so they fold though their
   standing is one, the first kept, and only an original (a verse, a letter, an entry) takes a card's place. */
const COMPILED = 2;

/** @param {string} text */
function words(text) {
  return String(text || '').toLowerCase().replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
}

/**
 * One passage: the longest run of words the two share holds most of the shorter one (half,
 * and at least 8 words), and a typed word: a shifted window of one text is still that text,
 * where a shared stock line ("From The Lord, Our God and Savior…") holds no typed word.
 * @param {string} a @param {string} b @param {string[]} terms the typed words
 */
export function samePassage(a, b, terms) {
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return false;
  const need = Math.max(8, Math.ceil(Math.min(x.length, y.length) / 2));
  const typed = (terms || []).map((t) => String(t).toLowerCase()).filter(Boolean);
  const isTyped = (/** @type {string} */ w) => typed.some((t) => w === t || (t.length >= 4 && w.startsWith(t)));
  // longest common run of words (x and y are a snippet each, some 30 words)
  let best = 0;
  let end = 0;
  let prev = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const row = new Array(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] === y[j - 1]) {
        row[j] = prev[j - 1] + 1;
        if (row[j] > best) { best = row[j]; end = i; }
      }
    }
    prev = row;
  }
  return best >= need && x.slice(end - best, end).some(isTyped);
}

/** @param {any} entry */
const tierOf = (entry) => {
  const k = entry && entry.doc && entry.doc.kind;
  return Object.prototype.hasOwnProperty.call(REPRINT_TIER, k) ? REPRINT_TIER[k] : undefined;
};

/**
 * The Best Matches cards, each with the reprints folded under it, in relevance order.
 * @param {any[]} results the engine's results, best first
 * @param {(entry: any) => string} passageOf the passage a hit's card shows ('' when it cannot say)
 * @param {string[]} terms the typed words
 * @param {{ take?: number, reach?: number, skip?: (entry: any, cards: {entry: any, also: any[]}[]) => boolean }} [opts]
 *   take: how many cards; reach: how far down the list a card's reprints are looked for (the
 *   cards themselves fill from the whole list, past a skipped copy);
 *   skip: a hit to leave out (the screen's one-card-per-text rule for a same-standing copy).
 * @returns {{ entry: any, also: any[] }[]}
 */
export function foldReprints(results, passageOf, terms, opts = {}) {
  const take = opts.take || 5;
  const reach = opts.reach || 30;
  const shown = new Map();
  const passage = (/** @type {any} */ e) => { if (!shown.has(e)) shown.set(e, passageOf(e) || ''); return shown.get(e); };
  /** @type {{ entry: any, also: any[] }[]} */
  const cards = [];
  for (let i = 0; i < results.length; i++) {
    if (i >= reach && cards.length >= take) break;
    const r = results[i];
    const t = i >= reach ? undefined : tierOf(r);
    const home = t === undefined ? null : cards.find((c) => {
      const ct = tierOf(c.entry);
      return ct !== undefined && (ct !== t || t >= COMPILED) && samePassage(passage(c.entry), passage(r), terms);
    });
    if (home) {
      if (t < COMPILED && t < /** @type {number} */ (tierOf(home.entry))) { home.also.unshift(home.entry); home.entry = r; }
      else home.also.push(r);
      continue;
    }
    if (cards.length >= take) continue;
    if (opts.skip && opts.skip(r, cards)) continue;
    cards.push({ entry: r, also: [] });
  }
  return cards;
}

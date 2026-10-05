/* ═══════════════════════════════════════════════════════════════════════
   excerpt-landing — which block of a unit a search excerpt belongs to
   ═══════════════════════════════════════════════════════════════════════
   Pure helper shared by LetterView and WtlbEntryView (the two consumers of
   the `{type:'excerpt'}` anchor a search hit produces, use-search.js).

   The engine cuts the excerpt (snippet.js matchExcerpt) as a fixed run of
   characters from the FIRST occurrence that still fits every query term, so
   it can open with the tail of the block BEFORE the one the words sit in:
   "The Passover. For as it is written in The Law, a" for a search of
   "written in The Law". Matching the head alone (40 chars, then 24, then 12)
   landed that excerpt on the block holding "The Passover" — the wrong block,
   and the voice seeked to it (read-along find, 2026-09-22).

   So at every length the HEAD is tried and then the TAIL, longer runs before
   shorter ones: a 24-char tail beats a 12-char head. Both sides are cut in
   the index's whitespace domain (the caller squashes its block texts the
   way the index flattened them). The offset reported is where the matched
   run starts in the block's squashed text — the clause the read-along
   seeks to.

   ONE SENTENCE OF TWO (search benchmark, 2026-10-05). An excerpt that starts
   at the matched word can run on into the NEXT block ("multitudes be divided!
   Behold, they have divided"): neither 40-char end fits one block, and the
   24-char tail landed on the block after the sentence meant. Given the words
   the card marked, such an excerpt is split at its sentence ends and the
   piece holding most of them lands it, before the shorter heads and tails.
   ═══════════════════════════════════════════════════════════════════════ */

/** The lengths tried, longest first — the same ladder the consumers used. */
const LENGTHS = [40, 24, 12];

/** How many of `terms` a piece of text holds (whole words, any case). */
function termsIn(/** @type {string} */ piece, /** @type {string[]} */ terms) {
  const p = ' ' + piece.toLowerCase().replace(/[^a-z0-9']+/g, ' ') + ' ';
  return terms.filter((t) => t && p.indexOf(' ' + String(t).toLowerCase() + ' ') >= 0).length;
}

/**
 * @param {string} excerpt  the anchor's text, already squashed
 * @param {string[]} texts  the unit's block texts, squashed the same way
 *   (a block that cannot be landed on — a heading — is an empty string)
 * @param {string[]} [terms]  the words the result card marked (the anchor's find.terms)
 * @returns {{ index: number, off: number }}  -1 / -1 when nothing holds it
 */
export function excerptLanding(excerpt, texts, terms) {
  const ex = String(excerpt || '');
  for (const len of LENGTHS) {
    if (len === LENGTHS[1] && terms && terms.length) {
      // Neither 40-char end sits in one block: the sentence of the excerpt holding most of the marked words.
      const pieces = ex.split(/(?<=[.!?]["”’)]?)\s+/).filter((x) => x.length >= LENGTHS[2]);
      if (pieces.length > 1) {
        const best = pieces.map((x) => ({ x, n: termsIn(x, terms) })).sort((a, b) => b.n - a.n || b.x.length - a.x.length)[0];
        if (best.n > 0) {
          for (let i = 0; i < texts.length; i++) {
            const off = texts[i] ? texts[i].indexOf(best.x) : -1;
            if (off >= 0) return { index: i, off };
          }
        }
      }
    }
    const head = ex.slice(0, len);
    if (!head) break;
    const tail = ex.length > len ? ex.slice(-len) : '';
    for (const probe of tail ? [head, tail] : [head]) {
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i];
        if (!t) continue;
        const off = t.indexOf(probe);
        if (off >= 0) return { index: i, off };
      }
    }
  }
  return { index: -1, off: -1 };
}

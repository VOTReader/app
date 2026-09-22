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
   ═══════════════════════════════════════════════════════════════════════ */

/** The lengths tried, longest first — the same ladder the consumers used. */
const LENGTHS = [40, 24, 12];

/**
 * @param {string} excerpt  the anchor's text, already squashed
 * @param {string[]} texts  the unit's block texts, squashed the same way
 *   (a block that cannot be landed on — a heading — is an empty string)
 * @returns {{ index: number, off: number }}  -1 / -1 when nothing holds it
 */
export function excerptLanding(excerpt, texts) {
  const ex = String(excerpt || '');
  for (const len of LENGTHS) {
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

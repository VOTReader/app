/* ════════════════════════════════════════════════════════════════════════
   segment-dom-text — THE text domain of a rendered segment run.
   Cluster D (bundle-d) + imported by tools/extract-audio-fragments.mjs.
   ═══════════════════════════════════════════════════════════════════════

   Read-along paints by CHARACTER OFFSET into a block's DOM textContent
   (ReadAlongHighlight's `rangeIn` walks text nodes), while the alignment
   offsets are computed offline from the raw corpus. Those two domains MUST
   be identical, and for months they were not: `Segments` injects a space
   between adjacent segments (the collision guard below) and the extractor
   joined them with '', so every segment boundary shifted the DOM one
   character further from the timing data. 623 of 1,041 Format A blocks
   diverged, up to 13 characters — the highlight visibly lagged into the
   previous clause and resnapped at each new block (owner report 2026-08-12).

   The fix is structural: BOTH sides call in here. `Segments.jsx` renders
   `segmentRenderText`, the extractor measures `segmentsDomText`, and
   segment-dom-text.test.js pins the pair against a real jsdom render, so a
   future renderer change cannot silently re-open the gap. */

/** Segments whose DOM text is not their `v` (see Segments.jsx). */
const RENDERS_NOTHING = 'stanza-break';

/**
 * The collision guard, verbatim from Segments.jsx: inject a leading space
 * when the previous segment ended non-whitespace and this one opens with a
 * word char / bracket / quote. Deliberately NOT applied before trailing
 * punctuation that the fetch script split into its own segment.
 * @param {Array<any>} segments
 * @param {number} i
 * @returns {string}
 */
export function segmentRenderText(segments, i) {
  const seg = segments[i];
  if (!seg) return '';
  const prevV = i > 0 ? (segments[i - 1] && segments[i - 1].v) || '' : '';
  return seg.v && /^[\w([{"“‘]/.test(seg.v) && /\S$/.test(prevV)
    ? ' ' + seg.v
    : seg.v || '';
}

/**
 * The exact `textContent` a rendered run of segments produces — the domain
 * every read-along character offset lives in.
 *
 * Mirrors Segments.jsx's branches: `fn` prints its number, `letter-link`
 * prints its LABEL (not `v`), `stanza-break` prints nothing, and every text
 * flavour goes through the collision guard and then renderTextWithScripRefs,
 * which unwraps `{{ref:Book 1:1}}` to the bare reference.
 * @param {Array<any>} segments
 * @returns {string}
 */
export function segmentsDomText(segments) {
  if (!segments || !segments.length) return '';
  let out = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg || seg.t === RENDERS_NOTHING) continue;
    if (seg.t === 'fn') { out += String(seg.v == null ? '' : seg.v); continue; }
    if (seg.t === 'letter-link') { out += String(seg.label == null ? '' : seg.label); continue; }
    out += String(segmentRenderText(segments, i))
      .replace(/\{\{ref:([^}]+)\}\}/g, (_m, ref) => ref.trim());
  }
  return out;
}

/**
 * The text a READER reads in a run of segments: the rendered text above
 * WITHOUT the footnote markers, which are superscript numbers, not words.
 *
 * This is the search index's text domain (search/index-builder.js): it is what
 * a result's snippet shows, and LetterView lands a search excerpt on it, so
 * both call in here. When the index pushed every segment's `v` instead, a
 * footnote's number sat in the body text ("…know them. 2 And was I…") and a
 * letter-link's label was missing. Dropping a footnote cannot glue its
 * neighbours: the collision guard runs over the run without it. A stanza
 * break reads as a space (the DOM draws it as a line break, which the flat
 * text has no other way to keep).
 * @param {Array<any>} segments
 * @returns {string}
 */
export function segmentsReadText(segments) {
  if (!segments || !segments.length) return '';
  const run = segments.filter((seg) => seg && seg.t !== 'fn');
  let out = '';
  for (let i = 0; i < run.length; i++) {
    const seg = run[i];
    if (seg.t === RENDERS_NOTHING) { out += ' '; continue; }
    if (seg.t === 'letter-link') { out += String(seg.label == null ? '' : seg.label); continue; }
    out += String(segmentRenderText(run, i))
      .replace(/\{\{ref:([^}]+)\}\}/g, (_m, ref) => ref.trim());
  }
  return out;
}

/**
 * A letter block's reading text: its prose segments, or its poetry lines (one
 * run per line, joined by a space). Any other block (a heading, an image)
 * reads as ''.
 * @param {any} block
 * @returns {string}
 */
export function blockReadText(block) {
  if (!block) return '';
  if (block.segments) return segmentsReadText(block.segments);
  if (block.lines) return block.lines.map((ln) => (Array.isArray(ln) ? segmentsReadText(ln) : '')).join(' ');
  return '';
}

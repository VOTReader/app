/* closing-breaks — where a closing ("Says The Lord.") ends a section and what follows starts a new one
   (mw-close, Corbin 2026-10-24: "format the says the lord breaks nicely so they don't collide with the
   following text"). closingMid: a letter's closing block with more of the letter after it.
   endsOnClosing: a Format B paragraph (Answers) whose last line is such a closing.

   addendumHeadLines: a dated addendum header set inside a letter. A letter that carries a later word after its closing ("Says The Lord.") stores that word's
   header as an ordinary paragraph whose line breaks were lost in the import:
     [italic "10/7/04"] [bold-italic "From The Lord, Our God and Savior"]
     [italic "The Word of The Lord Spoken to Timothy For Timothy and His Wife, ... Addendum to “Christmas”"]
   (V1 L3 Christmas, V4 Obey God). The published page breaks it like a letter's own header:
   date / From ... / The Word of The Lord Spoken to Timothy / For ... / Addendum to ....

   addendumHeadLines(segments) returns those lines, or null when the paragraph is not such a header.
   Each line is a list of { t, text } pieces whose texts, joined across all lines, are EXACTLY the
   paragraph's rendered text (segmentRenderText, the space it adds between "10/7/04" and "From"
   included): highlights, notes, excerpts and the read-along key on offsets into that text, so the
   header changes only line breaks and styling, never a character. */

import { segmentRenderText } from './segment-dom-text.js';

const DATE = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/;
const PLAIN = new Set(['italic', 'bold-italic', 'text']);
// Where a run of header text starts a new published line. "For" only right after "Spoken to
// Timothy": "For Timothy and His Wife, and For All Those ..." stays one line.
const BREAK = /(?<=Spoken to Timothy,? )(?=For )|(?<=\S )(?=Addendum to )|(?<=\S )(?=The Word of The Lord Spoken)/;

/** The line kinds, in the letter header's own order (LetterView's .letter-meta). */
function kindOf(text, index) {
  if (index === 0) return 'date';
  const s = text.trim();
  if (/^From /.test(s)) return 'from';
  if (/^The Word of The Lord Spoken/.test(s)) return 'spoken';
  if (/^Addendum to /.test(s)) return 'addendum';
  return 'for';
}

/**
 * @param {any[]} segments a para block's segments
 * @returns {{ kind: string, pieces: { t: string, text: string }[] }[] | null}
 */
export function addendumHeadLines(segments) {
  if (!Array.isArray(segments) || segments.length < 2) return null;
  if (!segments.every((s) => s && PLAIN.has(s.t) && typeof s.v === 'string')) return null;
  if (!DATE.test(segments[0].v) || !/^\s*From /.test(segments[1].v)) return null;
  /** @type {{ t: string, text: string }[][]} */
  const lines = [];
  segments.forEach((seg, i) => {
    const text = segmentRenderText(segments, i);
    const parts = i < 2 ? [text] : text.split(BREAK);
    parts.forEach((part, pi) => {
      // Every segment from the date's on starts a line; the third's splits each start one more.
      if (i <= 2 || pi > 0) lines.push([]);
      lines[lines.length - 1].push({ t: seg.t, text: part });
    });
  });
  return lines.map((pieces, li) => ({ kind: kindOf(pieces.map((p) => p.text).join(''), li), pieces }));
}

/**
 * Whether the closing at `bi` ("Says The Lord.", or its footnote line) has more of the letter
 * after it, so it needs clear space before the next section. A closing followed by its own
 * footnote line (closing-fn) leaves the space to that line.
 * @param {any[]} blocks
 * @param {number} bi
 * @returns {boolean}
 */
export function closingMid(blocks, bi) {
  const next = blocks[bi + 1];
  return !!next && next.type !== 'closing-fn';
}

// "Says The Lord.", "Says The Lord God.", "Says The Lord YahuShua." as a line of its own; a line
// that runs on ("Says The Lord whose dominion is everlasting", "Says The Lord God, and I shall ...")
// is the passage still speaking.
const CLOSING_LINE = /^Says The Lord(?: [A-Z][\w’']*){0,3}[.!]$/;

/**
 * Whether a Format B paragraph's last line is a closing ("_Says The Lord._", Answers' markup,
 * quotes and scripture refs stripped): the passage's word ends there.
 * @param {string} raw
 * @returns {boolean}
 */
export function endsOnClosing(raw) {
  const lines = String(raw || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const last = (lines[lines.length - 1] || '').replace(/\{\{ref:[^}]*\}\}/g, '').replace(/[_*"“”]/g, '').trim();
  return CLOSING_LINE.test(last);
}

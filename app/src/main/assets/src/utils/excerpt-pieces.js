/* ═══════════════════════════════════════════════════════════════════════
   excerpt-pieces — the link excerpt picker's text, in the READER's domain.
   Cluster D (bundle-d), imported by ui/sheets/LetterExcerptPickerScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   An excerpt link stores character offsets into one block of the reader
   (`letter:<id>:<block>:<start>-<end>`), and dom-links.js paints the link's
   chain icon by counting those characters through the reader's own DOM. The
   picker measures them in ITS render, so each of its blocks has to hold the
   reader's exact textContent. It did not. It joined a block's segments with ''
   (the reader's collision guard puts a space in "Lord: Many"), read a
   letter-link by `v` (the reader shows its `label`), left {{ref:…}} raw (the
   reader shows the bare reference), dropped footnote numbers (the reader shows
   them), and kept a poetry line break as "\n" (the reader draws each line as
   its own <div>, which adds no character). For WTLB-style paragraphs it kept
   every soft break and read a reference as its bare text (the reader shows
   "(Ref)" or a footnote number). Each of those slid the icon off the words
   that were picked.

   Each block is now a list of pieces taken from the reader's own text modules,
   segment-dom-text.js (Format A) and format-b-dom-text.js (Format B), both
   pinned against real renders. The pieces' texts concatenate to the reader's
   textContent. A footnote number is its own piece, so the quote can leave it
   out as the reader's selection toolbar does, and a seam marks a line break
   that adds no character. */

import { segmentsDomPieces } from './segment-dom-text.js';
import { formatBDomPieces, formatBRefScan } from './format-b-dom-text.js';

/** @typedef {{text: string, fn?: boolean, seam?: boolean}} Piece */

const SEAM = { text: '', seam: true };

/* The collections whose entry route renders Format B in footnotesMode:
   screen-routes.jsx passes footnotesMode={true} to the Holy Days and Answers
   entry routes, while WTLB and The Blessed show each reference as a "(Ref)"
   cite. */
const FOOTNOTE_MODE_VOLKEYS = new Set(['holydays', 'answers']);

/**
 * Whether the reader renders this collection's Format B references as
 * footnote numbers.
 * @param {string | null | undefined} volKey
 * @returns {boolean}
 */
export function formatBFootnotesMode(volKey) {
  return FOOTNOTE_MODE_VOLKEYS.has(String(volKey || ''));
}

/**
 * A letter block's pieces, following LetterView's own block branches. Only the
 * blocks LetterView marks [data-hl-dom] carry any; a heading, an image or a
 * prophecy group has none.
 * @param {any} block
 * @returns {Piece[]}
 */
export function letterBlockPieces(block) {
  if (!block) return [];
  switch (block.type) {
    case 'para':
    case 'intro':
    case 'closing-fn':
      return segmentsDomPieces(block.segments || []);
    case 'poetry': {
      // One <div class="poetry-line"> per line, so the lines abut in
      // textContent. A segments-only poem draws each segment as its own line,
      // its leading "\n" stripped.
      const lines = block.lines
        ? block.lines.map((ln) => segmentsDomPieces(Array.isArray(ln) ? ln : []))
        : (block.segments || []).map((seg) => segmentsDomPieces([{ ...seg, v: String((seg && seg.v) || '').replace(/^\n/, '') }]));
      /** @type {Piece[]} */
      const out = [];
      lines.forEach((ln, i) => { if (i) out.push(SEAM); out.push(...ln); });
      return out;
    }
    case 'closing':
      return block.text ? [{ text: String(block.text) }] : [];
    default:
      return [];
  }
}

/**
 * The text the reader's DOM holds for these pieces: the offset domain.
 * @param {Piece[]} pieces
 * @returns {string}
 */
export function piecesDomText(pieces) {
  return pieces.map((p) => p.text).join('');
}

/**
 * The words a reader reads: no footnote numbers, a line break read as a space.
 * @param {Piece[]} pieces
 * @returns {string}
 */
export function piecesReadText(pieces) {
  return pieces.map((p) => (p.seam ? ' ' : p.fn ? '' : p.text)).join('');
}

/**
 * The excerpt's quote for [start, end) in the offset domain: its words
 * without their footnote numbers (the reader's selection toolbar drops its
 * .fn-ref bubbles the same way), a line break kept as "\n".
 * @param {Piece[]} pieces
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
export function piecesQuote(pieces, start, end) {
  let at = 0;
  let out = '';
  for (const p of pieces) {
    const s = at;
    at += p.text.length;
    if (p.seam) { if (s > start && s < end) out += '\n'; continue; }
    if (p.fn || at <= start || s >= end) continue;
    out += p.text.slice(Math.max(0, start - s), Math.min(p.text.length, end - s));
  }
  // A dropped number can leave its two neighbours' spaces side by side.
  return out.replace(/[ \t]{2,}/g, ' ');
}

/**
 * Every pickable block of an entry. `key` is the block's index, the one the
 * reader's hl-key ends in (LetterView's letterHlKey, WtlbEntryView's
 * wtlbHlKey); a block with nothing to read is left out.
 * @param {any} entry  a letter or study chapter (blocks) or a Format B entry (paragraphs)
 * @param {boolean} [footnotesMode]  how the entry's route renders its references
 * @returns {Array<{key: string, pieces: Piece[], readText: string}>}
 */
export function excerptBlocks(entry, footnotesMode) {
  if (!entry) return [];
  /** @type {Array<{key: string, pieces: Piece[]}>} */
  let list = [];
  if (entry.paragraphs) {
    const scan = formatBRefScan(entry.paragraphs, footnotesMode);
    list = entry.paragraphs.map((p, i) => ({
      key: String(i),
      pieces: formatBDomPieces((p && p.text) || '', { refs: scan.perParagraph[i], footnotesMode: !!footnotesMode }),
    }));
  } else if (entry.blocks) {
    list = entry.blocks.map((b, i) => ({ key: String(i), pieces: letterBlockPieces(b) }));
  }
  return list
    .map((b) => ({ ...b, readText: piecesReadText(b.pieces) }))
    .filter((b) => b.readText.trim().length > 0);
}

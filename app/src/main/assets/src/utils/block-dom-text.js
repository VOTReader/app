/* block-dom-text — a letter block's DOM text, the domain its AUDIO_SYNC offsets live in (Cluster D).
   Its own file, not segment-dom-text.js: that one is fingerprinted by the search index's version guard
   (tools: MS_INDEX_VERSION), and this helper shapes no index. */

import { segmentsDomPieces } from './segment-dom-text.js';

/**
 * A letter block's rendered pieces, in order: what LetterView draws inside the block's [data-hl-key]
 * container, a footnote marker its own piece (`fn: true`). The same branches as
 * tools/audio-fragments-lib.mjs blockDomainText (the extractor the offsets come from). Null when the
 * block renders no highlightable container (a heading, an image).
 * @param {any} block
 * @returns {Array<{ text: string, fn?: boolean }> | null}
 */
export function blockDomPieces(block) {
  if (!block) return null;
  if (block.type === 'para' || block.type === 'intro' || block.type === 'closing-fn') return segmentsDomPieces(block.segments);
  if (block.type === 'poetry') {
    if (block.lines) return block.lines.flatMap((line) => segmentsDomPieces(line));
    return (block.segments || []).flatMap((seg) => segmentsDomPieces([{ ...seg, v: String(seg.v || '').replace(/^\n/, '') }]));
  }
  if (block.type === 'closing') return [{ text: String(block.text || '') }];
  return null;
}

/**
 * A letter block's DOM text, the domain its AUDIO_SYNC character offsets live in. Pinned against the
 * extractor on every corpus block by tools/block-dom-text.test.js.
 * @param {any} block
 * @returns {string | null}
 */
export function blockDomText(block) {
  const pieces = blockDomPieces(block);
  return pieces ? pieces.map((p) => p.text).join('') : null;
}

/**
 * The words a listener hears in [cs, ce) of a block's DOM text, without the footnote markers (superscript
 * numbers, not words): Now Playing's live text. cs < 0 is the whole block (a Format-B row). '' when the
 * span falls past the block's text (a stale row shows nothing, as the page paints nothing).
 * @param {any} block
 * @param {number} cs
 * @param {number} ce
 * @returns {string}
 */
export function blockSpanText(block, cs, ce) {
  const pieces = blockDomPieces(block);
  if (!pieces) return '';
  const total = pieces.reduce((n, p) => n + p.text.length, 0);
  const from = cs < 0 ? 0 : cs;
  const to = cs < 0 ? total : ce;
  if (to > total || from >= to) return '';
  let at = 0, out = '';
  for (const p of pieces) {
    const end = at + p.text.length;
    if (!p.fn && end > from && at < to) out += p.text.slice(Math.max(0, from - at), Math.min(p.text.length, to - at));
    at = end;
  }
  return out.replace(/\s+/g, ' ').trim();
}

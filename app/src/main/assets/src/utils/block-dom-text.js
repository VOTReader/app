/* block-dom-text — a letter block's DOM text, the domain its AUDIO_SYNC offsets live in (Cluster D).
   Its own file, not segment-dom-text.js: that one is fingerprinted by the search index's version guard
   (tools: MS_INDEX_VERSION), and this helper shapes no index. */

import { segmentsDomText } from './segment-dom-text.js';

/**
 * A letter block's DOM text, the domain its AUDIO_SYNC character offsets live in:
 * what LetterView renders inside the block's [data-hl-key] container. The same
 * branches as tools/audio-fragments-lib.mjs blockDomainText (the extractor the
 * offsets come from), pinned against it by segment-dom-text.test.js. Now Playing
 * cuts the clause under the clock out of it without a reading screen mounted.
 * Null when the block renders no highlightable container (a heading, an image).
 * @param {any} block
 * @returns {string | null}
 */
export function blockDomText(block) {
  if (!block) return null;
  if (block.type === 'para' || block.type === 'intro' || block.type === 'closing-fn') return segmentsDomText(block.segments);
  if (block.type === 'poetry') {
    if (block.lines) return block.lines.map((line) => segmentsDomText(line)).join('');
    return (block.segments || []).map((seg) => segmentsDomText([{ ...seg, v: String(seg.v || '').replace(/^\n/, '') }])).join('');
  }
  if (block.type === 'closing') return String(block.text || '');
  return null;
}

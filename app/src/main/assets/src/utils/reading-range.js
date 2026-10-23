// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   reading-range — the reading text a selection covers (rs1, 2026-10-22)
   ═══════════════════════════════════════════════════════════════════════
   Bundled into bundle-d: SelectionToolbar, utils/passage-copy.js and
   utils/listen-from.js read a selection through it.

   A reading block is an element with a data-hl-key: a verse, a letter's
   paragraph, a study note. A selection also takes in what sits around the
   blocks: a verse's number, which BibleChapterView and ChapterView put in the
   gutter BESIDE the verse's block, not in it; the space after a verse; a
   heading. Corbin, 2026-10-22: "if I highlight a verse denoter number, the
   listen from here and repeat features disappear from the popup menu
   completely, meaning I can't highlight across multiple verses because the
   numbers get lumped in." A selection that started on a number started
   outside every block, so the toolbar found no block to listen from. Each end
   of a selection is now read as the reading text it reaches:
   - an end outside the blocks moves to the near edge of the first or last
     block the selection covers: a start on verse 16's number starts at its
     first word, an end on 17's number ends after 16;
   - a block the selection only touches (an end at its very edge, where a
     triple-click leaves one) is not covered;
   - a selection of one verse number alone (a long-press on "16") is its verse.
   Nothing here changes the live selection: the callers act on the range this
   returns.
   ═══════════════════════════════════════════════════════════════════════ */

import { ANNOTATION_CHROME } from '../renderer/anchor-view.js';

/** The swipe previews: inert clones of the neighbour pages (ScreenLayout). */
export const OFF_PAGE = '[inert], .pager-peek';
/** A verse number: the Bible reader's gutter number and a sheet's gold superscript. */
export const VERSE_NUMBER = '.verse-num, .verse-sup';
/** The gutter number beside a verse's block (BibleChapterView, ChapterView). */
const GUTTER_NUMBER = '.verse-num';

/** The reading blocks ([data-hl-key]) the range reaches, in document order —
    never an annotation icon (which carries its block's key too) and never a
    block of a swipe preview.
    @param {Range} range @returns {Element[]} */
export function readingBlocksIn(range) {
  const node = range.commonAncestorContainer;
  const root = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement;
  if (!root) return [];
  let inside = root.closest('[data-hl-key]');
  if (inside) {
    let up;
    while (inside.parentElement && (up = inside.parentElement.closest('[data-hl-key]'))) inside = up;
    return inside.closest(OFF_PAGE) ? [] : [inside];
  }
  return Array.from(root.querySelectorAll('[data-hl-key]')).filter((el) =>
    range.intersectsNode(el)
    && !el.matches(ANNOTATION_CHROME)
    && !(el.parentElement && el.parentElement.closest('[data-hl-key]'))
    && !el.closest(OFF_PAGE));
}

/** The part of `range` inside `el`, or null when none of `el` is in it.
    @param {Range} range @param {Node} el @returns {Range | null} */
export function clipTo(range, el) {
  const r = /** @type {Document} */ (el.ownerDocument || document).createRange();
  r.selectNodeContents(el);
  if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) r.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset);
  return r.collapsed ? null : r;
}

/** Does `range` take in any of `el`'s characters?
    @param {Range} range @param {Element} el */
function covers(range, el) {
  const c = clipTo(range, el);
  return !!c && c.toString().length > 0;
}

/** The verse block a gutter number names: the keyed block after it in its verse.
    @param {Element} num @returns {Element | null} */
function verseOfNumber(num) {
  for (let sib = num.nextElementSibling; sib; sib = sib.nextElementSibling) {
    if (sib.matches('[data-hl-key]')) return sib;
  }
  return null;
}

/** The one verse a range of gutter-number text alone names, or null.
    @param {Range} range @returns {Element | null} */
function verseOfLoneNumber(range) {
  const node = range.commonAncestorContainer;
  const root = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement;
  if (!root) return null;
  const own = root.closest(GUTTER_NUMBER);
  const nums = own ? [own] : Array.from(root.querySelectorAll(GUTTER_NUMBER))
    .filter((el) => { const c = clipTo(range, el); return !!c && c.toString().trim() !== ''; });
  if (nums.length !== 1) return null;
  const block = verseOfNumber(nums[0]);
  return block && !block.closest(OFF_PAGE) ? block : null;
}

/**
 * The reading text `range` covers: the range with an end outside the blocks
 * moved to the near edge of the first or last block it covers, and those
 * blocks in order (see the header). Null when it covers no reading text.
 * @param {Range | null | undefined} range
 * @returns {{ range: Range, blocks: Element[] } | null}
 */
export function readingRange(range) {
  if (!range || range.collapsed) return null;
  const blocks = readingBlocksIn(range).filter((el) => covers(range, el));
  if (blocks.length) {
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    const r = range.cloneRange();
    if (!first.contains(range.startContainer)) r.setStart(first, 0);
    if (!last.contains(range.endContainer)) r.setEnd(last, last.childNodes.length);
    return { range: r, blocks };
  }
  const verse = verseOfLoneNumber(range);
  if (!verse) return null;
  const r = /** @type {Document} */ (verse.ownerDocument).createRange();
  r.selectNodeContents(verse);
  return { range: r, blocks: [verse] };
}

/* ═══════════════════════════════════════════════════════════════════════
   anchor-view — a container's text as the reader selected it (v05-02)
   ═══════════════════════════════════════════════════════════════════════
   An annotation's `text` is recorded by SelectionToolbar's hlDisplayText:
   footnote digits and icon glyphs (the chrome below) left out, and a line
   break wherever the selection crosses from one DIV / P block into another.
   Its offsets are in container.textContent coordinates, chrome included.
   To re-find that text in a container, applyDOMHighlights needs the
   container's text in the SAME form, plus a map from each character of it
   back to a textContent offset. Pure DOM reading; no state.
   ═══════════════════════════════════════════════════════════════════════ */

/** Decoration inside reading text that is not reading text: footnote marker
    digits and the note / link / bookmark icon glyphs. One list for the
    recorder (SelectionToolbar) and the re-finder (applyDOMHighlights). */
export const ANNOTATION_CHROME = '.fn-ref, .hl-note-icon, .verse-link-icon, .inline-bookmark-icon, .inline-link-icon';

/**
 * @param {Node} n
 * @param {Element} container
 * @returns {boolean}
 */
export function isAnnotationChrome(n, container) {
  var el = n.parentElement;
  while (el && el !== container) {
    if (el.matches && el.matches(ANNOTATION_CHROME)) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * The container's text in hlDisplayText's form. `at[i]` is the textContent
 * offset of view character i; an inserted line break takes the offset of the
 * character after it.
 * @param {Element} container
 * @returns {{ text: string, at: number[] }}
 */
export function chromeAwareView(container) {
  var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  var parts = [], at = [], off = 0, prevBlock = /** @type {HTMLElement | null} */ (null);
  while (walker.nextNode()) {
    var n = walker.currentNode;
    var t = n.textContent || '';
    if (!isAnnotationChrome(n, container)) {
      var block = n.parentElement;
      while (block && block !== container && block.tagName !== 'DIV' && block.tagName !== 'P') block = block.parentElement;
      if (prevBlock && block !== prevBlock) { parts.push('\n'); at.push(off); }
      prevBlock = block;
      parts.push(t);
      for (var k = 0; k < t.length; k++) at.push(off + k);
    }
    off += t.length;
  }
  return { text: parts.join(''), at: at };
}

/**
 * The first view index whose textContent offset is at or past `tcOffset`
 * (at.length when none is).
 * @param {number[]} at
 * @param {number} tcOffset
 * @returns {number}
 */
export function viewIndexOf(at, tcOffset) {
  var lo = 0, hi = at.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (at[mid] < tcOffset) lo = mid + 1; else hi = mid;
  }
  return lo;
}

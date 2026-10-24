/* ═══════════════════════════════════════════════════════════════════════
   icon-placement — where an inline link or bookmark icon goes (s06.2)
   ═══════════════════════════════════════════════════════════════════════
   dom-links.js and dom-bookmarks.js each carried a copy of this walk, line for line, apart from the skip list (the
   bookmark one also slides past link and bookmark icons). One copy now; each caller passes its own skip list.

   insertIconAt(container, endPos, skipRx, icon) puts `icon` at character `endPos` of the container's text, then:
   - slides forward through the rest of the word and its closing punctuation, so the icon brackets the phrase and
     never splits a word, crossing text-node boundaries inside inline emphasis (<em>, <strong>, spans) but not a
     block (an Android selection handle often drops at the boundary before an <em>);
   - never lands inside, or directly before, a "skip" element (a footnote bubble, a reference, another icon): it
     jumps over the element as a unit;
   - falls back to the container's end when endPos is past the text.
   ═══════════════════════════════════════════════════════════════════════ */

var WORD = /[\w’'-]/;
var CLOSE_PUNCT = /[.,;:!?)\]}"'…—]/;
// Block-level tags that break the reading flow: the slide stops at one.
var BLOCK_TAGS = /^(BR|P|DIV|H[1-6]|LI|BLOCKQUOTE|HR|UL|OL|TR|TD|TH|TABLE|SECTION|ARTICLE|HEADER|FOOTER|NAV|MAIN|FIGURE|FIGCAPTION|PRE|ADDRESS)$/;

/** The skip list both icons share: footnote bubbles, tap-through references, verse-link and note icons. */
export var ICON_SKIP_RX = /\b(fn-ref|tap-ref|letter-link-ref|verse-link-icon|hl-note-icon)\b/;
/** A bookmark icon also slides past the link and bookmark icons already placed. */
export var BOOKMARK_SKIP_RX = /\b(fn-ref|tap-ref|letter-link-ref|verse-link-icon|hl-note-icon|inline-link-icon|inline-bookmark-icon)\b/;

/**
 * @param {Element} container
 * @param {number} endPos character offset in the container's text
 * @param {RegExp} skipRx class names the icon must not land inside or directly before
 * @param {Element} icon
 */
export function insertIconAt(container, endPos, skipRx, icon) {
  function isSkip(/** @type {any} */ el) {
    return el && el.nodeType === 1 && el.className && skipRx.test(el.className);
  }
  function isPhraseChar(/** @type {string} */ c) { return !!c && (WORD.test(c) || CLOSE_PUNCT.test(c)); }
  function place(/** @type {Node | null} */ before) {
    if (before && before.parentNode) before.parentNode.insertBefore(icon, before);
    else container.appendChild(icon);
  }

  /* From `node`, walk forward to the first position that is not directly before a skip element (jumped as a
     unit), climbing to the parent when a node has no next sibling: `<span>…written.</span><span class="fn-ref">`
     has the fn-ref beside the text's wrapper, not the text. Null: append to the container. */
  function nextInsertionPoint(/** @type {Node} */ node) {
    /** @type {Node | null} */
    var cur = node;
    while (cur && cur !== container) {
      var sib = cur.nextSibling;
      if (sib === null) { cur = cur.parentElement; continue; }
      if (isSkip(sib)) { cur = sib; continue; }
      return sib;
    }
    return null;
  }

  var textNodes = /** @type {Text[]} */ ([]);
  var w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  while (w.nextNode()) textNodes.push(/** @type {Text} */ (w.currentNode));

  // The text node and local offset of endPos.
  var charPos = 0, nodeIdx = -1, localOffset = 0;
  for (var i = 0; i < textNodes.length; i++) {
    var nodeEnd = charPos + textNodes[i].length;
    if (endPos > charPos && endPos <= nodeEnd) {
      nodeIdx = i;
      localOffset = endPos - charPos;
      break;
    }
    charPos = nodeEnd;
  }
  if (nodeIdx < 0) { container.appendChild(icon); return; }

  // endPos inside a skip element (a footnote bubble's "1", a letter-link's label): slide past the whole element.
  var ancestor = textNodes[nodeIdx].parentElement;
  var skipAncestor = null;
  while (ancestor && ancestor !== container) {
    if (isSkip(ancestor)) skipAncestor = ancestor;
    ancestor = ancestor.parentElement;
  }
  if (skipAncestor) { place(nextInsertionPoint(skipAncestor)); return; }

  function hasBlockBetween(/** @type {Node} */ prev, /** @type {Node} */ next) {
    var bw = document.createTreeWalker(container, NodeFilter.SHOW_ALL, null);
    bw.currentNode = prev;
    var n;
    while ((n = bw.nextNode())) {
      if (n === next) return false;
      if (n.nodeType === 1 && BLOCK_TAGS.test(/** @type {Element} */ (n).tagName)) return true;
    }
    return true;
  }

  // Slide forward through phrase characters, into the next text node while no block lies between them; the text
  // inside skip elements is passed over.
  while (true) {
    var text = textNodes[nodeIdx].nodeValue || '';
    while (localOffset < text.length && isPhraseChar(text[localOffset])) localOffset++;
    if (localOffset < text.length) break;          // stopped at whitespace mid-node
    var nextNodeIdx = nodeIdx + 1;
    while (nextNodeIdx < textNodes.length) {
      var na = textNodes[nextNodeIdx].parentElement;
      var inSkip = false;
      while (na && na !== container) {
        if (isSkip(na)) { inSkip = true; break; }
        na = na.parentElement;
      }
      if (!inSkip) break;
      nextNodeIdx++;
    }
    if (nextNodeIdx >= textNodes.length) break;
    if (hasBlockBetween(textNodes[nodeIdx], textNodes[nextNodeIdx])) break;
    nodeIdx = nextNodeIdx;
    localOffset = 0;
  }

  var finalNode = textNodes[nodeIdx];
  var finalLen = (finalNode.nodeValue || '').length;
  if (localOffset >= finalLen) place(nextInsertionPoint(finalNode));
  else if (localOffset === 0) place(finalNode);
  else place(finalNode.splitText(localOffset));
}

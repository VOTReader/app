/* ═══════════════════════════════════════════════════════════════
   DOM BOOKMARK ICONS — inline flag icon injection for [data-hl-dom] containers
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html; no import/export.
   Depends on: BookmarkStore (defined in src/stores/bookmark-store.js).

   applyDOMBookmarks() is called from the post-render useEffect in
   useDomAnnotationSync on any annotation-store change (same effect that
   calls applyDOMLinks).
   It:
     1. Removes any existing .inline-bookmark-icon elements
     2. Finds all bookmarks that touch each [data-hl-dom] container
     3. Inserts a small flag icon at the bookmarked text range endpoint

   Icon placement reuses the same slide-off rules as applyDOMLinks:
     1. Mid-word → slide forward to word boundary
     2. Closing punctuation → slide past (., ; : ! ? etc.)
     3. Adjacent skip elements (fn-ref, tap-ref, letter-link-ref,
        note-icon, verse-link-icon, inline-link-icon) → jump past

   Multiple bookmarks ending at the same offset merge into one icon
   with a count badge.

   CSS: .inline-bookmark-icon is defined in the main index.html CSS block.
   Tap opens the bookmark popover via window.__openBookmarkPopover(ids, x, y).
═══════════════════════════════════════════════════════════════ */

/* Window (ms) during which a freshly-created bookmark gets the .just-created
   class so its icon plays the creation-pulse animation. Re-renders of the
   same icon (after the window expires) drop the class. */
var BOOKMARK_PULSE_WINDOW_MS = 3000;

export function applyDOMBookmarks() {
  var nowMs = Date.now();
  document.querySelectorAll('[data-hl-key][data-hl-dom]').forEach(function(container) {
    var hlKey = container.getAttribute('data-hl-key');
    container.querySelectorAll('.inline-bookmark-icon').forEach(function(el) { el.remove(); });
    container.normalize();

    var bookmarks = BookmarkStore.getForKeyPrefix(hlKey);
    if (!bookmarks.length) return;

    // Build a quick lookup: bkm.id → bkm so we can check `.created` per icon.
    var bkmById = {};
    bookmarks.forEach(function(b) { bkmById[b.id] = b; });

    // Collect end positions, merging duplicates so multiple bookmarks at
    // the same offset share one icon.  We track the list of bookmark ids at
    // each position so the tap handler can surface all of them.
    var keyPrefix = hlKey + ':';
    var byEndPos = {}; // endPos → [bkmId, ...]
    bookmarks.forEach(function(bkm) {
      if (!bkm.hlKey) return;
      var k = bkm.hlKey;
      if (k !== hlKey && k.indexOf(keyPrefix) !== 0) return;

      var endPos = null;
      var m = k.match(/:(\d+)-(\d+)$/);
      if (m) {
        endPos = parseInt(m[2], 10);
      }
      // Bookmarks without a ":start-end" suffix land at end-of-block
      if (endPos == null) {
        if (!byEndPos[-1]) byEndPos[-1] = [];
        byEndPos[-1].push(bkm.id);
        return;
      }
      if (!byEndPos[endPos]) byEndPos[endPos] = [];
      byEndPos[endPos].push(bkm.id);
    });

    // Helper: does this group include any bookmark created within the
    // pulse window? Drives the .just-created class on the rendered icon.
    function anyJustCreated(bkmIds) {
      return bkmIds.some(function(id) {
        var b = bkmById[id];
        return b && b.created && (nowMs - b.created) < BOOKMARK_PULSE_WINDOW_MS;
      });
    }

    // End-of-block fallback (no ":start-end" in key)
    if (byEndPos[-1] && byEndPos[-1].length > 0) {
      var endBlockIcon = _buildBookmarkIcon(hlKey, byEndPos[-1]);
      if (anyJustCreated(byEndPos[-1])) endBlockIcon.classList.add('just-created');
      container.appendChild(endBlockIcon);
      delete byEndPos[-1];
    }

    if (Object.keys(byEndPos).length === 0) return;

    // Process highest position first so earlier insertions don't shift offsets.
    var positions = Object.keys(byEndPos).map(Number).sort(function(a, b) { return b - a; });
    positions.forEach(function(endPos) {
      _insertBookmarkIconAt(container, hlKey, endPos, byEndPos[endPos], anyJustCreated(byEndPos[endPos]));
    });
  });
}

/* Build the inline bookmark flag icon element.
   bkmIds is an array of bookmark IDs at this position. */
function _buildBookmarkIcon(hlKey, bkmIds) {
  var icon = document.createElement('span');
  icon.className = 'inline-bookmark-icon';
  if (bkmIds && bkmIds.length > 1) icon.className += ' inline-bookmark-icon-multi';
  icon.setAttribute('data-bkm-ids', (bkmIds || []).join(','));
  icon.setAttribute('data-hl-key', hlKey);
  var count = (bkmIds || []).length;
  icon.title = count === 1 ? 'Bookmark' : count + ' bookmarks';

  // Bookmark flag SVG. Note: explicit `fill="currentColor"` and
  // `stroke="currentColor"` ATTRIBUTES on the path (not just CSS) —
  // Android WebView (notably older Chromium-derived versions) does NOT
  // reliably inherit CSS `fill` from the parent <svg> through to child
  // <path> elements injected via innerHTML, leaving the path invisible
  // on device even though the preview works fine on desktop. Setting
  // the attributes directly is the safer cross-WebView path.
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><path fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

  var openIcon = function(e) {
    e.preventDefault();
    e.stopPropagation();
    var ids = (icon.getAttribute('data-bkm-ids') || '').split(',').filter(Boolean);
    if (ids.length === 1) {
      // Single bookmark at this position — open the full create/edit
      // sheet so the user gets the same UI as creation: editable label
      // + thought + Delete. Consistent UX whether they're making a new
      // bookmark or revisiting an existing one.
      // atSource:true tells the sheet to suppress the "Open Source"
      // button — the user tapped the icon AT the source, so navigation
      // there would be a no-op.
      if (window.__bookmarkEdit) { window.__bookmarkEdit(ids[0], { atSource: true }); return; }
    }
    // Multi-bookmark or fallback: the popover still serves
    // disambiguation. Tapping a popover row routes onward to whatever
    // single-bookmark UI is wired (currently still the popover's own
    // Open/Delete actions — that's intentional for the rare overlap case).
    var rect = icon.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.bottom + 4;
    if (window.__openBookmarkPopover) {
      window.__openBookmarkPopover(ids, x, y, hlKey);
    }
  };
  icon.addEventListener('click', openIcon);
  icon.addEventListener('touchend', openIcon);
  return icon;
}

function _insertBookmarkIconAt(container, hlKey, endPos, bkmIds, justCreated) {
  var WORD = /[\w’'-]/;
  var CLOSE_PUNCT = /[.,;:!?)\]}"'…—]/;
  // Elements the icon must NOT land directly before — reuses the same
  // skip list as _insertLinkIconAt.
  var SKIP_RX = /\b(fn-ref|tap-ref|letter-link-ref|verse-link-icon|hl-note-icon|inline-link-icon|inline-bookmark-icon)\b/;

  function isSkip(el) {
    return el && el.nodeType === 1 && el.className && SKIP_RX.test(el.className);
  }
  function isPhraseChar(c) { return !!c && (WORD.test(c) || CLOSE_PUNCT.test(c)); }

  function nextInsertionPoint(node) {
    var cur = node;
    while (cur && cur !== container) {
      var sib = cur.nextSibling;
      if (sib === null) {
        cur = cur.parentElement;
        continue;
      }
      if (isSkip(sib)) {
        cur = sib;
        continue;
      }
      return sib;
    }
    return null;
  }

  // Gather all text nodes in document order.
  var textNodes = [];
  var w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  while (w.nextNode()) textNodes.push(w.currentNode);

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
  if (nodeIdx < 0) {
    var fallbackIcon = _buildBookmarkIcon(hlKey, bkmIds);
    if (justCreated) fallbackIcon.classList.add('just-created');
    container.appendChild(fallbackIcon);
    return;
  }

  // If endPos is inside a skip element, slide past it.
  var ancestor = textNodes[nodeIdx].parentElement;
  var skipAncestor = null;
  while (ancestor && ancestor !== container) {
    if (isSkip(ancestor)) skipAncestor = ancestor;
    ancestor = ancestor.parentElement;
  }
  if (skipAncestor) {
    var ref = nextInsertionPoint(skipAncestor);
    var icon = _buildBookmarkIcon(hlKey, bkmIds);
    if (justCreated) icon.classList.add('just-created');
    if (ref) ref.parentNode.insertBefore(icon, ref);
    else container.appendChild(icon);
    return;
  }

  var BLOCK_TAGS = /^(BR|P|DIV|H[1-6]|LI|BLOCKQUOTE|HR|UL|OL|TR|TD|TH|TABLE|SECTION|ARTICLE|HEADER|FOOTER|NAV|MAIN|FIGURE|FIGCAPTION|PRE|ADDRESS)$/;
  function hasBlockBetween(prev, next) {
    var bw = document.createTreeWalker(container, NodeFilter.SHOW_ALL, null, false);
    bw.currentNode = prev;
    var n;
    while ((n = bw.nextNode())) {
      if (n === next) return false;
      if (n.nodeType === 1 && BLOCK_TAGS.test(n.tagName)) return true;
    }
    return true;
  }

  // Slide forward through phrase characters, crossing inline boundaries.
  while (true) {
    var text = textNodes[nodeIdx].nodeValue;
    while (localOffset < text.length && isPhraseChar(text[localOffset])) {
      localOffset++;
    }
    if (localOffset < text.length) break;
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
  var finalText = finalNode.nodeValue;
  var insertBeforeNode = null;
  if (localOffset >= finalText.length) {
    insertBeforeNode = nextInsertionPoint(finalNode);
  } else if (localOffset === 0) {
    insertBeforeNode = finalNode;
  } else {
    insertBeforeNode = finalNode.splitText(localOffset);
  }
  var iconEl = _buildBookmarkIcon(hlKey, bkmIds);
  if (justCreated) iconEl.classList.add('just-created');
  if (insertBeforeNode) {
    insertBeforeNode.parentNode.insertBefore(iconEl, insertBeforeNode);
  } else {
    container.appendChild(iconEl);
  }
}

/* Inject inline chain icons at the end of each linked text range inside
   [data-hl-dom] containers. Re-runs on every hlTick. Click → onLinkOpen(blockKey)
   which opens the sidebar showing all links touching that block. */
function applyDOMLinks() {
  document.querySelectorAll('[data-hl-key][data-hl-dom]').forEach(function(container) {
    var hlKey = container.getAttribute('data-hl-key');
    container.querySelectorAll('.inline-link-icon').forEach(function(el) { el.remove(); });
    container.normalize();

    var links = LinkStore.getForKeyPrefix(hlKey);
    if (!links.length) return;

    var keyPrefix = hlKey + ':';
    var byEndPos = {};
    links.forEach(function(link) {
      [link.a, link.b].forEach(function(ep) {
        if (!ep || !ep.key) return;
        if (ep.key !== hlKey && ep.key.indexOf(keyPrefix) !== 0) return;
        var endPos = null;
        var m = ep.key.match(/:(\d+)-(\d+)$/);
        if (m) {
          endPos = parseInt(m[2], 10);
        } else if (typeof ep.end === 'number') {
          endPos = ep.end;
        }
        if (endPos == null) return;
        byEndPos[endPos] = (byEndPos[endPos] || 0) + 1;
      });
    });
    if (Object.keys(byEndPos).length === 0) {
      container.appendChild(_buildLinkIcon(hlKey, links.length));
      return;
    }

    var positions = Object.keys(byEndPos).map(Number).sort(function(a, b) { return b - a; });
    positions.forEach(function(endPos) {
      _insertLinkIconAt(container, hlKey, endPos, byEndPos[endPos]);
    });
  });
}

function _buildLinkIcon(hlKey, count) {
  var icon = document.createElement('span');
  icon.className = 'inline-link-icon';
  icon.title = count + ' link' + (count > 1 ? 's' : '');
  icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  var openSidebar = function(e) {
    e.preventDefault(); e.stopPropagation();
    if (window.__openLinkSidebar) window.__openLinkSidebar(hlKey);
  };
  icon.addEventListener('click', openSidebar);
  icon.addEventListener('touchend', openSidebar);
  return icon;
}

function _insertLinkIconAt(container, hlKey, endPos, count) {
  var WORD = /[\w’'\-]/;
  var CLOSE_PUNCT = /[.,;:!?)\]}”’…—]/;
  var SKIP_RX = /\b(fn-ref|tap-ref|letter-link-ref|verse-link-icon|hl-note-icon)\b/;

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
    container.appendChild(_buildLinkIcon(hlKey, count));
    return;
  }

  var ancestor = textNodes[nodeIdx].parentElement;
  var skipAncestor = null;
  while (ancestor && ancestor !== container) {
    if (isSkip(ancestor)) skipAncestor = ancestor;
    ancestor = ancestor.parentElement;
  }
  if (skipAncestor) {
    var ref = nextInsertionPoint(skipAncestor);
    var icon = _buildLinkIcon(hlKey, count);
    if (ref) ref.parentNode.insertBefore(icon, ref);
    else container.appendChild(icon);
    return;
  }

  var BLOCK_TAGS = /^(BR|P|DIV|H[1-6]|LI|BLOCKQUOTE|HR|UL|OL|TR|TD|TH|TABLE|SECTION|ARTICLE|HEADER|FOOTER|NAV|MAIN|FIGURE|FIGCAPTION|PRE|ADDRESS)$/;
  function hasBlockBetween(prevTextNode, nextTextNode) {
    var bw = document.createTreeWalker(container, NodeFilter.SHOW_ALL, null, false);
    bw.currentNode = prevTextNode;
    var n;
    while ((n = bw.nextNode())) {
      if (n === nextTextNode) return false;
      if (n.nodeType === 1 && BLOCK_TAGS.test(n.tagName)) return true;
    }
    return true;
  }

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
  var iconEl = _buildLinkIcon(hlKey, count);
  if (insertBeforeNode) {
    insertBeforeNode.parentNode.insertBefore(iconEl, insertBeforeNode);
  } else {
    container.appendChild(iconEl);
  }
}

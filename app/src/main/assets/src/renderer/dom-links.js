/* ═══════════════════════════════════════════════════════════════
   DOM LINK ICONS — inline chain icon injection for [data-hl-dom] containers
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html; no import/export.
   Depends on: LinkStore (defined in src/stores/link-store.js).

   applyDOMLinks() is called from the post-render useEffect in App()
   after every hlTick change. It:
     1. Removes any existing .inline-link-icon elements
     2. Finds all links that touch each [data-hl-dom] container
     3. Inserts a chain icon at (or near) each linked text range endpoint
     4. Applies visual distinction: source icons (user originated the link)
        render at --gold; target icons (destination of a link from elsewhere)
        render at --gold-dim.

   Icon placement logic ("slide-off" rules):
     1. Mid-word → slide forward to word boundary
     2. Closing punctuation → slide past (., ; : ! ? etc.)
     3. Adjacent skip elements (fn-ref, tap-ref, letter-link-ref, note-icon,
        verse-link-icon) → jump past to keep their tap targets clear

   CSS: .inline-link-icon and .inline-link-icon-source are defined in
   the main index.html CSS block (part of the const CSS template literal).
═══════════════════════════════════════════════════════════════ */

/* Inject inline chain icons at the end of each linked text range inside
   [data-hl-dom] containers. Re-runs on every hlTick. Click → onLinkOpen(blockKey)
   which opens the sidebar showing all links touching that block. */
/* Inline link icons — placed at (or as close as possible to) the END
   of each linked text range. The icon "slides off" three kinds of bad
   placement so it never interrupts content:

     1. Mid-word — slide forward to the end of the current word.
        (Defensive: snapRangeToWords already aligns starts on word
        boundaries, but the parallel-session change to snapRangeToWords
        deliberately leaves END exactly where the user released — so
        the user can intentionally end mid-word but the icon shouldn't.)
     2. Closing punctuation — slide past `.,;:!?)...` and friends so
        the icon reads as belonging to the word, not splitting the
        punctuation off ("word."[icon] instead of "word"[icon]".").
     3. Adjacent fn-ref / scripture-ref / letter-link / note-icon /
        verse-link-icon — slide PAST these inline elements so the
        icon never lands directly before one (where, on Android, the
        icon would block the tap target — the original bug that drove
        the parallel session to end-of-paragraph placement).

   Multiple links ending at the same offset merge into one icon with
   a `title` count; tapping any icon opens the link sidebar for the
   block, which lists every link touching it.

   CSS: `.inline-link-icon` no longer sets `user-select: none` — the
   span is empty (SVG paths can't be selected anyway), and dropping
   the `none` lets drag-selection pass across the icon on Android
   without breaking. */
export function applyDOMLinks() {
  document.querySelectorAll('[data-hl-key][data-hl-dom]').forEach(function(container) {
    var hlKey = container.getAttribute('data-hl-key');
    container.querySelectorAll('.inline-link-icon').forEach(function(el) { el.remove(); });
    container.normalize();

    var links = LinkStore.getForKeyPrefix(hlKey);
    if (!links.length) return;

    // Collect end positions for endpoints attached to this container
    // (either the block itself or a more-specific subkey), merging
    // duplicates so two links ending at the same offset become one
    // icon with count=2.
    //
    // End position can live in two places depending on how the endpoint
    // was built:
    //   (a) A `:N-M` suffix on the key — used by target endpoints that
    //       went through verse-picker / excerpt-picker refinement
    //       (e.g. "letter:foo:2:42-87" or "bible:genesis:1:1").
    //   (b) Separate `start`/`end` fields on the endpoint object — used
    //       by SOURCE endpoints, which carry the user's selection range
    //       but keep the key bare (e.g. key="letter:workers:1",
    //       start=42, end=87, text="...sentence...").
    //
    // Without the (b) fallback, the icon for the source side of an
    // excerpt-to-excerpt link couldn't find its position and slid all
    // the way to end-of-paragraph — the regression the user reported.
    var keyPrefix = hlKey + ':';
    // byEndPos tracks { count, anySource } per character offset.
    // anySource=true means at least one link has THIS container as its origin
    // (source side) — icon renders at full gold. False means container is
    // only ever a destination (target side) — renders dimmer (gold-dim).
    var byEndPos = {};
    links.forEach(function(link) {
      // isSourceHere = the source endpoint belongs to this container
      var srcKey = link.source ? link.source.key : null;
      var isSourceHere = srcKey && (srcKey === hlKey || srcKey.indexOf(keyPrefix) === 0);

      [link.source, link.target].forEach(function(ep) {
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
        var prev = byEndPos[endPos] || { count: 0, anySource: false };
        byEndPos[endPos] = {
          count: prev.count + 1,
          // Once any link marks this position as source, keep it source.
          anySource: prev.anySource || !!isSourceHere
        };
      });
    });
    if (Object.keys(byEndPos).length === 0) {
      // Legacy link (no :start-end suffix) — fall back to one icon at
      // end of block, same as the prior end-of-paragraph behavior.
      // For the legacy path, check if any link is sourced from this container.
      var legacyAnySource = links.some(function(l) {
        return l.source && (l.source.key === hlKey || l.source.key.indexOf(keyPrefix) === 0);
      });
      container.appendChild(_buildLinkIcon(hlKey, links.length, legacyAnySource));
      return;
    }

    // Process highest position first so each insertion doesn't shift the
    // character offsets of earlier (lower-offset) insertions still pending.
    var positions = Object.keys(byEndPos).map(Number).sort(function(a, b) { return b - a; });
    positions.forEach(function(endPos) {
      _insertLinkIconAt(container, hlKey, endPos, byEndPos[endPos].count, byEndPos[endPos].anySource);
    });
  });
}

/* Build an inline chain icon span.
   isSource=true  -> this container originated the link; render at full gold (--gold).
   isSource=false -> this container is a link destination; render dimmer (--gold-dim).
   The visual distinction lets the user see at a glance "I anchored this" vs
   "something else points here". Both icons are still fully tappable. */
function _buildLinkIcon(hlKey, count, isSource) {
  var icon = document.createElement('span');
  // Apply source/target distinction via CSS class; default is dim (target role).
  icon.className = 'inline-link-icon' + (isSource ? ' inline-link-icon-source' : '');
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

function _insertLinkIconAt(container, hlKey, endPos, count, isSource) {
  var WORD = /[\w’'-]/;
  var CLOSE_PUNCT = /[.,;:!?)\]}"'…—]/;
  // Inline elements the icon must NOT land directly before — sliding
  // past keeps their tap targets clear and matches user intent
  // (icons should bracket the linked phrase, not interrupt
  // reference / footnote markers).
  var SKIP_RX = /\b(fn-ref|tap-ref|letter-link-ref|verse-link-icon|hl-note-icon)\b/;

  function isSkip(el) {
    return el && el.nodeType === 1 && el.className && SKIP_RX.test(el.className);
  }
  function isPhraseChar(c) { return !!c && (WORD.test(c) || CLOSE_PUNCT.test(c)); }

  /* Starting from `node`, walk forward through the DOM looking for the
     first "insertable" position that isn't directly before a skip element.
     A skip element is jumped over as a unit. When the current node has no
     nextSibling, walk UP to the parent and try again — this handles cases
     like `<span>...written.</span><span class="fn-ref">1</span>` where the
     fn-ref is a sibling of the text's wrapper, not of the text itself.
     Returns the DOM node to insert before, or null to append to container. */
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

  // Collect all text nodes in document order. We slide across text-node
  // boundaries (through inline emphasis wrappers like <em>/<strong>/<i>)
  // when there's no visible whitespace between them — Android selection
  // handles often snap to text-node boundaries, so a user dragging into
  // an italicised phrase like "...become the <em>same?</em>..." can land
  // the selection END at the boundary BEFORE the <em>. Without the cross-
  // node slide the icon ends up at "...become the [icon]same?" — exactly
  // the bug the user reported. With the slide we follow the phrase into
  // the next text node until reaching real whitespace.
  var textNodes = [];
  var w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  while (w.nextNode()) textNodes.push(w.currentNode);

  // Find the text node + local offset for endPos.
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
    container.appendChild(_buildLinkIcon(hlKey, count, isSource));
    return;
  }

  // If endPos landed INSIDE a skip element (fn-ref bubble's "1" text node,
  // a letter-link's label text, etc.), slide past the whole skip element
  // instead of placing the icon inside it.
  var ancestor = textNodes[nodeIdx].parentElement;
  var skipAncestor = null;
  while (ancestor && ancestor !== container) {
    if (isSkip(ancestor)) skipAncestor = ancestor;
    ancestor = ancestor.parentElement;
  }
  if (skipAncestor) {
    var ref = nextInsertionPoint(skipAncestor);
    var icon = _buildLinkIcon(hlKey, count, isSource);
    if (ref) ref.parentNode.insertBefore(icon, ref);
    else container.appendChild(icon);
    return;
  }

  // Block-level tags that visually break the reading flow. When sliding
  // across text-node boundaries, we STOP if the path between two adjacent
  // text nodes contains any of these — but we KEEP going through inline
  // emphasis wrappers (em/strong/i/b/span/etc.) so a phrase like
  // "...the <em>same?</em> Therefore..." reads as one continuous unit
  // for icon-placement purposes.
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

  // Slide forward through phrase characters (word chars + closing
  // punctuation), crossing text-node boundaries whenever the next text
  // node is in the SAME inline context — i.e., no block element on the
  // DOM path between them. This is what makes the icon flow through an
  // <em>-wrapped phrase even when Android's selection handle dropped at
  // the text-node boundary BEFORE the <em>.
  // Skip elements (fn-ref, etc.) are jumped over by advancing the
  // node index past any of their child text nodes — they're part of
  // the visible reading flow but the icon shouldn't land inside them.
  while (true) {
    var text = textNodes[nodeIdx].nodeValue;
    while (localOffset < text.length && isPhraseChar(text[localOffset])) {
      localOffset++;
    }
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
    if (nextNodeIdx >= textNodes.length) break;     // no more nodes
    if (hasBlockBetween(textNodes[nodeIdx], textNodes[nextNodeIdx])) break;
    nodeIdx = nextNodeIdx;
    localOffset = 0;
  }

  // Final placement.
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
  var iconEl = _buildLinkIcon(hlKey, count, isSource);
  if (insertBeforeNode) {
    insertBeforeNode.parentNode.insertBefore(iconEl, insertBeforeNode);
  } else {
    container.appendChild(iconEl);
  }
}

function applyDOMHighlights() {
  document.querySelectorAll('[data-hl-key]').forEach(function(container) {
    // Skip React-managed containers (HighlightableText)
    if (container.querySelector('mark.hl-mark[data-hl-id]') || container.childElementCount === 0 && container.textContent && !container.querySelector('mark.hl-dom')) {
      if (!container.hasAttribute('data-hl-dom')) return;
    }
    if (!container.hasAttribute('data-hl-dom')) return;

    var hlKey = container.getAttribute('data-hl-key');
    // Clean existing DOM-applied marks AND any lingering note icons
    var existing = container.querySelectorAll('mark.hl-dom');
    for (var i = 0; i < existing.length; i++) {
      var mark = existing[i];
      var parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    }
    // Note icons are managed globally by applyNoteIcons() — strip any
    // that were inserted into this container so they don't survive
    // a subsequent rebuild without going through the global walker.
    container.querySelectorAll('.hl-note-icon').forEach(function(el) { el.remove(); });
    container.normalize();

    var anns = AnnotationStore.get(hlKey);
    if (!anns.length) return;

    // Sort by start; track per-group first/last segment within THIS container
    var sorted = anns.slice().sort(function(a, b) { return a.start - b.start; });
    var groupCounts = {};
    sorted.forEach(function(a) { groupCounts[a.groupId] = (groupCounts[a.groupId] || 0) + 1; });
    var groupSeen = {};

    // Apply each annotation. Process in order, rebuilding map after each
    // because splitting text nodes invalidates positions.
    for (var hi = 0; hi < sorted.length; hi++) {
      var ann = sorted[hi];
      var seenIdx = groupSeen[ann.groupId] || 0;
      var isFirst = seenIdx === 0;
      var isLast = seenIdx === groupCounts[ann.groupId] - 1;
      groupSeen[ann.groupId] = seenIdx + 1;
      var kind = ann.kind || (ann.style === 'underline' ? 'underline' : 'highlight');

      // Re-walk text nodes (cheap for typical paragraph sizes)
      var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
      var textNodes = [];
      var charPos = 0;
      while (walker.nextNode()) {
        var node = walker.currentNode;
        textNodes.push({ node: node, start: charPos, end: charPos + node.length });
        charPos += node.length;
      }
      var lastMark = null;
      for (var ti = 0; ti < textNodes.length; ti++) {
        var tn = textNodes[ti];
        var overlapStart = Math.max(ann.start, tn.start);
        var overlapEnd = Math.min(ann.end, tn.end);
        if (overlapStart >= overlapEnd) continue;
        var localStart = overlapStart - tn.start;
        var localEnd = overlapEnd - tn.start;
        var tNode = tn.node;
        if (localEnd < tNode.length) tNode.splitText(localEnd);
        var midNode = localStart > 0 ? tNode.splitText(localStart) : tNode;
        var m = document.createElement('mark');
        var cls = 'hl-mark hl-dom hl-' + ann.color;
        if (kind === 'underline') cls += ' hl-underline';
        else if (kind === 'note') {
          cls += ' hl-note';
          if (isFirst && ti === textNodes.findIndex(function(x) { return Math.max(ann.start, x.start) < Math.min(ann.end, x.end); })) cls += ' first-segment';
        }
        m.className = cls;
        m.setAttribute('data-hl-id', ann.id);
        m.setAttribute('data-group-id', ann.groupId);
        m.setAttribute('data-kind', kind);
        midNode.parentNode.replaceChild(m, midNode);
        m.appendChild(midNode);
        lastMark = m;
      }
      // last-segment class is still useful for the active-state styling
      // anchor (right side of the wavy underline). The trailing icon is
      // added by applyNoteIcons() — once per group, globally.
      if (kind === 'note' && lastMark) lastMark.classList.add('last-segment');
      // Mid-word boundary suppression: when the annotation ends between
      // two letters in the original text, mark the last mark with
      // data-no-break-after so the CSS pseudo word-joiner prevents the
      // browser from breaking a word across the mark/text seam.
      if (lastMark) {
        var fullText = container.textContent;
        var lastCh = fullText.charAt(ann.end - 1);
        var nextCh = fullText.charAt(ann.end);
        if (lastCh && nextCh && /[\w’'-]/.test(lastCh) && /[\w’'-]/.test(nextCh)) {
          lastMark.setAttribute('data-no-break-after', '1');
        }
      }
    }
  });
}

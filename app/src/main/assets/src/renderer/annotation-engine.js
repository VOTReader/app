/* ═══════════════════════════════════════════════════════════════════════
   ANNOTATION RENDERING ENGINE — highlights · underlines · notes
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src> — no
   import/export; every name below is a global the rest of the app calls by
   bare name (exactly how dom-links.js / dom-bookmarks.js work).

   Loaded at the canonical renderer-extraction point (right after
   dom-bookmarks.js, before the inline <script> that holds the selection
   toolbar). Nothing here executes at module-load time — every function /
   component is only INVOKED later, from a React render or a useEffect that
   fires after App mounts. By then AnnotationStore/NoteStore (defined in an
   earlier inline block) and the window.__* bridges (set by App effects)
   are all in scope, so call-time resolution is safe.

   Exposed globals:
     snapRangeToWords(text,start,end) → {start,end}
     annMarkClass(ann,isFirst,isLast) → className string
     HighlightableText(props)         → React component (Bible/study verses)
     findNoteIconInsertionPoint(mark) → insertion descriptor
     _markCharEnd(mark)               → char offset (number)
     applyNoteIcons()                 → void (DOM mutation)
     applyActiveNoteState()           → void (DOM mutation)
     applyDOMHighlights()             → void (DOM mutation)
     StaticSubtree                    → React.Component (freeze wrapper)

   Call-time dependencies (all resolvable when invoked, never at load):
     React, AnnotationStore.get, window.__openNote / __showMultiNote /
     __activeNoteGroup. Emits class-name strings only — the CSS itself
     stays in index.html's `const CSS`.

   NOTE: HighlightableText uses React.useMemo (not the inline script's
   destructured `useMemo`) so this module carries no hidden cross-block
   dependency. Behaviour is identical.
   ═══════════════════════════════════════════════════════════════════════ */

/* Snap an annotation range to whole-word boundaries. If the user's
   selection lands mid-word on either side, expand outward to the
   nearest word start / word end. Matches the convention of every
   major reader app (Kindle, Apple Books, LDS Gospel Library) — the
   selection always commits to whole words. This also eliminates the
   mid-word wrap problem entirely, because mark elements now always
   align with word boundaries in the rendered text. */
function snapRangeToWords(text, start, end) {
  if (!text || typeof text !== 'string') return { start, end };
  start = Math.max(0, Math.min(start, text.length));
  end = Math.max(0, Math.min(end, text.length));
  const isWord = (c) => !!c && /[\w’’-]/.test(c);
  // Only snap start backward to include the full beginning word.
  // End is left exactly where the user released — no forward expansion.
  while (start > 0 && isWord(text[start - 1]) && isWord(text[start])) start--;
  return { start, end };
}

/* ═══════════════════════════════════════════════════════════════
   HIGHLIGHTABLE TEXT
   Renders a text string with highlight marks applied. Used by
   verse renderers, letter segments, and WTLB paragraphs.
═══════════════════════════════════════════════════════════════ */
/* Build the className for a mark based on annotation kind. */
function annMarkClass(ann, isFirst, isLast) {
  const kind = ann.kind || (ann.style === 'underline' ? 'underline' : 'highlight');
  if (kind === 'note') {
    return 'hl-mark hl-note hl-' + ann.color +
      (isFirst ? ' first-segment' : '') +
      (isLast ? ' last-segment' : '');
  }
  if (kind === 'underline') return 'hl-mark hl-underline hl-' + ann.color;
  return 'hl-mark hl-' + ann.color;
}

/* HighlightableText renders text with overlap-aware nested marks.
   Sweep-line algorithm:
     1. Build a sorted list of boundary positions from every annotation's
        start/end (plus 0 and text.length).
     2. Each adjacent pair of boundaries defines a segment where the SET
        of active annotations is constant.
     3. Render each segment as a chain of nested <mark> elements — one per
        active annotation. Outer = earliest start (tiebreak by id); inner
        elements paint background/decoration ON TOP of outer ones, which
        is the visual we want (more-specific overrides broader).
   Multiple <mark> elements may exist for a single annotation (one per
   segment that it spans). applyNoteIcons treats the LAST mark per group
   in document order as the icon anchor — so a single icon still emits
   for the whole annotation, even when it spans several segments. */
function HighlightableText({ text, hlKey, hlTick }) {
  const annotations = React.useMemo(() => AnnotationStore.get(hlKey), [hlKey, hlTick]);
  if (!text) return null;
  if (!annotations || annotations.length === 0) {
    return React.createElement("span", { "data-hl-key": hlKey }, text);
  }
  // Clamp ranges to text bounds and drop empties
  const valid = annotations
    .map(a => ({ ann: a, s: Math.max(0, Math.min(a.start, text.length)), e: Math.max(0, Math.min(a.end, text.length)) }))
    .filter(v => v.s < v.e);
  if (valid.length === 0) {
    return React.createElement("span", { "data-hl-key": hlKey }, text);
  }
  // Build sweep boundaries
  const set = new Set([0, text.length]);
  valid.forEach(v => { set.add(v.s); set.add(v.e); });
  const positions = [...set].sort((x, y) => x - y);
  // Compute segments (each with the active annotations)
  const segments = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const ss = positions[i], se = positions[i + 1];
    if (ss >= se) continue;
    const active = valid
      .filter(v => v.s <= ss && v.e >= se)
      .map(v => v.ann)
      .sort((a, b) => a.start - b.start || (a.id || '').localeCompare(b.id || ''));
    segments.push({ start: ss, end: se, active });
  }
  // Track first/last segment per group so the first-segment/last-segment
  // classes (used by tap routing helpers like applyNoteIcons) are accurate.
  const firstSegByGroup = new Map();
  const lastSegByGroup = new Map();
  segments.forEach((seg, idx) => {
    seg.active.forEach(a => {
      if (!firstSegByGroup.has(a.groupId)) firstSegByGroup.set(a.groupId, idx);
      lastSegByGroup.set(a.groupId, idx);
    });
  });
  // Mid-word boundary detection: if segment N's right edge falls between two
  // word characters in the original text, mark segment N for "no break after"
  // — a CSS ::after pseudo with a word-joiner glyph will prevent the browser
  // from breaking a word across the mark/text seam.
  const isWordChar = (c) => !!c && /[\w’'-]/.test(c);
  segments.forEach((seg, idx) => {
    if (idx < segments.length - 1) {
      const lastCh = text[seg.end - 1];
      const nextCh = text[seg.end];
      if (isWordChar(lastCh) && isWordChar(nextCh)) seg.noBreakAfter = true;
    }
  });
  return React.createElement("span", { "data-hl-key": hlKey },
    segments.map((seg, segIdx) => {
      const segText = text.slice(seg.start, seg.end);
      if (seg.active.length === 0) {
        // Plain text — wrap in a span only if we need the no-break-after marker.
        if (seg.noBreakAfter) {
          return React.createElement("span", { key: 'p' + segIdx, "data-no-break-after": "1" }, segText);
        }
        return React.createElement(React.Fragment, { key: 'p' + segIdx }, segText);
      }
      // Wrap text inside-out: i = active.length - 1 is innermost, i = 0 is outermost.
      // The OUTERMOST element gets the React key for the span's children array.
      let node = segText;
      for (let i = seg.active.length - 1; i >= 0; i--) {
        const ann = seg.active[i];
        const kind = ann.kind || (ann.style === 'underline' ? 'underline' : 'highlight');
        const isFirst = firstSegByGroup.get(ann.groupId) === segIdx;
        const isLast = lastSegByGroup.get(ann.groupId) === segIdx;
        const isOutermost = i === 0;
        const props = {
          key: isOutermost ? 'm' + segIdx : 'm' + segIdx + '_' + i,
          className: annMarkClass(ann, isFirst, isLast),
          "data-hl-id": ann.id,
          "data-group-id": ann.groupId,
          "data-kind": kind
        };
        if (isOutermost && seg.noBreakAfter) props["data-no-break-after"] = "1";
        node = React.createElement("mark", props, node);
      }
      return node;
    })
  );
}

/* ═══════════════════════════════════════════════════════════════
   DOM-BASED HIGHLIGHT OVERLAY
   For views with complex children (LetterView, WtlbEntryView),
   we can't use the React-based HighlightableText. Instead,
   after React renders, we walk the DOM and wrap highlighted
   character ranges in <mark> elements.
═══════════════════════════════════════════════════════════════ */
/* Find the nearest word-boundary insertion point AFTER a mark. If the
   mark ends in the middle of a word, the icon slides forward to the
   first whitespace/punctuation/end-of-container boundary so it never
   appears mid-word. Returns either { kind: 'afterMark' } meaning insert
   immediately after the mark element, or { kind: 'beforeNode', node }
   meaning split that text node and insert before the split-off tail.
   The mark's data range is unchanged — only the visual icon position
   shifts; the wavy active-state underline still reflects what was
   actually selected. */
function findNoteIconInsertionPoint(mark) {
  const container = mark.closest('[data-hl-key]');
  if (!container) return { kind: 'afterMark' };
  // Boundary chars: any whitespace OR closing punctuation (so a mark
  // ending right before a comma/period gets its icon AFTER the punct,
  // which reads more naturally).
  const boundaryRx = /[\s.,;:!?)\]}”’—\-]/;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  let pastMark = false;
  while (walker.nextNode()) {
    const tn = walker.currentNode;
    if (mark.contains(tn)) { pastMark = true; continue; }
    if (!pastMark) continue;
    const text = tn.nodeValue;
    if (text.length === 0) continue;
    // If this text node starts with a boundary char, no shift needed
    if (boundaryRx.test(text[0])) return { kind: 'afterMark' };
    // Otherwise, find the first boundary char in this text node
    const m = text.match(boundaryRx);
    if (m) {
      // Insert AFTER the boundary char so e.g. "wor[icon]d" becomes "word[icon] " — the
      // icon ends up just past the word that the mark started inside.
      // We split at idx+1 so the boundary stays attached to the preceding word.
      const splitAt = m.index + 1;
      if (splitAt >= text.length) return { kind: 'afterMark' };
      const tail = tn.splitText(splitAt);
      return { kind: 'beforeNode', node: tail };
    }
    // No boundary in this text node — keep walking; the next sibling
    // element edge is itself a boundary, so fall through to afterMark
    // if no later text node has a boundary either.
  }
  return { kind: 'afterMark' };
}

/* applyNoteIcons — places one 📝 icon per note group at the nearest
   word boundary after the group's last segment. When two or more
   groups would land at the same insertion point (e.g. two notes
   covering the same passage end at the same word), the icons merge
   into a single badge-decorated icon that opens a disambiguation
   popover. Rebuilds icons fully each call. */
/* Char offset from container start to position immediately AFTER a mark.
   Range.toString().length gives the character count, which lines up with
   the offsets in AnnotationStore (computed against container.textContent). */
function _markCharEnd(mark) {
  const container = mark.closest('[data-hl-key]');
  if (!container) return -1;
  try {
    const range = document.createRange();
    range.selectNodeContents(container);
    range.setEndAfter(mark);
    return range.toString().length;
  } catch (e) { return -1; }
}

function applyNoteIcons() {
  document.querySelectorAll('.hl-note-icon').forEach(el => el.remove());
  // Per-group last mark in document order
  const lastByGroup = new Map();
  document.querySelectorAll('mark.hl-note[data-group-id]').forEach(mark => {
    lastByGroup.set(mark.getAttribute('data-group-id'), mark);
  });
  // Merge groups whose marks end at the same CHARACTER OFFSET inside the same
  // container. This catches overlapping notes whose last marks are nested
  // (e.g. yellow wraps green; both end at char 22) so they share one icon
  // with a count badge. The icon's click handler routes the merged set to
  // the multi-note disambiguation popover.
  const groupsByTarget = new Map(); // key: hlKey:charEnd → list of {gid, mark, ip}
  lastByGroup.forEach((mark, gid) => {
    const ip = findNoteIconInsertionPoint(mark);
    const container = mark.closest('[data-hl-key]');
    const hlKey = container ? container.getAttribute('data-hl-key') : '';
    const charEnd = _markCharEnd(mark);
    const key = hlKey + ':' + charEnd;
    if (!groupsByTarget.has(key)) groupsByTarget.set(key, []);
    groupsByTarget.get(key).push({ gid, mark, ip });
  });

  groupsByTarget.forEach(entries => {
    const primary = entries[0];
    const allGids = entries.map(e => e.gid);
    const container = primary.mark.closest('[data-hl-key]');
    const hlKey = container ? container.getAttribute('data-hl-key') : '';
    const colorClass = (primary.mark.className.match(/\bhl-(yellow|green|pink|red|orange|blue|purple|teal|brown|gray|cyan)\b/) || [])[0] || '';
    const icon = document.createElement('span');
    icon.className = 'hl-note-icon' + (colorClass ? ' ' + colorClass : '') + (entries.length > 1 ? ' hl-note-icon-badge' : '');
    icon.setAttribute('data-group-id', primary.gid);
    icon.setAttribute('data-group-ids', allGids.join(','));
    icon.setAttribute('data-hl-key', hlKey);
    if (entries.length > 1) icon.setAttribute('data-count', String(entries.length));
    icon.title = entries.length > 1 ? (entries.length + ' notes here') : 'Open note';
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>';
    var _openIcon = function(x, y) {
      if (entries.length > 1 && window.__showMultiNote) {
        window.__showMultiNote(allGids, x, y);
      } else if (window.__openNote) {
        window.__openNote(primary.gid);
      }
    };
    icon.addEventListener('click', function(e) {
      e.stopPropagation();
      _openIcon(e.clientX, e.clientY);
    });
    /* Android WebView sometimes doesn't fire 'click' on inline DOM-injected
       spans. Adding a touchend handler (with preventDefault to suppress the
       subsequent synthetic click and prevent text-selection interference)
       guarantees the icon opens the note on Android. */
    icon.addEventListener('touchend', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var t = e.changedTouches && e.changedTouches[0];
      _openIcon(t ? t.clientX : 0, t ? t.clientY : 0);
    });
    const ip = primary.ip;
    // The ip.node was produced by a splitText() during the first pass over
    // ALL groups. Subsequent splitText reorg on overlapping marks, or a
    // React re-render that swapped the container out from under us, can
    // leave ip.node detached — its parentNode may be null or point at an
    // orphaned subtree no longer in the live document. Only insert there if
    // the node is still genuinely attached inside this container; otherwise
    // fall back to placing the icon right after the mark.
    const ipUsable = ip.kind === 'beforeNode' && ip.node && ip.node.parentNode
      && container && container.contains(ip.node);
    if (ipUsable) {
      // Glue the icon to the preceding word: if the preceding text node ends
      // in a regular space, MOVE that space to the tail (post-icon) text node.
      // The wrap point (the space) now sits AFTER the icon, so the line breaks
      // between the icon and the next word — not between the highlighted text
      // and the icon. Without this, a mid-word annotation would push the icon
      // (and whatever highlight tail follows it) to the next line, splitting
      // the visual highlight awkwardly across lines.
      const prev = ip.node.previousSibling;
      if (prev && prev.nodeType === 3 && / $/.test(prev.nodeValue)) {
        prev.nodeValue = prev.nodeValue.replace(/ $/, '');
        ip.node.nodeValue = ' ' + ip.node.nodeValue;
      }
      ip.node.parentNode.insertBefore(icon, ip.node);
    } else if (primary.mark.parentNode && primary.mark.nextSibling) {
      primary.mark.parentNode.insertBefore(icon, primary.mark.nextSibling);
    } else if (primary.mark.parentNode) {
      primary.mark.parentNode.appendChild(icon);
    }
  });
}

/* applyActiveNoteState — toggle .is-active on the marks/icons whose
   groupId matches window.__activeNoteGroup. Called after DOM rebuilds
   (so freshly-rendered marks pick up the active state) and from the
   App effect when noteSheetTarget changes. */
function applyActiveNoteState() {
  document.querySelectorAll('.hl-note.is-active, .hl-note-icon.is-active')
    .forEach(el => el.classList.remove('is-active'));
  const gid = window.__activeNoteGroup;
  if (!gid) return;
  const safe = String(gid).replace(/"/g, '\\"');
  document.querySelectorAll('mark.hl-note[data-group-id="' + safe + '"], .hl-note-icon[data-group-id="' + safe + '"]')
    .forEach(el => el.classList.add('is-active'));
}

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
      // browser from breaking the word across the mark/text seam.
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

/* StaticSubtree — renders its children exactly ONCE and then blocks React
   from ever reconciling them again (shouldComponentUpdate → false).

   Why this exists: applyDOMHighlights() imperatively splitText()s and
   re-parents (replaceChild/appendChild) the text nodes that React created
   for a [data-hl-dom] block's <Segments>/renderLine output, and its
   cleanup calls container.normalize(). React's fibers still hold stateNode
   references to those exact, now-relocated/merged text nodes. The next
   time React reconciled that block — on navigation (it reuses
   <p key=blockIndex> fibers across letters) OR on any hlTick/footnote
   re-render while marks are present — it would call
   parent.removeChild(textNode) on a node that is no longer a direct child
   (it's inside an injected <mark>), throwing
   "NotFoundError: Failed to execute 'removeChild' on 'Node'..." inside
   React's commit phase, which the ErrorBoundary turns into the
   "Something went wrong" reload screen.

   Freezing the subtree means React never touches these nodes after mount,
   so the imperative overlay can never collide with reconciliation. The
   block elements are keyed by content identity (letter/entry id + index),
   so a content change unmounts the whole frozen <p> (React removes only
   the <p> root, which IS still a valid direct child of <main>) and mounts
   a fresh one — stale content is never shown. Props that legitimately
   change within a single letter (footnote active-state) are reapplied
   imperatively against the live DOM instead of via React re-render. */
class StaticSubtree extends React.Component {
  shouldComponentUpdate() { return false; }
  render() { return this.props.children; }
}

/* ═══════════════════════════════════════════════════════════════════════
   annotation-engine — Cluster C (esbuild bundle-c.js)
   ═══════════════════════════════════════════════════════════════════════
   ANNOTATION RENDERING ENGINE — highlights · underlines · notes

   Exposed:
     snapRangeToWords(text,start,end) → {start,end}
     HighlightableText(props)         → React component (Bible/study verses)
     findNoteIconInsertionPoint(mark) → insertion descriptor
     applyNoteIcons()                 → void (DOM mutation)
     applyActiveNoteState()           → void (DOM mutation)
     applyDOMHighlights()             → void (DOM mutation)
     StaticSubtree                    → React.Component (freeze wrapper)
   ═══════════════════════════════════════════════════════════════════════ */

/* Snap an annotation range to whole-word boundaries. */
export function snapRangeToWords(text, start, end) {
  if (!text || typeof text !== 'string') return { start, end };
  start = Math.max(0, Math.min(start, text.length));
  end = Math.max(0, Math.min(end, text.length));
  const isWord = (c) => !!c && /[\w’’-]/.test(c);
  while (start > 0 && isWord(text[start - 1]) && isWord(text[start])) start--;
  return { start, end };
}

/* Build the className for a mark based on annotation kind. */
function annMarkClass(ann, isFirst, isLast) {
  const kind = ann.kind || 'highlight';
  if (kind === 'note') {
    return 'hl-mark hl-note hl-' + ann.color +
      (isFirst ? ' first-segment' : '') +
      (isLast ? ' last-segment' : '');
  }
  if (kind === 'underline') return 'hl-mark hl-underline hl-' + ann.color;
  return 'hl-mark hl-' + ann.color;
}

/* HighlightableText renders text with overlap-aware nested marks via a
   sweep-line algorithm. Sorted boundaries → constant-active-set segments
   → inside-out <mark> nesting per segment using reduceRight (outer = i=0,
   inner = i=N-1; CSS cascade gives "more-specific overrides broader"). */
export function HighlightableText({ text, hlKey, hlTick }) {
  const annotations = React.useMemo(() => AnnotationStore.get(hlKey), [hlKey, hlTick]);
  if (!text) return null;
  if (!annotations || annotations.length === 0) {
    return <span data-hl-key={hlKey}>{text}</span>;
  }
  // Clamp ranges to text bounds and drop empties
  const valid = annotations
    .map(a => ({ ann: a, s: Math.max(0, Math.min(a.start, text.length)), e: Math.max(0, Math.min(a.end, text.length)) }))
    .filter(v => v.s < v.e);
  if (valid.length === 0) {
    return <span data-hl-key={hlKey}>{text}</span>;
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
  // Mid-word boundary detection.
  const isWordChar = (c) => !!c && /[\w’'-]/.test(c);
  segments.forEach((seg, idx) => {
    if (idx < segments.length - 1) {
      const lastCh = text[seg.end - 1];
      const nextCh = text[seg.end];
      if (isWordChar(lastCh) && isWordChar(nextCh)) seg.noBreakAfter = true;
    }
  });
  return (
    <span data-hl-key={hlKey}>
      {segments.map((seg, segIdx) => {
        const segText = text.slice(seg.start, seg.end);
        if (seg.active.length === 0) {
          // Plain text — wrap in a span only if we need the no-break-after marker.
          if (seg.noBreakAfter) {
            return <span key={'p' + segIdx} data-no-break-after="1">{segText}</span>;
          }
          return <React.Fragment key={'p' + segIdx}>{segText}</React.Fragment>;
        }
        // Inside-out: reduceRight wraps innermost (i = active.length - 1)
        // first, working outward. Outer element (i = 0) is what React keys
        // off — gets the segment-level key; inner elements get composite keys.
        return seg.active.reduceRight((child, ann, i) => {
          const kind = ann.kind || 'highlight';
          const isFirst = firstSegByGroup.get(ann.groupId) === segIdx;
          const isLast = lastSegByGroup.get(ann.groupId) === segIdx;
          const isOutermost = i === 0;
          const props = {
            key: isOutermost ? 'm' + segIdx : 'm' + segIdx + '_' + i,
            className: annMarkClass(ann, isFirst, isLast),
            'data-hl-id': ann.id,
            'data-group-id': ann.groupId,
            'data-kind': kind,
          };
          if (isOutermost && seg.noBreakAfter) props['data-no-break-after'] = '1';
          return <mark {...props}>{child}</mark>;
        }, segText);
      })}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DOM-BASED HIGHLIGHT OVERLAY (unchanged — imperative DOM mutation)
═══════════════════════════════════════════════════════════════ */
export function findNoteIconInsertionPoint(mark) {
  const container = mark.closest('[data-hl-key]');
  if (!container) return { kind: 'afterMark' };
  const boundaryRx = /[\s.,;:!?)\]}”’—\-]/;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  let pastMark = false;
  while (walker.nextNode()) {
    const tn = walker.currentNode;
    if (mark.contains(tn)) { pastMark = true; continue; }
    if (!pastMark) continue;
    const text = tn.nodeValue;
    if (text.length === 0) continue;
    if (boundaryRx.test(text[0])) return { kind: 'afterMark' };
    const m = text.match(boundaryRx);
    if (m) {
      const splitAt = m.index + 1;
      if (splitAt >= text.length) return { kind: 'afterMark' };
      const tail = tn.splitText(splitAt);
      return { kind: 'beforeNode', node: tail };
    }
  }
  return { kind: 'afterMark' };
}

/* Char offset from container start to position immediately AFTER a mark. */
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

export function applyNoteIcons() {
  document.querySelectorAll('.hl-note-icon').forEach(el => el.remove());
  const lastByGroup = new Map();
  document.querySelectorAll('mark.hl-note[data-group-id]').forEach(mark => {
    lastByGroup.set(mark.getAttribute('data-group-id'), mark);
  });
  const groupsByTarget = new Map();
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
    icon.addEventListener('touchend', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var t = e.changedTouches && e.changedTouches[0];
      _openIcon(t ? t.clientX : 0, t ? t.clientY : 0);
    });
    const ip = primary.ip;
    const ipUsable = ip.kind === 'beforeNode' && ip.node && ip.node.parentNode
      && container && container.contains(ip.node);
    if (ipUsable) {
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

export function applyActiveNoteState() {
  document.querySelectorAll('.hl-note.is-active, .hl-note-icon.is-active')
    .forEach(el => el.classList.remove('is-active'));
  const gid = window.__activeNoteGroup;
  if (!gid) return;
  const safe = String(gid).replace(/"/g, '\\"');
  document.querySelectorAll('mark.hl-note[data-group-id="' + safe + '"], .hl-note-icon[data-group-id="' + safe + '"]')
    .forEach(el => el.classList.add('is-active'));
}

export function applyDOMHighlights() {
  document.querySelectorAll('[data-hl-key]').forEach(function(container) {
    if (container.querySelector('mark.hl-mark[data-hl-id]') || container.childElementCount === 0 && container.textContent && !container.querySelector('mark.hl-dom')) {
      if (!container.hasAttribute('data-hl-dom')) return;
    }
    if (!container.hasAttribute('data-hl-dom')) return;

    var hlKey = container.getAttribute('data-hl-key');
    var existing = container.querySelectorAll('mark.hl-dom');
    for (var i = 0; i < existing.length; i++) {
      var mark = existing[i];
      var parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    }
    container.querySelectorAll('.hl-note-icon').forEach(function(el) { el.remove(); });
    container.normalize();

    var anns = AnnotationStore.get(hlKey);
    if (!anns.length) return;

    var sorted = anns.slice().sort(function(a, b) { return a.start - b.start; });
    var groupCounts = {};
    sorted.forEach(function(a) { groupCounts[a.groupId] = (groupCounts[a.groupId] || 0) + 1; });
    var groupSeen = {};

    for (var hi = 0; hi < sorted.length; hi++) {
      var ann = sorted[hi];
      var seenIdx = groupSeen[ann.groupId] || 0;
      var isFirst = seenIdx === 0;
      var isLast = seenIdx === groupCounts[ann.groupId] - 1;
      groupSeen[ann.groupId] = seenIdx + 1;
      var kind = ann.kind || 'highlight';

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
      if (kind === 'note' && lastMark) lastMark.classList.add('last-segment');
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
   See the original file comment for the full rationale (applyDOMHighlights
   splitText/replaceChild races with React reconciliation of the same
   subtree → NotFoundError on removeChild). */
export class StaticSubtree extends React.Component {
  shouldComponentUpdate() { return false; }
  render() { return this.props.children; }
}

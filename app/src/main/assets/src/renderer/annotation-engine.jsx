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

   TWO RENDER ARCHITECTURES (F6 — by design, not drift):
     1. REACT SWEEP-LINE — `HighlightableText`. Used by the verse-rendered screens
        (Bible/Matthew/study chapters). Builds overlap-aware nested <mark>s as JSX
        from sorted boundaries; annotations live in React's tree.
     2. IMPERATIVE DOM — `applyDOMHighlights` (+ applyDOMLinks/Bookmarks/NoteIcons),
        run by useDomAnnotationSync AFTER React commits. Used for content React
        renders as a single block (letters/WTLB/journal, marked [data-hl-dom]):
        it walks text nodes and wraps ranges via splitText. StaticSubtree freezes
        those blocks so React won't clobber the imperatively-injected marks.
     Both implement the SAME overlap precedence (annVisible/annAbove/renderSubRanges)
     + the SAME offset clamping (A7), so their per-character paint + tap-winner are
     equivalent — pinned by the DUAL-RENDER EQUIVALENCE test (annotation-engine.test).
     Pick the React path for new verse-style content; the imperative path only for
     single-block prose React owns.
   ═══════════════════════════════════════════════════════════════════════ */

/* Snap an annotation's START back to a whole-word boundary — but leave the END
   EXACTLY where the user released, BY DESIGN. A user can intentionally end a
   selection mid-word (the note-icon slide-off in dom-links.js compensates so
   the icon still lands on a boundary); snapping the end here would override that
   intent. So this only walks `start` left while it sits inside a word. */
export function snapRangeToWords(text, start, end) {
  if (!text || typeof text !== 'string') return { start, end };
  start = Math.max(0, Math.min(start, text.length));
  end = Math.max(0, Math.min(end, text.length));
  // A2: word chars include the typographic apostrophe (U+2019) AND the straight
  // ASCII apostrophe — both appear in the corpus ("don't"/"don’t"); the prior
  // class duplicated U+2019 and omitted ASCII ', so a straight-apostrophe word
  // split mid-snap. Hyphen last = literal.
  const isWord = (c) => !!c && /[\w’'-]/.test(c);
  while (start > 0 && isWord(text[start - 1]) && isWord(text[start])) start--;
  return { start, end };
}

/* An annotation's effective VISIBILITY — does it paint anything? A blank
   highlight (or a legacy kind:'note', which aliases to blank) shows nothing, so
   it never suppresses a colored annotation beneath it in an overlap: blank is
   transparent and lets the layer below show. */
export function annVisible(ann) {
  if (!ann || ann.kind === 'note') return false;
  return !!(ann.color && ann.color !== 'blank');
}

/* Overlap stacking order: the most-recently CREATED annotation wins, with the
   id as a stable tiebreaker. "a is above b" === a is more recent than b. */
export function annAbove(a, b) {
  const ac = a.created || 0, bc = b.created || 0;
  return ac > bc || (ac === bc && (a.id || '') > (b.id || ''));
}

/* For a VISIBLE annotation, the merged sub-ranges of [ann.start, ann.end] where
   a MORE-RECENT visible annotation also covers — i.e. where ann's own paint must
   be suppressed so the newer one shows cleanly (no alpha blend). The annotation
   still renders a (transparent) mark there, so its note icon + tap target + data
   attributes survive — only the paint is dropped. `all` = every annotation on the
   same key. */
export function coveredSubRanges(ann, all) {
  if (!annVisible(ann)) return [];
  const ivs = [];
  for (const b of all) {
    if (b === ann || !annVisible(b) || !annAbove(b, ann)) continue;
    const s = Math.max(ann.start, b.start), e = Math.min(ann.end, b.end);
    if (s < e) ivs.push([s, e]);
  }
  if (!ivs.length) return [];
  ivs.sort((x, y) => x[0] - y[0]);
  const merged = [ivs[0].slice()];
  for (let i = 1; i < ivs.length; i++) {
    const top = merged[merged.length - 1];
    if (ivs[i][0] <= top[1]) top[1] = Math.max(top[1], ivs[i][1]);
    else merged.push(ivs[i].slice());
  }
  return merged;
}

/* Split [ann.start, ann.end] into contiguous render sub-ranges, each flagged
   `suppress` where a more-recent visible annotation covers it. A non-overlapped
   annotation yields a single full-paint range (== today's behavior). */
export function renderSubRanges(ann, all) {
  const covered = coveredSubRanges(ann, all);
  if (!covered.length) return [{ s: ann.start, e: ann.end, suppress: false }];
  const out = [];
  let cursor = ann.start;
  for (const [cs, ce] of covered) {
    if (cs > cursor) out.push({ s: cursor, e: cs, suppress: false });
    out.push({ s: Math.max(cs, ann.start), e: Math.min(ce, ann.end), suppress: true });
    cursor = ce;
  }
  if (cursor < ann.end) out.push({ s: cursor, e: ann.end, suppress: false });
  return out;
}

/* Build the className for a mark based on annotation kind. When `suppress` is
   true the paint (background color + underline/squiggle decoration) is dropped
   to hl-blank — used in an overlap slice where a more-recent annotation wins —
   while hl-note + first/last-segment are KEPT so the note icon still shows. */
function annMarkClass(ann, isFirst, isLast, suppress) {
  let kind = ann.kind || 'highlight';
  let color = ann.color;
  // Legacy notes (kind==='note') rendered invisible — alias to a blank
  // highlight. Note-ness is now a NoteStore entry, NOT the kind: any
  // highlight/underline/squiggle can carry a note (shows the icon + opens
  // the sheet), and a note's visual is just its style + color (or blank).
  if (kind === 'note') { kind = 'highlight'; color = 'blank'; }
  const hasNote = ann.kind === 'note' ||
    (typeof NoteStore !== 'undefined' && !!NoteStore.get(ann.groupId));
  let cls = 'hl-mark';
  if (!suppress) {
    if (kind === 'underline') cls += ' hl-underline';
    else if (kind === 'squiggle') cls += ' hl-squiggle';
  }
  cls += (!suppress && color && color !== 'blank') ? (' hl-' + color) : ' hl-blank';
  if (hasNote) {
    cls += ' hl-note';
    if (isFirst) cls += ' first-segment';
    if (isLast) cls += ' last-segment';
  }
  return cls;
}

/* HighlightableText renders text with overlap-aware nested marks via a
   sweep-line algorithm. Sorted boundaries → constant-active-set segments
   → inside-out <mark> nesting per segment using reduceRight (outer = i=0,
   inner = i=N-1; CSS cascade gives "more-specific overrides broader"). */
export const HighlightableText = React.memo(function HighlightableText({ text, hlKey }) {
  // Subscribe to AnnotationStore mutations. F1+F2: snapshot the per-KEY
  // version, not the global one — so adding/removing/recoloring an annotation
  // on one verse re-renders only THAT verse, not all 176 in the chapter. A
  // whole-data op (replaceAll / removeGroup / rebase) bumps _crossKeyVersion,
  // which getVersionForKey includes, so those still re-render every verse.
  React.useSyncExternalStore(
    React.useCallback((cb) => AnnotationStore.subscribe(cb), []),
    () => AnnotationStore.getVersionForKey(hlKey)
  );
  // Also re-render when notes change — a mark's has-note class (the icon +
  // active marker) depends on whether its group has a NoteStore entry.
  React.useSyncExternalStore(
    React.useCallback((cb) => NoteStore.subscribe(cb), []),
    () => NoteStore.getVersion()
  );
  const annotations = AnnotationStore.get(hlKey);
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
  /** @type {Array<{ start: number, end: number, active: any[], noBreakAfter?: boolean }>} */
  const segments = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const ss = positions[i], se = positions[i + 1];
    if (ss >= se) continue;
    const active = valid
      .filter(v => v.s <= ss && v.e >= se)
      .map(v => v.ann)
      .sort((a, b) => (annAbove(a, b) ? 1 : annAbove(b, a) ? -1 : 0));
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
        // Overlap precedence: among the annotations active in THIS slice, the
        // most-recent VISIBLE one paints; the rest are suppressed to hl-blank so
        // its color shows cleanly (no alpha blend). A blank annotation has no
        // paint to win with, so it never suppresses a color beneath it.
        let topVisible = null;
        for (const a of seg.active) {
          if (annVisible(a) && (!topVisible || annAbove(a, topVisible))) topVisible = a;
        }
        // Inside-out: reduceRight wraps innermost (i = active.length - 1)
        // first, working outward. Outer element (i = 0) is what React keys
        // off — gets the segment-level key; inner elements get composite keys.
        return seg.active.reduceRight((child, ann, i) => {
          const kind = ann.kind || 'highlight';
          const isFirst = firstSegByGroup.get(ann.groupId) === segIdx;
          const isLast = lastSegByGroup.get(ann.groupId) === segIdx;
          const isOutermost = i === 0;
          const suppress = annVisible(ann) && !!topVisible && ann.id !== topVisible.id;
          const props = {
            key: isOutermost ? 'm' + segIdx : 'm' + segIdx + '_' + i,
            className: annMarkClass(ann, isFirst, isLast, suppress),
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
});

/* ═══════════════════════════════════════════════════════════════
   DOM-BASED HIGHLIGHT OVERLAY (unchanged — imperative DOM mutation)
═══════════════════════════════════════════════════════════════ */
export function findNoteIconInsertionPoint(mark) {
  const container = mark.closest('[data-hl-key]');
  if (!container) return { kind: 'afterMark' };
  const boundaryRx = /[\s.,;:!?)\]}”’—-]/;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let pastMark = false;
  while (walker.nextNode()) {
    const tn = /** @type {Text} */ (walker.currentNode);
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
  } catch (_e) { return -1; }
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
  // (U8) Scope the sweep to [data-hl-dom] containers at query time — matching
  // applyDOMLinks / applyDOMBookmarks. This drops a DEAD guard: the previous
  // code computed a `mark.hl-mark / childElementCount / mark.hl-dom`
  // querySelector expression, then gated on data-hl-dom TWICE (the inner check
  // inside the computed branch duplicated the unconditional outer one),
  // discarding the computed value entirely. Behavior is identical — only
  // [data-hl-dom] containers were ever processed — but the attribute filter now
  // happens in the selector, so unannotated containers cost nothing here.
  document.querySelectorAll('[data-hl-key][data-hl-dom]').forEach(function(container) {
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

    // Newest LAST so a more-recent annotation nests INNERMOST — it both paints
    // on top (its mark wraps the text last) and is the natural tap target.
    var sorted = anns.slice().sort(function(a, b) { return annAbove(a, b) ? 1 : annAbove(b, a) ? -1 : 0; });

    // A7: clamp each stored offset into the CURRENT text length and drop any that
    // collapse to empty — IDENTICALLY to the React path (HighlightableText, which
    // does Math.max(0, Math.min(start/end, text.length)) then filters s<e). Without
    // this, a stored offset left dangling past the end by a later corpus edit was
    // clamped on the React path but used raw here, so the two paths diverged (and
    // the imperative path could leave a stray/empty mark). `container.textContent`
    // is the clean text now (marks were just unwrapped + normalized above).
    var fullLen = container.textContent.length;
    sorted = sorted.map(function(a) {
      var s = Math.max(0, Math.min(a.start, fullLen));
      var e = Math.max(0, Math.min(a.end, fullLen));
      return s < e ? Object.assign({}, a, { start: s, end: e }) : null;
    }).filter(Boolean);
    if (!sorted.length) return;

    var groupSeen = {};

    for (var hi = 0; hi < sorted.length; hi++) {
      var ann = sorted[hi];
      var seenIdx = groupSeen[ann.groupId] || 0;
      var isFirst = seenIdx === 0;
      groupSeen[ann.groupId] = seenIdx + 1;
      var kind = ann.kind || 'highlight';
      var color = ann.color;
      // Legacy notes (kind==='note') rendered invisible — alias to a blank
      // highlight. Note-ness is now a NoteStore entry, not the kind.
      if (kind === 'note') { kind = 'highlight'; color = 'blank'; }
      var hasNote = ann.kind === 'note' ||
        (typeof NoteStore !== 'undefined' && !!NoteStore.get(ann.groupId));

      // Overlap precedence: split this annotation's range into paint/suppress
      // sub-ranges. Where a more-recent VISIBLE annotation covers, our paint is
      // dropped (hl-blank) so the newer color shows cleanly — but the mark (with
      // hl-note + data attrs) still renders, so the note icon + tap target hold.
      var subRanges = renderSubRanges(ann, sorted);
      var annMarks = [];
      for (var sri = 0; sri < subRanges.length; sri++) {
        var sub = subRanges[sri];
        var suppress = sub.suppress;
        // Re-walk fresh each sub-range: prior splitText/replaceChild mutated the
        // tree, so global→node offsets must be recomputed.
        var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        var textNodes = [];
        var charPos = 0;
        while (walker.nextNode()) {
          var node = /** @type {Text} */ (walker.currentNode);
          textNodes.push({ node: node, start: charPos, end: charPos + node.length });
          charPos += node.length;
        }
        for (var ti = 0; ti < textNodes.length; ti++) {
          var tn = textNodes[ti];
          var overlapStart = Math.max(sub.s, tn.start);
          var overlapEnd = Math.min(sub.e, tn.end);
          if (overlapStart >= overlapEnd) continue;
          var localStart = overlapStart - tn.start;
          var localEnd = overlapEnd - tn.start;
          var tNode = tn.node;
          if (localEnd < tNode.length) tNode.splitText(localEnd);
          var midNode = localStart > 0 ? tNode.splitText(localStart) : tNode;
          var m = document.createElement('mark');
          var cls = 'hl-mark hl-dom';
          if (!suppress && kind === 'underline') cls += ' hl-underline';
          else if (!suppress && kind === 'squiggle') cls += ' hl-squiggle';
          cls += (!suppress && color && color !== 'blank') ? (' hl-' + color) : ' hl-blank';
          if (hasNote) cls += ' hl-note';
          m.className = cls;
          m.setAttribute('data-hl-id', ann.id);
          m.setAttribute('data-group-id', ann.groupId);
          m.setAttribute('data-kind', kind);
          midNode.parentNode.replaceChild(m, midNode);
          m.appendChild(midNode);
          annMarks.push(m);
        }
      }
      // Note icon anchors: first-segment on this annotation's first mark (only
      // the first instance of a multi-segment group owns it), last-segment on
      // its last mark.
      if (hasNote && annMarks.length) {
        if (isFirst) annMarks[0].classList.add('first-segment');
        annMarks[annMarks.length - 1].classList.add('last-segment');
      }
      var lastMark = annMarks.length ? annMarks[annMarks.length - 1] : null;
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

/* ═══════════════════════════════════════════════════════════════════════
   LetterExcerptPickerScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function LetterExcerptPickerScreen({ refineRequest, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, onClose, returnTargetInsteadOfLink }) {
  const target = refineRequest.target;
  const item = refineRequest.item;
  const bodyRef = React.useRef(null);
  const [selInfo, setSelInfo] = React.useState(null); // { blockIdx, start, end, text }

  // Resolve entry data via the centralized context lookup, which already
  // covers volume letters (with prefaces), Timothy/Flock/Rebuke, WTLB One/Two,
  // The Blessed, Holy Days, AND Bible Study chapters (non-Matthew).
  const entry = React.useMemo(() => {
    const id = target.letterId || target.entryId || target.studyChapterId;
    if (!id) return null;
    const ctx = findEntryContext(id);
    return ctx ? ctx.entry : null;
  }, [target.letterId, target.entryId, target.studyChapterId]);

  // Build a flat array of plain-text blocks from the entry. Each block's
  // `key` is the bare data-index that LetterView/WtlbEntryView use for their
  // hlKey, so a stored link with a "letter:id:N:start-end" target will
  // prefix-match the rendered block element.
  const blocks = React.useMemo(() => {
    if (!entry) return [];
    if (entry.paragraphs) {
      return entry.paragraphs.map((p, i) => ({
        key: String(i),
        text: (p.text || '').replace(/_([^_]+)_/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\{\{ref:([^}]+)\}\}/g, '$1').replace(/\{\{nav:([^}]+)\}\}/g, '')
      }));
    }
    if (entry.blocks) {
      return entry.blocks.map((b, i) => {
        let text = '';
        if (b.type === 'para' || b.type === 'closing-fn' || b.type === 'intro') {
          text = (b.segments || []).map(s => s.t === 'fn' ? '' : (s.v || '')).join('');
        } else if (b.type === 'closing') {
          text = b.text || '';
        } else if (b.type === 'poetry') {
          text = ((b.lines || b.segments) || []).map(line =>
            Array.isArray(line) ? line.map(s => s.t === 'fn' ? '' : (s.v || '')).join('') :
            (line && line.t === 'fn' ? '' : (line && line.v) || '')
          ).join('\n');
        } else if (b.type === 'note' || b.type === 'scripture') {
          text = b.text || '';
        }
        // Keep original index even when text is empty so link-back keys match.
        return { key: String(i), text };
      }).filter(b => b.text.trim().length > 0);
    }
    return [];
  }, [entry]);

  // Android back button goes back to LinkPicker (same save/restore pattern).
  React.useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = () => onClose(null);
    return () => { window.__closeSheet = prev || null; };
  }, [onClose]);

  // Capture native selection. Two paths:
  //   captureSelectionSync — runs immediately, returns selInfo or null.
  //     Used as the fallback inside confirmLink so a fast user (select →
  //     tap ✓ within 150 ms) doesn't lose their excerpt to the race
  //     between the touchend timeout and React's state commit.
  //   captureSelection — deferred 150 ms, calls the sync fn then commits
  //     to state for UI (selection-hint quote). The delay is preserved
  //     because on Android the native selection occasionally isn't
  //     finalized immediately on touchend.
  const captureSelectionSync = React.useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const startNode = range.startContainer;
    const blockEl = startNode.nodeType === 3 ? startNode.parentElement.closest('[data-block-key]') : /** @type {Element} */ (startNode).closest && /** @type {Element} */ (startNode).closest('[data-block-key]');
    if (!blockEl || !bodyRef.current || !bodyRef.current.contains(blockEl)) return null;
    const blockKey = /** @type {HTMLElement} */ (blockEl).dataset.blockKey;
    const fullText = blockEl.textContent;
    const preRange = document.createRange();
    preRange.selectNodeContents(blockEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    var start = preRange.toString().length;
    var end = start + range.toString().length;
    var snapped = snapRangeToWords(fullText, start, end);
    start = snapped.start;
    return { blockKey, start, end, text: fullText.slice(start, end) };
  }, []);
  const captureSelection = React.useCallback(() => {
    setTimeout(function() {
      const info = captureSelectionSync();
      if (info) setSelInfo(info);
    }, 150);
  }, [captureSelectionSync]);

  const confirmLink = React.useCallback(() => {
    const refinedTarget = { ...target };
    // Fall back to a fresh synchronous capture so a tap-confirm-faster-
    // than-150-ms doesn't lose the excerpt. window.getSelection() still
    // holds the user's selection at the moment the ✓ button is tapped
    // (button taps don't clear native text selection by default).
    var info = selInfo || captureSelectionSync();
    if (info) {
      refinedTarget.blockKey = info.blockKey;
      refinedTarget.start = info.start;
      refinedTarget.end = info.end;
      refinedTarget.text = info.text;
      refinedTarget.preview = info.text;
      refinedTarget.partial = true;
      // Refine the key so per-block link icons are scoped correctly
      const baseKey = target.key.split(':').slice(0, 2).join(':');
      refinedTarget.key = baseKey + ':' + info.blockKey + ':' + info.start + '-' + info.end;
    }
    if (returnTargetInsteadOfLink) {
      onClose(refinedTarget);
      return;
    }
    const sourceEndpoint = buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText);
    const newLink = persistLink(sourceEndpoint, refinedTarget);
    onClose(newLink || null);
  }, [selInfo, captureSelectionSync, target, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, onClose, returnTargetInsteadOfLink]);

  if (!entry) {
    return (
      <div className="picker-screen">
        <div className="picker-header">
          <button className="picker-back" onClick={() => onClose(null)} aria-label="Back">←</button>
          <span className="picker-title">Select Text to Link</span>
        </div>
        <div className="picker-empty">Letter not found.</div>
      </div>
    );
  }

  const titleText = entry.title || item.label;
  const subtitleText = item.collection || (target.type === 'blessed' ? 'The Blessed' :
                       target.type === 'holy-days' ? 'Holy Days' : '');
  const hasSelection = !!selInfo;

  return (
    <div className="picker-screen">
      <div className="picker-header">
        <button className="picker-back" onClick={() => onClose(null)} aria-label="Back">←</button>
        <span className="picker-title">Select Text to Link</span>
        <button
          className="picker-confirm"
          onClick={confirmLink}
          aria-label="Confirm"
          title={hasSelection ? "Link this excerpt" : "Link the whole letter"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
      <div
        className="picker-body picker-body-letter"
        ref={bodyRef}
        onMouseUp={captureSelection}
        onTouchEnd={captureSelection}
      >
        <div className="picker-letter-title">{titleText}</div>
        {subtitleText && <div className="picker-letter-subtitle">{subtitleText}</div>}
        {hasSelection && <div className="picker-selection-hint">{'"' + (selInfo.text.length > 80 ? selInfo.text.slice(0, 77) + '…' : selInfo.text) + '"'}</div>}
        {!hasSelection && <div className="picker-selection-hint picker-selection-hint-empty">Long-press and drag to select an excerpt, then tap ✓. Tap ✓ without selecting to link the whole letter.</div>}
        {blocks.map(b => (
          <p
            key={b.key}
            data-block-key={b.key}
            className="picker-letter-block"
          >{b.text}</p>
        ))}
      </div>
    </div>
  );
}

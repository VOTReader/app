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

  // Full-screen picker over the still-mounted app — same dialog treatment as
  // the sheets: contain Tab, restore focus on close (Escape already routes
  // through AppShellSheets).
  const trapRef = useFocusTrap(true);

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
  // Deferred-capture timer is cleared on unmount — closing the picker within
  // 150ms of a lift must not commit selection state into a dead component
  // (the sibling selectionchange effect below already clears its own timer).
  const captureTimerRef = React.useRef(/** @type {any} */ (null));
  React.useEffect(() => () => { if (captureTimerRef.current) clearTimeout(captureTimerRef.current); }, []);
  const captureSelection = React.useCallback(() => {
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    captureTimerRef.current = setTimeout(function() {
      captureTimerRef.current = null;
      const info = captureSelectionSync();
      if (info) setSelInfo(info);
    }, 150);
  }, [captureSelectionSync]);

  // The mouseup/touchend fast path NEVER fires for the two ways a real
  // Android selection is actually made: the WebView's native text-selection
  // machinery delivers the long-press gesture's touchend NON-BUBBLING (the
  // same device behavior behind the 2026-07-03 tab-drag lockup), and
  // dragging the selection HANDLES dispatches no page touch events at all.
  // Owner-reported symptom: select text → the footer never offers the
  // excerpt — until some later unrelated gesture (a scroll's touchend)
  // finally runs a capture. document 'selectionchange' fires for EVERY
  // selection path (long-press, handle drags, mouse, keyboard), so it
  // drives the state commit; debounced because handle drags fire it
  // continuously. The touch/mouse handlers stay as a faster path.
  React.useEffect(() => {
    let t = null;
    const onSelectionChange = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        const info = captureSelectionSync();
        if (info) setSelInfo(info);
      }, 150);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (t) clearTimeout(t);
    };
  }, [captureSelectionSync]);

  // Find-in-letter — long letters made locating the passage to excerpt a
  // scroll hunt. Typing counts the matching paragraphs; ‹ › cycle through
  // them (scroll-to + a gold wash on the current hit). Nothing is hidden or
  // filtered — the full letter stays selectable, because the excerpt itself
  // is still made by selecting text.
  const [findQ, setFindQ] = React.useState('');
  const [findIdx, setFindIdx] = React.useState(0);
  const findTrim = findQ.trim().toLowerCase();
  const findMatches = React.useMemo(() => {
    if (findTrim.length < 2) return [];
    return blocks.filter(b => b.text.toLowerCase().includes(findTrim)).map(b => b.key);
  }, [blocks, findTrim]);
  React.useEffect(() => { setFindIdx(0); }, [findTrim]);
  const findHitKey = findMatches.length ? findMatches[Math.min(findIdx, findMatches.length - 1)] : null;
  React.useEffect(() => {
    if (!findHitKey || !bodyRef.current) return;
    const el = bodyRef.current.querySelector('[data-block-key="' + findHitKey + '"]');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [findHitKey]);
  const findStep = (dir) => {
    if (!findMatches.length) return;
    setFindIdx((i) => (i + dir + findMatches.length) % findMatches.length);
  };

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
  // Noun for the "whole X" affordance — this picker covers letters, WTLB /
  // Blessed / Holy-Days entries, and non-Matthew study chapters.
  const entryNoun = target.type === 'study-letter' ? 'chapter'
    : target.type === 'letter' ? 'letter' : 'entry';
  const contextLine = returnTargetInsteadOfLink
    ? 'Choose text to insert'
    : (sourceLabel ? 'Linking from ' + sourceLabel : 'Choose text to link');
  // Footer primary — a selection links the excerpt; no selection links the
  // whole letter/entry (an explicit, honest label instead of the old hidden
  // "tap ✓ with nothing selected" behaviour).
  const primaryLabel = hasSelection
    ? (returnTargetInsteadOfLink ? 'Insert this excerpt' : 'Link this excerpt')
    : (returnTargetInsteadOfLink ? 'Insert the whole ' + entryNoun : 'Link the whole ' + entryNoun);

  return (
    <div className="picker-screen" ref={trapRef} role="dialog" aria-modal="true" aria-label="Select letter text">
      <div className="picker-header">
        <button className="picker-back" onClick={() => onClose(null)} aria-label="Back">←</button>
        <span className="picker-title">Select Text</span>
      </div>
      <div className="picker-breadcrumb">{contextLine}</div>
      <div
        className="picker-body picker-body-letter"
        ref={bodyRef}
        onMouseUp={captureSelection}
        onTouchEnd={captureSelection}
      >
        <div className="picker-letter-title">{titleText}</div>
        {subtitleText && <div className="picker-letter-subtitle">{subtitleText}</div>}
        <div className="picker-find">
          <input
            className="picker-find-input"
            type="search"
            placeholder={"Find in this " + entryNoun + "…"}
            value={findQ}
            onChange={e => setFindQ(e.target.value)}
            aria-label={"Find text in this " + entryNoun}
          />
          {findTrim.length >= 2 && (
            <>
              <span className="picker-find-count">{findMatches.length ? (Math.min(findIdx, findMatches.length - 1) + 1) + ' of ' + findMatches.length : '0 found'}</span>
              <button type="button" className="picker-find-nav" onClick={() => findStep(-1)} disabled={!findMatches.length} aria-label="Previous match">{"‹"}</button>
              <button type="button" className="picker-find-nav" onClick={() => findStep(1)} disabled={!findMatches.length} aria-label="Next match">{"›"}</button>
            </>
          )}
        </div>
        {hasSelection && <div className="picker-selection-hint">{'"' + (selInfo.text.length > 80 ? selInfo.text.slice(0, 77) + '…' : selInfo.text) + '"'}</div>}
        {!hasSelection && <div className="picker-selection-hint picker-selection-hint-empty">Long-press and drag to select an excerpt — or use the button below to link the whole {entryNoun}.</div>}
        {blocks.map(b => (
          <p
            key={b.key}
            data-block-key={b.key}
            className={"picker-letter-block" + (b.key === findHitKey ? " picker-find-hit" : "")}
          >{b.text}</p>
        ))}
      </div>
      <div className="picker-footer">
        <button
          type="button"
          className="picker-footer-btn"
          onClick={confirmLink}
        >{primaryLabel}</button>
      </div>
    </div>
  );
}

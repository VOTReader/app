/* ═══════════════════════════════════════════════════════════════════════
   VersePickerScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function VersePickerScreen({ refineRequest, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, onClose, returnTargetInsteadOfLink }) {
  const target = refineRequest.target;
  const item = refineRequest.item;
  const isStudy = target.type === 'study';
  const bodyRef = React.useRef(null);
  // Native-selection capture. Shape:
  //   { verseStart, verseEnd, charStart, charEnd, text }
  //   verseStart/verseEnd: verse numbers spanned
  //   charStart: offset within verseStart's text where the selection begins
  //   charEnd: offset within verseEnd's text where the selection ends
  //   text: the actual selected substring (used for preview + Journal excerpt)
  const [selInfo, setSelInfo] = React.useState(null);

  // Resolve chapter object
  const chapter = React.useMemo(() => {
    if (isStudy) {
      const M = _matthew();
      return M && M.chapters.find(c => c.num === target.chapter) || null;
    }
    const b = _allBooks()[target.bookId];
    return b && b.chapters.find(c => c.num === target.chapter) || null;
  }, [isStudy, target.bookId, target.chapter]);

  // Flat verses list — handles both Bible (sections[].verses[]) and study (verses[]) shapes
  const verses = React.useMemo(() => {
    if (!chapter) return [];
    if (chapter.verses) return chapter.verses;
    if (chapter.sections) return chapter.sections.flatMap(s => s.verses);
    return [];
  }, [chapter]);

  // Android back button goes back to LinkPicker (same save/restore pattern).
  React.useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = () => onClose(null);
    return () => { window.__closeSheet = prev || null; };
  }, [onClose]);

  // captureSelectionSync — find the verse element(s) the user selected, build
  // a span descriptor with the actual selected text plus verse-level + char-
  // level offsets so downstream consumers (Journal excerpt, link overlay
  // renderer) can position the selection precisely.
  //
  // The verse num lives on the verse element's `data-verse` attribute. We
  // walk DOM Ranges to compute the char offset within the verse's text-only
  // content (which is the verse text excluding the leading "N " number span).
  const captureSelectionSync = React.useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const startN = range.startContainer;
    const endN = range.endContainer;
    const startVerseEl = /** @type {Element} */ (startN.nodeType === 3 ? startN.parentElement : startN).closest('[data-verse]');
    const endVerseEl = /** @type {Element} */ (endN.nodeType === 3 ? endN.parentElement : endN).closest('[data-verse]');
    if (!startVerseEl || !endVerseEl) return null;
    if (!bodyRef.current || !bodyRef.current.contains(startVerseEl) || !bodyRef.current.contains(endVerseEl)) return null;
    const startVerse = parseInt(startVerseEl.getAttribute('data-verse'), 10);
    const endVerse = parseInt(endVerseEl.getAttribute('data-verse'), 10);
    // Offset within the verse's TEXT node (the `.picker-verse-text` span).
    function offsetWithinVerseText(verseEl, container, offset) {
      const textEl = verseEl.querySelector('.picker-verse-text');
      if (!textEl) return 0;
      const r = document.createRange();
      r.selectNodeContents(textEl);
      try {
        r.setEnd(container, offset);
      } catch (_e) {
        // Selection endpoint sits outside the verse text (e.g. on the
        // verse-number span). Snap to 0 or verse-text length depending on
        // which side this is.
        return 0;
      }
      return r.toString().length;
    }
    let charStart = offsetWithinVerseText(startVerseEl, range.startContainer, range.startOffset);
    let charEnd = offsetWithinVerseText(endVerseEl, range.endContainer, range.endOffset);
    // Snap to word boundaries within each verse's text so trailing spaces
    // and partial words don't sneak into the excerpt.
    const startVText = (verses.find(v => v.n === startVerse) || {}).text || '';
    const endVText = (verses.find(v => v.n === endVerse) || {}).text || '';
    const snappedStart = snapRangeToWords(startVText, charStart, startVText.length).start;
    const snappedEndPos = snapRangeToWords(endVText, 0, charEnd).end;
    charStart = Math.max(0, Math.min(snappedStart, startVText.length));
    charEnd = Math.max(0, Math.min(snappedEndPos, endVText.length));
    return {
      verseStart: startVerse,
      verseEnd: endVerse,
      charStart: charStart,
      charEnd: charEnd,
      text: sel.toString()
    };
  }, [verses]);

  const captureSelection = React.useCallback(() => {
    setTimeout(function() {
      const info = captureSelectionSync();
      if (info) setSelInfo(info);
    }, 150);
  }, [captureSelectionSync]);

  const handleVerseTap = React.useCallback((vn) => {
    // Tap a verse number to quick-select the whole verse. Sets a synthetic
    // selInfo and visually selects the verse in the DOM so the user gets a
    // single-tap path that doesn't require drag-selection on mobile.
    const v = verses.find(x => x.n === vn);
    if (!v) return;
    setSelInfo({
      verseStart: vn,
      verseEnd: vn,
      charStart: 0,
      charEnd: (v.text || '').length,
      text: v.text || ''
    });
    // Clear any native selection so the visual is purely the .is-selected ring.
    try {
      const sel = window.getSelection();
      sel && sel.removeAllRanges && sel.removeAllRanges();
    } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
  }, [verses]);

  const confirmLink = React.useCallback(() => {
    const refinedTarget = { ...target };
    // Fall back to a fresh synchronous capture so a tap-confirm-faster-than-
    // 150ms doesn't lose the excerpt.
    const info = selInfo || captureSelectionSync();
    if (!info) { onClose(null); return; }
    const v1 = info.verseStart;
    const v2 = info.verseEnd;
    refinedTarget.verse = v1;
    if (v2 && v2 !== v1) refinedTarget.verseEnd = v2;
    const v1Obj = verses.find(v => v.n === v1) || null;
    const v2Obj = verses.find(v => v.n === v2) || null;
    const v2FullLen = v2Obj ? (v2Obj.text || '').length : 0;
    const isPartialStart = info.charStart > 0;
    const isPartialEnd = info.charEnd < v2FullLen;
    const isPartial = isPartialStart || isPartialEnd;
    if (isPartial) {
      refinedTarget.charStart = info.charStart;
      refinedTarget.charEnd = info.charEnd;
      refinedTarget.partial = true;
    }
    // Storage key. Whole-verse spans keep the existing format (so link
    // overlays still wire up). Partial spans append a ':S-E' suffix where
    // S/E are flat-offset markers across the verse range.
    const verseFrag = v1 + (v2 && v2 !== v1 ? '-' + v2 : '');
    let baseKey;
    if (isStudy) {
      baseKey = 'study:' + target.bookId + '-' + target.chapter + ':' + verseFrag;
    } else {
      baseKey = bibleHlKey(target.bookId, target.chapter, v1) + (v2 && v2 !== v1 ? '-' + v2 : '');
    }
    refinedTarget.key = isPartial ? baseKey + ':' + info.charStart + '-' + info.charEnd : baseKey;
    const baseLabel = item.title || target.label.replace(/\s\d+(?::\d+(?:-\d+)?)?$/, '');
    refinedTarget.label = baseLabel + ' ' + target.chapter + ':' + verseFrag;
    refinedTarget.text = info.text;
    refinedTarget.preview = info.text || (v1Obj && v1Obj.text) || '';

    // Two call patterns:
    //   • Link mode (default): persist + signal LinkPicker.
    //   • Journal/return mode: hand the refined target back to the caller
    //     via onClose so the Journal can create a verse-block from it.
    if (returnTargetInsteadOfLink) {
      onClose(refinedTarget);
      return;
    }
    const sourceEndpoint = buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText);
    const newLink = persistLink(sourceEndpoint, refinedTarget);
    onClose(newLink || null);
  }, [selInfo, captureSelectionSync, target, item, isStudy, verses, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, onClose, returnTargetInsteadOfLink]);

  if (!chapter) {
    return (
      <div className="picker-screen">
        <div className="picker-header">
          <button className="picker-back" onClick={() => onClose(null)} aria-label="Back">←</button>
          <span className="picker-title">Select Verse</span>
        </div>
        <div className="picker-empty">Chapter not found.</div>
      </div>
    );
  }

  const titleText = (item.title || target.label.replace(/\s\d+$/, '')) + ' ' + target.chapter;
  const hasSelection = !!selInfo;
  const previewText = selInfo ? (selInfo.text || '') : '';

  return (
    <div className="picker-screen">
      <div className="picker-header">
        <button className="picker-back" onClick={() => onClose(null)} aria-label="Back">←</button>
        <span className="picker-title">Select Text</span>
        <button
          className="picker-confirm"
          onClick={confirmLink}
          aria-label="Confirm"
          title={hasSelection ? "Use this excerpt" : "Use the whole chapter"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
      <div
        className="picker-body picker-body-letter"
        onTouchEnd={captureSelection}
        onMouseUp={captureSelection}
      >
        <div className="picker-letter-title">{titleText}</div>
        <div className="picker-letter-subtitle">{isStudy ? "Matthew Study Bible" : "Bible Chapter"}</div>
        <div
          className={"picker-selection-hint" + (hasSelection ? "" : " picker-selection-hint-empty")}
        >{hasSelection
          ? previewText
          : "Highlight any portion to link. Or tap a verse number to grab the whole verse."
        }</div>
        <div ref={bodyRef} className="picker-verses">
          {verses.map(v => (
            <p
              key={v.n}
              className="picker-verse-selectable"
              data-verse={v.n}
            >
              <span
                className="picker-verse-num"
                onClick={function(e) { e.stopPropagation(); handleVerseTap(v.n); }}
              >{v.n + " "}</span>
              <span className="picker-verse-text">{v.text}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

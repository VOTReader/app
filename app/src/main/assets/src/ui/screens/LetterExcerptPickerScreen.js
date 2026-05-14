function LetterExcerptPickerScreen({ refineRequest, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, onClose }) {
  const target = refineRequest.target;
  const item = refineRequest.item;
  const bodyRef = useRef(null);
  const [selInfo, setSelInfo] = useState(null); // { blockIdx, start, end, text }

  const entry = useMemo(() => {
    const id = target.letterId || target.entryId || target.studyChapterId;
    if (!id) return null;
    const ctx = findEntryContext(id);
    return ctx ? ctx.entry : null;
  }, [target.letterId, target.entryId, target.studyChapterId]);

  const blocks = useMemo(() => {
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
        return { key: String(i), text };
      }).filter(b => b.text.trim().length > 0);
    }
    return [];
  }, [entry]);

  useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = () => onClose(null);
    return () => { window.__closeSheet = prev || null; };
  }, [onClose]);

  const captureSelectionSync = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const startNode = range.startContainer;
    const blockEl = startNode.nodeType === 3 ? startNode.parentElement.closest('[data-block-key]') : startNode.closest && startNode.closest('[data-block-key]');
    if (!blockEl || !bodyRef.current || !bodyRef.current.contains(blockEl)) return null;
    const blockKey = blockEl.dataset.blockKey;
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
  const captureSelection = useCallback(() => {
    setTimeout(function() {
      const info = captureSelectionSync();
      if (info) setSelInfo(info);
    }, 150);
  }, [captureSelectionSync]);

  const confirmLink = useCallback(() => {
    const refinedTarget = { ...target };
    var info = selInfo || captureSelectionSync();
    if (info) {
      refinedTarget.blockKey = info.blockKey;
      refinedTarget.start = info.start;
      refinedTarget.end = info.end;
      refinedTarget.text = info.text;
      refinedTarget.preview = info.text;
      const baseKey = target.key.split(':').slice(0, 2).join(':');
      refinedTarget.key = baseKey + ':' + info.blockKey + ':' + info.start + '-' + info.end;
    }
    const sourceEndpoint = buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText);
    const newLink = persistLink(sourceEndpoint, refinedTarget);
    if (newLink) setHlTick(t => t + 1);
    onClose(newLink || null);
  }, [selInfo, captureSelectionSync, target, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, onClose]);

  if (!entry) {
    return React.createElement("div", { className: "picker-screen" },
      React.createElement("div", { className: "picker-header" },
        React.createElement("button", { className: "picker-back", onClick: () => onClose(null), "aria-label": "Back" }, "←"),
        React.createElement("span", { className: "picker-title" }, "Select Text to Link")
      ),
      React.createElement("div", { className: "picker-empty" }, "Letter not found.")
    );
  }

  const titleText = entry.title || item.label;
  const subtitleText = item.collection || (target.type === 'blessed' ? 'The Blessed' :
                       target.type === 'holy-days' ? 'Holy Days' : '');
  const hasSelection = !!selInfo;

  return React.createElement("div", { className: "picker-screen" },
    React.createElement("div", { className: "picker-header" },
      React.createElement("button", { className: "picker-back", onClick: () => onClose(null), "aria-label": "Back" }, "←"),
      React.createElement("span", { className: "picker-title" }, "Select Text to Link"),
      React.createElement("button", {
        className: "picker-confirm",
        onClick: confirmLink, "aria-label": "Confirm",
        title: hasSelection ? "Link this excerpt" : "Link the whole letter"
      },
        React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("polyline", { points: "20 6 9 17 4 12" })
        )
      )
    ),
    React.createElement("div", { className: "picker-body picker-body-letter", ref: bodyRef,
      onMouseUp: captureSelection, onTouchEnd: captureSelection
    },
      React.createElement("div", { className: "picker-letter-title" }, titleText),
      subtitleText && React.createElement("div", { className: "picker-letter-subtitle" }, subtitleText),
      hasSelection && React.createElement("div", { className: "picker-selection-hint" },
        '"' + (selInfo.text.length > 80 ? selInfo.text.slice(0, 77) + '…' : selInfo.text) + '"'
      ),
      !hasSelection && React.createElement("div", { className: "picker-selection-hint picker-selection-hint-empty" },
        "Long-press and drag to select an excerpt, then tap ✓. Tap ✓ without selecting to link the whole letter."
      ),
      blocks.map(b => React.createElement("p", {
        key: b.key,
        "data-block-key": b.key,
        className: "picker-letter-block"
      }, b.text))
    )
  );
}

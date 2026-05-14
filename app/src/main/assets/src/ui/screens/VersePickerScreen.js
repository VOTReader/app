function VersePickerScreen({ refineRequest, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, onClose }) {
  const target = refineRequest.target;
  const item = refineRequest.item;
  const isStudy = target.type === 'study';
  const [selStart, setSelStart] = useState(null); // verse number anchor
  const [selEnd, setSelEnd] = useState(null);     // verse number end (inclusive)

  const chapter = useMemo(() => {
    if (isStudy) {
      const M = _matthew();
      return M && M.chapters.find(c => c.num === target.chapter) || null;
    }
    const b = _allBooks()[target.bookId];
    return b && b.chapters.find(c => c.num === target.chapter) || null;
  }, [isStudy, target.bookId, target.chapter]);

  const verses = useMemo(() => {
    if (!chapter) return [];
    if (chapter.verses) return chapter.verses;
    if (chapter.sections) return chapter.sections.flatMap(s => s.verses);
    return [];
  }, [chapter]);

  useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = () => onClose(null);
    return () => { window.__closeSheet = prev || null; };
  }, [onClose]);

  const handleVerseTap = useCallback((vn) => {
    if (selStart == null) { setSelStart(vn); setSelEnd(vn); return; }
    if (selStart === vn && selEnd === vn) { setSelStart(null); setSelEnd(null); return; }
    if (selStart != null && selEnd != null && selStart === selEnd) {
      const a = Math.min(selStart, vn), b = Math.max(selStart, vn);
      setSelStart(a); setSelEnd(b);
      return;
    }
    setSelStart(vn); setSelEnd(vn);
  }, [selStart, selEnd]);

  const confirmLink = useCallback(() => {
    if (selStart == null) { onClose(); return; }
    const verse = selStart;
    const verseEnd = selEnd !== selStart ? selEnd : null;
    const refinedTarget = { ...target };
    refinedTarget.verse = verse;
    if (verseEnd) refinedTarget.verseEnd = verseEnd;
    if (isStudy) {
      refinedTarget.key = 'study:' + target.bookId + '-' + target.chapter + ':' + verse + (verseEnd ? '-' + verseEnd : '');
    } else {
      refinedTarget.key = bibleHlKey(target.bookId, target.chapter, verse) + (verseEnd ? '-' + verseEnd : '');
    }
    const baseLabel = item.title || target.label.replace(/\s\d+(?::\d+(?:-\d+)?)?$/, '');
    refinedTarget.label = baseLabel + ' ' + target.chapter + ':' + verse + (verseEnd ? '-' + verseEnd : '');
    const v = verses.find(v => v.n === verse);
    if (v) refinedTarget.preview = v.text;

    const sourceEndpoint = buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText);
    const newLink = persistLink(sourceEndpoint, refinedTarget);
    if (newLink) setHlTick(t => t + 1);
    onClose(newLink || null);
  }, [selStart, selEnd, target, item, isStudy, verses, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, onClose]);

  if (!chapter) {
    return React.createElement("div", { className: "picker-screen" },
      React.createElement("div", { className: "picker-header" },
        React.createElement("button", { className: "picker-back", onClick: () => onClose(null), "aria-label": "Back" }, "←"),
        React.createElement("span", { className: "picker-title" }, "Select Verse")
      ),
      React.createElement("div", { className: "picker-empty" }, "Chapter not found.")
    );
  }

  const titleText = (item.title || target.label.replace(/\s\d+$/, '')) + ' ' + target.chapter;
  const hasSelection = selStart != null;
  const isInRange = (n) => hasSelection && n >= Math.min(selStart, selEnd) && n <= Math.max(selStart, selEnd);

  return React.createElement("div", { className: "picker-screen" },
    React.createElement("div", { className: "picker-header" },
      React.createElement("button", { className: "picker-back", onClick: () => onClose(null), "aria-label": "Back" }, "←"),
      React.createElement("span", { className: "picker-title" }, "Select Text to Link"),
      React.createElement("button", {
        className: "picker-confirm" + (hasSelection ? "" : " is-disabled"),
        onClick: confirmLink, "aria-label": "Confirm", disabled: !hasSelection
      },
        React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("polyline", { points: "20 6 9 17 4 12" })
        )
      )
    ),
    React.createElement("div", { className: "picker-body" },
      React.createElement("div", { className: "picker-chapter-title" }, titleText),
      React.createElement("div", { className: "picker-verses" },
        verses.map(v => React.createElement("p", {
          key: v.n,
          className: "picker-verse" + (isInRange(v.n) ? " is-selected" : ""),
          onClick: () => handleVerseTap(v.n)
        },
          React.createElement("span", { className: "picker-verse-num" }, v.n + " "),
          v.text
        ))
      )
    )
  );
}

function LinkPicker({ sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, hlTick, setHlTick, onClose, onRequestRefine, lastCreatedLink, onLinkCreated }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  const [, setRecentTick] = useState(0);
  const bumpRecent = useCallback(() => setRecentTick(t => t + 1), []);
  const recent = RecentNavStore.list();
  useEffect(() => {
    if (inputRef.current) setTimeout(() => inputRef.current.focus(), 50);
  }, []);

  useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = prev || null; };
  }, [onClose]);

  const results = useMemo(() => {
    if (!input.trim()) return [];
    return searchNavIndex(input.trim(), 30).map(s => s.item);
  }, [input]);

  const createLinkTo = useCallback((item) => {
    if (!item || !sourceKey) return;
    const target = navItemToEndpoint(item);
    if (!target) return;
    RecentNavStore.add(item);

    const needsVersePicker =
      (target.type === 'bible' || target.type === 'study') && !target.verse;
    const needsExcerptPicker =
      target.type === 'letter' || target.type === 'wtlb' ||
      target.type === 'blessed' || target.type === 'holy-days' ||
      target.type === 'study-letter';
    if (needsVersePicker || needsExcerptPicker) {
      onRequestRefine && onRequestRefine({
        kind: needsVersePicker ? 'verse' : 'excerpt',
        target, item
      });
      return;
    }

    const sourceEndpoint = buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText);
    const newLink = persistLink(sourceEndpoint, target);
    if (newLink) {
      setHlTick(t => t + 1);
      bumpRecent();
      onLinkCreated(newLink);
    }
  }, [sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, bumpRecent, onLinkCreated]);

  const renderItemRow = (item, key) => {
    return React.createElement("button", {
      key: key, className: "navpick-row",
      onClick: () => createLinkTo(item)
    },
      React.createElement("div", { className: "navpick-row-icon navpick-row-icon-" + item.kind },
        item.kind === 'bible-chapter' ? (item.category === 'Old Testament' ? 'OT' : 'NT') :
        item.kind === 'study-chapter' ? 'SB' :
        item.kind === 'study-letter-chapter' ? 'LS' :
        (COL_NAV_ICON.get(item.collection) || '?')
      ),
      React.createElement("div", { className: "navpick-row-text" },
        React.createElement("div", { className: "navpick-row-label" }, item.label),
        React.createElement("div", { className: "navpick-row-cat" }, item.category || '')
      )
    );
  };

  const isEmptyQuery = !input.trim();

  return React.createElement("div", { className: "link-picker-overlay", onClick: onClose },
    React.createElement("div", { className: "link-picker-sheet navpick-sheet", onClick: e => e.stopPropagation() },
      React.createElement("div", { className: "navpick-header" },
        React.createElement("span", { className: "navpick-title" }, "Link"),
        React.createElement("button", {
          className: "navpick-close navpick-close-undo",
          onClick: () => {
            if (lastCreatedLink) {
              LinkStore.remove(lastCreatedLink.id);
              onLinkCreated(null);
            }
            onClose();
          },
          "aria-label": "Cancel"
        }, "×"),
        lastCreatedLink && React.createElement("button", {
          className: "navpick-confirm-green",
          onClick: onClose,
          "aria-label": "Done"
        },
          React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" },
            React.createElement("polyline", { points: "20 6 9 17 4 12" })
          )
        )
      ),
      React.createElement("div", { className: "navpick-search-wrap" },
        React.createElement("input", {
          ref: inputRef, className: "navpick-search-input",
          placeholder: "Search for verses, letters, or titles…",
          value: input, onChange: e => setInput(e.target.value),
          onKeyDown: e => { if (e.key === 'Enter' && results.length > 0) createLinkTo(results[0]); }
        })
      ),
      React.createElement("div", { className: "navpick-body" },
        isEmptyQuery ? (
          recent.length > 0 ?
            React.createElement(React.Fragment, null,
              React.createElement("div", { className: "navpick-section-label" }, "Recent"),
              recent.map((item, i) => renderItemRow(item, 'r' + i))
            ) :
            React.createElement("div", { className: "navpick-empty" },
              React.createElement("div", { className: "navpick-empty-title" }, "Search to link"),
              React.createElement("div", { className: "navpick-empty-hint" }, "Examples: \"Eph 6:5\", \"v1l2\", \"WTLB1 33\", or a letter title.")
            )
        ) : (
          results.length > 0 ?
            React.createElement(React.Fragment, null,
              React.createElement("div", { className: "navpick-section-label" }, "Results"),
              results.map((item, i) => renderItemRow(item, 's' + i))
            ) :
            React.createElement("div", { className: "navpick-empty" },
              React.createElement("div", { className: "navpick-empty-title" }, "No matches"),
              React.createElement("div", { className: "navpick-empty-hint" }, "Try \"Genesis 1\", \"Eph 6:5\", \"V2 letter 5\", \"The Wide Path\", \"WTLB1 33\".")
            )
        )
      )
    )
  );
}

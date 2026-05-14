function describeTab(tab) {
  const s = tab.screen || 'home';
  const resolveBook = (id) => id ? id === 'matthew' ? MATTHEW : id === 'matthew-plain' ? MATTHEW_PLAIN : BOOKS[id] : null;
  const book = resolveBook(tab.bookId);

  if (s === 'matthew-ch' || s === 'bible-ch') {
    const title = book ? `${book.title} · Ch. ${tab.chapterNum ?? '?'}` : 'Reading';
    const ot = book && OT_BOOK_IDS && OT_BOOK_IDS.has(book.id);
    const subtitle = book ?
    book.id === 'matthew' || book.id === 'matthew-plain' ? 'New Testament · Gospels' : ot ? 'Old Testament' : 'New Testament' :
    'Scripture';
    return { title, subtitle };
  }
  if (s === 'bible-idx' || s === 'matthew-idx') {
    const title = book ? book.title : 'Book';
    return { title, subtitle: book && OT_BOOK_IDS && OT_BOOK_IDS.has(book.id) ? 'Old Testament' : 'New Testament' };
  }
  if (s === 'scriptures-home') return { title: 'Scriptures', subtitle: 'The Scriptures of Truth' };
  if (s === 'scripture-genre') return { title: tab.genreId || 'Scriptures', subtitle: 'Browse by genre' };

  const _ltrCol = COL_BY_LETTER_SC.get(s);
  if (_ltrCol) {
    const l = colLetterArr(_ltrCol).find(e => e.id === tab.letterId);
    return { title: l?.title || (_ltrCol.kind === 'letter' ? 'Letter' : 'Entry'), subtitle: _ltrCol.label };
  }
  const _idxCol = COL_BY_INDEX_SC.get(s);
  if (_idxCol) return { title: _idxCol.label, subtitle: _idxCol.kind === 'letter' ? 'Letter index' : 'Entry index' };
  if (s === 'volumes-home') return { title: 'Volumes', subtitle: 'The Volumes of Truth' };

  if (s === 'studies-home') return { title: 'Studies', subtitle: 'Letter Studies · Matthew Study Bible' };
  if (s === 'bible-study-index') {
    const _study = _studies().find(st => st.slug === tab.studyId);
    return { title: _study?.title || 'Study', subtitle: 'Bible Letter Study' };
  }
  if (s === 'bible-study-chapter') {
    const _study = _studies().find(st => st.slug === tab.studyId);
    const _ch = _study && _study.chapters && _study.chapters.find(c => c.id === tab.studyChapterId);
    return { title: _ch?.title || 'Study Chapter', subtitle: _study?.title || 'Bible Letter Study' };
  }

  if (s === 'garden-view') return { title: `The Garden · Page ${tab.gardenPage ?? 1}`, subtitle: 'A Return to The Garden' };
  if (s === 'search') return { title: tab.searchQuery ? `"${tab.searchQuery}"` : 'Search', subtitle: 'Full-text search' };
  if (s === 'history') return { title: 'History', subtitle: 'Recently visited' };
  if (s === 'settings') return { title: 'Settings', subtitle: 'App configuration' };

  return { title: 'Home', subtitle: 'VOT Study Bible' };
}

function TabsOverview({ tabs, activeTabIdx, onSelect, onClose, onNewTab, onLongPress, onClearAll, clearAllStage, onDedupe, MAX_TABS, thumbnails }) {
  const total = tabs.length;
  const handleLongPress = React.useRef(null);
  const startLongPress = (idx) => (e) => {
    handleLongPress.current = setTimeout(() => {
      onLongPress && onLongPress(idx);
      handleLongPress.current = null;
    }, 520);
  };
  const cancelLongPress = () => {
    if (handleLongPress.current) {clearTimeout(handleLongPress.current);handleLongPress.current = null;}
  };
  const dupeCount = React.useMemo(() => {
    const seen = new Map();
    let dupes = 0;
    tabs.forEach((t) => {
      const k = tabContentKey(t);
      if (seen.has(k)) dupes++;else
      seen.set(k, true);
    });
    return dupes;
  }, [tabs]);

  const clearLabelLocal = clearAllStage === 0 ? 'Clear All' : CLEAR_LABELS[clearAllStage];
  const clearClassLocal = CLEAR_CLASSES[clearAllStage];
  const resetClearOnOutsideTap = (e) => {
    if (clearAllStage > 0) onClearAll && onClearAll(-1);
  };
  return (/*#__PURE__*/
    React.createElement("div", { className: "tabs-overview", onClick: resetClearOnOutsideTap }, /*#__PURE__*/
    React.createElement("div", { className: "tabs-overview-header" }, /*#__PURE__*/
    React.createElement("div", { className: "tabs-overview-eyebrow" }, "Reading Places"), /*#__PURE__*/
    React.createElement("h1", { className: "tabs-overview-title" }, "Tabs"), /*#__PURE__*/
    React.createElement("div", { className: "tabs-overview-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "tabs-overview-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "tabs-overview-ornament-diamond" }, "\u2726"), /*#__PURE__*/
    React.createElement("div", { className: "tabs-overview-ornament-line r" })
    ), /*#__PURE__*/
    React.createElement("div", { className: "tabs-overview-meta" }, total, " / ", MAX_TABS, " ", total === 1 ? 'tab' : 'tabs', " open"), /*#__PURE__*/
    React.createElement("div", { className: "tabs-overview-actions" }, /*#__PURE__*/
    React.createElement("button", {
      className: clearClassLocal,
      onClick: (e) => {e.stopPropagation();onClearAll();},
      disabled: total <= 1 && clearAllStage === 0 },
    clearLabelLocal), /*#__PURE__*/
    React.createElement("button", {
      className: "tabs-action-btn",
      onClick: (e) => {e.stopPropagation();onDedupe();},
      disabled: dupeCount === 0,
      title: dupeCount === 0 ? 'No duplicate tabs' : `Merge ${dupeCount} duplicate ${dupeCount === 1 ? 'tab' : 'tabs'}` },
    "Deduplicate", dupeCount > 0 ? ` · ${dupeCount}` : '')
    )
    ), /*#__PURE__*/
    React.createElement("div", { className: "tabs-overview-grid" },
    tabs.map((t, i) => {
      const { title, subtitle } = describeTab(t);
      const scrollKey = scrollKeyForTab(t);
      const saved = t.scrollPositions && t.scrollPositions[scrollKey];
      const pctLive = saved == null ? 0 :
      typeof saved === 'object' && typeof saved.pct === 'number' ? saved.pct : 0;
      const isActive = i === activeTabIdx;
      const thumb = thumbnails ? thumbnails[tabContentKey(t)] : null;
      return (/*#__PURE__*/
        React.createElement("div", {
          key: i,
          className: `tab-card${isActive ? ' active' : ''}${thumb ? ' has-thumb' : ''}`,
          onClick: () => onSelect(i),
          onTouchStart: startLongPress(i),
          onTouchEnd: cancelLongPress,
          onTouchMove: cancelLongPress,
          onMouseDown: startLongPress(i),
          onMouseUp: cancelLongPress,
          onMouseLeave: cancelLongPress }, /*#__PURE__*/

        React.createElement("button", {
          className: "tab-card-close",
          onClick: (e) => {e.stopPropagation();onClose(i);},
          title: "Close tab",
          "aria-label": "Close tab" },
        "\xD7"), /*#__PURE__*/
        React.createElement("div", { className: "tab-card-thumb-wrap" },
        thumb ? /*#__PURE__*/
        React.createElement("img", { className: "tab-card-thumb", src: thumb, alt: "" }) : /*#__PURE__*/

        React.createElement("div", { className: "tab-card-thumb-placeholder" }, /*#__PURE__*/
        React.createElement("div", { className: "tab-card-thumb-sigil" }, "\u2726")
        ), /*#__PURE__*/

        React.createElement("div", { className: "tab-card-thumb-scrim" })
        ), /*#__PURE__*/
        React.createElement("div", { className: "tab-card-body" }, /*#__PURE__*/
        React.createElement("div", { className: "tab-card-eyebrow" }, "Tab ", i + 1, " / ", total), /*#__PURE__*/
        React.createElement("div", { className: "tab-card-title" }, title), /*#__PURE__*/
        React.createElement("div", { className: "tab-card-subtitle" }, subtitle),
        tabHasProgressBar(t) && /*#__PURE__*/
        React.createElement("div", { className: "tab-card-progress" }, /*#__PURE__*/
        React.createElement("div", { className: "tab-card-progress-fill", style: { width: `${Math.round(pctLive * 100)}%` } })
        )

        )
        ));

    }),
    total < MAX_TABS && /*#__PURE__*/
    React.createElement("button", {
      className: "tab-card tab-card-new",
      onClick: () => onNewTab(),
      title: "New tab",
      "aria-label": "New tab" }, /*#__PURE__*/

    React.createElement("span", { className: "tab-card-new-plus" }, "+"), /*#__PURE__*/
    React.createElement("span", { className: "tab-card-new-label" }, "New Tab")
    )

    )
    ));
}

function tabContentKey(tab) {
  return `${tab.screen || 'home'}|${tab.bookId || ''}|${tab.chapterNum ?? ''}|${tab.letterId || ''}|${tab.studyId || ''}|${tab.studyChapterId || ''}|${tab.genreId || ''}|${tab.gardenPage ?? ''}`;
}

const READING_SCREENS = new Set([
'matthew-ch', 'bible-ch',
'vot-letter', 'vot-one-letter', 'vot-three-letter', 'vot-four-letter',
'vot-five-letter', 'vot-six-letter', 'vot-seven-letter',
'vot-timothy-letter', 'vot-flock-letter', 'vot-rebuke-letter',
'hm-letter',
'wtlb-one-entry', 'wtlb-two-entry', 'blessed-entry', 'holy-days-entry',
'bible-study-chapter',
'garden-view'
]);

function tabHasProgressBar(tab) {
  return READING_SCREENS.has(tab.screen);
}

function scrollKeyForTab(tab) {
  const s = tab.screen;
  if (s === 'matthew-ch' || s === 'bible-ch') return `${tab.bookId}-${tab.chapterNum}`;
  if (s === 'bible-study-chapter') return `study-${tab.studyId || ''}-${tab.studyChapterId || ''}`;
  if (s === 'hm-letter') return `entry-${tab.letterId}`;
  const _sc = COL_BY_LETTER_SC.get(s);
  if (_sc) {
    const pfx = _sc.kind === 'holy-days' ? 'holyday' : _sc.kind === 'letter' ? 'letter' : _sc.kind;
    return `${pfx}-${tab.letterId}`;
  }
  return s || 'home';
}

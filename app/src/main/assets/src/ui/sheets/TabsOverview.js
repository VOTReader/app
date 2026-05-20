/* ═══════════════════════════════════════════════════════════════════════
   TabsOverview — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

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
  // Count duplicates (same content signature) — surface the number on the button
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

  // Clear-All button mirrors the Mark-as-Read clear pattern: stage cycles
  // 0 → 1 → 2, matching label + color class. Tapping anywhere else in the
  // overview instantly resets stage back to 0.
  const clearLabelLocal = clearAllStage === 0 ? 'Clear All' : CLEAR_LABELS[clearAllStage];
  const clearClassLocal = CLEAR_CLASSES[clearAllStage];
  const resetClearOnOutsideTap = (e) => {
    if (clearAllStage > 0) onClearAll && onClearAll(-1); // -1 signals reset
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

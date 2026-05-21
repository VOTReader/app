/* ═══════════════════════════════════════════════════════════════════════
   HistoryScreen — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function HistoryScreen({ history, onBack, onSelect, onSearch, onSettings, theme, onThemeChange, onPruneDay }) {
  const now = new Date();
  const curY = now.getFullYear(),curM = now.getMonth(),curD = now.getDate();

  // Split history into:
  //   currentDays: array of { day, entries } for entries within the CURRENT month/year (top, no wrapper)
  //   tree: Year → Month → Week → Day for entries in PREVIOUS months/years
  const { currentDays, tree } = React.useMemo(() => {
    const curMs = new Map();   // dayNum → entries[]
    const ys = new Map();       // year → Map(month → Map(weekKey → { weekStart, days: Map(day → entries[]) }))
    for (const entry of history) {
      const d = new Date(entry.ts);
      const y = d.getFullYear(),m = d.getMonth(),day = d.getDate();
      if (y === curY && m === curM) {
        if (!curMs.has(day)) curMs.set(day, []);
        curMs.get(day).push(entry);
        continue;
      }
      // Compute Sunday-of-week key for older entries
      const wkStart = new Date(y, m, day - d.getDay());
      const wkKey = `${wkStart.getFullYear()}-${wkStart.getMonth()}-${wkStart.getDate()}`;
      if (!ys.has(y)) ys.set(y, new Map());
      const ms = ys.get(y);
      if (!ms.has(m)) ms.set(m, new Map());
      const ws = ms.get(m);
      if (!ws.has(wkKey)) ws.set(wkKey, { weekStart: wkStart, days: new Map() });
      const wd = ws.get(wkKey).days;
      if (!wd.has(day)) wd.set(day, []);
      wd.get(day).push(entry);
    }
    const sortDesc = (a, b) => b[0] - a[0];
    const currentDays = [...curMs.entries()].sort(sortDesc).map(([day, entries]) => ({ day, entries }));
    const treeArr = [...ys.entries()].sort(sortDesc).map(([y, ms]) => ({
      year: y,
      months: [...ms.entries()].sort(sortDesc).map(([m, ws]) => ({
        month: m,
        weeks: [...ws.entries()]
          .sort((a, b) => b[1].weekStart - a[1].weekStart)
          .map(([wkKey, wkData]) => ({
            key: wkKey,
            weekStart: wkData.weekStart,
            days: [...wkData.days.entries()].sort(sortDesc).map(([d, entries]) => ({ day: d, entries }))
          }))
      }))
    }));
    return { currentDays, tree: treeArr };
  }, [history, curY, curM]);

  // Most-recent year/month/week of each container default-open; everything else default-closed.
  // Current-month days at top: today + yesterday default-open, others default-closed.
  const [overrides, setOverrides] = React.useState({});
  const yest = new Date(curY, curM, curD - 1);
  const yestY = yest.getFullYear(), yestM = yest.getMonth(), yestD = yest.getDate();
  const recentYearId = tree.length > 0 ? `y:${tree[0].year}` : null;
  const recentMonthIds = new Set();
  const recentWeekIds = new Set();
  for (const yg of tree) {
    if (yg.months.length > 0) {
      const mg = yg.months[0];
      recentMonthIds.add(`ym:${yg.year}-${mg.month}`);
      if (mg.weeks.length > 0) {
        recentWeekIds.add(`ymw:${yg.year}-${mg.month}-${mg.weeks[0].key}`);
      }
    }
  }
  const defaultOpen = (id) => {
    if (id === `cd:${curY}-${curM}-${curD}`) return true;                    // Today
    if (id === `cd:${yestY}-${yestM}-${yestD}`) return true;                  // Yesterday
    if (id === recentYearId) return true;                                      // Most recent previous year
    if (recentMonthIds.has(id)) return true;                                   // Most recent month of each year
    if (recentWeekIds.has(id)) return true;                                    // Most recent week of each month
    return false;
  };
  const isOpen = (id) => id in overrides ? overrides[id] : defaultOpen(id);
  const toggle = (id) => setOverrides((prev) => ({ ...prev, [id]: !(id in prev ? prev[id] : defaultOpen(id)) }));

  // Prune-confirmation state (per-day; latest pending wins).
  const [pending, setPending] = React.useState(null); // string id or null
  const pendingTimer = React.useRef(null);
  const pendingBtnRef = React.useRef(null);
  const requestPrune = (dayId, y, m, d) => {
    if (pending === dayId) {
      onPruneDay(y, m, d);
      setPending(null);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    } else {
      setPending(dayId);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = setTimeout(() => {
        setPending((cur) => cur === dayId ? null : cur);
      }, 5000);
    }
  };
  React.useEffect(() => () => {if (pendingTimer.current) clearTimeout(pendingTimer.current);}, []);
  // Tap anywhere outside the pending dedupe button → cancel.
  React.useEffect(() => {
    if (!pending) return;
    const onDocTap = (e) => {
      const btn = pendingBtnRef.current;
      if (btn && btn.contains(e.target)) return;
      setPending(null);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
    // Use 'click' (not 'pointerdown') so the button's own onClick fires first.
    document.addEventListener('click', onDocTap, true);
    return () => document.removeEventListener('click', onDocTap, true);
  }, [pending]);

  const dupeCount = (entries) => {
    const seen = new Set();
    let n = 0;
    for (const e of entries) {if (seen.has(e.key)) n++;else seen.add(e.key);}
    return n;
  };

  const dayLabel = (y, m, d) => {
    if (y === curY && m === curM && d === curD) return 'Today';
    const yest = new Date(curY, curM, curD - 1);
    if (y === yest.getFullYear() && m === yest.getMonth() && d === yest.getDate()) return 'Yesterday';
    const date = new Date(y, m, d);
    return `${WEEKDAY_NAMES[date.getDay()]} · ${MONTH_ABBR[m]} ${d}`;
  };

  // Render one day-section. Used both for current-month days (top of screen)
  // and for tree-leaf days (inside Year > Month > Week).
  const renderDaySection = (year, month, dg, isCurrent) => {
    const dId = isCurrent ? `cd:${year}-${month}-${dg.day}` : `ymd:${year}-${month}-${dg.day}`;
    const dOpen = isOpen(dId);
    const dupes = dupeCount(dg.entries);
    const isPending = pending === dId;
    return (/*#__PURE__*/
      React.createElement("div", { key: dId, className: "history-day-section" }, /*#__PURE__*/
        React.createElement("button", { className: "history-day-header", onClick: () => toggle(dId) }, /*#__PURE__*/
          React.createElement("span", { className: "history-day-label" }, dayLabel(year, month, dg.day)),
          dg.entries.length > 1 && /*#__PURE__*/
          React.createElement("span", { className: "history-day-count" }, "\xB7 ", dg.entries.length), /*#__PURE__*/
          React.createElement("span", { className: "history-day-spacer" }), /*#__PURE__*/
          React.createElement("span", { className: `history-chevron${dOpen ? ' is-open' : ''}` }, "›")
        ),
        dOpen && dupes > 0 && /*#__PURE__*/
        React.createElement("div", { className: "history-dedupe-row" }, /*#__PURE__*/
          React.createElement("button", {
            ref: isPending ? pendingBtnRef : null,
            className: `history-dedupe-btn${isPending ? ' is-pending' : ''}`,
            onClick: () => requestPrune(dId, year, month, dg.day) },
            isPending ? `Tap again to confirm — removes ${dupes}` : `Deduplicate (${dupes})`
          )
        ),
        dOpen && /*#__PURE__*/
        React.createElement("div", { className: "chapter-cards" },
          dg.entries.map((entry, i) => /*#__PURE__*/
            React.createElement(HistoryEntryCard, { key: entry.key + ':' + entry.ts + ':' + i, entry: entry, onSelect: onSelect })
          )
        )
      )
    );
  };

  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home nav-back-icon", onClick: onBack, title: "Back", "aria-label": "Back" }, "\u2039"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/
      React.createElement("button", { className: "settings-gear-btn", onClick: onSettings, title: "Settings" }, /*#__PURE__*/
      React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("circle", { cx: "12", cy: "12", r: "3" }), /*#__PURE__*/React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }))
      ), /*#__PURE__*/
      React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" }, /*#__PURE__*/
      React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /*#__PURE__*/React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }))
      ), /*#__PURE__*/
      React.createElement(ThemeBtn, { theme: theme, onThemeChange: onThemeChange })
      ) }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index history-screen" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-header" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-eyebrow" }, "Reading Activity"), /*#__PURE__*/
    React.createElement("h1", { className: "vol-index-title" }, "History"), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line r" })
    )
    ),
    history.length === 0 ? /*#__PURE__*/
    React.createElement("div", { className: "history-empty" }, /*#__PURE__*/
    React.createElement("div", { className: "history-empty-sigil" }, "✦"), /*#__PURE__*/
    React.createElement("div", { className: "history-empty-title" }, "The scroll is blank."), /*#__PURE__*/
    React.createElement("div", { className: "history-empty-body" }, "Every chapter, letter, and study you visit will land here — a trail of what the Spirit has led you through. Begin reading and this will populate."
    )
    ) : /*#__PURE__*/
    React.createElement(React.Fragment, null,
      currentDays.length > 0 && /*#__PURE__*/
      React.createElement("div", { className: "history-current-section" },
        currentDays.map((dg) => renderDaySection(curY, curM, dg, true))
      ),
      tree.map((yg) => {
        const yId = `y:${yg.year}`;
        const yOpen = isOpen(yId);
        return (/*#__PURE__*/
          React.createElement("div", { key: yg.year, className: "history-year-section" }, /*#__PURE__*/
          React.createElement("button", { className: "history-year-header", onClick: () => toggle(yId) }, /*#__PURE__*/
          React.createElement("span", { className: "history-year-rule" }), /*#__PURE__*/
          React.createElement("span", { className: "history-year-label" }, yg.year), /*#__PURE__*/
          React.createElement("span", { className: "history-year-rule r" }), /*#__PURE__*/
          React.createElement("span", { className: `history-chevron${yOpen ? ' is-open' : ''}` }, "›")
          ),
          yOpen && yg.months.map((mg) => {
            const mId = `ym:${yg.year}-${mg.month}`;
            const mOpen = isOpen(mId);
            const monthTotal = mg.weeks.reduce((s, wk) => s + wk.days.reduce((s2, d) => s2 + d.entries.length, 0), 0);
            return (/*#__PURE__*/
              React.createElement("div", { key: mg.month, className: "history-month-section" }, /*#__PURE__*/
              React.createElement("button", { className: "history-month-header", onClick: () => toggle(mId) }, /*#__PURE__*/
              React.createElement("span", { className: "history-month-label" }, MONTH_NAMES[mg.month]), /*#__PURE__*/
              React.createElement("span", { className: "history-month-count" }, monthTotal), /*#__PURE__*/
              React.createElement("span", { className: `history-chevron${mOpen ? ' is-open' : ''}` }, "›")
              ),
              mOpen && mg.weeks.map((wg) => {
                const wId = `ymw:${yg.year}-${mg.month}-${wg.key}`;
                const wOpen = isOpen(wId);
                const weekTotal = wg.days.reduce((s, d) => s + d.entries.length, 0);
                const wsLabel = `Week of ${MONTH_ABBR[wg.weekStart.getMonth()]} ${wg.weekStart.getDate()}`;
                return (/*#__PURE__*/
                  React.createElement("div", { key: wg.key, className: "history-week-section" }, /*#__PURE__*/
                  React.createElement("button", { className: "history-week-header", onClick: () => toggle(wId) }, /*#__PURE__*/
                  React.createElement("span", { className: "history-week-label" }, wsLabel), /*#__PURE__*/
                  React.createElement("span", { className: "history-week-count" }, weekTotal), /*#__PURE__*/
                  React.createElement("span", { className: `history-chevron${wOpen ? ' is-open' : ''}` }, "›")
                  ),
                  wOpen && wg.days.map((dg) => renderDaySection(yg.year, mg.month, dg, false))
                  ));
              })
              ));
          })
          ));
      })
    ))
    ));

}

/* ═══════════════════════════════════════════════════════════════════════
   HistoryScreen — Cluster D (esbuild bundle-d.js)
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

  // Dedupe-confirmation state (per-day; latest pending wins). The
  // ConfirmStrip itself is the dismissal affordance — Cancel / Yes are
  // explicit, so no auto-cancel timer or click-outside listener.
  const [confirmingDayId, setConfirmingDayId] = React.useState(null);

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
    const isConfirming = confirmingDayId === dId;
    return (
      <div key={dId} className="history-day-section">
        <button className="history-day-header" onClick={() => toggle(dId)}>
          <span className="history-day-label">{dayLabel(year, month, dg.day)}</span>
          {dg.entries.length > 1 && <span className="history-day-count">{"\xB7 "}{dg.entries.length}</span>}
          <span className="history-day-spacer" />
          <span className={`history-chevron${dOpen ? ' is-open' : ''}`}>{"›"}</span>
        </button>
        {dOpen && dupes > 0 && (
          <div className="history-dedupe-row">
            {isConfirming ? (
              <ConfirmStrip
                question={`Remove ${dupes} duplicate ${dupes === 1 ? 'entry' : 'entries'} from this day?`}
                yesLabel="Yes, remove"
                onCancel={() => setConfirmingDayId(null)}
                onConfirm={() => { onPruneDay(year, month, dg.day); setConfirmingDayId(null); }}
              />
            ) : (
              <button
                className="history-dedupe-btn"
                onClick={() => setConfirmingDayId(dId)}
              >Deduplicate ({dupes})</button>
            )}
          </div>
        )}
        {dOpen && (
          <div className="chapter-cards">
            {dg.entries.map((entry, i) => (
              <HistoryEntryCard key={entry.key + ':' + entry.ts + ':' + i} entry={entry} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ScreenLayout navChildren={
      <>
        <button className="nav-home nav-back-icon" onClick={onBack} title="Back" aria-label="Back">{"‹"}</button>
        <HomeBtn />
        <button className="settings-gear-btn" onClick={onSettings} title="Settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button className="nav-search-btn" onClick={onSearch} title="Search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <ThemeBtn theme={theme} onThemeChange={onThemeChange} />
      </>
    }>
      <div className="vol-index history-screen">
        <div className="vol-index-header">
          <div className="vol-index-eyebrow">Reading Activity</div>
          <h1 className="vol-index-title">History</h1>
          <div className="vol-index-ornament">
            <div className="vol-index-ornament-line" />
            <div className="vol-index-ornament-diamond" />
            <div className="vol-index-ornament-line r" />
          </div>
        </div>
        {history.length === 0 ? (
          <div className="history-empty">
            <div className="history-empty-sigil">✦</div>
            <div className="history-empty-title">The scroll is blank.</div>
            <div className="history-empty-body">Every chapter, letter, and study you visit will land here — a trail of what the Spirit has led you through. Begin reading and this will populate.</div>
          </div>
        ) : (
          <>
            {currentDays.length > 0 && (
              <div className="history-current-section">
                {currentDays.map((dg) => renderDaySection(curY, curM, dg, true))}
              </div>
            )}
            {tree.map((yg) => {
              const yId = `y:${yg.year}`;
              const yOpen = isOpen(yId);
              return (
                <div key={yg.year} className="history-year-section">
                  <button className="history-year-header" onClick={() => toggle(yId)}>
                    <span className="history-year-rule" />
                    <span className="history-year-label">{yg.year}</span>
                    <span className="history-year-rule r" />
                    <span className={`history-chevron${yOpen ? ' is-open' : ''}`}>{"›"}</span>
                  </button>
                  {yOpen && yg.months.map((mg) => {
                    const mId = `ym:${yg.year}-${mg.month}`;
                    const mOpen = isOpen(mId);
                    const monthTotal = mg.weeks.reduce((s, wk) => s + wk.days.reduce((s2, d) => s2 + d.entries.length, 0), 0);
                    return (
                      <div key={mg.month} className="history-month-section">
                        <button className="history-month-header" onClick={() => toggle(mId)}>
                          <span className="history-month-label">{MONTH_NAMES[mg.month]}</span>
                          <span className="history-month-count">{monthTotal}</span>
                          <span className={`history-chevron${mOpen ? ' is-open' : ''}`}>{"›"}</span>
                        </button>
                        {mOpen && mg.weeks.map((wg) => {
                          const wId = `ymw:${yg.year}-${mg.month}-${wg.key}`;
                          const wOpen = isOpen(wId);
                          const weekTotal = wg.days.reduce((s, d) => s + d.entries.length, 0);
                          const wsLabel = `Week of ${MONTH_ABBR[wg.weekStart.getMonth()]} ${wg.weekStart.getDate()}`;
                          return (
                            <div key={wg.key} className="history-week-section">
                              <button className="history-week-header" onClick={() => toggle(wId)}>
                                <span className="history-week-label">{wsLabel}</span>
                                <span className="history-week-count">{weekTotal}</span>
                                <span className={`history-chevron${wOpen ? ' is-open' : ''}`}>{"›"}</span>
                              </button>
                              {wOpen && wg.days.map((dg) => renderDaySection(yg.year, mg.month, dg, false))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>
    </ScreenLayout>
  );
}

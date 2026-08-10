/* ═══════════════════════════════════════════════════════════════════════
   HistoryScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { readingChipWpm, readingMinChip } from '../components/ReadingMinChip.jsx';

/**
 * Everything about one entry a reader might type to find it again, lowercased
 * into one haystack — the same substring contract Notes / Bookmarks / Links
 * use. Composed in DISPLAY order ("Psalms 23", "Volume One 4") so a natural
 * two-word query matches as a plain substring without tokenizing.
 *
 * @param {any} entry
 * @returns {string}
 */
function _entrySearchText(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const parts = [];
  if (entry.type === 'letter') {
    const col = entry.volumeScreen && typeof COL_BY_INDEX_SC !== 'undefined' ? COL_BY_INDEX_SC.get(entry.volumeScreen) : null;
    parts.push(col ? col.label : '', entry.letterTitle, 'Letter ' + entry.letterNum, entry.letterId);
  } else if (entry.type === 'study-chapter') {
    parts.push(entry.studyTitle, entry.studySlug, entry.chapterTitle, 'Part ' + entry.chapterNum);
  } else {
    // Book title FIRST, then the number: "psalms 23" is one substring of it.
    parts.push(entry.bookTitle, entry.bookTitle + ' ' + entry.chapterNum,
      entry.chapterTitle, 'Chapter ' + entry.chapterNum, entry.bookId);
  }
  return parts.filter((p) => typeof p === 'string' && p).join(' ').toLowerCase();
}

export function HistoryScreen({ history, onBack, onSelect, onSearch, onSettings, theme, onThemeChange, onPruneDay }) {
  const now = new Date();
  const curY = now.getFullYear(),curM = now.getMonth(),curD = now.getDate();

  // Search (2026-08-09). History was the ONE index screen with no search box
  // while every sibling had one — and it is the screen holding the most rows
  // (2,000-entry cap), spread across collapsed day/week/month/year groups.
  // Filtering happens BEFORE grouping, so a group with no match doesn't
  // render at all and the ones that remain are all matches.
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const matches = React.useMemo(
    () => (q ? history.filter((entry) => _entrySearchText(entry).includes(q)) : history),
    [history, q]
  );

  // Split history into:
  //   currentDays: array of { day, entries } for entries within the CURRENT month/year (top, no wrapper)
  //   tree: Year → Month → Week → Day for entries in PREVIOUS months/years
  const { currentDays, tree } = React.useMemo(() => {
    const curMs = new Map();   // dayNum → entries[]
    const ys = new Map();       // year → Map(month → Map(weekKey → { weekStart, days: Map(day → entries[]) }))
    for (const entry of matches) {
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
  }, [matches, curY, curM]);

  // Most-recent year/month/week of each container default-open; everything else default-closed.
  // Current-month days at top: today + yesterday default-open, others default-closed.
  const [overrides, setOverrides] = React.useState({});
  // A search's expansion state is kept SEPARATE from the browsing one, and
  // reset whenever the query changes. Reusing one map would mean a year the
  // reader collapsed while browsing silently swallows its own matches — and
  // reusing it the other way would leave everything flung open after the
  // search box is cleared.
  const [searchOverrides, setSearchOverrides] = React.useState({});
  // Same-object bail-out when there is nothing to clear, so the reset costs
  // no render on the common path (typing into an all-default tree).
  React.useEffect(() => { setSearchOverrides((prev) => (Object.keys(prev).length ? {} : prev)); }, [q]);
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
  // While a query is active every surviving group HOLDS a match, so the
  // default flips to open — a match hidden inside a collapsed 2019 is the
  // same as no match at all. The chevrons still work: an explicit toggle
  // lands in the search map and outlives only this query.
  const isOpen = (id) => {
    if (q) return id in searchOverrides ? searchOverrides[id] : true;
    return id in overrides ? overrides[id] : defaultOpen(id);
  };
  const toggle = (id) => {
    const next = !isOpen(id);
    if (q) setSearchOverrides((prev) => ({ ...prev, [id]: next }));
    else setOverrides((prev) => ({ ...prev, [id]: next }));
  };

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

  /* Resume chips on history rows — BACKLOG [26]'s named remainder, closed by
     C2-C [C6]. A history row now carries the SAME chip its index card shows —
     "62% · ~3 min left" — because History is where a reader goes to pick up
     what they left, and a row that says only "2h ago" cannot tell them which
     one is unfinished.

     ONE key space for both row kinds. `bookItemsFor` is the same resolver
     progress-stats and the index cards use, and it is keyed by the SOURCE id
     that the read tracker keys on: a Bible/Matthew chapter's bookId (item key
     = chapter number), or a collection's `readKey` (item key = letter/entry
     slug), which COL_BY_INDEX_SC resolves from the `volumeScreen` every letter
     row already stores. So a row, its index card and the tracker's
     `v1:<source>:<item>` record can never disagree.

     Study-chapter rows stay chipless: their index has no chip to match.

     Lazy per rendered row, as the auto-expanded day groups require — a
     source's item map is built on FIRST touch and only for sources that
     actually appear in rendered rows, so opening History does not sweep every
     corpus. Collapsed groups never call this at all. */
  const chipWpm = readingChipWpm();
  const sourceItemCache = new Map();
  const sourceItem = (sourceId, itemKey) => {
    if (!sourceId || itemKey == null || typeof bookItemsFor !== 'function') return null;
    if (!sourceItemCache.has(sourceId)) {
      const byKey = new Map();
      try {
        for (const row of bookItemsFor(sourceId)) byKey.set(String(row.key), row.item);
      } catch (_e) { /* an unloaded corpus simply yields no chip */ }
      sourceItemCache.set(sourceId, byKey);
    }
    return sourceItemCache.get(sourceId).get(String(itemKey)) || null;
  };
  const entryChip = (entry) => {
    if (!entry) return null;
    let sourceId = null;
    let itemKey = null;
    if (entry.type === 'chapter') {
      sourceId = entry.bookId;
      itemKey = entry.chapterNum;
    } else if (entry.type === 'letter') {
      const col = entry.volumeScreen && typeof COL_BY_INDEX_SC !== 'undefined'
        ? COL_BY_INDEX_SC.get(entry.volumeScreen) : null;
      if (!col || !col.readKey) return null;   // a legacy row without volumeScreen
      sourceId = col.readKey;
      itemKey = entry.letterId;
    } else {
      return null;
    }
    const item = sourceItem(sourceId, itemKey);
    if (!item) return null;
    const key = (typeof READ_VERSION_ID === 'string')
      ? `${READ_VERSION_ID}:${sourceId}:${itemKey}` : null;
    return readingMinChip(item, key, chipWpm);
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
        {/* Deduplicate counts the day's REAL entries; while a query is
            filtering them the number on the button would describe a subset
            and the press would act on the whole day. Maintenance belongs to
            the unfiltered view. */}
        {dOpen && dupes > 0 && !q && (
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
              <HistoryEntryCard key={entry.key + ':' + entry.ts + ':' + i} entry={entry} onSelect={onSelect} chip={entryChip(entry)} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ScreenLayout navChildren={LibraryNav({
      // hide:['history'] — you are already on History.
      onBack, backTitle: 'Back', hide: ['history'],
      onSettings, onSearch, theme, onThemeChange,
    })}>
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
        {/* Same search box, same class, same placeholder grammar as Notes /
            Bookmarks / Links. Absent while there is nothing to search. */}
        {history.length > 0 && (
          <input
            className="notes-index-search"
            type="search"
            placeholder="Search history…"
            aria-label="Search history"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {history.length > 0 && q && (
          <div className="history-search-count" aria-live="polite">
            {matches.length === 0
              ? 'No visits match'
              : `${matches.length} ${matches.length === 1 ? 'visit' : 'visits'} match`}
          </div>
        )}
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

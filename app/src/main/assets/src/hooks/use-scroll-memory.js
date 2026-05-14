function useScrollMemory(screen, bookId, chapterNum, letterId, studyId, studyChapterId, activeTab, activeTabIdx, updateActiveTab, tabsOverviewOpenRef) {
  const getScrollKey = React.useCallback((scr, bid, cnum, lid, sid, scid) => {
    if (scr === \"matthew-ch\" || scr === \"bible-ch\") return bid + \u0027-\u0027 + cnum;
    if (scr === \"bible-study-chapter\") return \u0027study-\u0027 + (sid || \u0027\u0027) + \u0027-\u0027 + (scid || \u0027\u0027);
    if (scr === \"hm-letter\") return \u0027entry-\u0027 + lid;
    var _sc = COL_BY_LETTER_SC.get(scr);
    if (_sc) {
      var pfx = _sc.kind === 'holy-days' ? 'holyday' : _sc.kind === 'letter' ? 'letter' : _sc.kind;
      return pfx + \u0027-\u0027 + lid;
    }
    return scr;
  }, []);

  const scrollKeyRef \u003d React.useRef(getScrollKey(screen, bookId, chapterNum, letterId, studyId, studyChapterId));

  const flushScrollToActiveTab = React.useCallback(() => {
    if (tabsOverviewOpenRef.current) return;
    const key \u003d scrollKeyRef.current;
    if (!key || !window.__scrollEl) return;
    const y \u003d window.__scrollEl.scrollTop;
    const max \u003d window.__scrollEl.scrollHeight - window.__scrollEl.clientHeight;
    const pct \u003d max \u003e 0 ? y / max : 0;
    updateActiveTab((cur) => {
      const prev = cur.scrollPositions[key];
      if (prev && prev.y === y) return cur;
      return {
        ...cur,
        scrollPositions: { ...cur.scrollPositions, [key]: { y, pct } }
      };
    });
  }, [updateActiveTab]);

  React.useEffect(() => {
    const key = getScrollKey(screen, bookId, chapterNum, letterId, studyId, studyChapterId);
    scrollKeyRef.current = key;
    if (window.__scrollEl) {
      const saved = activeTab && activeTab.scrollPositions && activeTab.scrollPositions[key];
      const savedY = (saved && typeof saved.y === 'number') ? saved.y : 0;
      window.__scrollEl.scrollTop = savedY;
    }
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, activeTabIdx]); // include activeTabIdx to restore on switch

  return { flushScrollToActiveTab, getScrollKey, scrollKeyRef };
}

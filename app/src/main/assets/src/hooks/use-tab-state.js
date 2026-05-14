function _validateTabState(s) {
  const LETTER_SCREEN_SET = new Set(COLLECTIONS.map(c => c.letterScreen).concat(['bible-study-chapter']));
  if ((s.screen === "matthew-ch" || s.screen === "bible-ch") && s.chapterNum == null) s.screen = "home";
  if (/^vot-(one|three|four|five|six|seven|timothy|flock|rebuke)-letter$/.test(s.screen) && !s.letterId) s.screen = "home";
  if (s.screen === "vot-letter" && !s.letterId) s.screen = "home";
  if (s.screen === "hm-letter" && !s.letterId) s.screen = "home";
  if (/^(wtlb-one-entry|wtlb-two-entry|blessed-entry|holy-days-entry)$/.test(s.screen) && !s.letterId) s.screen = "home";
  if (s.screen === "garden-view" && s.gardenPage == null) s.screen = "home";
  if (/^vot-(one|three|four|five|six|seven|timothy|flock|rebuke)-index$/.test(s.screen)) s.screen = "volumes-home";
  if ((s.screen === "matthew-idx" || s.screen === "bible-idx") && !s.bookId) s.screen = "home";
  if (s.screen === "search") s.screen = "home";
  if (s.screen === "scripture-genre" && !s.genreId) s.screen = "scriptures-home";
  if (s.screen === "bible-study-chapter" && (!s.studyId || !s.studyChapterId)) s.screen = "studies-home";
  if (s.screen === "bible-study-index" && !s.studyId) s.screen = "studies-home";
  return s;
}

const DEFAULT_TAB = {
  screen: 'home',
  bookId: null, chapterNum: null, letterId: null,
  studyId: null, studyChapterId: null,
  fromStudies: false, genreId: null,
  mode: 'pdf', showStudy: true,
  surpriseAnchor: null,
  fromLetterStack: [],
  titleFocusHidden: false, headingsFocusHidden: false,
  fromMatthewCh: null, fromWtlb: null, fromSearch: false,
  searchQuery: '', searchOrigin: null, searchScope: null, searchContext: null,
  navOrigin: null,
  gardenPage: 1,
  scrollPositions: {}
};

function useTabState(saved) {
  const [tabs, setTabs] = React.useState(() => {
    if (Array.isArray(saved.tabs) && saved.tabs.length > 0) {
      return saved.tabs.map((t) => ({ ...DEFAULT_TAB, ...t }));
    }
    return [{
      ...DEFAULT_TAB,
      screen: saved.screen || 'home',
      bookId: saved.bookId || null,
      chapterNum: saved.chapterNum != null ? saved.chapterNum : null,
      letterId: saved.letterId || null,
      studyId: saved.studyId || null,
      studyChapterId: saved.studyChapterId || null,
      fromStudies: saved.fromStudies || false,
      genreId: saved.genreId || null,
      mode: saved.mode || 'pdf',
      showStudy: saved.showStudy !== false,
      gardenPage: saved.gardenPage || 1
    }];
  });

  const [activeTabIdx, setActiveTabIdx] = React.useState(() => {
    const idx = typeof saved.activeTabIdx === 'number' ? saved.activeTabIdx : 0;
    return Math.max(0, Math.min(idx, 998));
  });

  const activeTab = tabs[activeTabIdx] || tabs[0];

  const updateActiveTab = React.useCallback((patchOrFn) => {
    setTabs((prev) => prev.map((t, i) => {
      if (i !== activeTabIdx) return t;
      const patch = typeof patchOrFn === 'function' ? patchOrFn(t) : patchOrFn;
      return { ...t, ...patch };
    }));
  }, [activeTabIdx]);

  const _uatRef = React.useRef(updateActiveTab);
  _uatRef.current = updateActiveTab;
  const _tabSetters = React.useRef({});

  const tabField = (key) => {
    if (!_tabSetters.current[key]) {
      _tabSetters.current[key] = (val) => _uatRef.current((cur) => ({
        [key]: typeof val === 'function' ? val(cur[key]) : val
      }));
    }
    return [activeTab[key], _tabSetters.current[key]];
  };

  return {
    tabs, setTabs,
    activeTabIdx, setActiveTabIdx,
    activeTab,
    updateActiveTab,
    tabField
  };
}

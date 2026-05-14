function App() {
  // --- 1. INITIALIZATION & PERSISTED STATE ---
  const saved = React.useMemo(() => {
    try {
      const s = JSON.parse(localStorage.getItem("vot-state") || "{}");
      _validateTabState(s);
      if (Array.isArray(s.tabs)) s.tabs.forEach(_validateTabState);
      return s;
    } catch (e) {return {};}
  }, []);

  const { tabs, setTabs, activeTabIdx, setActiveTabIdx, activeTab, updateActiveTab, tabField } = useTabState(saved);

  // --- 2. BASE STATE & TAB FIELDS ---
  const [screen, setScreen] = tabField('screen');
  const [bookId, setBookId] = tabField('bookId');
  const [chapterNum, setChapterNum] = tabField('chapterNum');
  const [letterId, setLetterId] = tabField('letterId');
  const [studyId, setStudyId] = tabField('studyId');
  const [studyChapterId, setStudyChapterId] = tabField('studyChapterId');
  const [fromStudies, setFromStudies] = tabField('fromStudies');
  const [mode, setMode] = tabField('mode');
  const [showStudy, setShowStudy] = tabField('showStudy');
  const [genreId, setGenreId] = tabField('genreId');
  const [surpriseAnchor, setSurpriseAnchor] = tabField('surpriseAnchor');
  const [fromSearch, setFromSearch] = tabField('fromSearch');
  const [fromMatthewCh, setFromMatthewCh] = tabField('fromMatthewCh');
  const [fromWtlb, setFromWtlb] = tabField('fromWtlb');
  const [searchQuery, setSearchQuery] = tabField('searchQuery');
  const [searchOrigin, setSearchOrigin] = tabField('searchOrigin');
  const [searchScope, setSearchScope] = tabField('searchScope');
  const [searchContext, setSearchContext] = tabField('searchContext');
  const [navOrigin, setNavOrigin] = tabField('navOrigin');
  const [fromLetterStack, setFromLetterStack] = tabField('fromLetterStack');
  const [gardenPage, setGardenPage] = tabField('gardenPage');
  const [titleFocusHidden, setTitleFocusHidden] = tabField('titleFocusHidden');
  const [headingsFocusHidden, setHeadingsFocusHidden] = tabField('headingsFocusHidden');

  // --- 3. UI & PERSISTENT STATE ---
  const [theme, setTheme] = React.useState(saved.theme || "dark");
  const [translationTick, setTranslationTick] = React.useState(0);
  const [hlTick, setHlTick] = React.useState(0);
  const [annChip, setAnnChip] = React.useState(null);
  const [linkSidebarKey, setLinkSidebarKey] = React.useState(null);
  const [linkPickerSource, setLinkPickerSource] = React.useState(null);
  const [linkRefineRequest, setLinkRefineRequest] = React.useState(null);
  const [lastLinkCreated, setLastLinkCreated] = React.useState(null);
  const [noteSheetTarget, setNoteSheetTarget] = React.useState(null);
  const [notebookPickerTarget, setNotebookPickerTarget] = React.useState(null);
  const [multiNotePayload, setMultiNotePayload] = React.useState(null);
  const [gardenWarningOpen, setGardenWarningOpen] = React.useState(false);
  const [lastReadChapters, setLastReadChapters] = React.useState(saved.lastReadChapters || {});
  const [lastReadLetterMap, setLastReadLetterMap] = React.useState(() => {
    const map = { ...(saved.lastReadLetterMap || {}) };
    if (saved.lastReadLetter && !map.two) map.two = saved.lastReadLetter;
    if (saved.lastReadLetterV1 && !map.one) map.one = saved.lastReadLetterV1;
    return map;
  });
  const [activeReadKeyRaw, setActiveReadKeyRaw] = React.useState(saved.activeReadKey || null);
  const [readItems, setReadItems] = React.useState(saved.readItems || {});
  const [readHistory, setReadHistory] = React.useState(() => {
    try {return JSON.parse(localStorage.getItem('vot-history') || '[]');} catch (e) {return [];}
  });
  const [showWelcome, setShowWelcome] = React.useState(() => {
    try {return !localStorage.getItem('vot-welcomed');} catch (e) {return true;}
  });
  const [isOnline, setIsOnline] = React.useState(false);
  const [tabThumbnails, setTabThumbnails] = React.useState({});
  const [tabsOverviewOpen, setTabsOverviewOpen] = React.useState(false);
  const [tabActionIdx, setTabActionIdx] = React.useState(null);
  const [disableTabsPromptOpen, setDisableTabsPromptOpen] = React.useState(false);
  const [clearAllStage, setClearAllStage] = React.useState(0);

  const [settings, setSettings] = React.useState(() => {
    const savedS = saved.settings || {};
    const migrated = {};
    if ('showChrome' in savedS) { if (savedS.showChrome === false) { migrated.showChapterTitle = false; migrated.showSectionHeadings = false; } }
    if ('showChapterSummary' in savedS && savedS.showChapterSummary === false) { migrated.showChapterTitle = false; }
    return {
      showReadingDot: false, showSurpriseButton: false, markAsRead: false,
      showProgressBar: true, searchUseStopWords: true, searchCorpus: 'all',
      haptic: true, keepScreenOn: true, scriptureLayout: "genre", gardenTier: GARDEN_DEFAULT_TIER,
      showSettingsGear: false, translation: "nkjv", restoredNames: false,
      showChapterTitle: true, showSectionHeadings: true, showInlineEchoes: true,
      tabsEnabled: false, searchEnabled: true, historyEnabled: true,
      historyInNav: false, arrowLayout: "split", ...savedS, ...migrated
    };
  });

  // --- 4. REFS ---
  const activeTabIdxRef = React.useRef(activeTabIdx); activeTabIdxRef.current = activeTabIdx;
  const tabsRef = React.useRef(tabs); tabsRef.current = tabs;
  const captureInFlightRef = React.useRef(false);
  const thumbnailsRef = React.useRef({});
  const tabsOverviewOpenRef = React.useRef(false); tabsOverviewOpenRef.current = tabsOverviewOpen;
  const navOriginRef = React.useRef(null); navOriginRef.current = navOrigin;
  const searchOriginRef = React.useRef(null); searchOriginRef.current = searchOrigin;
  const fromSearchRef = React.useRef(false); fromSearchRef.current = fromSearch;
  const fromStudiesRef = React.useRef(false); fromStudiesRef.current = fromStudies;
  const fromMatthewChRef = React.useRef(null); fromMatthewChRef.current = fromMatthewCh;
  const fromLetterRef = React.useRef(null); fromLetterRef.current = fromLetterStack;
  const studyIdRef = React.useRef(null); studyIdRef.current = studyId;
  const fromWtlbRef = React.useRef(null); fromWtlbRef.current = fromWtlb;
  const screenRef = React.useRef(screen); screenRef.current = screen;
  const bookIdRef = React.useRef(bookId); bookIdRef.current = bookId;
  const genreIdRef = React.useRef(genreId); genreIdRef.current = genreId;
  const _navToLinkRef = React.useRef(null);
  const lastTabCloseStrikes = React.useRef(0);

  // --- 5. LOGIC HOOKS RETURN PRIMITIVES ---
  const { commitDwellNow, cancelDwell, scheduleDwell, pauseDwell, setActiveReadKey } = useDwellTimer(settings, setActiveReadKeyRaw);
  const { flushScrollToActiveTab, getScrollKey, scrollKeyRef } = useScrollMemory(screen, bookId, chapterNum, letterId, studyId, studyChapterId, activeTab, activeTabIdx, updateActiveTab, tabsOverviewOpenRef);

  // --- 6. HELPERS & CALLBACKS ---
  const VERSION_ID = "v1";
  const getReadKey = React.useCallback((bid, cid) => `${VERSION_ID}:${bid}:${cid}`, []);
  const isRead = React.useCallback((bid, cid) => !!readItems[getReadKey(bid, cid)], [readItems, getReadKey]);

  const goHome = React.useCallback(() => {setFromSearch(false);setFromWtlb(null);setFromLetterStack([]);window.__pendingHighlight = null;setScreen("home");setBookId(null);setChapterNum(null);}, [setFromSearch, setFromWtlb, setFromLetterStack, setScreen, setBookId, setChapterNum]);
  const goScripturesHome = React.useCallback(() => {setScreen("scriptures-home");setBookId(null);setChapterNum(null);setGenreId(null);}, [setScreen, setBookId, setChapterNum, setGenreId]);
  const goScriptureGenre = React.useCallback((gid) => {setGenreId(gid);setScreen("scripture-genre");}, [setGenreId, setScreen]);
  const goVolumesHome = React.useCallback(() => {setScreen("volumes-home");}, [setScreen]);
  const goStudiesHome = React.useCallback(() => {setScreen("studies-home");}, [setScreen]);

  const goSearchOrigin = React.useCallback(() => {
    const o = searchOriginRef.current;
    if (o) {setSearchOrigin(null);setScreen(o.screen);if (o.bookId !== undefined) setBookId(o.bookId);if (o.chapterNum !== undefined) setChapterNum(o.chapterNum);if (o.letterId !== undefined) setLetterId(o.letterId);} else goHome();
  }, [setSearchOrigin, setScreen, setBookId, setChapterNum, setLetterId, goHome]);

  const goNavOrigin = React.useCallback(() => {
    const o = navOriginRef.current; setNavOrigin(null);
    if (o) {setScreen(o.screen);if (o.bookId !== undefined) setBookId(o.bookId);if (o.chapterNum !== undefined) setChapterNum(o.chapterNum);if (o.letterId !== undefined) setLetterId(o.letterId);if (o.studyId !== undefined) setStudyId(o.studyId);if (o.studyChapterId !== undefined) setStudyChapterId(o.studyChapterId);} else goHome();
  }, [setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId, setNavOrigin, goHome]);

  const setLastReadForVol = React.useCallback((volId, id) => { setLastReadLetterMap((prev) => ({ ...prev, [volId]: id })); }, [setLastReadLetterMap]);

  const markRead = React.useCallback((bid, cid) => { if (!settings.markAsRead) return; const key = getReadKey(bid, cid); if (!readItems[key]) setReadItems((prev) => ({ ...prev, [key]: true })); }, [settings.markAsRead, readItems, getReadKey, setReadItems]);
  const unmarkRead = React.useCallback((bid, cid) => { const key = getReadKey(bid, cid); setReadItems((prev) => {const next = { ...prev };delete next[key];return next;}); }, [getReadKey, setReadItems]);
  const clearAllProgress = React.useCallback(() => setReadItems({}), [setReadItems]);

  const goColIdx = React.useCallback((volKey) => { const c = COL_BY_KEY.get(volKey); if (c && c.indexScreen) setScreen(c.indexScreen); }, [setScreen]);

  const captureActiveTabThumbnail = React.useCallback(() => {
    if (!settings.tabsEnabled || tabsOverviewOpenRef.current || captureInFlightRef.current) return;
    const tab = tabsRef.current[activeTabIdxRef.current]; if (!tab) return;
    const key = tabContentKey(tab); const navEl = document.querySelector('.top-nav'); const navHeightDp = navEl ? Math.round(navEl.getBoundingClientRect().height) : 0;
    const applyThumb = (dataUrl) => { if (!dataUrl) return; setTabThumbnails((prev) => ({ ...prev, [key]: dataUrl })); idbPut(key, dataUrl); };
    document.body.classList.add('capturing-thumb'); void document.body.offsetHeight;
    if (window.AndroidBridge && typeof window.AndroidBridge.takeScreenshot === 'function') {
      captureInFlightRef.current = true; try { const dataUrl = window.AndroidBridge.takeScreenshot(navHeightDp, 1440, 90); applyThumb(dataUrl); } catch (e) {} captureInFlightRef.current = false; document.body.classList.remove('capturing-thumb'); return;
    }
    if (typeof html2canvas !== 'function') return;
    captureInFlightRef.current = true; const bg = document.body.classList.contains('light') ? '#f7f2e8' : '#07070e';
    try {
      html2canvas(document.body, { backgroundColor: bg, scale: Math.min(window.devicePixelRatio || 1, 2), useCORS: true, logging: false, allowTaint: false, imageTimeout: 2000, ignoreElements: (el) => el.classList && (el.classList.contains('tabs-overview-layer') || el.classList.contains('top-nav') || el.classList.contains('back-hint-row') || el.classList.contains('chapter-nav-sticky') || el.classList.contains('reading-dot-global') || el.classList.contains('surprise-fab') || el.classList.contains('mode-toggle-wrap'))
      }).then((canvas) => {
        const MAX_DIM = 1440; const w = canvas.width, h = canvas.height; const scale = Math.min(MAX_DIM / w, MAX_DIM / h, 1);
        let out = canvas; if (scale < 1) { const c2 = document.createElement('canvas'); c2.width = Math.round(w * scale); c2.height = Math.round(h * scale); const ctx = c2.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(canvas, 0, 0, c2.width, c2.height); out = c2; }
        applyThumb(out.toDataURL('image/jpeg', 0.90));
      }).catch(() => {}).finally(() => { captureInFlightRef.current = false; document.body.classList.remove('capturing-thumb'); });
    } catch (e) { captureInFlightRef.current = false; document.body.classList.remove('capturing-thumb'); }
  }, [settings.tabsEnabled, setTabThumbnails]);

  const goTabs = React.useCallback(() => { if (!settings.tabsEnabled) return; flushScrollToActiveTab(); captureActiveTabThumbnail(); setTabsOverviewOpen(true); }, [settings.tabsEnabled, captureActiveTabThumbnail, flushScrollToActiveTab, setTabsOverviewOpen]);

  const goSearch = React.useCallback(() => {
    setSearchOrigin({ screen, bookId, chapterNum, letterId });
    let ctx = null; const books = typeof BOOKS !== 'undefined' ? BOOKS : {};
    if (screen === 'matthew-ch') ctx = { kind: 'book', bookId: 'matthew', label: 'Matthew' };
    else if (screen === 'bible-ch' && bookId) { const bk = books[bookId]; ctx = { kind: 'book', bookId, label: bk ? bk.title : bookId }; }
    else { const _scCol = COL_BY_LETTER_SC.get(screen); if (_scCol) ctx = { kind: 'volume', volumeId: _scCol.searchVolId, label: _scCol.label }; }
    setSearchContext(ctx); setSearchScope(null);
    if (window.__pendingSearchQuery) { setSearchQuery(window.__pendingSearchQuery); window.__pendingSearchQuery = null; }
    setScreen("search");
  }, [screen, bookId, chapterNum, letterId, setSearchOrigin, setSearchContext, setSearchScope, setSearchQuery, setScreen]);

  const selectStudyChapter = React.useCallback((sid, chId) => {
    const studies = (typeof BIBLE_STUDIES !== 'undefined' ? BIBLE_STUDIES : []);
    const s = studies.find(st => st.id === sid); if (!s) return;
    setStudyId(sid); setStudyChapterId(chId); setActiveReadKey(`bible-study-${s.slug}`, () => setLastReadChapters((prev) => ({ ...prev, [`bible-study-${s.slug}`]: chId }))); setScreen("bible-study-chapter");
  }, [setActiveReadKey, setStudyId, setStudyChapterId, setLastReadChapters, setScreen]);

  const selectStudy = React.useCallback((id) => {
    const studies = typeof BIBLE_STUDIES !== 'undefined' ? BIBLE_STUDIES : [];
    const study = studies.find(s => s.id === id); if (!study || study.locked || !study.chapters?.length) return;
    setStudyId(id);
    if (study.chapters.length === 1 || study.singlePage) { const ch = study.chapters[0]; selectStudyChapter(id, ch.id); }
    else { setStudyChapterId(null); setActiveReadKey(`bible-study-${study.slug}`); setScreen("bible-study-index"); }
  }, [setActiveReadKey, selectStudyChapter, setStudyId, setStudyChapterId, setScreen]);

  const selectMatthewCh = React.useCallback((num) => {setChapterNum(num);setScreen("matthew-ch");setActiveReadKey("matthew", () => setLastReadChapters((prev) => ({ ...prev, matthew: num })));}, [setActiveReadKey, setChapterNum, setScreen, setLastReadChapters]);
  const selectBibleCh = React.useCallback((num) => {setChapterNum(num);setScreen("bible-ch");setActiveReadKey(bookId, () => setLastReadChapters((prev) => ({ ...prev, [bookId]: num })));}, [bookId, setActiveReadKey, setChapterNum, setScreen, setLastReadChapters]);
  const goMatthewIdx = React.useCallback(() => {setChapterNum(null);setScreen("matthew-idx");}, [setChapterNum, setScreen]);
  const goBibleIdx = React.useCallback(() => {setChapterNum(null);setScreen("bible-idx");}, [setChapterNum, setScreen]);

  const openLinkPicker = React.useCallback((selInfo) => {
    const hlKey = typeof selInfo === 'string' ? selInfo : selInfo.hlKey; if (!hlKey) return;
    const parts = hlKey.split(':'); let label = hlKey;
    if (parts[0] === 'bible') { const b = (typeof BOOKS !== 'undefined' ? BOOKS[parts[1]] : null); label = (b ? b.title : parts[1]) + ' ' + parts[2] + ':' + parts[3]; }
    else if (parts[0] === 'study') { const m = parts[1].match(/^(.+)-(\d+)$/); if (m) label = (m[1].charAt(0).toUpperCase() + m[1].slice(1)) + ' ' + m[2] + (parts[2] && parts[2] !== '0' ? ':' + parts[2] : ''); }
    else if (parts[0] === 'letter' || parts[0] === 'wtlb' || parts[0] === 'blessed' || parts[0] === 'holy-days') { const ctx = findEntryContext(parts[1], parts[0]); if (ctx && ctx.title) label = ctx.title; }
    const src = typeof selInfo === 'string' ? { key: hlKey, label } : { key: hlKey, label, start: selInfo.start, end: selInfo.end, text: selInfo.text };
    setLinkPickerSource(src);
  }, [setLinkPickerSource]);

  const openNoteSheet = React.useCallback((groupId, startInEditMode) => { setNoteSheetTarget({ groupId, startInEditMode: !!startInEditMode }); setAnnChip(null); }, [setNoteSheetTarget, setAnnChip]);
  const closeNoteSheet = React.useCallback(() => setNoteSheetTarget(null), [setNoteSheetTarget]);
  const openLinkSidebar = React.useCallback((hlKey) => setLinkSidebarKey(hlKey), [setLinkSidebarKey]);
  const closeLinkSidebar = React.useCallback(() => setLinkSidebarKey(null), [setLinkSidebarKey]);
  const navigateToLink = React.useCallback((endpoint, meta) => { if (_navToLinkRef.current) _navToLinkRef.current(endpoint, meta); }, []);

  const openInAppLetter = React.useCallback((target, meta) => {
    if (!target || !target.letterTitle) return;
    const dest = resolveVotLetter(target.collection, target.letterTitle); if (!dest) return;
    let destSnapshot = null;
    if (dest.isStudy) destSnapshot = { screen: 'bible-study-chapter', bookId: null, chapterNum: null, letterId: null, studyId: dest.studyId, studyChapterId: dest.studyChapterId };
    else destSnapshot = { screen: dest.screen, bookId: null, chapterNum: null, letterId: dest.id, studyId: null, studyChapterId: null };
    pushFromLetter({ sourceScreen: screen, sourceLetterId: letterId, sourceBookId: bookId, sourceChapterNum: chapterNum, sourceStudyId: studyId, sourceStudyChapterId: studyChapterId, sourceLetterTitle: meta && meta.sourceLetterTitle ? meta.sourceLetterTitle : null, sourceVolumeLabel: meta && meta.sourceVolumeLabel ? meta.sourceVolumeLabel : null, destSnapshot: destSnapshot });
    if (target.excerpt) window.__pendingHighlight = { excerpt: target.excerpt, letterId: dest.id }; else window.__pendingHighlight = null;
    if (dest.isStudy) { setStudyId(dest.studyId); setStudyChapterId(dest.studyChapterId); setActiveReadKey(dest.activeReadKey); }
    else { setLetterId(dest.id); setActiveReadKey("vol:" + dest.volKey, () => setLastReadForVol(dest.volKey, dest.id)); }
    setScreen(dest.screen);
  }, [screen, letterId, bookId, chapterNum, studyId, studyChapterId, setActiveReadKey, setLastReadForVol, setStudyId, setStudyChapterId, setLetterId, setScreen]);

  const handleSurprise = React.useCallback(() => {
    const mat = typeof MATTHEW !== 'undefined' ? MATTHEW : {chapters:[]};
    const bbl = typeof BIBLE_BOOK_LIST !== 'undefined' ? BIBLE_BOOK_LIST : [];
    const pool = [
      ...mat.chapters.map((ch) => ({ _k: "matthew", num: ch.num })),
      ...bbl.flatMap((b) => b ? b.chapters.map((ch) => ({ _k: "bible", bookId: b.id, num: ch.num })) : []),
      ..._studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).flatMap((s) => s.chapters.map((ch) => ({ _k: "study", studyId: s.id, chId: ch.id })))
    ];
    for (const col of COLLECTIONS) { if (!col.surpriseType) continue; for (const l of colLetterArr(col)) pool.push({ _k: "col", volKey: col.volKey, id: l.id }); }
    const pick = pool[Math.floor(Math.random() * pool.length)]; if (!pick) return;
    setSurpriseAnchor(null);
    if (pick._k === "matthew") { selectMatthewCh(pick.num); }
    else if (pick._k === "bible") { setBookId(pick.bookId); setChapterNum(pick.num); setScreen("bible-ch"); }
    else if (pick._k === "study") selectStudyChapter(pick.studyId, pick.chId);
    else { const col = COL_BY_KEY.get(pick.volKey); if (!col) return; setLetterId(pick.id); setActiveReadKey("vol:" + col.volKey, () => setLastReadForVol(col.volKey, pick.id)); setScreen(col.letterScreen); }
  }, [selectMatthewCh, selectStudyChapter, setBookId, setChapterNum, setScreen, setLetterId, setActiveReadKey, setLastReadForVol]);

  const goToLastRead = React.useCallback(() => {
    if (!activeReadKeyRaw) return;
    if (activeReadKeyRaw.startsWith("vol:")) { const volKey = activeReadKeyRaw.slice(4); const col = COL_BY_KEY.get(volKey); const lid = lastReadLetterMap[volKey] || null; if (lid && col) {setLetterId(lid);setScreen(col.letterScreen);} }
    else if (activeReadKeyRaw.startsWith("bible-study-")) { const slug = activeReadKeyRaw.slice("bible-study-".length); const chId = lastReadChapters[activeReadKeyRaw]; const studies = typeof BIBLE_STUDIES !== 'undefined' ? BIBLE_STUDIES : []; const study = studies.find(s => s.slug === slug) || null; if (study && chId) selectStudyChapter(study.id, chId); else if (study) selectStudy(study.id); }
    else { const ch = lastReadChapters[activeReadKeyRaw]; if (ch) {setBookId(activeReadKeyRaw);setChapterNum(ch);setScreen(activeReadKeyRaw === 'matthew' ? 'matthew-ch' : 'bible-ch');} }
  }, [activeReadKeyRaw, lastReadLetterMap, lastReadChapters, selectStudyChapter, selectStudy, setLetterId, setScreen, setBookId, setChapterNum]);

  const handleSearchCommand = React.useCallback((action) => {
    if (action === 'home') setScreen('home');
    else if (action === 'settings') goSettings();
    else if (action === 'scriptures') setScreen('scriptures-home');
    else if (action === 'volumes') setScreen('volumes-home');
    else if (action === 'clear-query') setSearchQuery('');
    else if (action === 'rebuild-index') { if (window.VotSearch) window.VotSearch.rebuild().catch(() => {}); }
    else if (action === 'random') handleSurprise();
  }, [setScreen, goSettings, setSearchQuery, handleSurprise]);

  const handleScriptureSelect = React.useCallback((id, clearGenre) => {
    if (clearGenre) setGenreId(null);
    if (id === "matthew") {setBookId("matthew");setChapterNum(null);setScreen("matthew-idx");}
    else if (typeof BOOKS !== 'undefined' && BOOKS[id]) {setBookId(id);if (BOOKS[id].chapters.length === 1) {setChapterNum(1);setScreen("bible-ch");} else {setChapterNum(null);setScreen("bible-idx");}}
  }, [setGenreId, setBookId, setChapterNum, setScreen]);

  const handleVolumeSelect = React.useCallback((id) => {
    const col = COL_BY_CARD.get(id); if (col && col.indexScreen) { setScreen(col.indexScreen); return; }
    if (id === "garden") { let acked = false; try {acked = !!localStorage.getItem('vot-garden-warning-acked');} catch (e) {} if (acked) setScreen("garden-view"); else setGardenWarningOpen(true); }
  }, [setScreen, setGardenWarningOpen]);

  const handleSelect = React.useCallback((id) => {
    if (id === "scriptures") goScripturesHome(); else if (id === "volumes") goVolumesHome();
    else if (id === "studies") {setFromStudies(false);setGenreId(null);goStudiesHome();}
    else if (id === "library") goLibrary();
  }, [goScripturesHome, goVolumesHome, goStudiesHome, goLibrary, setFromStudies, setGenreId]);

  const toggleTab = React.useCallback(() => { if (tabsOverviewOpen) setTabsOverviewOpen(false); else goTabs(); }, [tabsOverviewOpen, goTabs, setTabsOverviewOpen]);

  const closeTab = React.useCallback((idx) => {
    setTabs((prev) => {
      if (prev.length <= 1) { lastTabCloseStrikes.current = lastTabCloseStrikes.current + 1; if (lastTabCloseStrikes.current >= 3) { setDisableTabsPromptOpen(true); lastTabCloseStrikes.current = 0; } const reset = { ...DEFAULT_TAB }; setActiveTabIdx(0); return [reset]; }
      lastTabCloseStrikes.current = 0; const next = prev.filter((_, i) => i !== idx);
      setActiveTabIdx((prevIdx) => { if (idx < prevIdx) return prevIdx - 1; if (idx === prevIdx) return Math.max(0, Math.min(prevIdx, next.length - 1)); return prevIdx; });
      return next;
    });
  }, [setTabs, setDisableTabsPromptOpen, setActiveTabIdx]);

  const openNewTab = React.useCallback(() => { setTabs((prev) => { if (prev.length >= MAX_TABS) return prev; const next = [...prev, { ...DEFAULT_TAB }]; setActiveTabIdx(next.length - 1); return next; }); }, [setTabs, setActiveTabIdx]);
  const switchToTab = React.useCallback((idx) => { cancelDwell(); setActiveTabIdx(idx); }, [cancelDwell, setActiveTabIdx]);
  const closeOtherTabs = React.useCallback((keepIdx) => { setTabs((prev) => { if (prev.length <= 1) return prev; const kept = prev[keepIdx]; if (!kept) return prev; setActiveTabIdx(0); return [kept]; }); }, [setTabs, setActiveTabIdx]);
  const closeTabsToTheRight = React.useCallback((keepIdx) => { setTabs((prev) => { if (keepIdx >= prev.length - 1) return prev; setActiveTabIdx((cur) => Math.min(cur, keepIdx)); return prev.slice(0, keepIdx + 1); }); }, [setTabs, setActiveTabIdx]);
  const closeAllTabs = React.useCallback(() => { setTabs([{ ...DEFAULT_TAB }]); setActiveTabIdx(0); setTabThumbnails({}); }, [setTabs, setActiveTabIdx, setTabThumbnails]);

  const deduplicateTabs = React.useCallback(() => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const seen = new Set(); const keep = []; let newActiveIdx = 0;
      prev.forEach((t, i) => { const k = tabContentKey(t); if (!seen.has(k)) { seen.add(k); if (i === activeTabIdx) newActiveIdx = keep.length; keep.push(t); } else if (i === activeTabIdx) { let idx = keep.findIndex((x) => tabContentKey(x) === k); if (idx >= 0) newActiveIdx = idx; } });
      setActiveTabIdx(newActiveIdx); return keep;
    });
  }, [activeTabIdx, setTabs, setActiveTabIdx]);

  const toggleSetting = React.useCallback((key) => setSettings((prev) => ({ ...prev, [key]: !prev[key] })), [setSettings]);
  const updateSetting = React.useCallback((key, val) => setSettings((prev) => ({ ...prev, [key]: val })), [setSettings]);

  // --- 9. INTEGRATION HOOKS (Now safe) ---
  useAndroidBack(tabsOverviewOpenRef, setTabsOverviewOpen, cancelDwell, screenRef, fromLetterRef, setFromLetterStack, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId, setScreen, goNavOrigin, goHome, goSearchOrigin, goScripturesHome, goStudiesHome, fromSearchRef, fromStudiesRef, fromWtlbRef, bookIdRef, genreIdRef);

  // --- 10. EFFECTS ---
  React.useEffect(() => { window.__openNote = openNoteSheet; return () => { delete window.__openNote; }; }, [openNoteSheet]);
  React.useEffect(() => { window.__openLinkPicker = openLinkPicker; return () => { delete window.__openLinkPicker; }; }, [openLinkPicker]);
  React.useEffect(() => { window.__goHome = goHome; return () => { if (window.__goHome === goHome) delete window.__goHome; }; }, [goHome]);
  React.useEffect(() => { window.__goSearch = goSearch; return () => { window.__goSearch = null; }; }, [goSearch]);
  React.useEffect(() => { window.__onDwellCommit = commitDwellNow; return () => { if (window.__onDwellCommit === commitDwellNow) window.__onDwellCommit = null; }; }, [commitDwellNow]);

  React.useEffect(() => {
    document.body.classList.toggle("light", theme === "light");
    document.body.classList.toggle("no-gear", !settings.showSettingsGear);
    document.body.classList.toggle("no-search", settings.searchEnabled === false);
    document.body.classList.toggle("no-history", settings.historyEnabled === false);
    document.body.classList.toggle("history-in-nav", !!settings.historyInNav);
    document.body.classList.toggle("arrows-right", settings.arrowLayout === 'right');
    document.body.classList.toggle("arrows-left", settings.arrowLayout === 'left');
    document.body.classList.toggle("arrows-nav", settings.arrowLayout === 'nav');
    document.body.classList.toggle("arrows-off", settings.arrowLayout === 'off');
    if (window.AndroidBridge) window.AndroidBridge.setLightStatusBar(theme === "light");
    if (window.AndroidBridge && typeof window.AndroidBridge.setKeepScreenOn === 'function') { window.AndroidBridge.setKeepScreenOn(settings.keepScreenOn !== false); }
    try { localStorage.setItem("vot-state", JSON.stringify({ tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap, activeReadKey: activeReadKeyRaw, settings, readItems })); } catch (e) { console.warn('localStorage write failed for vot-state', e); }
  }, [tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap, activeReadKeyRaw, settings, readItems]);

  React.useEffect(() => {
    const key = getScrollKey(screen, bookId, chapterNum, letterId, studyId, studyChapterId);
    if (surpriseAnchor) return;
    const savedScroll = activeTab && activeTab.scrollPositions && activeTab.scrollPositions[key];
    const savedY = savedScroll == null ? null : typeof savedScroll === 'number' ? savedScroll : typeof savedScroll.y === 'number' ? savedScroll.y : null;
    if (typeof savedY === 'number' && savedY > 0) { const timer = setTimeout(() => { if (window.__scrollEl) window.__scrollEl.scrollTop = savedY; }, 0); return () => clearTimeout(timer); }
    setTimeout(() => { if (window.__scrollEl) window.__scrollEl.scrollTop = 0; }, 0);
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, activeTabIdx, getScrollKey, activeTab, surpriseAnchor]);

  React.useEffect(() => {
    const t = setTimeout(() => {
      applyDOMHighlights(); applyDOMLinks(); applyNoteIcons(); applyActiveNoteState();
      if (window.__pendingOpenNote) { const gid = window.__pendingOpenNote; window.__pendingOpenNote = null; setTimeout(() => { if (NoteStore.get(gid)) setNoteSheetTarget({ groupId: gid, startInEditMode: false }); }, 60); }
    }, 0);
    return () => clearTimeout(t);
  }, [hlTick, screen, letterId, bookId, chapterNum, studyId, studyChapterId, setNoteSheetTarget]);

  React.useEffect(() => {
    const top = fromLetterStack.length > 0 ? fromLetterStack[fromLetterStack.length - 1] : null;
    if (top && top.destSnapshot && !_destMatches(top.destSnapshot)) { setFromLetterStack((prev) => prev.slice(0, -1)); }
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, fromLetterStack, setFromLetterStack, _destMatches]);

  // --- 11. VIEW PREP ---
  const sharedViewProps = { onSearch: goSearch, onSettings: goSettings, onHistory: goHistory, theme: theme, onThemeChange: setTheme, surpriseAnchor: surpriseAnchor, onInAppLink: openInAppLetter, backHint: fromLetterStack.length > 0 ? (() => { const top = fromLetterStack[fromLetterStack.length - 1]; if (top.destSnapshot && !_destMatches(top.destSnapshot)) return null; return { title: top.sourceLetterTitle || "previous", volumeLabel: top.sourceVolumeLabel || null }; })() : null, hlTick: hlTick, onLinkOpen: openLinkSidebar, onBack: () => window.handleAndroidBack && window.handleAndroidBack(), markAsReadEnabled: settings.markAsRead, showProgressBar: settings.showProgressBar };
  const _navToChapter = (bid, ch) => {setFromWtlb(screen);setBookId(bid);setChapterNum(ch);setScreen("bible-ch");};

  const colReadNavProps_Inner = (volKey, clearSurprise) => getColReadNavProps(volKey, clearSurprise, letterId, markRead, unmarkRead, isRead, setSurpriseAnchor, setLetterId, setActiveReadKey, setLastReadForVol, goColIdx);
  const colIdxProps_Inner = (volKey) => getColIdxProps(volKey, setLetterId, setActiveReadKey, setLastReadForVol, setScreen, settings, lastReadLetterMap, isRead);

  const ALL_BOOKS_VAL = { matthew: (typeof MATTHEW !== 'undefined' ? MATTHEW : null), ...(typeof BOOKS !== 'undefined' ? BOOKS : {}) };
  const book_VAL = (bookId && ALL_BOOKS_VAL[bookId]) || null;
  const chapter_VAL = (book_VAL && chapterNum != null) ? (book_VAL.chapters && book_VAL.chapters.find((c) => c.num === chapterNum)) || null : null;
  const bbl_VAL = typeof BIBLE_BOOK_LIST !== 'undefined' ? BIBLE_BOOK_LIST : [];
  const bookIdx_VAL = (book_VAL && bbl_VAL.length) ? bbl_VAL.findIndex((b) => b && b.id === bookId) : -1;
  const prevBibleBook_VAL = bookIdx_VAL > 0 ? bbl_VAL[bookIdx_VAL - 1] : null;
  const nextBibleBook_VAL = (bookIdx_VAL >= 0 && bookIdx_VAL < bbl_VAL.length - 1) ? bbl_VAL[bookIdx_VAL + 1] : null;

  const chIsFirst_VAL = chapter_VAL && !book_VAL?.chapters.find((c) => c.num === chapter_VAL.num - 1);
  const chIsLast_VAL = chapter_VAL && !book_VAL?.chapters.find((c) => c.num === chapter_VAL.num + 1);
  const bcvNextBook_VAL = chIsLast_VAL ? (bookId === "revelation" ? { title: "Volume One", chapters: [{ num: 1 }] } : nextBibleBook_VAL) : null;
  const bcvOnNextBook_VAL = (chIsLast_VAL && bookId === "revelation") ? (typeof _goFirst !== 'undefined' ? _goFirst.one : goHome) : () => { if (!nextBibleBook_VAL) return; setBookId(nextBibleBook_VAL.id); setChapterNum(nextBibleBook_VAL.chapters[0].num); setScreen("bible-ch"); };

  const STUDIES_LIST = typeof BIBLE_STUDIES !== 'undefined' ? BIBLE_STUDIES : [];
  const getStudyById_Inner = (id) => STUDIES_LIST.find((s) => s.id === id) || null;
  const getStudyChapter_Inner = (study, chId) => study && study.chapters ? study.chapters.find((c) => c.id === chId) : null;
  const MATTHEW_CHAIN_ENTRY_INNER = { id: 'matthew-study', slug: 'matthew-study', title: 'The Volumes of Truth New Testament Study Bible - The Book of Matthew', isMatthewStudy: true, chapters: (typeof MATTHEW !== 'undefined' ? MATTHEW.chapters : []) };
  const UNIFIED_CHAIN_INNER = CHAIN_ORDER.map((slug) => slug === 'matthew-study' ? MATTHEW_CHAIN_ENTRY_INNER : STUDIES_LIST.find((s) => s.id === slug)).filter((e) => e && (e.isMatthewStudy || (!e.locked && e.chapters && e.chapters.length > 0)));

  const prophecyCardStatesRef_Inner = React.useRef(() => { try {return JSON.parse(localStorage.getItem("vot-prophecy-cards") || "{}");} catch (e) {return {};} });
  if (typeof prophecyCardStatesRef_Inner.current === "function") prophecyCardStatesRef_Inner.current = prophecyCardStatesRef_Inner.current();
  const saveProphecyCardStates_Inner = () => { try {localStorage.setItem("vot-prophecy-cards", JSON.stringify(prophecyCardStatesRef_Inner.current));} catch (e) {} };

  // --- 12. RENDER ---
  const letter = _findLetter('two'); const letterV1 = _findLetter('one'); const letterV3 = _findLetter('three'); const letterV4 = _findLetter('four'); const letterV5 = _findLetter('five'); const letterV6 = _findLetter('six'); const letterV7 = _findLetter('seven'); const letterTimothy = _findLetter('timothy'); const letterFlock = _findLetter('flock'); const letterRebuke = _findLetter('rebuke'); const wtlb1Entry = _findLetter('wtlb1'); const wtlb2Entry = _findLetter('wtlb2'); const blessedEntry = _findLetter('blessed'); const hdEntry = _findLetter('holydays'); const hmEntry = _findLetter('hm');

  return (
    React.createElement(TabsContext.Provider, { value: tabsCtxValue },
      React.createElement("style", null, (typeof CSS !== 'undefined' ? CSS : '')),
      settings.showReadingDot && activeReadKeyRaw && !LETTER_SCREEN_SET.has(screen) && !["matthew-ch", "bible-ch", "search", "garden-view", "settings", "history", "library", "notes-index", "about"].includes(screen) &&
      React.createElement("button", { className: "reading-dot-global", onClick: goToLastRead, title: "Resume reading" },
        React.createElement("span", { className: "rdg-inner" })
      ),
      showWelcome && React.createElement("div", { style: { position: 'fixed', inset: 0, zIndex: 9999, backgroundImage: 'url("splash.jpg")', backgroundColor: '#0a0e1a', backgroundSize: 'contain', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat', display: 'flex', flexDirection: 'column' } },
        React.createElement("div", { style: { display: 'flex', justifyContent: 'flex-end' } },
          React.createElement("button", { onClick: dismissWelcome_CB, style: { margin: 'calc(var(--inset-top, 0px) + 1rem) 1rem 0 0', background: 'rgba(0,0,0,0.55)', border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: '50%', width: '2.4rem', height: '2.4rem', color: '#fff', fontSize: '1.2rem', lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, "\u2715")
        ),
        isOnline && React.createElement("a", { href: "https://www.thevolumesoftruth.com", target: "_blank", rel: "noopener noreferrer", style: { position: 'absolute', left: '50%', top: '37%', transform: 'translateX(-50%)', width: '60%', maxWidth: '400px', height: '8%', zIndex: 1, borderBottom: '1.5px solid #6cacf0' } })
      ),
      settings.tabsEnabled && tabsOverviewOpen && React.createElement("div", { className: "tabs-overview-layer" },
        React.createElement(ScreenLayout, { navChildren: React.createElement(React.Fragment, null, React.createElement("button", { className: "nav-home", onClick: () => setTabsOverviewOpen(false) }, "\u2190 Back"), React.createElement(HomeBtn, null)) },
          React.createElement(TabsOverview, { tabs: tabs, activeTabIdx: activeTabIdx, onSelect: (i) => {lastTabCloseStrikes.current = 0;switchToTab(i);setTabsOverviewOpen(false);}, onClose: (i) => closeTab(i), onNewTab: () => {lastTabCloseStrikes.current = 0;openNewTab();setTabsOverviewOpen(false);}, onLongPress: (i) => setTabActionIdx(i), onClearAll: (signal) => { if (signal === -1) {setClearAllStage(0);return;} if (clearAllStage === 0) setClearAllStage(1);else if (clearAllStage === 1) setClearAllStage(2);else {closeAllTabs();setClearAllStage(0);lastTabCloseStrikes.current = 0;} }, clearAllStage: clearAllStage, onDedupe: () => deduplicateTabs(), MAX_TABS: MAX_TABS, thumbnails: tabThumbnails })
        )
      ),
      tabActionIdx != null && React.createElement(TabActionSheet, { idx: tabActionIdx, total: tabs.length, onCloseOthers: () => {closeOtherTabs(tabActionIdx);lastTabCloseStrikes.current = 0;}, onCloseToRight: () => {closeTabsToTheRight(tabActionIdx);lastTabCloseStrikes.current = 0;}, onDismiss: () => setTabActionIdx(null) }),
      disableTabsPromptOpen && React.createElement(DisableTabsDialog, { onKeep: () => setDisableTabsPromptOpen(false), onDisable: () => { updateSetting("tabsEnabled", false); setDisableTabsPromptOpen(false); setTabsOverviewOpen(false); } }),
      screen === "settings" && React.createElement(SettingsScreen, { settings: settings, onToggle: toggleSetting, onSetting: updateSetting, onBack: goNavOrigin, onSearch: goSearch, onHistory: goHistory, readItems: readItems, onClearBook: (bid) => setReadItems((prev) => { const next = { ...prev }; Object.keys(next).forEach((k) => {if (k.startsWith(`${VERSION_ID}:${bid}:`)) delete next[k];}); return next; }), onClearAll: clearAllProgress, onClearHistory: clearHistory, historyCount: readHistory.length, theme: theme, onThemeChange: setTheme }),
      screen === "search" && React.createElement(SearchScreen, { query: searchQuery, onQueryChange: setSearchQuery, settings: settings, onSettingsChange: (key, val) => setSettings((prev) => ({ ...prev, [key]: val })), onSelect: handleSearchSelect, onCommand: handleSearchCommand, onBack: goSearchOrigin, searchScope: searchScope, searchContext: searchContext, onToggleScope: () => setSearchScope((prev) => prev ? null : searchContext) }),
      screen === "home" && React.createElement(HomeScreen, { onSelect: handleSelect, onSurprise: handleSurprise, showSurprise: settings.showSurpriseButton, onSettings: goSettings, onSearch: goSearch, onHistory: goHistory, historyEnabled: settings.historyEnabled !== false, onInfo: () => setShowWelcome(true), onAbout: goAbout, history: readHistory, theme: theme, onThemeChange: setTheme }),
      screen === "about" && React.createElement(AboutScreen, { onContinue: () => { try { localStorage.setItem('vot-about-seen', '1'); } catch (e) {} goNavOrigin(); }, onBack: () => { try { localStorage.setItem('vot-about-seen', '1'); } catch (e) {} goNavOrigin(); }, onSearch: goSearch, onHistory: goHistory, theme: theme, onThemeChange: setTheme }),
      screen === "history" && React.createElement(HistoryScreen, { history: readHistory, onBack: goNavOrigin, onSelect: (entry) => { if (entry.type === 'study-chapter') { selectStudyChapter(entry.studyId, entry.studyChapterId); } else if (entry.type === 'letter') { setLetterId(entry.letterId); var _hc = entry.volumeScreen && COL_BY_INDEX_SC.get(entry.volumeScreen) || (entry.volume === 1 ? COL_BY_KEY.get('one') : COL_BY_KEY.get('two')); setActiveReadKey('vol:' + _hc.volKey, () => setLastReadForVol(_hc.volKey, entry.letterId)); setScreen(_hc.letterScreen); } else { setBookId(entry.bookId);setChapterNum(entry.chapterNum); setActiveReadKey(entry.bookId, () => setLastReadChapters((prev) => ({ ...prev, [entry.bookId]: entry.chapterNum }))); setScreen(entry.bookId === 'matthew' ? 'matthew-ch' : 'bible-ch'); } }, onSearch: goSearch, onSettings: goSettings, onHistory: goHistory, onPruneDay: pruneHistoryDay, theme: theme, onThemeChange: setTheme }),
      screen === "library" && React.createElement(LibraryScreen, { onBack: goHome, onOpenNotes: goNotesIndex, onSearch: goSearch, onHistory: goHistory, historyEnabled: settings.historyEnabled !== false, hlTick: hlTick, theme: theme, onThemeChange: setTheme }),
      screen === "notes-index" && React.createElement(NotesIndexScreen, { onBack: () => setScreen('library'), onOpenNote: (gid) => setNoteSheetTarget({ groupId: gid, startInEditMode: false }), onNavigateToSource: (endpoint) => { if (endpoint) { setNavOrigin({ screen: 'notes-index' }); navigateToLink(endpoint, { sourceLetterTitle: 'My Notes' }); } }, onSearch: goSearch, onHistory: goHistory, historyEnabled: settings.historyEnabled !== false, hlTick: hlTick, setHlTick: setHlTick, theme: theme, onThemeChange: setTheme }),
      screen === "scriptures-home" && React.createElement(ScripturesHome, { onSelect: handleScriptureSelect, onGenre: goScriptureGenre, onBack: goHome, onSearch: goSearch, onHistory: goHistory, onSettings: goSettings, onMatthewStudy: () => {setBookId("matthew");setChapterNum(null);setScreen("matthew-idx");}, theme: theme, onThemeChange: setTheme, layout: settings.scriptureLayout }),
      screen === "scripture-genre" && genreId && React.createElement(ScriptureGenre, { genreId: genreId, onSelect: handleScriptureSelect, onBack: goScripturesHome, onSearch: goSearch, onHistory: goHistory, onSettings: goSettings, theme: theme, onThemeChange: setTheme }),
      screen === "volumes-home" && React.createElement(VolumesHome, { onSelect: handleVolumeSelect, onBack: goHome, onSearch: goSearch, onHistory: goHistory, onSettings: goSettings, theme: theme, onThemeChange: setTheme }),
      screen === "matthew-idx" && React.createElement(ChapterIndex, { book: (typeof MATTHEW !== 'undefined' ? MATTHEW : {chapters:[]}), onSelect: selectMatthewCh, onBack: () => {if (fromStudies) {setFromStudies(false);goStudiesHome();} else {goHome();}}, onSearch: goSearch, onHistory: goHistory, onSettings: goSettings, currentChapter: settings.showReadingDot && activeReadKeyRaw === "matthew" ? lastReadChapters["matthew"] || null : null, isRead: (num) => isRead("matthew", num), markAsReadEnabled: settings.markAsRead, theme: theme, onThemeChange: setTheme }),
      screen === "matthew-ch" && chapter_VAL && (() => {
        const mat = typeof MATTHEW !== 'undefined' ? MATTHEW : {chapters:[]};
        const mtLastNum = mat.chapters.length ? mat.chapters[mat.chapters.length - 1].num : 0;
        const atFirstCh = chapter_VAL.num === 1; const atLastCh = chapter_VAL.num === mtLastNum;
        const chainPrev = fromStudies && atFirstCh ? prevChainEntry('matthew-study') : null;
        const chainNext = fromStudies && atLastCh ? nextChainEntry('matthew-study') : null;
        return React.createElement(React.Fragment, null,
          React.createElement(ChapterView, { key: chapter_VAL.num, book: MATTHEW, chapter: chapter_VAL, mode: mode, showStudy: showStudy, showEchoes: settings.showInlineEchoes !== false, showChapterTitle: settings.showChapterTitle !== false, titleFocusHidden: titleFocusHidden, setTitleFocusHidden: setTitleFocusHidden, onIndex: goMatthewIdx, onNavigate: (num) => {setSurpriseAnchor(null);selectMatthewCh(num);}, onMarkRead: () => markRead("matthew", chapter_VAL.num), markAsReadEnabled: settings.markAsRead, showProgressBar: settings.showProgressBar, prevBoundary: chainPrev ? { short: studyShortTitle(chainPrev.title), title: studyShortTitle(chainPrev.title) } : null, onPrevBoundary: chainPrev ? goToChainEntryLast(chainPrev.slug) : null, nextBoundary: chainNext ? { short: studyShortTitle(chainNext.title), title: studyShortTitle(chainNext.title) } : null, onNextBoundary: chainNext ? goToChainEntryFirst(chainNext.slug) : null, onSearch: goSearch, onSettings: goSettings, onHistory: goHistory, theme: theme, onThemeChange: setTheme, surpriseAnchor: surpriseAnchor, onVotLetterClick: (lid, sc) => { setFromMatthewCh(chapter_VAL.num); setLetterId(lid); const _col = COL_BY_LETTER_SC.get(sc); if (_col) setActiveReadKey(_col.readKey); setScreen(sc); }, backHint: backHint, onTapThroughBack: tapThroughBack, hlTick: hlTick, onLinkOpen: openLinkSidebar }),
          React.createElement(ModeToggle, { mode: mode, onChange: setMode, showStudy: showStudy, onShowStudyChange: setShowStudy })
        );
      })(),
      screen === "studies-home" && React.createElement(StudiesHome, { studies: UNIFIED_CHAIN_INNER, onSelectStudy: (slug) => { if (slug === 'matthew-study') { setFromStudies(true); setBookId("matthew");setChapterNum(null);setScreen("matthew-idx"); } else { selectStudy(slug); } }, onBack: goHome, onSearch: goSearch, onHistory: goHistory, onSettings: goSettings, theme: theme, onThemeChange: setTheme }),
      screen === "bible-study-index" && studyId && (() => {
        const study = getStudyById_Inner(studyId); if (!study) return null;
        return React.createElement(BibleStudyIndex, { study: study, onSelect: (chId) => selectStudyChapter(studyId, chId), onBack: goStudiesHome, onSearch: goSearch, onHistory: goHistory, onSettings: goSettings, currentChapter: settings.showReadingDot && activeReadKeyRaw === `bible-study-${study.slug}` ? lastReadChapters[`bible-study-${study.slug}`] || null : null, isRead: (chId) => isRead(`bible-study-${study.slug}`, chId), markAsReadEnabled: settings.markAsRead, theme: theme, onThemeChange: setTheme });
      })(),
      screen === "bible-idx" && book_VAL && React.createElement(ChapterIndex, { book: book_VAL, onSelect: selectBibleCh, onBack: genreId ? () => setScreen("scripture-genre") : goScripturesHome, onSearch: goSearch, onHistory: goHistory, onSettings: goSettings, currentChapter: settings.showReadingDot && activeReadKeyRaw === bookId ? lastReadChapters[bookId] || null : null, isRead: (num) => isRead(bookId, num), markAsReadEnabled: settings.markAsRead, restoredNames: settings.restoredNames, showChapterTitle: settings.showChapterTitle !== false, theme: theme, onThemeChange: setTheme }),
      screen === "bible-ch" && book_VAL && chapter_VAL && React.createElement(BibleChapterView, { key: book_VAL.id + '-' + chapter_VAL.num, book: book_VAL, chapter: chapter_VAL, onIndex: book_VAL?.chapters.length === 1 ? (genreId ? () => setScreen("scripture-genre") : goScripturesHome) : goBibleIdx, onNavigate: (num) => {setSurpriseAnchor(null);selectBibleCh(num);}, onMarkRead: () => markRead(bookId, chapter_VAL.num), markAsReadEnabled: settings.markAsRead, showProgressBar: settings.showProgressBar, translation: settings.translation, restoredNames: settings.restoredNames, showChapterTitle: settings.showChapterTitle !== false, showSectionHeadings: settings.showSectionHeadings !== false, titleFocusHidden: titleFocusHidden, setTitleFocusHidden: setTitleFocusHidden, headingsFocusHidden: headingsFocusHidden, setHeadingsFocusHidden: setHeadingsFocusHidden, prevBook: bcvPrevBook_VAL, nextBook: bcvNextBook_VAL, onPrevBook: bcvOnPrevBook_VAL, onNextBook: bcvOnNextBook_VAL, prevBoundaryTitle: null, nextBoundaryTitle: (bookId === \"revelation\" && chIsLast_VAL) ? \"Volume One \xB7 Letter 1\" : null, onSearch: goSearch, onSettings: goSettings, onHistory: goHistory, theme: theme, onThemeChange: setTheme, surpriseAnchor: surpriseAnchor, backHint: backHint, onTapThroughBack: tapThroughBack, hlTick: hlTick, onLinkOpen: openLinkSidebar }),
      screen === \"vot-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeIndex, colIdxProps_Inner(\u0027two\u0027))),\n      screen \u003d\u003d\u003d \"vot-one-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeOneIndex, colIdxProps_Inner(\u0027one\u0027))),\n      screen \u003d\u003d\u003d \"bible-study-chapter\" \u0026\u0026 studyId \u0026\u0026 studyChapterId \u0026\u0026 (() \u003d\u003e {\n        const study \u003d getStudyById_Inner(studyId); const ch \u003d getStudyChapter_Inner(study, studyChapterId); if (!study || !ch) return null;\n        const idx \u003d study.chapters.findIndex((c) \u003d\u003e c.id \u003d\u003d\u003d studyChapterId); const prevCh \u003d idx \u003e 0 ? study.chapters[idx - 1] : null; const nextCh \u003d idx \u003c study.chapters.length - 1 ? study.chapters[idx + 1] : null;\n        const prevEntry \u003d !prevCh ? prevChainEntry(studyId) : null; const nextEntry \u003d !nextCh ? nextChainEntry(studyId) : null;\n        const pick \u003d (chVal, studyVal, empty) \u003d\u003e { if (chVal \u003d\u003d\u003d undefined || chVal \u003d\u003d\u003d null) return studyVal !\u003d null ? studyVal : empty; if (Array.isArray(chVal)) return chVal.length ? chVal : studyVal || empty; return chVal; };\n        const letterShim \u003d { id: ch.id, title: ch.title, subtitle: ch.subtitle || null, num: ch.num, date: null, from: null, spoken: null, forLine: null, preamble: ch.part ? `Part ${ch.part}` : null, blocks: ch.blocks || [], sectionIntro: ch.sectionIntro || null, footnotes: ch.footnotes || {}, nkjv: ch.nkjv || {}, prevLetter: prevCh ? { id: prevCh.id, title: prevCh.title } : null, nextLetter: nextCh ? { id: nextCh.id, title: nextCh.title } : null, relatedTopics: pick(ch.relatedTopics, study.relatedTopics, []), bibleStudies: pick(ch.bibleStudies, study.bibleStudies, []), videos: pick(ch.videos, study.videos, []), audioUrl: pick(ch.audioUrl, study.audioUrl, null), soundcloudUrl: pick(ch.soundcloudUrl, study.soundcloudUrl, null), videoVoiceUrl: pick(ch.videoVoiceUrl, study.videoVoiceUrl, null), videoVoiceLabel: pick(ch.videoVoiceLabel, study.videoVoiceLabel, null), videoMusicUrl: pick(ch.videoMusicUrl, study.videoMusicUrl, null), addendum: pick(ch.addendum, study.addendum, null) };\n        const jumpToStudy \u003d (targetSlug) \u003d\u003e { if (targetSlug \u003d\u003d\u003d \u0027matthew-study\u0027) { setFromStudies(true); setBookId(\u0027matthew\u0027);setChapterNum(null);setScreen(\u0027matthew-idx\u0027); return; } const target \u003d STUDIES_LIST.find(st \u003d\u003e st.slug \u003d\u003d\u003d targetSlug); if (!target || target.locked) return; selectStudy(target.id); };\n        const handleLetterClick \u003d (lid, sc) \u003d\u003e { setFromStudies(true); setLetterId(lid); const _col \u003d COL_BY_LETTER_SC.get(sc); if (_col) setActiveReadKey(_col.readKey); setScreen(sc); };\n        return React.createElement(LetterView, Object.assign({ key: letterShim.id }, sharedViewProps, { letter: letterShim, studyMode: true, volumeLabel: study.title, onHome: () \u003d\u003e {if (study.chapters.length \u003e 1) {setStudyChapterId(null);setScreen(\"bible-study-index\");} else {goStudiesHome();}}, onNavigate: (chId) \u003d\u003e {setSurpriseAnchor(null);selectStudyChapter(studyId, chId);}, onStudyNavigate: jumpToStudy, onLetterClick: handleLetterClick, onMarkRead: () \u003d\u003e markRead(`bible-study-${study.slug}`, studyChapterId), onUnmark: () \u003d\u003e unmarkRead(`bible-study-${study.slug}`, studyChapterId), isRead: (id) \u003d\u003e isRead(`bible-study-${study.slug}`, id), prevBoundary: prevEntry ? { short: studyShortTitle(prevEntry.title), title: studyShortTitle(prevEntry.title) } : null, onPrevBoundary: prevEntry ? goToChainEntryLast(prevEntry.slug) : null, nextBoundary: nextEntry ? { short: studyShortTitle(nextEntry.title), title: studyShortTitle(nextEntry.title) } : null, onNextBoundary: nextEntry ? goToChainEntryFirst(nextEntry.slug) : null, prophecyCardStatesRef: prophecyCardStatesRef_Inner, saveProphecyCardStates: saveProphecyCardStates_Inner }));\n      })(),\n      screen \u003d\u003d\u003d \"vot-one-letter\" \u0026\u0026 letterV1 \u0026\u0026 React.createElement(LetterView, Object.assign({ key: letterV1.id }, sharedViewProps, colReadNavProps_Inner(\u0027one\u0027, true), boundaryConfig(\u0027one\u0027, letterV1), { letter: letterV1, volumeLabel: \"Volume One\" })),\n      screen \u003d\u003d\u003d \"vot-letter\" \u0026\u0026 letter \u0026\u0026 React.createElement(LetterView, Object.assign({ key: letter.id }, sharedViewProps, colReadNavProps_Inner(\u0027two\u0027, true), boundaryConfig(\u0027two\u0027, letter), { letter: letter })),\n      screen \u003d\u003d\u003d \"vot-three-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"Volume Three\", letters: LETTERS_V3, preface: LETTERS_V3_PREFACE }, colIdxProps_Inner(\u0027three\u0027)))),\n      screen \u003d\u003d\u003d \"vot-three-letter\" \u0026\u0026 letterV3 \u0026\u0026 React.createElement(LetterView, Object.assign({ key: letterV3.id }, sharedViewProps, colReadNavProps_Inner(\u0027three\u0027, true), boundaryConfig(\u0027three\u0027, letterV3), { letter: letterV3, volumeLabel: \"Volume Three\" })),\n      screen \u003d\u003d\u003d \"vot-four-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"Volume Four\", letters: LETTERS_V4, preface: LETTERS_V4_PREFACE }, colIdxProps_Inner(\u0027four\u0027)))),\n      screen \u003d\u003d\u003d \"vot-four-letter\" \u0026\u0026 letterV4 \u0026\u0026 React.createElement(LetterView, Object.assign({ key: letterV4.id }, sharedViewProps, colReadNavProps_Inner(\u0027four\u0027, true), boundaryConfig(\u0027four\u0027, letterV4), { letter: letterV4, volumeLabel: \"Volume Four\" })),\n      screen \u003d\u003d\u003d \"vot-five-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"Volume Five\", letters: LETTERS_V5, preface: LETTERS_V5_PREFACE }, colIdxProps_Inner(\u0027five\u0027)))),\n      screen \u003d\u003d\u003d \"vot-five-letter\" \u0026\u0026 letterV5 \u0026\u0026 React.createElement(LetterView, Object.assign({ key: letterV5.id }, sharedViewProps, colReadNavProps_Inner(\u0027five\u0027, true), boundaryConfig(\u0027five\u0027, letterV5), { letter: letterV5, volumeLabel: \"Volume Five\" })),\n      screen \u003d\u003d\u003d \"vot-six-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"Volume Six\", letters: LETTERS_V6, preface: LETTERS_V6_PREFACE }, colIdxProps_Inner(\u0027six\u0027)))),\n      screen \u003d\u003d\u003d \"vot-six-letter\" \u0026\u0026 letterV6 \u0026\u0026 React.createElement(LetterView, Object.assign({ key: letterV6.id }, sharedViewProps, colReadNavProps_Inner(\u0027six\u0027, true), boundaryConfig(\u0027six\u0027, letterV6), { letter: letterV6, volumeLabel: \"Volume Six\" })),\n      screen \u003d\u003d\u003d \"vot-seven-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"Volume Seven\", letters: LETTERS_V7, preface: LETTERS_V7_PREFACE }, colIdxProps_Inner(\u0027seven\u0027)))),\n      screen \u003d\u003d\u003d \"vot-seven-letter\" \u0026\u0026 letterV7 \u0026\u0026 React.createElement(LetterView, Object.assign({ key: letterV7.id }, sharedViewProps, colReadNavProps_Inner(\u0027seven\u0027, true), boundaryConfig(\u0027seven\u0027, letterV7), { letter: letterV7, volumeLabel: \"Volume Seven\" })),\n      screen \u003d\u003d\u003d \"vot-timothy-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"Letters from Timothy\", eyebrow: \"The Volumes of Truth\", letters: LETTERS_TIMOTHY, preface: LETTERS_TIMOTHY_PREFACE }, colIdxProps_Inner(\u0027timothy\u0027)))),\n      screen \u003d\u003d\u003d \"vot-timothy-letter\" \u0026\u0026 letterTimothy \u0026\u0026 React.createElement(LetterView, Object.assign({ key: letterTimothy.id }, sharedViewProps, colReadNavProps_Inner(\u0027timothy\u0027, true), boundaryConfig(\u0027timothy\u0027, letterTimothy), { letter: letterTimothy, volumeLabel: \"Letters from Timothy\" })),\n      screen \u003d\u003d\u003d \"vot-flock-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"Letters to The Lord\u0027s Little Flock\", eyebrow: \"The Volumes of Truth\", letters: LETTERS_FLOCK, preface: LETTERS_FLOCK_PREFACE }, colIdxProps_Inner(\u0027flock\u0027)))),\n      screen \u003d\u003d\u003d \"vot-flock-letter\" \u0026\u0026 letterFlock \u0026\u0026 React.createElement(LetterView, Object.assign({ key: letterFlock.id }, sharedViewProps, colReadNavProps_Inner(\u0027flock\u0027, true), boundaryConfig(\u0027flock\u0027, letterFlock), { letter: letterFlock, volumeLabel: \"Letters to The Lord\u0027s Little Flock\" })),\n      screen \u003d\u003d\u003d \"vot-rebuke-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"The Lord\u0027s Rebuke\", eyebrow: \"A Testament Against The World\", letters: LETTERS_REBUKE, preface: LETTERS_REBUKE_PREFACE }, colIdxProps_Inner(\u0027rebuke\u0027)))),\n      screen \u003d\u003d\u003d \"vot-rebuke-letter\" \u0026\u0026 letterRebuke \u0026\u0026 React.createElement(LetterView, Object.assign({ key: letterRebuke.id }, sharedViewProps, colReadNavProps_Inner(\u0027rebuke\u0027, true), boundaryConfig(\u0027rebuke\u0027, letterRebuke), { letter: letterRebuke, volumeLabel: \"The Lord\u0027s Rebuke\" })),\n      screen \u003d\u003d\u003d \"wtlb-one-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"Words To Live By\", eyebrow: \"Part One \\xB7 Words of Wisdom\", letters: WTLB_ONE, columns: 2 }, colIdxProps_Inner(\u0027wtlb1\u0027)))),\n      screen \u003d\u003d\u003d \"wtlb-one-entry\" \u0026\u0026 wtlb1Entry \u0026\u0026 React.createElement(WtlbEntryView, Object.assign({ key: wtlb1Entry.id }, sharedViewProps, colReadNavProps_Inner(\u0027wtlb1\u0027), boundaryConfig(\u0027wtlb1\u0027, wtlb1Entry), { entry: wtlb1Entry, partLabel: \"Part One\", onNavToChapter: _navToChapter })),\n      screen \u003d\u003d\u003d \"wtlb-two-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"Words To Live By\", eyebrow: \"Part Two \\xB7 More Words of Wisdom\", letters: WTLB_TWO, columns: 2 }, colIdxProps_Inner(\u0027wtlb2\u0027)))),\n      screen \u003d\u003d\u003d \"wtlb-two-entry\" \u0026\u0026 wtlb2Entry \u0026\u0026 React.createElement(WtlbEntryView, Object.assign({ key: wtlb2Entry.id }, sharedViewProps, colReadNavProps_Inner(\u0027wtlb2\u0027), boundaryConfig(\u0027wtlb2\u0027, wtlb2Entry), { entry: wtlb2Entry, partLabel: \"Part Two\", onNavToChapter: _navToChapter })),\n      screen \u003d\u003d\u003d \"blessed-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: _idxNav() }, React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"The Blessed\", eyebrow: \"Blessings \u0026 Promises\", letters: colLetterArr(COL_BY_KEY.get(\u0027blessed\u0027)).map((e) \u003d\u003e ({ ...e, date: e.sourceLabel || \u0027\u0027 })) }, colIdxProps_Inner(\u0027blessed\u0027)))),\n      screen \u003d\u003d\u003d \"blessed-entry\" \u0026\u0026 blessedEntry \u0026\u0026 React.createElement(WtlbEntryView, Object.assign({ key: blessedEntry.id }, sharedViewProps, colReadNavProps_Inner(\u0027blessed\u0027), boundaryConfig(\u0027blessed\u0027, blessedEntry), { entry: blessedEntry, partLabel: \"The Blessed\", onNavToChapter: _navToChapter })),\n      screen \u003d\u003d\u003d \"holy-days-index\" \u0026\u0026 React.createElement(ScreenLayout, { navChildren: React.createElement(React.Fragment, null, React.createElement(\"button\", { className: \"nav-home\", onClick: goVolumesHome }, \"\\u2190 Volumes\"), React.createElement(HomeBtn, null), React.createElement(NavButtons, { onSettings: goSettings, onHistory: goHistory, onSearch: goSearch, theme: theme, onThemeChange: setTheme })) }, typeof HOLY_DAYS_META !\u003d\u003d \u0027undefined\u0027 \u0026\u0026 (HOLY_DAYS_META.audioPlaylist || HOLY_DAYS_META.videoPlaylist) \u0026\u0026 React.createElement(\"div\", { className: \"hd-playlists\" }, HOLY_DAYS_META.audioPlaylist \u0026\u0026 React.createElement(\"a\", { className: \"hd-playlist-btn\", href: HOLY_DAYS_META.audioPlaylist, target: \"_blank\", rel: \"noopener noreferrer\" }, React.createElement(\"svg\", { viewBox: \"0 0 24 24\", fill: \"none\", stroke: \"currentColor\", strokeWidth: \"1.6\" }, React.createElement(\"path\", { d: \"M9 18V5l12-2v13\" }), React.createElement(\"circle\", { cx: \"6\", cy: \"18\", r: \"3\" }), React.createElement(\"circle\", { cx: \"18\", cy: \"16\", r: \"3\" })), React.createElement(\"span\", { className: \"hd-playlist-label\" }, \"Audio Playlist\"), React.createElement(\"span\", { className: \"hd-playlist-sub\" }, \"Listen on Bandcamp\")), HOLY_DAYS_META.videoPlaylist \u0026\u0026 React.createElement(\"a\", { className: \"hd-playlist-btn\", href: HOLY_DAYS_META.videoPlaylist, target: \"_blank\", rel: \"noopener noreferrer\" }, React.createElement(\"svg\", { viewBox: \"0 0 24 24\", fill: \"none\", stroke: \"currentColor\", strokeWidth: \"1.6\" }, React.createElement(\"polygon\", { points: \"23 7 16 12 23 17 23 7\" }), React.createElement(\"rect\", { x: \"1\", y: \"5\", width: \"15\", height: \"14\", rx: \"2\", ry: \"2\" })), React.createElement(\"span\", { className: \"hd-playlist-label\" }, \"Video Playlist\"), React.createElement(\"span\", { className: \"hd-playlist-sub\" }, \"Watch on YouTube\"))), React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: \"Regarding The Holy Days\", eyebrow: \"The Appointed Times\", letters: colLetterArr(COL_BY_KEY.get(\u0027holydays\u0027)).map((e) \u003d\u003e ({ ...e, date: e.date || e.sourceLabel || \u0027\u0027 })) }, colIdxProps_Inner(\u0027holydays\u0027)))),\n      screen \u003d\u003d\u003d \"holy-days-entry\" \u0026\u0026 hdEntry \u0026\u0026 (() \u003d\u003e { const bc \u003d boundaryConfig_Inner(\u0027holydays\u0027, hdEntry); if (hdEntry.type \u003d\u003d\u003d \u0027wtlb\u0027) { return React.createElement(WtlbEntryView, Object.assign({ key: hdEntry.id }, sharedViewProps, colReadNavProps_Inner(\u0027holydays\u0027), bc, { entry: hdEntry, partLabel: \"Regarding The Holy Days\", onNavToChapter: _navToChapter, footnotesMode: true })); } const letterShim \u003d { ...hdEntry, prevLetter: hdEntry.prevEntry || null, nextLetter: hdEntry.nextEntry || null }; return React.createElement(LetterView, Object.assign({ key: hdEntry.id }, sharedViewProps, colReadNavProps_Inner(\u0027holydays\u0027), bc, { letter: letterShim, volumeLabel: \"Regarding The Holy Days\" })); })(),\n      screen \u003d\u003d\u003d \"hm-letter\" \u0026\u0026 hmEntry \u0026\u0026 (() \u003d\u003e { const letterShim \u003d { ...hmEntry, prevLetter: null, nextLetter: null }; const goHomeFromHM \u003d () \u003d\u003e { if (fromMatthewChRef.current) { setFromMatthewCh(null); setScreen(\"matthew-ch\"); } else { goHome(); } }; return React.createElement(LetterView, Object.assign({ key: letterShim.id }, sharedViewProps, colReadNavProps_Inner(\u0027hm\u0027), { letter: letterShim, volumeLabel: \"Hidden Manna\", onHome: goHomeFromHM, onNavigate: (id) \u003d\u003e {setLetterId(id);} })); })(),\n      screen \u003d\u003d\u003d \"garden-view\" \u0026\u0026 React.createElement(GardenView, { page: gardenPage, onPageChange: (p) \u003d\u003e setGardenPage(p), onBack: goVolumesHome, theme: theme, onThemeChange: setTheme, tier: settings.gardenTier || GARDEN_DEFAULT_TIER }),\n      gardenWarningOpen \u0026\u0026 (() \u003d\u003e { const selectedTier \u003d getGardenTier(settings.gardenTier); return React.createElement(GardenWarningOverlay, { settings: settings, setSettings: setSettings, onCancel: () \u003d\u003e setGardenWarningOpen(false), onProceed: () \u003d\u003e { try {localStorage.setItem(\u0027vot-garden-warning-acked\u0027, \u00271\u0027);} catch (e) {} setGardenWarningOpen(false); setScreen(\"garden-view\"); } }); })(),\n      React.createElement(SelectionToolbar, { hlTick: hlTick, setHlTick: setHlTick, onLinkRequest: openLinkPicker, onNoteRequest: openNoteSheet }),\n      annChip \u0026\u0026 React.createElement(AnnotationActionChip, { chip: annChip, setHlTick: setHlTick, onClose: () \u003d\u003e setAnnChip(null), onNoteRequest: openNoteSheet }),\n      linkSidebarKey \u0026\u0026 React.createElement(LinkSidebar, { hlKey: linkSidebarKey, hlTick: hlTick, setHlTick: setHlTick, onClose: closeLinkSidebar, onNavigate: navigateToLink }),\n      linkPickerSource \u0026\u0026 !linkRefineRequest \u0026\u0026 React.createElement(LinkPicker, { sourceKey: linkPickerSource.key, sourceLabel: linkPickerSource.label, sourceStart: linkPickerSource.start, sourceEnd: linkPickerSource.end, sourceText: linkPickerSource.text, hlTick: hlTick, setHlTick: setHlTick, onClose: closeLinkPicker, onRequestRefine: setLinkRefineRequest, lastCreatedLink: lastLinkCreated, onLinkCreated: setLastLinkCreated }),\n      linkRefineRequest \u0026\u0026 linkRefineRequest.kind \u003d\u003d\u003d \u0027verse\u0027 \u0026\u0026 linkPickerSource \u0026\u0026 React.createElement(VersePickerScreen, { refineRequest: linkRefineRequest, sourceKey: linkPickerSource.key, sourceLabel: linkPickerSource.label, sourceStart: linkPickerSource.start, sourceEnd: letterId ? null : linkPickerSource.end, sourceText: linkPickerSource.text, setHlTick: setHlTick, onClose: (newLink) \u003d\u003e { setLinkRefineRequest(null); if (newLink) setLastLinkCreated(newLink); } }),\n      linkRefineRequest \u0026\u0026 linkRefineRequest.kind \u003d\u003d\u003d \u0027excerpt\u0027 \u0026\u0026 linkPickerSource \u0026\u0026 React.createElement(LetterExcerptPickerScreen, { refineRequest: linkRefineRequest, sourceKey: linkPickerSource.key, sourceLabel: linkPickerSource.label, sourceStart: linkPickerSource.start, sourceEnd: linkPickerSource.end, sourceText: linkPickerSource.text, setHlTick: setHlTick, onClose: (newLink) \u003d\u003e { setLinkRefineRequest(null); if (newLink) setLastLinkCreated(newLink); } }),\n      noteSheetTarget \u0026\u0026 React.createElement(NoteSheet, { key: noteSheetTarget.groupId + \u0027:\u0027 + (noteSheetTarget.startInEditMode ? \u0027edit\u0027 : \u0027read\u0027), groupId: noteSheetTarget.groupId, startInEditMode: noteSheetTarget.startInEditMode, hlTick: hlTick, setHlTick: setHlTick, onClose: closeNoteSheet, onOpenNotebookPicker: (gid) \u003d\u003e setNotebookPickerTarget(gid) }),\n      notebookPickerTarget \u0026\u0026 React.createElement(NotebookPickerSheet, { groupId: notebookPickerTarget, hlTick: hlTick, setHlTick: setHlTick, onClose: () \u003d\u003e setNotebookPickerTarget(null) }),\n      multiNotePayload \u0026\u0026 React.createElement(MultiNotePopover, { payload: multiNotePayload, onClose: () \u003d\u003e setMultiNotePayload(null), onPick: (gid) \u003d\u003e { setMultiNotePayload(null); setNoteSheetTarget({ groupId: gid, startInEditMode: false }); } })\n    )\n  );\n}\n
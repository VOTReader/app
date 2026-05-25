/* ═══════════════════════════════════════════════════════════════════════
   screen-routes — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The ROUTES dispatch table that App() consults to render the active
   screen, extracted from app.jsx (Phase 2 P9f). Built by a factory
   function that takes every App() closure dep as an explicit prop — no
   spread, no junk-drawer bundle. App() calls buildScreenRoutes(...) once
   per render and looks up the dispatched function by screen name.

   The factory's signature is heavy by necessity: ROUTES closes over
   ~100 App() identifiers (hook returns, nav helpers, tab-state setters,
   data globals computed from screen state). Bundling them into a
   semantically named bundle would just be a hidden spread — the user
   decision (per [[expose-full-surface]] + 'props are explicit, not
   spread') was the heavy explicit signature.

   When a new prop is needed by a route entry, it must be added in BOTH
   this file's destructure AND the App-side call site. The signature
   compile-checks itself: missing props become undefined references.

   Free-variable refs (LETTERS, MATTHEW, ScreenLayout, NavButtons,
   VolumeLetterIndex, LetterView, all *-Screen components, COL_BY_KEY,
   COL_BY_INDEX_SC, GARDEN_DEFAULT_TIER, colIdxProps/colReadNavProps —
   the last two are NOT globals but App-local helpers, so they're
   threaded as props) resolve from window at call time.
   ═══════════════════════════════════════════════════════════════════════ */

export function buildScreenRoutes({
  // ── State + setters (tab-field-backed) ──
  screen, setScreen,
  bookId, setBookId, chapterNum, setChapterNum,
  letterId, setLetterId,
  studyId, setStudyId, studyChapterId, setStudyChapterId,
  fromStudies, setFromStudies,
  mode, setMode, showStudy, setShowStudy,
  genreId, surpriseAnchor, setSurpriseAnchor,
  // ── Theme + settings + display ──
  theme, setTheme,
  settings, setSettings, toggleSetting, updateSetting,
  hlTick, setHlTick,
  titleFocusHidden, setTitleFocusHidden,
  headingsFocusHidden, setHeadingsFocusHidden,
  // ── Read progress + history ──
  activeReadKey, setActiveReadKey,
  lastReadChapters, setLastReadChapters,
  lastReadLetterMap, setLastReadForVol,
  readItems, readHistory,
  markRead, unmarkRead, isRead, clearReadForBook, clearAllProgress, clearHistory, pruneHistoryDay,
  // ── Data resolved from screen state ──
  letter, letterV1, letterV3, letterV4, letterV5, letterV6, letterV7,
  letterTimothy, letterFlock, letterRebuke,
  wtlb1Entry, wtlb2Entry, blessedEntry,
  hdEntry, hmEntry,
  book, chapter,
  // ── Nav helpers ──
  goHome, goNavOrigin, goSearch, goHistory, goSettings, goAbout,
  goVolumesHome, goScripturesHome, goScriptureGenre, goBibleIdx, goMatthewIdx,
  goStudiesHome,
  goNotesIndex, goLinksIndex, goBookmarksIndex, goJournalHub, goHighlightsIndex,
  goJournalViewer, goJournalEditor,
  goSearchOrigin, goColIdx,
  // ── Selection / handlers ──
  handleSelect, handleSurprise, handleScriptureSelect, handleVolumeSelect,
  handleSearchSelect, handleSearchCommand,
  selectMatthewCh, selectBibleCh, selectStudy, selectStudyChapter,
  // ── Bible Studies + chain nav ──
  getStudyById, getStudyChapter, studyReadKey,
  prevChainEntry, nextChainEntry, goToChainEntryFirst, goToChainEntryLast,
  studiesLoading, UNIFIED_CHAIN,
  // ── Search ──
  searchQuery, setSearchQuery, searchScope, setSearchScope, searchContext,
  // ── Journal ──
  journalEntryId, createAndEditJournal,
  // ── Tap through / linking / overlays ──
  openInAppLetter, openLinkSidebar, navigateToLink,
  backHint, tapThroughBack, goToLetterFromMatthew,
  setNavOrigin, setNoteSheetTarget,
  setShowWelcome,
  // ── Bible chapter boundary props (from useReadingChainNav) ──
  bcvPrevBook, bcvNextBook, bcvOnPrevBook, bcvOnNextBook,
  bcvPrevBoundaryTitle, bcvNextBoundaryTitle,
  // ── Reading position ──
  prophecyCardStatesRef, saveProphecyCardStates,
  // ── Matthew-Hidden-Manna tap-through tracking (for hm-letter back nav) ──
  fromMatthewChRef, setFromMatthewCh,
  // ── App-state needed by built-in helpers (sharedViewProps / _navToChapter) ──
  setFromWtlb,
  // ── Boundary computation (from useReadingChainNav; sees per-volume context) ──
  boundaryConfig,
  // ── Garden ──
  gardenPage, setGardenPage,
}) {
  /* ─────────────────────────────────────────────────────────────────────
     Built-in prop-builder helpers. Previously defined inside App() and
     threaded as 5 props (colIdxProps, colReadNavProps, _idxNav,
     sharedViewProps, _navToChapter). Each is a closure over App-state,
     which the factory's own params already capture — so the natural
     home is inside the factory, not in App() proper.
     ─────────────────────────────────────────────────────────────────── */
  const colReadNavProps = (volKey, clearSurprise) => {
    const rk = COL_BY_KEY.get(volKey).readKey;
    return {
      onMarkRead: () => markRead(rk, letterId),
      onUnmark: () => unmarkRead(rk, letterId),
      isRead: (id) => isRead(rk, id),
      onNavigate: (id) => { if (clearSurprise) setSurpriseAnchor(null); setLetterId(id); setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id)); },
      onHome: () => goColIdx(volKey),
    };
  };
  const colIdxProps = (volKey) => {
    const col = COL_BY_KEY.get(volKey);
    const nav = (id) => { setLetterId(id); setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id)); setScreen(col.letterScreen); };
    return {
      onSelect: nav,
      onSelectPreface: col.prefaceGlobal ? nav : undefined,
      currentLetter: settings.showReadingDot && activeReadKey === ('vol:' + volKey) ? lastReadLetterMap[volKey] || null : null,
      isRead: (id) => isRead(col.readKey, id),
      markAsReadEnabled: settings.markAsRead,
    };
  };
  const _idxNav = () => (
    <>
      <button className="nav-home" onClick={goVolumesHome}>{"← Volumes"}</button>
      <HomeBtn />
      <NavButtons onSettings={goSettings} onHistory={goHistory} onSearch={goSearch} theme={theme} onThemeChange={setTheme} />
    </>
  );
  const sharedViewProps = {
    onSearch: goSearch, onSettings: goSettings, onHistory: goHistory,
    theme, onThemeChange: setTheme, surpriseAnchor,
    onInAppLink: openInAppLetter, backHint, hlTick,
    onLinkOpen: openLinkSidebar,
    onBack: () => window.handleAndroidBack && window.handleAndroidBack(),
    markAsReadEnabled: settings.markAsRead, showProgressBar: settings.showProgressBar,
  };
  const _navToChapter = (bid, ch) => { setFromWtlb(screen); setBookId(bid); setChapterNum(ch); setScreen('bible-ch'); };

  return {
    // ── Volume index screens (13) ──
    'vot-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Two" letters={LETTERS} {...colIdxProps('two')} />
      </ScreenLayout>
    ),
    'vot-one-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume One" letters={LETTERS_V1} preface={LETTERS_V1_PREFACE} {...colIdxProps('one')} />
      </ScreenLayout>
    ),
    'vot-three-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Three" letters={LETTERS_V3} preface={LETTERS_V3_PREFACE} {...colIdxProps('three')} />
      </ScreenLayout>
    ),
    'vot-four-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Four" letters={LETTERS_V4} preface={LETTERS_V4_PREFACE} {...colIdxProps('four')} />
      </ScreenLayout>
    ),
    'vot-five-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Five" letters={LETTERS_V5} preface={LETTERS_V5_PREFACE} {...colIdxProps('five')} />
      </ScreenLayout>
    ),
    'vot-six-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Six" letters={LETTERS_V6} preface={LETTERS_V6_PREFACE} {...colIdxProps('six')} />
      </ScreenLayout>
    ),
    'vot-seven-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Seven" letters={LETTERS_V7} preface={LETTERS_V7_PREFACE} {...colIdxProps('seven')} />
      </ScreenLayout>
    ),
    'vot-timothy-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Letters from Timothy" eyebrow="The Volumes of Truth" letters={LETTERS_TIMOTHY} preface={LETTERS_TIMOTHY_PREFACE} {...colIdxProps('timothy')} />
      </ScreenLayout>
    ),
    'vot-flock-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Letters to The Lord's Little Flock" eyebrow="The Volumes of Truth" letters={LETTERS_FLOCK} preface={LETTERS_FLOCK_PREFACE} {...colIdxProps('flock')} />
      </ScreenLayout>
    ),
    'vot-rebuke-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="The Lord's Rebuke" eyebrow="A Testament Against The World" letters={LETTERS_REBUKE} preface={LETTERS_REBUKE_PREFACE} {...colIdxProps('rebuke')} />
      </ScreenLayout>
    ),
    'wtlb-one-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Words To Live By" eyebrow={"Part One \xB7 Words of Wisdom"} letters={WTLB_ONE} columns={2} {...colIdxProps('wtlb1')} />
      </ScreenLayout>
    ),
    'wtlb-two-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Words To Live By" eyebrow={"Part Two \xB7 More Words of Wisdom"} letters={WTLB_TWO} columns={2} {...colIdxProps('wtlb2')} />
      </ScreenLayout>
    ),
    'blessed-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="The Blessed" eyebrow="Blessings & Promises" letters={colLetterArr(COL_BY_KEY.get('blessed')).map((e) => ({ ...e, date: e.sourceLabel || '' }))} {...colIdxProps('blessed')} />
      </ScreenLayout>
    ),

    // ── Letter screens (10) — data-guarded ──
    'vot-one-letter':     () => letterV1       && <LetterView {...sharedViewProps} {...colReadNavProps('one', true)}     {...boundaryConfig('one', letterV1)}     letter={letterV1}     volumeLabel="Volume One" />,
    'vot-letter':         () => letter         && <LetterView {...sharedViewProps} {...colReadNavProps('two', true)}     {...boundaryConfig('two', letter)}       letter={letter} />,
    'vot-three-letter':   () => letterV3       && <LetterView {...sharedViewProps} {...colReadNavProps('three', true)}   {...boundaryConfig('three', letterV3)}   letter={letterV3}     volumeLabel="Volume Three" />,
    'vot-four-letter':    () => letterV4       && <LetterView {...sharedViewProps} {...colReadNavProps('four', true)}    {...boundaryConfig('four', letterV4)}    letter={letterV4}     volumeLabel="Volume Four" />,
    'vot-five-letter':    () => letterV5       && <LetterView {...sharedViewProps} {...colReadNavProps('five', true)}    {...boundaryConfig('five', letterV5)}    letter={letterV5}     volumeLabel="Volume Five" />,
    'vot-six-letter':     () => letterV6       && <LetterView {...sharedViewProps} {...colReadNavProps('six', true)}     {...boundaryConfig('six', letterV6)}     letter={letterV6}     volumeLabel="Volume Six" />,
    'vot-seven-letter':   () => letterV7       && <LetterView {...sharedViewProps} {...colReadNavProps('seven', true)}   {...boundaryConfig('seven', letterV7)}   letter={letterV7}     volumeLabel="Volume Seven" />,
    'vot-timothy-letter': () => letterTimothy  && <LetterView {...sharedViewProps} {...colReadNavProps('timothy', true)} {...boundaryConfig('timothy', letterTimothy)} letter={letterTimothy} volumeLabel="Letters from Timothy" />,
    'vot-flock-letter':   () => letterFlock    && <LetterView {...sharedViewProps} {...colReadNavProps('flock', true)}   {...boundaryConfig('flock', letterFlock)}   letter={letterFlock}   volumeLabel="Letters to The Lord's Little Flock" />,
    'vot-rebuke-letter':  () => letterRebuke   && <LetterView {...sharedViewProps} {...colReadNavProps('rebuke', true)}  {...boundaryConfig('rebuke', letterRebuke)} letter={letterRebuke}  volumeLabel="The Lord's Rebuke" />,

    // ── WTLB / Blessed entry screens (3) — data-guarded ──
    'wtlb-one-entry':     () => wtlb1Entry     && <WtlbEntryView {...sharedViewProps} {...colReadNavProps('wtlb1')}   {...boundaryConfig('wtlb1', wtlb1Entry)}   entry={wtlb1Entry}   partLabel="Part One" onNavToChapter={_navToChapter} />,
    'wtlb-two-entry':     () => wtlb2Entry     && <WtlbEntryView {...sharedViewProps} {...colReadNavProps('wtlb2')}   {...boundaryConfig('wtlb2', wtlb2Entry)}   entry={wtlb2Entry}   partLabel="Part Two" onNavToChapter={_navToChapter} />,
    'blessed-entry':      () => blessedEntry   && <WtlbEntryView {...sharedViewProps} {...colReadNavProps('blessed')} {...boundaryConfig('blessed', blessedEntry)} entry={blessedEntry} partLabel="The Blessed" onNavToChapter={_navToChapter} />,

    // ── AppShell / settings / search / home / library (P8b — 20 medium
    //    prop-threading screens folded in; same pattern as P8a). ──
    'settings': () => (
      <SettingsScreen
        settings={settings}
        onToggle={toggleSetting}
        onSetting={updateSetting}
        onBack={goNavOrigin}
        onSearch={goSearch}
        onHistory={goHistory}
        readItems={readItems}
        onClearBook={clearReadForBook}
        onClearAll={clearAllProgress}
        onClearHistory={clearHistory}
        historyCount={readHistory.length}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'search': () => (
      <SearchScreen
        query={searchQuery}
        onQueryChange={setSearchQuery}
        settings={settings}
        onSettingsChange={(key, val) => setSettings((prev) => ({ ...prev, [key]: val }))}
        onSelect={handleSearchSelect}
        onCommand={handleSearchCommand}
        onBack={goSearchOrigin}
        searchScope={searchScope}
        searchContext={searchContext}
        onToggleScope={() => setSearchScope((prev) => prev ? null : searchContext)}
      />
    ),
    'home': () => (
      <HomeScreen
        onSelect={handleSelect}
        onSurprise={handleSurprise}
        showSurprise={settings.showSurpriseButton}
        onSettings={goSettings}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        onInfo={() => setShowWelcome(true)}
        onAbout={goAbout}
        history={readHistory}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'about': () => (
      <AboutScreen
        onContinue={() => {
          try { localStorage.setItem('vot-about-seen', '1'); } catch (_e) { /* localStorage access — non-fatal */ }
          goNavOrigin();
        }}
        onBack={() => {
          try { localStorage.setItem('vot-about-seen', '1'); } catch (_e) { /* localStorage access — non-fatal */ }
          goNavOrigin();
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'history': () => (
      <HistoryScreen
        history={readHistory}
        onBack={goNavOrigin}
        onSelect={(entry) => {
          if (entry.type === 'study-chapter') {
            const study = getStudyById(entry.studyId);
            if (!study) return;
            setStudyId(entry.studyId);
            setStudyChapterId(entry.studyChapterId);
            setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: entry.studyChapterId })));
            setScreen('bible-study-chapter');
          } else if (entry.type === 'letter') {
            setLetterId(entry.letterId);
            var _hc = entry.volumeScreen && COL_BY_INDEX_SC.get(entry.volumeScreen) || (entry.volume === 1 ? COL_BY_KEY.get('one') : COL_BY_KEY.get('two'));
            setActiveReadKey('vol:' + _hc.volKey, () => setLastReadForVol(_hc.volKey, entry.letterId));
            setScreen(_hc.letterScreen);
          } else {
            setBookId(entry.bookId);setChapterNum(entry.chapterNum);
            setActiveReadKey(entry.bookId, () => setLastReadChapters((prev) => ({ ...prev, [entry.bookId]: entry.chapterNum })));
            setScreen(entry.bookId === 'matthew' ? 'matthew-ch' : 'bible-ch');
          }
        }}
        onSearch={goSearch}
        onSettings={goSettings}
        onHistory={goHistory}
        onPruneDay={pruneHistoryDay}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'library': () => (
      <LibraryScreen
        onBack={goHome}
        onOpenNotes={goNotesIndex}
        onOpenLinks={goLinksIndex}
        onOpenBookmarks={goBookmarksIndex}
        onOpenJournal={goJournalHub}
        onOpenHighlights={goHighlightsIndex}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        historyEnabled={settings.historyEnabled !== false}
        hlTick={hlTick}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'highlights-index': () => typeof HighlightsScreen !== 'undefined' && (
      <HighlightsScreen
        onSettings={goSettings}
        onBack={() => setScreen('library')}
        onHome={goHome}
        onNavigateToSource={(endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: 'highlights-index' });
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Highlights' });
          }
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        hlTick={hlTick} setHlTick={setHlTick}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'journal-home': () => typeof JournalHubScreen !== 'undefined' && (
      <JournalHubScreen
        onSettings={goSettings}
        onBack={() => setScreen('library')}
        onHome={goHome}
        onOpenEntry={(eid) => goJournalViewer(eid)}
        onEditEntry={(eid) => goJournalEditor(eid)}
        onCreateEntry={createAndEditJournal}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        hlTick={hlTick} setHlTick={setHlTick}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'journal-viewer': () => typeof JournalViewerScreen !== 'undefined' && (
      <JournalViewerScreen
        onSettings={goSettings}
        entryId={journalEntryId}
        onBack={() => setScreen('journal-home')}
        onHome={goHome}
        onEdit={() => setScreen('journal-editor')}
        onNavigateToLink={(endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: 'journal-viewer' });
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Journal' });
          }
        }}
        onOpenJournalEntry={(eid) => goJournalViewer(eid)}
        onOpenNotebook={(nbId) => {
          // Drop the user straight into that notebook's screen in the Notes
          // hub. __notesReturnCtx is consumed by NotesIndexScreen on mount
          // to pre-drill the right notebook (same channel the back-pill uses).
          window.__notesReturnCtx = { tab: 'notebooks', drilledNbId: nbId };
          setNavOrigin({ screen: 'journal-viewer' });
          setScreen('notes-index');
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        hlTick={hlTick} setHlTick={setHlTick}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'journal-editor': () => typeof JournalEditorScreen !== 'undefined' && (
      <JournalEditorScreen
        onSettings={goSettings}
        entryId={journalEntryId}
        onBack={() => goJournalViewer(journalEntryId)}
        onHome={goHome}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        hlTick={hlTick} setHlTick={setHlTick}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'notes-index': () => (
      <NotesIndexScreen
        onSettings={goSettings}
        onBack={() => setScreen('library')}
        onHome={goHome}
        onOpenNote={(gid) => setNoteSheetTarget({ groupId: gid, startInEditMode: false })}
        onNavigateToSource={(endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: 'notes-index' });
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Notes' });
          }
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        hlTick={hlTick} setHlTick={setHlTick}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'links-index': () => (
      <LinksScreen
        onSettings={goSettings}
        onBack={() => setScreen('library')}
        onHome={goHome}
        onNavigateToSource={(endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: 'links-index' });
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Links' });
          }
        }}
        onNavigateToTarget={(endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: 'links-index' });
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Links' });
          }
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        hlTick={hlTick} setHlTick={setHlTick}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'bookmarks-index': () => (
      <BookmarksScreen
        onSettings={goSettings}
        onBack={() => setScreen('library')}
        onHome={goHome}
        onNavigateToSource={(endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: 'bookmarks-index' });
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Bookmarks' });
          }
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        hlTick={hlTick} setHlTick={setHlTick}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'scriptures-home': () => (
      <ScripturesHome
        onSelect={handleScriptureSelect}
        onGenre={goScriptureGenre}
        onBack={goHome}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        onMatthewStudy={() => { setBookId('matthew'); setChapterNum(null); setScreen('matthew-idx'); }}
        theme={theme} onThemeChange={setTheme}
        layout={settings.scriptureLayout}
      />
    ),
    'scripture-genre': () => genreId && (
      <ScriptureGenre
        genreId={genreId}
        onSelect={handleScriptureSelect}
        onBack={goScripturesHome}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'volumes-home': () => (
      <VolumesHome
        onSelect={handleVolumeSelect}
        onBack={goHome}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'matthew-idx': () => (
      <ChapterIndex
        book={MATTHEW}
        onSelect={selectMatthewCh}
        onBack={() => { if (fromStudies) { setFromStudies(false); goStudiesHome(); } else { goHome(); } }}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        currentChapter={settings.showReadingDot && activeReadKey === 'matthew' ? lastReadChapters['matthew'] || null : null}
        isRead={(num) => isRead('matthew', num)}
        markAsReadEnabled={settings.markAsRead}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'studies-home': () => (
      <StudiesHome
        studies={UNIFIED_CHAIN}
        studiesLoading={studiesLoading}
        onSelectStudy={(slug) => {
          if (slug === 'matthew-study') {
            setFromStudies(true);
            setBookId('matthew'); setChapterNum(null); setScreen('matthew-idx');
          } else {
            selectStudy(slug);
          }
        }}
        onBack={goHome}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'bible-idx': () => book && (
      <ChapterIndex
        book={book}
        onSelect={selectBibleCh}
        onBack={genreId ? () => setScreen('scripture-genre') : goScripturesHome}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        currentChapter={settings.showReadingDot && activeReadKey === bookId ? lastReadChapters[bookId] || null : null}
        isRead={(num) => isRead(bookId, num)}
        markAsReadEnabled={settings.markAsRead}
        restoredNames={settings.restoredNames}
        showChapterTitle={settings.showChapterTitle !== false}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'bible-ch': () => book && chapter && (
      <BibleChapterView
        book={book} chapter={chapter}
        onIndex={book?.chapters.length === 1 ? genreId ? () => setScreen('scripture-genre') : goScripturesHome : goBibleIdx}
        onNavigate={(num) => { setSurpriseAnchor(null); selectBibleCh(num); }}
        onMarkRead={() => markRead(bookId, chapterNum)}
        markAsReadEnabled={settings.markAsRead}
        showProgressBar={settings.showProgressBar}
        translation={settings.translation}
        restoredNames={settings.restoredNames}
        showChapterTitle={settings.showChapterTitle !== false}
        showSectionHeadings={settings.showSectionHeadings !== false}
        titleFocusHidden={titleFocusHidden}
        setTitleFocusHidden={setTitleFocusHidden}
        headingsFocusHidden={headingsFocusHidden}
        setHeadingsFocusHidden={setHeadingsFocusHidden}
        prevBook={bcvPrevBook}
        nextBook={bcvNextBook}
        onPrevBook={bcvOnPrevBook}
        onNextBook={bcvOnNextBook}
        prevBoundaryTitle={bcvPrevBoundaryTitle}
        nextBoundaryTitle={bcvNextBoundaryTitle}
        onSearch={goSearch}
        onSettings={goSettings}
        onHistory={goHistory}
        theme={theme} onThemeChange={setTheme}
        surpriseAnchor={surpriseAnchor}
        backHint={backHint} onTapThroughBack={tapThroughBack}
        hlTick={hlTick} onLinkOpen={openLinkSidebar}
      />
    ),

    // ── IIFE screens — render-time-derived locals (study lookups,
    //    letter shims, chain-aware boundaries) extracted to their own
    //    components in src/ui/screens/. ──
    'matthew-ch': () => (
      <MatthewChapterView
        chapter={chapter} chapterNum={chapterNum} mode={mode} showStudy={showStudy}
        fromStudies={fromStudies} settings={settings}
        titleFocusHidden={titleFocusHidden} setTitleFocusHidden={setTitleFocusHidden}
        prevChainEntry={prevChainEntry} nextChainEntry={nextChainEntry}
        goToChainEntryFirst={goToChainEntryFirst} goToChainEntryLast={goToChainEntryLast}
        setSurpriseAnchor={setSurpriseAnchor} setFromStudies={setFromStudies}
        setMode={setMode} setShowStudy={setShowStudy}
        markRead={markRead}
        selectMatthewCh={selectMatthewCh}
        goMatthewIdx={goMatthewIdx} goSearch={goSearch} goSettings={goSettings} goHistory={goHistory}
        goToLetterFromMatthew={goToLetterFromMatthew}
        theme={theme} setTheme={setTheme} surpriseAnchor={surpriseAnchor}
        backHint={backHint} tapThroughBack={tapThroughBack}
        hlTick={hlTick} openLinkSidebar={openLinkSidebar}
      />
    ),

    'bible-study-index': () => {
      if (!studyId) return null;
      const study = getStudyById(studyId);
      if (!study) return studiesLoading ? <div className="sc-sheet-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>Loading…</div> : null;
      return (
        <BibleStudyIndex
          study={study}
          onSelect={(chId) => selectStudyChapter(studyId, chId)}
          onBack={goStudiesHome}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          currentChapter={settings.showReadingDot && activeReadKey === studyReadKey(study.slug) ? lastReadChapters[studyReadKey(study.slug)] || null : null}
          isRead={(chId) => isRead(studyReadKey(study.slug), chId)}
          markAsReadEnabled={settings.markAsRead}
          theme={theme} onThemeChange={setTheme}
        />
      );
    },

    'bible-study-chapter': () => (
      <BibleStudyChapterView
        studyId={studyId}
        studyChapterId={studyChapterId}
        getStudyById={getStudyById}
        getStudyChapter={getStudyChapter}
        studiesLoading={studiesLoading}
        prevChainEntry={prevChainEntry}
        nextChainEntry={nextChainEntry}
        goToChainEntryFirst={goToChainEntryFirst}
        goToChainEntryLast={goToChainEntryLast}
        setStudyChapterId={setStudyChapterId}
        setScreen={setScreen}
        setBookId={setBookId}
        setChapterNum={setChapterNum}
        setFromStudies={setFromStudies}
        setLetterId={setLetterId}
        setActiveReadKey={setActiveReadKey}
        setSurpriseAnchor={setSurpriseAnchor}
        markRead={markRead}
        unmarkRead={unmarkRead}
        isRead={isRead}
        studyReadKey={studyReadKey}
        prophecyCardStatesRef={prophecyCardStatesRef}
        saveProphecyCardStates={saveProphecyCardStates}
        selectStudy={selectStudy}
        selectStudyChapter={selectStudyChapter}
        goStudiesHome={goStudiesHome}
        sharedViewProps={sharedViewProps}
      />
    ),

    'holy-days-index': () => (
      <ScreenLayout navChildren={_idxNav()}>
        <HolyDaysPlaylistHeader />
        <VolumeLetterIndex volumeTitle="Regarding The Holy Days" eyebrow="The Appointed Times" letters={colLetterArr(COL_BY_KEY.get('holydays')).map((e) => ({ ...e, date: e.date || e.sourceLabel || '' }))} {...colIdxProps('holydays')} />
      </ScreenLayout>
    ),

    'holy-days-entry': () => {
      if (!hdEntry) return null;
      const bc = boundaryConfig('holydays', hdEntry);
      if (hdEntry.type === 'wtlb') {
        return <WtlbEntryView {...sharedViewProps} {...colReadNavProps('holydays')} {...bc} entry={hdEntry} partLabel="Regarding The Holy Days" onNavToChapter={_navToChapter} footnotesMode={true} />;
      }
      const letterShim = { ...hdEntry, prevLetter: hdEntry.prevEntry || null, nextLetter: hdEntry.nextEntry || null };
      return <LetterView {...sharedViewProps} {...colReadNavProps('holydays')} {...bc} letter={letterShim} volumeLabel="Regarding The Holy Days" />;
    },

    'hm-letter': () => {
      if (!hmEntry) return null;
      const letterShim = { ...hmEntry, prevLetter: null, nextLetter: null };
      // Returning home from HM goes back to the Matthew chapter that led here.
      const goHomeFromHM = () => {
        if (fromMatthewChRef.current) {
          setFromMatthewCh(null);
          setScreen('matthew-ch');
        } else {
          goHome();
        }
      };
      return <LetterView {...sharedViewProps} {...colReadNavProps('hm')} letter={letterShim} volumeLabel="Hidden Manna" onHome={goHomeFromHM} onNavigate={(id) => { setLetterId(id); }} />;
    },

    'garden-view': () => (
      <GardenView
        page={gardenPage}
        onPageChange={(p) => setGardenPage(p)}
        onBack={goVolumesHome}
        theme={theme} onThemeChange={setTheme}
        tier={settings.gardenTier || GARDEN_DEFAULT_TIER}
      />
    ),
  };
}

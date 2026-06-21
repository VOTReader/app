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

   Re-evaluated at W7.5 (2026-05-29) and AFFIRMED -- bundling does NOT
   reduce the factory's coupling (it needs every input regardless of how
   the props are packaged; grouping only relabels the same dependency),
   and the flat list self-compile-checks (see next paragraph). The plan's
   proposed nav-state / nav-handlers split was also a shape grouping
   ([[dont-group-by-shape]]). The explicit signature stays; a genuinely-
   cohesive cluster only gets revisited during W8 typing, and only if it
   makes the typedefs cleaner -- never as a standalone rearrangement.

   When a new prop is needed by a route entry, it must be added in BOTH
   this file's destructure AND the App-side call site. The signature
   compile-checks itself: missing props become undefined references.

   Free-variable refs (MATTHEW, ScreenLayout, NavButtons,
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
  titleFocusHidden, setTitleFocusHidden,
  headingsFocusHidden, setHeadingsFocusHidden,
  // ── Read progress + history ──
  activeReadKey, setActiveReadKey,
  lastReadChapters, setLastReadChapters,
  lastReadLetterMap, setLastReadForVol,
  readItems, readHistory,
  markRead, unmarkRead, isRead, clearReadForBook, clearAllProgress, clearHistory, pruneHistoryDay,
  // ── Data resolved from screen state (F3: the active letter/entry only) ──
  activeLetter, activeVolKey,
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
  studiesLoading, studiesError, retryStudies, UNIFIED_CHAIN,
  // ── Search ──
  searchQuery, setSearchQuery, searchScope, setSearchScope, searchContext,
  // ── Journal ──
  journalEntryId, createAndEditJournal,
  // ── Tap through / linking / overlays ──
  openInAppLetter, openLinkSidebar, navigateToLink,
  backHint, tapThroughBack, goToLetterFromMatthew,
  setNavOrigin, setNoteSheetTarget,
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
  // F3: App() resolves the active letter/entry ONCE (by screen->volKey) and
  // passes it as activeLetter + activeVolKey. actL(k) returns it only for the
  // matching volume, so each letter route stays guarded exactly as before
  // (a non-matching screen yields null → the route renders nothing).
  const actL = (k) => (activeVolKey === k ? activeLetter : null);
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
      volKey, // lets the reading view resolve neighbor content for the swipe peek
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
    onInAppLink: openInAppLetter, backHint,
    onLinkOpen: openLinkSidebar,
    onBack: () => window.handleAndroidBack && window.handleAndroidBack(),
    markAsReadEnabled: settings.markAsRead, showProgressBar: settings.showProgressBar,
  };
  const _navToChapter = (bid, ch) => { setFromWtlb(screen); setBookId(bid); setChapterNum(ch); setScreen('bible-ch'); };

  // Q8.3: VOT corpus is lazy-loaded as bundle-a-vot.js. Until it arrives,
  // every VOT route (indexes + letter views + WTLB entries + Holy Days +
  // Hidden Manna) gets routed through this wrapper which triggers the
  // loader and renders a centered placeholder. App() subscribes to
  // __votCorpus so the wrapper re-evaluates when the corpus lands.
  const _votReady = (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.loaded : false;
  // AUDIT-PLAN E1: a lazy corpus can FAIL to load (offline, 404, an old-WebView
  // parse error). Render a retry affordance instead of a perpetual "Loading…".
  // The loader (index.html) sets corpus.error + bumps its version on failure and
  // nulls _promise so re-calling the loader retries cleanly; App subscribes to
  // each corpus version, so this re-evaluates on the bump.
  const _corpusView = (corpus, loadFn, loadingLabel) => {
    if (corpus && corpus.error) {
      return (
        <div className="sc-sheet-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '14px', textAlign: 'center', padding: '0 24px' }}>
          <div>Couldn’t load this section.</div>
          <button type="button" onClick={() => { if (typeof loadFn === 'function') loadFn(); }} style={{ padding: '8px 20px', borderRadius: '999px', border: '1px solid currentColor', background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', opacity: 0.85 }}>Try again</button>
        </div>
      );
    }
    // SHELL-3: this kicks the lazy-corpus load from inside a route's RENDER
    // function (the ROUTES factory produces elements, not a component body, so
    // there is no useEffect home here without a structural App↔routes refactor).
    // It is SAFE as a render-phase side effect ONLY because the loader is (a)
    // IDEMPOTENT — re-calling while a load is in flight is a no-op (it nulls
    // _promise and re-arms only on failure) — and (b) ASYNC-NOTIFY ONLY — it
    // never setState/bumps synchronously during this render, so a discarded
    // concurrent render can't loop or warn. Both invariants are load-bearing: a
    // future loader that notifies synchronously would turn this into a render loop.
    if (typeof loadFn === 'function') loadFn();
    return <div className="sc-sheet-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>{loadingLabel}</div>;
  };
  const _wrapVot = (jsx) => _votReady ? jsx : _corpusView(window.__votCorpus, window.__loadVotCorpus, 'Loading…');

  return {
    // ── Volume index screens (13) ──
    'vot-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Two" letters={colLetterArr(COL_BY_KEY.get('two'))} {...colIdxProps('two')} />
      </ScreenLayout>
    )),
    'vot-one-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume One" letters={colLetterArr(COL_BY_KEY.get('one'))} preface={colPreface(COL_BY_KEY.get('one'))} {...colIdxProps('one')} />
      </ScreenLayout>
    )),
    'vot-three-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Three" letters={colLetterArr(COL_BY_KEY.get('three'))} preface={colPreface(COL_BY_KEY.get('three'))} {...colIdxProps('three')} />
      </ScreenLayout>
    )),
    'vot-four-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Four" letters={colLetterArr(COL_BY_KEY.get('four'))} preface={colPreface(COL_BY_KEY.get('four'))} {...colIdxProps('four')} />
      </ScreenLayout>
    )),
    'vot-five-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Five" letters={colLetterArr(COL_BY_KEY.get('five'))} preface={colPreface(COL_BY_KEY.get('five'))} {...colIdxProps('five')} />
      </ScreenLayout>
    )),
    'vot-six-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Six" letters={colLetterArr(COL_BY_KEY.get('six'))} preface={colPreface(COL_BY_KEY.get('six'))} {...colIdxProps('six')} />
      </ScreenLayout>
    )),
    'vot-seven-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Volume Seven" letters={colLetterArr(COL_BY_KEY.get('seven'))} preface={colPreface(COL_BY_KEY.get('seven'))} {...colIdxProps('seven')} />
      </ScreenLayout>
    )),
    'vot-timothy-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Letters from Timothy" eyebrow="The Volumes of Truth" letters={colLetterArr(COL_BY_KEY.get('timothy'))} preface={colPreface(COL_BY_KEY.get('timothy'))} {...colIdxProps('timothy')} />
      </ScreenLayout>
    )),
    'vot-flock-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Letters to The Lord's Little Flock" eyebrow="The Volumes of Truth" letters={colLetterArr(COL_BY_KEY.get('flock'))} preface={colPreface(COL_BY_KEY.get('flock'))} {...colIdxProps('flock')} />
      </ScreenLayout>
    )),
    'vot-rebuke-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="The Lord's Rebuke" eyebrow="A Testament Against The World" letters={colLetterArr(COL_BY_KEY.get('rebuke'))} preface={colPreface(COL_BY_KEY.get('rebuke'))} {...colIdxProps('rebuke')} />
      </ScreenLayout>
    )),
    'wtlb-one-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Words To Live By" eyebrow={"Part One \xB7 Words of Wisdom"} letters={colLetterArr(COL_BY_KEY.get('wtlb1'))} columns={2} {...colIdxProps('wtlb1')} />
      </ScreenLayout>
    )),
    'wtlb-two-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="Words To Live By" eyebrow={"Part Two \xB7 More Words of Wisdom"} letters={colLetterArr(COL_BY_KEY.get('wtlb2'))} columns={2} {...colIdxProps('wtlb2')} />
      </ScreenLayout>
    )),
    'blessed-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <VolumeLetterIndex volumeTitle="The Blessed" eyebrow="Blessings & Promises" letters={colLetterArr(COL_BY_KEY.get('blessed')).map((e) => ({ ...e, date: e.sourceLabel || '' }))} {...colIdxProps('blessed')} />
      </ScreenLayout>
    )),

    // ── Letter screens (10) — data-guarded ──
    'vot-one-letter':    () => _wrapVot(actL('one')     && <LetterView {...sharedViewProps} {...colReadNavProps('one', true)}     {...boundaryConfig('one', actL('one'))}     letter={actL('one')}     volumeLabel="Volume One" />),
    'vot-letter':    () => _wrapVot(actL('two')     && <LetterView {...sharedViewProps} {...colReadNavProps('two', true)}     {...boundaryConfig('two', actL('two'))}       letter={actL('two')} />),
    'vot-three-letter':    () => _wrapVot(actL('three')   && <LetterView {...sharedViewProps} {...colReadNavProps('three', true)}   {...boundaryConfig('three', actL('three'))}   letter={actL('three')}     volumeLabel="Volume Three" />),
    'vot-four-letter':    () => _wrapVot(actL('four')    && <LetterView {...sharedViewProps} {...colReadNavProps('four', true)}    {...boundaryConfig('four', actL('four'))}    letter={actL('four')}     volumeLabel="Volume Four" />),
    'vot-five-letter':    () => _wrapVot(actL('five')    && <LetterView {...sharedViewProps} {...colReadNavProps('five', true)}    {...boundaryConfig('five', actL('five'))}    letter={actL('five')}     volumeLabel="Volume Five" />),
    'vot-six-letter':    () => _wrapVot(actL('six')     && <LetterView {...sharedViewProps} {...colReadNavProps('six', true)}     {...boundaryConfig('six', actL('six'))}     letter={actL('six')}     volumeLabel="Volume Six" />),
    'vot-seven-letter':    () => _wrapVot(actL('seven')   && <LetterView {...sharedViewProps} {...colReadNavProps('seven', true)}   {...boundaryConfig('seven', actL('seven'))}   letter={actL('seven')}     volumeLabel="Volume Seven" />),
    'vot-timothy-letter':    () => _wrapVot(actL('timothy') && <LetterView {...sharedViewProps} {...colReadNavProps('timothy', true)} {...boundaryConfig('timothy', actL('timothy'))} letter={actL('timothy')} volumeLabel="Letters from Timothy" />),
    'vot-flock-letter':    () => _wrapVot(actL('flock')   && <LetterView {...sharedViewProps} {...colReadNavProps('flock', true)}   {...boundaryConfig('flock', actL('flock'))}   letter={actL('flock')}   volumeLabel="Letters to The Lord's Little Flock" />),
    'vot-rebuke-letter':    () => _wrapVot(actL('rebuke')  && <LetterView {...sharedViewProps} {...colReadNavProps('rebuke', true)}  {...boundaryConfig('rebuke', actL('rebuke'))} letter={actL('rebuke')}  volumeLabel="The Lord's Rebuke" />),

    // ── WTLB / Blessed entry screens (3) — data-guarded ──
    'wtlb-one-entry':    () => _wrapVot(actL('wtlb1')   && <WtlbEntryView {...sharedViewProps} {...colReadNavProps('wtlb1')}   {...boundaryConfig('wtlb1', actL('wtlb1'))}   entry={actL('wtlb1')}   partLabel="Part One" onNavToChapter={_navToChapter} />),
    'wtlb-two-entry':    () => _wrapVot(actL('wtlb2')   && <WtlbEntryView {...sharedViewProps} {...colReadNavProps('wtlb2')}   {...boundaryConfig('wtlb2', actL('wtlb2'))}   entry={actL('wtlb2')}   partLabel="Part Two" onNavToChapter={_navToChapter} />),
    'blessed-entry':    () => _wrapVot(actL('blessed') && <WtlbEntryView {...sharedViewProps} {...colReadNavProps('blessed')} {...boundaryConfig('blessed', actL('blessed'))} entry={actL('blessed')} partLabel="The Blessed" onNavToChapter={_navToChapter} />),

    // ── AppShell / settings / search / home / library (P8b — 20 medium
    //    prop-threading screens folded in; same pattern as P8a). ──
    'settings': () => (typeof SettingsScreen !== 'undefined') ? (
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
    ) : _corpusView(window.__screensE, window.__loadScreensE, 'Loading…'),
    'search': () => (typeof SearchScreen !== 'undefined') ? (
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
    ) : _corpusView(window.__screensE, window.__loadScreensE, 'Loading…'),
    'home': () => (
      <HomeScreen
        onSelect={handleSelect}
        onSurprise={handleSurprise}
        showSurprise={settings.showSurpriseButton}
        onSettings={goSettings}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        onAbout={goAbout}
        history={readHistory}
        translation={settings.translation}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'about': () => (
      <AboutScreen
        onContinue={() => { AboutSeenFlagStore.set(); goNavOrigin(); }}
        onBack={() => { AboutSeenFlagStore.set(); goNavOrigin(); }}
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
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'highlights-index': () => typeof HighlightsScreen !== 'undefined' && (
      <HighlightsScreen
        onSettings={goSettings}
        onBack={goNavOrigin}
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
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'journal-home': () => typeof JournalHubScreen !== 'undefined' && (
      <JournalHubScreen
        onSettings={goSettings}
        onBack={goNavOrigin}
        onHome={goHome}
        onOpenEntry={(eid) => goJournalViewer(eid)}
        onEditEntry={(eid) => goJournalEditor(eid)}
        onCreateEntry={createAndEditJournal}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
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
          // hub. The navHandoff 'notesReturnCtx' slot is consumed by
          // NotesIndexScreen on mount to pre-drill the right notebook (same
          // channel the back-pill uses; see utils/nav-handoff.js).
          window.navHandoff.set('notesReturnCtx', { tab: 'notebooks', drilledNbId: nbId });
          setNavOrigin({ screen: 'journal-viewer' });
          setScreen('notes-index');
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
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
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'notes-index': () => (
      <NotesIndexScreen
        onSettings={goSettings}
        onBack={goNavOrigin}
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
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'links-index': () => (
      <LinksScreen
        onSettings={goSettings}
        onBack={goNavOrigin}
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
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'bookmarks-index': () => (
      <BookmarksScreen
        onSettings={goSettings}
        onBack={goNavOrigin}
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
        translation={settings.translation}
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
    'matthew-idx': () => {
      // Q8.2: MATTHEW lazy-loaded — show loading (or a retry on failure, E1).
      if (typeof MATTHEW === 'undefined') return _corpusView(window.__matthewCorpus, window.__loadMatthewCorpus, 'Loading Matthew…');
      return (
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
      );
    },
    'studies-home': () => (
      <StudiesHome
        studies={UNIFIED_CHAIN}
        studiesLoading={studiesLoading}
        studiesError={studiesError}
        onRetry={retryStudies}
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
    'bible-idx': () => {
      if (book) return (
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
      );
      // Q8: BOOKS not loaded yet — show loading (or a retry on failure, E1).
      if (bookId && typeof window.__bibleCorpus !== 'undefined' && !window.__bibleCorpus.loaded) {
        return _corpusView(window.__bibleCorpus, window.__loadBibleCorpus, 'Loading Bible…');
      }
      return null;
    },
    'bible-ch': () => {
      if (book && chapter) return (
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
        onLinkOpen={openLinkSidebar}
      />
      );
      // Q8: BOOKS not loaded yet — show loading (or a retry on failure, E1).
      if (bookId && typeof window.__bibleCorpus !== 'undefined' && !window.__bibleCorpus.loaded) {
        return _corpusView(window.__bibleCorpus, window.__loadBibleCorpus, 'Loading Bible…');
      }
      return null;
    },

    // ── IIFE screens — render-time-derived locals (study lookups,
    //    letter shims, chain-aware boundaries) extracted to their own
    //    components in src/ui/screens/. ──
    'matthew-ch': () => {
      // Q8.2: MATTHEW lazy-loaded — show loading (or a retry on failure, E1).
      if (typeof MATTHEW === 'undefined') return _corpusView(window.__matthewCorpus, window.__loadMatthewCorpus, 'Loading Matthew…');
      // The Matthew study cards cross-reference VOT letters; resolveVotLetter only
      // resolves once the VOT corpus has loaded and __finishVotInit has rebuilt
      // VOT_LETTER_REGISTRY. On a cold-boot restore STRAIGHT into Matthew, nothing
      // else pulls the VOT corpus, so every letter card renders as an un-tappable
      // gold box with no chevron. Kick the load in the BACKGROUND — idempotent and
      // async-notify-only (same render-phase contract as _corpusView's loadFn), so
      // it never blocks the verses; useLazyBundles re-renders App when the corpus
      // arrives, upgrading the cards to tappable.
      if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus();
      return (
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
          openLinkSidebar={openLinkSidebar}
        />
      );
    },

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

    'holy-days-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        <HolyDaysPlaylistHeader />
        <VolumeLetterIndex volumeTitle="Regarding The Holy Days" eyebrow="The Appointed Times" letters={colLetterArr(COL_BY_KEY.get('holydays')).map((e) => ({ ...e, date: e.date || e.sourceLabel || '' }))} {...colIdxProps('holydays')} />
      </ScreenLayout>
    )),

    'holy-days-entry': () => {
      const hdEntry = actL('holydays');
      if (!hdEntry) return null;
      const bc = boundaryConfig('holydays', hdEntry);
      if (hdEntry.type === 'wtlb') {
        return <WtlbEntryView {...sharedViewProps} {...colReadNavProps('holydays')} {...bc} entry={hdEntry} partLabel="Regarding The Holy Days" onNavToChapter={_navToChapter} footnotesMode={true} />;
      }
      const letterShim = { ...hdEntry, prevLetter: hdEntry.prevEntry || null, nextLetter: hdEntry.nextEntry || null };
      return <LetterView {...sharedViewProps} {...colReadNavProps('holydays')} {...bc} letter={letterShim} volumeLabel="Regarding The Holy Days" />;
    },

    'hm-letter': () => {
      const hmEntry = actL('hm');
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

    'garden-view': () => (typeof GardenView !== 'undefined') ? (
      <GardenView
        page={gardenPage}
        onPageChange={(p) => setGardenPage(p)}
        onBack={goVolumesHome}
        theme={theme} onThemeChange={setTheme}
        tier={settings.gardenTier || GARDEN_DEFAULT_TIER}
      />
    ) : _corpusView(window.__screensE, window.__loadScreensE, 'Loading…'),
  };
}

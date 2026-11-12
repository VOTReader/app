/* ═══════════════════════════════════════════════════════════════════════
   MatthewChapterView — Cluster G (bundle-d since lz1; lazy bundle-g before)
   ═══════════════════════════════════════════════════════════════════════
   The Matthew chapter screen — extracted from the inline `matthew-ch`
   ROUTES entry in app.jsx (Phase 2 P9b). Wraps ChapterView with the
   chain-aware boundary logic that lights up when Matthew is entered via
   Studies (fromStudies=true): ch 1 prev / ch 28 next route to the
   unified heavy→light chain's previous/next entry; inner chapters use
   ChapterView's built-in prevCh/nextCh. Composes with ModeToggle.

   Returns null when no chapter is selected.

   Free-variable refs (MATTHEW, ChapterView, ModeToggle, studyShortTitle)
   resolve from window at call time — same convention as the other 24
   screens in this cluster.
   ═══════════════════════════════════════════════════════════════════════ */

export function MatthewChapterView({
  // Identity
  chapter, chapterNum, mode, showStudy,
  // Context
  fromStudies, settings,
  // Streaming audio — the recorded edition chosen in Settings, or null when
  // Bible Audio is off (screen-routes' bibleAudioProp, same prop bible-ch and
  // the chapter indexes take).
  bibleAudio = null,
  // The reader's read-along settings, resolved ONCE in screen-routes
  // (sharedViewProps) so this screen reads the same values every other
  // read-along surface does rather than re-deriving them from `settings`.
  readAlongOn = true, readAlongFollow = true,
  // Focus-hidden state (passed through to ChapterView)
  titleFocusHidden, setTitleFocusHidden,
  // Chain nav (from useReadingChainNav)
  prevChainEntry, nextChainEntry,
  goToChainEntryFirst, goToChainEntryLast,
  // State setters
  setSurpriseAnchor, setFromStudies, setMode, setShowStudy,
  // Read progress
  markRead,
  getReadKey,
  // Selection
  selectMatthewCh,
  // Nav helpers
  goMatthewIdx, goSearch, goSettings, goHistory, goToLetterFromMatthew,
  // Visual + linking
  theme, setTheme, surpriseAnchor,
  backHint, tapThroughBack,
  openLinkSidebar, onNavigateToLink,
  // search200 UX B1: the results back and the tracker switch for a search hit's look
  navBack = null, markAsReadEnabled,
  // TABS3: the route's values for one page (screen-routes pagePropsFor), for a swipe neighbour
  pagePropsFor = null,
}) {
  if (!chapter) return null;
  // Chain-aware boundaries: when entered via Studies (fromStudies=true),
  // Matthew participates in the unified heavy→light chain. Ch 1 prev →
  // previous chain entry's last chapter; Ch 28 next → next chain entry's
  // first chapter. Matthew's own ch N ↔ ch N±1 uses ChapterView's
  // built-in prevCh/nextCh so the inner chapters feel normal.
  const mtLastNum = MATTHEW.chapters[MATTHEW.chapters.length - 1].num;
  const chainPrevAt = (/** @type {number} */ num) => (fromStudies && num === 1 ? prevChainEntry('matthew-study') : null);
  const chainNextAt = (/** @type {number} */ num) => (fromStudies && num === mtLastNum ? nextChainEntry('matthew-study') : null);
  const edgeOf = (/** @type {any} */ e) => (e ? { short: studyShortTitle(e.title), title: studyShortTitle(e.title) } : null);
  const chainPrev = chainPrevAt(chapter.num);
  const chainNext = chainNextAt(chapter.num);
  // TABS3: a swipe neighbour's own edges and mark-as-read (ChapterView's _chPeek), so chapter 1 or 28 under the finger
  // carries the end card it will have.
  const pageFor = (/** @type {any} */ ch) => ({
    prevBoundary: edgeOf(chainPrevAt(ch.num)), nextBoundary: edgeOf(chainNextAt(ch.num)),
    ...(pagePropsFor ? pagePropsFor({ bookId: 'matthew', chapterNum: ch.num }) : null),
  });
  return (
    <>
      <ChapterView
        book={MATTHEW} chapter={chapter} mode={mode} showStudy={showStudy} showEchoes={settings.showInlineEchoes !== false}
        bibleAudio={bibleAudio}
        readAlongOn={readAlongOn} readAlongFollow={readAlongFollow}
        showChapterTitle={settings.showChapterTitle !== false}
        titleFocusHidden={titleFocusHidden}
        setTitleFocusHidden={setTitleFocusHidden}
        onIndex={goMatthewIdx}
        onNavigate={(num) => { setSurpriseAnchor(null); selectMatthewCh(num); }}
        onMarkRead={(payload) => markRead('matthew', chapterNum, payload)}
        readTrackKey={getReadKey ? getReadKey('matthew', chapterNum) : undefined}
        markAsReadEnabled={markAsReadEnabled === undefined ? settings.markAsRead : markAsReadEnabled}
        pagePropsFor={pageFor}
        prevBoundary={edgeOf(chainPrev)}
        onPrevBoundary={chainPrev ? () => { setFromStudies(true); goToChainEntryLast(chainPrev.slug)(); } : null}
        nextBoundary={edgeOf(chainNext)}
        onNextBoundary={chainNext ? () => { setFromStudies(true); goToChainEntryFirst(chainNext.slug)(); } : null}
        onSearch={goSearch}
        onSettings={goSettings}
        onHistory={goHistory}
        theme={theme} onThemeChange={setTheme}
        surpriseAnchor={surpriseAnchor}
        onVotLetterClick={goToLetterFromMatthew}
        backHint={backHint} onTapThroughBack={tapThroughBack} navBack={navBack}
        onLinkOpen={openLinkSidebar}
        onNavigateToLink={onNavigateToLink}
        heroExtra={<ModeToggle mode={mode} onChange={setMode} showStudy={showStudy} onShowStudyChange={setShowStudy} />}
      />
    </>
  );
}

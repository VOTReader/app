/* ═══════════════════════════════════════════════════════════════════════
   MatthewChapterView — Cluster D (esbuild bundle-d.js)
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
  // Focus-hidden state (passed through to ChapterView)
  titleFocusHidden, setTitleFocusHidden,
  // Chain nav (from useReadingChainNav)
  prevChainEntry, nextChainEntry,
  goToChainEntryFirst, goToChainEntryLast,
  // State setters
  setSurpriseAnchor, setFromStudies, setMode, setShowStudy,
  // Read progress
  markRead,
  // Selection
  selectMatthewCh,
  // Nav helpers
  goMatthewIdx, goSearch, goSettings, goHistory, goToLetterFromMatthew,
  // Visual + linking
  theme, setTheme, surpriseAnchor,
  backHint, tapThroughBack,
  openLinkSidebar,
}) {
  if (!chapter) return null;
  // Chain-aware boundaries: when entered via Studies (fromStudies=true),
  // Matthew participates in the unified heavy→light chain. Ch 1 prev →
  // previous chain entry's last chapter; Ch 28 next → next chain entry's
  // first chapter. Matthew's own ch N ↔ ch N±1 uses ChapterView's
  // built-in prevCh/nextCh so the inner chapters feel normal.
  const mtLastNum = MATTHEW.chapters[MATTHEW.chapters.length - 1].num;
  const atFirstCh = chapter.num === 1;
  const atLastCh = chapter.num === mtLastNum;
  const chainPrev = fromStudies && atFirstCh ? prevChainEntry('matthew-study') : null;
  const chainNext = fromStudies && atLastCh ? nextChainEntry('matthew-study') : null;
  return (
    <>
      <ChapterView
        book={MATTHEW} chapter={chapter} mode={mode} showStudy={showStudy} showEchoes={settings.showInlineEchoes !== false}
        showChapterTitle={settings.showChapterTitle !== false}
        titleFocusHidden={titleFocusHidden}
        setTitleFocusHidden={setTitleFocusHidden}
        onIndex={goMatthewIdx}
        onNavigate={(num) => { setSurpriseAnchor(null); selectMatthewCh(num); }}
        onMarkRead={() => markRead('matthew', chapterNum)}
        markAsReadEnabled={settings.markAsRead}
        showProgressBar={settings.showProgressBar}
        prevBoundary={chainPrev ? { short: studyShortTitle(chainPrev.title), title: studyShortTitle(chainPrev.title) } : null}
        onPrevBoundary={chainPrev ? () => { setFromStudies(true); goToChainEntryLast(chainPrev.slug)(); } : null}
        nextBoundary={chainNext ? { short: studyShortTitle(chainNext.title), title: studyShortTitle(chainNext.title) } : null}
        onNextBoundary={chainNext ? () => { setFromStudies(true); goToChainEntryFirst(chainNext.slug)(); } : null}
        onSearch={goSearch}
        onSettings={goSettings}
        onHistory={goHistory}
        theme={theme} onThemeChange={setTheme}
        surpriseAnchor={surpriseAnchor}
        onVotLetterClick={goToLetterFromMatthew}
        backHint={backHint} onTapThroughBack={tapThroughBack}
        onLinkOpen={openLinkSidebar}
      />
      <ModeToggle mode={mode} onChange={setMode} showStudy={showStudy} onShowStudyChange={setShowStudy} />
    </>
  );
}

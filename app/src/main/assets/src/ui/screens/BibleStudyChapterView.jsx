/* ═══════════════════════════════════════════════════════════════════════
   BibleStudyChapterView — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The study-chapter screen — extracted from the inline `bible-study-chapter`
   ROUTES entry in app.jsx (Phase 2 P9a). Wraps LetterView with study-
   specific transforms: letterShim construction (chapter→study fallback
   for resource fields), chain-aware boundaries (heavy→light prev/next
   across studies + Matthew), and the cross-study/in-app letter handlers.

   Renders nothing (null) when studyId/studyChapterId aren't set, or when
   the study/chapter lookup fails. Shows a centered "Loading…" placeholder
   when studiesLoading is true and the lookup hasn't resolved yet.

   Free-variable references (COL_BY_LETTER_SC, studyShortTitle, LetterView)
   resolve from window at call time — same convention as the rest of this
   cluster.
   ═══════════════════════════════════════════════════════════════════════ */

export function BibleStudyChapterView({
  // Identity
  studyId, studyChapterId,
  // Study lookup + chain nav (from useBibleStudies + useReadingChainNav)
  getStudyById, getStudyChapter, studiesLoading,
  prevChainEntry, nextChainEntry,
  goToChainEntryFirst, goToChainEntryLast,
  // Tab-state setters (study + Matthew + letter handoff)
  setStudyChapterId, setScreen, setBookId, setChapterNum,
  setFromStudies, setLetterId, setActiveReadKey, setSurpriseAnchor,
  // Read progress (from useReadProgress)
  markRead, unmarkRead, isRead, studyReadKey,
  // Reading position (from useReadingPositionNav)
  prophecyCardStatesRef, saveProphecyCardStates,
  // Study selection
  selectStudy, selectStudyChapter,
  // Nav helpers
  goStudiesHome,
  // Common LetterView bundle (theme/search/history/settings/link/etc.)
  sharedViewProps,
}) {
  if (!studyId || !studyChapterId) return null;
  const study = getStudyById(studyId);
  const ch = getStudyChapter(study, studyChapterId);
  if (!study || !ch) return studiesLoading ? <div className="sc-sheet-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>Loading…</div> : null;
  const idx = study.chapters.findIndex((c) => c.id === studyChapterId);
  const prevCh = idx > 0 ? study.chapters[idx - 1] : null;
  const nextCh = idx < study.chapters.length - 1 ? study.chapters[idx + 1] : null;
  // Chain-aware boundary: crosses into the next/prev entry in the
  // unified heavy→light chain, which includes the Matthew Study Bible.
  const prevEntry = !prevCh ? prevChainEntry(studyId) : null;
  const nextEntry = !nextCh ? nextChainEntry(studyId) : null;

  // Build the letter-shaped object expected by LetterView.
  // Resource fields (audio/video/relatedTopics/etc.) fall back from
  // chapter → study, so the study can declare them once and every
  // chapter inherits. Chapter-level values override when present.
  const pick = (chVal, studyVal, empty) => {
    if (chVal === undefined || chVal === null) return studyVal != null ? studyVal : empty;
    if (Array.isArray(chVal)) return chVal.length ? chVal : studyVal || empty;
    return chVal;
  };
  const letterShim = {
    id: ch.id,
    title: ch.title,
    subtitle: ch.subtitle || null,
    num: ch.num,
    date: null, from: null, spoken: null, forLine: null,
    preamble: ch.part ? `Part ${ch.part}` : null,
    blocks: ch.blocks || [],
    sectionIntro: ch.sectionIntro || null,
    footnotes: ch.footnotes || {},
    nkjv: ch.nkjv || {},
    prevLetter: prevCh ? { id: prevCh.id, title: prevCh.title } : null,
    nextLetter: nextCh ? { id: nextCh.id, title: nextCh.title } : null,
    relatedTopics: pick(ch.relatedTopics, study.relatedTopics, []),
    bibleStudies: pick(ch.bibleStudies, study.bibleStudies, []),
    videos: pick(ch.videos, study.videos, []),
    audioUrl: pick(ch.audioUrl, study.audioUrl, null),
    soundcloudUrl: pick(ch.soundcloudUrl, study.soundcloudUrl, null),
    videoVoiceUrl: pick(ch.videoVoiceUrl, study.videoVoiceUrl, null),
    videoVoiceLabel: pick(ch.videoVoiceLabel, study.videoVoiceLabel, null),
    videoMusicUrl: pick(ch.videoMusicUrl, study.videoMusicUrl, null),
    addendum: pick(ch.addendum, study.addendum, null),
  };

  // onStudyNavigate: internal jump to another study. Saves current
  // location so back returns here via existing fromSearch-style logic.
  const jumpToStudy = (targetSlug) => {
    if (targetSlug === 'matthew-study') {
      setFromStudies(true);
      setBookId('matthew'); setChapterNum(null); setScreen('matthew-idx');
      return;
    }
    const target = getStudyById(targetSlug);
    if (!target || target.locked) return;
    selectStudy(targetSlug);
  };
  const handleLetterClick = (lid, sc) => {
    setFromStudies(true);
    setLetterId(lid);
    const _col = COL_BY_LETTER_SC.get(sc);
    if (_col) setActiveReadKey(_col.readKey);
    setScreen(sc);
  };
  return (
    <LetterView
      {...sharedViewProps}
      letter={letterShim}
      studyMode={true}
      volumeLabel={study.title}
      onHome={() => { if (study.chapters.length > 1) { setStudyChapterId(null); setScreen('bible-study-index'); } else { goStudiesHome(); } }}
      onNavigate={(chId) => { setSurpriseAnchor(null); selectStudyChapter(studyId, chId); }}
      onStudyNavigate={jumpToStudy}
      onLetterClick={handleLetterClick}
      onMarkRead={() => markRead(studyReadKey(study.slug), studyChapterId)}
      onUnmark={() => unmarkRead(studyReadKey(study.slug), studyChapterId)}
      isRead={(id) => isRead(studyReadKey(study.slug), id)}
      prevBoundary={prevEntry ? { short: studyShortTitle(prevEntry.title), title: studyShortTitle(prevEntry.title) } : null}
      onPrevBoundary={prevEntry ? goToChainEntryLast(prevEntry.slug) : null}
      nextBoundary={nextEntry ? { short: studyShortTitle(nextEntry.title), title: studyShortTitle(nextEntry.title) } : null}
      onNextBoundary={nextEntry ? goToChainEntryFirst(nextEntry.slug) : null}
      prophecyCardStatesRef={prophecyCardStatesRef}
      saveProphecyCardStates={saveProphecyCardStates}
    />
  );
}

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
  markRead, unmarkRead, isRead, getReadKey, studyReadKey,
  // Reading position (from useReadingPositionNav)
  prophecyCardStatesRef, saveProphecyCardStates,
  // Study selection
  selectStudy, selectStudyChapter,
  // Nav helpers
  goStudiesHome,
  // useFromLetterStack — the two jumps below are cross-screen links, so they
  // raise the same "‹ Back to …" pill every other in-content link does. They
  // push DIRECTLY rather than routing through navigateToLink, because that
  // router nulls studyId/studyChapterId — which the `fromStudies` fallback
  // still needs after the single-shot pill is pruned.
  pushFromLetter,
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

  // Build the letter-shaped object expected by LetterView — for the CURRENT
  // chapter, and (via resolvePeek below) for a swipe-peeked neighbor.
  // Resource fields (audio/video/relatedTopics/etc.) fall back from
  // chapter → study, so the study can declare them once and every
  // chapter inherits. Chapter-level values override when present.
  const pick = (chVal, studyVal, empty) => {
    if (chVal === undefined || chVal === null) return studyVal != null ? studyVal : empty;
    if (Array.isArray(chVal)) return chVal.length ? chVal : studyVal || empty;
    return chVal;
  };
  // `c` is the chapter object, `chIdx` its index in study.chapters (-1 for a
  // preface chapter living outside the array — same neighbor arithmetic as
  // before: prev null, next chapters[0]).
  const shimFor = (c, chIdx) => {
    const pc = chIdx > 0 ? study.chapters[chIdx - 1] : null;
    const nc = chIdx < study.chapters.length - 1 ? study.chapters[chIdx + 1] : null;
    return {
      id: c.id,
      title: c.title,
      subtitle: c.subtitle || null,
      num: c.num,
      date: null, from: null, spoken: null, forLine: null,
      preamble: c.part ? `Part ${c.part}` : null,
      blocks: c.blocks || [],
      sectionIntro: c.sectionIntro || null,
      footnotes: c.footnotes || {},
      nkjv: c.nkjv || {},
      prevLetter: pc ? { id: pc.id, title: pc.title } : null,
      nextLetter: nc ? { id: nc.id, title: nc.title } : null,
      relatedTopics: pick(c.relatedTopics, study.relatedTopics, []),
      bibleStudies: pick(c.bibleStudies, study.bibleStudies, []),
      videos: pick(c.videos, study.videos, []),
      audioUrl: pick(c.audioUrl, study.audioUrl, null),
      soundcloudUrl: pick(c.soundcloudUrl, study.soundcloudUrl, null),
      videoVoiceUrl: pick(c.videoVoiceUrl, study.videoVoiceUrl, null),
      videoVoiceLabel: pick(c.videoVoiceLabel, study.videoVoiceLabel, null),
      videoMusicUrl: pick(c.videoMusicUrl, study.videoMusicUrl, null),
      addendum: pick(c.addendum, study.addendum, null),
    };
  };
  const letterShim = shimFor(ch, idx);

  // Swipe-peek resolver for LetterView's pager: a same-study neighbor renders
  // as the REAL study-chapter page (the neighbor's shim through the same
  // inert-LetterView path the VOT letters use) instead of the generic
  // "Continue" boundary card the default VOT-collection resolver degraded to.
  // The scroll key mirrors useScrollMemory's 'study-<studyId>-<chapterId>'
  // branch, so the peek opens at the neighbor's saved reading position.
  const resolvePeek = (nb) => {
    const i = study.chapters.findIndex((c) => c.id === nb.id);
    if (i < 0) return null;
    return { letter: shimFor(study.chapters[i], i), scrollKey: 'study-' + studyId + '-' + nb.id };
  };

  // Where a link tapped in THIS chapter came from, for the back-pill.
  const pillSource = (destSnapshot) => ({
    sourceScreen: 'bible-study-chapter',
    sourceBookId: null, sourceChapterNum: null, sourceLetterId: null,
    sourceStudyId: studyId, sourceStudyChapterId: studyChapterId,
    sourceLetterTitle: ch.title || study.title,
    sourceVolumeLabel: study.title,
    destSnapshot: destSnapshot,
  });

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
    // selectStudy lands on bible-study-chapter only for a single-chapter /
    // singlePage study; a multi-chapter one lands on bible-study-index, which
    // has no pill renderer — pushing there would be a dead entry the prune
    // effect evicts on the next tap. matthew-idx (above) likewise.
    const only = (target.chapters && (target.chapters.length === 1 || target.singlePage)) ? target.chapters[0] : null;
    if (only && pushFromLetter) {
      pushFromLetter(pillSource({ screen: 'bible-study-chapter', bookId: null, chapterNum: null, letterId: null, studyId: targetSlug, studyChapterId: only.id }));
    }
    selectStudy(targetSlug);
  };
  const handleLetterClick = (lid, sc) => {
    setFromStudies(true);
    if (pushFromLetter) {
      pushFromLetter(pillSource({ screen: sc, bookId: null, chapterNum: null, letterId: lid, studyId: null, studyChapterId: null }));
    }
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
      onMarkRead={(payload) => markRead(studyReadKey(study.slug), studyChapterId, payload)}
      readTrackKey={getReadKey ? getReadKey(studyReadKey(study.slug), studyChapterId) : undefined}
      onUnmark={() => unmarkRead(studyReadKey(study.slug), studyChapterId)}
      isRead={(id) => isRead(studyReadKey(study.slug), id)}
      prevBoundary={prevEntry ? { short: studyShortTitle(prevEntry.title), title: studyShortTitle(prevEntry.title) } : null}
      onPrevBoundary={prevEntry ? goToChainEntryLast(prevEntry.slug) : null}
      nextBoundary={nextEntry ? { short: studyShortTitle(nextEntry.title), title: studyShortTitle(nextEntry.title) } : null}
      onNextBoundary={nextEntry ? goToChainEntryFirst(nextEntry.slug) : null}
      prophecyCardStatesRef={prophecyCardStatesRef}
      saveProphecyCardStates={saveProphecyCardStates}
      resolvePeek={resolvePeek}
    />
  );
}

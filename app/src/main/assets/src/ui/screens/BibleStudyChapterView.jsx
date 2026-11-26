/* ═══════════════════════════════════════════════════════════════════════
   BibleStudyChapterView — Cluster G (bundle-d since lz1; lazy bundle-g before)
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
  setStudyChapterId, setScreen,
  setFromStudies, setLetterId, setActiveReadKey, setSurpriseAnchor,
  // Read progress (from useReadProgress)
  markRead, unmarkRead, isRead, getReadKey, studyReadKey,
  // Reading position (from useReadingPositionNav)
  prophecyCardStatesRef, saveProphecyCardStates,
  // Study selection
  selectStudyChapter,
  // Nav helpers
  goStudiesHome,
  // useFromLetterStack — a letter link below is a cross-screen link, so it
  // raises the same "‹ Back to …" pill every other in-content link does. It
  // pushes DIRECTLY rather than routing through navigateToLink, because that
  // router nulls studyId/studyChapterId — which the `fromStudies` fallback
  // still needs after the single-shot pill is pruned.
  pushFromLetter,
  // Common LetterView bundle (theme/search/history/settings/link/etc.)
  sharedViewProps,
}) {
  // The study's recordings are in AUDIO_MANIFEST, which rides bundle-a-vot — the
  // LAZY letter corpus — so a study reached cold (Home > Studies > here) has no
  // manifest and LetterView's hasAudio reads "no recording" for six that ship
  // (ruling (4), 2026-09-11; caught by e2e-study-audio's first outing). Warm it
  // the way the Listening Library does; App's useLazyBundles re-renders this
  // route when it lands, so the pill appears without a subscription here. On an
  // installed profile the bundle is precached (CORPUS_PRECACHE) — a cache read
  // and a parse, no network. A study's letter links kick the same corpus anyway.
  // First statement of the component: the early returns below must not skip it
  // (rules-of-hooks), and a study still loading may as well warm the corpus too.
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, []);
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
      // A02.10: the Studies list counts a study's units as Parts, or, when it is grouped in parts, as chapters
      unitWord: study.parts ? 'Chapter' : 'Part',
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

  // The edge cards of a neighbour drawn under the finger (LetterView spreads this over the peek's props): the first
  // part's "Previous" study and the last part's "Next" study, as that part shows them once it is the page.
  const edge = (e) => (e ? { short: studyShortTitle(e.title), title: studyShortTitle(e.title) } : null);
  const boundaryFor = (_volKey, l) => {
    const i = study.chapters.findIndex((c) => c.id === l.id);
    return {
      prevBoundary: i > 0 ? null : edge(prevChainEntry(studyId)),
      nextBoundary: i < study.chapters.length - 1 ? null : edge(nextChainEntry(studyId)),
    };
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
      volKey="study"
      studyMode={true}
      volumeLabel={study.title}
      onHome={() => { if (study.chapters.length > 1) { setStudyChapterId(null); setScreen('bible-study-index'); } else { goStudiesHome(); } }}
      onNavigate={(chId) => { setSurpriseAnchor(null); selectStudyChapter(studyId, chId); }}
      onLetterClick={handleLetterClick}
      onMarkRead={(payload) => markRead(studyReadKey(study.slug), studyChapterId, payload)}
      readTrackKey={getReadKey ? getReadKey(studyReadKey(study.slug), studyChapterId) : undefined}
      onUnmark={() => unmarkRead(studyReadKey(study.slug), studyChapterId)}
      isRead={(id) => isRead(studyReadKey(study.slug), id)}
      prevBoundary={edge(prevEntry)}
      onPrevBoundary={prevEntry ? goToChainEntryLast(prevEntry.slug) : null}
      nextBoundary={edge(nextEntry)}
      onNextBoundary={nextEntry ? goToChainEntryFirst(nextEntry.slug) : null}
      prophecyCardStatesRef={prophecyCardStatesRef}
      saveProphecyCardStates={saveProphecyCardStates}
      resolvePeek={resolvePeek}
      boundaryFor={boundaryFor}
    />
  );
}

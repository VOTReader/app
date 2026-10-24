/* ═══════════════════════════════════════════════════════════════════════
   ChapterView — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { savedScrollFor } from '../components/pager-preview.jsx';
import { AudioPlayer } from '../../utils/audio-player.js';
import { HeroListen, bibleHero } from '../components/AudioPlayButton.jsx';
import { ReadAlongHighlight } from '../components/ReadAlongHighlight.jsx';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { tapToggle } from '../../utils/tap-guard.js';
import { getEchoesForVerse, getNotesForVerse } from '../../utils/scripture-parse.js';
import { studyHlKey } from '../../utils/hl-keys.js';
import { BackHintPill } from '../components/BackHintPill.jsx';

export function ChapterView({ book, chapter, mode, showStudy, showEchoes, showChapterTitle, titleFocusHidden, setTitleFocusHidden, onIndex, onNavigate, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, readTrackKey, markAsReadEnabled, onVotLetterClick, onLinkOpen, backHint, onTapThroughBack, navBack = null, onNavigateToLink, inert = false, restoreScroll = null, bibleAudio = null, readAlongOn = true, readAlongFollow = true }) {
  const bodyRef = React.useRef(null);
  /* The eyebrow ("Book · Chapter N") is what the narrator says before verse 1:
     the read-along's lead-in (ReadAlongHighlight, 2026-09-22). */
  const [activeScripRef, setActiveScripRef] = React.useState(null);
  const [highlightedVerses, setHighlightedVerses] = React.useState([]);
  /* C2-C [C2]: this screen said "Matthew" in five places — three of them
     unconditionally (the hero eyebrow and both bottom-nav cards) and two as a
     `book.title || 'Matthew'` fallback. It renders whatever `book` it is
     handed; naming a different book than the one on screen is the
     misattribution class the corpus audits exist to prevent. One derived
     label feeds every site, and when a book carries no title the book half is
     dropped rather than invented. */
  const bookLabel = (book && book.title) || '';
  const chapterRef = (n) => bookLabel ? `${bookLabel} ${n}` : `Chapter ${n}`;
  // "Go to Scripture" on the study-note scripture sheet — close the sheet,
  // then route the resolved {type:'bible'} endpoint through navigateToLink
  // (verse flash highlight + "Back to …" pill + Android back).
  const goToScriptureRef = onNavigateToLink ? (endpoint) => {
    setActiveScripRef(null);
    onNavigateToLink(endpoint, {
      sourceLetterTitle: chapterRef(chapter.num),
      sourceVolumeLabel: 'Study Bible',
    });
  } : null;

  React.useEffect(() => {
    if (!activeScripRef) return;
    var prev = window.__closeSheet;
    window.__closeSheet = () => setActiveScripRef(null);
    return () => { window.__closeSheet = prev || null; };
  }, [activeScripRef]);

  // W1.5(a.2) — Escape-key dispatch registration. The scripture sheet is
  // always rendered (line ~233 mounts <ScriptureSheet activeRef={...}/>);
  // the registry gate uses `activeScripRef` because the sheet's onClose
  // is what actually clears the active ref (= the only meaningful close).
  useModalRegistry({
    id: 'scripture-sheet',
    dismiss: () => setActiveScripRef(null),
    active: !!activeScripRef,
  });

  React.useEffect(() => {
    if (!surpriseAnchor || surpriseAnchor.type !== "verse") return;
    const vs = surpriseAnchor.verses;
    setHighlightedVerses(vs);
    const timer = setTimeout(() => {
      const el = document.getElementById(`v-${vs[0]}`);
      if (el) el.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    }, 150);
    const fadeTimer = setTimeout(() => setHighlightedVerses([]), 4000);
    // v01-02: the cleanup cancels the fade, so it must also clear the flash: the
    // anchor only changes with navigation, and this instance is reused (no key) for
    // the next chapter, where the same verse numbers would light up and the
    // read-along would seek to them. (BibleChapterView carries the same pair.)
    return () => { clearTimeout(timer); clearTimeout(fadeTimer); setHighlightedVerses([]); };
  }, [surpriseAnchor]);
  // v01-02: a landing belongs to the chapter it landed in, even on a way of moving
  // that leaves the anchor set.
  React.useEffect(() => () => setHighlightedVerses([]), [book.id, chapter.num]);
  const prevCh = book.chapters.find((c) => c.num === chapter.num - 1);
  const nextCh = book.chapters.find((c) => c.num === chapter.num + 1);
  const goPrevCh = () => prevCh ? onNavigate(prevCh.num) : onPrevBoundary && onPrevBoundary();
  const goNextCh = () => nextCh ? onNavigate(nextCh.num) : onNextBoundary && onNextBoundary();
  const verses = chapter.verses || [];

  // Visible finger-follow page swipe (ScreenLayout `pager`). The neighbor page
  // that drags in is the REAL ChapterView rendered inert (ScreenLayout `inert` +
  // PagerPeek kind:'screen'): identical component → identical verse layout,
  // study notes, echoes, section headings, and inline highlight/link/bookmark
  // icons, before and after the swipe commits (no more "study notes pop in after
  // release"). A study boundary peeks a card. Render-affecting settings (mode,
  // showStudy/Echoes, chapter-title visibility) are threaded so the clone
  // matches exactly what the committed chapter will show.
  const _chPeek = (ch) => ({
    kind: 'screen',
    el: (
      // @ts-expect-error -- inert clone: only render-affecting props are passed; interactive callbacks (onIndex/onNavigate/…) are intentionally omitted (the peek is pointer-events:none + HTML inert, so they can never fire).
      <ChapterView
        book={book}
        chapter={ch}
        mode={mode}
        showStudy={showStudy}
        showEchoes={showEchoes}
        showChapterTitle={showChapterTitle}
        titleFocusHidden={titleFocusHidden}
        theme={theme}
        markAsReadEnabled={false}
        inert={true}
        restoreScroll={savedScrollFor(book.id + '-' + ch.num)}
      />
    ),
  });
  const _boundaryPeek = (b, dir) => b ? { kind: 'boundary', eyebrow: b.short ? `${dir} \xB7 ${b.short}` : (dir === 'Next' ? 'Next Book' : 'Previous Book'), title: b.title } : null;
  const pager = {
    onPrev: goPrevCh,
    onNext: goNextCh,
    peek: (side) => side === 'next'
      ? (nextCh ? _chPeek(nextCh) : _boundaryPeek(nextBoundary, 'Next'))
      : (prevCh ? _chPeek(prevCh) : _boundaryPeek(prevBoundary, 'Previous')),
  };

  // An inert clone (a swipe peek) must never claim __onReadingComplete.
  useMarkAsRead(inert ? false : markAsReadEnabled, onMarkRead, readTrackKey);
  const hasLinks = chapter.links && chapter.links.length > 0;
  // The verse key builder read-along paints through (sweep v025). Memoized for
  // the reason BibleChapterView gives: hlKeyFn sits in the dependency arrays of
  // ReadAlongHighlight's rAF loop, safety-net repaint, tap-to-seek and seek
  // effects, so a fresh arrow per render re-ran all four on every render.
  const studyKeyFn = React.useCallback(
    (bookId, n) => studyHlKey(bookId + '-' + chapter.num, n),
    [chapter.num],
  );

  return (
    <ScreenLayout
      inert={inert}
      restoreScroll={restoreScroll}
      pager={inert ? undefined : pager}
      placeKey={(book && book.id) + '-' + (chapter && chapter.num)}
      stickyNav={<StickyChapterNav
        onPrev={goPrevCh}
        onNext={goNextCh}
        prevDisabled={!prevCh && !prevBoundary}
        nextDisabled={!nextCh && !nextBoundary}
        prevLabel="Previous chapter"
        nextLabel="Next chapter"
      />}
      navChildren={LibraryNav({
        // onIndex — NOT onBack. onBack is the in-content back-hint pill.
        // navBack (search200 UX B1): from a search hit the ‹ returns to the results.
        onBack: navBack ? navBack.onBack : onIndex, backLabel: navBack ? navBack.label : book.title,
        arrows: {
          onPrev: goPrevCh, onNext: goNextCh,
          prevDisabled: !prevCh && !prevBoundary,
          nextDisabled: !nextCh && !nextBoundary,
          prevLabel: 'Previous chapter', nextLabel: 'Next chapter',
        },
        reading: true,
        // Derive from book.id like the verse keys two blocks below — the old
        // literal 'matthew-' would silently mis-key any future non-Matthew use.
        chapterBookmark: (book && chapter) ? { hlKey: 'study:' + book.id + '-' + chapter.num, label: chapterRef(chapter.num) + ' (Study)' } : null,
        onSettings, onHistory, onSearch, theme, onThemeChange,
      })}
    >
      <BackHintPill backHint={backHint} onClick={onTapThroughBack} />
      <header className="hero">
        <div className="hero-bg" />
        <div className="hero-content">
          {/* A02.12: the heading said "Chapter N" under an eyebrow that already said it. It is the chapter's title,
              as the Bible hero's is (tap it to hide it; the book's subtitle stands in), and the eyebrow names the
              study edition (A02.2), so it never reads as the plain Matthew. */}
          <div className="hero-eyebrow">{bookLabel ? <>{bookLabel} Study Bible {"\xA0\xB7\xA0"} </> : null}Chapter {chapter.num}</div>
          <h1 className="hero-title">
            {chapter.title && showChapterTitle && !titleFocusHidden ? (
              <button
                type="button"
                className="hero-title-action"
                onClick={tapToggle(() => setTitleFocusHidden && setTitleFocusHidden(true))}
                title="Tap to hide summary"
              >
                {chapter.title}
              </button>
            ) : (book.subtitle || `Chapter ${chapter.num}`)}
          </h1>
          {chapter.title && showChapterTitle && titleFocusHidden && (
            <button
              className="hero-subtitle-restore"
              onClick={tapToggle(() => setTitleFocusHidden && setTitleFocusHidden(false))}
              title="Show summary"
              aria-label="Show chapter summary"
            >+ Show summary</button>
          )}
          <div className="hero-ornament">
            <div className="hero-ornament-line" />
            <div className="hero-ornament-diamond" />
            <div className="hero-ornament-line r" />
          </div>
          {/* Matthew parity (2026-08-10): the study screen is a Bible chapter
              too, and the listening desk's title jump can LAND here — a screen
              you can be sent to by the player had no way to start it. Same
              pill, same call, same book/chapter as BibleChapterView's; absent
              when Settings' Bible Audio is off or the edition lacks the book. */}
          {bibleAudio && AudioPlayer.hasAudio(bibleAudio.volKey, book.id) && (
            <HeroListen {...bibleHero(bibleAudio, book, chapter.num)} />
          )}
        </div>
      </header>

      <div className="page-wrapper">
        {/* data-copy-key: words copied here outside a verse block still name the chapter (utils/passage-copy.js). */}
        <div className="chapter-body" ref={bodyRef} data-copy-key={'study:' + book.id + '-' + chapter.num}>
          {mode === "pdf" ? (
            /* ── PDF MODE: clean flowing verse text + study panels below ── */
            <>
              <div className="verses-block">
                {verses.map((v, vi) => {
                  const vHlKey = studyHlKey(book.id + '-' + chapter.num, v.n);
                  return (
                    <span key={vi} id={`v-${v.n}`} className={`verse${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}`}>
                      {/* The space ends the number's word (rs1), as in BibleChapterView. */}
                      <span className="verse-num">{v.n}{' '}</span>
                      <HighlightableText text={v.text} hlKey={vHlKey} />
                      <LinkIcon hlKey={vHlKey} onClick={onLinkOpen} />
                      <BookmarkIcon hlKey={vHlKey} />
                      {' '}
                    </span>
                  );
                })}
              </div>
              {showStudy && (
                <StudyPanels
                  scriptures={chapter.scriptures || []}
                  votNotes={chapter.votNotes || []}
                  onScriptureClick={setActiveScripRef}
                  onVotLetterClick={onVotLetterClick}
                  hlKeyBase={studyHlKey(book.id + '-' + chapter.num, 'panel')}
                />
              )}
            </>
          ) : (
            /* ── INLINE MODE: notes after each verse ── */
            <div className="verses-inline">
              {verses.map((v, vi) => {
                const { scriptures, votNotes } = getNotesForVerse(chapter, v.n);
                const echoes = showEchoes ? getEchoesForVerse(chapter, v.n) : { scriptures: [], votNotes: [] };
                const hasEchoes = echoes.scriptures.length > 0 || echoes.votNotes.length > 0;
                const vHlKey = studyHlKey(book.id + '-' + chapter.num, v.n);
                return (
                  <div key={vi} id={`v-${v.n}`} className={`verse-row${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}`}>
                    <div className="verse-line">
                      {/* The space ends the number's word (rs1), as in BibleChapterView. */}
                      <span className="verse-num">{v.n}{' '}</span>
                      <HighlightableText text={v.text} hlKey={vHlKey} />
                      <LinkIcon hlKey={vHlKey} onClick={onLinkOpen} />
                      <BookmarkIcon hlKey={vHlKey} />
                    </div>
                    {showStudy && (scriptures.length > 0 || votNotes.length > 0) && (
                      <InlineNotes scriptures={scriptures} votNotes={votNotes} onScriptureClick={setActiveScripRef} onVotLetterClick={onVotLetterClick} hlKeyBase={vHlKey} />
                    )}
                    {showStudy && hasEchoes && (
                      <InlineEcho scriptures={echoes.scriptures} votNotes={echoes.votNotes} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Reading-end sentinel: end of verses/body, before Further Study links,
              ornament, and nav cards. */}
          <div className="reading-end" />

          {showStudy && hasLinks && (
            <div className="study-panel-group" style={{ marginTop: "2rem" }}>
              <div className="study-panel-group-title">Further Study</div>
              <div className="study-links">
                {chapter.links.map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="study-link">
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="ornament-divider">
            <div className="ornament-divider-line" />
            <div className="ornament-divider-symbol">✦</div>
            <div className="ornament-divider-line" />
          </div>
          <div className="bottom-nav">
            {prevCh ? (
              <button className="bottom-nav-card" onClick={() => onNavigate(prevCh.num)}>
                <div className="bottom-nav-label">‹ Previous</div>
                <div className="bottom-nav-title">{chapterRef(prevCh.num)}</div>
              </button>
            ) : prevBoundary ? (
              <button className="bottom-nav-card" onClick={onPrevBoundary}>
                <div className="bottom-nav-label">‹ Previous Book</div>
                <div className="bottom-nav-title">{prevBoundary.title}</div>
              </button>
            ) : (
              <div className="bottom-nav-card placeholder">
                <div className="bottom-nav-label">‹ Previous</div>
                <div className="bottom-nav-title">—</div>
              </div>
            )}

            {nextCh ? (
              <button className="bottom-nav-card next" onClick={() => onNavigate(nextCh.num)}>
                <div className="bottom-nav-label">Next ›</div>
                <div className="bottom-nav-title">{chapterRef(nextCh.num)}</div>
              </button>
            ) : nextBoundary ? (
              <button className="bottom-nav-card next" onClick={onNextBoundary}>
                <div className="bottom-nav-label">Next Book ›</div>
                <div className="bottom-nav-title">{nextBoundary.title}</div>
              </button>
            ) : (
              <div className="bottom-nav-card next placeholder">
                <div className="bottom-nav-label">Next ›</div>
                <div className="bottom-nav-title">—</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Read-along, on the same !inert contract as BibleChapterView and
          LetterView: the swipe peek renders a REAL ChapterView clone, and two
          live mounts would fight over the single global
          ::highlight(vot-reading) registration.

          ITS OWN hlKeyFn, and that is the whole of the wiring risk here. This
          screen keys verses `studyHlKey(book.id + '-' + chapter.num, n)`; a
          mount handed the Bible key fn would look up 'bible:matthew:1:1'
          against a DOM that only ever carries 'study:matthew-1:1', paint
          nothing, and read exactly like the missing timings this mount exists
          to stop looking like. BRM already ships all 28 Matthew chapters.

          Whether the timings belong to the recording playing is resolved
          inside ReadAlongHighlight, from the track's own KEY, proved against the
          manifest row that key names — NOT from the asset name, which is what
          section 12 removed because it cannot see an edition whose assets are
          Drive ids. This screen only says which book and which chapter are on
          the page. */}
      {!inert && bibleAudio && (
        <ReadAlongHighlight
          volKey={bibleAudio.volKey}
          letterId={book.id}
          chapter={chapter.num}
          mainRef={bodyRef}
          onListen={AudioPlayer.hasAudio(bibleAudio.volKey, book.id) ? () => AudioPlayer.playBibleBook({ volKey: bibleAudio.volKey, bookId: book.id, label: bibleAudio.label, chapterNum: chapter.num }) : null}
          hlKeyFn={studyKeyFn}
          readAlongOn={readAlongOn}
          readAlongFollow={readAlongFollow}
          seekTo={highlightedVerses.length ? studyHlKey(book.id + '-' + chapter.num, highlightedVerses[0]) : null}
        />
      )}
      {/* position:fixed sheet, skipped in an inert peek (a clone is
          non-interactive; a duplicate sheet in <body> would be wrong). The live
          sheet portals to <body> itself (ScriptureSheet) so the page-swipe
          transform on `.pager-track` can't drop it off-screen. */}
      {!inert && <ScriptureSheet activeRef={activeScripRef} onClose={() => setActiveScripRef(null)} onGoToRef={goToScriptureRef} />}
    </ScreenLayout>
  );
}

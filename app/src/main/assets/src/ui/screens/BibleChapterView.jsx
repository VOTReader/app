/* ═══════════════════════════════════════════════════════════════════════
   BibleChapterView — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { savedScrollFor } from '../components/pager-preview.jsx';
import { AudioPlayer, AUDIO_TOAST_ID } from '../../utils/audio-player.js';
import { showToast } from '../../utils/toast.js';
import { HeroListen, bibleHero } from '../components/AudioPlayButton.jsx';
import { ReadAlongHighlight } from '../components/ReadAlongHighlight.jsx';
import { FindInUnit } from '../components/FindInUnit.jsx';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { InstallCard } from '../components/InstallCard.jsx';
import { PlanRibbon } from '../components/PlanRibbon.jsx';
import { tapToggle } from '../../utils/tap-guard.js';
import { bibleHlKey } from '../../utils/hl-keys.js';
import { translateVerse, loadTranslation, translationLabel, translationLang, holdTranslation, isTranslationLoaded } from '../../data/translations.js';
import { recordingTranslationFor, textForRecording } from '../../utils/audio-text-edition.js';
import { BackHintPill } from '../components/BackHintPill.jsx';
import { MiniTitleBand } from '../components/MiniTitleBand.jsx';

export function BibleChapterView({ book, chapter, onIndex, onNavigate, prevBook, nextBook, onPrevBook, onNextBook, nextBoundaryTitle, prevBoundaryTitle, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, readTrackKey, markAsReadEnabled, translation: readerTranslation, restoredNames, showChapterTitle, showSectionHeadings, titleFocusHidden, setTitleFocusHidden, headingsFocusHidden, setHeadingsFocusHidden, onLinkOpen, backHint, onTapThroughBack, navBack = null, inert = false, restoreScroll = null, bibleAudio = null, readAlongOn = true, readAlongFollow = true, onStudyNotes = null }) {
  const bodyRef = React.useRef(null);
  // The words on screen match the voice (critique 2026-10-05 #6): while this
  // book's recording is loaded, the chapter shows the recording's translation
  // (utils/audio-text-edition.js). The snapshot is a string, so the clock's
  // ticks do not re-render the chapter; only a change of recording does.
  const recording = React.useSyncExternalStore(AudioPlayer.subscribe, () => recordingTranslationFor(AudioPlayer, book.id));
  const recordingEdition = textForRecording(readerTranslation, recording);
  const matchingRecording = recordingEdition !== (readerTranslation || 'nkjv');
  /* THE KJV FOR THIS VISIT (search200 idea A, 2026-10-22, PICKS.md A). A verse its KJV wording found opens in the
     KJV (the search anchor's `edition`) under one row beneath "‹ Back to results": "Shown in KJV, as you searched"
     and "Read in <the reader's edition>". The visit is this chapter, this time: the row's button, another chapter or
     the next landing read the reader's own again, and the saved edition is never touched. A loaded recording wins
     (the words follow the voice), and a swipe peek never takes it. */
  const chapterKey = book.id + ':' + chapter.num;
  const chapterKeyRef = React.useRef(chapterKey);
  chapterKeyRef.current = chapterKey;
  const [visit, setVisit] = React.useState(/** @type {{ key: string, ed: string, verse: number } | null} */ (null));
  const visitEdition = !inert && !matchingRecording && visit && visit.key === chapterKey && visit.ed !== (readerTranslation || 'nkjv') ? visit.ed : null;
  const translation = visitEdition || recordingEdition;
  const altShown = translation !== (readerTranslation || 'nkjv');
  // An alt edition is a lazy script; translateVerse answers NKJV until it lands,
  // so its arrival is a render input here (App's own tick follows only Settings).
  const [textTick, setTextTick] = React.useState(0);
  React.useEffect(() => {
    if (!altShown) return undefined;
    let live = true;
    // W25: held while shown, or a translation switch's sweep frees it under the page.
    const letGo = holdTranslation(translation);
    loadTranslation(translation).then(() => { if (live) setTextTick((v) => v + 1); });
    return () => { live = false; letGo(); };
  }, [translation, altShown]);
  // W25: name the recording's edition only once its text is on the page; a
  // download in flight (or one that failed) still reads NKJV.
  const recordingTextShown = matchingRecording && isTranslationLoaded(translation);
  // rs1: the edition whose words are on the page, which a copied reference names (utils/passage-copy.js).
  const shownTranslation = isTranslationLoaded(translation) ? translation : 'nkjv';
  // RC.12: the hero line is the only sign of the switch, and a Listen started mid-chapter has it off-screen, so each
  // switch says so once (KJV on, the reader's own edition back on Close). A chapter that opens already switched
  // leaves it to the hero line; a swipe peek never speaks.
  const textShownBefore = React.useRef(recordingTextShown);
  React.useEffect(() => {
    if (textShownBefore.current === recordingTextShown) return;
    textShownBefore.current = recordingTextShown;
    if (inert) return;
    showToast({
      id: AUDIO_TOAST_ID, className: 'vot-toast', ariaLive: 'polite',
      text: recordingTextShown
        ? 'Showing the ' + translationLabel(translation) + ' text, to match the recording.'
        : 'Back to the ' + translationLabel(shownTranslation) + ' text.',
    });
  }, [recordingTextShown, inert, translation, shownTranslation]);
  // ...and the visit's, the same way (idea A)
  const visitShown = !!visitEdition && isTranslationLoaded(visitEdition);
  /** Where the landed verse stood when the reader asked for their own edition: it stays there (idea A). */
  const keepRef = React.useRef(/** @type {{ n: number, top: number } | null} */ (null));
  const readOwnEdition = () => {
    const el = visit && bodyRef.current ? /** @type {HTMLElement | null} */ (bodyRef.current.querySelector('#v-' + visit.verse)) : null;
    keepRef.current = el && visit ? { n: visit.verse, top: el.getBoundingClientRect().top } : null;
    setVisit(null);
  };
  React.useLayoutEffect(() => {
    const keep = keepRef.current;
    keepRef.current = null;
    const el = keep && bodyRef.current ? /** @type {HTMLElement | null} */ (bodyRef.current.querySelector('#v-' + keep.n)) : null;
    const sc = el && el.closest('.screen-scroll');
    if (!keep || !el || !sc) return;
    const drift = el.getBoundingClientRect().top - keep.top;
    // the reader's own tap, one instant write (the class of the landing's scroll): the verse holds its place
    if (Math.abs(drift) >= 1 && typeof sc.scrollTo === 'function') sc.scrollTo({ top: Math.max(0, sc.scrollTop + drift), behavior: /** @type {ScrollBehavior} */ ('instant') });
  }, [translation]);
  /* The visit's words can arrive after the landing centred its verse (a lazy KJV, search200 resume1 walk: "the way of
     the slothful" showed Proverbs 15:6-10, the KJV row and words having moved 15:19 off): when they show, the landed
     verse is centred again, once per visit. */
  const visitCentredRef = React.useRef(/** @type {any} */ (null));
  React.useLayoutEffect(() => {
    if (!visitShown || !visit || visitCentredRef.current === visit) return;
    visitCentredRef.current = visit;
    const el = bodyRef.current ? /** @type {HTMLElement | null} */ (bodyRef.current.querySelector('#v-' + visit.verse)) : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: /** @type {ScrollBehavior} */ ('instant'), block: 'center' });
  }, [visitShown, visit]);
  /* "Book · Chapter N" is what the narrator announces before verse 1: the
     read-along's lead-in sits there (ReadAlongHighlight, 2026-09-22). */
  // The verse-number key builder read-along paints through. useCallback is NOT
  // cosmetic here: hlKeyFn sits in the dependency array of the rAF loop, the
  // safety-net repaint and the tap-to-seek listener. LetterView and
  // WtlbEntryView pass module-level function identities, so those arrays are
  // stable; a fresh arrow per render would tear the frame loop down on every
  // whole-second clock tick.
  const bibleKeyFn = React.useCallback(
    (bookId, verseNum) => bibleHlKey(bookId, chapter.num, verseNum),
    [chapter.num],
  );
  const [highlightedVerses, setHighlightedVerses] = React.useState([]);
  // Restored-Name chrome lookup. When settings.restoredNames is on and
  // books-restored.js has an entry for this chapter, swap the chrome.
  // Fall back silently to the standard chrome otherwise.
  const restoredCh = restoredNames && typeof BOOKS_RESTORED !== "undefined" &&
  BOOKS_RESTORED[book.id] &&
  BOOKS_RESTORED[book.id].chapters.find((c) => c.num === chapter.num) || null;
  const displayChapterTitle = restoredCh && restoredCh.title || chapter.title;
  const getSectionHeading = (si, sec) => {
    if (restoredCh && restoredCh.sections && restoredCh.sections[si] && restoredCh.sections[si].heading) {
      return restoredCh.sections[si].heading;
    }
    return sec.heading;
  };
  React.useEffect(() => {
    if (!surpriseAnchor || surpriseAnchor.type !== "verse") return;
    const vs = surpriseAnchor.verses;
    setHighlightedVerses(vs);
    // idea A: the edition the search found the verse in, for this visit of this chapter
    setVisit(surpriseAnchor.edition ? { key: chapterKeyRef.current, ed: surpriseAnchor.edition, verse: vs[0] } : null);
    const timer = setTimeout(() => {
      const el = document.getElementById(`v-${vs[0]}`);
      if (el) el.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    }, 150);
    const fadeTimer = setTimeout(() => setHighlightedVerses([]), 4000);
    // v01-02: the cleanup cancels the fade, so it must also clear the flash: the
    // anchor only changes with navigation, and this instance is reused (no key) for
    // the next chapter, where the same verse numbers would light up and the
    // read-along would seek to them.
    return () => { clearTimeout(timer); clearTimeout(fadeTimer); setHighlightedVerses([]); };
  }, [surpriseAnchor]);
  // v01-02: a landing belongs to the chapter it landed in, even on a way of moving
  // that leaves the anchor set.
  React.useEffect(() => () => { setHighlightedVerses([]); setVisit(null); }, [book.id, chapter.num]);
  const prevCh = book.chapters.find((c) => c.num === chapter.num - 1);
  const nextCh = book.chapters.find((c) => c.num === chapter.num + 1);
  const goPrevCh = () => prevCh ? onNavigate(prevCh.num) : onPrevBook && onPrevBook();
  const goNextCh = () => nextCh ? onNavigate(nextCh.num) : onNextBook && onNextBook();

  // Visible finger-follow page swipe (ScreenLayout `pager`). Same neighbors the
  // nav arrows + bottom-nav use: a same-book chapter peeks full verse content,
  // a book boundary peeks a card.
  const POETIC_BOOKS = new Set(['psalms', 'proverbs', 'songofsolomon', 'lamentations', 'ecclesiastes']);
  const isPoetry = POETIC_BOOKS.has(book.id);
  // The neighbor page that drags in is the REAL BibleChapterView rendered inert
  // (ScreenLayout `inert` + PagerPeek kind:'screen'): identical component →
  // identical section headings, translation/restored-name chrome, poetry layout,
  // and inline highlight/link/bookmark icons before and after the swipe commits
  // (no more "section headings pop in after release"). Render-affecting settings
  // are threaded so the clone matches exactly what the committed chapter shows.
  // The clone gets the READER's translation, not this page's resolved one: it
  // works out its own recording match for its own book (sweep v068). Handed
  // the resolved KJV of Genesis's recording, a peek into Exodus stayed KJV and
  // switched to NKJV the moment the swipe settled; a same-book peek still
  // resolves to the recording's edition, "to match the recording" line and all.
  const _versesPeek = (bk, ch) => ({
    kind: 'screen',
    el: (
      // @ts-expect-error -- inert clone: only render-affecting props are passed; interactive callbacks (onIndex/onNavigate/…) are intentionally omitted (the peek is pointer-events:none + HTML inert, so they can never fire).
      <BibleChapterView
        book={bk}
        chapter={ch}
        translation={readerTranslation}
        restoredNames={restoredNames}
        showChapterTitle={showChapterTitle}
        showSectionHeadings={showSectionHeadings}
        titleFocusHidden={titleFocusHidden}
        headingsFocusHidden={headingsFocusHidden}
        theme={theme}
        markAsReadEnabled={false}
        inert={true}
        restoreScroll={savedScrollFor(bk.id + '-' + ch.num)}
        onStudyNotes={bk.id === book.id ? onStudyNotes : null}
      />
    ),
  });
  // A BOOK boundary peeks the REAL neighbor book's first/last chapter
  // (2026-07-19, owner-directed "native feel") — prevBook/nextBook are full
  // BIBLE_BOOK_LIST book objects from the same loaded corpus, so the peek is
  // exactly the in-book chapter peek pointed at the neighbor book, and the
  // commit (goNextCh → onNextBook) reconciles the SAME component in place —
  // no remount, no flash. The lone pseudo-book (Revelation's "Volume One"
  // bridge — a cross-corpus, cross-component edge) has no `id` and keeps
  // the boundary card.
  const pager = {
    onPrev: goPrevCh,
    onNext: goNextCh,
    peek: (side) => side === 'next'
      ? (nextCh ? _versesPeek(book, nextCh)
        : (nextBook && nextBook.id) ? _versesPeek(nextBook, nextBook.chapters[0])
          : nextBook ? { kind: 'boundary', eyebrow: 'Next Book', title: nextBoundaryTitle || `${nextBook.title} 1` } : null)
      : (prevCh ? _versesPeek(book, prevCh)
        : (prevBook && prevBook.id) ? _versesPeek(prevBook, prevBook.chapters[prevBook.chapters.length - 1])
          : prevBook ? { kind: 'boundary', eyebrow: 'Previous Book', title: prevBoundaryTitle || `${prevBook.title} ${prevBook.chapters[prevBook.chapters.length - 1].num}` } : null),
  };

  /* U04.7 / U07.3: a chapter landed on mid-way (a shared verse link, a search hit) named nothing once its hero had
     gone: the top bar shows only icons. It names itself in the band the letters have (MiniTitleBand), pinned under
     the top bar once the hero has scrolled away, in the hero's own words ("John · Chapter 3" over its title). */
  const heroRef = React.useRef(null);
  const heroTitle = showChapterTitle && !titleFocusHidden && displayChapterTitle ? displayChapterTitle : book.subtitle;
  const miniTitle = inert ? null : (
    <MiniTitleBand heroRef={heroRef} pageKey={chapterKey} eyebrow={book.title + ' · Chapter ' + chapter.num} title={heroTitle || ''} />
  );

  // An inert clone (a swipe peek) must never claim __onReadingComplete.
  useMarkAsRead(inert ? false : markAsReadEnabled, onMarkRead, readTrackKey);

  return (
    <ScreenLayout
      inert={inert}
      restoreScroll={restoreScroll}
      pager={inert ? undefined : pager}
      /* placeKey is the VISIT identity: useReadTracker resets its whole
         measurement on a change, and AutoScrollControl re-measures
         words-per-line. Translation and restored-names both swap the verse
         text under identical data-hl-keys while the chapter stays mounted
         (Settings is reachable without leaving), so leaving them out left
         required dwell, coverage weights, frontier weights, and the displayed
         WPM describing the PREVIOUS translation. They are part of the
         identity of what is on screen. */
      placeKey={(book && book.id) + '-' + (chapter && chapter.num) + '-' + (translation || 'nkjv') + (restoredNames ? '-r' : '')}
      stickyNav={<StickyChapterNav
        onPrev={goPrevCh}
        onNext={goNextCh}
        prevDisabled={!prevCh && !prevBook}
        nextDisabled={!nextCh && !nextBook}
        prevLabel="Previous chapter"
        nextLabel="Next chapter"
      />}
      navChildren={LibraryNav({
        // onIndex — NOT onBack. onBack is the in-content back-hint pill.
        // navBack (search200 UX B1): from a search hit the ‹ returns to the results
        // in one tap, not to the book index (which took a second).
        onBack: navBack ? navBack.onBack : onIndex, backLabel: navBack ? navBack.label : book.title,
        arrows: {
          onPrev: goPrevCh, onNext: goNextCh,
          prevDisabled: !prevCh && !prevBook,
          nextDisabled: !nextCh && !nextBook,
          prevLabel: 'Previous chapter', nextLabel: 'Next chapter',
        },
        reading: true,
        chapterBookmark: (book && chapter) ? { hlKey: 'bible:' + book.id + ':' + chapter.num, label: (book.title || book.id) + ' ' + chapter.num } : null,
        onSettings, onHistory, onSearch, theme, onThemeChange,
      })}
    >
      {(() => {
        // idea A's row hangs in the "Back to" band, under the pill: the band's own hairline is the one below it
        const visitRow = visitShown ? (
          <div className="visit-ed-row">
            <span className="visit-ed-note">Shown in {translationLabel(visitEdition)}, as you searched</span>
            <button type="button" className="visit-ed-btn" onClick={readOwnEdition}>Read in {translationLabel(readerTranslation)}</button>
          </div>
        ) : null;
        // the mini title hangs from the "Back to" band's bottom edge, or from a zero-height anchor when there is none
        if (!backHint) {
          if (visitRow) return <div className="back-hint-row visit-ed-solo">{visitRow}{miniTitle}</div>;
          return miniTitle ? <div className="mini-title-anchor">{miniTitle}</div> : null;
        }
        return <BackHintPill backHint={backHint} onClick={onTapThroughBack}>{visitRow}{miniTitle}</BackHintPill>;
      })()}
      {(() => {
        const titleEffective = showChapterTitle && !titleFocusHidden;
        const canFocusTitle = showChapterTitle && displayChapterTitle;
        const hasCuratedTitle = !!displayChapterTitle;
        const titleText = heroTitle; // the band above says the same
        const titleIsTappable = titleEffective && hasCuratedTitle;
        return (
          <header className="hero" ref={heroRef}>
            <div className={`hero-bg${OT_BOOK_IDS.has(book.id) ? " ot" : ""}`} />
            <div className="hero-content">
              <div className="hero-eyebrow">{book.title} {"\xA0\xB7\xA0"} Chapter {chapter.num}</div>
              {recordingTextShown && (
                <div className="hero-audio-text" role="status">{translationLabel(translation)} text, to match the recording</div>
              )}
              <h1 className="hero-title">
                {titleIsTappable ? (
                  <button
                    type="button"
                    className="hero-title-action"
                    onClick={tapToggle(() => setTitleFocusHidden && setTitleFocusHidden(true))}
                    title="Tap to hide chapter title"
                  >
                    {titleText}
                  </button>
                ) : titleText}
              </h1>
              {canFocusTitle && titleFocusHidden && (
                <button
                  className="hero-subtitle-restore"
                  onClick={tapToggle(() => setTitleFocusHidden && setTitleFocusHidden(false))}
                  title="Show chapter title"
                  aria-label="Show chapter title"
                >+ Show chapter title</button>
              )}
              <div className="hero-ornament">
                <div className="hero-ornament-line" />
                <div className="hero-ornament-diamond" />
                <div className="hero-ornament-line r" />
              </div>
              {/* Recorded Bible edition (comment corrected 2026-08-10): every
                  shipped edition is one track per CHAPTER, so this pill starts
                  the book's queue positioned at THIS chapter and auto-advance
                  runs to the end of the book. (The retired whole-book shape
                  reached the same chapter by SEEKING via BIBLE_AUDIO_CHAPTERS;
                  playBibleBook still branches on shape for it.) Mirrors the
                  letter hero pill; inert peeks keep it (same
                  pointer-events:none contract). */}
              {bibleAudio && AudioPlayer.hasAudio(bibleAudio.volKey, book.id) && (
                <HeroListen {...bibleHero(bibleAudio, book, chapter.num)} />
              )}
              {/* A02.2: plain Matthew and the Matthew Study Bible did not know about each other. The plain chapter
                  opens the same chapter with its study notes (a peek keeps the line, inert, as it keeps Listen). */}
              {onStudyNotes && (
                <button type="button" className="hero-study-link" onClick={onStudyNotes}>Read with study notes {"›"}</button>
              )}
            </div>
          </header>
        );
      })()}
      <div className="page-wrapper">
        {/* data-copy-key: words copied here outside a verse (a heading) still
            name the chapter and the reader's translation (utils/passage-copy.js). */}
        <div className="chapter-body" ref={bodyRef} data-copy-key={'bible:' + book.id + ':' + chapter.num} data-translation={shownTranslation}>
          {showSectionHeadings && headingsFocusHidden && chapter.sections.some((s) => s.heading || s.letter) && (
            <button
              className="hero-subtitle-restore headings-restore"
              onClick={tapToggle(() => setHeadingsFocusHidden && setHeadingsFocusHidden(false))}
              title="Show section headings"
              aria-label="Show section headings"
            >+ Show section headings</button>
          )}

          {(() => {
            const headingsVisible = showSectionHeadings && !headingsFocusHidden;
            // A Spanish edition's verses carry lang="es" once its text is on the page
            // (until then translateVerse answers with the English NKJV).
            const verseLang = isTranslationLoaded(translation) ? translationLang(translation) : undefined;
            const renderVerse = (v, vi) => {
              const vHlKey = bibleHlKey(book.id, chapter.num, v.n);
              const vText = translateVerse(book.id, chapter.num, v, translation);
              return (
                <span key={vi} id={`v-${v.n}`} lang={verseLang} className={`verse${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}`}>
                  {/* The space ends the number's word (rs1): "16For" was one word, so a long-press on a verse's
                      first word took its number too. app.css keeps it from collapsing at the end of the gutter
                      box (white-space: pre), where it shows nothing. */}
                  <span className="verse-num">{v.n}{' '}</span>
                  <HighlightableText text={vText} hlKey={vHlKey} />
                  <LinkIcon hlKey={vHlKey} onClick={onLinkOpen} />
                  <BookmarkIcon hlKey={vHlKey} />
                  {' '}
                </span>
              );
            };

            if (!headingsVisible) {
              // Flat render: concatenate all verses from all sections into one
              // continuous verses-block — no section-block wrapping, no gaps.
              const allVerses = chapter.sections.flatMap((s) => s.verses);
              return (
                <div className={`verses-block${isPoetry ? ' is-poetry' : ''}`}>
                  {allVerses.map(renderVerse)}
                </div>
              );
            }
            return chapter.sections.map((sec, si) => (
              <div key={si} className="section-block">
                {sec.letter ? (
                  <div
                    className="section-heading-psalm119 section-heading-tappable"
                    onClick={tapToggle(() => setHeadingsFocusHidden && setHeadingsFocusHidden(true))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHeadingsFocusHidden && setHeadingsFocusHidden(true); } }}
                    title="Tap to hide headings"
                    role="button"
                    tabIndex={0}
                  >
                    <span className="hebrew-letter">{sec.letter}</span>
                    <span className="hebrew-letter-name">{getSectionHeading(si, sec)}</span>
                  </div>
                ) : sec.heading ? (
                  <div
                    className="section-heading section-heading-tappable"
                    onClick={tapToggle(() => setHeadingsFocusHidden && setHeadingsFocusHidden(true))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHeadingsFocusHidden && setHeadingsFocusHidden(true); } }}
                    title="Tap to hide headings"
                    role="button"
                    tabIndex={0}
                  >
                    {getSectionHeading(si, sec)}
                  </div>
                ) : null}
                <div className={`verses-block${isPoetry ? ' is-poetry' : ''}`}>
                  {sec.verses.map(renderVerse)}
                </div>
              </div>
            ));
          })()}
          {/* Reading-end sentinel: end of verses, before ornament and nav. */}
          <div className="reading-end" />
          <div className="ornament-divider">
            <div className="ornament-divider-line" />
            <div className="ornament-divider-symbol">✦</div>
            <div className="ornament-divider-line" />
          </div>
          <PlanRibbon bid={book.id} cid={chapter.num} inert={inert} />
          <div className="bottom-nav">
            {prevCh ? (
              <button className="bottom-nav-card" onClick={() => onNavigate(prevCh.num)}>
                <div className="bottom-nav-label">‹ Previous</div>
                <div className="bottom-nav-title">{book.title} {prevCh.num}</div>
              </button>
            ) : prevBook ? (
              <button className="bottom-nav-card" onClick={onPrevBook}>
                <div className="bottom-nav-label">‹ Previous Book</div>
                <div className="bottom-nav-title">{prevBoundaryTitle || `${prevBook.title} ${prevBook.chapters[prevBook.chapters.length - 1].num}`}</div>
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
                <div className="bottom-nav-title">{book.title} {nextCh.num}</div>
              </button>
            ) : nextBook ? (
              <button className="bottom-nav-card next" onClick={onNextBook}>
                <div className="bottom-nav-label">Next Book ›</div>
                <div className="bottom-nav-title">{nextBoundaryTitle || `${nextBook.title} 1`}</div>
              </button>
            ) : (
              <div className="bottom-nav-card next placeholder">
                <div className="bottom-nav-label">Next ›</div>
                <div className="bottom-nav-title">—</div>
              </div>
            )}
          </div>
          {/* U01.3: the install offer is one line under Previous/Next, so the chapter ends on Next. */}
          <InstallCard unitKey={'bible:' + book.id + ':' + chapter.num} inert={inert} />
        </div>
      </div>
      {/* Find in this chapter (idea 160): the ⋯ menu's field and the find pill, over the chapter's verses only.
          Live pane only, like the read-along below. */}
      {!inert && <FindInUnit anchor={surpriseAnchor} unitId={book.id + ':' + chapter.num} mainRef={bodyRef} noun="chapter" keyPrefix={'bible:' + book.id + ':' + chapter.num + ':'} />}
      {/* Read-along, on the same !inert contract as LetterView: the swipe peek
          renders a REAL BibleChapterView clone, and two live mounts would fight
          over the single global ::highlight(vot-reading) registration. */}
      {!inert && bibleAudio && (
        <ReadAlongHighlight
          volKey={bibleAudio.volKey}
          letterId={book.id}
          chapter={chapter.num}
          mainRef={bodyRef}
          onListen={AudioPlayer.hasAudio(bibleAudio.volKey, book.id) ? () => AudioPlayer.playBibleBook({ volKey: bibleAudio.volKey, bookId: book.id, label: bibleAudio.label, chapterNum: chapter.num }) : null}
          hlKeyFn={bibleKeyFn}
          readAlongOn={readAlongOn}
          readAlongFollow={readAlongFollow}
          seekTo={highlightedVerses.length ? bibleKeyFn(book.id, highlightedVerses[0]) : null}
          textKey={translation + ':' + textTick}
        />
      )}
    </ScreenLayout>
  );
}

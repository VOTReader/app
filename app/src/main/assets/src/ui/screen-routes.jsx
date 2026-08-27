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

/* Wave 0 (index-marker decouple): the current-chapter marker in a chapter
   index answers "where was I in THIS book" and must NOT be coupled to
   settings.showReadingDot — that toggle gates only the resume-reading dot
   in the top nav (app.jsx → ReadingChromeProvider dotEnabled). Extracted
   as a pure helper so the decoupling is pinned by test
   (ChapterIndex.test.jsx). */
import { AudioPlayer } from '../utils/audio-player.js';
import { bibleAudioEdition } from '../utils/audio-track.js';
import { AudioLibraryScreen } from './screens/AudioLibraryScreen.jsx';
import { AudioVolumesScreen } from './screens/AudioVolumesScreen.jsx';
import { AudioCollectionScreen } from './screens/AudioCollectionScreen.jsx';
import { AudioSavedScreen } from './screens/AudioSavedScreen.jsx';
import { MilestonesScreen } from './screens/MilestonesScreen.jsx';
import { MATTHEW_NOTE_RATIO } from '../utils/matthew-note-weight.js';

export function chapterIndexCurrentChapter(readKey, activeReadKey, lastReadChapters) {
  return activeReadKey === readKey ? (lastReadChapters[readKey] || null) : null;
}

/**
 * [14] THE ROUTE CONTRACT — every dependency App() must hand to
 * buildScreenRoutes, name-checked by tsc on the app.jsx call site (a
 * missing or renamed prop is a typecheck error, not a silent undefined
 * inside a route). Per-field types are deliberately `*` for now —
 * the NAME contract is the load-bearing half; tighten types field-by-
 * field as they prove worth pinning.
 * @typedef {Object} ScreenRouteDeps
 * @property {*} screen
 * @property {*} setScreen
 * @property {*} bookId
 * @property {*} setBookId
 * @property {*} chapterNum
 * @property {*} setChapterNum
 * @property {*} letterId
 * @property {*} setLetterId
 * @property {*} studyId
 * @property {*} [setStudyId]
 * @property {*} studyChapterId
 * @property {*} setStudyChapterId
 * @property {*} fromStudies
 * @property {*} setFromStudies
 * @property {*} fromSearch
 * @property {*} setFromSearch
 * @property {*} mode
 * @property {*} setMode
 * @property {*} showStudy
 * @property {*} setShowStudy
 * @property {*} genreId
 * @property {*} setGenreId
 * @property {*} audioColKey
 * @property {*} setAudioColKey
 * @property {*} surpriseAnchor
 * @property {*} setSurpriseAnchor
 * @property {*} theme
 * @property {*} setTheme
 * @property {*} settings
 * @property {*} setSettings
 * @property {*} toggleSetting
 * @property {*} updateSetting
 * @property {*} titleFocusHidden
 * @property {*} setTitleFocusHidden
 * @property {*} headingsFocusHidden
 * @property {*} setHeadingsFocusHidden
 * @property {*} activeReadKey
 * @property {*} setActiveReadKey
 * @property {*} lastReadChapters
 * @property {*} setLastReadChapters
 * @property {*} lastReadLetterMap
 * @property {*} setLastReadForVol
 * @property {*} readItems
 * @property {*} readHistory
 * @property {*} markRead
 * @property {*} unmarkRead
 * @property {*} isRead
 * @property {*} getReadKey
 * @property {*} clearReadForBook
 * @property {*} clearAllProgress
 * @property {*} clearHistory
 * @property {*} pruneHistoryDay
 * @property {*} activeLetter
 * @property {*} activeVolKey
 * @property {*} book
 * @property {*} chapter
 * @property {*} goHome
 * @property {*} goNavOrigin
 * @property {*} navOrigin
 * @property {*} goSearch
 * @property {*} goHistory
 * @property {*} goSettings
 * @property {*} goAbout
 * @property {*} goVolumesHome
 * @property {*} goScripturesHome
 * @property {*} goScriptureGenre
 * @property {*} goBibleIdx
 * @property {*} goMatthewIdx
 * @property {*} goStudiesHome
 * @property {*} goNotesIndex
 * @property {*} goLinksIndex
 * @property {*} goBookmarksIndex
 * @property {*} goJournalHub
 * @property {*} goHighlightsIndex
 * @property {*} goProgress
 * @property {*} goJournalViewer
 * @property {*} goJournalEditor
 * @property {*} goSearchOrigin
 * @property {*} goColIdx
 * @property {*} handleSelect
 * @property {*} handleSurprise
 * @property {*} handleScriptureSelect
 * @property {*} handleVolumeSelect
 * @property {*} handleSearchSelect
 * @property {*} handleSearchCommand
 * @property {*} selectMatthewCh
 * @property {*} selectBibleCh
 * @property {*} selectStudy
 * @property {*} selectStudyChapter
 * @property {*} getStudyById
 * @property {*} getStudyChapter
 * @property {*} studyReadKey
 * @property {*} prevChainEntry
 * @property {*} nextChainEntry
 * @property {*} goToChainEntryFirst
 * @property {*} goToChainEntryLast
 * @property {*} studiesLoading
 * @property {*} studiesError
 * @property {*} retryStudies
 * @property {*} UNIFIED_CHAIN
 * @property {*} searchQuery
 * @property {*} setSearchQuery
 * @property {*} searchScope
 * @property {*} setSearchScope
 * @property {*} searchContext
 * @property {*} journalEntryId
 * @property {*} createAndEditJournal
 * @property {*} openInAppLetter
 * @property {*} openLinkSidebar
 * @property {*} navigateToLink
 * @property {*} pushFromLetter
 * @property {*} backHint
 * @property {*} tapThroughBack
 * @property {*} goToLetterFromMatthew
 * @property {*} setNavOrigin
 * @property {*} setNoteSheetTarget
 * @property {*} bcvPrevBook
 * @property {*} bcvNextBook
 * @property {*} bcvOnPrevBook
 * @property {*} bcvOnNextBook
 * @property {*} bcvPrevBoundaryTitle
 * @property {*} bcvNextBoundaryTitle
 * @property {*} prophecyCardStatesRef
 * @property {*} saveProphecyCardStates
 * @property {*} fromMatthewChRef
 * @property {*} setFromMatthewCh
 * @property {*} setFromWtlb
 * @property {*} boundaryConfig
 * @property {*} gardenPage
 * @property {*} setGardenPage
 */

/** @param {ScreenRouteDeps} deps */
export function buildScreenRoutes({
  // ── State + setters (tab-field-backed) ──
  screen, setScreen,
  bookId, setBookId, chapterNum, setChapterNum,
  letterId, setLetterId,
  // (setStudyId is intentionally NOT destructured — History onSelect now
  //  routes study entries through navigateToLink, which owns that setter.)
  studyId, studyChapterId, setStudyChapterId,
  fromStudies, setFromStudies,
  fromSearch, setFromSearch,
  mode, setMode, showStudy, setShowStudy,
  genreId, setGenreId, surpriseAnchor, setSurpriseAnchor,
  audioColKey, setAudioColKey,
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
  markRead, unmarkRead, isRead, getReadKey, clearReadForBook, clearAllProgress, clearHistory, pruneHistoryDay,
  // ── Data resolved from screen state (F3: the active letter/entry only) ──
  activeLetter, activeVolKey,
  book, chapter,
  // ── Nav helpers ──
  goHome, goNavOrigin, navOrigin, goSearch, goHistory, goSettings, goAbout,
  goVolumesHome, goScripturesHome, goScriptureGenre, goBibleIdx, goMatthewIdx,
  goStudiesHome,
  goNotesIndex, goLinksIndex, goBookmarksIndex, goJournalHub, goHighlightsIndex,
  goProgress,
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
  openInAppLetter, openLinkSidebar, navigateToLink, pushFromLetter,
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
  // Recorded Bible editions (per-chapter): the selected edition (Settings →
  // Listening → Bible Audio), or null when off/unknown — which hides every
  // Bible Listen pill. Registry + policy live in utils/audio-track.js.
  const _bibleAudioEd = bibleAudioEdition(settings.bibleAudio);
  const bibleAudioProp = _bibleAudioEd ? { volKey: _bibleAudioEd.volKey, label: _bibleAudioEd.label } : null;
  // Default LETTER voice (Settings → Listening → Letter Voice). The player is a
  // plain module — it can't read React state — so the preference is pushed to
  // it, idempotently, from the same render that owns the setting. 'auto' and
  // any unknown code both resolve to "use the manifest's primary reading".
  AudioPlayer.setPreferredReader(settings.letterReader);
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
      onMarkRead: (payload) => markRead(rk, letterId, payload),
      // Same key markRead's stats record uses — the tracker's frontier
      // reports and the completion's frontier-clear must share one space.
      readTrackKey: getReadKey(rk, letterId),
      onUnmark: () => unmarkRead(rk, letterId),
      isRead: (id) => isRead(rk, id),
      onNavigate: (id) => { if (clearSurprise) setSurpriseAnchor(null); setLetterId(id); setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id)); },
      onHome: () => goColIdx(volKey),
    };
  };
  const colIdxProps = (volKey) => {
    const col = COL_BY_KEY.get(volKey);
    const nav = (id) => { setLetterId(id); setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id)); setScreen(col.letterScreen); };
    const props = {
      onSelect: nav,
      onSelectPreface: col.prefaceGlobal ? nav : undefined,
      currentLetter: settings.showReadingDot && activeReadKey === ('vol:' + volKey) ? lastReadLetterMap[volKey] || null : null,
      isRead: (id) => isRead(col.readKey, id),
      readCount: (id) => Number(readItems[getReadKey(col.readKey, id)]) || 0,
      progressKeyFor: (id) => getReadKey(col.readKey, id),
      markAsReadEnabled: settings.markAsRead,
    };
    // Streaming audio (2026-08-05): whole-collection queue, Bandcamp-album
    // style. Props stay absent until the lazy VOT corpus (which carries
    // AUDIO_MANIFEST) lands — the index re-renders with them once it does.
    // WTLB parts ALSO ship dedicated range-compilation tracks → chips.
    if (AudioPlayer.collectionHasAudio(volKey)) {
      props.onPlayAll = () => {
        const pref = colPreface(col);
        const arr = colLetterArr(col);
        AudioPlayer.playCollection({ volKey, items: pref ? [pref, ...arr] : arr, collectionLabel: col.label });
      };
      const secs = AudioPlayer.sectionsFor(volKey);
      if (secs) {
        props.sections = secs;
        props.onPlaySection = (i) => AudioPlayer.playSection(volKey, i, col.label);
      }
    }
    return props;
  };
  // Shared nav for the 14 volume/WTLB/Blessed/Holy-Days index screens. Was a
  // hand-rolled TEXT back button ("← Volumes") that never adopted the 2026-07-14
  // icon-only arrow; LibraryNav owns the markup now, so these get the enlarged ‹.
  const _idxNav = () => LibraryNav({
    onBack: goVolumesHome, backLabel: 'Volumes',
    onSettings: goSettings, onHistory: goHistory, onSearch: goSearch,
    theme, onThemeChange: setTheme,
  });
  const sharedViewProps = {
    onSearch: goSearch, onSettings: goSettings, onHistory: goHistory,
    theme, onThemeChange: setTheme, surpriseAnchor,
    onInAppLink: openInAppLetter, backHint,
    onNavigateToLink: navigateToLink,
    onLinkOpen: openLinkSidebar,
    onBack: () => window.handleAndroidBack && window.handleAndroidBack(),
    markAsReadEnabled: settings.markAsRead,
    // Read-along (ui/components/ReadAlongHighlight.jsx). Two independent
    // gates: the sentence wash, and the follow-scroll that writes scrollTop
    // under the lease. Both default ON — an absent key must not silently
    // retire the feature for a reader restoring an older backup.
    readAlongOn: settings.readAlongHighlight !== false,
    readAlongFollow: settings.readAlongFollow !== false,
  };
  // {{nav:bookId:chapter}} inside a WTLB/Blessed/Holy-Days entry. Routed
  // through navigateToLink so it raises the same "‹ Back to <entry>" pill
  // every other in-content cross-screen link does (and gets the lazy
  // bible-corpus kick for free). The older `fromWtlb` breadcrumb stays exactly
  // as it was — hardware back consumes it at use-android-back.js once the
  // single-shot pill has been used or pruned.
  const _navToChapter = (bid, ch, srcTitle) => {
    setFromWtlb(screen);
    navigateToLink({ type: 'bible', bookId: bid, chapter: ch }, { sourceLetterTitle: srcTitle || null });
  };

  // The Text affordance on any Listening Library row / the listening desk's
  // title (owner request 2026-08-09: "tap letter/chapter title, jump to, do
  // not interrupt the audio"). A track's key is "volKey:itemId":
  //   - a VOT collection that declares a letterScreen → its LetterView;
  //   - a Bible edition (volKey 'bible-*') → that book's chapter in the
  //     reader (per-chapter editions label every part "Chapter N"; anything
  //     unlabeled lands on chapter 1);
  //   - Hidden Manna (no index) and range compilations (key null) have no
  //     destination — hasTextDestination gates every tap on the same rule.
  // Pure navigation: the AudioPlayer singleton is never touched, so playback
  // continues across the jump.
  const _openAudioText = (track, sourceScreen) => {
    const key = track && typeof track.key === 'string' ? track.key : '';
    const divider = key.indexOf(':');
    if (divider < 1 || divider >= key.length - 1 || typeof COL_BY_KEY === 'undefined') return;
    const volKey = key.slice(0, divider);
    const id = key.slice(divider + 1);
    if (volKey.indexOf('bible-') === 0) {
      // navigateToLink raises the standard "‹ Back to …" pill and kicks the
      // lazy bible corpus — same door the {{nav:book:ch}} chips use.
      const m = typeof track.partLabel === 'string' ? track.partLabel.match(/^Chapter (\d+)$/) : null;
      navigateToLink(
        { type: 'bible', bookId: id, chapter: m ? Number(m[1]) : 1 },
        { sourceLetterTitle: 'Listening Library' }
      );
      return;
    }
    const collection = COL_BY_KEY.get(volKey);
    if (!collection || !collection.letterScreen) return;
    // Same wiring as colIdxProps' nav — the reading dot / last-read tracking
    // must not distinguish a Library open from an index open.
    pushFromLetter({
      sourceScreen,
      sourceLetterTitle: 'Listening Library',
      destSnapshot: { screen: collection.letterScreen, letterId: id },
    });
    setLetterId(id);
    setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id));
    setScreen(collection.letterScreen);
  };
  // The listening desk (AudioManagerSheet) renders outside the routed tree,
  // so it reaches the opener through this bridge — reassigned every build so
  // the closure always carries the CURRENT screen for the back pill.
  window.__openAudioText = (track) => _openAudioText(track, screen);
  // Same bridge shape for the desk's Voice chips: switching Bible edition
  // there has to move settings.bibleAudio too, or every Listen pill elsewhere
  // would keep offering the edition the listener just left. Guarded on the
  // registry so an unknown id can never be persisted.
  window.__setBibleAudioEdition = (id) => { if (bibleAudioEdition(id)) updateSetting('bibleAudio', id); };
  // Entering a Listening Library sub-screen chains the origin so backing out
  // lands on the hub, and the hub's own back still returns to Library/Volumes.
  const _enterAudioSub = (destination) => {
    setNavOrigin({ screen: 'audio-library', returnOrigin: navOrigin || null });
    setScreen(destination);
  };

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
  // Personal-library screens (notes/bookmarks/links/highlights/journal) resolve
  // VOT letter titles + nav endpoints via findEntryContext, which only works
  // once the VOT corpus registry is built. On a cold-boot restore straight into
  // one of them nothing else pulls the corpus, so rows show raw ids
  // ("the-last-trump") and letter tap-throughs dead-end. Kick the load in the
  // BACKGROUND — same render-phase contract as 'matthew-ch' below (idempotent
  // + async-notify-only); useLazyBundles re-renders App when it lands and the
  // labels upgrade in place.
  const _kickVot = (jsx) => { if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus(); return jsx; };

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
    // C2-C [C2]: this was the ONE letter route that named no volume — it rode
    // LetterView's `volumeLabel || "Volume Two"` fallback, which is why the
    // fallback looked harmless. Say it here so the fallback can become honest.
    'vot-letter':    () => _wrapVot(actL('two')     && <LetterView {...sharedViewProps} {...colReadNavProps('two', true)}     {...boundaryConfig('two', actL('two'))}       letter={actL('two')}     volumeLabel="Volume Two" />),
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
        onOpenAudio={() => { setNavOrigin({ screen: 'home', returnOrigin: navOrigin || null }); setScreen('audio-library'); }}
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
          // Wave 0 (P1-12): History was the only content entry point that set
          // nav state directly with NO origin capture, so Back from the entry
          // never returned to History. Route through navigateToLink — the same
          // fromLetter-stack origin capture the Library index screens use —
          // with the 'History' back-pill title; Back (step 3 / 3b in
          // use-android-back) then unwinds to the history screen. The
          // setActiveReadKey dwell-gate / last-read bookkeeping stays here:
          // navigateToLink deliberately doesn't do it.
          // Wave 0 (sticky genreId): entering content from History is a
          // non-genre entry — clear genreId so a later index-level Back
          // can't misroute into a genre visited in an earlier session leg.
          // `silent: true` — History is the ONE link surface the owner wants
          // pill-less (you already know where you came from). The back-stack
          // entry is still pushed, so Back from the destination returns to
          // History; only the visible pill is suppressed.
          if (entry.type === 'study-chapter') {
            const study = getStudyById(entry.studyId);
            // Do not make a saved History row depend on the lazy study corpus
            // already being resident. navigateToLink can set the destination
            // state immediately; App's bible-study-chapter route then owns the
            // idempotent corpus kick + loading surface.
            const slug = (study && study.slug) || entry.studySlug || entry.studyId;
            setGenreId(null);
            setActiveReadKey(studyReadKey(slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(slug)]: entry.studyChapterId })));
            navigateToLink({ type: 'study-letter', studyId: entry.studyId, studyChapterId: entry.studyChapterId }, { sourceLetterTitle: 'History', silent: true });
          } else if (entry.type === 'letter') {
            var _hc = entry.volumeScreen && COL_BY_INDEX_SC.get(entry.volumeScreen) || (entry.volume === 1 ? COL_BY_KEY.get('one') : COL_BY_KEY.get('two'));
            setGenreId(null);
            setActiveReadKey('vol:' + _hc.volKey, () => setLastReadForVol(_hc.volKey, entry.letterId));
            navigateToLink({ screen: _hc.letterScreen, letterId: entry.letterId }, { sourceLetterTitle: 'History', silent: true });
          } else {
            setGenreId(null);
            setActiveReadKey(entry.bookId, () => setLastReadChapters((prev) => ({ ...prev, [entry.bookId]: entry.chapterNum })));
            navigateToLink({ type: 'bible', bookId: entry.bookId, chapter: entry.chapterNum }, { sourceLetterTitle: 'History', silent: true });
          }
        }}
        onSearch={goSearch}
        onSettings={goSettings}
        onHistory={goHistory}
        onPruneDay={pruneHistoryDay}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'library': () => _kickVot(
        <LibraryScreen
          onBack={goHome}
          onOpenNotes={goNotesIndex}
          onOpenLinks={goLinksIndex}
          onOpenBookmarks={goBookmarksIndex}
          onOpenJournal={goJournalHub}
          onOpenHighlights={goHighlightsIndex}
          onOpenProgress={goProgress}
          onOpenMilestones={() => { setNavOrigin({ screen: 'library', returnOrigin: navOrigin || null }); setScreen('milestones'); }}
          onOpenScriptureWeb={() => {
            // Kick bundle-f before the route renders so the "Loading…" frame
            // is usually skipped entirely.
            if (typeof window.__loadScreensF === 'function') window.__loadScreensF();
            setNavOrigin({ screen: 'library', returnOrigin: navOrigin || null });
            setScreen('scripture-web');
          }}
          totalReadCount={Object.keys(readItems || {}).length}
          readItems={readItems || {}}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          historyEnabled={settings.historyEnabled !== false}
          theme={theme} onThemeChange={setTheme}
        />
    ),
    'milestones': () => (
      <MilestonesScreen
        onBack={goNavOrigin}
        backLabel={navOrigin && navOrigin.screen === 'my-progress' ? 'Progress' : 'Library'}
        readItems={readItems}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'my-progress': () => typeof MyProgressScreen !== 'undefined' && _kickVot(
      <MyProgressScreen
        onBack={goNavOrigin}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        onOpenMilestones={() => { setNavOrigin({ screen: 'my-progress', returnOrigin: navOrigin || null }); setScreen('milestones'); }}
        settings={settings}
        readItems={readItems}
        historyCount={readHistory.length}
        historyEnabled={settings.historyEnabled !== false}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'highlights-index': () => typeof HighlightsScreen !== 'undefined' && _kickVot(
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
    'journal-home': () => typeof JournalHubScreen !== 'undefined' && _kickVot(
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
    // backHint/tapThroughBack: the cross-screen pill. A note in a notebook, a
    // Links/Bookmarks/Highlights row whose source is a journal paragraph, or a
    // journal card from another entry all land HERE and used to have no way
    // back. The viewer renders exactly ONE pill — its private journal→journal
    // stack first, this one otherwise.
    'journal-viewer': () => typeof JournalViewerScreen !== 'undefined' && _kickVot(
      <JournalViewerScreen
        onSettings={goSettings}
        entryId={journalEntryId}
        onBack={() => setScreen('journal-home')}
        onHome={goHome}
        onEdit={() => setScreen('journal-editor')}
        backHint={backHint}
        tapThroughBack={tapThroughBack}
        onNavigateToLink={(endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: 'journal-viewer' });
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Journal' });
          }
        }}
        onOpenJournalEntry={(eid) => goJournalViewer(eid)}
        onOpenNotebook={(nbId, sourceTitle) => {
          // Drop the user straight into that notebook's screen in the Notes
          // hub. The navHandoff 'notesReturnCtx' slot is consumed by
          // NotesIndexScreen on mount to pre-drill the right notebook (same
          // channel the back-pill uses; see utils/nav-handoff.js). backPill
          // raises the "Back to My Journal · <title>" pill so this link-out
          // returns in one tap, matching every other journal card.
          window.navHandoff.set('notesReturnCtx', { tab: 'notebooks', drilledNbId: nbId, backPill: sourceTitle ? { title: sourceTitle } : null });
          setNavOrigin({ screen: 'journal-viewer' });
          setScreen('notes-index');
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'journal-editor': () => typeof JournalEditorScreen !== 'undefined' && _kickVot(
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
    'notes-index': () => _kickVot(
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
    'links-index': () => _kickVot(
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
    'bookmarks-index': () => _kickVot(
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
        onCycleLayout={(nextId) => updateSetting('scriptureLayout', nextId)}
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
    'audio-library': () => (
      <AudioLibraryScreen
        onBack={goNavOrigin}
        backLabel={navOrigin && navOrigin.screen === 'library' ? 'Library'
          : navOrigin && navOrigin.screen === 'volumes-home' ? 'Volumes'
          : 'Home'}
        onOpenCollection={(vk) => { setAudioColKey(vk); _enterAudioSub('audio-library-collection'); }}
        onOpenVolumes={() => _enterAudioSub('audio-library-volumes')}
        onOpenSaved={() => _enterAudioSub('audio-library-saved')}
        onOpenTrack={(track) => _openAudioText(track, 'audio-library')}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'audio-library-volumes': () => (
      <AudioVolumesScreen
        onBack={goNavOrigin}
        backLabel="Listening Library"
        onOpenCollection={(vk) => {
          setAudioColKey(vk);
          setNavOrigin({ screen: 'audio-library-volumes', returnOrigin: navOrigin || null });
          setScreen('audio-library-collection');
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'audio-library-collection': () => (
      <AudioCollectionScreen
        volKey={audioColKey}
        onBack={goNavOrigin}
        backLabel={navOrigin && navOrigin.screen === 'audio-library-volumes' ? 'The Volumes' : 'Listening Library'}
        onOpenText={(track) => _openAudioText(track, 'audio-library-collection')}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'audio-library-saved': () => (
      <AudioSavedScreen
        onBack={goNavOrigin}
        backLabel="Listening Library"
        onOpenTrack={(track) => _openAudioText(track, 'audio-library-saved')}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'matthew-idx': () => {
      // Q8.2: MATTHEW lazy-loaded — show loading (or a retry on failure, E1).
      if (typeof MATTHEW === 'undefined') return _corpusView(window.__matthewCorpus, window.__loadMatthewCorpus, 'Loading Matthew…');
      // Wave 0: onBack + backLabel mirror the matthew-idx hardware-back
      // branch in use-android-back.js — fromSearch is consumed FIRST (a
      // book-level search result lands here; P1-13), then fromStudies,
      // then the genre / Scriptures hub fallbacks that bible-idx already
      // had (matthew-idx previously skipped its parent hub to Home).
      const _idxGenre = genreId && typeof SCRIPTURE_GENRES !== 'undefined'
        ? [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt].find((g) => g.id === genreId)
        : null;
      return (
        <ChapterIndex
          book={MATTHEW}
          bibleAudio={bibleAudioProp}
          onSelect={selectMatthewCh}
          onBack={() => { if (fromSearch) { setFromSearch(false); setSurpriseAnchor(null); setScreen('search'); } else if (fromStudies) { setFromStudies(false); goStudiesHome(); } else if (genreId) { setScreen('scripture-genre'); } else { goScripturesHome(); } }}
          // Wave 0: label names the real destination (Search / Studies /
          // the genre / Scriptures — never "Books").
          backLabel={fromSearch ? 'Search' : fromStudies ? 'Studies' : _idxGenre ? _idxGenre.label : 'Scriptures'}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          currentChapter={chapterIndexCurrentChapter('matthew', activeReadKey, lastReadChapters)}
          isRead={(num) => isRead('matthew', num)}
          readCount={(num) => Number(readItems[getReadKey('matthew', num)]) || 0}
          progressKeyFor={(num) => getReadKey('matthew', num)}
          // C2-C [C7] / BACKLOG [29a]: the commentary-weight chip. Only the
          // Matthew STUDY index gets it — bible-idx renders the same
          // component over books that carry no votNotes at all.
          noteWeights={MATTHEW_NOTE_RATIO}
          markAsReadEnabled={settings.markAsRead}
          bookmarkKeyFor={(num) => 'bible:matthew:' + num}
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
      // Wave 0: the index back goes to the GENRE screen when one is active
      // (scripture-genre), otherwise to Scriptures — name that destination
      // in the back tooltip + TalkBack label instead of "Books". fromSearch
      // is consumed FIRST (a book-level search result lands here; P1-13) —
      // mirrors the bible-idx hardware-back branch in use-android-back.js.
      const _idxGenre = genreId && typeof SCRIPTURE_GENRES !== 'undefined'
        ? [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt].find((g) => g.id === genreId)
        : null;
      if (book) return (
        <ChapterIndex
          book={book}
          bibleAudio={bibleAudioProp}
          onSelect={selectBibleCh}
          onBack={fromSearch ? () => { setFromSearch(false); setSurpriseAnchor(null); setScreen('search'); } : genreId ? () => setScreen('scripture-genre') : goScripturesHome}
          backLabel={fromSearch ? 'Search' : _idxGenre ? _idxGenre.label : 'Scriptures'}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          currentChapter={chapterIndexCurrentChapter(bookId, activeReadKey, lastReadChapters)}
          isRead={(num) => isRead(bookId, num)}
          readCount={(num) => Number(readItems[getReadKey(bookId, num)]) || 0}
          progressKeyFor={(num) => getReadKey(bookId, num)}
          markAsReadEnabled={settings.markAsRead}
          restoredNames={settings.restoredNames}
          showChapterTitle={settings.showChapterTitle !== false}
          bookmarkKeyFor={(num) => 'bible:' + bookId + ':' + num}
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
        bibleAudio={bibleAudioProp}
        onIndex={book?.chapters.length === 1 ? genreId ? () => setScreen('scripture-genre') : goScripturesHome : goBibleIdx}
        onNavigate={(num) => { setSurpriseAnchor(null); selectBibleCh(num); }}
        onMarkRead={(payload) => markRead(bookId, chapterNum, payload)}
        readTrackKey={getReadKey(bookId, chapterNum)}
        markAsReadEnabled={settings.markAsRead}
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
        readAlongOn={sharedViewProps.readAlongOn}
        readAlongFollow={sharedViewProps.readAlongFollow}
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
          bibleAudio={bibleAudioProp}
          titleFocusHidden={titleFocusHidden} setTitleFocusHidden={setTitleFocusHidden}
          prevChainEntry={prevChainEntry} nextChainEntry={nextChainEntry}
          goToChainEntryFirst={goToChainEntryFirst} goToChainEntryLast={goToChainEntryLast}
          setSurpriseAnchor={setSurpriseAnchor} setFromStudies={setFromStudies}
          setMode={setMode} setShowStudy={setShowStudy}
          markRead={markRead}
          getReadKey={getReadKey}
          selectMatthewCh={selectMatthewCh}
          goMatthewIdx={goMatthewIdx} goSearch={goSearch} goSettings={goSettings} goHistory={goHistory}
          goToLetterFromMatthew={goToLetterFromMatthew}
          theme={theme} setTheme={setTheme} surpriseAnchor={surpriseAnchor}
          backHint={backHint} tapThroughBack={tapThroughBack}
          openLinkSidebar={openLinkSidebar}
          onNavigateToLink={navigateToLink}
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
          readCount={(chId) => Number(readItems[getReadKey(studyReadKey(study.slug), chId)]) || 0}
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
        getReadKey={getReadKey}
        unmarkRead={unmarkRead}
        isRead={isRead}
        studyReadKey={studyReadKey}
        prophecyCardStatesRef={prophecyCardStatesRef}
        saveProphecyCardStates={saveProphecyCardStates}
        selectStudy={selectStudy}
        selectStudyChapter={selectStudyChapter}
        goStudiesHome={goStudiesHome}
        pushFromLetter={pushFromLetter}
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
      // Every other VOT reading route is a one-liner wrapped in _wrapVot; these
      // two have block bodies and used to return a bare null before the corpus
      // landed, so a cold-boot restore straight into one showed a permanently
      // blank screen that never pulled the corpus. Take the same loading view.
      if (!_votReady) return _wrapVot(null);
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
      if (!_votReady) return _wrapVot(null); // see 'holy-days-entry'
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

    // The Scripture Web rides its own lazy bundle (bundle-f). Both corpora are
    // kicked in the background on the same render-phase contract as _kickVot:
    // the Bible corpus backs the verse previews in the detail sheet, the VOT
    // corpus backs the personal web's top rail. Neither blocks the drawing.
    'scripture-web': () => {
      if (typeof window.__loadBibleCorpus === 'function') window.__loadBibleCorpus();
      if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus();
      return (typeof ScriptureWebScreen !== 'undefined') ? (
        <ScriptureWebScreen
          navigateToLink={(endpoint, meta) => {
            if (!endpoint) return;
            setNavOrigin({ screen: 'scripture-web' });
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'The Scripture Web' });
          }}
          onBack={() => setScreen('library')}
          settings={settings}
          updateSetting={updateSetting}
        />
      ) : _corpusView(window.__screensF, window.__loadScreensF, 'Loading…');
    },
  };
}

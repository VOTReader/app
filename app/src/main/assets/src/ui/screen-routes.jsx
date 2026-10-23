/** @jsx h */
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
import { h } from './jsx-h.js';
import { AudioPlayer } from '../utils/audio-player.js';
import { setWifiOnly } from '../utils/download-gate.js';
import { bibleAudioEdition, bibleAudioOffered, resolveBibleAudio } from '../utils/audio-track.js';
import { textKeyOf } from './components/AudioShelf.jsx';
import { SONGS_SCREEN, decodeSongsRoute, encodeSongsRoute, pushSongsFrame, popSongsFrame, replaceSongsTop } from '../utils/songs-route.js';
import { MATTHEW_NOTE_RATIO } from '../utils/matthew-note-weight.js';
import { AnswersHome, resetAnswersLanding } from './screens/AnswersHome.jsx';
import { AnswersShelf } from './screens/AnswersShelf.jsx';
import { AnswersMedia } from './screens/AnswersMedia.jsx';
import { AnswersSaved } from './screens/AnswersSaved.jsx';
import { readAnswersPath, writeAnswersPath } from './components/AnswersParts.jsx';
import { ANSWERS_SUBJECT_GROUP, isAnswersGroupKey } from '../utils/answers-retired.js';
import { answersSectionAnchor } from '../utils/answers-sections.js';
import { GARDEN_DEFAULT_TIER } from '../utils/garden.js';
import { searchBackActive, isSearchLook, RESULTS_LABEL } from '../utils/search-visit.js';
import { PANEL_MODES } from './scripture-web/use-web-selection.js';

export function chapterIndexCurrentChapter(readKey, activeReadKey, lastReadChapters) {
  return activeReadKey === readKey ? (lastReadChapters[readKey] || null) : null;
}

/**
 * [14] THE ROUTE CONTRACT — every dependency App() must hand to
 * buildScreenRoutes, name-checked by tsc on the app.jsx call site (a
 * missing or renamed prop is a typecheck error, not a silent undefined
 * inside a route). Each field carries the type its source in App() has
 * (v15-code-health-09): tab-backed state names its use-tabs.js Tab field,
 * the rest were read off tsc. A `*` field is still `any` where App() gets
 * it; type that source first, then the field here.
 * @typedef {Object} ScreenRouteDeps
 * @property {import('../hooks/use-tabs.js').Tab['screen']} screen
 * @property {import('../hooks/use-tabs.js').TabSetter<'screen'>} setScreen
 * @property {import('../hooks/use-tabs.js').Tab['bookId']} bookId
 * @property {import('../hooks/use-tabs.js').TabSetter<'bookId'>} setBookId
 * @property {import('../hooks/use-tabs.js').Tab['chapterNum']} chapterNum
 * @property {import('../hooks/use-tabs.js').TabSetter<'chapterNum'>} setChapterNum
 * @property {import('../hooks/use-tabs.js').Tab['letterId']} letterId
 * @property {import('../hooks/use-tabs.js').TabSetter<'letterId'>} setLetterId
 * @property {import('../hooks/use-tabs.js').Tab['studyId']} studyId
 * @property {import('../hooks/use-tabs.js').TabSetter<'studyId'>} [setStudyId]
 * @property {import('../hooks/use-tabs.js').Tab['studyChapterId']} studyChapterId
 * @property {import('../hooks/use-tabs.js').TabSetter<'studyChapterId'>} setStudyChapterId
 * @property {import('../hooks/use-tabs.js').Tab['fromStudies']} fromStudies
 * @property {import('../hooks/use-tabs.js').TabSetter<'fromStudies'>} setFromStudies
 * @property {import('../hooks/use-tabs.js').Tab['fromSearch']} fromSearch
 * @property {import('../hooks/use-tabs.js').TabSetter<'fromSearch'>} setFromSearch
 * @property {(v: boolean) => void} setFromSurprise
 * @property {import('../hooks/use-tabs.js').Tab['mode']} mode
 * @property {import('../hooks/use-tabs.js').TabSetter<'mode'>} setMode
 * @property {import('../hooks/use-tabs.js').Tab['showStudy']} showStudy
 * @property {import('../hooks/use-tabs.js').TabSetter<'showStudy'>} setShowStudy
 * @property {import('../hooks/use-tabs.js').Tab['genreId']} genreId
 * @property {import('../hooks/use-tabs.js').TabSetter<'genreId'>} setGenreId
 * @property {import('../hooks/use-tabs.js').Tab['audioColKey']} audioColKey
 * @property {import('../hooks/use-tabs.js').TabSetter<'audioColKey'>} setAudioColKey
 * @property {import('../hooks/use-tabs.js').Tab['surpriseAnchor']} surpriseAnchor
 * @property {import('../hooks/use-tabs.js').TabSetter<'surpriseAnchor'>} setSurpriseAnchor
 * @property {*} theme
 * @property {import('react').Dispatch<any>} setTheme
 * @property {import('../hooks/use-settings.js').Settings} settings
 * @property {(key: string) => void} toggleSetting
 * @property {(key: string, val: any) => void} updateSetting
 * @property {import('../hooks/use-tabs.js').Tab['titleFocusHidden']} titleFocusHidden
 * @property {import('../hooks/use-tabs.js').TabSetter<'titleFocusHidden'>} setTitleFocusHidden
 * @property {import('../hooks/use-tabs.js').Tab['headingsFocusHidden']} headingsFocusHidden
 * @property {import('../hooks/use-tabs.js').TabSetter<'headingsFocusHidden'>} setHeadingsFocusHidden
 * @property {*} activeReadKey
 * @property {(key: any, commitFn: any) => void} setActiveReadKey
 * @property {*} lastReadChapters
 * @property {import('react').Dispatch<any>} setLastReadChapters
 * @property {*} lastReadLetterMap
 * @property {(volKey: string, id: string) => void} setLastReadForVol
 * @property {Record<string, number | true>} readItems
 * @property {import('../hooks/use-history.js').HistoryEntry[]} readHistory
 * @property {(bid: string, cid: string | number, payload?: { words: number; activeMs: number; }) => void} markRead
 * @property {(bid: string, cid: string | number) => void} unmarkRead
 * @property {(bid: string, cid: string | number) => boolean} isRead
 * @property {(bid: string, cid: string | number) => string} getReadKey
 * @property {(bid: string) => void} clearReadForBook
 * @property {() => void} clearAllProgress
 * @property {() => void} clearHistory
 * @property {*} activeLetter
 * @property {*} activeVolKey
 * @property {*} book
 * @property {*} chapter
 * @property {() => void} goHome
 * @property {() => void} goNavOrigin
 * @property {import('../hooks/use-tabs.js').Tab['navOrigin']} navOrigin
 * @property {() => void} goSearch
 * @property {() => void} goHistory
 * @property {() => void} goSettings
 * @property {() => void} goAbout
 * @property {() => void} goVolumesHome
 * @property {() => void} goScripturesHome
 * @property {(gid: any) => void} goScriptureGenre
 * @property {() => void} goBibleIdx
 * @property {() => void} goMatthewIdx
 * @property {() => void} goStudiesHome
 * @property {() => void} goNotesIndex
 * @property {() => void} goLinksIndex
 * @property {() => void} goBookmarksIndex
 * @property {() => void} goJournalHub
 * @property {() => void} goHighlightsIndex
 * @property {() => void} goProgress
 * @property {() => void} goReadingPlans
 * @property {(eid: any) => void} goJournalViewer
 * @property {(eid: any) => void} goJournalEditor
 * @property {() => void} goSearchOrigin
 * @property {(volKey: any) => void} goColIdx
 * @property {(id: any) => void} handleSelect
 * @property {() => void} handleSurprise
 * @property {(id: string, clearGenre?: boolean) => void} handleScriptureSelect
 * @property {(id: any) => void} handleVolumeSelect
 * @property {(entry: any, terms?: string[], query?: string, stopTyped?: string[]) => void} handleSearchSelect
 * @property {(action: any) => void} handleSearchCommand
 * @property {(num: number) => void} selectMatthewCh
 * @property {(num: number) => void} selectBibleCh
 * @property {(id: any) => void} selectStudy
 * @property {(sid: any, chId: any) => void} selectStudyChapter
 * @property {(id: any) => any} getStudyById
 * @property {(study: any, chId: any) => any} getStudyChapter
 * @property {(slug: any) => string} studyReadKey
 * @property {(slug: any) => any} prevChainEntry
 * @property {(slug: any) => any} nextChainEntry
 * @property {(slug: any) => () => void} goToChainEntryFirst
 * @property {(slug: any) => () => void} goToChainEntryLast
 * @property {boolean} studiesLoading
 * @property {boolean} studiesError
 * @property {() => void} retryStudies
 * @property {any[]} UNIFIED_CHAIN
 * @property {*} searchQuery
 * @property {*} setSearchQuery
 * @property {*} searchScope
 * @property {*} setSearchScope
 * @property {*} searchContext
 * @property {*} journalEntryId
 * @property {() => void} createAndEditJournal
 * @property {(target: any, meta: any) => void} openInAppLetter
 * @property {*} openLinkSidebar
 * @property {(endpoint: any, meta?: any) => void} navigateToLink
 * @property {(entry: any) => void} pushFromLetter
 * @property {*} backHint
 * @property {() => void} tapThroughBack
 * @property {(vol: any, letter: any, excerpt: any) => void} goToLetterFromMatthew
 * @property {import('../hooks/use-tabs.js').TabSetter<'navOrigin'>} setNavOrigin
 * @property {*} setNoteSheetTarget
 * @property {*} bcvPrevBook
 * @property {*} bcvNextBook
 * @property {() => void} bcvOnPrevBook
 * @property {() => void} bcvOnNextBook
 * @property {*} bcvPrevBoundaryTitle
 * @property {*} bcvNextBoundaryTitle
 * @property {{ current: any; }} prophecyCardStatesRef
 * @property {() => void} saveProphecyCardStates
 * @property {{ current: { chapterNum: number; }; }} fromMatthewChRef
 * @property {import('../hooks/use-tabs.js').TabSetter<'fromMatthewCh'>} setFromMatthewCh
 * @property {import('../hooks/use-tabs.js').TabSetter<'fromWtlb'>} setFromWtlb
 * @property {import('../hooks/use-tabs.js').Tab['fromWtlb']} fromWtlb
 * @property {import('../hooks/use-tabs.js').Tab['fromSurprise']} fromSurprise
 * @property {boolean} backActive
 * @property {{ current: any[] }} fromLetterRef
 * @property {string | null} searchLanding
 * @property {boolean} [fromSearchIndex]
 * @property {(v: boolean) => void} [setFromSearchIndex]
 * @property {(volKey: string, entry: any) => any} boundaryConfig
 * @property {import('../hooks/use-tabs.js').Tab['gardenPage']} gardenPage
 * @property {import('../hooks/use-tabs.js').TabSetter<'gardenPage'>} setGardenPage
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
  fromSearch, setFromSearch, setFromSurprise,
  mode, setMode, showStudy, setShowStudy,
  genreId, setGenreId, surpriseAnchor, setSurpriseAnchor,
  audioColKey, setAudioColKey,
  // ── Theme + settings + display ──
  theme, setTheme,
  settings, toggleSetting, updateSetting,
  titleFocusHidden, setTitleFocusHidden,
  headingsFocusHidden, setHeadingsFocusHidden,
  // ── Read progress + history ──
  activeReadKey, setActiveReadKey,
  lastReadChapters, setLastReadChapters,
  lastReadLetterMap, setLastReadForVol,
  readItems, readHistory,
  markRead, unmarkRead, isRead, getReadKey, clearReadForBook, clearAllProgress, clearHistory,
  // ── Data resolved from screen state (F3: the active letter/entry only) ──
  activeLetter, activeVolKey,
  book, chapter,
  // ── Nav helpers ──
  goHome, goNavOrigin, navOrigin, goSearch, goHistory, goSettings, goAbout,
  goVolumesHome, goScripturesHome, goScriptureGenre, goBibleIdx, goMatthewIdx,
  goStudiesHome,
  goNotesIndex, goLinksIndex, goBookmarksIndex, goJournalHub, goHighlightsIndex,
  goProgress,
  goReadingPlans,
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
  // ── Back to results from a search hit (search200 UX B1) ──
  fromWtlb, fromSurprise, backActive, fromLetterRef, searchLanding,
  fromSearchIndex = false, setFromSearchIndex = undefined,
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
  // PER BOOK, because `offer`'s whole job is the fallback and it cannot do it
  // without a bookId: "one partial edition must not blank 65 books". Built once
  // for every screen, that arm was unreachable from the app — invisible while
  // every shipped edition carried all 66, and live the moment one does not.
  //
  // It matters at TWO sites and they are not the same size. Three consumers
  // guard the prop with AudioPlayer.hasAudio(volKey, book.id), so a volKey with
  // no row for that book only HIDES the Listen pill. BibleChapterView's
  // ReadAlongHighlight mount does NOT guard it, and that is where the volKey
  // selects which timings file the wash reads.
  const bibleAudioFor = (bookIdForAudio) => {
    const ed = resolveBibleAudio({ settings, bookId: bookIdForAudio }).offer;
    return ed ? { volKey: ed.volKey, label: ed.label } : null;
  };
  // rp1: the Today card's Read and Listen take the first chapter or letter of
  // today's portion not read yet ({ bid, cid } as the read record keys it: a
  // Bible bookId, or a collection's readKey). Read opens it the way a History
  // row does; Listen plays from it (a Bible chapter on through its book, a
  // letter on through its collection) and opens it when there is no recording.
  const _planCol = (bid) => COLLECTIONS.find((c) => c.readKey === bid) || null;
  const openPlanItem = (next) => {
    if (!next) return;
    const col = _planCol(next.bid);
    setGenreId(null);
    if (col) {
      setActiveReadKey('vol:' + col.volKey, () => setLastReadForVol(col.volKey, next.cid));
      navigateToLink({ screen: col.letterScreen, letterId: next.cid }, { sourceLetterTitle: 'Today', silent: true });
    } else {
      setActiveReadKey(next.bid, () => setLastReadChapters((prev) => ({ ...prev, [next.bid]: next.cid })));
      navigateToLink({ type: 'bible', bookId: next.bid, chapter: next.cid }, { sourceLetterTitle: 'Today', silent: true });
    }
  };
  // mw18 C5: Listen plays today's portion only (the refs from its first item not read yet), as one queue that
  // stops when the portion ends: each Bible chapter in the reader's audio edition, each letter in its
  // collection's recording. Items with no recording are passed over; with none, Read opens the first.
  const listenPlanItem = (refs, label) => {
    const list = (Array.isArray(refs) ? refs : refs ? [refs] : []).filter(Boolean);
    if (!list.length) return;
    const items = [];
    for (const ref of list) {
      const col = _planCol(ref.bid);
      if (col) {
        const pref = colPreface(col);
        const item = [...(pref ? [pref] : []), ...colLetterArr(col)].find((e) => e && e.id === ref.cid);
        if (item) items.push({ volKey: col.volKey, item, collectionLabel: col.label });
      } else {
        const bookId = ref.bid === 'matthew' ? 'matthew-plain' : ref.bid;
        const audio = bibleAudioFor(bookId);
        if (audio) items.push({ volKey: audio.volKey, item: { id: bookId }, collectionLabel: audio.label, chapterNum: Number(ref.cid) });
      }
    }
    const started = items.length > 0 && AudioPlayer.playPortion({ items, label: typeof label === 'string' ? label : 'Today' }) !== false;
    if (!started) openPlanItem(list[0]);
  };
  // Default LETTER voice (Settings → Listening → Letter Voice). The player is a
  // plain module — it can't read React state — so the preference is pushed to
  // it, idempotently, from the same render that owns the setting. 'auto' and
  // any unknown code both resolve to "use the manifest's primary reading".
  AudioPlayer.setPreferredReader(settings.letterReader);
  // Download only on Wi-Fi (ra6): pushed the same way, to the download stores and the phone app's.
  setWifiOnly(settings.downloadWifiOnly === true);
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
  // v01-04 / v01-05: browsing starts a new trail. A letter picked from a volume index, a
  // volume opened from the Volumes screen, a book or study opened from the Scriptures,
  // genre or Studies screens, or a chapter picked from a study index is not a return to a
  // search or a Surprise - but the reading screens' Back read those flags first
  // (fromSurprise, then fromSearch), so a stale one sent Back Home or to the search screen
  // instead of the index. (Search lands on none of these screens, so no search chain is cut.)
  const _startNewTrail = () => { setFromSearch(false); if (typeof setFromSurprise === 'function') setFromSurprise(false); };
  // A chapter picked from a Bible or Matthew index has left any Surprise (a Surprise never
  // lands on an index), but keeps fromSearch: a book-level search result lands on those
  // indexes, and Back from its chapter still returns to the search.
  const _leaveSurprise = () => { if (typeof setFromSurprise === 'function') setFromSurprise(false); };
  // Track D: ...and marks the chapter as picked from that index (fromSearchIndex), so its
  // back goes to the index the reader just used rather than past it to the results; the
  // index's own back still goes to the results. A pick outside a search marks nothing.
  const _pickFromIndex = () => { _leaveSurprise(); if (typeof setFromSearchIndex === 'function') setFromSearchIndex(!!fromSearch); };
  const _fromSearchIndex = !!fromSearch && !!fromSearchIndex;
  /** The way back to the index a chapter was picked from: that index, the mark spent. @param {() => void} go */
  const _backToIndex = (go) => () => { if (typeof setFromSearchIndex === 'function') setFromSearchIndex(false); go(); };
  const colIdxProps = (volKey) => {
    const col = COL_BY_KEY.get(volKey);
    const nav = (id) => { _startNewTrail(); setLetterId(id); setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id)); setScreen(col.letterScreen); };
    const props = {
      onSelect: nav,
      onSelectPreface: col.prefaceGlobal ? nav : undefined,
      // The index marker is not the resume dot (Wave 0 note above; sweep mw12): no showReadingDot here.
      currentLetter: activeReadKey === ('vol:' + volKey) ? (lastReadLetterMap[volKey] || null) : null,
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
  // Back to results (search200 UX B1). From a search hit the reader's ‹ went to the
  // parent index (a letter could never get back to its results by the arrows; a Bible
  // chapter took two taps), while the system back returned to the results. When the
  // system back would end at the results (searchBackActive mirrors handleAndroidBack's
  // precedence), the ‹ (navBack) and the back pill both go there, named "results". The
  // place the hit opened (searchLanding) is a look: the read tracker is off for it until
  // the reader reads it (their own scroll, or a stay), when useReadingPositionNav retires
  // the landing and the tracker comes on like any other read (B1 review).
  const _searchBack = searchBackActive({
    screen, fromSearch, fromSurprise, fromWtlb,
    fromMatthewCh: fromMatthewChRef ? fromMatthewChRef.current : null,
    stackLength: fromLetterRef && Array.isArray(fromLetterRef.current) ? fromLetterRef.current.length : 0,
    backActive, fromSearchIndex: _fromSearchIndex,
  });
  const _backToResults = () => { setFromSearch(false); setSurpriseAnchor(null); setScreen('search'); };
  const _navBack = _searchBack ? { onBack: _backToResults, label: RESULTS_LABEL } : null;
  // `plain`: "results" is a word, not a title, so the pill reads it in its label's case (Track D).
  const _readerBackHint = _searchBack ? { title: RESULTS_LABEL, volumeLabel: null, plain: true } : backHint;
  const _searchLook = isSearchLook({ fromSearch, searchLanding, screen, bookId, chapterNum, letterId, studyId, studyChapterId });
  const _readerMarkAsRead = _searchLook ? false : settings.markAsRead;
  const sharedViewProps = {
    onSearch: goSearch, onSettings: goSettings, onHistory: goHistory,
    theme, onThemeChange: setTheme, surpriseAnchor,
    onInAppLink: openInAppLetter, backHint: _readerBackHint, navBack: _navBack,
    onNavigateToLink: navigateToLink,
    onLinkOpen: openLinkSidebar,
    onBack: _navBack ? _navBack.onBack : () => window.handleAndroidBack && window.handleAndroidBack(),
    markAsReadEnabled: _readerMarkAsRead,
    // Read-along (ui/components/ReadAlongHighlight.jsx). Two independent
    // gates: the sentence wash, and the follow-scroll that writes scrollTop
    // under the lease. Both default ON — an absent key must not silently
    // retire the feature for a reader restoring an older backup.
    readAlongOn: settings.readAlongHighlight !== false,
    readAlongFollow: settings.readAlongFollow !== false,
    // Songs of the Letters (L4): the HEAR IT SUNG pill and the songs card on letter pages. Default ON.
    showSongs: settings.showLetterSongs !== false,
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
  //   - A study recording (study:<chapterId>, ruling (4) 2026-09-11) opens the
  //     study chapter. bible-studies.js is lazy and 4.4 MB and the Library
  //     can be a session's first screen, so the arm does NOT await it: the
  //     destination is set at once through navigateToLink (the History
  //     arm's door) and the bible-study-chapter route owns the corpus kick
  //     and its Loading… surface. The study id therefore comes from the
  //     key: every shipped chapter id is `<study.id>-ch<n>`, pinned over
  //     the live corpus and manifest by screen-routes.studyaudio.test.jsx.
  //   - Hidden Manna (no index) has no destination; a range compilation (key
  //     null) opens the letter under the clock once its timings have landed
  //     (2026-09-20) — hasTextDestination gates every tap on the same rule.
  // Pure navigation: the AudioPlayer singleton is never touched, so playback
  // continues across the jump.
  // W-03 (walk 2026-09-25): the back pill over a letter opened from a recording names where it RETURNS. It said
  // "Listening Library" from everywhere, the Songs screens and the listening desk included. The Songs screens name
  // their top frame (the song, the list, the hub; AudioSongsScreen's songsFrameTitle), the Library screens the Library, and
  // any other page the desk was opened over its own title (the tab title the headers set).
  const _audioTextFrom = (sourceScreen) => {
    if (sourceScreen === SONGS_SCREEN) {
      const frames = decodeSongsRoute(audioColKey);
      const fn = /** @type {any} */ (globalThis).songsFrameTitle;
      return typeof fn === 'function' ? fn(frames[frames.length - 1], /** @type {any} */ (globalThis).AudioLibraryStore) : 'Songs of the Letters';
    }
    if (typeof sourceScreen === 'string' && sourceScreen.indexOf('audio-library') === 0) return 'Listening Library';
    if (sourceScreen === 'home') return 'Home';
    const title = typeof document !== 'undefined' ? String(document.title || '').replace(/\s+[—-]\s+VOTReader$/, '').trim() : '';
    return title && title !== 'VOTReader' ? title : 'Back';
  };
  // Corbin 2026-10-05: "Get rid of back to listening library pill, listening library is not a true screen". Text
  // opened from a Listening Library screen (or the desk over one) pushes a `silent` entry: no pill, but hardware
  // Back still returns to the shelf it came from (backActive, the History arm's rule). Songs and other pages keep theirs.
  const _openAudioText = (track, sourceScreen) => {
    const fromTitle = _audioTextFrom(sourceScreen);
    const silent = sourceScreen !== SONGS_SCREEN && typeof sourceScreen === 'string' && sourceScreen.indexOf('audio-library') === 0;
    const linkMeta = silent ? { sourceLetterTitle: fromTitle, silent: true } : { sourceLetterTitle: fromTitle };
    // textKeyOf (AudioShelf): the track's own key, or for a WTLB compilation the
    // letter under the clock — the same rule hasTextDestination gates the tap on.
    const key = textKeyOf(track) || '';
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
        linkMeta
      );
      return;
    }
    if (volKey === 'study') {
      const stem = id.match(/^(.+)-ch\d+$/);
      if (!stem) return;   // a key no shipped manifest produces (a saved row from another build): nothing, not a crash
      const studyId = stem[1];
      const study = getStudyById(studyId);
      // Same tracking as selectStudyChapter (an index open) and the History
      // arm — the reading dot must not tell a Library open apart. slug === id
      // for every shipped study (pinned); the corpus-resident slug is preferred
      // exactly as the History arm prefers it.
      const slug = (study && study.slug) || studyId;
      setActiveReadKey(studyReadKey(slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(slug)]: id })));
      navigateToLink({ type: 'study-letter', studyId, studyChapterId: id }, linkMeta);
      return;
    }
    const collection = COL_BY_KEY.get(volKey);
    if (!collection || !collection.letterScreen) return;
    // Same wiring as colIdxProps' nav — the reading dot / last-read tracking
    // must not distinguish a Library open from an index open.
    pushFromLetter({
      sourceScreen,
      // Where the pill returns: the screen AND the place on it (a letter or chapter the desk was opened over).
      sourceLetterId: letterId, sourceBookId: bookId, sourceChapterNum: chapterNum,
      sourceStudyId: studyId, sourceStudyChapterId: studyChapterId,
      sourceLetterTitle: fromTitle,
      destSnapshot: { screen: collection.letterScreen, letterId: id },
      ...(silent ? { silent: true } : {}),
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
  // registry so an unknown id can never be persisted, and on bibleAudioOffered
  // so a hidden one cannot be either (no chip offers it; a tool could).
  window.__setBibleAudioEdition = (id) => { if (bibleAudioOffered(bibleAudioEdition(id))) updateSetting('bibleAudio', id); };
  // Entering a Listening Library sub-screen chains the origin so backing out
  // lands on the hub, and the hub's own back still returns to Library/Volumes.
  const _enterAudioSub = (destination) => {
    setNavOrigin({ screen: 'audio-library', returnOrigin: navOrigin || null });
    setScreen(destination);
  };
  // Songs of the Letters (L2): ONE routed screen whose stack of frames (hub, a list, a song) rides the tab's
  // audioColKey (utils/songs-route.js), so no tab field and no app.jsx line. Opening it sets the stack and the
  // origin Back leaves by; Back pops a frame first. Android Back reaches the same pop through __songsBack.
  const _openSongs = (frames, origin) => {
    setAudioColKey(encodeSongsRoute(frames));
    setNavOrigin({ ...origin, returnOrigin: navOrigin || null });
    setScreen(SONGS_SCREEN);
  };
  // True when a frame popped and the screen stays (Back's history bookkeeping needs it, W38).
  const _songsBack = () => {
    const popped = popSongsFrame(audioColKey);
    if (popped) { setAudioColKey(popped); return true; }
    goNavOrigin();
    return false;
  };
  window.__songsBack = screen === SONGS_SCREEN ? _songsBack : null;
  // A letter page's songs card opens a song or the letter's songs; Back returns to this letter.
  // Already on the Songs screen (the desk's "Song page ›" over a song list), the frames go on top of its stack, so
  // Back returns to the list. From anywhere else Back returns to that page, the root pill naming it (W-03).
  window.__openSongs = (frames, label) => {
    if (screen === SONGS_SCREEN) {
      // W2-03: the page already on top is not stacked again (its copy made the first Back go nowhere).
      const stack = decodeSongsRoute(audioColKey);
      const top = stack[stack.length - 1];
      const fresh = (frames || []).filter((f, i) => i > 0 || !(f && top && f.k === top.k && (f.v || '') === (top.v || '')));
      if (fresh.length) setAudioColKey(encodeSongsRoute(/** @type {any[]} */ (stack).concat(fresh)));
      return;
    }
    _openSongs(frames, { screen, letterId, label: label || (screen === 'home' ? '' : _audioTextFrom(screen)) });
  };

  // The doors into the Scripture Web (the navigation stream, w3): the reader's menus open the web at
  // a place (CONTRACTS.md section 8's start: { verse }, { book, chapter? }, { letterKey }, or
  // 'this-letter' for the page's own letter, entry or study chapter; opts.check asks whether
  // there is a door here without going: Hidden Manna has none, being reached only through the
  // Matthew study chain). The page becomes the way
  // back (the web's Back is goNavOrigin), and the start rides navHandoff 'webStart' into the route
  // below, which hands it to the screen while the web is up; anywhere else it is spent, so the web
  // opened later from the Library opens where it was. Reassigned every build, like __openSongs.
  window.__openScriptureWeb = (start, opts) => {
    let to = start;
    if (start === 'this-letter') {
      to = screen === 'bible-study-chapter' && studyId && studyChapterId
        ? { letterKey: 'study:' + studyId + '/' + studyChapterId }
        : activeVolKey && activeVolKey !== 'hm' && activeLetter && activeLetter.id ? { letterKey: activeVolKey + '/' + activeLetter.id } : null;
    }
    if (!to || typeof to !== 'object') return false;
    // a letter is a door only once the web's panel has letter mode (PANEL_MODES): before that the
    // web would open at its old place and name nothing of the letter, so the toolbar hides it
    if (to.letterKey && !PANEL_MODES.letter) return false;
    if (opts && opts.check) return true;
    window.navHandoff.set('webStart', to);
    setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId, returnOrigin: navOrigin || null });
    setScreen('scripture-web');
    return true;
  };
  if (screen !== 'scripture-web' && window.navHandoff) window.navHandoff.clear('webStart');

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
  /**
   * Every fallback route's view (mw17 s17.2/s17.3): what went wrong, an optional
   * way on, and the screen's chrome around it. Loading is a polite status, a
   * failure an alert, so a screen reader hears both. A FALLBACK MUST NOT BE ABLE
   * TO FAIL: it only runs because something already went wrong, so ScreenLayout
   * and LibraryNav (bare Cluster-D globals) wrap it only when they are there.
   * @param {{ say: any, label?: string, onGo?: () => void, nav?: () => any, role?: 'status' | 'alert' }} v
   * @returns {any} never null
   */
  const _fallbackView = ({ say, label, onGo, nav, role }) => {
    const body = (
      <div className="sc-sheet-loading route-fallback" role={role}>
        <div>{say}</div>
        {label ? <button type="button" className="route-fallback-btn" onClick={onGo}>{label}</button> : null}
      </div>
    );
    let navEl = null;
    try { navEl = (typeof LibraryNav === 'function' && nav) ? nav() : null; } catch (_e) { navEl = null; }
    return (typeof ScreenLayout === 'function')
      ? <ScreenLayout navChildren={navEl}>{body}</ScreenLayout>
      : body;
  };
  /** LibraryNav with a way back to `onBack` (named `backLabel`) and the usual top-bar actions. */
  const _navTo = (/** @type {() => void} */ onBack, /** @type {string} */ backLabel) => () => LibraryNav({
    onBack, backLabel,
    onSettings: goSettings, onHistory: goHistory, onSearch: goSearch,
    theme, onThemeChange: setTheme,
  });
  const _corpusView = (corpus, loadFn, loadingLabel, nav = _navTo(goHome, 'Home')) => {
    if (corpus && corpus.error) {
      return _fallbackView({
        say: 'Couldn’t load this section.', label: 'Try again', role: 'alert', nav,
        onGo: () => { if (typeof loadFn === 'function') loadFn(); },
      });
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
    return _fallbackView({ say: loadingLabel, role: 'status', nav });
  };
  /**
   * What a letter/entry route renders when the corpus IS loaded and the active
   * letter does not resolve — a persisted tab whose letterId is no longer in
   * the corpus (navigation-tabs-4).
   *
   * Every one of these routes was `_wrapVot(actL(k) && <View/>)`, so a dead
   * letterId made the `&&` yield null and _wrapVot passed it straight through:
   * no header, no nav, no back affordance. And because the tab is PERSISTED,
   * reloading landed on the same blank screen. `_validateTabState` cannot
   * catch it — it only checks that letterId is truthy, because the corpus is
   * lazy and does not exist at boot — so the guard has to live here.
   *
   * Chrome plus a way out, not an error: the reader did nothing wrong, and the
   * collection they were in is still there. `COL_BY_KEY` carries the
   * `indexScreen` for each volKey, so the button goes where they were headed.
   *
   * @param {string} volKey
   * @returns {any} never null
   */
  /**
   * W28: a study route whose study (or part) does not resolve rendered null: no
   * header, no back, no retry, and the persisted tab repeated it on reload. The
   * _deadLetter rule, for studies: chrome plus a way out, and a fallback that
   * cannot fail. Still loading, or not asked for yet (App's effect starts the
   * load after the first render; bible-studies.js defines BIBLE_STUDIES) ->
   * Loading. The load failed -> Try again. Loaded and the id is stale -> a way back.
   *
   * @param {boolean} [partGone] the study is there, the part is not
   * @returns {any} never null
   */
  const _deadStudy = (partGone) => {
    const failed = studiesError && !studiesLoading;
    if (!failed && (studiesLoading || typeof BIBLE_STUDIES === 'undefined')) {
      return _fallbackView({ say: 'Loading…', role: 'status', nav: _navTo(goStudiesHome, 'Studies') });
    }
    const say = failed ? 'Couldn’t load studies.' : partGone ? 'This part is no longer available.' : 'This study is no longer available.';
    const label = failed ? 'Try again' : partGone ? 'Back to the study' : 'Back to Studies';
    const go = failed ? retryStudies : partGone ? () => setScreen('bible-study-index') : goStudiesHome;
    return _fallbackView({ say, label, onGo: go, role: failed ? 'alert' : undefined, nav: _navTo(goStudiesHome, 'Studies') });
  };

  const _deadLetter = (volKey) => {
    const col = (typeof COL_BY_KEY !== 'undefined' && COL_BY_KEY.get) ? COL_BY_KEY.get(volKey) : null;
    const idxScreen = (col && col.indexScreen) || 'volumes-home';
    // Chrome when it is there, body alone when it is not. A FALLBACK MUST NOT
    // BE ABLE TO FAIL: this path only runs because something already went
    // wrong, and throwing a ReferenceError here would replace a blank route
    // with a dead app — strictly worse than the bug it fixes. `ScreenLayout`
    // is a bare Cluster-D global, so its presence is an assumption, not a
    // guarantee this function can make (_fallbackView).
    return _fallbackView({ say: 'This letter is no longer available.', label: 'Back to the list', onGo: () => setScreen(idxScreen), nav: _idxNav });
  };

  /**
   * What the Bible chapter route renders when the corpus IS loaded and the book
   * has no such chapter: "John 30:1" from Search, a stale deep link, and "Jude 3"
   * before the parser read a lone number after a one-chapter book as the verse
   * (v07-01). The route returned null there - no header, no nav. Same shape as
   * _deadLetter: chrome, what the book holds, and a way into it.
   * @param {any} bk the resolved book
   * @param {number} num the chapter asked for
   * @param {() => void} [openBook] the way into the book (default: its chapter list)
   * @returns {any} never null
   */
  const _missingChapter = (bk, num, openBook) => {
    const count = (bk && bk.chapters && bk.chapters.length) || 0;
    const one = count === 1;
    // Matthew passes its own way in (s17.1: a stale tab on "Matthew 40" opened blank).
    const onGo = openBook || (() => (one ? selectBibleCh(1) : goBibleIdx()));
    return _fallbackView({
      say: bk.title + (one ? ' has one chapter' : ' has ' + count + ' chapters') + (num ? ', so there is no chapter ' + num + '.' : '.'),
      label: 'Open ' + bk.title, onGo, nav: _idxNav,
    });
  };

  /**
   * What the Bible routes (bible-idx, bible-ch) render when the corpus IS loaded
   * and the bookId does not resolve: a persisted tab whose book was renamed or
   * dropped between builds, or a deep link to one (sweep v109). Both routes
   * returned null there - no header, no nav - and the persisted tab repeated it
   * on every reload. _validateTabState cannot catch it: it only checks that
   * bookId is truthy, because the Bible corpus is lazy and absent at boot (the
   * _deadLetter reasoning). Chrome plus the way back to the Scriptures, and,
   * like every fallback here, unable to fail.
   * @returns {any} never null
   */
  const _missingBook = () => _fallbackView({
    say: 'This book is no longer available.', label: 'Back to Scriptures', onGo: goScripturesHome,
    nav: _navTo(goScripturesHome, 'Scriptures'),
  });

  /* s17.8: a History letter row opens its own letter. An old row has no
     volumeScreen: it opens the collection whose letters hold its letterId
     (loading the letters first when they have not landed), not Volume Two. A
     letter no collection holds goes to its volume number's letter route, which
     holds no such id either, so that route shows the dead-letter view. */
  const _openHistoryLetter = (/** @type {any} */ entry, afterLoad = false) => {
    let col = entry.volumeScreen ? COL_BY_INDEX_SC.get(entry.volumeScreen) : null;
    if (!col && entry.letterId) {
      const vc = window.__votCorpus;
      if (!afterLoad && vc && !vc.loaded && typeof window.__loadVotCorpus === 'function') {
        const again = () => _openHistoryLetter(entry, true);
        Promise.resolve(window.__loadVotCorpus()).then(again, again);
        return;
      }
      for (const c of COL_BY_KEY.values()) {
        if (c && c.letterScreen && colLetterArr(c).some((/** @type {any} */ x) => x && x.id === entry.letterId)) { col = c; break; }
      }
    }
    if (!col) col = entry.volume === 1 ? COL_BY_KEY.get('one') : COL_BY_KEY.get('two');
    const hc = col;
    setGenreId(null);
    setActiveReadKey('vol:' + hc.volKey, () => setLastReadForVol(hc.volKey, entry.letterId));
    navigateToLink({ screen: hc.letterScreen, letterId: entry.letterId }, { sourceLetterTitle: 'History', silent: true });
  };

  /**
   * @param {any} jsx     the route's element, or falsy when the letter did not resolve
   * @param {string} [volKey] the collection, for the dead-letter fallback. Pass it
   *   on every letter/entry route; index routes have no letter to lose.
   */
  const _wrapVot = (jsx, volKey) => {
    if (!_votReady) return _corpusView(window.__votCorpus, window.__loadVotCorpus, 'Loading…', _idxNav);
    // Corpus loaded and nothing to render: a dead letterId, never a blank screen.
    if (!jsx && volKey) return _deadLetter(volKey);
    return jsx;
  };
  // Personal-library screens (notes/bookmarks/links/highlights/journal) resolve
  // VOT letter titles + nav endpoints via findEntryContext, which only works
  // once the VOT corpus registry is built. On a cold-boot restore straight into
  // one of them nothing else pulls the corpus, so rows show raw ids
  // ("the-last-trump") and letter tap-throughs dead-end. Kick the load in the
  // BACKGROUND — same render-phase contract as 'matthew-ch' below (idempotent
  // + async-notify-only); useLazyBundles re-renders App when it lands and the
  // labels upgrade in place.
  const _kickVot = (jsx) => { if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus(); return jsx; };

  // Answers Only God Can Give — its own lazy corpus (utils/sync-loaders.js),
  // gated like the VOT routes. Every Answers route ALSO kicks the VOT corpus in
  // the background: a topic's attributions open letters, and the registry that
  // resolves them (__finishVotInit) only knows letters whose corpus has landed.
  const _answersCorpus = typeof window.__answersCorpus !== 'undefined' ? window.__answersCorpus : null;
  const _answersReady = !!(_answersCorpus && _answersCorpus.loaded) && typeof ANSWERS !== 'undefined';
  // The browse screens get the whole ANSWERS array, the Main Page (appended
  // last, c72) included: they list it first, as the site's sidebar does, and
  // the site's order (answers-site.js) starts from it.
  const _wrapAnswers = (render) => {
    if (!_answersReady) return _corpusView(_answersCorpus, window.__loadAnswersCorpus, 'Loading…');
    return _kickVot(render(ANSWERS));
  };
  const _answersSite = () => (typeof ANSWERS_SITE_META !== 'undefined' ? ANSWERS_SITE_META : null);
  // Ticks, "N read" and Continue (Settings › Reading › Answers Reading Path; on unless turned off).
  const _answersPathOn = settings.answersReadingPath !== false;
  const _answersBrowseProps = () => ({
    isRead: (id) => isRead('answers', id), pathOn: _answersPathOn, fontScale: settings.fontScale,
  });
  // A shelf: '1'..'12' a numbered group, 'other' Other Topics (it rides letterId).
  const _openAnswersGroup = (key) => { setLetterId(key); setScreen('answers-group'); };
  const _answersShelf = (entries, key) => (isAnswersGroupKey(key)
    ? <AnswersShelf {..._answersNavProps} {..._answersBrowseProps()} entries={entries} groupKey={String(key)} onBack={() => setScreen('answers-home')} />
    : _answersLanding(entries));
  // The landing paints its head and ask at once; the lists fill in when the corpus lands.
  const _answersLanding = (entries) => (
    <AnswersHome
      {..._answersNavProps}
      {..._answersBrowseProps()}
      entries={entries}
      site={entries ? _answersSite() : null}
      pathLast={_answersPathOn ? readAnswersPath() : null}
      onBack={goHome}
      onOpenGroup={_openAnswersGroup}
      onOpenMedia={() => setScreen('answers-media')}
      onOpenSaved={() => setScreen('answers-saved')}
      onSearchLibrary={(q) => { setSearchQuery(q); goSearch(); }}
      onOpenLetter={(target) => openInAppLetter(target, { sourceLetterTitle: 'Answers', sourceVolumeLabel: null })}
      onGoToRef={(ref) => {
        const m = /^Exodus 20:(\d+)$/.exec(ref);
        if (m) navigateToLink({ type: 'bible', bookId: 'exodus', chapter: 20, verse: Number(m[1]) }, { sourceLetterTitle: 'Answers' });
      }}
    />
  );
  // Open a topic from the Answers landing / a shelf / A–Z / a sheet / a search hit.
  // It goes through the tap-through stack, so the topic shows "‹ Back to …"
  // and Back returns to the exact list (a shelf's key rides letterId). A
  // search hit carries the paragraph it matched, and the topic lands on it;
  // a link naming a section (a site #fragment, `section`) lands on that
  // section instead (answers-sections.js, aogcg 1b).
  // find (U8): a passage search hit also presets find-in-topic to its query (FindInUnit's pill).
  // para (Saved answers, O5): the paragraph itself, so a mark on words a topic repeats lands on its own copy.
  const _openAnswersTopic = (id, anchorText, fromTitle, section, find, para) => {
    pushFromLetter({
      sourceScreen: screen, sourceLetterId: letterId,
      sourceBookId: null, sourceChapterNum: null, sourceStudyId: null, sourceStudyChapterId: null,
      sourceLetterTitle: fromTitle || 'Answers', sourceVolumeLabel: null,
      destSnapshot: { screen: 'answers-entry', bookId: null, chapterNum: null, letterId: id, studyId: null, studyChapterId: null },
    });
    window.navHandoff.clear('pendingHighlight');
    setSurpriseAnchor(section ? answersSectionAnchor(id, section)
      : anchorText ? { type: 'excerpt', text: anchorText, letterId: id, ...(find ? { find } : {}), ...(Number.isInteger(para) ? { para } : {}) } : null);
    setLetterId(id);
    setActiveReadKey('vol:answers', () => setLastReadForVol('answers', id));
    setScreen('answers-entry');
  };
  const _answersNavProps = {
    onSearch: goSearch, onHistory: goHistory, onSettings: goSettings,
    theme, onThemeChange: setTheme, onOpenTopic: _openAnswersTopic,
  };
  // A topic page's hand-offs (AnswersTopic.jsx): its links, eyebrow, foot rows and the Main Page's
  // "See left column" row. A topic link goes through the tap-through stack, so Back returns to the
  // topic. A group and the landing are the collection's own screens, with its Back (use-android-back:
  // a group goes to the landing, the landing Home); a search goes back where it was opened from.
  const _answersTopicNav = (entries, fromTitle, go) => ({
    entries, isRead: (id) => isRead('answers', id), pathOn: _answersPathOn,
    openTopic: (id, anchor) => _openAnswersTopic(id, null, fromTitle, anchor || null),
    // Next / Previous in the site's order read on, as the arrows do (no new Back step)
    go: (id) => { setSurpriseAnchor(null); go(id); },
    openGroup: _openAnswersGroup,
    openLanding: () => { resetAnswersLanding(); setScreen('answers-home'); },
    openStudy: (slug, url) => {
      if (typeof getStudyById === 'function' && getStudyById(slug)) { _startNewTrail(); selectStudy(slug); } else if (url) window.open(url, '_blank', 'noopener');
    },
    searchLibrary: (q) => { setSearchQuery(q); goSearch(); },
    goToRef: (ref) => {
      const m = /^Exodus 20:(\d+)$/.exec(ref);
      if (m) navigateToLink({ type: 'bible', bookId: 'exodus', chapter: 20, verse: Number(m[1]) }, { sourceLetterTitle: 'Answers' });
    },
  });

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
    'vot-one-letter':    () => _wrapVot(actL('one')     && <LetterView {...sharedViewProps} {...colReadNavProps('one', true)}     {...boundaryConfig('one', actL('one'))}     letter={actL('one')}     volumeLabel="Volume One" />, 'one'),
    // C2-C [C2]: this was the ONE letter route that named no volume — it rode
    // LetterView's `volumeLabel || "Volume Two"` fallback, which is why the
    // fallback looked harmless. Say it here so the fallback can become honest.
    'vot-letter':    () => _wrapVot(actL('two')     && <LetterView {...sharedViewProps} {...colReadNavProps('two', true)}     {...boundaryConfig('two', actL('two'))}       letter={actL('two')}     volumeLabel="Volume Two" />, 'two'),
    'vot-three-letter':    () => _wrapVot(actL('three')   && <LetterView {...sharedViewProps} {...colReadNavProps('three', true)}   {...boundaryConfig('three', actL('three'))}   letter={actL('three')}     volumeLabel="Volume Three" />, 'three'),
    'vot-four-letter':    () => _wrapVot(actL('four')    && <LetterView {...sharedViewProps} {...colReadNavProps('four', true)}    {...boundaryConfig('four', actL('four'))}    letter={actL('four')}     volumeLabel="Volume Four" />, 'four'),
    'vot-five-letter':    () => _wrapVot(actL('five')    && <LetterView {...sharedViewProps} {...colReadNavProps('five', true)}    {...boundaryConfig('five', actL('five'))}    letter={actL('five')}     volumeLabel="Volume Five" />, 'five'),
    'vot-six-letter':    () => _wrapVot(actL('six')     && <LetterView {...sharedViewProps} {...colReadNavProps('six', true)}     {...boundaryConfig('six', actL('six'))}     letter={actL('six')}     volumeLabel="Volume Six" />, 'six'),
    'vot-seven-letter':    () => _wrapVot(actL('seven')   && <LetterView {...sharedViewProps} {...colReadNavProps('seven', true)}   {...boundaryConfig('seven', actL('seven'))}   letter={actL('seven')}     volumeLabel="Volume Seven" />, 'seven'),
    'vot-timothy-letter':    () => _wrapVot(actL('timothy') && <LetterView {...sharedViewProps} {...colReadNavProps('timothy', true)} {...boundaryConfig('timothy', actL('timothy'))} letter={actL('timothy')} volumeLabel="Letters from Timothy" />, 'timothy'),
    'vot-flock-letter':    () => _wrapVot(actL('flock')   && <LetterView {...sharedViewProps} {...colReadNavProps('flock', true)}   {...boundaryConfig('flock', actL('flock'))}   letter={actL('flock')}   volumeLabel="Letters to The Lord's Little Flock" />, 'flock'),
    'vot-rebuke-letter':    () => _wrapVot(actL('rebuke')  && <LetterView {...sharedViewProps} {...colReadNavProps('rebuke', true)}  {...boundaryConfig('rebuke', actL('rebuke'))} letter={actL('rebuke')}  volumeLabel="The Lord's Rebuke" />, 'rebuke'),

    // ── WTLB / Blessed entry screens (3) — data-guarded ──
    'wtlb-one-entry':    () => _wrapVot(actL('wtlb1')   && <WtlbEntryView {...sharedViewProps} {...colReadNavProps('wtlb1')}   {...boundaryConfig('wtlb1', actL('wtlb1'))}   entry={actL('wtlb1')}   partLabel="Part One" onNavToChapter={_navToChapter} />, 'wtlb1'),
    'wtlb-two-entry':    () => _wrapVot(actL('wtlb2')   && <WtlbEntryView {...sharedViewProps} {...colReadNavProps('wtlb2')}   {...boundaryConfig('wtlb2', actL('wtlb2'))}   entry={actL('wtlb2')}   partLabel="Part Two" onNavToChapter={_navToChapter} />, 'wtlb2'),
    'blessed-entry':    () => _wrapVot(actL('blessed') && <WtlbEntryView {...sharedViewProps} {...colReadNavProps('blessed')} {...boundaryConfig('blessed', actL('blessed'))} entry={actL('blessed')} partLabel="The Blessed" onNavToChapter={_navToChapter} />, 'blessed'),

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
        onSettingsChange={updateSetting}
        onSelect={handleSearchSelect}
        onCommand={handleSearchCommand}
        onBack={goSearchOrigin}
        searchScope={searchScope}
        searchContext={searchContext}
        onToggleScope={() => setSearchScope((prev) => prev ? null : searchContext)}
        onOpenSongs={(q) => _openSongs([{ k: 'hub', q }], { screen: 'search' })}
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
        onOpenAudio={() => { setNavOrigin({ screen: 'home', returnOrigin: navOrigin || null }); setScreen('audio-library'); }}
        onOpenSongs={() => _openSongs([{ k: 'hub' }], { screen: 'home' })}
        onNotes={goNotesIndex}
        onBookmarks={goBookmarksIndex}
        onScriptureWeb={() => {
          // Same entry as the Library's: capture Home as the origin so back returns here.
          setNavOrigin({ screen: 'home', returnOrigin: navOrigin || null });
          setScreen('scripture-web');
        }}
        historyEnabled={settings.historyEnabled !== false}
        onAbout={goAbout}
        searchEnabled={settings.searchEnabled !== false}
        history={readHistory}
        translation={settings.translation}
        theme={theme} onThemeChange={setTheme}
        readingPlans={settings.readingPlans}
        isRead={isRead}
        markAsReadEnabled={settings.markAsRead !== false}
        onPlanRead={openPlanItem}
        onPlanListen={listenPlanItem}
        onEnableMarkAsRead={() => updateSetting('markAsRead', true)}
        onOpenPlans={goReadingPlans}
        onPlansMoved={(/** @type {any[]} */ left) => updateSetting('readingPlans', left)}
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
            _openHistoryLetter(entry);
          } else {
            setGenreId(null);
            setActiveReadKey(entry.bookId, () => setLastReadChapters((prev) => ({ ...prev, [entry.bookId]: entry.chapterNum })));
            navigateToLink({ type: 'bible', bookId: entry.bookId, chapter: entry.chapterNum }, { sourceLetterTitle: 'History', silent: true });
          }
        }}
        onSearch={goSearch}
        onSettings={goSettings}
        onHistory={goHistory}
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
          onOpenPlans={() => { setNavOrigin({ screen: 'library', returnOrigin: navOrigin || null }); setScreen('reading-plans'); }}
          readingPlanCount={(typeof ReadingPlanStore !== 'undefined' && ReadingPlanStore ? ReadingPlanStore.active().length : 0) || (Array.isArray(settings.readingPlans) ? settings.readingPlans.length : 0)}
          onOpenScriptureWeb={() => {
            setNavOrigin({ screen: 'library', returnOrigin: navOrigin || null });
            setScreen('scripture-web');
          }}
          totalReadCount={Object.keys(readItems || {}).length}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          historyEnabled={settings.historyEnabled !== false}
          theme={theme} onThemeChange={setTheme}
        />
    ),
    // rp1: the reading plans; back returns to where it was opened
    'reading-plans': () => (
      <ReadingPlansScreen
        onBack={goNavOrigin}
        backLabel={navOrigin && navOrigin.screen === 'home' ? 'Home' : 'Library'}
        readingPlans={settings.readingPlans}
        isRead={isRead}
        markAsReadEnabled={settings.markAsRead !== false}
        onPlansMoved={(/** @type {any[]} */ left) => updateSetting('readingPlans', left)}
        onRead={openPlanItem}
        onListen={listenPlanItem}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    // The Personal Study screens.
    'my-progress': () => _kickVot(
      <MyProgressScreen
        onBack={goNavOrigin}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        settings={settings}
        readItems={readItems}
        historyCount={readHistory.length}
        historyEnabled={settings.historyEnabled !== false}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    // Link-outs from the index / viewer / web screens do NOT write navOrigin.
    // These screens' own Back IS goNavOrigin, and goHighlightsIndex & friends
    // already snapshotted the reading position there when the index opened —
    // a self-referential { screen: <own screen> } write would erase that
    // snapshot and leave Back pointing at the screen already showing (one dead
    // press, then Home). navigateToLink owns the destination's return path
    // through the fromLetter entry it pushes (the pill / tapThroughBack /
    // handleAndroidBack), so there is nothing here for navOrigin to carry.
    'highlights-index': () => _kickVot(
      <HighlightsScreen
        onSettings={goSettings}
        onBack={goNavOrigin}
        onHome={goHome}
        onNavigateToSource={(endpoint, meta) => {
          if (endpoint) {
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Highlights' });
          }
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'journal-home': () => _kickVot(
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
    'journal-viewer': () => _kickVot(
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
          // returnOrigin chains the Journal hub's own origin (sweep mw12), as every sibling hop does.
          setNavOrigin({ screen: 'journal-viewer', returnOrigin: navOrigin || null });
          setScreen('notes-index');
        }}
        onSearch={goSearch}
        onHistory={goHistory}
        historyEnabled={settings.historyEnabled !== false}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'journal-editor': () => _kickVot(
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
        navOrigin={navOrigin}
        onHome={goHome}
        onOpenNote={(gid) => setNoteSheetTarget({ groupId: gid, startInEditMode: false })}
        onNavigateToSource={(endpoint, meta) => {
          if (endpoint) {
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
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Links' });
          }
        }}
        onNavigateToTarget={(endpoint, meta) => {
          if (endpoint) {
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
        onSelect={(/** @type {[id: string, clearGenre?: boolean]} */ ...a) => { _startNewTrail(); handleScriptureSelect(...a); }}
        onGenre={goScriptureGenre}
        onBack={goHome}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        onMatthewStudy={() => { _startNewTrail(); setBookId('matthew'); setChapterNum(null); setScreen('matthew-idx'); }}
        theme={theme} onThemeChange={setTheme}
        layout={settings.scriptureLayout}
        onCycleLayout={(nextId) => updateSetting('scriptureLayout', nextId)}
        translation={settings.translation}
        onTranslation={(/** @type {string} */ v) => updateSetting('translation', v)}
      />
    ),
    'scripture-genre': () => (!genreId || (typeof SCRIPTURE_GENRES !== 'undefined' && SCRIPTURE_GENRES
      && ![...(SCRIPTURE_GENRES.ot || []), ...(SCRIPTURE_GENRES.nt || [])].some((g) => g && g.id === genreId)))
      // s21.2: a stale genreId said nothing at all (a blank screen); now it says so and goes back.
      ? _fallbackView({
        say: 'This group of books is no longer available.', label: 'Back to Scriptures', onGo: goScripturesHome,
        nav: _navTo(goScripturesHome, 'Scriptures'),
      })
      : (
      <ScriptureGenre
        genreId={genreId}
        onSelect={(/** @type {[id: string, clearGenre?: boolean]} */ ...a) => { _startNewTrail(); handleScriptureSelect(...a); }}
        onBack={goScripturesHome}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'volumes-home': () => (
      <VolumesHome
        onSelect={(id) => { _startNewTrail(); handleVolumeSelect(id); }}
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
        onOpenStudies={() => _enterAudioSub('audio-library-studies')}
        onOpenOffline={() => _enterAudioSub('audio-library-offline')}
        onOpenSongs={() => { setAudioColKey(encodeSongsRoute([{ k: 'hub' }])); _enterAudioSub(SONGS_SCREEN); }}
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
    // Downloads to the phone (listening item 8): the hub's "On this phone" row.
    'audio-library-offline': () => (
      <AudioOfflineScreen
        onBack={goNavOrigin}
        backLabel="Listening Library"
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    'audio-library-studies': () => (
      <AudioStudiesScreen
        onBack={goNavOrigin}
        backLabel="Listening Library"
        onOpenStudy={(studyId) => {
          // A study opens the same recordings screen a collection does, as 'study:<id>'.
          setAudioColKey('study:' + studyId);
          setNavOrigin({ screen: 'audio-library-studies', returnOrigin: navOrigin || null });
          setScreen('audio-library-collection');
        }}
        onReadStudy={(studyId) => {
          // A study with no recording yet opens to READ (Codex critique 1,
          // 2026-09-23): its index, or its one page, with the back pill
          // returning to the Studies screen (same wiring as _openAudioText: a
          // silent entry, Back returns there with no pill, Corbin 2026-10-05).
          const s = getStudyById(studyId);
          if (!s || !Array.isArray(s.chapters) || !s.chapters.length) return;
          const single = s.chapters.length === 1 || s.singlePage;
          pushFromLetter({
            sourceScreen: 'audio-library-studies',
            sourceLetterTitle: 'Studies',
            destSnapshot: single
              ? { screen: 'bible-study-chapter', studyId, studyChapterId: s.chapters[0].id }
              : { screen: 'bible-study-index', studyId },
            silent: true,
          });
          selectStudy(studyId);
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
        backLabel={navOrigin && navOrigin.screen === 'audio-library-volumes' ? 'The Volumes'
          : navOrigin && navOrigin.screen === 'audio-library-studies' ? 'Studies'
          : 'Listening Library'}
        onOpenText={(track) => _openAudioText(track, 'audio-library-collection')}
        onSearch={goSearch}
        onHistory={goHistory}
        onSettings={goSettings}
        theme={theme} onThemeChange={setTheme}
      />
    ),
    [SONGS_SCREEN]: () => (
      <AudioSongsScreen
        route={decodeSongsRoute(audioColKey)}
        // Functional writes: the hub's `open` replaces its frame and pushes the list in one handler, so the push
        // must build on the replaced stack, not this render's audioColKey (sweep v066).
        onPush={(frame) => setAudioColKey((key) => pushSongsFrame(key, frame))}
        onReplaceTop={(frame) => setAudioColKey((key) => replaceSongsTop(key, frame))}
        onBack={_songsBack}
        rootBackLabel={navOrigin && navOrigin.label ? navOrigin.label
          : !navOrigin || navOrigin.screen === 'home' ? 'Home'
          : navOrigin.screen === 'audio-library' ? 'Listening Library'
          : navOrigin.screen === 'search' ? 'Search'
          : 'Back'}
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
      if (typeof MATTHEW === 'undefined') return _corpusView(window.__matthewCorpus, window.__loadMatthewCorpus, 'Loading Matthew…', _navTo(goStudiesHome, 'Studies'));
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
          bibleAudio={bibleAudioFor(MATTHEW.id)}
          onSelect={(num) => { _pickFromIndex(); selectMatthewCh(num); }}
          onBack={() => { if (fromSearch) { setFromSearch(false); setSurpriseAnchor(null); setScreen('search'); } else if (fromStudies) { setFromStudies(false); goStudiesHome(); } else if (genreId) { setScreen('scripture-genre'); } else { goScripturesHome(); } }}
          // Wave 0: label names the real destination (Search / Studies /
          // the genre / Scriptures — never "Books").
          backLabel={fromSearch ? RESULTS_LABEL : fromStudies ? 'Studies' : _idxGenre ? _idxGenre.label : 'Scriptures'}
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
          _startNewTrail();
          if (slug === 'matthew-study') {
            setFromStudies(true);
            setBookId('matthew'); setChapterNum(null); setScreen('matthew-idx');
          } else {
            selectStudy(slug);
          }
        }}
        onOpenAnswers={() => { _startNewTrail(); resetAnswersLanding(); setScreen('answers-home'); }}
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
          bibleAudio={bibleAudioFor(book.id)}
          onSelect={(num) => { _pickFromIndex(); selectBibleCh(num); }}
          onBack={fromSearch ? () => { setFromSearch(false); setSurpriseAnchor(null); setScreen('search'); } : genreId ? () => setScreen('scripture-genre') : goScripturesHome}
          backLabel={fromSearch ? RESULTS_LABEL : _idxGenre ? _idxGenre.label : 'Scriptures'}
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
        return _corpusView(window.__bibleCorpus, window.__loadBibleCorpus, 'Loading Bible…', _navTo(goScripturesHome, 'Scriptures'));
      }
      // The corpus is in and the bookId did not resolve (v109): a way out, not nothing.
      return _missingBook();
    },
    'bible-ch': () => {
      if (book && chapter) return (
      <BibleChapterView
        book={book} chapter={chapter}
        bibleAudio={bibleAudioFor(book.id)}
        onIndex={_fromSearchIndex ? _backToIndex(goBibleIdx) : book?.chapters.length === 1 ? genreId ? () => setScreen('scripture-genre') : goScripturesHome : goBibleIdx}
        onNavigate={(num) => { setSurpriseAnchor(null); selectBibleCh(num); }}
        onMarkRead={(payload) => markRead(bookId, chapterNum, payload)}
        readTrackKey={getReadKey(bookId, chapterNum)}
        markAsReadEnabled={_readerMarkAsRead}
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
        backHint={_readerBackHint} onTapThroughBack={_navBack ? _navBack.onBack : tapThroughBack} navBack={_navBack}
        onLinkOpen={openLinkSidebar}
        readAlongOn={sharedViewProps.readAlongOn}
        readAlongFollow={sharedViewProps.readAlongFollow}
      />
      );
      // Q8: BOOKS not loaded yet — show loading (or a retry on failure, E1).
      if (bookId && typeof window.__bibleCorpus !== 'undefined' && !window.__bibleCorpus.loaded) {
        return _corpusView(window.__bibleCorpus, window.__loadBibleCorpus, 'Loading Bible…', _navTo(goScripturesHome, 'Scriptures'));
      }
      // The corpus is in and the book resolved, but not this chapter: a way out, not nothing.
      if (book && !chapter) return _missingChapter(book, chapterNum);
      // The corpus is in and the book itself did not resolve (v109).
      return _missingBook();
    },

    // ── IIFE screens — render-time-derived locals (study lookups,
    //    letter shims, chain-aware boundaries) extracted to their own
    //    components in src/ui/screens/. ──
    'matthew-ch': () => {
      // Q8.2: MATTHEW lazy-loaded — show loading (or a retry on failure, E1).
      if (typeof MATTHEW === 'undefined') return _corpusView(window.__matthewCorpus, window.__loadMatthewCorpus, 'Loading Matthew…', _navTo(goStudiesHome, 'Studies'));
      // The Matthew study cards cross-reference VOT letters; resolveVotLetter only
      // resolves once the VOT corpus has loaded and __finishVotInit has rebuilt
      // VOT_LETTER_REGISTRY. On a cold-boot restore STRAIGHT into Matthew, nothing
      // else pulls the VOT corpus, so every letter card renders as an un-tappable
      // gold box with no chevron. Kick the load in the BACKGROUND — idempotent and
      // async-notify-only (same render-phase contract as _corpusView's loadFn), so
      // it never blocks the verses; useLazyBundles re-renders App when the corpus
      // arrives, upgrading the cards to tappable.
      if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus();
      // A stale tab or deep link past the last chapter (s17.1): chrome and a way into Matthew.
      if (!chapter) return _missingChapter(MATTHEW, chapterNum, goMatthewIdx);
      return (
        <MatthewChapterView
          chapter={chapter} chapterNum={chapterNum} mode={mode} showStudy={showStudy}
          fromStudies={fromStudies} settings={settings}
          bibleAudio={bibleAudioFor(MATTHEW.id)}
          readAlongOn={sharedViewProps.readAlongOn}
          readAlongFollow={sharedViewProps.readAlongFollow}
          titleFocusHidden={titleFocusHidden} setTitleFocusHidden={setTitleFocusHidden}
          prevChainEntry={prevChainEntry} nextChainEntry={nextChainEntry}
          goToChainEntryFirst={goToChainEntryFirst} goToChainEntryLast={goToChainEntryLast}
          setSurpriseAnchor={setSurpriseAnchor} setFromStudies={setFromStudies}
          setMode={setMode} setShowStudy={setShowStudy}
          markRead={markRead}
          getReadKey={getReadKey}
          selectMatthewCh={selectMatthewCh}
          goMatthewIdx={_fromSearchIndex ? _backToIndex(goMatthewIdx) : goMatthewIdx} goSearch={goSearch} goSettings={goSettings} goHistory={goHistory}
          goToLetterFromMatthew={goToLetterFromMatthew}
          theme={theme} setTheme={setTheme} surpriseAnchor={surpriseAnchor}
          backHint={_readerBackHint} tapThroughBack={_navBack ? _navBack.onBack : tapThroughBack} navBack={_navBack}
          markAsReadEnabled={_readerMarkAsRead}
          openLinkSidebar={openLinkSidebar}
          onNavigateToLink={navigateToLink}
        />
      );
    },

    'bible-study-index': () => {
      const study = studyId ? getStudyById(studyId) : null;
      if (!study) return _deadStudy();   // W28
      return (
        <BibleStudyIndex
          study={study}
          onSelect={(chId) => { _startNewTrail(); selectStudyChapter(studyId, chId); }}
          onBack={goStudiesHome}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          currentChapter={chapterIndexCurrentChapter(studyReadKey(study.slug), activeReadKey, lastReadChapters)}
          isRead={(chId) => isRead(studyReadKey(study.slug), chId)}
          readCount={(chId) => Number(readItems[getReadKey(studyReadKey(study.slug), chId)]) || 0}
          markAsReadEnabled={settings.markAsRead}
          theme={theme} onThemeChange={setTheme}
          backHint={backHint} onTapThroughBack={tapThroughBack}
        />
      );
    },

    'bible-study-chapter': () => {
      // W28: the view returned null for a study or part that does not resolve.
      const study = studyId ? getStudyById(studyId) : null;
      if (!study) return _deadStudy();
      if (!studyChapterId || !getStudyChapter(study, studyChapterId)) return _deadStudy(true);
      return (
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
      );
    },

    'holy-days-index': () => _wrapVot((
      <ScreenLayout navChildren={_idxNav()}>
        {/* The playlists sit under the title and Play All (2026-09-25), not above the page. */}
        <VolumeLetterIndex volumeTitle="Regarding The Holy Days" eyebrow="The Appointed Times" letters={colLetterArr(COL_BY_KEY.get('holydays')).map((e) => ({ ...e, date: e.date || e.sourceLabel || '' }))} {...colIdxProps('holydays')} headerExtra={<HolyDaysPlaylistHeader />} />
      </ScreenLayout>
    )),

    'holy-days-entry': () => {
      // Every other VOT reading route is a one-liner wrapped in _wrapVot; these
      // two have block bodies and used to return a bare null before the corpus
      // landed, so a cold-boot restore straight into one showed a permanently
      // blank screen that never pulled the corpus. Take the same loading view.
      if (!_votReady) return _wrapVot(null);
      const hdEntry = actL('holydays');
      if (!hdEntry) return _deadLetter('holydays');   // navigation-tabs-4
      const bc = boundaryConfig('holydays', hdEntry);
      if (hdEntry.type === 'wtlb') {
        return <WtlbEntryView {...sharedViewProps} {...colReadNavProps('holydays')} {...bc} entry={hdEntry} partLabel="Regarding The Holy Days" onNavToChapter={_navToChapter} footnotesMode={true} />;
      }
      const letterShim = { ...hdEntry, prevLetter: hdEntry.prevEntry || null, nextLetter: hdEntry.nextEntry || null };
      return <LetterView {...sharedViewProps} {...colReadNavProps('holydays')} {...bc} letter={letterShim} volumeLabel="Regarding The Holy Days" />;
    },

    // ── Answers Only God Can Give ──
    // The landing does not wait for the corpus (f01d): its head and ask paint at once.
    'answers-home': () => {
      if (_answersCorpus && _answersCorpus.error) return _corpusView(_answersCorpus, window.__loadAnswersCorpus, 'Loading…');
      if (!_answersReady) {
        if (typeof window.__loadAnswersCorpus === 'function') window.__loadAnswersCorpus();   // idempotent, async-notify (see _corpusView)
        return _answersLanding(null);
      }
      return _kickVot(_answersLanding(ANSWERS));
    },
    'answers-group': () => _wrapAnswers((entries) => _answersShelf(entries, letterId)),
    'answers-media': () => _wrapAnswers((entries) => (
      <AnswersMedia {..._answersNavProps} entries={entries} site={_answersSite()} fontScale={settings.fontScale} onBack={() => setScreen('answers-home')} />
    )),
    // O5: the reader's highlights and notes in Answers, by topic in the site's order.
    'answers-saved': () => _wrapAnswers((entries) => (
      <AnswersSaved {..._answersNavProps} entries={entries} fontScale={settings.fontScale} onBack={() => setScreen('answers-home')} />
    )),
    // Retired by the AOGCG redesign (answers-retired.js): a place saved on the nine subjects or the
    // old A–Z screen opens where its topics live now (use-saved-state rewrites the record itself).
    'answers-subject': () => _wrapAnswers((entries) => _answersShelf(entries, /** @type {Record<string, string>} */ (ANSWERS_SUBJECT_GROUP)[String(letterId || '')])),
    'answers-az': () => _wrapAnswers((entries) => _answersLanding(entries)),
    'answers-entry': () => (_kickVot(null), _wrapAnswers(() => {
      // A topic also waits for the letters: its attributions open them (the
      // registry that resolves a tap knows only letters that have landed), and
      // a restored tab can reopen straight onto a topic after a reload.
      if (!_votReady) return _wrapVot(null);
      // Its footnotes quote the Bible (lookupVersesFromBooks): start that corpus
      // in the background, as the WTLB index does (idempotent, async-notify).
      if (typeof window.__loadBibleCorpus === 'function') window.__loadBibleCorpus();
      const ansEntry = actL('answers');
      if (!ansEntry) return _deadLetter('answers');   // navigation-tabs-4
      const bc = boundaryConfig('answers', ansEntry);
      const ansRead = colReadNavProps('answers');
      // A topic read to its end is the reading path's new place (the landing's Continue).
      const onMarkRead = (payload) => { ansRead.onMarkRead(payload); if (_answersPathOn) writeAnswersPath(letterId); };
      // One cite style on a topic: inline (Book X:Y) only, no footnote bubbles (U6).
      return <WtlbEntryView {...sharedViewProps} {...ansRead} onMarkRead={onMarkRead} {...bc} entry={ansEntry} partLabel="Answers" onNavToChapter={_navToChapter}
        footnotesMode={false} fontScale={settings.fontScale} answers={_answersTopicNav(ANSWERS, ansEntry.title, ansRead.onNavigate)} />;
    })),

    'hm-letter': () => {
      if (!_votReady) return _wrapVot(null); // see 'holy-days-entry'
      const hmEntry = actL('hm');
      if (!hmEntry) return _deadLetter('hm');   // navigation-tabs-4
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

    // The Scripture Web. Both corpora are kicked in the background on the same render-phase contract as _kickVot:
    // the Bible corpus backs the verse previews in the detail sheet, the VOT
    // corpus backs the personal web's top rail. Neither blocks the drawing.
    'scripture-web': () => {
      if (typeof window.__loadBibleCorpus === 'function') window.__loadBibleCorpus();
      if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus();
      return (
        <ScriptureWebScreen
          navigateToLink={(endpoint, meta) => {
            if (!endpoint) return;
            navigateToLink(endpoint, meta || { sourceLetterTitle: 'The Scripture Web' });
          }}
          onBack={() => navOrigin ? goNavOrigin() : setScreen('library')}
          settings={settings}
          updateSetting={updateSetting}
          start={(window.navHandoff && window.navHandoff.peek('webStart')) || undefined}
        />
      );
    },
  };
}

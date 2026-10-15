/* ═══════════════════════════════════════════════════════════════════════
   Cluster D entry — screens + sheets + components + utils + late stores + App
   ═══════════════════════════════════════════════════════════════════════
   This file is the esbuild entry point for dist/bundle-d.js. It imports
   every public symbol from the cluster's 82 modules and re-exposes them
   on `window` so the rest of the app (the boot script at the bottom of
   index.html — ReactDOM.createRoot + render — plus the lexical-mirror
   script that runs just before it, plus cross-cluster consumers in
   A/B/C) can continue to call them by bare name.

   Cluster D contents:
   - 21 screens (LetterView, WtlbEntryView, BibleChapterView, …)
   - 33 components (Segments, FootnoteSheet, NavButtons, …)
   - 13 sheets (NoteSheet, SelectionToolbar, LinkPicker, …)
   - 11 utility modules (hl-keys, dates, garden, nav-index, …)
   - thumb-store + translations (late stores/data that load after the
     stores cluster's stores — kept here historically because they're
     called by App code only, never by the modules in B/C)
   - App — the composition root (Q2.7-1). The function the boot script
     mounts via ReactDOM.createRoot. Lives at src/app.js, alongside
     ui/, hooks/, stores/, data/, etc.

   Like Clusters B and C, this bundle is emitted as an esbuild IIFE — it
   ships as a classic <script src="dist/bundle-d.js"> tag, NOT a
   <script type="module">. The IIFE's free-variable references to symbols
   from earlier clusters (COLLECTIONS, _allBooks, AnnotationStore, etc.)
   resolve at call time from window — populated by the Object.assign'd
   exports of bundles A/B/C, which load earlier in the document.

   NO TRUE EVAL-TIME INTRA-D DEPENDENCIES exist. Every cross-D reference
   in this cluster happens inside function bodies (React component
   renderers, event handlers, utility helpers) — never at module top
   level. So this entry file uses only explicit named imports — no
   workaround imports were needed for cycles or eager-init ordering.

   Module-private state that USED to live in inline scripts in index.html
   (THUMB_DB, _thumbDbPromise, _translationPromises, _translationLoaded,
   _bibleStudiesPromise, GARDEN_TIERS, GARDEN_DEFAULT_TIER, GARDEN_TOTAL,
   gardenImageCache, EXPAND_THRESHOLD, MIN_HIDDEN_WORDS, GARDEN_PRELOAD_AHEAD,
   GARDEN_CRAWL_DELAY) was moved into its owning module as part of this
   conversion — esbuild ES modules are strict-mode, so assignments like
   `_thumbDbPromise = new Promise(…)` need an explicit module-scope
   binding, not a free-variable. The index.html declarations remain in
   place for now as harmless dupes; they can be removed in a follow-up
   once G.2.3 is verified.
   ═══════════════════════════════════════════════════════════════════════ */

// ── Utilities ───────────────────────────────────────────────────────────
import { bibleHlKey, letterHlKey, wtlbHlKey, studyHlKey } from '../utils/hl-keys.js';
import { relativeDate, timeAgo } from '../utils/dates.js';
// Shared with the Personal Study screens, which resolve them as free globals at
// call time (a habit from when they were lazy bundle-g, until lz1):
// reduced-motion's scroll law (every
// reading-path screen imports it here) and the reading-minute chip
// (HistoryEntryCard / VolumeLetterIndex / ChapterIndex render it here).
import { scrollBehavior } from '../utils/reduced-motion.js';
import { readingChipWpm, readingMinChip } from './components/ReadingMinChip.jsx';
import { onIdle } from '../utils/on-idle.js';
import { normalizeExcerptDisplay } from '../utils/excerpt-display.js';
import {
  GARDEN_TOTAL, GARDEN_TIERS, GARDEN_DEFAULT_TIER, gardenImageCache, gardenCrawled, GARDEN_CACHE_MAX,
  getGardenTier, gardenUrl, gardenCacheKey, gardenPreload, gardenIsCached, gardenTierLimits, gardenClearCache,
} from '../utils/garden.js';
import { describeTab, tabContentKey, tabHasProgressBar, scrollKeyForTab } from '../utils/tabs.js';
import { createPressDrag } from '../utils/press-drag.js';
import {
  buildNavIndex, searchNavIndex, navItemPreview, navItemToEndpoint, buildSourceEndpoint,
  contentDocToNavItem, buildNavTree,
} from '../utils/nav-index.js';
import { _bookTitle, _verseRangeLabel, noteSourceLabel, noteSourceNav, noteSourceSegments } from '../utils/note-source.js';
import {
  READ_VERSION_ID, progressCorporaReady, buildProgressGroups,
  countReadFor, groupBooks, tallyGroup, groupWordStats, bookItemsFor,
  annotationSourceForKey, mostAnnotatedSources,
} from '../utils/progress-stats.js';
import { bookCategory } from '../utils/book-category.js';
import {
  firstVerseOfRef, parseRefRanges, lastVerseOfFirstRange, echoVersesForRef,
  getNotesForVerse, getEchoesForVerse, parseRefRange, splitIntoVerses,
} from '../utils/scripture-parse.js';
import { normalizeForHighlight, splitWithHighlight, highlightExcerptInDom } from '../utils/highlight.jsx';
import { renderTextWithScripRefs } from '../utils/render-text.jsx';
import { segmentRenderText, segmentsDomText } from '../utils/segment-dom-text.js';
import { formatBDomText, formatBOffsetMap } from '../utils/format-b-dom-text.js';
import { srchGroupKey, srchSortCanonical, SRCH_CANONICAL_BOOK_IDS, SRCH_CANONICAL_BOOK_INDEX } from '../utils/search.js';
import { buildExportPayload, applyImportPayload, buildV3Manifest, applyV3, formatImportSpaceWarning, withBackupLock } from '../utils/backup.js';
import { countTextWords, countItemWords, readingMinutes } from '../utils/word-count.js';
import { writeContainer, readContainer, isContainerMagic } from '../utils/backup-container.js';
import { runV3AndroidExport, classifyV3ImportBegin, v3AndroidImportEntries } from '../utils/backup-android.js';
import { summarizeBackupManifest, formatVerifyReport } from '../utils/backup-verify.js';
import { AudioPlayer, trackUrl as audioTrackUrl } from '../utils/audio-player.js';
// Downloads to the phone (listening item 8): ONE store, here beside the player that consults it offline; the
// Listening Library's rows and "On this phone" read it as the OfflineAudio global.
import { OfflineAudio } from '../utils/offline-audio.js';
// Songs of the Letters (2026-09-24): ONE catalog store, here beside the player that queues from it; the lazy Songs
// screens read it as the SongCatalog global, never by import (a second bundled copy would be a second catalog).
import { SongCatalog } from '../utils/song-catalog.js';
// The shared song pieces (cover, round play, clock, icons, the choice sheet): the bar and the desk draw a song with them,
// and the lazy Songs screens read them as globals. The route helpers keep the Songs stack in the tab's audioColKey.
import {
  songClock, songCountLabel, currentSongId, playerIsActive, songLetterOf, familyIsPlaying, songFamilyTitle,
  SongCover, SongPlayButton, SongListRow, ShuffleIcon, RepeatIcon, NextIcon, PrevIcon, RecentIcon, ChevronRightIcon, ChoiceSheet,
  loadSongLyrics, useSongLyrics, lyricLineAt, findSongFamilies, songLyricsFoot,
} from './components/SongParts.jsx';
import { SONGS_SCREEN, decodeSongsRoute, encodeSongsRoute, pushSongsFrame, popSongsFrame, replaceSongsTop } from '../utils/songs-route.js';
// Keep on this phone (K1): ONE keep store beside the player that plays kept songs from it; the lazy Songs screens and
// Settings read it and its controls as globals.
import { SongKeep, formatSongBytes } from '../utils/song-keep.js';
// Is the network there (2026-10-05): ONE store beside the player; the lazy screens read the NetStatus global.
import { NetStatus } from '../utils/net-status.js';
import { SongKeepCard, SongKeepAction, useSongKeep, useSongsOnline, KeepIcon, KeptIcon } from './components/SongKeepParts.jsx';
/* The Listening Library screens went lazy (bundle-h, landing 24, until lz1) while all of
   this stayed here, because AudioPlayerBar and AudioManagerSheet are mounted in
   the always-present shell and play on every screen. The library reads these
   across the bundle boundary: a second bundled copy of audio-player.js would be
   TWO players, and a second AudioShelf two module states of one row. */
import { BIBLE_AUDIO_EDITIONS, audioReaderLabel, bibleAudioOffered } from '../utils/audio-track.js';
import { COVERAGE_NONE, COVERAGE_READ_ALONG, bibleEditionCoverage, studyCoverage, studyCoverageDetail } from '../utils/audio-coverage.js';
import { AudioSeekSlider } from './components/AudioSeekSlider.jsx';
// v2 (rv1 1b) paints read-along on its own letter body through main's component: one engine, one wash.
import { ReadAlongHighlight, paintReadAlongAt, clearReadAlong } from './components/ReadAlongHighlight.jsx';
import { CoverageBadge } from './components/CoverageBadge.jsx';
import {
  ArrowIcon, AudioShelfRow, ChevronIcon, CloseIcon, PauseIcon, PlayIcon, SearchIcon,
  StarIcon, TextIcon, audioLibraryStore, audioPositionsStore, hasTextDestination,
  relativePlayedAt, remainingLabel, renditionRemainingLabel, trackMeta, trackName,
  trackSearchText, useAudioPositions,
} from './components/AudioShelf.jsx';
// Read-along timing loaders (c41). Published under the window names the old
// index.html block used, so smoke/e2e keep a handle and any classic-script
// caller still works; the component imports the module directly.
import {
  loadAudioSync as __loadAudioSync, audioSyncStore as __audioSyncStore,
  loadBibleSync as __loadBibleSync, bibleSyncStore as __bibleSyncStore,
} from '../utils/sync-loaders.js';

// ── Late stores + data ──────────────────────────────────────────────────
import {
  THUMB_DB, THUMB_STORE, _thumbDbPromise,
  openThumbDB, idbPut, idbDelete, idbReadAll, idbAllKeys,
} from '../stores/thumb-store.js';
import {
  _translationPromises, _translationLoaded, _bibleStudiesPromise,
  loadTranslation, loadBibleStudies, translateVerse, releaseTranslationsExcept,
  translationLabel, translationName,
} from '../data/translations.js';

// ── Components ──────────────────────────────────────────────────────────
import { Segments } from './components/Segments.jsx';
import { ProphecyCard } from './components/ProphecyCard.jsx';
import { ProphecyGroup } from './components/ProphecyGroup.jsx';
import { VerseWithNumbers, _fnTextRedundantWithLink } from './components/VerseWithNumbers.jsx';
import { InAppLinkButton } from './components/InAppLinkButton.jsx';
import { GoToRefButton } from './components/GoToRefButton.jsx';
import { FootnoteSheet } from './components/FootnoteSheet.jsx';
import { SheetHandle } from './components/SheetHandle.jsx';
import { ScriptureVerseText } from './components/ScriptureVerseText.jsx';
import { ScriptureSheet } from './components/ScriptureSheet.jsx';
import { EXPAND_THRESHOLD, MIN_HIDDEN_WORDS, ExpandableVerse } from './components/ExpandableVerse.jsx';
import { ThemeBtn } from './components/ThemeBtn.jsx';
import { ScreenLayout } from './components/ScreenLayout.jsx';
import { ModeToggle, renderCommentaryCite } from './components/ModeToggle.jsx';
import { InlineNotes } from './components/InlineNotes.jsx';
import { InlineEcho } from './components/InlineEcho.jsx';
import { StudyPanels } from './components/StudyPanels.jsx';
import { ChapterBookmarkBtn } from './components/ChapterBookmarkBtn.jsx';
import { NavButtons } from './components/NavButtons.jsx';
import { ProphecyExpandToggle } from './components/ProphecyExpandToggle.jsx';
import { HomeBtn } from './components/HomeBtn.jsx';
import { TabsNavBtn } from './components/TabsNavBtn.jsx';
import { ReadingDotContext, ResumeReadingNavBtn } from './components/ResumeReadingNavBtn.jsx';
import { AutoScrollContext, AutoScrollControl } from './components/AutoScrollControl.jsx';
import { ReadingChromeProvider, clampEndDwell } from './components/ReadingChromeProvider.jsx';
import { createAutoScroll, useAutoScroll, clampLpm, measureLineHeight, computeEndTarget } from '../hooks/use-autoscroll.js';
import { commitReadingNav } from '../hooks/use-pager-gesture.js';
import { LibraryNav } from './components/LibraryNav.jsx';
import { FootnoteListSection } from './components/FootnoteListSection.jsx';
import { StickyChapterNav } from './components/StickyChapterNav.jsx';
import { ClearProgressRow } from './components/ClearProgressRow.jsx';
import { ConfirmStrip } from './components/ConfirmStrip.jsx';
import { SrchCard } from './components/SrchCard.jsx';
import { SrchSnippet } from './components/SrchSnippet.jsx';
import { SrchGroup } from './components/SrchGroup.jsx';
import { SettingsRow } from './components/SettingsRow.jsx';
import { SelectField } from './components/SelectField.jsx';
import { FontPickerRow } from './components/FontPickerRow.jsx';
import { VolumeLetterIndex } from './components/VolumeLetterIndex.jsx';
import { HistoryEntryCard } from './components/HistoryEntryCard.jsx';
import { NoteRow } from './components/NoteRow.jsx';
import { LinkCard } from './components/LinkCard.jsx';
import { LinkIcon } from './components/LinkIcon.jsx';
import { BookmarkIcon } from './components/BookmarkIcon.jsx';
import { HolyDaysPlaylistHeader } from './components/HolyDaysPlaylistHeader.jsx';
import { AudioPlayerBar } from './components/AudioPlayerBar.jsx';
import { AudioManagerSheet } from './components/AudioManagerSheet.jsx';
import { AudioPlayButton, AudioSectionChips } from './components/AudioPlayButton.jsx';
import { StorageHealthBanner, useStorageHealth } from './components/StorageHealthBanner.jsx';
import { Safari7DayModal, IosPwaWelcomeCard } from './components/SafariFlows.jsx';
import { AppShellOverlays } from './components/AppShellOverlays.jsx';
import { TourPrompt } from './components/TourPrompt.jsx';
import { AppShellSheets } from './components/AppShellSheets.jsx';
import { AnnotationDomSync } from './components/AnnotationDomSync.jsx';
import { buildScreenRoutes } from './screen-routes.jsx';

// ── Screens ─────────────────────────────────────────────────────────────
import { LetterView } from './screens/LetterView.jsx';
import { WtlbEntryView } from './screens/WtlbEntryView.jsx';
import { BibleChapterView } from './screens/BibleChapterView.jsx';
import { ChapterView } from './screens/ChapterView.jsx';
import { LibraryScreen } from './screens/LibraryScreen.jsx';
import { VolumesHome } from './screens/VolumesHome.jsx';

import { AboutScreen } from './screens/AboutScreen.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { ChapterIndex } from './screens/ChapterIndex.jsx';
import { ScriptureGenre } from './screens/ScriptureGenre.jsx';
import { ScripturesHome } from './screens/ScripturesHome.jsx';
// What the always-present app shell mounts (BookmarksScreen is imported below
// with the other screens you go to).
import { _bookmarkSourceLabel, _bookmarkSourceEndpoint } from '../utils/bookmark-source.js';
import { BookmarkPopover } from './sheets/BookmarkPopover.jsx';

// ── Sheets ──────────────────────────────────────────────────────────────
import { TabsOverview } from './sheets/TabsOverview.jsx';
import { TabActionSheet } from './sheets/TabActionSheet.jsx';
import { MultiNotePopover } from './sheets/MultiNotePopover.jsx';
import { NotebookPickerSheet } from './sheets/NotebookPickerSheet.jsx';
import { NoteSheet } from './sheets/NoteSheet.jsx';
import { LetterExcerptPickerScreen } from './sheets/LetterExcerptPickerScreen.jsx';
import { VersePickerScreen } from './sheets/VersePickerScreen.jsx';
import { LinkPicker } from './sheets/LinkPicker.jsx';
import { LinkSidebar } from './sheets/LinkSidebar.jsx';
import { SelectionToolbar } from './sheets/SelectionToolbar.jsx';
import { AnnotationActionChip } from './sheets/AnnotationActionChip.jsx';
import { BookmarkCreateSheet } from './sheets/BookmarkCreateSheet.jsx';

// ── The screens you go TO (were bundles e-h until lz1, 2026-10-13) ─────
// Settings, Search, Garden, the tour overlay, the Scripture Web, the personal
// study screens, the journal, the Studies and the Listening Library were
// code-split into four lazy bundles from 2026-07 to 2026-10. That bought
// about 0.06 s per Android cold start and cost a shipped "Loading..." bug, two
// mixed-build races and an 8 s stylesheet hang
// (D:/AgentBackbone/reports/lazy-loading-2026-10-13/REPORT.md), so the code
// came back here. DATA still loads on demand: the corpora, studies,
// translations, read-along timings and the meaning-search model.
// The search tables (stop words, synonyms, book abbreviations, named passages,
// slash-commands): a classic IIFE that ends in `window.VotSearchData = {…}`;
// every consumer reads it off window at call time.
import '../../search-data.js';
import { SettingsScreen } from './screens/SettingsScreen.jsx';
import { SearchScreen } from './screens/SearchScreen.jsx';
import { GARDEN_PRELOAD_AHEAD, GARDEN_CRAWL_DELAY, GardenView } from './screens/GardenView.jsx';
import { TourOverlay } from './components/TourOverlay.jsx';
// The MiniSearch engine, THE app's search engine (Classic/FlexSearch retired 2026-07-02).
import { VotSearchMini } from '../search/engine.js';
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from '../search/recent-searches.js';
import { ScriptureWebScreen, ensureScriptureWebData } from './screens/ScriptureWebScreen.jsx';
import { MyProgressScreen } from './screens/MyProgressScreen.jsx';
import { BookmarkRow, BookmarkRowActionSheet, BookmarksScreen } from './screens/BookmarksScreen.jsx';
import { ReadingPlansScreen } from './screens/ReadingPlansScreen.jsx';
import { HistoryScreen } from './screens/HistoryScreen.jsx';
import { NotesIndexScreen } from './screens/NotesIndexScreen.jsx';
import {
  _linkEndpointCategory, _endpointResolves, _epSearchText,
  LinkRow, LinkRowActionSheet, LinksScreen,
} from './screens/LinksScreen.jsx';
import {
  _HL_COLOR_ORDER, _HL_COLOR_HEX, _hlColorHex, _hlColorIndex,
  _collectMarks, HighlightRow, HighlightsScreen,
} from './screens/HighlightsScreen.jsx';
import { composeNotesExport, notesExportFilename, shareNotesExport } from '../utils/notes-export.js';
// The wildcard imports carry each journal screen's private helpers (JournalCardMenu,
// jrnRenderInline, JournalBlockView, the image and audio blocks, jrnPinIcon), which the
// other two screens reach by bare name.
import * as JournalHub from './screens/JournalHubScreen.jsx';
import * as JournalViewer from './screens/JournalViewerScreen.jsx';
import * as JournalEditor from './screens/JournalEditorScreen.jsx';
import { JournalInsertSheet } from './sheets/JournalInsertSheet.jsx';
import { JournalRecordingSheet } from './sheets/JournalRecordingSheet.jsx';
import { StudiesHome } from './screens/StudiesHome.jsx';
import { BibleStudyIndex } from './screens/BibleStudyIndex.jsx';
import { BibleStudyChapterView } from './screens/BibleStudyChapterView.jsx';
import { MatthewChapterView } from './screens/MatthewChapterView.jsx';
import { AudioLibraryScreen } from './screens/AudioLibraryScreen.jsx';
import { AudioVolumesScreen } from './screens/AudioVolumesScreen.jsx';
import { AudioCollectionScreen } from './screens/AudioCollectionScreen.jsx';
import { AudioSavedScreen } from './screens/AudioSavedScreen.jsx';
import { AudioStudiesScreen } from './screens/AudioStudiesScreen.jsx';
import { AudioOfflineScreen } from './screens/AudioOfflineScreen.jsx';
import { AudioSongsScreen, songsFrameTitle } from './screens/AudioSongsScreen.jsx';

// ── App — the composition root ──────────────────────────────────────────
// Extracted from index.html in Q2.7-1 as a verbatim move (still uses
// React.createElement). JSX conversion lands in Q2.7-2. Riding in
// bundle-d because that's where its dominant consumers (screens/sheets/
// components) already live — adds no new bundle, no new script tag.
import { App } from '../app.jsx';

// ── Expose every public symbol on window ────────────────────────────────
// Bridges the ES-module Cluster D to its classic-script consumers (the
// inline App() block in index.html + the lexical-mirror script before
// ReactDOM.render). When all clusters AND App() become modules in a
// later phase, this Object.assign goes away.
Object.assign(window, {
  // Utilities
  bibleHlKey, letterHlKey, wtlbHlKey, studyHlKey,
  relativeDate, timeAgo,
  scrollBehavior, readingChipWpm, readingMinChip, onIdle, normalizeExcerptDisplay,
  GARDEN_TOTAL, GARDEN_TIERS, GARDEN_DEFAULT_TIER, gardenImageCache, gardenCrawled, GARDEN_CACHE_MAX,
  getGardenTier, gardenUrl, gardenCacheKey, gardenPreload, gardenIsCached, gardenTierLimits, gardenClearCache,
  describeTab, tabContentKey, tabHasProgressBar, scrollKeyForTab,
  createPressDrag,
  buildNavIndex, searchNavIndex, navItemPreview, navItemToEndpoint, buildSourceEndpoint,
  contentDocToNavItem, buildNavTree,
  _bookTitle, _verseRangeLabel, noteSourceLabel, noteSourceNav, noteSourceSegments,
  READ_VERSION_ID, progressCorporaReady, buildProgressGroups,
  countReadFor, groupBooks, tallyGroup, groupWordStats, bookItemsFor,
  annotationSourceForKey, mostAnnotatedSources,
  bookCategory,
  firstVerseOfRef, parseRefRanges, lastVerseOfFirstRange, echoVersesForRef,
  getNotesForVerse, getEchoesForVerse, parseRefRange, splitIntoVerses,
  normalizeForHighlight, splitWithHighlight, highlightExcerptInDom,
  renderTextWithScripRefs,
  segmentRenderText, segmentsDomText,
  formatBDomText, formatBOffsetMap,
  srchGroupKey, srchSortCanonical,
  SRCH_CANONICAL_BOOK_IDS, SRCH_CANONICAL_BOOK_INDEX,
  buildExportPayload, applyImportPayload, buildV3Manifest, applyV3, formatImportSpaceWarning, withBackupLock,
  countTextWords, countItemWords, readingMinutes,
  writeContainer, readContainer, isContainerMagic,
  runV3AndroidExport, classifyV3ImportBegin, v3AndroidImportEntries,
  summarizeBackupManifest, formatVerifyReport,
  AudioPlayer, audioTrackUrl, OfflineAudio, SongCatalog,
  songClock, songCountLabel, currentSongId, playerIsActive, songLetterOf, familyIsPlaying, songFamilyTitle,
  SongCover, SongPlayButton, SongListRow, ShuffleIcon, RepeatIcon, NextIcon, PrevIcon, RecentIcon, ChevronRightIcon, ChoiceSheet,
  loadSongLyrics, useSongLyrics, lyricLineAt, findSongFamilies, songLyricsFoot,
  SONGS_SCREEN, decodeSongsRoute, encodeSongsRoute, pushSongsFrame, popSongsFrame, replaceSongsTop,
  SongKeep, formatSongBytes, NetStatus, SongKeepCard, SongKeepAction, useSongKeep, useSongsOnline, KeepIcon, KeptIcon,
  // …and the shelf parts + audio tables the Listening Library reads as free globals.
  BIBLE_AUDIO_EDITIONS, audioReaderLabel, bibleAudioOffered,
  COVERAGE_NONE, COVERAGE_READ_ALONG, bibleEditionCoverage, AudioSeekSlider, CoverageBadge,
  // …and StudiesHome (Cluster G) reads the study coverage pair.
  studyCoverage, studyCoverageDetail,
  ArrowIcon, AudioShelfRow, ChevronIcon, CloseIcon, PauseIcon, PlayIcon, SearchIcon,
  StarIcon, TextIcon, audioLibraryStore, audioPositionsStore, hasTextDestination,
  relativePlayedAt, remainingLabel, renditionRemainingLabel, trackMeta, trackName,
  trackSearchText, useAudioPositions,
  __loadAudioSync, __audioSyncStore, __loadBibleSync, __bibleSyncStore,
  // Late stores + data
  THUMB_DB, THUMB_STORE, _thumbDbPromise,
  openThumbDB, idbPut, idbDelete, idbReadAll, idbAllKeys,
  _translationPromises, _translationLoaded, _bibleStudiesPromise,
  loadTranslation, loadBibleStudies, translateVerse, releaseTranslationsExcept,
  translationLabel, translationName,
  // Components
  Segments, ProphecyCard, ProphecyGroup,
  VerseWithNumbers, _fnTextRedundantWithLink,
  InAppLinkButton, GoToRefButton, FootnoteSheet, SheetHandle, ScriptureVerseText, ScriptureSheet,
  EXPAND_THRESHOLD, MIN_HIDDEN_WORDS, ExpandableVerse,
  ThemeBtn, ScreenLayout,
  ModeToggle, renderCommentaryCite,
  InlineNotes, InlineEcho, StudyPanels,
  ChapterBookmarkBtn, NavButtons, ProphecyExpandToggle,
  HomeBtn, TabsNavBtn, ReadingDotContext, ResumeReadingNavBtn, LibraryNav,
  AutoScrollContext, AutoScrollControl, ReadingChromeProvider, clampEndDwell,
  createAutoScroll, useAutoScroll, clampLpm, measureLineHeight, computeEndTarget,
  commitReadingNav,
  FootnoteListSection, StickyChapterNav, ClearProgressRow, ConfirmStrip,
  SrchCard, SrchSnippet, SrchGroup,
  SettingsRow, SelectField, FontPickerRow, VolumeLetterIndex, HistoryEntryCard,
  NoteRow, LinkCard, LinkIcon, BookmarkIcon, HolyDaysPlaylistHeader,
  AudioPlayerBar, AudioManagerSheet, AudioPlayButton, AudioSectionChips,
  ReadAlongHighlight, paintReadAlongAt, clearReadAlong,
  StorageHealthBanner, useStorageHealth, Safari7DayModal, IosPwaWelcomeCard,
  AppShellOverlays, AppShellSheets, AnnotationDomSync, TourPrompt,
  buildScreenRoutes,
  // Screens
  LetterView, WtlbEntryView, BibleChapterView, ChapterView,
  LibraryScreen,
  VolumesHome, AboutScreen,
  HomeScreen,
  ChapterIndex,
  ScriptureGenre, ScripturesHome,
  _bookmarkSourceLabel, _bookmarkSourceEndpoint, BookmarkPopover,
  // Sheets
  TabsOverview, TabActionSheet, MultiNotePopover,
  NotebookPickerSheet, NoteSheet,
  LetterExcerptPickerScreen, VersePickerScreen,
  LinkPicker, LinkSidebar,
  SelectionToolbar, AnnotationActionChip,
  BookmarkCreateSheet,
  // The screens you go TO (bundles e-h until lz1)
  SettingsScreen, SearchScreen,
  GARDEN_PRELOAD_AHEAD, GARDEN_CRAWL_DELAY, GardenView,
  TourOverlay,
  VotSearchMini,
  getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches,
  ScriptureWebScreen, ensureScriptureWebData,
  MyProgressScreen,
  BookmarkRow, BookmarkRowActionSheet, BookmarksScreen,
  HistoryScreen,
  ReadingPlansScreen,
  NotesIndexScreen,
  _linkEndpointCategory, _endpointResolves, _epSearchText,
  LinkRow, LinkRowActionSheet, LinksScreen,
  _HL_COLOR_ORDER, _HL_COLOR_HEX, _hlColorHex, _hlColorIndex,
  _collectMarks, HighlightRow, HighlightsScreen,
  composeNotesExport, notesExportFilename, shareNotesExport,
  JournalInsertSheet, JournalRecordingSheet,
  StudiesHome, BibleStudyIndex, BibleStudyChapterView, MatthewChapterView,
  AudioLibraryScreen, AudioVolumesScreen, AudioCollectionScreen, AudioSavedScreen, AudioStudiesScreen, AudioOfflineScreen, AudioSongsScreen,
  // W-03: the back pill over a letter opened from a Songs screen names that screen's top frame (screen-routes).
  songsFrameTitle,
  // App (composition root)
  App,
});

// The three journal screens, spread whole: the wildcard keeps every export,
// including the internal helpers the other two screens reach by bare name.
Object.assign(window, JournalHub, JournalViewer, JournalEditor);

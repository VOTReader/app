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
import {
  GARDEN_TOTAL, GARDEN_TIERS, GARDEN_DEFAULT_TIER, gardenImageCache,
  getGardenTier, gardenUrl, gardenCacheKey, gardenPreload, gardenIsCached,
} from '../utils/garden.js';
import { describeTab, tabContentKey, tabHasProgressBar, scrollKeyForTab } from '../utils/tabs.js';
import {
  buildNavIndex, searchNavIndex, navItemPreview, navItemToEndpoint, buildSourceEndpoint,
} from '../utils/nav-index.js';
import { _bookTitle, _verseRangeLabel, noteSourceLabel, noteSourceNav } from '../utils/note-source.js';
import { bookCategory } from '../utils/book-category.js';
import {
  firstVerseOfRef, parseRefRanges, lastVerseOfFirstRange, echoVersesForRef,
  getNotesForVerse, getEchoesForVerse, parseRefRange, splitIntoVerses,
} from '../utils/scripture-parse.js';
import { normalizeForHighlight, splitWithHighlight, highlightExcerptInDom } from '../utils/highlight.jsx';
import { renderTextWithScripRefs } from '../utils/render-text.jsx';
import { srchGroupKey } from '../utils/search.js';

// ── Late stores + data ──────────────────────────────────────────────────
import {
  THUMB_DB, THUMB_STORE, _thumbDbPromise,
  openThumbDB, idbPut, idbDelete, idbReadAll,
} from '../stores/thumb-store.js';
import {
  _translationPromises, _translationLoaded, _bibleStudiesPromise,
  loadTranslation, loadBibleStudies, translateVerse,
} from '../data/translations.js';

// ── Components ──────────────────────────────────────────────────────────
import { Segments } from './components/Segments.jsx';
import { ProphecyCard } from './components/ProphecyCard.jsx';
import { ProphecyGroup } from './components/ProphecyGroup.jsx';
import { VerseWithNumbers, _fnTextRedundantWithLink } from './components/VerseWithNumbers.jsx';
import { InAppLinkButton } from './components/InAppLinkButton.jsx';
import { FootnoteSheet } from './components/FootnoteSheet.jsx';
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
import { VolumeLetterIndex } from './components/VolumeLetterIndex.jsx';
import { HistoryEntryCard } from './components/HistoryEntryCard.jsx';
import { NoteRow } from './components/NoteRow.jsx';
import { LinkCard } from './components/LinkCard.jsx';
import { LinkIcon } from './components/LinkIcon.jsx';
import { BookmarkIcon } from './components/BookmarkIcon.jsx';
import { HolyDaysPlaylistHeader } from './components/HolyDaysPlaylistHeader.jsx';
import { AppShellOverlays } from './components/AppShellOverlays.jsx';
import { AppShellSheets } from './components/AppShellSheets.jsx';
import { buildScreenRoutes } from './screen-routes.jsx';

// ── Screens ─────────────────────────────────────────────────────────────
import { LetterView } from './screens/LetterView.jsx';
import { WtlbEntryView } from './screens/WtlbEntryView.jsx';
import { BibleChapterView } from './screens/BibleChapterView.jsx';
import { ChapterView } from './screens/ChapterView.jsx';
import { LibraryScreen } from './screens/LibraryScreen.jsx';
import { NotesIndexScreen } from './screens/NotesIndexScreen.jsx';
import { VolumesHome } from './screens/VolumesHome.jsx';
import { StudiesHome } from './screens/StudiesHome.jsx';
import { HistoryScreen } from './screens/HistoryScreen.jsx';
import { AboutScreen } from './screens/AboutScreen.jsx';
import { SettingsScreen } from './screens/SettingsScreen.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { SearchScreen } from './screens/SearchScreen.jsx';
import { BibleStudyIndex } from './screens/BibleStudyIndex.jsx';
import { BibleStudyChapterView } from './screens/BibleStudyChapterView.jsx';
import { MatthewChapterView } from './screens/MatthewChapterView.jsx';
import { ChapterIndex } from './screens/ChapterIndex.jsx';
import {
  GARDEN_PRELOAD_AHEAD, GARDEN_CRAWL_DELAY, GardenView,
} from './screens/GardenView.jsx';
import { ScriptureGenre } from './screens/ScriptureGenre.jsx';
import { ScripturesHome } from './screens/ScripturesHome.jsx';
import {
  _linkEndpointCategory, _endpointResolves, _epSearchText,
  LinkRow, LinkRowActionSheet, LinksScreen,
} from './screens/LinksScreen.jsx';
import {
  _bookmarkSourceLabel, _bookmarkSourceEndpoint,
  BookmarkRow, BookmarkRowActionSheet, BookmarkPopover, BookmarksScreen,
} from './screens/BookmarksScreen.jsx';
import {
  _HL_COLOR_ORDER, _HL_COLOR_HEX, _hlColorHex, _hlColorIndex,
  _collectMarks, HighlightRow, HighlightsScreen,
} from './screens/HighlightsScreen.jsx';

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
  GARDEN_TOTAL, GARDEN_TIERS, GARDEN_DEFAULT_TIER, gardenImageCache,
  getGardenTier, gardenUrl, gardenCacheKey, gardenPreload, gardenIsCached,
  describeTab, tabContentKey, tabHasProgressBar, scrollKeyForTab,
  buildNavIndex, searchNavIndex, navItemPreview, navItemToEndpoint, buildSourceEndpoint,
  _bookTitle, _verseRangeLabel, noteSourceLabel, noteSourceNav,
  bookCategory,
  firstVerseOfRef, parseRefRanges, lastVerseOfFirstRange, echoVersesForRef,
  getNotesForVerse, getEchoesForVerse, parseRefRange, splitIntoVerses,
  normalizeForHighlight, splitWithHighlight, highlightExcerptInDom,
  renderTextWithScripRefs,
  srchGroupKey,
  // Late stores + data
  THUMB_DB, THUMB_STORE, _thumbDbPromise,
  openThumbDB, idbPut, idbDelete, idbReadAll,
  _translationPromises, _translationLoaded, _bibleStudiesPromise,
  loadTranslation, loadBibleStudies, translateVerse,
  // Components
  Segments, ProphecyCard, ProphecyGroup,
  VerseWithNumbers, _fnTextRedundantWithLink,
  InAppLinkButton, FootnoteSheet, ScriptureVerseText, ScriptureSheet,
  EXPAND_THRESHOLD, MIN_HIDDEN_WORDS, ExpandableVerse,
  ThemeBtn, ScreenLayout,
  ModeToggle, renderCommentaryCite,
  InlineNotes, InlineEcho, StudyPanels,
  ChapterBookmarkBtn, NavButtons, ProphecyExpandToggle,
  HomeBtn, TabsNavBtn, LibraryNav,
  FootnoteListSection, StickyChapterNav, ClearProgressRow, ConfirmStrip,
  SrchCard, SrchSnippet, SrchGroup,
  SettingsRow, SelectField, VolumeLetterIndex, HistoryEntryCard,
  NoteRow, LinkCard, LinkIcon, BookmarkIcon, HolyDaysPlaylistHeader, AppShellOverlays, AppShellSheets,
  buildScreenRoutes,
  // Screens
  LetterView, WtlbEntryView, BibleChapterView, ChapterView,
  LibraryScreen, NotesIndexScreen,
  VolumesHome, StudiesHome, HistoryScreen, AboutScreen,
  SettingsScreen, HomeScreen, SearchScreen,
  BibleStudyIndex, BibleStudyChapterView, MatthewChapterView, ChapterIndex,
  GARDEN_PRELOAD_AHEAD, GARDEN_CRAWL_DELAY, GardenView,
  ScriptureGenre, ScripturesHome,
  _linkEndpointCategory, _endpointResolves, _epSearchText,
  LinkRow, LinkRowActionSheet, LinksScreen,
  _bookmarkSourceLabel, _bookmarkSourceEndpoint,
  BookmarkRow, BookmarkRowActionSheet, BookmarkPopover, BookmarksScreen,
  _HL_COLOR_ORDER, _HL_COLOR_HEX, _hlColorHex, _hlColorIndex,
  _collectMarks, HighlightRow, HighlightsScreen,
  // Sheets
  TabsOverview, TabActionSheet, MultiNotePopover,
  NotebookPickerSheet, NoteSheet,
  LetterExcerptPickerScreen, VersePickerScreen,
  LinkPicker, LinkSidebar,
  SelectionToolbar, AnnotationActionChip,
  BookmarkCreateSheet,
  // App (composition root)
  App,
});

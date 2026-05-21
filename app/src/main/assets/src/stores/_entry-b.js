/* ═══════════════════════════════════════════════════════════════════════
   Cluster B entry — stores + components + hooks + journal + scripture
   ═══════════════════════════════════════════════════════════════════════
   This file is the esbuild entry point for dist/bundle-b.js. It imports
   every public symbol from the cluster's modules and re-exposes them on
   `window` so the rest of the app (still classic-script in clusters A
   and D and the inline App() block) can call them by bare name.

   The 29 Cluster B source files have been converted to ES modules with
   explicit intra-cluster imports for true eval-time dependencies (every
   store that calls CachedStore() at top level; notebook-store's
   unguarded NoteStore.pruneNotebook reference; use-history's call to
   useRefMirror inside its hook body). All other intra-cluster references
   stay as bare names guarded by `typeof X !== 'undefined'` — esbuild
   resolves them as globals, and they're populated by the
   Object.assign(window, ...) below before any function in this bundle
   is invoked.

   journal-helpers.js ↔ journal-store.js have a TRUE circular dependency
   in the classic-script world (journal-store calls JournalHelpers.* at
   call time; journal-helpers calls JournalStore.get at call time). The
   typeof guards on both sides keep the cycle harmless: neither module
   touches the other at eval time, and `var` (not `const`) declarations
   means no TDZ. We deliberately do NOT add explicit imports between
   those two modules — the bare-name + window-bridge pattern is simpler
   and preserves the existing semantics exactly.

   journal-styles.js is a pure side-effect IIFE (injects <style> tag).
   Imported here for its side effect only — no named exports.

   When clusters A and D + the inline App() block also become ES modules
   (later G.2 steps), the Object.assign(window) goes away and consumers
   import the symbols directly. This is the bridge in the meantime.
   ═══════════════════════════════════════════════════════════════════════ */

// Side-effect-only — injects journal CSS into <head> at load time.
import '../styles/journal-styles.js';

// ── Stores ──────────────────────────────────────────────────────────────
import { CachedStore } from './cached-store.js';
import { migrateAnnotations, AnnotationStore, HighlightStore } from './annotation-store.js';
import { NoteStore } from './note-store.js';
import { NotebookStore } from './notebook-store.js';
import { RecentNavStore } from './recent-nav-store.js';
import { hlId, lnkId, LinkStore, persistLink } from './link-store.js';
import { bkmId, BookmarkStore } from './bookmark-store.js';
import { JournalMediaStore } from './journal-media-store.js';
import {
  _jrnDateStr, _jrnDaysBetween, MILESTONE_DEFS,
  JournalStatsStore, jrnShowMilestoneToast,
} from './journal-stats-store.js';
import { JournalIndexStore } from './journal-index-store.js';
import { jrnId, JournalStore, JournalNotebookStore } from './journal-store.js';

// ── Components ──────────────────────────────────────────────────────────
import { ExpandableText, JrnExpandable } from '../components/ExpandableText.js';
import { ErrorBoundary } from '../components/ErrorBoundary.js';

// ── Hooks ───────────────────────────────────────────────────────────────
import { useMarkAsRead } from '../hooks/useMarkAsRead.js';
import { _validateTabState, useSavedState } from '../hooks/use-saved-state.js';
import { useRefMirror } from '../hooks/use-ref-mirror.js';
import { useHistory } from '../hooks/use-history.js';
import { useThumbnails } from '../hooks/use-thumbnails.js';

// ── Data ────────────────────────────────────────────────────────────────
import { JournalHelpers } from '../data/journal-helpers.js';
import {
  COLLECTIONS, COL_BY_KEY, COL_BY_CARD, COL_BY_LETTER_SC, COL_BY_INDEX_SC,
  COL_BY_SEARCH_ID, COL_BY_READ_KEY, _NAV_ICONS, COL_NAV_ICON,
  _BOUNDARY_SHORT, _BOUNDARY_SHORT_OUTSIDE, READING_CHAIN,
  _isWtlbFamily, _boundaryShort, colLetters, colPreface, colLetterArr,
  LETTER_SCREEN_SET, _allBooks, _matthew, _studies,
  parseRefStr, findBook, parseScriptureRef, resolveVerseText,
  findEntryContext, lookupVersesFromBooks,
} from '../data/scripture-resolution.js';
import { linkWtlbEntries, linkPreface, resolveVotLetter, isHiddenManna } from '../data/letter-linking.js';

// ── Journal UI (sheets) ─────────────────────────────────────────────────
import { JournalRecordingSheet } from '../ui/sheets/JournalRecordingSheet.js';
import { JournalInsertSheet } from '../ui/sheets/JournalInsertSheet.js';
import { JournalNotebookSheet } from '../ui/sheets/JournalNotebookSheet.js';
import { JournalInboundSheet } from '../ui/sheets/JournalInboundSheet.js';

// ── Journal UI (screens) ────────────────────────────────────────────────
import * as HubScreen from '../ui/screens/JournalHubScreen.js';
import * as ViewerScreen from '../ui/screens/JournalViewerScreen.js';
import * as EditorScreen from '../ui/screens/JournalEditorScreen.js';

// ── Renderer ────────────────────────────────────────────────────────────
import {
  JournalChip,
  jrnRefKeyForLetter, jrnRefKeyForChapter,
  jrnRefKeyForBookmark, jrnRefKeyForLetterByLabel,
} from '../renderer/dom-journal-chip.js';

// Expose every public symbol on window so classic-script consumers
// (Cluster A, Cluster D, the inline App() block) can call by bare name.
// Mirrors the implicit `function NAME(){}` → window.NAME classic-script
// binding the modules had before this conversion.
Object.assign(window, {
  // Stores
  CachedStore,
  migrateAnnotations, AnnotationStore, HighlightStore,
  NoteStore, NotebookStore, RecentNavStore,
  hlId, lnkId, LinkStore, persistLink,
  bkmId, BookmarkStore,
  JournalMediaStore,
  _jrnDateStr, _jrnDaysBetween, MILESTONE_DEFS,
  JournalStatsStore, jrnShowMilestoneToast,
  JournalIndexStore,
  jrnId, JournalStore, JournalNotebookStore,
  // Components
  ExpandableText, JrnExpandable,
  ErrorBoundary,
  // Hooks
  useMarkAsRead,
  _validateTabState, useSavedState,
  useRefMirror,
  useHistory,
  useThumbnails,
  // Data
  JournalHelpers,
  COLLECTIONS, COL_BY_KEY, COL_BY_CARD, COL_BY_LETTER_SC, COL_BY_INDEX_SC,
  COL_BY_SEARCH_ID, COL_BY_READ_KEY, _NAV_ICONS, COL_NAV_ICON,
  _BOUNDARY_SHORT, _BOUNDARY_SHORT_OUTSIDE, READING_CHAIN,
  _isWtlbFamily, _boundaryShort, colLetters, colPreface, colLetterArr,
  LETTER_SCREEN_SET, _allBooks, _matthew, _studies,
  parseRefStr, findBook, parseScriptureRef, resolveVerseText,
  findEntryContext, lookupVersesFromBooks,
  linkWtlbEntries, linkPreface, resolveVotLetter, isHiddenManna,
  // Journal UI (sheets)
  JournalRecordingSheet, JournalInsertSheet, JournalNotebookSheet, JournalInboundSheet,
  // Renderer
  JournalChip,
  jrnRefKeyForLetter, jrnRefKeyForChapter,
  jrnRefKeyForBookmark, jrnRefKeyForLetterByLabel,
});

// Journal UI screens — wildcard imports above let us spread ALL exports
// onto window without listing each symbol (and missing internal helpers
// like JournalCardMenu, jrnRenderInline, JournalBlockView that other
// modules in the cluster reference via bare name in the classic world).
Object.assign(window, HubScreen, ViewerScreen, EditorScreen);

/* ═══════════════════════════════════════════════════════════════════════
   _entry-g.js — esbuild entry for bundle-g.js (the screens you go TO)
   ═══════════════════════════════════════════════════════════════════════
   My Progress, Notes, Links and Highlights are screens a reader opens ON
   PURPOSE — never on boot, never on the way to a chapter — yet they were
   parsed on every launch inside bundle-d, of which Lighthouse found 85 %
   unused at first paint (lanes/myweb/out/perf-report-2026-09-22.md §6).

   They follow the contract bundle-e (Settings/Search/Garden) and bundle-f
   (the Scripture Web) already keep: this IIFE Object.assigns them onto
   window, index.html's __makeLazyLoader('screens-g', …) injects it on first
   navigation (window.__loadScreensG), and screen-routes.jsx renders
   _corpusView(window.__screensG, …) until they are defined.

   Like bundle-e's screens, these resolve their shared helpers — React,
   ScreenLayout, buildAchievements, onIdle, normalizeExcerptDisplay — as FREE
   GLOBALS at call time, from the window slots bundle-d fills. That is what
   keeps bundle-g small and keeps ONE copy of each law: a second bundled copy
   of achievements.js would be two module states of one table.

   Each screen's private helpers (the link-endpoint predicates, the highlight
   colour table, the mark collector) travel WITH their screen — nothing
   outside those files reads them (verified at split time, and pinned by
   tools/bundle-g-membership.test.js).

   BookmarksScreen joined them in a second step: its file also defined
   BookmarkPopover, which AppShellSheets mounts in the always-present app
   shell, and the two hlKey derivations five other files read as free
   globals. Those moved to ui/sheets/BookmarkPopover.jsx and
   utils/bookmark-source.js, where they stay eager; only the screen, its row
   and the row's action sheet — which nothing outside that file reads — came
   across.
   ═══════════════════════════════════════════════════════════════════════ */

import { MyProgressScreen } from './screens/MyProgressScreen.jsx';
import { BookmarkRow, BookmarkRowActionSheet, BookmarksScreen } from './screens/BookmarksScreen.jsx';
// Landing 23: the same law, two more screens — Milestones, the full
// achievements surface, and History, the reading log. About was tried here too
// and sent back: use-tabs.js opens a FRESH INSTALL on About, so lazy would have
// put a bundle fetch in front of a new reader's very first paint.
import { MilestonesScreen } from './screens/MilestonesScreen.jsx';
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
// NotesIndexScreen's only importer — the export composer is used by nothing
// else in the app, so it rides with the screen rather than staying behind.
import { composeNotesExport, notesExportFilename, shareNotesExport } from '../utils/notes-export.js';

Object.assign(window, {
  MyProgressScreen,
  BookmarkRow, BookmarkRowActionSheet, BookmarksScreen,
  MilestonesScreen, HistoryScreen,
  NotesIndexScreen,
  _linkEndpointCategory, _endpointResolves, _epSearchText,
  LinkRow, LinkRowActionSheet, LinksScreen,
  _HL_COLOR_ORDER, _HL_COLOR_HEX, _hlColorHex, _hlColorIndex,
  _collectMarks, HighlightRow, HighlightsScreen,
  composeNotesExport, notesExportFilename, shareNotesExport,
});

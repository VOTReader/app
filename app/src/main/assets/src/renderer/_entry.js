/* ═══════════════════════════════════════════════════════════════════════
   Cluster C entry — renderer (ES module bundle)
   ═══════════════════════════════════════════════════════════════════════
   This file is the esbuild entry point for dist/bundle-c.js. It imports
   every public symbol from the cluster's modules and re-exposes them on
   `window` so the rest of the app (still classic-script in clusters A,
   B, D and the inline App() block) can call them by bare name.

   When clusters A, B, D and App() also become ES modules (later G.2
   steps), the window assignment goes away — consumers will import the
   symbols directly. This is the bridge in the meantime.

   Cluster C is the FIRST conversion (G.2.1) because it's the smallest
   (3 files, ~52 KB) and its consumers all live in OTHER files — so the
   blast radius if anything breaks is contained to renderer behavior,
   which the smoke harness's annotation round-trips exercise directly.
   ═══════════════════════════════════════════════════════════════════════ */

import { applyDOMLinks } from './dom-links.js';
import { applyDOMBookmarks } from './dom-bookmarks.js';
import {
  snapRangeToWords,
  HighlightableText,
  findNoteIconInsertionPoint,
  applyNoteIcons,
  applyActiveNoteState,
  applyDOMHighlights,
  StaticSubtree,
} from './annotation-engine.js';

// Expose to the global scope so classic-script consumers (the inline
// App() block, BibleChapterView/ChapterView, etc.) can call by bare
// name. Identical to the implicit `function NAME(){}` → window.NAME
// classic-script binding the modules had before this conversion.
Object.assign(window, {
  applyDOMLinks,
  applyDOMBookmarks,
  snapRangeToWords,
  HighlightableText,
  findNoteIconInsertionPoint,
  applyNoteIcons,
  applyActiveNoteState,
  applyDOMHighlights,
  StaticSubtree,
});

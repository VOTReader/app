/* ═══════════════════════════════════════════════════════════════════════
   _entry-f.js — esbuild entry for bundle-f.js (The Scripture Web)
   ═══════════════════════════════════════════════════════════════════════
   The Scripture Web is its own lazy bundle rather than a lodger in bundle-e:
   it carries a WebGL renderer, its own geometry/picking maths and a screen,
   and bundle-e (Settings/Search/Garden) had ~18 KB of headroom under
   tools/check-bundle-budget.js. A separate bundle also means the cold-boot
   path never parses a byte of it — the screen is reached deliberately, from
   the Library, and nothing else pulls it in.

   Injected by index.html's __makeLazyLoader('screens-f', …) →
   window.__loadScreensF; screen-routes.jsx renders _corpusView until this
   IIFE's Object.assign below defines the screen.

   Like bundle-d/e, this resolves shared app symbols (React, ScreenLayout,
   PlatformBridge, LinkStore, COLLECTIONS, resolveVerseText, …) as FREE
   GLOBALS at call time, so nothing from bundle-b/d is duplicated here. Its
   own maths modules ARE imported — they exist only for this feature.
   ═══════════════════════════════════════════════════════════════════════ */

import { ScriptureWebScreen, ensureScriptureWebData } from './screens/ScriptureWebScreen.jsx';

Object.assign(window, {
  ScriptureWebScreen,
  ensureScriptureWebData,
});

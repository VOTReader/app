/* ═══════════════════════════════════════════════════════════════════════
   _entry-e.js — esbuild entry for bundle-e.js (PF6 — lazy screen split)
   ═══════════════════════════════════════════════════════════════════════
   The heavy non-home screens (Settings, Search, Garden) are code-split OUT of
   bundle-d into this bundle, injected on first navigation by the index.html
   __makeLazyLoader('screens-e', …) loader (window.__loadScreensE). This keeps
   them off the cold-boot parse path; screen-routes.jsx renders a loader/retry
   (_corpusView) until this bundle's Object.assign(window, …) below defines them.

   These three screens have NO ES imports — they resolve React / ScreenLayout /
   SettingsRow / gardenUrl / etc. as FREE GLOBALS at call time (the same
   cross-bundle pattern bundle-d uses) — so bundle-e carries only their own code,
   no duplicated bundle-b/d deps. The two GardenView consts move WITH GardenView
   (nothing else reads them; verified at split time).
   ═══════════════════════════════════════════════════════════════════════ */

import { SettingsScreen } from './screens/SettingsScreen.jsx';
import { SearchScreen } from './screens/SearchScreen.jsx';
import {
  GARDEN_PRELOAD_AHEAD, GARDEN_CRAWL_DELAY, GardenView,
} from './screens/GardenView.jsx';

Object.assign(window, {
  SettingsScreen,
  SearchScreen,
  GARDEN_PRELOAD_AHEAD, GARDEN_CRAWL_DELAY, GardenView,
});

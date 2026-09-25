/* ═══════════════════════════════════════════════════════════════════════
   _entry-h.js — esbuild entry for bundle-h.js (the Listening Library)
   ═══════════════════════════════════════════════════════════════════════
   The library hub and its five sub-screens — On this phone (item 8), the Volumes, the Studies, a
   collection's (or a study's) recordings, the saved list. A reader goes
   there to choose something to listen to; nobody passes through it on the
   way to a chapter, and the
   shell does not mount it. Same weight, same law, as landings 21-23
   (lanes/myweb/out/perf-report-2026-09-22.md §6).

   THE PLAYER DOES NOT COME WITH IT, and that is the whole care of this
   split: AudioPlayerBar and AudioManagerSheet are mounted in the
   always-present shell and play on every screen, so audio-player.js,
   AudioShelf (rows, icons, useAudioPositions), AudioSeekSlider,
   CoverageBadge, audio-track.js and audio-coverage.js all stay in
   bundle-d. These four screens read them as FREE GLOBALS at call time,
   the cross-bundle contract bundle-e, -f and -g keep. A second bundled
   audio-player.js would be two players fighting over one <audio>.

   Pinned in the built bytes by tools/bundle-h-membership.test.js.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioLibraryScreen } from './screens/AudioLibraryScreen.jsx';
import { AudioVolumesScreen } from './screens/AudioVolumesScreen.jsx';
import { AudioCollectionScreen } from './screens/AudioCollectionScreen.jsx';
import { AudioSavedScreen } from './screens/AudioSavedScreen.jsx';
import { AudioStudiesScreen } from './screens/AudioStudiesScreen.jsx';
import { AudioOfflineScreen } from './screens/AudioOfflineScreen.jsx';
// Songs of the Letters (L2, 2026-09-25): the hub and its lists; the catalog, the song pieces and the route helpers stay in bundle-d.
import { AudioSongsScreen, songsFrameTitle } from './screens/AudioSongsScreen.jsx';

Object.assign(window, {
  AudioLibraryScreen, AudioVolumesScreen, AudioCollectionScreen, AudioSavedScreen, AudioStudiesScreen, AudioOfflineScreen, AudioSongsScreen,
  // W-03: the back pill over a letter opened from a Songs screen names that screen's top frame (screen-routes).
  songsFrameTitle,
});

// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   audio-player — streaming playback for letters and Bible (singleton store)
   ═══════════════════════════════════════════════════════════════════════
   Two corpora stream from immutable GitHub Release assets: letters across the
   14 VOT collections (src/data/audio-manifest.js, auto-generated, rides
   bundle-a-vot) and the recorded Bible editions, which are PER-CHAPTER —
   1,189 tracks each (src/data/bible-audio-manifest.js, rides bundle-a). Both
   map ids to asset ids; this module turns either into a queue and drives ONE
   <audio> element. A third source, the flock's Songs of the Letters, comes
   from a catalog (utils/song-catalog.js) and rides the same element as
   `song:<id>` tracks — see playSongs. Deep reference: ARCHITECTURE.md § Audio
   subsystem; docs/AUDIO-MANAGER.md.

   Store contract (the repo's useSyncExternalStore idiom):
     subscribe(cb) -> unsubscribe · getVersion() -> number · getState()

   Two things this module deliberately does NOT do at import time:
     1. touch AUDIO_MANIFEST / AUDIO_SECTIONS — they're LAZY corpus globals
        that only exist after __loadVotCorpus() runs, so every read goes
        through _manifest()/_sections() at CALL time.
     2. construct the Audio element — created on first play() so boot order
        and jsdom tests never see a media element they didn't ask for.

   The manifest globals are read via globalThis rather than as bare names:
   they are classic-script `var`s (real globals) at runtime, but they are
   NOT in tools/globals.generated.d.ts, so a bare `AUDIO_MANIFEST` fails
   `npm run typecheck` until someone re-runs `npm run lint:globals`. The
   globalThis read is identical at runtime and immune to that ordering.

   THE PARTS (split along its seams 2026-09-26, sweep-2 v15-code-health-12; no behaviour change).
   This file is the public face: the typedefs, the AudioPlayer store and the boot, in the order the
   single file ran it. The player itself lives in utils/audio-player/, one concern a module, and each
   module owns its own state (a `let` is written only in its module; the few writes from elsewhere go
   through a `_set<Name>` beside it):
     core          the state object, subscribers, corpus globals, words
     engine        the element (or the native stand-in), _start, status, errors, prewarm, seek-on-metadata
     media-session keep-alive, web Media Session, native card and commands, the audio arbiter
     transport     toggle, next/prev, playAt, seek, skip, speed, stop, pauseIfPlaying
     queue         the play* entry points, the horizon, the site order, queue edits
     songs         songs queues, shuffle, repeat, version switch
     loop / sleep  repeat this passage / the sleep timer and its fade
     persist       source descriptor, boot snapshot (LS + IDB), per-recording positions
     restore       rebuild a restored bar, resume across the update reload and a close
     catalog       manifest queries, renditions, the preferred reader, the corpus lookups
     sections      WTLB compilations; credit: listen credit and play counts
     offline       what plays with no signal; prefetch: the gentle warm of what comes next
   ═══════════════════════════════════════════════════════════════════════ */

import {
  bibleChapterOfTrack,
  bibleChapterStart,
  collectionHasAudio,
  firstReaderCode,
  hasAudio,
  playbackTracks,
  readerLabel,
  renditionsFor,
  sectionsFor,
  sectionTracks,
  setPreferredReader,
} from './audio-player/catalog.js';
import { _g, getState, getVersion, subscribe } from './audio-player/core.js';
import { getPreciseTime, prewarm } from './audio-player/engine.js';
import { clearLoop, isNative, setLoop } from './audio-player/loop.js';
import { _onVisible, syncKeepAlive } from './audio-player/media-session.js';
import { _adoptDurableSnapshot, _restoreFromSaved } from './audio-player/persist.js';
import {
  clearUpcoming,
  moveUpcoming,
  playBibleBook,
  playCollection,
  playLetter,
  playSection,
  playTrack,
  removeUpcoming,
} from './audio-player/queue.js';
import { _flushOnHide, _onBeforeUpdateReload, _resumeAfterUpdate } from './audio-player/restore.js';
import { liveLetter, sectionLetterKeyAt, sectionOpeningKey } from './audio-player/sections.js';
import { clearSleepTimer, getSleepRemainingSeconds, setSleepAtTrackEnd, setSleepTimer } from './audio-player/sleep.js';
import { playSongs, setRepeat, setShuffle, switchSongVersion } from './audio-player/songs.js';
import {
  next,
  pauseIfPlaying,
  playAt,
  prev,
  seek,
  setPlaybackRate,
  skip,
  stop,
  toggle,
} from './audio-player/transport.js';

/**
 * @typedef {Object} Track
 * @property {string | null} key       - "volKey:letterId"; null for range-compilation sections
 * @property {string} title            - letter title, or the section's own label
 * @property {string | null} sub       - collection label (Media Session "album")
 * @property {string} url              - immutable VOT release-asset stream URL
 * @property {string} readerCode       - 'B' | 'T' | 'V' | 'M'
 * @property {string | null} partLabel - "Part 2" / "Addendum" on multi-part letters
 */

/**
 * @typedef {Object} Rendition
 * @property {string} reader   - reader code the WHOLE rendition is read by
 * @property {Track[]} tracks  - the complete letter as that reader recorded it
 */

/**
 * @typedef {Object} AudioPlayerState
 * @property {'idle'|'loading'|'playing'|'paused'} status
 * @property {Track[]} queue
 * @property {number} qi        - index of the playing track within queue
 * @property {number} time      - current position, seconds
 * @property {number} duration  - current track length, seconds (0 until known)
 * @property {number} rate      - selected playback-rate preset
 * @property {number} sleepEndsAt - epoch ms, 0 when no sleep timer is armed
 * @property {number} sleepMinutes - the countdown preset that was armed, 0 when none
 * @property {boolean} sleepAtTrackEnd - stop when the CURRENT recording ends
 * @property {boolean} restoring - the bar is a boot placeholder; the real queue
 *   has not been rebuilt yet, so its SHAPE is unknown (see _pendingRestore)
 * @property {'letter'|'collection'|'section'|'custom'|'songs'|''} sourceMode - how this
 *   queue was built; 'custom' means a user-edited queue or a lone recording
 * @property {boolean} shuffle - a songs queue plays in a seeded shuffle (songs only)
 * @property {'off'|'one'|'all'} repeat - a songs queue replays its song or wraps
 *   at its end; reset to 'off' by any queue that is not songs, so a letter never loops
 * @property {{ url: string, start: number, end: number, times: number, pass: number, label: string, waits: boolean } | null} loop
 *   - REPEAT THIS PASSAGE (setLoop): the span of the playing recording heard `times` times; null when none
 */

export { AUDIO_TOAST_ID, trackUrl } from './audio-player/core.js';
export { SONG_OFFLINE_TOAST_ID } from './audio-player/offline.js';

// Boot-time durable-resume: if a prior session left a position snapshot, put
// the bar up PAUSED at that spot (display-only state; no network, no corpus).
// Runs at module eval — deliberately touches only localStorage + _state.
_restoreFromSaved();

/* One live player per window. A re-import (the test harness's vi.resetModules)
   retires the previous instance's window listeners first, so a stale instance
   cannot answer a later document's events — the same reason the play arbiter
   is reachable as __votAudioArbiter. */
if (typeof window !== 'undefined') {
  const g = _g();
  if (typeof g.__votAudioPlayerRetire === 'function') g.__votAudioPlayerRetire();
  const onVisibility = () => { if (document.visibilityState === 'hidden') _flushOnHide(); else _onVisible(); };
  window.addEventListener('vot:before-update-reload', _onBeforeUpdateReload);
  window.addEventListener('pagehide', _flushOnHide);
  document.addEventListener('visibilitychange', onVisibility);
  g.__votAudioPlayerRetire = () => {
    window.removeEventListener('vot:before-update-reload', _onBeforeUpdateReload);
    window.removeEventListener('pagehide', _flushOnHide);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

// The update's self-reload plays on from its exact clock (restore.js); then the durable IDB copy may stand in for
// the localStorage one (persist.js). Same order as the single-file player ran them.
_resumeAfterUpdate();
_adoptDurableSnapshot();

/** The singleton audio player store. */
export const AudioPlayer = {
  subscribe,
  getVersion,
  getState,
  getPreciseTime,
  hasAudio,
  prewarm,
  firstReaderCode,
  collectionHasAudio,
  sectionsFor,
  sectionTracks,
  readerLabel,
  renditionsFor,
  setPreferredReader,
  playbackTracks,
  playLetter,
  playCollection,
  playSection,
  playBibleBook,
  playSongs,
  setShuffle,
  switchSongVersion,
  setRepeat,
  setLoop,
  clearLoop,
  isNative,
  bibleChapterStart,
  bibleChapterOfTrack,
  sectionLetterKeyAt,
  sectionOpeningKey,
  liveLetter,
  playTrack,
  toggle,
  next,
  prev,
  seek,
  skip,
  setPlaybackRate,
  getSleepRemainingSeconds,
  setSleepTimer,
  setSleepAtTrackEnd,
  clearSleepTimer,
  playAt,
  removeUpcoming,
  moveUpcoming,
  clearUpcoming,
  stop,
  pauseIfPlaying,
  syncKeepAlive,
};

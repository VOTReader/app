# Listening Library and audio manager

VOTReader has one audio engine. The Listening Library, mini-player, expanded
listening controls, collection buttons, and journal audio all coordinate around
that engine rather than creating independent `<audio>` elements or queues.

## What a reader can do

- Start a letter, section, or collection from its existing **Listen** / **Play
  All** controls.
- Open the mini-player's title area for the expanded listening desk.
- Seek, skip 15 seconds, use previous/next, select a speed from 0.75x to 2x,
  and arm a 15/30/60 minute sleep timer.
- Save recordings, reopen recently played recordings, and clear recent history
  from **Volumes → Listening Library**.
- Leave any recording and come back to it later. Every recording keeps its own
  place, so starting a second one does not forget the first; library rows say
  how much of a recording is left, and "Resume last" resumes for real.
- Inspect and edit the future queue: play an item now, move it earlier/later,
  remove it, or clear the remainder. The currently playing item is protected
  from destructive queue actions.
- Open the source text for saved/recent letter recordings when the corpus key
  still resolves.

Audio remains streaming-only. There is no local download manager, arbitrary
remote URL loader, or second media player. One refinement rides the HTTP
cache: when the current track is fully buffered on a healthy connection, the
player quietly warms the next two queued tracks through a detached,
never-playing element (`_maybePrefetchNext` in `audio-player.js`), so track
boundaries start near-instantly. Save-Data or 2g-class connections disable
it; the cache — not the app — owns eviction.

## Ownership and module boundaries

| Responsibility | Owner |
| --- | --- |
| Track URL policy and persisted track normalization | `app/src/main/assets/src/utils/audio-track.js` |
| Playback, Media Session, durable position, queue editing, sleep timer, and audio arbitration | `app/src/main/assets/src/utils/audio-player.js` |
| Saved recordings, recent history, speed preference, and lifetime play count | `app/src/main/assets/src/stores/audio-library-store.js` |
| Per-recording resume points (URL → position) | `app/src/main/assets/src/stores/audio-positions-store.js` |
| Compact transport and expanded listening desk | `app/src/main/assets/src/ui/components/AudioPlayerBar.jsx`, `AudioManagerSheet.jsx` |
| The one scrubber both of those render | `app/src/main/assets/src/ui/components/AudioSeekSlider.jsx` |
| Saved/recent/browse screen | `app/src/main/assets/src/ui/screens/AudioLibraryScreen.jsx` |
| IDB registration, import validation, and Settings backup mapping | `idb-adapter.js`, `import-validators.js`, `SettingsScreen.jsx` |

The player is in bundle D while `AudioLibraryStore` and `AudioPositionsStore`
are in bundle B. D must use the `globalThis.AudioLibraryStore` /
`globalThis.AudioPositionsStore` bridges at call time; importing a B store's
source from D would make esbuild emit a second, divergent cached-store
singleton. Both bridges are fail-quiet: a missing or throwing store changes
nothing about playback.

## Trust and persistence rules

Only immutable VOT release assets are accepted:

```text
https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/<asset>.mp3
```

`normalizeAudioTrack()` applies that policy to every stored or imported track.
An imported favorite cannot turn VOTReader into a generic remote-media loader.
Display strings are also bounded and copied before use.

`vot-audio-library` is an IndexedDB-backed metadata record:

```js
{ v: 1, saved: [], recent: [], rate: 1 }
```

- Saved recordings are capped at 100; recent recordings at 30.
- Both lists deduplicate by immutable release URL and retain the newest event.
- The record participates in Settings export/import. Nested contents are
  normalized again on import, not merely trusted because the outer backup had
  the right shape.
- The playback resume record is separate localStorage state (`vot-audio-pos`).
  Version 2 can preserve an edited custom queue; version 1 records remain
  readable for existing installs. It is ONE slot — the last thing that was
  playing — and it is what puts the bar back on screen at boot.
- Sleep timers are intentionally session-only. Restarting an app must not wake
  it later merely to pause a recording.

`vot-audio-positions` (IndexedDB v10) is the per-recording memory beside that
one slot:

```js
{ v: 1, positions: { '<release url>': { t, d, at } } }
```

- `t` seconds in, `d` the length (0 when it was never known), `at` the last
  touch in epoch ms. Every value is clamped; every key must pass
  `isVotAudioUrl`, so an imported map can no more name an arbitrary URL than an
  imported favorite can.
- Capped at 200 recordings, least-recently-touched first. Key order IS the LRU
  order — writes delete before re-inserting — so pruning costs no sort, and an
  oversized import truncates to the freshest 200.
- The record participates in Settings export/import, and is re-normalized on
  the way in.

**Resume policy** (`AUDIO_RESUME_*` in `audio-track.js`, shared so the library
rows describe exactly the judgment the player acts on): a recording resumes
when at least 30 s in and below 97 % of its length, five seconds before where
it was left. A recording heard to its end is forgotten, not resumed. Closing
the player with ✕ discards the boot snapshot but KEEPS the positions map.
Writes are throttled to at most one a second, and always land at a boundary
(track change, stop). The outgoing track's clock is written BEFORE the queue
index moves, or the position would be filed under the recording just starting.

## One-audio policy

`AudioPlayer` owns one detached `Audio` element. Before it starts, it pauses
other document `<audio>` elements. A capture-phase document `play` listener
does the converse: when a journal memo or another app-owned DOM audio element
starts, it pauses VOT playback, including the loading state. This prevents
memo recording/playback and streamed VOT audio from overlapping.

The Media Session integration publishes title, reader, album, playback state,
position, rate, seek, previous, and next where the host supports those APIs.
The Android bridge's `setAudioActive()` remains best-effort lifecycle support;
this module does not claim to provide a native foreground media service.

## Extension rules

1. Add a new persistent audio field only through `audio-track.js`,
   `audio-library-store.js`, or `audio-positions-store.js`, with an import
   normalizer and bounded data shape.
2. Add an IDB store only with a schema-version bump and a matching
   `idb-adapter.test.js` expectation. Include it in the backup/import mapping
   when it is reader-owned data.
3. Add transport behavior to `AudioPlayer`, then render it from the manager.
   Do not keep parallel queue state in React components.
4. Keep the queue's current item immutable under editing controls. If a future
   feature needs deleting the active item, design an explicit stop/confirm
   flow instead of weakening `removeUpcoming()`.
5. Keep bundle boundaries intact: pure helper modules can be shared directly;
   bundle-B stores are reached from bundle D by the runtime bridge.
6. Seek from `AudioSeekSlider`, not from a second `<input type="range">`. A
   commit-per-drag-pixel scrubber writes a durable position per pixel; the
   shared slider previews locally and commits once on release (and immediately
   for the keyboard, which is the a11y half of that contract).

## Verification

Focused checks for this module:

```powershell
npm.cmd run test -- app/src/main/assets/src/utils/audio-player.test.js app/src/main/assets/src/stores/audio-library-store.test.js app/src/main/assets/src/stores/audio-positions-store.test.js app/src/main/assets/src/stores/idb-adapter.test.js
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The player tests cover loading-state pause safety, trusted direct playback,
sleep-timer pause behavior, custom-queue persistence/restore, audio arbitration,
Media Session position reporting, and the durable-resume rules (the 30 s floor,
the 97 % tail, the 5 s nudge, forget-on-ended, outgoing-track attribution, and
the write throttle). Store tests cover caps, deduplication, LRU eviction,
backup-import normalization, and URL rejection.

`user-data-parity.test.js` is the canary for the registration legs: it fails
by name if a store reaches the backup, the "Your Data" size, or the import
trust boundary without reaching the other two.

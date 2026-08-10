# Listening Library and audio manager

VOTReader has one audio engine. The Listening Library, mini-player, expanded
listening controls, collection buttons, and journal audio all coordinate around
that engine rather than creating independent `<audio>` elements or queues.

## What a reader can do

- Start a letter, section, or collection from its existing **Listen** / **Play
  All** controls.
- Open the mini-player's title area for the expanded listening desk.
- Seek, skip 15 seconds, use previous/next, select a speed from 0.75x to 2x
  (0.75 / 1 / 1.25 / 1.5 / 1.75 / 2), and arm a 15/30/60 minute sleep timer or
  stop at the end of the current recording.
- Restart the current recording. Previous is a real control at every position:
  past three seconds, and at the HEAD of the queue at any position, it seeks to
  zero rather than stepping to a track that isn't there. A queue of one
  therefore keeps the control and labels it "Restart"; next is hidden (bar) and
  disabled (desk) when there is nothing to advance to.
- See where they are in the queue: the bar's sub-line and the desk's head carry
  "N of M", counted within the QUEUE — not within the book or collection.
- Switch the VOICE of whatever is playing, from the desk's **Voice** row. A
  letter with more than one complete reading offers a chip per reader; a Bible
  chapter offers a chip per recorded edition (short labels — `KJV · BRM`,
  `NKJV · Dramatized`, `WEB`), and only for editions that actually ship that
  book. One explicit rule either way: **choosing a voice restarts the
  recording.** Position is deliberately not carried across — two readers never
  reach the same words at the same second, so a "seamless" switch would drop
  the listener mid-sentence. A recording with only one voice shows no row.
  Switching Bible edition also moves `settings.bibleAudio`, so the Listen pills
  on chapter indexes follow the choice instead of snapping back.
- Set a DEFAULT voice for the Letters in **Settings → Reading → Letter Voice**.
  `auto` (the default) uses each recording's primary reading; a reader code
  starts every letter that reader has recorded in their voice, and letters they
  never read keep the primary one. An explicit choice — a hero Listen with a
  reader, a desk chip — always outranks it, and "Play all" is untouched: the
  preference picks a START, not a whole queue.
- Save recordings, reopen recently played recordings, remove one recent row
  with its ×, and clear the whole recent history from **Volumes → Listening
  Library**. The hub's now-playing card carries the same transport rules as the
  mini-player (prev is a Restart on a queue of one; next is absent there) and
  the same real scrubber.
- Leave any recording and come back to it later. Every recording keeps its own
  place, so starting a second one does not forget the first; library rows say
  how much of a recording is left, and "Resume last" resumes for real.
- Inspect and edit the WHOLE queue — heard, playing, and still ahead. Played
  rows are dimmed but tappable, so a chapter can be heard again without
  rebuilding the queue; the playing row is a marker with no controls at all
  (the desk's own transport owns play/pause) and stays protected from
  destructive queue actions; upcoming rows still move earlier/later, leave, or
  clear as a block. With a per-chapter Bible edition this list IS the chapter
  picker, so the desk centres the playing row when it opens.
- Reach any position in a very long queue. A whole Bible edition queues 1,189
  chapters, so the desk renders a WINDOW of current ± 40 rows with "Show N
  earlier / later" expanders (`QUEUE_WINDOW_MIN` / `QUEUE_PAGE` in
  `AudioManagerSheet.jsx`). Deliberately paged and dumb — no virtual scroller,
  nothing to go wrong when the queue is edited underneath it. Anything shorter
  than ~80 rows renders whole, with no expanders to discover.
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
| Track URL policy, persisted track normalization, and the two display registries (`BIBLE_AUDIO_EDITIONS`, `AUDIO_READERS`) | `app/src/main/assets/src/utils/audio-track.js` |
| Playback, Media Session, durable position, queue editing, sleep timer, and audio arbitration | `app/src/main/assets/src/utils/audio-player.js` |
| Saved recordings, recent history, speed preference, and lifetime play count | `app/src/main/assets/src/stores/audio-library-store.js` |
| Per-recording resume points (URL → position) | `app/src/main/assets/src/stores/audio-positions-store.js` |
| Compact transport and expanded listening desk | `app/src/main/assets/src/ui/components/AudioPlayerBar.jsx`, `AudioManagerSheet.jsx` |
| The one scrubber both of those render | `app/src/main/assets/src/ui/components/AudioSeekSlider.jsx` |
| Saved/recent/browse screen | `app/src/main/assets/src/ui/screens/AudioLibraryScreen.jsx` |
| IDB registration, import validation, and Settings backup mapping | `idb-adapter.js`, `import-validators.js`, `SettingsScreen.jsx` |

Two settings reach the player, and neither is read from React state inside it:
`settings.letterReader` is PUSHED in by `AudioPlayer.setPreferredReader(...)`
from `buildScreenRoutes` (idempotent, once per render), and the desk's Bible
voice chips write `settings.bibleAudio` back out through the
`window.__setBibleAudioEdition` bridge that the same factory installs beside
`window.__openAudioText`. Both directions are guarded by the registries, so an
unknown reader code or edition id changes nothing.

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

- Saved recordings are capped at 100; recent recordings at 30. `removeRecent(url)`
  drops one recent row by its immutable release URL — an in-place mutator like
  `clearRecent`, so no persisted shape and no schema version moves.
- Both lists deduplicate by immutable release URL and retain the newest event.
- The record participates in Settings export/import. Nested contents are
  normalized again on import, not merely trusted because the outer backup had
  the right shape.
- The playback resume record is separate localStorage state (`vot-audio-pos`).
  Version 2 can preserve an edited custom queue; version 1 records remain
  readable for existing installs. It is ONE slot — the last thing that was
  playing — and it is what puts the bar back on screen at boot.
- Sleep timers are intentionally session-only. Restarting an app must not wake
  it later merely to pause a recording. That applies to BOTH modes: the minute
  countdown and the end-of-track flag. The two replace each other — one sleep
  arming at a time, one Clear that disarms whichever is live.
- "End of track" is never clock math. Playback rate and buffering both move
  when a recording actually finishes, so a computed deadline would be wrong;
  the flag is read by the element's `ended` event, BEFORE the queue advances.
  It pauses exactly like the countdown (queue and resume snapshot survive) and
  clears itself, so the next boundary advances normally. Holding no deadline is
  also why it survives a pause and resume for free.

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
position, rate, seek, ∓15 second seeks, stop, previous, and next where the host
supports those APIs. Each `setActionHandler` call is isolated, because the
method throws on actions a given host does not implement and one unsupported
action must not skip the rest. Previous/next are registered ONLY while the
queue holds more than one recording, and are re-decided on every queue-shape
change — track starts and queue edits alike — so a lone saved recording never
shows dead skip buttons. In practice this reaches desktop Chrome only: the web
MediaSession is inert inside the Android WebView, where the system card is fed
by `AudioKeepAliveService` through `setAudioNowPlaying` instead. The Android
bridge's `setAudioActive()` remains best-effort lifecycle support; this module
does not claim to provide a native foreground media service.

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
   flow instead of weakening `removeUpcoming()`. The desk renders the whole
   queue now, so this is enforced twice on purpose: the playing row renders no
   controls, AND `removeUpcoming`/`moveUpcoming` still refuse any index at or
   below `qi`.
5. Keep bundle boundaries intact: pure helper modules can be shared directly;
   bundle-B stores are reached from bundle D by the runtime bridge.
6. Seek from `AudioSeekSlider` on every surface that shows a position — the
   mini-player, the desk, and the Listening Library hub — not from a second
   `<input type="range">` and not from a painted progress div. A
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

`AudioManagerSheet.test.jsx` drives the REAL player singleton through a fake
media element, so the whole-queue picker (played/current/upcoming row states,
re-picking a played recording, the centring scroll), the long-queue window and
its expanders, and both voice shapes (reader chips restarting the letter into
the s4 album queue; edition chips restarting the SAME chapter and moving
`settings.bibleAudio`) are proven as behavior rather than wiring.

The player tests cover loading-state pause safety, trusted direct playback,
the default-reader preference (applied, one-line fallback to the primary,
outranked by an explicit reader, and never applied to "Play all"),
sleep-timer pause behavior (both modes), head-of-queue restart, custom-queue
persistence/restore, audio arbitration, Media Session position reporting and
queue-shape-dependent action registration, and the durable-resume rules (the
30 s floor, the 97 % tail, the 5 s nudge, forget-on-ended, outgoing-track
attribution, and the write throttle). Store tests cover caps, deduplication,
LRU eviction, backup-import normalization, and URL rejection.

`user-data-parity.test.js` is the canary for the registration legs: it fails
by name if a store reaches the backup, the "Your Data" size, or the import
trust boundary without reaching the other two.

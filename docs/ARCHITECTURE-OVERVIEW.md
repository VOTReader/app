# Architecture overview: a one-hour tour

For a senior developer new to VOTReader. It gives the shape of the system and where each part lives, and it
links to the deeper documents instead of repeating them. Paths are relative to the repository root, and `assets/`
is short for `app/src/main/assets/`. Everything cited here existed on 2026-09-27. Sizes and counts drift with
every commit, so measure them (`ls -l app/src/main/assets/dist/`) rather than quoting them.

Suggested hour: 10 min on sections 1-2, 15 on 3, 15 on 4, 10 on 5, 10 on 6-7.

| Before you start | |
|---|---|
| Front door and bundle map | `README.md` |
| Build, tests, gates, landing | `CONTRIBUTING.md` |
| Product rules and permanent data rules | `CLAUDE.md` |
| Deep reference (annotations, navigation, read-along, audio) | `ARCHITECTURE.md` |
| Every `window.__*` bridge between bundles | `BRIDGES.md` |
| Corpus data formats | `docs/DATA-FORMATS.md` |
| Directory tour | `docs/FILE-STRUCTURE.md` |
| Listening Library and the audio manager | `docs/AUDIO-MANAGER.md` |

---

## 1. The system in one paragraph

One JavaScript/React codebase under `app/src/main/assets/` ships two ways: as a PWA on GitHub Pages
(https://votreader.github.io/app/) and inside a thin Kotlin WebView shell
(`app/src/main/java/com/votreader/sacredui/`) that is sideloaded as an APK. There is no backend and no account.
The corpora (the letters, the Bibles, the studies) are static JavaScript files. Everything a reader writes
(highlights, notes, journal, progress) stays in the device's IndexedDB and localStorage, and the only backup is
the user-owned export file (Settings, "Your Data"). Recorded audio streams from immutable GitHub Release assets.

```
             ┌──────────────────────── assets/index.html ─────────────────────────┐
  cold boot  │ app.min.css (render-blocking) → bundle-a → bundle-b → bundle-c → d │
             │ inline boot scripts: data constants, __makeLazyLoader, CSP-hashed  │
             └──────────────┬──────────────────────────────┬──────────────────────┘
                            │ on demand                    │ on demand
            corpora: bundle-a-bible / -matthew / -vot   screens: bundle-e / f / g / h
            + src/data/*.js fetched raw (studies,       (+ their screens-X.min.css)
              translations, read-along timings)
                            │
   App() (src/app.jsx) → hooks → stores (CachedStore) → IndexedDB "votreader" + localStorage
                            │
   PWA: service-worker.js caches all of the above      APK: WebView + AndroidBridge (Kotlin)
```

## 2. Modules and bundles

**Source layout** (`assets/src/`):

| Directory | Holds | Ships in |
|---|---|---|
| `src/app.jsx` | `function App()`, the composition root; an 800-line ceiling is enforced (`tools/check-app-size.js`) | bundle-d |
| `src/ui/screen-routes.jsx` | `buildScreenRoutes(deps)`: the one routes table every screen dispatches from | bundle-d |
| `src/ui/screens/`, `src/ui/components/`, `src/ui/sheets/` | screens, shared components, bottom sheets and pickers | d, or a lazy bundle |
| `src/hooks/` | App()'s hooks: navigation, tabs, pager, autoscroll, read tracking, thumbnails | bundle-b |
| `src/stores/` | the persistence layer (section 3) | bundle-b |
| `src/renderer/` | the annotation engine: highlights, underlines, notes and links painted onto text | bundle-c |
| `src/search/` | the MiniSearch engine, query parsing, ranking | bundle-e |
| `src/utils/` | pure helpers, backup, the audio player, the platform bridge | mostly b and d |
| `src/data/` | corpora and `scripture-resolution.js` (the COLLECTIONS registry) | bundle-a*, or fetched raw |

**Bundles.** `npm run build` (see `package.json`) runs `tools/build.py` for the corpus bundles (`bundle-a*.js`,
concatenated, then minified by `tools/minify-bundle.mjs`) and esbuild for the module bundles, each from its own
entry: `src/stores/_entry-b.js`, `src/renderer/_entry.js`, `src/ui/_entry-d.js`, `src/ui/_entry-e.js` through
`src/ui/_entry-h.js`. README.md "The bundle map" is the authoritative table of what each bundle holds and when it
loads. Four facts that surprise newcomers:

- **The bundles share code through `window`, not imports.** Each `_entry-*.js` copies its exports onto `window`,
  and later bundles read them as bare globals at call time, so each module has exactly one copy of its state.
  `tools/gen-eslint-globals.py` generates the lint globals that make this legal. The contract is in `BRIDGES.md`.
- **Lazy loading is one primitive.** `index.html` builds every loader with `window.__makeLazyLoader(name, path,
  finishFn, css)`. A route to a lazy screen renders `_corpusView(...)` (a loading placeholder) until the bundle has
  put the screen on `window`. Read-along timings and the Answers corpus load through `src/utils/sync-loaders.js`.
- **`--target=chrome108` is a hard contract** (CLAUDE.md, Permanent Rule 6). esbuild lowers syntax, but a runtime
  API newer than Chromium 108 needs feature detection.
- **Membership and size are gated.** `tools/bundle-membership.test.js` and its siblings pin which module lives in
  which bundle, in the built bytes. `tools/check-bundle-budget.js` holds a byte ceiling per file.
  `tools/split-lazy-css.mjs` moves CSS that only a lazy bundle uses out of the render-blocking sheet.

`dist/` is committed and CI fails if it differs from a fresh build, so every source change ships with its rebuilt
bundles.

## 3. Data flow and stores

**Read path (corpus → screen).** Corpus files define plain globals (`BOOKS`, `MATTHEW`, the VOT collections,
`BIBLE_STUDIES`). `src/data/scripture-resolution.js` holds the COLLECTIONS registry and the reference primitives
(`findBook`, `splitCompoundRef`). A screen asks the registry for an entry, the renderer (`src/renderer/`) paints
the reader's marks onto it, and `src/renderer/anchor-resolve.js` re-anchors marks when text shifts. The formats are
in `docs/DATA-FORMATS.md`, and ARCHITECTURE.md §18.1 covers the registry. A corpus edit needs a
`CORPUS_VERSION` bump in `service-worker.js` (`tools/check-corpus-version.js` enforces it), and broken text is
fixed in the data, never in the renderer.

**Write path (reader → device).**

```
 UI event → hook (src/hooks/use-*.js) → store method (src/stores/*-store.js)
          → CachedStore (src/stores/cached-store.js): in-memory cache, write-through
          → IDBAdapter (src/stores/idb-adapter.js): IndexedDB "votreader", one object store per key
            (or localStorage for the small stores that never opted in)
          → StorageHealth (src/utils/storage-health.js) hears quota/abort failures
```

- `CachedStore` is the factory that every store extends. An IDB-backed store hydrates with a `pending → loaded |
  degraded` state machine. Writes made before hydration finishes are queued and rebased onto the loaded data, and
  never overwrite it. Read the header of `src/stores/cached-store.js` before touching persistence (ARCHITECTURE.md
  §18.2).
- The `votreader` schema (`DB_VERSION` in `src/stores/idb-adapter.js`, 12 today) only grows. Each bump adds object
  stores behind an `objectStoreNames.contains()` guard and never rewrites existing data. Real readers have
  depended on it since 2026-09-26, so a migration must be additive. A database already upgraded by a newer build
  is detected with `IDBAdapter.isVersionError`.
- Separate databases hold data that is binary or disposable: `vot-journal-media` (`src/stores/journal-media-store.js`,
  journal voice memos and images), `vot-thumbs` (`src/stores/thumb-store.js`, tab thumbnails) and
  `vot-minisearch-cache` (`src/search/cache.js`).
- **Backup** is `src/utils/backup.js` plus the streaming `VOTBACK1` container (`src/utils/backup-container.js`,
  `src/utils/backup-android.js`, Kotlin `StorageManager.kt`), with a read-only verify in
  `src/utils/backup-verify.js`. `android:allowBackup="false"` is deliberate. CI runs
  `tools/e2e-restore-fresh.mjs` against a fresh profile.

**Navigation state.** Tabs, history and back behaviour live in `src/hooks/use-tabs.js`, `src/hooks/use-nav.js`,
`src/hooks/use-history.js` and `src/hooks/use-android-back.js`, and they persist through `src/stores/state-store.js`.
ARCHITECTURE.md opens with the tab state machine and the three back-pill systems.

**Hard rule for scroll.** `.screen-scroll`'s `scrollTop` has five sanctioned writers under one lease. Read the
header of `src/hooks/use-autoscroll.js` before adding a sixth.

## 4. The audio path

Audio has one engine and one queue. The deep references are ARCHITECTURE.md §23 and `docs/AUDIO-MANAGER.md`, and
the read-along wash is §22.

```
 Listen button / Listening Library (bundle-h) / mini-player (bundle-d)
        │
 src/utils/audio-player.js           the public face; the player is src/utils/audio-player/*.js,
        │                            one concern per module: queue, transport, sections, credit,
        │                            persist, restore, sleep, songs, offline, prefetch, media-session
 src/utils/audio-player/engine.js    owns the ONE media element
        ├── PWA / desktop: a real <audio>, plus the Media Session API (media-session.js)
        └── APK: src/utils/native-audio.js, a stand-in <audio> with the same properties and events
                 │  window.AndroidBridge.audioLoad / audioPlay / audioPause / audioSeek / audioRate /
                 │  audioVolume / audioUpcoming / audioRelease / audioJournal
                 ▼
            AppInterface.kt → NativeAudio.kt / NativeAudioController.kt (a Media3 MediaController)
                 ▼
            PlaybackService.kt   ExoPlayer inside a Media3 MediaSessionService (foreground service:
                                 lock screen, notification, Bluetooth, car); events return as
                                 JsEvent.NativeAudio → window.__votNativeAudio(json)
```

- **Where the URLs come from.** `src/data/audio-manifest.js` (the letters) and `src/data/bible-audio-manifest.js`
  (per-chapter Bible editions) are generated by `tools/gen-audio-manifest.mjs`. `src/utils/audio-track.js` maps a
  reading to its recording. Every URL must match one frozen prefix list, which is the trust boundary (§23.1).
- **Why native on Android.** Android 17 mutes a background app's playback unless a media foreground service is
  running, and the WebView's `<audio>` lost that service at every chapter end with the screen off. The page gives
  native the next recordings in advance (`audioUpcoming`), so ExoPlayer crosses the seam itself and reports a
  `transition`. The header of `src/utils/native-audio.js` describes the seam and the clock, and
  `NativeAudioController.kt` describes the Kotlin side. Media3's version is pinned in `gradle/libs.versions.toml`.
- **Durable state.** Per-recording resume is `src/stores/audio-positions-store.js`, Listening Library metadata is
  `src/stores/audio-library-store.js`, and kept songs are `src/stores/offline-songs-store.js`. Downloaded readings
  on the phone go through `src/utils/offline-audio.js` and `OfflineAudioStore.kt`.
- **Read-along.** The timing files (`src/data/audio-sync.js`, `src/data/bible-sync-<edition>.js`) are not bundled.
  `src/utils/sync-loaders.js` fetches them when a recording plays. `src/hooks/use-audio-follow.js` turns the page
  when the player moves on to the next reading.
- **Journal voice memos** record natively (`NativeAudioRecorder.kt`) and have nothing to do with playback.

## 5. Service worker and offline

`assets/service-worker.js` is registered by `src/utils/sw-register.js`. The header of `service-worker.js` is the
design document, and the summary is:

- **Three caches.** CORE is rebuilt on every `CACHE_VERSION` bump. CORPUS survives version bumps and clears only
  when `CORPUS_VERSION` changes, because a bump costs every client about 11 MB of downloads. SONGS holds the song
  catalog, covers and lyrics, stale-while-revalidate.
- **Versions are derived, not typed.** `npm run build` runs `tools/sync-sw-version.js`, which sets
  `CACHE_VERSION` from a content hash. `CORPUS_VERSION` is bumped by hand and gated.
- **Byte integrity.** Pages and its CDN serve unhashed filenames with a max-age. Install fetches with
  `cache: 'reload'` and verifies every core asset against `ASSET_INTEGRITY`, and it refuses an install whose bytes
  disagree. That refusal is the feature, gated by `tools/check-asset-integrity.js`.
- **Updates** are `skipWaiting` plus a `controllerchange` reload that `sw-register.js` times for a moment the
  reader cannot see.
- **CSP.** `index.html` locks `script-src` to sha256 hashes of its inline scripts. `npm run build` (`build:csp`,
  `tools/sync-csp-hashes.js`) re-hashes them, so never edit the tokens by hand, because drift causes a black screen.
- Tests: `assets/service-worker.test.js`, `assets/service-worker-1.contract.test.js`, and the e2e scripts
  `tools/e2e-sw-chrome.mjs` and `tools/e2e-update-reload.mjs`.

The APK loads the same files from its bundled assets through the WebView. `tools/check-apk-assets.js` checks that
every runtime asset survives the APK's ignore list.

## 6. Build and CI

| Step | Command | Notes |
|---|---|---|
| Install | `npm ci` | Node 22+ (`.nvmrc`), Python 3 on PATH |
| Build everything | `npm run build` | bundles, CSS split, CSP hashes, SW version |
| Preview | `python tools/preview-server.py 8090 app/src/main/assets` | loopback only, `no-store` |
| Unit tests | `npm test` | vitest, config in `vitest.config.js` |
| Lint / types | `npm run lint`, `npm run typecheck` | `eslint.config.js`, `tsconfig.json`, `tsconfig.strict-data.json` |
| Data gate | `python check_balance.py --strict` | Permanent Rules 1-3 in CLAUDE.md |
| Headless smoke | `npm run smoke:ci` | `tools/smoke-ci.js` drives `tools/smoke.js` in puppeteer |
| Android | `./gradlew :app:testDebugUnitTest :app:lintDebug` | JDK 21 |

- **Pre-commit** (`.githooks/pre-commit`, enabled with `git config core.hooksPath .githooks`) runs the gates that
  match what is staged and rebuilds `dist/` when a bundle source is staged. CONTRIBUTING.md §5 lists them in order.
- **CI** (`.github/workflows/ci.yml`) runs on every push. The `build` job runs lint, schema validation, the
  read-along and audio-manifest checks, footnote audit, `check_balance.py`, the app-size canary, typecheck,
  smoke-lite, vitest with coverage floors, a rebuild with `git diff --exit-code` on `dist/`, and then the CSP,
  corpus-version, asset-integrity, search-index, runtime-asset, APK-asset, CSS-token, bundle-budget, S22
  frame-time and type-scale gates, followed by `smoke:ci` and three e2e runs (read detector, read-along, restore).
  The `kotlin-tests` job runs JUnit 5 with Robolectric and Android Lint.
- **Deploy** (`.github/workflows/deploy-web.yml`) runs after CI is green on `main`. It picks the newest green
  commit (`tools/deploy-target.mjs`), rebuilds, confirms the committed `dist/` matches, and publishes to Pages.
  `npm run check:live` confirms which build is live.
- **APK flavours** are defined in `app/build.gradle.kts`: `daily` for the owner's phone and `debug` for test
  devices. CLAUDE.md "Operational facts" covers where they land and how to install them.

## 7. Where tests live

| Kind | Location | Runner |
|---|---|---|
| JS unit and component | `*.test.js` / `*.test.jsx` next to the source under `assets/src/` | `npm test` (jsdom; setup in `vitest.setup.js`) |
| Service worker | `assets/service-worker*.test.js`, `assets/lazy-css-loader.test.js` | `npm test` |
| Build and gate tools, bundle membership | `tools/*.test.js` | `npm test` |
| Search quality (golden queries) | `assets/src/search/golden.test.js` | `npm test` |
| Headless smoke | `tools/smoke.js`, `tools/smoke-ci.js`; described in `tools/SMOKE.md` | `npm run smoke:ci` |
| End to end (puppeteer) | `tools/e2e-*.mjs` | `npm run e2e:read`, `e2e:readalong`, `e2e:restore-fresh` |
| Kotlin (shell, bridge contract, native audio) | `app/src/test/kotlin/com/votreader/sacredui/`, for example `BridgeContractTest.kt` | `./gradlew :app:testDebugUnitTest` |
| Python data tools | `test_*.py` at the root, for example `test_check_balance.py` and `test_preview_server.py` | `python -m unittest` (CI's data-gate step) |
| Manual device walk | `tools/n1-smoke-walk.md` | by hand |

## 8. First-week pitfalls

- Edit sources, never `dist/`, and commit the rebuilt `dist/` with the source change.
- Any corpus byte change needs a `CORPUS_VERSION` bump. A coverage-only change needs `--rebaseline` and no bump
  (CLAUDE.md, "Settled calls").
- Verse ranges use ASCII `-`, and JSON delimiters are ASCII quotes. Run `check_balance.py` after batch edits.
- Adding a `window.__*` bridge means updating `BRIDGES.md` in the same commit.
- Never call `FileReader.readAsArrayBuffer` on large blobs (Permanent Rule 5).
- No analytics, no credentials, and no API key in the shipped app (CLAUDE.md, "User policies").
- Performance baseline: `docs/perf/lighthouse-2026-09.md`.

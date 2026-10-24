# VOTReader

A scripture-reading app: the Volumes of Truth letters, the Bible in several translations (restored-name editions
included), the Matthew Study Bible, doctrine studies, a journal, highlights, notes and links, recorded audio with
read-along highlighting, and the Scripture Web. One JavaScript codebase ships two ways:

- **PWA**: live, installable and fully offline at https://votreader.github.io/app/. Every push to `main` deploys it.
- **Android APK**: a thin Kotlin WebView shell (`app/src/main/java/com/votreader/sacredui/`) around the same web
  assets, sideloaded. The owner tests on the installed APK, so a change reaches the owner's phone only through an APK build
  (CONTRIBUTING.md, "Landing").

No server holds reader data and there is no account. Whatever a reader writes stays on the device; on Android,
Google backup (to the owner's own Google account) keeps one copy of the newest local snapshot (CLAUDE.md).

## Your first day

1. Read this file, then **CONTRIBUTING.md** (build, test, gates, landing, coordination), then **CLAUDE.md** (the
   agent briefing: current state, product rules, permanent data rules). Data formats: `docs/DATA-FORMATS.md`.
2. On this machine, read `D:\AgentMemory\START-HERE.md` first: twelve documents in order, ending at the live board.
   Several agent sessions work on this repo at once and coordinate through `D:\Swarm` (CONTRIBUTING.md,
   "Coordinating with parallel work").
3. Never edit `D:\VOTReader-studio` itself. It is the owner's own checkout. Make a worktree (below).
4. Build, preview, run the tests. When those are green you are set up.

## Quick start

```sh
# your own working copy, on your own branch
git -C D:/VOTReader-studio fetch origin
git -C D:/VOTReader-studio worktree add .claude/worktrees/<name> -b <branch> origin/main
cd D:/VOTReader-studio/.claude/worktrees/<name>

git config core.hooksPath || git config core.hooksPath .githooks   # the pre-commit gate: shows it, or turns it on
npm ci                        # Node 22+ (.nvmrc pins 24); Python 3 must be on PATH too
npm run build                 # every bundle, the CSS, the CSP hashes, the service-worker version
python tools/preview-server.py 8090 app/src/main/assets    # then open http://127.0.0.1:8090/
npm run test                  # vitest: the *.test.js(x) files under src/, the assets root and tools/
```

- On Windows, run npm from Git Bash. PowerShell's execution policy blocks `npm.ps1`.
- Preview only with `tools/preview-server.py`. Plain `python -m http.server` caches `dist/bundle-*.js` and serves
  stale bundles after a rebuild. The preview server sends `Cache-Control: no-store` and listens on 127.0.0.1 only.
- The pre-commit hook lives in `.githooks/`, and nothing gates your commits until `core.hooksPath` points at it.
  The first line of the block above prints the setting, or sets it on a fresh clone. On this machine it is already
  set, for every worktree (CONTRIBUTING.md §1).
- To check a boot by hand, paste `tools/smoke.js` into the page console and call `votSmoke()`. `npm run smoke:ci`
  runs the same walk headless.

## Repository layout

```
app/src/main/assets/          the app itself (web)
  index.html                  boot code, data constants, the eager bundle sequence, the lazy loaders
  app.css                     all styles; built to dist/app.min.css
  service-worker.js           the offline cache: CACHE_VERSION, CORPUS_VERSION, ASSET_INTEGRITY
  dist/                       built bundles, committed; never edited by hand
  src/app.jsx                 function App(), the composition root (800-line ceiling, enforced)
  src/data/                   corpora and the COLLECTIONS registry (scripture-resolution.js)
  src/stores/ src/hooks/ src/renderer/ src/search/ src/utils/
  src/ui/                     screens/, components/, sheets/, screen-routes.jsx, the _entry-*.js bundle entries
app/src/main/java/com/votreader/sacredui/   the Android shell (MainActivity.kt; AppInterface.kt is the JS bridge)
tools/                        build scripts, gates, smoke and e2e harnesses, alignment and audio-sync pipelines
.githooks/pre-commit          the local gate
.github/workflows/            ci.yml (every push), deploy-web.yml (main, to GitHub Pages, once its CI is green)
docs/                         subsystem docs; docs/archive/ holds finished plans
```

## The bundle map

`npm run build` writes eight bundles and `app.min.css` to `app/src/main/assets/dist/`. Four bundles load on cold
boot. Three more, the corpora, load the first time something needs them, and the search worker runs in its own thread.

| Bundle | Loads | Built from | Holds |
|---|---|---|---|
| `bundle-a.js` | cold boot | `tools/build.py` | React, ReactDOM, the Bible audio manifest |
| `bundle-b.js` | cold boot | `src/stores/_entry-b.js` | stores, hooks, the journal machinery, the platform bridge |
| `bundle-c.js` | cold boot | `src/renderer/_entry.js` | the annotation renderer |
| `bundle-d.js` | cold boot | `src/ui/_entry-d.js` | `App`, the app shell, every screen (Settings, Search and the MiniSearch engine, Garden, the tour, the Scripture Web, Personal Study and the journal, Studies and Matthew, the Listening Library), sheets, the audio player |
| `bundle-a-bible.js` | `__loadBibleCorpus()` | `tools/build.py` | the Bible corpora |
| `bundle-a-matthew.js` | `__loadMatthewCorpus()` | `tools/build.py` | the Matthew Study Bible |
| `bundle-a-vot.js` | `__loadVotCorpus()` | `tools/build.py` | the VOT collections (the volumes, the letters, WTLB, The Blessed) |
| `bundle-w.js` | `new Worker()` in `src/search/worker-client.js` | `src/search/worker.js` | the search worker (a module worker; the work is in `worker-ops.js`) |

- Code is not split; data is. The screen bundles e-h were folded into bundle-d on 2026-10-13 (lz1; the measurements
  and the reasons are in ARCHITECTURE.md, "Lazy corpora"). An old page that asks the service worker for a retired
  `bundle-[e-h].js` gets a one-time reload onto the new build.
- `index.html` makes each corpus loader with `window.__makeLazyLoader(name, path, finishFn, requiredGlobals)`, which
  injects the script once and wakes the views waiting on it. `requiredGlobals` names one global per file of the
  bundle: a script that loaded without defining them did not run, so the load fails and the route offers a retry
  (another build's copy the service worker marked as run to its end still counts; BRIDGES.md `__votOtherCorpus`).
  A route that needs a corpus (`src/ui/screen-routes.jsx`) renders
  `_corpusView(window.__bibleCorpus, window.__loadBibleCorpus, 'Loading Bible…')` until it has landed.
- `dist/app.min.css` is a plain stylesheet link in `<head>`, so it blocks first paint too.
- The screens that came from the old lazy bundles still read some shared helpers as free globals at call time.
  `tools/gen-eslint-globals.py` generates the lint globals that make this legal.
- Membership tests pin what lives where, in the built bytes: `tools/bundle-membership.test.js`,
  `tools/bundle-a-search-data.test.js`. `tools/check-bundle-budget.js` holds a byte ceiling for each file.
- The read-along timing files (`src/data/audio-sync.js`, `src/data/bible-sync-<edition>.js`) are not bundled.
  `src/utils/sync-loaders.js` fetches them when a recording plays.
- Sizes change with every landing. Measure them: `ls -l app/src/main/assets/dist/`.

## Where the docs live

| File | What it holds | Rule |
|---|---|---|
| `README.md` | this front door | |
| `CONTRIBUTING.md` | build, test, gates, landing, coordination | |
| `CLAUDE.md` | the agent briefing: "Current state", product rules, permanent data rules, the landing flow in brief | "Current state" is one dated screen: rewrite it, never grow it into a log |
| `HISTORY.md` | the narrative of landed work | prepend a dated entry for each landing, plus a one-liner in its Closed-phases index (top of the file) |
| `ARCHITECTURE.md` | deep reference: annotations, COLLECTIONS, navigation, read-along, audio, lazy corpora | |
| `BRIDGES.md` | every `window.__*` bridge between bundles | change it in the same commit as the bridge |
| `docs/` | subsystem docs: `docs/ARCHITECTURE-OVERVIEW.md` (a one-hour tour for a new developer), `docs/DATA-FORMATS.md` (the corpus data formats), `docs/FILE-STRUCTURE.md` (the directory tour), `docs/AUDIO-MANAGER.md`, `docs/OCR-PIPELINE.md`, `docs/PLAY.md` (Google Play: what is built, what is left) | a finished plan moves to `docs/archive/`, with a line in `docs/archive/README.md` |
| `tools/SMOKE.md`, `tools/n1-smoke-walk.md` | the smoke harness; the manual device walk | |
| `VENDORED-LIBS.md` | the vendored libraries and what the APK ships | |
| `AGENTS.md` | a pointer to CLAUDE.md for tools that auto-load AGENTS.md | |

## Product rules

- No credentials, login or auth. Personal data stays on the device; the export in Settings → Your Data is the only backup.
- AI features are allowed (since 2026-09-22), but no API key ever ships inside the PWA or the APK. The PWA is public.
- Anything that could leak personal data or expose a service on the network is a defect.
- Broken text gets fixed in the source data, never with a renderer workaround.

The full list is in CLAUDE.md, under "User policies" and "Permanent rules".

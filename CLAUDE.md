# CLAUDE.md — VOTReader-studio briefing

![CI](https://github.com/VOTReader/app/actions/workflows/ci.yml/badge.svg)

What every agent needs before touching code; everything else has its own file (last section, "Where everything else lives"). Landed-work history: **HISTORY.md**. Deep system reference (annotation engine, COLLECTIONS registry, navigation, audit findings): **ARCHITECTURE.md**. Build, tests, gates, landing: **CONTRIBUTING.md**. Source paths such as `src/…`, `dist/` and `index.html` sit under `app/src/main/assets/`.

**Working dir:** `D:\VOTReader-studio` is the owner's own checkout; lanes and new contributors work in their own worktree under `.claude\worktrees\` (CONTRIBUTING.md §1).

## Current state

One JS codebase ships as the Android APK and a PWA (live, installable, full-offline at https://votreader.github.io/app/). The corpus is complete across every announced edition, with whole-Bible read-along for BRM KJV and Word of Promise NKJV; the Matthew edition is **"The Scriptures of Truth (read by Benjamin)"** (Corrected Version by Timothy, with The Lord), never "Sword of Truth". For anything newer than this file, `git log origin/main` and HISTORY.md are the truth. Work coordinates through `D:\Swarm` (lane briefs, `BOARD.md`), and a green landing ships the moment its gates pass (Corbin, 09-21).

**Keep this file short** (it loads into every session): landed-work narrative goes to HISTORY.md (its Closed-phases index, then the detailed log).

**Architecture quick-facts.** `function App()` in `src/app.jsx` (≤800-line canary gate — the one line count worth trusting, because it's enforced). ~200 ES modules across `hooks/`, `ui/components/`, `ui/screens/`, `ui/sheets/` — **don't trust an exact module/line/file/byte count quoted in any doc; they drift every commit, so `ls`/`wc` the tree when you need a number** (CQ3). Every screen dispatches from `buildScreenRoutes(deps)` in `src/ui/screen-routes.jsx`. Bundles: README.md "The bundle map" is the current list (measure sizes with `ls -l dist/`; the 2026-09-01 per-bundle sizes are in docs/FILE-STRUCTURE.md); b/c/d/e + corpora minified; **`--target=chrome108` is mandatory** (Permanent Rule 6). **`dist/app.min.css` is RENDER-BLOCKING** (a plain `<link rel="stylesheet">` in `index.html`'s head), so it counts toward first paint along with the cold-boot bundles. `tools/check-bundle-budget.js` (pre-commit + CI) holds per-file byte ceilings; re-baselining is a deliberate edit to the tool, not drift. MiniSearch (bundle-e, `window.VotSearchMini`) is THE search engine. `.screen-scroll`'s scrollTop has exactly **five sanctioned writers** (the finger, scroll-restore, the pager settle, the autoscroll transport, read-along's follow) and at most one may write at a time — read the lease block in `src/hooks/use-autoscroll.js`'s header before adding a sixth.

**Operational facts (load-bearing).**
- **APKs** under `D:\VOTReader-build\<checkout>\app\outputs\apk\` (primary checkout: `D:\VOTReader-build\VOTReader-studio\...`). **The owner's phone runs `daily\app-daily.apk`** (`:app:assembleDaily`): debug's key and versionCode with debugging off, so `adb install -r` upgrades his install in place and keeps his data (ap1, 2026-09-24). `debug\app-debug.apk` (`:app:assembleDebug`) is for test devices (the S22, emulators). Never put a release-signed build on his phone: that needs an uninstall, which wipes the journal. Relocated off the OneDrive junction via `vot.buildDir`; NOT `app/build/...`. The `<checkout>` segment is derived from the checkout directory name, because every git worktree copies the same gitignored `local.properties` and would otherwise share one build directory (test XML and lint reports included). The owner tests on the INSTALLED APK — a JS fix reaches his phone only via `npm run build` → `:app:assembleDaily` → `adb install -r`, not via git push. **Install from the path your own build just wrote**, never from a remembered one: an `adb install` against a path some other checkout wrote is the failure that installs the wrong code and still succeeds.
- **CORPUS_VERSION** needs a manual bump on any `books.js` / `matthew.js` / VOT-corpus edit, or web PWAs keep stale cache (`tools/check-corpus-version.js` enforces).
- **CSP script-src is sha256-hash-locked** — after editing any inline `<script>` in index.html, `npm run build` (build:csp) re-hashes, or the pre-commit auto-fixes; NEVER hand-edit the `'sha256-…'` tokens (drift = black screen on the live PWA + WebView).
- **adb** at `C:/Users/corbi/AppData/Local/Android/Sdk/platform-tools/`; the owner's phone, a Pixel 9 Pro `51071FDAP000C8` (wireless adb; daily build); the test S22 `R5CT10JA7SY` (debug build; `D:\Swarm\tools\s22-keep-current.py` keeps it current); emulators: `vot_api34` (WebView 113) = the verification floor, `vot_api28` (WebView 69) black-screens BY DESIGN since the chrome108 lift. **gh** at `C:\Program Files\GitHub CLI\gh.exe` (authed as VOTReader).
- **Preview clean-slate** (load fresh bundles past the SW cache): `(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload();})()`
- **`VOTReader/VOTReader-studio` is a redirect-only repo** (2026-06-19), NOT the code — it JS/meta-redirects every path to `votreader.github.io/app/` (reclaiming the old Pages URL consumed the rename-alias). The live code + Pages deploy is `VOTReader/app` only; local clone of the redirect repo: `D:\_votreader-studio-redirect` (disposable).

## Settled calls

The one-line index of every landed phase (with commit hashes) heads **HISTORY.md** ("Closed-phases index"). Calls settled there, not to be reopened without new evidence: when the corpus lock's coverage grows but no corpus byte changed, `--rebaseline` it and never bump `CORPUS_VERSION` for coverage (a bump costs every client ~11 MB); the restored-name NT overlays (NKJV-R, KJV-R) come from the deterministic `tools/gen-restored-nt.mjs` — never hand-edit its outputs; peeks into a mixed-format collection (Holy Days) gate on SHAPE, not just resolution; the service worker refusing an install whose bytes disagree with `ASSET_INTEGRITY` is the feature; content-hashed filenames were deliberately not done; the brace-expansion "high" advisory is a false positive, do not chase it; the skim indicator ([21]) is held until Corbin asks for it.

## User policies (durable directives, override defaults)

- **App name is "VOTReader"** (personal app; multi-user-shaped but no auth, no organization).
- **AI features are ALLOWED** (Corbin 2026-09-22 retired the 2026-05-11 no-AI rule) within three security limits every feature keeps: no credentials, login or auth anywhere; personal data stays on the device; **no API key ever ships inside the PWA or the APK** (the PWA is public, so a key in it is a leak; Corbin 09-02). The retired LiteLLM nim-proxy stays retired.
- **Anonymous usage counts (us1, Corbin 2026-09-24):** `src/utils/usage-stats.js` sends day-counts to the `stats/` Worker (stats.votreader.workers.dev): ids, kinds and tags only - never a device id, search words, error text or anything the reader wrote - with a first-run notice and an off switch in Settings > Your Data. A new counter needs its name in `usage-schema.js` (both sides read it).
- **NO security risks** — anything that could leak personal data or LAN-expose a service is a defect, not a polish item.
- `android:allowBackup="false"` — Export/Import in Settings → "Your Data" is the only backup mechanism. JSON file, user-owned, no credentials.
- GitHub identity **VOTReader** (the repo is public, for GitHub Pages) and Garden images on `VOTReader/votreader-assets` releases are fine for now.
- No Play Store thinking until everything else is done — would also require Timothy's permission first.

## Permanent rules (never violate)

1. **Verse ranges always use ASCII hyphen `-`**, never en dash `–` or em dash `—`. Affects `chapter:verse-verse` strings in keys, refs, labels, cites — anywhere the renderer parses a verse range. The em dash is fine **only** as separator in compound nkjv values: `"Exodus 12:6 — verse text | Exodus 12:18-20 — verse text"`.
2. **All JSON-style delimiters are ASCII `"`** (or `'` if you must). Smart quotes go INSIDE string values only, where they're typographic content. If a string value contains a literal ASCII `"`, escape it: `\"`.
3. **Run `check_balance.py` after every batch edit.** Single-file edits via `Edit` tool generally don't introduce these, but agent-generated content frequently does (especially OCR-style transcription). The versioned pre-commit hook at `.githooks/pre-commit` does this automatically when any `app/src/main/assets/src/data/*.js` is staged, and runs `npm run build` to regenerate bundles when any bundle-source file is staged. Emergency bypass: `git commit --no-verify` (not recommended).
4. **Footnote NKJV text uses decimal verse markers** (`"19. text 20. text"`) for multi-verse refs, never Unicode superscripts (`¹⁹text ²⁰text`). The `verse-sup` gold inlay rendering only fires when the decimal or superscript-with-clean-range strategy succeeds. Mixed formats fall through to the white-text fallback.
5. **Blob consumption: never `readAsArrayBuffer()` for large data.** Use `URL.createObjectURL(blob)` for audio/video playback and image display. Use `blob.stream()` for streaming reads. Use `blob.slice()` for partial reads. NEVER use `FileReader.readAsArrayBuffer()` or `FileReader.readAsDataURL()` on blobs >1 MB — it loads the entire blob into heap and will OOM on budget devices (2-3 GB RAM). The only exception is the export path (W2.6), which processes blobs sequentially with explicit size guards.
6. **esbuild targets `--target=chrome108`** on build:b/c/d/e/css + the corpus/data minify (`tools/minify-bundle.mjs`); the floor is a HARD contract for **runtime APIs**. esbuild lowers too-new *syntax* to 108 but cannot polyfill a runtime API newer than Chromium 108: guard it with feature detection or bump the floor deliberately, because an unguarded one is a silent black screen on a sub-floor device. Verify boots on desktop Chrome (`smoke:ci`) or a modern-WebView emulator; `vot_api28` (WebView 69) black-screens by design. (The 2026-06-03 lift from chrome69 is in HISTORY.md.)

## Editing principles

1. **No regex at file scope.** User has been burned by this. Local string replacements only.
2. **Preserve other letters.** When editing letter N in a multi-letter file, only touch letter N.
3. **No new Holy Days originals.** Holy Days is curated cross-references; do not author new content.
4. **Format-preserving.** Volume Two uses unquoted JS keys (`id: "..."`); old volumes use quoted JSON-style (`"id": "..."`). Match the file's existing format.
5. **No bandaid renderers.** If text is broken, fix the source data, not the renderer.
6. **Footnote audience:**
   - Volumes (Format A) → numbered gold bubbles → tap → bottom sheet w/ NKJV verse
   - WTLB / Blessed (Format B) → inline `(Book X:Y)` parenthetical cite → tap → bottom sheet w/ NKJV verse
   - Holy Days entries inherit Format A or B based on `entry.type`

### Anti-patterns (NOT to do)

- Run regex `sed`/`grep -E` at file scope to "patch" footnotes
- Add a CSS bandaid for white verse numbers — fix the data or renderer instead
- Author new Letters that don't exist on the live website
- Use Hidden Manna entries in any public index, search, or home tile (Hidden Manna is reachable only via the Matthew study chain)
- Add `metaAddendum` fields to letters that don't have an "Also read" on the live site
- Change Volume Two's format (it's the gold standard)
- Mix numbered footnote bubbles with inline `(Ref)` cites in the same letter

**Holy Days = ghost album**: curated cross-references pulled from the other volumes (each entry carries a `sourceLabel`). Collection shapes, counts and notes: docs/DATA-FORMATS.md.

**CRITICAL:** Only edit files in `app/src/main/`. Never touch `app/build/`. Never edit an `app.OLD-*` backup.

## Gates, landing, and what the pre-commit hook refuses

Gates on every commit (pre-commit + CI): build, lint `--max-warnings 0`, typecheck, vitest + coverage floors, Kotlin `testDebugUnitTest` + lintDebug + JaCoCo floor, headless smoke:ci, check_balance, schema-validate, audio-sync, corpus-version, CSP-hash, asset-integrity, bundle budget, ≤800-line app.jsx canary; counts drift — verify with the runners. The full flow is CONTRIBUTING.md §5.

- **Land:** `git fetch origin && git rebase origin/main` (linear, never a merge commit) → `git push origin HEAD:main` → watch **both** CI and Deploy Web to green (`gh run list --commit $(git rev-parse HEAD)`, then `gh run watch <run-id> --exit-status`; Deploy Web starts only after CI is green: `gh run list --workflow=deploy-web.yml --limit 3`) → `npm run check:live` must print `LIVE AND CURRENT`, or `LIVE (INCLUDED)` when a later main commit containing HEAD is serving (it names the branch; read it). Then post one DONE line with the hash (`D:/Swarm/post.sh`, CONTRIBUTING.md §7). One logical change per commit; conventional subjects (`feat(scope): …`, `fix(scope): …`, `docs: …`).
- **Stage whole, or stash:** the hook refuses a commit whose bundle sources have unstaged edits (its gates and the rebuild read the working tree; pc2, v12-04). It rebuilds `dist/` *before* vitest, so an `index.html` / `manifest.json` / `offline.html` edit needs no hand build first (the old order trap, v12-03). Staged Scripture Web source runs `check:s22`: a stale S22 measurement only warns (here and in CI; the S22 must never block), a scene over budget fails. Never kill the hook mid-`lint-staged`: it leaves the staged content in the working tree and a backup in `git stash`.
- A docs-only commit runs only the APK-asset and `ASSET_INTEGRITY` checks. `git commit --no-verify` skips the hook; CI then fails the same gates on `main` after the push.

## Quick start: app failed to load? read this first

If the app shows a black screen, run the validator:

```bash
py -3.13 -m pip install -r requirements-dev.txt   # one-time (esprima)
py -3.13 check_balance.py --strict                 # from the checkout root
```

It esprima-parses every data file and flags en/em dashes in verse ranges and smart-quote delimiters (Permanent Rules 1-3).

### Black-screen failure modes seen in this project

| Symptom | Root cause | Example | How to detect |
|---|---|---|---|
| Black screen at app start | Unescaped `"` inside JSON string value | `"Psalm 50:7": ""Hear, O My people..."" ` | esprima parse error |
| Black screen at app start | Unicode smart quotes used as delimiters | `"t": "text",` | esprima / `check_balance.py` |
| Verse numbers render as **white inline text** instead of gold sup | En dash `–` instead of hyphen `-` in verse range | `Exodus 12:18–20` | `check_balance.py` dash check |
| Footnote sheet shows blank cite | Translation tag mismatch in `nkjv` dict key | `"John 14:6 (CJB)"` not in nkjv | manual verify |
| Tap-through to wrong letter | Letter-link `letterTitle` misattributed | linked to "Subject to No Man" but content is from "A Just God and A Savior" | `misattribution_check.py` |

## Working-directory health check (fresh clone or new worktree)

`git config core.hooksPath .githooks` activates the pre-commit hook (on this machine it is already set, for every worktree); `npm ci` (Node 22+, esbuild 0.28+); `npm run build` proves the pipeline. Preview only via `tools/preview-server.py` (`.claude/launch.json` points the preview tool at it), NOT plain `python -m http.server`, which caches `dist/bundle-*.js` heuristically and serves stale bundles after a rebuild. The preview server sends `Cache-Control: no-store` and binds **127.0.0.1 only** (`test_preview_server.py`, pre-commit + CI): a dev server that can LAN-expose the tree is a defect, so don't add a host flag. Smoke by hand: paste `tools/smoke.js` into preview_eval (or the page console) and call `votSmoke()`; expect PASS: globals ok, data ok, screens 0 crashed, letterAnn ok, wtlbAnn ok, console.error 0, resource404 0. Node missing on Windows: `winget install OpenJS.NodeJS.LTS`. Use bash/git-bash for npm (PowerShell's execution policy blocks `npm.ps1`).

## Where everything else lives

| File | What it holds |
|---|---|
| `docs/DATA-FORMATS.md` | data formats A-D, collection by collection, and the letter counts vs. the live website |
| `docs/FILE-STRUCTURE.md` | the directory tour and the 2026-09-01 per-bundle sizes |
| `HISTORY.md` | the Closed-phases index, then the detailed session log |
| `CONTRIBUTING.md` | worktrees, build, tests, the gate order, landing, the APK path, coordinating through `D:\Swarm` |
| `README.md` | the front door: quick start, repository layout, bundle map, doc map |
| `ARCHITECTURE.md` | deep reference: annotations, COLLECTIONS, navigation, read-along, audio, lazy corpora |
| `BRIDGES.md` | every `window.__*` bridge; change it in the same commit as the bridge |
| `D:\Swarm\PROTOCOL.md`, `D:\Swarm\BOARD.md` | the agent network's rules and its board |

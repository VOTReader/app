# CLAUDE.md — VOTReader-studio briefing

![CI](https://github.com/VOTReader/app/actions/workflows/ci.yml/badge.svg)

What every agent needs in 30 seconds. For landed work history, see **HISTORY.md**. For deep system reference (annotation engine, COLLECTIONS registry, navigation, audit findings), see **ARCHITECTURE.md**.

**Working dir:** `D:\VOTReader-studio`. The C: OneDrive path is legacy — `C:\Users\corbi\OneDrive\Desktop\VOTReader-studio\app` is a Junction → `D:\VOTReader-studio\app`. Always edit D: files.

---

## Current state (2026-09-03)

**Where things stand.** The app is feature-complete and shipping: one JS codebase runs as the Android APK and as a desktop PWA (live + installable + full-offline at https://votreader.github.io/app/); work is owner-reported fixes, polish, and the read-along. Latest landed: **c42** (`517f85b2`, 2026-09-02) — the whole Bible paints verse by verse (BRM-KJV: 1,189 chapters, 31,061 of 31,102 verses timed), after c40 (John) and c41 (the letter timings became a lazy `src/data/audio-sync.js`, fetched only while a recording plays). Open owner calls: whole-verse vs sub-verse Bible highlighting (decide after watching a chapter, not in the abstract), and whether Word of Promise / WEB get the same full-Bible alignment (~28 h of GPU each). The letters batch resumes where it stopped with `py -3.13 tools/batch-align.py --volkeys flock,rebuke,holydays,two`. The owner tests on the INSTALLED APK — nothing reaches his phone without `npm run build` → `:app:assembleDebug` → `adb install -r -d`. Gates on every commit (pre-commit + CI): build, lint `--max-warnings 0`, typecheck, vitest + coverage floors, Kotlin `testDebugUnitTest` + lintDebug + JaCoCo floor, headless smoke:ci, check_balance, schema-validate, audio-sync, corpus-version, CSP-hash, asset-integrity, bundle budget, ≤800-line app.jsx canary; counts drift — verify with the runners. History lives in `git log`, HISTORY.md (the detailed session log) and the Closed-phases index below.

**HANDOFF PROTOCOL (changed 2026-07-24):** this section stays a SHORT summary — CLAUDE.md auto-loads into every session, so its size is paid every conversation. The detailed narrative entry for each landed session is **PREPENDED to HISTORY.md** (under "Detailed session log"); add a one-liner to the Closed-phases index below. Do not grow this section back into a log.

**Still owed (owner/device-side; nothing blocking):**
- Owner re-import of his own backup to confirm data lands (his device went offline mid-verify 2026-07-22). **Needs HIS backup file — not agent-doable.**
- Batch-4/5 on-device checks: recording pauses/resumes other audio (OEM-sensitive); a legacy `.votbak` import. *(splash→UI black flash + pre-paint white flash: **VERIFIED CLEAN 2026-07-30** by frame analysis of a real cold boot — see HISTORY.md. Edge glow is guaranteed by `overScrollMode = OVER_SCROLL_NEVER`, MainActivity.kt:573.)*
- Standing manual device walks: `tools/n1-smoke-walk.md` (U1/U7/U9, N2.2–N2.5, Garden zoom).
- Owner decisions pending: the 5 Lamb-of-God PDF illustrations absent from the app (source PDF gone). **[19] golden search suite needs the owner's real search vocabulary** (10–15 queries he actually uses), **[20] device-walk day needs his time**, and **[21] the skim indicator is explicitly held until he asks**.
- Optional tracks: measurement follow-ons [22]–[30] (translation facts [25] already shipped; [26] is partly shipped), W10 TalkBack depth, and restored-names phase 2 (OT YAHUWAH).

**Architecture quick-facts.** `function App()` in `src/app.jsx` (≤800-line canary gate — the one line count worth trusting, because it's enforced). ~200 ES modules spread across `hooks/`, `ui/components/`, `ui/screens/`, `ui/sheets/` — **don't trust an exact module/line/file count quoted in any doc; they drift every commit, so `ls`/`wc` the tree when you need a number** (CQ3). All 59 screens dispatch from `buildScreenRoutes(deps)` in `src/ui/screen-routes.jsx`. **9 bundles** in `dist/` (sizes re-measured 2026-09-01 — `ls -l dist/`, decimal KB; `check-bundle-budget` holds ceilings but re-measure rather than quote): `bundle-a` 251 KB raw (react/react-dom + matthew-nkjv + the shared `search-data.js` index source — critical path; books-restored/matthew-plain moved to a-bible 2026-08-02, −353 KB); `bundle-a-bible` 5.0 MB / `bundle-a-matthew` 492 KB / `bundle-a-vot` 2.26 MB (lazy corpora via `__load*Corpus()`, minified; the read-along timings left a-vot 2026-09-01, −402 KB, and are a lazy `src/data/audio-sync.js` of 498 KB fetched only while a letter recording plays); `bundle-b` 321 KB (stores/hooks/journal/scripture-resolution/platform-bridge/StorageHealth/SW/DiagnosticLog); `bundle-c` 19 KB (renderer); `bundle-d` 533 KB (most screens/sheets/utils incl. backup.js/App/AppShell + the read-along timing loaders); `bundle-e` 116 KB (lazy Settings/Search/Garden screens via `__loadScreensE()`, precached for offline); `bundle-f` 59 KB (the Scripture Web). b/c/d/e + corpora minified; **`--target=chrome108` is mandatory** (Permanent Rule 6). Cold-boot blocking path (a+b+c+d) ≈ 1.12 MB of JS — plus **`dist/app.min.css` 268 KB, which is RENDER-BLOCKING** (a plain `<link rel="stylesheet">` in `index.html`'s head, index.html:93), so the true first-paint budget is ≈ 1.39 MB. Bundle growth is now WATCHED: `tools/check-bundle-budget.js` (pre-commit + CI, C2-D) holds per-file byte ceilings ≈15% over their measurements (14 rows on 2026-09-01, including the raw `src/data` timing files) — re-baselining is a deliberate edit to the tool, not drift. MiniSearch (bundle-e, `window.VotSearchMini`) is THE search engine — Classic/FlexSearch retired 2026-07-02. `.screen-scroll`'s scrollTop has exactly **five sanctioned writers** (the finger, scroll-restore, the pager settle, the autoscroll transport, read-along's follow) and at most one may write at a time — read the lease block in `hooks/use-autoscroll.js`'s header before adding a sixth.

**Operational facts (load-bearing).**
- **Debug APK** at `D:\VOTReader-build\app\outputs\apk\debug\app-debug.apk` (relocated off the OneDrive junction via `vot.buildDir`; NOT `app/build/...`). **Never** `Remove-Item -Recurse` the C: junction — it follows into D: and deletes real files. The owner tests on the INSTALLED APK — a JS fix reaches his phone only via `npm run build` → `:app:assembleDebug` → `adb install -r -d`, not via git push.
- **CORPUS_VERSION** needs a manual bump on any `books.js` / `matthew.js` / VOT-corpus edit, or web PWAs keep stale cache (`tools/check-corpus-version.js` enforces).
- **CSP script-src is sha256-hash-locked** — after editing any inline `<script>` in index.html, `npm run build` (build:csp) re-hashes, or the pre-commit auto-fixes; NEVER hand-edit the `'sha256-…'` tokens (drift = black screen on the live PWA + WebView).
- **adb** at `C:/Users/corbi/AppData/Local/Android/Sdk/platform-tools/`; test device `51071FDAP000C8`; emulators: `vot_api34` (WebView 113) = the verification floor, `vot_api28` (WebView 69) black-screens BY DESIGN since the chrome108 lift. **gh** at `C:\Program Files\GitHub CLI\gh.exe` (authed as VOTReader).
- **Preview clean-slate** (load fresh bundles past the SW cache): `(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload();})()`
- **`VOTReader/VOTReader-studio` is a redirect-only repo** (2026-06-19), NOT the code — it JS/meta-redirects every path to `votreader.github.io/app/` (reclaiming the old Pages URL consumed the rename-alias). The live code + Pages deploy is `VOTReader/app` only; local clone of the redirect repo: `D:\_votreader-studio-redirect` (disposable).

## Closed phases — full detail in HISTORY.md

Reverse-chronological; each landed CI-green + deployed.

- **Read-along made trustworthy** (08-26 s14) — the drift was deterministic, not occasional: six volumes still carried offsets measured against a text domain the renderer stopped producing in August. One shared text domain, a word-boundary gate on every commit, a browser harness that finally compares the offline domain against the DOM, the sentence scanner fixed (U.S.A. shredded, El! never painted), unproven clauses now painting, Bible read-along built verse-level, Format B lifted from whole-paragraph to line-level behind a two-part corpus sweep, and the batch runner cured of the process exhaustion that killed it at letter 26. c36.
- **Integrity-verified precache** (08-11 s12c) — `install()` hashes every CORE text asset and refuses a build whose bytes disagree with the generated `ASSET_INTEGRITY` map (written by `sync-sw-version.js` in the same loop as `CACHE_VERSION`, so they cannot describe different builds); on mismatch it refetches once then THROWS, so the old worker keeps serving and the browser retries — **failing the install is the feature**. Chosen over content-hashed filenames. A 25-agent pre-flight review caught the first draft leaving **`'./'` — the boot document — unverified** (it has no extension; a desktop visit to `/app/` was served unverified while the PWA's `./index.html` was checked); it now borrows index.html's hash, **measured** identical on live Pages down to the ETag. Also fixed: overclaiming scope comments (the ~10 MB corpus is NOT covered — that's `CORPUS_VERSION`'s job), double-reads, silently-dropped missing assets, duplicate markers, and a **vacuous test** that passed with verification disabled. New `tools/check-asset-integrity.js` re-derives hashes independently of whatever wrote the map — closing a hole `git diff` is structurally blind to — and `service-worker.js` finally triggers the pre-commit rebuild (it matched none before, so editing it ran no gates at all). Verified in production: 12/12 live assets match their published hashes.
- **Three stale-artifact gates** (08-11 s12b) — the APK/PWA divergence gate (`deploy-web.yml` re-diffs committed `dist/` against its own rebuild, so one SHA cannot ship two different codebases); `MS_INDEX_VERSION` enforced by `tools/check-search-index-version.js` (the ~21 MB MiniSearch index lives in IndexedDB, so a stale one survives a hard reload AND clearing Cache Storage); the 61 reading fonts folded into the corpus fingerprint (they were in NEITHER version). All RED-proven, wired into pre-commit + CI + deploy. Corpus lock **re-baselined at c32** (coverage grew, no byte changed) via the new `--rebaseline` path — never bump for coverage, it costs every client ~11 MB. **Content-hashed filenames deliberately NOT done:** measured that Pages purges its edge atomically on deploy (`age=0`/`MISS`/one ETag stamp), so the failure it guards does not reproduce; see HISTORY for the cheaper integrity-precache alternative if ever revisited.
- **"Updates don't push" — the cache was innocent** (08-11 s12) — the stale-PWA report root-caused to an unpushed branch (live 404s on bundle-f + the graph data) with the SW update chain proven healthy under real Pages headers; build identity surfaced (SW `GET_VERSION` → Settings "App version"), update-ready Reload affordance, `paths:` deploy filter deleted so every push publishes, deploy-staging hole derived+gated, SW corpus routing generalized, `pre-commit` stages `bundle-f.js`, `npm run check:live`; 73-agent audit (24/34 confirmed) established that query-string busting cannot work on Pages.
- **The Scripture Web** (08-11 s11 → s13 UX uplift) — OpenBible/TSK dataset vendored (CC-BY); runtime Famous is 63,418 links (votes >=7), Essential is votes >=20, plus 2,098 curated corpus edges; the obsolete Complete surface is gone. WebGL2 instanced renderer with the height law shared between shader and hit test; chunk-culled multi-candidate picking; density/colour modes; dual-rail My Web on LinkStore; lazy bundle-f + Library tile; Go to/Nearby/location context; navigable corpus underlay; focus/a11y and phone fallback polish; c33.
- **Campaign 2** (08-10 s10) — triple recon worked to zero in four gated waves: listening truth (book-scoped queues, real continuation queues, honest play counts, Bible listening earns credit, in-player voice picker + switch warning); truth-and-copy (About egress truth, ARCHITECTURE §23, one milestone engine); reading-path coherence (modal-registry sheet, honest fallback labels, History resume chips, commentary-weight chip, a11y batch, sort modes wired); safety nets (coverage floors in pre-commit, bundle byte-budget gate, JaCoCo widening, backup STORE_NAMES parity leg + 3 rescued stores, cross-tab readItems merge, phantom `--border` + css-tokens gate).
- **The audio campaign** (08-10 s9) — BRM chapters cut at verified boundaries (c28) + resume migration; WEB third voice (c29); per-track resume store (IDB v10) + scrub commit-on-release; transport semantics; desk whole-queue chapter picker + in-player voice switching; Listening settings group, My Progress listening cells, History search + chips, Milestones hygiene; read-along lease governance; hygiene/parity gate.
- **Lamb of God illustrations + system media card** (08-09 s8) — 7 PDF-restored illustrations as study-image blocks (c27, PDF-faithful placement, preview-verified); native MediaSessionCompat + MediaStyle card for streaming audio (edge-driven metadata mirror, pause keeps the card, contextual POST_NOTIFICATIONS); on-device verify owed.
- **External audit round 2** (08-09 s7) — 6 NewApi lint errors fixed (one real API 26-29 boot crash: `Context.getDisplay` in the frame-rate vote), lintDebug into CI's kotlin job; export open-throws delete hole closed (RED-proven); Android 12+ dataExtractionRules/fullBackupContent pair; dev-dep audit patches; deploy gate + check_balance/smoke-lite; OCR scripts repointed; 3 findings no-actioned with reasons (v3 aggregate cap, encryption at rest, maintainability).
- **Listening Library campaign** (08-09 s4) — reader-choice renditions (AUDIO_ALTERNATES, 45 letters/48 assets mirrored), forward-only queues with persisted horizon, home card (order stores merge-tolerant first), browse-to-recordings (audio-library-collection + audio-library-saved screens, navOrigin chaining), honest play counts, type-scale reference gate, bar/sheet test coverage + 3 defect fixes, interrupted-batch rescue; c24.
- **The Word of Promise edition** (08-09 s6) — dramatized NKJV, 1,189 per-chapter MP3s across TWO tags (`audio-wop-v1` OT / `audio-wop-v2` NT — 1,000-asset cap), testament digit in the asset name picks the tag; trust boundary generalized to a frozen `RELEASE_PREFIXES` list; per-chapter parts expanded by a ~1 KB manifest loop; `playBibleBook()` branches on edition SHAPE (startPartIndex horizon vs whole-book seek); c26.
- **Bible chapter-level listen** (08-09 s5) — `BIBLE_AUDIO_CHAPTERS` 1,189-row seek index into the whole-book BRM tracks (bundle-a, ~14 KB), `loadedmetadata` seek + zero-fallback for uncovered rows, per-chapter Listen pill; every timestamp cross-checked by an independent belt (39 real errors caught among 205 arbitrated probe failures); c25.
- **Whole-book Bible audiobooks** (08-09 s3) — BRM complete KJV, 66 book MP3s on the new `audio-bible-v1` release tag; two-prefix trust boundary (since generalized in s6) + editions registry; playBibleBook whole-edition queue; Listen pill on bible-idx/matthew-idx/BibleChapterView; Settings Bible Audio select; prefetch skips whole-book tracks; live-verified on the deployed PWA; c23.
- **Seven-front owner batch** (08-09 s2) — bookmark flood store fix + index flags, Library discoverability tiles, 84-achievement Milestones screen, listened-to-end read counts, native foreground media service, every study surface annotatable, study History branch-order fix.
- **Listening Library + listening desk** (08-08) — external contribution adjudicated: manager sheet (speed/sleep/queue editor), audio-library screen, AudioLibraryStore (IDB v9) in backup; 4 review fixes incl. the load-algorithm playbackRate reset; live-verified.
- **Streaming audio letters** (08-05/06) — 729/729 letters mapped (Benjamin-supersede + reader ranking), hero Listen pill + Play All + WTLB section chips + mini-player queue bar, Media Session, screen-off keep-alive bridge, offline toast; streams from the votreader-assets `audio-v1` GitHub release (Drive 403s cross-site sec-fetch — dead end, documented); manifest + mirror pipeline; ✦ ornament under standalone closings; corpus c20.
- **One type scale + history race** (08-04 s4) — 103 hand-picked font sizes → a 13-step ladder in one `:root` block driven by one setting, 10px floor, gated by `check-type-scale.js`; `useNavHistoryTracking` no longer drops visits whose lazy corpus arrives after navigation; Scriptures layout cycler pulses.
- **Owner retirements** (08-04 s3) — backup-freshness boot reminder deleted whole (hook, Settings toggle, `lastExportAt` stamp, CSS); frontier resume jump deleted so scroll-position resume owns reopening again (frontier data still recorded for the held skim indicator); e2e assertion inverted + made non-vacuous.
- **Review-of-the-review + toolchain lift** (08-04 s2, `7db418e..7f4a903`) — prior session's unpushed commits deployed; TS7 + jsdom 30; SearchScreen race guards; 5 verified defects in the prior a11y batch fixed + sibling dialog/trap closures; backlog [27]+[28]; eslint 10 documented blocked.
- **Adversarial handoff review + whole-app loop** (08-04, `e4c9f2a..b750a33`) — backup limit/restore-guard hardening; reading/frontier/compact-progress coherence; keyboard/modal coverage; 360px toolbar + dual-viewport smoke contract; delayed-scroll lifecycle fix; live mobile/desktop QA; 3,356 vitest + 237 Kotlin + full web/native gates.
- **Reading-measurement engine** (08-03 s2) — word-count module + corpus baseline gate, geometry-sweep read detector (3 vectors, hl-key-keyed), count-valued readItems, ReadingStatsStore (IDB v8) + frontier resume, My Progress words/pace/day-bars + index minute chips; 17-agent review → 12 findings fixed (detector rebuilt off IO); E2E-proven live; skim indicator held (BACKLOG [21]).
- **Desktop width model** (08-03, `5a8381e`) — 24 inner caps px→rem (root-tier-proportional; mobile byte-identical; ~constant reading measure), 1600+ shell 980→1040, smoke-ci 1920×1080 + overflow tripwire; Sol's rail/grid/4K items deferred as future strikes.
- **GPT 5.6 Sol uplift batch adjudicated** (08-02 s3, `63562d0`) — backup staging-store atomicity + cross-tab lock + salvage-mode v3 restore (owner: 99% > 0), native recording lifecycle lock, log redaction, Garden HTTPS-per-hop, a11y sweep; review caught 2 P1s (content-masking aria-labels, Clear-All mutex hole) + withdrew 1 false finding; 3,242 vitest / 237 Kotlin.
- **Recon-driven strike run** (08-02 s2) — Opus 5 recon ranked 5 strikes, coordinator verified (caught 2 recon errors) + executed: cold boot −27% / bundle-a −59% (c19), use-settings + JournalInsertSheet first coverage (46 tests), SW install 4-concurrency, mode-toggle column pin (cascade trap), App() 800→769, −2 KB dead CSS.
- **SheetHandle + desktop viewport + 300% text** (08-02) — one grabber module closes every sheet (bar + ‹ chevron, 9 sites, 3 CSS classes retired), `--col-max` desktop tiers w/ composed font boost, Text Size cap 300% + full spill sweep, 44px footnote pager; 4 review-confirmed defects fixed same-session.
- **Reading Font picker + Settings accordion** (07-31) — 25-font `READING_FONTS` registry, all vendored in-app (1.73 MB `fonts/reading/`, stable-cache SW route, scripture-first order, SelectField dropdown), `--font-body` var plumbing; Settings → 8 collapsed accordion groups, dependent rows unmount.
- **About page 2 terse rewrite** (07-31, `2b0593d`) — onboarding features page → two headed groups, ~60 words, ten-translation count fixed.
- **Six-item UX batch** (07-30/31, `5f3e8c7`) — LibraryNav becomes THE top-nav (19 navs → 3; the small-back-arrow report was two root causes: LetterView's `nav-volume` cascade loss + `_idxNav` never adopting the icon back); drilled notebook header split into two rows; back pill everywhere but History (`journalEntryId` as the 7th tracked field, `backHint`/`backActive` split for `silent` History entries, journal-viewer one-pill precedence, back-stack machine finally tested); shared `splitCompoundRef` makes compound refs tap through per-part + note-row per-segment taps; ScripturesHome layout-cycle button sharing Settings' state; autoscroll dwell stepper on the pill + a MEASURED wpm replacing the ×9 guess (the naive per-line map would have shipped ~2000 wpm on block-level letter paragraphs). 3,140 vitest.
- **External-review run** (07-30) — 3 review batches adjudicated + the last reachable backlog items, 10 commits. Edge auto-scroll runaway fixed (band re-probed per tick); SW `clients.claim()` **and** the first-load reload regression it caused (broke smoke:ci); import-integrity warnings widened + retimed; journal `{{ref:}}` retry no longer outlives the screen; `allowContentAccess` **dropped, proven on-device**; Actions SHA-pinned + Dependabot; deps patched (brace-expansion "high" = advisory false positive, do not chase); the pre-commit vitest flake root-caused (passive-effect race) after standing open since 07-22; note-source +25 tests; **[17] 200% zoom audit passes**; splash black-flash check verified clean.
- **Selection scrolling** (07-29) — owner-reported "highlight locks scroll": P1-15's premise disproved on-device (identical drag scrolled 192px with AND without a selection); real cause was a toolbar placed once and never moved. Toolbar now re-places on every scroll frame (1:1 verified), native handle-drag auto-scrolls at the edge bands (`computeEdgeAutoScroll`), ▲/▼ nudge row retired; also fixed the assist-scroll yanking the reader ~2000px back on release.
- **Backlog run** (07-28, session 2) — FABLE5-BACKLOG cleared in one gated run: [15] Backup Verify, [13] focus traps, [8] search chips+sort, [9] index-screen scope chip, [16] journal delete undo, [7] tab rename+pin, [11] notebook colors, [12] Holy Days Year view, [10] True Black (dark-modifier, not a 3rd theme), [14] app.jsx tsc + ScreenRouteDeps contract, [18] ARCHITECTURE addendum; ~45 tests; [17]/[19]/[20] skipped with reasons in the backlog.
- **Responsiveness session** (07-28) — input lag root-caused on-device (thumbnail renders landing on interactions): calm gate + scroll-stop capture retired (15.9s → 0.14s blocked per 2-min read); single-allocation PixelCopy screenshot; unscrollable center-modal fix; external review adjudicated (1 done / 2 discarded / 1 already shipped). Round 2: "choppy" = WebView surface at 60 Hz on the 120 Hz ARR panel — `requestedFrameRate` peak vote (API 35+) + backdrop-blur purge on scroll-covering chrome; blue search-cancel × suppressed; root cause was Battery Saver's 60 Hz cap (votes deliver 120 once it's off). Then FABLE5 [15] landed: Settings "Verify a Backup" read-only .votbak inspector (full read path + CRC, applies nothing).
- **Import-hang fix** (07-22) — the "Importing… please wait" freeze = a Wave-0 confirm-sheet fire-and-forget regression; the confirm is now fire-AND-AWAIT; `v3ImportVerify` size-bounded; root-caused + verified on-device.
- **Native batches 1–5 + APK asset purge** (07-22) — five adjudicated external native reviews: cookies off, splash app-ready handshake + liveness hatch, trim-memory + JS trim signal, Garden stream-to-disk + redirect SSRF guard, voice-memo fetch bridge, manifest-cap OOM fix, recording audio focus, pre-allocated import buffer, scale-restore, v3 backup CRC-32 integrity; ~38 MB dead APK assets excluded + the `check-apk-assets` recurrence gate (after the `<dir>src` pattern silently dropped 9 translations — corrected same-day).
- **REVIEW-FIX batch** (07-22) — external deep review, 13/13 adjudicated + closed (tracker `REVIEW-FIX-2026-07-22.txt`); per-keystroke persist debounced at the sink; use-tabs CRITICAL INVARIANT 1 pinned.
- **Auto-scroll transport** (07-21/22) — hands-free reading (lines/min speed, `.reading-end` sentinel target, the scrollTop lease) + round 2 (2/3-viewport reading-zone stop, 0–15 s dwell slider, settings collapse-not-disable) + the SettingsScreen test harness (73-global classic-script seam paid once).
- **Holy Days crash killed** (07-21) — the app's one mixed-format collection needed format-gated peeks (WtlbEntryView vs LetterView) + `_wrapVot` on 2 bare routes; peeks must gate on SHAPE, not just resolution.
- **Corpus faithfulness audits complete** (07-19/20) — header lines restored (c15), studies swept (c16), restored-name title re-audit (c17 — the "the very HaMashiach" stranded-article class structurally dead), full body phrase-coverage diff (c18): the letter/entry corpus is line-by-line audited faithful to the site.
- **Swipe engine v3 + atomic reveal** (07-19) — real cross-book/volume/WTLB-family peeks, native commit decision (real-flick/spring-back/50%), flushSync single-task commit kills the one-frame flash; the reading dot follows position immediately (dwell now gates only streaks).
- **Blank footnotes killed** (07-19) — chapter-only refs resolve whole chapters with gold verse sups; validate-schemas gained a corpus-wide Bible-ref resolution pass (1,466 refs proven; c14).
- **Five-item batch** (07-18) — reading streak (IDB v5), GardenPosStore (v6), boundary instantCommit, press-drag-parity swipe hardening (document-capture + zombie watchdog), PC thumbnail robustness (captureTargetEl).
- **UX batch sessions 1–5 + follow-ups** (07-12..20) — Go-to-Scripture on every ref sheet, link-picker overhaul (Search/Browse/Recent + full-text scope), journal editor redesign (grid autosize, per-entry scroll keys, insert-below-never-split), text-size slider (80–160 %, chrome pinned in px), unselectable chrome, icon-only back nav, reading dot rehomed into the nav, dual-theme tab thumbnails, honest Save on note/notebook sheets, dead-UI sweep.
- **Restored-name NT editions** (07-12) — NKJV-R + KJV-R sparse overlays via the deterministic generator `tools/gen-restored-nt.mjs` (never hand-edit outputs); tracker `RESTORED-NAMES-PLAN.txt`.
- **Selection-toolbar placement** (07-11) — near-top selections auto-scroll the exact deficit; pure `computeToolbarPlacement`.
- **Fleet session** (07-03) — the tabs-drag lock-up root-caused ON-DEVICE (capture-phase listeners + zombie self-heal; the CDP-over-adb workflow), journal block reorder, then all four drag surfaces rebased onto one shared `createPressDrag` engine; 6 backlog items (notes search + export, My Progress dashboard, backup reminder, smoke search assert).
- **Classic search retired** (07-02) — MiniSearch is THE engine (−96 KB off bundle-a's cold path); first-run annotation hint; `FABLE5-BACKLOG.txt` written.
- **UX/design passes 1–2** (07-02) — destructive-action separation + a full 40-route/15-sheet walk on the owner's real imported data; voice-memo discard confirm, bulk-tab-close confirm, external-link ↗ marker.
- **Word-snap line-break fix** (07-01) — `blockBoundaryOffsets` + `snapSelectionRange`; a highlight's word-snap can no longer leak across an on-screen line break.
- **Tab title memory + Matthew fixes** (06-21) — sticky per-tab titles survive corpus unloads; matthew-ch kicks the VOT corpus; sheets portal to `<body>` (transformed-ancestor containing-block fix).
- **Real-inert page peeks + scroll polish** (06-16..19) — the swipe peek IS the destination screen rendered inert (pixel-identical, annotations pre-painted), ViewPager2-style finger-follow pager, content-anchor scroll restore, scrollbar parity; MiniSearch engine built (BM25 + fuzzy + warm IDB cache).
- **Data-faithfulness restoration — occasion lines + full HTML↔app audit** (06-11) — owner caught a missing "(Regarding Thanksgiving)" header line; restored the parenthetical occasion `noteLine` to ~40 Format A letters (`9c00a35`, c9→c10), then ran a deterministic HTML↔app diff of all 354 letters (`tools/_audit-*`). Corpus proved faithful EXCEPT two losses, fixed (`83857c7`, c10→c11): the 14 blank Letters-from-Timothy headers (date/from/forLine + attributions + 2 addendums + The Shadow's orphaned attribution footnote) and volume-seven "Recompense"'s dropped opening "Dream of a Coming Storm" (restored as a `sectionIntro`) + spoken line. LetterView `noteLine`/`from` now accept string-or-segments so a header line can carry a footnote bubble. **Then audited Format B too** (`c955289`, c11→c12, 06-12): all 360 WTLB One/Two + The Blessed entries present + complete; the lone editorial clarification footnote on WTLB One "YAHUWAH Is One" included per owner call. **Every VOT letter + WTLB/Blessed entry is now audited faithful to the source HTML.** HISTORY.md landmark.
- **Backup v3 streaming + audits 2–3 fully resolved** (06-02..07) — GB-scale `.votbak` streaming container on both platforms (`BACKUP-STREAMING-PLAN.txt`); the 14-agent BLIND-AUDIT (59 items) and 16-agent FLEET-AUDIT (78 findings) each closed DONE-or-adjudicated (trackers in repo root, HANDOFF blocks at top).
- **WebView floor lift → chrome108 + R8 + W10-lite a11y** (06-03) — retired the chrome69 floor (boot polyfills removed, Permanent Rule 6 rewritten, verification floor → `vot_api34`/WV113); release R8 + `isShrinkResources` ON (closes N6; APK 27.7→19.98 MB); GitHub Actions → Node-24; W10-lite a11y — `prefers-reduced-motion`, a WCAG-AA contrast fix (light-theme link-blue), **a global Text Size control** (`--font-scale` root multiplier + px→rem in the injected-CSS screens, `da050c8`), forced-colors highlight preservation + a touch-target audit (`0cd9075`). HISTORY.md landmark.
- **AUDIT-PLAN — fully resolved (PILE B)** (06-03) — N4/N6/N7/N8 native robustness (emulator-verified) + PF3 dropped + UX9 adjudicated; every P0–P3 item now DONE or adjudicated-with-reason.
- **N2** (06-01) — 2nd native-review: proguard keep-rule fix + oversize-import message; 10 dispositioned.
- **U0–U22 UPLIFT** (06-01, Waves 1–5) — 7→8/10: import durability, export fail-loud, minify, search-load, App() re-render, html2canvas-lazy, Garden allowlist, CSP hash-lock, coverage/CI-smoke/contract/PWA. Canonical: **UPLIFT-PLAN.txt**.
- **Android 8/9 black-screen + SAF export** (06-01) — `--target=chrome69` + boot polyfills; SAF export on every device; emulator-verified.
- **index.html ghost-comment purge** (06-01) — 1001→522 lines.
- **Garden** (05-31) — CSS-transform zoom + native per-page disk cache (device-verified) + CSP redirect fix.
- **Storage forensics** (05-31) — search-cache leak (~215 MB freed) + two-tier Settings storage rows.
- **Overlap-precedence** (05-31) — most-recent visible annotation wins; note icon always survives.
- **Footnote gold-render** (05-31) — marker-less guessing stripped; data marked + `validateFootnoteMarkers` gate.
- **Annotation UX overhaul** (05-31) — note-ness decoupled from `kind`; native tap→chip; multi-verse notes; ConfirmStrip.
- **W8** (05-31) — ui/ tree in typecheck; scripture JSDoc; @layer retired (net-negative); !important 19→14.
- **W9** (05-28/29) — Format A/B/C/D/E + import-payload validators (pre-commit + CI); Hebrews restored; KJV regen.
- **W7** (05-29) — raw() freeze, versioned migrations, hlTick removal, JS DiagnosticLog; W7.5/W7.6 resolved-with-data.
- **W5 / W4 / W3** (05-28) — GitHub Pages deploy + dual CI + content-hash SW versioning; desktop polish; PWA shell.
- **W2 / W1** (05-27) — all data in IndexedDB (19 stores) + StorageHealth + pending/loaded/degraded state machine; PlatformBridge (APK + PWA) + back-nav.
- **Font toggle** (05-27) — Classic (system serif, default) / Modern (Cinzel + EB Garamond).
- **N1 / NK / Post-NK** (05-25/26) — MainActivity decomposed (JsBridge/MainViewModel/NativeAudioRecorder/StorageManager/AppInterface); Kotlin test stack (134 tests); JsEvent registry; haptic bridge.
- **Q8 / Q7 / Q6 / Q5 / Q4 / Q3** (05-24/25) — lazy corpora (bundle-a 11.7 MB → ~816 KB); useSyncExternalStore; CSS hardening; vitest safety net; JSDoc/tsc; 0/0 ESLint.
- **P6–P11** (05-24/25) — App() 2,815 → <800 lines; 28 hooks; ROUTES factory; AppShellOverlays/Sheets.

(Delete-confirm standardization, JSX conversion, Surprise button, and earlier modularization phases: see HISTORY.md.)

---
### Roadmap

**`FABLE5-BACKLOG.txt`** (repo root) is the CURRENT working queue — a 20-item prioritized menu written 2026-07-02 for the owner's remaining Fable 5 window (session protocol + constraints inside; add DONE-log one-liners as items land). **`PLAN.txt`** + **`UPLIFT-PLAN.txt`** are historical strategic memory. The W0–W9 PWA/quality sequence and U0–U22 uplift are all closed; the only other remaining tracks are optional **W10 deep accessibility** and the owed manual device walks (`tools/n1-smoke-walk.md`). **HISTORY.md** is the complete landed-work log; **ARCHITECTURE.md** is the deep system reference; CLAUDE.md is the 30-second briefing.

---

## User policies (durable directives, override defaults)

- **App name is "VOTReader"** (personal app; multi-user-shaped but no auth, no organization).
- **NO AI / NO API KEYS / NO LLM** — deferred indefinitely per user 2026-05-11: *"no ai no nothing, no api keys, etc, those are security risks anyway, we'll defer a.i feature."* The LiteLLM nim-proxy is decommissioned. Do not reintroduce.
- **NO credentials / login / auth anywhere.** All personal data stays local on device.
- **NO security risks** — anything that could leak personal data or LAN-expose a service is a defect, not a polish item.
- `android:allowBackup="false"` — Export/Import in Settings → "Your Data" is the only backup mechanism. JSON file, user-owned, no credentials.
- GitHub identity (**VOTReader** — renamed from corbinlythgoe on 2026-05-28; account email unchanged) and Garden image hosting on GitHub Releases (now `VOTReader/votreader-assets`) are fine for now. Repo went **public** 2026-05-28 for GitHub Pages hosting (W5).
- No Play Store thinking until everything else is done — would also require Timothy's permission first.

---

## File structure

Directories and their jobs. **Exact per-directory counts were deleted 2026-08-10** — they drifted every commit and were quietly wrong for months, which is precisely what the CQ3 disclaimer in Architecture quick-facts warns about. `ls`/`wc` the tree when you need a number.

```
D:/VOTReader-studio/
├── CLAUDE.md                          # this briefing
├── HISTORY.md                         # landed work log
├── ARCHITECTURE.md                    # system reference
├── PLAN.txt                           # live strategic working memory
├── UPLIFT-PLAN.txt                    # 7→8/10 remediation — canonical home (U0–U22, all closed)
├── package.json, package-lock.json    # esbuild + eslint + puppeteer (smoke-ci) deps
├── .githooks/pre-commit               # versioned; activate: git config core.hooksPath .githooks
├── tools/
│   ├── build.py                       # emits bundle-a.js
│   ├── preview-server.py              # serves with Cache-Control: no-store
│   ├── smoke.js                       # 13-screen render walk + annotation round-trips
│   ├── smoke-ci.js                    # U16 — runs smoke.js headless (puppeteer) as a CI gate
│   ├── validate-schemas.js            # Format A/B/C/D/E data validator + CLI runner
│   ├── sync-sw-version.js             # content-hash CACHE_VERSION (build:sw)
│   ├── check-corpus-version.js        # U3 — CORPUS_VERSION enforcement gate
│   ├── sync-csp-hashes.js             # U10 — CSP script-src sha256 sync (build:csp)
│   └── SMOKE.md                       # smoke harness docs
├── app/src/main/
│   ├── assets/
│   │   ├── index.html                 # boot infra + data constants + bundle load sequence (App() lives in src/app.jsx)
│   │   ├── app.css                    # static CSS (no template literal)
│   │   ├── manifest.json              # W3 PWA manifest (standalone, gold theme)
│   │   ├── service-worker.js          # W3 SW — core + corpus cache buckets
│   │   ├── offline.html               # W3 offline fallback page
│   │   ├── icons/                     # W3 PWA icons (512/192/180/32/16px)
│   │   ├── dist/                      # 8 bundles, regenerated by npm run build
│   │   └── src/
│   │       ├── app.jsx                # function App() — ≤800-line canary gate (P11)
│   │       ├── data/                  # scripture-resolution.js + the raw corpus files
│   │       ├── stores/                # CachedStore-backed stores + _entry-b.js
│   │       ├── renderer/              # annotation-engine, dom-links, dom-bookmarks, dom-journal-chip + _entry.js
│   │       ├── ui/
│   │       │   ├── screen-routes.jsx  # buildScreenRoutes factory — THE ROUTES table
│   │       │   ├── screens/           # reading + index + hub screens (incl. MatthewChapterView, BibleStudyChapterView)
│   │       │   ├── components/        # shared components (incl. AppShellOverlays, AppShellSheets, HolyDaysPlaylistHeader)
│   │       │   ├── sheets/            # sheets + pickers
│   │       │   └── _entry-d.js        # esbuild entry for bundle-d
│   │       ├── utils/                 # helper bundles (incl. backup.js U1, storage-health.js, sw-register.js, diagnostic-log.js)
│   │       ├── hooks/                 # App() hooks (P6 + P7a–k + P11 dom-annotation-sync/keyboard-inset)
│   │       ├── components/            # ExpandableText, ErrorBoundary
│   │       └── styles/                # journal-styles
│   └── java/com/votreader/sacredui/
│       ├── MainActivity.kt              # WebView shell + lifecycle + BridgeHost impl
│       ├── AppInterface.kt              # @JavascriptInterface methods (window.AndroidBridge; incl. v3 backup bridge)
│       ├── BridgeHost.kt                # Abstraction over Activity surface for AppInterface
│       ├── JsBridge.kt                  # Type-safe wrapper around evaluateJavascript
│       ├── JsEvent.kt                   # Sealed registry of native-to-JS callbacks
│       ├── MainViewModel.kt             # AndroidViewModel — recorder + storage + insets + recovery state
│       ├── VOTReaderApp.kt              # Application subclass — plants Timber DebugTree / BoundedLogTree
│       ├── BoundedLogTree.kt            # Release-build Timber tree — ring buffer of last 200 WARN+
│       ├── NativeAudioRecorder.kt       # MediaRecorder lifecycle for journal voice memos
│       └── StorageManager.kt            # File I/O: import readUriAsBase64 + SAF export writeTextToUri
└── _ocr_out/, check_balance.py, etc.  # OCR pipeline + data validators
```

**CRITICAL:** Only edit files in `app/src/main/`. Never touch `app/build/`. Always edit D: files, never the C: junction or the `app.OLD-*` backup.

---

## Working-directory health check (run after fresh clone)

```sh
# 1. activate the pre-commit hook
git config core.hooksPath .githooks
# 2. install Node deps (node_modules/ is gitignored)
npm install
# 3. verify the toolchain
node --version    # expect v20+
npx esbuild --version    # expect 0.28+
# 4. rebuild bundles from source (proves the build pipeline works)
npm run build
# 5. preview: serve via tools/preview-server.py (NOT plain python -m http.server)
#    .claude/launch.json already points the preview tool at it.
#    Open index.html, paste tools/smoke.js into preview_eval, call votSmoke()
#    expect PASS line: globals ok, data ok, screens 0 crashed,
#    letterAnn ok, wtlbAnn ok, console.error 0, resource404 0
```

If Node is missing on Windows: `winget install OpenJS.NodeJS.LTS`. Use bash/git-bash for npm commands (PowerShell execution policy blocks `npm.ps1`).

**Preview cache gotcha:** `tools/preview-server.py` sends `Cache-Control: no-store` so reloads always fetch fresh bundles. The plain `python -m http.server` caches `dist/bundle-*.js` heuristically and serves stale bundles after a rebuild — don't use it.

---

## Quick start: app failed to load? read this first

If the app shows a black screen, run the validator:

```bash
pip install esprima  # one-time
python D:/VOTReader-studio/check_balance.py
```

It checks every data file for:
1. **esprima JS parse errors** (authoritative — catches real syntax bugs)
2. **Non-ASCII dashes (en/em) in verse ranges** like `12:18–20` — breaks the renderer's parseRefRange regex, so Unicode superscripts render as **white inline text** instead of gold sup
3. **Smart quotes** (`" " ' '`) used as JSON delimiters instead of ASCII `" '`

These are the three classes of bugs that brace-counting alone misses and any of which causes a black-screen failure or wrong rendering.

### Black-screen failure modes seen in this project

| Symptom | Root cause | Example | How to detect |
|---|---|---|---|
| Black screen at app start | Unescaped `"` inside JSON string value | `"Psalm 50:7": ""Hear, O My people..."" ` | esprima parse error |
| Black screen at app start | Unicode smart quotes used as delimiters | `"t": "text",` | esprima / `check_balance.py` |
| Verse numbers render as **white inline text** instead of gold sup | En dash `–` instead of hyphen `-` in verse range | `Exodus 12:18–20` | `check_balance.py` dash check |
| Footnote sheet shows blank cite | Translation tag mismatch in `nkjv` dict key | `"John 14:6 (CJB)"` not in nkjv | manual verify |
| Tap-through to wrong letter | Letter-link `letterTitle` misattributed | linked to "Subject to No Man" but content is from "A Just God and A Savior" | `misattribution_check.py` |

---

## Permanent rules (never violate)

1. **Verse ranges always use ASCII hyphen `-`**, never en dash `–` or em dash `—`. Affects `chapter:verse-verse` strings in keys, refs, labels, cites — anywhere the renderer parses a verse range. The em dash is fine **only** as separator in compound nkjv values: `"Exodus 12:6 — verse text | Exodus 12:18-20 — verse text"`.

2. **All JSON-style delimiters are ASCII `"`** (or `'` if you must). Smart quotes go INSIDE string values only, where they're typographic content. If a string value contains a literal ASCII `"`, escape it: `\"`.

3. **Run `check_balance.py` after every batch edit.** Single-file edits via `Edit` tool generally don't introduce these, but agent-generated content frequently does (especially OCR-style transcription). The versioned pre-commit hook at `.githooks/pre-commit` does this automatically when any `app/src/main/assets/src/data/*.js` is staged, and runs `npm run build` to regenerate bundles when any bundle-source file is staged. Emergency bypass: `git commit --no-verify` (not recommended).

4. **Footnote NKJV text uses decimal verse markers** (`"19. text 20. text"`) for multi-verse refs, never Unicode superscripts (`¹⁹text ²⁰text`). The `verse-sup` gold inlay rendering only fires when the decimal or superscript-with-clean-range strategy succeeds. Mixed formats fall through to the white-text fallback.

5. **Blob consumption: never `readAsArrayBuffer()` for large data.** Use `URL.createObjectURL(blob)` for audio/video playback and image display. Use `blob.stream()` for streaming reads. Use `blob.slice()` for partial reads. NEVER use `FileReader.readAsArrayBuffer()` or `FileReader.readAsDataURL()` on blobs >1 MB — it loads the entire blob into heap and will OOM on budget devices (2-3 GB RAM). The only exception is the export path (W2.6), which processes blobs sequentially with explicit size guards.

6. **esbuild targets `--target=chrome108`** on build:b/c/d/e/css + the corpus/data minify (`tools/minify-bundle.mjs`). The WebView floor was raised **chrome69→chrome108 on 2026-06-03** (owner call): the app is personal — the APK is sideloaded to modern, auto-updating-WebView devices (Chrome 130+ in practice) and the PWA runs on evergreen browsers — so the Chromium-69 floor was a *theoretical* device imposing a real syntax/feature/velocity tax for no reachable user. At chrome108, `?.`/`??`/`??=`/`Array.at`/`replaceAll` ship raw, and every runtime API the app relies on (`Promise.allSettled` C76, `Promise.any` C85, `globalThis` C71, `structuredClone` C98, `Blob.arrayBuffer`/`.stream` C76) is native — the index.html boot polyfills were deleted with the lift. The floor is still a HARD contract, but for **runtime APIs**, not syntax: esbuild transpiles too-new *syntax* down to 108 automatically, but it can NOT polyfill a runtime API **newer than Chromium 108** — that needs a feature-detected guard (not a target bump) or a deliberate floor bump. One unguarded = a silent black screen on a sub-floor device (desktop + modern Android hide it). Verification floor moved too: the `vot_api28` (WebView 69) emulator now black-screens **by design** — verify boots on desktop Chrome (`smoke:ci`) or a modern-WebView emulator. (The chrome69 era + its polyfills live in git / HISTORY.md.)

---

## Editing principles

1. **Edit > Write.** Use the Edit tool for surgical changes. Reserve Write for new files.
2. **Read before Edit.** Always Read the target file region first.
3. **No regex at file scope.** User has been burned by this. Local string replacements only.
4. **Preserve other letters.** When editing letter N in a multi-letter file, only touch letter N.
5. **Verify after agent runs.** Diff or re-read the section. Trust but verify.
6. **No new Holy Days originals.** Holy Days is curated cross-references; do not author new content.
7. **Format-preserving.** Volume Two uses unquoted JS keys (`id: "..."`); old volumes use quoted JSON-style (`"id": "..."`). Match the file's existing format.
8. **No bandaid renderers.** If text is broken, fix the source data, not the renderer.
9. **Footnote audience:**
   - Volumes (Format A) → numbered gold bubbles → tap → bottom sheet w/ NKJV verse
   - WTLB / Blessed (Format B) → inline `(Book X:Y)` parenthetical cite → tap → bottom sheet w/ NKJV verse
   - Holy Days entries inherit Format A or B based on `entry.type`

### Anti-patterns (NOT to do)

- Run regex `sed`/`grep -E` at file scope to "patch" footnotes
- Add a CSS bandaid for white verse numbers — fix the data or renderer instead
- Author new Letters that don't exist on the live website
- Use Hidden Manna entries in any public index, search, or home tile
- Add `metaAddendum` fields to letters that don't have an "Also read" on the live site
- Change Volume Two's format (it's the gold standard)
- Mix numbered footnote bubbles with inline `(Ref)` cites in the same letter
- Skip the Read-before-Edit verification

---

## Data formats — collection-by-collection

### Format A: Rich JSON-style (Volumes 1-7, Lord's Rebuke, Letters to Flock, Letters from Timothy, Hidden Manna)

```js
{
  "id": "the-wide-path",                    // URL slug
  "num": 1,                                 // sequence in volume
  "title": "The Wide Path",
  "date": "3/28/05",
  "from": "From The Lord, Our God and Savior",
  "spoken": "The Word of The Lord Spoken to Timothy",
  "forLine": "For All Those Who Have Ears to Hear",
  "audioUrl": "https://thevolumesoftruth.bandcamp.com/...",
  "soundcloudUrl": "...",                   // V1, V3, Timothy only
  "videoVoiceUrl": "https://www.youtube.com/...",
  "videoMusicUrl": "https://www.youtube.com/...",
  "relatedTopics": [
    { "label": "Regarding X", "url": "https://answersonlygodcangive.com/Regarding_X" }
  ],
  "footnotes": {
    "1": { "type": "scripture", "ref": "Isaiah 13:11" },
    "2": { "type": "scripture", "ref": "Psalm 2:12", "seeAlso": { "collection": "Volume Three", "letterTitle": "Grafted In", "label": "Grafted In", "excerpt": "..." } },
    "3": { "type": "note", "text": "Also read: 'Grafted In'", "link": { "collection": "Volume Three", "letterTitle": "Grafted In" } },
    "4": { "type": "note", "text": "External resource", "url": "https://..." }
  },
  "nkjv": {
    "Isaiah 13:11": "I will punish the world for its evil...",
    "Psalm 2:12": "Kiss the Son, lest He be angry..."
  },
  "metaAddendum": "\"Other Letter Title\"",        // Optional (V2 has 2)
  "metaAddendumUrl": "https://...",                // Optional
  "metaAddendumLink": { "collection": "Volume One", "letterTitle": "Other Letter Title" },
  "metaAddendumInternal": "judgment-of-god",       // Same-volume id
  "blocks": [
    { "type": "para", "segments": [
      { "t": "bold-italic", "v": "Thus says The Lord:" },
      { "t": "text", "v": " Peoples of..." },
      { "t": "italic", "v": "I shall surely..." },
      { "t": "fn", "v": "1" }
    ]},
    { "type": "poetry", "lines": [
      [{ "t": "text", "v": "Therefore, turn from this" }],
      [{ "t": "stanza-break" }],
      [{ "t": "italic", "v": "For I AM HE!..." }, { "t": "fn", "v": "2" }]
    ]},
    { "type": "closing", "text": "Says The Lord." },
    { "type": "closing-fn", "segments": [...] },   // Closing with attached footnote
    { "type": "scripture", ... },                  // Quoted scripture block
    { "type": "note", "text": "..." }              // Editorial note block
  ],
  "prevLetter": { "id": "the-wide-path", "title": "..." } | null,
  "nextLetter": { "id": "the-seventh-day", "title": "..." } | null
}
```

**Block types:** `para`, `poetry`, `closing`, `closing-fn`, `note`, `scripture`
**Inline `t` types:** `text`, `italic`, `bold-italic`, `caps`, `fn`, `stanza-break`, `letter-link`

### Format B: Simple paragraph (WTLB One, WTLB Two, The Blessed)

```js
{
  "id": "matters-of-the-heart",
  "num": 11,
  "title": "Matters of the Heart",
  "paragraphs": [
    { "align": "center", "text": "The wailing of the penitent\nBrings forth healing;" },
    { "align": "justify", "text": "Plain prose with _italic_ and **bold** and {{ref:Matthew 4:4}} inline scripture refs and {{nav:esther:7}} bible-chapter nav links." }
  ],
  "scriptures": { "Matthew 4:4": "But He answered..." },   // Optional per-entry NKJV
  "prevEntry": { "id": "...", "title": "..." } | null,    // (used in HOLY_DAYS only)
  "nextEntry": { "id": "...", "title": "..." } | null
}
```

**Inline patterns inside `text`:**
- `_italic_` (single underscore)
- `**bold**` (double asterisk)
- `{{ref:Book Chapter:Verse}}` — tappable scripture popup
- `{{nav:bookId:chapter}}` — navigate to Bible chapter (e.g. `{{nav:esther:7}}`)
- `†` — section divider character (The Blessed)
- `~ [From "Letter Title" ~ Volume X]` — attribution at end of WTLB entry (tap-through wired)

### Format C: Bible book (books.js, books-restored.js, matthew.js, bible-*.js)

```js
{
  "id": "ephesians", "title": "Ephesians",
  "subtitle": "...",
  "chapters": [
    { "num": 1, "title": "...", "sections": [{ "heading": "...", "verses": [{ "n": 1, "text": "..." }] }] }
  ]
}
```

### Format D: Bible Studies (bible-studies.js)

Multi-part studies with chapters. Each study has `parts[].chapterIds[]` referencing chapter entries. Lazy-loaded — saves 4.3 MB from cold-boot.

---

## Letter counts — downloaded vs. live website

| Collection | Downloaded | Status |
|---|---|---|
| Volume One | 29 + preface ("A Word of Warning") | ✅ |
| Volume Two | 29 | ✅ |
| Volume Three | 30 | ✅ |
| Volume Four | 29 | ✅ |
| Volume Five | 29 | ✅ |
| Volume Six | 31 | ✅ |
| Volume Seven | 66 + preface ("The Indignation of The Lord") | ✅ |
| The Lord's Rebuke | 30 + preface ("A Warning") | ✅ |
| Letters to the Flock | 61 + preface ("Be My Examples") | ✅ |
| Letters from Timothy | 14 + preface ("Put All Your Trust in The Holy One") | ✅ |
| WTLB Part One | 149 + intro | ✅ |
| WTLB Part Two | 203 (incl. intro) | ✅ |
| The Blessed | 8 sections + intro | ✅ |
| Hidden Manna | 1 ("Woe to Dallas") | ✅ by design (not publicly indexed) |
| Holy Days | 16 ghost entries (cross-pulled) | ✅ |
| Bible Studies | 7 + Matthew Study Bible (separate file) | partial (see HISTORY §14.5/14.7) |

**Holy Days = ghost album.** Curated cross-references from across other volumes. Each entry has a `sourceLabel` (e.g. "Volume Two"). Audited once for structure/nav; defer content sync until after source sweeps are stable.

**Hidden Manna**: only reachable via Matthew study chain. Do NOT add to public index, search, or home tile.

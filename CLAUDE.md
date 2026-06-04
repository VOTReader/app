# CLAUDE.md — VOTReader-studio briefing

![CI](https://github.com/VOTReader/VOTReader-studio/actions/workflows/ci.yml/badge.svg)

What every agent needs in 30 seconds. For landed work history, see **HISTORY.md**. For deep system reference (annotation engine, COLLECTIONS registry, navigation, audit findings), see **ARCHITECTURE.md**.

**Working dir:** `D:\VOTReader-studio`. The C: OneDrive path is legacy — `C:\Users\corbi\OneDrive\Desktop\VOTReader-studio\app` is a Junction → `D:\VOTReader-studio\app`. Always edit D: files.

---

## Current state (2026-06-02)

**The app is feature-complete and shipping.** One JS codebase runs as the Android APK and as a desktop PWA (live + installable + full-offline at https://votreader.github.io/VOTReader-studio/). Every quality/uplift phase is closed — **Q3–Q8, N1, NK, P6–P11, W1–W9, U0–U22, N2** (one-line index below; full detail in **HISTORY.md**). **~1797 vitest** tests / 71 files (counts drift — verify, don't trust); CI green across build + lint (`--max-warnings 0`) + typecheck + vitest+coverage(floor) + Kotlin `testDebugUnitTest`+jacoco + headless 12-screen smoke. Pre-commit/CI also gate check_balance, schema-validate, corpus-version, CSP-hash, and the ≤800-line app.jsx canary.

**Architecture quick-facts.** `function App()` in `src/app.jsx` (≤800-line canary gate — the one line count worth trusting, because it's enforced). ~200 ES modules spread across `hooks/`, `ui/components/`, `ui/screens/`, `ui/sheets/` — **don't trust an exact module/line/file count quoted in any doc; they drift every commit, so `ls`/`wc` the tree when you need a number** (CQ3). All 53 screens dispatch from `buildScreenRoutes(deps)` in `src/ui/screen-routes.jsx`. **8 bundles** in `dist/`: `bundle-a` ~816 KB (react/react-dom + small data + search — critical path); `bundle-a-bible` ~4.6 MB / `bundle-a-matthew` ~492 KB / `bundle-a-vot` ~2.2 MB (lazy corpora via `__load*Corpus()`, **minified — PF1**); `bundle-b` ~227 KB (stores/hooks/journal/scripture-resolution/platform-bridge/StorageHealth/SW/DiagnosticLog); `bundle-c` ~16 KB (renderer); `bundle-d` ~302 KB (most screens/sheets/utils incl. backup.js/App/AppShell); `bundle-e` ~54 KB (lazy Settings/Search/Garden screens, injected on first nav via `__loadScreensE()` — **PF6**; precached in CORE_ASSETS for offline). b/c/d/e minified (U2), lazy corpora minified (PF1); **`--target=chrome69` is mandatory** (Permanent Rule 6). Cold-boot blocking path (a+b+c+d) ≈ 1.40 MB (PF1 cuts the lazy corpus parse, not this path).

**AUDIT-PLAN execution — 8.5 exit bar MET; AUDIT-PLAN FULLY RESOLVED + WebView floor lifted chrome69→chrome108 (2026-06-03).** A SECOND deep adversarial audit (15 subsystem agents + 15 independent verification agents, every finding re-checked against source) rated the post-UPLIFT app **7.5/10** and produced **`AUDIT-PLAN.txt`** — the canonical tracker (≈108 verified items, P0–P3) for the 7.5→8.5+ remediation. **READ THE `HANDOFF` BLOCK AT THE END OF AUDIT-PLAN.txt FIRST** (context + gotchas + the PILE A / PILE B remaining split). Waves 1–4 + PF1 + the overnight batch met the 8.5 bar; a P2/P3-TAIL close-out batch then landed (CQ3, B2, PF2 [bundle-a −153 KB], PF5 [Garden LRU], A7, F6, UX7 [tab-undo], UX8; B3/B7/A6/UX9 adjudicated). Owner UX calls: APPROVED UX3/UX4/UX5/UX10/UX7/E5, **SKIP UX6 — do NOT touch the welcome splash.** **PILE A BATCH landed + CLOSED 2026-06-03** (see the newest AUDIT-PLAN.txt PROGRESS LOG entry): **12 DONE** — UX5, UX4+UX10, E5, T7, E4, F3, P7pwa, F1+F2 (keyed 176→1 re-render), CQ6, T5 (Kotlin), plus the two owner-approved visible items: **UX1+UX2** (`951d468`, Surprise-back→Home + clear the search anchor so result-scroll restores) and **A1+A5** (`17f6348`, note icons rendered INLINE at the highlighted-phrase end on the React verse path — fixes the latent NotFoundError; upgraded past the audit's verse-end/scope-only options per owner) — each source-verified first, gated, pushed, preview-verified; **3 ADJUDICATED** — J7 (premise inactive: no save-while-recording trigger exists), CQ5 (app.jsx canary + checkJs flood ⇒ net-negative), PF4 (naive null reverts Bible to NKJV ⇒ focused session). **PILE A is fully CLOSED** — the one deferred item, **PF6** (`0ca8ce4`), also landed: Settings/Search/Garden code-split into a lazy `bundle-e` (54 KB), injected on first nav via `__loadScreensE()`; bundle-d 365→302 KB; App() folds the corpus + bundle-e subscriptions into `useLazyBundles()` (777/800); preview + headless smoke:ci verified. **PILE B CLOSED**: **UX3** (`055b674`) + **A4** (`6a3467a`, per-container annDomSig fan-out skip; offset-table reuse adjudicated) DONE; **PF3 DROPPED** (no jank on real devices; windowing risks the load-bearing scroll-to-verse/scroll-memory path for a theoretical gain — `content-visibility:auto` is the cheap fallback now the floor allows it) and **UX9 ADJUDICATED** (defunct inverse-set allowlist; per-tab resume = a tab-schema redesign not worth the risk for a recoverable nit). **WebView floor LIFTED chrome69→chrome108** (`1a7ae7f`, branch `chore/lift-webview-floor`): target bumped on build:b/c/d/e/css + the corpus minify, now-native boot polyfills removed (CSP 9→8 hashes, CACHE_VERSION rehashed), Permanent Rule 6 rewritten; `npm run build` + `smoke:ci` + live-preview verified; the vot_api28/WV69 emulator now black-screens BY DESIGN. **AUDIT-PLAN fully resolved.** The Kotlin **N4/N6/N7/N8** are DONE (`2520f5b` on branch `fix/audit-n4-n6-n7-n8-kotlin`) — code-read + forced Kotlin recompile + `:app:testDebugUnitTest` + vot_api28/WV69 emulator (getZoomScale()==1 across a forced restoreState cycle; two sequential takeScreenshot both succeed = single-flight releases). **N6** keep rules are correct but DORMANT until N2.1b enables R8; **N8** retry-view + **N7** true concurrency aren't stageable on a headless debug emulator (code+compile-verified there). NOTE: the "DEFERRED FOR OWNER REVIEW" list below is a PRE-BATCH snapshot — most of it (A1+A5, E4, E5 pt2, F1+F2, UX1–UX4) has since LANDED; kept for history.
- **Wave 1 — P0 (data loss + reachable crashes):** **SC1** (`698c95b`) `typeof`-guard the WTLB `{{nav:}}` bare-`BOOKS` ReferenceError (+ same-class app.jsx site). **J1/J2/J4** (`f0f7eab`) the journal editor flushes on `pagehide`/`visibilitychange:hidden` + saves a media insert IMMEDIATELY — closes a real silent-data-loss window on the Android background-kill path (debounced edits + freshly-added photo/voice memo were lost + the blob orphaned); +`JournalEditorScreen.test.jsx` (4 cases, real store, non-vacuous). **E1/E2/E3** (`00912b1`) a failed lazy-corpus load now shows a **Retry** affordance (was a permanent "Loading…" dead-end) + logs it, and a global `window.onerror`/`unhandledrejection` now feeds DiagnosticLog (the only failure trace under no-telemetry). Browser-verified in preview.
- **Wave 2 — search cluster (the lowest-rated subsystem; the engine `assets/search.js` is OUTSIDE eslint/tsc/coverage):** **SR1/SR2/SR3 + SR8** (`5c4e051`) removed a dead `heading`-field throw that fired on EVERY query, and fixed multi-word search. KEY FINDING: the audit's OWN recommended fix (`suggest:true`) was **WRONG** — disproven against the vendored FlexSearch 0.7.41 (still returns `[]`); the real fix is per-term **OR union**. New `src/data/search-engine.test.js` loads the REAL engine over a fixture (was 0% tested; the SR2 case was RED under suggest, GREEN under per-term-OR). **SR5** (`29778ec`) `SearchScreen` loads all corpora before building the index (was caching a near-empty index on a cold search-open). **SR4** (`3a4873e`) wired the dormant scripture **synonym expansion behind a "Synonym Search" settings toggle** (default on, owner-approved), slightly trimmed (dropped the over-broad generics `lord`/`god`/`father` from the name groups). Real-corpus preview: `pastor`→shepherd verses (1 Pet 5:2, Heb 13:20), `agape` 0→400; exact matches still rank first.
- **Wave 3 — only-backup integrity + native:** **S2** (`6fb3de5`) `JournalMediaStore` settles on the TRANSACTION (reject on abort/error; put/delete resolve on commit) — fixes an import-hang + makes media puts durable. **S1/S3** (`67ff4c7`) export flushes `whenSaved()` before reading (only-backup can't miss a just-made edit); import no longer auto-reloads on `writeFailures` (would mix imported + old IDB data). **N2** (`29dc4bc`) `startAudioSession` guards a double-start that stranded the device in `MODE_IN_COMMUNICATION` (+Kotlin test; `:app:testDebugUnitTest` green).
- **Wave 4 — performance (started):** **PF1** (`82e25d0`) the three lazy corpus bundles (`bundle-a-bible/matthew/vot.js`) are now esbuild-minified in `tools/build.py` (`--minify --target=chrome69 --allow-overwrite` after the Python concat) — **−3.38 MB** (bible 7.08→4.64 MB / vot 3.00→2.19 MB / matthew 618→492 KB; `bundle-a` stays raw, its UMD vendors read top-level `this` = PF2). CORPUS_VERSION `c5→c6`. RIGOR: a vm deep-equal of git-HEAD-raw vs the minified output proved all 29 corpus globals byte-identical in value (ships exactly today's data); a string-aware scan proved 0 optional-chaining in code; 0 CR bytes (eol=lf no-op → the CI Linux rebuild byte-matches this Windows commit, replicated GREEN locally). **Floor-proven on the API-28 emulator** (WebView = Chromium 69.0.3497.100): fresh APK boots + renders, 0 JS parse errors in logcat; a raw-CDP eval on the WV69 engine loaded all three minified bundles → BOOKS 66, MATTHEW 28, LETTERS(v2) 29, WTLB_ONE 149, John 3:16 correct. Preview: John 3 renders gold sups + real text, 0 console errors.
- **Wave 4+ — large overnight autonomous batch (2026-06-02, owner asleep; ~22 commits, all CI-green + preview/emulator/unit-verified + CI-replicated; commit-by-commit detail in `AUDIT-PLAN.txt` PROGRESS LOG):** **PF7** app.css→`dist/app.min.css` (−80 KB render-blocking; 0 computed-style diffs proven). **T2** smoke gate now consumes the per-step content assertion + gates on `screenUnreached` (a blank-but-structured screen passed the CI render gate before). **T3** per-file coverage floors for the aggregate-masked hot files (journal-store/dom-links/dom-bookmarks). **SE1/2/4/5** import proto-pollution reject + CSP `connect-src 'self'` + gardenUrl clamp + translation-code allowlist. **SC2–SC7** robust user-typed refs (Roman numerals, a BOOK_ALIASES standard-abbrev table, parseRefStr tolerances) + footnote/WTLB `lookupVersesFromBooks` fallback. **P1pwa/P2pwa** resilient SW install (critical all-or-nothing + best-effort `allSettled`) + the first SW unit test. **CQ2/B10/B9** deleted dead `data-normalize.js`/`data-schema.d.ts` + the JSX-era one-shot tooling + the package.json mojibake. **B1** the pre-commit now auto-regenerates+re-stages globals (closes the manual SPOF). **B5/B6/B8** esprima pin+loud-warn, scripture-block content gate, `.nvmrc`. **A2** snapRangeToWords includes the ASCII apostrophe. **P4/P5/P6pwa** precache the head icons + manifest `id` + per-worker re-promptable SW update. **J5/S6** streak reset on last-entry delete + accurate import-confirm wording. **E5 pt1** DiagnosticLog trace on the degraded-hydration tier. **CQ1** ARCHITECTURE.md App() count. NOTE: a globals-mirror gap (the new BOOK_ALIASES const) briefly reddened CI across 5 commits before B1 caught+prevented it; one flaky `smoke:ci` CDP timeout was hardened (`protocolTimeout` 180→600 s).

  **DEFERRED FOR OWNER REVIEW (high-risk — touch load-bearing render/nav/storage; NOT shipped unsupervised):** **PF4** free+precache alt-translations (naive null of `window.BIBLE_*` would break `translateVerse`'s alt-translation rendering — needs reload-on-demand design). **PF2** minify bundle-a (the vendored-UMD `this` trap). **PF3** IntersectionObserver list virtualization. **F1+F2** per-verse re-render fan-out (React.memo on the Bible/Matthew React annotation path). **A4** annotation apply O(n²) offset-table reuse. **A1+A5** note-icon React-path scoping. **UX1–UX4** Surprise-back / search-scroll / back-router-navOrigin / Garden swipe. **E5 pt2** the user-facing degraded banner (StorageHealthBanner scenario). **E4** crash-loop guard. **N1 audio-FOCUS** stays held for the device walk (Pixel/Samsung `MODE_IN_COMMUNICATION`). Safe remainder still open: CQ3 doc counts (several stale — see below), CQ6 var-useState, J7, T5/T7 (**T4**+**T6**+**S5**+**CQ7**+**CQ8**+**SE7**+**J3** DONE 06-02 — T4 dom-overlay slide-off coverage 60/63%→~99%; T6 check_balance.py unit-tested + run over the corpus in CI; S5 import aggregate decode cap; CQ7/CQ8 import-cap + frozen-mood docs; SE7 vendored-lib provenance (VENDORED-LIBS.md — surfaced a runtime React **18.2.0** vs test-React-19.x skew); J3 web recording hands the Blob straight through (no base64 round-trip); plus a **smoke:ci retry-on-CDP-timeout** flake fix). **DONE — Export/Import GB-scale streaming re-architecture (P1–P4, both platforms, emulator-verified).** Owner directive 2026-06-02: years of journal text + images + audio must export/import safely, efficiently, enterprise-grade — NOT capped (superseded S4's "lower the ceiling"; reconciled S5). **Canonical tracker: `BACKUP-STREAMING-PLAN.txt`.** The backup is now a v3 STREAMING container (`.votbak`): an 8-byte `VOTBACK1` magic + 8-byte BE manifest length + manifest JSON (stores + per-blob METADATA, no bytes) + per-media `[8-byte BE length][raw bytes]` frames — 64-bit lengths (no zip/4GB wall), no base64 on disk, peak memory ≈ one blob. **P1** pure v3 core (`backup-container.js` codec + `buildV3Manifest`/`applyV3` in `backup.js`). **P2** WEB I/O (`PlatformBridge.openExportSink`/`pickImportFile` = FS Access API / sliceable Blob → `writeContainer`/`readContainer`). **P3** ANDROID native — `StorageManager.kt` mirrors the framing in Kotlin (`DataOutputStream.writeLong`/`readLong` = big-endian = byte-identical to the web codec) over the SAF stream, driven by a chunked JS↔native bridge (10 `v3Export*`/`v3Import*` `@JavascriptInterface` methods + `JsEvent` ready callbacks + SAF launchers; base64 ONLY at the bridge boundary, never on disk); `SettingsScreen._exportV3Android`/`_importV3Android` drive it (FileReader ≤512KB slices — the WV69 floor lacks `Blob.arrayBuffer`/`.stream`; native owns the framing). Import feeds the SHARED `applyV3` via an async-gen of `{id,meta,blob}` — only the entry SOURCE differs per platform. Android branches FLIPPED v2→v3. EMULATOR-verified (vot_api28 / Chrome 69.0.3497.100): native write byte-exact to spec; cross-platform web↔Android byte-exact (incl. multi-frame); legacy v1/v2 sniff (no old backup stranded); the REAL Settings Export button → valid container + "Backup saved." **P4** caps reconciled — the v3 path is UNCAPPED (streaming makes the OOM the caps defended impossible); the 50MB caps now correctly bind ONLY the legacy non-streaming whole-file read; added a SOFT, advisory free-space heads-up in the import confirm (`formatImportSpaceWarning`, `navigator.storage.estimate`, never blocks). The v2 `buildExportPayload`/`applyImportPayload` stay EXPORTED (rollback + the legacy-import path) but the Android/web export wiring no longer calls v2. The shared store-read (LS reseed + v2-shape store/flag apply + U1 barrier) is folded into three private helpers (`_reseedLsData`/`_applyStoresAndFlags`/`_awaitDurability`) used by BOTH appliers — the re-architecture (P0–P5) is COMPLETE with nothing left open. Content audio/video (`audioUrl`s) are EXTERNAL LINKS opened out (CSP `media-src blob:` blocks in-app playback); only egress is Garden `<img>` from GitHub.

**D-bucket (2026-06-01) — the last architectural items, dispositioned this session.** (Plan: `UPLIFT-PLAN.txt` §D-BUCKET.)
- **D7 doc prune** — DONE. Deleted 8 stale standalone docs (handoffs, BUNDLE-LAZY-LOAD-PLAN, css-audit, JOURNAL_WIRING, gitignored b64/quality-uplift artifacts; ~630 KB); relocated the orphaned W2–W9/NK/feature history into HISTORY.md; slimmed this file (~52% smaller).
- **D5 per-action write-fail toast** — DONE (`43fb827`). Cooldown-deduped toast from `StorageHealth.onWriteFailure` so the user learns THIS change didn't persist (not just the passive banner). +3 vitest; preview-verified.
- **D6 degraded-hydration cascade atomicity** — DONE (`8afdd2a`). `JournalStore.remove` cascade (`_purgeAssociated` + stats/index) now gated on `!_applyingPending` so it can't durably purge associations while the entry delete is only queued (orphan-prevention) or double-fire at replay. +1 vitest (proven to fail pre-fix).
- **D2 typed navHandoff module** — DONE (`a93ca80`). `src/utils/nav-handoff.js` (window-backed, cross-bundle) replaces the 5 live `window.__pending*`/`__notesReturnCtx` magic-string slots; removed the write-only-dead `__pendingLinkExcerpt`. +8 vitest; BRIDGES.md §5 now points here; preview-verified end-to-end.
- **D1 / D8 / D4 / D3 — SKIPPED with reasoning** (each evaluated against source, net-negative or stale; the 2026-06-01 fresh AUDIT-PLAN.txt independently corroborates D1+D3): **D1** `content-visibility:auto` is a no-op on the WebView-69 floor (a Chromium-85 feature) — zero benefit on the budget Androids that most need it — for non-zero risk to the working scroll-memory/annotation layer. The fresh audit's `[PF3]` reaches the same conclusion: virtualization should be **IntersectionObserver windowing** (works on WV69), not content-visibility — and that perf work is owned by AUDIT-PLAN, not D-bucket. **D8** dissolve `use-sheet-orchestration` — plan-tagged low-priority refactor of load-bearing, working sheet UI ([[respect-production-code]]). **D4** NavContext to collapse the ROUTES factory — already W7.5-adjudicated net-negative ("the honest receipt of clean extraction, not a debt"; bundling doesn't reduce coupling). **D3** project-wide `strictNullChecks` — W8.3 deliberately left it off; the fresh audit doesn't recommend it either (its CQ4/CQ5 scope **targeted** typing of app.jsx + journal-helpers, owned by AUDIT-PLAN) — turning it on globally would surface hundreds of nulls across every typed file (tsconfig is `strict:false` throughout) for a single-dev, nearly-done app.
- **D8/D3 narrow halves LANDED** (2026-06-02, after a "what do YOU think" review) — the *wholesale* D8 dissolve + D3 global-strict stay skipped (above), but the two genuinely-defensible sub-pieces shipped: **`useLinkPickerOrchestration`** extracted from the sheet hook — the one truly-separable cohesive cluster, 6 of 13 slots + 3 bridges (`47c4b30`); and **journal-helpers.js + letter-linking.js** added to the typecheck gate (measured 0 errors → pure free coverage — `d2082f4`). app.jsx full typing (CQ5) + IntersectionObserver virtualization (PF3) remain owned by AUDIT-PLAN.

**STILL OWED — manual device walks** (real hardware; checklist in `tools/n1-smoke-walk.md`; nothing blocking): U1 import file-walk · U7 Garden Ultra-tier crawl · U9 thumbnail-capture · Garden zoom reset on Android. (SAF v3 export/import + cancel was EMULATOR-verified end-to-end on vot_api28 / WV69 = the Android 9 floor — see the backup-streaming bullet; a real-hardware confirm is optional polish, not blocking.) **N2 device-walk queue** (verified-good but touch device-tuned code): N2.2 transient-exclusive audio focus · N2.3 volumeControlStream · N2.4 Garden stream-to-disk (PROFILE-FIRST) · N2.5 haptic API-26-28 fallback · N2.1b enable R8 minify. **W10 accessibility** is the only un-started quality phase (optional).

**Operational facts (load-bearing).**
- **Debug APK** at `D:\VOTReader-build\app\outputs\apk\debug\app-debug.apk` (relocated off the OneDrive junction via `vot.buildDir`; NOT `app/build/...`). **Never** `Remove-Item -Recurse` the C: junction — it follows into D: and deletes real files. ([[onedrive-build-lock]])
- **CORPUS_VERSION** needs a manual bump on any `books.js` / `matthew.js` / VOT-corpus edit, or web PWAs keep stale cache (`tools/check-corpus-version.js` enforces). ([[corpus-version-bump]])
- **adb** at `C:/Users/corbi/AppData/Local/Android/Sdk/platform-tools/`; test device `51071FDAP000C8`; emulator AVD `vot_api28` (API 28 / WebView 69 = the Android 8/9 floor). **gh** at `C:\Program Files\GitHub CLI\gh.exe` (authed as VOTReader).
- **Preview clean-slate** (load fresh bundles past the SW cache): `(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload();})()`

## Closed phases — full detail in HISTORY.md

Reverse-chronological; each landed CI-green + deployed.

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

**`PLAN.txt`** + **`UPLIFT-PLAN.txt`** (repo root) are the strategic working memory. The W0–W9 PWA/quality sequence and U0–U22 uplift are all closed; the only remaining tracks are the D-bucket (dispositioned 2026-06-01 — see Current state), optional **W10 accessibility**, and the owed manual device walks (`tools/n1-smoke-walk.md`). **HISTORY.md** is the complete landed-work log; **ARCHITECTURE.md** is the deep system reference; CLAUDE.md is the 30-second briefing.

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
│   ├── smoke.js                       # 12-screen render walk + annotation round-trips
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
│   │       ├── data/                  # scripture-resolution.js + 29 raw corpus files
│   │       ├── stores/                # 11 stores + _entry-b.js
│   │       ├── renderer/              # annotation-engine, dom-links, dom-bookmarks, dom-journal-chip + _entry.js
│   │       ├── ui/
│   │       │   ├── screen-routes.jsx  # buildScreenRoutes factory — the 53-entry ROUTES table
│   │       │   ├── screens/           # reading + index + hub screens (incl. MatthewChapterView, BibleStudyChapterView)
│   │       │   ├── components/        # shared components (incl. AppShellOverlays, AppShellSheets, HolyDaysPlaylistHeader)
│   │       │   ├── sheets/            # 17 sheets/pickers
│   │       │   └── _entry-d.js        # esbuild entry for bundle-d
│   │       ├── utils/                 # 15 helper bundles (incl. backup.js U1, storage-health.js, sw-register.js, diagnostic-log.js)
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

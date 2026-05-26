# CLAUDE.md — VOTReader-studio briefing

![CI](https://github.com/corbinlythgoe/VOTReader-studio/actions/workflows/ci.yml/badge.svg)

What every agent needs in 30 seconds. For landed work history, see **HISTORY.md**. For deep system reference (annotation engine, COLLECTIONS registry, navigation, audit findings), see **ARCHITECTURE.md**.

**Working dir:** `D:\VOTReader-studio`. The C: OneDrive path is legacy — `C:\Users\corbi\OneDrive\Desktop\VOTReader-studio\app` is a Junction → `D:\VOTReader-studio\app`. Always edit D: files.

---

## Current state (2026-05-26)

- **W0-W8 — Cross-platform PWA + quality hardening — IN PROGRESS (started 2026-05-26).** Same JS codebase, two shells: existing Android APK + installable desktop PWA. The web stack stops being a constraint and becomes the core asset — `if (window.AndroidBridge)` guards are already pervasive, so the desktop browser mostly works today. Phases: W0 prerequisites (fonts + owed NK7 device walk) → W1 PlatformBridge (decouple from AndroidBridge, 15 methods, 6 call sites) → W2 IndexedDB migration (transactional writes, ~50 MB+ quota, in-memory write-through for sync render paths) → W3 PWA shell (manifest + service worker + offline fallback, ~2.3 MB install cache + ~10.3 MB lazy) → W4 desktop polish (max-width, hover, keyboard shortcuts) → W5 hosting (GitHub Pages) + dual CI → W6 cross-platform verification → W7 quality hardening (IDB schema versioning, raw() freeze, hlTick dead-prop removal across 39 files, JS DiagnosticLog, 47→5-prop bundle refactor) → W8 type coverage (82 UI files in 5 tiers) + CSS @layer (eliminate 24 !important hacks). **W0.1 (`5688f6e`)** — landed 6 OFL fonts as WOFF2 (~140 KB total). Fixed pre-existing bug along the way: the @font-face block referenced `.otf` / `.ttf` filenames that have never existed in the upstream repos — Cinzel + EB Garamond were silently falling back to system serif on every platform since the declarations first landed. **W1.1 (`228be7c`)** — PlatformBridge module landed at `src/utils/platform-bridge.js` (140 lines). 20 @JavascriptInterface methods mirrored from AppInterface.kt (single source of truth for platform detection per [[platformbridge-single-source]]; consumers never check `window.AndroidBridge` directly after W1.2). Android impl is pure passthrough (zero behavior change), web impl is placeholders (no-ops, safe defaults, NYI warnings). 45 new vitest cases bringing total to 536. Pure-addition commit per [[abstraction-before-migration]]; W1.2 call-site migration is the next commit. Full W0-W8 plan + 18-critique traceability matrix in PLAN.txt; when W8 closes, the list is clean — zero gaps.
- **Delete-confirm standardization — 5 commits (2026-05-26).** New `ConfirmStrip` primitive at `app/src/main/assets/src/ui/components/ConfirmStrip.jsx` (36 lines + 10 vitest cases) wraps the existing `.ann-chip-confirm` CSS family with a `{ question, yesLabel = 'Yes, delete', onCancel, onConfirm, className, style }` API. Replaces every bespoke delete affordance in the app. **Bucket A** (`42f9eb3`) — 11 mechanical markup swaps: NoteSheet, NotebookManagerSheet, NotebookPickerSheet, JournalNotebookSheet, BookmarkCreateSheet, BookmarksScreen (RowActionSheet + BookmarkPopover), LinksScreen LinkRowActionSheet, NotesIndexScreen drilled-in, LinkCard, AnnotationActionChip. Redundant `padding: 10px 12px` inline styles dropped (base CSS already supplies). **Bucket C** (`cc22558`) — 4 multi-stage patterns collapsed to 1-step. ClearProgressRow + SettingsScreen: drops `clearPending`/`getStage`/`handleClearTap`/`resetClearPending` machinery + adds 3 per-row helper components (HistoryClearRow, SectionClearBtn, AllProgressClearRow) at module scope so each owns internal confirm state. Tabs Overview "Clear All Tabs": drops `clearAllStage`/`setClearAllStage` through useTabActions/AppShellOverlays/app.jsx + the App-level reset effect on overview close; state internal to TabsOverview. JournalEditor block delete: drops `confirmDelStep` 2-step + `requestDeleteBlock`/`cancelDeleteBlock` helpers; banner positioning preserved via `className="jrn-block-confirm"`. HistoryScreen Deduplicate: drops 5-second auto-cancel timer + `pendingBtnRef` + click-outside effect. **Bucket B** (`d0ebf35`) — only behavior change: SelectionToolbar ✕ Remove highlight was instant; now collapses the whole toolbar to a ConfirmStrip ("Remove this highlight?" / "Yes, remove"). Internal state resets on every selInfo change so a fresh selection never inherits mid-confirm state. **JournalAudioBlock** (`5848f0d`) — banner-style ConfirmStrip replaces play+waveform+meta when confirming; the `<audio>` element below the conditional stays rendered so playback state (currentTime, paused/playing) survives a Cancel. **Type-DELETE survivors (intentional):** journal entry delete (JournalHubScreen + JournalViewerScreen) + Settings "Clear All Personal Data" — both keep the type-DELETE-to-confirm modal. **Per-tab × close in TabsOverview stays instant** (browser-like). Cleanup along the way: `CLEAR_LABELS` / `CLEAR_CLASSES` dropped from index.html (no caller); `.history-dedupe-btn.is-pending` dropped from app.css; `.jrn-block-confirm-{cancel,yes,q,step2}` + `.jrn-aud-delete-{confirm,q,cancel,yes}` dropped from journal-styles.js (replaced by the standardized `.ann-chip-confirm-*` family).
- **Post-NK polish — 5 follow-up commits (2026-05-26).** Driven by a 96/100 architectural review that named the genuine remaining gaps. **JsEvent sealed class** (`3b7daa8`) — typed registry replaces all 8 raw `"__onFoo"` strings in `bridge.callOptional` call sites; `JsBridge.callOptional(event: JsEvent, ...)` overload delegates to the string version (defense-in-depth with the existing FN_NAME regex guard). **Haptic feedback bridge** (`f9234df`) — `@JavascriptInterface haptic(style: Int)` exposes 4 vibration styles (tick/click/heavy/double) using `VibrationEffect.createPredefined` on API 29+ with `createOneShot` fallback for API 26-28; VIBRATE permission added. JS-side wire-up (which taps fire haptics) is owed. **JVM target bump 11 → 17** (`fa4d660`) — aligns bytecode with the AGP 9.x build toolchain; zero behavior change in a pure-Kotlin project. **AppInterface extraction behind BridgeHost** (`639de65`) — the 20 @JavascriptInterface methods move to their own top-level `AppInterface.kt` (305 lines), constructor-injected with `BridgeHost` (Activity-surface abstraction) + `JsBridge` + `MainViewModel`. MainActivity 937 → 773 lines (−164); zero behavior change. **AppInterface tests** (`91907f7`) — 27 new tests via `FakeBridgeHost` (plain class implementing BridgeHost with mutable fields). Zero of the 27 need an Activity, Robolectric, or real WebView — the structural payoff of the extraction. `BridgeHost.hasAudioPermission()` added so the requestMicPermission flow tests cleanly without static `ContextCompat.checkSelfPermission`. **Kotlin tests: 104 → 134** across 6 → 7 files.
- **Phase NK — Kotlin Native Quality CLOSED.** 9 commits bring the Kotlin tree to the same JS-side quality bar (Q3-Q8). New stack: JUnit 5 Jupiter + junit-vintage (Robolectric's JUnit 4 bridge) + kotlin-test-junit5 + Robolectric 4.14.1 + MockK 1.13.13 + androidx.test.core/ext.junit + JaCoCo 0.8.12. **104 Kotlin unit tests across 6 files** (SmokeTest 2 + JsBridgeTest 28 + StorageManagerTest 24 + NativeAudioRecorderTest 12 + MainViewModelTest 9 + BoundedLogTreeTest 29). **JaCoCo coverage gate at 0.85 line-coverage floor** on JsBridge + BoundedLogTree (current achieved 0.87 — JsBridge 27/39 + BoundedLogTree 58/58). Pre-commit Step 6 now runs `:app:testDebugUnitTest :app:jacocoTestCoverageVerification`; CI has a new `kotlin-tests` job on JDK 21 with HTML report upload on failure. **JsBridge hardening:** `require(fn.matches(\w+))` injection guard on `callOptional` + new `U+0000` JS-source escape branch in `quote()`. **Release-build logging:** `BoundedLogTree.kt` planted on release builds (ring buffer of last 200 WARN+ entries with content URI + abs-path sanitization), surfaced via a new `AndroidBridge.getCrashLog()` @JavascriptInterface and folded into the Settings → Your Data → Export JSON as a `diagnosticLog` field. Settings shows the entry count + last-error timestamp in a new row that's hidden on debug builds / web preview. Real-device verification of the full N1.x + NK5 happy paths is owed against an actual phone — see `tools/n1-smoke-walk.md` (NK7, 287-line numbered checklist).
- **Phase N1 — Native-side polish CLOSED.** 13 commits (10 N1.x + 3 post-review hardening) bring `MainActivity.kt` to the same quality bar as the JS side. New files: `VOTReaderApp.kt` (Application subclass for Timber), `JsBridge.kt` (centralized evaluateJavascript), `MainViewModel.kt` (config-change-surviving state), `NativeAudioRecorder.kt` (MediaRecorder lifecycle), `StorageManager.kt` (file I/O). `MainActivity.kt`: 869 → 937 lines on net (Timber + onRenderProcessGone + JsBridge + N1.8 callback + import-size guard added; recorder + file I/O extracted out). 14 raw `Log.w("VOTReader", …)` calls → Timber; every `evaluateJavascript` site routes through `JsBridge` (one documented N1.8 60Hz-loop exception). PixelCopy + coroutines on screenshot path; renderer-crash recovery with crash-loop guard; per-frame IME tracking via `WindowInsetsAnimationCompat`. New deps: timber 5.0.1, kotlinx-coroutines-android 1.10.2, lifecycle-runtime-ktx 2.9.1, lifecycle-viewmodel-ktx 2.9.1.
- **JSX conversion COMPLETE** (Q2.7-2, `b233cc3`). Every React component is JSX.
- **App() lives in `app/src/main/assets/src/app.jsx`** (Q2.7-1, `c1e3da1`). **797 lines — Phase 1 + Phase 2 CLOSED.** 26 hooks (15 P6 + 11 P7a-k). **All 53 screens dispatch from a single ROUTES table** that lives in its own file (`src/ui/screen-routes.jsx`) via a `buildScreenRoutes(deps)` factory. The 3 substantive inline blocks (matthew-ch, bible-study-chapter, holy-days-index playlist header) extracted to their own screen/component files. Welcome modal + tabs overview + disable-tabs prompt + garden warning live in `AppShellOverlays`; 12 annotation/link/journal/bookmark sheets live in `AppShellSheets`. App() now owns composition, not implementation.
- **Q6 CSS hardening CLOSED.** app.css 4,410 → 4,125 (−285 dead). 93 raw-hex usages consolidated to vars (`--hl-{yellow|green|pink|...}` palette + `--danger` + `--settings-warning/danger` + `--input-text` + `--white`). `!important` count 36 → 25 (Cat A removed; B-F load-bearing).
- **Q7 useSyncExternalStore migration CLOSED.** 23 of 24 Bin 4 `hlTick` cache-bust eslint-disables removed (24th is in `annotation-store.test.js` documenting the old pattern). 7 stores now expose `subscribe / getVersion / _bump`; 14 consumers migrated.
- **Q8 lazy-load COMPLETE.** All corpus files lazy-loaded. Critical-path bundle: 11.7 MB → 1.03 MB (**91% reduction**). Q8.1 books.js → `bundle-a-bible.js` (6.9 MB), Q8.2 matthew.js → `bundle-a-matthew.js` (618 KB), Q8.3 all VOT corpora → `bundle-a-vot.js` (3 MB). Loaders pre-fire from the appropriate landing screens (Home / ScripturesHome / StudiesHome / VolumesHome); ROUTES entries show "Loading…" placeholder if user lands directly on a content screen pre-load.
- **135+ modules** under `app/src/main/assets/src/` — every screen, sheet, component, store, hook, utility, renderer helper is an ES module.
- **4 cluster bundles** in `app/src/main/assets/dist/`:
  - `bundle-a.js` 1.03 MB — vendor + small data (matthew-plain/nkjv, books-restored) + search engine (critical path)
  - `bundle-a-bible.js` 6.9 MB — books.js (NKJV) lazy-loaded via `window.__loadBibleCorpus()`
  - `bundle-a-matthew.js` 618 KB — matthew.js (Study Bible) lazy-loaded via `window.__loadMatthewCorpus()`
  - `bundle-a-vot.js` 3 MB — 14 VOT corpora (volumes/letters/WTLB/holy days/hidden manna) lazy-loaded via `window.__loadVotCorpus()`
  - `bundle-b.js` 351 KB — stores + components + hooks + journal + scripture-resolution + letter-linking (esbuild IIFE, 38 files incl. cached-store.test.js excluded from prod)
  - `bundle-c.js` 27 KB — renderer (esbuild IIFE, 3 files)
  - `bundle-d.js` 540 KB — screens + sheets + components + utils + late stores + screen-routes + App() (esbuild IIFE, 87 files)
- **491 vitest tests** across 21 files (+10 ConfirmStrip from the delete-confirm standardization pass).

### Q3 ESLint — CLOSED 2026-05-24

- **0 errors / 0 warnings.** Baseline 154/216 → 0/0. CI `--max-warnings 0` locked at `d955e98`; any new warning fails CI. The 55 `eslint-disable-next-line` cites across 31 files were audited at phase close (each cite's named identifiers verified to be read in the corresponding effect body).
- **Pre-commit lint via lint-staged** (`a545d81`): sub-second per-file lint at the commit prompt; same `--max-warnings 0` policy as CI.
- **Bin classification framework** (durable reference for Q4/Q5/Q6 disable cites):
  - Bin 1 — add the dep (eslint's recommended fix; safe for stable setters/callbacks)
  - Bin 2 — disable + ref-mirror / closure-stable cite (useRefMirror, local helpers reading already-tracked closure values)
  - Bin 3 — disable + mount-only or setter-stability cite (`[]`-deps intent; useState setters passed through hook returns)
  - Bin 4 — disable + cache-bust / identity-churn cite (hlTick bump signal, commitDwellNow per-render rebinding)

### Q4 — JSDoc / `tsc --checkJs` (CLOSED 2026-05-24)

37 files typed across utils (11) + stores (11) + hooks (15). App() and the ui/ tree intentionally deferred — that's the App() decomposition phase. See HISTORY.md for the per-commit breakdown.

- **Infrastructure** (`001747b`): `tsconfig.json` `checkJs: true` + `strict: false`; include narrowed to utils/stores/hooks; `_entry-b.js` excluded. `@types/react` + `@types/react-dom` installed. `tools/gen-eslint-globals.py` extended to emit a parallel `tools/globals.generated.d.ts` (331 `declare const X: any;` + Window index signature — cross-bundle is untyped by design). `CachedStoreBase<T>` typedef as the store-layer type root.
- **Pattern** (`b349b02`): `extendStore(base, methods)` helper wraps `Object.assign` with `ThisType<B & M>` so `this` inside store-method literals resolves to BOTH the CachedStore base AND the sibling methods. Lifts every `@ts-nocheck` cleanly.
- **Bundle-b grew** 302→320 KB from JSDoc comments preserved in dev build (esbuild strips comments in minified prod build).
- **Gates live:** `npm run typecheck` runs in CI between lint and build AND in pre-commit Step 3. Zero-tolerance from day one (per [[lint-regression-gate]]); any type error fails the commit.

### Post-Q4 — Q5 safety-net phase CLOSED, App() decomposition CLOSED

**Pinned sequence** (PLAN.txt + [[refactor-after-tests]]): smoke-lite ✅ → Q5 vitest ✅ → **App() decomposition (CLOSED 2026-05-25 with Phase 2)**.

**Q5 safety-net phase totals (2026-05-24):**
- **218 tests across 9 files**; 9 of 37 Q4-scope files have direct coverage.
- Coverage ratchet over the phase: statements **1→14**, branches **2→11**, functions **0.4→12**, lines **0.9→15**.
- **Pre-commit gates** (run on src changes, ~5-6s): check_balance → lint-staged → typecheck → vitest → build. CI adds smoke-lite + the gated `test:coverage` variant.

**Q5 commit chain:**
- Infrastructure: smoke-lite (`102b883`), Q5.1 (`742f657`).
- First real test + gate lock: Q5.2 _validateTabState (`a69b739`, 86 tests, 13-rule coverage table).
- Suppress validation: Q5.3 hlTick cache-bust (`ee073f9`) — empirically proved the 24 Bin 4 suppresses guard real refresh behavior (test B asserts stale reads without hlTick in deps).
- Silent-corruption guards: Q5.4 LinkStore migration (`a5fce71`), Q5.5 JournalIndexStore cascade (`02eca54`), Q5.6 useSavedState round-trip (`f3a56c4`), Q5.7 NoteStore cascade (`a3466c1`), Q5.8 useHistory gate (`a9e43c2`), Q5.9 scripture-parse (`41b19ba`).

**Plateau signal recognized** ([[tests-diminishing-returns]]): pre-scripture-parse deltas were +1 per commit on average; the remaining un-tested Q4 surfaces (small utility helpers like book-category, hl-keys, search, tabs, dates, garden) are lower-leverage than App() decomposition. **The safety net is built; time to use it.**

### P7 — App() decomposition (IN PROGRESS, 2026-05-24)

**Goal:** App.jsx under 800 lines. Currently **2,254** (was 2,261 before P7a, 2,256 before P7b).

**Structural measurement (post-P7a):** App() body is lines 24–2253.
- **Logic block:** lines 24–1151 (**1,128 lines** — hooks + callbacks + effects + nav-helper glue).
- **JSX render tree:** lines 1152–2253 (**1,103 lines** — 55 conditional `{screen === "X" && ...}` blocks).

The 50/50 split means **hook extraction alone cannot hit <800.** The render tree by itself is 1,103 lines — that's the floor for any logic-only extraction. PLAN.txt §1 has the two-phase plan and Phase 2's risk profile (CSS selectors, layout shifts, ErrorBoundary placement — render decomposition needs visual smoke walks, not just vitest).

**Phase 1 — logic extraction CLOSED (2026-05-25).** Goal hit: **zero inline concerns remaining in App()'s logic block**, all extracted to 11 hooks under src/hooks/. Per [[concerns-not-lines]] the metric was concerns-not-lines; App.jsx still has 1,846 lines (1,103 of which are the JSX render tree — Phase 2's target). The 11 P7 hooks: useNavHistoryTracking + useNav + useSearch + useBibleStudies + useJournalMutations + useTapThrough + useReadProgress + useReadingPositionNav + useReadingChainNav + useSurprise + useAppShellEffects. 465 vitest tests; coverage broke 30% lines. P7k closing commit landed all four AppShell concerns (`__bumpHlTick` bridge + welcome modal + isOnline ping + dismissWelcome routing).
- **P7a (LANDED 2026-05-24, `d89775f`)** — useNavHistoryTracking. 18-line useEffect → 115-line hook + 23 vitest tests. The 4-helper disable cite (most architecturally-debted post-Q3 disable in the file, with the extraction candidate named in its own text) moved with the effect. TDZ note: call site lives below `getStudyById`/`getStudyChapter`, mirroring P6l's useAndroidBack. Tests 218→241, branches gate bumped 11→13.
- **P7b (LANDED 2026-05-24, `ee6339e`)** — useNav. 20 simple nav-chrome helpers extracted (4 simple switchers + 8 navOrigin-pattern + 2 journal-nav + 5 trivial switchers + goScriptureGenre). 8 duplicated `setNavOrigin({...})` literals dedupe to one private `_captureOrigin()`. 34 new vitest tests; tests 241→275; statements gate 14→17, functions 12→16, lines 15→17.
- **P7c (LANDED 2026-05-24)** — useSearch. Full search domain extracted: 4 search tabFields (searchOrigin/searchScope/searchContext/searchQuery), searchOriginRef, srchVolLookup/SRCH_VOL_MAP/srchResolveLetterId helpers, goSearch (26-line context computation), goSearchOrigin, handleSearchSelect (80-line dispatcher), handleSearchCommand, window.__goSearch bridge effect. **Per the dissolution principle ([[dont-group-by-shape]]):** the search-domain handlers (handleSearchSelect, handleSearchCommand, srch*) landed in useSearch where they belong, NOT in a "useHandlers" junk drawer. App.jsx dropped 134 lines (largest single P7 extraction so far — handleSearchSelect alone was 80 lines). 56 new vitest tests covering all 14 handleSearchSelect branches + 7 handleSearchCommand actions + 4 goSearch context variants + the window.__goSearch identity-churn invariant. Tests 275→331; all 4 gates ratchet: statements 17→21, branches 13→18, functions 16→18, lines 17→22. TDZ note: useSearch's call site sits BETWEEN handleSurprise (above) and useAndroidBack (below) by necessity — handleSurprise is a useSearch param (cross-domain 'random' handoff) and useAndroidBack consumes goSearchOrigin from useSearch's return. Caught the wrong initial placement in smoke verification (TDZ ReferenceError); fix was a single move-block edit.
- **P7h+i pair (LANDED 2026-05-24)** — the reading-navigation pair.
  - **P7h — useReadingPositionNav**: setLastReadForVol + selectMatthewCh/BibleCh + goToLastRead + prophecyCardStatesRef + saveProphecyCardStates. ~50 lines moved. 22 tests. Call site sits BETWEEN useBibleStudies and useTapThrough (downstream of getStudyById/selectStudy from useBibleStudies). Sequencing change: useBibleStudies moved UP from its P7d placement to right after useReadingDwell, spending the TDZ dividend for the first time.
  - **P7i — useReadingChainNav**: the cross-volume chain (Revelation → V1 → ... → Garden) + within-Bible book prev/next. boundaryConfig + _first/_last/_firstPreface + _goFirst/_goLast maps + bookIdx/prev/nextBibleBook + goNext/PrevBibleBook + chIsFirst/Last + bcv* boundary render props + goToRevelationLast. ~110 lines moved. 28 tests (boundary branch dispatch + chain-walk skipping empties + the load-bearing Revelation→Volume-One bridge + null-guards). The hook EXPOSES the full computed surface (boundaryConfig + bcv* + 8 helpers) but App() destructures only what it consumes — clean contract for future render-tree consumers without a surface change.
  - Tests 402 → 452 (+50). Coverage gates jump biggest yet: statements 25→29, branches 21→24, functions 24→27, lines 26→30 (broke 30%).
  - App() 1,987 → **1,890** (−97). P7i alone shaved 86 lines.
- **P7e+f+g batch (LANDED 2026-05-24)** — 3 small extractions in one session, demonstrating the TDZ dividend (every extraction post-P7d is independent, so small ones can batch).
  - **P7e — useJournalMutations**: createAndEditJournal (1 fn). 8 tests.
  - **P7f — useTapThrough**: goToLetterFromMatthew + openInAppLetter (~72 lines, push onto fromLetterStack + set destination). 13 tests.
  - **P7g — useReadProgress**: added to useMarkAsRead.js as second export. Owns readItems state + VERSION_ID + getReadKey + isRead/markRead/unmarkRead + clearAllProgress + clearReadForBook (folded in from inline `onClearBook` arrow → VERSION_ID stays internal). 17 tests.
  - Smoke caught TWO TDZ errors in useTapThrough's params (setFromMatthewCh then setActiveReadKey); both resolved by moving the call site below useReadingDwell + hoisting the fromMatthewCh tabField. Same kind of issue the TDZ-blocker dividend was supposed to eliminate, but for setters not study helpers — the dividend is real for getStudyById/getStudyChapter but each new extraction still needs its own dep check.
  - Tests 364 → 402 (+38). All 4 gates ratchet: statements 23→25, branches 19→21, functions 21→24, lines 24→26.
  - App() 2,056 → **1,987** (broke 2,000). Net −69 across the 3 commits.
- **P7d (LANDED 2026-05-24)** — useBibleStudies. **The TDZ-blocker.** STUDIES + UNIFIED_CHAIN data + getStudyById/getStudyChapter/studyReadKey lookups + selectStudy (smart single-vs-multi router) + selectStudyChapter + prevChainEntry/nextChainEntry + goToChainEntryFirst/Last (with the matthew-study special-case for the Matthew Study Bible's bible-ch renderer). **Structural win:** call site moved HIGH UP (right after useNav), demonstrating that the TDZ blocker is gone — getStudyById/getStudyChapter are now hook returns instead of const arrows, so downstream hooks (useAndroidBack/useNavHistoryTracking/useSearch) are no longer forced to live below the Bible Studies block. (They haven't moved yet — that's a separate refactor; the freedom is the dividend that future extractions can spend.) 33 new vitest tests covering lookups + selectStudy's 3 routing branches (single/singlePage/multi) + UNIFIED_CHAIN composition (8 entries: 6 studies + Matthew, with locked/empty filtered) + chain prev/next boundaries + goToChainEntryFirst/Last for both Matthew + regular study branches. App() shrank 64 lines. Tests 331 → 364. Coverage ratchet: statements 21→23, branches 18→19, functions 18→21, lines 22→24. **Caught the `*/`-in-comment bug for the second time** (P7b had it too); captured as memory [[no-comment-terminator-in-text]] so the next session won't repeat.
- **Next**: useReadingChainNav (boundary nav + bible book prev/next), useMarkAsRead-helpers, useReadingPositionNav, useTapThrough, useJournalMutations, useSurprise (handler dissolution), useAppShellEffects.

### Phase 2 — render-tree decomposition (CLOSED 2026-05-25)

**Goal:** App.jsx under 800 lines. **Hit: 1,815 → 797 lines.**

7 commits land the render-tree extraction:
- **P9a** (`084b2fb`) — bible-study-chapter (88 lines → 30) → `BibleStudyChapterView.jsx`. The largest substantive ROUTES entry: letterShim builder + jumpToStudy/handleLetterClick + LetterView.
- **P9b** (`92ec3c2`) — matthew-ch (43 → 19) → `MatthewChapterView.jsx`. Chain-aware boundary logic + ChapterView + ModeToggle.
- **P9c** (`2b41f49`) — holy-days-index playlist conditional (31 → 6) → `HolyDaysPlaylistHeader.jsx`.
- **P9d** (`4d38384`) — AppShellOverlays (137 lines moved). Welcome modal + tabs overview + TabActionSheet + disable-tabs prompt + garden warning, all in one shell component.
- **P9e** (`40f76ce`) — AppShellSheets (186 lines moved). 12 annotation/link/journal/bookmark sheets and popovers.
- **P9f** (`3eae5b4`) — `buildScreenRoutes` factory in `src/ui/screen-routes.jsx`. 560-line ROUTES table moves out; App() destructures ~90 closure deps into one explicit prop bundle (`props are explicit, not spread`). App.jsx: 1,412 → 888.
- **P9g** (`5e1fda5`) — 5 prop-builder helpers (colIdxProps / colReadNavProps / _idxNav / sharedViewProps / _navToChapter) move INTO buildScreenRoutes (they're only used by ROUTES entries). Legacy single-line `/* X → src/hooks/Y */` breadcrumbs pruned per [[doc_pruning]]. App.jsx: 888 → 797.

**Exit criteria — ALL HOLD:**
- ✅ Every ROUTES entry with >20 lines of inline JSX extracted to its own component file
- ✅ ROUTES itself lives in `src/ui/screen-routes.jsx`
- ✅ Overlay UI extracted to `AppShellOverlays`
- ✅ Sheet/popover layer extracted to `AppShellSheets`
- ✅ App() under 800 lines (797)
- ✅ All 5 pre-commit gates pass (check_balance + lint + typecheck + vitest 465 tests + build)
- ✅ Visual smoke walk completed for every extracted screen

### Q6 — CSS hardening (CLOSED 2026-05-25)

Mechanical execution against the 772-line `css-audit.txt`. app.css:
**4,410 → 4,125 lines (−285, ~6.5%)**.

- **Q6.1-Q6.5** — dead-rule sweeps (285 lines deleted across 5 commits):
  BOOK SELECTOR block (62), old HOME-card (20), LETTER LIST (38), old
  SEARCH v1 + srch facet/chip (48), notes-sort-menu + hl-remove-menu +
  scattered (117). Each verified zero-references via word-boundary
  grep + visual smoke walk.
- **Q6.6** — 10-color annotation palette → `--hl-*` CSS vars. 62 raw
  hex usages collapse to 10 var definitions in `:root`. Plus the
  intentional `.navpick-row-icon-bible-chapter` brown alias.
- **Q6.7** — Six more multi-use hex values consolidated: `--danger`
  (10 → 9 uses after Q6.5 deleted one), `--settings-warning`,
  `--settings-danger`, `--input-text` (with light-mode override),
  `--white`. 31 raw hex literals replaced with vars.
- **Q6.8** — Category A `!important` (11 decls): empirically removed.
  The audit's "shorthand expansion" reasoning didn't match: base
  `.hl-note.is-active` uses LONGHANDS (no implicit currentColor), and
  per-color rule's 3-class specificity beats the 2-class base. Probed
  via `document.styleSheets` live patch + computed-style check across
  all 11 colors, dark + light mode.
- **Q6.9** — Categories B/C/D/E/F (25 decls): KEPT. The light-mode
  palette specificity argument (`body.light .hl-yellow` = 0,0,2,1
  exceeds `.hl-note:not(.is-active)` = 0,0,2,0) is genuinely
  load-bearing for the palette-strip guards. `:where()` / `@layer`
  cleanup is a redesign, deferred.

`!important` count: 36 → 25.

### Q7 — useSyncExternalStore migration (CLOSED 2026-05-25)

23 of 24 Bin 4 `eslint-disable-next-line react-hooks/exhaustive-deps`
cites removed; the canonical `hlTick` cache-bust pattern replaced with
per-store React 18 reactivity. The 24th lives in `annotation-store.test.js`
and documents the OLD pattern with proof it was justified BEFORE
migration — kept as a historical regression marker.

- **Q7.1** — CachedStore base: added `subscribe(cb) → unsubscribe`,
  `getVersion()`, `_bump()`, `_version`, `_listeners`. Every store
  inherits via `extendStore()`. 9 new cases in `cached-store.test.js`
  prove the contract (notification, unsubscribe, idempotence, throwing
  subscriber doesn't block siblings, etc.).
- **Q7.2** — AnnotationStore + NoteStore migrations. 3 consumers
  migrated (HighlightableText, NoteSheet × 2). Q5.3 test extended
  with tests E + F (useSyncExternalStore pattern verified end-to-end).
- **Q7.3** — BookmarkStore + JournalStore + LinkStore _bump. 4
  consumers migrated (BookmarkIcon, ChapterBookmarkBtn, BookmarksScreen,
  LibraryScreen). LibraryScreen subscribes to ALL 5 stores so the
  5-tile dashboard fully reactive.
- **Q7.4** — NotebookStore + JournalIndexStore _bump. 10 consumers
  migrated (NotesIndexScreen, NotebookManagerSheet, NotebookPickerSheet,
  LinkSidebar, LinkIcon, LinksScreen, HighlightsScreen, JournalHubScreen,
  JournalViewerScreen, JournalChip).

**Stores with `_bump`:** AnnotationStore, NoteStore, BookmarkStore,
JournalStore, LinkStore, NotebookStore, JournalIndexStore (7).

**Exit check:** all production-code Bin 4 disables removed.
`grep -rEn "eslint-disable-next-line react-hooks/exhaustive-deps -- cache-bust"
app/src/main/assets/src --include="*.jsx" --include="*.js" | grep -v test`
returns ZERO matches.

**setHlTick / hlTick prop threading:** still in App() state +
threaded through some non-migrated callbacks (e.g. BookmarksScreen's
post-mutation `setHlTick(t => t + 1)` is now a no-op since no
consumer reads `hlTick`). A follow-up can remove the App-state +
prop entirely; left in place this session to keep blast radius bounded.

### Q8 — Bundle-a.js lazy-load (COMPLETE 2026-05-25)

Cold-boot critical path: **11.7 MB → 1.03 MB (91% reduction)** across
three commits. Pattern proved on books.js (Q8.1), expanded to all
remaining corpora in Q8.2 + Q8.3.

**Q8.1 (`ea94158`)** — books.js split. Cold-boot 11.7 → 4.65 MB.
The 6.9-MB NKJV Bible lives in `bundle-a-bible.js`, loaded on demand
via `window.__loadBibleCorpus()`.

**Q8.2 (`dcd06c3`)** — matthew.js (Study Bible) split. Cold-boot
4.65 → 4.03 MB. Pre-fires on StudiesHome + ScripturesHome mount.
Refactored Q8.1's per-corpus loader into a generic factory:
`window.__makeLazyLoader(name, bundlePath, finishFnName)` →
`{ corpus, load }`. Each corpus exposes `useSyncExternalStore`-
compatible `subscribe / getVersion` + an idempotent `load()`.

**Q8.3 (`5605f30`)** — all VOT corpora (14 files, ~3 MB) split.
Cold-boot 4.03 → 1.03 MB. `bundle-a-vot.js` carries volume-one
through volume-seven + letters-timothy + letters-flock + lords-rebuke
+ wtlb-one + wtlb-two + wtlb-scriptures + the-blessed + holy-days +
hidden-manna. `__finishVotInit` re-runs `linkWtlbEntries` +
`linkPreface` + `VOT_LETTER_REGISTRY` rebuild on load.

Stays critical-path (~1 MB): react + react-dom + html2canvas +
flexsearch + search.js + search-data.js + books-restored.js
(restored-name chrome overrides) + matthew-plain.js (NKJV Matthew,
referenced by inline scripture refs) + matthew-nkjv.js (translation
alternates).

App-side guards added across:
- `app.jsx` — 3 `useSyncExternalStore` subscriptions (one per corpus);
  `ALL_BOOKS` builds sparse if either is undefined.
- `screen-routes.jsx` — `bible-idx / bible-ch / matthew-idx / matthew-ch`
  routes show their own "Loading…" placeholder. The 27 VOT routes
  (volumes + WTLB + Holy Days + Hidden Manna indexes + letters +
  entries) route through `_wrapVot` helper which triggers the
  loader and shows a generic placeholder.
- `HomeScreen` + `VolumesHome` + `ScripturesHome` + `StudiesHome` +
  `SettingsScreen` — `useEffect` pre-fires the relevant loader(s) on
  mount so corpora download in parallel with user's tile scan.
  HomeScreen additionally pre-fires Bible + Matthew + bible-studies
  when `settings.showSurpriseButton` is true (the dice's random-pool
  builder reads all three globals); `use-surprise.js` also
  `typeof`-guards + early-returns on empty pool to make the cold-boot
  race recoverable instead of throwing. The dice button itself now
  flows inline below the last home card (no longer `position:fixed`),
  so the home view scrolls when cards + dice exceed the viewport.
  **Pool scope (2,018 entries):** Matthew Study + Bible + study
  chapters + every COLLECTION with `surpriseType` set (Vols 1–7,
  Timothy, Flock, Rebuke, WTLB 1+2, Blessed, Holy Days) including
  prefaces; Hidden Manna stays out (`surpriseType: null` honors the
  "reachable only via Matthew study chain" policy); "Return to the
  Garden" is not in COLLECTIONS so naturally excluded. Index selection
  uses `crypto.getRandomValues` + rejection-sampling
  (`Math.random` fallback) for bias-free uniform pick.
- `VolumesHome` — `_locked = _votReady && _cnt === 0` so the lock
  flag only kicks in for known-empty collections once the corpus
  arrives (during loading window, NO tile is locked).
- `SettingsScreen` — guards `PROGRESS_GROUPS` on
  `(_BOOKS_READY && _VOT_READY)`. Reads `BOOKS["matthew-plain"]`,
  `LETTERS_V1`, etc. directly inside the array literal so the gate
  prevents evaluation.
- `utils/tabs.js` — `describeTab` reads via `window.BOOKS` and the
  `colLetterArr` typeof-safe accessors. The lazy-safe pattern used
  for years pays off.
- `use-nav-history-tracking.js` — `bible-ch` + `matthew-ch` history-
  record branches early-return if their corpus isn't loaded; a
  later effect re-run picks it up.
- All `LETTERS_X` / `WTLB_X` / `HOLY_DAYS` etc. direct references in
  `screen-routes.jsx` swapped to `colLetterArr(COL_BY_KEY.get(volKey))`
  (lazy-safe via the existing typeof guards in
  `scripture-resolution.js`).

Runtime contract (in `index.html`):
- `__makeLazyLoader(name, bundlePath, finishFnName)` factory.
- `__bibleCorpus / __loadBibleCorpus / __finishBibleInit` (books.js).
- `__matthewCorpus / __loadMatthewCorpus` (matthew.js — no finishInit
  needed since MATTHEW is read only from its own module).
- `__votCorpus / __loadVotCorpus / __finishVotInit` (14 VOT files).

Runtime contract (index.html inline):
- `window.__bibleCorpus = { loaded, subscribe(cb), getVersion() }`
  — React 18 reactivity for the load state.
- `window.__loadBibleCorpus() → Promise` — idempotent injector;
  on-load runs `__finishBibleInit()` which assigns
  `BOOKS["matthew-plain"]`, builds `BIBLE_BOOK_LIST` (66 books in
  canonical order), populates `OT_BOOK_IDS`.

App-side wiring (pattern proof — only books.js this pass):
- ScripturesHome pre-fires `__loadBibleCorpus()` on mount via
  `useEffect`, subscribes to `__bibleCorpus` so tile chapter-counts
  render `'—'` until BOOKS resolves, then fill in real numbers.
- App() subscribes to `__bibleCorpus` at the top level so the WHOLE
  render tree re-runs when BOOKS resolves. `ALL_BOOKS` guards with
  `typeof` to tolerate pre-load state.
- `bible-ch` / `bible-idx` ROUTES entries show a centered "Loading
  Bible…" card if corpus isn't loaded; trigger
  `__loadBibleCorpus()` on render so cold-boot direct to a saved
  Bible chapter tab works.
- `utils/tabs.js` `describeTab` resolves bookId via `window.BOOKS`
  instead of bare `BOOKS` — tolerates undefined cleanly.
- `use-nav-history-tracking.js` skips Bible-chapter history records
  if BOOKS isn't loaded; a subsequent effect run after corpus load
  picks up the entry correctly.

**Remaining work:** other corpus files (matthew.js, volume-*.js,
letters-*, WTLB, the-blessed, holy-days, hidden-manna) stay in
bundle-a for now. Per the pattern-proof discipline established by
earlier phases, expand to other splits in follow-up commits with
their own smoke tests.

### N1 — Native-side polish (CLOSED 2026-05-25)

13 commits bring `MainActivity.kt` to the same quality bar as the JS
side: 10 N1.x items plus 3 post-review hardening commits that closed
real correctness paths found by a critical review pass after N1.10b
landed. Same one-commit-per-item discipline as Q3-Q8; same
build-and-verify-after-each gate.

**New deps** (`gradle/libs.versions.toml`): timber 5.0.1,
kotlinx-coroutines-android 1.10.2, lifecycle-runtime-ktx 2.9.1,
lifecycle-viewmodel-ktx 2.9.1. Zero third-party risk beyond Timber
(Jake Wharton, universally adopted).

**Commit chain:**

- **N1.1 (`f61bb43`)** — Enable WebContents debugging in debug builds.
  `buildFeatures { buildConfig = true }` to re-enable BuildConfig under
  AGP 9.x; `WebView.setWebContentsDebuggingEnabled(true)` gated by
  `BuildConfig.DEBUG`. chrome://inspect attaches on debug APKs; release
  APKs unaffected.
- **N1.2 (`c791381`)** — Timber. New `VOTReaderApp` Application
  subclass plants `Timber.DebugTree()` in debug builds. All 14
  `Log.w("VOTReader", …)` calls → `Timber.w(e, …)`. The
  WebChromeClient console dispatcher fans out to per-level Timber
  calls (e/w/d/i), so the `android.util.Log` import disappears
  entirely. The two duplicate "PermissionRequest resolution failed"
  messages diverge into "grant failed" / "deny failed".
- **N1.3 (`1c3ddaf`)** — Renderer crash recovery. Extract the WebView
  setup into `createConfiguredWebView()` factory. `onRenderProcessGone`
  inside the `WebViewClientCompat` rebuilds the WebView + reloads
  index.html. Tracks `renderRecoveryCount` + `firstRecoveryMs` (60-s
  sliding window); >2 crashes shows a TextView "Tap to reload" rather
  than infinite-looping. Pending mic permission + file chooser
  callback get the same cleanup the dying-Activity path used to do.
- **N1.4 (`4ab52e9`)** — Defensive file reading. `MAX_IMPORT_SIZE = 50 MB`
  on the companion; `querySize(uri)` reads `OpenableColumns.SIZE`
  before `readBytes()`. Rejects oversized + unknown-size files — both
  flow to JS as `__onImportFile(null)`, same code path as cancel /
  read error.
- **N1.5 (`78a5048`)** — Type-safe JS bridge. New `JsBridge` class.
  Three entry points: `callOptional(fn, vararg args)` (escapes
  arguments, posts to WebView thread), `callWithResult(js, callback)`
  (sync return for back-press), `setCssProperties(vararg pairs)` (the
  inset CSS update). 11 raw `evaluateJavascript` sites + their
  `webView.post {}` wrappers collapse into one-line bridge calls. The
  bridge holds a lazy `webViewProvider: () -> WebView` so N1.3's
  WebView recovery doesn't require re-instantiation. JS string source
  construction outside the bridge is structurally impossible.
- **N1.6 (`9a7f5e2`)** — PixelCopy screenshots. `webView.draw(Canvas(…))`
  → `PixelCopy.request`. Captures the actual rendered surface
  (hardware layers included) instead of asking the View to redraw.
  Kept the CountDownLatch + synchronous JS API for this commit
  (N1.7 handles the async cleanup).
- **N1.7 (`f7e6ae0`)** — Coroutines on the screenshot path.
  `suspendCancellableCoroutine` wraps `PixelCopy.request`;
  `withTimeoutOrNull(2_000L)` preserves the 2-s latch cap;
  `invokeOnCancellation` recycles the destination bitmap on timeout
  so an interrupted capture doesn't leak `width*height*4` bytes. The
  `@JavascriptInterface` still returns a String synchronously
  (`runBlocking { withTimeoutOrNull { … } ?: "" }`); JS contract
  unchanged. `CountDownLatch + TimeUnit` imports gone.
- **N1.8 (`54ca4b6`)** — Per-frame IME tracking via
  `WindowInsetsAnimationCompat.Callback`. The existing
  `setOnApplyWindowInsetsListener` fires at start/end of the
  keyboard slide — bottom UI "jumps". The new callback fires at
  ~60 Hz with interpolated insets, updating `--inset-top` /
  `--inset-bottom` per frame so the existing CSS tracks smoothly.
  `onEnd` calls `requestApplyInsets` so the resting state routes
  through the normal listener (which updates the saved Activity-side
  fields for any future `injectInsets` callers). Intentional N1.5
  exception: per-frame inline `evaluateJavascript` (bypasses
  JsBridge for budget reasons; only %.2f-formatted numbers
  interpolated, so quote-injection is structurally impossible).
- **N1.9 (`8bd7e0e`)** — `MainViewModel` (AndroidViewModel). Holds
  the config-change-surviving state: insets, scale, splash hold,
  keep-screen-on, audio session mode, recorder state (later moved
  into NativeAudioRecorder), renderer recovery counters. Every
  reference becomes `vm.X` via bulk substitution. `onCleared` fires
  the recorder release. Manifest's existing `configChanges` covers
  rotation/uiMode/screenSize/etc., so the ViewModel is mostly
  insurance + a single named place for cleanup + future-proofing
  against config changes that escape the manifest list (locale).
- **N1.10a (`9dc4852`)** — Extract `NativeAudioRecorder` (192 lines).
  Six operations (start/pause/resume/amplitude/stop/cancel) + release.
  Returns a small sealed `Result<T>` (Success(value) / Failure(reason))
  matching the JS-side "ok" / "error:<reason>" string contract. Six
  `@JavascriptInterface` recording methods collapse to thin delegates.
  `MainViewModel` holds a single `audioRecorder` instance via
  `AndroidViewModel(application)`. `onCleared` delegates to release.
  MainActivity 1031 → 991 lines.
- **N1.10b (`c27a525`)** — Extract `StorageManager` (116 lines).
  `readUriAsBase64(uri, maxBytes)` (does size check + read + base64
  encode); `writeJsonToDownloads(filename, content)` (the Q+
  MediaStore Downloads path); `queryFileSize(uri)` (the
  OpenableColumns.SIZE query, exposed publicly in case a caller
  wants its own policy). `MAX_IMPORT_SIZE` moves into the companion.
  Returns its own sealed `Result<T>`. MainActivity 991 → 937 lines.

**Post-review hardening (3 commits):** a critical review pass after
N1.10b surfaced three real correctness paths that the build/assemble
gate alone hadn't caught. Each landed as its own commit, same one-fix-
per-commit discipline as the N1.x chain.

- **N1.3 hardening (`d8d0ab6`)** — Dangling `webView` field in the
  retry-view path. `onRenderProcessGone` destroyed the dying WebView
  and then either rebuilt + attached (normal) or called
  `showRendererCrashRetryView` (>2 crashes / 60 s) — but the retry
  branch never reassigned the `webView` field, so JsBridge's lazy
  provider would read the destroyed instance for any in-flight
  callback during the retry-view window (micPrepLauncher result,
  fileChooserCallback, delayed audio-session bridge call). Fix:
  always `webView = createConfiguredWebView()` BEFORE the branch;
  the retry click handler attaches the already-built fresh
  instance instead of constructing another.
- **N1.7 hardening (`1ea0127`)** — PixelCopy bitmap recycle race.
  `invokeOnCancellation { dest.recycle() }` recycled the destination
  bitmap eagerly on coroutine cancellation, but PixelCopy's contract
  requires the bitmap to stay alive "until the callback is invoked."
  Cancellation during a `withTimeoutOrNull` could let the native side
  write into a freed buffer. Fix: invokeOnCancellation just sets an
  `AtomicBoolean`; the PixelCopy callback handles recycle whether the
  coroutine cancelled or completed. IllegalArgumentException path also
  recycles inline (callback won't fire).
- **N1.10b hardening (`ff0f459`)** — `queryFileSize` exception safety.
  `contentResolver.query` can throw SecurityException (revoked URI
  permission) or IllegalStateException (closed provider); the previous
  implementation propagated the exception out of `readUriAsBase64` and
  out of the `filePickerLauncher` callback, crashing the app and
  leaving JS waiting on a never-fired `__onImportFile`. Fix: wrap the
  query in try/catch, return -1L on any exception. Folds into the
  existing "unknown_size" Failure branch — JS contract uniform,
  user sees the standard generic import-failed toast instead of a
  crash.

**Final line counts:** MainActivity 937 + JsBridge 104 + MainViewModel 67
\+ NativeAudioRecorder 192 + StorageManager 116 + VOTReaderApp 19 =
**1,435 lines total** (vs 869-line monolith pre-N1). The growth is
deliberate — each new file owns one concern (logging, JS bridge,
recorder, storage), and MainActivity is now the WebView shell + JS
bridge wiring + lifecycle, with the implementation details delegated.

**Verification:** every commit passed `:app:compileDebugKotlin` +
`:app:compileReleaseKotlin` + `:app:assembleDebug`. JS-side bundles
untouched (Kotlin-only commits don't trip the pre-commit's bundle
rebuild). The post-review hardening pass closed three real correctness
paths (`d8d0ab6` / `1ea0127` / `ff0f459`) before any real-device walk
could trip them; the remaining real-device verification is OWED for:
chrome://inspect attachment (N1.1), chrome://crash recovery (N1.3 +
its retry-view branch from the hardening), PixelCopy capture on
hardware-accelerated content (N1.6), keyboard animation smoothness
(N1.8), recorder survival across orientation change (N1.9), and the
full smoke walk covering import/export/record/screenshot. The Kotlin
wiring is correct; the visual + behavioral proof is owed against an
actual phone.

### Roadmap

**`PLAN.txt`** (repo root) is the strategic working memory — slim, current-state. The active sequence is **W0-W8 (PWA migration + quality hardening)**; full per-phase exit criteria and the 18-critique traceability matrix live there. HISTORY.md has the landed-work chapter. CLAUDE.md is the 30-second briefing.

---

## User policies (durable directives, override defaults)

- **App name is "VOTReader"** (personal app; multi-user-shaped but no auth, no organization).
- **NO AI / NO API KEYS / NO LLM** — deferred indefinitely per user 2026-05-11: *"no ai no nothing, no api keys, etc, those are security risks anyway, we'll defer a.i feature."* The LiteLLM nim-proxy is decommissioned. Do not reintroduce.
- **NO credentials / login / auth anywhere.** All personal data stays local on device.
- **NO security risks** — anything that could leak personal data or LAN-expose a service is a defect, not a polish item.
- `android:allowBackup="false"` — Export/Import in Settings → "Your Data" is the only backup mechanism. JSON file, user-owned, no credentials.
- GitHub identity (corbinlythgoe) and Garden image hosting on GitHub Releases are fine for now.
- No Play Store thinking until everything else is done — would also require Timothy's permission first.

---

## File structure

```
D:/VOTReader-studio/
├── CLAUDE.md                          # this briefing
├── HISTORY.md                         # landed work log
├── ARCHITECTURE.md                    # system reference
├── PLAN.txt                           # live strategic working memory
├── package.json, package-lock.json    # esbuild + eslint deps
├── .githooks/pre-commit               # versioned; activate: git config core.hooksPath .githooks
├── tools/
│   ├── build.py                       # emits bundle-a.js
│   ├── preview-server.py              # serves with Cache-Control: no-store
│   ├── smoke.js                       # 12-screen render walk + annotation round-trips
│   └── SMOKE.md                       # smoke harness docs
├── app/src/main/
│   ├── assets/
│   │   ├── index.html                 # 4,043 lines — App() lives in src/app.jsx now
│   │   ├── app.css                    # static CSS (no template literal)
│   │   ├── dist/                      # 4 bundles, regenerated by npm run build
│   │   └── src/
│   │       ├── app.jsx                # function App() — 797 lines (Phase 1 + 2 closed)
│   │       ├── data/                  # scripture-resolution.js + 29 raw corpus files
│   │       ├── stores/                # 11 stores + _entry-b.js
│   │       ├── renderer/              # annotation-engine, dom-links, dom-bookmarks, dom-journal-chip + _entry.js
│   │       ├── ui/
│   │       │   ├── screen-routes.jsx  # buildScreenRoutes factory — the 53-entry ROUTES table
│   │       │   ├── screens/           # 21 screens (incl. MatthewChapterView, BibleStudyChapterView)
│   │       │   ├── components/        # 25 shared components (incl. AppShellOverlays, AppShellSheets, HolyDaysPlaylistHeader)
│   │       │   ├── sheets/            # 17 sheets/pickers
│   │       │   └── _entry-d.js        # esbuild entry for bundle-d
│   │       ├── utils/                 # 11 helper bundles
│   │       ├── hooks/                 # 26 App() hooks (P6 + P7a–k; Phase 1 closed)
│   │       ├── components/            # ExpandableText, ErrorBoundary
│   │       └── styles/                # journal-styles
│   └── java/com/votreader/sacredui/
│       ├── MainActivity.kt              # WebView shell + lifecycle + BridgeHost impl (773 lines)
│       ├── AppInterface.kt              # 20 @JavascriptInterface methods (window.AndroidBridge)
│       ├── BridgeHost.kt                # Abstraction over Activity surface for AppInterface
│       ├── JsBridge.kt                  # Type-safe wrapper around evaluateJavascript
│       ├── JsEvent.kt                   # Sealed registry of native-to-JS callbacks
│       ├── MainViewModel.kt             # AndroidViewModel — recorder + storage + insets + recovery state
│       ├── VOTReaderApp.kt              # Application subclass — plants Timber DebugTree / BoundedLogTree
│       ├── BoundedLogTree.kt            # Release-build Timber tree — ring buffer of last 200 WARN+
│       ├── NativeAudioRecorder.kt       # MediaRecorder lifecycle for journal voice memos
│       └── StorageManager.kt            # File I/O: import readUriAsBase64 + saveToDownloads
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

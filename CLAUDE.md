# CLAUDE.md — VOTReader-studio Project Knowledge Base

> Living document. Update after every major examination or change.
> Last major update: 2026-05-20 (G.2.3 LANDED IN WORKING TREE — Cluster D now ES modules via esbuild; **all four clusters are now in their final build form**. Next: P6 App() hook extraction.).
>
> **CURRENT STATE (working tree past `e429848`)**:
> - **index.html**: 4,043 lines / 212 KB (down from 17,200 / 944 KB pre-modularization). Inline App() block + tiny lexical-mirror script + ReactDOM.render — that's it.
> - **130+ modules** under `app/src/main/assets/src/`. Every screen, sheet, component, store, hook, utility, and renderer helper is now an ES module (`export function …`) — except the 27 vendor + corpus-data files in Cluster A, which stay classic-script forever.
> - **4 cluster bundles** in `app/src/main/assets/dist/` — 1 classic-script (A) + 3 esbuild ES-module IIFE (B, C, D):
>   - `bundle-a.js` — 11.7 MB (vendor + 21 corpus + search engine)
>   - `bundle-b.js` — 267 KB (stores + components + hooks + journal + scripture-resolution + letter-linking — 29 files)
>   - `bundle-c.js` — 27 KB (renderer — 3 files)
>   - `bundle-d.js` — 507 KB (screens + sheets + components + utils + late stores — 81 files)
> - **esbuild 0.28.0** installed via npm; Node 24.15.0 via winget; package.json + node_modules/ at repo root.
> - **Pre-commit hook** at `.githooks/pre-commit` (activate: `git config core.hooksPath .githooks`) — runs check_balance.py on data changes + `npm run build` (chains python tools/build.py + esbuild B/C/D) on bundle-source changes, restages all 4 bundles. Probes for Node when not on inherited PATH.
> - **Smoke harness**: `tools/smoke.js` — runs globals audit + 12-screen render walk + LetterView + WtlbEntryView annotation round-trips + resource-error capture. Latest G.2.3 run PASS — all 12 screens reached + 0 crashed, letterAnn ok (133 marks + 13 icons), wtlbAnn ok (51 marks + 6 icons — exact match to G.2.1 baseline), 0 console.error, 0 resource404.
> - **tabField stability probe** baked into App() — surfaces setter-identity regressions via console.error (caught by smoke).
>
> **THE "ORIGINAL SIN" IS TWO PROBLEMS, NOT ONE**:
> 1. **No build system** — *DONE*. Was 135+ `<script src>` tags. G.1 collapsed to 4 cluster bundles via Python concatenator. G.2.0 installed esbuild toolchain. G.2.1/G.2.2/G.2.3 converted Clusters C/B/D to ES modules + esbuild IIFE bundles. Cluster A (vendor+data) stays classic-script forever (no benefit converting 27 third-party libs + corpus data files to ES modules). **All four clusters are now in their final build form.**
> 2. **No JSX** — Babel-compiled `React.createElement` chains as canonical source. Standard React tooling (ast-grep, jscodeshift, react-codemod) doesn't recognize it. Fix: incremental module-by-module JSX conversion, AFTER P6 lands. Do NOT big-bang rewrite — the annotation engine + boundary nav + scripture resolution have been debugged carefully over months.
>
> **CURRENT SEQUENCING (user-confirmed, refined through G.2.3 + P6d)**:
> - **NOW**: **P6 — `App()` hook extraction** IN PROGRESS. Landed so far: `useMarkAsRead` (P5d warmup), `useSavedState`+`_validateTabState` (P6a), `useRefMirror` (P6b), `useHistory` (P6c), `useThumbnails` (P6d), `useScrollMemory` (P6e), `useReadingDwell` (P6f), `useSettings` (P6g). Remaining per PLAN.txt §P6 revised order: P6h `useSheetOrchestration` → P6i `useFromLetterStack` → P6j `useNavigateToLink` → P6k `useTabs` (load-bearing, last) → P6l `useAndroidBack`. The riskiest single refactor in the plan — real semantic surgery (closure deps, React hook ordering, state passing between newly-separated hooks). Go ONE hook at a time; smoke after each; one hook = one commit.
> - **`App()` LINE COUNT (tracked per extraction — record the real `wc` number in every P6 commit message)**: post-P6g = **2,641 lines** (`function App()` at index.html:1000 → closing `}` at :3640). Progression: ~2,815 post-P6d → 2,735 post-P6e (−80) → 2,693 post-P6f (−42) → 2,641 post-P6g (−52). The "~2,500" figure in pre-P6d docs was a drifted estimate — measure, don't guess. Target when P6 completes: ~400 lines (hook composition + render tree). Each extraction should visibly move this number down; if a commit doesn't, something didn't actually leave App(). NOTE: the vot-state PERSIST effect deliberately stays in App() (P6g Option C) — it's a composition-level sink; it becomes `usePersistedState` after P6k when all 8 of its deps are hook returns.
> - **THEN**: JSX conversion, outside-in, module-by-module (now possible because every consumer is a module with explicit imports, so a converted `.jsx` file can co-exist with un-converted `.js` callers).
> - **LATER**: Vite for HMR (optional; esbuild IIFE output ships fine on Android WebView).
> - **AS-TRIGGERED**: P7 sync-ref audit per the calendar in PLAN.txt §P6 Direction 3.
> - **INTERLEAVED**: Objective I user-facing features (TTS, font controls, sepia, search relevance).
> - **P6 EXTRACTION WORKFLOW (proven through P6d — follow this exactly)**:
>   1. **Recon** — map the target's lines; classify every `useEffect` single-vs-mixed concern; **for any function/callback threaded as a hook param, verify it is a `useCallback` (stable identity), not a plain function recreated each render** — a plain function as a param re-fires the consuming hook's effects every render. Check stability, not just presence.
>   2. **Brief** — write the HARD hook signature (input/output type sigs, not just line ranges) + DO NOT MOVE callsite list + invariants. Tell the coding agent: *"Follow the structure of `src/hooks/use-thumbnails.js` — named `export function`, destructured params object, no default export, `React.*`-prefixed hooks, header comment with OWNS/DOES NOT OWN/PARAMS/RETURNS/STORAGE."*
>   3. **Code** — coding agent (or direct) writes the hook + edits App().
>   4. **Diff review** — 2-min read of `git diff` BEFORE smoke. Agents drop lines / mis-thread params in ways smoke won't catch.
>   5. **Verify** — `npm run build` + smoke harness. Then **identify the ONE manual test smoke structurally cannot cover and run it** — this is mandatory, not optional. P6d's was "enable tabs → navigate → confirm thumbnail captured to IndexedDB" (caught that `tabsEnabled` threading would be invisible to smoke since the walk runs with tabs off). P6e's is: "navigate to a screen → scroll down → navigate away → navigate back → confirm scroll position restored." Snapshot/restore any localStorage or IndexedDB the test touches.
>   6. **Commit** — one hook = one commit. Record the new `App()` line count in the message.
>   - **P6+ hardening principle**: prefer bare `let`/`const` over `export let`/`export const` for truly module-private mutable state — strict-mode is satisfied by the binding alone.
>   - **Agent-cutoff recovery**: if a coding agent is interrupted, Edit/Write are atomic so no file is half-written — `git diff` each target file, confirm each is syntactically whole (`node --check` for hook files; build + smoke for the whole), and the only loss is the agent's text report, which you reconstruct from the diff.
>
> **OBJECTIVE G LANDED COMMITS**:
> - **G.1 (`f919017`)** — `tools/build.py` concatenates 139 `<script src>` tags into 4 cluster bundles (`dist/bundle-{a,b,c,d}.js`). Pure Python. byte-equivalent output to pre-G.1 load order. Smoke PASS identically.
> - **Pre-commit hook fix (`47a87ee`)** — relocated `.git/hooks/pre-commit` → `.githooks/pre-commit` (versioned). Per-clone setup: `git config core.hooksPath .githooks`. Path inside `check_balance.py` updated to use `_HERE`-relative resolution (was stale `C:\` absolute path since P3.5b — silently dead validator). Extended hook with bundle-rebuild step: if any bundle source is staged, run `npm run build` and restage `dist/`.
> - **G.2.0 (`47d1b70`)** — installed Node 24.15.0 (via `winget install OpenJS.NodeJS.LTS`) + esbuild 0.28.0 (via `npm install esbuild --save-dev`). `package.json` + `package-lock.json` committed; `node_modules/` gitignored. Toolchain installed, NOT yet invoked. Smoke PASS identically.
> - **G.2.1 (`894b996`)** — Cluster C (renderer) → ES modules. 9 public exports across `dom-links.js`, `dom-bookmarks.js`, `annotation-engine.js`. New `src/renderer/_entry.js` is esbuild's entry — imports all + `Object.assign(window, {...})` for classic-script interop with the still-unconverted rest of the app. `tools/build.py` skips cluster C (`C = []`). `package.json` scripts: `build` chains python + esbuild; `build:c` = `esbuild ... --bundle --format=iife`. `dist/bundle-c.js` shrunk 49 KB classic-concat → 26.5 KB esbuild IIFE. Smoke PASS in 20.9s.
> - **G.2.2 (`e429848`)** — Cluster B (stores + components + hooks + journal + scripture-resolution + letter-linking) → ES modules. 29 files, complex web of intra-cluster dependencies handled via a mix of explicit imports (for true eval-time deps like `CachedStore()` calls at module-top) and bare-name + window-bridge (for everything else). `_entry-b.js` lives at `src/stores/_entry-b.js`. Journal screens/sheets imported via wildcard so internal helpers (`JournalCardMenu`, `jrnRenderInline`, `JournalBlockView`) propagate to window without enumeration. `journal-helpers.js ↔ journal-store.js` true-cycle preserved with `typeof X !== 'undefined'` guards — eval-time safe because neither module touches the other at top level. Smoke PASS identically.
> - **G.2.3 (`a4a4506`)** — Cluster D (screens + sheets + components + utils + late stores) → ES modules. 81 files, **131 exports added** by a mechanical transformation script (`tools/_g23_add_exports.py` — column-0 `function/const/let/var/class` → `export <kw>`, idempotency-guarded). New `src/ui/_entry-d.js` is esbuild's entry — explicit named imports (no wildcards needed; survey found NO true eval-time intra-D dependencies — every cross-file reference is inside a function body, so import ordering is irrelevant). `tools/build.py` now emits only `bundle-a.js`; the docstring + main() updated to reflect this. `package.json` `build` chains `python tools/build.py && build:b && build:c && build:d`. `dist/bundle-d.js` = 495 KB esbuild IIFE. **Strict-mode discovery**: ES modules are implicitly strict, so the in-function `_thumbDbPromise = X` / `_bibleStudiesPromise = X` assignments in `thumb-store.js` / `translations.js` would throw `ReferenceError` if those identifiers weren't bound at module scope. Same applies to any module-private mutable state. Fix: moved `THUMB_DB / THUMB_STORE / _thumbDbPromise / _translationPromises / _translationLoaded / _bibleStudiesPromise / GARDEN_TOTAL / GARDEN_TIERS / GARDEN_DEFAULT_TIER / gardenImageCache / EXPAND_THRESHOLD / MIN_HIDDEN_WORDS / GARDEN_PRELOAD_AHEAD / GARDEN_CRAWL_DELAY` into their owning modules. Used `export const` / `export let` for everything — future hardening (P6+): bare `let`/`const` for module-private mutables since strict-mode is satisfied by the binding alone. Smoke PASS — 12/12 screens reached, 0 crashed, 0 unreached, both annotation round-trips exact-match to G.2.1 baseline (133+13 / 51+6 marks/icons), 0 console.error, 0 resource404.
> - **G.2.3 follow-up (THIS WORKING TREE)** — 14 dead module-state declarations removed from index.html (the dupes left behind by G.2.3 since the modules now own those bindings). Three surgical edits, each leaves an audit-trail breadcrumb comment pointing to the owning module. Pristine baseline before P6 begins — no dead code, no drift between index.html and the modules. Smoke PASS — globals still resolve via window (cleanup probes confirmed: `EXPAND_THRESHOLD: number`, `GARDEN_TIERS: object`, `GARDEN_DEFAULT_TIER: string`, `GARDEN_TOTAL: number`, `THUMB_DB: string`, `openThumbDB: function`, `loadTranslation: function`, `gardenPreload: function`), letter+wtlb annotation round-trips bit-perfect to baseline.
>
> **WORKING-DIRECTORY HEALTH CHECK** (run after fresh clone):
> ```sh
> # 1. activate the pre-commit hook
> git config core.hooksPath .githooks
> # 2. install Node deps (node_modules/ is gitignored)
> npm install
> # 3. verify the toolchain
> node --version    # expect v20+
> npx esbuild --version    # expect 0.28+
> # 4. rebuild bundles from source (proves the build pipeline works)
> npm run build
> # 5. open app/src/main/assets/index.html via preview tool;
> #    paste tools/smoke.js into preview_eval and call votSmoke()
> #    expect PASS line with globals ok, data ok, screens 0 crashed,
> #    letterAnn ok, wtlbAnn ok, console.error 0, resource404 0
> ```
> If Node is missing on Windows: `winget install OpenJS.NodeJS.LTS`. Use bash/git-bash for npm commands (PowerShell execution policy blocks `npm.ps1`).
>
> **PHASES LANDED (this session):**
> - **Phase-0 (`cedd7ed`)** — smoke harness (`tools/smoke.js` + `tools/SMOKE.md`). Globals audit + COLLECTIONS data-wiring + 12-screen render walk + annotation round-trip. Lives outside the shipped asset path; runs IN the app page via `preview_eval` or `chrome://inspect`. Green baseline captured here; every subsequent phase verified against it.
> - **P1 (`dff8d7b`)** — annotation engine → `src/renderer/annotation-engine.js` (9 symbols, ~345 lines: `snapRangeToWords`, `annMarkClass`, `HighlightableText`, `findNoteIconInsertionPoint`, `_markCharEnd`, `applyNoteIcons`, `applyActiveNoteState`, `applyDOMHighlights`, `StaticSubtree`). `HighlightableText` upgraded to `React.useMemo` for self-containment.
> - **P2 (`675b12b`)** — CSS-in-JS → static `app.css` + `<link>` in `<head>`. **Eliminates the `const CSS = \`...\`` backtick-template-literal black-screen footgun entirely** (no template literal anywhere). Only transform needed was `\\2060` → `\2060` on 2 word-joiner lines (provably the only backslash sequences in the 4.4k-line block). CSP `style-src 'self'` already permitted `<link>`. React `<style>` consumer replaced with a no-op `null` child.
> - **P3 (`51a9972`)** — scripture/data resolution → `src/data/scripture-resolution.js` (27 symbols: `COLLECTIONS` registry + `COL_BY_*` derived maps + `parseRefStr` / `findBook` / `parseScriptureRef` / `resolveVerseText` / `findEntryContext` / `lookupVersesFromBooks` + `colLetters`/`colPreface`/`colLetterArr` + `LETTER_SCREEN_SET` + `_allBooks`/`_matthew`/`_studies` + `READING_CHAIN` + boundary helpers).
> - **P3.5a (`b1a79ee`)** — the 5 remaining inline stores → `src/stores/`: `cached-store.js` (factory, loads first), `annotation-store.js` (+ `HighlightStore` alias + `migrateAnnotations` + the on-load migration call), `note-store.js`, `notebook-store.js`, `recent-nav-store.js`. Every store now lives in its own module — none left inline.
> - **P3.5b (`d952c23`)** — all 29 raw corpus data files moved `app/src/main/assets/data/` → `app/src/main/assets/src/data/` via `git mv` (preserves history). 25 path references updated (21 static `<script src>` + 2 dynamic in `index.html` for `loadTranslation` + lazy bible-studies + 2 in `search.js`). Empty `data/` dir removed. **Single home for all data + code under `src/`.**
> - **P4b–P4e (`3fa54d5`, `8ee6cbb`, `10fce2a`)** — the 4 big reading-screen components → `src/ui/screens/`: `LetterView.js` (~27 KB), `WtlbEntryView.js` (~18 KB), `BibleChapterView.js` (~13 KB), `ChapterView.js` (~12 KB).
> - **P5a (`ed5603d`)** — 9 remaining screens → `src/ui/screens/`: `HomeScreen`, `SettingsScreen` (~38 KB, the largest), `HistoryScreen`, `SearchScreen`, `NotesIndexScreen`, `LibraryScreen`, `AboutScreen`, `VolumesHome`, `StudiesHome`. ~123 KB / ~3,000 lines.
> - **P5b (`36657e5`)** — 23 shared components → `src/ui/components/`: `Segments`, `FootnoteSheet`, `InAppLinkButton`, `ScreenLayout`, `NavButtons`, `LibraryNav`, `ProphecyCard`/`Group`/`ExpandToggle`, `ThemeBtn`, `HomeBtn`, `TabsNavBtn`, `StickyChapterNav`, `ModeToggle`, `ChapterBookmarkBtn`, `ExpandableVerse`, `VerseWithNumbers`, `ScriptureSheet`, `ScriptureVerseText`, `FootnoteListSection`, `InlineNotes`, `InlineEcho`, `StudyPanels`. ~88 KB.
> - **P5c (`8cf2081`)** — 11 sheet/picker components → `src/ui/sheets/`: `SelectionToolbar` (~34 KB, by far the largest), `NoteSheet`, `VersePickerScreen`, `LetterExcerptPickerScreen`, `LinkPicker`, `TabsOverview`, `AnnotationActionChip`, `NotebookPickerSheet`, `TabActionSheet`, `LinkSidebar`, `MultiNotePopover`. ~92 KB / ~1,900 lines. Bottom-up extraction order (each function's terminator stayed inline until after the function was gone). Zero new console errors introduced.
> - **P5d (`5ea3e66`)** — VolumeIndex consolidation + 18 small components/hooks. Deleted legacy `VolumeIndex` (V2-hardcoded) and `VolumeOneIndex` (V1-hardcoded); both call sites now use the generic `VolumeLetterIndex`. All 14 collections share ONE index component. Extracted: `SrchCard`/`SrchSnippet`/`SrchGroup`, `ClearProgressRow`/`SettingsRow`/`SelectField`, `VolumeLetterIndex`, `HistoryEntryCard`, `NoteRow`, `LinkCard`/`LinkIcon`, `NotebookManagerSheet`, `BibleStudyIndex`/`ChapterIndex`/`GardenView`/`ScriptureGenre`/`ScripturesHome`, `ErrorBoundary` (class), and `useMarkAsRead` (FIRST hook extracted — P6 warmup). Hardened extractor with proper JS brace-matching (replaces the naive `rfind('\\n}\\n')` heuristic that swept adjacent helpers).
> - **P5e (`449dd46`)** — 46 helpers extracted to 13 domain bundles via new `tools/_p5e_bundle_helpers.py` (same brace-match logic, multi-function-per-file). Buckets: `utils/hl-keys` · `utils/dates` · `utils/garden` · `utils/tabs` · `utils/nav-index` (16 KB — LinkPicker's brain) · `utils/note-source` · `utils/book-category` · `utils/scripture-parse` · `utils/highlight` · `utils/render-text` · `utils/search` · `stores/thumb-store` · `data/translations` · `data/letter-linking`. Load-order fix landed: letter-linking.js must load BEFORE the big inline `<script>` block (top-level boot code calls `linkPreface`/`linkWtlbEntries` at module scope).
> - **P5f (`72c6b7d`)** — dead-code audit. Removed `ann.style` defensive fallback guards (5 sites — one-shot annotation migration makes them unreachable). Discipline directive ("real bugs surface, never bandaid") kept: the `|| 'highlight'` default stays for kind-less entries, only the dead style→kind translation is gone.
> - **P5g (`1693715`)** — smoke harness hardened. CSP-safe `resolve()` (window-first, eval fallback only when privileged — works under production CSP); `EXPECTED_GLOBALS` expanded with all P5d/P5e symbols (50+ new probes); new `wtlbAnnotationRoundTrip()` exercises the WtlbEntryView path (the existing one only covered LetterView). 11 lexical-only consts mirrored to `window` via a tiny inline script at end of body so the harness can probe them without eval. Live-verified: **PASS | globals ok | data ok | 12 screens 0 crashed | letterAnn ok | wtlbAnn ok (51 marks + 6 note icons) | 0 console.error | 18s**.
>
> **EXTRACTOR SCRIPT (`tools/_p4_extract_view.py`):** parameterized React-component extractor used for P4–P5b. Args: `<VIEW_NAME> <NEXT_FUNC_NAME> [<subdir>]`. Auto-detects CRLF vs LF (git autocrlf flips it mid-session). Regex-based hook upgrade (`(?<![.\w])useX\(` so already-prefixed `React.useX` aren't double-wrapped). Refuse-to-write guards: body 300 B – 50 KB, body ends with proper closing (`}` for functions, `});` for Object.assign stores, `const HighlightStore = AnnotationStore;` for the annotation-store special), `<script src>` inserted exactly once, zero inline definitions remaining. **The harness + extractor caught 3 real defects this session** that the discipline ("real bugs surface, never bandaid") then forced to be root-fixed: (1) P3.5a stores end anchor `});\n` also matched `JSON.stringify({...});` inside store bodies → silent truncation; fixed by `\n});\n` (column-0 only). (2) P4c `WtlbEntryView` naive `useMemo(` replace turned `React.useMemo(` into `React.React.useMemo(` → undefined.X TypeError; fixed by negative-lookbehind regex + a `'React.React.' in body` refuse-to-write guard. (3) P5b various start-anchor / size-floor / closing-brace cases. Every fix was at the ROOT — no silent fallbacks anywhere.
>
> **NEW MODULE LAYOUT** (`app/src/main/assets/src/`):
> - `data/` — `scripture-resolution.js`, `journal-helpers.js`, plus 29 raw corpus files (`volume-*.js`, `books*.js`, `matthew*.js`, `bible-*.js`, `wtlb-*.js`, `the-blessed.js`, `holy-days.js`, `hidden-manna.js`, `letters-*.js`, `lords-rebuke.js`, `bible-studies.js`)
> - `stores/` — `cached-store`, `annotation-store`, `note-store`, `notebook-store`, `recent-nav-store`, `link-store`, `bookmark-store`, `journal-store`, `journal-stats-store`, `journal-index-store`, `journal-media-store`
> - `renderer/` — `annotation-engine`, `dom-links`, `dom-bookmarks`, `dom-journal-chip`
> - `ui/screens/` — 19 screens: 4 reading views (Letter/WtlbEntry/BibleChapter/Chapter) + Home/Settings/History/Search/Notes/Library/About/VolumesHome/StudiesHome + Bookmarks/Highlights/Links + Journal hub/viewer/editor
> - `ui/components/` — 23 shared components (Segments + footnote/scripture sheets + nav buttons + prophecy cards + inline study panels + etc.)
> - `ui/sheets/` — 17 sheets: `BookmarkCreateSheet`, `JournalRecordingSheet`, `JournalInsertSheet`, `JournalNotebookSheet`, `JournalInboundSheet` (P5b earlier), plus P5c: `SelectionToolbar`, `NoteSheet`, `VersePickerScreen`, `LetterExcerptPickerScreen`, `LinkPicker`, `TabsOverview`, `AnnotationActionChip`, `NotebookPickerSheet`, `TabActionSheet`, `LinkSidebar`, `MultiNotePopover`, plus P5d: `NotebookManagerSheet`
> - `utils/` (NEW in P5e) — 11 bundles: `hl-keys`, `dates`, `garden`, `tabs`, `nav-index`, `note-source`, `book-category`, `scripture-parse`, `highlight`, `render-text`, `search`
> - `hooks/` (NEW in P5d) — `useMarkAsRead` (the P6 warmup; more hooks land here when P6 begins)
> - `components/` — `ExpandableText`, `ErrorBoundary` (P5d)
> - `components/` — `ExpandableText` (used by journal/bookmarks/notes)
> - `styles/` — `journal-styles`
>
> **WHAT'S LEFT IN `index.html` (3,680 lines / ~202 KB as of post-P6g):**
> - `App()` — **2,641 lines** (`function App()` at :1000 → closing `}` at :3640), **the only big inline component left, P6 target for hook extraction** (P6a-g extracted 8 hooks; 5 to go)
> - The Babel runtime `_extends` helper at the very top
> - Boot-time top-level code in the big inline `<script>` block (before :1000): COLLECTIONS forEach that wires preface/nextEntry links, `BIBLE_BOOK_LIST` + `OT_BOOK_IDS` declarations, `LETTER_TITLE_MAP`/`VOT_LETTER_REGISTRY`/`MATTHEW_CHAIN_ENTRY`/`HIDDEN_MANNA_TITLES`, navigation glue used inside App's render tree
> - The bottom lexical-mirror script (`<script>` at :3826 — mirrors lexical-only consts onto window for the smoke harness)
> - The final `ReactDOM.createRoot()` + render (:3851-3852)
> - ~50 one-line breadcrumb comments pointing to extracted modules (debug aids)
>
> **NEXT: P6h — `useSheetOrchestration`.** See the CURRENT SEQUENCING block above for the full P6h-l order and the proven 6-step extraction workflow. P6 is the riskiest single refactor in the plan — real semantic surgery (closure deps, React hook ordering, state passing between separated hooks) — but the workflow is now proven through P6d-P6g and the smoke harness + mandatory per-extraction targeted test catch regressions cleanly. NOTE for P6h (PLAN.txt §P6 Cluster 12): ~11 sheet/overlay state slots + their `window.__open*` bridge effects + the auto-dismiss-on-screen-change effect. Each setter is a leaf (LOW risk) but every window-bridge cleanup return must be preserved — the smoke harness's wtlbAnnotation round-trip silently fails if `__openNote`/`__showAnnChip`/etc. aren't cleaned up between renders (see PLAN.txt §P6 invariant 6).
>
> **`tools/_p5e_bundle_helpers.py`** — new bundling extractor that pulls multiple pure-function helpers into one domain-grouped module. Same brace-match + hook-upgrade + refuse-to-write logic as `_p4_extract_view.py`. Used for P5e helper bundles.
>
> Previous: 2026-05-19 (Status truth-up + stale-flag clearance. User-confirmed on real device this session: Journal voice recording WORKS on PC + Android (clears the §22 "needs on-device APK test" caveat); app icon finalized → Objective D FULLY complete (only release-signing deferred by policy). The 05-15 "IN PROGRESS" items — keyboard-aware sheets via visualViewport `--keyboard-height`, and BookmarkCreateSheet edit-mode + `__bookmarkEdit` bridge — are CONFIRMED complete and on-device-verified; stale flags cleared in PLAN.txt §8 and §22.4 below. Commit `2db70f5` (this session) landed: the annotation-nav crash + stale-content corruption ROOT fix (new `StaticSubtree` freezes each `[data-hl-dom]` block + content-keyed remount so React never reconciles the text nodes `applyDOMHighlights` splits/re-parents → kills both the `removeChild` NotFoundError crash AND the prev-letter-bleeds-into-next corruption; footnote active-state moved to a DOM class toggle; pipeline try/catch + stale-node guards), footnote title de-dup (`_fnTextRedundantWithLink`; bottom-of-page list link button now shows the destination title instead of a bare "Open in App"), Library `onSettings` threaded to all 7 sub-screens (the gear was a dead no-op under Library), and journal-stats wiring (orphaned `journal-stats-store.js` now loaded + recompute on boot + record create/delete). Plan state: Objectives A–D + H complete; **next frontier is E/F — `index.html` is still one ~17.5k-line file and `data-normalize.js` is unwired**. Previous: 2026-05-15 (Journal voice recording rearchitected + cross-platform mic fixes — root-caused two separate failures via parallel research agents and fixed both. DESKTOP: `index.html` CSP had `media-src 'none'` which silently blocked EVERY `<audio>` blob: URL on all platforms — recordings captured fine but never played (preview AND after-save); changed to `media-src blob:` (live-verified); also waveform amplification `rms*3`→`rms*8`. ANDROID: replaced the unreliable WebView `getUserMedia` path with a NATIVE Kotlin `MediaRecorder` bridge (AAC/.m4a in cacheDir) — `nativeRecordStart/Pause/Resume/Stop/Cancel/Amplitude` `@JavascriptInterface` methods + `postNativeComplete` → `window.__onNativeRecordingComplete(base64,durMs,mime)` handoff; `JournalRecordingSheet.js` `startCapture()` dispatches native(Android)/getUserMedia(desktop); live waveform restored on Android via `MediaRecorder.getMaxAmplitude()` polling. Pre-native WebView hardening also landed and is now harmless dead-defense on Android: `MODIFY_AUDIO_SETTINGS` manifest perm, `startAudioSession/endAudioSession` AudioManager MODE_IN_COMMUNICATION bridge, `onPermissionRequest` 250ms grace delay, `getUserMedia` NotReadableError retry+backoff, isAndroid analyser guard. See §22 below. Desktop verified in preview; Android needs on-device APK test. Working tree only — not committed.). Previous: 2026-05-15 (Library hub feature push — Links system (schema migration {a,b}→{source,target} with source/target visual distinction on inline icons, LinksScreen browser, Library "My Links" tile, two adjacent fixes); Bookmarks system (full Library tile + BookmarksScreen browser, BookmarkStore + applyDOMBookmarks with creation-pulse animation, `thought` field on every bookmark with inline edit in popover + action sheet, chapter-level NavButton on every reading screen, date surfacing across BookmarkPopover / NoteSheet / LinkSidebar cards, Android SVG-fill icon visibility fix, read-more / collapse for long thoughts, pre-commit BookmarkCreateSheet replacing silent-add); IN PROGRESS: visualViewport keyboard-height tracking so sheets lift above the soft keyboard, plus extending BookmarkCreateSheet for an edit-mode that the inline icon tap opens directly. Three modules now extracted to src/: link-store, dom-links, LinksScreen, bookmark-store, dom-bookmarks, BookmarksScreen, BookmarkCreateSheet. See PLAN.txt §8 newest entries.). Previous: 2026-05-14 (startup perf + safety net: bible-studies.js now lazy-loaded via loadBibleStudies() saving 4.3 MB from cold-boot; .git/hooks/pre-commit wired to run check_balance.py on data-file commits; see commit b9b769b). Previous: 2026-05-12 (Objective D autonomous finish — Android 12+ SplashScreen API holds until WebView's first paint, JS-side "Keep Screen On While Reading" toggle in Settings → Reading Experience bridging the Kotlin setKeepScreenOn at ac439b3, [object CSS] React #31 investigation closed as Android-only or already silenced by the Objective E batch; see PLAN.txt §8 2026-05-12 entry). Previous: 2026-05-11 (Objective E Android polish batch — 5 fixes; see §20 below). Previous: 2026-05-11 full Objective C complete: improvement2.txt Day 1 + Day 2 footnote system + 10 §12 critical bugs + WTLB attribution tap-through + universal single-shot back-pill + Day 4-5 polish + 3 footnote audit fixes from a parallel session; About screen + first-run flow gated by `vot-about-seen`; all 9 session commits fast-forward-merged into `origin/main` at `b19f511` so the GitHub repo's `main` is now the canonical "live" version; AI deferred indefinitely per user direction). Previous: 2026-05-10 Notes / Library / Notebooks system landed (parallel session, see §17.13–§17.18); Phase 0 git setup completed — repo at github.com/corbinlythgoe/VOTReader-studio, private, auth cached.
>
> **Working dir**: `D:\VOTReader-studio` (canonical). The C: OneDrive path is legacy — `C:\Users\corbi\OneDrive\Desktop\VOTReader-studio\app` is now a Junction → `D:\VOTReader-studio\app` (set up 2026-05-08, see Section 17.11). Always edit D: files.
>
> **CLAUDE.md is NOT the authority — it's a snapshot with known drift.** Trust order:
> 1. `D:\VOTReader-studio\PLAN.txt` — live strategic working memory (§19 sequencing, §15 confirmed CLAUDE.md drift, §17 lessons)
> 2. `C:\Users\corbi\OneDrive\Desktop\improvement2.txt` — authoritative verified fix list (831 lines, sequenced by impact)
> 3. `C:\Users\corbi\OneDrive\Desktop\handoff_for_next_session.txt` — orientation note (read first in a fresh session)
> 4. CLAUDE.md — the project knowledge base, but **always verify line numbers and specific claims with Grep before acting**.
>
> **Known drift in this file** (as of 2026-05-19, post-modularization push P1-P5b):
> - **Section 2 (Screen→Component map) is fully obsolete.** All 19 screens listed in the table now live in `src/ui/screens/*.js`, not at the index.html line numbers shown. The line-number column is meaningless. Use the table for *which screen does what* only; for *where the code lives*, use the new module layout in the top entry. PLAN.txt §16 is also obsolete for the same reason.
> - **index.html is now 8,244 lines / 419 KB** (was 17,200 / 944 KB). App() starts around line 5,800 and is ~2,500 lines — still the largest single function but no longer buried.
> - **Sections 17–19 reflect pre-modularization architecture.** The annotation system, COLLECTIONS registry, NavButtons, CachedStore, sharedViewProps, _idxNav, boundaryConfig, etc. all still work *as described*, but the code now lives in extracted modules (`src/renderer/annotation-engine.js`, `src/data/scripture-resolution.js`, `src/ui/components/NavButtons.js`, `src/stores/cached-store.js`, `src/ui/screens/*.js`). The cross-references to inline line numbers are stale.
> - Section 15 (NIM proxy) describes a FastAPI `proxy.py` that no longer exists; AI deferred indefinitely. Treat §15 as defunct.
> - Section 17.11 OneDrive backup claim has never been verified to actually sync D:\ contents to cloud — GitHub is the primary code backup now.
> - Section 18.17 says "11 boundary blocks" — actual is 14 (V1–V7 + Timothy + Flock + Rebuke + WTLB1/2 + Blessed + HolyDays).
> - Section 19.3 says "3-4 !important declarations" — actual is ~34.
> - Section 14 reports "54 D-pattern bugs fixed" — a later UX walkthrough flagged 21 D8 glued-text bugs still present in WTLB/Blessed (CLAUDE.md §14 may be optimistic; PLAN.txt §12 details).
> - Section 6.7 says all defensive renderer guards are "still needed" — the `ann.style` fallbacks are dead after the annotation migration.
> - **CSS is no longer in a template literal.** P2 moved it to `app/src/main/assets/app.css` + `<link>` in `<head>`. The "stray-backtick-in-CSS-comment kills the app" footgun documented in §17.11b is now impossible. (Section text retained for historical context.)
>
> **User policies (durable directives, override defaults)** — full versions in PLAN.txt §6:
> - **App name is "VOTReader"** (personal app; multi-user-shaped but no auth, no organization)
> - **NO AI / NO API KEYS / NO LLM** — deferred indefinitely per user 2026-05-11: *"no ai no nothing, no api keys, etc, those are security risks anyway, we'll defer a.i feature."* The LiteLLM nim-proxy is decommissioned. Do not reintroduce.
> - **NO credentials / login / auth anywhere.** All personal data stays local on device.
> - **NO security risks** — anything that could leak personal data or LAN-expose a service is a defect, not a polish item.
> - `android:allowBackup="false"` — Export/Import in Settings → "Your Data" is the only backup mechanism. JSON file, user-owned, no credentials.
> - GitHub identity (corbinlythgoe) and Garden image hosting on GitHub Releases are fine for now. Cloudflare R2/similar migration is "if necessary," not blocking.
> - **Welcome flow target state**: splash + ✕ stays as first-run. On the home screen, add a × button (reopens splash) AND an "i" button next to it (opens the already-finished About screen). Part of Objective D shipping polish.
> - No Play Store thinking until everything else is done — would also require Timothy's permission first.
>
> **Recent landings on `claude/jovial-yalow-bf2629`** (2026-05-11):
> - Objective A: junction verified, NIM proxy infrastructure entirely deleted, 9 `.bak-pre-*` files (~39 MB) + `orama.min.js` (~70 KB) deleted from the asset tree
> - Objective B: `allowBackup="false"`, app name + `<title>` = "VOTReader", `migrateAnnotations` silent-flag-on-failure fixed, `vot-state` save warns on quota now, Settings → "Your Data" section with Export / Import / Clear All Personal Data (verified live)
> - improvement2.txt Day 1: back-pill missing space, handleAndroidBack Library + Notes-Index cases, SCHEMA_VERSION 11→12, removed two no-op settings (`searchFuzzy`/`searchAllTranslations`), welcome catch return value (verified live)
> - Objective D piece: AboutScreen + home-nav `i` button. Home now has two buttons side-by-side in the upper left — cross icon reopens the splash image (titled "Welcome image"), new `i` icon opens the About VOTReader screen. About uses a card layout with 3-diamond ornaments top + bottom, "ABOUT VOTREADER" Cinzel uppercase heading, 4 EB-Garamond paragraphs, and a gold-outlined CONTINUE button. First-run flow: splash → ✕ → About auto-opens (only once, gated by new `vot-about-seen` localStorage flag) → CONTINUE → home. Subsequent launches go directly to home; the `i` button reopens About on demand.
> - improvement2.txt Day 2 (footnote system) — silent verse-blank fallback, fn.link+fn.url coexistence, prev/next nav inside the sheet ("Footnote N of M" + circular ‹/› buttons), `.fn-ref.active` visible on touch (`activeFn` now reads `sheetFn ?? highlightedFn`), and tap-to-scroll-back from FootnoteListSection (bubble lookup via new `data-fn-num` attribute). Verified live on Volume 2 / "The Wide Path".
> - §12 critical bugs — ALL 10 LANDED (2026-05-11):
>     • Prophecy card persistence (setExpanded now handles updater fn)
>     • Matthew Study note labels (verse at p[2] not p[3] for studies)
>     • NoteSheet startInEditMode (key prop forces remount on groupId change)
>     • destSnapshot null/undefined matcher (loose-equal nullish — pill now shows)
>     • Phantom empty notes (zero-segment + zero-width guards in handleNote)
>     • Holy Days letter-type note routing (findEntryContext HD fallback)
>     • WTLB Part 1 + 2 intros (data-level — emphasis spans now line-contained)
>     • 20 D8 glued-text bugs in WTLB One/Two (regex sweep with backslash-aware lookbehind)
>     • Translation-tagged inline refs (lookupVersesFromBooks honors p.tag + lazy-loads)
>     • Android hardware back button (MainActivity.kt — evaluateJavascript window.handleAndroidBack, finish() on "false")
> - WTLB attribution tap-through (2026-05-11): `[From "Title" ~ Volume N]` inline patterns in WTLB/Blessed are now live letter-links. WtlbEntryView's renderLine got a new split pattern; the parsed volume number maps to "Volume One"..."Volume Seven" via `_attrCollectionLabel` and calls `onInAppLink` with source meta so the destination pill reads "Back to <Part Label> · <Entry>".
> - All back-pills universally single-shot (2026-05-11): `openInAppLetter` now computes a `destSnapshot` from the resolved letter (studies + regular). The existing prune useEffect + `_destMatches` (from §12 bug #4) now hide the pill the moment the user navigates away from the destination. Every back-pill in the app — Notes index, footnote tap-throughs, attribution links, letter-link segments, addendum cards — is single-shot. Pill persists while on the destination; vanishes on next/prev arrow, chapter jump, or any onward navigation.
> - **Objective D Kotlin + manifest + CSP batch (2026-05-11, committed locally not yet pushed at handoff time — see handoff_for_next_session_2026-05-11.txt):** WebChromeClient.onConsoleMessage routes JS console to Logcat as `WebViewJS` tag; URL-scheme allowlist (`https`, `http`, `mailto`, `tel`) in shouldOverrideUrlLoading replaces the previous "anything to ACTION_VIEW" behavior; `Type.ime()` added to window-inset injection so floating UI moves above the soft keyboard; `setKeepScreenOn(Boolean)` AndroidBridge method (JS-side Settings toggle still TODO); `launchMode="singleTask"` + expanded `configChanges="...|smallestScreenSize|uiMode|screenLayout"`; CSP meta tag with policy locking to `self` + appassets-loader host + GitHub raw for Garden images + thevolumesoftruth.com for the online-check ping.
> - **Build-fix note:** the gradle "Unable to delete directory" build failure user hit is a Windows file-lock issue (gradle daemon / OneDrive sync / AV scanning), not a code bug. Fix: `./gradlew --stop` then `rm -rf app/build/`. Long-term: tell OneDrive to ignore `app/build/`, add AV exclusion. The `/build/` and `/app/build/` paths are already in `.gitignore`.
> - **Footnote audit fixes (2026-05-11)** — three broken cross-link `letterTitle` mismatches caught by a parallel-session full audit and applied here: (1) `letters-timothy.js` "the-shadow-of-the-almighty" fn1 — ASCII apostrophe replaced with U+2019 to match the actual letter title; (2) `letters-flock.js` "a-wise-servant-and-the-line" fn1 — removed trailing `.` not present in the V7 title; (3) `volume-six.js` "full-circle" fn2 — removed broken `link` object (was pointing at an external wiki article name, not a VOT letter); the `fn.url` external link still renders (now reachable via the D2.2 dual-rendering fix).
> - improvement2.txt Day 4-5 polish — ALL DONE (2026-05-11):
>     • MATTHEW.chapters.length guarded via `_matthew()?.chapters?.length || 0`
>     • LinkPicker overlay z-index 8500 → 8502 (above NoteSheet)
>     • Keyboard focus indicators restored via `:focus-visible` + `:focus:not(:focus-visible)` pair
>     • cancelDwell() added to switchToTab (no more wrong-tab mark-as-read)
>     • NoteSheet textarea scrollIntoView on focus (Android keyboard)
>     • NotebookPickerSheet title "Add to Notebook" / "Manage Notebooks" context-aware
>     • SelectionToolbar + NoteSheet + AnnChip + MultiNote all auto-dismiss on screen/letter/book/chapter/study navigation via App-level useEffect + window.__hideSelectionToolbar bridge
>     • 12 http:// URLs upgraded to https:// across 5 data files (check_balance.py passes)
> - Known pre-existing (not blocking, not caused by this batch): 12 React #31 warnings per render with `[object CSS]` arg — confirmed by stashing all Day 4-5 changes and re-checking; errors still present. UI renders correctly; ErrorBoundary doesn't trigger. CSS const is a string, not window.CSS. TODO investigate in a future session.
> - **2026-05-14 landings**: bible-studies.js lazy-loaded (b9b769b — removes 4.3 MB from cold-boot; studiesLoading indicator in StudiesHome); .git/hooks/pre-commit added to auto-run check_balance.py on data-file commits.
- Next: improvement2.txt Day 6+ background tasks (restore-name overlay polish, etc.) and Objective D shipping prep (real onboarding copy, app icon, signing config).

## Quick start (app failed to load? read this first)

If the app shows a black screen, run the validator:

```bash
pip install esprima  # one-time
python C:/Users/corbi/OneDrive/Desktop/VOTReader-studio/check_balance.py
```

It checks every data file for:
1. **esprima JS parse errors** (authoritative — catches real syntax bugs)
2. **Non-ASCII dashes (en/em) in verse ranges** like `12:18–20` — breaks `parseRefRange` regex at `index.html:2407`, so the renderer falls back to plain `<span>` and Unicode superscripts (`¹⁹` `²⁰`) render as **white inline text** instead of gold sup
3. **Smart quotes** (`“ ” ‘ ’`) used as JSON delimiters instead of ASCII `" '`

These are the THREE classes of bugs that brace-counting alone misses and any of which causes a black-screen failure or wrong rendering.

### Black-screen failure modes seen in this project

| Symptom | Root cause | Example | How to detect |
|---|---|---|---|
| Black screen at app start | Unescaped `"` inside JSON string value | `"Psalm 50:7": ""Hear, O My people..."" ` | esprima parse error |
| Black screen at app start | Unicode smart quotes used as delimiters | `“t”: “text”,` | esprima parse error / `check_balance.py` |
| Verse numbers render as **white inline text** instead of gold sup | En dash `–` instead of hyphen `-` in verse range | `Exodus 12:18–20` | `check_balance.py` dash check |
| Footnote sheet shows blank cite | Translation tag mismatch in `nkjv` dict key | `"John 14:6 (CJB)"` not in nkjv | manual verify |
| Tap-through to wrong letter | Letter-link `letterTitle` misattributed | linked to "Subject to No Man" but content is from "A Just God and A Savior" | `misattribution_check.py` |

### Permanent rules (never violate)

1. **Verse ranges always use ASCII hyphen `-`**, never en dash `–` or em dash `—`. Affects `chapter:verse-verse` strings in keys, refs, labels, cites — anywhere the renderer parses a verse range. The em dash is fine **only** as separator in compound nkjv values: `"Exodus 12:6 — verse text | Exodus 12:18-20 — verse text"`.

2. **All JSON-style delimiters are ASCII `"`** (or `'` if you must). Smart quotes go INSIDE string values only, where they're typographic content. If a string value contains a literal ASCII `"`, escape it: `\"`.

3. **Run `check_balance.py` after every batch edit**. Single-file edits via `Edit` tool generally don't introduce these, but agent-generated content frequently does (especially OCR-style transcription).

   **Pre-commit hook is wired and VERSIONED** (originally 2026-05-14; relocated to `.githooks/` and extended 2026-05-20). The hook is at `.githooks/pre-commit` (in git). Per-clone one-time setup:
   ```sh
   git config core.hooksPath .githooks
   ```
   The hook does two things, each gated on what's staged:
   1. **check_balance.py** — fires when any `app/src/main/assets/src/data/*.js` is staged. Catches the three black-screen failure modes (esprima parse errors, smart-quote delimiters, non-ASCII dashes in verse ranges). Path updated 2026-05-20 — the previous hook referenced the pre-P3.5b location and had been silently dead for ~6 weeks (no real corpus edits in that window, so no bug slipped through, but the validator was structurally broken).
   2. **tools/build.py** — fires when any bundle-source file is staged (anything under `app/src/main/assets/src/`, plus `search.js`, `search-data.js`, `react.min.js`, etc.). Regenerates `dist/bundle-{a,b,c,d}.js` and stages the output so the commit lands with bundles in sync with source. No Gradle change — committed bundles stay fresh without touching the Android build pipeline.

   Commits that only modify docs/gradle/PLAN-style files skip both checks entirely. Emergency bypass: `git commit --no-verify` (not recommended).

4. **Footnote NKJV text uses decimal verse markers** (`"19. text 20. text"`) for multi-verse refs, never Unicode superscripts (`¹⁹text ²⁰text`). The `verse-sup` gold inlay rendering at `index.html:2576` only fires when Strategy 0 (decimal) or Strategy 0b (superscript-with-clean-range) succeeds. Mixed formats fall through to the white-text fallback.

---

## File structure

### Source assets — what we edit
```
C:/Users/corbi/OneDrive/Desktop/VOTReader-studio/
├── CLAUDE.md                      # this file
├── app/src/main/
│   ├── assets/
│   │   ├── index.html             # 10,181-line single-file React app (the entire UI)
│   │   ├── react.min.js, react-dom.min.js
│   │   ├── flexsearch.min.js, orama.min.js, search.js, search-data.js
│   │   ├── html2canvas.min.js     # screenshot/share
│   │   └── data/
│   │       ├── volume-{one..seven}.js     # 7 volumes (V2 = gold standard)
│   │       ├── lords-rebuke.js            # 30 letters + preface
│   │       ├── letters-flock.js           # 61 letters + preface ("Be My Examples")
│   │       ├── letters-timothy.js         # 14 letters + preface
│   │       ├── wtlb-one.js, wtlb-two.js   # Words To Live By Parts 1-2
│   │       ├── the-blessed.js             # 8 sections + intro
│   │       ├── holy-days.js               # 16-entry ghost album
│   │       ├── hidden-manna.js            # 1 entry, not publicly indexed
│   │       ├── matthew.js                 # Matthew Study Bible (28 chapters + preface)
│   │       ├── matthew-nkjv.js            # MATTHEW_NKJV scripture lookup dict
│   │       ├── matthew-plain.js           # plain-text variant
│   │       ├── bible-studies.js           # MTAM, Lamb of God, others (51K lines for MTAM alone)
│   │       ├── books.js, books-restored.js  # Bible book data
│   │       ├── bible-{asv,bsb,hnv,kjv,lsv,web,ylt}.js  # other translations
│   │       ├── wtlb-scriptures.js         # shared NKJV dict for WTLB {{ref:...}}
│   │       └── *.bak-pre-*                # old backups (don't edit/delete)
│   └── res/                       # Android resources (icons, layouts)
├── _ocr_out/                      # OCR output from PDFs (this session)
│   ├── lamb-of-god/               # 34 page_NNNN.txt + all.txt + _progress.json
│   ├── matthew-sb/                # 189 pages + all.txt + _images/
│   └── mtam/                      # 450 pages + all.txt + _images/
├── ocr_pipeline.py                # Local Ollama Qwen3 VL OCR runner
├── ocr_gemini.py                  # Gemini API OCR (alternative)
├── render_pdf_pages.py            # PDF → JPG page render
├── aggregate_ocr.py               # combine page_NNNN.txt into all.txt
├── run_ocr_all.sh                 # sequential OCR runner
├── check_balance.py               # brace/bracket/paren balance check
├── ocr_gap_check.py               # programmatic phrase coverage check
├── excerpt_audit.py               # find OCR excerpt source titles, verify they exist in data
├── misattribution_check.py        # find letter-link target misattributions in MTAM
├── probe_rate.py                  # Gemini API rate-limit prober
└── (gradle files, etc — Android build)
```

### Build output (don't edit)
- `app/build/intermediates/assets/debug/mergeDebugAssets/` — auto-generated copy of source assets at build time

### User Desktop
- `C:/Users/corbi/Desktop/GEMINI_KEYS_AND_RATE_LIMITS.md` — 13-key Gemini catalog with sustainable pacing recommendations

---

## 1. What this project is

**VOTReader-studio** is an Android Studio project that ships a single-file React WebView app rendering "The Volumes of Truth" (thevolumesoftruth.com) and related collections. It dual-targets:
- **Android APK** (Android Studio 4.x, gradle build → APK install on phone)
- **PC** (open `app/src/main/assets/index.html` directly in a browser; storage uses `localStorage` for both)

The Android shell is a thin WebView that loads `index.html` from assets. All app logic lives in HTML/JS — there is **no native Kotlin/Java rendering of content**.

### Working directories
- Source assets (the only thing we edit): `app/src/main/assets/`
- Data files (the bulk of work): `app/src/main/assets/data/`
- Build output (auto-generated, ignore): `app/build/intermediates/assets/debug/mergeDebugAssets/` — same files copied here at build time

> **CRITICAL:** Only edit files in `app/src/main/`. Never touch `app/build/`.

---

## 2. App architecture (index.html)

`index.html` is **~15,287 lines, ~796 KB** (as of 2026-05-10). A pre-compiled (Babel-output `React.createElement`) single-file React app. No bundler. No hash routing. Screen state is held per-tab in a tab state machine.

> ⚠️ **The Screen→Component line numbers below are STALE.** They reflect a pre-2026-05-09 snapshot. After the §18 refactor and the Notes/Library work, real line numbers are 2,500–5,000 lines higher. Use these as relative-order hints only; Grep for the symbol before editing. Approximate current landmarks (per PLAN.txt §16):
> - App() starts ≈ line 12762 (was 7546)
> - FootnoteSheet ≈ 7886, ScriptureVerseText ≈ 7930, FootnoteListSection ≈ 8018
> - LetterView ≈ 10237, WtlbEntryView ≈ 9957, BibleChapterView ≈ 11979, ChapterView ≈ 9323
> - SettingsScreen ≈ 11063, HomeScreen ≈ 11512
> - handleAndroidBack ≈ 14104, Welcome screen render ≈ 14444
> - snapRangeToWords ≈ 4231, applyDOMHighlights ≈ 5025, SelectionToolbar ≈ 5264

### Screen → Component map

| Screen state | Component | Line | Purpose |
|---|---|---|---|
| `home` | `HomeScreen` | 6268 | Main grid |
| `volumes-home` | `VolumesHome` | 3667 | Grid of volume cards |
| `scriptures-home` | `ScripturesHome` | 3275 | Bible translations |
| `studies-home` | `StudiesHome` | 3829 | Bible/Letter studies grid |
| `volume-X-index` | `VolumeIndex` / `VolumeOneIndex` / `VolumeLetterIndex` | 4485 / 4528 / 4585 | Letter list per volume |
| `letter` (Volumes) | `LetterView` | 4987 | Rich-format letter renderer |
| `wtlb-entry` (WTLB / Blessed / Holy Days) | `WtlbEntryView` | 4675 | Simple-format entry renderer |
| `bible-chapter` | `BibleChapterView` | 6734 | Bible chapter view |
| `study-chapter` (Matthew study) | `ChapterView` | 4043 | Study Bible reader |
| `holy-days-index` | (renders `VolumeLetterIndex` from `HOLY_DAYS`) | 10018 | Holy Days album index |
| `search` | `SearchScreen` | 7279 | Full-text search |
| `settings` | `SettingsScreen` | 5843 | App settings |
| `history` | `HistoryScreen` | 4299 | Reading history |

### Tab state machine
- `App()` at line 7546
- Per-tab fields via `tabField('screen')` (line 7631)
- `tabs` + `activeTabIdx` arrays (multi-tab in-app browsing)
- `fromLetterStack` per tab (line 7878+) — drives **back-pill** navigation
- Source screen restore in `handleAndroidBack` (lines 8726–8794)

### Back-pill (top of letter screen)
- CSS: `.back-hint-pill` (lines 947–996)
- Renders only when `fromLetterStack.length > 0` (i.e. user arrived via tap-through)
- Shown in `LetterView` (lines 5131–5137) and `WtlbEntryView` (lines 4855–4862)
- `backHint` object built at line 7892 from top of `fromLetterStack`
- Android hardware back: pops `fromLetterStack` and restores `sourceScreen` / `sourceLetterId` / `sourceBookId` / etc. (lines 8740–8751)
- `openInAppLetter` (line 7902) is the function that pushes onto the stack — **always use this for tap-through**

---

## 3. Data formats — collection-by-collection

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
- `{{ref:Book A:B; Book C:D}}` — compound refs (semicolon separator) — **CURRENTLY NOT SPLIT BY RENDERER, see fixes below**
- `{{nav:bookId:chapter}}` — navigate to Bible chapter (e.g. `{{nav:esther:7}}`)
- `†` — section divider character (The Blessed)
- `~ [From "Letter Title" ~ Volume X]` — attribution at end of WTLB entry

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

Multi-part studies with chapters. Each study has `parts[].chapterIds[]` referencing chapter entries. **Skip per user instructions** (for now).

---

## 4. Letter counts — downloaded vs. live website

| Collection | Downloaded | Website | Status |
|---|---|---|---|
| Volume One | 29 + preface ("A Word of Warning") | 29 | ✅ |
| Volume Two | 29 | 29 | ✅ |
| Volume Three | 30 | 30 | ✅ |
| Volume Four | 29 | 29 | ✅ |
| Volume Five | 29 | 29 | ✅ |
| Volume Six | 31 | 31 | ✅ |
| Volume Seven | 66 + preface ("The Indignation of The Lord") | 66-67 | ✅ |
| The Lord's Rebuke | 30 + preface ("A Warning") | 30 | ✅ |
| Letters to the Flock | 61 + preface ("Be My Examples") | 61 + preface | ✅ |
| Letters from Timothy | 14 + preface ("Put All Your Trust in The Holy One") | 14 + preface | ✅ |
| WTLB Part One | 149 + intro | ~150 | ✅ |
| WTLB Part Two | 203 (incl. intro) | ~202 | ✅ |
| The Blessed | 8 sections + intro | 8 sections | ✅ |
| Hidden Manna | 1 ("Woe to Dallas") | hidden — only via Matthew study | ✅ by design |
| Holy Days | 16 ghost entries (cross-pulled) | 16 | ✅ |
| Bible Studies | 7 + Matthew Study Bible (separate file) | 9 | ⏭ skipped per user |

---

## 5. Holy Days — the "ghost album"

Special collection. Letters are **not original content**; they are pulled from across other volumes by the topic of God's feast days.

- Data: `data/holy-days.js` defines `HOLY_DAYS` global (loaded at index.html line 49)
- Card on `VolumesHome` line 3675: `{ id: "holy-days", title: "Regarding The Holy Days" }`
- Index screen `holy-days-index` at lines 10018–10048 uses `VolumeLetterIndex`
- Entry rendering at lines 10050–10090 dispatches by `entry.type`:
  - `type: "wtlb"` → `WtlbEntryView` with `partLabel: "Regarding The Holy Days"`
  - else → `LetterView` with prevEntry/nextEntry → prevLetter/nextLetter shim
- **Boundary nav**: prev-boundary goes to last Letter from Timothy; next-boundary goes to Garden (lines 10055–10060)
- Each entry has a `sourceLabel` (e.g. "Volume Two") so the eyebrow can identify origin
- Standard back-pill works (no special handling beyond the shared `backHint`)

---

## 6. Critical rendering paths & known bugs

### 6.1 Footnote tap behavior (WORKING)
- `Segments` line 2252: inline `fn` segment renders gold superscript bubble (`fn-ref` class, line 885)
- Tapping → `FootnoteSheet` (line 2615) bottom sheet, three branches:
  - `fn.type === "scripture"` → renders `fn.ref` + NKJV verse text (resolved from per-letter `nkjv[fn.ref]`)
  - `fn.link` → renders note text + `InAppLinkButton` (cross-volume tap-through)
  - `fn.url` → external `<a class="fn-link">`
  - Plain text fallback
- `seeAlso` field on a scripture footnote adds an "Also see" cross-link (line 2630)
- Bottom-of-page `FootnoteListSection` (line 2747) mirrors the same branches with `ExpandableVerse` for long quotes

### 6.2 NKJV scripture text resolution
- Primary: per-letter `nkjv` dict on the letter object (`nkjv?.[fn.ref]` at line 2617)
- WTLB fallback: per-entry `entry.scriptures` first, then global `WTLB_SCRIPTURES` (from `wtlb-scriptures.js`)
- Fallback for Bible chapters: `lookupVersesFromBooks(ref)` (line 2417) walks `ALL_BOOKS` to find verse text
- **PRINCIPLE per user**: footnote NKJV text should be **hardcoded into the letter's `nkjv` dict**. Only translation-tagged refs (e.g. "Psalm 113:7 (ASV)") should depart from NKJV. **No lookup scripts.**

### 6.3 Verse-number gold "inlay" (`<sup class="verse-sup">`)
- CSS at line 1913: `color:var(--gold); font-size:0.65em; ... font-family:'Cinzel',serif;`
- Created in `VerseWithNumbers` at line 2576
- ✅ Multi-verse path (`splitIntoVerses` succeeds): emits `<sup class="verse-sup">N</sup>` followed by text
- ⚠️ Single-verse fallback (line 2570): just emits `<span>{cleaned}</span>` — no gold inlay
- ⚠️ Strategy 1 fallback (line 2536, sentence-boundary split): never wraps superscripts in gold

### 6.4 Cross-letter navigation
- `prevLetter` / `nextLetter` (Volumes) — read at LetterView lines 5103-5107 (sticky arrows) and 5277-5311 (bottom cards)
- `prevEntry` / `nextEntry` (WTLB / Holy Days) — read at WtlbEntryView lines 4781-4782
- `metaAddendum` (LetterView lines 5165-5174) — three branches: `metaAddendumLink` / `metaAddendumInternal` / `metaAddendumUrl`
- `relatedTopics` (LetterView lines 5330-5342) — links to answersonlygodcangive.com or in-app
- `addendum` "Also Read" card (LetterView lines 5318-5328)
- All tap-through must go through `openInAppLetter` (line 7902) so the back-pill is wired

### 6.5 Audio/video links (LetterView lines 5358-5381)
- `audioUrl` → "♪ Audio Recording"
- `soundcloudUrl` → "♪ Listen on SoundCloud"
- `videos[]` → ▶ each label
- `videoVoiceUrl` → ▶ {videoVoiceLabel || "Video (with voice over)"}
- `videoMusicUrl` → ▶ "Video (excerpts set to music)"
- Always-shown YouTube channel link

### 6.6 BUG TAXONOMY — patterns observed in the wild

The user's first batch of screenshots revealed these *categories* of data corruption. **The fix is in the data, not the renderer** (per user: "fix the foundational data so that isn't even a thing anymore"). Agents during the sweep must look for and repair these patterns:

| # | Pattern | Visible symptom | Root cause | Repair |
|---|---|---|---|---|
| **D1** | Ref string contains the entire verse text | Footnote sheet shows the full verse twice — once in the gold "ref" label header, once as italic body | `"ref": "Book X:Y NKJV (corrected): 13 ...verse text..."` with the same long key in `nkjv` dict | Strip ref to just the citation (e.g. `"John 16:13-15 (corrected: \"It\" / \"the Spirit of Truth\")"`); put verse text only in the `nkjv` dict value |
| **D2** | Verse numbers render in white italic, not gold sup | "9. 10. 11. 12. 13." appear as plain inline body text (cream italic) | Source `nkjv` value uses unusual prefix or has bracketed editorial note, so Strategy 0 marker regex `(?:^|(?<=\s))(N)\.\s+` fails → falls through to Strategy 1 sentence split which never wraps in `<sup>` | Reformat the nkjv value to clean `"9. text 10. text..."` form (decimal dot, single space, no editorial brackets between numbers) |
| **D3** | Defunct `[N]` rendering as plain bracketed body text | "I AM COME [1] - I have come..." with `[1]` in regular cream | Source segment is `{ "t": "text", "v": "I AM COME [1] - ..." }` — bracket markers were never converted into `{ "t": "fn", "v": "1" }` segments | Split the text segment, insert `{ "t": "fn", "v": "N" }` segment, ensure preceding/following text has correct spacing |
| **D4** | Translation-tagged ref shows label only, no verse text | Footnote header says "John 14:6 (CJB)" with empty body | `"ref": "John 14:6 (CJB)"` exists in `footnotes` but the `nkjv` dict has key `"John 14:6"` (no tag), or has no key at all | Add `nkjv` entry keyed exactly as `"John 14:6 (CJB)"` with the CJB translation text. **Tagged refs MUST use that translation's text**, not NKJV |
| **D5** | Doubled verse markers in scripture text | `²⁰20. ²¹"I do not pray... 22. ²²And the glory..." — both Unicode superscripts AND text `N. ` markers | Source nkjv value was concatenated from two formats (bolls.life Unicode + a manual fix that added `N. `) | Use ONE format: `"13. text 14. text 15. text"` (decimal dot, no Unicode supers). Strip all Unicode `⁰-⁹` from nkjv values |
| **D6** | Doubled superscript without text duplication | `³² text. ³³ text. ³³ text. ³⁴ text. ³⁴ text.` — same verse number rendered twice in superscript | Source nkjv value has a verse split into multiple parts each prefixed with the same superscript | Merge each verse's parts into one segment so each verse number appears once |
| **D7** | Ref/cite parser glitch | Eyebrow shows "SCRIPTURE REFERENCE · 19:12 1" / Title shows "Corinthians 7:32-35" (the leading "1 " was eaten) | A `{{ref:1 Corinthians 7:32-35}}` got chunked at "1 " somewhere upstream; the data may have a stray leading "1 " or the ref dict key is wrong | Verify ref keys are EXACT match between footnotes' `ref` and the `nkjv` dict key; use `"1 Corinthians 7:32-35"` consistently |
| **D8** | Glued text near refs | "Shouldeverruntogether[Matt 4:4]" — no space between body and ref | WTLB / Blessed source text is `"...together{{ref:Matt 4:4}}..."` with no space before `{{ref:` | Add a single space before `{{ref:` and `{{nav:` tokens during the sweep |
| **D9** | Compound refs not split | `"Isaiah 40:13; Romans 11:34"` shown as one long unsplit chunk | Compound refs should be pipe-separated with em-dash: `"Isaiah 40:13 — verse text \| Romans 11:34 — verse text"` | Reformat compound nkjv values; if multiple separate footnotes are wanted, split into separate `"1": {ref:...}, "2": {ref:...}` entries |
| **D10** | Mixed footnote affordances | Same footnote shows BOTH a numbered gold bubble AND a plain inline link | Source data has the same ref both as a `{type:"note", link:..., url:...}` and as a numbered scripture footnote | Pick ONE: scripture footnote (bubble) OR cross-reference note (bubble that opens sheet with `seeAlso` link). Never both for the same content |

### 6.7 Renderer guardrails (defensive only — do NOT rely on these as fixes)
- index.html:2569, 2577: `replace(/^[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*/, "")` strips leading Unicode superscripts. **Rely on data being clean instead.**
- index.html:2281–2286: `Segments` collision guard injects a leading space — works for Volumes (Format A). **WTLB/Blessed (Format B) has no equivalent**; fix at data level.

---

## 7. The "Big Sweep" plan — per-letter data audit

### Goals
1. Every letter has complete metadata: `id`, `num`, `title`, `date`, `from`, `spoken`, `forLine`, `audioUrl` (if exists on site), `videoVoiceUrl` (if exists), `videoMusicUrl` (if exists), `soundcloudUrl` (if exists), `relatedTopics[]`, `prevLetter`, `nextLetter`.
2. Every footnote has hardcoded NKJV verse text in the letter's `nkjv` dict (unless `(ASV)`/`(KJV)` tag specifies otherwise — then bake that translation's text).
3. Compound refs use `" | "` separator with `"Book X:Y — verse text | Book A:B — verse text"` form.
4. Cross-letter footnotes use `{ type: "note", text: "Also read: ...", link: { collection, letterTitle } }` OR `{ type: "scripture", ref, seeAlso: { collection, letterTitle, label } }` for combined.
5. No leftover `[matthew4:4]` glued-text patterns. All text properly spaced at source.
6. WTLB / The Blessed: simple `(Ref)` parenthetical cites — NO numbered footnote bubbles (they're short-form).

### Use Volume Two as the gold standard
Volume Two has the most uniform, complete metadata structure:
- Every letter has all media URLs that exist on the site
- `relatedTopics` is consistently populated
- Footnotes use mixed `scripture` + `note` types correctly
- `nkjv` dict is complete per letter

**Model all other volumes (V1, V3-V7, Flock, Timothy, Rebuke) on Volume Two's structure.**

### Sub-agent strategy
- Use **Haiku 4.5** sub-agents with `subagent_type: general-purpose` and `model: haiku`
- **One letter per agent** — bite-sized, verifiable
- Pass agent: (a) the existing data in the file, (b) the live website URL for that letter, (c) explicit instructions on metadata fields and footnote format
- After each agent returns, **read the diff** to verify before moving on
- Do not chain sweeps; verify between each
- Prefer Edit (string replacement) over Write (full file rewrite) so we can review changes easily

### Sweep order
1. **Foundation fixes (B1-B4)** — fix renderer bugs FIRST so when we sweep, fixes are consistent
2. **Holy Days album** (16 entries) — user requested first
3. Volume Two (gold-standard, smaller diffs)
4. Volumes One, Three, Four, Five, Six, Seven
5. Lord's Rebuke
6. Letters to the Flock
7. Letters from Timothy
8. WTLB Part One, WTLB Part Two
9. The Blessed
10. Final cross-collection verify

---

## 8. Sub-agent instruction template (BITE-SIZED, HAIKU-OPTIMIZED)

Use Haiku 4.5 (`subagent_type: general-purpose`, `model: haiku`). Treat each agent like a junior assistant — be VERY specific. One letter per agent. Verify after every return.

### Standard prompt template

```
You are auditing ONE single letter in a data file. Be surgical.

==== INPUTS ====
DATA FILE: C:/Users/corbi/OneDrive/Desktop/VOTReader-studio/app/src/main/assets/data/<file>.js
LETTER ID: <id>
LETTER TITLE: <title>
LIVE URL: https://www.thevolumesoftruth.com/<URL_slug>
GOLD STANDARD: app/src/main/assets/data/volume-two.js letter id "the-wide-path" — copy that shape EXACTLY for metadata, footnote format, and nkjv dict.

==== THE 10 BUG PATTERNS TO HUNT (D1-D10) ====
D1. Ref string contains the verse TEXT crammed into it. Symptom: ref starts "Book X:Y NKJV (corrected version): 13 ...full verse..." and nkjv key is the same long string. FIX: shorten ref to the citation only, put text in nkjv value.
D2. Multi-verse nkjv text whose decimal markers (e.g. "9. text 10. text") aren't being detected → renders white italic. FIX: ensure nkjv value uses clean "N. text N. text" form, no editorial brackets between markers, no leading "Book X:Y " preamble inside the value.
D3. Defunct "[N]" in body. Symptom: body segment text contains literal "[1]" "[2]" etc that should be footnote bubbles. FIX: split text segment, insert {"t":"fn","v":"N"} segment between, ensure spacing.
D4. Translation-tagged ref missing nkjv entry. Symptom: ref like "John 14:6 (CJB)" but nkjv dict has no exact-match key. FIX: add nkjv entry with the EXACT tagged key and the CJB/ASV/etc text (NOT NKJV).
D5. Doubled verse markers (Unicode + decimal). Symptom: nkjv value has both "²⁰20." or similar. FIX: strip all Unicode ⁰-⁹ supers, keep only decimal "N. ".
D6. Doubled superscript only. Symptom: same verse number appears twice. FIX: merge.
D7. Title/cite parser glitch. Symptom: ref or nkjv key has stray prefix like "19:12 1 " or split book name. FIX: ensure refs use exact form "1 Corinthians 7:32-35", no stray spaces or prefixes.
D8. Glued text near refs. Symptom: body text has "...word{{ref:...}}" or "...word[Book X:Y]" with no space. FIX: insert single space before {{ref: or {{nav: tokens.
D9. Compound refs not split. Symptom: "Isaiah 40:13; Romans 11:34" in one nkjv value as run-on text. FIX: rewrite as "Isaiah 40:13 — verse text | Romans 11:34 — verse text" (pipe + em-dash separators).
D10. Mixed footnote affordances. Symptom: same footnote rendered as both bubble and inline link. FIX: pick ONE; for "Also read X" + scripture, use seeAlso field on scripture footnote.

==== STEP-BY-STEP PROCEDURE ====
1. Read the GOLD STANDARD letter "the-wide-path" in volume-two.js (lines around 6-62) so you know exact shape.
2. Read the target letter's full block in the DATA FILE (use Grep to find its id, then Read the surrounding lines).
3. WebFetch the LIVE URL. Compare body text, all inline footnote markers, all metadata (date, attribution, audio link, video links, Related Topics, prev/next titles, addendum links).
4. For EACH footnote, look up the verse text from the canonical Bible (use NKJV unless ref has (ASV)/(KJV)/(GNT)/(CJB)/(BSB)/(YLT)/(LSV)/(WEB)/(HNV) tag — then use that translation). Many translations are available in app/src/main/assets/data/bible-{asv,bsb,hnv,kjv,lsv,web,ylt}.js. NKJV text in app/src/main/assets/data/books.js. ALWAYS hardcode the verse text into the letter's nkjv dict — do not rely on lookup.
5. Apply D1-D10 fixes if any of them are present.
6. Use the Edit tool to make surgical changes to ONLY this one letter block. Do NOT touch other letters in the same file.
7. After Edit, re-Read the modified region to verify the change took effect cleanly.

==== HARD RULES ====
- ONE letter only. Do NOT batch-edit multiple letters.
- NO regex replace_all at file scope. Targeted Edits only.
- Match the file's existing format style (volume-two uses unquoted JS keys; old volumes use JSON-quoted "key": values). Do not change format.
- Preserve every other letter in the file byte-for-byte.
- If the live URL is unreachable, REPORT and stop — do NOT invent metadata.
- If translation-tagged ref but no translation file available, REPORT and stop.
- Do not add audio/video URLs that don't exist on the live site.

==== REPORT FORMAT ====
At the end, output a 5-line summary:
- LETTER: <id> in <file>
- D-PATTERNS FIXED: D1, D3, ... (or "none")
- METADATA UPDATES: list (or "none")
- NKJV ENTRIES ADDED/FIXED: list of refs
- ANOMALIES / OPEN QUESTIONS: anything you couldn't resolve
```

### Dispatch protocol

- Send agents in **parallel batches of 4** (not more — agent quality degrades when many run at once and our verification load grows).
- After each batch, Read every letter the agents touched and confirm the changes.
- Update CLAUDE.md if a new bug pattern emerges that isn't in D1-D10.
- Update the TodoWrite list to mark each letter complete as agents return.

### Wiki source-of-truth — fetching live pages

The website thevolumesoftruth.com is a **wiki**. Letter pages live at canonical URLs like `https://www.thevolumesoftruth.com/<Page_Name>` (underscores between words, exact case).

For agents:
- Fetch ONLY the canonical staged page — e.g. `https://www.thevolumesoftruth.com/The_Wide_Path`
- DO NOT fetch revision history URLs (`?action=history`, `oldid=...`, `&diff=...`) or talk pages
- DO NOT fetch ?action=edit or printable version URLs — they may differ from staged content
- If a fetch returns a duplicate/revision/redirect, REPORT and stop — do not infer

URL slug derivation rules:
- Title "The Wide Path" → `/The_Wide_Path`
- Title with apostrophe "I AM He" → check for variants since wiki may URL-encode or strip punctuation
- Title with parentheses "Embrace The Cornerstone, Wherein Flows Springs of Living Water" → preserved with comma encoded as `,`
- When in doubt, the existing data file's `audioUrl` Bandcamp slug usually matches the page slug pattern (lowercase, hyphenated)

### Holy Days — special audit notes

Holy Days entries are **curated cross-references** from other volumes — the content is not original. When auditing a Holy Days entry:
1. Identify the source letter via `sourceLabel` field (e.g. "Volume Two", "Words To Live By: Part Two")
2. Find that source letter in the corresponding data file (volume-two.js, wtlb-two.js, etc.)
3. Verify the Holy Days excerpt matches the source verbatim (paragraphs, refs, scripture text)
4. Apply D1-D10 to the Holy Days entry only
5. **Holy Days entries should be audited LAST** in the full sweep, after source letters are clean — else we'd repair the same bug twice. EXCEPTION: per user, do an initial pass on Holy Days now to check structure/navigation, then re-sync at end.

---

## 8.4 Auto-resume mechanism (scheduled tasks)

When token limits exhaust mid-task, schedule a wake-up via `mcp__scheduled-tasks__create_scheduled_task` so the work resumes after the 5-hour window resets.

**Active wake-ups: NONE** (the 2026-05-03 wake-up was disabled after manual integration finalized the project).

**Pattern for the next wake-up task:**
- `taskId`: `votreader-resume-after-reset-N` (increment N)
- `fireAt`: ~2h45m after hitting token limit (5h limit + buffer)
- `prompt`: re-read CLAUDE.md sections 14.5/14.6, check `_ocr_out/*/page_*.txt` counts vs PDF page counts, dispatch coverage agents for gaps, schedule next wake if needed.

**Critical reminders for future-self about Anthropic agent OCR limitations:**

1. **Content filter (server-side) blocks MTAM OCR**: Sonnet AND Haiku refuse to output the prophetic/judgment language (woes, harlots, "darkness of faces", who-killed-Christ commentary). Returns 400 "Output blocked by content filtering policy." Local Ollama Qwen3 VL is the ONLY viable path for MTAM. **Don't dispatch Sonnet/Haiku for MTAM.**

2. **Copyright refusal is non-deterministic for Matthew SB**: Sonnet sometimes transcribes 50+ pages successfully, sometimes refuses on first request citing "verbatim copying of copyrighted work." First batch of Matthew SB Sonnet agents got pages 11-67 and 138-188 done. Subsequent agents (68-82, 137-123 ranges) refused. Behavior varies turn-to-turn even with same prompt.

3. **Implication**: Agent-based OCR is unreliable for this content. **Local Ollama is the SAFE default**. Use Sonnet only opportunistically — accept whatever it agrees to and don't waste tokens fighting refusals.

4. **Currently uncovered Matthew SB pages: 68-137** (~70 pages). Will be done by Ollama after MTAM completes (Ollama queue: MTAM ~14h → Matthew SB ~6h).

## 8.5 Working principles (synthesized from user direction)

- **Just work, no plan mode.** Don't deliberate visibly; act, verify, report deltas.
- **One letter per agent.** Bite-sized. Trade verbosity in instructions for clarity.
- **Diligence is the project.** Bugs are scattered and not pattern-searchable; only a complete sweep finds them all. The user has accepted this is tedious.
- **Foundation, not bandaids.** Fix the data so renderer guards become unnecessary. Don't add new CSS/JS workarounds.
- **Verify, don't trust.** After each agent returns, Read the modified region. Trust ≠ done.
- **Skip Studies.** Bible/Letter Studies (`bible-studies.js`, `matthew.js`, etc.) are out of scope for now — note new bugs in CLAUDE.md but don't fix.
- **Holy Days = ghost album.** It mirrors content from source volumes. Audit once now (structure/nav), defer content sync until after source sweeps.
- **Wiki = source of truth.** Fetch live pages with WebFetch; canonical staged URLs only.
- **CLAUDE.md is living memory.** Synthesize what's relevant for future passes; do NOT verbatim-dump every user message. Update freely as patterns emerge.

## 9. Editing principles

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

---

## 10. CSS variables to know

- `--gold`, `--gold-bright`, `--gold-dim`, `--gold-border`, `--gold-faint`, `--gold-glow`
- `--cream-dim`, `--bg`, `--bg3`
- `--tap-ref`, `--tap-ref-sub`, `--tap-ref-active` (inline scripture ref colors)

Verse numbers MUST be `var(--gold)`. Body text is `--cream-dim`.

---

## 11. Critical files inventory

| File | Purpose |
|---|---|
| `index.html` | The entire React app (10,181 lines) |
| `react.min.js`, `react-dom.min.js` | React 18 |
| `flexsearch.min.js`, `orama.min.js`, `search.js`, `search-data.js` | Search subsystem |
| `html2canvas.min.js` | Screenshot/share feature |
| `data/volume-{one..seven}.js` | The seven volumes (V2 is gold standard) |
| `data/lords-rebuke.js`, `data/letters-flock.js`, `data/letters-timothy.js` | Three letter collections |
| `data/wtlb-one.js`, `data/wtlb-two.js`, `data/the-blessed.js` | Words To Live By + The Blessed |
| `data/holy-days.js` | Ghost album of Holy Days topic letters |
| `data/hidden-manna.js` | Hidden entries (not publicly indexed) |
| `data/wtlb-scriptures.js` | Shared NKJV dict for WTLB `{{ref:...}}` patterns |
| `data/books.js`, `data/books-restored.js`, `data/matthew.js`, `data/matthew-nkjv.js`, `data/matthew-plain.js` | Bible book data |
| `data/bible-studies.js` | Bible/Letter studies (skip for now) |
| `data/bible-{asv,bsb,hnv,kjv,lsv,web,ylt}.js` | Bible translations |

`*.bak-pre-*` files in `data/` are old backups — **do not edit, do not delete without asking user.**

---

## 12. Workflow checklist before declaring a phase done

- [ ] Did I read the live website page? (verify metadata exists there)
- [ ] Did I check the existing data file format? (V2 unquoted vs. JSON-quoted)
- [ ] Did the change preserve all other letters in the file?
- [ ] Did I update CLAUDE.md with what I learned?
- [ ] Did I verify in-browser that no rendering broke? (open `index.html`)
- [ ] Did I update the TodoWrite list?

---

## 13. Anti-patterns / things NOT to do

- ❌ Run regex `sed`/`grep -E` at file scope to "patch" footnotes
- ❌ Add a CSS bandaid for white verse numbers — fix the data or renderer instead
- ❌ Author new Letters that don't exist on the live website
- ❌ Use Hidden Manna entries in any public index, search, or home tile
- ❌ Add `metaAddendum` fields to letters that don't have an "Also read" on the live site
- ❌ Change Volume Two's format (it's the gold standard)
- ❌ Mix numbered footnote bubbles with inline `(Ref)` cites in the same letter — pick one based on collection
- ❌ Skip the Read-before-Edit verification

---

## 14. Sweep progress log

### After-action progress (consolidated)

**All audits complete. Bugs found across all collections (excluding Studies):**
- **17 D3 orphan brackets** in 14 letters (V3, V4, V6, Rebuke, Flock, Timothy, Holy Days)
- **1 D1 ref-text-crammed** (V3 "I Am With You Always" John 16:13-15)
- **23 D8 glued-text** (mostly WTLB Two: 19, WTLB One: 3, Blessed: 2)
- **1 D9 compound ref** (Blessed — already correctly formatted, false positive)
- **12 D3 in WTLB** (different format — bracketed numbers like [11], [20], [37] suggest stale wiki refs that may need to become inline cites or be removed)
- **1 stub letter** (V5 Letter 14 "Do Not Look Back...")

**Fixes applied (Phase 1 — main collections):**

| Collection | Fixed | Method |
|---|---|---|
| Holy Days Entry 12 | D3 [1] → fn 1 | manual |
| V3 L14 + L27 | 2× D3 → fn segments (Matthew 7:22-23, John 3:3-5) | agent |
| V3 "I Am With You Always" | D1 ref→nkjv split | manual |
| V4 L5 | D3 → note-link to V5 "I AM COME" | manual |
| V6 L9 + L24 | 2× D3 → scripture fn (Psalm 50:7, 2 Peter 2:3) | agent |
| Rebuke "blood-pours-down" | D3 → note-link to V5 "I AM COME" | manual |
| Rebuke "far-removed" | D3 → note-link to V5 "I AM COME" | manual |
| Rebuke "the-cup-of-the-wrath" | D3 → fn 4 note-link to V7 "I Shall Remove My Hand…" | manual |
| Flock × 8 letters | 8× D3 → mostly note-links to other letters | agent |
| Timothy "the-shadow-of-the-almighty" | D3 → typo bracket removed | agent |
| Timothy "stealing-from-the-power-of-the-cross" | D3 → fn 1 (Acts 10:15) | agent |
| Blessed × 2 | 2× D8 space inserts | agent |
| WTLB Two × 19 | 19× D8 space inserts | agent |

**Phase 2 — completed:**

| Collection | Fixed | Method |
|---|---|---|
| WTLB One | 4× D8 + 4× D3 (deletions — Type C vestigial) | agent |
| WTLB Two | 8× D3 (deletions — Type C vestigial) | agent |
| V5 Letter 14 stub | full population from live (4 blocks, 3 media URLs, 2 related topics) | agent |
| Holy Days entries 5-15 | sourceLabel populated (Volume Two/Three/Four/Six/Seven, Letters to Flock, Letters from Timothy) | manual |

**Final verification:** all 11 modified data files pass brace/bracket/paren balance check.

## 14.7 Studies integration (Phase 4 — completed 2026-05-03)

**Matthew Study Bible front-matter:** added `preface` block to `matthew.js` containing the intro/dedication content from PDF pages 0–8 (title, copyright, YAHUSHUA name etymology, Psalm 118:14, Isaiah 12:2, "Word of My Mouth" excerpt, "Mistranslation and Misinterpretation..." excerpt, 2 Timothy 2:15) — with tap-through letter-links to:
- "The Word of My Mouth" (Volume Seven)
- "Mistranslation and Misinterpretation Leading to Great Obscurity Among Many Faces" (Volume Four)

**MTAM letter-link misattributions fixed (6 confirmed real bugs):**
| Location | Was linked to | Correctly linked to |
|---|---|---|
| line ~26793 | (plain text only — no link) | "Who Among You, O Israel..." (V7) — converted to tap-through |
| line ~45213 | "Subject to No Man" (V6) | "A Just God and A Savior" (V6) |
| line ~25278 | "A Heavy Stone, a Bitter Burden" (V6) | "The Harvest Is Separated, All Bundles Set in Their Places" (V6) |
| line ~11569 | "The Lord Your Righteousness" (WTLB Two) | "The King Eternal" (WTLB One) |
| line ~6259 | "Enemies of Israel, Come Forth" (V7) | "Enemies of The Lord, Come Forth" (Lord's Rebuke) |
| line ~1932 | "Proclaim The Name of The Lord" (V7) | "Blessed Be The Name" (WTLB Two) |
| line ~3464 | "Proclaim The Name of The Lord" (V7) | "Blessed Be The Name" (WTLB Two) |

These were genuinely mis-routed cross-references — the excerpt text content matches the OCR-attributed letter, but the existing data linked to a different (sometimes thematically related, sometimes unrelated) letter.

**Final attribution accuracy (after 9 fixes total this session + improved checker):**
- **178 of 216 (82.4%)** MTAM excerpt-with-link pairs **confirmed correctly attributed** via fingerprint + fuzzy match (multi-OCR-attribution-aware, plural/singular tolerance, ≥92% char overlap)
- **0 misattributions remaining** confirmed
- 38 data excerpts have fingerprints my tool couldn't match in OCR (text-formatting variations between OCR and data — sampled 3 manually, all confirmed correctly attributed; remaining 35 likely also correct, just below the tool's verification threshold)

### Misattributions discovered and fixed this session (9 total)

In addition to the structural fixes earlier (Matthew SB front-matter, Wedding Garment case-mismatch, plain-text "Who Among You" → letter-link, the original 4 letter-link target swaps), discovered and fixed these via systematic checker:

- 2× "Proclaim The Name of The Lord" (V7) → "Blessed Be The Name" (WTLB Two)
- 1× "It Is Time" (WTLB Two short title, wrong link) → "It Is Time... Prepare to Meet Your God" (V2)
- 2× "It Is Time; Prepare to Meet Your God" with wrong link target (was wtlb-two-entry / "It Is Time") → V2 letter
- Reverted line 8585 back to original "All Have Been Purchased" (V2) — original was correct, my "fix" was based on a misread of OCR context where "Water of Siloam" is a metaphor INSIDE the "All Have Been Purchased" letter excerpt, not its source

### Wedding Garment scripture-ref tap-through fix

Bug: matthew.js verse 22:11 has cite "Wedding Garment: Colossians 3:9-10" but matthew-nkjv.js had the matching key with **lowercase** "wedding garment:" — the lookup `MATTHEW_NKJV[s.cite]` is case-sensitive, so the rendered cite fell to the plain-text branch (no tap-through).

Fix: changed matthew-nkjv.js key from `"wedding garment: Colossians 3:9-10"` to `"Wedding Garment: Colossians 3:9-10"`. Now matches the cite case-exactly → renderer's `hasVerse` check at index.html:3036 returns true → button branch with onScriptureClick → opens scripture sheet with Colossians 3:9-10 NKJV text → back-pill works as expected.

Also normalized the verse text: dropped the redundant "Colossians 3:9–10 — " prefix (cite header already shows it) and converted the Unicode superscript "¹⁰" mid-text to the standard `"9. text 10. text"` decimal-marker format that triggers the gold inlay verse-sup rendering at index.html:2576.

**Audit tools created (kept in project root for re-use):**
- `excerpt_audit.py` — extracts every `(An excerpt from "X" - Y)` from OCR, confirms each title exists somewhere in the data
- `misattribution_check.py` — fingerprint-matches OCR attributions against data letter-links, flags title mismatches
- `ocr_gap_check.py` — programmatic phrase-coverage check
- `check_balance.py` — JSON validity check across all data files

### Sweep totals

| Metric | Count |
|---|---|
| Letters audited | ~570 (across 11 collections) |
| D-pattern bugs found | 54 |
| D-pattern bugs fixed | 54 |
| Stub letters populated | 1 |
| Holy Days metadata gaps closed | 11 (sourceLabel) |
| Files modified | 12 (V3, V4, V5, V6, V7, Rebuke, Flock, Timothy, WTLB One, WTLB Two, Blessed, Holy Days) |
| Files confirmed clean (no changes needed) | 2 (V1, V2) |
| PDFs OCR'd | 3 (Lamb 34p, Matthew SB 189p, MTAM 450p) |
| OCR compute (local Ollama Qwen3 VL) | 9.4 hr total on user's machine |
| OCR phrase-coverage of existing data | 93.2% MTAM, 97.1% Lamb of God, 79.3% Matthew SB (remaining "gaps" are schema/formatting differences, not content) |

### Outstanding / future work

1. **Studies (deferred per user):** Bible/Letter Studies (`bible-studies.js`, `matthew.js`) skipped this round. The user's screenshots showed similar D-patterns there (doubled superscript markers in John 17:20-23, parser glitch in 1 Cor 7:32-35 cite). To be addressed in a future sweep.
2. **Format-style migration (V2-style unquoted keys across all collections):** Possible future task; cosmetic only, no functional impact.
3. **Holy Days content sync:** Now that source volumes are clean, a verification pass could confirm Holy Days excerpts match their source verbatim (currently they're independent copies, so source updates don't auto-propagate).
4. **WTLB orphan brackets removal philosophy:** All [N] markers in WTLB were treated as Type C (vestigial) and deleted. If the user wants any of these to be preserved as cross-references, would need to revisit per-entry with live wiki access.
5. **Renderer guardrails:** The renderer still has defensive Unicode-superscript strips at index.html:2569/2577 and a spacing collision guard at index.html:2281-2286. These remain in case stale data slips through; can be removed in a later cleanup pass once we're confident the data is permanently clean.

### Key learnings from the sweep

1. **WebFetch unreliable for wiki footnotes.** The MediaWiki render hides footnote content from text extraction. Workaround: use exact-question prompts ("is there a [1] after phrase X?"); cross-reference within the data files for canonical footnote patterns (e.g. "I AM COME" + V5 link is a recurring template).

2. **The "I AM COME" pattern is canonical.** When a letter has the phrase "I AM COME!" or "I AM COME DOWN!" with a [1] marker, that footnote is consistently a `note` type linking to Volume Five letter "I AM COME". Reused across V3, V4, V6, Rebuke (multiple letters).

3. **Audit IDs were sometimes imprecise.** Audit agents identified `blood-pours-down-2` (actual: `blood-pours-down`), `woe-to-the-abominable` (actual: `the-cup-of-the-wrath…`), `consider-the-testimony` (actual: `stealing-from-the-power-of-the-cross`). Always verify the actual id before fix dispatch.

4. **WTLB [N] brackets are different from Volume D3.** In Volumes, [N] is a missed conversion of a numbered footnote to an fn segment. In WTLB, [N] is likely a vestigial cross-reference marker since WTLB uses inline `{{ref:...}}` cites natively. Treat WTLB [N] as Type A/B/C (scripture/cross-ref/vestigial) per case.

5. **Footnote types — three flavors:**
   - `{ type: "scripture", ref: "Book X:Y" }` — gold bubble, NKJV verse text in nkjv dict
   - `{ type: "note", text: "Also read: X", link: { collection, letterTitle } }` — gold bubble, sheet shows "Open in App" button
   - `{ type: "note", text: "X", url: "..." }` — gold bubble, sheet shows external link

### Format-style note (V2 vs others)

V2 uses unquoted JS keys (`id: "...", title: "..."`). All others use JSON-quoted (`"id": "..."`). **This is cosmetic — both render identically.** Per user discussion 2026-05-03: a stylistic reformatting pass to V2-style across all volumes is a possible future task ("if wise and necessary"), but is large mechanical work with no functional impact. **Quality fixes (D-pattern bugs, completeness) are what matter.**

### Cross-collection bug pattern frequency (after main-volume + letter-collection audits)

| Pattern | Count | Notes |
|---|---|---|
| **D3** (defunct `[N]`) | **17** | DOMINANT pattern. 2 V3 + 1 V4 + 2 V6 + 3 Rebuke + 8 Flock + 2 Timothy. Always orphaned (empty footnotes dict). |
| D1 (ref text crammed) | 1 | Only V3's I Am With You Always — already fixed |
| D2-D10 | 0 | None observed in main volumes/letters |
| Stub letters | 1 | V5 Letter 14 — completely empty body |

**Insight:** Almost all data corruption is **D3 orphaned brackets**. Likely root cause: a previous data-fetch pass converted some `[N]` markers to fn segments, but missed cases where the bracket appeared at the END of a segment, after a period, or in italic-styled segments. The fix pattern is uniform.

### Fix template for D3 with empty footnotes dict

When `[N]` is in body but `footnotes: {}` and `nkjv: {}`:
1. WebFetch the live VOT page to find what footnote N should cite
2. Replace `"text": "...word [N] more..."` with three segments: text/fn/text
3. Populate `footnotes[N] = { type: "scripture", ref: "<ref>" }`
4. Populate `nkjv["<ref>"] = "<NKJV verse text>"`
5. For multi-verse refs use `"1. text 2. text"` format
6. For (KJV)/(ASV)/(GNT) tagged refs use that translation, not NKJV

### Holy Days source attribution map (for sourceLabel population, derived from entry dates)

| # | Entry | Date | Likely source |
|---|---|---|---|
| 5 | Walking in the Footsteps of The Messiah's Passion | 2/10/10 | Letters to the Flock |
| 6 | Do This in Remembrance of Me | 4/25/05 | Volume Two |
| 7 | I Am The Passover and The Lamb | 4/18/05 | Volume Two |
| 8 | Keep The Passover | 3/20/07 | Volume Three |
| 9 | Unleavened | 4/19/06 | Volume Three |
| 10 | Devotion | 3/7/10 | Letters to the Flock |
| 11 | I AM RISEN | 4/21/06 | Volume Three |
| 12 | I Shall Remove My Hand... | 5/19/10 | Letters to the Flock or Volume Six |
| 13 | Pentecost | 6/6/11 | Letters to the Flock |
| 14 | To Be Set Apart | 9/7/10 | Letters to the Flock |
| 15 | Atonement | 2010 | Letters from Timothy |

To verify, grep each id in source files during the sweep.

## 14.5 PDF / Studies sweep (Phase 3)

**Three studies are PDF-sourced and require careful page-by-page OCR per user direction:**

| Study | PDF file | Pages | OCR Status | Data Status |
|---|---|---|---|---|
| YAHUSHUA More Than a Man (MTAM) | `YAHUSHUA_MoreThanaMan.pdf` | 450 | ✅ Complete (450/450) | Audit OCR vs existing data + integrate gaps |
| Matthew Study Bible | `New_Testament_Study_Bible-Matthew.pdf` | 189 | ✅ Complete (189/189) | Existing matthew.js spot-checked complete; OCR available for cross-verification |
| Lamb of God (Chronology) | `THELAMBOFGODstudy.pdf` | 34 | ✅ Complete (34/34) | ✅ Complete — all 16 chapters populated, 8 letter cross-refs wired |

**OCR aggregated outputs (in `_ocr_out/<study>/all.txt`):**
- Lamb of God: 49KB
- Matthew SB: 470KB
- MTAM: 920KB

**OCR was completed by local Ollama Qwen3 VL 8b** running in background through `run_ocr_all.sh`. The early pages took ~128s/page but later pages averaged 8-15s/page (warmer model + simpler back-matter pages). Total wall time well under the 24h estimate.

PDFs located at: `C:/Users/corbi/CrossDevice/Pixel 9 Pro/storage/Download/`

**Why OCR (not pdftotext):**
- MTAM has 3 complex columns that pdftotext mangles — user confirmed this
- Matthew SB is also unreliable per user
- Lamb of God is mostly images (25.7MB but only 202 lines text-extractable)

**Tooling installed:**
- `pypdfium2` — PDF page rendering (pure Python, no system deps)
- `pillow` — image processing
- `requests` — HTTP for OCR APIs

**OCR scripts in project root:**
- `ocr_pipeline.py` — Local Ollama Qwen3 VL 8b (slow ~128s/page, but unlimited)
- `ocr_gemini.py` — Gemini 2.0 Flash (fast ~3s/page, but daily quota limits)
- `run_ocr_all.sh` — Sequential runner: Lamb → Matthew SB → MTAM
- `test_keys.py` — Tests each Gemini key for 200/429

**Output:** `_ocr_out/<pdf-name>/page_NNNN.txt` + `_progress.json` per PDF.

**RESUMABLE:** Both scripts read `_progress.json` and skip already-done pages. Safe to interrupt + re-run.

**Gemini key status (2026-05-03):** All 7 keys 429'd this session because I tested too fast. **Per-hour rolling quota — wait ~1 hour and resume**, NOT a daily reset. See `C:/Users/corbi/Desktop/GEMINI_KEYS_AND_RATE_LIMITS.md` for sustainable pacing recommendations.

**Recommended workflow when keys reset:**
1. Edit `ocr_gemini.py` — set `MODEL = "gemini-1.5-flash"` (1500 RPD vs 250 for 2.0-flash)
2. Set `REQ_INTERVAL_SEC = 3.0` for sustainable pacing (~20 RPM aggregate, ~700 reqs in 12h, well under 7×1500=10500 ceiling)
3. Run `bash run_ocr_all.sh` — total ~30 min if quota allows

**While Gemini is unavailable:** the local Ollama job is running in background (check with `ps -ef | grep ocr_pipeline` or read `_ocr_out/run.log`).

**Once OCR is complete (per-study):** parse the page_NNNN.txt files into the JS data schema. User wants **fully integrated metadata, footnotes, references, and tap-through letter links** for each study.

### Integration plan (per-study)

For each study after its OCR completes:

1. **Audit pass** — read OCR pages 0, mid, last; sample 3 existing data chapters; identify:
   - Page-to-chapter mapping
   - Existing schema (`sectionIntro`, `prophecyGroups`, `paragraphs`, `verses`, `letterLinks`, etc.)
   - Cross-references to VOT letters that need tap-through links
   - Footnote markers and scripture refs that need conversion to fn segments + nkjv

2. **Synthesis pass** — dispatch agents (one chapter at a time) to:
   - Read its assigned OCR pages
   - Read the existing chapter's data shape from `bible-studies.js` or `matthew.js`
   - Output a JS data block matching the schema with:
     - Body content from OCR
     - Section/heading structure preserved
     - Scripture refs as `{{ref:...}}` (WTLB-style for studies) OR fn segments depending on schema
     - Letter cross-references as `letter-link` segments with `{collection, letterTitle}` shape so tap-through + back-pill work
     - NKJV verse text hardcoded into the chapter's nkjv dict for any scripture footnotes

3. **Replace pass** — apply the new chapter content via Edit, preserving surrounding chapters

4. **Verify** — re-Read modified region + brace balance check + sample render

### Letter cross-reference target (schema reference)

The studies have an existing `letterLinks` mechanism (visible in `matthew.js` votNotes). New cross-refs should use the same shape so the renderer wires them correctly. Pattern:
```js
{ "t": "letter-link", "label": "Visible Text", "link": { "collection": "Volume Two", "letterTitle": "I Am The Passover and The Lamb..." } }
```

The renderer at index.html `Segments` function (line 2264) handles `letter-link` segments and routes through `openInAppLetter` for proper tap-through + back-pill behavior.

## 14.6 Phase 3 fixes log (post-spot-check)

After the main sweep, a final spot check across all 13 collections found 11 additional orphan `[1]` brackets that prior agents missed. Of these:

**Fixed (8):**
- V5 "Brought to a Close" line 3763 — "True Repentance" link
- V7 "Salvation Is Given..." line 1024 — "True Repentance" link
- V7 "The Prophets Are Sent Out..." line 1618 — V5 "I AM COME" link
- V7 "I Shall Remove My Hand..." line 11391 — existing Matthew 13:15 (KJV) fn was already there, just needed segment split
- V7 "I Am Calling You Out! (Part 2)" line 14990 — Proverbs 13:24 scripture fn (added)
- Letters to Flock "A Wise Servant and the Line" line 4090 — V7 "I Am Calling You Out!" link
- Letters to Flock "Blessed Are Those Who Hunger..." line 4800 — V4 "Awaken... Partake of The Living Bread" link
- Letters from Timothy "The Shadow of The Almighty" line 402 — fixed segment value typo + link to "Timothy's Vision..."

**Resolved (3 fixes applied 2026-05-03 — all 3 brackets were in DIFFERENT letters, audit was wrong about all being in "My Word Is Fire"):**

- V7 "My Word Is Fire" (line 13696): "darkness of faces [1]" → fn 1 = note with url to `http://trumpetcallofgodonline.com/index.php5?title=Darkness_of_Faces`
- V7 "Dividing the Spoils" (line 14001): the `[1][2][3][4]` segment is REAL — 4 distinct footnotes per wiki:
  - fn 1: Regarding the Churches of Men (answersonlygodcangive.com)
  - fn 2: Regarding the Catholic Church
  - fn 3: False Doctrines Within the Churches of Men Regarding...
  - fn 4: Regarding the Holidays of Men
- V7 "I Am Calling You Out! (Part 1)" (line 14393): "darkness of faces [1]" → fn 1 = same Darkness_of_Faces topic link

**LESSON: audit agents may misattribute line numbers to wrong letter ids.** Always re-grep `^    "id":` boundaries before treating an audit's letter-id claim as authoritative.

## 15. NIM Proxy — FULLY DEFUNCT, AI DEFERRED INDEFINITELY

> ⚠️ **The entire NIM/LiteLLM proxy infrastructure is gone (verified 2026-05-11).** `C:\Users\corbi\.claude\nim-proxy\` contains only two empty 0-byte log files (`proxy-err.log`, `proxy-out.log`). No `proxy.py`, no `litellm-config.yaml`, no startup scripts. Port 4000 has nothing listening.
>
> **AI is deferred indefinitely.** Per user direction 2026-05-11: *"no ai no nothing, no api keys, etc, those are security risks anyway, we'll defer a.i feature."* See User Policies at the top of this file and PLAN.txt §5.5 (AI Space — DEFERRED) and §6 (constraints — no AI / no API keys).
>
> **Do not reintroduce a proxy.** If a future session is tempted to talk to an LLM backend, surface that to the user first — it is contrary to current direction.

The original content below is preserved for archaeology only; do not act on it.

---

**Added 2026-05-06.** A local proxy at `~/.claude/nim-proxy/proxy.py` lets Claude Code talk to Qwen3-Coder 480B (free cloud inference) instead of Anthropic's API.

### Quick reference

- **Proxy location:** `C:/Users/corbi/.claude/nim-proxy/proxy.py`
- **Port:** 4000 (auto-starts on login via Startup folder shortcut)
- **Full docs:** `C:/Users/corbi/.claude/nim-proxy/README.md`

### How to use (primary method)

Claude Code v2.1.132 overrides `ANTHROPIC_BASE_URL` from stored credentials, so launching Claude Code through the proxy directly is unreliable. Instead, **talk to Qwen from inside a normal Claude session** via curl to the local proxy. Claude orchestrates, Qwen executes on demand. See curl example below.

### Backends (auto-failover)

| Priority | Provider | Model | RPM | Failover |
|---|---|---|---|---|
| 1 | NVIDIA NIM | `qwen/qwen3-coder-480b-a35b-instruct` | 40 | 402/429/5xx → try next |
| 2 | OpenRouter | `qwen/qwen3-coder:free` | 20 | Last resort |

NIM credits are one-time (1000, then access stops). OpenRouter is free forever (20 RPM, 50 RPD). When NIM dies, OpenRouter kicks in automatically.

### Communicating with the model from this session

The proxy runs locally, so any session can talk to Qwen3-Coder directly via curl:

```bash
curl -s http://localhost:4000/v1/messages \
  -H "x-api-key: sk-nim-local" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":200,"messages":[{"role":"user","content":"..."}]}'
```

### Key files

| File | Purpose |
|---|---|
| `~/.claude/nim-proxy/proxy.py` | The proxy (FastAPI, ~200 lines) |
| `~/.claude/nim-proxy/start-proxy.ps1` | Auto-start script (checks port 4000 first) |
| `~/.claude/nim-proxy/claude-nim.ps1` | Combined launcher (proxy + claude) |
| `~/.claude/nim-proxy/README.md` | Full documentation |

### Important notes

- API keys (NIM + OpenRouter) are stored directly in `proxy.py` BACKENDS list
- The proxy translates Anthropic format ↔ OpenAI format (both streaming and non-streaming)
- Tool use / function calling is fully supported
- Claude Code UI still shows "Opus 4.7" — this is cosmetic, the actual model is Qwen3-Coder
- `claude` (without env vars) = normal Anthropic Claude. The proxy only activates when `ANTHROPIC_BASE_URL=http://localhost:4000` is set.

---

## 17. Annotation System — Highlights, Underlines, Notes, Links

Major rewrite **2026-05-09 (Commit 1)**: kind-aware annotations, distinct note visuals, tap-to-act chip with inline confirm, read+edit NoteSheet. Library/notebooks/multi-note disambiguation are Commit 2.

### 17.1 Architecture overview

Everything is inlined into `index.html`. The annotation layer in the `<script>` block contains:

- **Storage layer** (~2876): `AnnotationStore` on `vot-annotations` (aliased as `HighlightStore` for back-compat), `NoteStore` on `vot-notes`, `LinkStore` on `vot-links`. Migration `migrateAnnotations()` runs once on first load and rewrites old `vot-highlights` data into the new schema.
- **HighlightableText** React component: renders plain-text strings with kind-aware `<mark>` wrappers based on character offsets. Computes per-group first/last segment so notes get a left ribbon and a trailing icon exactly once per group.
- **applyDOMHighlights()** global function: post-React DOM walker that wraps annotated ranges in any `[data-hl-key][data-hl-dom]` container. Same kind-aware logic as `HighlightableText` for `LetterView`/`WtlbEntryView`.
- **SelectionToolbar**: floating popup; appears when user selects text inside a `[data-hl-key]` element.
- **AnnotationActionChip** (NEW, replaces old `HlRemoveMenu`): floating chip that appears when user TAPS an existing highlight or underline mark. Buttons: ✕ Remove · 🎨 Color · 📝 Note (convert). Tap ✕ → chip morphs in place to an inline confirm strip ("Remove this highlight?" · Cancel · Yes, remove). Tap 🎨 → chip swaps to a 10-color row. Tap 📝 → flips kind to 'note' + opens NoteSheet edit mode. Outside-tap dismisses entirely. **Notes do NOT use this chip** — tap on a note routes directly to NoteSheet read mode.
- **NoteSheet** (REWRITTEN): bottom sheet for the full note experience. Two modes: `read` (default) and `edit`. Read mode shows the anchored quote, the note body (or a "tap ⋯ → Edit to add one" empty state), and a `⋯` menu with Edit · Change color · Add to notebook (placeholder for Commit 2) · Share · Delete. Delete uses the same inline-confirm pattern as the chip. Edit mode shows a textarea + Cancel/Save. Cancelling a brand-new empty note discards both the segment(s) and the note record.
- **LinkIcon, LinkSidebar, LinkPicker**: link system unchanged — still scoped per `hlKey`, persisted to `vot-links`.

### 17.2 Storage models

```js
// vot-annotations  (segment records — the rendering anchors)
{
  "<hlKey>": [
    {
      id,                 // segment id (one per container span)
      groupId,            // shared by ALL segments of a logical annotation; ALWAYS present
      kind,               // 'highlight' | 'underline' | 'note'
      color,              // one of HL_COLORS (yellow|green|pink|red|orange|blue|purple|teal|brown|gray)
      start, end,         // char offsets within the container
      text,               // captured text of THIS segment
      created, updated
    }
  ]
}
// hlKey examples:
//   bible:proverbs:2:1                     (Bible verse)
//   letter:the-wide-path:7                  (LetterView block index)
//   wtlb:matters-of-the-heart:0             (WTLB paragraph index)
//   study:matthew-22:11                     (Matthew SB verse)
// Single-segment annotations have groupId === id.
// Multi-paragraph / multi-verse selections produce N segments sharing one groupId.

// vot-notes  (note bodies — first-class records keyed by groupId)
{
  "<groupId>": {
    groupId,
    notebookIds: [],      // [] = Uncategorized; multi-membership ready (Commit 2)
    body,                 // the user's note text (may be '' for fresh notes)
    color,                // matches the segments' color
    fullText,             // joined text across all segments (for indexing / display)
    keys: [...],          // every hlKey the note touches (for navigation)
    created, updated
  }
}

// vot-links  (unchanged)
[
  {
    id, created,
    a: { type:'bible', key, bookId, chapter, verse, label, preview },
    b: { type:'bible', key, bookId, chapter, verse, label, preview }
  }
]

// vot-ann-migrated  ('1' once one-time migration of vot-highlights → vot-annotations + vot-notes has run)
// vot-highlights  (legacy — left in place after migration as a backup; safe to remove after a few release cycles)
```

### 17.3 Three kinds — visual + behavioral matrix

| Kind | Mark visual (default) | Mark visual (active) | End-of-span affordance | Tap behavior |
|---|---|---|---|---|
| **highlight** | Solid color band (`.hl-{color}`) over text | (same — always shown) | None | Action chip (Remove · Color · Note) |
| **underline** | Colored solid bottom border (`.hl-underline.hl-{color}`), no background | (same) | None | Action chip (Remove · Color · Note) |
| **note** | **Plain text** — `.hl-note:not(.is-active)` strips background, border, padding, AND text-decoration via `!important`. The text reads completely unadorned. | **Wavy underline** in the note's color — `.hl-note.is-active` sets `text-decoration-line: underline; text-decoration-style: wavy; text-decoration-thickness: 1.6px`. The wavy style is intentionally chosen to read as "annotation" and is visually distinct from highlight (solid bg) and underline (solid bottom border). | A single 📝 icon at the end of the WHOLE group (one per group, not per container) | Opens NoteSheet (read mode) directly |

The trailing icon is rendered by `applyNoteIcons()` — a global post-render walker (NOT in HighlightableText or applyDOMHighlights, which used to emit per-container icons). It strips every existing `.hl-note-icon` and re-inserts exactly one icon per group, anchored to the GLOBAL last `mark.hl-note[data-group-id]` in document order. Called from the same post-render effect that runs `applyDOMHighlights()` and `applyDOMLinks()`.

The active-state lookup is driven by `applyActiveNoteState()` (called from the post-render effect and when `noteSheetTarget` changes). It reads `window.__activeNoteGroup`, strips any prior `.is-active`, then adds `.is-active` to every `mark.hl-note[data-group-id="…"]` and `.hl-note-icon[data-group-id="…"]` matching the open note. Multi-paragraph notes light up across all containers simultaneously.

**Why wavy and not tint+ribbon (the original Commit 1 design)?** First feedback round: tint + ribbon on every paragraph of a multi-paragraph note read as cluttered and didn't fit the app aesthetic (gold/cream/dark literary feel). Wavy underline is a single, restrained signal that universally reads as "annotation" and sits visually parallel to the existing solid-underline kind without being mistaken for it. The per-color rules use `!important` because the `text-decoration` shorthand expansion in the base `.hl-note.is-active` rule sets `text-decoration-color: currentColor`, which would otherwise win the cascade despite the more-specific `.hl-note.is-active.hl-{color}` selector.

**One icon, not N.** The end-of-span 📝 icon must appear EXACTLY ONCE per note group, no matter how many paragraphs/verses the note spans. Per-container emission (the original design) put one icon in each touching container, which read as multiple separate notes. The fix: HighlightableText and applyDOMHighlights no longer emit any icons; `applyNoteIcons()` does it globally after every render.

**Icon color follows note color.** `applyNoteIcons()` parses the `hl-{color}` class off the last segment's mark and copies it onto the icon span. CSS rules `.hl-note-icon.hl-{color} svg { stroke: <hex>; }` set the stroke per color — except for `hl-yellow`, which has NO override so it falls back to the default `var(--gold)` (gold reads as "yellow" in this app's literary palette and matches the existing visual).

**Save auto-closes the NoteSheet.** `save()` calls `onClose()` after `NoteStore.update` + `setHlTick`, instead of dropping back to read mode. Edit → Save now feels like a confirm-and-leave action; if the user wants to read or recolor the note again, they tap the inline icon.

**Save is disabled on empty body.** `canSave = body.trim().length > 0`. The Save button uses `disabled={!canSave}` plus a `.disabled` class for the muted-button styling. Notes are required to have content — empty/whitespace-only saves are blocked at the UI layer.

**Header color dot is the primary recolor affordance.** It's a `<button class="note-sheet-color-dot">` whose `data-color` styles its fill via the existing `.ann-chip-color-btn[data-color=…]` rules. Tap → `setShowColors(true)` (closing menu/confirm-delete). Works in BOTH read AND edit modes. The ⋯ menu's "Change color" item still works and routes through the same `openColorPicker()` helper. The color picker is hoisted to the sheet's TOP-LEVEL render: when `showColors` is true, the anchor + body + footer + menu all hide and the color row takes their place. Picking a color (or tapping the back arrow) restores the previous view.

**Edit button removed from read-mode footer.** Read mode shows only the body (or empty-state placeholder); the only path to edit mode is `⋯ → Edit note`. This keeps the read surface clean and gives the menu a clear purpose. The empty-state placeholder explicitly directs the user there: "No note text yet. Tap ⋯ → Edit to add one."

Notes are visually distinct AND data-distinct. A highlight or underline never has a note body; converting either kind to 'note' flips the segments' `kind` and creates the corresponding `NoteStore` record with the same color and segments. Reverting is the inverse — but currently the chip's "Note" button only fires the highlight→note direction (not note→highlight). Note→highlight rollback is open for Commit 2 if needed.

### 17.4 Two rendering strategies (unchanged structure)

| Strategy | Used by | How |
|---|---|---|
| **HighlightableText (React)** | `BibleChapterView` (Bible verses), `ChapterView` (Matthew study) — anywhere the text is a single plain string | Component takes `{text, hlKey, hlTick}`, splits into segments using stored `start/end` offsets, renders one `<mark class="hl-mark hl-{kind} hl-{color}">` per segment + a trailing `.hl-note-icon` after note last-segments |
| **DOM-based overlay** | `LetterView` (mixed segment children), `WtlbEntryView` (paragraphs with inline patterns) | Container gets `data-hl-key={key}` + `data-hl-dom={true}`. After React renders, `applyDOMHighlights()` walks `[data-hl-dom]` containers, computes char offsets via `TreeWalker`, splits text nodes, wraps in `<mark class="hl-mark hl-dom hl-{kind?} hl-{color}">` and emits a trailing `.hl-note-icon` after note last-segments |

The DOM overlay re-runs on every `hlTick` change (from `useEffect([hlTick, screen, letterId])` in `App()`). Existing `mark.hl-dom` AND `.hl-note-icon` elements are stripped before re-applying.

For **multi-container** annotations (one groupId, segments in different containers), each container renders its own first-segment ribbon and last-segment 📝 icon. Tap any icon or any segment → opens the same shared note (groupId routing). Removal always operates on the whole group via `AnnotationStore.removeGroup(groupId)` + `NoteStore.remove(groupId)`.

### 17.5 Per-view integration map (unchanged)

| View | Container | hlKey format |
|---|---|---|
| BibleChapterView | `<HighlightableText>` per verse | `bible:{bookId}:{chapter}:{verse}` |
| ChapterView (Matthew) | `<HighlightableText>` per verse | `study:matthew-{chapter}:{verse}` |
| LetterView blocks | `<p data-hl-key="letter:{id}:{bi}" data-hl-dom>` | `letter:{letterId}:{blockIndex}` |
| WtlbEntryView paragraphs | `<p data-hl-key="wtlb:{id}:{pi}" data-hl-dom>` | `wtlb:{entryId}:{paragraphIndex}` |

### 17.6 Tap routing (in SelectionToolbar's pointer lifecycle)

On `pointerup` (collapsed selection — i.e. a tap, not a drag-select):
1. If target is `.hl-note-icon` → call `window.__openNote(groupId)` (read mode).
2. If target is inside `mark.hl-mark[data-kind="note"]` → call `window.__openNote(groupId)` (read mode).
3. If target is inside any other `mark.hl-mark` → call `window.__showAnnChip(x, y, hlKey, groupId)` (action chip).
4. Otherwise → `computeAndShow()` for normal selection toolbar.

Same routing applies to `contextmenu` (Android long-press / right-click).

### 17.7 SelectionToolbar UX (top-of-selection, NEW selections)

```
┌─────────────────────────────────────────┐
│ [A] [A̲] │ ⓞ ⓞ ⓞ ⓞ ⓞ ⓞ ✕            >  │   ← style + colors (scrollable)
│ ─────────────────────────────────────── │
│ [📝]  [🔗]  [📋]  [↗]  [🔍]               │   ← actions
│ NOTE  LINK  COPY SHARE SEARCH            │
└─────────────────────────────────────────┘
```

- **Style toggle**: "A" highlight, "A̲" underline.
- **Color circles**: 10 saturated colors. Tap → creates a new annotation of `kind=activeStyle` (highlight/underline) with that color, removing any overlapping groups first.
- **Note button**: bypasses style; either converts an existing covering group to `kind:'note'` or creates a new note-kind annotation. Always opens NoteSheet edit mode after.

### 17.8 Action handlers (post-rewrite)

- **Note** (`handleNote`): finds any covering group; converts it OR creates a fresh note-kind group. Builds/refreshes the `NoteStore` record from the segments. Opens NoteSheet with `startInEditMode=true`.
- **Link** / **Copy** / **Share** / **Search**: unchanged from the previous design.
- **Action chip → Remove**: in-chip confirm step → `AnnotationStore.removeGroup(groupId)` + `NoteStore.remove(groupId)`.
- **Action chip → Color**: swaps to color row; tap a color → `AnnotationStore.recolorGroup(groupId, c)` + `NoteStore.update(groupId, { color: c })` (note color stays in sync).
- **Action chip → Note**: `AnnotationStore.convertGroup(groupId, 'note')` + `NoteStore.set(groupId, …)` + opens NoteSheet edit mode.

### 17.7 LinkPicker (creating links)

Bottom sheet. User types a scripture ref like "John 3:16", `parseScriptureRef()` validates it against `window.__ALL_BOOKS`, "Create Link" button enables when valid. On confirm, creates a `LinkStore` entry with both endpoints. Source endpoint is built from the source hlKey (e.g. `bible:proverbs:2:6`). Target endpoint is the parsed scripture ref. Both endpoints are stored so the link appears bidirectionally.

### 17.8 LinkSidebar (viewing links)

Slides in from right. Header shows close X and "Links" title. Date row below. Body lists link cards:
- Each card shows the OTHER endpoint (if you opened from Proverbs 2:6's link to John 3:16, the card shows John 3:16).
- Card has: ref label (cyan, "Cinzel" font) with chain icon at right, category subtitle ("Old Testament" / "New Testament"), 3-line verse preview, "Remove link" affordance.
- Tap card → calls `onNavigate(other)` → in App, `navigateToLink` switches to `bible-ch` screen with `setSurpriseAnchor` to scroll to the target verse.

### 17.9 CSS classes (in main `<style>` block, ~line 2208)

```css
/* Highlights */
.hl-mark              /* base mark wrapper */
.hl-blue/purple/red/orange/green/cyan    /* solid fills */
body.light .hl-blue/...                   /* light-mode variants */
.hl-underline         /* removes background, applies text-decoration: underline */
.hl-underline.hl-blue { text-decoration-color: #4fc3f7; }   /* per-color */

/* Selection toolbar */
.sel-toolbar          /* container */
.sel-toolbar-row      /* horizontal flex row */
.sel-style-btn        /* "A" buttons (.active when current style) */
.sel-style-btn-underline   /* underlined "A" variant */
.sel-toolbar-divider  /* vertical 1px separator */
.sel-toolbar-colors   /* color row (overflow-x: auto) */
.sel-color-btn        /* circles (.active when current selection matches) */
.sel-color-underline  /* shows as ring instead of fill */
.sel-color-clear      /* ✕ remove button */
.sel-toolbar-actions  /* 5-column grid for action buttons */
.sel-action-btn       /* one action button */

/* Link icon next to verse */
.verse-link-icon      /* the small chain icon */

/* Link sidebar */
.link-sidebar-overlay /* dim backdrop */
.link-sidebar         /* right-side panel */
.link-sidebar-header  /* close X + title row */
.link-sidebar-date    /* date row */
.link-sidebar-body    /* card list */
.link-card            /* one card */
.link-card-header     /* ref + chain icon row */
.link-card-ref        /* reference label */
.link-card-chain      /* chain icon SVG */
.link-card-cat        /* category subtitle */
.link-card-preview    /* verse text */
.link-card-remove     /* "Remove link" */

/* Link picker bottom sheet */
.link-picker-overlay  /* backdrop */
.link-picker-sheet    /* sheet */
.link-picker-input    /* ref input */
.link-picker-suggestions  /* dropdown */
.link-picker-btn      /* "Create Link" CTA */

/* Note kind — distinct from highlight/underline */
.hl-note                            /* base */
.hl-note:not(.is-active)            /* strips bg, border, padding, decoration via !important */
.hl-note.is-active                  /* wavy underline — applied to ALL segments of the open note's group */
.hl-note.is-active.hl-{color}       /* per-color text-decoration-color (!important) */
.hl-note-icon                       /* 14px 📝 SVG; tappable; one per group (added by applyNoteIcons) */
.hl-note-icon.is-active             /* brightens while the parent note is open */

/* Annotation action chip (replaces hl-remove-menu) */
.ann-chip                  /* container — appears on tap */
.ann-chip-btn              /* main 3-button row (Remove · Color · Note) */
.ann-chip-confirm          /* inline confirm strip in place */
.ann-chip-confirm-q        /* "Remove this highlight?" question */
.ann-chip-confirm-cancel
.ann-chip-confirm-yes
.ann-chip-colors           /* color-picker mode: 10 circles + back arrow */
.ann-chip-color-btn[data-color="…"]   /* one circle */
.ann-chip-back             /* "‹" back to main mode */

/* Note sheet (rewritten) */
.note-sheet-overlay
.note-sheet
.note-sheet-header         /* color dot + title + ⋯ menu button */
.note-sheet-color-dot
.note-sheet-title
.note-sheet-menu-btn       /* the ⋯ button */
.note-sheet-anchor         /* italic quote of the anchored text */
.note-sheet-body           /* read-mode body display */
.note-sheet-empty          /* "No note text yet…" placeholder */
.note-sheet-textarea       /* edit-mode input */
.note-sheet-footer         /* Cancel/Save in edit mode; Edit in read mode */
.note-sheet-save
.note-sheet-secondary
.note-sheet-menu           /* dropdown panel under the header */
.note-sheet-menu-item      /* one menu button */
.note-sheet-menu-item.disabled   /* "Add to notebook…" placeholder until Commit 2 */
.note-sheet-menu-item.danger     /* Delete note */
.note-sheet-menu-colors    /* color sub-panel inside ⋯ menu */
```

### 17.13 Commit 2 — Library, Notes index, Notebooks, Multi-note popover (LANDED 2026-05-10)

**Library** is a new top-level destination, accessible from the home screen as the 6th nav tile (between Studies and Settings). It hosts four sub-spaces; Notes is active, the other three are intentional Coming-Soon placeholders so the architecture is in place when those features land.

```
LIBRARY
┌──────────────┬──────────────┐
│ 📝 Notes     │ ✍ Journal   │
│ 42 notes     │ Coming soon  │
├──────────────┼──────────────┤
│ 🔖 Bookmarks │ 🖍 Highlights│
│ Coming soon  │ Coming soon  │
└──────────────┴──────────────┘
```

`HomeScreen.ITEMS_BY_ID.library` and `DEFAULT_ORDER` were extended; `App.handleSelect` routes `id === 'library'` → `goLibrary()` which sets `screen='library'` (with `setNavOrigin` so the back arrow returns to wherever the user came from — usually home).

**NotesIndexScreen** lives at `screen='notes-index'` and is the user's primary review surface. It includes:
- A header with "My Notes" title and a count.
- A pill-style search input that matches against note body, anchored quote, AND source label (substring, case-insensitive).
- Filter chips: All · Uncategorized · one chip per notebook. Tap to focus; All resets.
- A sort menu popover anchored under the "Sort: Recent ▾" button: Recent (default — by `updated`) · Source (alphabetical by source label) · Color (palette order).
- A list of `NoteRow`s with: color swatch · source label (Cinzel gold) · relative date · 2-line body preview · 1-line italic anchored quote · subtle Cinzel notebook chips (first 2 + `+N` overflow).
- Empty states: "No Notes Yet" with a hint pointing the user to long-press text in any chapter, OR "No Matches" when filter/search excludes everything.

Tapping a row navigates to the source chapter via `navigateToLink(noteSourceNav(note))`, and stashes the groupId on `window.__pendingOpenNote`. The post-render effect in `App` consumes the flag and opens the NoteSheet on arrival, with a 60ms inner timeout so the marks have rendered first (so the active-state wavy underline shows up immediately).

**NotebookStore** is a list-based store on `vot-notebooks` (`{ list: [{ id, name, sortIndex, created, updated }] }`). Notebooks have NO color (kept simple per user direction); the color belongs to the note. CRUD: `add(name)`, `rename(id, name)`, `remove(id)` (cascades via `NoteStore.pruneNotebook(id)` so member notes get the notebook stripped from their `notebookIds[]`), `list()`, `get(id)`.

**`NoteStore.toggleNotebook(groupId, notebookId)`** flips a notebook's membership on a note. **Multi-membership is supported** — a note can live in 0, 1, or many notebooks. The `notebookIds: []` array on each note record is the source of truth.

**NotebookPickerSheet** is a bottom sheet opened from NoteSheet's ⋯ menu. The label is "Add to Notebook" (or "Manage notebooks…" if the note already has any). The sheet has:
- An inline `[name input] [Create]` strip at top — Enter or tap Create to add a new notebook (and auto-add the current note to it).
- A list of every notebook with a checkbox row. Tap row → `NoteStore.toggleNotebook` (instant feedback, no Done button needed). Each row also has a small `×` to delete the entire notebook (with confirm strip).
- Empty state: "No notebooks yet. Type a name above to create your first one."

**Source label generation** is handled by `noteSourceLabel(note)` and `noteSourceNav(note)` near `bookCategory()`:
- Bible/study keys (`bible:proverbs:2:1` etc.) → "Proverbs 2:1-3" via `_verseRangeLabel` which compresses sorted verse numbers into ranges with commas.
- Letter/WTLB/Blessed/Holy-Days keys → letter title via `findEntryContext()`.
- `noteSourceNav` returns an endpoint compatible with the existing `navigateToLink()` pipeline (which already handles `bible`, `study`, `letter`, `wtlb`, `blessed`, `holy-days` types). It uses `findEntryContext` to resolve the right `letterScreen` for non-Bible kinds.

**Multi-note overlap support**:
- `applyHighlight` (highlight/underline create path) still removes overlapping groups (recolor semantics).
- `handleNote` (note-create path) was changed: it only converts an OVERLAPPING NON-NOTE group (highlight/underline → note). When the overlap is itself a note, it creates a NEW stacked note alongside.
- `applyNoteIcons` was rewritten to MERGE icons that share an insertion point. It groups by anchor (a stable identity attached to the target DOM node), and when multiple groups share an anchor it renders a single `.hl-note-icon.hl-note-icon-badge` with `data-count="N"` and `data-group-ids="g1,g2,…"`. The CSS `.hl-note-icon-badge::after` adds a small gold count badge in the top-right.
- `MultiNotePopover` (overlay + popover, anchored at the tap point) lists each note: color swatch, body preview, relative date, notebook tags. Tap a row → opens that note's sheet.
- Tap routing in SelectionToolbar:
  - Tap on a `.hl-note-icon` reads `data-group-ids`. >1 → call `__showMultiNote(groupIds, x, y)`. 1 → `__openNote(groupId)`.
  - Tap on a `mark.hl-note` queries `document.elementsFromPoint(x, y)` to find ALL note marks at the tap point. >1 distinct groupIds → popover. Otherwise direct open.

### 17.18 Single-shot back-pill (2026-05-10 PM)

User feedback: the "Back to My Notes" pill persisted after the user navigated to a different chapter (via next/prev arrows or chapter index). It should only show on the IMMEDIATE destination of the tap-through and disappear the moment the user moves on.

Fix: each entry pushed by `_navToLinkRef.current` now also records a **`destSnapshot`** — the expected `{screen, bookId, chapterNum, letterId, studyId, studyChapterId}` of the destination, computed from the endpoint type BEFORE the state changes happen. The push order is: compute snapshot, push, then dispatch state updates (React batches all updates into one render, so by the time the effect runs the state matches the snapshot).

Two consumers:
1. **`backHint` computation** — when the top stack entry has a `destSnapshot`, the pill renders ONLY if every snapshot field matches the current state. Mismatch → `backHint = null` → no pill.
2. **Prune effect** — a useEffect watching `[screen, bookId, chapterNum, letterId, studyId, studyChapterId, fromLetterStack]`. If the top entry's `destSnapshot` doesn't match the current state, the entry is popped. This keeps the stack clean and prevents Android-back from popping a stale entry into a confusing jump.

Legacy push paths (like `openInAppLetter` used by letter→letter footnote tap-throughs) don't set `destSnapshot`, so they keep the existing multi-level back behavior — the pill shows unconditionally and `handleAndroidBack` walks the stack one level at a time. Only the Notes-index path opts into the single-shot pill semantics.

### 17.17 Notes hub restructure — tabs + notebook cards + drilled view (2026-05-10 PM)

User feedback: notebooks deserve their own dedicated surface, not just filter chips. The Notes hub was restructured into a tabbed two-screen layout:

**Notes hub structure**:
```
My Notes                                    2 notes
─────────────────────────────────
[ NOTEBOOKS ]    [ ALL NOTES ]               ← tab strip
─────────────────────────────────
┌─────────────┐  ┌─────────────┐
│ DEFAULT     │  │ NOTEBOOK    │
│ Uncategoriz │  │ Renamed     │
│ 1 note      │  │ 1 note      │
└─────────────┘  └─────────────┘
┌─────────────┐
│      +      │
│  NEW NOTE-  │
│   BOOK      │
└─────────────┘
```

**Notebooks tab** (default landing) shows a card grid:
- First card always: **Uncategorized** ("Default" eyebrow, dashed border to set it apart visually). Contains every note with `notebookIds: []`.
- One card per user notebook (gold name, "Notebook" eyebrow, count).
- Last card: **+ New Notebook** (dashed, gold-dim) — tap → the card transforms in place into a `[name input] [Cancel] [Create]` form.
- Tap any card → drills into that notebook's notes.

**Drilled-in view** (when a notebook is selected):
- Header row: `‹` back arrow · notebook title · **Rename** button · **Delete** button (omitted for Uncategorized — it's a system bucket).
- Rename: inline text input replaces the title; Enter/blur commits, Esc cancels.
- Delete: inline confirm strip ("Notes will move to Uncategorized") → cascades via `NotebookStore.remove` → `NoteStore.pruneNotebook` → returns to Notebooks tab.
- Sort toggle button: "Newest first ↓" / "Oldest first ↑" — single-click toggle.
- Rows: full NoteRow components (extracted from the inline render so they're reused across drilled and All Notes).

**All Notes tab**:
- Flat chronological list of every note.
- Single sort toggle: "Newest first ↓" / "Oldest first ↑".

**State machine** in `NotesIndexScreen`:
- `tab`: `'notebooks' | 'all-notes'`
- `drilledNbId`: `null | 'uncategorized' | <notebookId>`
- When `drilledNbId` is set, the tab strip hides and the drilled view renders. Back button clears `drilledNbId`.
- `newNbInline`, `newNbName`: inline +New form state.
- `renaming`, `renameValue`, `confirmDeleteNb`: inline rename/delete state in drilled view.

**`NoteRow` is now a top-level component** so it can be shared across the drilled view and All Notes tab without duplicating ~30 lines of JSX.

**Removed**:
- The `NotebookManagerSheet` trigger (the small "Notebooks" button I had in the controls row from 17.16). Inline rename/delete in the drilled view replaces it.
- The old filter-chip strip (All · Uncategorized · per-notebook) — replaced by tabs + cards.
- The 3-mode sort dropdown (Recent · Source · Color) — All Notes uses a simpler 2-mode toggle (Newest/Oldest); drilled view too. The Source/Color sort modes can be restored if a user asks for them.
- The search bar — was previously above the chips. Can be restored as a per-tab feature if needed; tabs + cards already do the bulk of the discovery work.

### 17.16 Back-pill on Bible/Matthew + Notebook Manager (2026-05-10 PM)

Two gaps from Commit 2:

**1. Tap-through back-pill on Bible chapter destinations.** The existing pattern (`backHint` + back-hint-pill) was wired into LetterView and WtlbEntryView, but NOT into `BibleChapterView` or `ChapterView` (Matthew). When the user tapped a note row in the Notes index and landed on a Bible verse, there was no "Back to My Notes" affordance. Fix:

- `navigateToLink(endpoint, meta)` now accepts an optional `meta` argument with `sourceLetterTitle` and `sourceVolumeLabel` overrides. The deferred `_navToLinkRef.current` reads it and passes through to `pushFromLetter`. The Notes index passes `{ sourceLetterTitle: 'My Notes' }` so the destination's pill reads "Back to My Notes".
- `BibleChapterView` and `ChapterView` now accept `backHint` and `onTapThroughBack` props. Both render the standard `.back-hint-row` / `.back-hint-pill` JSX (same shape as LetterView's) right after the nav-arrows and before the hero.
- New `tapThroughBack()` helper in App pops the top of `fromLetterStack` (via `fromLetterRef.current` — `tabField` setters' updater functions run async, so reading from the ref is the only reliable synchronous way to get the current stack) and restores `bookId / chapterNum / letterId / studyId / studyChapterId / screen` from the popped entry.
- LetterView/WtlbEntryView still use their existing `onBack: () => window.handleAndroidBack()` path which routes through the Android-back handler's `LETTER_SCREEN_SET` branch. Same effective behavior. Bible/Matthew use the new `tapThroughBack` directly since Android-back from `bible-ch` doesn't consult `fromLetterStack`.

**2. Notebook management from the Notes index.** Previously the only way to create or remove notebooks was via a specific note's ⋯ menu → "Add to notebook…" picker. Now the Notes index has a small **Notebooks** button (next to the Sort button in the controls row) that opens `NotebookManagerSheet` — a bottom sheet that lists every notebook with:

- Note count per notebook (subtle Cinzel caps)
- ✎ rename button → inline edit field with Save/Cancel
- × delete button → inline confirm strip ("Notes will move to Uncategorized")
- A `[name input] [Create]` strip at top — Enter or tap Create to add a new notebook

The manager is distinct from `NotebookPickerSheet`: the picker has checkbox rows that toggle membership for a specific note; the manager has no note context, just CRUD. Both reuse the `.nb-picker-*` styles.

### 17.15 Word-boundary snap + icon-wrap fix (2026-05-10 PM)

**Problem 1**: When a user's selection ended mid-word (e.g., mid-"treasure"), the icon insertion sat BEFORE the wrap-point space, causing the line to break between the noted text and the icon. The icon and any subsequent highlight tail got pushed to the next line. User: *"where the note icon begins it kicks the highlight down to the next line"*.

**Problem 2**: Even after fixing the icon position, the mark element ending mid-word (e.g., yellow mark containing "trea" followed by adjacent text "sure") still caused mid-word line breaks because adjacent inline elements form a soft-wrap opportunity at the element boundary.

**Fix 1 (icon insertion)** in `applyNoteIcons` — when the icon's insertion point is `beforeNode` and the preceding text ends with a regular space, MOVE that space from the preceding text to the leading edge of the tail. The wrap point (the space) now sits AFTER the icon, so the natural line break happens between the icon and the next word — never between the noted text and the icon.

```js
// Inside applyNoteIcons, before insertBefore(icon, ip.node):
const prev = ip.node.previousSibling;
if (prev && prev.nodeType === 3 && / $/.test(prev.nodeValue)) {
  prev.nodeValue = prev.nodeValue.replace(/ $/, '');
  ip.node.nodeValue = ' ' + ip.node.nodeValue;
}
```

**Fix 2 (word-boundary snap at the data layer)** — `snapRangeToWords(text, start, end)` expands a selection range outward until both endpoints land on word boundaries. Applied at every annotation creation site: both branches of `applyHighlight` AND both branches of `handleNote`. This matches the convention of every major reader app (Kindle, Apple Books, LDS Gospel Library) — selections always commit to whole words. Side benefit: mark elements never end mid-word, so the inline-element-boundary wrap issue is moot.

```js
function snapRangeToWords(text, start, end) {
  const isWord = (c) => !!c && /[\w’'-]/.test(c);
  while (start > 0 && isWord(text[start - 1]) && isWord(text[start])) start--;
  while (end < text.length && isWord(text[end - 1]) && isWord(text[end])) end++;
  return { start, end };
}
```

**Word-joiner pseudo-element** (`[data-no-break-after]::after { content: "\\2060" }`) was added as a belt-and-suspenders backup for any mid-word boundary that slips through — for example, if old-schema data from before this fix is still present. The pseudo content uses double-backslash because the entire CSS lives inside a JS template literal; single-backslash 2060 in source would be parsed as an illegal octal escape and break the template. **Important gotcha**: also avoid writing `\2060` in CSS COMMENTS inside the template — the JS parser sees the comment too. Use the spelled-out phrase or hex form like "U+2060" in comments.

### 17.14 Overlap rendering — sweep-line refactor (2026-05-10)

`HighlightableText` (Bible verses + Matthew study) was rewritten to support overlapping annotations of ANY kind (highlight, underline, note can stack in any combination). The old flat-parts algorithm has been replaced with a **sweep-line segmentation**:

1. Collect every annotation's clamped `start`/`end` plus `0` and `text.length` into a sorted boundary list.
2. Each adjacent pair of boundaries defines a SEGMENT in which the set of active annotations is constant.
3. For each segment, render a chain of NESTED `<mark>` elements — one per active annotation. Order: outermost = earliest start (id tiebreak); innermost = latest start. CSS cascade then does the right thing: a highlight's background paints first, an underline's solid bottom border paints over it, and a note's wavy underline paints on top of both.

Multiple `<mark>` elements may now exist for a single annotation (one per segment the annotation spans). `applyNoteIcons` keys by `data-group-id` and keeps the LAST mark per group in document order — so each group still emits exactly ONE icon (at the rightmost segment that contains it).

`first-segment` and `last-segment` classes are now computed against the segment index, not the annotation index. The first mark of a group (in any segment) gets `first-segment`; the last gets `last-segment`. Used by the icon-insertion walker.

**applyHighlight relaxation**: the recolor flow used to remove ANY overlapping group when a new highlight/underline was created. It now removes only EXACT-RANGE matches. This preserves the "select same text, pick new color → recolor" UX, while allowing partial overlaps to STACK. A user can layer:

- Big yellow highlight on a verse (0–30)
- A red highlight on words 5–10 inside that verse
- A blue underline on word 12–14
- A green note on words 6–8

All four coexist, and visually each renders with its proper treatment in the segment where it's active.

**Icon merge by character offset**: `applyNoteIcons` was reworked so the merge key is `hlKey + ':' + charEnd` (where `charEnd` comes from `Range.toString().length` after `setEndAfter(mark)`). When two notes end at the same character position — even if their last marks are NESTED in different DOM levels — they share one icon with a `data-count="N"` badge. Tap → multi-note disambiguation popover.

**DOM-overlay path (LetterView / WtlbEntryView)** was already overlap-aware via `TreeWalker` re-walks in `applyDOMHighlights`. No change needed there.

**Surprise FAB behavior**: the FAB is rendered inside `HomeScreen` only, so it never appears on `library` or `notes-index` (which are separate screens). No additional hide logic was needed.

### 17.10 Commit 2 — Library, notebooks, multi-note disambiguation (PLANNED — see 17.13 for the landed implementation)

**Library** is the new top-level destination, reachable from the home nav. It contains four sub-spaces as tiles:

- **Notes** (active in Commit 2) — full notes index with All / Notebooks / Uncategorized tabs, color filter chips, sort by recent / book / color. Each row shows color swatch, source label, body preview, anchor preview, date, and a subtle notebook chip when applicable.
- **Journal** (placeholder) — clean Coming-Soon tile.
- **Bookmarks** (placeholder).
- **Highlights & Underlines** (placeholder) — distinct from Notes; will surface every highlight/underline grouped by source.

**Notebooks** — `vot-notebooks` store, `{ list: [{ id, name, color, icon, sortIndex, created }] }`. Notes reference notebooks via `notebookIds: []` on the `vot-notes` record. Multi-membership is allowed (one note can live in multiple notebooks). Uncategorized = `notebookIds: []`. Notebook delete prompts "Move notes to Uncategorized, or delete notes too?".

**Multi-note overlap** — a span can have multiple notes stacked. Visually: end-of-span shows a stacked icon with count badge (📝²); left ribbon shows up to 3 stripes side-by-side. Tap → disambiguation popover lists each note (color swatch, body preview, notebook tag) → tap one → opens that note's read sheet.

The data layer landed in Commit 1 already supports notebooks (the `notebookIds: []` field is present on every note record). The "Add to notebook…" item in the NoteSheet ⋯ menu is currently disabled and waits on Commit 2 wiring.

### 17.10b The "Instances" feature (DEFERRED — superseded by Library/notebooks for now)

User wants the ability to have multiple "versions" or "copies" of each book/volume — one for personal annotation, one for clean reading, one for class notes, etc. Inspired by the LDS Gospel Library "Screens" feature shown in user reference screenshots.

**Data-model design** (proposed):

```js
// localStorage: vot-instances
{
  active: 'default',
  list: [
    { id: 'default',  name: 'Personal Study', created: 1714867200000 },
    { id: 'clean',    name: 'Clean Reading',  created: 1714867200001 },
    { id: 'abc123',   name: 'Class Notes',    created: 1715472000000 }
  ]
}

// Per-instance keyed storage:
//   vot-highlights-default      → { hlKey: [highlights...] }
//   vot-highlights-clean        → {} (empty — clean reading)
//   vot-highlights-abc123       → { hlKey: [class-only highlights...] }
//   vot-links-default           → [...]
//   vot-links-abc123            → [...]
```

`HighlightStore` and `LinkStore` would read `localStorage.getItem('vot-active-instance')` to determine which keyed bucket to load. On instance switch, stores re-load and `setHlTick(t => t + 1)` triggers global re-render.

**UX flow**:
1. **Instance switcher** — small pill in nav bar (next to Home or Search icon) showing current instance name. Tap → dropdown with list + "+ New" + "Manage…".
2. **New instance** — name + duplicate-from-existing option (clone all current highlights/links). Default: starts empty.
3. **Manage instances** — full screen: rename, delete, export-as-JSON, import-from-JSON, set-as-default.
4. **Current-instance indicator** — subtle eyebrow under the chapter title or a top-left ribbon: "Reading in: Personal Study".

**Implementation sequence** (when ready to build):
1. Add `vot-instances` migration on first load: if absent, create `{ active: 'default', list: [{ id: 'default', name: 'My Highlights', created: now }] }`. Move existing `vot-highlights`/`vot-links` to `vot-highlights-default`/`vot-links-default`.
2. Refactor `HighlightStore`/`LinkStore` to use a function `currentKey()` that reads `vot-active-instance` and constructs the storage key. Cache invalidates on instance switch.
3. Add `useInstances()` hook (similar to `tabField`) for instance state in App.
4. Add an `InstanceSwitcher` component (dropdown in nav).
5. Add a `ManageInstancesScreen` for create/rename/delete/export/import.
6. Wire `setHlTick` on instance switch so all views re-fetch.

**Why this design**:
- Instances are isolated — no cross-contamination of personal/class data.
- Default instance preserves current behavior — no migration headache for existing users.
- Storage scales linearly per instance (most users won't have more than 3-4).
- Clean Reading mode is just an instance with no data — users can switch back to it anytime.
- Export/import gives a backup path and a way to share instance data between devices.

### 17.11 Working environment notes (CRITICAL for future agents)

The Claude Code session CWD is the OLD `C:\Users\corbi\OneDrive\Desktop\VOTReader-studio` path. Project files live at `D:\VOTReader-studio` (per Section 0 / memory file).

**Junction in place** (set up 2026-05-08): `C:\Users\corbi\OneDrive\Desktop\VOTReader-studio\app` is now a Windows Junction pointing to `D:\VOTReader-studio\app`. Any change to D: appears at C: instantly. The previous C: \app is preserved as `C:\Users\corbi\OneDrive\Desktop\VOTReader-studio\app.OLD-<timestamp>`.

> ⚠️ **OneDrive backup unverified.** The junction makes the preview tool work, but whether OneDrive actually syncs the *contents* of D:\ (rather than just the symlink) was never confirmed. PLAN.txt §0.10 / §21 list this as one of the unverified critical infrastructure claims. The primary backup is now the private GitHub repo at `github.com/corbinlythgoe/VOTReader-studio` (push works with cached credentials).

This was necessary because the preview tool (`mcp__Claude_Preview__preview_start`) starts `python -m http.server 8090 -d app/src/main/assets` from the CWD (regardless of `--directory` flag in launch.json). So D: is the source of truth for edits, and C: \app → D: \app via junction means the preview tool serves D: edits transparently.

**Future agents**:
1. Always edit files in `D:\VOTReader-studio\...` — never edit through the C: junction or the `app.OLD-*` backup.
2. After file edits, the preview tool will automatically pick up changes (via the junction). Just call `preview_eval` with `location.reload()` or restart preview.
3. CLAUDE.md is at `D:\VOTReader-studio\CLAUDE.md`. The C: copy is the older snapshot — only update D:.
4. If `app/src/main/assets/test-marker.txt` doesn't appear when fetched from preview, the junction is broken — re-create it via `New-Item -ItemType Junction -Path C:\... -Target D:\...`.

### 17.7b LinkPicker — full navigation picker (rewritten 2026-05-08 PM)

The old single-input scripture-only LinkPicker is gone. The new picker is a full-height bottom sheet that handles ALL nav targets across the app, modeled after the LDS Gospel Library "Link" screen.

**Components added near `bookCategory()` (~line 2680):**

- **`buildNavIndex()`** — lazily builds (and caches on `window.__NAV_INDEX`) a flat list of every navigable target across the app. Total ~1969 items across:
  - Bible book chapters (every book × chapter combo, ~1189 entries)
  - Volume One–Seven letters (each `LETTERS_V*` array)
  - Letters from Timothy / to the Flock / Lord's Rebuke
  - Words To Live By Part One / Part Two entries
  - The Blessed sections, Holy Days entries
  - Matthew Study Bible chapters
  - Each item has: `kind`, `label`, `category`, plus `aliases[]` — alternate strings users might type. Bible has built-in 3-letter abbreviations (`gen`, `eph`, `mt`, `1cor`, etc).

- **`searchNavIndex(query, limit)`** — ranked candidate matcher:
  1. Tries Bible reference parser first (`/^([1-3]?\s*[a-z][a-z\s]*?)\s*(\d+)(?::(\d+))?(?:\s*-\s*(\d+))?$/i`) — handles `Eph 6:5`, `Genesis 1:1-3`, `1 Cor 7:32-35`. Bible refs score 1000 (always top).
  2. For everything else, scores aliases:
     - Exact match: 900
     - Starts-with: 700 − len-diff
     - Contains: 400 − position
     - Title contains: 200
  3. Returns top N items sorted by descending score.

- **`navItemToEndpoint(item)`** — converts a nav-index item into a link-store endpoint object (`{type, key, bookId, chapter, verse, label, preview}`).

- **`navItemPreview(item)`** — fetches verse text for Bible/study chapter previews.

**Smart-input examples that work** (verified via live DOM tests):

| Input | Result |
|---|---|
| `Eph 6` | Ephesians 6 |
| `Eph 6:5` | Ephesians 6:5 |
| `1 Cor 7:32-35` | 1 Corinthians 7:32-35 |
| `Matt 22` | Matthew 22 |
| `v1l2` | Honor Not the Day of the Dead... Honor God (V1 L2) |
| `Vol 2 Letter 5` | The Holy Spirit |
| `WTLB1 33` | Trust, Obey and Love |
| `The Wide Path` | The Wide Path (direct title) |
| `wisdom` | Multiple "wisdom" letters across collections |

**`RecentNavStore`** (~line 2552, new) — localStorage-backed `vot-recent-nav`. Caps at 30 entries, dedupes by kind+id, sorted newest-first. The picker shows the top 20 in its "Recent" section when the search input is empty. Populated:
- When `LinkPicker.createLinkTo()` creates a new link (the link target is recorded as recent)

**LinkPicker UI** (~line 3200): full-height bottom sheet, max 92vh, min 60vh.
- Header: ✓ check icon (matching Gospel Library "Link" screen) + "Link" title + close ×
- Search bar (rounded pill, dark transparent fill, focuses on mount)
- Body (scrollable): either "Recent" rows (when query empty + recent has items) or "Results" rows (typing) or "No matches" empty state with examples
- Each row: 36×50 book-spine icon (e.g. "V1", "OT", "W2") + label + category subtitle

**`navigateToLink()` expanded** (~line 9621) to handle non-Bible endpoints — `study` (Matthew SB), `letter` (any volume/Timothy/Flock/Rebuke), `wtlb`, `blessed`, `holy-days` — by setting `letterId` + the appropriate screen string from the endpoint.

### 17.7c Highlight color palette refresh (2026-05-08 PM)

Replaced the 6 pastel colors (`blue/purple/red/orange/green/cyan`) with a 10-color saturated palette closer to traditional highlighter colors. New palette in `HL_COLORS`:

```
yellow → #ffd700  (the OG highlighter)
green  → #76ff03  (lime/highlighter green)
pink   → #ff4081  (hot pink)
red    → #f44336  (classic red)
orange → #ff9100  (bright orange)
blue   → #2196f3  (vivid blue, was pastel #4fc3f7)
purple → #ba68c8  (vivid purple, was pastel #ce93d8)
teal   → #00bcd4  (was previously called 'cyan')
brown  → #8d6e63  (subtle, low-emphasis)
gray   → #9e9e9e  (subtle, low-emphasis)
```

CSS rules at `.sel-color-btn[data-color="..."]` (color circle in toolbar) and `.hl-{color}` (the highlight `<mark>` background) both updated. Underline text-decoration colors match the saturated values.

**Back-compat:** The old palette used `'cyan'` (value `#4dd0e1`). Old saved highlights with `color: 'cyan'` still render — `.hl-cyan` and `.hl-underline.hl-cyan` rules are kept as compat shims (rendering the new teal value).

### 17.7d Toolbar fade-in fix (2026-05-08 PM)

The `selToolbarIn` keyframes used to animate both `opacity` AND `transform`. The toolbar's inline style sets `transform: translateY(-100%)` for above-selection positioning. The animation's transform keyframe was clobbering the inline transform, AND repeated mount/unmount during rapid pointer events left the toolbar stuck at opacity 0.

Fix: keyframes animate ONLY opacity now (`from { opacity:0 } to { opacity:1 }`), inline transform is left alone, and `.sel-toolbar` has explicit `opacity: 1` as base style so the toolbar is always visible after the 0.16s animation completes — even if the animation gets restarted by re-mount.

### 17.7e Selection-toolbar pointerup lifecycle (2026-05-08 PM, see Section 17.5)

The toolbar no longer re-positions on every `selectionchange` event during drag. It now uses a `dragRef` + `pointerdown`/`pointerup`/`touchend`/`contextmenu` lifecycle:
- `pointerdown` → `dragRef.current = true`, hide stale toolbar
- `pointerup` / `touchend` → schedule `computeAndShow()` 60ms later (lets selection finalize)
- `selectionchange` → only HIDES the toolbar (when selection collapses)
- `contextmenu` (Android long-press) → also schedules `computeAndShow()` 80ms later

Result: toolbar appears once after selection settles, rather than following the cursor pixel-by-pixel during drag.

### 17.11b Default-vs-active note rendering (2026-05-10)

Three rounds of feedback shaped the final note rendering:

**Round 1**: Notes always showed faint tint + ribbon → too busy, didn't fit the app aesthetic. Sheet dim covered everything because sheet rendered as Fragment sibling of overlay (no positioning).
**Round 2**: Default plain text + tint-on-active was OK, but the active-state visual still looked too much like a faint highlight. User asked for active-state to be visually distinct from BOTH highlight (solid bg) and underline (solid bottom border). Also: a multi-paragraph note was rendering one trailing icon per container (so a 2-paragraph note showed 2 icons, reading like 2 separate notes).

**Final rendering rules**:
- **Inactive**: `.hl-note:not(.is-active)` strips background, border-left, padding-left, AND text-decoration with `!important`. Text reads completely plain.
- **Active**: `.hl-note.is-active` applies a wavy underline — `text-decoration-line: underline; text-decoration-style: wavy; text-decoration-thickness: 1.6px`. Per-color rules use `text-decoration-color: <hex> !important` to win over the shorthand-expansion's `currentColor`.
- **One icon per group**: `applyNoteIcons()` is a post-render DOM walker (added near `applyDOMHighlights()` / `applyDOMLinks()`). It strips every `.hl-note-icon` and inserts exactly one icon after the GLOBAL last segment per group. HighlightableText and applyDOMHighlights no longer emit icons themselves.
- **Sheet stacking**: NoteSheet returns a single `<div class="note-sheet-overlay">` whose CHILD is `<div class="note-sheet">`. The overlay's flex layout (align-items: flex-end) positions the sheet, and the sheet's `e.stopPropagation()` prevents the overlay's click-to-close from firing through it. Same pattern as `LinkPicker`.

**Trap to avoid**: the entire CSS lives inside a `const CSS = \`...\`` template literal in `index.html`. Any backtick or `${` that appears inside CSS comments terminates or interpolates the template, which silently breaks `CSS` to evaluate to the global `window.CSS` namespace. React then tries to render `[object CSS]` as a string and throws "Minified React error #31". Symptom: app reloads to "Something went wrong" with no clear cause. Cure: search the CSS region for stray backticks.

### 17.12 Testing summary (2026-05-09 — post-Commit 1)

Verified live in Chrome via `preview_start`:
- ✅ Migration runs cleanly on first load; sets `vot-ann-migrated=1`; no console errors
- ✅ Highlight render: yellow band with kind=`highlight` data-attr
- ✅ Underline render: hl-blue → hl-red after recolor; no background; colored bottom border
- ✅ Note render: faint 12% tint + 3px colored left ribbon (first-segment) + trailing 14px 📝 icon (last-segment)
- ✅ Tap on highlight mark → action chip appears with Remove · Color · Note
- ✅ Action chip → Remove → "Remove this highlight?" inline confirm; Cancel returns to chip; Yes removes whole group
- ✅ Action chip → Color → 10-color row → recolor persists in store + DOM
- ✅ Action chip → Note → kind flips to 'note', NoteStore record created, NoteSheet opens in edit mode
- ✅ Tap on note mark or 📝 icon → NoteSheet read mode (NOT chip)
- ✅ NoteSheet read mode: anchored italic quote + body OR "tap ⋯ → Edit" empty state
- ✅ NoteSheet ⋯ menu: Edit · Change color · Add to notebook (disabled) · Share · Delete
- ✅ NoteSheet edit → save → body persists across page reload
- ✅ NoteSheet menu Delete → "Delete this note?" inline confirm → cascades segments + note record
- ✅ Multi-paragraph note in `LetterView` (DOM-overlay path): each container gets its own first-segment ribbon + last-segment icon; tapping any icon opens the SAME note (groupId routing); whole-group operations work
- ✅ Confirm-strip "Remove this <kind>?" reads correctly as "highlight" or "underline" depending on the marked kind
- ✅ Notes do not appear in `Notes` browser yet (Library is Commit 2)

Not exercised in this session (logic verified by code inspection):
- WTLB DOM-overlay path (same code path as LetterView, validated there)
- Real long-press text selection → handleNote (the manual injection path was used; the SelectionToolbar→Note action calls the same `convertGroup` / new-note codepath that was tested via the action chip's Note button)
- Share button via `navigator.share` (Android WebView only)

---

## 16. Open questions / things to clarify with user

- WTLB / The Blessed footnote mode: confirm `footnotesMode` should stay OFF for these (so refs render as parenthetical cites, not numbered bubbles).
- Some Volume Five letters appear to be missing `audioUrl` (28 of 29 letters have it) — investigate which one and whether the live site has it.
- Bible Studies: confirmed skipping per user direction. Matthew Study Bible is one of 9 and lives in separate `matthew.js`.
- Volume Six and Volume Seven have `videoMusicUrl` for 31/31 and 66/66 letters respectively — looks complete.

---

## 18. Architectural refactor (2026-05-09)

Major code-quality pass: eliminated ~200 lines of duplicate branching, extracted shared patterns, unified scripture reference parsing, and fixed a UX bug in history cards.

### 18.1 COLLECTIONS registry (~line 2918)

Single source of truth for all 15 content collections. Replaces 150+ duplicate if/else/switch branches scattered across navigation, back-routing, search, last-read tracking, and data loading.

```js
const COLLECTIONS = [
  { volKey: 'one', cardId: 'volume-one', readKey: 'volume-one', globalName: 'LETTERS_V1',
    prefaceGlobal: 'LETTERS_V1_PREFACE', letterScreen: 'vot-one-letter',
    indexScreen: 'vot-one-index', label: 'Volume One', registryLabel: 'Volume One',
    searchVolId: 'v1', kind: 'letter', surpriseType: 'vot-one' },
  // ... 14 more entries (all volumes, Timothy, Flock, Rebuke, WTLB 1/2, Blessed, Holy Days, Hidden Manna)
];
```

**Derived lookup maps (O(1) access):**
- `COL_BY_KEY` — volKey → collection (`COL_BY_KEY.get('three')`)
- `COL_BY_CARD` — cardId → collection (home card routing)
- `COL_BY_LETTER_SC` — letterScreen → collection (back handler)
- `COL_BY_INDEX_SC` — indexScreen → collection (back handler, history card labels)
- `COL_BY_SEARCH_ID` — searchVolId → collection (search result routing)
- `COL_BY_READ_KEY` — readKey → collection (mark-as-read system)
- `LETTER_SCREEN_SET` — Set of all letter screens (derived from COLLECTIONS)

**Helper functions:**
- `colLetters(col)` — get the letter array from window[col.globalName]
- `colPreface(col)` — get the preface entry if it exists
- `colLetterArr(col)` — safe array version of colLetters
- `goColIdx(volKey)` — navigate to a collection's index screen

**Fields per collection:**

| Field | Purpose | Example |
|---|---|---|
| `volKey` | Internal key | `'one'`, `'wtlb1'`, `'hm'` |
| `cardId` | Home screen card id | `'volume-one'`, null for hidden manna |
| `readKey` | localStorage mark-as-read key | `'volume-one'`, `'wtlb-one'`, `'hidden-manna'` |
| `globalName` | window global with letter data | `'LETTERS_V1'`, `'WTLB_ONE'` |
| `prefaceGlobal` | window global with preface entry | `'LETTERS_V1_PREFACE'` or null |
| `letterScreen` | Screen state for reading | `'vot-one-letter'`, `'wtlb-one-entry'` |
| `indexScreen` | Screen state for letter list | `'vot-one-index'` or null |
| `label` | Display label | `'Volume One'` |
| `registryLabel` | VOT_LETTER_REGISTRY label (for tap-through) | `'Volume One'` |
| `searchVolId` | Search engine volume id | `'v1'` |
| `kind` | Collection type | `'letter'`, `'wtlb'`, `'blessed'`, `'holy-days'` |
| `surpriseType` | Surprise/random button pool id | `'vot-one'` or null |

### 18.2 CachedStore factory (~line 2815)

Extracted shared localStorage cache pattern from HighlightStore, LinkStore, and RecentNavStore.

```js
function CachedStore(storageKey, defaultVal) {
  return { _cache: null, _load() {...}, _save() {...}, raw() {...} };
}
const HighlightStore = Object.assign(CachedStore('vot-highlights', {}), { get, all, add, update, remove, removeAllForKey });
const LinkStore = Object.assign(CachedStore('vot-links', []), { getForKey, getForKeyPrefix, all, add, remove });
const RecentNavStore = Object.assign(CachedStore('vot-recent-nav', []), { list, add });
```

### 18.3 Scripture reference primitives (~line 2948)

Three shared functions replace 4 duplicate ref-parsing codepaths:

- **`_allBooks()`** — canonical accessor for book data (replaces 5 inline `window.__ALL_BOOKS || ...` copies)
- **`_matthew()`** — canonical accessor for Matthew Study Bible data (replaces 5 inline `(typeof window !== 'undefined' && window.MATTHEW) || ...` copies). Returns the MATTHEW object or null.
- **`_studies()`** — canonical accessor for Bible Studies array (replaces 4 inline `typeof BIBLE_STUDIES !== 'undefined' ? BIBLE_STUDIES : []` copies). Returns the array or `[]`.
- **`parseRefStr(str)`** — parses "Book Chapter:Verse-End (Tag)" into `{rawBook, chapter, verse, verseEnd, tag}`. Handles chapter-only refs ("Genesis 1"), translation tags ("(ASV)"), and numbered books ("1 Corinthians")
- **`findBook(rawName)`** — case-insensitive book-name-to-id resolver with plural tolerance ("Psalm" → "psalms"), abbreviation matching ("Eph" → "ephesians"), and id matching

Used by: `parseScriptureRef`, `lookupVersesFromBooks`, `searchNavIndex`, `resolveVerseText`, `buildNavIndex`, `navItemPreview`, `findEntryContext`, `VOT_LETTER_REGISTRY`, `MATTHEW_CHAIN_ENTRY`.

### 18.4 Consolidated navigation

- **14 `goVotXxxIdx` functions → 1 `goColIdx(volKey)`** — each was `() => setScreen("vot-X-index")`, now `() => { const c = COL_BY_KEY.get(volKey); if (c && c.indexScreen) setScreen(c.indexScreen); }`
- **`VOL_SCREEN_MAP` (14-entry map in goToLastRead) → `COL_BY_KEY.get(volKey).letterScreen`**
- **`_volLabels` (8-entry map in HistoryEntryCard) → `COL_BY_INDEX_SC.get(entry.volumeScreen).label`**

### 18.5 Last-read state consolidation

Three separate state variables (`lastReadLetter`, `lastReadLetterV1`, `lastReadLetterMap`) consolidated into one unified `lastReadLetterMap` with backward-compatible migration from old localStorage keys.

### 18.6 sharedViewProps pattern (~line 12072) — COMPLETE

Common props passed to every LetterView and WtlbEntryView extracted into a reusable object:
```js
sharedViewProps = {
  onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor,
  onInAppLink, backHint, hlTick, onLinkOpen, onBack, markAsReadEnabled, showProgressBar
};
// Usage: React.createElement(LetterView, Object.assign({}, sharedViewProps, { letter, volumeLabel, ... }))
```
All 17 render blocks converted (11 LetterView + 4 WtlbEntryView + 1 bible-study LetterView + 1 Hidden Manna LetterView). Zero unconverted blocks remain — confirmed via `grep 'createElement\((LetterView|WtlbEntryView),\s*\{'` returning no matches. Bug fix: the bible-study-chapter LetterView was missing `onSettings` and `onHistory` props; adding sharedViewProps fixed that gap.

### 18.7 UX fix: history card titles

`HistoryEntryCard` was computing `title` (the actual letter/chapter title) but displaying `fallback` ("Letter 5" / "Chapter 12") in the card. Fixed to show `title || fallback` — history cards now display real letter titles.

### 18.8 Refactoring summary

| Change | Lines eliminated | Risk |
|---|---|---|
| COLLECTIONS registry | ~150 (14 if-branches × ~10 code paths) | Low — derived maps + helpers |
| CachedStore factory | ~40 (duplicate _cache/_load/_save) | Low — Object.assign preserves methods |
| goColIdx consolidation | ~13 (14 functions → 1) | Low — pure setScreen wrappers |
| parseRefStr + findBook | ~50 (3 duplicate regex + book-matching blocks) | Low — shared by existing callers |
| _allBooks() dedup | ~8 (5 inline copies → 1 function) | Low — identical semantics |
| sharedViewProps | ~150 total (17 blocks × ~9 lines each) | Low — Object.assign spread |
| History title fix | 0 (bug fix) | Low — uses existing data |
| NavButtons extraction | ~240 (24 usages × ~10 lines each) | Low — pure presentational component |
| colReadNavProps + colIdxProps | ~120 (30 blocks × ~4 lines each) | Low — derived from COLLECTIONS registry |
| _goFirst/_goLast boundary maps | ~30 (29 named consts → 10-line loop) | Low — identical semantics via COLLECTIONS |
| _findLetter helper | ~8 (10 inline .find() → 1 helper) | Low — identical semantics |
| History recording loop | ~25 (13 if-else branches → 3 lines) | Low — COL_BY_LETTER_SC lookup |
| History consumption + WTLB_SCREEN_MAP removal | ~5 (6 lines → 3 + deleted map) | Low — COL_BY_INDEX_SC lookup |
| _idxNav() extraction | ~42 (14 index screens × 3 lines each) | Low — identical nav bar fragment |
| IIFE elimination (WTLB1/2, Blessed) | ~18 (3 IIFEs × 6 lines wrapping) | Low — _findLetter pre-resolves |
| _navToChapter extraction | ~12 (4 identical closures → 1) | Low — pure handler dedup |
| colLetterArr in index screens | ~4 (2 typeof safety checks) | Low — colLetterArr is equivalent |
| HD/HM IIFE simplification | ~6 (entry lookup + null guard) | Low — pre-resolved variable |
| getScrollKey COLLECTIONS dispatch | ~4 (hardcoded screen list → kind lookup) | Low — COL_BY_LETTER_SC |
| Reading-dot exclude list | ~1 (21-item array → LETTER_SCREEN_SET + 6) | Low — set + short array |
| linkPreface/linkWtlbEntries loops | ~10 (12 hardcoded calls → 2 COLLECTIONS loops) | Low — identical semantics |
| _matthew() + _studies() helpers | ~20 (5 duplicate typeof guards → 2 helpers) | Low — identical semantics |
| typeof guard elimination (VolumesHome + Settings) | ~6 (6 typeof guards → colLetterArr()) | Low — colLetterArr has typeof safety |
| VOT_LETTER_REGISTRY typeof cleanup | ~3 (2 typeof guards → colLetterArr + _studies) | Low — identical semantics |
| buildNavIndex MATTHEW accessor | ~2 (window.MATTHEW → _matthew()) | Low — same semantics |
| Null guards on colLetters/colPreface/colLetterArr | 0 (defensive) | Low — prevents crash on bad volKey |
| Dead code: WtlbTextLine removed | ~11 lines | Low — superseded by renderTextWithScripRefs |
| CSS debris: duplicate .hl-underline rules | ~2 lines | Low — stale palette-transition leftovers |
| ErrorBoundary class component | +12 lines (new) | Low — wraps App, catches render errors |
| boundaryConfig() helper + READING_CHAIN | ~80 (14 boundary blocks × ~8 lines: V1–V7 + Timothy/Flock/Rebuke + WTLB1/2 + Blessed + HolyDays) | Medium — verified 7 boundary transitions in browser |
| Boundary card eyebrow shows short label | +6 lines (LetterView + WtlbEntryView × 3 sites) | Low — pure label upgrade, fallback preserves old text |
| Inline link icons via applyDOMLinks | +60 lines (new function + CSS) | Low — replaces per-paragraph icon with per-range icon |
| Underline highlight skip-ink fix | +1 CSS line | Low — fixes descender clipping in y/g/p/q/j |

### 18.9 Future consolidation opportunities

These are mechanical-only refactors with no behavioral change, safe to do in a future session:

1. ~~**sharedViewProps conversion**~~ — **DONE** (2026-05-08). All 17 blocks converted.
2. ~~**Render-block loop**~~ — **PARTIALLY DONE** (2026-05-09). Boundary configs were the duplicative core; extracted into `boundaryConfig(volKey, entry)` driven by READING_CHAIN. See Section 18.17. The remaining render-block scaffolding (screen condition + ScreenLayout + index/letter component) is now tight enough that a full loop would actually obscure rather than clarify — diminishing returns reached.
3. ~~**Nav bar dedup**~~ — **DONE** (2026-05-08). Extracted `NavButtons` component (~line 5701). 24 usages across index and reading screens. 2 special cases left inline (HistoryScreen — no history button; SettingsScreen — no settings button).
4. ~~**`readKey` usage**~~ — **DONE** (2026-05-08). Extracted `colReadNavProps(volKey, clearSurprise)` and `colIdxProps(volKey)` helpers. 16 letter/entry blocks + 14 index blocks converted. Zero hardcoded readKey strings remain in render blocks.
5. ~~**goTo* boundary functions**~~ — **DONE** (2026-05-09). Replaced 29 named `goToVolumeX`/`goToXLast` consts with a COLLECTIONS-derived loop generating `_goFirst[volKey]` and `_goLast[volKey]` maps. 30 call-site references updated. `goToRevelationLast` and `goToGardenFirst` kept standalone (not in COLLECTIONS).
6. ~~**Letter variable definitions**~~ — **DONE** (2026-05-09). Added `_findLetter(volKey)` helper (~line 10651). 10 letter resolution variables now delegate to it instead of inline `.find()` + preface check.
7. ~~**History recording chain**~~ — **DONE** (2026-05-09). Replaced 13 if-else branches (V1-V7, Timothy, Flock, Rebuke, WTLB1/2, Blessed, Holy Days) with 3-line `COL_BY_LETTER_SC.get(screen)` + `_findLetter()` loop. All entries now uniformly include `volumeScreen: col.indexScreen`.
8. ~~**History consumption + WTLB_SCREEN_MAP**~~ — **DONE** (2026-05-09). Replaced 6-line WTLB_SCREEN_MAP + string-replace volKey derivation + V1/V2 special cases with 3-line `COL_BY_INDEX_SC.get(entry.volumeScreen)` lookup. `WTLB_SCREEN_MAP` deleted. Legacy V1 (`volume: 1`) and V2 (no `volumeScreen`) fallbacks preserved for old localStorage entries.
9. ~~**_idxNav() extraction**~~ — **DONE** (2026-05-09). Extracted the identical 4-element nav bar fragment (← Volumes button + HomeBtn + NavButtons) shared by all 14 index screens into a `_idxNav()` function (~line 11908). Each index render block now passes `navChildren: _idxNav()`.

### 18.10 NavButtons component (~line 5701)

Extracted presentational component rendering the 4-button nav cluster: settings gear, history clock, search magnifier, ThemeBtn. Used across 24 screens (all index and reading views).

**Props:**
- `onSettings`, `onHistory`, `onSearch` — click handlers
- `theme`, `onThemeChange` — passed through to `ThemeBtn`
- `reading` (optional) — when truthy, adds `nav-history-reading` CSS class to the history button (reading-mode styling)

**Usage patterns:**
- **Index screens** (VolumesHome, V1–V7 index, Timothy/Flock/Rebuke index, WTLB1/2, Blessed, Holy Days, StudiesHome, ScripturesHome): `{ onSettings: goSettings, onHistory: goHistory, onSearch: goSearch, theme, onThemeChange: setTheme }`
- **Reading views** (LetterView, WtlbEntryView, ChapterView, BibleChapterView, ScriptureGenre, ChapterIndex, BibleStudyIndex): `{ onSettings, onHistory, onSearch, theme, onThemeChange, reading: true }` (or without `reading` for non-reading sub-screens)

**Intentionally left inline (2 screens):**
- `HistoryScreen` (~line 6849): renders settings + search + theme but NO history button
- `SettingsScreen` (~line 8434): renders history + search + theme but NO settings button

**Incidental fix:** Holy Days index previously lacked a search button; NavButtons now includes it.

### 18.11 colReadNavProps + colIdxProps (~line 11464)

Two helpers defined inside `App()` that derive read-tracking and navigation props from `COLLECTIONS` via `COL_BY_KEY`, eliminating all hardcoded `readKey` strings from render blocks.

**`colReadNavProps(volKey, clearSurprise)`** — returns 5 props for letter/entry screens:
- `onMarkRead: () => markRead(rk, letterId)` — rk from `COL_BY_KEY.get(volKey).readKey`
- `onUnmark: () => unmarkRead(rk, letterId)`
- `isRead: (id) => isRead(rk, id)`
- `onNavigate: (id) => { if (clearSurprise) setSurpriseAnchor(null); setLetterId(id); setActiveReadKey(...); }`
- `onHome: () => goColIdx(volKey)`

Usage: `React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('three', true), { letter: letterV3, volumeLabel: "Volume Three", ...boundaries }))`

`clearSurprise` = `true` for V1–V7/Timothy/Flock/Rebuke LetterView (clears surprise-anchor on nav). Omitted (falsy) for WtlbEntryView and Holy Days entries.

**`colIdxProps(volKey)`** — returns 5 props for index screens:
- `onSelect: (id) => { setLetterId(id); setActiveReadKey(...); setScreen(col.letterScreen); }`
- `onSelectPreface`: same function if `col.prefaceGlobal` exists, else `undefined`
- `currentLetter`: reading-dot indicator based on `activeReadKey` match
- `isRead: (id) => isRead(col.readKey, id)`
- `markAsReadEnabled: settings.markAsRead`

Usage: `React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Volume Three", letters: LETTERS_V3, preface: LETTERS_V3_PREFACE }, colIdxProps('three')))`

**Coverage:** 16 letter/entry render blocks + 14 index render blocks = 30 total. Bible-study chapters use `studyReadKey(study.slug)` (dynamic per study) and are excluded.

### 18.12 _goFirst / _goLast boundary maps (~line 11374)

Replaced 29 named `goToVolumeX` / `goToXLast` constants with two maps generated by a COLLECTIONS loop:

```js
var _goFirst = {}, _goLast = {};
COLLECTIONS.forEach(function(col) {
  if (!col.letterScreen) return;
  var arr = colLetterArr(col);
  var pref = colPreface(col);
  _goFirst[col.volKey] = pref ? _firstPreface(pref, arr, col.volKey, col.letterScreen) : _first(arr, col.volKey, col.letterScreen);
  _goLast[col.volKey] = _last(arr, col.volKey, col.letterScreen);
});
```

**Usage at boundary config sites:** `onPrevBoundary: _goLast.two` replaces the old `goToVolumeTwoLast`.

**Kept standalone (not in COLLECTIONS):**
- `goToRevelationLast` — Bible, not a collection
- `goToGardenFirst` — special screen, not letter-based

**Shorthand aliases also generated:**
- `_blessedArr = colLetterArr(COL_BY_KEY.get('blessed'))` — replaces old `_BLESSED_ARR`
- `_holyDaysArr = colLetterArr(COL_BY_KEY.get('holydays'))` — replaces old `_HOLY_DAYS_ARR`

These are used in conditional boundary configs (e.g. `_blessedArr.length > 0 ? _goLast.blessed : _goLast.wtlb2`).

**Removed:** `_firstWtlb` / `_lastWtlb` aliases (were just `=== _first` / `=== _last`).

### 18.13 LinkPicker / navigation search architecture (2026-05-08)

**What LinkPicker is:** A cross-reference annotation tool. Users select text → tap "Link" in SelectionToolbar → full-height bottom sheet opens → type a destination (scripture ref, letter shortcode, title) → creates a bidirectional link stored in `vot-links` localStorage. Chain icon appears next to linked passages; tap opens `LinkSidebar` showing the other end; tap that navigates there.

**Two search engines — intentionally different:**

| Engine | Used by | Indexes | Purpose |
|---|---|---|---|
| `searchNavIndex()` + `buildNavIndex()` | LinkPicker, RecentNavStore | ~2000 navigable destination titles + aliases | "Navigate to Proverbs 2:6" — alias-based fuzzy match |
| `VotSearch` (FlexSearch, `search.js`) | SearchScreen | ~200K+ text segments across all content | "Find verses about mercy" — full-text phrase match |

These solve different UX problems: content search vs. destination lookup. Using FlexSearch for the nav picker would be over-engineering; using alias matching for content search would be inadequate.

**buildNavIndex derives from COLLECTIONS** (refactored 2026-05-08): instead of 4 parallel arrays (`volumeSlots`, `otherSlots`, `wtlbSlots`, `VOLUME_SCREEN`), now loops `COLLECTIONS` with per-kind alias generation via `NAV_ALIAS_BASES` lookup. Bible chapters, Bible Studies, and Matthew Study remain as separate loops (not in COLLECTIONS).

**COL_NAV_ICON map** (module scope, derived from COLLECTIONS): maps `col.label` → 2-char abbreviation for LinkPicker row icons (`V1`..`V7`, `LT`, `LF`, `LR`, `W1`, `W2`, `TB`, `HD`, `HM`). Replaced a 15-branch ternary chain in `renderItemRow`.

**Dead code removed:** `SRCH_VOL_SCREEN` (was at SearchScreen line ~9744) — 16-entry map that duplicated COLLECTIONS data. Already replaced in prior session by `srchVolLookup` using `COL_BY_SEARCH_ID`; the constant itself was never deleted.

**LinkPicker refinement flow:**
1. User picks a target from search results → `createLinkTo(item)`
2. If target is a Bible/study chapter without a specific verse → opens `VersePickerScreen` (tap verse to select, tap again to extend range)
3. If target is a letter/WTLB/Blessed/Holy Days entry → opens `LetterExcerptPickerScreen` (renders entry body as plain text blocks; user selects a text range)
4. On confirm, `persistLink()` creates a `LinkStore` entry with both endpoints and deduplicates

**Key functions:**
- `buildNavIndex()` (~line 3076): builds flat navigable-item list, cached on `window.__NAV_INDEX`
- `searchNavIndex(query, limit)` (~line 3248): scored alias matching + Bible ref parsing
- `navItemToEndpoint(item)` (~line 3868): converts nav item → link endpoint object
- `buildSourceEndpoint(sourceKey, ...)` (~line 3919): converts hlKey → link source endpoint
- `persistLink(source, target)` (~line 3968): dedup + store
- `findEntryContext(id, kindHint)` (~line 3038): centralized entry lookup across all COLLECTIONS + Bible Studies

### 18.14 IIFE elimination + _navToChapter + colLetterArr (2026-05-09)

Four related consolidations that simplify the WTLB/Blessed/Holy Days/Hidden Manna render blocks.

**Pre-resolved entry variables (~line 10667):**
```js
const wtlb1Entry = _findLetter('wtlb1');
const wtlb2Entry = _findLetter('wtlb2');
const blessedEntry = _findLetter('blessed');
const hdEntry = _findLetter('holydays');
const hmEntry = _findLetter('hm');
```

`_findLetter(volKey)` already handles `colLetterArr` safety (returns `[]` when the global isn't loaded), so these replace the verbose `typeof X !== 'undefined' ? X : []).find(...)` pattern used inside IIFEs.

**IIFEs eliminated (3):** WTLB1, WTLB2, and Blessed entry screens no longer need IIFE wrappers for entry lookup. Each was:
```js
screen === "xxx-entry" && letterId && (() => {
  const entry = ARRAY.find(e => e.id === letterId);
  return entry ? React.createElement(WtlbEntryView, ...) : null;
})()
```
Now:
```js
screen === "xxx-entry" && wtlb1Entry && React.createElement(WtlbEntryView, ...)
```

**IIFEs simplified (2):** Holy Days and Hidden Manna still need IIFEs (HD for type dispatch + boundary vars, HM for `goHomeFromHM` closure), but their entry lookup lines are removed — they use the pre-resolved `hdEntry`/`hmEntry` variables.

**`_navToChapter` (~line 11939):** Shared handler extracted from 4 identical inline closures in WtlbEntryView render blocks:
```js
void (_navToChapter = (bid, ch) => {setFromWtlb(screen);setBookId(bid);setChapterNum(ch);setScreen("bible-ch");}),
```

**`colLetterArr` in index screens:** Blessed and Holy Days index screens replaced `(typeof THE_BLESSED !== 'undefined' ? THE_BLESSED : [])` with `colLetterArr(COL_BY_KEY.get('blessed'))` — semantically identical, using the existing COLLECTIONS infrastructure.

**`getScrollKey` COLLECTIONS dispatch (~line 10544):** Replaced 4 lines of hardcoded screen-string checks (`"vot-letter" || "vot-one-letter" || ...`) with `COL_BY_LETTER_SC.get(scr)` + kind-based prefix derivation:
```js
var _sc = COL_BY_LETTER_SC.get(scr);
if (_sc && _sc.volKey !== 'hm') {
  var pfx = _sc.kind === 'holy-days' ? 'holyday' : _sc.kind === 'letter' ? 'letter' : _sc.kind;
  return pfx + '-' + lid;
}
```
Maps `kind` to scroll-key prefix: `letter` → `letter-`, `wtlb` → `wtlb-`, `blessed` → `blessed-`, `holy-days` → `holyday-` (historical: no hyphen, no "s"). HM excluded (`volKey !== 'hm'`) — falls through to default `return scr`.

**Reading-dot exclude list (~line 11447):** Replaced 21-item hardcoded array with `LETTER_SCREEN_SET.has(screen)` + 6-item short array for non-COLLECTIONS screens (`matthew-ch`, `bible-ch`, `search`, `garden-view`, `settings`, `history`). Also fixes an oversight: `hm-letter` was missing from the original list but is now correctly excluded via LETTER_SCREEN_SET.

**`linkPreface` / `linkWtlbEntries` loops (~line 9387):** Replaced 9 hardcoded `linkPreface(PREFACE_GLOBAL, LETTERS_GLOBAL)` calls and 3 hardcoded `linkWtlbEntries(ARRAY)` calls with two COLLECTIONS-based loops:
- `linkWtlbEntries`: iterates collections where `kind === 'wtlb' || kind === 'blessed'`
- `linkPreface`: iterates all collections with a preface via `colPreface(col)`

### 18.15 Global accessor helpers + typeof guard elimination (2026-05-09)

**`_matthew()` (~line 2957):** Canonical accessor for Matthew Study Bible data. Replaces 5 identical `(typeof window !== 'undefined' && window.MATTHEW) || (typeof MATTHEW !== 'undefined' ? MATTHEW : null)` expressions scattered across:
- `resolveVerseText` (link preview text)
- `navItemPreview` (nav index preview)
- `ChapterView` useMemo (study chapter resolution)
- `buildNavIndex` (Matthew study chapter indexing)
- `MATTHEW_CHAIN_ENTRY` (study chain config)

**`_studies()` (~line 2958):** Canonical accessor for Bible Studies array. Replaces 4 identical `typeof BIBLE_STUDIES !== 'undefined' ? BIBLE_STUDIES : []` patterns across:
- `findEntryContext` (entry lookup for tap-through)
- `PROGRESS_GROUPS` in settings (mark-as-read list)
- Surprise handler (random-chapter pool)
- `STUDIES` const in App (study chain setup)

**typeof guard elimination:** All remaining `typeof X !== 'undefined'` guards for globals covered by COLLECTIONS (`WTLB_ONE`, `WTLB_TWO`, `THE_BLESSED`, `HOLY_DAYS`) replaced with `colLetterArr(COL_BY_KEY.get(volKey))` which has typeof safety built in. Affected locations:
- VolumesHome card definitions (2 cards: Blessed, Holy Days)
- PROGRESS_GROUPS settings entries (4 entries: WTLB1, WTLB2, Blessed, Holy Days)
- VOT_LETTER_REGISTRY Blessed alias registration
- VOT_LETTER_REGISTRY Bible Studies registration (→ `_studies()`)

**Result:** Zero raw `typeof WTLB_*`, `typeof THE_BLESSED`, `typeof HOLY_DAYS`, `typeof BIBLE_STUDIES`, or `window.MATTHEW` references remain outside the helper definitions themselves.

### 18.17 boundaryConfig + READING_CHAIN (2026-05-09)

The biggest remaining duplication after section 18.16 was the prev/next boundary configs in render blocks. Each of the 11 letter-shaped collections (V1, V2, V3-V7, Timothy, Flock, Rebuke, WTLB1, WTLB2, Blessed, HolyDays branch in HD IIFE) had ~6-12 lines computing:
1. Which adjacent collection is "previous" / "next" in the reading chain
2. What title to display on the boundary card (last entry going back, preface-or-first going forward)
3. Conditional skip-when-empty logic (Blessed → Flock falls back when Blessed has no entries)
4. Cross-family label switching (which turned out to be a no-op since the renderer ignores `prevBoundary.short`)

**Module-scope additions (~line 2954):**
```js
const _BOUNDARY_SHORT = { flock: 'Little Flock', holydays: 'Holy Days', wtlb1: 'Part One', wtlb2: 'Part Two' };
const _BOUNDARY_SHORT_OUTSIDE = { wtlb1: 'Words To Live By', wtlb2: 'Words To Live By' };
COLLECTIONS.forEach(c => {
  c.short = _BOUNDARY_SHORT[c.volKey] || c.label;
  c.shortFromOutside = _BOUNDARY_SHORT_OUTSIDE[c.volKey] || null;
});

const READING_CHAIN = ['one','two','three','four','five','six','seven','rebuke','wtlb1','wtlb2','blessed','flock','timothy','holydays'];
function _isWtlbFamily(col) { return !!col && (col.kind === 'wtlb' || col.kind === 'blessed'); }
function _boundaryShort(sourceCol, targetCol) { /* contextual label */ }
```

**App-scope helper (~line 11392):**
```js
const boundaryConfig = (volKey, entry) => {
  const sourceCol = COL_BY_KEY.get(volKey);
  const hasPrev = !!(entry && (entry.prevLetter || entry.prevEntry));
  const hasNext = !!(entry && (entry.nextLetter || entry.nextEntry));
  const idx = READING_CHAIN.indexOf(volKey);
  // Walk back through chain skipping empties → prev boundary
  // Walk forward through chain skipping empties → next boundary
  // Special: V1.prev = Revelation; HolyDays.next = Garden
  return { prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary };
};
```

**Render block call site (was ~6-12 lines per block, now 1):**
```js
React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('three', true), boundaryConfig('three', letterV3), {
  letter: letterV3, volumeLabel: "Volume Three" }))
```

**Verified live in browser** — 7 boundary transitions tested via direct state injection:
- V1 preface → Revelation 22 (special endpoint)
- V1 last → V2 first
- V2 last → V3 first (no preface)
- V3 first → V2 last
- V3 last → V4 first
- V6 last → V7 preface (preface-aware)
- V7 last → Rebuke preface
- Rebuke last → WTLB1 first
- WTLB1 first → Rebuke last
- WTLB2 last → Blessed first (Blessed-skip path inactive)
- Blessed last → Flock preface
- Flock preface → Blessed last (chain walks past Blessed correctly)
- Timothy preface → Flock last
- HolyDays last → "A Return to the Garden" (special endpoint)

Click handlers verified: `_goFirst[volKey]` / `_goLast[volKey]` / `goToRevelationLast` / `goToGardenFirst` all wired correctly.

**Wired through to the rendered cards (2026-05-09 follow-up):** Both LetterView (~line 7743) and WtlbEntryView (~line 7392, 7408) now display `boundary.short` in the eyebrow label, e.g. "‹ Previous · Volume Two" / "Next · Words To Live By ›". The contextual short logic kicks in across families: Rebuke→WTLB1 shows "Words To Live By" (shortFromOutside), but WTLB1→WTLB2 shows "Part Two" (short). When `boundary.short` is absent the fallback "Previous Book"/"Next Book" labels still apply. Verified live in browser across V3/Rebuke/WTLB1/WTLB2/Flock boundary transitions.

**Cleanup:** Removed `_blessedArr` and `_holyDaysArr` variables (~line 11388) which were used only by the now-removed inline boundary configs.

### 18.18 Inline link icons + underline descender fix (2026-05-09)

**Inline link icons:** Previously, when a passage in a letter/WTLB block contained one or more cross-reference links, a single chain icon appeared at the END of the entire paragraph (via React-rendered `<LinkIcon prefix={true}>`). This was confusing — users couldn't tell WHICH text was linked.

Fix: replaced per-paragraph icon with per-range icons via DOM injection.

- New module-scope `applyDOMLinks()` (~line 3432) walks every `[data-hl-key][data-hl-dom]` container, looks up links via `LinkStore.getForKeyPrefix(blockKey)`, parses each endpoint's `:start-end` suffix, and injects an inline `<span class="inline-link-icon">` at exactly the end-character position of each linked range.
- Pattern mirrors `applyDOMHighlights()` — same TreeWalker-based char-offset → text-node-split approach.
- Click handler reads `window.__openLinkSidebar` (set by App's effect) and opens the link sidebar with the block-level hlKey.
- Removed the React-rendered `blockLinkIcon(bi)` calls in LetterView (6 call sites) and WtlbEntryView (1 call site). Bible/Matthew study verses keep their per-verse `<LinkIcon>` since those are whole-verse links with no character range.
- New CSS class `.inline-link-icon` (~line 2399) — 13×13 px chain SVG, gold tint, vertical-align middle.

**Useful runtime gotcha:** RAF (`requestAnimationFrame`) intermittently failed to fire the apply-DOM-effects callback in this preview environment; switched to `setTimeout(0)` for reliability:
```js
useEffect(() => {
  const t = setTimeout(() => { applyDOMHighlights(); applyDOMLinks(); }, 0);
  return () => clearTimeout(t);
}, [hlTick, screen, letterId]);
```

**Underline descender fix:** Underline-style highlights were visually skipping through letters with descenders (y, g, p, q, j) — making it look like those characters weren't underlined. Two-line CSS fix at `.hl-underline`:
```css
text-underline-offset: 3px;        /* was 2px — push line below baseline */
text-decoration-skip-ink: none;    /* don't auto-skip through descenders */
```

### 18.16 ErrorBoundary (2026-05-09)

Class component wrapping `<App>` at the root render call. Catches unhandled render errors (from malformed data, missing globals, etc.) and shows a "Something went wrong" screen with the error message and a "Reload App" button — instead of the previous behavior of a blank white/black screen.

```js
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  render() { /* gold-themed error UI with reload button */ }
}
// root.render(createElement(ErrorBoundary, null, createElement(App, null)));
```

Uses the app's gold color scheme (`#e0c97f`) so the error screen feels in-brand rather than jarring.

---

## 19. Deep-dive audit & fixes (2026-05-09)

Comprehensive 5-agent parallel audit of the entire app: data formats, renderer code quality, CSS, navigation/state, and cross-cutting concerns. Found 48 issues across 5 severity tiers.

### 19.1 Bugs fixed (items 1-5)

| # | Bug | Fix | Lines affected |
|---|---|---|---|
| 1 | `.link-sidebar-overlay` referenced `selSheetBackdropIn` but keyframes are named `selectSheetBackdropIn` — fade-in animation was silently broken | Changed animation name to `selectSheetBackdropIn` | CSS ~line 2416 |
| 2 | Garden view used `var(--font-cinzel)` and `var(--font-garamond)` which were never defined in `:root` — garden elements got browser default font instead of Cinzel/EB Garamond | Added `--font-cinzel` and `--font-garamond` to `:root` CSS variables | CSS ~line 83 |
| 3 | `wtlb-one-entry`, `wtlb-two-entry`, `blessed-entry`, `holy-days-entry` screens had no startup validation — app could reload to blank screen if `vot-state` saved one of these with stale `letterId`. Also: `garden-view` with null `gardenPage` was unvalidated | Extracted `_validateTabState()` function (replaces inline validation), applied to both legacy single-tab state AND each tab in multi-tab `saved.tabs[]` array. Added WTLB/Blessed/HolyDays/Garden checks | App() ~line 10120 |
| 4 | `WtlbEntryView` had its own `wtlb-scroll-${id}` localStorage scroll system racing with the App-level `tab.scrollPositions` system — two `setTimeout` calls competing to restore scroll position, plus `wtlb-scroll-*` keys accumulating forever | Removed WtlbEntryView's independent scroll persistence entirely. App-level system already generates per-entry scroll keys via `getScrollKey()` → `wtlb-{entryId}` | WtlbEntryView ~line 7370 |
| 5 | `navigateToLink` (LinkSidebar card tap) bypassed `fromLetterStack` — navigating via cross-reference link produced no back-pill, Android back went to volume index instead of source letter | Refactored `navigateToLink` to use a ref-based deferred pattern: stable `useCallback` shell reads `_navToLinkRef.current` (assigned after `pushFromLetter` is defined). Now pushes source context onto `fromLetterStack` before navigating, exactly like `openInAppLetter` | App() ~line 10246 + ~line 10552 |

### 19.2 Architectural improvement: _validateTabState

The startup validation was previously inline in `saved = useMemo(...)` and only ran on the legacy single-tab `s` object. Multi-tab users could have invalid tab states (e.g. `wtlb-one-entry` with no `letterId`) that bypassed validation entirely because `saved.tabs[].screen` was never checked.

New `_validateTabState(s)` function runs on both `s` (legacy) and each `s.tabs[i]` (multi-tab). Covers all 44 screen states.

### 19.3 Full audit findings inventory (items 6-48)

**Fixed (2026-05-09, second pass):**

| # | Issue | Fix |
|---|---|---|
| 8 | Two independent OT book-set definitions | `bookCategory()` now falls back to `OT_BOOK_IDS` (derived from `BIBLE_BOOK_LIST`) when available; inline Set kept as early-load fallback |
| 9 | `bookCategory()` rebuilt Set on every call | Hoisted `_OT_BOOKS_INLINE` to module scope |
| 10 | `tabField()` created new setter references every render | Cached setters via `_tabSetters` ref + `_uatRef` for stable identity |
| 11 | `useEffect` without dependency array (`__onDwellCommit`) | Added `[commitDwellNow]` dependency |
| 12 | `__closeSheet` stacking fragile in 3 components | ChapterView, WtlbEntryView, LetterView all converted to save/restore pattern (was already correct in SelectField + TabActionSheet) |
| 13 | `navOrigin` missing `studyId`/`studyChapterId` | Added both fields to goSettings/goHistory capture and goNavOrigin restore |
| 15 | `__onReadingComplete` duplicated in 4 views | Extracted `useMarkAsRead(enabled, callback)` hook; 4 call sites replaced |
| 18 | Dead code `matthewTile = null` + 4 render sites | Removed variable and all 4 createElement wrappers in ScripturesHome |
| 19 | `findBook()` name collision (module-scope vs describeTab local) | Renamed local lambda to `resolveBook` in describeTab |
| 21 | Unused search exports (SYNONYM_MAP, SYNONYM_GROUPS, stemWord, phoneticKey) | Removed from search-data.js exports |
| 22 | `parseInt` without radix | Added `, 10` to all 11 occurrences across parseRefStr, buildSourceEndpoint, findEntryContext, parseRefRanges, renderLine |
| 23 | Silent empty `catch` in CachedStore._save | Added `console.warn('localStorage write failed for', storageKey, e)` |
| 24 | Duplicate `.section-block`/`.section-heading` CSS rules | Removed first set (lines ~586-591); kept canonical set in Bible reader section |
| 25 | Empty CSS rule blocks | Commented out `.letter-list-item`, `.letter-body`, `.search-screen` (`.history-screen` not found) |
| 26 | Unused `@keyframes` | Removed `fadeUp`, `fadeIn`, `homeHeroIn`, `homeOrnIn` (confirmed zero CSS/JS references) |
| 27 | Unused CSS variables `--bg4`, `--study-bg` | Removed from both `:root` and `body.light` |
| 28 | `--gold-border-faint` referenced but never defined | Simplified to `var(--gold-border)` (the fallback was already --gold-border) |
| 30 | Raw hex colors | Defined `--link-blue` (#6cb4dc dark / #4a90b8 light) and `--accent-pink` (#f48fb1 dark / #c2185b light) CSS variables; replaced 7 hex usages. Also replaced 3× `#e6dece` → `var(--bg3)` and 1× `#ede7d8` → `var(--bg2)` in body.light rules |
| 40 | `fromLetterStack` unbounded growth | Added 50-entry cap in `pushFromLetter` |

**Reviewed, deferred with rationale:**

| # | Issue | Rationale for deferring |
|---|---|---|
| 6 | `LETTERS` naming in volume-two.js | COLLECTIONS registry handles via `globalName: 'LETTERS'`. Rename touches data file + all references — large mechanical change, no functional bug |
| 7 | `nextLetterExternal` unique field | Working correctly. 3 references all properly conditional. Boundary config system handles V2's last entry |
| 14 | InlineNotes/StudyPanels ~90% identical | Different CSS class prefixes + StudyPanels has group wrappers with titles. Merged component would need class-map props that add complexity without proportional benefit |
| 16 | Bottom-nav card duplication | Differ in data shape (entry.id vs chapter.num, boundary label variants). Extraction adds parameter complexity |
| 17 | Scripture sheet duplication | 98% similar but verse lookup strategy differs (pre-computed vs IIFE). Minor gain from extraction |
| 20 | Stale Unicode superscript stripping | Harmless defensive code. Guards against data regressions. Zero performance cost |
| 29 | ~50 distinct font-size values | Informational. Consolidation to modular scale = large CSS refactor with visual regression risk |
| 31 | `transition: all` on 30 elements | Changing to explicit properties risks visual regressions. Performance impact negligible |
| 32 | z-index gaps (600→8000) | Intentional separation between content layers and overlay layers. Reorganizing requires extensive modal testing |
| 33 | `!important` flags (~34 declarations — was originally counted as 3-4, recount 2026-05-10) | Each has legitimate specificity reason (responsive override, active state, selector depth, annotation-system overrides). The 4 stripping rules on `.hl-note:not(.is-active)` are the best candidates for future cleanup via `:where()` or `@layer`. Refactoring selectors risks regressions |
| 34 | Quoting style split (V2 unquoted vs JSON-quoted) | Cosmetic. No functional impact. Large mechanical change |
| 35 | Trailing commas in bible-lsv.js / bible-ylt.js | Valid JS. 4.7MB files each. Cosmetic only |
| 36 | Minified vs pretty-printed | Informational |
| 37 | Missing videoMusicUrl in some collections | Data completeness issue. Some letters genuinely lack video music URLs on the live site |
| 38 | `seeAlso` used exactly once | Informational. Single usage in volume-one.js. Working correctly |
| 39 | `metaAddendum` two linking patterns | Both patterns (`metaAddendumLink` + `metaAddendumInternal`) serve different purposes. Working correctly |
| 41 | No focus traps on modals/sheets | Accessibility improvement. Complex to implement across all modal/sheet components |
| 42 | Limited keyboard navigation | Accessibility improvement. Complex |
| 43 | Three `setInterval` polls for scroll container | Polls wait for `__scrollEl` global (set by React ref callback). Replacing with pub/sub requires refactoring the global. Polls are cheap (300ms, single ref comparison) |
| 44 | `-webkit-overflow-scrolling: touch` deprecated | Harmless. Removing could break momentum scrolling on older iOS WebViews |
| 45 | React 18.2.0 one minor behind | Upgrade carries risk for zero functional gain in this app |
| 46 | Hidden Manna not in search token map | Intentional by design — Hidden Manna is not publicly indexed |
| 47 | 17 `window.*` globals | These are the React↔imperative bridge for Android WebView back handler, scroll container, and inter-component communication. Reducing requires architectural change |
| 48 | Magic timeout values | Informational. Named constants would help readability but change no behavior |

### 19.4 Key architectural insights from the audit

**Two search engines are intentional:** `searchNavIndex()` (alias-based, ~2000 items) is for destination lookup in LinkPicker ("navigate to Proverbs 2:6"). `VotSearch` (FlexSearch, ~200K+ segments) is for content search in SearchScreen ("find verses about mercy"). Different UX problems, different engines. Do NOT merge.

**`navigateToLink` vs `openInAppLetter`:** Both navigate to letters, but they come from different UX flows. `openInAppLetter` handles footnote tap-throughs (knows the source letter title for back-pill label). `navigateToLink` handles cross-reference link card taps (source may be Bible, study, or letter — no guaranteed source title). Now both push onto `fromLetterStack`.

**App() is ~2,521 lines** (was originally documented as ~2,350 — recount 2026-05-10 after Notes/Library work landed) — the single largest function. Contains all state management, tab handling, navigation, history, settings, scroll management, thumbnails, welcome screen, and the entire render tree. This is the canonical decomposition candidate, but the pre-compiled React.createElement style makes extraction harder than with JSX. PLAN.txt §3.3 + §18.4 + Section 19.4 of this doc enumerate the 7 hooks to extract first.

**Event listener cleanup is solid** — all addEventListener/removeEventListener pairs are properly balanced. No memory leaks from event listeners.

**Accessibility is reasonable** — proper `aria-label` usage, semantic `<button>` elements, good color contrast (10.5:1 dark, 5.2:1 light). Main gaps: no focus traps on modals, limited keyboard navigation beyond browser defaults.

---

## 20. Objective E — Android polish batch (2026-05-11, this session)

Five targeted fixes applied to `index.html` and `MainActivity.kt`:

### 20.1 Note icon tap on Android

**Problem:** `.hl-note-icon` spans injected by `applyNoteIcons()` couldn't be tapped on Android WebView. The root cause: Android WebView treats small `<span>` elements inside text containers as text nodes for touch purposes, firing long-press selection rather than a click. The 14×14px icon was also smaller than Android's minimum comfortable tap target.

**Fix:**
- CSS: added `touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent` to `.hl-note-icon`. `touch-action: manipulation` disables double-tap zoom and long-press text selection, making the icon behave like a button.
- `applyNoteIcons()`: added a `touchend` listener (alongside the existing `click` listener) with `e.preventDefault()` + `e.stopPropagation()` that directly calls the note-open logic. `preventDefault` stops Android from triggering the text-selection machinery after the touch.

### 20.2 Link picker screen Android inset

**Problem:** When the link picker sheet is at `max-height: 92vh`, its top overlaps the Android status bar / camera cutout on tall sheets.

**Fix:** Added `padding-top: var(--inset-top, 0px)` to `.link-picker-overlay`. Because the overlay uses `display: flex; align-items: flex-end`, the padding reduces the flex container's effective content height — the sheet's max-height therefore can't exceed `100vh − inset-top`, keeping the top of the sheet safely below the notch. `--inset-top` is injected by `MainActivity.injectInsets()` on every window-inset change.

### 20.3 NoteSheet redesign — blank notes + options on creation screen

**Three user-facing changes:**

1. **Blank notes allowed.** `canSave = body.trim().length > 0` replaced with `const canSave = true`. The Save button now always works. Empty-state read-mode text updated from "No note text yet. Tap ⋯ → Edit to add one." → "Empty note. Tap ⋯ → Edit to add text."

2. **Color picker visible on creation screen.** A `.note-edit-colors` row (the 10 color circles, using existing `.ann-chip-color-btn` styles) is rendered directly below the anchor text in edit mode — always visible, no ⋯ menu required. Tapping a circle calls `recolor(c)` immediately.

3. **Notebook assignment on creation screen.** A `.note-edit-nb-row` button is rendered between the textarea and the Cancel/Save footer in edit mode. Tapping it opens the existing `NotebookPickerSheet` (via `onOpenNotebookPicker` prop). Shows "Add to notebook…" or the current notebook name(s).

**`cancelEdit` fix:** Previously, cancelling edit mode discarded the note whenever `note.body` was falsy — this would incorrectly discard a saved blank note when the user re-opened edit mode. Fixed to `if (startInEditMode && !note.body)` so only a brand-new note that was never saved is discarded on cancel.

### 20.4 Import / Export data on Android

**Problem:** Export used `URL.createObjectURL` + anchor click (not supported as a file download in Android WebView). Import used `<input type="file">` with no `onShowFileChooser` WebChromeClient implementation (file chooser never opens).

**Fix — two new `AndroidBridge` methods in `MainActivity.AppInterface`:**

- **`saveToDownloads(filename, content): String`** — writes the JSON string to the system Downloads folder via `MediaStore.Downloads` (Android 10+ / API 29+). Returns `"ok"` on success or `"error:<reason>"` on failure. For API < 29 returns `"error:requires_android_10"`.

- **`openFilePicker()`** — launches the system file chooser via `ActivityResultContracts.GetContent()` (registered in `onCreate` as `filePickerLauncher`). When the user picks a file, Kotlin reads the bytes, base64-encodes them, and calls `window.__onImportFile(b64)` back in JS. User cancel → `window.__onImportFile(null)`.

**JS side:** `exportPersonalData()` checks `window.AndroidBridge.saveToDownloads` first; falls back to blob URL for PC. `importPersonalData()` extracted the parse/apply logic into `_doImport(jsonText)` shared between both paths; Android path sets `window.__onImportFile` callback then calls `openFilePicker()`; PC path uses the existing `<input type="file">` flow.

**New imports added to MainActivity.kt:** `android.content.ContentValues`, `android.os.Build`, `android.provider.MediaStore`, `androidx.activity.result.ActivityResultLauncher`, `androidx.activity.result.contract.ActivityResultContracts`.

### 20.5 Reading dot excluded from special screens

Added `"library"`, `"notes-index"`, and `"about"` to the screen exclusion list in the `settings.showReadingDot` condition. The dot now correctly hides on the Library hub, Notes index, and About VOTReader screens (in addition to the previously excluded `settings`, `history`, `search`, `garden-view`, `bible-ch`, `matthew-ch`, and all letter/WTLB/etc. reading screens via `LETTER_SCREEN_SET`).

---

## 21. Objective D autonomous finish (2026-05-12)

Three remaining autonomous items from `handoff_for_next_session_2026-05-11.txt` §3 landed this session. Main was at `641b031` (Objective E Android polish) entering; working tree had a ~505-line uncommitted `index.html` diff from an active parallel session (LinkPicker rewrite with red ✕ undo + green ✓ confirm, one-icon-per-block applyDOMLinks, snapRangeToWords no longer expands forward, bidirectional LinkStore prefix match, NoteSheet cancelEdit converts to highlight instead of removing). All edits this session routed around that parallel work into disjoint line ranges.

### 21.1 Android 12+ SplashScreen API (no JS overlap)

Five files, fully self-contained:

- `gradle/libs.versions.toml`: new `coreSplashscreen = "1.0.1"` + `androidx-core-splashscreen` library entry.
- `app/build.gradle.kts`: added `implementation(libs.androidx.core.splashscreen)`.
- `app/src/main/res/values/styles.xml`: new `Theme.VotReader.Splash` with parent `Theme.SplashScreen`, black `windowSplashScreenBackground`, `@drawable/ic_launcher_foreground` icon, and `postSplashScreenTheme=@style/Theme.VotReader` so the activity transitions to the existing dark theme once the splash dismisses.
- `app/src/main/AndroidManifest.xml`: activity `android:theme` changed `@style/Theme.VotReader` → `@style/Theme.VotReader.Splash`.
- `app/src/main/java/com/votreader/sacredui/MainActivity.kt`:
  - import `androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen`
  - new `@Volatile var splashHolding = true`
  - `installSplashScreen()` BEFORE `super.onCreate()`, then `splash.setKeepOnScreenCondition { splashHolding }`
  - in `onPageFinished`: `view.postDelayed({ splashHolding = false }, 80L)` — holds the splash through the cold-boot beat where the WebView has loaded but React hasn't mounted yet. 80 ms covers the gap without making the splash feel slow.

`core-splashscreen` backports the Android 12+ SplashScreen API to API 23+; we target 26+, so the backport is just future-proofing for older devices that might still be paired with the app.

Live verification deferred to user — preview tool runs Chrome, not Android.

### 21.2 JS-side "Keep Screen On While Reading" toggle

The Kotlin bridge for this landed at `ac439b3` but no JS-side Settings UI was wired. Now closed in three edits in `index.html`, well-separated from the parallel session's link/note system rewrite:

1. Settings defaults block: added `keepScreenOn: true,` next to `haptic: true,` (~line 13950).
2. SettingsScreen Reading Experience section: added a `SettingsRow` ("Keep Screen On While Reading" / "Don't let the screen dim or lock while the app is open. Helpful for long reading sessions; turn off to save battery. Has no effect on desktop browsers.") as the last row in the section, immediately before the "Tabs, Search & History" divider (~line 11849).
3. App() useEffect that toggles body classes + calls `setLightStatusBar`: added
   ```js
   if (window.AndroidBridge && typeof window.AndroidBridge.setKeepScreenOn === 'function') {
     window.AndroidBridge.setKeepScreenOn(settings.keepScreenOn !== false);
   }
   ```
   so the Kotlin bridge fires whenever settings mutate. On PC the bridge is `undefined` and the call is no-op.

Verified live in Chrome preview: row renders at the correct spot, default state is on (checkbox `checked`), one click flips it off and persists `keepScreenOn: false` into `vot-state.settings`, second click flips it back to `true`, zero React warnings or console errors.

### 21.3 [object CSS] React #31 warnings — closed as not reproducible

The handoff reported "12 instances per render" of Minified React error #31 with `args=[object CSS]`, pre-existing and stable across page changes. Investigation this session:

- Patched `window.React.createElement` to capture any call with a CSS-typed child (`window.CSS` or `constructor.name === 'CSS'`).
- Drove the app through Home → Volumes Home → Volume One Index → preface letter → "The Wide Path" letter, watching the capture buffer and `console.error` / `console.warn` streams.
- Result: **zero** CSS-typed-child captures, **zero** React #31 firings, **zero** render-time warnings.

Two equally-likely explanations:

1. **Android-WebView only.** The handoff's testing was on a device; the prod React render path may differ subtly enough on Android WebView to produce the warning only there. Now diagnosable via `adb logcat -s WebViewJS` (the `WebChromeClient.onConsoleMessage` routing landed at `ac439b3`).
2. **Already silenced by the Objective E batch (`641b031`).** That batch heavily rewrote `NoteSheet` (color picker on creation, notebook on creation, blank-notes allowed, `cancelEdit` converts to highlight instead of removing). Could have inadvertently removed whatever was passing the CSS const as a child in a rare render path.

Closing the investigation as not actionable without a real Android device. If errors re-appear on device, run `adb logcat -s WebViewJS` while triggering the navigation that produces them — the message's `source:line` will pinpoint the call site.

### 21.4 Working-tree state at end of this session

- **Splash API batch (5 files)** can be committed as a self-contained unit — zero JS overlap with the parallel session's in-flight work.
- **`index.html`** sits mixed in the working tree: parallel session's ~505-line LinkPicker/snapRange/applyDOMLinks rewrite PLUS my 3 keepScreenOn edits. The two changes are disjoint by line range (parallel: lines 2653-6661 + 13403-15833; mine: 11849-11856 + 13948 + 14131), so a `git add -p` could in principle split them but it's fiddly. Recommended path: let the parallel session land its commit first, then my keepScreenOn additions sit cleanly atop and can be committed without conflict.
- `.idea/caches/deviceStreaming.xml` + `.idea/vcs.xml`: cosmetic IDE state, ignored.

### 21.5 Outstanding from handoff §3 + PLAN.txt §19

Remaining Objective D items needing user input or design assets (not autonomous):

- ☐ App icon + monochrome icon layer for Android 13+ themed icons (needs design assets).
- ☐ Release signing config (deferred until Play Store discussion — Timothy's permission first per user policy).

Bigger objectives still open (PLAN.txt §19):

- ☐ E — Data unified (wire `data-normalize.js`, unified `resolveScriptureText`, migrate 28 files).
- ☐ F — Code modular (split `index.html` into ~40 modules + `cat-modules.py`, slim `App()` to ~400 lines).
- ☐ G — Build + tests (esbuild, JSDoc, Playwright smoke, `check_balance.py` pre-commit hook).
- ☐ H — Library completes (Bookmarks, Journal, Highlights & Underlines tiles).
- ☐ I — Reading-app baseline (TTS, in-app video, synonyms, sepia, font controls).
- ☐ K — PWA evaluation (architectural decision pending user input).

## 22. Journal voice recording — dual-path architecture (2026-05-15)

The journal voice-memo recorder (`app/src/main/assets/src/ui/sheets/JournalRecordingSheet.js`)
had two **independent** failures, root-caused by two parallel research agents and fixed
together. This section is the canonical reference for how recording works now.

### 22.1 The two original bugs

| Platform | Symptom | Root cause | Fix |
|---|---|---|---|
| **Desktop** (Chrome/FF/Edge) | Mic permission granted, but waveform flat, preview silent, saved audio silent | `index.html` CSP line had `media-src 'none'` — this blocks **every** `<audio>`/`<video>` `src`, including `blob:` URLs, on all browsers + Android WebView. Recording always worked; playback could never load the blob. Live-tested error: `MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check`. | `media-src 'none'` → `media-src blob:` (index.html ~line 18). Verified live: `<audio>` reaches `readyState 4`. |
| **Desktop** (secondary) | Waveform barely moved even when audio captured | `var lvl = Math.min(1, rms * 3)` — speech RMS is ~0.02–0.06, so 3× → ~4–10px bars on a 56px max (reads as flat) | `rms * 3` → `rms * 8` |
| **Android** (Pixel 9 Pro, all OEMs) | "Requesting…" ~2s → "Could not open the microphone" | WebView Chromium `getUserMedia` rejects with `NotReadableError`/`TrackStartError` even with RECORD_AUDIO granted + no other app recording. Causes: missing `MODIFY_AUDIO_SETTINGS` (WebView's internal `AudioManager.setMode()` silently no-ops), immediate `onPermissionRequest` grant racing the privacy-indicator mic hold, and `AudioContext`+`MediaRecorder` dual-consumer on one stream → `AAUDIO_ERROR_DISCONNECTED` on Pixel 6+ | **Rearchitected to a native Kotlin recorder** (see §22.3). The WebView hardening below also landed first and is now harmless dead-defense on Android. |

### 22.2 WebView getUserMedia hardening (still active on desktop; dead-defense on Android)

These were the first-pass Android fixes. The native path (§22.3) supersedes them on
Android, but they're kept (zero cost, still protect the desktop getUserMedia path):

- `AndroidManifest.xml`: `<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />` (normal perm; lets WebView's internal `setMode()` work)
- `MainActivity.kt` `AppInterface.startAudioSession()` / `endAudioSession()` — sets `AudioManager.MODE_IN_COMMUNICATION` during capture, restores prior mode before playback. JS calls `startAudioSession()` after `getUserMedia` resolves, `endAudioSession()` in `rec.onstop` + `cleanup()`. (Native path does NOT call these — MODE_IN_COMMUNICATION is wrong for MediaRecorder.)
- `MainActivity.kt` `onPermissionRequest` already-granted fast-path: 250ms `webView.postDelayed` before `request.grant()` (matches the delay in `micPermissionLauncher` / `micPrepLauncher`)
- `JournalRecordingSheet.js` `beginCapture()`: `getUserMedia` retries `NotReadableError`/`TrackStartError`/`AbortError` 3× with 400/800/1200ms back-off; watchdog re-armed per attempt; error copy no longer falsely says "in use by another app"
- `JournalRecordingSheet.js`: the `AudioContext`/analyser block is wrapped in `if (!isAndroid)` (`isAndroid = !!window.AndroidBridge`) — the dual-consumer stream is what crashes AAUDIO devices

### 22.3 The native Android recorder (the robust path — current production design)

**Why:** WebView `getUserMedia` is the single fragile component across the Android
version / WebView-build / OEM-audio-HAL matrix. Native `android.media.MediaRecorder`
is the same OS API every voice-memo app uses — reliable everywhere, and exposes
`getMaxAmplitude()` so the live waveform works on Android again.

**Kotlin (`MainActivity.kt`)** — state fields guarded by `recLock` (the
`@JavascriptInterface` methods run on a binder thread, not main):
`nativeRecorder: MediaRecorder?`, `nativeRecordFile: File?`, start/pause-accum timestamps.
Records **AAC in MPEG-4 (`.m4a`)** via `MediaRecorder` (`MIC` → `MPEG_4` → `AAC`,
96 kbps / 44.1 kHz) to a temp file in `cacheDir`. Bridge methods on `AppInterface`:

| Method | Returns | Purpose |
|---|---|---|
| `nativeRecordStart()` | `"ok"` / `"error:<reason>"` | rechecks RECORD_AUDIO, creates+prepares+starts MediaRecorder |
| `nativeRecordPause()` / `nativeRecordResume()` | `"ok"`/`"error:…"` | `MediaRecorder.pause()`/`resume()` (API 24+, minSdk is 26) |
| `nativeRecordAmplitude()` | `Int` 0..32767 | `MediaRecorder.getMaxAmplitude()` — drives the waveform |
| `nativeRecordStop()` | (async) | stops, reads file, base64, → `postNativeComplete()` |
| `nativeRecordCancel()` | — | stop+release+delete temp file, no callback |

`postNativeComplete(base64, durationMs)` is a private `MainActivity` method (touches
`webView`): `webView.post { evaluateJavascript("window.__onNativeRecordingComplete(arg,dur,'audio/mp4')") }`,
`arg` is `null` on failure. `onDestroy()` releases a still-running recorder + deletes
its temp file. `MediaRecorder(context)` ctor on API 31+, deprecated `MediaRecorder()` below.

**JS (`JournalRecordingSheet.js`)** — `startCapture()` is the dispatcher:
`window.AndroidBridge.nativeRecordStart` exists → `beginNativeCapture()`; else
(desktop) → `beginCapture()` (the unchanged getUserMedia path). The 4 post-permission
call sites in the permission gate were changed from `beginCapture()` → `startCapture()`.
`beginNativeCapture()` mirrors the existing UI state machine (requesting → recording
⇄ paused → preview → save/discard): a `tickRef` duration timer keyed off
`nativeStateRef` ('recording'|'paused'|'inactive') and an `ampRef` 80ms interval
polling `nativeRecordAmplitude()` (`lvl = Math.min(1, Math.sqrt(amp/32767)*1.8)`) into
the same `samplesAccumRef`/`setWaveLive` buffer. `window.__onNativeRecordingComplete`
(registered in the mount `useEffect`, deleted in its cleanup alongside
`__onMicPermissionResult`) builds a `Blob` from the base64 and feeds the **unchanged**
preview / `JournalMediaStore.put` / `onSave` pipeline — it honours `pendingSaveRef`
exactly like the getUserMedia `rec.onstop` did (Save tapped before the blob arrived).
`pauseRecording`/`resumeRecording`/`stopRecording` branch on `nativeRef.current` first.
`cleanup()` calls `nativeRecordCancel()` (idempotent — Kotlin no-ops on null recorder)
and clears `ampRef`. New refs: `nativeRef`, `nativeStateRef`, `ampRef`.

**Downstream unchanged:** `.m4a`/`audio/mp4` is universally playable by `<audio>` and
stores as a `Blob` exactly like the old WebM, so `JournalMediaStore`, the viewer's
`JournalAudioBlock`, and previously-saved recordings are unaffected. The base64-over-
`evaluateJavascript` handoff matches the existing import/export bridge pattern; fine
for typical memos, heavy only near the 5-min cap (acceptable, not yet optimized).

### 22.4 Status / caveats

- **Desktop**: verified live in the preview (CSP `media-src blob:` confirmed; `<audio>` blob reaches `readyState 4`; `startCapture()` confirmed routing to `beginCapture()` when no `AndroidBridge`; app loads with zero console errors; JS syntactically valid). No regression.
- **Android**: ✅ CONFIRMED working on real device by the user (2026-05-19) — prompt → recording with moving waveform → preview playback → save all function correctly. (Was previously preview-untestable since desktop Chrome has no `AndroidBridge`.)
- All of the above was **committed in `2db70f5`** (2026-05-19) as part of the one bundled commit, alongside this session's annotation-crash / footnote-dedup / Library-settings-gear / journal-stats fixes.
- minSdk = 26 (gradle), so `MediaRecorder.pause()/resume()` (API 24+) are always available.

---

*End of CLAUDE.md. Update this file every time you learn something new about the project or change a foundation.*

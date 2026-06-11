# HISTORY.md — Landed work log

Append-only record. Read when you need context on past decisions. Not required for routine work. For the current briefing, see CLAUDE.md. For deep system reference, see ARCHITECTURE.md.

---

## Collapsed-poetry excerpt display — one normalizer, every surface (2026-06-11, on main)

Owner report (device screenshot): the INLINE note sheet still showed a stored poetry excerpt with the lines collapsed ("…loins,And become…be;Stand firm…waver;Draw very close…") — the same class fixed for the notebook list in `8469f3b`, where the display-normalize landed ONLY in `NoteRow` as an inline regex. Records captured before the TreeWalker capture fix persist in user data, so every render surface needs the transform.

- **New `utils/excerpt-display.js` — `normalizeExcerptDisplay()`** (the proven NoteRow regex: insert a space after `,;:!?` followed by an uppercase letter; `.` deliberately excluded so "U.S." never splits). Pure helper, ESM-imported — inlined into both bundle-b (journal-helpers) and bundle-d (sheets/screens) graphs; no new window global.
- **Wired at every surface that renders stored user-captured excerpt text**: `NoteSheet` (the reported inline sheet anchor), `NoteRow` (inline regex folded into the helper), `MultiNotePopover` preview, `HighlightsScreen` group text, `JournalInsertSheet` note-picker anchor/label + its search haystack (so a spaced query matches collapsed records), `journal-helpers.resolveNoteCard` + `resolveLetterCard` (journal note/letter-excerpt cards), `BookmarkCreateSheet` excerpt. Plus the two WRITE-time sites that bake annotation `ann.text` into a fresh note's `fullText` (`SelectionToolbar` note-create, `AnnotationActionChip` convert-to-note) so old collapsed segment text can't seed new records.
- **Deliberately NOT normalized**: stored link/nav excerpts and `pendingHighlight` needles — `b.excerpt` doubles as the tap-through DOM-match needle (`highlightExcerptInDom` searches the letter DOM, whose poetry `textContent` IS collapsed); normalizing the stored value or the matcher input would break excerpt tap-through. Display-only at the card render (`resolveLetterCard` body), raw everywhere it anchors/matches. Corpus excerpts (`seeAlso`, study notes, verse blocks) are single-block sources — out of scope.
- **Tests + gates**: `excerpt-display.test.js` (6 cases incl. the exact reported string + idempotence + abbreviation guard); **2170** vitest, lint 0/0, typecheck, build green.

---

## Exact scroll-position memory — nav-time capture + content-visibility-aware restore (2026-06-10, on main)

Owner report: "go to next letter then back, sometimes my position is lower or higher than I left it. It should be EXACTLY as I left it." Two independent bugs in `use-scroll-memory.js` produced the one symptom (letters hit hardest; same code serves Bible/Matthew/WTLB/studies):

- **Nav-time capture race (the primary bug).** Position was captured ONLY by a 120 ms idle-debounced scroll listener; no navigation path flushed it (only `goTabs` did). Navigating inside the debounce window — tap "next letter" while the fling is still settling, routine on touch — lost the final position: by the time the pending timeout fired, `scrollKeyRef` had moved to the new key, so the old screen kept its last *completed* capture (drift in whichever direction the un-captured scrolling went). Fix: `liveScrollRef` stamps `{key, y, pct}` on EVERY scroll event (ref write, no re-render); the restore layout effect commits it for the key being LEFT before the new screen restores. Guards: in-tab nav only (tab switches flush via `goTabs`; a nav-time commit there would write the old tab's position into the new tab through the rebound `updateActiveTab`), and the stash key must match the key being left (a stale stash from two screens back can't leak onto a screen the user never scrolled).
- **PERF4 `content-visibility` restore drift.** `.letter-para` / `.section-block` are `content-visibility:auto` with placeholder `contain-intrinsic-size` estimates (140px/500px). A saved `y` was measured against REAL layout (the user scrolled through it), but the restore landed it against ESTIMATED geometry; when the browser lazily rendered the skipped blocks (~1–2 s later), scroll anchoring dragged the position to follow the wrong content. Preview-measured on a letter: left 400 → restored 400 → drifted to 478 at ~2 s. Fix: during a non-top restore, `body.scroll-restoring` (app.css) lifts the content-visibility so `scrollTop` lands against real heights, held across one PAINTED frame (double-rAF release) so `contain-intrinsic-size:auto` memoizes the real sizes first — a pre-paint release re-engages cv against stale estimates and anchoring drags the position (measured +614px on a revisited Psalm 119 whose section nodes React had re-created). Releasing after the painted frame = zero geometry change. Top restores skip the force (top is top in any geometry). PERF4's win (cold open, steady scrolling) is untouched; a restore pays one full-layout frame.
- **Tests + verification.** New `use-scroll-memory.test.js` (11 cases, RED-first: the nav-race case failed pre-fix with the stale capture) — exact capture inside the debounce window, next-letter-then-back round-trip to the pixel, stale-stash + tab-switch guards, restore (new shape / legacy number / to-top), `scroll-restoring` lifecycle incl. painted-frame hold + cleanup-on-unmount. Preview-proven on the real corpus: Volume One "Chosen by God" → scroll 400 → next inside the window → back = **400 exactly, stable 3.4 s** (was 478). Gates: lint 0/0, typecheck, **2158** vitest, build. No CORPUS_VERSION bump (no corpus data touched; CACHE_VERSION auto-rehashed).

---

## Sticky word/punctuation highlighting + verse-number exclusion + cross-line italic fix (2026-06-10, on main · `a91ed55`)

Owner request: make highlighting on Android feel "sticky/grippy" — hard to highlight half a word, and don't let a highlight drift over a word's end to grab a trailing comma/colon/period ("mostly just words highlight"); keep verse numbers out of annotations while still raising the menu; and fix a literal-underscore "underline" appearing in some reading text.

- **`snapRangeToWords` (annotation-engine.jsx) now snaps BOTH endpoints** out to whole words (was START-only, END left where released "by design") AND trims leading/trailing whitespace + punctuation. So a fresh highlight/underline/note can't land mid-word or include a trailing `, : . …` — an all-punctuation selection collapses to empty (every caller already bails on `start >= end`). Applied at every annotation/excerpt site (SelectionToolbar ×4, VersePicker, LetterExcerptPicker) since they all funnel through this one function. The `dom-links` note-icon slide-off (which compensated for a mid-word END) is now a near no-op but stays as defense for the adjacent-inline-element case. This is the durable artifact the user sees — the *committed* mark is always whole-word; the transient native blue-handle drag is unchanged (live-snapping the WebView handles mid-drag would be Android-specific and is deferred to a device walk).
- **Verse numbers excluded from annotations.** Already structural — `.verse-num` renders OUTSIDE the `[data-hl-key]` container in every verse path (Bible / Matthew-study), so the offset range can never cover it (a selection starting on the number computes `start = 0` of the scripture text via the `container.contains` guard). Added: SelectionToolbar strips `.verse-num` from the selection's extracted text too, so copied/searched/bookmarked text is number-free, while the menu still raises on the scripture selection. Verified live on Genesis 1: a selection grabbing the gold "1" + mid-word "beg" committed a highlight of exactly **"In the beginning"** (number excluded, word snapped whole).
- **Cross-line italic/bold render fix (the "underline" bug).** `WtlbEntryView.renderLine` parsed Format B **per line** with `_.*?_` (and `.` excludes `\n`), so an `_italic_`/`**bold**` span whose closing marker sat after a soft line break never paired — leaving literal underscores on screen (The Blessed: `_Blessed are those given and received in marriage, \n Who keep My Commandments..._`). Now parses the **whole paragraph** via a new pure `splitFormatBInline()` (`utils/format-b-inline.js`) matching across newlines (`[\s\S]*?`), turning soft breaks into `<br/>` inside the emphasis span. Fixes all **9** cross-newline spans across The Blessed / WTLB One / WTLB Two / Holy Days — preview sweep confirms **0** leftover markers across all **360** Format B entries; the nested bold-in-italic-across-breaks intro renders correctly too.
- **Tests + gates.** New `format-b-inline.test.js` (cross-newline pairing, lazy per-line pairing, ref/nav/attribution capture); expanded `snapRangeToWords` cases (end-snap, comma/colon/ellipsis trim, hyphenate-whole, leading-trim, surrogate-safe). **2147** vitest pass; build + lint(`--max-warnings 0`) + typecheck + `smoke:ci` (`wtlbAnn ok`) green. No CORPUS_VERSION bump (renderer change, corpus data untouched; SW CACHE_VERSION auto-rehashed). Live-verified in preview throughout.

---

## WebView floor lift + audit close-out + R8 minify + W10-lite a11y (2026-06-03, on main)

A single session that drove the post-audit tail to completion: verified + landed the last native audit items, retired the Chromium-69 WebView floor, turned on release minification, modernized CI, and did a lite accessibility pass. Every commit is on main and CI-green. The audit detail lives in **AUDIT-PLAN.txt**; this is the HISTORY landmark.

- **PILE B / AUDIT-PLAN — FULLY RESOLVED.**
  - **N4/N6/N7/N8** (`2520f5b`) — Kotlin native robustness. **N4**: reset `vm.currentScale=1f` after `restoreState()` + the crash-recovery rebuild (the ViewModel survives an Activity recreate but the fresh WebView is 1.0×, so a stale scale would make the screenshot path's `zoomBy(1f/scale)` un-zoom a 1.0 view). **N7**: `AtomicBoolean` single-flight on `captureScreenshot` (a concurrent binder call returns `""` at once; `try/finally` releases on timeout/throw). **N8**: retry-view logs `Timber.w` (expected recovery, not an error) + documents the detached-but-live webView — the reference is KEPT (the audit's "park it" would break the rebuild-first `webViewProvider`). **N6**: ProGuard keep rules for `JsEvent$*` + `BoundedLogTree$LogEntry`. Verified: code-read + forced Kotlin recompile + `:app:testDebugUnitTest`, then the vot_api28/WV69 emulator over CDP (`getZoomScale()==1` across a forced destroy→`restoreState` cycle with the process/ViewModel surviving; two sequential `takeScreenshot` both return ~94 KB = the single-flight releases).
  - **PF3 — DROPPED** (no scroll-jank on real devices; IntersectionObserver windowing risks the load-bearing scroll-to-verse / scroll-memory path for a theoretical gain; `content-visibility:auto` is the cheap fallback now the floor allows it). **UX9 — ADJUDICATED** (the proposed denylist→allowlist is the inverse set; per-tab resume is a tab-schema redesign not worth the risk for a recoverable nit). AUDIT-PLAN is now every P0–P3 item DONE or adjudicated-with-reason.
- **WebView floor lifted chrome69 → chrome108** (`1a7ae7f`; eslint-globals regen `594cdd8`). Owner call: the chrome69 floor was a *theoretical* device — the app is personal (sideloaded to modern auto-updating-WebView phones + a PWA on evergreen browsers), so it cost real syntax/feature/velocity tax for no reachable user. `--target` chrome69→chrome108 on build:b/c/d/e/css + the corpus minify; the now-native boot polyfills (`globalThis` C71 / `Promise.allSettled` C76 / `Promise.any` C85) removed → CSP script-src 9→8 hashes + globals regen (410→409). **Permanent Rule 6 rewritten**: the floor is now a chrome108 RUNTIME-API contract — esbuild still transpiles too-new *syntax* down, but a runtime API newer than C108 still needs a feature-guard. The `vot_api28`/WV69 emulator black-screens BY DESIGN now; the verification floor moved to desktop Chrome (`smoke:ci`) + a modern-WebView emulator. Corpora byte-identical (pure data minify) → no CORPUS_VERSION bump. Verified: build + `smoke:ci` + live preview (all formerly-polyfilled APIs native). **Deliberately NOT done:** no bulk `?.`/`??` rewrite (organic as files are touched); the v3-backup `FileReader` 512 KB-slice path LEFT ALONE — the tempting `Blob.arrayBuffer()` swap would load whole GB-scale blobs into heap (OOM); only `Blob.stream()` preserves the chunking, and that's purely cosmetic on live backup-integrity code.
- **R8 minification (N2.1b) + isShrinkResources** (`b8a15db`, `7e8a713`) — closes N6. `isMinifyEnabled=true` then `isShrinkResources=true` on the release build. Validated: R8 build clean (`minifyReleaseWithR8` + `lintVitalRelease`); `mapping.txt` confirms `AppInterface`'s `@JavascriptInterface` methods + `JsEvent$*` + `BoundedLogTree$LogEntry` map to SELF (unrenamed = the N6 keep rules work under R8); a NEW modern emulator (`vot_api34`, WebView Chromium 113) boots + renders + navigates the minified+resource-shrunk release with 0 crashes/bridge errors. APK 27.7 → 19.98 MB.
- **GitHub Actions → Node-24** (`de9715d`) — GitHub forces Node 24 on 2026-06-16 / removes Node 20 on 2026-09-16. Bumped all 13 `uses:` across both workflows to their current majors (verified via the GitHub releases API): checkout v6, setup-node v6, cache v5, setup-python v6, setup-java v5, gradle/actions/setup-gradle v6, upload-artifact v7; Pages: configure-pages v6, upload-pages-artifact v5, deploy-pages v5. Stable inputs only → behavior-compatible; validated by the push running BOTH workflows green on Node 24.
- **W10-lite accessibility** (`0692791`) + **WCAG contrast audit/fix** (`8b6e29e`). The a11y baseline was already strong (125 aria-/role across 42 files, global `:focus-visible`, `role=status`+`aria-live` toasts, alt text). W10-lite added `prefers-reduced-motion` (global `@media reduce` at 0.01ms so `transitionend` still fires) + `aria-label` on the glyph-only icon buttons whose accessible name was a bare symbol (the welcome ✕; the ‹ "Back" in AnnotationActionChip ×2 + NoteSheet). The contrast audit computed every text/bg ratio: the default dark theme is AA-clean (gold 12:1, body 21:1), and the light theme's `--link-blue` was darkened `#4a90b8`→`#387493` (3.15→4.60:1) to clear AA-normal. Result: AA-compliant reading text in BOTH themes; the gold passed as-is. Full W10 (TalkBack/VoiceOver device sweep, modal focus-traps) remains optional.

---

## Audit PILE A close-out + poetry-spacing fix (2026-06-03, merged to main)

Two independent tracks landed + merged this session. The audit detail lives in **AUDIT-PLAN.txt** (the canonical tracker); this is the HISTORY landmark.

- **AUDIT-PLAN PILE A — CLOSED.** The Pile A set was SOURCE-VERIFIED FIRST by a 16-agent read-only pass (which caught several audit-suggested fixes that were wrong or already-done), then landed one focused, fully-gated commit each: UX5, UX4+UX10, E5, T7, E4, F3, P7pwa, F1+F2, CQ6, T5, UX1+UX2 — plus 3 ADJUDICATED-with-reasoning (J7 premise-inactive: no save-while-recording trigger exists; CQ5 net-negative: app.jsx canary + a checkJs error-flood; PF4 net-negative: a naive `null window.BIBLE_*` reverts the Bible to NKJV). The final two, owner-approved:
  - **A1+A5** (`17f6348`) — note icons on the React verse path. `applyNoteIcons` splitText-injected into the LIVE React verse DOM (Bible/Matthew) = a latent `NotFoundError`. Upgraded past BOTH the audit's verse-end sibling AND the scope-only regression: `HighlightableText` now renders the icon INLINE at the note-group's last segment (`renderNoteIcon`) — EXACT phrase-end placement, React-owned (no imperative mutation); `applyNoteIcons` scoped to `[data-hl-dom]` (letters stay StaticSubtree-frozen, unchanged). Dual-render equivalence test stays green; +3 tests; verified live on Genesis 1 (icon lands immediately after the highlighted phrase, 0 console errors).
  - **PF6** (`0ca8ce4`) — code-split Settings/Search/Garden into a lazy **bundle-e** (54 KB) via the existing `__makeLazyLoader` factory; **bundle-d 365→302 KB** (a boot-PARSE win — bundle-e stays SW-precached in CORE_ASSETS for offline, content-hashed, but NOT critical so a deploy hiccup degrades the screen to the retry affordance rather than aborting the SW install). App()'s 3 inline corpus subscriptions + the new bundle-e one folded into `useLazyBundles()` (App() 788→777, under the 800 canary). The route thunks fire the loader DURING render, so a cold boot restored straight INTO a lazy screen resolves too. +4 tests; preview (boot loads a/b/c/d only; lazy-load on nav; boot-into-lazy-screen) + headless `smoke:ci` PASS. **PILE A is now fully closed.**
- **Poetry-spacing fix** (`8469f3b`, a parallel conversation) — poetry blocks render each line in its own `<div class="poetry-line">`, but annotation capture read `container.textContent`, which concatenates the divs with NO whitespace — so a selection spanning a line break was stored as "loins,And". `SelectionToolbar.hlDisplayText()` now walks the container's text nodes via a TreeWalker and inserts `\n` whenever consecutive text nodes sit in different block-level parents (wired at all 4 annotation text-capture sites); `NoteRow` display-normalizes already-stored collapsed notes (inserts a space between punctuation and a following uppercase letter). Developed on branch `fix/note-bucket-poetry-spacing`.
- **Merge.** The two tracks touched DISJOINT source (annotation-engine + entry/routes/app.jsx vs. SelectionToolbar + NoteRow), so the merge conflicted only on the generated bundles — resolved by rebuilding from the merged source (both works coexist; vitest 1864 green across both). The original branch is preserved in the merge's history.

---

## Export/Import GB-scale streaming re-architecture (2026-06-02, COMPLETE P0–P5)

Owner directive: the backup path (the only backup mechanism) must handle GB-scale journal data — years of text + images + audio — safely, efficiently, enterprise-grade, **not** by lowering caps (the reframed AUDIT-PLAN S4) but by *streaming*, so peak memory is one media blob, never the whole payload. **Canonical tracker: BACKUP-STREAMING-PLAN.txt** (design, the format pivot, the 5-phase plan, the verification bar). This section is the HISTORY landmark only.

- **Format decision:** a bespoke length-prefixed binary container (exportVersion 3) — `"VOTBACK1"` magic + a JSON manifest (stores + media *metadata*) + raw length-prefixed media frames, **64-bit lengths (no 4 GB / ZIP64 wall)**, no base64 bloat. Chosen over a standard zip because >4 GB ("as much as the device can store") would force either hand-rolled ZIP64 (too bug-prone on the only-backup path) or a vendored zip lib (a dependency the project avoids); a dumb-simple framed format is 64-bit-native, dependency-free, and minimal-bug-surface — the real data-safety win here. Tradeoff: not openable by a generic zip tool (acceptable for a re-import-only backup whose spec lives in the repo).
- **P1 (landed):** `src/utils/backup-container.js` — `writeContainer` (streams; ≤1 MB slices, bounded memory) / `readContainer` (lazy `Blob.slice` per frame; verifies frame length vs the manifest's declared size; throws on truncation/mismatch/bad-magic/bad-JSON) / `isContainerMagic` (the legacy-vs-v3 import sniff) / `encode|decodeUint64BE` (the >4 GB length codec, no BigInt — chrome69-safe). +14 exhaustive round-trip tests (byte-exact over true binary, the 5 GB/17 GB length boundary, multi-chunk blobs, unicode manifests, every corruption guard). vitest 1754/71 `test:coverage` exit 0, tsc + eslint clean.
- **P1 complete — the pure v3 core (landed):** `buildV3Manifest` (export-side: builds the manifest of stores + media *metadata* + the ordered blob list) and `applyV3` (import-side: reseed LS, apply stores/flags validated, REPLACE media by streaming each frame's Blob straight to IDB — no base64, no S5 cap needed since streaming is bounded; U1 durability barrier; same return shape as `applyImportPayload`). Tested with the **full pipeline round-trip** — `buildV3Manifest → writeContainer → readContainer → applyV3` reconstructs stores + media **byte-exact**. The entire v3 core is built alongside v2 with `buildExportPayload`/`applyImportPayload` untouched; folding the shared store-read/apply is a tracked P5 cleanup. vitest 1763/71 `test:coverage` exit 0.
- **P2 web I/O (landed + preview-verified):** `PlatformBridge.openExportSink` (File System Access API writable → streams to disk; Blob-download fallback) + `pickImportFile` (FS Access open / `<input>` → File); `SettingsScreen` export wires `buildV3Manifest → openExportSink → writeContainer` (a `.votbak` v3 container) and import wires `pickImportFile → isContainerMagic sniff → readContainer + applyV3`, with the legacy v1/v2 JSON path folded in behind the same sniff (one shared confirm/degraded-guard/apply/reload helper for both). The Android branch stays on the proven v2 path until P3. `validateImportEnvelope` relaxed to accept the v3 media-array. **Verified in the real preview runtime over real IndexedDB:** the full build→write→read→apply round-trip is byte-exact, the real Export button writes a valid v3 container (seeded media byte-exact), and the real Import button applies a container's data to the store — Settings renders clean, zero console errors. (The OS file-picker dialog itself is a manual check; everything around it is automated.) vitest 1771/71.
- **P3 Android native (landed + EMULATOR-verified):** `StorageManager.kt` re-implements the SAME framed format in Kotlin over the SAF stream — `DataOutputStream.writeLong`/`readLong` are big-endian, **byte-identical** to `encodeUint64BE`, so a backup written on either platform imports on the other. Write: `beginV3Export`/`v3ExportWriteBlobHeader`/`v3ExportWriteChunk`/`finishV3Export` (frame accounting + overflow/incomplete guards; abort deletes the partial). Read: `beginV3Import` (magic-sniff → `"v3:"`<manifest> or `"legacy:"`<json>) / `v3ImportNextBlob` / `v3ImportReadChunk` / `closeV3Import` (truncation guard). A CHUNKED JS↔native bridge carries it: 10 `v3Export*`/`v3Import*` `@JavascriptInterface` methods (AppInterface) + `JsEvent.V3ExportReady`/`V3ImportReady` for the async SAF picker + `BridgeHost`/`MainActivity` SAF launchers (`CreateDocument` octet-stream / `OpenDocument`) stashing the chosen URI on `MainViewModel` (`@Volatile`). **base64 is the transient bridge encoding ONLY — never written to disk.** `platform-bridge.js` gains the 10 Android passthroughs (web throws — web uses `openExportSink`/`writeContainer`); `openExportSink`/`pickImportFile` are now documented WEB-ONLY (the WebView-69 floor lacks `Blob.arrayBuffer`/`.stream`, and a GB import can't expose a lazy random-access Blob, so native owns the framing). `SettingsScreen._exportV3Android` (FileReader ≤512KB slices → btoa → bridge) + `_importV3Android` (bridge → atob → reassemble) feed the SHARED `buildV3Manifest`/`applyV3` — import drives `applyV3` via an async-gen of `{id,meta,blob}`, so only the entry SOURCE differs per platform. Android export/import branches FLIPPED v2→v3. **SAFETY:** `applyV3` media replace reordered to FAIL-SAFE put-then-prune-stale — a truncated/corrupt container (reachable only on the Android stream; web `readContainer` pre-validates) can no longer wipe existing media (the manifest + every store are read atomically; only media frames can truncate, handled non-destructively). Kotlin tests (byte-exact framing, round-trip, truncation, legacy sniff) + AppInterface delegation + BridgeContract (+10) + JS contract. **Emulator-verified on vot_api28 (Chrome 69.0.3497.100, the Android 9 floor):** native write byte-exact to spec; cross-platform web↔Android byte-exact (incl. a multi-frame 7777 B + 3 B container); legacy v2 sniff (no old backup stranded); WV69 blob plumbing (FileReader slice / chunked btoa-atob / `Blob` concat) all correct; the **real** Settings Export button → `buildV3Manifest` over real IDB (17 stores) → SAF → valid container + "Backup saved." vitest 1792/71.
- **P4 caps + soft advisory (landed):** the hard caps existed only to dodge OOM, which streaming makes impossible — so the v3 path is now UNCAPPED on both platforms (`buildV3Manifest`/`applyV3` have no limit; S5's aggregate cap dropped on v3). The 50 MB caps (`WEB_MAX_IMPORT_BYTES`/`MAX_IMPORT_SIZE`) correctly REMAIN, now binding ONLY the legacy non-streaming whole-file v1/v2 read. In place of a hard refusal, a SOFT, advisory heads-up — `formatImportSpaceWarning(mediaTotal, navigator.storage.estimate())` (Chromium-61+ → works on WV69) — surfaces a NON-blocking note in the import confirm when the backup's media likely won't fit the device's remaining IDB budget. +5 vitest. vitest 1797/71.
- **P5 docs (this entry + CLAUDE.md current-state + BACKUP-STREAMING-PLAN.txt + AUDIT-PLAN.txt S4/S5 closure).** The v2 `buildExportPayload`/`applyImportPayload` stay exported (rollback + legacy-import path) but the active export wiring no longer calls v2.
- **P5 cleanup (landed):** folded the shared store-read between `applyV3` and `applyImportPayload` into three module-private helpers — `_reseedLsData` (LS shim reseed), `_applyStoresAndFlags` (v2-shape store/flag apply, skip-on-violation), `_awaitDurability` (the U1 barrier). Only the media step (v2 base64-decode vs v3 streamed frames) + `applyImportPayload`'s V1 fallback stay distinct. Behavior-preserving — the 36 `backup.test.js` cases (full pipeline, no-wipe-on-truncation, skip-invalid, write/import-failure tallies, both appliers) pass unchanged; verified end-to-end in the minified preview bundle. **The GB-scale backup re-architecture (P0–P5) is COMPLETE with nothing left open.**

---

## AUDIT-PLAN remediation — 7.5 → 8.5+ hardening (2026-06-02, ongoing)

A second deep adversarial audit (15 subsystem agents + 15 verification agents) rated the post-UPLIFT app 7.5/10 and produced **AUDIT-PLAN.txt** — the canonical, item-by-item tracker (~108 verified P0–P3 items) with a full commit-by-commit PROGRESS LOG. The 8.5 exit bar was met by Waves 1–4 (P0 data-loss/crash fixes, the search cluster, only-backup integrity + native audio, PF1 corpus minify) plus a large overnight batch (PF7, T2/T3, SE1–5, SC2–7, P1/P2pwa, B1/B5/B6/B8, A2, …). **Detail lives in AUDIT-PLAN.txt, not here** — this section is just the HISTORY-timeline landmark; per-item receipts (evidence, fix, gates) are in that tracker's PROGRESS LOG and per-item STATUS lines. The high-risk render/nav/storage items (F1/F2, A4, A1/A5, PF2/PF3/PF4, UX1–4, E4, E5 pt2) are explicitly DEFERRED for owner review.

**Safe-bucket items (owner coordinating, autonomous-OK):**
- **T4 DOM overlay placement coverage** — +25 tests pinning the `_insertLinkIconAt` / `_insertBookmarkIconAt` slide-off placement algorithm (dom-links.js / dom-bookmarks.js), the code that injects link-chain + bookmark-flag icons on every Android annotation render and was previously only exercised at clean word boundaries in bare `"Hello world"`. New cases cover mid-word + closing-punct slide, skip-element jump (adjacent / offset-lands-inside / skip-is-last-node → append), cross-text-node flow through inline `<em>`, the `<br>` block-stop, both end-of-block fallbacks, multi-offset placement, the dim legacy target-only link, the bookmark cross-overlay skip past an existing link icon, just-created pulse threading, the `!bkm.hlKey` guard, and removal-on-rerun when the stale icon is nested inside a `<mark>` (the real post-`applyDOMHighlights` DOM). Coverage dom-links 60/54/73/62 → 99/98/100/99, dom-bookmarks 63/52/75/66 → 98/90/100/99; per-file floors ratcheted in vitest.config.js (98/96/100/98 and 96/88/100/98). The only lines left uncovered are the unreachable `hasBlockBetween` defensive `return true` (always called with the next text node strictly after the previous in document order). Gates: vitest 1738/70 full `test:coverage` exit 0 (per-file + aggregate floors held), eslint clean; no app/bundle/data/inline-script touched so build/smoke/typecheck were unaffected. (Post-push, the build job hit the known-flaky smoke:ci runner hang — CDP `Runtime.callFunctionOn timed out` at the full 600s, same as `921b00a`; proven transient — smoke:ci passes locally in 18s with 0 crashed / 0 console.error, and a test-only change can't touch the render walk — and a build-job re-run went green.)
- **T6 data-gate test** — added `test_check_balance.py` (17 tests, stdlib `unittest` + `unittest.mock` — no new dep) covering the four `check_balance.py` detectors (brace/bracket/paren with string+escape awareness; en/em-dash-in-range vs ASCII hyphen vs prose separator; smart-quote-at-line-start vs smart-quote-in-value; `esprima_check` valid→None / unescaped-quote→error) plus `main()` driven end-to-end over a temp data dir (monkeypatched `DATA_DIR`/`DEFAULT_FILES`/`argv`, no real-data pollution) asserting exit 0 on a clean file and exit 1 on en-dash + unescaped-quote files. `check_balance.py` is the front-line black-screen/white-verse gate and had zero tests — a regression in it would silently stop catching the bug class the project fears most. Wired as a **real gate**: a new ci.yml build step pip-installs `requirements-dev.txt` (pins esprima), runs the unittest, and runs the gate over the real corpus — previously `check_balance.py` ran only in the pre-commit hook (bypassable via `--no-verify`), so en-dash/smart-quote contamination could reach main; CI now enforces it. Pre-commit Step 1c runs the unittest on gate-code changes. Verified: unittest 17/17, real-data `check_balance` ALL OK, ci.yml YAML parses, pre-commit `bash -n` clean.
- **smoke:ci flake fix** (owner-approved; not a numbered audit item) — the headless render-walk CI step intermittently hung the GitHub runner for the full `protocolTimeout` (`Runtime.callFunctionOn timed out`), forcing manual re-runs. `921b00a` had raised the ceiling 180→600s, but a hung runner consumes *any* ceiling (600s was hit on T4's push), so the ceiling was the wrong lever. Fixed at the root: `smoke-ci.js` now runs each attempt in a fresh browser (`runAttempt()`) and `main()` **retries a harness/CDP error up to 3× at a 240s ceiling, but never retries a genuine render failure** (`report.ok === false` is authoritative — retrying it would mask a real regression). Auto-recovers the transient hang. Verified locally: PASS on attempt 1/3, exit 0, 18.3s; `node --check` clean. (The hang isn't locally reproducible; the retry branch is verified by inspection — a thrown CDP error retries, a returned report does not.) CI green at `3c64107` — the smoke step logged `attempt 1/3 … PASS 18.5s`.
- **S5 import aggregate media cap** — `applyImportPayload` now sums decoded media bytes (`data.length*3/4`, the estimate `validateMediaRecord` uses) and stops decoding once the running total would exceed `mediaTotalLimitBytes` (new ctx option, default `DEFAULT_MEDIA_LIMIT_BYTES` = 100 MB — symmetric with the export-side total guard at `buildExportPayload`). Over-cap records are skipped and counted as `importFailures` (the S3 summary toast reports them), and the `base64→Blob` decode never runs on them, so it can't OOM. This is **defense-in-depth**: the raw import file is already ~50 MB-capped (CQ7's `WEB_MAX_IMPORT_BYTES`/`MAX_IMPORT_SIZE`) and our own export refuses backups over 100 MB total, so a legitimate backup never trips the cap — it guards the decode phase and any path that bypasses the file cap, on the only-backup surface ([[user-data-paramount]]). +2 `backup.test.js` tests (cap-hit stops at 2 of 3 records; default cap is a no-op for legit media). Gates: vitest 1740/70 `test:coverage` exit 0 (backup.js 87.6/77.5/100/91.6), tsc + eslint clean.
- **CQ7 + CQ8 hygiene comments** — CQ7: the 50 MB import cap is duplicated cross-language (`platform-bridge.js` `WEB_MAX_IMPORT_BYTES` ↔ `StorageManager.kt` `MAX_IMPORT_SIZE`); the web side already cross-referenced Android, so added the back-reference on the Kotlin side ("keep in sync") and marked `storage-health.js`'s coincidental 50 MB `CRITICAL_QUOTA_BYTES` as a *different* meaning (quota threshold, not the import cap) — do not unify. CQ8: documented the journal editor's `mood` as a deliberately read-only field (preserved across the save round-trip, no picker UI planned), replacing a speculative "likely a wiring gap / was never built" TODO with a definite design statement. Comment-only (esbuild minify strips them, so the bundles stay byte-identical).
- **SE7 vendored-lib provenance** — new `VENDORED-LIBS.md` (repo root) records the self-reported version, byte size, and sha256 of each statically-vendored runtime blob (`react.min.js` 18.2.0, `react-dom.min.js` 18.2.0-next-9e3b772b8-20220608, `flexsearch.min.js` 0.7.41, `html2canvas.min.js` 1.4.1) plus a re-verify `sha256sum` command, so the runtime supply chain is auditable and a tampered blob is detectable. Surfaced a real **version skew**: the shipped runtime React is 18.2.0 while `package.json` pins React 19.x for the build + vitest/`@testing-library` test stack — components are tested under 19 but ship on 18.2.0 (documented, not changed; swapping the vendored runtime React is a separate verified upgrade given the Chromium-69 floor + UMD `this` contract).
- **J3 web recording → Blob direct (no base64 round-trip)** — the web `MediaRecorder.onstop` path used to `FileReader.readAsDataURL` the assembled recording into a `~1.33×` base64 string (CLAUDE.md rule 5) which the consumer then `atob`-decoded back into a Blob — two redundant conversions of a Blob it already had. `__onNativeRecordingComplete` gained an optional 4th `blob` arg: web fires `(null, durMs, mime, Blob)`, Android still fires `(b64, durMs, mime)` — one callback shape, no contract break. The consumer (`JournalRecordingSheet`) prefers the blob and falls back to decoding `b64` (Android path byte-identical), with the "nothing recorded" guard now an empty/absent-blob check. Deleted the dead `_webRecordBlobToBase64`. The web blob carries the same bytes the old encode/decode produced — pure memory win, no behavior change. Gates: platform-bridge test 85/85 (updated to assert the Blob with `b64=null`), vitest 1740/70 `test:coverage` exit 0, tsc + eslint clean. The recording-complete path is mic-gated so it can't run headless — verified by the mocked-`MediaRecorder` bridge test; a real record→store→play e2e belongs to the audio device-walk queue.

---

## D-bucket — final architectural items dispositioned (2026-06-01)

The D-bucket (D1–D8 in UPLIFT-PLAN.txt) was the only un-started work after the
UPLIFT batch closed — architectural items that "raise the ceiling past 8" but
were never required. This session dispositioned all eight: **4 landed, 4 skipped
with reasoning** (each evaluated against source, not blindly executed). All
CI-green on main.

**LANDED:**
- **D7 doc prune** (`79781f8`) — deleted 8 stale standalone docs (3 handoffs,
  BUNDLE-LAZY-LOAD-PLAN, css-audit, JOURNAL_WIRING + gitignored b64/quality-uplift
  artifacts, ~630 KB); **slimmed CLAUDE.md 142 → 27 KB** (819 → 361 lines — it
  loads every session, so a recurring context-budget win) and **PLAN.txt 235 →
  70 KB** (closed W0–W5/W7–W9 plan bodies stubbed → HISTORY + git). Crucially,
  the orphaned W2–W9/NK/late-feature history (HISTORY.md had stopped tracking that
  track) was relocated INTO HISTORY.md first (see the "Briefing-archived history"
  section) so nothing was lost — the slim is a move, not a delete.
- **D5 per-action write-fail toast** (`43fb827`) — `StorageHealth.onWriteFailure`
  now fires a cooldown-deduped (8 s) bottom toast so the user learns THIS change
  didn't persist, not just the passive banner. Reuses `.vot-toast` (no new CSS).
  onWriteSuccess clears it + resets the cooldown. +3 vitest; preview-verified.
- **D6 degraded-hydration cascade atomicity** (`8afdd2a`) — real data-integrity
  fix. `JournalStore.remove`'s cross-store cascade (`_purgeAssociated` reads the
  loaded TARGET stores by key-prefix) used to fire DURABLY during the
  `_applyToPendingCache` overlay while the entry delete was only queued → if
  hydration never completed, associations were purged but the entry survived
  (orphan), plus double `recordDeletion` at replay. Gated the cascade + stats/index
  on `!_applyingPending` so the whole delete is atomic (runs once, on the loaded
  path or replay). +1 vitest, proven to FAIL on the pre-fix code.
- **D2 typed navHandoff** (`a93ca80` + globals regen `ced1bb6`) — `src/utils/
  nav-handoff.js` (window-backed Map for cross-bundle reach) replaces the 5 live
  `window.__pending*` / `__notesReturnCtx` magic-string slots with a typed,
  self-documenting `set/take/peek/clear/has` API; preserved exact semantics
  (take where read-then-null in one place; peek+conditional-clear for
  pendingHighlight/notesReturnCtx). Removed the write-only-dead `__pendingLinkExcerpt`.
  4 hook test files + a new module test migrated (+8 net → 1650). BRIDGES.md §5
  now points here. Preview-verified end-to-end (Search-from-selection pre-fill).
  Follow-up: the CI-only smoke-lite `checkGlobalsMirror` caught the un-regenerated
  globals (the pre-commit doesn't regen globals — [[globals-regen-workflow]]);
  fixed by `npm run lint:globals` (397 → 398).

**SKIPPED with reasoning** (the 2026-06-01 fresh AUDIT-PLAN.txt independently
corroborates D1 + D3):
- **D1** content-visibility:auto on verse blocks — a no-op on the WebView-69 floor
  (Chromium-85 feature), so zero benefit on the budget Androids that most need it,
  for non-zero risk to the working scroll-memory/annotation layer. AUDIT-PLAN's
  `[PF3]` reaches the same conclusion and OWNS virtualization via IntersectionObserver
  (works on WV69) — not a D-bucket item.
- **D8** dissolve use-sheet-orchestration — plan-tagged low-priority refactor of
  load-bearing, working sheet UI; respect production code in a nearly-done app.
- **D4** NavContext to collapse the ROUTES factory — already W7.5-adjudicated
  net-negative (the explicit signature is the honest receipt of clean extraction;
  bundling doesn't reduce coupling).
- **D3** project-wide strictNullChecks — W8.3 deliberately left it off; the fresh
  audit also scopes typing TARGETED (CQ4/CQ5: app.jsx + journal-helpers, owned by
  AUDIT-PLAN), not a global strict flag that would surface hundreds of nulls across
  every typed file.

Tests 1638 → 1650. Doc footprint: ~630 KB stale docs removed + CLAUDE/PLAN
slimmed ~280 KB. A parallel "second deep audit" (AUDIT-PLAN.txt, 7.5→8.5) ran
concurrently in the repo this session — distinct scope; no D-bucket overlap.

**Narrow follow-ups (2026-06-02)** — after a "don't just follow the plan, what
do YOU think" challenge, the *wholesale* D8/D3 skips held, but their two
genuinely-defensible sub-pieces shipped:
- **`useLinkPickerOrchestration`** (`47c4b30`) — extracted the one truly-separable
  cohesive cluster from useSheetOrchestration (link picker / link sidebar: 6 of
  13 slots + the 3 __openLink* bridges; callbacks touch only their own slots +
  bare-global helpers). Internal sub-hook (imported, not globalized); moved code
  byte-identical, spread back into the parent's return so App() is unchanged.
  Preview-verified: bridges wired + __openLinkPicker opens the LinkPicker sheet.
- **journal-helpers.js + letter-linking.js → typecheck gate** (`d2082f4`) — both
  measured 0 tsc errors, so pure free coverage (overlaps AUDIT-PLAN CQ4). The D3
  global strictNullChecks flag stays off; app.jsx full typing (CQ5) + the PF3
  virtualization stay owned by AUDIT-PLAN.

---

## N2 — second native-review response (2026-06-01)

A follow-up external review of the native Kotlin layer (proguard, audio
session, GardenImageCache, JsBridge, bundle sizes) produced ~12 suggestions.
Each was verified against source before acting -- several converged with
conclusions already reached in U7/U9/U19, a few rested on stale or incorrect
premises. Two items landed this session; the rest were dispositioned (queued
for the owed device walk, or skipped-with-reasoning) so none is lost. The
native layer remains the highest-rated subsystem; this round is polish on
working, device-tuned code.

LANDED:

- **N2.1 -- ProGuard keep-rule fix.** proguard-rules.pro named
  `com.votreader.sacredui.MainActivity$AppInterface { *; }` -- a stale
  inner-class name. AppInterface became a TOP-LEVEL class in the N1
  extraction, so the rule matched nothing; an R8/minified release would have
  renamed/stripped the @JavascriptInterface methods and silently killed the
  entire native bridge (import, export, recording, screenshot, haptic).
  Replaced with `-keep class AppInterface { @android.webkit.JavascriptInterface
  <methods>; }` + a `-keepclassmembers class * { @android.webkit.
  JavascriptInterface <methods>; }` wildcard backstop. CURRENTLY DORMANT --
  release `isMinifyEnabled = false`, so R8 never runs; this is latent-footgun
  removal, not active breakage. Becomes load-bearing the instant minify is
  enabled (N2.1b, deferred).

- **N2.11 -- "file too large" import message.** The 50 MB import cap
  (StorageManager.MAX_IMPORT_SIZE) failed SILENTLY: the Android picker's
  Failure branch fired `__onImportFile(null)`, indistinguishable from a user
  cancel, so an oversize pick produced no feedback. Minimal, backward-
  compatible fix: MainActivity now passes a controlled `"too_large"` code
  (every other failure stays a bare null -- byte-identical to cancel ->
  silent), the web picker enforces the same 50 MB cap (WEB_MAX_IMPORT_BYTES)
  before touching FileReader, and SettingsScreen's
  `__onImportFile(b64, errCode)` shows a specific actionable toast for the
  oversize case only. No existing behavior or test changed; +1 vitest
  (oversize -> `(null,'too_large')`, FileReader never invoked). 1637 -> 1638.
  Gates: build, tsc, eslint (397 globals), vitest+coverage (above floor),
  Kotlin testDebugUnitTest + jacoco, headless 12-screen smoke -- all green.

QUEUED for the owed device walk (real improvements that touch device-tuned or
device-verified code, so they must be validated on hardware rather than
shipped blind):

- **N2.2 audio focus** -- request AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE around
  the recording session so background media (Spotify/YouTube) pauses instead
  of bleeding into the voice memo. startAudioSession currently sets
  MODE_IN_COMMUNICATION but never requests focus (grep: 0 AudioFocus refs).
  Route the AudioManager calls through new BridgeHost methods so AppInterface
  stays unit-testable (mirrors hasAudioPermission); hold the AudioFocusRequest
  in MainViewModel beside previousAudioMode.
- **N2.3 volumeControlStream = STREAM_MUSIC** -- marginal: Android's adaptive
  default (USE_DEFAULT_STREAM_TYPE) already targets the media stream during
  active playback, so this only helps idle pre-adjustment and slightly fights
  the OS default. Optional.
- **N2.4 GardenImageCache stream-to-disk** -- replace download()'s
  readBytes()-into-heap with a streamed copy to the tmp file. PROFILE FIRST
  (a la U8/W7.6): the cache is device-verified working (176 files/586 MB,
  0 eviction), the ~40 MB-transient is the reviewer's estimate not an observed
  problem, and the naive fix would change the deliberate "serve-from-memory
  even if the disk write fails" robustness property. Measure heap during an
  Ultra crawl on-device; only refactor if the data justifies it.
- **N2.5 haptic fallback amplitude** -- API 26-28 createOneShot uses amplitude
  80 for the tick, which weak OEM motors (Huawei/Xiaomi) may not register;
  DEFAULT_AMPLITUDE (-1) is safer. DORMANT (haptic() has no JS caller yet) --
  fold into the eventual JS-haptic wiring + device-verify together.
- **N2.1b enable R8 minify** -- shrinks unused AndroidX -> a modest APK win
  (does NOT touch the JS/corpus assets). Needs a full device bridge walk
  because R8/reflection/WebView is exactly where keep-rule gaps surface. Low
  urgency (no Play Store goal; ships debug APKs). Depends on N2.1.

SKIPPED -- with reasoning (verified against source):

- **N2.6 screenshot async contract** = already U9. The runBlocking is on the
  BINDER thread, not Main (no ANR), and takeScreenshot is one-at-a-time
  thumbnail capture (no binder-pool exhaustion at realistic rates). The
  off-Main encode landed in U9; the full window.__onScreenshotComplete rewrite
  stays deferred (cross-bridge change, device-verify burden, marginal gain).
- **N2.7 follow system dark mode** -- declined by the user: the app has an
  explicit, persisted light/dark toggle; an auto-follow would be a second
  source of truth fighting it. Not a bug -- a feature we deliberately omit.
- **N2.8 WebView Safe Browsing** -- net-negative here: adds a Google callback
  in tension with the no-egress policy, and protects almost nothing (only
  local-asset top-level loads; external links open via ACTION_VIEW; the only
  remote subresources are static Garden JPEGs, which a URL-list check would
  not vet anyway). Optionally EXPLICITLY DISABLE via manifest meta-data for
  policy clarity.
- **N2.9 Thread -> Coroutine in the cap enforcer** -- cosmetic; the daemon
  Thread is a fast, single-flighted, fire-and-forget sweep, and the class has
  no CoroutineScope owner, so going coroutine adds plumbing for no real gain.
  download() correctly stays synchronous on the intercept thread.
- **N2.10 quote() U+0085 (NEL) escaping** -- rests on a false premise. The
  ECMAScript LineTerminator set is exactly {LF, CR, U+2028, U+2029}; U+0085 is
  NOT a line terminator, so an unescaped NEL is a legal JS string char and
  causes no SyntaxError in V8/Chromium. quote()'s real U+2028/U+2029 escaping
  is correct and pinned by JsBridgeTest. (Byte-verified the two when-branches
  are genuinely E2 80 A8 / E2 80 A9, not a duplicate-branch bug -- the Read
  tool just renders both as blank.)
- **N2.12 SQLite / FTS5 corpus** -- the reviewer's "next level up," but it
  collides with three deliberate commitments: dual-platform single codebase
  (web has no native SQLite -> WASM sql.js + OPFS, re-forking the data layer
  the PWA migration existed to unify), the diffable/schema-validated/
  CORPUS_VERSION-gated corpus source (a .db blob loses git diffs + the
  validation gates), and the offline PWA model. The reviewer's bundle figures
  were stale (bundle-a is 836 KB, not 4.6 MB; the corpora are lazy). Capture
  the budget-device benefit cheaply via the D-bucket instead: D1
  content-visibility virtualization + search docStore teardown.

Also corrected for the record: the "hardcoded string leak" concern (review
batch 1 #C) is not realized -- readUriAsBase64 failures discard the reason
(JS gets null) and the export reason goes to console.warn only, never a raw UI
toast; combined with the no-localization policy, the error-enum refactor solves
a non-problem (its one genuine payoff, the oversize message, landed as N2.11).

---

## 8/10 UPLIFT — Wave 5 (the full P2 "ceiling" set) (2026-06-01)

Commits `c836686..3c1dda9`. Everything past the 8/10 bar — the P2 items that
raise individual subsystem scores. Tests 1527 → **1637**; coverage floor
ratcheted; a new headless CI render-walk gate. All CI-green + deployed. Per-item
evidence lives in UPLIFT-PLAN.txt; this is the chapter record.

- **U12 scripture-parser robustness.** parseRefRange + parseRefStr now normalize
  en/em-dash → ASCII hyphen, so a range that slips check_balance.py still renders
  gold verse numbers instead of collapsing to white. findBook is two-pass
  (exact title/id/plural before the startsWith fallback) so "Jude" no longer
  resolves to "Judges". +4 tests; live-verified through the shipped bundle.
- **U20 platform detection.** _detectPlatform now requires AppleWebKit + Safari +
  none of a non-Safari token set (CriOS/FxiOS/EdgiOS/DuckDuckGo/in-app webviews)
  — the old `/Safari/ && !Chrome` even mis-tagged Chrome-iOS/Firefox-iOS as
  Safari and showed them the wrong 7-day-eviction warning. Misses fall to UNKNOWN
  (silent). +6 UA-table tests.
- **U14 (formal) AndroidBridge routing.** The 4 runtime `window.AndroidBridge`
  bypasses (storage-health, use-history-sync, use-android-back ×2) now read
  PlatformBridge.isAndroid; the single-source invariant is restored (grep ⇒
  comments + test fixtures only). Tests updated to set isAndroid; web-verified.
- **U21 connectivity-ping egress.** Dropped the no-cors fetch of
  thevolumesoftruth.com/favicon.ico (an external egress contradicting the
  self-contained policy) for navigator.onLine + the online/offline events;
  removed that host from connect-src. +4 tests incl. a "no network request"
  assertion. (github.com stays in img-src — the Garden redirect's load-bearing
  initial hop.)
- **U13 html2canvas off the boot path.** Removed from bundle-a's concat
  (1,034,612 → 835,768 bytes, −199 KB / −19% — pure dead weight on Android,
  which uses native PixelCopy); platform-bridge lazy-injects it via <script src>
  on the first web screenshot (CSP 'self'; SW-precached). Preview-verified:
  absent at boot, 1 script injected on demand, real data URL out.
- **U18 PWA hygiene.** Hourly + on-visibility reg.update() so idle tabs get the
  update toast; pruned 6 redundant CORE_ASSETS (react/react-dom/flexsearch/
  search/search-data are concatenated INTO bundle-a; data-normalize orphaned —
  html2canvas KEPT as the U13 lazy source); offline claim documented honest
  (scripture is precached; the Garden's GitHub images are the one online-only
  feature). Core cache 33→27 entries, verified.
- **U19 robustness.** clearLegacyLs now guards on hasAnyPendingStores() — it
  previously relied on a comment, so a reorder could wipe pre-W2.4 users'
  un-migrated LS keys; now defers. base64ToBlob validates the full base64 string
  before atob. (idb-adapter getAll already had the tx.onabort fallback; the
  cosmetic var-useState sweep + a few micro items deferred with reasoning.)
- **U9 screenshot encode off-main.** Verified against source: the runBlocking is
  on the BINDER thread, not Main, so the "main-thread ANR" premise was overstated
  — but captureScreenshotSuspend ran the crop/scale/JPEG/base64 (pure CPU) on
  Main. Now only PixelCopy + the zoom-bracket stay on Main; the encode moved to
  Dispatchers.Default. + cached the Vibrator (U19). The full async-contract
  rewrite deferred with reasoning. Kotlin tests + jacoco green.
- **U17 bridge contract test.** BridgeContractTest (pure-JVM reflection) pins the
  20-method @JavascriptInterface surface against a documented {name→param-count}
  map — a rename/remove now fails the build. The JaCoCo coveredClasses extension
  was measured-infeasible (StorageManager Robolectric artifact; GardenImageCache
  I/O dropped the bundle to 0.59) and scoped out with reasoning.
- **U16 CI render-walk gate.** tools/smoke-ci.js (puppeteer) serves the built
  assets, launches headless Chrome, pre-loads the lazy corpora, injects
  tools/smoke.js via CDP eval (CSP-exempt — the U10 hashed CSP blocks an injected
  inline <script>), runs votSmoke(), and gates on it. PASS locally + GREEN in CI
  (12 screens, both annotation round-trips, 0 console errors, 0 404s).

**Device walk (API-28 emulator, WebView 69).** The cumulative build boots + fully
renders (screenshot) with 0 CSP/JS/crash logcat — confirming U10/U13/U9/U14/U21
all hold on the real old WebView. Still owed (manual/uiautomator feature walks in
tools/n1-smoke-walk.md): the U1 import file-walk, U7 Garden Ultra crawl, U9
thumbnail-capture check.

---

## 8/10 UPLIFT — Wave 4 (the 8/10 exit bar) (2026-06-01)

Commits `a6f3972..bfbeb4b`. The five items between Wave 1 and the 8/10 target.
Tests 1527 → **1621**; coverage floor ratcheted twice. All CI-green + deployed.
Per-item evidence lives in UPLIFT-PLAN.txt; this is the chapter record.

**U14 / U1-owed — export→import e2e round-trip.** The backup DATA plane (payload
build + import-apply + the U1 durability barrier) was extracted from
SettingsScreen into a pure, dependency-injected `src/utils/backup.js`
(`buildExportPayload` / `applyImportPayload` / `blobToBase64` / `base64ToBlob`);
SettingsScreen keeps only UI orchestration (toasts/confirm/degraded-guard/reload/
PlatformBridge). `backup.test.js` drives the full populate → export → WIPE →
import → **RELOAD** → assert round-trip against the REAL stores + a fake
IndexedDB — the "reload" drops every in-memory cache + the IDB connection and
re-hydrates from disk, proving the import DURABLY landed (all 14 stores + 3 flags
+ a real media blob, bytes-equal). 18 tests; the real Settings→EXPORT button
preview-verified through the shipped bundle (complete v2 payload, 17 stores +
counts, passes `validateImportEnvelope`). Note: the exit bar loosely called this
"U14"; the FORMAL U14 (route 4 `window.AndroidBridge` bypasses through
PlatformBridge) is a separate, still-open item.

**U11 — dual-render equivalence + 3-overlap tests.** `annotation-engine.test.jsx`
gained a parameterized suite asserting a per-CHARACTER signature {innermost-mark
color, data-hl-id (== the elementFromPoint tap winner — folds in the U19 z-order
sub-item), note-in-chain} is byte-equal across React `HighlightableText` and the
imperative `applyDOMHighlights` over 5 overlap scenarios (3-way, 3-way + a note on
a fully-covered 4th, note-on-top, 4-way + underline, blank-newest) + a
triple-overlap tap-winner assertion. Both paths nest oldest→outer/newest→inner, so
the signature diverges the moment they drift — the regression net U8 needed.
+6 tests (22→28). Also documented `snapRangeToWords`' START-only snap (U19).

**U15 — renderer/ + scripture-resolution into the coverage gate.** Added
`renderer/**` + `data/scripture-resolution.js` to the vitest coverage `include`.
New suites: `scripture-resolution.test.js` (42 — the COLLECTIONS registry +
parseRefStr/findBook/parseScriptureRef/lookupVersesFromBooks/resolveVerseText/
findEntryContext engine; also seeds U12), dom-links (8), dom-bookmarks (9),
dom-journal-chip (11). +70 tests. The aggregate ROSE (annotation-engine is heavily
covered by its overlap + U11 suites, resolution by the new suite), so the floor
RATCHETED UP: statements 59→60, branches 49→51, functions 63→64 (lines held 64).

**U8 — applyDOMHighlights perf.** PROFILED first (preview, shipped bundle): a full
sweep over 176 unannotated containers = 0.215 ms; a 4-way-overlap container =
0.17 ms — both sub-millisecond (~2 ms even at a 10× budget-device penalty). The
risky single-walk / document→container / 5-pass-unify refactor of the hot,
U11-guarded code is NOT justified by the data — deferred to the D-bucket with the
numbers (à la W7.6 OPFS). Landed the one genuine win: dropped a DEAD guard —
`applyDOMHighlights` scopes its query to `[data-hl-key][data-hl-dom]` (matching
the sibling passes) instead of computing a mark/childElementCount querySelector
then gating on data-hl-dom twice and discarding it. Sweep 0.215→0.15 ms (−30%);
equivalence held (U11 green + preview-verified).

**U10 — CSP: drop `unsafe-inline` from script-src (security).** `script-src` no
longer carries `unsafe-inline` (or `blob:`). `tools/sync-csp-hashes.js`
sha256-hashes the 9 inline `<script>` blocks into the CSP allow-list — nonces are
impossible on static hosting (Pages + the Android asset loader serve byte-for-byte,
no server to mint a per-response value). Wired into `build:csp` (before
`build:sw`), pre-commit (re-stages index.html), and CI (`check:csp` --check +
index.html in the bundle-match diff), so an inline-script edit can't silently drift
the policy into a black screen. **Verified on BOTH platforms:** web preview
(clean-slate) — all 9 inline scripts execute, app boots, 0 CSP violations; AND the
**API-28 emulator (WebView 69)** — app FULLY RENDERS (screenshot proof), 0 "Refused
to execute inline script" in logcat. Two non-obvious traps solved: (1) hash over
CR-STRIPPED content — the HTML parser normalizes CR/CRLF→LF before computing the
CSP hash, so tokens match whether the file is served LF (Pages) or CRLF (a
Windows-built APK); (2) STRIP HTML comments before extracting scripts (the browser
hashes only real `<script>` ELEMENTS, never commented prose). `style-src` KEEPS
`unsafe-inline` by necessity (React `style={{}}` emits dynamic inline `style=""`
attributes — no static hash/nonce path). img/connect-src host-narrowing deferred to
U21 (narrowing risks re-breaking Garden's github→githubusercontent 302 redirect).

---

## 8/10 UPLIFT — Wave 1 (P0 + P1) + the search-quality fix (2026-06-01)

Commits `6f2615d..a989514`. A deep 7-subsystem review (frontend, storage,
renderer, native, perf, PWA, testing) rated the app **7/10** and concentrated
the fixable gaps in data-safety + performance. The full 21-item remediation
lives in **UPLIFT-PLAN.txt** (the canonical home — per-item problem / file:line
evidence / fix / exit criteria / verification); this is the chapter-level
record. Every item below is committed, CI-green, and deployed.

**U0 — doc truth-pass.** Corrected three drifted claims (verified against code
first): the "minified prod build" that never existed; the "1.03 MB cold boot"
that's really ~2.10 MB (a+b+c+d all load blocking); the PlatformBridge "ZERO
`window.AndroidBridge` matches" invariant violated by 4 live sites. (The review's
"`__bumpHlTick` still live" finding was a FALSE ALARM — verified fully removed,
left untouched.)

**P0 — U1 import durability.** Import (the only backup) could silently lose
data: fire-and-forget `_save()` + a blind `setTimeout(reload, 1500)` raced the
IDB writes. Added `CachedStore.whenSaved()` (a durability barrier), made
`_doImport` await every store write before reload, and gated the boot
orphan-media sweep on `JournalStore.isReady()`. 5 unit tests.

**P1 — performance + correctness + security.**
- **U2** minify b/c/d → boot path 2054→1594 KB (−460 KB / −22%). bundle-a minify
  was ATTEMPTED then **REVERTED** — esbuild rewrote the concatenated
  classic-script's top-level `this`→`undefined`, breaking the FlexSearch +
  html2canvas UMD globals (search engine + web screenshots dead); caught during
  U4 verification. Lesson: never esbuild-minify a concatenated classic-script
  bundle of UMD vendors.
- **U3** CORPUS_VERSION enforcement gate (`tools/check-corpus-version.js` + lock,
  pre-commit + CI; break-tested) — no more silent stale-scripture deploys.
- **U4** search no longer loads ~31 MB of alt-translations on a warm index open
  (`loadAllTranslations` moved into `ensureIndex`'s cache-miss branch).
- **U5** annotation store-subscription moved into an `<AnnotationDomSync/>` leaf
  so a highlight/note/link/bookmark tap re-renders only that leaf, not all of
  App() + the ~90-prop ROUTES tree.
- **U6** export fails loud on a partial read (no more incomplete-but-valid-
  looking backup) + a `counts` integrity manifest.
- **U7** GardenImageCache host allowlist (SSRF guard) + single-flight cap
  enforcer + orphaned-`.tmp` sweep. 3 new Kotlin tests.

**U22 (user-flagged) — search quality.** Section headings, inline topic breaks,
and chapter titles dropped from the search index (no `kind:'heading'` /
`'chapter-title'` docs; the `heading` field un-indexed; `SCHEMA_VERSION` 12→13).
Verse-text search intact; verified live (0 heading hits, verse results normal).

Verification throughout: tsc + eslint (0/0) + **1527 vitest** + Kotlin
testDebugUnitTest + JaCoCo + `npm run build` green; votSmoke PASS (12 screens,
letter + wtlb annotation round-trips, 0 console errors); export payload +
search result-kinds inspected live in preview. **Owed to device walks:** the
SAF/import flow (U1) and Garden loading under the new host gate (U7) — both fail
safe. Remaining for the full 8/10 exit bar: **U8** (apply-pass single-walk perf),
**U10** (CSP `unsafe-inline`), **U14** (export→import e2e), **U15** (renderer +
scripture-resolution coverage); rest of P2 (U9, U11–U13, U16–U21) raise
individual subsystem scores.

## Overlap-precedence — most-recent annotation wins (2026-05-31)

Commit `c7d37ba`. When annotations overlap, the more-recently-created VISIBLE
one now shows in the overlap slice — a clean override, not the arbitrary
alpha-blend the old nesting order produced. Both annotations stay stored; the
older still paints everywhere it isn't overridden; a note's icon survives even
where its highlight is fully covered (paint drops to hl-blank, the hl-note
marker never does — per the user's correction). A blank annotation is
transparent, so it never suppresses a color beneath it.

**No schema change** — the `created` timestamp already on every annotation
drives precedence.

- `annotation-engine.jsx`: 4 pure helpers — `annVisible` (does it paint?),
  `annAbove` (recency order, id tiebreak), `coveredSubRanges` (the sub-ranges
  where a more-recent visible annotation covers), `renderSubRanges` (split into
  paint/suppress). Both render paths updated:
  - HighlightableText (React sweep-line): per overlap slice, only the most-
    recent visible annotation paints; the rest are suppressed to hl-blank.
  - applyDOMHighlights (imperative DOM): each annotation's range splits into
    paint/suppress sub-ranges; newest sorts innermost → paints on top + is the
    natural tap target. Dropped the dead `groupCounts` tally.
  Non-overlapping annotations render byte-identically to before.
- `annotation-engine.test.jsx` (new, 22 cases): the helpers + both render
  paths, incl. the staggered-overlap trap (a newer annotation starting at a
  DIFFERENT offset must still win — recency, not text position), blank-is-
  transparent, and note-icon survival under full coverage.

**Verification.** 1483 → 1505 vitest; typecheck + lint clean. Preview end-to-end
through the bundle: a real yellow-over-blue overlap on "Hello world" renders
"Hello" clean yellow (older blue `hl-blank` = transparent there) + " world"
blue, text intact, both `data-hl-id` present. CSS confirms `hl-blank` computes
to `rgba(0,0,0,0)`.

---

## Footnote gold-render pile-strip (2026-05-31)

Commits `078024f` → `66f9aba` → `b0415d4`. Mandate: *every* footnote verse
number must render gold "because that's how the data is, not because a patch
transforms white→gold" — fix the DATA, not the parser.

**Root cause.** `splitIntoVerses` (scripture-parse.js) turns verse numbers gold
only when it splits a value on EXPLICIT markers (decimal "N." or Unicode
superscript). Values without markers fell through to **guessing** strategies
(sentence-split + genealogy-comma + chunk-distribution) that produced the
white / duplicated / mis-numbered renders the user screenshotted (2 Peter CJB
dup, Deuteronomy 27 all-white).

**Fix — strip the pile, mark the data.**
- **`scripture-parse.js`** — Strategy 1 + Strategy 2 + chunk-distribution
  DELETED. `splitIntoVerses` keeps only the two explicit-marker strategies; a
  marker-less multi-verse value degrades to a single start-verse block
  (graceful, no guessing). Doc comment + tests rewritten for the fallback.
- **Data** — remaining "N." markers inserted across letters-flock /
  volume-two / volume-three / wtlb-scriptures via `tools/mark-footnote-verses.js`
  (sourced from the repo's own NKJV via `tools/nkjv-verses.js`; a byte-for-byte
  marker-strip assertion guarantees only markers were added). Markers placed
  BEFORE a leading quote — Strategy 0's whitespace-only lookbehind needs
  `17. “But`, NOT `“17. But`; placing them after the quote was a Luke 15
  regression caught + fixed in `66f9aba`. Annotated keys cleaned (Deut 27:16-26,
  Zech 6:9-13 ×2 — the parenthetical note moved into the verse value).
- **Gate** — `validateFootnoteMarkers` added to `tools/validate-schemas.js`
  and wired into the data gate (pre-commit + CI). Flags any multi-verse value
  whose decimal markers don't fully split (the white eyesore) while tolerating
  superscript excerpts + marker-less prose. **769 footnote values, 0 errors.**

**Verification.** 1483 vitest (+5 marker-gate cases). validate-schemas strict:
0 errors. Preview end-to-end: bundled `splitIntoVerses` fully-splits every real
WTLB case (Luke 15:11-32 → 22 segments, 0 white leftover); `.verse-sup` computes
to gold `rgb(232,192,80)`. CI green; Deploy-Web green (live PWA). CORPUS_VERSION
c3→c4→c5. **Owed:** device-verify on Android (no device attached this session).

---

## Briefing-archived history — W2–W9, NK, late-May/June features (2026-05-26 → 2026-06-01)

Consolidated verbatim from the CLAUDE.md briefing during the 2026-06-01 D7 doc-prune — these landed phases (CI-green + deployed) had not been logged here separately. Reverse-chronological (newest first). The most-recent entries (N2, UPLIFT Waves, Overlap-precedence, Footnote gold-render, W1, W2-polish) already have their own sections elsewhere in this file and are not duplicated here.

- **Android 8/9 black-screen FIXED + SAF export device-verified (2026-06-01, `a6389d0`).** Setting up an API-28 (Android 9) emulator to verify SAF export surfaced a far bigger bug: **the app totally black-screened on Android 8/9.** Two causes, both gated on the old System WebView those OS versions ship (Chromium **69** on a non-Play-updated API-28). **(1) Modern SYNTAX:** esbuild had **no `--target`**, so bundles shipped raw `?.` + `??` (Chromium 80+ syntax) → hard **parse errors** on WebView 69 that kill the whole bundle (cascade: "COLLECTIONS is not defined" etc.) → black screen. Fix: `--target=chrome69` on `build:b/c/d` (verified bundles now have zero `?.`/`??`). Chose 69 not lower because the app also uses `Array.flatMap` (Chromium-69 *runtime* API) — below 69 it'd fail anyway, so 69 is the honest functional floor. **(2) Runtime APIs newer than 69** (`--target` can't transpile these): a feature-detected polyfill block, **first `<script>` in index.html**, shims `globalThis` (C71), `Promise.allSettled` (C76, boot-critical — store hydration), `Promise.any` (C85). No-op on modern WebViews. **Device-verified on the emulator:** app boots to a fully-rendered home (was 100% black), zero logcat JS errors; **SAF export confirmed end-to-end** — Export → `ACTION_CREATE_DOCUMENT` → DocumentsUI picker (pre-filled filename) → SAVE wrote `/sdcard/Download/votreader-backup-2026-06-01.json`, a complete v2 payload (all 17 stores incl. history + marked-as-read; 9 top-level keys) — the exact case the old code rejected with `error:requires_android_10`. The two-tier storage rows ("Total app data" / "Your data") also verified rendering on API 28. **Emulator setup (reusable):** cmdline-tools downloaded to the SDK; AVD `vot_api28` (API 28, Pixel 5, google_apis x86_64); boot headless via `emulator -avd vot_api28`. tsc clean; 1522 vitest; bundle-c unchanged (no modern syntax present).

- **index.html ghost-comment purge — 1001 → 522 lines (2026-06-01, `f6355a5`).** Pure housekeeping, zero behavior change. The file had accreted 100+ `/* X → extracted to src/... */` breadcrumb comments + 36 banner headers — the tombstones left behind by every Q2-P9 module extraction. That phase is long closed and git history preserves the provenance, so all 479 net comment lines were deleted. What remains is only real code: the HTML head (CSP, fonts, meta, boot script), the lazy-loader factory + `__finishBibleInit`/`__finishVotInit` boot wiring, the still-inline data constants (`CANON_SUBTITLES`, `SCRIPTURE_GENRES`, `TRANSLATION_OPTIONS`/`SCRIPTURE_LAYOUT_OPTIONS`/`ARROW_LAYOUT_OPTIONS`, `READING_SCREENS`, `HL_COLORS`, `SRCH_*`, `STUDY_ABBREVS`, month/weekday names, `HIDDEN_MANNA_TITLES`, `_OT_BOOKS_INLINE`), and the bundle-a/b/c/d load sequence + window mirror + render. **Corrected a stale doc number along the way:** CLAUDE.md's file-structure tree had claimed index.html was "4,043 lines" (a pre-extraction figure that never got updated) — it had actually been ~1000 for a long time and is now 522. Verified: `npm run build` + 1522 vitest + tsc + eslint all clean. The inline data constants are extractable to modules (`READING_SCREENS`→`tabs.js`, `HIDDEN_MANNA_TITLES`→`letter-linking.js`, etc.) but were left in place — they're real code, not noise, and reasonable to keep in the boot file; the ghost comments were the actual debt.
- **Garden zoom-on-page-flip fix (2026-05-31).** After zooming in on any Garden page, every subsequent page flip (forward or backward) rendered the new page zoomed way in — even on pages never manually zoomed. **Root cause:** `resetZoom()` used `webView.zoomBy(1f / vm.currentScale)` to undo the pinch, but `vm.currentScale` (tracked via `onScaleChanged`) raced with content changes and `zoomBy` doesn't reliably produce exactly 1.0x due to floating-point/clamping, so the tracked scale diverged from reality and every subsequent reset made it worse. **Fix: replaced WebView's built-in zoom with JS-managed CSS `transform` zoom.** `GardenView.jsx` now handles pinch-to-zoom, single-finger pan (when zoomed), double-tap toggle (1x ↔ 2.5x), and mouse-wheel zoom entirely via touch/wheel event listeners + `transform: translate(…) scale(…)` on the `<img>` element. Zoom state (`scale`, `tx`, `ty`) lives in React refs for zero-re-render gesture performance; `applyZoom()` writes directly to the DOM. On page change, reset is trivial: `scale=1, tx=0, ty=0` — no native bridge, no race conditions. `touch-action: none` added to `.garden-image-area` to prevent browser defaults from conflicting. The native `setZoomEnabled`/`resetZoom` bridge methods are no longer called from GardenView (WebView zoom stays disabled). Zoom-toward-pinch-center math: `tx' = midX - (startMidX - startTx) * (newScale / startScale)`. Translation clamped so the image can't pan past its edges. Pinch-to-pan transition (lift one finger mid-pinch → continues as pan) handled. Max zoom 5x. Preview-verified: zoom resets to 1x on every forward/backward page flip, including after simulated 3x and 4x zooms; zero console errors. Lint + typecheck + 1522 tests clean. **OWED:** device-verify on Android (the platform where the bug manifests).
- **Garden image lag — native disk cache (Android, 2026-05-31, `9483500`).** After the CSP fix restored Garden loading, Android page-turns lagged (desktop PWA snappy). Root cause: the GitHub release URL 302-redirects to a signed `release-assets.githubusercontent.com` asset with `Cache-Control: no-cache`, so the WebView re-downloaded each image **+ re-did the redirect hop on every navigation**. JS can't cache them (no CORS → `fetch` fails) and the PWA Service Worker never runs on Android (`sw-register` skips it), so the fix is native: **`GardenImageCache`** in `MainActivity`'s `shouldInterceptRequest` serves from / populates `cacheDir/garden/`. **Keyed by PAGE NUMBER (tier stripped)** so re-reading at a new quality **overwrites** the same page — never N copies per tier (user's explicit rule); count bounded ≤209. **Cap 800 MB**, sized from on-device measurement (Ultra ≈3.5 MB/page avg, max 8.3 MB → full 209-page read ≈720 MB) so a full read of *any* tier incl. Ultra never evicts mid-browse — the cap is a pure backstop. (An initial 260 MB cap was caught churning ~64% of an Ultra read and raised — caught because I measured on-device, not from the tier's advertised "~680 MB".) Atomic tmp+rename writes; all failures degrade to null (WebView loads the image itself, so a cache bug can't *prevent* loading); per-page locks dedupe concurrent fetches. **Device-verified on `51071FDAP000C8` (Ultra tier):** cache accumulated to 176 files / 586 MB with **zero eviction + zero errors** (the old cap pinned at ~72/259 MB and churned), page-keyed real JPEGs, no `.tmp` leftovers, page 1 cached for instant revisit. 6 `GardenImageCacheTest` cases; Kotlin compile + `testDebugUnitTest` + JaCoCo green. **Kotlin-only** — the Garden CSP asset fix shipped in `1423bda`. App data (regenerable, OS-evictable `cacheDir`), not in export / not in "your data".
- **Storage forensics + 3 fixes — search-cache leak, Garden CSP, two-tier storage display (2026-05-31, `1423bda`).** Triggered by a user report ("export 676 KB but Settings says 243 MB used"). **adb on-device forensics** (run-as into `app_webview/Default/IndexedDB`) found the **export was correct** (journal-media DB = exactly 2 live records = the 1 image + 1 audio; 676 KB is complete) and isolated three real, separate issues. **(1) Search-index cache leak — the 243 MB.** `search.js` cached a full ~21 MB serialized FlexSearch index per `dataSignature()` (changes on corpus edit / SCHEMA_VERSION bump / translation switch) and `cachePut` **never evicted** superseded generations → ~10 stale ~21 MB copies in `vot-search-cache`. Fix: `saveToCache` self-evicts (keep only the just-written sig + sibling corpus's current sig); new `evictStaleCache`/`cacheKeys`/`cacheDelete` + `purgeStaleCache(code)` on the public API. **Purge runs at app boot** via a one-time `app.jsx` effect (`96d62d6`) — NOT gated behind `VotSearch.init()` (which only fires when the user opens Search, so the reclaim could sit undone for days); the cheap standalone IDB key-deletion is safe at startup since it never builds/loads the index. **Then fixed a boot-timing bug (`a0be528`):** the purge first kept `dataSignature(code,corpus)`, but `dataSignature` reads the LAZY corpus globals (`BOOKS`/`MATTHEW`/`LETTERS_*`) absent at boot → boot-time sig `…mt0…bk0.0` never matched the real cached keys `…mt28…bk66.929`, so on-device it reclaimed NOTHING (240 MB stayed). Rewrote `purgeStaleCache` to be **signature-INDEPENDENT** — `cacheEntries()` parses each key's `cp:<corpus>` segment + `savedAt`, keep only the NEWEST per corpus. **DEVICE-VERIFIED** on `51071FDAP000C8`: cold launch logged "boot purge removed 21 stale index generation(s)"; search-cache **240 MB/22 files → 24 MB/2 files**, total IndexedDB **242 MB → 27 MB (~215 MB freed)**; survivors are the live Scriptures (20.1 MB) + Volumes (3.1 MB) indexes; app healthy. **(2) Garden "failed to load" — CSP, not connection.** GitHub now 302-redirects release assets to `release-assets.githubusercontent.com`, absent from `img-src` → WebView blocked the redirect. Added `release-assets.` + `objects.githubusercontent.com` to `img-src` + `connect-src`; dropped the dead `raw.githubusercontent.com`. Preview-proven (`<img>` loads 1688×2160 under corrected CSP). **fetch() of these assets fails (no CORS)** → JS blob cache impossible; **native Android per-page Garden cache shipped separately (`9483500`, see the dedicated bullet above)**, device-verified. Garden's JS-side `gardenImageCache` is in-memory-only (session heap), never persisted → never in the 243 MB nor the export. **(3) Two Settings storage rows** (`src/utils/user-data-size.js`): **"Total app data"** = `navigator.storage.estimate().usage` (matches OS settings — corpus cache + search cache + thumbnails + everything); **"Your data"** = `measureUserData()` summing UTF-8 JSON bytes across the 17 user-content stores + journal-media blob bytes = exactly the Export set. Garden/search/thumbnail caches **excluded** from "your data" (app data, regenerable). Verified: rows render "About 27.7 MB of 11.5 GB" vs "About 1.2 KB". **Backup coverage confirmed complete** — reading history (`vot-history`) + marked-as-read (`readItems` in `vot-state`) are both already exported. tsc/build/lint clean; **1522 vitest (+10)**; coverage floor holds (59.13/49.2/63.29/63.35). Garden CSP loading + native disk cache + boot-purge reclaim are all device-verified (see the Garden + boot-purge handling above). **Investigated + dismissed (2026-05-31):** the JS `gardenImageCache` keys by `tier:page` and is never cleared in-session — flagged as a possible heap-growth concern, but MEASURED in preview: 836 `Image()` objects (worst case, all 209 pages × 4 tiers) added **0 MB** measurable JS heap (the objects are tiny handles; decoded-bitmap memory lives in the browser's own image cache, which it evicts under pressure independently). Adding eviction would also break the background crawl, which uses cache presence as its "already-fetched" done-marker (eviction → infinite re-prime). So NOT a real issue; left as-is by design.
- **Native #1 — SAF export (user-chosen folder, works on Android 8/9) — DONE 2026-05-31.** Closes the last HIGH-priority data-safety gap. **The bug:** export went through `saveToDownloads` → `StorageManager.writeJsonToDownloads`, which hard-returns `error:requires_android_10` on API < 29 (the MediaStore.Downloads collection didn't exist pre-Q). With **minSdk 26**, Android 8/9 users **could not export at all** — and Export/Import is the ONLY backup (`allowBackup=false`), so that was silent data-loss exposure. **The fix (one change, both asks):** replaced the Downloads-only writer with **SAF `ACTION_CREATE_DOCUMENT`** (`AppInterface.saveToFile` → `BridgeHost.launchExportPicker` → `MainActivity.exportPickerLauncher` (`ActivityResultContracts.CreateDocument("application/json")`) → `StorageManager.writeTextToUri(uri, content)`). SAF is API 19+ so it works on every supported device, AND it inherently shows a **"choose folder + filename" picker** (the user-picks-destination ask) — folder, SD card, or cloud provider, with the filename `votreader-backup-YYYY-MM-DD.json` pre-filled. **No new permission** (SAF is permission-free → aligns with the no-security-risks policy). **Async contract** (mirrors import): `saveToFile` is fire-and-forget; outcome arrives via `window.__onExportComplete("ok" | "error:<reason>" | "cancelled")` (new `JsEvent.ExportComplete`). SettingsScreen installs the one-shot callback before launching; "ok" → "Backup saved." toast, "cancelled" → silent, error → retry toast. Web impl keeps the Blob+anchor download but now also fires `__onExportComplete`. **Data completeness + compression were ALREADY correct and left untouched** (verified, not assumed): the v2 payload exports all 14 IDB stores + 3 flag stores + ALL journal media (images AND audio) base64'd; images are stored compressed at maxDim 1600 / JPEG q0.8 (`JournalMediaStore.compressImage`), native audio is AAC 96 kbps / 44.1 kHz, web audio is opus — re-encoding baked JPEG/AAC would only degrade, so no recompression was added. **Verified:** web export end-to-end through the rebuilt bundle (real `saveToFile` → Blob text byte-matches payload, suggested filename, `__onExportComplete('ok')`, 0 console errors); JS 84/84 platform-bridge + 1512 full suite; Kotlin `:app:testDebugUnitTest :app:jacocoTestCoverageVerification` BUILD SUCCESSFUL (StorageManager `writeTextToUri` tests replace the old Downloads tests; AppInterface `saveToFile` delegation tests; FakeBridgeHost `launchExportPicker`; JsBridgeTest pins `__onExportComplete`). **OWED:** device-verify the picker + cancel path on a real Android **8/9** specifically (the case the fix exists for) — folded into the W6 walk; `tools/n1-smoke-walk.md` updated.
- **W8 closed — W8.3 scripture JSDoc types DONE, W8.2 @layer rewrite RETIRED, 5 redundant `!important` removed (2026-05-31).** Final-stretch W8 cleanup. **W8.3 (`dfadf85`):** `@param`/`@returns` typedefs on the five scripture primitives (`parseRefStr`/`findBook`/`parseScriptureRef`/`resolveVerseText`/`lookupVersesFromBooks`) + `src/data/scripture-resolution.js` added to the tsconfig include. **Honest caveat the plan got wrong:** tsconfig is `strict:false` → `strictNullChecks` OFF, so the `|null` returns are *shape-checked + documented*, NOT null-enforced at call sites; real value is wrong-field/typo detection via checkJs. tsc clean, 1511 tests. **W8.2 (`00d215e`) — the `@layer` rewrite was investigated and RETIRED, not executed.** Premise was stale (Q6.9 already adjudicated + KEPT the load-bearing `!important`; count was 19 not 24) and the rewrite is net-negative: `@layer` fails CLOSED on an old System WebView (the whole wrapped sheet is dropped → unstyled app), unlike the graceful degradation of every other CSS feature we use (`var()`, `mask-image`, `:focus-visible`), for zero user-facing gain. **Safe remnant shipped instead:** removed the 5 genuinely *redundant* `!important` from the color-picker chrome (`.sel-color-underline`/`.sel-color-squiggle`/`.sel-color-clear`/`[data-color=blank]` ×2 — proven no-ops in preview via computed-style probes: equal-specificity-later or higher-specificity-no-competitor), and *documented* the 3 genuinely load-bearing annotation ones (`.hl-underline`/`.hl-squiggle` `background:none`, `.hl-note.is-active` gold wash) with the specificity reason they exist (they beat `body.light .hl-<color>` at 0,2,0). **`!important` 19 → 14**; the rest are load-bearing state/drag/spacing/palette-guard overrides, now commented as intentional. Preview-verified zero visual change (swatch borders + content marks byte-identical dark+light, 0 console errors). **W8 is effectively closed** — only the optional app.jsx typing pass remains (not a blocker). SW cache re-synced (app.css is a core asset). See PLAN.txt §W8.
- **Annotation UX overhaul + native tap + OneDrive build-lock fix — 2026-05-31.** All committed + pushed + CI-green; device-verified on `51071FDAP000C8` (`adb` at `C:/Users/corbi/AppData/Local/Android/Sdk/platform-tools/`).
  - **(1) OneDrive build-lock — FIXED (`8e848fa`).** `app/` is reached via the legacy OneDrive junction, so OneDrive attribute-locked `app/build` and broke every *incremental* gradle build (`AccessDenied` on cleanup → "can't rebuild apk on studio"). `app/build.gradle.kts` now reads `vot.buildDir` from `local.properties` (machine-local, gitignored) and relocates `layout.buildDirectory` there — currently `D:\VOTReader-build\app`, OUTSIDE the synced tree. Additive + CI-safe (no key → default `app/build`). **⚠️ The debug APK is now at `D:\VOTReader-build\app\outputs\apk\debug\app-debug.apk`, NOT `app/build/...`.** Android Studio needs a one-time *Sync Project with Gradle Files* to follow it. (Junction removal via `rmdir` was denied while OneDrive/Studio held handles; the redirect sidesteps the lock entirely. NEVER `Remove-Item -Recurse` the junction — it follows into D: and deletes real files.)
  - **(2) Tap-to-open-chip on Android — FIXED (`5edfec7`).** Android WebView swallows a tap on selectable `<mark>` text (no `click`, no bubbling `touchend` — only long-press reached the chip). Research-backed fix: a native `GestureDetector` in MainActivity (`@SuppressLint ClickableViewAccessibility`, returns `false` → consumes nothing) detects a single tap, converts device→CSS px (`/ displayMetrics.density`; zoom is disabled so it's exact), and calls `window.__nativeTapAnnotation(cssX, cssY)` (new `JsEvent.AnnotationTap`) which hit-tests via `elementFromPoint` + opens the chip through the shared `routeAnnotationTap`. Selection / multi-verse drag / scroll are byte-for-byte untouched. (Two failed web-only attempts — `click` handler, raw touch listeners — preceded it.) Chip y-offset removed → default position.
  - **(3) Squiggle style (`6705374`).** Third annotation style alongside highlight + underline — an always-on wavy underline (`.hl-squiggle`); wired through both renderers + the toolbar's 3-button style toggle.
  - **(4) Notes rework — Step B (`e4e42dd`).** **Note-ness DECOUPLED from `kind`.** `kind` = visual style only {highlight, underline, squiggle}; **note-ness = a NoteStore entry** (drives the icon + opens the sheet). `color` now includes **`blank`** (completely invisible; highlight-style only — a note with no visual overhead). **Legacy `kind:'note'` renders as a blank-highlight + icon → NO data migration, existing notes byte-for-byte unchanged on disk + visually identical.** NoteSheet gained the toolbar's style toggle + color row + a blank swatch (outline + diagonal-slash glyph). **`NoteDefaultStore`** (new IDB store `vot-note-default`, additive **schema v2→v3**) persists the last-used note style+color; cold-start = blank highlight, and changing a note's style/color updates the default. Note cards (`NoteRow`) dropped the 1-line/2-line CSS clamp so short/medium notes show in FULL; only >160 chars collapses behind "Show more" (closed the "donut hole" where clipped text had no button). Renderer reuses `hl-note` as the has-note marker; `.hl-note.is-active` = faint gold wash (the old wavy is now `.hl-squiggle`). Side-scroll fade on all 3 color rows.
  - **(5) Multi-verse notes + toolbar viewport clamp (`e792337`).** The Note button is no longer gated behind `!mv` — a multi-verse / multi-paragraph selection (a whole chapter or letter) can become a single note (`handleNote`'s multiVerse branch already spanned every `[data-hl-key]`). And SelectionToolbar now measures its rendered width in a `useLayoutEffect` and clamps `x` to the viewport (8px margins) — fixes the menu running off the screen edge for selections near the margin (the 320px estimate underclamped the 360px-max toolbar).
  - **Tests 1472 → 1478; coverage holds (59.18/49.19/63.1/63.41 ≥ 59/49/62/63 floor).** **B2 — DONE (`9247c73`):** the chip now carries a **Style** switcher (highlight/underline/squiggle via `AnnotationStore.convertGroup`) beside Remove·Color·Convert-to-note, so an existing *regular* highlight can be restyled straight from the chip (a note restyle also updates `NoteDefaultStore`, mirroring the sheet); 6 vitest cases + preview-verified (highlight→squiggle through the bundle). Still open: W6 device walks, W10 a11y. (Native #1 SAF export DONE 2026-05-31 — see the lead bullet; W8.2 CSS @layer RETIRED 2026-05-31 — net-negative; W8.3 scripture JSDoc types DONE — see the W8 bullet below.)
- **OPEN THREADS / next-session pickup (2026-05-29).** Nothing blocking; all work below is committed + CI-green + deployed. Loose ends: **(a) PWA icon, Windows reopen — RESOLVED 2026-05-29:** user confirmed the icon is correct on reinstall+reopen (no `theme_color` gold border). Transparent + maskable icons sufficed; the full-bleed-`"any"` fallback was not needed. **(b) CORPUS_VERSION bumped c1→c2** this session so the Hebrews corpus fix actually reaches existing web PWAs — the corpus cache only busts on a CORPUS_VERSION change; **any future books.js/matthew.js/VOT-corpus edit needs a manual bump** (see [[corpus-version-bump]]). **(c) Format-E — DONE 2026-05-29** (see the dedicated bullet below): the 7 `bible-*.js` + `matthew.js` + `matthew-nkjv.js` are now schema-gated; 0 errors strict-mode. **(d) Native improvements:** #1 SAF export fallback — **DONE 2026-05-31** (SAF create-document picker; works on Android 8/9; see the lead current-state bullet; device-verify owed in W6) · #2 async screenshot (optional polish) · #3 native crash-view a11y → W10. **(e) Phases remaining:** **W7 COMPLETE 2026-05-29** (`raw()` freeze ✓ · schema versioning ✓ · hlTick removal ✓ · **W7.4** DiagnosticLog ✓ · **W7.5** buildScreenRoutes — RESOLVED no-build, explicit signature AFFIRMED (bundling doesn't reduce coupling; user-ratified) · **W7.6** OPFS — RESOLVED deferred with profiling data (IDB put p90 ~2ms, ~100× under the build threshold) — see the W7 bullet below). **W8 IN PROGRESS** (type coverage + CSS @layer) — recon overturned the plan's "82-file flood" estimate: ~71 errors total, almost all mechanical. **W8.1 COMPLETE** (the whole ui tree is now in the typecheck gate): tier 1 = `renderer/` (TreeWalker 4th-arg drops + Text/Element casts); tier 2 = `ui/` + `components/` (Element casts for `.closest`/`.dataset`; props typedefs incl. `key?` on same-file-rendered list rows BookmarkRow/LinkRow/JournalBlockView — cross-file components are `any` so accept `key`, same-file ones use their real inferred type and need it; ConfirmStrip/HydrationGate optional-prop typedefs that also cleared the matching test errors; test-file casts for DOM members + globalThis mocks). **One documented `@ts-expect-error`** in ScreenLayout: `__scrollEl` is a mutable `let` GLOBAL (index.html ~515) read by use-scroll-memory/use-thumbnails — it is lexical, NOT a window property, so the generator's blanket `declare const` mis-types it; `window.__scrollEl=` was caught as a would-be regression (different binding) and reverted to the correct bare assignment + suppress. tsc green with utils/stores/hooks/renderer/ui/components in scope; 1467 tests pass; live-smoke clean. REMAINING: **app.jsx** (the App() composition root — still excluded, optional separate pass) · **W8.2** CSS @layer — RETIRED 2026-05-31 (net-negative; see the W8 bullet) · W10 (accessibility) · W6 (device walks = grand finale; `adb` at `C:/Users/corbi/AppData/Local/Android/Sdk/platform-tools/`).
- **Data integrity + KJV regen — 2026-05-29.** (1) **Missing Hebrews verses restored.** The W9 validator flagged internal gaps (10:15-18, 11:12-31, 13:18-19); a cross-translation audit then caught trailing gaps (10:26-39, 12:16-29) the per-file contiguity check can't see. All 54 NKJV verses inserted from user-provided text (smart-quote house style matched); Hebrews now whole, full books.js-vs-KJV audit 0-missing. (2) **`bible-kjv.js` regenerated** via `tools/regen-kjv.js` (fixed CommonJS→ESM) from getbible.net `/v2/kjv/` = clean eBible eng-kjv (1769 Blayney, v3.1, GPL) — drops inline translator glosses ("Boaz: Gr. Booz") + the Esther-10 apocrypha. 31,102 verses; Ruth 2:1 clean (in-app verified); standalone-loaded via `loadTranslation` (not bundled). (3) **Cross-translation verse-count validator** — `validateAgainstReference(books, reference)` in `validate-schemas.js` compares Format C verse-sets vs the complete KJV, catching the missing-verse class the per-file check structurally can't; wired into the CLI (books.js + matthew-plain.js vs `BIBLE_KJV`) so the pre-commit/CI gate now catches it. (4) **#4 JaCoCo loud-fail guard** (W7 — empty class-tree → loud failure instead of silent zero-coverage pass) + **pre-commit hardening** (now stages the lazy corpus bundles `a-bible`/`a-matthew`/`a-vot`, and runs the schema validator when the validator itself changes). **Tests: 1366** (+10 cross-reference cases).
- **W9 Format-E validators — LANDED 2026-05-29.** Closes the Format-E pass deferred in the W9.1 continuation; the 3 web-served shapes that postdate the A-D spec are now gated. Exported from `tools/validate-schemas.js`, all wired into the CLI + pre-commit + CI data gate: **`validateTranslationMap`** (the 7 `bible-*.js` verse maps `{bookId:{chapNum:[{n,text}]}}` — non-ascending `n` = error; a gap = warning, since cross-translation versification legitimately differs); **`validateStudyBible`** (`matthew.js` MATTHEW — top-level fields + preface `heading`/`para`/`poetry` blocks reusing the Format A `validateSegments`; sectionless chapters with `verses` + `scriptures`/`votNotes`/`links` annotation layers); **`validateScriptureDict`** (`matthew-nkjv.js` ref→text dict — compound `|`/em-dash values are legit, so only the value TYPE is constrained). Shared `validateVerseArray` helper (Format C keeps its own inline check, whose message contract is pinned by tests). **First real catch — kept the data, fixed the validator:** `matthew.js` ch5 `votNotes[0].vol` is `null` (the source "The Blessed" is a non-volume collection already named in `letter`), so `vol` is modeled nullable via a `'string'`-vs-`'string?'` field spec rather than relaxing all fields. **Strict run: 1531 items, 0 errors, 38 warnings** in ~0.9s — every warning is a legit critical-text omission (Acts 8:37, Rom 16:24, Mark 9:44/46, John 5:4, Matt 17:21/18:11/23:14) present only in ASV/BSB/WEB and absent in KJV/YLT. **Tests 1366 → 1421 (+55; `validate-schemas.test.js` now 171 cases).** Still deferred: a whole-missing-chapter cross-check (chapter-count diffs are versification noise, per the prior handoff).
- **W7 — code quality hardening (COMPLETE 2026-05-29).** Closed every remaining code-quality critique; one commit per sub-item (PLAN.txt §W7 has the exit criteria). **W7.2 raw() immutability — LANDED:** `CachedStore.raw()` now returns a shallow-FROZEN COPY of the cache, not the live object. The plan's literal `Object.freeze(this._load())` was a trap — `_load()` returns the LIVE `_cache`, so freezing it would freeze the working object and throw on the next in-place `add()`/`push()`; raw() freezes a COPY instead, leaving the live cache mutable for named methods. Shallow (nested refs shared — named methods are the write path); snapshot semantics; zero prod callers (pure footgun removal). +5 vitest incl. the don't-freeze-the-live-cache regression; **tests 1421 → 1426.** (#4 JaCoCo loud-fail already landed 2026-05-29.) **W7.1a legacy-migration retirement — LANDED:** rather than port the two pre-framework migrations into the new versioned system, they're RETIRED (user's call — live data is already in-shape, so a clean foundation beats old-shape-compat baggage). `migrateAnnotations` (the pre-W2 `vot-highlights` bootstrap) DELETED along with its orphaned `vot-ann-migrated` flag/IDB-store/skip-list/export plumbing; `LinkStore._normalize` slimmed to a malformed-record guard (the `{a,b}→{source,target}` conversion stripped, the real-data drop kept). tests dipped 1426 → 1406 (−20 legacy-migration cases) then back to 1426: removing above-average-covered dead code nicked the coverage floor (a math artifact, not erosion), so — per the gate's "never lower" rule — it was restored by covering real untested in-scope logic (link-store's query/mutation API + `utils/dates.js` relativeDate/timeAgo). **Lesson logged:** pre-commit runs `test` (no coverage); CI runs `test:coverage` — run the latter locally before pushing a test-count change. **W7.1b versioned-migration framework — LANDED:** `CachedStore` takes a per-store `schemaVersion` (default 1) + `migrations` map; `_migrateIfNeeded` runs the chain once on hydration when the meta-tracked version trails, committing data + new version atomically via `IDBAdapter.commitMigration` (one multi-store tx, so data + version never diverge). **Failure-safe:** clone-before-migrate + abort-on-throw / missing-step / commit-fail leaves data intact and the version un-advanced (retries next boot); fully dormant (zero IDB reads) at v1. 14 vitest cases incl. the make-or-break throw-midway / clone-isolation / commit-fail / empty-stamp / no-downgrade. **W7.1 COMPLETE** (retirement + framework). tests 1426 → 1440. **W7.3 hlTick removal — LANDED:** `useDomAnnotationSync` now subscribes to the 4 DOM-relevant stores (Annotation/Note/Link/Bookmark) via `useSyncExternalStore`, so each store's own `_bump()` drives the imperative DOM re-apply directly — the `hlTick` useState + the `window.__bumpHlTick` bridge + ~36 call sites are deleted across **31 files** (also dropped wasteful bumps on Journal/Notebook mutations that don't touch the DOM layer, and swept stale hlTick/localStorage comments incl. 2 hook headers that documented a removed `setHlTick` param). **Live-smoke verified** in preview: a real `AnnotationStore.add` re-ran `applyDOMHighlights` with the bridge absent + zero console errors. tests 1440 → 1439. **W7.4 JS-side DiagnosticLog — LANDED:** new `src/utils/diagnostic-log.js` — a 200-entry FIFO ring buffer mirroring the Kotlin `BoundedLogTree` (in-memory only, cleared on refresh; same content://·file://·/storage|data|… URI/path redaction — note JS `String.replace` needs the `/g` flag where Kotlin's `replace(Regex,…)` is all-by-default). Entry shape `{t,lvl,tag,msg}` matches BoundedLogTree exactly so the two MERGE with no reshaping. API: `warn/error/timing/entries/toJSON/clear` (timing = info-level 'I' for lazy-load durations; warn/error = 'W'/'E'). **`PlatformBridge.getCrashLog` rewired:** Android parses the native log, concats the JS entries, sorts by `t` (malformed-native → JS-only fallback); web returns `DiagnosticLog.toJSON()`. **5 sinks wired:** cached-store `_save` IDB + localStorage write failures → `'store'` (bare-global `typeof` guard, matching the StorageHealth line beside it — cached-store holds no imports by design); storage-health degraded-tier transitions → `'quota'` (transition-gated + degraded-only, so a healthy session logs nothing); index.html `__makeLazyLoader` durations → `'corpus'` timing; sw-register registration failure → `'sw'`; ErrorBoundary `componentDidCatch` → `'render'`. Plus the WakeLock failure path now also feeds DiagnosticLog (honoring its own `W7.4 will migrate` comment). SettingsScreen already read `getCrashLog` + exported `diagnosticLog` + rendered the row — all auto-populate now; copy updated ("warnings, errors, and timings") and the 3 stale `pre-W7.4`/`W7.4 will` forward-refs swept; adjacent fix: index.html's stale "Used by" loader comment gained the `__votCorpus` line. **Live-smoke verified** in preview (clean-slate): DiagnosticLog globalized, real-regex redaction (`content://`+two `/data|/storage` paths → `[uri]`/`[path]`), a real `__loadMatthewCorpus()` produced `corpus matthew 315ms`, merged `getCrashLog` reflects it, 0 console errors. **diagnostic-log.js 100% covered (24 vitest); +4 net platform-bridge (pure-passthrough getCrashLog test → explicit merge tests). tests 1439 → 1467. Coverage floor ratcheted 58/48/62/62 → 59/49/62/63 (functions HELD — 63.02% actual leaves only 0.02 over a 63 floor, too thin). bundle-b → 431.6 KB.** **W7.5 buildScreenRoutes — RESOLVED (NO-BUILD, user-ratified 2026-05-29):** the plan's "group ~130 flat props into 5 bundles" was re-evaluated against the code and REJECTED. The `buildScreenRoutes` header already documented a deliberate user decision (the explicit signature, per [[expose-full-surface]]); the plan's premise was also stale ("47 props" → actually ~130). Key reasoning: bundling does NOT reduce the factory's coupling (it needs every input regardless of packaging — grouping just relabels the same dependency graph), the flat list self-compile-checks (a missing prop is an undefined reference), and the proposed navState/navHandlers split was itself a shape grouping ([[dont-group-by-shape]]). The signature is the honest receipt of clean App() extraction, not a debt. Decision recorded in screen-routes.jsx's header (AFFIRMED comment); any genuinely-cohesive cluster gets revisited during W8 typing ONLY if it makes the typedefs cleaner. **W7.6 OPFS — RESOLVED (DEFERRED with data, 2026-05-29):** profiled `JournalMediaStore.put()` end-to-end in preview (50KB–20MB, empty + 30-record populated). Typical memo range (50KB–1MB) p90 = ~1.6–1.9 ms; 20MB p90 = ~10 ms; populated store no slower — ALL ~100× under the 200 ms threshold that would justify OPFS (and ~10× under it even at a pessimistic 10× budget-device penalty). OPFS's two wins are moot here: writes are already ~2 ms and the app never loads media into JS heap (blob URLs → `<audio>`/`<img>`), so the partial-read win doesn't apply. Building it would add the known Safari data-loss bug (WebKit #250495) + Worker complexity for zero practical gain — contra "user data is paramount." Stay on IDB Blobs. **W7 is now fully closed** (all exit criteria met; the 5 architectural-review critiques are built or evaluated-and-affirmed). **Next phase: W8** (type coverage over ui/ + App(), CSS @layer).
- **Polish pass — 2026-05-28 (W4 CLOSED).** All committed + pushed except where noted. Landed: **#5** `.gitattributes` (LF-normalize `* text=auto eol=lf` + binary protection incl. gradle-wrapper.jar; `c70ecfd`) · **#4** SW same-origin fetch passthrough + **#3** deploy-web `paths:` filter (`4158583`) · **W4.6** `useDocumentTitle` (reuses `describeTab`; `7912bc6`) · **W4.2** `useDesktopKeyboard` (`/`+Ctrl/Cmd+F → `window.__goSearch`, Left/Right click `.chapter-nav-sticky-arrow`; web-only; `1886c13`) · **W4.3** inline-ref `:hover` for `.inline-scrip-ref`/`.letter-link-ref` (`8fc2291`) · **W4.4/W4.5** VERIFY-ONLY (no new code) + 7-case `ui/sheets/SelectionToolbar.test.jsx`. **Counts now: 30 App() hooks, 1366 tests/52 files, app.jsx 774/800.** New hooks (`useDomAnnotationSync`, `useKeyboardInset`, `useDocumentTitle`, `useDesktopKeyboard`) are wired in `_entry-b.js` (import + `Object.assign(window,…)`) and globalized for app.jsx; each has a test.
  - **W4.4 + W4.5 — CLOSED (verify-only).** SelectionToolbar's mount-time effect already listens for `pointerdown`/`pointerup` (unified mouse+touch+pen) + `touchend` + `contextmenu`, so desktop mouse-drag selection and right-click flow through the SAME handlers mobile already used — no new code needed. Confirmed live in a desktop-width preview: drag-select → toolbar (color row + Note/Link/Copy/Share/Search/Bookmark); right-click on a selection → native menu suppressed (`defaultPrevented`) + toolbar; right-click on a highlight mark → suppressed + `__showAnnChip(x,y,hlKey,groupId)` (no toolbar). Locked with the component's first test (`SelectionToolbar.test.jsx`, 7 cases: drag-show, click-no-show, contextmenu-on-selection, mark→chip, note-mark→openNote, icon→openNote, outside-container→native-menu-intact). `ui/` is outside the coverage-measured scope so the coverage floor is unaffected. **W4 is fully closed** — all 7 exit criteria checked in PLAN.txt §W4.
  - **Verify cadence for new hooks:** preview clean-slate is required to load fresh bundles (the SW caches them) — `(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload();})()`. Watch CI via `& "C:\Program Files\GitHub CLI\gh.exe" run watch <id> --exit-status` (gh installed+authed as VOTReader). Coverage floor 58/48/62/62 — new hooks in `hooks/` need a test or they erode the branches margin.
- **PWA hardening pass — 2026-05-28.** Made the update loop whole + closed an architectural-drift gap. (1) **Content-hash cache versioning:** SW `CACHE_VERSION` = `v{pkg.version}-{sha256 of CORE_ASSETS, CRLF-normalized}` via `build:sw`, so any core-asset change auto-busts the cache — no manual bumps (`CORPUS_VERSION` stays manual; corpus = ~10 MB re-download). (2) **One-tap updates:** SW `SKIP_WAITING` handler + sw-register waiting-detection → "update available" toast fires at the right time → tap activates + reloads (no full close/reopen). Verified end-to-end in-browser. (3) **app.jsx re-decomposed 838 → 770** (extracted `useDomAnnotationSync` + `useKeyboardInset`) and the **≤800 budget is now a canary gate** (`npm run check:app-size`, pre-commit + CI) — catches the drift class lint/type/test/build miss. (4) **W4.1 desktop column** (centered 760px ≥768px) shipped.
- **CI fully green; W4 kickoff — 2026-05-28.** Both CI jobs now pass for the first time. The long-standing `kotlin-tests` red was `./gradlew` committed non-executable (mode 100644 → Linux CI `exit 126` "Permission denied", *before* any test ran; Windows hides the +x bit so it passed locally + in pre-commit). Fixed via `git update-index --chmod=+x gradlew` (`e605146`). **Keep `gradlew` at mode 100755 — Windows commits can silently drop the +x bit.** (W4 desktop polish has since fully closed — see the lead bullet. **Next phase: W6 cross-platform verification** — Edge/Firefox/Android-device regression + SW update-cycle + real-device smoke walk, all deferred here.)

- **W2 storage hardening — CLOSED 2026-05-27.** 28 commits, range `16b8fbd..cbdc625`. Every byte of structured user data now in IndexedDB (database `votreader`, schema v2 with 19 stores); legacy localStorage keys read once via per-store fallback then cleared by W2.4. StorageHealth detection engine + UI banners + write-path wiring + Safari-specific flows all landed. **Tests**: 628 → 1099 (+471). **Bundle delta**: bundle-b 357 → 413 KB; bundle-d 545 → 566.2 KB. **Hydration latency**: 3–8 ms across 17 IDB-backed CachedStores on preview machine (well under the 200 ms mid-range / 500 ms budget targets). Per-sub-phase:
  - **W2.1** (`16b8fbd`) `src/stores/idb-adapter.js` — generic CRUD wrapper with retry-on-AbortError + QuotaExceededError preservation + versionchange handling + onupgradeneeded guard for future schema bumps. 44 vitest cases (fake-indexeddb).
  - **W2.2** (`bea5877`) — `CachedStore` extended with state machine (`pending` / `loaded` / `degraded`), write-queue REBASE on hydration, `_pendingCache` overlay so reads during pending surface user writes immediately, `_shouldDefer` guard pattern for mutation methods, batched single-`_save`+`_bump` after replay. The two documented data-loss vectors (per [[w2-hydration-data-loss]]) are closed.
  - **W2.3** Tier 1 (`c49d658`) — RecentNavStore + HydrationGate component + legacy-LS-fallback path inside `_hydrate` so each store self-migrates on first boot. **Tier 2** (`b72094e`) — 6 warm stores (bookmarks, notebooks, journal × 4). **Tier 3** (`90e64b2`) — annotation + note + link, with LinkStore's legacy `{a,b}→{source,target}` migration extracted to `_normalize()` + post-hydration subscriber. **Polish** (`bdc479e`) — pre-defer stamp ordering on AnnotationStore + BookmarkStore (queue entries no longer pre-mutated), `_notifySubscribers` helper extracted, LinkStore subscriber-semantics comment.
  - **W2.3b** (`cd88255`/`f8df8bd`/`339944f`/`d741695`) — 7 hook-owned direct-LS keys migrated: WelcomedFlagStore + AboutSeenFlagStore + GardenWarningFlagStore + ProphecyCardsStore (`.1`), StateStore with `lsShim` for boot-script sync read of theme + fontStyle (`.2`), HistoryStore via `useSyncExternalStore` refactor (`.3`), HomeOrderStore via IDB schema v1→v2 bump (`.4`, caught in post-W2.3b review — vot-home-order was missing from the original key inventory). 8th key `vot-ann-migrated` stays in LS as a permanent boot-time exception (legacy annotation-migration gate read at module load).
  - **W2.3b polish** (`ec0ffb5`) — `_defaultRef` memoization in `_load()` closes the budget-device infinite-`useSyncExternalStore`-loop bug (degraded-state `getSnapshot` was returning a fresh `copyDefault()` reference each call). AnnotationStore.add spread-copies `ann` before stamping. Steady-state useSavedState test added.
  - **W2.4** (`599073b`) + hotfix (`972944e`) — `clearLegacyLs()` runs after `hydrateAllStores()` in HydrationGate; idempotent via `meta.migrated-v1` flag; LS_SKIP_LIST = `['vot-state', 'vot-ann-migrated']`. Hotfix: clearAllPersonalData made async + awaits IDB `deleteDatabase` before reload (race condition that left `votreader` alive on the next boot); interim guard alerts replace the broken pre-W2.6 export/import.
  - **W2.5** (`d7bacc6`) — `src/utils/format-bytes.js` + `src/hooks/use-storage-info.js`. Two new rows in Settings → Your Data: "Storage" (`navigator.storage.estimate()` + formatBytes) and "Protection" (`navigator.storage.persisted()` + `requestPersist()` button — user-gesture chain preserved). Diagnostic `storageQuota` + `storageUsed` raw-byte fields added to the W2.6 export payload.
  - **W2.6** (`b8530ec` prep + `15da427` delivery) — V2 export schema = `data` (boot-shim LS only) + `stores` (every IDB store keyed by name) + `media` (JournalMediaStore blobs, base64 via stream-chunked encoder to avoid OOM on >1 MB blobs). V1 export → V2 import: parses pre-W2 LS-JSON strings via per-store `replaceAll`/`setAll`/`set`. V2 export → V1 client: only theme + fontStyle restored (documented limitation). V3+ forward-compat: unknown top-level keys ignored, "newer version" warning shown. 4 `alert()` sites + 3 new sites use `src/utils/toast.js` (consolidated from `jrnShowMilestoneToast`; root-exit-toast left untouched per its pinned inline-opacity test contract). Realistic-volume round-trip verified: 50 annotations + 10 bookmarks + 5 journal-with-media + sample blob bytes equal at multiple offsets after base64 round-trip. 100 MB media guard.
  - **W2.8** (`8ff0774`) — inner `<ErrorBoundary key={screen}>` wrap around `{ROUTES[screen]?.() ?? null}` in app.jsx. The outer boundary at the root createRoot.render still catches anything that escapes; the inner one is the import-path safety net (if a screen crashes from a corrupted-import payload, the chrome stays rendered and the user can navigate away → key changes → boundary remounts).
  - **W2 audit + test sprint (2026-05-27)** — 5-agent sweep of the storage layer surfaced 12 candidate issues. Of these, 4 shipped (the real correctness bugs); 8 polish/defensive items were rejected as out-of-scope. **Shipped:** journal-store.js:412 + journal-index-store.js:136 missing braces — `_bump()` was firing unconditionally on every notebook deletion / entry removal because the `if (changed)` only guarded `_save()`. idb-adapter `del()` gains `tx.onerror` + `tx.onabort`; `getAll()` gains `tx.onabort` — prevents promise hang if a transaction aborts without request-level error propagation (e.g. concurrent versionchange during cursor walk). **Test coverage:** 230 new tests across 8 new test files (bookmark, journal, journal-stats, history, notebook, home-order, journal-media, replace-all) + 17 migrateAnnotations tests appended to annotation-store.test.js. Aggregate coverage 42.24 → 53.57 statements / 32.33 → 43.31 branches / 43.21 → 59.32 functions / 44.84 → 57.70 lines. Vitest gates advanced 42/32/43/44 → 53/43/59/57 per [[lint-regression-gate]]. Per-store coverage now 84-96% on most CachedStore-backed stores. Two non-obvious test-infrastructure gotchas pinned as memory notes: [[journal-stats-subscriber]] and [[jsdom-blob-test-quirks]]. **Tests: 750 → 980 (+230). Bundle-b: 402 KB; bundle-d: 555.6 KB unchanged.**
  - **W2.7a** (LANDED 2026-05-27) — `src/utils/storage-health.js` (~320 lines). Detection engine + assessment module, no UI. Platform detection (android-webview / safari-tab / safari-pwa / firefox / chrome / edge / unknown). 5-tier health assessment (healthy → caution → warning → critical → readonly) from `navigator.storage.estimate()` + `persisted()`. 8 risk flags (safari-7day, ios-pwa-isolate, low-quota, critical-quota, not-persisted, private-mode, write-failed, quota-declining). Write-path integration API: `checkBeforeWrite(bytes)` / `onWriteFailure(err)` / `onWriteSuccess()` / `reassessIfCautious()`. Safari first-data-creation gate (`checkFirstDataCreation()` — sync, fires once per session). Session-level dismissal state. Periodic 5-min refresh with visibility-change resume. `useSyncExternalStore` reactivity contract (subscribe + getVersion). Concurrent `assess()` calls coalesced. Private-browsing heuristic: Safari quota < 120 MB signals likely private mode → CRITICAL tier. Hardened: fallback report (API unavailable) respects `_writeFailedThisSession` → READONLY preserved. 79 vitest tests (95.8% statements / 91.3% branches / 96% functions / 98.8% lines). Wired into bundle-b via `_entry-b.js`. **Bundle-b: 402 → 413 KB (+11 KB).**
  - **W2.7b** (`d0767d3`) — StorageHealthBanner component + 23 tests. 8-scenario priority system (READONLY/writeFailed → privateMode → CRITICAL → WARNING → CAUTION+not-persisted → healthy=nothing). Fixed-position banner z-index 101 above nav. Persist-request flow with granted/denied states. Session-level dismiss via `StorageHealth.dismissScenario`. Key insight: `useSyncExternalStore` snapshot must be `getVersion` (number), not `getReport` (object ref) — dismiss bumps version without replacing report, so `Object.is` comparison on object refs silently fails. `StorageHealth.start()` wired in HydrationGate `.finally()`. **Bundle-d: 555.6 → 560.0 KB (+4.4).**
  - **W2.7c** (`d0767d3`) — Write-path wiring. `CachedStore._save` catch → `StorageHealth.onWriteFailure`. JournalRecordingSheet `startCapture()` pre-flight `checkBeforeWrite(300KB)`. JournalEditorScreen image-insert catch → `onWriteFailure` + toast. SettingsScreen import path intentionally NOT wired (bulk restore should tolerate individual blob failures).
  - **W2.7d** (`d0767d3`) — `useStorageInfo` rewritten to delegate to `StorageHealth.getReport()` via `useSyncExternalStore` (eliminates duplicate `navigator.storage.estimate()` calls). Settings Platform row via `_platformLabel` helper. Tests rewritten to stub StorageHealth instead of navigator.storage. 12 tests.
  - **W2.7e** (`cbdc625`) — Safari7DayModal: fires once per session on first data-creating gesture in Safari tabs (7-day eviction warning). IosPwaWelcomeCard: full-screen welcome on boot when platform=safari-pwa + empty storage (guides import from Safari). Gesture gates: `checkFirstDataCreation()` one-liner in SelectionToolbar (applyHighlight + handleNote + handleBookmark), ChapterBookmarkBtn, useJournalMutations. `safariGateBlocked` field added to StorageHealth report with reactive bump. 17 tests (13 SafariFlows + 4 storage-health). **Bundle-b: 413.0 KB; bundle-d: 566.2 KB (+6.2 from W2.7d baseline).**
- **W3 — PWA Shell — LANDED 2026-05-28.** Installable PWA infrastructure. `manifest.json` (standalone display, gold theme, relative start_url/scope). `service-worker.js` with two cache buckets: `vot-core-v{N}` (critical-path assets pre-cached on install, cleared on version bump) + `vot-corpus-c{N}` (corpus bundles bible/matthew/vot **pre-cached on install for full offline** as of v1.0.1; cached on first fetch as fallback; stable across versions). No `skipWaiting` — update lifecycle uses `controllerchange` → in-app toast ("New version available — tap to update") so user controls reload timing. `offline.html` dark-themed fallback page with "Try again" button. PWA icons at 512/192/180/32/16px resized from existing 1024x1024 `ic_launcher_foreground.png`. SW registration gated behind `PlatformBridge.isAndroid` (added as exported boolean property) — Android WebView never registers the SW (assets already bundled in APK; SW would double-cache and create stale-content conflicts). Registration wired in `_entry-b.js` at app startup. index.html gains `<link rel="manifest">`, `<meta name="theme-color">`, `<meta name="apple-mobile-web-app-capable">`, Apple touch icon, and favicon links. **Bundle-b: 413.2 → 414.1 KB (+0.9 KB). Tests: 1182 → 1236 (+54 from W9.1). Committed `54a8c49`.** SW-not-registered-on-Android verification still needs device/emulator (W6); desktop Chrome "Install" prompt is now testable on the W5 GitHub Pages deploy.
- **W9.1 — Format A schema validator — LANDED 2026-05-28.** `tools/validate-schemas.js` exports `validateFormatA(letters, opts)` returning `{ errors[], warnings[] }`. Validates required fields, 7 block types (para/poetry/closing/closing-fn/note/scripture/intro), 7 segment types, footnote integrity (type + ref cross-check against nkjv dict), bidirectional fn-segment/footnote cross-reference, nkjv orphan detection, and prev/nextLetter chain consistency. CLI runner loads all 11 Format A data files via `vm.runInNewContext`. **354 letters validated, 0 errors, 2 warnings** (both legitimate orphaned note-type footnotes in volume-one + letters-timothy). Schema adjusted during development: added `intro` block type (found in volume-two.js). npm script: `"validate:data"`. 54 vitest tests in `tools/validate-schemas.test.js`. Committed `84e4642`. **Continuation (B/C/D + Holy Days) landed 2026-05-29 — see next bullet. Remaining:** import payload validation (W9.3).
- **W9.1 continuation — Format B/C/D + Holy Days validators — LANDED 2026-05-29.** `validateFormatB` (WTLB One/Two + The Blessed: id/title/paragraphs, `align ∈ center|justify|left`, inline `{{nav:bookId:chapter}}` syntax = error + `{{ref:…}}` existence vs the module-level scriptures dict = warning). `validateHolyDays` — the album is **HYBRID**: each entry dispatches to the Format A or Format B per-item validator on `entry.type` (`"letter"`/`"wtlb"`); reuses `validateFormatA`/`validateFormatB` via single-element arrays so no rule duplication; validates its own `prevEntry`/`nextEntry` chain. `validateFormatC` (books.js object-of-books + matthew-plain single book + books-restored chrome via `chromeOnly` opt; chapters→sections→verses; verse numbering ascending = error, gap = warning). `validateFormatD` (bible-studies: studies→parts→`chapterIds` resolved against `study.chapters[].id`; `parts` optional — only study 1 is multi-part). Generalized the Format A chain block into a shared `validateChain(items, …, prevKey, nextKey, noun)` (Format A messages preserved via `noun='letter'`; the 54 Format A tests stay green). CLI validates all formats in ~0.3s: **869 items, 0 errors.** **Deferred to a future Format-E pass** (distinct shapes postdating this spec): `matthew.js` Study Bible (preface + sectionless annotated chapters), `matthew-nkjv.js` (ref→text dict), `bible-*.js` (7 translation verse maps). **FINDING — the validator's first real catch:** books.js is missing **Hebrews 10:15-18, 11:12-31, 13:18-19** (26 verses, incl. 20 of the faith chapter) — invisible to `check_balance.py`; surfaced as verse-gap warnings (gaps stay warnings since single-verse omissions can be legit critical-text variants). Needs a data-sourcing fix from a trusted NKJV — do NOT fabricate. **Tests 1267 → 1319** (+52 in `validate-schemas.test.js`; tools/ is outside the coverage-measured scope).
- **W9.3 — Import payload validation — LANDED 2026-05-29 → W9 COMPLETE.** New `src/utils/import-validators.js` (coverage-measured): `validateStorePayload(name, payload)` checks the top-level shape of all 14 IDB store payloads (object-of-arrays / object-of-objects / listObject / array / stringArray / plain-object) — deliberately shallow (top-level + container field, no per-record sweep); `validateImportEnvelope` (app / exportVersion / data / stores / media); `validateMediaRecord` (base64-head + approx-size guard, injectable limit for tests). Wired into `SettingsScreen._doImport`: envelope gate up front, then BOTH the V2 and V1 store loops validate each payload and **SKIP** invalid sections — so a corrupt section can't overwrite good data, and the two non-coercing stores (`StateStore` + `HomeOrderStore`, which would otherwise persist garbage as-is) are protected; media records validated before `JournalMediaStore.put`; the completion toast reports skipped sections. Globalized via `_entry-b.js` (387 → 390 eslint globals); **runtime-verified in preview** (all 3 are live `function` globals; reject array-for-object, non-string entries, bad envelope, bad base64; tolerate unknown stores). 37 vitest cases. **Coverage floor ratcheted 55/46/60/60 → 58/48/62/62.** Tests 1319 → 1356.
- **W9.2 — Validator wired into pre-commit + CI — LANDED 2026-05-28 (`847923d`).** Pre-commit Step 1's data-file block now runs `node tools/validate-schemas.js --strict` after `check_balance.py` (node-on-PATH probe mirrors the bundle-rebuild step). CI gains a "Validate data schemas" step right after Lint (fails fast before typecheck/test/build). Gate proven to block via break-and-revert: an emptied letter title produced FAIL + exit 1.
- **W5 — GitHub Pages hosting + dual CI + version sync — LANDED 2026-05-28 (`021e94a`).** The PWA deploys as static files. **W5.1** `.github/workflows/deploy-web.yml` builds bundles, rsync-stages the web-facing `app/src/main/assets` subtree (excludes `src/`, `*.d.ts`, `*.lnk` — dist/ bundles hold all runtime code) and publishes via the official GitHub Pages actions on push-to-main + manual dispatch. Target: `https://VOTReader.github.io/VOTReader-studio/`. No base-path rewriting needed — every in-app path is relative and SW/manifest use `./` scope; the app never changes the URL path (`history.pushState({}, '', '')`), so no SPA 404 fallback. **W5.2** CSP simplified to `'self'`-only (dropped explicit `appassets.androidplatform.net`; `'self'` resolves to the serving origin on BOTH the Android WebViewAssetLoader and GitHub Pages). Preview-verified: app renders, 0 console errors, 0 CSP violations. **W5.3** the existing ci.yml `build` job already does web-build verification; its bundle-match step now also covers `service-worker.js`. **W5.4** SW `CACHE_VERSION` is content-hash-derived — `tools/sync-sw-version.js` (`build:sw`) sets `v{package.version}-{sha256 of CORE_ASSETS, CRLF-normalized}`, so the core cache **auto-busts on any core-asset change with no manual bump**. Pre-commit re-versions + re-stages `service-worker.js` when a bundle / `app.css` / `index.html` changes; CI's verify gate confirms it matches cross-platform. `CORPUS_VERSION` stays manual — a corpus DATA change is a ~10 MB re-download per client, so it should be deliberate. **LIVE + verified 2026-05-28** at `https://votreader.github.io/VOTReader-studio/`: repo made public + account renamed corbinlythgoe→VOTReader; Pages enabled via `gh api -X POST repos/VOTReader/VOTReader-studio/pages -f build_type=workflow` (the workflow's `configure-pages` auto-enable did NOT take on first run — one-time manual/gh enablement required). Deploy succeeded; all assets serve 200; PWA installs in Chrome (passed installability); SW pre-caches the full corpus for offline (v1.0.1). **Remaining:** SW update-cycle + real-device checks (W6).
- **Font toggle — Classic / Modern (LANDED 2026-05-27, post-W1, pre-W2).** W0.1 fixed @font-face pointing to nonexistent files — fonts were silently falling back to system serif for the entire life of the app. Fixing the bug introduced a readability regression: EB Garamond has ~15-20% smaller x-height than system serif at the same CSS size, and Cinzel at small chrome sizes (0.78rem dates, etc.) is spindly. Solution: settings toggle, default Classic (system serif — what everyone's been reading for years), opt-in Modern (Cinzel + EB Garamond). Implementation is clever — instead of replacing 260 hardcoded `font-family: 'Cinzel', serif` declarations in app.css, the `<style id="custom-fonts">` block in index.html is toggled via `.disabled`. When disabled, browser's built-in font fallback resolves every reference to `serif` automatically. Zero CSS rule changes. Boot script (line 66 in index.html) handles initial state pre-React-mount (no FOUC); use-settings.js effect handles live toggle without reload. Setting persists in `vot-state.settings.fontStyle` ("classic" | "modern"). Bumped EB Garamond weight range from `400 500` to `400 800` so real bold renders in Modern (no more synthetic bold). Future widely-adjustable system (multiple fonts, sizes, per-element scope) documented in PLAN.txt "FONT TOGGLE" section — when it lands, it migrates the 260 hardcoded refs to CSS vars and grows the toggle into a font/size selector.
- **W0-W10 cross-platform PWA + quality hardening plan** — Phases: W0 prereqs ✅ → W1 PlatformBridge ✅ → W2 IndexedDB ✅ → **W3 PWA shell ✅** → **W4 desktop polish ✅** → **W5 hosting (GitHub Pages) + dual CI ✅** → W6 cross-platform verification (deferred — needs a physical device) → **W7 quality hardening ✅** → **W8 type coverage ✅ (W8.1 UI typing + W8.3 scripture types done; W8.2 @layer RETIRED)** → W9 data integrity ✅ (Format A/B/C/D + Holy Days validators + W9.2 gate wiring + W9.3 import payload validation) → W10 accessibility. Full per-phase exit criteria + traceability matrix in PLAN.txt. (W7 landed before W6 because W6 needs real hardware; W7 was device-independent.)
- **Delete-confirm standardization — 5 commits (2026-05-26).** New `ConfirmStrip` primitive at `app/src/main/assets/src/ui/components/ConfirmStrip.jsx` (36 lines + 10 vitest cases) wraps the existing `.ann-chip-confirm` CSS family with a `{ question, yesLabel = 'Yes, delete', onCancel, onConfirm, className, style }` API. Replaces every bespoke delete affordance in the app. **Bucket A** (`42f9eb3`) — 11 mechanical markup swaps: NoteSheet, NotebookManagerSheet, NotebookPickerSheet, JournalNotebookSheet, BookmarkCreateSheet, BookmarksScreen (RowActionSheet + BookmarkPopover), LinksScreen LinkRowActionSheet, NotesIndexScreen drilled-in, LinkCard, AnnotationActionChip. Redundant `padding: 10px 12px` inline styles dropped (base CSS already supplies). **Bucket C** (`cc22558`) — 4 multi-stage patterns collapsed to 1-step. ClearProgressRow + SettingsScreen: drops `clearPending`/`getStage`/`handleClearTap`/`resetClearPending` machinery + adds 3 per-row helper components (HistoryClearRow, SectionClearBtn, AllProgressClearRow) at module scope so each owns internal confirm state. Tabs Overview "Clear All Tabs": drops `clearAllStage`/`setClearAllStage` through useTabActions/AppShellOverlays/app.jsx + the App-level reset effect on overview close; state internal to TabsOverview. JournalEditor block delete: drops `confirmDelStep` 2-step + `requestDeleteBlock`/`cancelDeleteBlock` helpers; banner positioning preserved via `className="jrn-block-confirm"`. HistoryScreen Deduplicate: drops 5-second auto-cancel timer + `pendingBtnRef` + click-outside effect. **Bucket B** (`d0ebf35`) — only behavior change: SelectionToolbar ✕ Remove highlight was instant; now collapses the whole toolbar to a ConfirmStrip ("Remove this highlight?" / "Yes, remove"). Internal state resets on every selInfo change so a fresh selection never inherits mid-confirm state. **JournalAudioBlock** (`5848f0d`) — banner-style ConfirmStrip replaces play+waveform+meta when confirming; the `<audio>` element below the conditional stays rendered so playback state (currentTime, paused/playing) survives a Cancel. **Type-DELETE survivors (intentional):** journal entry delete (JournalHubScreen + JournalViewerScreen) + Settings "Clear All Personal Data" — both keep the type-DELETE-to-confirm modal. **Per-tab × close in TabsOverview stays instant** (browser-like). Cleanup along the way: `CLEAR_LABELS` / `CLEAR_CLASSES` dropped from index.html (no caller); `.history-dedupe-btn.is-pending` dropped from app.css; `.jrn-block-confirm-{cancel,yes,q,step2}` + `.jrn-aud-delete-{confirm,q,cancel,yes}` dropped from journal-styles.js (replaced by the standardized `.ann-chip-confirm-*` family).
- **Post-NK polish — 5 follow-up commits (2026-05-26).** Driven by a 96/100 architectural review that named the genuine remaining gaps. **JsEvent sealed class** (`3b7daa8`) — typed registry replaces all 8 raw `"__onFoo"` strings in `bridge.callOptional` call sites; `JsBridge.callOptional(event: JsEvent, ...)` overload delegates to the string version (defense-in-depth with the existing FN_NAME regex guard). **Haptic feedback bridge** (`f9234df`) — `@JavascriptInterface haptic(style: Int)` exposes 4 vibration styles (tick/click/heavy/double) using `VibrationEffect.createPredefined` on API 29+ with `createOneShot` fallback for API 26-28; VIBRATE permission added. JS-side wire-up (which taps fire haptics) is owed. **JVM target bump 11 → 17** (`fa4d660`) — aligns bytecode with the AGP 9.x build toolchain; zero behavior change in a pure-Kotlin project. **AppInterface extraction behind BridgeHost** (`639de65`) — the 20 @JavascriptInterface methods move to their own top-level `AppInterface.kt` (305 lines), constructor-injected with `BridgeHost` (Activity-surface abstraction) + `JsBridge` + `MainViewModel`. MainActivity 937 → 773 lines (−164); zero behavior change. **AppInterface tests** (`91907f7`) — 27 new tests via `FakeBridgeHost` (plain class implementing BridgeHost with mutable fields). Zero of the 27 need an Activity, Robolectric, or real WebView — the structural payoff of the extraction. `BridgeHost.hasAudioPermission()` added so the requestMicPermission flow tests cleanly without static `ContextCompat.checkSelfPermission`. **Kotlin tests: 104 → 134** across 6 → 7 files.
- **Phase NK — Kotlin Native Quality CLOSED.** 9 commits bring the Kotlin tree to the same JS-side quality bar (Q3-Q8). New stack: JUnit 5 Jupiter + junit-vintage (Robolectric's JUnit 4 bridge) + kotlin-test-junit5 + Robolectric 4.14.1 + MockK 1.13.13 + androidx.test.core/ext.junit + JaCoCo 0.8.12. **104 Kotlin unit tests across 6 files** (SmokeTest 2 + JsBridgeTest 28 + StorageManagerTest 24 + NativeAudioRecorderTest 12 + MainViewModelTest 9 + BoundedLogTreeTest 29). **JaCoCo coverage gate at 0.85 line-coverage floor** on JsBridge + BoundedLogTree (current achieved 0.87 — JsBridge 27/39 + BoundedLogTree 58/58). Pre-commit Step 6 now runs `:app:testDebugUnitTest :app:jacocoTestCoverageVerification`; CI has a new `kotlin-tests` job on JDK 21 with HTML report upload on failure. **JsBridge hardening:** `require(fn.matches(\w+))` injection guard on `callOptional` + new `U+0000` JS-source escape branch in `quote()`. **Release-build logging:** `BoundedLogTree.kt` planted on release builds (ring buffer of last 200 WARN+ entries with content URI + abs-path sanitization), surfaced via a new `AndroidBridge.getCrashLog()` @JavascriptInterface and folded into the Settings → Your Data → Export JSON as a `diagnosticLog` field. Settings shows the entry count + last-error timestamp in a new row that's hidden on debug builds / web preview. Real-device verification of the full N1.x + NK5 happy paths is owed against an actual phone — see `tools/n1-smoke-walk.md` (NK7, 287-line numbered checklist).
- **JSX conversion COMPLETE** (Q2.7-2, `b233cc3`). Every React component is JSX.
- **App() lives in `app/src/main/assets/src/app.jsx`** (Q2.7-1, `c1e3da1`). **770 lines — Phase 1 + Phase 2 CLOSED; P11 re-decomp.** 28 hooks (15 P6 + 11 P7a-k + 2 P11: useDomAnnotationSync + useKeyboardInset). The ≤800 budget is now enforced by a canary gate (`npm run check:app-size`, in pre-commit + CI) after it silently drifted 797→838 post-Phase-2. **All 53 screens dispatch from a single ROUTES table** that lives in its own file (`src/ui/screen-routes.jsx`) via a `buildScreenRoutes(deps)` factory. The 3 substantive inline blocks (matthew-ch, bible-study-chapter, holy-days-index playlist header) extracted to their own screen/component files. Welcome modal + tabs overview + disable-tabs prompt + garden warning live in `AppShellOverlays`; 12 annotation/link/journal/bookmark sheets live in `AppShellSheets`. App() now owns composition, not implementation.

---

## W2 polish — storage layer hardening (2026-05-28)

4-tier sweep of the W2 storage layer post-close, plus two adjacent
cleanups (hlTick prop removal, ThumbStore tests). 8 research findings
evaluated; 4 shipped, 4 ruled out as false positives.

### Tier 1 — Real bugs (2 shipped)

- **CachedStore `_save()` silent write failure** — catch block logged
  nothing if `StorageHealth` was undefined. Added unconditional
  `console.error` before the conditional `onWriteFailure` call.
- **`checkBeforeWrite()` permissive on zero quota** — guard lumped
  unknown-API (permissive) with zero-quota (should block). Split into
  two paths: `quota == null` → ok, `quota <= 0` → critical. Test added.
- *Ruled out:* `_hydratePromise` not cleared (state machine is one-way;
  stale resolved promise returns correct answer). Export misses 2 of 19
  IDB stores (both accounted for — `vot-ann-migrated` in LS data
  section, `meta` self-heals). `onWriteFailure`/`onWriteSuccess` race
  (`onWriteSuccess` has zero production callers; flag is write-once).

### Tier 2 — Silent failures / UX gaps (3 shipped)

- **Import partial-failure reporting** — added `importFailures` counter
  across store/flag/media import phases. Toast now shows error count
  instead of unconditional success.
- **Import during degraded state** — pre-flight guard rejects import
  when any store is degraded. `replaceAll()` on a degraded store queues
  via `_shouldDefer`, then the 1500ms reload discards the queue.
- **`_backgroundRetry` infinite loop** — empty `_backgroundRetryDelays`
  array caused `setTimeout(tick, undefined)` → 0ms tight loop. Added
  early-return guards.

### Tier 3 — Test coverage (+71 tests, 4 new files)

- **StateStore** (13 tests) — get/set, lsShim dual-write path (boot-
  script reads theme + fontStyle from LS), null/undefined handling,
  deferred writes during pending state.
- **RecentNavStore** (18 tests) — add with dedup-by-5-tuple, cap-at-30,
  list-returns-at-most-20, replaceAll cap + null/array guards, version
  bump + subscriber notification.
- **ProphecyCardsStore** (18 tests) — getAll defensive copy, getOne
  true/false, setOne delete-on-falsy, setAll falsy-value filtering +
  null/undefined/array → {}, version bump.
- **AppFlagStores** (21 tests) — is/set/clear, legacy numeric `1` and
  string `"1"` as truthy, `0` and `null` as falsy, 3-store independence
  (WelcomedFlag, AboutSeenFlag, GardenWarningFlag).

Coverage: 53.57 → 55.92 statements, 43.31 → 46.34 branches,
59.32 → 60.36 functions, 57.70 → 60.07 lines.
Gates ratcheted: 53/43/59/57 → 55/46/60/60.

### Tier 4 — Minor hardening (3 shipped, 2 skipped)

- **`_purgeAssociated` cascade logging** (journal-store.js) — silent
  `catch (_e) {}` → `console.warn` with entry id and error. Zero-risk
  diagnostics improvement.
- **`getAll()` tx.onabort handler** (idb-adapter.js) — matches the
  pattern already established on `del()`. Prevents promise hang if a
  versionchange fires mid-cursor.
- **`_blobToBase64` chunk size** (SettingsScreen.jsx) — 65536 → 8192.
  `String.fromCharCode.apply(null, slice)` passes each byte as a
  separate argument; 65536 args is at the engine limit (some cap at
  65535). 8192 is safe on all engines.
- *Skipped:* `clearAllPersonalData` verification (single-tab app, no
  competing connections; already awaits deleteDatabase promise).
  Cross-platform private-mode detection (Chrome/Firefox incognito
  handled correctly by percentage-based tier thresholds; Safari
  heuristic solves a Safari-specific 7-day eviction problem).

### hlTick prop threading removal (adjacent cleanup)

Q7 migrated every component to `useSyncExternalStore`, making the
`hlTick` prop a no-op in every consumer — but the prop was still
threaded through ~30 components. Removed all prop drilling: every
`setHlTick(t => t + 1)` call in sheets/screens now routes through
`window.__bumpHlTick()` (bridge already wired in useAppShellEffects).
hlTick state + DOM apply effects stay in App.jsx (load-bearing).
31 files changed, net −105 lines, bundle-d −1.0 KB.

### ThumbStore tests (adjacent cleanup)

13 tests covering the standalone IDB tab-thumbnail cache (the only
store not based on CachedStore). openThumbDB connection caching +
object store creation, idbPut/idbDelete/idbReadAll CRUD, overwrite
semantics, error-resilience best-effort resolve contract.

### Totals

| Metric | Before | After | Delta |
|---|---|---|---|
| Tests | 1099 | 1182 | +83 |
| Test files | 40 | 45 | +5 |
| Bundle-b | 413.0 KB | 413.2 KB | +0.2 |
| Bundle-d | 566.2 KB | 565.8 KB | −0.4 |
| Coverage (stmts) | 53.57% | 55.92% | +2.35 |
| Coverage (branch) | 43.31% | 46.34% | +3.03 |
| Coverage (funcs) | 59.32% | 60.36% | +1.04 |
| Coverage (lines) | 57.70% | 60.07% | +2.37 |

---

## W1 — Cross-platform PWA platform-bridge (CLOSED 2026-05-27)

W1 of the W0-W8 PWA migration plan. Same JS codebase becomes runnable
on Android APK (existing) AND installable desktop PWA. W1 specifically
decouples the JS layer from `window.AndroidBridge` direct access,
adds desktop-equivalent implementations of the 20 native bridge
methods, wires the desktop-only UX surfaces (Escape key + browser
back-button), and verifies the result against real Chrome.

Final commit range: `5688f6e..405b382`. 35 commits total —
33 code commits across W0.1 → W1 hygiene (`5688f6e..5f5bcc7`)
plus 2 closure-doc-only commits (`952dd9b` CLAUDE.md prune +
`405b382` W2.6 plan additions). `git log 5688f6e..405b382
--oneline | wc -l` returns 35; restricting to code via
`5688f6e..5f5bcc7` returns 33. W1 IS NOW STRUCTURALLY
COMPLETE; Edge + Firefox + Android regression deferred to W5/W6
(hosting + cross-platform verification phase).

### W0.1 — Fonts (5688f6e)

6 OFL WOFF2 fonts at app/src/main/assets/fonts/ (~140 KB total).
Fixed pre-existing bug along the way: the @font-face block
referenced `.otf` / `.ttf` filenames that have never existed in
the upstream repos — Cinzel + EB Garamond were silently falling
back to system serif on every platform since the declarations
first landed. Verified document.fonts.check() = true for all 6
declared faces + width measurement at 32pt distinct from serif
fallback (Cinzel 375 vs serif 281).

### W1.1 — PlatformBridge module (228be7c)

src/utils/platform-bridge.js (140 lines). 20 @JavascriptInterface
methods mirrored from AppInterface.kt. Android impl is pure 1:1
passthrough (zero behavior change); web impl is placeholders
(no-ops / safe defaults / NYI warnings). Pure-addition commit
per [[abstraction-before-migration]]. 45 new vitest cases (491 → 536).

### W1.2 — Call-site migration across 3 tiers (a0546c0..2538e8f)

**Tier A** (a0546c0) — use-thumbnails migrated; html2canvas
fallback FOLDED INTO bridge web impl per
[[consolidate-dont-duplicate]]; takeScreenshot signature became
`() => Promise<string>` uniformly.

**Tier B** — 3 sub-tiers:
- B.1 (748ed2d): use-settings + WakeLock fire-and-forget impl with
  same-reason de-dup
- B.2 (6ec5ff0): SettingsScreen + DOM-input openFilePicker preserving
  the `window.__onImportFile(base64)` callback contract per
  [[preserve-callback-contracts]] + Blob/anchor saveToDownloads.
- B.3 (825d38c): GardenView + Fullscreen API (best-effort swallowing
  user-gesture rejections) + setZoomEnabled/resetZoom as DELIBERATE
  no-ops per [[verify-inertness-not-equivalence]].

**Tier C** — 2 sub-tiers:
- C.1 (22d1c5b): 7 recording-flow web impls in the bridge
  (MediaRecorder + AnalyserNode + MediaStream + Blob→base64 +
  `__onNativeRecordingComplete`) with strict mime negotiation per
  [[mediarecorder-mime-policy]] + pre-allocated AnalyserNode buffer
  per [[amplitude-buffer-preallocation]] + 21 vitest cases.
- C.2 (2538e8f): JournalRecordingSheet migration — 701 → 490 lines
  (-211, -30%). All 5 detection-variable names eliminated; web
  MediaRecorder code path deleted; native flow renamed to startCapture
  and made the sole path. Per [[callback-flow-unification]] this was
  a contract-unification (pre-Tier-C web processed blob INLINE in
  rec.onstop; post-Tier-C BOTH platforms route through
  __onNativeRecordingComplete(b64, durMs, mime)).

Post-W1.2 exit gates all green: zero `window.AndroidBridge` in live
code, zero `error:web-impl-pending`, zero local `isAndroid` in
consumers. Per [[plan-reduction-as-work-progresses]] the original
W1.3 (file I/O) was SATISFIED by Tier B.2, and W1.4 (audio) was
SATISFIED by Tier C — only W1.5 + W1.6 remained.

### W1.5 — Back-button navigation (905b78d..b6107ca, 9 commits)

Seven sub-step commits + the dead-code housekeeping + closure-doc
commits. Desktop browser Escape key + browser back button now route
through the SAME handleAndroidBack as Android's system back, with
the well-known "press back again to exit" double-tap pattern at
root.

- **W1.5(a.1)** (905b78d) — modal registry hook +
  src/hooks/use-modal-registry.js (~170 lines) + 25 vitest cases.
  Module-level Map<string, () => void> (Maps preserve insertion
  order → peek() returns last-registered = topmost). useModalRegistry
  mirrors dismiss via useRefMirror so inline-arrow callbacks don't
  churn insertion order. Explicit shared-IDs FAIL vs unique-IDs FIX
  test comparison.

- **Dead-code housekeeping** (fd8aa22) — NotebookManagerSheet (126 L)
  + JournalNotebookSheet (142 L) deleted. ~10 KB total bundle savings
  (bundle-b -5.3 KB, bundle-d -5.4 KB). Both files' imports +
  window-assignments removed from _entry-b.js / _entry-d.js.

- **W1.5(a.2)** (195cfb3) — wires 25 consumers (24 from the
  original inventory + 1 discovered during wiring:
  `letter-scripture-sheet` — LetterView.jsx's inline scripRef
  state, structurally distinct from ChapterView's ScriptureSheet).
  ConfirmStrip uses React.useId() per-instance for unique IDs per
  the locked contract — shared literals would collapse concurrent
  instances and break peer registrations on first unmount.
  vitest.setup.js globalizes useModalRegistry + modalRegistry so
  colocated UI tests resolve them as free variables.

- **W1.5(b)** (5babe86) — src/hooks/use-history-sync.js (~165 lines)
  + 16 vitest cases. Watches the 8-field per-active-tab nav-key
  tuple; pushes empty-state entries (Option B per
  [[root-of-history-pwa]]). window.__historyReady flag set after
  first-mount-skip for the Firefox popstate-on-load guard in (d).
  `suppressNextHistoryPush()` + `clearSuppressNextHistoryPush()`
  exported pair — caller sets the flag before back-induced nav;
  if handleAndroidBack returns the STRING "false", caller clears
  to prevent flag stranding.

- **W1.5(c)** (732bf6b) + **(c) hardening** (b6107ca) — second
  []-deps effect inside use-android-back.js adds the keydown
  listener as the SOLE Escape dispatcher per the DISPATCHER CONTRACT.
  Seven gates in priority order: web-only / Escape-key-only /
  not-composing / not-in-fullscreen (browser handles natively, no
  preventDefault) / registry-isAnyOpen / **activeElement-is-INPUT/
  TEXTAREA/contenteditable (added in b6107ca after review — skip
  without preventDefault so the browser blurs the field instead
  of navigating away when the user just wanted to dismiss focus)**
  / else-handleAndroidBack-with-suppress+clear. Registry check
  intentionally precedes the activeElement check so a sheet with
  an input inside dismisses the SHEET on Escape rather than just
  blurring the input.

- **W1.5(d)** (0073c10) — src/utils/root-exit-toast.js (~150 lines)
  + 14 vitest cases + a third []-deps effect in use-android-back.
  Toast is a fixed-position div appended directly to document.body
  (independent of the React tree, matching jrnShowMilestoneToast
  convention) with role="status" + aria-live="polite" + Cinzel
  typography. popstate listener: web-only + __historyReady Firefox
  guard + suppress+handleAndroidBack handshake. At root: if armed
  → second back within 2s → disarm + NO replacement push (popstate
  already consumed an entry); else first back at root → pushState
  replacement + arm(). **TIMER-CLEAR-ON-FORWARD-NAV invariant**
  enforced inside useHistorySync's forward-push branch.

### W1.6 — Cross-browser smoke walk + hardening (9c35993..5f5bcc7)

Dual-track verification: preview_eval agent ran the iframe-friendly
subset (12-screen render walk + globals audit + annotation round-trip
+ Escape priority chain + popstate flow + responsive resize at
375/768/1440); Claude in Chrome drove the real-browser-only surfaces
(file export download, file import full round-trip with localStorage
replacement + reload, audio recording mic-request path, garden-warning
modal via real OS Escape key).

**votSmoke result PASS**: 142 globals / 0 missing, 12/12 screens
reached / 0 crashed, letterAnn 133 marks + 13 note icons,
wtlbAnn 51 marks + 6 note icons, 0 console.errors, 0 resource 404s.

**Export round-trip** verified end-to-end: PlatformBridge.saveToDownloads
creates valid `votreader-backup-YYYY-MM-DD.json` (exportVersion 1, all
vot-* keys preserved). Chrome's silent multi-download safety queues
subsequent downloads as .tmp until user confirms (browser-level UX,
not our code). Larger-volume re-verification with seeded 3 bookmarks
+ 1 notebook showed payload growing 1620 → 3250 bytes (10 keys, all
seeded data present in vot-bookmarks). Mechanism scales with real
data; the small original was a fresh-state artifact.

**Import round-trip** verified end-to-end: window.__onImportFile(base64)
callback fires, REPLACE confirm prompt shown, old localStorage wiped,
new localStorage installed, alert + reload trigger, post-reload state
preserves injected marker key.

**5 BOOKS bare-ref bugs found + fixed across 2 commits** (9c35993 +
bdebd34). Pre-existing latent bugs predating W1.5 — introduced when
Q8 lazy-loading (5605f30, 2026-05-25) moved BOOKS into the lazy
bundle-a-bible bundle. Same class repeats with MATTHEW (1 site
fixed in 5f5bcc7). Optional chaining (?.) does NOT save you from
undeclared identifier ReferenceError; only `typeof BOOKS !== 'undefined'`
guard works.

**CLASS-of-bug audit — ASSIGNMENT-site traces for each ruling:**

BOOKS audit (grep `BOOKS\.` in hooks/ + ui/):
- `use-android-back.js:194` — bare `BOOKS[bid]?` — UNGUARDED, fixed
  (bdebd34) via local `const _BOOKS = (typeof BOOKS !== 'undefined')
  ? BOOKS : null;` + null check.
- `use-navigate-to-link.js:131` + `:148` — bare `BOOKS[endpoint.bookId]`
  — UNGUARDED, fixed (bdebd34) via same pattern.
- `SettingsScreen.jsx:157-240` (40+ refs) — SAFE: PROGRESS_GROUPS
  built via `(!_BOOKS_READY || !_VOT_READY) ? [] : [...array literal...]`
  ternary at line 130. The array literal containing all the bare
  `BOOKS.<id>` refs only evaluates when both flags true. ASSIGNMENT
  of `_BOOKS_READY` is `typeof BOOKS !== 'undefined' && !!BOOKS`
  at line 106 — typeof-guarded at the source.
- `ScripturesHome.jsx:80` + `:96` — SAFE: `bibleLoaded ? g.books.reduce
  ((s, b) => s + (BOOKS[b.id]?.chapters.length || 0), 0) : '—'`. The
  bare `BOOKS[b.id]` only evaluates when `bibleLoaded === true`.
  ASSIGNMENT at line 25: `bibleLoaded = typeof window.__bibleCorpus
  !== 'undefined' && window.__bibleCorpus.loaded`. The loaded flag
  flips true via `__finishBibleInit` which has already assigned
  `var BOOKS = …`, so `bibleLoaded === true` implies BOOKS-the-bare-
  identifier is safe.
- `BibleChapterView.jsx:139` — FALSE POSITIVE: `POETIC_BOOKS.has(book.id)`.
  `POETIC_BOOKS` is a local `Set` literal at line 138, not the BOOKS
  global. The regex `BOOKS\.` matched the trailing substring.

MATTHEW audit (grep `MATTHEW\.` in hooks/ + ui/):
- `use-bible-studies.js:243` — bare `MATTHEW.chapters[…]` —
  UNGUARDED, fixed (5f5bcc7) via local `const _MATTHEW = (typeof
  window !== 'undefined') ? window.MATTHEW : null;` + null check.
- `use-nav-history-tracking.js:105` — SAFE: usage is `_MATTHEW.chapters
  .find(…)`. ASSIGNMENT at line 103 is `const _MATTHEW = (typeof
  window !== 'undefined') ? window.MATTHEW : undefined;` followed
  by `if (!_MATTHEW) return;` at line 104. Triple-safe: typeof
  window guard + window-prefixed access (which is typeof-safe even
  when MATTHEW global undeclared) + null check before usage.
- `use-surprise.js:97` — SAFE: usage is `_MATTHEW ? _MATTHEW.chapters
  .map(…) : []`. ASSIGNMENT at line 94: `const _MATTHEW = (typeof
  MATTHEW !== 'undefined' && MATTHEW) ? MATTHEW : null;`. Quadruple-
  safe: typeof check + truthy check at assignment + ternary at usage.
- `MatthewChapterView.jsx:47` — SAFE: bare `MATTHEW.chapters[…]` but
  the component only mounts when the route gate at `screen-routes.jsx:
  621-624` confirms `typeof MATTHEW !== 'undefined'`; otherwise the
  route returns a "Loading Matthew…" placeholder + fires
  `__loadMatthewCorpus`. Upstream route gate guarantees the
  component never sees MATTHEW undef.

The audit principle (formalized as memory [[grep-audit-bug-class]]):
trace the ASSIGNMENT site, not just the guard at the usage site.
Bare `const _X = X` at the top of a function will throw before any
`if (!_X)` check downstream can run; the guard MUST live at the
assignment expression itself (typeof-checked or window-prefixed).

**MediaStream-cleanup test flake fixed** (5f5bcc7) — 3 affected tests
in platform-bridge.test.js replaced fixed-time `setTimeout(20)` with
`vi.waitFor` polls. Verified across 5 isolated runs + 3 full-suite
runs all green.

**Final W1 bundle delta**: bundle-b 351.0 KB → 357.2 KB (+6.2 KB net
for platform abstraction + Escape/popstate handlers + modal registry
+ history sync + root-exit toast + 6 BOOKS/MATTHEW guards). bundle-d
unchanged. Vitest 595 → 628 (+33).

**Cross-browser coverage**: W1.6 verified Chrome + preview_eval only;
Edge + Firefox + Android regression deferred to W6 — see W6 exit
criteria. The structural correctness invariants (dispatcher contract,
registry semantics, history-sync suppress + clear, popstate flow,
activeElement gate, BOOKS/MATTHEW typeof guards) are browser-
independent JS state-machine behavior; Chrome-only verification is
sufficient to call W1 structurally complete.

### Known UX findings carried into W2

- **alert() in exportPersonalData + importPersonalData blocks the
  renderer** on every desktop platform. UPGRADED from "W7 polish"
  to W2.6 SCOPE BLOCKER per W1 follow-up review: the W2.6 agent
  (already touching export/import for the media-blob upgrade) MUST
  migrate the 4 alert sites to in-app toast (jrnShowMilestoneToast
  pattern) in the same pass.

- **W2.6 must verify export-import at realistic data volume.** W1.6
  tested at toy scale (3 bookmarks + 1 notebook = 3.25 KB). The
  W2.6 agent must seed at least 50 annotations + 10 bookmarks + 5
  journal entries (with media blobs) before testing export-import
  to catch truncation/timeout bugs at 200-500 KB scale.

- **exportVersion 1 ↔ 2 forward-compat.** W2.6 upgrades the export
  format to v2 (adds media key). The v2 import handler should
  explicitly skip unknown top-level keys rather than blindly writing
  them, so a v2 file imported into an older v1-speaking client
  (Android APK still on v1 schema) doesn't silently store unknown
  data into localStorage as wasted quota.

---

## Surprise button — full-app pool + unbiased RNG (LANDED 2026-05-26)

Second pass on the dice in the same day. Scope was: include every
content surface (except Return to the Garden) so the dice truly spans
the app, and tighten the random-selection algorithm.

- **Pool expanded** from ~1500 to **2,018 entries** (Bible 1189,
  Matthew Study 28, Studies 72, all 13 letter/WTLB/Blessed collections
  729, Holy Days 16). Now includes:
  - **Holy Days phantom album** — `surpriseType: 'holydays'` flipped
    from null in `scripture-resolution.js`. The 16 ghost entries
    (curated cross-references) become dice-reachable for the first
    time.
  - **Collection prefaces** — `colPreface(col)` checked + pushed
    alongside `colLetterArr(col)` so e.g. Volume One's "A Word of
    Warning", Volume Seven's "The Indignation of The Lord", and the
    Timothy/Flock/Rebuke prefaces are reachable. Adds ~10 entries
    overall.
- **Excluded by design:**
  - **Hidden Manna** — `surpriseType: null` retained. Per CLAUDE.md,
    HM is reachable only via the Matthew study chain; the dice
    explicitly respects that policy.
  - **Return to the Garden** — `garden-view` screen; not in COLLECTIONS
    / chapters / studies, so naturally excluded by the pool builder's
    scope.
- **Bias-free RNG** — replaced
  `Math.floor(Math.random() * pool.length)` with a `_randomIndex(max)`
  helper that uses `crypto.getRandomValues(Uint32Array(1))` with
  rejection sampling against an `acceptCeiling` (largest multiple of
  `max` that fits in 2^32). Bias zone for a 2,018-entry pool is
  ~296 / 4_294_967_296 ≈ 7 × 10⁻⁸; the rejection loop terminates on
  the first draw essentially always. Falls back to Math.random when
  crypto is unavailable. For non-degenerate uses Math.random in V8 is
  already statistically uniform — this is belt-and-suspenders rigor,
  not a Math.random repair.
- **Studies pre-fire on HomeScreen** — `loadBibleStudies()` is now
  pre-fired alongside Bible + Matthew in HomeScreen's `showSurprise`
  effect, so study chapters reach the pool without a prior visit to
  the Studies tab. (Pool gracefully degrades if studies haven't
  loaded yet — they're just absent for the brief race window.)

**+5 vitest cases** in `use-surprise.test.js` (12 total): prefaces
included, Holy Days dispatch, Hidden Manna stays excluded, crypto
spy verifies the unbiased path is taken; existing 7 cases unchanged
in intent (random stub now sets both `crypto.getRandomValues` and
`Math.random` for path-agnostic determinism).

**Verified in preview** (mobile 375x812): probed pool composition
via live JS — confirmed 2,018 entries with Holy Days 16 IN, Hidden
Manna 0 OUT. Forced crypto-stub indices to 2002 + 1217 → dice
navigated to "Regarding The Holy Days · 1" and to a Bible-study
preface respectively. Zero console errors.

---

## Q8 follow-up — Surprise button + lazy-load (LANDED 2026-05-26)

After Q8 made `MATTHEW` + `BIBLE_BOOK_LIST` lazy globals, the Random
Letter dice button on Home silently no-op'd: `handleSurprise()` reads
bare-identifier `MATTHEW.chapters` + `BIBLE_BOOK_LIST.flatMap()`
directly, and HomeScreen only pre-fired the VOT loader — not Bible or
Matthew. Tapping the dice threw a `ReferenceError` inside the React
click handler and never navigated.

Three fixes, one commit:

- **`use-surprise.js`** — `typeof`-guard `MATTHEW` + `BIBLE_BOOK_LIST`
  when building the pool. If pool comes up empty (cold-boot tap before
  any loader resolves), kick off all three corpus loaders and bail.
  No-op is recoverable: the next tap (after loaders resolve) works.
- **`HomeScreen.jsx`** — new `useEffect` gated on
  `settings.showSurpriseButton` pre-fires `__loadBibleCorpus()` +
  `__loadMatthewCorpus()` so the dice has its pool ready well before
  the user can reach for it. Parallel to the existing Q8.3 VOT
  pre-fire.
- **`HomeScreen.jsx` + `app.css`** — moved the dice from floating FAB
  (`position:fixed; bottom-right`) to inline at the END of the
  `home-screen-app` flex stack. Centered via parent's
  `align-items:center`;
  `margin:1.2rem 0 calc(var(--inset-bottom, 0px) + 1.5rem)`. Sits
  below whatever the last visible card is (Library / Settings /
  History, depending on `historyEnabled` + the user's drag-order).
  Page scrolls naturally if cards + dice exceed the viewport.

**Verified in preview** (mobile 375x812): dice renders below History
with default 6 cards (scrollHeight 920 > clientHeight 745); below
Settings with History disabled (5 cards); centered; zero console
errors; `Math.random=0` click navigates to Matthew Ch 1 (first pool
entry). **+1 vitest case** asserts the lazy-load race no-op + all
three loaders fire (now 9 tests in `use-surprise.test.js`).

---

## N1 — Native-side polish (CLOSED 2026-05-25)

10 commits bring `MainActivity.kt` to the same quality bar as the JS
side. Same one-commit-per-item discipline that drove Q3-Q8; same
build-and-verify-after-each gate (Kotlin-only commits run
`:app:compileDebugKotlin` + `:app:compileReleaseKotlin` +
`:app:assembleDebug` rather than the JS-side pre-commit hook, which
doesn't fire on `.kt` files).

### Sequencing

The plan sequenced low-risk to high-risk so cheap commits would shake
out the gate-mechanics before the architectural items rode on the
infrastructure:

1. N1.1 setWebContentsDebuggingEnabled (trivial — DevTools attach in
   debug builds)
2. N1.2 Timber (trivial — mechanical Log.w → Timber.w)
3. N1.3 onRenderProcessGone (low — extracts the WebView factory N1.10
   would otherwise need to invent later)
4. N1.4 Memory-safe file reading (low — size cap before readBytes)
5. N1.5 JsBridge (medium — every evaluateJavascript site funnels here)
6. N1.6 PixelCopy (medium — replaces webView.draw(Canvas))
7. N1.7 Coroutines on screenshot (medium — rides on N1.6 and N1.5
   plumbing)
8. N1.8 WindowInsetsAnimationCompat (medium — per-frame IME tracking,
   with a documented exception to N1.5)
9. N1.9 ViewModel (medium-high — moves state into the AndroidViewModel)
10. N1.10a/b extractions (high — NativeAudioRecorder + StorageManager
    as focused classes)

### New deps (gradle/libs.versions.toml)

```toml
timber = "5.0.1"                # Jake Wharton, universally adopted
coroutines = "1.10.2"            # kotlinx-coroutines-android
lifecycleRuntime = "2.9.1"       # androidx.lifecycle:lifecycle-runtime-ktx
lifecycleViewModel = "2.9.1"     # androidx.lifecycle:lifecycle-viewmodel-ktx
```

Zero third-party risk beyond Timber. Two separate version refs for
lifecycle — they happen to match today; they can drift independently
in future bumps if needed.

### New files (under app/src/main/java/com/votreader/sacredui)

- **`VOTReaderApp.kt`** (19 lines) — Application subclass that plants
  `Timber.DebugTree()` in debug builds. Release builds plant nothing,
  so logging compiles to no-ops. Registered in AndroidManifest via
  `android:name=".VOTReaderApp"`.
- **`JsBridge.kt`** (104 lines) — Wraps every evaluateJavascript call.
  `callOptional(fn, vararg args)` for the optional-window-function
  pattern; `callWithResult(js, callback)` for synchronous-return JS;
  `setCssProperties(vararg pairs)` for the inset CSS update. The
  constructor takes a `webViewProvider: () -> WebView` so N1.3's
  WebView recovery automatically picks up — no re-instantiation. Args
  flow through `escapeArg` (handles `\`, `'`, `\n`, `\r`, U+2028,
  U+2029).
- **`MainViewModel.kt`** (67 lines) — `AndroidViewModel` holding
  config-change-surviving state. Insets, scale, splash hold,
  keep-screen-on, previous audio mode, render-recovery counters, plus
  the `NativeAudioRecorder` + `StorageManager` instances. `onCleared`
  delegates to `audioRecorder.release()` for the mid-recording
  app-exit case.
- **`NativeAudioRecorder.kt`** (192 lines) — Owns the MediaRecorder
  lifecycle. Six public ops (start/pause/resume/amplitude/stop/cancel)
  plus release. Returns a sealed `Result<T>` (Success(value) /
  Failure(reason)) matching the JS-side "ok" / "error:<reason>"
  contract. The `@JavascriptInterface` recording methods become 4-line
  delegates.
- **`StorageManager.kt`** (116 lines) — File I/O surface area.
  `readUriAsBase64(uri, maxBytes)` (size check + read + base64),
  `writeJsonToDownloads(filename, content)` (Q+ MediaStore path),
  `queryFileSize(uri)` (the OpenableColumns.SIZE probe).
  `MAX_IMPORT_SIZE = 50 MB` lives on the companion. Own sealed Result.

### Line-count accounting

| File | Pre-N1 | Post-N1 | Δ |
|---|---|---|---|
| MainActivity.kt | 869 | 937 | +68 |
| VOTReaderApp.kt | — | 19 | +19 |
| JsBridge.kt | — | 104 | +104 |
| MainViewModel.kt | — | 67 | +67 |
| NativeAudioRecorder.kt | — | 192 | +192 |
| StorageManager.kt | — | 116 | +116 |
| **Total** | **869** | **1,435** | **+566** |

MainActivity grew on net (+68) despite extracting recorder + storage
because N1 also added: Timber wiring, the createConfiguredWebView
factory, onRenderProcessGone + retry view, the JsBridge field +
delegates, the import size-rejection branch, the
WindowInsetsAnimationCompat callback, the suspend screenshot helpers,
and the ViewModel delegation. The growth is mostly the new
functionality, not the extraction overhead.

### Commit chain

- **N1.1 (`f61bb43`)** — Enable WebContents debugging in debug builds.
  Added `buildFeatures { buildConfig = true }` to app/build.gradle.kts
  (required under AGP 9.x — automatic BuildConfig generation was
  disabled in 8.0+). `WebView.setWebContentsDebuggingEnabled(true)`
  in onCreate gated by `BuildConfig.DEBUG`. Verified generated
  `BuildConfig.java` for both variants — DEBUG=true on debug,
  DEBUG=false on release.

- **N1.2 (`c791381`)** — Timber.  Add the dep (libs.versions.toml +
  build.gradle.kts). Create VOTReaderApp Application subclass; plant
  DebugTree in debug. Register in AndroidManifest. Mechanical
  replacement of all 14 `Log.w("VOTReader", …)` calls to
  `Timber.w(e, "…")`. The WebChromeClient `Log.println(level, …)`
  dispatcher fans out to per-level Timber methods. The two duplicate
  "PermissionRequest resolution failed" messages diverge into
  "grant failed" / "deny failed" so logcat shows which path failed.
  `import android.util.Log` removed entirely.

- **N1.3 (`1c3ddaf`)** — Renderer crash recovery. Extract the inline
  WebView setup (~200 lines: settings + assetLoader + JS interface +
  chrome client + web client + inset listener) into a private
  `createConfiguredWebView(): WebView` factory. onCreate becomes:
  ```kotlin
  webView = createConfiguredWebView()
  setContentView(webView)
  if (savedInstanceState != null) webView.restoreState(savedInstanceState)
  else { webView.clearCache(true); webView.loadUrl(...) }
  ```
  `onRenderProcessGone` override inside the WebViewClientCompat
  resolves any in-flight permission / file-chooser callback (same as
  onDestroy), removes the dying view from its parent, destroys it,
  and either rebuilds via the factory + reloads index.html OR shows
  a tap-to-reload TextView if the 60-second window has accumulated
  >2 crashes. Two new fields: `renderRecoveryCount`, `firstRecoveryMs`.

- **N1.4 (`4ab52e9`)** — Defensive file reading. Add MAX_IMPORT_SIZE
  = 50 MB constant + private `querySize(uri)` helper that reads
  OpenableColumns.SIZE. filePickerLauncher checks size before
  readBytes; rejects > limit OR unknown size. JS gets the same
  `__onImportFile(null)` callback the existing cancel/error paths use.

- **N1.5 (`78a5048`)** — Type-safe JS bridge. New `JsBridge` class
  (described above). Migrated 8 raw evaluateJavascript sites + 3
  surrounding `webView.post {}` wrappers to bridge calls:
  - filePickerLauncher's 4 paths
  - micPrepLauncher's 2 paths
  - onBackPressed (callWithResult)
  - injectInsets (setCssProperties)
  - postNativeComplete
  - requestMicPermission's 2 paths
  Zero raw evaluateJavascript calls remain in MainActivity. (N1.8
  later adds one intentional 60-Hz exception with an inline justify.)

- **N1.6 (`9a7f5e2`)** — PixelCopy screenshots. Replace
  `webView.draw(Canvas(full))` in `takeScreenshot` with
  `PixelCopy.request(window, srcRect, full, callback, mainHandler)`.
  The PixelCopy callback fires on the main thread but the
  `@JavascriptInterface` is on a binder thread, so the runOnUiThread
  block kicks off PixelCopy and RETURNS — the callback then does the
  crop/scale/encode + counts down the outer latch. No deadlock; the
  main thread is free between the kick-off and the callback. JS API
  stays synchronous (returns base64 string). `import android.graphics.Canvas`
  removed.

- **N1.7 (`f7e6ae0`)** — Coroutines on screenshot. Replace the
  CountDownLatch + Handler ceremony with `suspendCancellableCoroutine`
  wrapping PixelCopy.request. Two new private suspend functions:
  `captureScreenshotSuspend` (the full pipeline, runs on Main) and
  `capturePixelCopy` (just the PixelCopy.request wrapper). The
  `@JavascriptInterface` does `runBlocking { withTimeoutOrNull(2000L)
  { captureScreenshotSuspend(…) } ?: "" }` to preserve the 2-s cap
  and the synchronous return. `invokeOnCancellation` recycles the
  bitmap if the coroutine is cancelled before PixelCopy fires (avoids
  width*height*4 byte leak on timeout). Imports of CountDownLatch +
  TimeUnit removed.

- **N1.8 (`54ca4b6`)** — Per-frame IME tracking. Add
  `WindowInsetsAnimationCompat.Callback` to the WebView in
  createConfiguredWebView. `onProgress` (fires ~60 Hz with
  interpolated insets) writes `--inset-top` / `--inset-bottom`
  directly into the document — inline evaluateJavascript that
  intentionally bypasses JsBridge (60-Hz loop, only %.2f-formatted
  numbers interpolated, justified inline). `onEnd` calls
  `requestApplyInsets` so the resting state routes through the
  normal listener (which updates savedTopInset / savedBottomInset).
  The existing inset listener stays in place — it fires for
  non-animated changes; the animation callback covers smoothness
  during the slide.

- **N1.9 (`8bd7e0e`)** — `MainViewModel : ViewModel()` (initially a
  plain ViewModel; N1.10a upgraded to AndroidViewModel for the
  recorder's Context need). 13 state fields move from MainActivity
  to vm.X. Bulk substitution across the file. Verified no `vm.vm.`
  double-prefix artifacts. `onDestroy` drops the recorder cleanup
  block — moves to `MainViewModel.onCleared` which fires when the
  Activity is finishing (not on config change). Manifest's existing
  `configChanges` covers rotation/uiMode/screenSize, so the ViewModel
  is mostly insurance + a single named place for cleanup +
  future-proofing for config changes that escape the manifest list.

- **N1.10a (`9dc4852`)** — Extract `NativeAudioRecorder`. The recorder
  state (lock + recorder + recordFile + 3 timing longs) was just
  moved into MainViewModel in N1.9; this commit gives them their own
  class with a tight interface. Six public ops, sealed `Result<T>`,
  six `@JavascriptInterface` methods collapse to thin delegates.
  MainViewModel becomes `AndroidViewModel(application)` so it can
  hand the Application context to the recorder (S+ MediaRecorder
  constructor needs Context). `onCleared` delegates to
  `audioRecorder.release()`. Imports of MediaRecorder + java.io.File
  removed from MainActivity. Line count: 1031 → 991.

- **N1.10b (`c27a525`)** — Extract `StorageManager`. The
  filePickerLauncher's inline read + saveToDownloads's inline writer
  move into one class with three methods: readUriAsBase64,
  writeJsonToDownloads, queryFileSize. MAX_IMPORT_SIZE +
  OpenableColumns logic move along with them. The filePickerLauncher
  collapses to a 4-line when-block; saveToDownloads to a 4-line
  delegate. Imports of ContentValues, MediaStore, OpenableColumns,
  Build removed from MainActivity. Line count: 991 → 937.

### Post-review hardening (3 commits)

A critical review pass after N1.10b landed surfaced three real
correctness paths that the build/assemble gate alone hadn't caught.
Each landed as its own commit with the same one-fix-per-commit
discipline as the N1.x chain. These are the kind of bugs the Kotlin
test phase (NK) is designed to catch up-front; documenting them here
both for traceability and as concrete test-case seeds for NK3 / NK4.

- **N1.3 hardening (`d8d0ab6`)** — Dangling `webView` field in the
  retry-view path. `onRenderProcessGone` destroyed the dying WebView
  and then either rebuilt + attached the field (normal recovery) OR
  jumped straight to `showRendererCrashRetryView()` (>2 crashes /
  60 s) WITHOUT reassigning `webView` first. JsBridge reads the
  field via a lazy provider on every call; any in-flight callback
  that landed during the retry-view window — micPrepLauncher result,
  fileChooserCallback resolution, a delayed audio-session JS call —
  would post on the destroyed instance and likely throw
  `IllegalStateException` on the binder thread. Fix: always rebuild
  the WebView FIRST, then branch; the retry click handler attaches
  the already-built fresh instance instead of constructing another.

- **N1.7 hardening (`1ea0127`)** — PixelCopy bitmap recycle race.
  `invokeOnCancellation { dest.recycle() }` recycled the destination
  bitmap eagerly when the coroutine was cancelled (e.g. by
  `withTimeoutOrNull`'s 2-second cap), but Android's PixelCopy
  contract says the destination "must not be modified or recycled
  until the callback is invoked." A cancellation mid-flight could
  let the native side write into a freed buffer — silent corruption
  at best, native crash at worst. Fix: invokeOnCancellation just
  sets an `AtomicBoolean`; the PixelCopy callback handles the
  recycle whether the coroutine cancelled or completed. The
  IllegalArgumentException path (PixelCopy.request rejects args
  synchronously — callback won't fire) also recycles inline.

- **N1.10b hardening (`ff0f459`)** — `queryFileSize` exception
  safety. `contentResolver.query` can throw `SecurityException` (URI
  permission revoked between picker handoff and our access),
  `IllegalStateException` (closed provider), and others. The
  previous implementation didn't catch any of them, so the exception
  propagated out of `readUriAsBase64` → out of `StorageManager` →
  out of the `filePickerLauncher` callback → crashed the app, leaving
  JS waiting on a `__onImportFile` callback that never fired. Fix:
  wrap the query in try/catch in `queryFileSize`; return -1L on any
  exception. Folds into the existing "unknown_size" Failure branch —
  JS contract uniform, user sees the standard generic
  import-failed toast instead of an app crash. Timber logs the
  exception at warn level for diagnosis.

### What's verified vs. what's owed

**Verified at commit time** (every commit):
- `:app:compileDebugKotlin` + `:app:compileReleaseKotlin` clean
- `:app:assembleDebug` builds full APK with no warnings/errors
- Static analysis (no double `vm.vm.` artifacts, no unused imports
  per spot grep)

**Closed by the post-review hardening pass:**
- N1.3 retry-path dangling `webView` field — closed by `d8d0ab6`.
  The retry-view window no longer leaves bridge calls posting on a
  destroyed WebView.
- N1.7 PixelCopy bitmap recycle race — closed by `1ea0127`. Recycle
  deferred to the PixelCopy callback per Android's documented
  contract; cancellation no longer freezes a buffer the native side
  may still be writing into.
- N1.10b queryFileSize exception escape — closed by `ff0f459`. URI
  permission revocations + closed providers now fold into the
  existing `"unknown_size"` Failure branch instead of crashing the
  filePickerLauncher callback.

**Still owed against a real Android device** (couldn't be done in
this environment):
- N1.1: chrome://inspect attachment on debug APK
- N1.3: chrome://crash induced renderer death + recovery cycle;
  rapid 3-crash flow showing the retry view (+ verification that
  the retry-view window no longer crashes per `d8d0ab6`)
- N1.4: 100-MB file rejection path round-trips correct null callback
- N1.5: full smoke walk that every bridge migration path still fires
- N1.6: PixelCopy capture quality across Garden (image-heavy),
  text screens, dark/light mode
- N1.7: Memory Profiler check for bitmap leaks on rapid back-to-back
  captures + cancellation paths (`1ea0127` made the cancel path
  safe; profile it to confirm no regression on the success path);
  background-mid-capture safety
- N1.8: the actual visual smoothness on hardware (emulator's IME
  animation differs from real device timing)
- N1.9: rotation mid-recording — recording survives
- N1.10a: full record / pause / resume / stop / cancel cycle
- N1.10b: export → import round-trip identity check; 100-MB rejection;
  revoked-URI rejection path returns a proper failure (`ff0f459`)

The Kotlin wiring is correct; the visual + behavioral proof remains
owed.

---

## Q6 — CSS hardening (CLOSED 2026-05-25)

Mechanical execution against the 772-line `css-audit.txt` work order.
**app.css: 4,410 → 4,125 lines (−285, ~6.5%).** Three categories in
priority order: dead rules (zero risk), hex→vars (mechanical), `!important`
removal (specificity investigation).

### Phase 1: dead-rule sweeps (5 commits, 285 lines deleted)

- **Q6.1 (`6a10aa4`)** — BOOK SELECTOR block (62 lines). Entire dead
  component family — `.book-selector` / `-eyebrow` / `-title` /
  `-ornament` + `.book-card` / `-eyebrow` / `-title` / `-sub` / `-detail` /
  `-badge` + `:hover` / `.featured` / `.vot-edition` + `@media`
  variant. Superseded by `.chapter-card-*` layout.
- **Q6.2 (`d6b1eb2`)** — old HOME-card block (20 lines). `.home-card` /
  `.home-section` / `.home-cards` / `.home-coming-soon` /
  `.home-app-name` + variants. Superseded by AMBIENT MINIMAL home
  redesign (`.home-nav-item` / `.home-nav-list` are live).
- **Q6.3 (`e3304c0`)** — LETTER LIST block (38 lines). `.letter-list-btn`
  / `.letter-list-num` / `-title` / `-date` + `.is-current` compounds +
  `.letter-list-current-dot` + `.read-check` compound (live `.read-check`
  base rule retained). Superseded by `.chapter-card-*` layout.
- **Q6.4 (`68884bf`)** — old SEARCH v1 + srch facet/chip/status blocks
  (48 lines). The pre-Orama `.search-*` family + the Orama UI's removed
  status-bar / chip / facet sub-features (`.srch-status-bar*` /
  `.srch-chip*` / `.srch-facet*` + `@keyframes srch-pulse`). Live
  `.search-input` / `.search-no-results` / `.search-highlight` /
  `.srch-corpus-row` / `.srch-corpus-btn` / `.srch-scope-chip` /
  `.srch-suggest` all retained.
- **Q6.5 (`16ad441`)** — final dead-rule sweep (117 lines): notes
  sort-menu + hl-remove-menu blocks + 20+ scattered single dead rules
  (`.study-fn-link`, `.letter-highlight-block`, `.sc-sheet-error`,
  `.chapter-card-dot`, `.chapter-card-sub`, `.preface-card`,
  `.nav-btn-text`, `.picker-chapter-title`, `.studies-stack` family,
  `.genre-tile-detail/-external/-preview`, `.genre-screen`,
  `.bkm-row-thought-toggle`, `.settings-select`, `.settings-clear-row`,
  `.history-screen` empty rule, `.history-date-header`,
  `.notes-index-chip`).

### Phase 2: hex → CSS vars (2 commits, 93 raw-hex usages consolidated)

- **Q6.6 (`90149b0`)** — 10-color annotation palette. 62 raw hex usages
  collapse to 10 `--hl-*` token definitions in `:root` (yellow, green,
  pink, red, orange, blue, purple, teal, brown, gray). `--hl-cyan`
  back-compat aliased to `--hl-teal`. Six sub-systems swapped:
  `.hl-underline.hl-{X}`, `.hl-note.is-active.hl-{X}`,
  `.hl-note-icon.hl-{X} svg`, `.ann-chip-color-btn[data-color]`,
  `.sel-color-btn[data-color]`, `.sel-color-btn.sel-color-underline[data-color]`.
  Bonus: `.navpick-row-icon-bible-chapter` brown alias also swapped.
- **Q6.7 (`dca481e`)** — 5 more multi-use hex tokens. `--danger`
  (#ef9a9a × 9), `--settings-warning` (#d18f2e × 2),
  `--settings-danger` (#c0392b × 2), `--input-text` (cream in dark
  mode, #2a2520 in light — 8 light-mode uses), `--white`
  (#ffffff × 4). `#f7f2e8` swapped to `var(--bg)` × 6 (already equal
  to light-mode `--bg`).

### Phase 3: `!important` investigation (1 commit, 11 removed of 36)

- **Q6.8 (`832a95a`)** — Category A `.hl-note.is-active.hl-{color}`
  text-decoration-color (11 decls). Empirical investigation found the
  audit's "shorthand expansion" reasoning didn't match: the base
  `.hl-note.is-active` rule uses LONGHANDS
  (text-decoration-line/style/thickness `!important`), NOT the
  text-decoration shorthand. So there's no implicit
  `text-decoration-color: currentColor` expansion to override. The
  per-color rule's 3-class specificity beats the 2-class base on its
  own. Probed via `document.styleSheets.deleteRule` + live-patch +
  computed-style assertion across all 11 colors in BOTH dark and light
  mode.
- **Q6.9 (no commit)** — Cat B/C/D/E/F (25 remaining decls):
  KEPT. Light-mode palette specificity (`body.light .hl-yellow` =
  0,0,2,1) exceeds `.hl-note:not(.is-active)` (0,0,2,0), so
  `!important` is genuinely load-bearing for the palette-strip
  guards. The audit's `:where()`/`@layer` cleanup is a redesign,
  out of scope for this hardening phase.

`!important` count: **36 → 25.**

---

## Q7 — useSyncExternalStore migration (CLOSED 2026-05-25)

**Goal:** replace the legacy `hlTick` cache-bust pattern (24 Bin 4
`eslint-disable react-hooks/exhaustive-deps` cites) with the React 18
`useSyncExternalStore` contract. Per [[test-the-suppresses]] the Q5.3
test had proven the cite was justified BEFORE migration; now it's not
needed at all.

- **Q7.1 (`0eb9fce`)** — CachedStore base. Added `subscribe(cb) →
  unsubscribe`, `getVersion()`, `_bump()`, `_version`, `_listeners` to
  the base class — every store inherits via `extendStore()`. 9 new
  test cases in `cached-store.test.js` prove the contract (initial
  version, increment on bump, subscriber notification, multiple
  subscribers, unsubscribe stops notifications, one-throws-doesn't-block-others,
  idempotence, subscribe-before-bump, stable getVersion).
- **Q7.2 (`9d5dd0c`)** — AnnotationStore + NoteStore _bump. 3 consumers
  migrated (HighlightableText, NoteSheet × 2). Q5.3 test extended
  with sections E + F (useSyncExternalStore pattern + every mutation
  method bumps).
- **Q7.3 (`e996e37`)** — BookmarkStore + JournalStore + LinkStore _bump.
  4 consumers migrated (BookmarkIcon, ChapterBookmarkBtn,
  BookmarksScreen, LibraryScreen). LibraryScreen subscribes to ALL 5
  stores so the 5-tile dashboard is fully reactive in one place.
- **Q7.4 (`6a1a0c0`)** — NotebookStore + JournalIndexStore _bump. 10
  consumers migrated: NotesIndexScreen, NotebookManagerSheet,
  NotebookPickerSheet, LinkSidebar, LinkIcon, LinksScreen,
  HighlightsScreen, JournalHubScreen, JournalViewerScreen, JournalChip.

**Stores with `_bump`:** AnnotationStore, NoteStore, BookmarkStore,
JournalStore, LinkStore, NotebookStore, JournalIndexStore (7 total).

**Bin 4 production-code disables removed:** 23 (all of them).
The 24th lives in `annotation-store.test.js` and documents the OLD
hlTick pattern WITH proof it was justified BEFORE migration — kept as
a historical regression marker per [[test-the-suppresses]].

**Tests:** 465 → 476 (+11 across Q7.1's cached-store + Q7.2's
annotation-store sections E/F).

**setHlTick / hlTick prop threading:** still threaded through some
non-migrated callbacks where post-mutation `setHlTick(t => t + 1)` is
now a no-op (no consumer reads `hlTick`). Follow-up can rip the
App-state + prop bind entirely; left as-is this session to bound the
blast radius.

---

## Q8.2 + Q8.3 — Matthew + VOT corpora lazy-load (LANDED 2026-05-25)

Pattern proved in Q8.1 expanded across two follow-up commits.
Cold-boot critical path: **4.65 MB → 1.03 MB** across Q8.2 + Q8.3,
total **11.7 MB → 1.03 MB (91% cumulative reduction)** from baseline.

### Q8.2 (`dcd06c3`) — matthew.js (Study Bible) lazy

`bundle-a-matthew.js` (618 KB) loaded on demand. Pre-fires on
StudiesHome + ScripturesHome mount (the two screens that can route
into Matthew Study Bible content).

Q8.1's per-corpus loader factored into a reusable factory:
`window.__makeLazyLoader(name, bundlePath, finishFnName)` returns
`{ corpus, load }`. Used now for bible / matthew / vot.

App-side guards:
- `app.jsx` — top-level `useSyncExternalStore` on `__matthewCorpus`
  alongside `__bibleCorpus`. `ALL_BOOKS` spreads `matthew` only if
  `MATTHEW` is defined.
- `screen-routes.jsx` — `matthew-idx` + `matthew-ch` routes render a
  centered "Loading Matthew…" placeholder + trigger the loader if
  `MATTHEW` is undefined.
- `use-nav-history-tracking.js` — `matthew-ch` history-record branch
  early-returns when `window.MATTHEW` is undefined; a later effect
  re-run after corpus arrival picks it up.
- `SettingsScreen` — Q8.2 also fixes a Q8.1 oversight: the
  `PROGRESS_GROUPS` construction (reads `BOOKS["matthew-plain"]`,
  `BOOKS["1corinthians"]`, etc.) is now gated on `_BOOKS_READY`.
  Pre-Q8.2 a cold-boot-direct-to-Settings would throw.

### Q8.3 (`5605f30`) — All VOT corpora lazy

`bundle-a-vot.js` (3 MB) carries all 14 remaining corpus files:
volume-one through volume-seven, letters-timothy, letters-flock,
lords-rebuke, wtlb-one, wtlb-two, wtlb-scriptures, the-blessed,
holy-days, hidden-manna.

`__finishVotInit` runs on bundle-a-vot.js load + re-executes 3
pieces of cross-corpus wiring that USED to be eager at boot:
1. `linkWtlbEntries` — wires `prevEntry / nextEntry` for WTLB-shaped
   collections (WTLB One/Two + The Blessed).
2. `linkPreface` — connects each collection's preface to its first
   letter for nav chain.
3. `VOT_LETTER_REGISTRY` — Map keyed by `"<collection>::<letter
   title>"` → routing data, consumed by matthew.js's `votNote`
   tap-through (itself lazy via Q8.2). Const-IIFE pattern in
   index.html converted to `let` + a `window.__finishVotInit()`
   function that rebuilds from currently-loaded corpora.

The hook also runs once at boot (with all iterations skipping
empty corpora), so any not-yet-loaded collection that happens to
have been loaded by a prior session still works.

App-side wiring (more invasive than Q8.1/Q8.2 because VOT touches
~27 routes):
- `_wrapVot` helper in `screen-routes.jsx` wraps every VOT-bound
  route (13 letter/entry indexes + 10 letter views + 3 entry
  views + Holy Days + Hidden Manna). The wrapper triggers
  `__loadVotCorpus()` and renders a generic "Loading…" placeholder
  until the corpus arrives.
- All `LETTERS_V1 / LETTERS / LETTERS_V3 / ... / WTLB_ONE /
  WTLB_TWO` direct references in `screen-routes.jsx` swapped to
  `colLetterArr(COL_BY_KEY.get(volKey))` (lazy-safe via the
  long-standing `typeof window[name]` guards in
  `scripture-resolution.js`).
- `VolumesHome` — pre-fires `__loadVotCorpus` on mount + subscribes.
  All direct `LETTERS_X` reads → `colLetterArr(...)`. `locked` flag
  reads `_votReady && _cnt === 0` so during the loading window no
  tile is locked (clicking lands on the wrapper's loading state).
- `HomeScreen` — pre-fires `__loadVotCorpus` on mount (~3 MB starts
  downloading in parallel with the user's tile-scan time).
- `SettingsScreen` — extends `_BOOKS_READY` guard with `_VOT_READY`;
  the `PROGRESS_GROUPS` array literal (which reads `LETTERS_V1`,
  `LETTERS_REBUKE`, etc. directly) only evaluates when BOTH
  corpora are ready.

Bundle sizes after Q8.3:
- bundle-a.js — 1.03 MB (vendor + small data + search infra)
- bundle-a-bible.js — 6.9 MB (lazy)
- bundle-a-matthew.js — 618 KB (lazy)
- bundle-a-vot.js — 3.0 MB (lazy)

Cumulative cold-boot reduction from baseline: **11.7 MB → 1.03 MB
(91% reduction)**. Mid-range Android cold-boot to first paint is
now bound by the ~1 MB critical bundle parse, not the 11.7 MB
total.

Visual smoke (all clean):
- Cold-boot direct to Home: renders Home tiles; corpus loaders
  pre-fire on mount.
- Cold-boot direct to Settings (saved tab): PROGRESS_GROUPS
  renders empty briefly, then fills with full book + collection
  counts once both Bible and VOT corpora arrive.
- Home → Prophetic Letters → Volume Two: brief "Loading…"
  placeholder, then 29 letter cards.
- Volume Two → "The Wide Path": full LetterView with content.
- Home → Studies: Matthew Study Bible pre-loads during scroll.
- Cold-boot direct to Acts 1: Bible "Loading…" then 26-verse
  chapter renders.

### Q8 closure summary

| Phase | Files moved | Critical-path delta | New bundle |
|---|---|---|---|
| Q8.1 (books.js) | 1 | 11.7 → 4.65 MB | bundle-a-bible.js (6.9 MB) |
| Q8.2 (matthew.js) | 1 | 4.65 → 4.03 MB | bundle-a-matthew.js (618 KB) |
| Q8.3 (all VOT) | 14 | 4.03 → 1.03 MB | bundle-a-vot.js (3.0 MB) |

Stays critical-path (1.03 MB total): react/react-dom/html2canvas
(341 KB), search infra (125 KB), books-restored.js (277 KB —
restored-name chrome overrides), matthew-plain.js (229 KB — NKJV
Matthew, referenced by inline scripture refs), matthew-nkjv.js
(54 KB — translation alternates).

---

## Q8.1 — books.js lazy-load (LANDED 2026-05-25)

`ea94158` lands the single-target pattern proof for bundle-a lazy
splitting. Cold-boot critical path: **11.7 MB → 4.65 MB (60%
reduction).** books.js (6.9 MB NKJV Bible) is the only file moved this
pass — other corpus files (matthew, 7 volumes, letters-* families,
WTLB, holy-days, hidden-manna) stay in bundle-a for now. Each will
get its own commit using the pattern proven here.

Build pipeline (`tools/build.py`): A → 26 files (4.65 MB critical),
A_BIBLE → 1 file (books.js, 6.9 MB lazy). `bundle('a-bible', A_BIBLE)`
emits `dist/bundle-a-bible.js`.

Runtime contract (inline in `index.html`):
- `window.__bibleCorpus = { loaded, _promise, _listeners, subscribe(cb),
  getVersion(), _notify() }` — a tiny React-18-compatible store
  exposed for `useSyncExternalStore`.
- `window.__loadBibleCorpus()` — returns a cached Promise; first call
  injects `<script src="dist/bundle-a-bible.js">`, on-load runs
  `__finishBibleInit()` + notifies subscribers + resolves.
- `window.__finishBibleInit()` — assigns `BOOKS["matthew-plain"] =
  MATTHEW_PLAIN`, builds `BIBLE_BOOK_LIST` (66 books in canonical
  order), populates `OT_BOOK_IDS` Set. Pre-Q8.1 these were eager
  `const` declarations directly inside an inline `<script>` block;
  now `var` (mutable) + `[]` + `new Set()` initially, with real
  population deferred until BOOKS loads.

App-side wiring (single-target pattern proof — only books.js, only
the access sites that fire BEFORE the user triggers ScripturesHome's
pre-load):
- **ScripturesHome** — subscribes to `__bibleCorpus` via
  `useSyncExternalStore`; pre-fires `__loadBibleCorpus()` in a
  mount-time `useEffect` so the corpus is already downloading by the
  time the user clicks a genre. `bibleLoaded` ternary renders skeleton
  `'—'` chapter counts until BOOKS resolves, then real numbers.
  `handleTile` / `handleBook` await the loader before navigating
  (defensive; usually loaded by then).
- **App()** — top-level subscription to `__bibleCorpus`. When BOOKS
  resolves, the whole render tree re-runs. `ALL_BOOKS` guards with
  `typeof BOOKS !== 'undefined' ? BOOKS : {}` so the pre-load state
  doesn't throw.
- **`bible-ch` / `bible-idx` ROUTES entries** (`screen-routes.jsx`) —
  when `book` is null (because BOOKS is undefined) AND the corpus
  isn't loaded, render a centered "Loading Bible…" placeholder AND
  trigger `__loadBibleCorpus()`. Handles the cold-boot-direct-to-
  bible-ch case (saved tab state).
- **`utils/tabs.js` `describeTab`** — resolves bookId via
  `(typeof BOOKS !== 'undefined' ? BOOKS[id] : null)` instead of
  bare `BOOKS[id]`. Bundle-b's IIFE captures `BOOKS` as a free
  identifier; a bare reference would throw ReferenceError during the
  pre-load window.
- **`use-nav-history-tracking.js`** — early-return for `bible-ch`
  branch if BOOKS isn't loaded (`const _BOOKS = window.BOOKS; if
  (!_BOOKS) return;`); a subsequent effect run after the corpus
  loads picks up the entry correctly.

Visual smoke:
- Cold-boot direct to Acts 1 (saved tab state from a prior session):
  renders the centered "Loading Bible…" card for the brief lazy-load
  window, then re-renders with all 26 verses + the proper section
  heading.
- Home → Scriptures: skeleton `'—'` flashes briefly, then real
  chapter counts fill in (5 OT genres, 5 NT genres, totals match
  pre-Q8 numbers: 187/249/243/183/67/89/28/100/21/22 chapters).
- Settings → translation toggle list (reads `BOOKS["matthew-plain"]`,
  `BOOKS["1corinthians"]`, etc.): renders correctly post-corpus-load.

Gates: lint ✓ typecheck ✓ vitest (476) ✓ build ✓

**Remaining BOOKS access sites NOT guarded this pass:**
`handleScriptureSelect`, `useAndroidBack`, `useNavigateToLink`'s
Bible branch, `useSearch`'s book-context computation,
`useReadingChainNav`'s `goToRevelationLast` + Revelation boundary,
`MatthewChapterView`'s chain-aware boundary. All of these fire
inside user-action callbacks that run AFTER ScripturesHome's mount
or AFTER an explicit Bible-bound nav (which trigger
`__loadBibleCorpus()` first). They'll be hit by an already-loaded
corpus in practice. Add guards in follow-up commits if smoke walks
surface a regression.

---

## Q8.0 — Bundle-a.js lazy-load analysis (DEFERRED, then SUPERSEDED by Q8.1)

`f7dff63` lands the analysis + implementation strategy doc at
`BUNDLE-LAZY-LOAD-PLAN.md`. The work is deferred to its own sprint —
the smoke matrix is ~30 screens (every BOOKS access site needs a
guard or await, including the first-paint Scriptures tile counts on
the home screen), which is a phase not a commit.

Key findings:
- `books.js` (NKJV) is 6.9 MB = 60% of the 11.3 MB cold-boot bundle.
  Single highest-leverage UX target.
- BOOKS is read by ~12 source sites (ScripturesHome, SettingsScreen,
  useAndroidBack, useBibleStudies, useNavigateToLink, useSearch,
  useSurprise, useNavHistoryTracking, MatthewChapterView,
  handleScriptureSelect, ...).
- search-data.js is 42 KB of named-passages / synonyms / stop-words —
  NO verse text. Search references resolve without BOOKS; only
  clicking a Bible result needs the corpus.

Recommended implementation (strategy B2 in the plan doc): build
pipeline emits `bundle-a-bible.js` separately; `window.__loadBibleCorpus()`
helper injects it on first call; ScripturesHome / Settings show
skeleton counts until BOOKS resolves; Bible-bound nav handlers await
the loader. Cold-boot drops from 11.3 MB → 3.8 MB parse + ~2 sec
saved on mid-range Android.

---

## P7 + P8 + P9 — App() decomposition (CLOSED 2026-05-25)

App.jsx: **1,815 → 797 lines** across two phases.

**Phase 1 — logic extraction (P7a-k, landed 2026-05-24)** — 11 hooks under src/hooks/: useNavHistoryTracking · useNav · useSearch · useBibleStudies (TDZ-blocker) · useJournalMutations · useTapThrough · useReadProgress · useReadingPositionNav · useReadingChainNav · useSurprise · useAppShellEffects. 465 vitest tests; line coverage broke 30%. Per [[concerns-not-lines]] the metric was concerns-remaining-inline, not host file size.

**Phase 2 — render-tree decomposition (P8a-c + P9a-g, landed 2026-05-25)** —
- **P8a (`c9b7be3`)** — ScreenRouter pilot: 26 trivial `{screen === X && <Y/>}` wrappers fold into a single ROUTES lookup table.
- **P8b (`3a49d3a`)** — 20 medium prop-thread screens fold in (46 entries total).
- **P8c (`cb6142f`)** — remaining 7 screens fold in (53 entries; zero inline `{screen === X && ...}` blocks left).
- **P9a (`084b2fb`)** — `BibleStudyChapterView.jsx`. The largest substantive inline JSX (88 → 30 lines): letterShim builder + jumpToStudy/handleLetterClick + LetterView prop threading. 28 explicit props (no spread).
- **P9b (`92ec3c2`)** — `MatthewChapterView.jsx`. Chain-aware boundary logic + ChapterView + ModeToggle (43 → 19 lines).
- **P9c (`2b41f49`)** — `HolyDaysPlaylistHeader.jsx`. Audio/video playlist conditional JSX with inline SVG icons (31 → 6 lines).
- **P9d (`4d38384`)** — `AppShellOverlays.jsx`. 4 overlays (welcome modal + tabs overview + TabActionSheet + disable-tabs prompt + garden warning) move out of App's return JSX into one shell component (137 lines).
- **P9e (`40f76ce`)** — `AppShellSheets.jsx`. 12 annotation/link/journal/bookmark sheets and popovers (SelectionToolbar, AnnotationActionChip, LinkSidebar, LinkPicker, VersePickerScreen, LetterExcerptPickerScreen, NoteSheet, NotebookPickerSheet, MultiNotePopover, BookmarkPopover, JournalInboundSheet, BookmarkCreateSheet) move into one shell component (186 lines).
- **P9f (`3eae5b4`)** — `buildScreenRoutes` factory in `src/ui/screen-routes.jsx`. The 560-line ROUTES table moves out; App() destructures ~90 closure deps into one explicit prop bundle and calls the factory once per render. Two bugs caught at extraction (missing `setStudyId` in history handler; `fromMatthewChRef`/`setFromMatthewCh` not in props for hm-letter). App.jsx: 1,412 → 888.
- **P9g (`5e1fda5`)** — Move 5 prop-builder helpers (colReadNavProps, colIdxProps, _idxNav, sharedViewProps, _navToChapter) INTO buildScreenRoutes (they're only used by ROUTES entries; the factory's destructure already captures the primitives they need). Legacy single-line extraction breadcrumb comments pruned per [[doc_pruning]]. App.jsx: 888 → 797.

**Phase 2 exit criteria — all hold:** every ROUTES entry >20 lines extracted to its own component file · ROUTES itself in its own file · overlay UI in AppShellOverlays · sheet/popover layer in AppShellSheets · App() under 800 lines · 5 pre-commit gates pass (check_balance + lint + typecheck + vitest 465 tests + build) · visual smoke walk completed for every extracted screen.

**Visual smoke methodology (Phase 2):** each extraction verified via preview_start + DOM-driven navigation through the route + preview_snapshot/screenshot comparison. Caught the placement-and-prop-threading bugs early; no regressions reached commits.

**Risk pattern observed:** the prompt's stated extraction priorities (e.g. "garden-view 240 lines") were stale; CLAUDE.md acknowledged this but the survey lived in the prompt. Audited current state of ROUTES before sequencing extractions, which surfaced that garden-view was already extracted (9-line wrapper) and 53→3 substantive blocks remained. [[expose-full-surface]] applied to the factory: hooks/components return their full computed surface; consumers destructure what they need.

---

## Q4 — JSDoc / `tsc --checkJs` (CLOSED 2026-05-24)

37 files typed: 11 utils + 11 stores (+ cached-store) + 15 hooks. Cross-bundle bare-name globals are ambient-declared as `any` in `tools/globals.generated.d.ts` (auto-generated alongside the ESLint globals file by `gen-eslint-globals.py`). App() and the `ui/` tree are deferred — that decomposition is its own phase (see PLAN.txt).

- **Q4.1 infrastructure** (`001747b`) — `tsconfig.json` flipped to `checkJs: true` + `strict: false` (permissive start); include narrowed to utils/stores/hooks; `_entry-b.js` excluded (bundler entry drags everything via imports). `@types/react ^19` + `@types/react-dom ^19` installed. `tools/gen-eslint-globals.py` extended to emit a parallel `tools/globals.generated.d.ts` — 331 `declare const X: any;` declarations + a `Window` index signature. CachedStore typed as the Q4 type root with a `CachedStoreBase<T>` generic typedef. CI `npm run typecheck` step zero-tolerance; pre-commit Step 3 runs full-project tsc (~3.5s) on any source-file stage. 11 stores + nav-index carry `@ts-nocheck` placeholders to be lifted in Q4.2/Q4.3.
- **Q4.2 utils** (3 commits — `8f8190d` + `83ec36b` + `46beecc`) — 11/11 utils with full JSDoc. NavItem / VerseRange / GardenTier / TabState / NoteShape typedefs introduced. The structural narrowing issue in nav-index.js's `base` literal (lines 358-364) resolved with a narrow `/** @type {any} */` cast on the local var, documented inline.
- **Q4.3 stores** (6 commits — `b349b02` + `a069466` + `1ac9a91` + `5a07653` + the journal-light pair + `7330105`) — 11/11 stores typed. Introduced `extendStore(base, methods)` helper in `cached-store.js` — wraps `Object.assign` with `ThisType<B & M>` so `this` inside the methods literal correctly resolves to BOTH the CachedStore base AND the sibling methods. Without that, plain `Object.assign` loses the base type through TS's narrow inference of object-literal methods. JournalMediaStore is the one outlier (IIFE / closure-state pattern, not CachedStore-based) — direct method JSDocs on the IIFE return object.
- **Q4.4 hooks** (3 commits — `e525e89` + intermediate + `0ae3d45`) — 15/15 hooks with `@param` + `@returns` annotations. Each hook's existing OWNS/PARAMS/RETURNS prose header from P6 stays in place; JSDoc adds the formal types the IDE consumes. `tabField` typed as `(key: string) => any[]` (heterogeneous tuple; TS doesn't auto-narrow array literals).
- **Q4 phase exit checks passed:**
  - 37/37 in-scope files clean under `tsc --noEmit`
  - `npm run lint -- --max-warnings 0` still exits 0
  - CI typecheck step is the regression gate; pre-commit Step 3 prevents commits from landing dirty
- **Bundle-b growth:** 302.1 KB → 320.1 KB (+18 KB) from JSDoc comments preserved in dev build. Esbuild keeps comments in unminified bundles; production minified build would strip them. Worth the cost for the typing.

**Post-Q4 follow-ups (logged in PLAN.txt):** useNavHistoryTracking extraction (app.jsx:814), useSyncExternalStore migration (eliminates Bin 4 hlTick cites), smoke-lite.js for CI, bundle-a.js lazy-load, App() decomposition. The decomposition unblocks typing app.jsx + ui/ in a future Q.

---

## Q2.7 + Q3 (2026-05-24, origin/main past `e162877`)

- **Q2.7-1 (`c1e3da1`) + Q2.7-1a (`9aa8571`)** — `function App()` extracted from inline index.html → `app/src/main/assets/src/app.js` (verbatim move, then sloppy-self-assign cleanup). App() is now bundled into bundle-d via `_entry-d.js`. Window scoping verified clean (lexical-env globals like `useState`, `BIBLE_BOOK_LIST`, `TabsContext` resolve correctly through bundle-d IIFE's scope chain — no `window.*` shims required).
- **Q2.7-2 (`b233cc3`)** — `src/app.js` → `src/app.jsx`, all 142 in-body `React.createElement(...)` calls → JSX literals + all 31 `Object.assign({...},...)` spread props → JSX `{...}` spread. Bit-perfect smoke. Bundle-d shrank 552.5 → 546.4 KB. jsx-progress total 156 → 3 (only the createRoot wrapping in index.html remains). **The "no JSX" original sin is closed.** Every React component in the codebase is now JSX.
- **Q3 (ESLint) IN PROGRESS** — `eslint-plugin-react-hooks` v7 + `eslint-plugin-react` + auto-generated globals (322 distinct identifiers, scanned mechanically from `_entry-*.js` + index.html + `src/data/*.js`). Generator runs as `npm run lint:globals`, chained before `eslint` in `npm run lint`, and via the pre-commit hook. Cumulative drop:
  - Baseline (Q3.1b): 154 errors / 216 warnings
  - After Q3.3a (rules-of-hooks, 2 real bugs): 152 / 216
  - After Q3.3a-compiler-disable (14 React Compiler rules off): 98 / 216
  - After Q3.3b (63 empty catches documented with 5 canonical reason comments): 35 / 216
  - After Q3.3c (26 unescaped-entities + 5 useless-escape, typography-aware): 4 / 216
  - After Q3.3d (`7eb491b` — 4 trivia: no-undef × 2 + no-global-assign × 1 + no-redeclare × 1): **0 / 216** ← Q3 hits 0 errors. Three real bugs + one config gap: (1) `surpriseMe` typo in app.jsx — SearchScreen's `/random` command was silently no-op'd for years (the actual handler is `handleSurprise`); the bug was masked by a `typeof === 'function'` guard. (2) `getStudyById` hook param was missing from `use-android-back.js` — would have thrown `ReferenceError` if the bible-study-chapter Android-back path ever fired (dormant because smoke doesn't visit that screen). (3) Two `var title` declarations in `BookmarksScreen.jsx` (bible vs journal branches) collided since `var` is function-scoped; switched both to `let` for block-scope. (4) `__scrollEl` is module-mutable (declared `let` in inline #3 at index.html) but the generator defaulted it to readonly; overridden to `writable` in `eslint.config.js`.
- **Q3.3f-catches/params/dead** (`6a40c89` + `0a1c3c1` + `313519a`) — 157 no-unused-vars triaged: 95 `catch (e)` → `catch (_e)`, 28 `_`-prefix on callback/destructure args, 34 dead-code sites removed (-59 net lines). Closes the no-unused-vars category. **0 / 59** ← Q3 hits 0 / 59-exhaustive-deps-only.
- **Q3.4 CI lint gate** (`cc5c2ad`) — `npm run lint -- --max-warnings N` step in `.github/workflows/ci.yml` between install and build. Errors are gated implicitly (eslint exits nonzero on any error); `--max-warnings` is the ratchet, starts at 59. Discovered there's no `--max-errors` flag — the 0-error floor is enforced for free by eslint's default exit behavior.
- **Q3.3e exhaustive-deps clear (59 → 0)** — 7 commits this session:
  - `a5a2531` — Q3.3e-hlTick: 24 cache-bust disables for the canonical `useMemo(() => SomeStore.get(hlKey), [hlKey, hlTick])` pattern. **New Bin 4 rationale class introduced**: hlTick is a store-mutation bump signal that ESLint flags as "unnecessary" because it can't see through the store-read boundary. Removing it would break highlight/bookmark/note refresh.
  - `5832d5f` — Q3.3e-android-back: mount-only disable for `useAndroidBack`'s 32-dep []-deps useEffect. Audited the 7 nav-helper params (app.jsx:509-905) to confirm they close only over stable setters and refs — no stale-closure bug, no conditional-hook anti-pattern. Disable cite enumerates all 11 useRefMirror refs by name for the exit-audit.
  - `11246a9` — Q3.3e-screens-batch1: 4 identity-cache + mount-only disables across ProphecyCard, BibleStudyIndex, WtlbEntryView, LetterView.
  - `bea2e55` — Q3.3e-easy-batch: 7 single-warning fixes (SearchScreen, LinkPicker, use-from-letter-stack, use-sheet-orchestration, use-thumbnails, BookmarksScreen, JournalRecordingSheet). Mix of Bin 1 (add the dep — onRequestRefine, setHlTick) and Bin 2/3 (intentional omit cites).
  - `143ed31` — Q3.3e-tab-actions: 7 setter-stability disables across `useTabActions`'s 7 useCallbacks. Verified all 7 deps lists were setter-only (plus cancelDwell at line 86, which has a ref-only body so stale-safe).
  - `939415f` — Q3.3e-app-jsx: 5 disables across app.jsx. Includes a post-Q3 extraction flag at line 814 (the auto-track history effect — use-history.js header already documented this as deferred because of App()-local helper deps; logged for `useNavHistoryTracking` extraction.)
  - `d955e98` — Q3.3e-final: last 11 across use-reading-dwell (incl. intentional identity-churn at line 95), use-scroll-memory, JournalEditorScreen, JournalViewerScreen, BookmarkCreateSheet (real Bin 1 refactor — extracted `pending && pending.X` to named consts). **CI ratchet locked: `--max-warnings 0`**. The ratchet phase is permanently retired.
- **Q3.3e exit audit (Task #3, closed at 0/0)** — Grepped all 55 `eslint-disable-next-line react-hooks/exhaustive-deps` cites across 31 files. Every cite's named identifiers (refs, setters, helpers) verified to be read in the corresponding effect/callback body. No cite says "covered by fooRef" without `fooRef` actually being read. Suppressions are honest.
- **Q3.5 pre-commit lint-staged** (`a545d81`) — Installed lint-staged ^17.0.5. Config: `app/src/main/assets/src/**/*.{js,jsx}` → `eslint --max-warnings 0`. Wired into `.githooks/pre-commit` as Step 2 (after corpus validation, before bundle rebuild). Sub-second per-file lint at the commit-message prompt; CI's full-repo lint stays as the catch-net. End-to-end verified with positive case (no-op edit passes) and negative case (intentional unused-var fails, working tree auto-reverted by lint-staged).
- **Bin classification framework** (established through Q3.3e):
  - Bin 1 — add the dep (eslint's recommended fix; safe when dep is a useState setter or stable callback)
  - Bin 2 — disable + ref-mirror / closure-stable cite (useRefMirror refs, local helpers that close over already-tracked values)
  - Bin 3 — disable + mount-only or setter-stability cite (intentional `[]`-deps; setters from useState passed through hook returns)
  - Bin 4 — disable + cache-bust / identity-churn cite (intentional pattern: hlTick bump signal, commitDwellNow identity churn for bridge re-binding)
- **Post-Q3 follow-ups flagged for separate sessions:**
  - `useNavHistoryTracking` extraction (app.jsx:814; use-history.js:13-14 already documents the deferred extraction)
  - `useSyncExternalStore` migration (eliminates Bin 4 hlTick cites; logged in PLAN.txt POST-Q3 section)
  - `smoke-lite.js` for CI (Node-runnable subset of tools/smoke.js — higher regression coverage than any remaining lint work)
  - Q4 (JSDoc/types): scope intentionally limited to hooks + stores + utils only; App() decomposition is its own phase before App() can be typed/tested meaningfully
- **Plan reordering**: the original quality-uplift-plan.txt sequenced ESLint as Q6 (last), reasoning "JSX must exist first." Now that JSX exists (Q2.7-2), ESLint moved to first-of-Q3-Q6 — it's infrastructure that JSDoc (Q4) and Vitest (Q5) layer on top of. CSS (was Q3) moves to last.

---

## P6 — App() hook extraction (COMPLETE)

All 15 hooks extracted: `useMarkAsRead` (P5d warmup), `useSavedState`+`_validateTabState` (P6a), `useRefMirror` (P6b), `useHistory` (P6c), `useThumbnails` (P6d), `useScrollMemory` (P6e), `useReadingDwell` (P6f), `useSettings` (P6g), `useSheetOrchestration` (P6h), `useFromLetterStack` (P6i), `useNavigateToLink` (P6j), `useTabs` (P6k-A), `useTabActions` (P6k-B), `usePersistedState` (P6k+1), `useAndroidBack` (P6l).

App() went from ~2,815 (P6d) to **2,191** lines. The 6-step extraction workflow held zero regressions across all of it. The P6l recon surfaced one pre-existing `[]`-deps stale-closure bug (`journalEntryId` read stale inside `useAndroidBack` → Android back from `journal-editor` was a no-op) — preserved verbatim by the P6l extraction, then fixed in the immediate follow-up `1c45b88` (journalEntryId mirrored via `useRefMirror` like the 9 nav reads).

**App() LINE COUNT progression**: ~2,815 post-P6d → 2,735 → 2,693 → 2,641 → 2,516 post-P6h → 2,461 post-P6i → 2,398 post-P6j → 2,323 post-P6k-A → 2,246 post-P6k-B → 2,241 post-P6k+1 → 2,191 post-P6l (all measured).

**Commits**: `80eed25` (P6i), `9031be9` (P6j), `aaef0f8` (P6k-A useTabs core + invariant 1), `70d646a` (P6k-B useTabActions), `4714a92` (P6k+1 usePersistedState), `96dee20` (P6l useAndroidBack), `1c45b88` (journalEntryId follow-up fix).

**FIXED — BookmarkPopover prop mismatch (discovered during P6h):** the `BookmarkPopover` render in index.html passed a `payload` prop, but `BookmarkPopover` (src/ui/screens/BookmarksScreen.js:371) destructures `{ bkmIds, x, y, onClose, onNavigate, onDeleteDone }` — so `bkmIds` was `undefined` and the component returned `null` at its line 381 every time; the inline-bookmark-icon tap popover never displayed. git-blame proved it: the component (`52ac90b2`) and its render call (`03c9fd32`) were committed 9 seconds apart on 2026-05-14 — mismatched from birth, a copy-paste of the sibling `MultiNotePopover` render. Fix: render now passes the real props — `bkmIds`/`x`/`y` unpacked from `bookmarkPopoverPayload`, `onNavigate` (resolves `bkm.hlKey` via `_bookmarkSourceEndpoint` → `navigateToLink`), `onDeleteDone` (`setHlTick` bump), `onClose`. Verified live.

**FIXED — bookmark inline icon missing on Bible/study verse views (`c828982`, 2026-05-21):** a bookmark made on a Bible verse (e.g. `bible:proverbs:2:1:0-69`) saved to `BookmarkStore` and appeared in the Library, but no inline icon rendered in the chapter. Root cause: Bible verses (`BibleChapterView`) and Matthew study verses (`ChapterView`) render each verse via the React `<HighlightableText>` component, NOT a `[data-hl-dom]` container — and `applyDOMBookmarks()` only walks `[data-hl-key][data-hl-dom]`. Fix: new `BookmarkIcon` component (`src/ui/components/BookmarkIcon.js`) mirroring `LinkIcon`. Rendered after `LinkIcon` at all 3 `HighlightableText` callsites (1 BibleChapterView, 2 ChapterView).

---

## OBJECTIVE G LANDED COMMITS (Build system)

- **G.1 (`f919017`)** — `tools/build.py` concatenates 139 `<script src>` tags into 4 cluster bundles (`dist/bundle-{a,b,c,d}.js`). Pure Python. byte-equivalent output to pre-G.1 load order. Smoke PASS identically.
- **Pre-commit hook fix (`47a87ee`)** — relocated `.git/hooks/pre-commit` → `.githooks/pre-commit` (versioned). Per-clone setup: `git config core.hooksPath .githooks`. Path inside `check_balance.py` updated to use `_HERE`-relative resolution (was stale `C:\` absolute path since P3.5b — silently dead validator). Extended hook with bundle-rebuild step: if any bundle source is staged, run `npm run build` and restage `dist/`.
- **G.2.0 (`47d1b70`)** — installed Node 24.15.0 (via `winget install OpenJS.NodeJS.LTS`) + esbuild 0.28.0 (via `npm install esbuild --save-dev`). `package.json` + `package-lock.json` committed; `node_modules/` gitignored. Toolchain installed, NOT yet invoked. Smoke PASS identically.
- **G.2.1 (`894b996`)** — Cluster C (renderer) → ES modules. 9 public exports across `dom-links.js`, `dom-bookmarks.js`, `annotation-engine.js`. New `src/renderer/_entry.js` is esbuild's entry — imports all + `Object.assign(window, {...})` for classic-script interop with the still-unconverted rest of the app. `tools/build.py` skips cluster C (`C = []`). `package.json` scripts: `build` chains python + esbuild; `build:c` = `esbuild ... --bundle --format=iife`. `dist/bundle-c.js` shrunk 49 KB classic-concat → 26.5 KB esbuild IIFE. Smoke PASS in 20.9s.
- **G.2.2 (`e429848`)** — Cluster B (stores + components + hooks + journal + scripture-resolution + letter-linking) → ES modules. 29 files, complex web of intra-cluster dependencies handled via a mix of explicit imports (for true eval-time deps like `CachedStore()` calls at module-top) and bare-name + window-bridge (for everything else). `_entry-b.js` lives at `src/stores/_entry-b.js`. Journal screens/sheets imported via wildcard so internal helpers (`JournalCardMenu`, `jrnRenderInline`, `JournalBlockView`) propagate to window without enumeration. `journal-helpers.js ↔ journal-store.js` true-cycle preserved with `typeof X !== 'undefined'` guards — eval-time safe because neither module touches the other at top level. Smoke PASS identically.
- **G.2.3 (`a4a4506`)** — Cluster D (screens + sheets + components + utils + late stores) → ES modules. 81 files, **131 exports added** by a mechanical transformation script (`tools/_g23_add_exports.py` — column-0 `function/const/let/var/class` → `export <kw>`, idempotency-guarded). New `src/ui/_entry-d.js` is esbuild's entry — explicit named imports (no wildcards needed; survey found NO true eval-time intra-D dependencies — every cross-file reference is inside a function body, so import ordering is irrelevant). `tools/build.py` now emits only `bundle-a.js`; the docstring + main() updated to reflect this. `package.json` `build` chains `python tools/build.py && build:b && build:c && build:d`. `dist/bundle-d.js` = 495 KB esbuild IIFE. **Strict-mode discovery**: ES modules are implicitly strict, so the in-function `_thumbDbPromise = X` / `_bibleStudiesPromise = X` assignments in `thumb-store.js` / `translations.js` would throw `ReferenceError` if those identifiers weren't bound at module scope. Same applies to any module-private mutable state. Fix: moved `THUMB_DB / THUMB_STORE / _thumbDbPromise / _translationPromises / _translationLoaded / _bibleStudiesPromise / GARDEN_TOTAL / GARDEN_TIERS / GARDEN_DEFAULT_TIER / gardenImageCache / EXPAND_THRESHOLD / MIN_HIDDEN_WORDS / GARDEN_PRELOAD_AHEAD / GARDEN_CRAWL_DELAY` into their owning modules. Used `export const` / `export let` for everything. Smoke PASS — 12/12 screens reached, 0 crashed, 0 unreached, both annotation round-trips exact-match to G.2.1 baseline (133+13 / 51+6 marks/icons), 0 console.error, 0 resource404.
- **G.2.3 follow-up** — 14 dead module-state declarations removed from index.html (the dupes left behind by G.2.3 since the modules now own those bindings). Three surgical edits, each leaves an audit-trail breadcrumb comment pointing to the owning module. Smoke PASS — globals still resolve via window (cleanup probes confirmed: `EXPAND_THRESHOLD: number`, `GARDEN_TIERS: object`, `GARDEN_DEFAULT_TIER: string`, `GARDEN_TOTAL: number`, `THUMB_DB: string`, `openThumbDB: function`, `loadTranslation: function`, `gardenPreload: function`), letter+wtlb annotation round-trips bit-perfect to baseline.

---

## PHASES LANDED (modularization push P0–P5g)

- **Phase-0 (`cedd7ed`)** — smoke harness (`tools/smoke.js` + `tools/SMOKE.md`). Globals audit + COLLECTIONS data-wiring + 12-screen render walk + annotation round-trip. Lives outside the shipped asset path; runs IN the app page via `preview_eval` or `chrome://inspect`. Green baseline captured here; every subsequent phase verified against it.
- **P1 (`dff8d7b`)** — annotation engine → `src/renderer/annotation-engine.js` (9 symbols, ~345 lines: `snapRangeToWords`, `annMarkClass`, `HighlightableText`, `findNoteIconInsertionPoint`, `_markCharEnd`, `applyNoteIcons`, `applyActiveNoteState`, `applyDOMHighlights`, `StaticSubtree`). `HighlightableText` upgraded to `React.useMemo` for self-containment.
- **P2 (`675b12b`)** — CSS-in-JS → static `app.css` + `<link>` in `<head>`. **Eliminates the `const CSS = \`...\`` backtick-template-literal black-screen footgun entirely** (no template literal anywhere). Only transform needed was `\\2060` → `\2060` on 2 word-joiner lines (provably the only backslash sequences in the 4.4k-line block). CSP `style-src 'self'` already permitted `<link>`. React `<style>` consumer replaced with a no-op `null` child.
- **P3 (`51a9972`)** — scripture/data resolution → `src/data/scripture-resolution.js` (27 symbols: `COLLECTIONS` registry + `COL_BY_*` derived maps + `parseRefStr` / `findBook` / `parseScriptureRef` / `resolveVerseText` / `findEntryContext` / `lookupVersesFromBooks` + `colLetters`/`colPreface`/`colLetterArr` + `LETTER_SCREEN_SET` + `_allBooks`/`_matthew`/`_studies` + `READING_CHAIN` + boundary helpers).
- **P3.5a (`b1a79ee`)** — the 5 remaining inline stores → `src/stores/`: `cached-store.js` (factory, loads first), `annotation-store.js` (+ `HighlightStore` alias + `migrateAnnotations` + the on-load migration call), `note-store.js`, `notebook-store.js`, `recent-nav-store.js`. Every store now lives in its own module — none left inline.
- **P3.5b (`d952c23`)** — all 29 raw corpus data files moved `app/src/main/assets/data/` → `app/src/main/assets/src/data/` via `git mv` (preserves history). 25 path references updated (21 static `<script src>` + 2 dynamic in `index.html` for `loadTranslation` + lazy bible-studies + 2 in `search.js`). Empty `data/` dir removed. **Single home for all data + code under `src/`.**
- **P4b–P4e (`3fa54d5`, `8ee6cbb`, `10fce2a`)** — the 4 big reading-screen components → `src/ui/screens/`: `LetterView.js` (~27 KB), `WtlbEntryView.js` (~18 KB), `BibleChapterView.js` (~13 KB), `ChapterView.js` (~12 KB).
- **P5a (`ed5603d`)** — 9 remaining screens → `src/ui/screens/`: `HomeScreen`, `SettingsScreen` (~38 KB, the largest), `HistoryScreen`, `SearchScreen`, `NotesIndexScreen`, `LibraryScreen`, `AboutScreen`, `VolumesHome`, `StudiesHome`. ~123 KB / ~3,000 lines.
- **P5b (`36657e5`)** — 23 shared components → `src/ui/components/`: `Segments`, `FootnoteSheet`, `InAppLinkButton`, `ScreenLayout`, `NavButtons`, `LibraryNav`, `ProphecyCard`/`Group`/`ExpandToggle`, `ThemeBtn`, `HomeBtn`, `TabsNavBtn`, `StickyChapterNav`, `ModeToggle`, `ChapterBookmarkBtn`, `ExpandableVerse`, `VerseWithNumbers`, `ScriptureSheet`, `ScriptureVerseText`, `FootnoteListSection`, `InlineNotes`, `InlineEcho`, `StudyPanels`. ~88 KB.
- **P5c (`8cf2081`)** — 11 sheet/picker components → `src/ui/sheets/`: `SelectionToolbar` (~34 KB, by far the largest), `NoteSheet`, `VersePickerScreen`, `LetterExcerptPickerScreen`, `LinkPicker`, `TabsOverview`, `AnnotationActionChip`, `NotebookPickerSheet`, `TabActionSheet`, `LinkSidebar`, `MultiNotePopover`. ~92 KB / ~1,900 lines. Bottom-up extraction order. Zero new console errors introduced.
- **P5d (`5ea3e66`)** — VolumeIndex consolidation + 18 small components/hooks. Deleted legacy `VolumeIndex` (V2-hardcoded) and `VolumeOneIndex` (V1-hardcoded); both call sites now use the generic `VolumeLetterIndex`. All 14 collections share ONE index component. Extracted: `SrchCard`/`SrchSnippet`/`SrchGroup`, `ClearProgressRow`/`SettingsRow`/`SelectField`, `VolumeLetterIndex`, `HistoryEntryCard`, `NoteRow`, `LinkCard`/`LinkIcon`, `NotebookManagerSheet`, `BibleStudyIndex`/`ChapterIndex`/`GardenView`/`ScriptureGenre`/`ScripturesHome`, `ErrorBoundary` (class), and `useMarkAsRead` (FIRST hook extracted — P6 warmup). Hardened extractor with proper JS brace-matching.
- **P5e (`449dd46`)** — 46 helpers extracted to 13 domain bundles via new `tools/_p5e_bundle_helpers.py` (same brace-match logic, multi-function-per-file). Buckets: `utils/hl-keys` · `utils/dates` · `utils/garden` · `utils/tabs` · `utils/nav-index` (16 KB — LinkPicker's brain) · `utils/note-source` · `utils/book-category` · `utils/scripture-parse` · `utils/highlight` · `utils/render-text` · `utils/search` · `stores/thumb-store` · `data/translations` · `data/letter-linking`. Load-order fix landed: letter-linking.js must load BEFORE the big inline `<script>` block (top-level boot code calls `linkPreface`/`linkWtlbEntries` at module scope).
- **P5f (`72c6b7d`)** — dead-code audit. Removed `ann.style` defensive fallback guards (5 sites — one-shot annotation migration makes them unreachable). Discipline directive ("real bugs surface, never bandaid") kept: the `|| 'highlight'` default stays for kind-less entries, only the dead style→kind translation is gone.
- **P5g (`1693715`)** — smoke harness hardened. CSP-safe `resolve()` (window-first, eval fallback only when privileged — works under production CSP); `EXPECTED_GLOBALS` expanded with all P5d/P5e symbols (50+ new probes); new `wtlbAnnotationRoundTrip()` exercises the WtlbEntryView path. 11 lexical-only consts mirrored to `window` via a tiny inline script at end of body. Live-verified: **PASS | globals ok | data ok | 12 screens 0 crashed | letterAnn ok | wtlbAnn ok (51 marks + 6 note icons) | 0 console.error | 18s**.

---

## Recent landings (chronological)

**2026-05-19** — Status truth-up + stale-flag clearance. User-confirmed on real device this session: Journal voice recording WORKS on PC + Android (clears the §22 "needs on-device APK test" caveat); app icon finalized → Objective D FULLY complete (only release-signing deferred by policy). The 05-15 "IN PROGRESS" items — keyboard-aware sheets via visualViewport `--keyboard-height`, and BookmarkCreateSheet edit-mode + `__bookmarkEdit` bridge — are CONFIRMED complete and on-device-verified. Commit `2db70f5` landed: the annotation-nav crash + stale-content corruption ROOT fix (new `StaticSubtree` freezes each `[data-hl-dom]` block + content-keyed remount so React never reconciles the text nodes `applyDOMHighlights` splits/re-parents → kills both the `removeChild` NotFoundError crash AND the prev-letter-bleeds-into-next corruption; footnote active-state moved to a DOM class toggle; pipeline try/catch + stale-node guards), footnote title de-dup (`_fnTextRedundantWithLink`), Library `onSettings` threaded to all 7 sub-screens, and journal-stats wiring (orphaned `journal-stats-store.js` now loaded + recompute on boot + record create/delete).

**2026-05-15 (Journal voice recording)** — Rearchitected + cross-platform mic fixes. DESKTOP: `index.html` CSP had `media-src 'none'` which silently blocked EVERY `<audio>` blob: URL on all platforms; changed to `media-src blob:`; waveform amplification `rms*3`→`rms*8`. ANDROID: replaced the unreliable WebView `getUserMedia` path with a NATIVE Kotlin `MediaRecorder` bridge (AAC/.m4a in cacheDir). See "Journal voice recording" section below.

**2026-05-15 (Library hub feature push)** — Links system (schema migration {a,b}→{source,target} with source/target visual distinction on inline icons, LinksScreen browser, Library "My Links" tile, two adjacent fixes); Bookmarks system (full Library tile + BookmarksScreen browser, BookmarkStore + applyDOMBookmarks with creation-pulse animation, `thought` field on every bookmark with inline edit in popover + action sheet, chapter-level NavButton on every reading screen, date surfacing across BookmarkPopover / NoteSheet / LinkSidebar cards, Android SVG-fill icon visibility fix, read-more / collapse for long thoughts, pre-commit BookmarkCreateSheet replacing silent-add).

**2026-05-14** — bible-studies.js lazy-loaded (b9b769b — removes 4.3 MB from cold-boot; studiesLoading indicator in StudiesHome); .git/hooks/pre-commit added to auto-run check_balance.py on data-file commits.

**2026-05-12 (Objective D autonomous finish)** — Android 12+ SplashScreen API holds until WebView's first paint, JS-side "Keep Screen On While Reading" toggle in Settings → Reading Experience bridging the Kotlin setKeepScreenOn at ac439b3, [object CSS] React #31 investigation closed as Android-only or already silenced by the Objective E batch.

**2026-05-11 (Objective C complete + Objective E Android polish)** — improvement2.txt Day 1 + Day 2 footnote system + 10 §12 critical bugs + WTLB attribution tap-through + universal single-shot back-pill + Day 4-5 polish + 3 footnote audit fixes from a parallel session; About screen + first-run flow gated by `vot-about-seen`; all 9 session commits fast-forward-merged into `origin/main` at `b19f511` so the GitHub repo's `main` is now the canonical "live" version; AI deferred indefinitely per user direction.

### Recent landings on `claude/jovial-yalow-bf2629` (2026-05-11)

- Objective A: junction verified, NIM proxy infrastructure entirely deleted, 9 `.bak-pre-*` files (~39 MB) + `orama.min.js` (~70 KB) deleted from the asset tree
- Objective B: `allowBackup="false"`, app name + `<title>` = "VOTReader", `migrateAnnotations` silent-flag-on-failure fixed, `vot-state` save warns on quota now, Settings → "Your Data" section with Export / Import / Clear All Personal Data (verified live)
- improvement2.txt Day 1: back-pill missing space, handleAndroidBack Library + Notes-Index cases, SCHEMA_VERSION 11→12, removed two no-op settings (`searchFuzzy`/`searchAllTranslations`), welcome catch return value (verified live)
- Objective D piece: AboutScreen + home-nav `i` button. Home now has two buttons side-by-side in the upper left — cross icon reopens the splash image (titled "Welcome image"), new `i` icon opens the About VOTReader screen. About uses a card layout with 3-diamond ornaments top + bottom, "ABOUT VOTREADER" Cinzel uppercase heading, 4 EB-Garamond paragraphs, and a gold-outlined CONTINUE button. First-run flow: splash → ✕ → About auto-opens (only once, gated by new `vot-about-seen` localStorage flag) → CONTINUE → home.
- improvement2.txt Day 2 (footnote system) — silent verse-blank fallback, fn.link+fn.url coexistence, prev/next nav inside the sheet ("Footnote N of M" + circular ‹/› buttons), `.fn-ref.active` visible on touch (`activeFn` now reads `sheetFn ?? highlightedFn`), and tap-to-scroll-back from FootnoteListSection (bubble lookup via new `data-fn-num` attribute). Verified live on Volume 2 / "The Wide Path".
- §12 critical bugs — ALL 10 LANDED:
    - Prophecy card persistence (setExpanded now handles updater fn)
    - Matthew Study note labels (verse at p[2] not p[3] for studies)
    - NoteSheet startInEditMode (key prop forces remount on groupId change)
    - destSnapshot null/undefined matcher (loose-equal nullish — pill now shows)
    - Phantom empty notes (zero-segment + zero-width guards in handleNote)
    - Holy Days letter-type note routing (findEntryContext HD fallback)
    - WTLB Part 1 + 2 intros (data-level — emphasis spans now line-contained)
    - 20 D8 glued-text bugs in WTLB One/Two (regex sweep with backslash-aware lookbehind)
    - Translation-tagged inline refs (lookupVersesFromBooks honors p.tag + lazy-loads)
    - Android hardware back button (MainActivity.kt — evaluateJavascript window.handleAndroidBack, finish() on "false")
- WTLB attribution tap-through: `[From "Title" ~ Volume N]` inline patterns in WTLB/Blessed are now live letter-links. WtlbEntryView's renderLine got a new split pattern; the parsed volume number maps to "Volume One"..."Volume Seven" via `_attrCollectionLabel` and calls `onInAppLink` with source meta so the destination pill reads "Back to <Part Label> · <Entry>".
- All back-pills universally single-shot: `openInAppLetter` now computes a `destSnapshot` from the resolved letter (studies + regular). The existing prune useEffect + `_destMatches` now hide the pill the moment the user navigates away from the destination. Every back-pill in the app — Notes index, footnote tap-throughs, attribution links, letter-link segments, addendum cards — is single-shot.
- **Objective D Kotlin + manifest + CSP batch:** WebChromeClient.onConsoleMessage routes JS console to Logcat as `WebViewJS` tag; URL-scheme allowlist (`https`, `http`, `mailto`, `tel`) in shouldOverrideUrlLoading replaces the previous "anything to ACTION_VIEW" behavior; `Type.ime()` added to window-inset injection so floating UI moves above the soft keyboard; `setKeepScreenOn(Boolean)` AndroidBridge method; `launchMode="singleTask"` + expanded `configChanges="...|smallestScreenSize|uiMode|screenLayout"`; CSP meta tag with policy locking to `self` + appassets-loader host + GitHub raw for Garden images + thevolumesoftruth.com for the online-check ping.
- **Build-fix note:** the gradle "Unable to delete directory" build failure user hit is a Windows file-lock issue (gradle daemon / OneDrive sync / AV scanning), not a code bug. Fix: `./gradlew --stop` then `rm -rf app/build/`. Long-term: tell OneDrive to ignore `app/build/`, add AV exclusion.
- **Footnote audit fixes** — three broken cross-link `letterTitle` mismatches: (1) `letters-timothy.js` "the-shadow-of-the-almighty" fn1 — ASCII apostrophe replaced with U+2019; (2) `letters-flock.js` "a-wise-servant-and-the-line" fn1 — removed trailing `.`; (3) `volume-six.js` "full-circle" fn2 — removed broken `link` object (was pointing at an external wiki article name, not a VOT letter).
- improvement2.txt Day 4-5 polish — ALL DONE:
    - MATTHEW.chapters.length guarded via `_matthew()?.chapters?.length || 0`
    - LinkPicker overlay z-index 8500 → 8502 (above NoteSheet)
    - Keyboard focus indicators restored via `:focus-visible` + `:focus:not(:focus-visible)` pair
    - cancelDwell() added to switchToTab (no more wrong-tab mark-as-read)
    - NoteSheet textarea scrollIntoView on focus (Android keyboard)
    - NotebookPickerSheet title "Add to Notebook" / "Manage Notebooks" context-aware
    - SelectionToolbar + NoteSheet + AnnChip + MultiNote all auto-dismiss on screen/letter/book/chapter/study navigation via App-level useEffect + window.__hideSelectionToolbar bridge
    - 12 http:// URLs upgraded to https:// across 5 data files (check_balance.py passes)

---

## Section 14 — Sweep progress log (data audit)

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

---

## Section 14.5 — PDF / Studies sweep (Phase 3)

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

The renderer's `Segments` function handles `letter-link` segments and routes through `openInAppLetter` for proper tap-through + back-pill behavior.

---

## Section 14.6 — Phase 3 fixes log (post-spot-check)

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

---

## Section 14.7 — Studies integration (Phase 4 — completed 2026-05-03)

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

Fix: changed matthew-nkjv.js key from `"wedding garment: Colossians 3:9-10"` to `"Wedding Garment: Colossians 3:9-10"`. Now matches the cite case-exactly → renderer's `hasVerse` check returns true → button branch with onScriptureClick → opens scripture sheet with Colossians 3:9-10 NKJV text → back-pill works as expected.

Also normalized the verse text: dropped the redundant "Colossians 3:9–10 — " prefix (cite header already shows it) and converted the Unicode superscript "¹⁰" mid-text to the standard `"9. text 10. text"` decimal-marker format that triggers the gold inlay verse-sup rendering.

**Audit tools created (kept in project root for re-use):**
- `excerpt_audit.py` — extracts every `(An excerpt from "X" - Y)` from OCR, confirms each title exists somewhere in the data
- `misattribution_check.py` — fingerprint-matches OCR attributions against data letter-links, flags title mismatches
- `ocr_gap_check.py` — programmatic phrase-coverage check
- `check_balance.py` — JSON validity check across all data files

---

## Section 20 — Objective E (Android polish batch, 2026-05-11)

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

## Section 21 — Objective D autonomous finish (2026-05-12)

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

### 21.2 JS-side "Keep Screen On While Reading" toggle

The Kotlin bridge for this landed at `ac439b3` but no JS-side Settings UI was wired. Now closed in three edits in `index.html`:

1. Settings defaults block: added `keepScreenOn: true,` next to `haptic: true,`.
2. SettingsScreen Reading Experience section: added a `SettingsRow` ("Keep Screen On While Reading" / "Don't let the screen dim or lock while the app is open. Helpful for long reading sessions; turn off to save battery. Has no effect on desktop browsers.") as the last row in the section, immediately before the "Tabs, Search & History" divider.
3. App() useEffect that toggles body classes + calls `setLightStatusBar`: added
   ```js
   if (window.AndroidBridge && typeof window.AndroidBridge.setKeepScreenOn === 'function') {
     window.AndroidBridge.setKeepScreenOn(settings.keepScreenOn !== false);
   }
   ```
   so the Kotlin bridge fires whenever settings mutate. On PC the bridge is `undefined` and the call is no-op.

Verified live in Chrome preview.

### 21.3 [object CSS] React #31 warnings — closed as not reproducible

The handoff reported "12 instances per render" of Minified React error #31 with `args=[object CSS]`, pre-existing and stable across page changes. Investigation this session:

- Patched `window.React.createElement` to capture any call with a CSS-typed child (`window.CSS` or `constructor.name === 'CSS'`).
- Drove the app through Home → Volumes Home → Volume One Index → preface letter → "The Wide Path" letter, watching the capture buffer and `console.error` / `console.warn` streams.
- Result: **zero** CSS-typed-child captures, **zero** React #31 firings, **zero** render-time warnings.

Two equally-likely explanations: (1) Android-WebView only (now diagnosable via `adb logcat -s WebViewJS`); (2) already silenced by the Objective E batch (`641b031`). Closing the investigation as not actionable without a real Android device.

---

## Section 22 — Journal voice recording (dual-path architecture, 2026-05-15)

The journal voice-memo recorder (`app/src/main/assets/src/ui/sheets/JournalRecordingSheet.js`) had two **independent** failures, root-caused by two parallel research agents and fixed together. This section is the canonical reference for how recording works now.

### 22.1 The two original bugs

| Platform | Symptom | Root cause | Fix |
|---|---|---|---|
| **Desktop** (Chrome/FF/Edge) | Mic permission granted, but waveform flat, preview silent, saved audio silent | `index.html` CSP line had `media-src 'none'` — this blocks **every** `<audio>`/`<video>` `src`, including `blob:` URLs, on all browsers + Android WebView. Recording always worked; playback could never load the blob. Live-tested error: `MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check`. | `media-src 'none'` → `media-src blob:` (index.html ~line 18). Verified live: `<audio>` reaches `readyState 4`. |
| **Desktop** (secondary) | Waveform barely moved even when audio captured | `var lvl = Math.min(1, rms * 3)` — speech RMS is ~0.02–0.06, so 3× → ~4–10px bars on a 56px max (reads as flat) | `rms * 3` → `rms * 8` |
| **Android** (Pixel 9 Pro, all OEMs) | "Requesting…" ~2s → "Could not open the microphone" | WebView Chromium `getUserMedia` rejects with `NotReadableError`/`TrackStartError` even with RECORD_AUDIO granted + no other app recording. | **Rearchitected to a native Kotlin recorder** (see §22.3). |

### 22.2 WebView getUserMedia hardening (still active on desktop; dead-defense on Android)

These were the first-pass Android fixes. The native path (§22.3) supersedes them on Android, but they're kept (zero cost, still protect the desktop getUserMedia path):

- `AndroidManifest.xml`: `<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />` (normal perm; lets WebView's internal `setMode()` work)
- `MainActivity.kt` `AppInterface.startAudioSession()` / `endAudioSession()` — sets `AudioManager.MODE_IN_COMMUNICATION` during capture, restores prior mode before playback. JS calls `startAudioSession()` after `getUserMedia` resolves, `endAudioSession()` in `rec.onstop` + `cleanup()`. (Native path does NOT call these — MODE_IN_COMMUNICATION is wrong for MediaRecorder.)
- `MainActivity.kt` `onPermissionRequest` already-granted fast-path: 250ms `webView.postDelayed` before `request.grant()` (matches the delay in `micPermissionLauncher` / `micPrepLauncher`)
- `JournalRecordingSheet.js` `beginCapture()`: `getUserMedia` retries `NotReadableError`/`TrackStartError`/`AbortError` 3× with 400/800/1200ms back-off; watchdog re-armed per attempt; error copy no longer falsely says "in use by another app"
- `JournalRecordingSheet.js`: the `AudioContext`/analyser block is wrapped in `if (!isAndroid)` (`isAndroid = !!window.AndroidBridge`) — the dual-consumer stream is what crashes AAUDIO devices

### 22.3 The native Android recorder (the robust path — current production design)

**Why:** WebView `getUserMedia` is the single fragile component across the Android version / WebView-build / OEM-audio-HAL matrix. Native `android.media.MediaRecorder` is the same OS API every voice-memo app uses — reliable everywhere, and exposes `getMaxAmplitude()` so the live waveform works on Android again.

**Kotlin (`MainActivity.kt`)** — state fields guarded by `recLock` (the `@JavascriptInterface` methods run on a binder thread, not main): `nativeRecorder: MediaRecorder?`, `nativeRecordFile: File?`, start/pause-accum timestamps. Records **AAC in MPEG-4 (`.m4a`)** via `MediaRecorder` (`MIC` → `MPEG_4` → `AAC`, 96 kbps / 44.1 kHz) to a temp file in `cacheDir`. Bridge methods on `AppInterface`:

| Method | Returns | Purpose |
|---|---|---|
| `nativeRecordStart()` | `"ok"` / `"error:<reason>"` | rechecks RECORD_AUDIO, creates+prepares+starts MediaRecorder |
| `nativeRecordPause()` / `nativeRecordResume()` | `"ok"`/`"error:…"` | `MediaRecorder.pause()`/`resume()` (API 24+, minSdk is 26) |
| `nativeRecordAmplitude()` | `Int` 0..32767 | `MediaRecorder.getMaxAmplitude()` — drives the waveform |
| `nativeRecordStop()` | (async) | stops, reads file, base64, → `postNativeComplete()` |
| `nativeRecordCancel()` | — | stop+release+delete temp file, no callback |

`postNativeComplete(base64, durationMs)` is a private `MainActivity` method (touches `webView`): `webView.post { evaluateJavascript("window.__onNativeRecordingComplete(arg,dur,'audio/mp4')") }`, `arg` is `null` on failure. `onDestroy()` releases a still-running recorder + deletes its temp file. `MediaRecorder(context)` ctor on API 31+, deprecated `MediaRecorder()` below.

**JS (`JournalRecordingSheet.js`)** — `startCapture()` is the dispatcher: `window.AndroidBridge.nativeRecordStart` exists → `beginNativeCapture()`; else (desktop) → `beginCapture()` (the unchanged getUserMedia path). The 4 post-permission call sites in the permission gate were changed from `beginCapture()` → `startCapture()`. `beginNativeCapture()` mirrors the existing UI state machine (requesting → recording ⇄ paused → preview → save/discard): a `tickRef` duration timer keyed off `nativeStateRef` ('recording'|'paused'|'inactive') and an `ampRef` 80ms interval polling `nativeRecordAmplitude()` (`lvl = Math.min(1, Math.sqrt(amp/32767)*1.8)`) into the same `samplesAccumRef`/`setWaveLive` buffer. `window.__onNativeRecordingComplete` (registered in the mount `useEffect`, deleted in its cleanup alongside `__onMicPermissionResult`) builds a `Blob` from the base64 and feeds the **unchanged** preview / `JournalMediaStore.put` / `onSave` pipeline — it honours `pendingSaveRef` exactly like the getUserMedia `rec.onstop` did (Save tapped before the blob arrived). `pauseRecording`/`resumeRecording`/`stopRecording` branch on `nativeRef.current` first. `cleanup()` calls `nativeRecordCancel()` (idempotent — Kotlin no-ops on null recorder) and clears `ampRef`. New refs: `nativeRef`, `nativeStateRef`, `ampRef`.

**Downstream unchanged:** `.m4a`/`audio/mp4` is universally playable by `<audio>` and stores as a `Blob` exactly like the old WebM, so `JournalMediaStore`, the viewer's `JournalAudioBlock`, and previously-saved recordings are unaffected. The base64-over-`evaluateJavascript` handoff matches the existing import/export bridge pattern; fine for typical memos, heavy only near the 5-min cap (acceptable, not yet optimized).

### 22.4 Status / caveats

- **Desktop**: verified live in the preview (CSP `media-src blob:` confirmed; `<audio>` blob reaches `readyState 4`; `startCapture()` confirmed routing to `beginCapture()` when no `AndroidBridge`; app loads with zero console errors; JS syntactically valid). No regression.
- **Android**: ✅ CONFIRMED working on real device by the user (2026-05-19) — prompt → recording with moving waveform → preview playback → save all function correctly.
- All of the above was **committed in `2db70f5`** (2026-05-19) as part of the one bundled commit, alongside this session's annotation-crash / footnote-dedup / Library-settings-gear / journal-stats fixes.
- minSdk = 26 (gradle), so `MediaRecorder.pause()/resume()` (API 24+) are always available.

---

## Outstanding / future work

1. **Studies (deferred per user):** Bible/Letter Studies (`bible-studies.js`, `matthew.js`) skipped the main sweep. The user's screenshots showed similar D-patterns there (doubled superscript markers in John 17:20-23, parser glitch in 1 Cor 7:32-35 cite). To be addressed in a future sweep.
2. **Format-style migration (V2-style unquoted keys across all collections):** Possible future task; cosmetic only, no functional impact.
3. **Holy Days content sync:** Now that source volumes are clean, a verification pass could confirm Holy Days excerpts match their source verbatim (currently they're independent copies, so source updates don't auto-propagate).
4. **WTLB orphan brackets removal philosophy:** All [N] markers in WTLB were treated as Type C (vestigial) and deleted. If the user wants any of these to be preserved as cross-references, would need to revisit per-entry with live wiki access.

Remaining Objective D items (handoff §3 / PLAN.txt §19):
- ☐ App icon + monochrome icon layer for Android 13+ themed icons (needs design assets).
- ☐ Release signing config (deferred until Play Store discussion — Timothy's permission first per user policy).

Bigger objectives still open (PLAN.txt §19):
- ☐ E — Data unified (wire `data-normalize.js`, unified `resolveScriptureText`, migrate 28 files).
- ☐ H — Library completes (Bookmarks, Journal, Highlights & Underlines tiles).
- ☐ I — Reading-app baseline (TTS, in-app video, synonyms, sepia, font controls).
- ☐ K — PWA evaluation (architectural decision pending user input).

---

## The "Big Sweep" plan — per-letter data audit (workflow used 2026-05-03)

### Goals
1. Every letter has complete metadata: `id`, `num`, `title`, `date`, `from`, `spoken`, `forLine`, `audioUrl` (if exists on site), `videoVoiceUrl` (if exists), `videoMusicUrl` (if exists), `soundcloudUrl` (if exists), `relatedTopics[]`, `prevLetter`, `nextLetter`.
2. Every footnote has hardcoded NKJV verse text in the letter's `nkjv` dict (unless `(ASV)`/`(KJV)` tag specifies otherwise — then bake that translation's text).
3. Compound refs use `" | "` separator with `"Book X:Y — verse text | Book A:B — verse text"` form.
4. Cross-letter footnotes use `{ type: "note", text: "Also read: ...", link: { collection, letterTitle } }` OR `{ type: "scripture", ref, seeAlso: { collection, letterTitle, label } }` for combined.
5. No leftover `[matthew4:4]` glued-text patterns. All text properly spaced at source.
6. WTLB / The Blessed: simple `(Ref)` parenthetical cites — NO numbered footnote bubbles (they're short-form).

### Volume Two = gold standard
Volume Two has the most uniform, complete metadata structure:
- Every letter has all media URLs that exist on the site
- `relatedTopics` is consistently populated
- Footnotes use mixed `scripture` + `note` types correctly
- `nkjv` dict is complete per letter

**Model all other volumes (V1, V3-V7, Flock, Timothy, Rebuke) on Volume Two's structure.**

### Sweep order used
1. Foundation fixes (B1-B4) — fix renderer bugs FIRST so when we sweep, fixes are consistent
2. Holy Days album (16 entries) — user requested first
3. Volume Two (gold-standard, smaller diffs)
4. Volumes One, Three, Four, Five, Six, Seven
5. Lord's Rebuke
6. Letters to the Flock
7. Letters from Timothy
8. WTLB Part One, WTLB Part Two
9. The Blessed
10. Final cross-collection verify

### Sub-agent dispatch protocol

- Use **Haiku 4.5** sub-agents with `subagent_type: general-purpose` and `model: haiku`.
- **One letter per agent** — bite-sized, verifiable.
- Pass agent: (a) the existing data in the file, (b) the live website URL for that letter, (c) explicit instructions on metadata fields and footnote format.
- Dispatch in parallel batches of 4 (not more — agent quality degrades when many run at once and verification load grows).
- After each agent returns, **read the diff** to verify before moving on. Do not chain sweeps; verify between each.
- Prefer Edit (string replacement) over Write (full file rewrite) so changes are easy to review.

### Wiki source-of-truth

The website thevolumesoftruth.com is a wiki. Letter pages live at canonical URLs like `https://www.thevolumesoftruth.com/<Page_Name>` (underscores between words, exact case).

For agents:
- Fetch ONLY the canonical staged page — e.g. `https://www.thevolumesoftruth.com/The_Wide_Path`
- DO NOT fetch revision history URLs (`?action=history`, `oldid=...`, `&diff=...`) or talk pages
- DO NOT fetch ?action=edit or printable version URLs
- If a fetch returns a duplicate/revision/redirect, REPORT and stop — do not infer

URL slug derivation:
- Title "The Wide Path" → `/The_Wide_Path`
- Title with apostrophe "I AM He" → check for variants since wiki may URL-encode or strip punctuation
- When in doubt, the existing data file's `audioUrl` Bandcamp slug usually matches the page slug pattern (lowercase, hyphenated)

### Sub-agent instruction template

```
You are auditing ONE single letter in a data file. Be surgical.

==== INPUTS ====
DATA FILE: app/src/main/assets/src/data/<file>.js
LETTER ID: <id>
LETTER TITLE: <title>
LIVE URL: https://www.thevolumesoftruth.com/<URL_slug>
GOLD STANDARD: app/src/main/assets/src/data/volume-two.js letter id "the-wide-path" — copy that shape EXACTLY for metadata, footnote format, and nkjv dict.

==== THE 10 BUG PATTERNS TO HUNT ====
(D1-D10 — see ARCHITECTURE §6.6 for the full table.)

==== STEP-BY-STEP ====
1. Read the GOLD STANDARD letter "the-wide-path" in volume-two.js so you know exact shape.
2. Read the target letter's full block in the DATA FILE.
3. WebFetch the LIVE URL. Compare body text, all inline footnote markers, all metadata (date, attribution, audio link, video links, Related Topics, prev/next titles, addendum links).
4. For EACH footnote, look up the verse text from the canonical Bible (use NKJV unless ref has (ASV)/(KJV)/(GNT)/(CJB)/(BSB)/(YLT)/(LSV)/(WEB)/(HNV) tag — then use that translation). ALWAYS hardcode the verse text into the letter's nkjv dict.
5. Apply D1-D10 fixes if present.
6. Use the Edit tool to make surgical changes to ONLY this one letter block. Do NOT touch other letters.
7. After Edit, re-Read the modified region to verify the change took effect cleanly.

==== HARD RULES ====
- ONE letter only. Do NOT batch-edit multiple letters.
- NO regex replace_all at file scope. Targeted Edits only.
- Match the file's existing format style (V2 unquoted vs JSON-quoted). Do not change format.
- Preserve every other letter in the file byte-for-byte.
- If the live URL is unreachable, REPORT and stop — do NOT invent metadata.
- If translation-tagged ref but no translation file available, REPORT and stop.
- Do not add audio/video URLs that don't exist on the live site.

==== REPORT FORMAT ====
- LETTER: <id> in <file>
- D-PATTERNS FIXED: D1, D3, ... (or "none")
- METADATA UPDATES: list (or "none")
- NKJV ENTRIES ADDED/FIXED: list of refs
- ANOMALIES / OPEN QUESTIONS: anything you couldn't resolve
```

### Working principles (synthesized from user direction)

- **Just work, no plan mode.** Don't deliberate visibly; act, verify, report deltas.
- **One letter per agent.** Bite-sized. Trade verbosity in instructions for clarity.
- **Diligence is the project.** Bugs are scattered and not pattern-searchable; only a complete sweep finds them all. The user has accepted this is tedious.
- **Foundation, not bandaids.** Fix the data so renderer guards become unnecessary. Don't add new CSS/JS workarounds.
- **Verify, don't trust.** After each agent returns, Read the modified region. Trust ≠ done.
- **Skip Studies.** Bible/Letter Studies (`bible-studies.js`, `matthew.js`, etc.) are out of scope unless explicitly requested.
- **Holy Days = ghost album.** It mirrors content from source volumes. Audit once for structure/nav, defer content sync until after source sweeps.
- **Wiki = source of truth.** Fetch live pages with WebFetch; canonical staged URLs only.

---

## Auto-resume mechanism (scheduled tasks — historical workflow)

When token limits exhaust mid-task, schedule a wake-up via `mcp__scheduled-tasks__create_scheduled_task` so the work resumes after the 5-hour window resets.

**Active wake-ups: NONE.**

**Critical reminders about Anthropic agent OCR limitations:**

1. **Content filter (server-side) blocks MTAM OCR**: Sonnet AND Haiku refuse to output the prophetic/judgment language. Local Ollama Qwen3 VL is the ONLY viable path for MTAM. **Don't dispatch Sonnet/Haiku for MTAM.**

2. **Copyright refusal is non-deterministic for Matthew SB**: Sonnet sometimes transcribes 50+ pages successfully, sometimes refuses on first request citing "verbatim copying of copyrighted work."

3. **Implication**: Agent-based OCR is unreliable for this content. **Local Ollama is the SAFE default**. Use Sonnet only opportunistically.

---

## NIM Proxy — FULLY DEFUNCT, AI DEFERRED INDEFINITELY

The entire NIM/LiteLLM proxy infrastructure is gone (verified 2026-05-11). `C:\Users\corbi\.claude\nim-proxy\` contains only two empty 0-byte log files. No `proxy.py`, no `litellm-config.yaml`, no startup scripts. Port 4000 has nothing listening.

**AI is deferred indefinitely.** Per user direction 2026-05-11: *"no ai no nothing, no api keys, etc, those are security risks anyway, we'll defer a.i feature."* Do not reintroduce a proxy. If a future session is tempted to talk to an LLM backend, surface that to the user first — it is contrary to current direction.

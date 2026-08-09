# VOTReader reader audit ledger

> **CLOSED — 2026-08-04. Every finding below was adjudicated: 8 fixed, 2 dismissed with
> evidence.** Kept as the evidence record for that pass, not as a work queue. Do not
> pick items out of it and re-fix them; the fixes shipped, and the two dismissals were
> dismissed on measurement, not on preference. See HISTORY.md (2026-08-04 s4) for the
> per-finding disposition and the RED proofs.
>
> Dismissed, so they stay dismissed: the "1.5s" `startRestore` cap (it is 90 *frames*,
> and the pixel fallback re-applies every frame) and the "IDB warning flood" (zero in a
> full run). Ruled chrome, deliberately: Bible section headings are excluded from the
> word counter (2,732 headings / 11,638 words).

> Historical status line, true only while the audit was running: these were live,
> read-only investigation notes for compaction survival, and the application and
> generated assets were not to be changed. That embargo ended when the ledger closed —
> the app has since been changed, by this ledger.

## Scope / baseline

- Authoritative checkout: `D:\VOTReader-studio`; preserve the pre-existing dirty worktree.
- User request: inspect reader code, foundations, and modules; report bugs/errors/refinements; do not implement fixes.
- Existing dirty files include reader hooks/settings/app CSS/dist/service worker and generated tooling; treat all as user-owned.
- Current checks: `npm.cmd run test -- --reporter=dot` = 3,352 passed / 188 files; `npm.cmd run typecheck` passed; direct ESLint on `app/src/main/assets/src` with `--max-warnings 0` passed.
- Live checks: `npm.cmd run e2e:read` passed in compositing Chromium; Kotlin `:app:testDebugUnitTest` passed.
- Do not run source-mutating build/lint wrappers during review unless using an isolated output path. No source changes so far.

## Confirmed findings / evidence

- **P1/P2 — production `sectionIntro` is miscounted.** `utils/word-count.js:78-83` sends `item.sectionIntro` to `countTextWords()`, but real corpus data is an array of structured `{type, segments/text}` blocks (`data/volume-seven.js:2336+`; also `bible-studies.js`). String coercion produces `"[object Object]..."` tokens instead of intro prose. Existing test only passes a plain string (`utils/word-count.test.js:47-49`). A read-only corpus scan found 15 affected items and about 2,436 omitted words; one study chapter reported 2–4 intro words where the rendered intro has roughly 100–200. This distorts index minute chips, word-weighted progress, baselines, and any consumer of `countItemWords`.

- **P1/P2 — completion detector omits rendered intro content.** `LetterView.jsx:305-316` renders `sectionIntro` visibly, but only `letter.blocks` below it receive `data-hl-key` (`:323+`); `use-read-tracker.js` only measures `[data-hl-key]`. A reader can skip the intro and still satisfy coverage, while the canonical counter intends to include it.

- **P2 — Bible section-heading contract disagrees.** `countItemWords()` includes nested Bible `section.heading` text (`word-count.js:93-100`), while `BibleChapterView.jsx:205-227` renders headings without `data-hl-key`; the detector therefore excludes them. The module/docs call headings “read in-flow.” Decide whether headings are body content or chrome, then make counter, detector, autoscroll, and docs agree.

- **P2 — study prophecy-card content is untracked/unweighted unless intentionally optional.** `ProphecyCard.jsx` renders readable `para`/`poetry` blocks but gives them no `data-hl-key`; `word-count.js:blockWords()` does not descend into `prophecy-group` blocks. A read-only scan found 132 groups containing roughly 129k nested words. These panels default expanded. If they are reading content, they are omitted from completion and estimates; if supplemental, that exclusion needs an explicit contract and UI semantics.

- **P2 — calendar-day bar has a DST bug.** `ReadingStatsStore.wordsForDays()` (`reading-stats-store.js:299-306`) derives local dates by subtracting `i * 86400000`. Around spring-forward, e.g. just after midnight on the day after the transition, the prior 24-hour instant can land two local calendar dates back and skip a day. Iterate local calendar dates with `setDate()`/`new Date(y,m,d-i)` instead.

- **P2 — docs are stale after the owner retired frontier-jump resume.** `ARCHITECTURE.md:20` and §21 (`~945-992`) still say frontiers “resume-at-first-unread”; `reading-stats-store.js:21-26` repeats that. Current `use-read-tracker.js:63-69`, `CLAUDE.md:17`, and `HISTORY.md:11-21` say scroll-position resume owns reopening and frontier data is recording-only. Update the contract docs when implementation authorization exists.

## Additional confirmed findings

- **P2 — autoscroll's minimum page-time guard is bypassed on the first page.** `use-autoscroll.js:277` initializes `pageStartedAt` to `0`; only `resetForPage()` (`:341-349`) assigns the actual clock. `beginRunning()` (`:351-364`), used by the initial `start()`, never initializes it. Consequently `armDwell()` (`:429-435`) computes the minimum-time remainder from epoch zero, so an unscrollable/short first page can auto-advance after the configured dwell (including immediately when dwell is zero), while later auto-advanced pages get the intended 4-second floor. Read-only controller reproduction with the clock starting at 5,000 ms produced `enddwell.advanceAt = 5,016 ms` for a zero-dwell short page. Existing tests set the fake clock to `0`, which masks this; add a nonzero-start test.

## Additional confirmed finding

- **P2/P3 — live translation changes leave reader metrics keyed to old text.** `BibleChapterView.jsx:183` changes the rendered verse text from the `translation` setting while retaining the same `data-hl-key` and `placeKey` (`:97`); Settings can change that value while the chapter remains mounted. `use-read-tracker.js:125-129,200` caches each key's word count on first sight, so required dwell, coverage weights, and frontier weights can describe the previous translation. `AutoScrollControl.jsx:188-202` likewise re-measures words-per-line only on `placeKey`, so its displayed WPM can remain stale after a translation switch. This is the concrete case behind the broader same-key content-identity risk; add a translation-change reset/fingerprint and a metric remeasure dependency.

- **DST reproduction detail:** the `wordsForDays()` issue above was reproduced in `America/Denver` at 2026-03-09 00:30 local: the current arithmetic returned `2026-03-06, 2026-03-07, 2026-03-09`, while local-calendar iteration returned `2026-03-07, 2026-03-08, 2026-03-09`.

## High-value risks / refinements to verify

- `use-read-tracker.js` caches a key’s rendered word count on first sight and `ReadingStatsStore` persists credited **indices**, while content identity is by `hl-key`. Same-key text changes or reordered/inserted keyed blocks can preserve stale weights or map old credits onto different text. Current headings toggle preserves verse order; translation/content churn needs a deliberate content fingerprint or stable segment IDs.
- `use-scroll-memory.js:startRestore()` has a fixed `MAX_TRIES = 90` (~1.5s). On slow Android/lazy-corpus/content-visibility settles, an anchor may miss the deadline and never be reapplied after late layout; device verification is needed before calling this a live defect.
- `useReadProgress.unmarkRead()` (`useMarkAsRead.js:208-211`) removes the checkmark but does not clear a matching ReadingStats frontier. Manual mark clears one, and verified completion clears one, so impact is mostly stale/imported/race-created frontier state; add a focused test and decide whether unmark means reset or preserve partial reading.
- `ReadingStatsStore.replaceAll()` accepts shallow/unbounded nested stats (`reading-stats-store.js:267-284`) because import validation intentionally checks only top-level shapes. Consider bounds/type normalization for hostile or hand-edited backups; do not overstate as data-loss unless reproduced.
- `CachedStore` tests are broad, but current Vitest output floods stderr with expected IndexedDB-unavailable warnings in jsdom. Inject a memory IDB or suppress expected test-only paths so real persistence failures remain visible.

## Closed / not-live findings checked

- Prior v3 backup missing-media destructive-prune issue is not live in current source: `validateV3MediaMetadata()` runs before `applyV3` touches stores/media, and e2e/backup gates cover the boundary. Treat as historical closure, not a new finding.
- Reading-stats IDB registration is present at current v8 (`idb-adapter.js`, `ReadingStatsStore` tests); real Chromium e2e passed completion, day bucket, partial frontier, reopen scroll-position resume, and frontier clear.

## Investigation status / remaining follow-up

- Completed: exact content-contract scan, structured-intro corpus quantification, translation churn review, scroll-memory/annotation lifecycle review, and reader-adjacent backup/IDB/native review.
- Remaining implementation follow-up: decide canonical versus supplemental content semantics, add focused regression tests, and verify slow-device restore behavior with an actual Android/WebView run.
- Before final: rank confirmed bugs vs design risks, include file/line evidence, tests, limitations, and exact no-application-change statement.

## Current handoff state

- Additional read-only gates passed: `smoke-lite`, `smoke:ci` (0 crashed screens, 0 console errors, 0 resource 404s), strict schema/data validation (0 errors, 36 known translation verse-gap warnings), footnote audit, CSP check, corpus-version check, type-scale check, and app-size check.
- Direct reproductions completed: first-page autoscroll floor bypass at fake time 5,000 ms; DST date skip at `America/Denver` spring-forward midnight; structured `sectionIntro` scan found 15 affected items and roughly 2.4k omitted words.
- No application or generated asset was edited. The intentionally requested audit ledger is the only file created by this review; preserve all other dirty/untracked files shown by `git status`.
- Next actions if implementation is later authorized: unify a structured reading-segment contract across counting, DOM keys, detector, autoscroll, and anchors; add nonzero-clock/DST/translation/intro/heading/prophecy tests; correct docs; decide whether prophecy cards are canonical reading flow; harden restore retry and import normalization.

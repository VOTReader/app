# HISTORY.md — Landed work log

Append-only record. Read when you need context on past decisions. Not required for routine work. For the current briefing, see CLAUDE.md. For deep system reference, see ARCHITECTURE.md.

---

## Detailed session log — 2026-06-12 → present (moved from CLAUDE.md, 2026-07-24)

These are the dated “Current state / Previous state” narrative entries that lived at the top of CLAUDE.md. They were relocated here verbatim (headings demoted one level) to keep CLAUDE.md — which auto-loads into every session's context — lean. New sessions PREPEND their detailed entry here; CLAUDE.md keeps only the short summary + one-liner index.

### 2026-08-04 (session 4) — One type scale + history-tracking race + layout-cycler pulse

**Scope:** owner-reported inconsistency — *"some places are smaller than others… troubling older folk needing to increase/decrease size depending if they are reading notebook entries, buttons, journal, settings screen items, or an actual letter/chapter."* Measured first: **590 font-size declarations, 103 distinct values, 15 files**, in two unrelated families (decimal in `app.css`, 16ths-based in the injected journal styles), with **ten distinct sizes between 8.8px and 10.9px**.

**The ladder.** 13 steps declared once in `app.css :root`: `--fs-10 … --fs-48` (rem — scale with the one Text Size setting) plus `--fsc-10 … --fsc-48` (px twins for pinned chrome). The number in each name IS its px size at scale 1. All 578 literal declarations were snapped to their nearest step by script (explicit map, every change printed and reviewed), ties rounding DOWN so the 10px **floor** is the only deliberate upward force. `em` sizes (verse sups, ↗ marker, inline refs — parent-relative by design) and the three `clamp()` fluid headings (ends now tokens) are documented exceptions. Full reference: ARCHITECTURE.md § Type scale.

**The chrome-pin sync trap, closed.** The block at the end of `app.css` freezes nav/floating chrome in px so Text Size can't balloon icons (owner's prior directive). It restated hand-computed decimals — `0.56rem` in one place, `8.96px` in another — that could drift apart silently. Each pin now names the `--fsc-N` twin of its rule's `--fs-N`.

**Enforced, not just tidied:** `tools/check-type-scale.js` (npm `check:type-scale`) fails on any literal rem/px font-size outside the ladder's own declaration; wired into pre-commit and CI. Without it this decays back to 103 values one commit at a time.

**Verification** (live, both viewports, against a baseline worktree at the pre-migration HEAD served side by side): Settings at 300% text went from **19 distinct sizes / 76 off-ladder** to **9 / 0**; container clipping at 300% was pre-existing (87 clipped before, 91 after, `docOverflow: 0` in both — the page never scrolls horizontally). At scale 1 every walked screen (Home, Volumes, Volume One index, a letter, Settings, desktop) reported 0 off-ladder and 0 unintended clipping. Zero console errors.

**History-tracking race — owner-reported, RED-proven, root-caused.** *"Make sure bible/letter studies properly record in history."* `useNavHistoryTracking` fired once per nav change with the six nav values as deps. Every branch reads data that can arrive LATER: `BOOKS`/`MATTHEW` are lazy corpora and the study lookups resolve out of one. On a cold boot into a saved tab — or any deep link — the effect ran, found the corpus absent, `return`ed, and **never ran again**, because a corpus landing changes none of its deps. The visit was silently dropped. (The old comment claimed a later re-run would pick it up; nothing re-ran it.) Three RED tests proved it for the Bible, Matthew, and study-chapter branches. Fix: the effect drops its deps array and guards on a `recordedKeyRef` holding the nav position it has already written — so an unrecorded position retries on later renders while a recorded one is skipped until the user navigates away and back. All four branches now `done()` only after an entry is actually written. 26/26 green, including the pre-existing "does NOT re-fire when only helper identities change" contract.

**Also:** the Scriptures-home layout cycler now pulses gently (2.6s opacity+color, no transform so it can't shift the 44px target under a finger, stops on hover/press, collapsed by the global `prefers-reduced-motion` block) — owner request; nobody was finding that control.

**Gates:** 3,355 vitest / 188 files, lint 0, tsc, type-scale gate, build (8 bundles, SW `v1.0.2-06b2c86596`), smoke:ci desktop + 360×800.

**Then: an external read-only audit ("Luna") adjudicated.** A parallel agent left `VOTREADER-REVIEW-NOTES.md` with 8 primary findings + 6 secondary risks. Every one was re-verified from source before acting — none taken on trust.

*Confirmed and fixed:*
- **`sectionIntro` was miscounted (P1).** `_countItemWords` passed it to `countTextWords`, which `String()`s its argument — but every real `sectionIntro` in the corpus is an **array of blocks** (volume-seven "Recompense" + 14 bible-studies chapters). It was counting the two words of `"[object Object]"` per block. The schema gate quantified it exactly: 15 items, **+2,436 words** (`more-than-a-man-ch1` reported **2** words; it has 103). Fixed by running array intros through `blockWords`; baseline regenerated.
- **The read detector couldn't see that intro (P1).** LetterView renders `sectionIntro` but only annotatable blocks carry `data-hl-key`, which is all the detector measured — so a reader could scroll past visible prose and still complete, and the DOM-derived total disagreed with the data-derived one (my own fix above had just widened that gap). Added `data-read-seg`: a second attribute for prose that renders in the reading flow but is not annotatable. The detector unions the two selectors and namespaces read-seg keys so they can't collide with annotation keys. Three tests: an unread intro holds completion back, a read one completes with its words counted, and same-id keys don't collapse.
- **Bible section headings: contract decided (P2).** The counter counted them; the detector never could (no key), and the reader can switch them off entirely — an unfixable disagreement on the data side. **Headings are chrome**: 2,732 of them, 11,638 words, ~1% of the corpus, avg 4.3 words. Dropped from `countItemWords`; counter and detector now agree in both setting states.
- **First-page auto-scroll skipped its minimum time-on-page (P2).** `resetForPage()` stamps `pageStartedAt` for every auto-advanced page, but `start()` goes through `beginRunning()`, which left it at the `0` initializer — so `armDwell()` measured the floor's remainder from epoch zero and page ONE could chain onward instantly at dwell 0. Every existing test starts the fake clock at 0, which hides it; the new one starts at 5,000 ms.
- **DST day-skip in the progress bars (P2).** `wordsForDays` stepped back by fixed 24-hour blocks while formatting *local* calendar dates. Reproduced exactly: `TZ=America/Denver`, 2026-03-09 00:30 → `03-06, 03-07, 03-09` (03-08 vanished, and a stale day appeared). Now walks `new Date(y, m, d - i)`.
- **Translation changes left metrics keyed to the old text (P2).** `BibleChapterView`'s `placeKey` was `bookId-chapterNum`, but Settings is reachable without unmounting the chapter, and both `translation` and `restoredNames` swap the verse text under identical `data-hl-key`s. The tracker caches each key's word count on first sight and AutoScrollControl re-measures words-per-line only on `placeKey`, so required dwell, coverage/frontier weights and the displayed WPM could describe the previous translation. Both are now part of the visit identity.
- **Prophecy cards: contract stated, behavior unchanged (P2).** 132 groups, ~129k words, default-expanded but collapsible per-card and en-masse. Counter and detector already agreed (both exclude), so the fix was to say so at both sites: supplemental reference, and flipping it to canonical is an owner decision that would multiply every study chapter's estimate.
- **Stale docs (P2).** ARCHITECTURE.md's summary line + §21 and `reading-stats-store.js`'s header still described frontiers as powering resume-at-first-unread. Retired earlier today; all three now say recording-only.
- **Secondary:** `unmarkRead` left a matching frontier behind (every other reset path cleared one — this was the single hole; now symmetric, plus a test that a throwing store still unmarks). `ReadingStatsStore.replaceAll` took nested imported progress unchecked and unbounded — the envelope validator only checks the top level — so it now normalizes to exactly the shape `recordProgress` writes (integral in-range deduped indices, `w ≤ tw`, LRU-50 applied) at that trust boundary. A `use-reading-position-nav` comment still said prophecy-card state was localStorage-backed; it is `ProphecyCardsStore` (IDB).

*Dismissed, with evidence:*
- **"Scroll restore stops after ~1.5s."** The cap is 90 **rAF frames**, not milliseconds — a slow device gets *more* wall-clock, not less — and the pixel fallback is re-applied every frame regardless, so a late anchor costs precision, never the position. Not a live defect; stays on the device-walk list.
- **"IndexedDB-unavailable warnings flood vitest stderr."** Did not reproduce: a full run greps **zero** IDB/stderr warnings. The only noise is ~10 jsdom "Not implemented" notices (canvas `getContext`, document navigation), which are jsdom internals, not maskable app warnings.

**Gates after the audit batch:** 3,364 vitest / 188 files, lint 0, tsc, type-scale, schema validate (3,120 items, 0 errors), build (SW `v1.0.2-cb26eb2989`), smoke:ci ×2, e2e:read PASS.

### 2026-08-04 (session 3) — Owner retirements: backup reminder + frontier resume

**Scope:** two owner-directed removals. Both features were built to spec earlier; the owner used them and didn't want them. Removed at the root, not disabled behind a flag.

**1. Backup-freshness reminder retired.** The boot toast ("It has been a while since your last backup…" + Export-from-Settings deep link, landed 07-03 as backlog [4]) is gone: `src/hooks/use-backup-reminder.js` + its 18-test file deleted, the `_entry-b.js` import/export removed, the `App()` call removed, the Settings → Your Data **Backup Reminder** toggle removed, the `backupReminder` default dropped from `use-settings.js`, and the `.vot-toast-backup` / `.vot-backup-btn` CSS folded back to the undo-toast-only rules. The `lastExportAt` stamp on the shared export success tail went with it — nothing else read it (`exportPersonalData` no longer needs its `ok` return). Stale `backupReminder`/`lastExportAt`/`lastBackupRemindedAt` keys in old `vot-state` blobs are simply unread, so no migration.

**2. Frontier resume retired — scroll-position resume restored.** The 08-03 reading-measurement engine added a post-restore jump to the first *unread* paragraph, overriding `use-scroll-memory`'s saved position. Owner call: the saved position wins, always. `maybeFrontierResume` (and its yank guard, attempt cap, and viewport-proximity rule) deleted from `use-read-tracker.js`; the gate it doubled as — *don't bank coverage or active time on transitional restore geometry* — was kept as a plain `restoreSettled` check on `body.scroll-restoring` plus one settle sweep, so navigation geometry still never counts as reading. **Frontier RECORDING is untouched** (`recordProgress` / `firstUnreadIndex` still work) — it feeds the reading record and the held skim indicator (BACKLOG [21]); it just no longer moves the viewport.

**Tests + gate updates:** the three `FRONTIER RESUME` cases collapse into one inverted assertion — the tracker never calls `scrollTo`, never reads `firstUnreadIndex`, and leaves `scrollTop` where the restore put it. `tools/e2e-read-detector.mjs`'s resume assertion was inverted the same way and given a **non-vacuity guard**: the saved bottom and the frontier block must be more than a viewport apart or the test proves nothing. Live proof from the real compositing run: `scrollTop 3457 = maxTop 3457` with the frontier block at `760` (2,697 px away, viewport 833), frontier data still recorded (`{b:16, c:[0,1], w:80, tw:863}`).

**Gates:** 3,352 vitest / 188 files, lint 0, tsc clean, `npm run build` (8 bundles + CSP unchanged + SW `v1.0.2-cdd01e0734`), smoke:ci both viewports, e2e:read PASS.

### 2026-08-04 (session 2) — Review-of-the-review + toolchain lift + measurement strays (`7db418e`..`7f4a903`)

**Scope:** an Opus 5 improvement loop over the `e4c9f2a..b750a33` handoff itself. Every claimed gate was re-run from scratch and independently confirmed green (3,356 vitest, 237 Kotlin, lint 0, tsc, smoke:ci desktop+360, e2e:read, 3,120 schema items, corpus c19, CSP). Three read-only reviewers then went hunting: one adversarially re-reviewed the nine handoff commits, one swept the whole app for lifecycle races, one audited docs/backlog drift. Everything below was source-verified before landing; the run also found that the previous session **never pushed** — main was 11 commits ahead, so the live PWA was stale. Pushed first, then landed four more commits.

**Deploy + dependency hygiene:** pushed `4a6a7f3..9038503` (CI + Pages green). Merged the checks-green Dependabot Actions SHA-pin bump (PR #5). Landed `typescript 7.0.2` + `jsdom 30.0.0` on main (`7db418e`) after proving the full suite green under both — TS7's stricter zero-arg `resolve()`/`gen.return()` checks fixed at their three sites. eslint 10 (PRs #1/#4) is **blocked upstream** — `eslint-plugin-react` peer-caps at `^9.7`; documented on the PR, left open.

**Lifecycle races (`2aed8f4`):** SearchScreen's ~10s index build reported progress into an unmounted screen, and its debounced search promise had no stale guard — a slow older query could overwrite a newer query's results out of order (the engine yields the main thread, so the interleave is real). Both effects now carry stale guards, RED-proven. VersePicker/LetterExcerptPicker's 150ms capture timers now clear on unmount like their selectionchange siblings.

**Review-of-the-review catches (`1b81746`):** the adversarial pass on the handoff's own a11y/responsive commits surfaced (all verified then fixed): the new bookmark halo's `-4px` horizontal inset painted over the static neighbors' taps across the 1.92px nav gap (precedent is `-2px` — same asymmetric-halo class as `.nav-arrow-btn`); the rail `aria-live` was created in the same paint as its content (a live region must pre-exist to announce — now permanent on the panel, pinned by test); the e2e frontier assertion silently degraded to vacuous when the target block wasn't locatable (now fails loudly); `.prg-hero` left a column-4 hole at 7 stats; the journal audio slider could advertise `aria-valuemax=0` under a growing `valuenow`. Sibling gaps closed: AnnotationActionChip got the dialog+trap treatment its popover siblings received; both full-screen pickers now contain Tab; four sibling backdrops got `aria-hidden`.

**Measurement strays (`7f4a903`):** backlog [27] — the autoscroll pill leads with measured wpm ("~120 wpm · 30 lines/min") so ± tunes to a wpm target; lines/min stays the stored unit. [28] — Most Annotated ranks by marks-per-1k-words (`countItemWords` via `bookItemsFor`/`findEntryContext.entry`) so length alone can't win; tally shows "N marks · D/1k words". Both RED-proven.

**Deliberately not done:** [26] History-row resume chips stay "do on ask" per the DONE log; the ≤339px smoke viewport was skipped (360×800 is the smallest real target); WtlbEntryView-specific keyboard tests skipped (the shared pattern is pinned in FootnoteListSection/JournalViewer tests); `.nav-arrow-btn`'s ~34px width stands as the documented halo compromise.

**Final gates:** 3,360 vitest / 188 files; lint 0; tsc clean under TS7; Kotlin BUILD SUCCESSFUL; smoke:ci PASS both viewports; e2e:read PASS (with the new fail-loud target assertion); validators 3,120 items / 0 errors; corpus c19 unchanged; CSP OK. All pushed.

### 2026-08-04 — Adversarial handoff review + whole-app improvement loop (`e4c9f2a`..`b750a33`)

**Scope:** reviewed the 15-commit `63562d0..4a6a7f3` handoff as a starting point, then walked outward through backup safety, reading measurement, progress displays, responsive navigation, desktop companion-rail behavior, and modal/keyboard accessibility. Three read-only Terra reviewers supplied leads; every landed finding was reproduced or source-verified locally. Browser QA covered onboarding, Home, Volumes, compact WTLB indexes, reading, scripture sheets, Settings, Library, and My Progress at 360×800 and 1920×1080.

**Backup/data safety (`e4c9f2a`):** a malicious or corrupt v3 header could still declare a manifest larger than Android's 16 MiB decoder cap and force the web reader to allocate it; web import now enforces the same limit before allocation, and export refuses an oversized manifest on both paths. The restore-inflight localStorage flag is now ownership-tokened, so an older tab cannot clear a newer restore's boot guard. Legacy imports with a missing journal-media store are forced onto non-destructive merge instead of treating “store absent” as “empty store.” Regression tests cover each boundary.

**Reading/progress correctness (`47b7762`, `fb50310`, `5e99d73`, `f73ee14`):** manual Mark as Read and completion now clear stale partial frontiers; word weights ignore annotation/control chrome and stay coherent when rendered geometry swaps; dwell cannot accrue before real content exists; scroll restoration pauses measurement; frontier resume is real-Chromium tested; compact two-column indexes retain time-left, percent, read, and re-read metadata instead of dropping it. My Progress's day bars now have a visible period label and odd card grids balance deliberately.

**Accessibility + responsive UX (`a1f913b`, `82183a0`, `5abafe9`, `b750a33`):** keyboard activation and focus containment were completed across journal cards, references, audio, action sheets, sidebars, popovers, Safari notices, and app-level confirms; modal semantics now sit on the actual dialog, while the desktop companion rail remains non-modal and announces updates politely. The 360px toolbar no longer clips Settings: History moves to its Home card at compact width, with a second priority step only below 340px. Bookmark state has a clearer selected halo. `smoke:ci` now pins both the desktop overflow contract and the 360×800 toolbar geometry. The coverage gate then exposed delayed current-chapter scroll callbacks surviving index unmount; both ChapterIndex and BibleStudyIndex now cancel their timers, with a regression test.

**Final gates:** 3,356 vitest / 188 files; JS coverage PASS (85.63% statements / 75.57% branches / 86.21% functions / 90.73% lines, zero unhandled errors); 237 Kotlin tests / 12 files + JaCoCo; lint 0; TypeScript clean; production bundles/CSP/SW regenerated; `smoke:ci` PASS (desktop + compact nav, zero crashes/unreached/console errors/404s); `e2e:read` PASS (completion, ledger, day bucket, partial frontier, resume, frontier clear in compositing Chromium). Schema validation: 3,120 items / 0 errors; word-count baseline, corpus-version, and packaged assets clean. No corpus change. Remaining work is product-choice/manual-device territory: owner vocabulary for [19], device/TalkBack walk [20], owner-held skim indicator [21], and optional feature tracks [22]–[30]. Five stale `.claude/worktrees/*` were deliberately not removed because they may be live sessions.

### 2026-08-03 (session 2) — The reading-measurement engine: word counts, the multi-vector read detector, ReadingStats ledger, frontier resume

**Owner directive:** replace the naive mark-as-read trigger with "a far more robust implementation, one that measures multiple vectors… implement everything you can think of in professional and good ways." Walk-away noise accepted; auto-increment re-reads wanted; the per-letter skim indicator explicitly HELD (BACKLOG [21] + a memory note so he isn't left to remember it).

**What the old system was (recon first):** three machines that never talked. ScreenLayout fired `__onReadingComplete` at scroll ≥90% toward the sentinel — pure position, zero time (a flick marked a 5,000-word letter read), physically unable to fire on content that fits the viewport (no scroll event ever), and accidentally gated on the progress-bar setting. use-reading-dwell ran a visibility-honest 20s timer gating only the streak day-record — content-blind. readItems was `true`-valued and write-guarded (re-reads no-ops). The dwell hook's `__onDwellCommit` window bridge had NO callers (vestigial since position-is-immediate 07-19) — deleted, with a tombstone test.

**What landed:**
- **`utils/word-count.js`** — ONE deterministic definition of "how many words is this item" (Format A blocks/segments incl. poetry + sectionIntro, Format B paragraphs, bible chapters nested + Matthew-shape; fn markers/footnote dicts/headers excluded; WeakMap-memoized) + `readingMinutes()`. Corpus totals it measured: VOT prose 247,358 words / 725 items; NKJV 747,206 + Matthew 23,286; ~6.5M words shipped across 10 translations (YLT longest 794,063, BSB shortest 725,263, −9.5%; Psalm 117/119 the extremes in all eight).
- **Word-count baseline gate** — `tools/validate-schemas.js` builds a per-item ledger while collections load anyway and diffs against `tools/word-count-baseline.json` (2,169 items, 1,091,799 words; `--update-wordcounts` regenerates). Catches the c9–c18 class (eaten paragraphs, doubled refs) BETWEEN audits at zero bundle cost. RED-proven (perturbed item → exact-item DRIFT error).
- **`ReadingStatsStore`** (`vot-reading-stats`, CachedStore, IDB **v8** — see the bug below): lifetime words/time/completions/rereads, `wordsByDay` (bounded 400 days), wpm samples (rolling 50, median, 30–1500 sanity band), and the per-item **frontier map** (credited segment indices, LRU 50, cleared on completion — the data that powers resume-at-first-unread AND the held skim indicator later). Registered everywhere a store must be: `_entry-b`, backup `_exportableStores`, import-validators, user-data-size, settings-harness, `replaceAll` with default-filling.
- **`use-read-tracker.js` — the detector**, called from ScreenLayout on every screen, self-armed only while a reading view holds the completion bridge. THREE VECTORS: per-segment coverage weighted by rendered words (segments = the `[data-hl-key]` blocks every view already stamps; credit = 800ms continuous meaningful visibility; fits-the-viewport content starts at 100% coverage so time alone gates it — the WTLB case), visibility-honest active time (tick-capped, pauses on hidden), and content-scaled required time (`clamp(words×100ms, 8s, 300s)`). READ ⇔ coverage ≥90% AND dwell ≥ required. Payload `{words, activeMs, coverage}` → `markRead(bid, cid, payload)` increments the now COUNT-VALUED readItems (legacy `true` reads as 1, zero migration) + records the ledger with `wasReadBefore`. Manual toggles still set only the first mark and never fake stats.
- **Frontier resume (owner: "genius, definitely implement")** — on mount, after the content-anchor restore settles, if the store's first-unread segment sits more than a viewport from the restored position, jump there (flick-to-bottom last visit → resume at paragraph 2). Baseline-drift yank guard; same-session exact positions win inside one viewport.
- **Displays** (parallel agent): My Progress hero "Words Read" (+compact formatter) + "Reading Pace" (median, only when ≥5 honest samples), a 14-day words bar row, journaling words-written + voice-memo minutes; `~N min` chips on letter index rows + bible chapter cards (`readingMinutes` at measured-or-230 wpm); AutoScrollControl already had exact time-remaining (px-based) — correctly left alone. Boot `DiagnosticLog.timing('boot','app-first-mount')`.

**The bug only LIVE verification caught:** unit suite 100% green while the store sat `'degraded'` in a real browser — `vot-reading-stats` was never added to **IDBAdapter's STORE_NAMES/DB_VERSION** (votreader IDB v7→**v8**, additive upgrade), so hydration timed out and every write queued forever. The E2E probe (headless compositing Chromium driving a genuine read: onboarding → Volume One → preface, dwell+scroll ~13s) then proved the whole chain: completion fired at 9.3s for 89 words, readItems `{v1:volume-one:a-word-of-warning: 1}` durable in IDB, day bucket written, partial-read frontier recorded for letter 2, completed item's frontier cleared. A second live find: a page that isn't compositing delivers no IO callbacks at all — which fed directly into the review's biggest fix (below).

**Adversarial review (17-agent workflow: 4 lenses → per-finding refutation): 12 confirmed / 1 refuted, all 12 fixed:**
- **IO couldn't credit tall segments** (3 independent lenses): a block taller than ~2 viewports never crosses ratio 0.5 and IO fires nothing while it fills the screen — long poetry blocks and ALL of Text Size 300% would never auto-mark. **The detector was redesigned off IntersectionObserver entirely**: a 2 Hz batched geometry sweep (gBCR vs live root rect, fresh viewport height every sweep) with credit state keyed by the **hl-key string** — which simultaneously fixed the second P1 (the BibleChapterView headings toggle re-renders every verse under the same placeKey; element-keyed state died with the detached nodes, string-keyed state survives any DOM swap — bible verse spans carry identical keys in both layouts) and the observed live shrunken-denominator settle bug (late-mounting content now grows the denominator by key).
- **Matthew + Bible Studies were invisible to the engine** — both views' `onMarkRead={() => markRead(...)}` closures swallowed the payload and passed no readTrackKey; the flagship study corpus would have contributed zero words forever. Wired (payload + `getReadKey` threading).
- **Completion-instant pace sampling was structurally biased** — completion fires the moment activeMs crosses required, so every fits-viewport page sampled at exactly ~600wpm. Pace now samples at **visit end** (`recordPaceSample` from tracker cleanup) with a boundary guard rejecting sessions that ended at the minimum (which also makes the walk-away wpm claim TRUE).
- Missing `replaceAll` (restore of the store would throw — added, default-filling), the frontier flush dead on cleanup ordering (meta snapshot), the frontier-jump yank guard, the IDB registration (found live first, confirmed by the data-safety lens as P0).
- Refuted (1): the vitest noop-bridge arming concern — harmless by design.

**Numbers at land:** 3,314 vitest / 185 files (+107 this session); 16 detector tests incl. regression locks for every confirmed finding; E2E probe green post-redesign; lint 0 / tsc clean / smoke:ci PASS. **DEFERRED (BACKLOG [21]–[26]):** the held skim indicator ★, TTS with word highlighting (charIndex → the existing offset machinery), reading milestones + full streak calendar, year-in-review, translation facts, smart-resume surfaces on Continue Reading affordances.

### 2026-08-03/04 (improvement loop, cycles 1–4) — coherence, resume UX, Settings, the companion rail

Owner installed a standing investigate→execute→step-back loop. Four cycles landed (`4fdd582`, `a89c6b2`, `c36b769`, `fb8c126`, `792e215`, + cycle 4):
**C1** — UX-walk caught streak incoherence (verified completions left "streak: 0"; completions now record the reading day); consistency sweep from a recon fan-out: BRIDGES.md lied three ways (fixed + `__readTrackerMeta` documented), the Settings Mark-as-Read copy still described the deleted 90% rule to the OWNER (rewritten honestly), `showProgressBar` deleted across 23 sites (no UI; it was secretly the auto-mark gate), CLAUDE.md pruned 8.6KB per its own protocol, `readCount` two-shape collision renamed, ARCHITECTURE §21 written, `npm run e2e:read` promoted.
**C2** — smart-resume chips ([26]: in-progress rows show "60% · ~2 min left" off the frontier; recon corrected the backlog's resume-dot premise) + measured translation-length facts in the picker ([25]).
**Settings audit** (owner screenshot) — True Black IS the dark theme now (toggle retired, tokens folded, tombstones); the Mark-as-Read table de-ragged (labels shrink, controls never wrap; group rows needed flex-basis 0) — verified by a geometric ragged-row probe.
**C3** — the companion rail (Sol #4): fn/scripture sheets dock as a NON-modal complementary panel in the right gutter ≥1640px (trap/backdrop/aria-modal OFF in rail — modality was the real deliverable); the two INLINE scripture sheets in LetterView/WtlbEntryView (found rendering their own backdrops) joined. Brainstorm reconciliation on owner check: collection bars now weigh WORDS (idle-computed `groupWordStats`; "1/726 · 206/247k words"), lifetime Reading Time stat; strays filed [27]–[30]. Also: piped-lint honesty lesson — `npm run lint | tail` masked exit codes; the pre-commit hook caught what the pipe hid.
**C4** — dialog semantics added to both inline scripture sheets (they predated the a11y batch entirely: no role/modality/trap; consolidation onto ScriptureSheet is an on-churn candidate — different text-resolution contracts). Five stale `.claude/worktrees/*` flagged for the owner (may belong to live parallel sessions — NOT pruned).

### 2026-08-03 — Desktop width model: inner caps px→rem (`5a8381e`)

**Owner report:** "the column of the whole thing feels too small" on his laptop (2560×1600 panel ≈ 2048 CSS px → the 1600+ tier), refined mid-session to "some screens, particularly Settings, are so squeezed — the outside lines aren't THAT narrow, but the text inside them feels like it." Sol supplied a 7-point desktop review; adjudicated take-good-discard-bad.

**Root cause (Sol's #6 — his sharpest point):** the responsive tiers step the root font 16→18→20px, but every inner surface cap was fixed px — so surfaces silently SHRANK in rem terms as screens grew. Settings was 32.5rem on a phone, 26rem at desktop; Home 30rem→24rem; the reader 45rem→36rem (losing ~9rem of measure). The shell borders looked fine; the content inside them was the squeeze.

**Fix — one mechanism, 24 caps:** inner content caps converted px→rem at exact /16 ratios (`.page-wrapper` 720→45rem, `.settings-header/.settings-section` 520→32.5rem, `.home-nav-list` 480→30rem, `.vol-index` 680→42.5rem, `.library-screen/.library-grid` 640/520→40/32.5rem, `.tabs-overview` 880→55rem, `.notes-index/.links/.bkm-screen` 720→45rem, genre/canon/compact/flat grids, about-card, history-empty, hero-subtitle, prg-screen + inner, home-ornament). Mobile ≤768px is **byte-identical** (16px root × same /16 value); tiers widen proportionally. Reading keeps a ~constant CHARACTER measure (45rem at 20px root = 900px = the same ~72ch as 720px at 16px) — prose is NOT stretched, honoring the measure discipline. The 1600+ tier shell also nudged `--col-max` 980→1040 (every fixed control derives from the var — sheets/arrows/fab/link-sidebar follow by construction). Sheets/dialogs/modals deliberately stay px (overlay anchors, not content surfaces).

**Live-verified at 2048×1280:** shell 1040, reader 900, Settings 650, overflow 0; at `--font-scale` 3 the caps balloon and the shell clamps gracefully (849px section, overflow 0 — the 08-02 spill-sweep wrap fixes carry it); tablet tier provably unchanged (520/760/16px at 1024×768).

**smoke-ci hardening (Sol's #7, minimal version):** the headless walk ran at Puppeteer's default 800×600 forever — the desktop tiers were never exercised by any gate. Now an explicit 1920×1080 viewport + a horizontal-overflow tripwire folded into the PASS contract (`report.ok=false` past 1px). Not the multi-viewport screenshot harness Sol sketched — deliberately.

**Adjudication of the rest of Sol's review:** DEFERRED, in his own recommended order, as future strikes — Tabs thumbnail aspect/capture at 4K (his #3; real but the owner isn't on 4K; `use-thumbnails` aspect = shell/viewport-height), desktop companion rail for footnotes/scripture (#4 — the highest-value future item; reuse link-sidebar language at ≥1440px), grid-column expansions (Library 3-col, Tabs 4/5-col — needs the thumbnail fix first), search group/filter rail + Settings category rail (#5), a 2560+ CSS tier. DISCARDED: globally widening `.screen-layout` per-screen roles machinery (this one-mechanism fix achieved #1/#2's goal), any "desktop mode" preference (agreed — automatic only), Home 2-col grid (his own warning: `HomeScreen` reorder is 1-D; correct, stays a warning). His "phone frame borders on huge screens" nit: kept — the frame is the app's identity on desktop.

### 2026-08-02 (session 3) — GPT 5.6 Sol uplift batch: adjudicated, corrected, landed (`63562d0`)

**Shape of the session:** the owner had GPT 5.6 Sol produce a large uncommitted uplift batch (backup atomicity, native recording lifecycle, log redaction, a11y sweep — ~1,190 lines / 42 files) and asked for an adversarial review. Every validation claim in Sol's report was re-verified locally rather than trusted: 3,241 vitest / 180 files reproduced exactly, 235 Kotlin tests counted from the JUnit XML, lint/tsc/smoke:ci rerun, and the dist bundles proven honest by hashing → `npm run build` → re-hash (byte-identical). Backward compat of the stricter v3 import was proven against real backups by checking the v3 exporter has written `type` into media metadata in manifest-order since its first commit (`47789f4`). A parallel subagent adversarially reviewed the 15-file a11y batch. Verdict: high-quality work, but 2 P1s + several P2s — all fixed same-session, plus one owner-directed design reversal.

**Sol's batch (verified good, landed as-is):** v3 imports stage into a separate IDB store (`import-staging`, DB v1→v2) with an atomic clear+copy commit; strict `validateV3MediaMetadata` (missing/malformed manifest media table can no longer masquerade as "no media" and wipe attachments); `exportVersion > 3` fails closed; cross-tab Web Lock (`votreader-backup-import`, `ifAvailable`) around both apply paths; pending/degraded stores block destructive import (`state !== 'loaded'`); blocked critical `deleteDatabase` no longer reports success or clears localStorage (boolean-returning `_deleteIdbDatabase`, LS removal moved after DB success); media-DB connections close on `versionchange` so Clear All can actually delete the DB. Native: audio session acquire/release + recorder start serialized under one `audioLifecycleLock` on the binder thread; `audioCaptureAllowed` gate blocks stale bridge starts after renderer death/activity teardown, re-armed by the replacement renderer's `onAppReady`; `nativeRecordStart` acquires focus/mode synchronously (no posted-task race) and rolls back on failure; JS stop path releases the session at stop (not sheet close) so other apps' music resumes at preview. Redaction: HTTP(S) query/fragment → `[redacted]`, userinfo stripped through the LAST `@` before the path, uppercase schemes handled — same algorithm in `diagnostic-log.js` and `BoundedLogTree.kt`; tags now sanitized too. Garden: HTTPS required + host allowlist re-checked per redirect hop. A11y: `role="dialog"`/`aria-modal`/labelled-by on the wipe/import/recording dialogs, `inert` on closed sheets (a REAL fix — the closed fn-sheet was transform-offscreen but still focusable; sheets portal to body so this doesn't collide with the pager's inert peeks), nested-interactive markup fixed by real `<button>`s with complete UA-reset CSS, `InteractiveSemantics.test.jsx` behavioral suite.

**Review findings fixed on top (`63562d0`):**
- **P1 — three `aria-label`s deleted content from AT.** `aria-label` beats name-from-content in every accname engine, and Sol labeled buttons whose content IS the content: the chapter-summary button (ChapterView), the tappable chapter title, and every section heading (BibleChapterView — all announced identically as "Hide section headings", Psalm 119's Hebrew letters included). Also a WCAG 2.5.3 label-in-name violation. jsdom's accname library diverges from Chrome here (proven with a live probe), so NO test could catch it — the peek test passed while real AT regressed. Labels deleted; content is the name; peek test now pins `name: 'Ch 3'` with a comment explaining the trap.
- **P1 — Clear All never took the backup mutex.** It checked `backupBusyRef` but never set it, and the wipe dialog closes before the async wipe runs — Export/Import/Verify stayed tappable while databases were mid-deletion. Now routed through `_runBackupOperation` with reload-pending semantics.
- **Owner-directed reversal — v3 restore is SALVAGE, not all-or-nothing** ("99% restore is better than 0"). Sol's version threw the whole import away on any frame mismatch, stream truncation, or one invalid store. Now: frames match the manifest BY ID (order no longer matters); a mismatched/failed/duplicate frame is skipped + counted in `importFailures`; a container that dies mid-read keeps what staged. One decision at commit: perfect stream + all-valid stores → Sol's atomic REPLACE (exact restore, stale media pruned); anything less → new `JournalMediaStore.commitImportMerge()` — staged frames land by id, **nothing is ever deleted**, valid stores still apply (invalid ones skip individually again), shortfall reported via `countMismatches` → the "Import completed — N problems" toast. This keeps BAK1's essential guarantee (a damaged backup can never destroy existing media) while restoring everything readable. `commitStaged(clearLive)` is the one shared transaction under both commits. 5 tests rewritten to the salvage contract + 1 new merge test.
- **Cross-tab lock widened.** Sol's lock only covered import↔import; an export/verify/wipe in a second PWA tab during an import could read torn state. `withBackupLock` is now exported and Export/Verify/Clear hold the same lock via `_runLockedBackupOperation` (import must NOT double-wrap — Web Locks aren't reentrant); contention shows "Another backup operation is running in a different tab" instead of the corrupt-file message (special-cased at the one shared `applyFn` await).
- **Kotlin teardown re-guarded.** Sol's `stopAudioCaptureForTeardown` restored the audio mode unconditionally — the old teardown's `mode == MODE_IN_COMMUNICATION` guard was lost, so every idle app exit wrote the device-global mode (which another app's call may own). Guard restored (focus-held OR in-communication); 2 new tests pin both directions (235→237). **One review finding withdrawn after deeper checking:** the recorder `cancel()` on every `onDestroy` looked like a regression vs. the old ViewModel-survival design, but no reattach flow exists — a recorder surviving `webView.destroy()` is an orphaned hot mic. Sol's unconditional cancel is CORRECT and stays.
- **P2s:** letter-links (`role="link"`) activate on Enter only — Sol wired Space too, which steals page-scroll (fn-ref buttons correctly keep both); `.link-card-remove`/`.link-card-show-more` were missing `padding:0` (UA button padding shifted the pills ~12px); AGENTS.md — the GPT/Codex-convention briefing file Sol itself likely read — was a month-stale CLAUDE.md copy, replaced with a 5-line pointer at CLAUDE.md (delete outright only if GPT tools stop being used here).

**Known sharp edge (accepted, not fixable retroactively):** the media-DB v1→v2 bump + `onblocked`-rejects means a STALE pre-update PWA tab left open blocks the updated tab's media DB entirely (old code had no `versionchange` close handler) until that tab closes. Fail-fast + retryable (`_dbPromise` resets on rejection); APK unaffected (single WebView). Also noted: Sol's own "remaining risks" list is accurate — the two-database restore atomicity item is correctly scoped as needing a persistent recovery journal, not another ordering patch.

**Gates at land:** 3,242 vitest / 180 files; 237 Kotlin + JaCoCo; lint 0; tsc 0 (globals regenerated for `withBackupLock` — 474); smoke:ci PASS; corpus untouched at c19; CSP 8 hashes current; SW `v1.0.2-aa7707427c`.

**Post-land hardenings (`318f75d`)** — the owner asked "legit or nah?" on Sol's four residual risks; adjudication: all honest, two spawn cheap work, two deferred (release-smoke script only when a release channel exists; Settings/backup-orchestration extraction only on next churn; 2PC journal + globals migration = not worth it). Landed the two: **(1) restore-inflight boot guard** — `vot-restore-inflight` LS marker bracketed around the import apply (set pre-mutation, removed on durable completion or provably-untouched lock contention; handled failures deliberately leave it set), consumed at boot by the new `useRestoreGuard` hook → one-shot persistent toast "re-import your backup". Closes the only SILENT failure mode in the two-database restore window; live-verified (warns once, silent next boot). Key literal pinned on both sides of the classic-script seam by tests. **(2) manifest-size export tripwire** — `buildV3Manifest` returns exact `manifestBytes`; both export paths warn persistently past 12 MiB (75% of Android's 16 MiB `MAX_V3_MANIFEST_SIZE` import cap), so an unrestorable-on-phone backup is flagged at export time, not discovered on a wiped phone. 6 tests; 3,248 vitest; App() 769→774.

### 2026-08-02 (session 2) — Recon-driven strike run: cold boot −27%, last untested hook covered, SW install throttled, column-pin miss fixed

**Shape of the session:** the owner had a coordinating session launch a SEPARATE Opus 5 (xhigh) recon session in a visible terminal with a read-only mission: rank the top improvement candidates NOT already tracked. Recon returned 5 strikes + an honest discard list ($3.11, 8m12s); the coordinator verified every claim against source before executing — and that verification mattered twice (see [4] and the dead-CSS item). All 7 commits gated + pushed (`bea40f8..39643ce`).

**[4] `.mode-toggle-wrap` column pin** (`bea40f8`) — the PDF/Inline toggle missed the 08-02 `--col-max` sweep and floated ~310px off the column at 1600px. Recon's proposed placement (add to the 768px media block up top) was WRONG — the base rule sits LATER in the cascade at equal specificity, so the pinned line was dead; the file's own `.link-sidebar` comment warns of exactly this. Pin placed NEXT TO the base rule in its own `@media`. First live probe read 30px and looked like a failed fix — that was the SW serving stale CSS (the known clean-slate gotcha); after clean-slate, computed right = 340px ≡ the surprise-fab formula exactly.

**[2] use-settings.test.js** (25 tests) — the only uncovered hook, and a trust boundary (settings restore wholesale from imported .votbak). Defaults, showChrome/showChapterSummary migration (incl. migration-wins-over-stale), body-class matrix, arrows-* exclusivity, reading-font routing incl. unknown-id degrade, PlatformBridge mirror, and the SEC-3 font-scale clamp corners — RED-proven (reverting the cap to 1.6 fails 3 tests). Typecheck gate caught a bare `globalThis.GARDEN_DEFAULT_TIER` assignment; JSDoc any-cast per repo style.

**[5] JournalInsertSheet.test.jsx** (21 tests) — 572 lines, zero tests, user-authored-data path, touched the day before. Menu emission + close contract, all four drill pickers with malformed-input guards, excludeJournalId, embeddable filter, embed shapes (own id / shared mediaId / source attribution), back() state machine, and `targetToJournalBlock` exercised via the captured LinkPicker bridge callback (bible verse-block/chapter-card, letter volKey resolution, both null guards).

**[3] SW install concurrency** (`863b528`) — the corpus+font precache fired ~60 fetches / ~9 MB in ONE flat allSettled inside `waitUntil`, saturating the link on the very visit that installs the SW (racing first paint's own bundle fetches). Worker-pool of 4 (under the browser per-host limit), same skip-if-present + best-effort semantics.

**[1] Cold-boot split** (`3d07f1e`) — bundle-a carried 353 KB of Bible data cold boot never parses: `books-restored.js` (34%) + `matthew-plain.js` (25%). Both moved into bundle-a-bible — NOT a sibling bundle, deliberately: `__finishBibleInit` (index.html:448) derefs `MATTHEW_PLAIN` unguarded, which is safe only because the same bundle defines it before the loader calls the finisher. Every other consumer typeof-guards (BibleChapterView:12, ChapterIndex:17, tabs.js:61). `matthew-nkjv.js` STAYS critical (3 unguarded derefs on the VOT letter path). bundle-a 593→240 KB raw (−59%); cold-boot blocking path 1.40→1.05 MB, paid every APK launch. CORPUS_VERSION c18→c19 (membership change = byte change); the SRCH1 gate then caught `search/cache.js` CORPUS_CONTENT_VERSION and the BLD1 minify-fidelity mirror caught its source list — both updated, both gates working as designed. Verified live on clean-slate: slim boot, one `__loadBibleCorpus()` lands BOOKS + BOOKS_RESTORED + MATTHEW_PLAIN together, `BOOKS['matthew-plain']` wired, Genesis 1 renders with the restored chapter-title/heading overlay.

**useJournalMediaSweep extraction** (`6bfc7b9`) — App() sat at EXACTLY 800 lines (the canary limit) with zero headroom. The one remaining effect with zero closure dependencies (the boot orphan-blob sweep) moved verbatim to `hooks/use-journal-media-sweep.js` → 769 lines. Everything else left in App() is composition glue that must see the closure — further splitting would be churn, matching the recon verdict on SettingsScreen (1,765 lines, top churn, but a split has no named payoff; raise only as a deliberate code-health strike).

**Dead CSS** (`39643ce`, −2 KB) — recon named 7 orphan candidates; prefix-grep proved 2 of them LIVE (`sel-color-underline/squiggle` and `pc-*` are built by string concatenation — literal grep alone would have deleted styles in active use). The three provably dead blocks removed: retired Mark Complete button, `.vot-toast-sw-update` (unreferenced since clients.claim() landed), `.font-picker-downloading` (retired download-on-demand design). Tombstone left.

**Duplication sweep verdicts:** sheet-header consolidation adjudicated NO — 5 sites but 3 genuinely different shapes (color-dot header, conditional close, title-only), not the 19×-identical LibraryNav class. Recon discards confirmed: no fat CSS target, React.memo correctly absent, SettingsScreen split deferred-with-reason.

**Owner asks, four accumulating:** (1) his older neighbor tapped the `—` pill bar atop the footnote sheet expecting it to close and nothing happened — make it close, plus a ‹ fallback at the sheet's upper-left; (2) make VOTReader use PC/tablet viewports properly (the 760px column was adrift in black on monitors, sheets ran full-viewport with ~300-char verse lines); (3) take easy low-vision wins, buttons must never spill off-screen (prior bug class); (4) raise the Text Size cap — 160% "way too little" on PC, he was ctrl-zooming.

**1 — SheetHandle.** The grabber existed as THREE duplicated cosmetic divs (`fn-sheet-handle` ×4, `select-sheet-handle` ×2, `link-action-handle` ×3 — 9 sites) plus a fourth fake (`jrn-insert-sheet::before`). All consolidated into ONE module, `ui/components/SheetHandle.jsx` (Cluster D, bare-name global like every shared component; registered in vitest.setup.js next to useFocusTrap): a 132×44px pill-bar button AND a 44×44px ‹ chevron at the sheet's upper-left, both wired to onClose. The bar is `aria-hidden` + `tabIndex -1` (redundant touch affordance; the chevron is the ONE screen-reader/keyboard Close stop — the first draft shipped two adjacent identical "Close" announcements and the review caught it). The three CSS classes are tombstoned; the journal insert sheet's fake bar (a pill that LOOKS tappable over a header that already has ‹ and ×) was simply deleted. TabActionSheet got `data-autofocus` on "Rename tab…" because the focus trap otherwise landed initial focus on the new chevron — open sheet, hear "Close", Enter dismisses it (review finding #3, real regression, fixed).

**2 — Desktop tiers.** The single 768px/760px desktop column became `--col-max` tiers: 768px→760, **1100px→860 + 18px root font, 1600px→980 + 20px root** — the font boost composes with `--font-scale` (`calc(112.5% * var(--font-scale,1))`) so the reader's own Text Size still multiplies on top, and chrome stays px-pinned. Line measure stays ~constant; the app just uses the monitor. Fixed chrome now tracks the column: `.fn-sheet`/`.select-sheet` get `max-width:var(--col-max); margin:0 auto` (margin-auto centering deliberately — their open/close transform is translateY and must not be touched), `.chapter-nav-sticky` likewise, `.surprise-fab` right-pins to the column edge, `.link-sidebar` ditto — **but its override must live NEXT TO its base rule** (same 0,1,0 specificity, media queries add no cascade weight; placed in the 768 block up top it was dead code silently losing to the later `right:0` — review finding #1). Mobile <768px is pixel-untouched.

**3 — Low-vision wins.** `.fn-sheet-nav-btn` (the ‹ › footnote pager) 30→44px px-pinned circles; `.nav-arrow-btn` (floating chapter arrows) kept its 30px visual but gained an invisible `::before` inset:-7px hit halo (~44px target, no spill risk); the handle bar is 44×4px and brightens on hover/press.

**4 — Cap 300% + the spill sweep it forced.** `Math.min(1.6,…)` → `Math.min(3,…)` in the THREE clamps (SettingsScreen `clampFontScale` + slider max, use-settings SEC-3, index.html boot script — CSP rehashes via build:csp). The owner's "buttons spilled before" warning was prophetic: at scale 3 on a 375px phone, measured live, the settings toggles/selects rode off-screen. Fixes, all inert at normal sizes: `.settings-row-head` and `.progress-row` gained `flex-wrap` (the danger-zone rows' existing pattern), `.settings-clear-btn` dropped `white-space:nowrap` for `max-width:100%`, `.settings-chip` got `max-width:100%` + shrinkable label, `.fn-sheet-num-row` wraps (Cinzel "FOOTNOTE N OF M" + two 44px circles exceed the sheet at scale 3 — review finding #4), and `.fn-sheet` side padding is `min(1.5rem, 24px)` + `overflow-x:hidden`. Exit proof: every settings group open, scale 3, 375px — **zero** elements past the viewport edge, no document h-scroll. (Live-measurement trap for next time: the accordion's open animation transiently reports mid-transform widths — measure settled, and note the app's settings effect re-applies the stored `--font-scale` on every re-render, stomping a devtools-set var.)

**Verification:** 3,163 vitest, lint 0, tsc clean, smoke:ci PASS ×2. Live-driven in the preview at 375/768/1280/1920: tiers apply (760/16 → 860/18 → 980/20), sheets center at col width, grabber AND chevron close (footnote + select sheets, mobile + desktop), slider hits 300% and composes to a 60px root on desktop. A 7-agent adversarial review workflow (3 lenses → refute-by-default verify) confirmed 4 real defects — all fixed same-session, listed above so the failure modes stick: cascade-position kills same-specificity media overrides; duplicate aria-labels on adjacent twins; focus traps land on whatever you put first; every rem-sized row is a spill candidate when a clamp moves.

### 2026-07-31 — Reading Font picker (17 fonts, download-on-demand) + Settings accordion redesign

**Owner ask, two parts:** "many optional font choices with each font name displayed in its font" (with a download prompt if bundling would bloat), then "redesign settings menu with dropdown/collapsible grouping" where dependent settings hide until their dependency is on.

**Part 1 — Reading Font.** `settings.fontStyle` grew from the classic/modern two-state into an id over the new **`READING_FONTS` registry** (`src/utils/reading-fonts.js`, bundle-b): the two built-ins (**System Serif** = classic, **EB Garamond** = modern — both historical ids kept so persisted + backup-imported values stay valid) plus **15 downloadable OFL fonts** (Lora, Literata, Merriweather, Crimson Pro, Source Serif 4, Libre Baskerville, Cardo, Gentium Book Plus, Noto Serif, Spectral, Vollkorn, Alegreya, Bitter, and two readability sans: Atkinson Hyperlegible, Lexend). **The bloat answer: only ~45 KB ships** — per-font *name-glyph* WOFF2 subsets (`fonts/previews/*.woff2`, 1–4.4 KB each, generated by the new `tools/gen-font-previews.mjs` using the `subset-font` devDep; regenerate, never hand-edit) let the picker render every font's name in that font. The FULL font (39–146 KB, measured sizes shown in the UI) downloads on selection from the fontsource CDN after an inline ConfirmStrip ("Download Lora (~77 KB)? One-time…"), lands in the **`vot-fonts-v1` Cache Storage bucket**, and is registered via **FontFace(ArrayBuffer)** — so no @font-face/font-src involvement; the only CSP change is `connect-src + https://cdn.jsdelivr.net`. Cache-first forever after (verified: reload restores Lora from cache offline-style, zero refetch). A failed download **changes nothing** (all-files-or-nothing FontFace registration, setting committed only after success, toast on failure).

Plumbing: app.css's ~100 literal `'EB Garamond', serif` declarations (4 spelling variants) all routed through a new **`--font-body`** var (`:root` default `'EB Garamond', serif`; `--font-garamond` aliases it so the injected journal styles follow); use-settings mirrors the choice onto `<html>` and disables `#custom-fonts` ONLY for classic — every other choice keeps **Cinzel chrome** (verified: `.settings-title` stays Cinzel Decorative while body text is Lora). The index.html boot script's disable condition flipped from `!== "modern"` to classic-or-absent (CSP hash resynced by build:csp). Previews are SW-precached (best-effort list) and `@font-face`'d in app.css with `../fonts/previews/` paths (app.min.css lives in dist/; build:css doesn't rebase urls — that pathing is load-bearing). Preview families are `'p-<id>'` — name glyphs ONLY, so never use them for body text. `check:apk-assets` untouched (fonts/ has no ignore pattern, previews ship in the APK). Unknown/future ids degrade to the classic look (`readingFontCss` fallback) — backup forward-compat.

**Part 2 — Settings accordion.** New module-scope **`SettingsGroup`** (in SettingsScreen.jsx): every section is a 52px+ tappable header card (Cinzel label + plain-language sub-caption + rotating chevron, `aria-expanded`) whose body **unmounts while closed** — the auto-scroll disclosure discipline applied to the whole screen. **8 groups, all collapsed on entry** (the screen opens as a table of contents): Appearance (Light Theme, True Black, Text Size, Reading Font), Reading (Bible Translation — moved here from Appearance — Chapter Titles, Section Headings, Restored Names, Arrows, Scripture Browser, Echoes, Notch, Dot, Streak Dwell, Random Letter, Keep Screen On), **Auto-Scroll (own group now)**, Top-Nav Buttons, Search Tabs & History, Garden, Your Data, Mark as Read. **Dependency-gated rows now UNMOUNT instead of greying**: Synonym Search + Filter Stop Words vanish while Search is off; Restored Names vanishes when BOTH Chapter Titles and Section Headings are off; the History nav chip vanishes while History is off (the `disabled`/`disabledReason` props on those call sites are gone; SettingsRow still supports them). The wipe + import-overwrite overlays moved OUTSIDE the accordion so their mount never depends on a group's open state (the import confirm arrives async after a native file picker).

**Follow-up 2 (same session, owner call): all fonts IN the app, more of them, scripture-first order.** "Those fonts are all around 100kb, acceptable bloat" — the download-on-demand design lived a few hours. All reading fonts are now **vendored** under `fonts/reading/` (**1.73 MB, 58 woff2**, fetched by the new `tools/gen-reading-fonts.mjs`, which replaces gen-font-previews.mjs) and declared as plain **@font-face in app.css** — browsers fetch an @font-face file only when its family is USED, so unchosen fonts still cost zero at runtime. The whole loader stratum died: preview subsets (`fonts/previews/`), the `vot-fonts-v1` Cache Storage bucket, `ensureReadingFont`/`isReadingFontCached`, the confirm strip, size badges, and the CSP `connect-src cdn.jsdelivr.net` (reverted to `'self'` — zero egress again). The SW serves `fonts/reading/` **corpusFirst from the STABLE corpus cache** (new `READING_FONT_PRECACHE`, skip-if-present install) so every choice works offline WITHOUT re-downloading 1.7 MB on each app-version bump; activate deletes the orphaned `vot-fonts-v1`. **+8 content-fitting fonts** (Cormorant Garamond, Rosarivo — designed for scripture typesetting, Sorts Mill Goudy, Old Standard TT, IM Fell English — antique bible print, Gelasio — Georgia-alike, Neuton, Playfair Display) → **25 options**, reordered scripture-and-classic-first (owner call): built-ins, then Cormorant Garamond/Cardo/Gentium/Rosarivo/Crimson Pro/Sorts Mill Goudy/Old Standard TT/IM Fell/Baskerville, then contemporary serifs, display, sans last. `reading-fonts.test.js` became a **four-way sync gate**: registry ↔ fonts/reading/ on disk ↔ app.css @font-face block ↔ SW precache list — a font added or renamed anywhere fails until all four agree. Registry order is pinned by test. APK grows ~20→~21.7 MB. 3,163 vitest net (download-flow tests deleted). Verified live: 25 options all rendering in their real families (23 families `document.fonts`-loaded from local files), instant apply, 58 files SW-precached into the stable cache, zero download chrome, console clean.

**Follow-up (same session, owner call): fonts behind a dropdown.** The inline chip grid was replaced by the app's standard **SelectField sheet** — the Reading Font row now looks and behaves exactly like Bible Translation/Image Quality: trigger shows the current font's name in its preview family, the sheet lists all 17 (name in its font + style blurb + right-aligned status: Built in / Downloaded / ~KB / Downloading…). SelectField grew three optional, backward-inert props for it: per-option `labelStyle` + `meta`, row-level `valueStyle`. Picking an un-downloaded font closes the sheet and confirm-gates below the row as before; a "Downloading <font>…" `aria-live` line shows while the fetch runs. `.font-chip`/`.font-picker-grid` CSS deleted; `.select-sheet-option-meta` added.

**Tests:** +29 (3,140 → **3,169**): `reading-fonts.test.js` (registry contract — ids are backup-persisted, so they're pinned; loader cache-first/fetch-once/all-or-nothing/API-missing-degrades), `FontPickerRow.test.jsx` (confirm-gates-download, Cancel/failure apply nothing, active no-op, preview families), and SettingsScreen accordion + disclosure suites. The harness's `renderSettings` now **auto-expands all groups** post-render (pass `{ expandGroups: false }` to assert the collapsed state) — that's why the 37 existing row-level tests survived unchanged. Verified live in preview: 8 collapsed heads → open Appearance → picker grid (17 chips, 16 `p-*` previews `document.fonts`-loaded) → Lora confirm → real CDN download through the CSP → `--font-body` flip → persisted → cold-boot restore from cache → System Serif revert (block disabled, serif fallback) → search-off row-vanish → 375px: 1-column grid, no h-overflow, all targets ≥44px. smoke:ci PASS, console.error 0, resource404 0.

### 2026-07-31 — About page 2 rewritten as a terse Library/Tools rundown

Owner call: the "What You Can Do" onboarding page (AboutScreen page 2) was seven bold-lead paragraphs (~130 words) for a screen tapped past once. Replaced with two headed groups — **The Library** (complete VOT corpus; the Bible in **ten** translations including the two custom Restored Name editions; every PDF, Bible study, and letter study) and **Your Tools** (annotate anywhere; private on-device journal; full-text search; fully offline, no downloads except the *Return to the Garden* images) — ~60 words total, copy drafted by the owner and tightened. The old text also undercounted translations ("eight") — predating rnkjv/rkjv; the shipped list in TRANSLATION_OPTIONS is ten. New `.about-subhead` style (small gold Cinzel, matches `.about-heading`); `.about-features p` spacing tightened to 0.8rem. Page 1 tightened in a follow-up commit (~70 → ~55 words: "study and reflection" → "study", export line compressed, "PDF files" → "PDFs"; the opening doctrinal sentence untouched); dots, diamonds, and the "Begin Reading" CTA untouched; AboutScreen tests don't pin body copy, so no test churn. Verified rendered in preview (both pages). Committed `2b0593d`, pushed, APK built + installed on the test device.

Follow-up (same day): two review findings. (1) Touch targets — `.nav-back-icon` min-width 32→44px (both the rem block and the px chrome-pin block; the glyph is borderless so the widening is invisible); `.tabs-nav-btn` kept its ~27px visual pill but gained an invisible `::before` hit-area extender (`inset:-9px -2px`) reaching 47×44. Both measured ≥44px at 360px width. (2) "Begin Reading" below the fold at 360×800 — a `@media (max-width:420px)` block slims About paddings/margins; measured: the full page-2 card now fits with ~66px to spare, zero scroll. Note: the back button costs 12px more nav width; `.nav-btn` ellipsizes via flex-shrink so busy navs degrade gracefully.

### Current state (2026-07-30/31) — the six-item UX batch: one nav module, notebook header, universal back pill, compound refs, layout cycle, autoscroll honesty

**One commit (`5f3e8c7`), six owner-reported phases, each gated green before the next started.** Two of the six were reported as one-line cosmetic complaints and turned out to be two root causes each — that is the part worth reading.

**Phase 1 — ONE shared top-nav module (19 implementations → 3).** The owner's report was "the back arrow is small on some screens". It was **TWO independent bugs**, and neither was where a CSS-only look would have put it. (1) **LetterView's `nav-volume`**: the back button carried `nav-volume` in addition to `nav-back-icon`, and because `.nav-volume` sat AFTER `.nav-back-icon` at equal specificity — in the main block AND again in the px chrome-pin block at the end of app.css — it silently shrank that arrow to **11.52px** on 13 screens. It lost the cascade, not the class list. `.nav-volume` is **deleted**, with a tombstone comment at app.css:549 saying why and "do not reintroduce". (2) **`_idxNav` never adopted the icon back at all** — the 2026-07-14 icon-back change simply never reached the 14 index screens; they had been rendering the old text button since. The fix for both is structural rather than per-screen: **LibraryNav is now THE nav**, extended in place with `backLabel`/`backTitle`/`hideBack`/`showHome`/`onHomeBefore`/`leftExtras`/`rightExtras`/`arrows`/`reading`/`chapterBookmark`/`hide[]`, and every screen routes through it. It stays a **plain function returning a fragment** (`LibraryNav({…})`, never `<LibraryNav/>`) because call sites and several test stubs depend on that convention — which also means it must never hold hooks. `NavButtons` gained per-icon `hide`, so the two screens that omit one icon no longer need their own nav. Three hand-copied SVG blocks (Settings/About/History) deleted. **Two documented exceptions survive on purpose**: SearchScreen (the input row REPLACES the right half of the nav, and app.css:319 already exempts it via `:not(:has(~ .srch-input-row))`) and GardenView (the one screen that bypasses ScreenLayout entirely for immersive chrome — adopting the shared nav would be a rewrite, not a consolidation). The now-dead `journalRef` props came out with the old navs; their `jrnRefKeyFor*` helpers were left for a cleanup pass (done 07-31, below).

**Phase 2 — the drilled notebook header.** Drilling into a notebook stacked a "My Notes" header ON TOP of the notebook's own header row, and the notebook name was crushed between a back arrow and two action buttons at high `--font-scale`. Now **two rows**: `h1` notebook name plus its per-notebook count on the title line, actions on their own row below; the redundant "My Notes" double-header is suppressed while drilled. Action targets lifted **24px → 44px**. Verified the name no longer crushes at `--font-scale: 1.6`.

**Phase 3 — the back pill EVERYWHERE except History (the owner's own exception).** This is the phase that grew. **`journalEntryId` became the 7th tracked back-stack field** (App()-local state, not a tabField, but threaded identically). The notes→journal pill was insta-pruned by a **self-contradicting `destSnapshot`** — the journal branch now records a snapshot that can actually match, so the pill survives arrival. **journal-viewer renders exactly ONE pill**, with a fixed precedence: the private journal→journal stack first, else the cross-screen `backHint` — and `.back-hint-row` is `position:sticky`, so two of them would double-cover the entry. That pill calls `tapThroughBack` **directly** rather than routing through `window.handleAndroidBack`, whose journal branch would otherwise have to re-derive the same decision; hardware back walks the same precedence for parity. History pushes entries with **`silent: true`** — the owner does not want a pill on links tapped from History, but back must still return there — which forced the **`backHint`/`backActive` split**: the pill keys off `backHint` (null for silent entries), hardware back keys off `backActive` (true for them). Five link paths that previously pushed nothing now push: the journal inbound chip, `{{nav:}}` chapter links, study-side letter and study jumps, and LinkSidebar (which also gained a real source label instead of a generic one). New **`use-from-letter-stack.test.js`** — the machine that drives every back pill in the app **had no tests at all** before this. *(This phase survived two host crashes; work was resumed from the transcript both times.)*

**Phase 4 — compound scripture refs tap through per-part.** `the-blessed.js` compound chips were **silent dead taps**: a `{{ref:Daniel 9:27; 11:31}}` chip rendered fine and did nothing. New shared **`splitCompoundRef`** in `scripture-resolution.js` — semicolon split, **book carry-forward** ("Daniel 9:27; **11:31**; 12:11"), comma expansion ("Matthew 5:3-4, 7"), cross-chapter ranges navigating to the start ("Revelation 21:1-22:5" → 21:1), and dash normalization first (Permanent Rule 1, and 1-char→1-char so chunk ordinals still line up with the raw string). The **chapter-qualified comma tail** ("Exodus 20:12, 21:17" — where the tail names its OWN chapter rather than inheriting) was found by auditing all 23 compound cites in `matthew.js`, not guessed. Each part carries its ordinal, so the journal re-renders the ORIGINAL string **character-identically** (separators and all) with each chunk its own tap target — load-bearing, because journal blocks are annotatable and highlight offsets walk that text. GoToRefButton and the journal `{{ref:}}` chips both go through it, so a compound behaves the same everywhere. Also: note rows gained **`noteSourceSegments`** + per-segment tap targets carrying `verseEnd` (the whole range flashes, not just the first verse); `FootnoteListSection` gained its missing Go-to-Scripture button; `navigateToLink`'s study branch kicks the matthew corpus, and `screen: null` letter endpoints now **bail cleanly** instead of pushing a junk entry. **`parseRefStr` and `lookupVersesFromBooks` were deliberately left untouched** — `parseRefStr`'s single-object return is a pinned contract (4 `toEqual` tests) and it is the search-ranking choke point (nav-index gives its hits a 1000-point boost). The split belongs at the callers, in one place.

**Phase 5 — the Scriptures layout cycle button.** A small top-right icon on ScripturesHome cycles `scriptureLayout` through `SCRIPTURE_LAYOUT_OPTIONS`, with a transient `aria-live` caption. It sits **in-content, not in the nav** — the nav is already at its documented width limit. It reads the **same options table and the same state** as the Settings row, so the two **cannot desync**. **Zero vertical cost, A/B-proven** by measuring the page with and without the button at `--font-scale` 1.0 / 1.6 / 2.0, and the 200% zoom audit is not regressed. First-ever direct test coverage for ScripturesHome (14 tests). **Classic-script gotcha worth remembering:** `SCRIPTURE_LAYOUT_OPTIONS` is a lexical `const` in index.html, **not** a window property — `typeof X !== 'undefined'` works, `window.X` does not.

**Phase 6 — autoscroll honesty, and the measurement that would have shipped a lie.** The dwell is now adjustable **from the pill**: a toggled second row (± around the value) plus inline ± beside the countdown while it is actually running, because the moment you want to change the pause is the moment the countdown is on screen — the worst possible moment to open Settings. New **`rearmDwell()`** re-arms a LIVE countdown against `dwellStartedAt` rather than "now", so raising the dwell mid-countdown lands on the deadline the new setting describes instead of double-counting time already sat; the `MIN_PAGE_MS` floor is intact underneath it. The Settings **"≈N wpm" ×9 guess is DELETED** and replaced with a **measured** WPM on the pill: words-per-line sampled from the laid-out `[data-hl-key]` boxes, × lines/min. **The naive version was wrong and would have shipped ~2000 wpm.** `data-hl-key` is not always on the same kind of box — on the verse screens it lands on inline spans, where `getClientRects()` is one rect per visual line; on LetterView it is on the `<p class="letter-para">` itself, a **block**, whose `getClientRects()` is a single border box no matter how many lines it wraps to. So a letter measured as one enormous line. The fix takes `max(getClientRects().length, round(height / lineHeightOf(node)))` — exact in both regimes, no display sniffing. Two things must be skipped: the annotation engine also hangs `data-hl-key` on the note **icon** (zero words, drags the average down), and `.letter-para` carries `content-visibility:auto`, so a scrolled-past paragraph is **not laid out** and reports zero height while still returning all its text — **a zero-height box means "no measurement", never "one line"**. It forces synchronous layout, so it runs **once per page in `requestIdleCallback`**, never on the frame path (the 07-28 responsiveness lesson). No measurement → no number shown; a made-up rate is worse than none. `clampEndDwell` and `lineHeightOf` moved into `use-autoscroll.js` so the pill can clamp its own stepper and measure per-element without importing its parent (a cycle).

**Gates:** **3,140 vitest** (63 new), eslint 0 warnings, typecheck, build, smoke:ci clean (0 crashed / 0 console.error), check_balance ALL OK. Committed `5f3e8c7` and pushed.

**Docs + cleanup pass (2026-07-31, same batch).** `jrnRefKeyForChapter` / `jrnRefKeyForLetterByLabel` deleted — dead since Phase 1 removed their only callers (the NavButtons `journalRef` props); their `_entry-b.js` re-exports, their tests and their generated-globals entries went with them (`jrnRefKeyForLetter` and `jrnRefKeyForBookmark` are still live and stay). ARCHITECTURE.md gained a top-nav section and its **first autoscroll section** (it had zero coverage of the transport), had its back-pill sections corrected to the seven-field / `backHint`-vs-`backActive` / `silent` design with the three pill systems named and ranked, and had stale notes-screen claims fixed (`NotebookManagerSheet` does not exist; `window.__pendingOpenNote` is now `navHandoff`). CLAUDE.md's "All 53 screens" corrected to **54** — the route table has 54 keys, counted this batch.

**Still owed on-device (nothing blocking):** wpm pop-in timing, mid-countdown ± feel, note-row segments at 160% text, footnote-list button density, and a notes→journal pill round-trip on real data.

### Current state (2026-07-30) — external-review run, then the last three backlog items

**Ten commits (`d43638f..4e87ef2` + docs), driven by successive external review batches; every one gated + pushed.** Two were regressions this session introduced and then caught, which is the part worth reading.

**Review batch 1 (`d43638f`).** Three findings, all real. (1) **Selection edge auto-scroll could run away**: the interval only re-checked `isCollapsed` per tick — the band/stop decision ran ONLY on `selectionchange`. Releasing a handle INSIDE the edge band fires no further events (Android swallows the post-selection `pointerup`/`touchend`, and scrolling alone doesn't mutate the selection), so the container scrolled to its end. The band is now re-probed EVERY tick: a released edge glides out of the band (≤90px) and stops, and direction+scroller are re-read each step, which also killed a stale-closure bug where a focus jump into the OPPOSITE band kept the old direction. The reviewer's stated mechanism ("later selectionchange events cannot stop it") was wrong — `dir === 0 → stop()` runs before the `if (timer) return` guard, so events *do* stop it while they flow; the real gap is that after release there are no events at all. (2) **`clients.claim()`** added to the SW's activate: `skipWaiting()` alone never fires `controllerchange` in an already-open tab, so sw-register's reload never ran while activate had ALREADY deleted that tab's core cache (offline 503). (3) **Import integrity**: every verify outcome other than `ok`/`absent` now warns (web `trailing` + Android `malformed` were silently accepted although `formatVerifyReport` classifies both as corruption), and the Android CRC result is folded into the completion toast instead of a 5s toast fired after the 600ms reload had already destroyed it; any import with problems now holds the reload 5s.

**The regression that (2) caused, and its fix (`1e7a023`) — the instructive one.** `clients.claim()` gives an UNCONTROLLED page a controller, which fires `controllerchange` exactly like a real update. sw-register reloaded on every `controllerchange`, so a first visit reloaded itself once for nothing — and it broke `smoke:ci` outright, all 3 attempts dying with *"Execution context was destroyed, most likely because of a navigation"* because the walk lost its execution context mid-run. **Fix: gate the reload on whether the page HAD a controller when registration ran** (captured before `register()` so claim can't flip it first). An uncontrolled page fetched every asset from the network and is already newest; a real update always lands on a controlled page. `clients.claim()` stays. smoke:ci back to PASS on attempt 1. **Lesson: `clients.claim()` and a genuine SW update are indistinguishable at the `controllerchange` event — the only discriminator is the pre-registration controller.**

**Review batch 2 — adjudicated, not accepted wholesale.** `npm audit fix` (no `--force`) + in-range bumps (`2f3f8b7`): esbuild 0.28.0→0.28.1, vitest+coverage 4.1.7→4.1.10, eslint 9.39.4→9.39.5, puppeteer 25.1.0→25.4.0. **The esbuild bump left every `dist/bundle-*.js` byte-identical** (CACHE_VERSION unchanged) — the cleanest possible proof the `--target=chrome108` contract (Permanent Rule 6) held. **The 6 remaining "high" findings are a FALSE POSITIVE and should not be chased:** the brace-expansion DoS advisory (GHSA-mh99-v99m-4gvg) encodes its range as a single `<=5.0.7`, which lexically swallows the entire 1.x maintenance line; installed is **1.1.18, the backport of that very fix**, published 2026-07-30 seventeen minutes after 5.0.9. npm's offered remedy is a *downgrade* to `eslint-plugin-react@7.22.0` — strictly worse. Re-check only when the advisory range is split per major. Majors declined: eslint 10, jsdom 30, typescript 7. Also **all 14 workflow `uses:` SHA-pinned + Dependabot added** (`1d9bfc3`) — the threat that actually applies here is `deploy-web.yml` publishing straight to the live PWA, so a moved tag could poison what the owner reads; Dependabot rewrites SHA + trailing `# vN` comment together. **CodeQL and explicit Safe Browsing deliberately skipped** (no real trust boundary beyond the backup importer, which has its own validators; the WebView loads only bundled assets under the hash-locked CSP). `usesCleartextTraffic="false"` added as **documentation only** — targetSdk 36 means cleartext has defaulted off since targetSdk 28, so it changes nothing.

**`allowContentAccess` — DROPPED, verified on-device (`5936b77` then `999b1c9`).** The old comment's premise was simply wrong: that setting gates loading a `content://` URL from **page markup**, which this app never does; it is NOT what feeds the file chooser. First attempt could not be verified (phone locked/dozing) — the flag was reverted, the phone put back on a known-good build, and a comment claiming "verified on-device" was deleted BEFORE committing rather than shipped unproven. Re-run once unlocked: with the flag **false** on a fresh install (Android 17, WebView 150.0.7871.124) the photo picker opened, the picked `content://` URI came back through `filePathCallback`, and the page read the File to completion — **10,623,375 of 10,623,375 bytes** via `readAsArrayBuffer`. The URI carries its own read grant from the chooser result. Measured with a throwaway `<input type="file">` injected over CDP and removed after, so **no journal entry or media record was created**. `allowFileAccess` was already false; both are now off.

**Owner-reported bug (`840870d`): journal `{{ref:}}` links could navigate after you left the screen.** The corpus-loading retry (250ms × 40 = 10s) held its interval id in a local var, cleared only on success or the 40th try — never on unmount, never on a newer tap. Leaving the entry mid-retry still fired `onNavigateToLink` when the corpus landed. A second symptom the report missed: two quick taps raced and the OLDER one could win. Now held in a ref (newest tap cancels the pending retry; unmount cancels outright; the callback only nulls the ref when the id is still its own). Checked for a shared-helper fix first — only two sites use this pattern and `GoToRefButton` was already correct, so a one-site fix was right.

**The pre-commit vitest flake is IDENTIFIED and FIXED (`4e87ef2`) — closing the open question left in the Wave 0 entry below** ("flaked 3× during the commit series… flake not yet identified"). It was never resource contention. Two tests in SettingsScreen's import-confirm block asserted on `modalRegistry` immediately after `screen.findByText(/will OVERWRITE/)`. The sheet's TEXT lands at commit, but `useModalRegistry` registers in a **passive effect**, and the `setImportConfirm` that opens the sheet runs in an async continuation (`pickImportFile → … → setImportConfirm`) OUTSIDE `act()` — so React may flush that effect a tick after the DOM update. Both sites now go through a `findImportSheet()` helper that waits for the registry entry itself. **15 consecutive runs green** (previously ~1 in 5 failed). Nothing weakened: the id is still asserted, just not before it can exist.

**Coverage + the last backlog items.** `note-source.js` gained 25 tests (`5ecb10e`) — it had none, yet every Notes-index row renders through `noteSourceLabel` and navigates through `noteSourceNav`; covers both key shapes and where they diverge (bible's 4-part key vs study's chapter FUSED into `p[1]`), run-collapsing with dedup/numeric sort, all four entry kinds, and every null path including a malformed study key that must not invent a chapter.

**[17] 200% ZOOM AUDIT — DONE, and it PASSES.** It had been skipped 07-28 for "needs a visible browser pane". Done here **geometrically rather than visually**, which is stronger for this question: 200% browser zoom halves the CSS layout viewport while px-pinned chrome keeps its size, so it was emulated as a 640×400 viewport (from a 1280×800 desktop) **stacked with `--font-scale: 1.6`**, the documented worst case. A DOM probe measured every visible element for horizontal overflow and for content clipped by a non-scrolling fixed height, across Home, Volumes index, Volume One index, a Letter (reading), History, Settings, Library, Scriptures and the Tabs overview: **`clipped: []` and `scrollWidth === 640` on every screen.** The one genuinely tall piece of chrome — `.sel-toolbar`, which has no `max-height` and is 157px after this week's ▲/▼ retirement — was raised on real reading text and measured **top 77 / bottom 234 in a 400px viewport: fully visible**, 39% of the screen but not clipped. The `hOverflow` hits are all `.pager-peek` subtrees, which are parked ±one viewport BY DESIGN. Caveat for whoever revisits: screenshots were unavailable (the Browser pane must be displayed to composite frames), so this is a layout-geometry pass, not a pixel/visual-polish one.

**Batch-4 device check — splash→UI has NO black flash (verified, owed item closed).** Recorded a real cold boot over adb `screenrecord`, extracted frames with ffmpeg (installed this session) and measured per-frame brightness. A ~450ms window at t=2.05–2.45 reads as **98.6% black** by pixel statistics — but looking at the actual frame shows it is the app's own themed **"Loading Bible…"** state, gold on black, which is correct behavior for a session restoring into a lazily-loaded corpus. Sequence: splash logo → themed loading state → the restored 2 Corinthians 6 chapter, fully painted. **Zero full-white frames across the whole recording**, so the pre-paint white-flash check passes too. `wv.overScrollMode = View.OVER_SCROLL_NEVER` is still set (MainActivity.kt:573), which is the edge-glow guarantee. **This is exactly why the frames were opened rather than trusting the statistic — the brightness number alone would have produced a false defect report.**

**Gates:** lint, typecheck, build, **3034 vitest**, smoke:ci PASS (0 crashed, 0 unreached, 0 console.error, 0 resource404), validate:data (3120 items / 0 errors), check_balance ALL OK, corpus-version, CSP hashes, apk-assets, Kotlin `testDebugUnitTest` + JaCoCo. APK rebuilt and installed on the device.

### Current state (2026-07-29)

**SELECTION SCROLLING — the ▲/▼ nudge row retired; real scrolling works, the toolbar follows, and handle-drag auto-scrolls at the edges.** Owner: "once you open highlight it locks scroll and highlight pane has up and down arrows to scroll, but it'd be better if you could just scroll normally." **P1-15's premise was FALSE, proven on-device** (vot_api34 + CDP, synthetic native gestures): an identical drag scrolled **192px both with and without a live selection**, and the selection survived — the native selection layer never blocked scrolling. What actually made it feel locked was app-side: (1) the toolbar was placed ONCE and never moved — measured **content scrolled 200px, toolbar moved 0px**, leaving a 196px-tall pane stranded over unrelated text (and a drag started on the pane hits the pane, not the scroller); (2) extending a selection past the viewport had no natural gesture, so the arrows were added instead. Fixes: placement extracted to `placeFromSelection(allowAssistScroll)` and re-run on every scroll frame (rAF-coalesced, never moves the container) — verified **1:1 tracking (selection −60px, toolbar −60px)**, and it still flips below correctly when the selection nears the nav; **edge auto-scroll** while a native handle is dragged into the top/bottom band (new pure `computeEdgeAutoScroll`, band clamped to half the box so the two ends can never both arm) — verified on-device: a hold at the bottom band scrolled 544→2563 and grew the selection to 1755 chars; the ▲/▼ row, its styles and `nudgeScroll` are gone (toolbar 196px → **157px**). **Bug found AND fixed by the new freedom:** the near-top assist-scroll fired for a selection whose start had scrolled off-screen above, **yanking the reader ~2000px back on release** (2563 → 564). `computeToolbarPlacement` now refuses the assist unless the selection starts at/below the nav AND the deficit is within one toolbar-plus-gap — re-verified on-device: **yank 0px**. +8 tests (6 pure-decision, retirement check, 2 assist-guard); suite 3000 passing.

### Current state (2026-07-28, session 2 — the backlog run)

**FABLE5-BACKLOG CLEARED (owner: "do everything ... in most logical order").** Ten items landed in one continuous run, each through the full gate with its own commit + tests: **[15]** Backup Verify (read-only .votbak inspector, both platforms), **[13]** modal focus traps (new `use-focus-trap.js`; 8 dialogs trapped; Escape stays with the registry dispatcher), **[8]** search result filter chips + book-order sort (client views in `utils/search.js`), **[9]** scope chip from index screens (`COL_BY_INDEX_SC` in goSearch), **[16]** journal block-delete session undo (deferred re-checked media cleanup), **[7]** tab rename + pin (pinned survive every bulk close), **[11]** notebook color tags (`NotebookStore.setColor` + swatch row + dots), **[12]** Holy Days Year view (List|Year toggle, timeline over unchanged data), **[10]** True Black OLED as a dark-theme MODIFIER (`settings.trueBlack`/`body.amoled` — deliberately not a third theme value: nav cycle + thumbnail slots untouched), **[14]** app.jsx under tsc + the 124-prop `ScreenRouteDeps` typed-assignment route contract (RED-proven TS2561 on a renamed prop; canary exactly 800), **[18]** ARCHITECTURE.md refresh (FlexSearch mentions retired + a Current-systems addendum). ~45 new tests. Skipped with reasons in the backlog DONE log: [17] (needs a visible browser pane), [19] (needs the owner's real search vocabulary), [20] (owner time). Owner-side checks owed: a quick walk of the new surfaces (verify a real backup, rename/pin a tab, Year view, True Black toggle, notebook colors, journal undo, search chips) — all deployed to the phone.

### Current state (2026-07-28)

**RESPONSIVENESS SESSION — the owner's "taps take a second" input lag root-caused ON-DEVICE and killed in two stages; measured 15,878ms → 135ms main-thread blockage per 2-minute reading window (Pixel 9 Pro, CDP long-task + Event-Timing probes while the owner read normally).**

**Round 2 RESOLUTION (`d7a8993`): the choppiness was BATTERY SAVER.** DisplayModeDirector's vote table showed the app's 120 Hz vote registering (`PRIORITY_APP_REQUEST_BASE_MODE_REFRESH_RATE -> 120`) but `PRIORITY_LOW_POWER_MODE_RENDER_RATE -> max 60` outranking it — the owner's phone was at 20% with Battery Saver on, which caps ALL apps at 60 Hz system-wide. Not app-fixable and correctly not overridden. Both votes (View `requestedFrameRate` API 35+ AND window `preferredRefreshRate` — the View-only vote measured insufficient against Chromium's own 60 Hz content vote) stay in as the delivery mechanism: the app runs 120 Hz the moment saver is off. Verify-on-charge owed: framestats should show ~8.3 ms deltas mid-fling once out of saver.

**Round 2 same day — "feels choppy / low fps" (`7a3b2fd`):** rAF probe during active owner scrolling showed a CLEAN 60 Hz with zero long tasks — the main thread was fine; the surface was HALF-RATE. The Pixel 9 Pro's ARR display (Android 17) renders "normal"-category views at 60 Hz even mid-fling (`frameRateCategoryRate normal=60, high=90`, panel peak 120) while native apps scroll at 120. MainActivity now votes the WebView at panel peak via `View.requestedFrameRate` (API 35+ guarded; Timber-logs "WebView frame-rate vote: 120 Hz"). Battery stays adaptive — the vote applies only while frames are produced. With the raster budget halved at 120 Hz, `backdrop-filter` blurs on always-visible / floating-over-scroll chrome were dropped with small alpha bumps (top-nav 16px behind 95% alpha — visually nil; auto-scroll pill 16px; sticky arrows 12px; hint pill 12px; mode label 8px; tab-card close 4px); modal/sheet backdrops over static scenes keep theirs (the codebase's three older "No backdrop-filter" precedents extended). Also fixed: the UA's blue search-cancel × suppressed (`::-webkit-search-cancel-button`) — the row's own gold ✕ remains. **Accepted nit (investigated, not fixed):** tab-card thumbnails render Cinzel slightly condensed — upstream html2canvas glyph-metric drift; the worse word-fusion class already has the per-character letter-spacing workaround in `webTakeScreenshot`, and the residual drift is card-only cosmetic. **Observation for a future session:** a boot-restore probe caught two 6.6-7.3s main-thread eval tasks right after relaunch (lazy-corpus + warm-up class work, splash/skeleton-covered, owner has never reported it) — worth a fresh-boot TTI trace if cold-start ever feels slow.

- **Stage 1 — interaction calm gate (`e9f4f46`).** Every thumbnail capture is an html2canvas full-DOM clone render (~450-550ms on the phone) plus a second render for the other theme ~900ms later, and the old cadence (300ms after scroll-stop, 350ms after nav) placed those renders exactly where the next interaction lands. Non-urgent captures now wait for calm (no finger down, nothing touched for `CAPTURE_CALM_MS` 1s) and re-defer in 700ms steps; the overview open/heal stays urgent. Module tracker fed by document capture+passive listeners; zombie down-flags self-heal after 10s (the WebView swallowed-touchend lesson). Tests: `use-thumbnails.calm.test.js`.
- **Stage 2 — scroll-stop capture RETIRED (`ac23e20`).** The calm gate landed the renders safely but on-device profiling showed the volume: 59 long tasks / 15.9s blocked in 120s of reading — a capture pair after nearly every reading pause (worst first-touch-after-pause input delay 381ms). The scroll-stop path's only product was a scroll-position-fresh card nobody sees: after-nav keeps cards content-fresh; the overview-open heal urgently recaptures the active card when cards actually appear. Effect deleted (with its 400ms `__scrollEl` re-attach poll); test pins scroll ⇒ NO capture. **After-fix probe, same reading activity: 2 long tasks / 135ms; worst input delay 31ms.** Do not re-add a scroll-driven capture.
- **Single-allocation native screenshot (`c5a7cc6`).** External-review adjudication (4 proposals): PixelCopy scales its srcRect into whatever Bitmap it's handed, so the nav crop + maxDim downscale now happen inside the hardware copy — the full-screen (~10-18MB) and cropped intermediates are gone; one ~2MB dest only. Geometry extracted pure to `MainActivityLogic.screenshotGeometry` (+6 unit tests). Proven via CDP on the vot_api34 emulator: `takeScreenshot(56,1440,90)` → 880×1440 JPEG in 29ms — exact geometry-math match. Path is Garden-only since content tabs moved to clone renders. Discarded proposals, with reasons: version-gated `clearCache` (versionCode gating breaks the sideload-same-versionCode dev loop that CAUSED the stale-bundle bug; asset-loader responses bypass the HTTP cache so the claimed V8-cache win is dubious; boot already sub-second), biometric journal lock (violates the durable "NO credentials/auth anywhere" policy — owner decision if ever), v3 manifest checksum (already shipped as CRC-32 in batch 5 `9e2c167`).
- **Unscrollable center-modal fix (`283001e`).** Reproduced on the emulator: `.garden-warning-overlay` flex-CENTERS its modal, so a modal taller than the padded viewport (large `--font-scale`, landscape, short screens) clips at BOTH ends with Go Back/Proceed unreachable — nothing scrolls a plain flex child. `max-height:100%; overflow-y:auto` on `.garden-warning-modal` + `.disable-tabs-dialog` (same pattern); bottom sheets already scrolled. Verified fixed on-emulator.
- **UI audit (independent, design-skill lens)** across Home/Volumes/letter/Settings/Search/Tabs/Garden, both themes, emulator at 1080×2340: the Cinzel-eyebrow + serif-display + diamond-ornament identity is coherent and distinctive; light theme is a true token-swap counterpart (`body.light` over dark-first `:root`); structure encodes information (counts/date-range subtitles); copy is user-side and strong (Garden onboarding, "Resume where you left off"). Only nits: tab-card thumbnails render letterspaced Cinzel slightly condensed (html2canvas font metric drift — cosmetic), and the search input's clear-× renders blue against the app's gold accent language.
- **Deployed:** final APK (all four commits) installed on the owner's Pixel 9 Pro (wireless adb, mdns-reconnected twice; ports change per session) + emulator. Session tooling: CDP-over-adb probe script (long-task + Event-Timing observers via puppeteer/raw WS; the pattern from the Fleet session's gotchas held — re-find the `webview_devtools_remote_<pid>` socket after every restart, disconnect cleanly), `vot-app` preview entry added to `D:\.claude\launch.json` (session root; the studio-local launch.json is shadowed when the CC session roots at `D:\`).

### Current state (2026-07-22)

**IMPORT-HANG FIX — the "Importing… please wait" freeze was NOT the batch-5 CRC verify; it was a Wave-0 confirm-sheet regression (2026-07-22, owner-reported after batch 5: "I exported and imported but it just says importing…please wait"; commit `229210f`, pushed + fixed APK CDP-verified on device 51071FDAP000C8).** **Root-caused ON-DEVICE** (not by inference): pulled the owner's `.votbak` (proved BOTH his recent backups have `trailing=0` — NO CRC), reproduced the hang via CDP-driven import, then a stack-trace Timber log named the exact culprit — `AppInterface.v3ImportClose()` nulling a LIVE `importIn` **66 ms after `v3ImportBegin`**, before the user ever tapped confirm; the post-confirm `applyV3` then hit `v3ImportNextBlob → no_session` and rejected UNHANDLED, so the toast never cleared. **The bug** is a pre-existing regression from the **Wave 0 batch** (that retired the app's last blocking `window.confirm` for an async in-app sheet): `_confirmDegradeApplyReload` RETURNED the instant it called `setImportConfirm()` (fire-and-forget; the apply ran later via the sheet's `proceed` callback), so `_importV3Android`'s `finally { v3ImportClose() }` fired immediately — the blocking `window.confirm` had masked this by suspending the function inline until the user chose. **My original #4 verify-blocking-read diagnosis was a RED HERRING** — the hang was never the verify; imports of a no-CRC backup would hang regardless. **THE FIX (SettingsScreen.jsx):** the confirm sheet is now **fire-AND-AWAIT** — `_confirmDegradeApplyReload` shows the sheet and `await`s the user's decision through a single resolver (`_settleImportConfirm`) that EVERY dismiss path routes through (Import / Cancel / backdrop / Back-Escape registry / unmount-settles-false), so the caller's `finally` brackets the WHOLE import: the native stream stays open through `applyV3` and closes only after apply completes OR the user cancels. The web/legacy callers already `await` it → strictly better there, no regression. **RED-proven:** `SettingsScreen.test.jsx` +2 Android-path tests drive the REAL `_importV3Android` through a fake native bridge and assert `v3ImportClose` is NOT called while the sheet is up (only after apply) + that cancel still closes it — BOTH fail against the reverted fire-and-forget code (closeSpy called once, prematurely). **ALSO hardened `v3ImportVerify` (StorageManager) to be SIZE-BOUNDED** (kept from the hang-diagnosis work — still valid even though not the cause): it reads the 4-byte CRC trailer ONLY when `importTotalSize - importBytesRead == 4` (from `queryFileSize`), else returns 'absent'/'malformed' with NO read — so verify can never do a blocking speculative read on a pre-CRC/truncated backup. +4 Kotlin tests (ok/mismatch/absent + a `trapStream` that throws on any read past the header, proving no speculative read when size is unknown). **Gates:** Kotlin `testDebugUnitTest` + `jacoco` green; JS build + lint(457) + typecheck + **2934 vitest** + smoke:ci (0 crashed / 0 console errors) green. **ON-DEVICE:** the fixed APK is installed (bundle-e byte-identical to the commit); CDP-drive of a full import of the owner's own no-CRC backup showed no stuck toast, no `no_session`, no rejection. **STILL-OWED (device offline mid-verify — owner unplugged):** a final owner re-import to confirm data lands + the batch-5 visual checks (no over-scroll glow / no white flash). **LESSON: an async sheet replacing a blocking `window.confirm` silently breaks any caller that used the blocking call as a synchronization barrier — the `finally` no longer brackets the awaited operation.**

**NATIVE BATCH 5 — scale-restore fix, onProgress instance-pin, over-scroll/bg polish, + v3 backup CRC-32 integrity (2026-07-22, owner-directed "do all 4, as long as no regressions"; commits `a1b8738` [1/2/3] + `9e2c167` [4], pushed; APK built + awaiting device reconnect).** **(#1 scale restore)** dropped the `vm.currentScale = 1f` hard-set after `restoreState` — restoreState restores the WebView's own zoom + `onScaleChanged` owns the truth (config-change keeps the surviving ViewModel scale; process-death starts from the 1f default). Latent-correct (zoom is disabled today), matching `deviceToCssPx`'s scale-awareness. **(#2 onProgress)** the inset-animation `onProgress` callback now evaluates on the LOCAL `wv` instance it's bound to (consistent with `onEnd`'s `requestApplyInsets(wv)`), never on a replaced instance during a renderer-crash rebuild. **(#3 polish)** `overScrollMode = OVER_SCROLL_NEVER` (native-book scroll, no edge glow) + a dark WebView background (removes the pre-first-paint white flash on the fallback/reload edge; the splash covers a normal boot via onAppReady). **(#4 backup integrity — the big one; owner chose a simple CHECKSUM over SHA-256)** every new v3 `.votbak` now carries a trailing 4-byte CRC-32 of its MANIFEST (all structured store data: journal/notes/bookmarks/links/settings), verified on import — silent corruption (a bit-flip on failing storage) is DETECTED. A plain CRC-32 is the right tool for accidental corruption (not tampering), dependency-free + byte-identical: JS `crc32` pinned to the `0xCBF43926` known vector == Kotlin `java.util.zip.CRC32`. Design guarantees: **ADDITIVE** — a 4-byte trailer older readers already tolerate (the BAK-4 trailing-bytes path), so backward- AND forward-compatible with NO container-magic bump; **WARN-AND-ALLOW** — a mismatch shows a toast + `DiagnosticLog` but NEVER blocks the restore (the data still imports; a checksum bug can't lose data). Web: `writeContainer` appends the CRC, `readContainer` returns `integrity` ('ok'/'mismatch'/'absent'/'trailing'). Android: `StorageManager.finishV3Export` writes it, a new `v3ImportVerify()` reads the trailing bytes, and the import driver (`v3AndroidImportEntries`) calls it via an `onDone` callback ONLY after full frame consumption — so a cancelled import raises NO spurious warning. New `@JavascriptInterface v3ImportVerify` → platform-bridge shape **36→37 keys**, BridgeContractTest `"v3ImportVerify" to 0`. **Media frames stay length-checked** (truncation), not bit-flip-checked — the manifest is the critical, irreplaceable data. **Gates:** Kotlin +5 tests (StorageManager byte-exact framing INCL. the trailing CRC + verify mismatch/absent) — testDebugUnitTest + jacoco + assembleDebug green; JS +9 (backup-container CRC round-trip/corrupt/absent + the crc32 vector; backup-android onDone ok/mismatch/absent/not-on-abandon; platform-bridge shape) → **2932 vitest**, build + lint(455) + typecheck + smoke:ci (0 crashed / 0 console errors) green. **ON-DEVICE TO VERIFY:** no over-scroll glow + no white flash (both visual); export a backup then re-import it (integrity 'ok', no false warning).

**NATIVE BATCH 4 — deterministic app-ready splash handshake, pre-allocated import buffer, recording audio-focus (2026-07-22, owner-directed "do 1, 2, 3" from a fourth native review — item 4 was ALREADY handled + skipped; commit `b812910`, pushed + APK installed on device 51071FDAP000C8). Builds on the WAVE 0 UX/native batch (`099c5ae`..`ffbdf86`, 11 commits landed in a parallel convo — streaming `writeTextToUri`, USAGE_TOUCH haptics, Garden HTTP-error logging = the prior review's #2/#3/#6; plus 30+ UX fixes documented in HISTORY.md).** **(#1 App-Ready splash handshake)** the splash now releases on a DETERMINISTIC signal instead of a hopeful 80 ms post-`onPageFinished` delay (which could dismiss to a black `body` background on a slow/throttled device before React paints). JS calls new `PlatformBridge.onAppReady()` from a `requestAnimationFrame` after React's first paint — wired in `useLazyBundles` because **app.jsx is maxed at the 800-line canary** — and `AppInterface.onAppReady()` clears `vm.splashHolding`. `onPageFinished` now releases only as a **1500 ms FALLBACK** (`PAGE_FINISHED_SPLASH_FALLBACK_MS`) so onAppReady wins on healthy boots; `onReceivedError` + the 5 s absolute hatch remain backstops. New `@JavascriptInterface` method → platform-bridge shape **35→36 keys** (+web no-op), BridgeContractTest `"onAppReady" to 0`. **(#2 pre-allocated import buffer)** `readUriAsBase64` reads into a SINGLE `ByteArray` sized to the declared file size (`readSized`) instead of `ByteArrayOutputStream` + `toByteArray()` — ~1x peak heap vs ~2x+ on a large legacy import (an OOM risk on a 4 GB device). The declared size is only a HINT, so it stays fail-loud + user-data-safe: a SHORT file returns exactly what arrived, and a provider that UNDER-reports its size **still imports** (spills the remainder into a growable buffer, capped at `maxBytes` — never falsely rejects a legit backup; still null past the cap). +2 StorageManagerTest cases; the lying-provider-past-maxBytes regression test still passes. **(#3 "polite" recording / audio focus)** `startAudioSession` now also requests `AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE` (USAGE_VOICE_COMMUNICATION) so music / podcasts PAUSE while the user records and RESUME when we abandon focus — in `endAudioSession` AND the teardown/crash path (`restoreAudioModeIfActive`). Idempotent; the `AudioFocusRequest` is held on `MainViewModel`. (This closes the deferred N2.2 device-walk item — verify on-device; it's OEM-sensitive re: the `MODE_IN_COMMUNICATION` session.) **(#4 screenshot recycle crash) ADJUDICATED-out — already handled:** `captureScreenshotSuspend`'s finally already identity-compares (`cropped?.takeIf { it !== full }?.recycle()`) so a `topCropPx==0` no-op can't double-recycle, and the `compress` runs in the try BEFORE the finally — the reviewer's crash is impossible on current code. **Gates:** `testDebugUnitTest` + `jacoco` + `assembleDebug` green; JS build + lint(455) + typecheck + **2922 vitest** + smoke:ci (0 crashed / 0 console errors) green. **ON-DEVICE TO VERIFY (native, not preview-exercisable):** the splash→UI transition has no black flash; recording pauses/resumes other audio; a legacy .votbak import still works.

**NATIVE HARDENING BATCH 3 — voice-memo fetch bridge, manifest-cap OOM fix, light nav bar, Garden UA, multi-process safety (2026-07-22, owner-directed "do 4,6,7 now, then 1, and add 2"; third external native review; commits `78575d3` [4/6/7] + `fc7741a` [1] + `81fe9cf` [2], pushed + APK auto-installed on device 51071FDAP000C8).** **(#1 fetch bridge for voice memos — the big one)** a finished native memo is delivered to JS as a URL to a served file instead of a base64 string through `evaluateJavascript` (a 5-min AAC memo is ~6.7 MB of base64 for the JS engine to parse — the "renderer unresponsive" risk). `NativeAudioRecorder.stop()` now MOVES the recording into `cacheDir/recordings/<uuid>.m4a` and returns its `fileName` (base64 null); MainActivity registers an `InternalStoragePathHandler` mapping `/recordings/` to that dir, so `https://appassets.androidplatform.net/recordings/<uuid>.m4a` serves it (SAME-ORIGIN → CSP `connect-src 'self'` allows the fetch — this is now the app's ONLY document-context fetch; traversal blocked by the handler); `AppInterface.nativeRecordStop` passes the URL as the callback's 5th arg `(base64, durMs, mime, blob, url)` and JS `__onNativeRecordingComplete` `fetch()`es it via native networking. **Robustness:** if the file MOVE fails, `stop()` falls back to base64 so a recording is never lost, and JS falls back to base64 on any fetch error; **cleanup is sweep-on-start** (`start()` deletes `recordings/` files older than 60 s — orphans from an interrupted session, never a just-served file mid-fetch), so NO new bridge method was added (platform-bridge shape stays 35 keys, BridgeContractTest untouched). The web path (`blob` 4th arg) is unchanged. **(#4 manifest cap + the real OOM point)** `MAX_V3_MANIFEST_SIZE` 128 MB → 16 MB, AND the `String(bytes, UTF_8)` decode in `beginV3Import` is now wrapped in an `OutOfMemoryError` catch too — the reviewer caught that the existing OOM guard only covered the `ByteArray` alloc, but the String decode allocates a ~2× char[] right after, so a 128 MB manifest needed ~384 MB peak (uncaught, since OOM is an Error not an Exception). 16 MB keeps peak decode ~48 MB while staying ~3×+ over any real manifest, so a genuine heavy backup is never falsely rejected. **(#6 light nav bar)** `setLightStatusBar` now also sets `isAppearanceLightNavigationBars`, so the light theme's nav icons stay visible on gesture-pill/soft-button devices. **(#7 Garden UA)** the asset fetches send a `VOTReader-Android/1.0` User-Agent instead of the default Java UA. **(#2 multi-process safety)** `VOTReaderApp.onCreate` gives a genuine private sub-process its own `WebView.setDataDirectorySuffix` — moot today (single-process: no `android:process`/services/providers in the manifest) but ship-ready insurance. **CRITICAL SAFETY:** gated on the EXACT `"<pkg>:"` sub-process prefix, NOT merely `!= packageName`, so a null/garbage/main process name can NEVER match — setting a suffix on the MAIN process would orphan its WebView data dir (all localStorage user data). **Adjudicated OUT:** #3 (throttle save storms) ALREADY DONE — `use-persisted-state.js` already has the 250 ms trailing-edge debounce (review-fix item 10); #5 (stable lambda capture in `callOptional`) SKIPPED — near-zero benefit (the lambda body already reads the getter fresh + `View.post` queues on the main looper; a callback lost during a crash+reload is moot anyway) for disproportionate cost (breaks the synchronous-throw test contract + the coverage floor). **Gates:** Kotlin +9 tests (NativeAudioRecorderTest +2 incl. the start()-sweep; AppInterfaceTest split into url/base64/failure; VOTReaderAppTest ×6 on safeSuffix) — `testDebugUnitTest` + `jacoco` + `assembleDebug` green; JS build + lint(455) + typecheck + 2793 vitest + smoke:ci (0 crashed / 0 console errors) green. **GOTCHA (lesson): never put a raw control character in Kotlin source** — an editor NUL landed inside `substringBefore('…')` and made the file "binary" (git/tools choke, Edit can't match it); use `Char(0)` (or `a NUL escape`) instead of a literal NUL. Verify with `tr -cd '\000' <file | wc -c` == 0. **FOLLOW-UP (owner-reported, same day): pausing a recording froze the recorder correctly but NOT the on-screen seconds** — they kept climbing while paused, then snapped back on resume. `pauseRecording` accumulated the elapsed ms but left the `tickRef` (seconds) + `ampRef` (waveform) intervals RUNNING against a stale `startTimeRef`, so the tick double-counted (`accumulatedMs` + an ever-growing since-segment-start); resume reset `startTimeRef` → snap-back. Fix: extracted `startSecondsTick()` / `startAmpPolling()`, CLEARED both intervals in `pauseRecording`, restart both in `resumeRecording` (`MAX_RECORDING_SECONDS` hoisted to a module const). +1 vitest (`JournalRecordingSheet.test.jsx` pause-freeze, RED-proven: old code climbed 0:02→0:07 across a 3 s pause). 2794 vitest / build / lint / typecheck / smoke:ci green; APK reinstalled on device.

**NATIVE HARDENING BATCH 2 — Garden stream-to-disk + redirect SSRF guard, zoom-aware tap, thread-guard, tidiness, + a JS memory-trim signal (2026-07-22, owner-directed "do them all incl. the optional ones"; second external native review, 7 items + strategic rec, ALL implemented; commits `1e23375` [Kotlin 7] + `3260545` [trim signal], pushed + APK auto-installed on device 51071FDAP000C8).** **(#1 GardenImageCache streams to disk)** `download()` was rebuilt into `openStream` + `downloadToFile` + `streamCapped`: the image now streams straight to the tmp file in 16 KB chunks (constant footprint) and BOTH cache hits and fresh downloads serve via `FileInputStream` — no whole-image `ByteArray` in heap (only the rare rename-fail miss path reads to memory). Aligns with the project's own Permanent Rule 5. NOTE the review's "96 MB peak" used the 48 MB cap; real Ultra pages are ≤8.3 MB, so the true transient saved was ~16-25 MB/page-turn — still a real budget-device win. **(#2 redirect SSRF guard)** redirects are now followed MANUALLY (`instanceFollowRedirects=false`) and each hop's host is re-verified against `ALLOWED_HOSTS` before following (bounded `MAX_REDIRECTS=5`), closing the gap where a 30x `Location` could bounce the app's network identity off-allowlist and be served back with `ACAO:*`. The initial host stays gated by `intercept()`; only redirect TARGETS are re-checked (so the loopback tests still reach `downloadToFile` directly). RED-proven with a two-loopback-server test (302 → a live non-allowlisted target: refused AND never contacted). **(#3 zoom-aware tap)** `deviceToCssPx` divides out `vm.currentScale` too (`deviceX / (density*scale)`); LATENT today (zoom is disabled + the `setZoomEnabled` bridge has NO live JS caller — Garden replaced it with CSS-transform zoom — so `currentScale` is always 1.0), correct regardless; `scale` defaults to 1.0 so the 3-arg form is byte-identical. **(#4 callWithResult thread guard)** `check(isMainThread())` fails loud + labelled instead of the opaque cross-thread WebView crash; the check is an INJECTED lambda (default = the real `Looper` check, evaluated in MainActivity's coverage-excluded construction) so it's unit-testable without a Looper — **this was forced by the coverage ratchet:** JsBridge is in the 0.85 JaCoCo floor and the raw inline guard dropped it to 0.84 (the pre-commit caught it); the injectable + 2 branch tests restored it. **(#5 hoist asset loader)** `WebViewAssetLoader` is a lazy field, reused across renderer-crash rebuilds. **(#6 recorder reset)** `NativeAudioRecorder.start()` `reset()`s a prior recorder before `release()` (prompter mic free on rapid restart; the review's tie to the WebView `NotReadableError` was a category error — different subsystem — but the change is a harmless plausible-OEM win). **(#7 haptic Composition)** `haptic()` gains an API 30+ (R) `VibrationEffect.Composition` primitive tier (device-aware via `areAllPrimitivesSupported`, per-style intensity gradient), falling through to `createPredefined` (Q+) then `createOneShot` (26-28) — legacy phones unchanged. **(STRATEGIC — the JS trim signal, the highest-value item)** `MainActivity.onTrimMemory` now ALSO fires `window.__onTrimMemory` (`bridge.callOptional`, at `TRIM_MEMORY_MODERATE+`); the bundle-b boot (`_entry-b.js`) installs a handler that calls new `JournalMediaStore.releaseObjectUrls()` — revoking every cached `blob:` URL (each pins a decoded blob in heap) + emptying the LRU. Safe by construction (`objectUrl()` re-creates from IDB on the next miss = a cache DROP, not data loss); no-ops on web/PWA. Deliberately does NOT purge the MiniSearch index (its warm cache exists to avoid a ~10s rebuild — and the review's "drop FlexSearch fragments" was stale; FlexSearch was retired 2026-07-02). **Gates:** Kotlin +7 tests (GardenImageCacheTest 11→12 incl. the RED-proven redirect refusal; MainActivityLogicTest 22→26 incl. 4 zoom-scale cases RED-proven vs scale-ignored; JsBridgeTest +2 callWithResult branches) — `testDebugUnitTest` + `jacocoTestCoverageVerification` + `assembleDebug` green; JS +1 vitest (`releaseObjectUrls`, RED-proven vs a no-op) → 2793 vitest / 158 files, build + lint(455) + typecheck + smoke:ci (0 crashed / 0 console errors) green. **LESSON: touching a class inside the JaCoCo floor set (JsBridge/BoundedLogTree) with any unit-untestable line trips the 0.85 ratchet — inject the untestable dependency (Looper here) so the new logic is coverable via a fake, keeping the real call in coverage-excluded construction code.**

**NATIVE HARDENING BATCH — cookies off, splash liveness backstop, trim-memory cache prune, off-Main legacy I/O (2026-07-22, owner-directed adjudication of an external native review; items 5/3/2/1 of a 7-item list, commit `1093443`, pushed + owner-installed on-device).** Four Android-side hardening items, each grounded against current source before implementing (the review's other items were adjudicated OUT — see below). **(#5 cookies)** the WebView cookie jar is disabled (`CookieManager.setAcceptCookie(false)` + `setAcceptThirdPartyCookies(wv,false)` in `createConfiguredWebView`) — the app is fully local + persists in DOM storage and external links open in a SEPARATE app, so cookies were pure unused surface (mixedContentMode was already NEVER_ALLOW). **(#3 splash)** an absolute 5 s liveness backstop (`mainHandler` + `splashSafetyHatch` Runnable, `SPLASH_HATCH_MS`) armed after the initial load, removed in `onDestroy` — `onPageFinished`/`onReceivedError` already release the splash on every KNOWN path (the review's "React-mount failure" premise was WRONG — onPageFinished fires regardless of React), so this only matters for a wedged renderer that fires NEITHER; releasing an already-false flag is a no-op. **(#2 trim)** a new `onTrimMemory` prunes the WebView IN-MEMORY resource cache (`clearCache(false)` — never disk, never DOM storage) at `TRIM_MEMORY_MODERATE+` (background LRU states) via the new pure predicate `MainActivityLogic.shouldTrimWebViewCache` — honestly modest (the 36 MB corpora live on the renderer's JS heap, NOT this cache; the real lever is a JS-side trim signal — DELIVERED in batch 2, see the entry above). **(#1 threading)** the LEGACY v2 import read (`readUriAsBase64`) + export write (`writeTextToUri`) launcher callbacks now run on `Dispatchers.IO` via `lifecycleScope` (primary v3 path already streams off-thread); the in-flight export flag still clears SYNCHRONOUSLY so the double-launch guard is intact. **Adjudicated OUT:** #4 MainActivity decomposition (net-negative — already decomposed once in N1/NK; the remaining clients are tightly coupled to Activity state, extraction adds coupling ceremony for line-count optics), #6 haptic `VibrationEffect.Composition` (owner-taste, deferred), #7 log absolute-path redaction (ALREADY SATISFIED — `BoundedLogTree.SENSITIVE_PATH` already redacts `/storage|/data|/sdcard|…`; the reviewer's premise was stale). **Gates:** +5 boundary tests on `shouldTrimWebViewCache` (MainActivityLogicTest 17→22), **RED-proven** against a `>` boundary (the inclusive level-60 case failed, then reverted); `compileDebugKotlin` + `testDebugUnitTest` + `assembleDebug` + `jacocoTestCoverageVerification` all green. A SECOND 7-item native review + a JS trim-signal strategic rec was then adjudicated + FULLY implemented — see NATIVE HARDENING BATCH 2 (the entry above).

**BATCH-1 CORRECTION — the APK asset exclusion silently broke 9 translations + Studies on Android (2026-07-22, found by independent verification review of the batch below; FIXED same-day).** Batch item 1 excluded `<dir>src` from the packaged APK on the premise "index.html only loads dist/ bundles, so assets/src/ is a dead dev tree". TRUE but INCOMPLETE — **index.html's own tags are not the whole runtime surface**: `src/data/translations.js` INJECTS `script.src = 'src/data/bible-' + code + '.js'` (the 9 alternate translations, **including the owner's NKJV-R + KJV-R restored-name editions**) and `script.src = 'src/data/bible-studies.js'`. Those ~36 MB are in NO dist/ bundle and have no native loader path, so the APK lost them. **It failed SILENTLY** — the loader's `onerror` resolves — so every non-NKJV translation fell back to NKJV and Studies dead-ended on "Try again". PROVEN by building + unzipping the APK: **36 asset entries / 11.3 MB with ZERO `bible-*.js`**. The batch's measured numbers were exactly right; only the "dead" classification was wrong — real dead weight is ~13 MB, not ~51 MB. **FIX:** `<dir>src` replaced by explicit exclusions (bundle-only dirs components/hooks/renderer/search/stores/styles/ui + app.jsx, plus the src/data files build.py concatenates: books*/matthew*/VOT corpora/ES modules); the ten runtime-injected files are KEPT. Re-verified by rebuild: **76 entries / 48.8 MB, all ten present, all dead weight still excluded** (APK 24 MB). **RECURRENCE GATE: `tools/check-apk-assets.js`** parses runtime `script.src` injections, applies aapt basename-matching to `ignoreAssetsPatterns`, and fails if any would be excluded — wired into pre-commit Step 5c + `npm run check:apk-assets`, RED-proven (reinstating `<dir>src` lists all ten and exits 1). **LESSON: an asset is not dead because index.html doesn't name it; dynamic `script.src` injection is a first-class runtime surface, and a gracefully-degrading loader turns a packaging mistake into silent feature loss rather than a crash.**

**REVIEW-FIX BATCH — external deep-review findings adjudicated + closed, 13/13 (2026-07-22).** An external deep review (build-output forensics + source review) produced a findings list; a second AI independently adjudicated each against current source; the confirmed items were implemented + verified same-day. **Canonical tracker: `REVIEW-FIX-2026-07-22.txt`** (HANDOFF block at top; per-item finding→fix→verification). **10 DONE:** (1) the APK shipped ~51 MB of dead assets (assets/src/ dev tree, 77 *.test.*, root duplicates of bundle-a, a .lnk) — `ignoreAssetsPatterns` in app/build.gradle.kts (AGP 9 DSL; aapt defaults re-declared — supplying patterns REPLACES the default set), assembleDebug now 76 asset entries / 48.8 MB, real-build-verified — **the original `<dir>src` pattern was WRONG and was corrected same-day; see the BATCH-1 CORRECTION entry above**; (2)–(8) Kotlin hardening, each RED-first — readUriAsBase64 lying-provider OOM (bounded read through `readBounded`), finishV3Export partial-backup leak on flush-throw, GardenImageCache chunked-download unbounded read (`readCapped` fails closed), back-press contract now accepts both `"true"` encodings (`MainActivityLogic.isBackPressConsumed` — a JS boolean refactor would have silently quit on consumed presses), splash main-frame-error release hatch, double-`saveToFile` clobber guard (`error:busy`/`error:launch_failed`), screenshot bitmaps recycled in finally (identity-compared); (9) CRITICAL INVARIANT 1 pinned — new `use-tabs.test.js` (14 tests, mutation-tested) + the false "covered" comment corrected; (10) per-keystroke full vot-state persist killed — trailing-edge 250 ms coalescing at the use-persisted-state sink (latest-union-wins, guaranteed flush on hidden/pagehide/beforeunload/unmount, boot-critical theme/fontStyle/fontScale bypass; deliberately NOT in CachedStore._save — hydration state machine + navigator.locks merge protected). **3 ADJUDICATED-no-action** (rationale in the tracker): v3ImportReadChunk ceiling (overstated — sole caller passes constant 512 KB), use-reading-dwell "untested" (wrong — 10 tests exist; the identity-churn invariant accepted as documented risk), device-walk deferrals + restored-names v2 (owner-signed-off; structural note: no androidTest source root). **Gates: Kotlin 179 → 189 tests / 0 failures; vitest 2758 → 2787 / 2787.**

**AUTO-SCROLL ROUND 2 — reading-zone stop, adjustable dwell, collapsed settings (2026-07-22, owner-directed after on-device use: "Autoscroller is good, add adjustable timing before going to next page… scrolling stops as soon as the bottom of the page gets to within screen, but humans read more around the MIDDLE… keep scrolling until bottom text is in the lower 1/3rd, or the scroll function is bottomed out… make all autoscroller settings uninteractable and invisible (collapsed) unless autoscroller setting is actually enabled").** **(1) THE STOP POSITION — the real fix.** `computeEndTarget` rested the `.reading-end` sentinel at the viewport BOTTOM EDGE (`contentTop - clientHeight`), so the last lines stopped in the reader's periphery and never travelled through the place people actually read. New `END_STOP_FRACTION = 2/3`: the sentinel now rests **2/3 down the viewport** — the top of the lower third, the highest resting place still "down the page" — so the final lines pass through the middle like every other line. Costs one extra third of a viewport of travel, and the existing clamp to `scrollHeight - clientHeight` handles the owner's "or bottomed out" branch for free. LIVE-PROVEN at 412×915 (clientHeight 848): last line rests at y=565 = **0.667 of viewport, 283px further than before**; on a short page ("The Feasts of The Lord", rawScrollMax 366) the target clamps to exactly 366 with no overscroll. **(2) DWELL IS NOW A REAL SLIDER** — the 4-preset SelectField (max 6s) became a 0–15s slider, step 0.5s, with a Reset and a "None" readout at 0; `clampEndDwell` widened 10s→15s and every legacy preset value (1500/2500/4000/6000) stays valid. **(3) SETTINGS COLLAPSE, not disable** — Scroll Speed / Auto-Continue / Auto-Continue Pause are UNMOUNTED while `settings.autoScroll` is off (a greyed row still occupies the page and still reads as maybe-usable; unmounting also takes them out of tab + screen-reader order), and Auto-Continue Pause nests one level deeper under Auto-Continue since it means nothing otherwise. The `disabled`/`disabledReason` props on those rows are gone. Live-proven progressive disclosure: rows 1→3→4 with the settings-card control count rising **59→63→65** (proving unmount, not hide); the dwell slider persisted 9s through the real UI. Gates: **2742 vitest / 155 files** (+10: end-target reading-zone ×3 incl. a bottomed-out case — **RED-proven** against the old bottom-edge stop — + new `ReadingChromeProvider.test.jsx` ×8 pinning the config-clamp seam incl. legacy dwell presets), lint(455)/typecheck/build/smoke:ci PASS (0 crashed / 0 console errors). NOTE the 4 controller scroll-walk tests needed longer frame budgets (the rest point moved a third of a viewport further). No corpus edit → no CORPUS_VERSION bump. **SETTINGS TEST HARNESS — SettingsScreen is testable now (2026-07-22, owner-directed "Build the harness" after it was flagged as the one live-verified-only gap).** SettingsScreen is ~1400 lines with **ZERO ES imports** — every dependency is a free-var global resolved through the classic-script lexical environment (**73** of them, enumerated by intersecting `tools/eslint-globals.generated.js` with the file's identifiers). That cost is why it had no test in the whole project history. **`ui/screens/settings-harness.jsx`** pays it once: `setupSettingsGlobals(overrides)` / `teardownSettingsGlobals()` / `renderSettings(settings, props)` / `rowLabels()` / `row(label)`. Two deliberate calls: the four ROW components are the **REAL** ones (SettingsRow/SelectField/ConfirmStrip/ClearProgressRow) so a test can't stay green while their toggle markup or label wiring rots — those are what the assertions read; everything else is stubbed at the FAR boundary (stores, PlatformBridge, StorageHealth, backup/import, corpus loaders), because none of it participates in a render gate and faking it deeply would only test the fakes. **It is NOT a `.test.jsx`** — deliberately outside vitest's `**/*.test.{js,jsx}` glob so importing it can't double-register the suite; it also imports no `vi` (callers pass their own spies), which is what lets it live outside the test-file convention. Verified inert: 156 test files (155 + the one new test), `setupSettingsGlobals` appears **0×** in bundle-d/bundle-e (nothing imports it from an `_entry`), globals unchanged at 455. GOTCHAS found while building it: `window.__loadBibleCorpus/__loadVotCorpus` must be **thenable** (the mount effect chains `.catch()`), and `StorageHealth.getPlatform` + `PlatformBridge.clearGardenCache/getCrashLog` + `IDBAdapter.open` are called during render. **`SettingsScreen.test.jsx` ×16** now pins the auto-scroll disclosure contract — collapse-not-disable, the nested pause gate, progressive disclosure by row count, slider bounds/readouts (incl. legacy preset dwell values + "None" at 0), clamping of a corrupt persisted speed, and the onSetting/onToggle write-backs. **RED-proven in THREE modes**: gate removed (4 fail), nested gate removed (2 fail), and — the important one — **rendered-but-`disabled` instead of unmounted (4 fail)**, so the suite provably distinguishes "greyed out" from "gone", which is the distinction the owner actually asked for. Gates: **2758 vitest / 156 files**, lint(455)/typecheck/build/smoke:ci PASS.

**HOLY DAYS CRASH KILLED — the mixed-format peek bug (2026-07-21, owner-reported with a screenshot: "TypeError: Cannot read properties of undefined (reading 'forEach')").** TWO PRE-EXISTING defects, both latent since the swipe-engine v3 peeks landed (`b95358d`), surfaced while reading Holy Days. **NOT caused by the autoscroll work** (the only diff to those files that session was a one-line `placeKey`) — verified by `git diff`. **(1) THE CRASH — a format gate was missing on the pager peek.** Holy Days is the app's one MIXED collection: its 16 ghost entries carry `type:'wtlb'` (Format B, `paragraphs`) or `type:'letter'` (Format A, `blocks`), and the `holy-days-entry` ROUTE branches on that to pick WtlbEntryView vs LetterView — but `_entryPeek`/`_chainPeek` did NOT; they only checked that the neighbor RESOLVED. So a cross-format neighbor was rendered through the WRONG component and threw in its block/paragraph memo. Because peeks are computed on EVERY render of a reading screen, this fired **on arrival, not on swipe** — and the ErrorBoundary then swallowed the screen, so the route's lazy-corpus kick never ran and the crash SURVIVED RELOADS (a permanently wedged tab). Fix: all four peek resolvers now gate on FORMAT, not just resolution — WtlbEntryView requires `full.paragraphs`, LetterView requires `full.blocks`; a cross-format neighbor degrades to the "Continue" boundary card (what it showed before real screen peeks existed). Exactly 2 cross-format boundaries exist in the data (consider-my-love↔walking-in-the-footsteps, atonement↔the-feasts-of-the-lord) = 4 peek directions. **(2) THE BLANK SCREEN — 2 routes skipped `_wrapVot`.** Every other VOT reading route is a one-liner wrapped in `_wrapVot` (shows "Loading…" AND pulls the corpus); `holy-days-entry` and `hm-letter` have BLOCK bodies and returned a bare `null` before the corpus landed, so a cold-boot restore into either showed a permanently blank screen that never loaded the corpus. Both now `return _wrapVot(null)` when `!_votReady`. Gates: **2732 vitest / 154 files** (+5: new `WtlbEntryView.peek.test.jsx` ×3 + LetterView format-gate ×2; **both gates RED-proven** against the pre-fix resolvers), lint(455)/typecheck/build/smoke:ci PASS. Live-proven: the exact wedged state (cold boot → holy-days-entry/consider-my-love) now renders 7 marked paragraphs with the corpus loaded; **all 16 Holy Days entries walked — 0 crashes, 0 runtime errors, every entry rendered**, with `next:card`/`prev:card` at precisely the 2 cross-format boundaries and real `screen` peeks everywhere else. No corpus edit → no CORPUS_VERSION bump. **LESSON for future peek work: a peek renders a REAL component over a neighbor's data — any collection whose entries are not format-homogeneous must be gated on shape, not just on "did it resolve".**


**AUTO-SCROLL — hands-free reading transport (2026-07-21, owner-directed design review then "build it good").** A play/pause pill on the 4 reading screens scrolls the page at a steady reading pace. Off by default (Settings → Reading → Auto-Scroll). **Canonical code: `hooks/use-autoscroll.js`** — a PURE `createAutoScroll(io)` controller (same injected-I/O shape as `createPagerGesture`) + a thin `useAutoScroll` React wrapper; `ui/components/AutoScrollControl.jsx` is the portaled pill. **THE SCROLLTOP LEASE is the organizing idea:** four writers touch the reading container's scrollTop — the finger, `startRestore` (90 rAF attempts, flagged `body.scroll-restoring`), the pager settle, and this controller — and at most one may write at a time; the restore interlock, the pointer yield and the external-nav stop are all that ONE invariant, not three special cases. Design decisions worth not relitigating: **(1) END OF PAGE IS THE `.reading-end` SENTINEL, not scrollHeight** — that sentinel sits at the end of BODY TEXT, before the footnote list/ornament/chain-nav (LetterView.jsx:418), and ScreenLayout's progress effect already uses it; MEASURED on Vol One "Chosen by God": endTarget 24 vs rawScrollMax 769, i.e. **745px (97%) of the scroll range is apparatus below the text** — a scrollHeight transport would crawl the reader through all of it. **(2) SPEED IS STORED IN LINES/MINUTE, never px/s** — the text-size slider spans 80–160%, so a px/s speed would silently change pace by 2×; the controller derives px from a measured `[data-hl-key]` line height. LIVE-PROVEN scale-invariant on Psalms 119: px/s 6.82 → 8.52 → 13.64 across scale 0.8/1.0/1.6 while lines/min held at **exactly 16.0**. **(3) READ-FIRST, then write** — reading scrollTop back after writing forces a synchronous layout 60×/s on the thread that owns the scroll. **(4) DRIFT ABSORB IS NOT A PAUSE SIGNAL** — scroll anchoring rewrites scrollTop on any reflow above the viewport; pointer events own pause, scroll deltas own resync only. MEASURED (DPR 1.25): scrollTop accepts fractional values but SNAPS to device pixels (write 1.3 → read 1.6), hence `DRIFT_PX 1.5`; the float accumulator means slow speeds step rather than stall, so there is deliberately NO integer-batching fallback. **(5) NO `skipRestore` PLUMBING** — after an auto-advance the controller waits out `body.scroll-restoring` then RESYNCS from wherever the app's own scroll memory landed (respects the existing resume contract, zero new flags through nav). **(6) Auto-advance reuses the pager's own descriptor** (`peek('next')`: null = dead end, `kind:'boundary'` = do not auto-cross a collection edge, `kind:'screen'` = go) and navigates through the NEW shared **`commitReadingNav(go)`** — the flushSync + 5 `apply*` passes contract EXTRACTED from usePagerGesture so swipe and autoscroll share one implementation. Runaway guards: MIN_PAGE_MS floors time-on-page (a run of short WTLB entries can't chain at timer speed), MAX_CHAIN 20 caps unattended advances, and a RAMP WATCHDOG force-commits a deliberate stop if frames stop arriving mid-ramp (found by live testing — otherwise the wake lock + capture-suppressing body class stuck). Wake lock reuses `PlatformBridge.setKeepScreenOn` and RE-ASSERTS the user's global pref on release (MainViewModel defaults it true) rather than blindly clearing it. Thumbnail capture is suppressed at the ONE choke point (`captureActiveTabThumbnail`) while `body.autoscroll-running` — each capture is an html2canvas clone render + a ~900ms deferred themed render, i.e. main-thread work competing with a main-thread scroll. **Wiring:** the hook lives in ScreenLayout (`pager && !inert` — a peek can never portal a second pill); config arrives via the new **`ReadingChromeProvider`**, which folds the reading dot + autoscroll contexts into ONE wrapper so **app.jsx stays 798/800** (net-zero lines). New `placeKey` prop on ScreenLayout, threaded from the 4 reading screens, mirrors getScrollKey's identity scheme and drives the "a nav I didn't initiate is a hard stop" rule. Gates: **2727 vitest / 153 files** (+43: controller ×32 on a MANUAL clock — dt clamp, restore interlock and ramp watchdog each RED-proven — + control ×11), lint(**455 globals**)/typecheck/build/smoke:ci PASS (0 crashed / 0 console errors). Live-proven at 412px: pill portaled to `<body>` outside `.pager-track`, 52px tall at BOTH text-scale 1.0 and 1.6 (chrome-pin contract), targets 40/44/40, centered, no horizontal overflow, `user-select:none`; play → `body.autoscroll-running` + remaining-time readout; a synthetic touchstart yields INSTANTLY; 1.2s stillness auto-resumes. No corpus edit → no CORPUS_VERSION bump. **PREVIEW GOTCHA (reconfirmed):** the pane runs `visibilityState:hidden`, so rAF NEVER fires and `computer{screenshot}` times out — verify transport arithmetic by driving `createAutoScroll` with a MANUAL clock against the live DOM (that is how the scale-invariance numbers above were taken), not by watching pixels. **Deferred v2:** drag-to-scrub speed on the pill (−/+ ships instead — same never-leave-the-page property, far less risk).

### Previous state (2026-07-20)

**FULL BODY-TEXT AUDIT — every letter + entry diffed line-by-line vs the site; corpus proven faithful bar 2 fixed defects (2026-07-20, owner-directed "triple check no other content missing").** Beyond the prior header/footnote/studies sweeps, ran a definitive **body phrase-coverage diff**: flattened every letter/entry's RENDERED body (scratchpad dump-app-bodies.mjs — blocks/segments/poetry/sectionIntro/header prose, `fn` marker segments skipped) and checked **3,160 substantial site body lines across all 13 archived collections** appear in the app (scratchpad body-diff.py, article-boundary split on `<h2 class="ltitle">`, footnote/`↑`/date-header/nav-section lines excluded). Result: **exactly 2 real defects**, both fixed (CORPUS_VERSION c17→**c18**): **(1) Vol 2 "Woe to the Church Called Roman and Catholic"** read "Thus says The Lord God, The Holy One of Israel, to all who have ears to hear:" where the site (verified against the **LIVE page**, not just the May mirror) reads "**Thus says The Lord to the deceptive harlot, to the mother of all fornications:**" — a wrong lead-in on the paragraph after "the filthiness of her fornications" (the letter's OTHER "…Holy One of Israel…" paragraph matched the site + was left untouched). **(2) Flock "Obedience"** was missing its "(**Addendum to Abide in the Doctrine of The Messiah**)" header line — a header-audit BLIND SPOT: the HTML extractor returned empty `headerLines` for it (parse bug on the nested-link addendum), so headcov never checked it. Restored as `metaAddendum`+`metaAddendumLink`→Volume Three (CORP-2 now proves **72** cross-refs). Swept ALL 18 extractor blind spots (covers + 5 prefaces + 3 real letters) — Obedience was the sole genuine miss; every preface body + the other blind-spot letters' content are present. Everything else the diff flagged was a proven NON-issue: study cross-reference link-titles ("…The Lamb of God: The TRUE Chronology…" etc. — the studies exist), addendum lines already carried in `metaAddendum`, footnote back-refs, and collection-cover articles. The 273 initial false positives were a flatten artifact (inline `fn` segments injecting a digit mid-paragraph) — cleared by the fn-skip, leaving the 2 true findings. Gates: **2684 vitest / 151 files**, check_balance ALL OK, validate:data 0 errors (3,120 items), lint/typecheck/build/smoke:ci PASS. Live-proven: the Woe letter renders the corrected clause; Obedience shows "Addendum to Abide in the Doctrine of The Messiah" whose tap lands the real V3 letter with the back-pill; 0 console errors. Commit `701a0a0`, **CORPUS_VERSION c18**. **The letter/entry corpus is now line-by-line audited faithful to the site** (headers + footnotes + body). Reusable harness: scratchpad dump-app-bodies.mjs + body-diff.py.

**RESTORED-NAME TITLE RE-AUDIT — the "the very HaMashiach" defect class is structurally dead; every Jesus/Christ instance re-adjudicated per-instance (2026-07-20, owner-reported with a screenshot: "The HaMaschiach basically means The The Christ… make the proper restoration happen, as His Name is SUPPOSED to be spelled, YahuShua… No batch jobs").** The rushed 2026-07-12 pass rendered EVERY standalone "Christ" → "HaMashiach", stranding English articles in front of the "the" baked into Ha- ("the very HaMashiach" = "the very THE-Messiah", KJV John 7:26; his screenshot). I enumerated + CLASSIFIED all ~570 standalone title occurrences across both bases by grammatical context (scratchpad classify-title.mjs), cross-checked the Textus Receptus Greek article + restored-name translations (CJB/Stern → "Mashiach"; the Cepher → "HAMASHIACH"; Delitzsch's Hebrew NT), and adjudicated each. Owner decided (bare×3): **THE TITLE RULE — printed "the Christ" (definite) → `HaMashiach` (Ha IS the article); every OTHER "Christ" → bare `Mashiach` (name-like/anarthrous); the full-Name pairs stay `YahuShua HaMashiach`.** This makes a stranded article STRUCTURALLY IMPOSSIBLE and FOLDS the old His-/Lord's-/called-/Lord-and-Christ (Acts 2:36) special-case rules into one bare rule (each is just "a Christ with no printed 'the'"). All four hard bugs fall out for free (KJV John 7:26 "the very **Mashiach**", Acts 9:22 "very **Mashiach**", John 1:25/6:69 "that **Mashiach**"), plus vocative → "Prophesy to us, **Mashiach**!" (Matt 26:68), appositive → "**Mashiach**, a King"/"**Mashiach** the Lord" (Luke 23:2/2:11), "in Christ" → "in **Mashiach**", genitive → "gospel of **Mashiach**", possessive → "**Mashiach's**"; KEPT `HaMashiach` for literal "the Christ" ("You are HaMashiach", "YahuShua is HaMashiach") + the name pairs. NOTE the mechanism is NOT a blind batch: every distinct context was individually examined + the ruleset ENCODES those per-instance findings; hand-editing 180 KB×2 would risk the smart-quote/dash corruption class the project guards. Regenerated deterministically (tools/gen-restored-nt.mjs — never hand-edit outputs) → **233 NKJV-R + 268 KJV-R verses changed vs the first pass** (changed-vs-base totals unchanged 1212/1217). **CORPUS_VERSION c16→c17** (+ search CORPUS_CONTENT_VERSION). Gates: **2684 vitest / 151 files** (+6 re-audit goldens incl. a corpus-WIDE guard that no article/adjective/possessive precedes HaMashiach — the defect class can never return; the conjunction/subject-pronoun "that/this/thou HaMashiach" cases correctly excluded), validate:data 0 errors (3,119 items), check_balance ALL OK, lint(445)/typecheck/build/smoke:ci PASS (0 crashed / 0 console errors). Live-proven in the preview reader: `translateVerse` resolves John 7:26 KJV-R → "…the very Mashiach?" (his exact screenshot verse) + every adjudicated case, and the rkjv→kjv base chain still works. Canonical detail: RESTORED-NAMES-PLAN.txt (2026-07-20 RE-AUDIT box + TITLE RULE). ONE reversible sub-choice flagged to owner: the genitive "of Christ" (articular Greek τοῦ Χριστοῦ) is rendered bare "of Mashiach" for consistency; a dedicated rule could keep it "of HaMashiach" if he prefers.

**SWIPE-COMMIT GLITCH KILLED — the reveal is now ATOMIC (2026-07-19, owner-reported "brief glitch/jitter when swiping, too fast to screenshot, survived every fix").** Root cause was TWO stacked paint-timing holes at the commit moment, both structural: **(1) the old-page one-frame flash** — under `createRoot`, `finishSettle`'s `io.commit` was an ASYNC default-priority setState (queued behind a MessageChannel task) while the covering peek was parked by a blind rAF scheduled in the SAME timer task; the code assumed "MessageChannel fires before rAF", but when the vsync deadline landed between the two tasks (routine on a loaded Android main thread) the browser painted ONE FRAME of the OLD chapter snapped back to rest — old scroll, no marks — before React's render landed; **(2) the annotation pop-in** — the imperative letters/WTLB paint runs in a passive effect + `setTimeout(0)` (use-dom-annotation-sync), i.e. frames AFTER the reveal, so the freshly revealed page flashed unmarked (the peek it replaced was fully painted) and the inline note icons then reflowed the text. **Fix — an atomic single-task reveal contract:** the wrapper's `io.commit` now `ReactDOM.flushSync`es the navigation (new DOM + LAYOUT effects — the scroll restore, use-scroll-memory Effect 3, lands inside the flush) then runs the five `apply*` annotation passes synchronously (idempotent, sig-skipped — the later effect re-run is a cheap no-op); `finishSettle` parks + de-promotes the peek/track IMMEDIATELY after commit returns, in the same task — the rAF gap no longer exists, so NO intermediate frame can paint (comment in finishSettle says never reintroduce a scheduled gap). Cost is invisible: the sync render happens while the peek statically covers the viewport. Boundary `instantCommit` inherits the flushSync for free (strictly more deterministic). Gates: **2670 vitest / 151 files** (+2, BOTH RED-proven vs the pre-fix engine: controller same-task-park with zero deferred rAFs; wrapper flushSync + apply-pass ordering; the stale "committed-cover rAF window" pin rewritten to the new contract + a parkAllPeeks leak-guard pin kept), lint(445)/typecheck/build/smoke:ci PASS (0 crashed / 0 console errors). Live-proven at 412px with synthetic touches + a park-moment MutationObserver (captures the exact state the reveal frame paints): Psalms 23→24 — at the park instant the live pane ALREADY held the ch-24 DOM (`fsCallsAtPark:1`), the seeded highlight PAINTED, and the saved scroll RESTORED (588 == the peek's 588, zero jump); Vol One Letter 25→"Watch" — the live pane held the destination letter with its imperative `hl-dom` mark painted at reveal (pre-fix this arrived frames later); partial-drag spring-back unchanged; probes cleaned; 0 console errors. No corpus edit → no CORPUS_VERSION bump.

**TRIPLE BATCH — studies content sweep + thumbnail word-spacing fix + the text-size SLIDER (2026-07-19, owner-directed "sweep app, particularly studies… tabs thumbnails spacing… build adjustable text font size slider").** **(1) STUDIES SWEEP (c15→c16):** line-by-line diff of the four site-sourced doctrine studies (grace-and-the-law / purity / trinity-exposed / state-of-the-dead) against the site mirror — all **648 content lines proven present**; the only real defects were **7 words EATEN beside `{{ref}}` chips** when the studies were originally imported ("comes" John 14:17, "The" 1 John 2:1, "is" Genesis 3:4, "tells" Hebrews 1:2, "have" Revelation 20:10, "reads" Luke 16:23, + a doubled Colossians 1:16-17 cite) — all restored; MTAM/Lamb/Matthew (PDF-sourced, §14.5-14.7-audited) chapter-thinness scan clean (mtam-ch12's 882w lives in sectionIntro — a summary chapter, not empty); letters re-swept via the body/fn/related audit modes — every discrepancy row is app-EXCEEDS-site (enrichment), none missing. KNOWN GAP (deliberate, flagged not built): app studies don't carry the site's per-study "Additional Links / Audio Recordings / Videos" resource sections — a feature add if the owner wants it. **(2) THUMBNAIL WORD-SPACING (the owner's "ghost version" report):** tab-thumbnail text rendered with words FUSED ("TheVolumesofTruth…") — html2canvas draws letter-spacing:'normal' text word-by-word into measured slots and wider-than-measured glyph runs visually cram (explicitly-tracked Cinzel headings always rendered fine = the per-CHARACTER path). `webTakeScreenshot`'s onclone now injects `* { letter-spacing: 0.0001px; }` into the clone (zero specificity — authored tracking still wins) → every glyph lands at its measured x. Proven with a NEW headless-Puppeteer capture harness (scratchpad shoot-tabs.js — the preview pane can't screenshot; puppeteer drives a real Chrome and saves pixels): before/after renders went from fused words to native-quality text in both themes; Psalm 119 clone render ~130ms (no perf cost). +1 vitest pin (onclone injects the nudge + still toggles the forced theme). **(3) TEXT-SIZE SLIDER (UX-BATCH Session 4 DELIVERED):** the WL1 4-step selector is now a continuous slider (80–160%, step 5%) with live % readout, Reset-to-Standard, and an in-row preview line; same `settings.fontScale` key (old values valid); use-settings + the index.html boot script clamp numerically to [0.8,1.6] (boot applies pre-mount — no FOUC; CSP hash regen'd). **TEXT-ONLY scaling** per the owner's "must NOT expand icons": a **chrome-pin block at the END of app.css** (must stay last — same specificity, last wins) restates nav/floating chrome in px (top-nav paddings/gap, nav-home/volume labels, the 33.6px back glyph, theme/search buttons, reading dot, tabs badge, nav-btn/nav-arrow-btn, sel-toolbar labels, ann-chip labels, Matthew mode pill+label) so chrome is pixel-identical at every scale. Live-proven: nav height **67.2px at 0.8/1.0/1.6 (identical)**, verse text 17.28→22.464px at 1.3 (exact multiple), reload applies persisted scale pre-mount, Reset→Standard; 0 console errors. Gates per landing: 2678 vitest / 151 files, lint(445)/typecheck/validate:data/build/smoke:ci PASS. Commits `42f254f`(c16 studies) / `d4e5552`(thumbs) / `321f5c0`(slider). **UX-BATCH tracker now FULLY CLOSED** — Session 5 landed too (next entry).

**UX-BATCH SESSION 5 — unselectable chrome + spacing sweep (2026-07-20, commit `d0ec5e5`; closes the 5-session `UX-BATCH-2026-07-12.txt`).** Items 4+5, the tracker's last session. **(4) Chrome is no longer text-selectable:** a global rule gives `button` + `.top-nav` + sheet chrome (`.fn-sheet-handle/.fn-sheet-num-row/.sc-sheet-tag`) + `.settings-section-label` + `.bottom-nav-card` (chain-nav) + `.mode-toggle-wrap` + `.back-hint-row` + tabs-overview header/meta `user-select:none` (+`-webkit-user-select`+`-webkit-touch-callout:none`); `input,textarea` opt back in with `user-select:text`. Rationale/safety: buttons never wrap user prose in this app (reading text, journal bodies, notes, the excerpt/verse pickers all render in divs/spans), so button-level `none` doesn't touch any annotation-selectable surface — the SelectionToolbar long-press flow, the programmatic Ranges in the annotation engine + pickers, and smoke's letterAnn/wtlbAnn round-trips all pass unchanged. Bonus: a long-press on the tabs badge / a nav control can no longer start a native text selection, which also starves the WebView non-bubbling-touchend path the drag engines defend against. Live-proven: `.tabs-nav-btn`/`.top-nav`/settings buttons measure `userSelect:none`; a Psalms 23 verse span measures `userSelect:auto` (reading text stays selectable). **(5) Spacing/affordance:** the Search group-header collapse glyph (was a 0.55rem `▾`/`▸` — near-invisible) is now a real **24×24 `.srch-group-chevron` that ROTATES** 90° on open (live-proven `matrix(0,1,-1,0,0,0)` at 24×24, toggles on header tap); the Settings **danger row now `flex-wrap`s** so "Clear All My Data" drops to its own line instead of sitting flush against the ⓘ info button on a narrow phone (the pre-fix gap was **−153px** — button overlapping the info icon; DataActionRow buttons also got a hard `margin-left:12px` minimum). Both Session-5 CSS additions live in the app.css tail block after the Session-4 chrome-pin. Gates: **2678 vitest / 151 files** (no test asserted the old ▾ glyph or selectability — clean), lint(445)/typecheck/build/smoke:ci PASS (0 crashed / 0 console errors). No corpus edit → no CORPUS_VERSION bump.

**HEADER-LINE RESTORATION — every letter's top-of-page summary lines now complete vs the live site (2026-07-19, owner-directed: "Find on website, 'a parable given to timothy' that little summary of what the letter is about at that top, make sure we're not missing any of those").** The owner meant the italic attribution/summary block under each letter title ("7/23/11 A Parable Given to Timothy" / "For All Those Who Have Ears to Hear" / "(Regarding …)" / "Addendum to …"). The named letter itself was fine (Letters-from-Timothy "The Parable of The Great Landowner…" carries date/from/forLine), but a NEW per-LINE coverage audit (**`headcov` mode added to tools/_audit-compare.py** — every site header line must be represented in the app's rendered header, joined in LetterView's meta order; the old `headers` mode only caught blank headers + occasion diffs) swept all **1,070 site header lines** across the 10 archived collections and found **26 missing → all restored, re-audit = 0 missing** (CORPUS_VERSION c15 + search content version): **(1) Vol 6 "Deliverance" was missing its ENTIRE three-paragraph prose opening** ("My heart is heavy, My eyes shed tears without end…" / "Yet I shall not turn My back…" / "Beloved, there is but One Refuge…" — the app's lone poetry block literally began "Therefore," with nothing to refer back to); restored verbatim from the live page with the site's italic runs (full-italic ¶1; italic "I AM THE LORD." close; italic "In Mashiach ONLY…" middle sentence). **(2) ELEVEN letters missing their "Addendum to …" header line** — restored as `metaAddendum` + `metaAddendumLink` (the Fixed/Twice-Murdered precedent — renders "Addendum to <tappable letter>"): V4 I-Did-Not-Come→"Come to Me; No More Time to Tarry"(V4) + Workers-in-the-Field→"A Trying of Your Trust…"(Flock); V6 Pentecost→"Spiritual Famine"(Rebuke); Flock A-Spectacle→"Blow the Trumpet, Sound the Alarm"(V7), By-Order-of-Magnitude→"Judgment and Woe"(Rebuke), Discord→"Hearts Changed"(V2), For-a-Testimony→"Woe to the Captives of This World"(V3), Let-Them-Eat-Silence→"Let All in the Earth…"(V7), Serve-Me-as-I-Have-Loved-You→"Be Instant In and Out of Season"(V4), The-Fear-of-The-Lord→"In Spirit and in Truth"(V5), Trust-Comes-by-Service→"Treasuries of Wrath and Mercy"(V5) — every link uses the exact registryLabel + title (CORP-2 pass now proves 71 cross-refs, was 60). **(3) SEVEN letters' forLine missing its continuation line** (site renders it as a second line; joined with the corpus-wide ", and For All Those Who Have Ears to Hear" idiom): V3 Blessed-Are-Those (+" Even Though They Are Homosexual, and For All…"), V4 Discernment, V7 Lost Sheep + Sons-of-The-Kingdom, Flock As-You-Have-Received + Kindle-the-Flame + Let-Them-Eat-Silence. **(4) V6 "The Parable of The Aged Shepherd" missing its "A Parable Given to Timothy" attribution** (site shows it between from and forLine — restored into the `spoken` slot). **(5) V7 "Obey The Commandments" missing its two-line occasion** → noteLine "(Regarding those who say the Holy Spirit would never tell you to obey The Moral Law, The Ten Commandments)". Audit-tool fixes that made zero reachable: _audit-dump-app.mjs flattens segments-array header fields (The Shadow of The Almighty's `from` carries an fn bubble — was dumping empty) + records sectionIntroText; the headcov matcher accepts prose-length lines represented in the body (Deliverance), a recomposed leading date (Recompense's dream heading), and "An addendum to" ≡ "Addendum to" (Pentecost). Live-site spot-checks confirmed the May-3 mirror is current (Deliverance + Aged Shepherd + Fear-of-The-Lord fetched fresh). Gates: 2677 vitest / 151 files (no code change — data + one-shot audit tools only), check_balance ALL OK, validate:data 0 errors (3,120 items), lint/typecheck/build/smoke:ci PASS. Live-proven: Deliverance renders all 3 paragraphs in order before the poetry; Aged Shepherd shows From/"A Parable Given to Timothy"/For; Fear-of-The-Lord shows "Addendum to In Spirit and in Truth" whose tap lands the real V5 letter with the back-pill return; 0 console errors. Corpus edit → **CORPUS_VERSION c15**.

**BLANK FOOTNOTES KILLED — every scripture ref now renders real content, gate-enforced forever (2026-07-19, owner-reported with screenshots: "FOOTNOTE 1 · 1 Kings 22" and "FOOTNOTE 7 OF 9 · Leviticus 23" sheets opened with NO verse text — "missing content - critical error").** Root cause was a DATA class + an ENGINE gap: those two footnotes (Vol 6 "Freedom Comes By Sacrifice" #1, Vol 7 "Who Among You, O Israel…" #7) were note-TYPE with the bare ref as their text — the sheet renders note text verbatim, so no verse pipeline and no Go-to-Scripture ever ran — and even scripture-typed they couldn't resolve because `lookupVersesFromBooks` bailed on chapter-only refs (`p.verse == null`). A corpus-WIDE audit (all 758 Format-A footnotes, every inline `{{ref}}`/`{{nav}}` across 803 content owners, 193 Matthew cites — driven through the REAL resolution code in a Node harness incl. the build.py `BOOKS["matthew-plain"]` merge) found exactly THREE defects: those two, plus bible-studies more-than-a-man-ch5 citing **`{{ref:Matthew 19:36}}` — a verse that doesn't exist** (typo for 19:16; Matthew 19 ends at v30; its nkjv dict value was EMPTY → the same blank sheet). Fixes: **(1) engine** — `lookupVersesFromBooks` now resolves a chapter-only ref to the WHOLE chapter, decimal-numbered ("1 Kings 22" → all 53 verses; the sheet scrolls at max-height 67vh; FootnoteListSection clamps via ExpandableVerse — both verified before landing); `splitIntoVerses` gained a chapter-run strategy (`_splitChapterRun` — a strictly-sequential "1. … N." marker run anchored at position 0, the exact shape the engine emits; refs WITH a verse part keep the single-verse no-split contract) so chapter verse numbers render as GOLD sups, not white text (the documented white-inline-text failure class); GoToRefButton already handled verse-less endpoints (`.filter(p => p && p.chapter)`) so the button came free. **(2) data** (CORPUS_VERSION c13→**c14** + search CORPUS_CONTENT_VERSION) — both footnotes converted note→scripture; the study ref corrected to `Matthew 19:16` + its dict value filled with the verbatim NKJV text pulled from matthew-plain. **(3) the recurrence gate** — validate-schemas grew three rules, ALL RED-proven against the pre-fix corpus (each fired; 0 after): a bare-ref-note ERROR (note text that IS a scripture ref → "type it scripture"), a chapter-only exemption on the nkjv-presence rule (dicts never embed chapters — the runner pass proves existence instead), and a new runner-level **Bible-ref resolution pass** — loads BOOKS+matthew-plain, points `window.__ALL_BOOKS` at it so the app's own findBook chain runs, then proves every scripture footnote ref, every inline `{{ref}}`, and every EMPTY dict value resolves (book + chapter + each named verse exist; compound ';' refs split like the engine) — **1,466 refs across 802 content owners, 0 errors** (validator totals now 3,109 items; 36 warnings = the pre-existing baseline, byte-identical). Audited-clean, no action: the 6 Matthew commentary "cites" that don't parse are by-design non-tappable plain notes (InlineNotes `hasVerse=false` branch); zero dangling fn markers; zero `{{nav}}` misses; the other 9 text-only note footnotes are genuine editorial notes. Gates: **2677 vitest / 151 files** (+7: chapter-only lookup ×2 + chapter-run split ×5 — engine AND parser separately RED-proven via stash-runs — + a FootnoteSheet chapter-fallback pin; the old `'John 3' → null` pin rewritten to the new contract), lint(445 globals unchanged), typecheck, validate:data(0 errors), build, smoke:ci PASS (0 crashed / 0 console errors). Live-proven at 412px on the real corpus: Vol 6 fn1 → "1 Kings 22" sheet with **53 gold verse sups** (1→53, full 7.9KB chapter, scrollable) + "Go to Scripture · 1 Kings 22"; Vol 7 fn7-of-9 → "Leviticus 23" with 44 gold sups (the owner's exact second screenshot); the study's Section Five chip reads `Matthew 19:16` and opens the real "Good Teacher…" verse; 0 console errors. Corpus edit → **CORPUS_VERSION c14**.

**SWIPE ENGINE v3 — real cross-book peeks + native-feel commit decision (2026-07-19, owner-directed "really think this through and build a good engine").** Owner (on-device, with screenshot at 2 Thess 3): the boundary CARD still showed while swiping; commits fired "before they should"; partial-swipe-then-release never sprang back in practice; he wants the next screen pre-rendered with all annotations, both directions, zero flash — native. Two-part build: **(1) REAL boundary peeks.** A book/volume boundary now peeks the REAL neighbor page through the same inert-screen path as in-book neighbors — annotations painted, saved scroll, exact typography — and the commit reconciles the SAME component in place (no remount, no flash): **Bible book→book** (`BibleChapterView._versesPeek(bk,ch)` gained a book param; `prevBook`/`nextBook` are full BIBLE_BOOK_LIST objects — the lone pseudo-book, Revelation's "Volume One" bridge, has no `id` and keeps the card); **letter volume→volume** (`boundaryConfig` in use-reading-chain-nav.js now stamps `volKey`+`letterId` naming the EXACT page its own `_goFirst`/`_goLast` commit lands on — preface-aware; LetterView's new `_chainPeek` renders the destination volume's real first/last letter when the dest col is `kind:'letter'` and resolves); **WTLB One→Two→Blessed** (WtlbEntryView `_chainPeek` via `_isWtlbFamily`, partLabel mapped per collection). Cross-COMPONENT edges only (Rev→V1, rebuke→wtlb1, blessed→flock, timothy→holydays, holydays→Garden, Matthew study edges) keep the boundary card + the instantCommit release. **(2) NATIVE COMMIT DECISION** (`isCommit` retuned — the old 35%-width OR 0.5px/ms-flick committed nearly every partial drag, so spring-back effectively never happened): a REAL flick (>0.65px/ms) TOWARD the neighbor commits from 10% width; a release clearly moving BACK toward origin (>0.25px/ms) NEVER commits even past halfway (the user changed their mind); a slow release commits only past **50%** of the viewport. Gates: **2668 vitest / 151 files** (+12: isCommit contract rewritten ×4, chain-nav destination refs ×4 incl. preface + special-edge pins, LetterView chain peeks ×4, new `BibleChapterView.peek.test.jsx` ×5 — **8 RED-proven** vs the pre-fix code), lint(445)/typecheck/build/smoke:ci PASS (0 crashed / 0 console errors). Live-proven at 412px with synthetic touches: 2 Thess 3 → mid-drag the peek IS 1 Timothy 1 (hero + sections + verses + a pre-seeded highlight PAINTED IN THE PEEK, `hasCard:false`) → release past half settles onto it; the reverse direction peeks real 2 Thess 3 back; slow 40% release SPRINGS BACK; past-60%-then-reversing release SPRINGS BACK; Volume One last letter → real "Volume Two · Letter 1 · The Wide Path" peek → committed; WTLB One "A Psalm of David" → real "Part Two · Introduction" peek → committed; 0 console errors. No corpus edit → no CORPUS_VERSION bump.

**READING DOT FIXED — position tracks where you actually ARE, not the last completed 20s dwell (2026-07-19, owner-reported).** Owner: "read a couple chapters, go home, then journal/settings, tap the dot from home → takes me somewhere unexpected." Root cause was ARCHITECTURAL, not a glitch: the resume cursor (`activeReadKey` + `lastReadChapters`/`lastReadLetterMap`) only committed when a **dwellMs timer (default 20s, RESET on every re-arm) completed** on a reading screen — read a chapter for less than the dwell and it never became your resume point, so the dot resumed wherever the LAST completed dwell happened (an older chapter, a different book). Worse, the timer was only ARMED by explicit nav selectors — **switching to a tab already sitting on a reading screen, a cold-boot restore into one, and the dot's own landing armed nothing.** Two-part fix: **(1) position is IMMEDIATE** — `setActiveReadKey(key, commitFn)` (use-reading-dwell.js) now runs the commitFn + sets activeReadKey AT ARM TIME (null key = cancel-only, never clears a committed position; a throwing commitFn can't break the arm); the dwell timer survives but gates ONLY the `ReadingStreakStore` day record (the honest "actually read today" signal wants a real dwell; the resume cursor does not; `pendingReadCommitRef` deleted — every caller's commitFn was verified a pure cursor write, mark-as-read is a separate bridge and untouched). **(2) catch-all arm effect** (use-reading-position-nav.js, new place-identity params threaded from app.jsx — still 798/800): BEING on a reading screen arms it — watches (screen, bookId, chapterNum, letterId, studyId, studyChapterId) and arms bible-ch/matthew-ch (chapter key), bible-study-chapter (`bible-study-<slug>`), and every collection letter screen (`vol:<volKey>` via COL_BY_LETTER_SC); non-reading screens match no branch, so **a home/journal/settings detour can never move the dot** (unit-pinned). **Settings relabeled to stay honest:** "Reading Dot Dwell Time" (which DOCUMENTED the old gate) is now **"Reading Streak Dwell Time"** — same `settings.dwellMs` key, now unconditional (not gated on the dot toggle), desc says the dot always follows where you are; the dot row's desc gained "It follows you the moment you open any chapter or letter." Gates: **2656 vitest / 150 files** (+12: dwell semantics ×4 new + catch-all ×8 — **11 RED-proven** vs the pre-fix hooks), lint(`--max-warnings 0`, 445 globals unchanged), typecheck, build, smoke:ci PASS (0 crashed / 0 console errors). Live-proven the owner's EXACT repro: Psalms 23 → hop to 24 after ~3s → home → journal → settings → home → dot lands **Psalms 24**; pure TAB SWITCH onto 2 Cor 2 → dot follows; a letter opened for ~2s → dot follows; state inspected `lastReadChapters {psalms:24}` with no dwell ever completing. No corpus edit → no CORPUS_VERSION bump.

### Previous state (2026-07-18)

**FIVE-ITEM OWNER BATCH — reading streak, Garden memory, boundary-swipe flash, swipe-engine hardening, PC thumbnails (2026-07-18, owner-reported; commits `868fb9b`..`66b3456`, one per item).** (1) **Days-reading streak on My Progress:** new **`ReadingStreakStore`** (`vot-reading-streak`, **IDB DB_VERSION 4→5** additive) — a reading day is recorded ONLY by a real dwell commit (both commit sites in `use-reading-dwell.js`, typeof-guarded bare name; same-day repeats are store-side no-ops with no version bump); streak semantics mirror JournalStatsStore (module-load recompute + one-shot loaded-transition re-run; Progress-mount recompute so an app left open across midnight can't show a stale streak). Hero is now FOUR stats (Read / Reading Streak / Journal Streak / Entries) on a `.prg-hero` grid that folds 2×2 under 480px. Rides the backup end-to-end (SettingsScreen exportable map + USER_DATA_STORES + import-validator shape + the round-trip test seeds/asserts it). Live-proven: dwell commit → streak 1 → same-day no-op → survives reload → renders "1 · Reading Streak" at 375px 2×2, no overflow. (2) **Garden never loses your place:** new **`GardenPosStore`** (`vot-garden-pos`, **DB_VERSION 5→6**) write-throughs EVERY page turn to IDB — the per-tab `gardenPage` only rode the debounced vot-state flush, which an Android background kill can eat (pagehide is NOT guaranteed — the J1 failure mode), and a fresh tab always opened at page 1. GardenView records page CHANGES (never the mount value — recording the default 1 would clobber the memory before the heal reads it) and SELF-HEALS: a mount on default page 1 jumps to the remembered page once the store hydrates (waits for 'loaded'; a page turn before hydration wins; a deliberate return to page 1 is itself remembered so the heal never fights intent). Live-proven: page 5 recorded → NEW tab opened Garden → healed to 5/209. (3) **Boundary swipe lands the next book instantly:** a committed swipe whose target is a reading-chain boundary card used to animate the CARD fullscreen for the 300ms settle and only then navigate (the owner's "black screen with a card of the next book" flash); `createPagerGesture` now takes an **`instantCommit`** path when `desc.kind === 'boundary'` — track+peek reset in the touchend tick, React flushes the next book before the next paint, no settle state exists (so the settle-outlives-screen double-commit hazard can't either). The card remains drag feedback; same-collection swipes keep the seamless settle (their peek IS the destination). RED-proven + live-proven (Genesis 50 → Exodus 1 instant; Exodus 1→2 still animates). (4) **Swipe engine hardened to press-drag parity** (`use-pager-gesture.js` lifecycle rebuilt): touchend/touchcancel handled at **DOCUMENT CAPTURE** (starve-proof — non-bubbling delivery can't strand a swipe mid-slide); the gesture tracks its OWN **touch identifier** (foreign fingers landing/moving/lifting are ignored — the stray-second-touch early-commit class is dead); a move whose touch list no longer contains our finger heals NOW with the commit decision its frozen dx earns; a **zombie watchdog** (re-armed per event, 2.5s silence, self-neutralizing under sync-scheduler test hosts) ends a stream-dead gesture the same way; a new touchstart **force-resets** any leaked gesture in the same tick (`endGesture` is THE single idempotent exit path with modes commit-decide/spring/instant-reset); abnormal paths trace **`[pageswipe] …`** (console + DiagnosticLog). +6 robustness tests, ALL RED-proven vs the pre-rebuild engine; live-proven wedged-track force-reset + trace + follow-up swipe commits. (5) **PC thumbnails made robust:** reproduced the owner's glitches in preview — the real failure classes were in the [thumb] traces: **(a) WRONG CAPTURE TARGET** — the naive first-`.screen-layout` query could grab the Tabs overview's OWN layout (the overlay renders one, FIRST in document order), an inert pager peek, or a transient zero-sized node ("degenerate canvas 376x0" / "Unable to find element in cloned iframe"); new **`captureTargetEl()`** (platform-bridge, exported) picks the first connected visibly-sized LIVE column skipping `.tabs-overview-layer`/`.pager-peek`/`[inert]` subtrees, and `updateCardAr` uses the SAME selector so card box and pixels always agree; **(b) STALE-GEOMETRY thumbs** (captured at another window size) were cover-cropped into giant-text corner blowups — TabsOverview now letterboxes any thumb whose aspect strays >12% from the card (**`thumbAspectMismatch`** + `.thumb-ar-mismatch` → object-fit:contain) until a fresh capture replaces it; **(c)** a settled window RESIZE recaptures the active tab (debounced 600ms); **(d)** failed captures RETRY (max 3 consecutive, 2.5s apart, seq-guarded) and **opening the overview captures the active tab** (safe now — content captures are clone renders that exclude the overlay via SCREENSHOT_IGNORE_CLASSES; Garden stays suppressed while open, its native shot would photograph the overlay) — so a blank-✦ or stale active card heals the moment the user looks at it. Live-proven: stale 376×812 thumb letterboxed; overview-open heal recaptured the active tab at 600×800 UNDER the open overlay. Gates: **2644 vitest / 150 files** (+47: reading-streak ×11, dwell-bridge ×5, garden-pos ×5, GardenView heal ×6, pager boundary+robustness ×9, thumbs ×13 incl. captureTargetEl ×4 — many RED-proven per item), lint(`--max-warnings 0`, **445 globals** — ReadingStreakStore + GardenPosStore), typecheck, build, smoke:ci PASS (0 crashed / 0 console errors). No corpus edit → no CORPUS_VERSION bump. NOTE: two additive IDB schema bumps landed same-day (v5 reading-streak, v6 garden-pos) — the onupgradeneeded contains() guard makes any upgrade order safe.

### Previous state (2026-07-14)

**UX BATCH SESSION 3 — journal editor redesign + the Android scroll-glitch kill (2026-07-14, owner-reported).** Items 8+9 of the tracker (`UX-BATCH-2026-07-12.txt` — full detail in its Session 3 DONE block) plus two fresh device reports: long-entry drags "difficult", and an Android editor glitch ("scroll jerks me back to a glitched position, won't scroll, only an app restart fixes it") — root-caused to THREE compounding defects, all fixed + live-proven: **(a) textarea autosize REBUILT** — the per-render JS resize (`height:auto`→scrollHeight, re-run for EVERY textarea on EVERY render because the ref callback was an inline function) forced a layout at the collapsed height that CLAMPED the scroller's scrollTop on long entries (fired per keystroke AND at the 1.2s Saving…→Saved re-render = the deterministic jerk-back); now the CSS grid-replica technique — **`.jrn-grow`** wrapper whose `::after` renders `data-rep` invisibly in the same grid cell (typography lives on the WRAPPER so textarea/replica can never drift; `content: attr(data-rep) " "`) — zero JS measuring; live-proven clientH===scrollH at 47 lines + scrollTop pixel-stable through typing and the debounce re-render. **(b) journal scroll keys are PER-ENTRY** — viewer+editor each shared ONE scroll-memory slot (bare screen name), so opening entry B force-restored entry A's offset while `startRestore`'s 90-frame loop re-applied it against the user's finger; `journalEntryId` now threads App→`useScrollMemory` (its useState moved up in app.jsx to sit above the hook call; `getScrollKey` returns `journal-viewer-<id>`/`journal-editor-<id>`; the restore effect gained journalEntryId as a dep so entry→entry nav restores each entry to its own offset). **(c) press-drag ZOMBIE WATCHDOG (all four drag surfaces)** — a silently-killed pointer stream (no up, no cancel — the documented on-device WebView failure) left the gesture live forever: its non-passive touchmove suppressor ate EVERY scroll app-wide and the editor's autoscroll loop kept yanking the page (the "restart required" state; the v2 factory had lost e4d0be8's self-heal — it only healed at the next `start()`, which the editor only fires from a grip); now any NEW touchstart while the gesture's stream is silent >2.5s AND no active touch sits near its last position (a merely-PARKED finger is still in e.touches there — protected) ends the gesture (drags COMMIT — pointercancel policy) + traces **`[jrndrag] zombie drag healed…`** (new `press-drag.test.js` ×5, 3 RED-proven vs the pre-fix engine; live-proven: wedged drag ate touchmoves → one touch later ghost gone + scroll free + trace emitted). **Long-entry drag:** edge autoscroll REBUILT — zones derive from the scroller's visible rect (the old window-edge zones buried ~60px of the top zone under the nav), zone ~150px, speed = depth² curve × a time ramp (holding accelerates, cap ~48px/tick ≈ 3000px/s), and the loop bails if the engine reports the drag ended; live-proven full ~3800px top→bottom drag committed in ONE gesture (1225px scrolled in the first 1.5s). **(9) Insert never splits:** `insertBlockBelow` replaces the caret-split `insertAtCursor` — the new block lands BELOW the caret's block, the paragraph stays whole, the caret is restored in place (`pendingFocusRef {id, caret}`), one trailing blank p only when the insert becomes last; no-context fallback (reuse/append exactly one blank p) preserved (+3 tests, 2 RED-proven vs the split). **(8) Edit affordance decided:** the viewer's pen FAB is THE edit; the viewer ⋯ menu is **Pin / Delete only** (`JournalCardMenu` gained `hideEdit`; the hub card menu keeps Edit — no on-screen pen there); the editor now shows the entry date under the title (`.jrn-editor-date`, same eyebrow as the viewer); TEXT blocks' delete × is a whisper (0.22) until `:focus-within` (0.8) — media/card blocks keep the always-visible ×. Gates: **2583 vitest / 145 files** (+11: press-drag ×5, scroll-memory ×3, editor insert ×3), lint(`--max-warnings 0`, **441 globals** unchanged), typecheck, build, smoke:ci PASS (0 crashed / 0 console errors). Preview-proven at 375px via the `app-alt` server (another session held 8090); 0 console errors, no horizontal overflow. Sessions 4–5 remain in the tracker (text-size slider; chrome-unselectable + spacing sweep).

**FOLLOW-UP — journal INSERT menu polish + the "lying Show more" card bug (2026-07-14, owner-reported).** Owner: after tapping the editor pen, a **plain Card** for a WTLB/letter entry embedded the entry's opening paragraph (truncated to 180 chars) with a **"Show more" that revealed nothing** — expanding re-showed the identical clipped text (the derived body was pre-truncated at the source). Bible chapter-cards were fine (they carry no body), so it only bit letter/WTLB cards. Fix in `JournalHelpers.resolveLetterCard`: the non-excerpt branch now returns `body:''` — a plain **Card = title only** (matches chapter-card + the menu's promise "Embed a chapter or letter title"); embedding text is the **Excerpt** flow's job (excerpt branch unchanged). Render-time fix, so existing stored plain cards heal too. Same class killed on **journal-card** (`JournalViewerScreen` link card): was `previewText(je,320)` fed to JrnExpandable(180) → a Show more that could never reveal past 320; now a plain `.jrn-emb-body` 2-line **CSS-clamped teaser** (no toggle; tapping the card opens the entry). **note-card** now titles itself by its annotation source (`noteSourceLabel(n)`, e.g. "Genesis 1:1") instead of a generic "Note". **Menu redesign** (`journal-styles.js` + `JournalInsertSheet.jsx`): grabber handle (matches `.fn-sheet-handle`), 40px bordered icon tiles with hover/`:active` feedback, hairline section dividers, and an intuitive **chevron on the six "leads-to-a-picker" items** (Card/Excerpt/Bookmark/Note/Journal Entry/Notebook) — absent on the four immediate-action items (Image/Voice/Body Text/Divider). Every insert item audited against its label — all correct. Gates: **+4 vitest** in new `journal-helpers.test.js` (plain-card-no-body / excerpt-keeps-text / note-source-title / no-helper fallback), lint(`--max-warnings 0`, 441 globals unchanged), typecheck, smoke:ci PASS (0 crashed / 0 console errors). Live-proven against the real WTLB corpus (Impasse): plain card → title only, no `.jrn-emb-body`; excerpt card → chosen text; journal-card → 2-line clamp, no `.jrn-expand-toggle`; menu renders grabber + bordered tiles + 6 chevrons / 4 none. No corpus edit → no CORPUS_VERSION bump.

**FOLLOW-UP 2 — drag grip on ALL editor blocks + Edit moved into the ⋯ menu (2026-07-14, owner-reported).** (1) **Missing grip:** the journal editor's `renderEditableBlock` catch-all branch (letter-card/chapter-card/verse-block/bookmark-card/note-card/journal-card/journal-excerpt/**notebook-card**) rendered `JournalBlockView` + delete × but **never called `blockDragUI(idx)`** — so every *card/excerpt* insert lacked the left-gutter reorder grip that p/h2/quote/divider/image/audio already had. One-line fix (add `{blockDragUI(idx)}` to the catch-all); the drag is index-based + type-agnostic so it just works. Live-proven: an entry with all 11 block types → 11/11 carry a grip + delete, and a synthetic pointer-drag on the **journal-card** grip reordered it 7→4 and persisted to the store. (2) **Edit affordance moved (reverses Session-3 (8)):** the viewer's floating pen FAB is GONE — Edit now lives in the ⋯ entry menu as **"Edit Entry"** (kept the `Open/Edit/Pin/Delete Entry` naming family; the `hideEdit` prop + the orphaned `.jrn-fab-action.is-edit`/`.is-create` CSS were deleted). Live-proven: no pen FAB, ⋯ opens Edit/Pin/Delete, Edit → `onEdit`. `JournalViewerScreen.menu.test.jsx` updated (pen gone / Edit present / Edit→onEdit); +1 test. Gates: lint(441)/typecheck green, 0 console errors.

**FOLLOW-UP 3 — gold ▸ link-arrow on every link-out card + gold outline on EVERY block (2026-07-14, owner-reported).** Owner wanted (a) the gold `›` chevron (previously only on the notebook card) on ANYTHING that links out, and (b) the gold outline on ALL blocks (body text, images — "everything"), not just cards. (a) New shared **`.jrn-emb-arrow`** (absolute, right-centred, gold-dim→gold on hover) added to `JournalBlockView` for **letter-card, chapter-card, verse-block (when bookId present), bookmark-card, note-card, journal-card**; notebook keeps its existing flex arrow. Cards reserve `padding-right:38px` so title/body never run under it. Data-driven (shows in editor + viewer alike — it's a "this is a link" indicator, not a live tap target in the editor). (b) EDITOR: text (`.jrn-grow-p/-h2`), quote, and divider blocks — which had no inner embed border — now get the same `1px var(--gold-border)` box + `--bg3`/`#f3ecdc` fill the card/media blocks already carried, so every editor block is one uniform gold-outlined card (text boxes brighten border on `:focus-within`). Image border recolored `var(--border)`→`var(--gold-border)` (both views); verse-block gained a full box. (**Follow-up:** owner then flagged the verse Excerpt card's leftover 3px gold LEFT-accent as the odd one out — removed it + unified `.jrn-embed-journal-excerpt` the same way, so both excerpt cards now carry the identical uniform 1px `--gold-border` box, radius 8px, as the letter/chapter/bookmark/note/journal cards; live-proven verse border L===R===bookmark's, 0 console errors.) Viewer body-text stays flowing prose (boxing reading text hurts legibility — editor-only). Live-proven against the real corpus: an entry with all 10 block types → **10/10 gold border**, arrows on **7/7** link-out cards + none on text/quote/divider (editor), **7/7** link cards arrowed in the viewer, image+audio borders gold, 0 console errors. Gates: lint(441)/typecheck green.

**FOLLOW-UP 4 — "Back to My Journal · <title>" pill on the ONE link-out card that lacked it: Notebook (2026-07-14, owner-reported).** Owner: everything that links out should raise the return pill. Audit found every journal card already does EXCEPT notebook: letter/chapter/verse/bookmark/note route through `navigateToLink`→`pushFromLetter` (the reading screens render `backHint` — same mechanism as GoToRefButton), journal-card uses `__journalBackStack`→the viewer's own `jrnBack` pill — but **notebook-card** went `onOpenNotebook`→`setScreen('notes-index')` with only a navOrigin (drives the top-left ‹, not a pill), and `NotesIndexScreen` had no pill at all (worse: you land DRILLED, so the ‹ un-drills first — a 2-tap return). Fix: `onNotebookCard` now passes `sourceMeta.sourceLetterTitle` → the route stuffs `backPill:{title}` into the existing `notesReturnCtx` navHandoff slot → `NotesIndexScreen` reads it into state on mount and renders the SAME `.back-hint-row`/`.back-hint-pill` markup the reading screens use; one tap calls `onBack()` (→ navOrigin → journal-viewer), bypassing the drill-back. Single-shot (component state, resets on unmount); non-journal opens (Library/note-tap) pass no backPill → no pill. Live-proven end-to-end in the real app: notebook card → notes-index drilled into "Gird Up!" with "‹ Back to My Journal · Pill Test Entry" → tap returns to the entry; letter + chapter cards re-confirmed showing the same pill on WTLB/Bible; 0 console errors. `NotesIndexScreen.test.jsx` +2 (pill renders from backPill + onBack on tap; absent without it). Gates: lint(441)/typecheck green.

**FOLLOW-UP 6 — nav decongested (icon-only back button) + back-pill fuzz killed (2026-07-14, owner-reported).** After FOLLOW-UP 5 rehomed the reading dot into the top nav, the owner (Android) hit two things: (1) the dot pushed the nav into OVERFLOW — the dot sat half-cut-off at the right edge and the Tabs button vanished off-screen — because the index/hub screens still carried a wide **text** back button ("← SCRIPTURES", "← VOLUMES", etc., Cinzel at 0.18em letter-spacing ≈ 120px); (2) the back-pill (`.back-hint-row`) had "weird fuzzing" — its `backdrop-filter: blur(10px)` over a fade-to-transparent gradient left blurred, half-opaque GHOST text in the fade zone. **Fix (1) — icon-only back button everywhere:** the six remaining text back buttons (ScriptureGenre "← Scriptures", ScripturesHome/VolumesHome/StudiesHome "← Home", BibleStudyIndex "← Studies", ChapterIndex "← Books") + SearchScreen's stray `←` now use the SAME `nav-home nav-back-icon` `‹` glyph the reading screens already used (title/aria-label preserve the destination for hover + screen readers); `.nav-back-icon` bumped 1.5→**2.1rem** (24→33.6px — the "bigger plainer" arrow the owner asked for) + `opacity:1`. `.top-nav` `gap` trimmed 0.25→0.12rem and side padding 0.7→0.5rem so even the FULL icon set (back+home+gear+history+search+theme) + dot + tabs fits with margin. Live-proven: at **360px** all 8 nav items fit (max-right 359<360) with the dot AND tabs present; at 375px an 8px margin; no horizontal overflow. AppShellOverlays' tabs-overview "← Back" is intentionally left (full-screen overlay, ample room). **Fix (2) — solid band, no blur:** `.back-hint-row` is now a SOLID `var(--bg)` band (opaque black dark / #f7f2e8 light — matches the reading bg, so content scrolling under it is cleanly HIDDEN, exactly what the owner wanted) with a gold hairline bottom border; `backdrop-filter` + both gradient backgrounds DELETED (never re-add the blur). Computed-style verified both themes: backdrop `none`, bg opaque, backgroundImage `none`. Gates: **2597 vitest / 147 files** (no test asserted the old back-text — clean), lint(`--max-warnings 0`, 443 globals unchanged), typecheck, build, smoke:ci PASS (0 crashed / 0 console errors). No corpus edit → no CORPUS_VERSION bump.

**FOLLOW-UP 5 — the floating-chrome FLASH GLITCH killed + the reading dot rehomed into the nav (2026-07-14, owner-reported).** Owner (Android): the dice icon, pulsing read dot, back pill, and settings-positioned nav arrows "disappear for a split second every so often"; also wanted the dot moved somewhere it draws over nothing. Root cause: EVERY tab-thumbnail capture (scroll-stop 300ms idle + 350ms after every nav + theme flips) put `capturing-thumb` on the LIVE body — `visibility:hidden !important` on all five chrome classes — TWICE per capture: once around the primary shot and again at +900ms around the themed html2canvas render (~0.5–1.5s hide!). The second hide was 100% REDUNDANT on both platforms (html2canvas draws from a DOM clone and already drops chrome via the bridge's `SCREENSHOT_IGNORE_CLASSES` ignoreElements list — the body class never did anything the list didn't); the first was equally redundant on web and load-bearing ONLY for Android's native PixelCopy. Fix: the live-body class is GONE everywhere (CSS hide block deleted; both class-adds removed from use-thumbnails; guard comments left at all three sites — never re-add) — chrome exclusion is clone-side only. Deliberate trade AT FIRST: the Android native shot included the small floating chrome instead of blinking the screen — **then the owner approved the all-clone follow-up (landed same day):** CONTENT-tab primaries now route through `takeThemedScreenshot(curTheme)` on BOTH platforms (html2canvas clone render — chrome-free AND blink-free by construction; the live screen is never photographed, so nothing ever needs hiding), costing true pixels + a 2nd html2canvas per capture; **Garden keeps the native true-pixel `takeScreenshot`** (photo pages are html2canvas's priciest case, theme-neutral, and carry none of the floating chrome). The theme test suite pins the routing: content tabs NEVER call `takeScreenshot` (the structural anti-blink guarantee on Android) + garden never runs the clone render; live-proven on a cold thumbs DB — 4 rows captured through the clone-render primary with dual-theme variants (57–71KB) and ZERO `capturing-thumb` body-class events. **Dot rehomed:** the App-level fixed `.reading-dot-global` (28px, floated over index-screen content top-right) is now **`.reading-dot-nav`** INSIDE the top nav's right cluster, left of the Tabs button (40px target) — overlaps nothing and is thumbnail-exempt for free (nav cropped natively via navHeightDp / ignored via the `top-nav` class). New `ResumeReadingNavBtn.jsx` owns `ReadingDotContext` (provided by App un-memoized — goToLastRead reads live nav state; sole consumer is one tiny button; app.jsx now 798/800) + the screen-eligibility list (moved out of app.jsx); ScreenLayout renders it before TabsNavBtn; Settings desc updated ("in the top navigation bar"). Gates: **2597 vitest / 147 files** (+6 dot tests, +1 RED-proven pin: both screenshot calls run with NO body class — fails on the pre-fix engine), lint(`--max-warnings 0`, **443 globals** — ReadingDotContext + ResumeReadingNavBtn), typecheck, build, smoke:ci PASS (0 crashed / 0 console errors). Live-proven in preview: dot renders in-nav on home/hubs (40×40, `dot-pulse` running, left of Tabs, no overlap at 375px, no horizontal overflow), hidden on reading + utility screens, tap resumes Psalms 23; a MutationObserver armed across many navs + scroll-stop captures + themed renders recorded **ZERO** `capturing-thumb` appearances while dual-theme thumbs still stored (dark 70KB + light 63KB). PREVIEW GOTCHA (new): the dwell timer never arms in the Browser pane (`setActiveReadKey` schedules only when `visibilityState==='visible'`, and the pane runs hidden) — commit via the app's own `window.__onDwellCommit()` bridge to set activeReadKey when verifying; also, direct `StateStore.set('vot-state', …)` patches get clobbered by the app's pagehide flush — drive the real UI instead. No corpus edit → no CORPUS_VERSION bump.

### Previous state (2026-07-13)

**STUCK-ZOOM FIX + TAB-DRAG v2 REDESIGN (2026-07-13, owner-reported).** (1) **Stuck zoom:** the APK disables WebView zoom, but the viewport meta had no `maximum-scale`/`user-scalable` — the INSTALLED PWA could pinch/auto-zoom (small-input focus) and the app's own touch handlers (pager preventDefault) then fought the zoom-OUT pinch, snapping it back until an app restart. Fixed in index.html: `maximum-scale=1.0, user-scalable=no` (deliberately non-zoomable; Text Size owns accessibility). (2) **Tab drag REBUILT (v2)** after two patch rounds (`6ff2bbe`, `e4d0be8`) still left device failures ("works once then never until restart" + "the real card visibly moves again after the ghost lands"): TabsOverview now runs a **pointer-events state machine** — ONE gesture object per pointerdown, destroyed by a single idempotent `endGesture()` from every exit path; a new pointerdown **FORCE-resets** anything a previous gesture leaked (no wedged state can ever refuse grabs again); **pointercancel** (the browser claiming the stream — the silent device killer) explicitly commits at the current slot and traces **`[tabdrag] …`** (console + DiagnosticLog — a failing device names itself); document-CAPTURE registration kept; the non-passive touchmove preventDefault scroll-suppressor kept (pointer events can't cancel native scrolling). **Seamless drop:** the reorder + sibling-transform clear commit in the SAME task at release (ONE paint of the final order) while the ghost glides above the inline-hidden destination card (cards are index-keyed → `cardRefs[to]` shows the dragged tab post-reorder) and swaps 1:1 at landing via `flushLanding` (idempotent; also flushed by any new grab + unmount) — the old path cleared transforms → painted the OLD arrangement → reordered 240ms later = the visible double-move. Also found: **the thumbnail `<img>` was natively draggable** — a long-press/drag landing on it could start the browser's image-drag and kill the touch stream (plausible "worked once, then thumbnails appeared, then never" mechanism); hardened with `draggable={false}` + onDragStart preventDefault + `-webkit-user-drag:none` + `pointer-events:none` on the img. `TabsOverview.drag.test.jsx` REWRITTEN (×10 pointer pins incl. synchronous commit, second-drag-after-success, non-bubbling pointerup, pointercancel commit, onReorder-throw recovery, unmount leak-free). Live-proven: 3 consecutive drags engaged+committed, order final beneath the gliding ghost, 0 leaks/console errors. **FOLLOW-UP (same day, owner confirmed "they feel great"): ALL FOUR drag surfaces now ride ONE shared engine.** The lifecycle was extracted VERBATIM into **`utils/press-drag.js` — `createPressDrag(cfg)`** (globalized, 441 globals): the factory owns the gesture object, document-capture pointer listeners, the non-passive touchmove scroll suppressor, hold/glow timers (`holdMs:0` = instant grab), drift cancel, pointercancel-commits-with-trace, unconditional force-reset at every new start, the LANDING glide (`land(ghost, revealEl)` — flushed by any new grab/destroy), and click suppression (`suppressed()`); hosts own only geometry/visuals via callbacks (`onEngage`/`onDragMove`/`onCommit`/`onAbortDrag`, host scratch on `g.data`). **TabsOverview was rebased onto it with its 10 lifecycle pins passing unchanged** (the equivalence proof), then **HomeScreen + LibraryScreen** (1D/2D tiles; order writes now SYNCHRONOUS at release with the same seamless hidden-dest drop — note: their tiles are keyed by ID, so the reveal target is the GRABBED node itself, not `cardRefs[to]` like the index-keyed tabs) and **JournalEditorScreen** (holdMs:0 grip; keeps its container-coord rects, variable-height slot delta, edge autoscroll, textarea-value clone mirroring; the old 220ms parked-commit window is GONE — moveBlock + blocksRef commit in the release task, so the pagehide-flush guarantee is now unconditional; the editor unmount cleanup also runs `commitSave()`). Each surface traces `[homedrag]`/`[libdrag]`/`[jrndrag]` like `[tabdrag]`. `JournalEditorScreen.reorder.test.jsx` rewritten to pointer events (×9 incl. pointercancel-commit + landing-flush re-grab + sync-commit-at-unmount); the J1/J2 suite gained the factory global. Live-proven per surface: Home tiles reordered + HomeOrderStore persisted + second drag + restore; Library Notes⇄Links swap + restore; journal grip INSTANT engage + alpha/beta swap + debounced save verified in the store + restore; 0 console errors. Gates: **2572 vitest / 144 files**, lint(441), typecheck, smoke:ci PASS.

**UX BATCH SESSION 2 — link picker overhaul (2026-07-13).** Items 3+6+7 of the owner's batch (tracker: `UX-BATCH-2026-07-12.txt`), plus his follow-up "picker search only searches titles" (true — searchNavIndex is titles/refs/aliases only). **LinkPicker now has three modes** (segmented control, all feeding the same create/refine pipeline so journal card/excerpt inserts inherit everything): **Search** carries an explicit SCOPE TOGGLE (owner follow-up): **"Titles & refs"** (nav-index, the default — reference queries live here) vs **"Full text"** — MiniSearch over every verse + letter body (picker mount kicks `__loadScreensE` + a deferred `VotSearchMini.init()`; docs map via new **`contentDocToNavItem`** in nav-index.js — Hidden Manna maps to null so it can never surface; snippets, cap 20; verse hits are verse-precise → direct create; the no-titles-match empty state offers a one-tap "Search the full text instead" jump). **Browse** — new **`buildNavTree`** groups the nav index into the app's own hierarchy (Bible → 66 books → chapter grid; MSB → chapters; every collection → entries; each study → chapters; breadcrumb back; the STUDY `matthew` bookId is EXCLUDED from the Bible list — it was rendering two identical "Matthew" rows). **Recent** — the link network: `LinkStore.all()` newest-first as From ⇄ To endpoint chips; tapping either endpoint reuses that exact already-refined place as the target in ONE tap. **LATENT BUG FIXED:** `buildNavIndex` memoized FOREVER on first call — built before a lazy corpus landed it permanently lost whole corpora (no Bible chapters in the picker until reload); now signature-guarded on corpus counts + the picker kicks all loaders on mount. **VersePicker** got the same document-`selectionchange` fix as the excerpt picker + a live verse FILTER (count badge; tap-number still selects); **ExcerptPicker** got a "Find in this letter…" bar (match count, ‹ › cycling, gold wash + scroll-to-center on the current hit; nothing hidden — selection stays whole-letter). Preview-proven at 375px on the real corpus: phrase "my cup runs over" (no title match) → **Psalms 23:5** top hit → verse picker → filter "anoint" 1 of 6 → footer enabled; Browse walked Bible→Psalms→150-chapter grid→verse picker with all 23 roots; Recent chips created a real link one-tap (+ Undo); find bar cycled hits with the wash moving; 0 console errors. Gates: **2567 vitest / 144 files** (+16: nav-index ×8, LinkPicker ×6 new, VersePicker ×2, excerpt find ×1 — counts drift, verify), lint(`--max-warnings 0`, **440 globals** — contentDocToNavItem + buildNavTree), typecheck, smoke:ci PASS. Deferred: picker content-search indexes under the default translation (the main Search screen owns translation-aware indexing). Sessions 3–5 remain in the tracker (journal insert-below + edit affordance; text-size slider; chrome-unselectable + spacing sweep).

### Previous state (2026-07-12)

**OWNER FOLLOW-UPS — theme-proof tab thumbnails + excerpt-picker selection fix (2026-07-12, after UX session 1; thumbnails upgraded to DUAL-THEME same day).** (1) **Tab thumbnails are now theme-proof via TRUE dual-theme captures** (v2 of the fix — the owner tested v1's invert-filter approach on device: "pretty convincing" but hero hues drifted blue and legacy cards didn't participate; he proposed capturing/remembering both states — implemented). Native PixelCopy can only shoot the ON-SCREEN theme, but html2canvas renders from a DOM CLONE — so **`PlatformBridge.takeThemedScreenshot(theme,…)`** (new, both platforms: html2canvas runs inside the WebView too) forces the OPPOSITE theme class on the clone via `onclone` and renders the other theme invisibly. `useThumbnails` entries are now variant maps **`{dark?, light?, unknown?}`** (vot-thumbs): the primary capture (native on Android = true pixels) fills the current-theme slot, then a **~900ms-deferred themed render** fills the other slot (seq-guarded — a newer capture supersedes it; skipped while the overview is open; `capturing-thumb` body class inherited by the clone). TabsOverview picks the variant matching the current theme → **theme flips are instant lookups, no filter, no recapture**; the `.thumb-theme-flip` invert filter survives only as a TRANSITIONAL fallback when just the other variant exists; `unknown` legacy rows render as-is while **`classifyThumbTheme`** (exported, use-thumbnails.js) probes their 8×8 average luminance and upgrades them to the right slot (fixes the owner's stale-dark Library card); interim `{url,theme}` rows (v1's one-day format) migrate on load. Garden = one capture fills BOTH slots (photos are theme-neutral; no themed re-render). A theme flip still re-photographs the active tab (true pixels replace the rendered approximation). Live-proven on the real corpus: one tab captured while the app stayed DARK the whole time → IDB row `{dark: 82KB, light: 72KB}` with measured luma **2 vs 239**; overview served the dark variant in dark and the light variant in light, both UNFILTERED, instantly. platform-bridge shape tests now pin 35 keys. **Follow-up (owner re-test): tabs-screen Home button dead + PC blank thumbnails.** (a) The overview's `HomeBtn` called `__goHome`, which changes the screen UNDER the overlay — looked like a no-op on both platforms; `HomeBtn` gained a **`beforeGo`** prop and AppShellOverlays passes the overview's dismiss. (b) html2canvas occasionally yields a **zero-sized canvas** (boot races); its `toDataURL` is the truthy `"data:,"` — it got STORED and painted that tab card permanently blank (background tabs never recapture → the owner's PC wall of blank squares). Fixed at 3 layers: `webTakeScreenshot` rejects <16px canvases + sub-1000-char encodes ('' = failure → next nav/scroll capture retries), `mergeVariant` floors incoming URLs at 1000 chars, and the load-on-mount **scrubs** stored degenerate variants (drops the field; deletes emptied rows → placeholder ✦ until the next good capture heals it). Live-proven: a seeded `{dark:'data:,', light:'data:,'}` row was deleted at boot; overview Home tap closes the overlay + lands Home. **Round 2 (PC still blank; Android fine; local repro healthy — reading-screen captures 110KB/~750ms):** the PC failure is ENVIRONMENTAL (prime suspect: an extension injecting body-level nodes that break html2canvas, or canvas-read blocking — extensions run in installed PWAs too, matching PWA+site failing while native Android works). Hardened: web capture now targets **`#root`** (extension junk is body-level; also keeps body-portaled sheets out of cards), a **16×16 uniformity probe** rejects blank renders (luma range <6 → failure; catches canvas-blocker white-outs), and every failure traces via **`_thumbFail`** → `console.warn('[thumb] …')` + `DiagnosticLog.error('thumb', …)`. If the owner's PC still shows placeholders: **F12 → Console → the `[thumb]` lines name the exact cause.** **Round 3 (PC thumbnails WORK but "don't fill the tabs"):** the capture was the whole window — on a wide PC the app is the centered 760px **`.screen-layout`** column, so cards showed a thin strip in black flanks. Web captures now target `.screen-layout` (the app's true viewport; #root/body fallbacks preserve the extension hardening; phones: column == window → **Android byte-identical**), and `--card-ar` derives from the COLUMN width via shared `updateCardAr()` — re-run at CAPTURE time because the mount effect can fire while a lazy-corpus placeholder has no column mounted (live-caught: `--card-ar` stayed `1280/720` on a cold boot into Job 1 until the capture-path re-measure landed `760/720`). Live-proven: capture 760×720, card 231×219, img fills edge-to-edge. Gates: **2551 vitest / 143 files**. (2) **Excerpt picker "can't save until I scroll" fixed** (owner-reported): LetterExcerptPickerScreen captured selection ONLY on mouseup/touchend over the picker body — but Android's long-press selection delivers its touchend NON-BUBBLING (the same WebView behavior behind the 2026-07-03 tab-drag lockup) and selection-HANDLE drags fire no page touch events at all, so the footer never updated until a later scroll's touchend ran a capture. Fixed with a document **`selectionchange`** listener (150ms debounce) driving the state commit; the touch/mouse fast path stays. Live-proven: `Selection.addRange` (fires ONLY selectionchange) flipped the footer to "Insert this excerpt". Gates: **2538 vitest / 142 files** (+9: use-thumbnails.theme ×3, TabsOverview.thumbtheme ×5, picker selectionchange ×1 — the last dispatches ONLY selectionchange, structurally RED vs pre-fix), lint(438 globals), typecheck, smoke:ci PASS, 0 console errors. **PREVIEW GOTCHA:** hidden-tab `setTimeout` clamps to ~1s — debounced UI (the picker's 150ms) looks broken if sampled early; wait generously before reading state.

**UX BATCH SESSION 1 — "Go to Scripture" on every scripture-ref sheet (2026-07-12).** Owner delivered a 9-item UX batch; **canonical tracker: `UX-BATCH-2026-07-12.txt`** (all 9 items reconned + mapped to 5 sessions with plans — READ IT before starting sessions 2–5: link-picker overhaul [browse tree + recent-links network tab + refinement-step search], journal insert-below-never-split + edit-affordance decision, text-size slider with text-only scaling, chrome-unselectable + button-spacing sweep). **Session 1 landed:** every scripture-reference bottom sheet — FootnoteSheet (Format A letters + study chapters via LetterView), Matthew's ScriptureSheet, and the LetterView/WtlbEntryView inline ref sheets — now carries a gold **"Go to Scripture · <ref>"** action (new shared `GoToRefButton`, reuses the `.fn-sheet-link-btn` visual family). Tap → sheet closes → `navigateToLink` `{type:'bible'}` endpoint → the EXISTING flash-highlight (`surpriseAnchor`) + **"Back to …" pill** + **Android hardware-back** (from-letter stack) all compose for free. Mechanics: hosts pass meta `{sourceLetterTitle, sourceVolumeLabel}` so the pill names the source; `onNavigateToLink` threaded via `sharedViewProps` (letters/WTLB/study chapters) + explicit prop on the matthew-ch route; **compound Matthew study cites ("Psalm 118:14; Isaiah 12:2") render one button PER passage** (found live in preview — parseRefStr can't parse semicolon lists); new exported `verseAnchorFor` makes **range refs flash the whole span** (Matt 27:15-26 → verses 15–26, capped at 176); GoToRefButton's mount effect pre-warms `__loadBibleCorpus` and an unresolvable tap retries 40×250ms (the journal `{{ref:}}` pattern) so taps are never dropped. GOTCHA: `findBook("Matthew")` = **`matthew-plain`** (the plain-Bible key) → scripture refs open plain Matthew in bible-ch, consistent with journal-nav; bookId `'matthew'` remains the STUDY edition's key (matthew-ch). Gates: **2529 vitest / 140 files** (+21: GoToRefButton ×11, sheet integration ×4, range/anchor ×6), lint(`--max-warnings 0`, **438 globals** — GoToRefButton regen'd), typecheck, smoke:ci PASS. Preview-proven on the real corpus (via the `app-alt` server — another session held the default port): letter footnote → Proverbs 16:17 flashed + pill + ONE hardware-back returns; WTLB `{{ref:}}` → pill-tap return; study compound cite → Isaiah 12:2 + "Back to Study Bible · Matthew 1"; 0 console errors. No corpus edit → no CORPUS_VERSION bump. **Follow-up (owner re-test): the flash was INVISIBLE — `.verse-surprise` never had a CSS rule anywhere** (pre-existing; the Surprise button's "flash" was equally invisible, masked by the scroll). Fixed (2 rounds — owner rejected round 1's block-container wash as a "lit-up square"): the flash is now the letters' tap-through highlight look VERBATIM — the same `--hl-*` palette vars + `letter-highlight-pulse` double-pulse keyframes (one 8.4s run; both pulses land inside the 4s window), applied to the verse's inner `[data-hl-key]` span (the HighlightableText root — inline, wraps exactly the verse text, so the wash hugs line boxes like a real highlighter), NOT the block container; base wash lives in the rule (not the animation) so reduced-motion degrades to a static highlight, and a `transition` on the span fades the 4s clear out. **PREVIEW GOTCHA (new):** a hidden preview tab freezes CSS transitions mid-flight (no frames paint) — computed styles show the START value forever; verify with `style.transition='none'` + computed style, not by waiting.

**RESTORED-NAME NEW TESTAMENT — two new Bible translations, NKJV-R + KJV-R (2026-07-12).** Owner directive: restore His true Name per The Volumes of Truth ("Death and Deliverance", "Proclaim The Name of The Lord" — "call upon His name as it is": **YahuShua HaMashiach**) across the NT of both the NKJV and KJV, with real originating-language nuance, personal use. **Canonical tracker: `RESTORED-NAMES-PLAN.txt`** (doctrine basis, full ruleset, per-verse exceptions, the Greek evidence, the 3 owner-flippable judgment calls). Every Jesus/Christ/Messias occurrence in both bases was scouted + cross-joined against the **Textus Receptus Greek** (the KJV/NKJV NT base text): 1,212 NKJV + 1,217 KJV verses restored. Rules of note: standalone Christ → **HaMashiach** (English "the" absorbed — Ha IS the article; the Greek article is NOT the split criterion because Greek drops articles after prepositions as pure syntax, while Hebrew titles take it regardless — Delitzsch corroborates); Hebrew suffix/construct grammar forces bare **Mashiach** in "His Christ" (Acts 4:26, Rev 11:15/12:10), "the Lord's Christ" (Luke 2:26), "called Mashiach" (Matt 1:16/27:17/27:22), "both Lord and Mashiach" (Acts 2:36); "Christ Jesus" pairs NORMALIZE to the commanded order (VOT writes it 121×, reversed 0×; the KJV itself reverses 11 TR pairs); the CAPS naming verses/cross inscriptions → **YAHUSHUA** (Matt 1:21 "call His name YAHUSHUA, for He will save His people" — the wordplay IS the Name's meaning, YAH-Is-Salvation); "false christs" → "false messiahs"; John 1:41/4:25 glosses render by MEANING ("the Anointed") to avoid circularity; **non-Lord bearers untouched** (Bar-Jesus, Jesus-called-Justus — the Matthew Study Bible's own header rule: "only The Messiah's name was restored"), KJV Acts 7:45/Heb 4:8 → "Joshua" (referent = son of Nun; NKJV parity). **Mechanism:** deterministic generator `tools/gen-restored-nt.mjs` (rules + fail-loud exceptions + leftover-token sweep; NEVER hand-edit outputs) → **sparse overlays** `bible-rnkjv.js`/`bible-rkjv.js` (~180 KB each, only changed verses); new registry field `base:'kjv'` on TRANSLATION_OPTIONS makes `loadTranslation` load the overlay's base alongside and `translateVerse` chain rkjv→BIBLE_KJV→verse.text (rnkjv's miss IS the NKJV base); the PERF-3 single-entry verse-index cache became a small LRU Map (chain lookups alternate 2 keys/chapter). SW corpus-cache regex auto-covers the new files; **CORPUS_VERSION c12→c13** (+ search cache.js CORPUS_CONTENT_VERSION, gate-enforced). validate-schemas Format E gained `sparse` entries (gap-warnings off, completeness swapped for an INVERSE subset-vs-KJV check). Chrome stays the orthogonal `settings.restoredNames` layer (default ON) and composes. **Gates:** +24 tests (`restored-names.test.js` ×18 golden/structure/sweep — pins exact totals 1212/1217 as a regen tripwire; `translations.test.js` +6 chain) → **2508 vitest / 138 files**, validate:data 0 errors, check_balance, lint(`--max-warnings 0`, 442 globals), typecheck, smoke:ci PASS (0 crashed/0 console errors). **Preview-proven live:** Settings selector shows both editions; NKJV-R Matthew 1 renders restored verses under restored chrome, hero eyebrow "NKJV RESTORED NAME"; KJV-R loads BOTH scripts and Psalm 23 falls through to true KJV ("my cup runneth over"); owner's translation setting restored to NKJV afterward. **Deferred (phase 2, in the plan):** OT YAHUWAH restoration (owner: "later — genuinely harder, needs Hebrew-side analysis"); the letter-embedded nkjv footnote dicts still quote Jesus/Christ in letter scripture sheets. **Follow-up same day:** the Bible Translation row's ⓘ now opens a reader-facing explainer (`TranslationInfoDesc` in SettingsScreen.jsx — the restoration logic laid out concisely + an explicit "prepared with AI assistance (Claude Fable 5, 2026), errors are possible" disclaimer); SelectField's `desc` provably accepts a React node (new `SelectField.test.jsx` ×2), `.settings-row-desc p/ul/li` styling added, preview-proven at desktop + 375px (no overflow, 0 console errors).

**LIBRARY UX SESSION — honest Save, journal pin/nav fixes, bookmark-thought + nag-banner removal, 2 agent deep passes (2026-07-12).** Owner directive: fix five reported UX defects + have agents go deep on Library screens and the missable sheets. **Coordinator batch (`eb60e0d`):** (1) journal-index pin marker is now an INLINE glyph in the card's date span (`.jrn-card-pin-inline`) — the old absolute `right:44px` marker drew ON TOP of the timestamp on narrow Android; (2) journal VIEWER nav decongested — pin+delete nav icons (8 total, overflowed) replaced by ONE ⋯ opening the hub's `JournalCardMenu` (new `hideOpen` prop; triple-confirm delete lives in the sheet; the viewer's duplicate inline tripledel machinery deleted); (3) bookmark "A Thought / future self" REMOVED from BookmarkCreateSheet + row action sheet + popover (legacy thoughts still display; edit commits pass `pending.currentThought` through untouched; bonus: EDIT-mode Save was enabled on first paint — unseeded `initialRef` — now seeded); (4) StorageHealthBanner's "not protected from browser cleanup" nag (all 3 persist variants) REMOVED — real emergencies (write-fail/critical/private-mode/storage-slow) stay, silent `_ensurePersistence` still runs at boot, Settings keeps the manual lever; (5) **HONEST SAVE**: NoteSheet + NotebookPickerSheet now own their modal-registry entries (moved OUT of AppShellSheets — a bare state-null on Escape/Android-back was how "Save looked cosmetic") and every dismissal routes through a component `requestClose`: fresh never-saved notes are DISCARDED (not stranded), typed-but-unsaved text gates behind a discard ConfirmStrip, and a new `freshGroup` flag (threaded SelectionToolbar/AnnotationActionChip → `openNoteSheet(gid, edit, freshGroup)`) makes discard remove ONLY what the flow created — **fixes a latent bug where Cancel on a chip-"Note" deleted the user's pre-existing highlight**; NotebookPickerSheet is TRANSACTIONAL (toggles buffer locally, footer Save commits the diff — disabled when clean, Cancel/×/backdrop/back discard with confirm-when-dirty; notebook create/delete stay immediate; row-delete × got divider + 44px WL4 overlay). **Agent merges:** LIB pass (`4014e6a`) — LinkCard "Remove link" 10px→177px from "Show more" + ≥24px tap heights; Highlights filter chips 21→25px; dead `.hlx-sort-btn` CSS removed. SHEETS pass (`54b6cf4`) — LinkPicker gets a "Linking from <source>" context strip, the red-×-that-DELETED-the-created-link is retired (neutral × keeps it; green "Link created" strip with separated Undo), Verse/LetterExcerpt pickers get step breadcrumbs + explicit state-labeled footer actions (VersePicker's silent no-selection dead-end removed; whole-letter link now an honest labeled action), **MultiNotePopover viewport clamp** (5-note popover at bottom ran to y=1027 on an 812 viewport with only 1 note reachable → flips above + internal scroll, bottom=708), LinkSidebar × moved left→right + link glyph + empty-state dedup, JournalInboundSheet rows keyboard-operable. Merge notes: app.css conflicts were the two agents' appended sections (kept both); dist/SW conflicts resolved by REBUILDING. Gates on merged main: **2486 vitest / 138 files** (+48: 25 coordinator + 23 sheets) + typecheck + lint(`--max-warnings 0`, 436 globals unchanged) + smoke:ci PASS (0 crashed / 0 console errors); every surface preview-verified at 375px incl. the full note-discard + notebook-Save round-trips on real stores. No corpus edit → no CORPUS_VERSION bump. **Follow-up same day — DEAD-UI SWEEP (`3f271ce`):** owner asked for anything lying/inactive; a full audit (no-op handlers, window.__ bridge read-vs-install diff, Settings-toggle consumers, href="#" anchors, disabled-styling honesty, NavButtons wiring) found exactly TWO: journal-viewer inline `{{ref:}}` scripture links called the never-installed `window.__openScriptureSheet` (silent no-op) — they now NAVIGATE to the verse via parseRefStr+findBook with a `__loadBibleCorpus` retry (+2 tests, preview-proven onto Psalms 23); and the orphaned `use-app-shell-effects.js` (+its test) deleted (globals 436→435). Everything else audited clean. Gates: 2484 vitest / 138 files.

**Selection popup no longer covers a near-top selection (2026-07-11).** Owner-reported on Android: highlight text near the top of the screen → the toolbar's top-nav clamp shoved it DOWN ONTO the selected text, hiding both the text and the native selection handles (selection unadjustable). Two latent defects in `SelectionToolbar.jsx`: the old near-top "flip" was broken (with `translateY(-100%)`, `y = rect.bottom + 10` put the toolbar's BODY over the text), and the layout-effect clamp (`Math.max(p.y, navBottom+h)`) then pinned it exactly onto a near-top selection. Fix: the layout effect is now the authoritative placement pass via pure exported `computeToolbarPlacement` — (1) prefer sitting TWO LINES (2×lineHeight, bounded 40–120px) above the selection; (2) no room under the top-nav → **auto-scroll the reading container up by exactly the deficit** (synchronous in the layout effect, so content + toolbar land in one frame; partial scrolls that can't fully make room are never taken); (3) not enough scroll room (top of document) → sit fully BELOW the selection with the same two-line gap; (4) viewport-spanning selection → clamp under the nav as before (end handle stays reachable). New `findScrollParent` derives the scroller structurally (nearest overflow-y auto/scroll ancestor — `.screen-scroll` in practice). +7 tests in `SelectionToolbar.test.jsx` (5 pure placement cases + 2 component tests driving the REAL layout effect via prototype `offsetWidth`/`offsetHeight` stubs — RED-proven vs the pre-fix component). Preview-proven on real Psalm 119: a selection at y=93 auto-scrolled the container 203px and the toolbar sat exactly 64px (2×32px lines) above it, clear of the nav; the masked-scroll (top-of-document) case placed fully below at a 64px gap; mid-screen selections unchanged-above. Gates: **2438 vitest / 129 files** + typecheck + lint(`--max-warnings 0`, 436 globals unchanged — the new export isn't window-globalized) + smoke:ci PASS (0 crashed / 0 console errors). No corpus edit → no CORPUS_VERSION bump.

**FLEET SESSION — 6 backlog items landed + the tab-drag lock-up killed + journal block reorder (2026-07-03).** Owner directive: "go deep with FABLE5-BACKLOG, dispatch fleets of agents, fix the tabs drag bug, make journal rearrangeable." Four worktree agents ran in parallel (each fully gated on its own branch, merged sequentially with bundle/globals regeneration per merge) while the coordinator fixed the drag bug + built the journal reorder in main. **(1) THE TABS DRAG LOCK-UP (`6ff2bbe`) — owner-reported: a dropped tab "reverts", then re-grabs only move vertically and never drop, app restart required.** Reproduced in preview with synthetic touches; THREE lifecycle holes, present identically in TabsOverview + HomeScreen + LibraryScreen (same imperative drag idiom): (a) the drop-commit lived in an untracked 240ms setTimeout (snap animation) while `startPress` refused any grab with `dragIdxRef >= 0` — a re-grab inside that window was SILENTLY SWALLOWED (untracked finger → native vertical scroll only, nothing droppable); (b) the document `touchend`/`touchcancel` handlers ended the drag when ANY finger lifted — a stray second touch committed early at whatever slot the card was passing (the perceived "revert") and stranded the primary finger; (c) an exception in the commit body skipped the ref resets (poisoned `dragIdxRef`/`justDraggedRef` = grabs refused + card taps suppressed). Fix (all 3 screens): the commit parks in `finishDragRef` and a new press FLUSHES it synchronously; presses track their owning pointer identifier (`trackedPoint`/`trackedEnded` — touchcancels that swallow the finger still end cleanly); commit body is try/finally. `TabsOverview.drag.test.jsx` ×6 pins the lifecycle (RED-proven vs the pre-fix component); preview-proven on all three surfaces incl. the window re-grab + stray-finger cases. **(2) JOURNAL BLOCK DRAG-TO-REORDER (`b048e07`, FABLE5 [6]) — blocks (text/images/audio/cards) can now be dragged to reorder in the editor.** A dots-grip in a 44px left gutter on every block when ≥2 exist (`.jrn-editor .jrn-blocks` padding-left; grip at left:-38 NEVER overlaps text; grab-left/destroy-right mirrors the tab cards; editor title re-aligned to 44px). NO long-press: the grip is `touch-action:none` so the grab starts instantly — the whole press-timer state machine doesn't exist here. Variable-height blocks use exact slot-delta FLIP (`_dragSlotDelta` from adjacent captured rects); rects are captured in CONTAINER coordinates (viewport + scrollTop) so the EDGE AUTOSCROLL (16ms-timeout loop — deliberately NOT rAF, which never fires in hidden/headless test hosts; equivalent on a visible page) never invalidates geometry; insertion index = count-of-centers-above. Drop commits via new pure `JournalHelpers.moveBlock` + the editor's normal save path — `blocksRef` is updated SYNCHRONOUSLY at commit so a pagehide/unmount flush inside the 220ms snap window persists the NEW order (the unmount cleanup also flushes a parked commit + commitSave()). Same hardened lifecycle as (1). Clone GOTCHA: React renders textarea text via the value PROPERTY, which cloneNode doesn't copy — the flying clone mirrors form-field values by hand. `JournalEditorScreen.reorder.test.jsx` ×7 (real JournalStore; moveBlock pure cases, mouse commit, window-flush, touch identity, unmount-mid-snap persistence); preview-proven down/up drags + store persistence + autoscroll. **(3) FLEET RESULTS — backlog [1]+[5], [2], [4], [3] all landed** (merge commits `0cb7bd9`/`350ef7a`/`77c1b0a`/`3f362d0`): **[1]** Notes index full-text search (`filterNotesByQuery` over body + display-normalized excerpt + source label; Bookmarks-parity `.notes-index-search` on All Notes AND drilled notebooks; zero new CSS). **[5]** smoke.js Search step now types "shepherd" + asserts ≥1 `.srch-card` + ≥1 `mark.search-highlight` (RED-proven; ~19s smoke). **[2]** `utils/notes-export.js` — pure markdown composer (notes grouped by source, blockquoted anchors, dates) + `shareNotesExport` via `navigator.share` else the EXISTING `PlatformBridge.saveToFile` (zero Kotlin edits); "Share as Text" on All Notes + "Share" in drilled notebook headers (hidden when empty). **[4]** backup freshness reminder — `lastExportAt` stamped in the ONE shared export success tail (`exportPersonalData`, both platforms; stored INSIDE `settings` deliberately — a bare StateStore key would be clobbered by usePersistedState's full-replacement write, and imported profiles inherit their export history); boot check in new `use-backup-reminder.js` (3.5s settle, >30 days + >50 KB via `measureUserData`, 7-day `lastBackupRemindedAt` cooldown, clickable UX7-idiom toast deep-linking to Settings, `settings.backupReminder` toggle in Your Data). NOTE from that agent: `use-app-shell-effects.js` is ORPHANED (globalized, called nowhere) — candidate cleanup. **[3]** My Progress dashboard — `MyProgressScreen` (route `my-progress`, `_kickVot`, navOrigin-pattern `goProgress`, Android back) with hero read/streak/entries, per-collection progress bars, library counts, most-annotated top-5 (distinct annotation groups; Hidden Manna REGISTRY-filtered); the Settings mark-as-read table's group data EXTRACTED to shared `utils/progress-stats.js` (SettingsScreen −143 lines); Library tile entry via `LibraryOrderStore.get()` now GROWTH-TOLERANT (saved 5-tile orders gain new default tiles at the end instead of resetting). **Gates on merged main: 2428 vitest / 127 files** (2336 +92) + typecheck + lint(`--max-warnings 0`, **436 globals**) + canary 795/800 + smoke:ci PASS (0 crashed/0 console errors, incl. the new Search assertion). All new surfaces preview-measured clean (dashboard ~1 screen tall, notes controls uncrowded, grips clear of text/aligned title). No corpus edit → no CORPUS_VERSION bump. **PREVIEW GOTCHAS (new):** the preview browser window can run `visibilityState:hidden` — rAF NEVER fires (why the autoscroll uses a timeout loop) and `preview_screenshot` times out; drive + verify via `preview_eval` geometry instead, and sample AFTER generous settles (hidden-tab timers clamp to ~1s). In vitest fake-timer tests, a commit whose effect schedules the 1.2s debounced save needs TWO `act(advanceTimersByTime)` calls (effects flush at act exit, not mid-advance). A second concurrent session's preview server: use the `app-alt` launch config (port 8093, `c0c29dd`).

**FOLLOW-UP SAME DAY — the device lock-up SURVIVED `6ff2bbe`; real root cause found on-hardware + fixed (`e4d0be8`).** Owner re-tested on the phone: still froze. Debugged the REAL WebView over adb (CDP `Input.dispatchTouchEvent` + `adb shell input motionevent` + a document-CAPTURE event logger injected into the live app) and reproduced the zombie: **the drag's release `touchend` arrives at document-CAPTURE but never reaches document-BUBBLE listeners.** Two device-only consumers can starve a bubble listener: (a) the WebView's NATIVE text-selection machinery — when it claims a long-press over selectable content it delivers the gesture's touchend NON-BUBBLING (the SAME documented behavior that forced the tap→chip native bridge, MainActivity.kt:713); (b) ScreenLayout's tap-suppressor stopPropagation()s a >300ms lift over an `INTERACTIVE_SEL` target (Home/Library tiles + the journal grip are `<button>`s — tab-card bodies are NOT, which is why (a) is the tabs culprit). Desktop preview has neither → why `6ff2bbe` looked green. Fix (all four drag surfaces): **drag listeners register in the CAPTURE phase** (document-capture is propagation's FIRST node — nothing can starve it) + a **zombie self-heal** (a grab while a drag is "active" but event-silent >2.5s aborts the stale drag uncommitted and proceeds — no drag state can ever again require an app restart) + `user-select/touch-callout:none` on the journal grip. +3 tests (a `bubbles:false` touchend — the faithful device repro — must end+commit the drag, tabs+journal, RED-proven vs the shipped code; self-heal re-grab). Gates: 2431 vitest / typecheck / lint(436) / canary 795 / smoke PASS. **DEBUG WORKFLOW GOTCHAS:** the WebView devtools socket is `@webview_devtools_remote_<pid>` (re-find after any app restart; a leaked WS client wedges its HTTP endpoint — close gracefully or force-stop the app); `adb shell input` injects into whatever app is FOCUSED (check `dumpsys window | grep mCurrentFocus` first — the owner may be using the phone); `input motionevent DOWN/MOVE/UP` chained in one `adb shell` with `sleep` gives full native-stack long-press-drag; CDP `Input.dispatchTouchEvent` bypasses the Android native layer (useful contrast: if CDP works but real fingers fail, the bug is in native-layer interaction).

**Classic search RETIRED + first-run annotation hint + FABLE5-BACKLOG.txt (2026-07-02, session 3).** Three owner directives executed. **(1) The Classic/FlexSearch engine is GONE — MiniSearch is THE search engine** (the pending A/B decision, called by the owner). `assets/search.js` (~80 KB, ~1830 lines) + `flexsearch.min.js` (~16 KB) deleted; **bundle-a 689→593 KB raw (−96 KB off the cold-boot critical path)**; `search-data.js` (the shared `window.VotSearchData`) STAYS in bundle-a. Every call site swapped to `window.VotSearchMini` (same facade contract incl. `snippet`/`highlightSpans`/`fuzzyBookSuggest`/`rebuild`): SearchScreen's `pickEngine()` (no longer reads the deleted `settings.searchEngine`; its deps arrays dropped `engineName`), SrchSnippet, use-search's `rebuild-index`. The Settings "Search Engine" selector row is REMOVED (a stale persisted `searchEngine` key is simply unread); Synonym/StopWords toggles stay (engine-agnostic options). **app.jsx's boot `purgeStaleCache` effect became a one-shot `indexedDB.deleteDatabase('vot-search-cache')`** — the retired engine's cache DB (tens of MB on long installs) is reclaimed at every boot, idempotent; `vot-minisearch-cache` is version-gated internally and untouched; Clear-All still deletes both (stragglers). Config surface: `tools/build.py` A-list + comments, `vitest.config.js` (include entry + the search.js per-file floor removed — the aggregate ROSE to 79.4/69.2/80.1/84.0 because the removed file sat below it), `eslint.config.js` ignore, `tools/gen-eslint-globals.py` VENDOR_GLOBALS (`VotSearch`/`FlexSearch` out → **426 globals**), SW comment. Classic-only suites `src/data/search-engine.test.js` + `search-ranking.test.js` DELETED (~48 tests — they tested the deleted engine); `use-search.test.js`/`SrchCard.test.jsx` re-stubbed to VotSearchMini. **Preview-proven cold**: `VotSearch`/`FlexSearch` undefined, `VotSearchData` present, typo `sheperd` → 504 results with "shepherd" `<mark>`ed, the orphaned `vot-search-cache` DB gone from `indexedDB.databases()` after boot, Settings row gone. **(2) First-run annotation hint** (the invisible long-press gesture finally has discoverability): new `AnnotationHint.jsx` rendered by ScreenLayout on the 4 reading screens (`pager && !inert`, OUTSIDE `.pager-track` as a stickyNav sibling — portal-immune by placement). Shows a bottom-center pill ("Press and hold any text to highlight, note, or bookmark it" + ✕) after a 2.5s settle, ONLY while the user has ZERO annotations+notes+bookmarks — **the data itself is the "seen" flag** (no new IDB store/schema/export surface; the first mark extinguishes it forever via store subscriptions; ✕ dismisses per-session via `window.__annHintDismissed`). The OWNER never sees it (he has data). Guarded `typeof` store access so bare-test hosts don't need stubs. GOTCHA fixed: `left:50% + translateX(-50%)` fixed-position shrink-to-fit sized the pill against the HALF-viewport → needless wrapping; `width:max-content` defeats it. `AnnotationHint.test.jsx` ×4 (zero-data shows after delay / existing data never / first-mark extinguishes / session dismiss). **(3) `FABLE5-BACKLOG.txt` (repo root)** — the owner has ~5 days of Fable 5; the file is a 20-item prioritized menu (each scoped to ONE session, with acceptance criteria, effort, the session protocol, hard constraints, and a do-NOT-relitigate list). Top picks: My Notes search box (real gap — the only library index without one), notes/notebook text export, a My Progress dashboard, backup-freshness reminder, smoke search-result assertion, journal block reorder. Gates: **2336 vitest / 120 files** (2380 −48 Classic +4 hint) + coverage floors (aggregate up) + typecheck + lint(`--max-warnings 0`, **426 globals**) + smoke:ci (0 crashed/0 console errors). No corpus edit → no CORPUS_VERSION bump (CACHE_VERSION rehashed via build:sw as usual).

**UX pass ROUND 2 — the FULL surface walk (all 40 routes + 15 sheets + component sweep), owner-directed "every screen, icon, and interactable" (2026-07-02).** After round 1 (below) the owner asked whether EVERY screen had been checked — it hadn't, so a tracked 9-task sweep walked the rest in preview on the real imported data: TabActionSheet + disable-tabs dialog, Search (+results), all reading-screen chrome (letter footer, WTLB, Matthew ModeToggle, holy-days playlist header, Garden), every index/home screen, the library lists visually, every remaining sheet/picker (insert/recording/link-picker/verse-picker/bookmark-create/notebook-picker/multi-note/inbound/sidebar), full Settings scroll, plus two code-grep sweeps (unlabeled icon buttons: NONE — W10-lite held; unconfirmed destructive store calls: every one gated EXCEPT the finds below). **5 finds, all fixed + preview/test-verified:** (1) **Voice-memo discard was INSTANT from four paths** — the backdrop tap, the header ×, the recording-stage Cancel, and the preview × sitting 14px from Save — i.e. a stray tap outside the sheet destroyed a finished recording. New `requestDiscard()` confirm-gates all four via ConfirmStrip whenever real audio is at risk (recorded seconds > 0 or preview up); the empty `requesting`/`error` stages still close instantly; the review row's ×↔✓ gap widened 14→34px (`.jrn-rec-review-actions`). +4 tests in `JournalRecordingSheet.test.jsx` (mocked bridge via `vi.mock`, REAL ConfirmStrip, fake timers to reach seconds>0). (2) **TabActionSheet's two bulk closes ("Close other tabs"/"Close tabs to the right") fired instantly with NO undo snapshot** (the single × close has an Undo toast; these never did) — both now swap to an in-place ConfirmStrip with the tab count in the question; new `TabActionSheet.test.jsx` ×2. (3) **LinkRow's action sheet (incl. Delete) was long-press-only — an invisible affordance**, inconsistent with BookmarkRow's visible ⋯; added the same ⋯ button on the link-row mid strip (`.link-row-more`, 36px+ hit, same onLongPress handler). (4) **External links carried no leave-the-app affordance** (letter Audio/Video/Related Topics, About, footnote URLs, playlist buttons — 18 sites): one global rule `a[target="_blank"]::after{content:" ↗"}` marks every external anchor; in-app links never carry `target` so they stay unmarked. (5) **Matthew's floating "PDF | Off" pill never said WHAT it toggles** (tooltips don't exist on touch): a small "Study Notes" caption now sits above the pill (`.mode-toggle-label`; the hidden-state button reads "Show" instead of "On"; ProphecyExpandToggle shares the wrap class but adds no caption — unaffected, its tests pin Expand/Collapse). Everything else walked was CLEAN — notably Search results, JournalInsertSheet, BookmarkCreateSheet, Garden, the disable-tabs + Garden-warning dialogs, and Settings' ⓘ-explainer pattern. Gates: **2380 vitest / 121 files** (+6 new) + typecheck + lint(`--max-warnings 0`, one exhaustive-deps suppress documented on the stage-reset effect; 428 globals unchanged) + smoke:ci (0 crashed/0 console errors). No corpus edit → no CORPUS_VERSION bump.

**UX/design pass — destructive-action separation + at-a-glance fixes across every user-facing screen (2026-07-02).** Owner directive: evaluate all screens, put decent space between delete and other buttons, make everything intuitive at a glance, keep the aesthetic. Surveyed every screen in preview ON THE OWNER'S REAL DATA (pulled the phone's fresh `.votbak` via adb + imported through the real `readContainer`→`applyV3` path — clean, 0 failures). The confirm PATTERNS were already strong (ConfirmStrip everywhere, triple-step journal delete, type-DELETE wipes, tab-close undo) — what needed work was PLACEMENT/SPACING + one real data-resolution bug. **Shipped (all preview-verified with measured px):** (1) **Tab cards: ⋮ menu moved to the top-LEFT corner** — it sat 3px from the instant-close × (the single worst misfire in the app); now 91px apart (`.tab-card-menu` right→left). (2) **AnnotationActionChip reordered Color·Style·Note·REMOVE** (was Remove-FIRST, flush against Color) with a 6px gutter + stronger divider before Remove; confirm-gate unchanged. (3) The selection toolbar's **✕ remove-highlight got a 16px gap** from the last color swatch (it read as "one more swatch"), and the **action grid is now 3×2 balanced** (was 5+1 with Bookmark orphaned). (4) **Notebook drilled header: Rename↔Delete gap 8→16px**; (5) **journal viewer: pin↔trash gap 0→12px** (nav icons were flush 44px boxes). (6) **Settings "Clear All My Data" is a visually separated danger zone** (gap + red-tinted rule above; new optional `className` on DataActionRow). (7) **NoteSheet ⋯ menu + row action sheets: the red Delete item sits behind a gap + rule** (`.note-sheet-menu-item.danger` / `.link-action-btn-danger`). (8) **Empty notes: the passive "Tap ⋯ → Edit" hint is now a real dashed "✎ Add note text" button** that jumps straight to edit (new `.note-sheet-empty-btn`). (9) **Journal editor's 26px block-delete × + 32px voice-memo × got 44px effective hit areas** (WL4 `::after` overlay pattern, visuals unchanged). (10) **REAL BUG — library rows showed raw slugs** ("the-last-trump") **instead of letter titles, and letter tap-throughs dead-ended (`screen:null`), whenever a session cold-restored without visiting Home/Volumes**: `noteSourceLabel`/`_bookmarkSourceLabel`/`noteSourceNav` need `findEntryContext` → the VOT registry. Fix mirrors the `matthew-ch` contract: new `_kickVot(jsx)` in `buildScreenRoutes` fires `window.__loadVotCorpus()` (idempotent, async-notify-only) on the 8 library-family routes (library, notes/bookmarks/links/highlights indexes, journal home/viewer/editor) — verified titles resolve ("The Last Trump", "Grafted In") on a cold-restore-into-Psalms session. (11) Drilled-notebook rows no longer repeat that notebook's own chip on every row (new optional `hideNotebookId` on NoteRow). Gates: **2374 vitest / 120 files** (+8: chip order+confirm-gate ×2, `NoteRow.test.jsx` ×3, `NoteSheet.test.jsx` ×3 — the chip tests import the REAL ConfirmStrip) + coverage + typecheck (the 2 new optional props needed JSDoc `?` typing) + lint(`--max-warnings 0`, 428 globals unchanged) + smoke:ci (0 crashed/0 console errors). No corpus edit → no CORPUS_VERSION bump. NOTE: the owner's imported real data lives only in the preview browser profile's IDB, not in the repo.

**Polish triple — study-chapter swipe peeks the REAL page + prophecy-FAB portal + fuzzy snippet highlight (2026-07-02, commits `76b15de`/`24fbeab`/+1).** Three items from the standing improvement list, each gated + preview-verified on the real corpus. **(1) Bible-study chapters now peek the real neighbor page on swipe.** CORRECTS A STALE DOC CLAIM: BibleStudyChapterView was never "chain-nav only" — it renders **LetterView** over a letter-shaped chapter shim, and LetterView always passes `pager` to ScreenLayout, so study chapters always HAD the finger-follow swipe (and sit inside `.pager-track`, so the PERF4 content-visibility lift already covered them — the app.css comment claiming otherwise is fixed). What was actually missing: `_letterPeek` resolves neighbors via `resolveNeighborLetter(volKey, id)`, which only knows the VOT collections → every same-study neighbor degraded to a generic "Continue" boundary card. Fix: LetterView takes an optional **`resolvePeek(nb) → {letter, scrollKey} | null`** host override used by `_letterPeek` (and for the peek's `restoreScroll` key); BibleStudyChapterView refactors its shim into `shimFor(chapter, idx)` (identical fields + chapter→study resource fallbacks + the same `-1`-index preface arithmetic) and supplies `resolvePeek` mapping a neighbor id → its own shim + the `study-<studyId>-<chId>` scroll key (mirrors `getScrollKey`'s branch). Preview-proven on more-than-a-man: both peeks render the full inert neighbor (109 paras + 7 prophecy cards, correct hero titles), width parity 736/736 + para 639/639, the prev-peek opens AT the neighbor's saved scroll (800/800), the preface peeks as a real screen, a synthetic 55%-width touch swipe commits Section One→Two cleanly, and out-of-study ids still fall back to boundary cards. **(2) The known-latent prophecy-expand FAB bug is dead** (`76b15de`): `ProphecyExpandToggle` (`.mode-toggle-wrap`, position:fixed — study chapters are the only screens with `prophecy-group` blocks) now portals to `<body>` inside the component (same idiom as ScriptureSheet/FootnoteSheet), so a swipe-settle transform on `.pager-track` can't displace it — proven immune to `translate(300px,-800px)` (moved 0/0). Swept every `position:fixed` class in app.css against the 4 pager screens' children: it was the last one (`stickyNav` renders OUTSIDE `.pager-track`, ScreenLayout.jsx:285). The `!inert` gate in LetterView now also prevents a peek from portaling a DUPLICATE FAB onto the live viewport (verified exactly 1 FAB with both study peeks mounted). **(3) MiniSearch v1.1 deferreds closed** (`24fbeab`): fuzzy/prefix-corrected words now `<mark>` in snippets — the engine emits the doc-side matched vocabulary per result (`{score, doc, terms}`; MiniSearch's `result.terms = Object.keys(match)`, collected from literal units only, cap 12/doc) and `SrchCard` merges `entry.terms` into the query-level list (Classic results carry no `terms` → byte-identical path). Preview: `sheperd` → 79 matches, every card marks "shepherd". And Clear-All now also deletes **`vot-minisearch-cache`** (it only wiped the Classic `vot-search-cache`) — verified gone from `indexedDB.databases()` after the real type-DELETE flow. Gates per commit: 2366 vitest total (+14 new across 4 test files: FAB portal ×4, engine fuzzy-terms round-trip ×1, SrchCard merge ×3, `LetterView.peek.test.jsx` resolvePeek ×3, `BibleStudyChapterView.test.jsx` shim/resolver ×3) + coverage floors + typecheck + lint(`--max-warnings 0`, 428 globals unchanged — `resolvePeek` is a prop, not a global) + smoke:ci (0 crashed/0 console errors). No corpus edit → no CORPUS_VERSION bump. **Still open from the same improvement list (owner-side or optional):** the MiniSearch-vs-Classic A/B decision (retiring Classic reclaims ~138 KB off bundle-a's cold-boot path), deep a11y (TalkBack walk + modal focus traps), and the standing device walks (`tools/n1-smoke-walk.md`).

**Highlight "jumps tracks" — word-snap no longer leaks across an on-screen line break (2026-07-01).** Owner-reported: on WTLB "Set Apart" (#122), highlighting exactly the line "Take your every thought captive" — after the highlight *activates* — swallows the first word of the next line ("That"), and "some other screens" do it too. Root cause: `snapRangeToWords` (`renderer/annotation-engine.jsx`) EXPANDS a partial-word selection outward to whole words by reading the flattened container text — but on the **imperative DOM path** (letters/WTLB, `[data-hl-dom]`) a poetry block is ONE `[data-hl-key]` container whose on-screen line breaks come from DOM STRUCTURE, not characters: `LetterView` renders each line as its own `<div class="poetry-line">`, and `WtlbEntryView.renderText` turns each `\n` soft break into a `<br>` and DROPS the newline. Either way `container.textContent` stitches the two lines with NO separating char → "…captiveThat…". The end-expansion loop reads that seam as a mid-word split and walks forward through "That". (Symmetric on the start side — a line starting a selection can pull in the previous line's last word.) The React verse path (Bible/Matthew) is UNAFFECTED: each verse is its own container of continuous text, and poetry newlines there are real `\n` chars (already non-word boundaries); ditto `LetterExcerptPickerScreen`/`VersePickerScreen`, which keep `\n` as text. **Fix (surgical, offset-coordinate-preserving):** `snapRangeToWords` takes an optional `boundaries` Set of textContent offsets where a hard visual-line break sits; the two expand-outward loops won't cross one (the trim + everything else is unchanged, and a boundary NEVER blocks a selection the user *deliberately* dragged across the break — only the auto-widen). New `blockBoundaryOffsets(container)` walks the container recording a seam at every block-level child boundary (`<div>/<p>/…`) AND every `<br>` (inline elements — `em`/`strong`/`mark`/`fn-ref` — are recursed with NO seam, so snapping across an italic/footnote split still works; a plain `letter-para` yields an empty set → byte-identical behavior). New `snapSelectionRange(container, text, start, end)` glues them and is the single entry point all **5** `SelectionToolbar` snap sites now use (highlight/note single+multi + bookmark). Both helpers globalized via `renderer/_entry.js`. **Preview-verified on the REAL corpus DOM shapes:** rebuilt the exact `<br>` (WTLB) and `poetry-line`-`<div>` (LetterView) structures + ran the real `computeOffset`→`snapSelectionRange` path — selecting "Take your every thought captive" now snaps to EXACTLY that (0 chars leaked, both shapes; pre-fix leaked "That"), while a deliberate drag from "captive" into "That" still spans both lines. Gates: 2352 vitest (+10 — 4 boundary cases on `snapRangeToWords` + 6 on `blockBoundaryOffsets`/`snapSelectionRange` incl. the "Set Apart" regression + null-container degrade; `SelectionToolbar.test.jsx` got a `snapSelectionRange` identity stub) + typecheck + lint(`--max-warnings 0`, 428 globals incl. the 2 new helpers) + smoke:ci (0 crashed/0 console errors) green. No corpus edit → no CORPUS_VERSION bump.

**Tabs overview — robust title memory; viewed tabs never revert to generic labels (2026-06-21).** Owner-reported: open tabs sometimes "forget what I was reading" and show generic card labels ("Reading", "Scripture", "Entry") instead of the real title. Root cause: `describeTab()` (`utils/tabs.js`) recomputes each card's title from the LAZY-loaded corpora (`BOOKS`/`MATTHEW`/the VOT collections/bible studies) at overview-render time, and there was NO per-tab stored title. A background tab whose corpus isn't loaded THIS session → the lookup returns null → generic fallback. (The card's background thumbnail is a saved snapshot from when you read it, which is why the verse text shows but the title didn't.) **Fix = make the label sticky.** (1) `describeTab` now returns a `resolved` boolean — true when the title came from real corpus data (or a corpus-independent screen), false only when a content lookup fell back to generic. (2) New `useTabTitleMemo({activeTab, updateActiveTab})` hook (bundle-b, called once in App after `useDocumentTitle`): while a tab is ACTIVE its corpus is necessarily loaded, so describeTab resolves a real label — the hook writes it back onto the tab's new persisted `title`/`subtitle` fields (added to `DEFAULT_TAB`). It's an EFFECT (not capture-at-nav) because the corpus loads async after navigation; App re-renders when it arrives (`useLazyBundles`), the effect's deps change, and the write fires; an equality guard makes it idempotent (no loop, no overwriting a good title with a generic one). (3) The Tabs overview + `useDocumentTitle` now prefer the live label when `resolved`, else fall back to the tab's remembered `title`/`subtitle`. Net: once a tab has EVER been viewed, its label is remembered until the tab is closed — across corpus unloads AND app restarts (the fields persist in vot-state). Legacy tabs (pre-fix, no stored title) self-heal the next time they're activated. **Preview-verified on the real corpus:** restoring into Matthew ch8 captured `title:"Matthew · Ch. 8"` into the persisted tab; a background Bible tab carrying a stored "Psalms · Ch. 123" rendered that exact label in the overview while `BOOKS` was confirmed UNLOADED (live describeTab returned `{title:'Reading', resolved:false}`) — pre-fix it showed "Reading". Gates: 2335 vitest (+5 — `use-tab-title-memo.test.js` ×4 + a describeTab `resolved:false` case; existing `tabs.test.js` `toEqual`s updated for the new field) + typecheck + lint(`--max-warnings 0`, 426 globals incl. the new hook) + smoke:ci (0 crashed/0 console errors) green. No corpus edit → no CORPUS_VERSION bump. **GOTCHA:** the new hook is a window-globalized export, so `npm run lint:globals` had to regenerate the globals (425→426) — done.

**Matthew Study Bible — two owner-reported Android bugs fixed + preview-verified (2026-06-21).** **(1) Study cards lose tap-through after closing/reopening the app → the VOT-letter cards become un-tappable gold boxes with no `›` chevron.** Root cause: the letter cards (`InlineNotes`/`StudyPanels`) are tappable only when `resolveVotLetter(vol, letter)` resolves, which needs `VOT_LETTER_REGISTRY` — populated only after the **VOT corpus** (`bundle-a-vot.js`) loads and `__finishVotInit` rebuilds it. The `matthew-ch` route loaded ONLY the Matthew corpus; on a cold-boot restore STRAIGHT into Matthew nothing else pulled the VOT corpus, so the registry stayed empty → `canTap=false` → plain non-tappable `.vot-note`/`.inline-vot-note` divs, no chevron. Fix: the `matthew-ch` route now fires `window.__loadVotCorpus()` in the BACKGROUND (idempotent + async-notify-only, same render-phase contract as `_corpusView`'s `loadFn`; non-blocking — the verses don't wait on it); `useLazyBundles` already subscribes to the VOT corpus version, so when it lands App re-renders and the cards upgrade to tappable. **(2) Footnote scripture references open blank — "greyed the screen" but no sheet.** Root cause: the position:fixed `ScriptureSheet`/footnote sheets render inside the reading screen's `.pager-track`, which carries a transient `transform` + `will-change:transform` during a page-swipe settle (`use-pager-gesture`). A transformed ancestor becomes the **containing block for fixed descendants**, so the sheet's `bottom:0` resolved to the bottom of the tall scrolled track and dropped off-screen while the backdrop still greyed the screen (intermittent — only in the ~300ms settle window after a swipe). Fix: the sheets now `ReactDOM.createPortal(…, document.body)` so they always anchor to the viewport, never to `.pager-track` (applied to `ScriptureSheet`, `FootnoteSheet`, and the inline scripture sheets in `LetterView`/`WtlbEntryView` — every pager reading screen; theme vars are on `:root` so body-portaled sheets stay styled). Also hardened the Matthew `ScriptureSheet` with a missing-verse fallback (it was the only sheet that rendered its body solely when `verseText` was truthy → an empty sheet on a data gap; now mirrors the others' "Verse text not available in app data"). **Verified in preview on the REAL corpus** by seeding a cold-boot restore into `matthew-ch` ch1: both Matthew + VOT corpora auto-load, all 4 VOT cards render as tappable buttons with `›` chevrons; tapping a scripture ref opens a sheet whose parent is `<body>` and whose rect is **provably immune** to a `translate(300px,-800px)` applied to `.pager-track` (moved 0/0px — pre-fix it would have shifted off-screen by exactly that), with full cite+verse content, and the backdrop closes it. Gates: 2330 vitest (+7 new `ScriptureSheet.test.jsx`/`FootnoteSheet.test.jsx` — portal-escapes-track, missing-verse fallback, backdrop-close, no portal leak on unmount) + typecheck + lint(`--max-warnings 0`) + smoke:ci (0 crashed/0 console errors) green. No corpus edit → no CORPUS_VERSION bump. (`BibleStudyChapterView` is chain-nav only + has no VOT cards → unaffected. `BibleChapterView` has no bottom sheet → unaffected. NOT changed: the prophecy-expand FAB in `LetterView` is also a position:fixed child of `.pager-track` and same-class latent during a settle, but lower-impact + unreported — left for a follow-up if it ever surfaces.)

**Page-swipe polish — scrollbar parity + peek opens at the neighbor's saved scroll (2026-06-19).** Two owner-reported one-frame flashes on the real-inert page swipe (entry below), both now fixed + preview-verified. **(1) Scrollbar flash / "different than the peek shows":** the peek rendered at REAL heights (`content-visibility:visible`, needed to paint while parked off-screen) but the LIVE screen used `content-visibility:auto` (PERF4) → off-screen blocks reported ESTIMATED heights → the live scrollbar thumb was approximate + snapped as real heights resolved, and at swipe-commit you jumped from the peek's accurate scrollbar to the live's estimated one. Since the pager already pre-renders both full neighbors, the PERF4 estimate buys nothing on these 4 screens — so `app.css` now lifts `content-visibility:visible` on `.pager-track .letter-para/.letter-poetry/.section-block` too (the live pane), matching the peek. Both panes now measure identical heights (verified live==peek 1621/1621 on Psalm 25; Psalm 119 real 9435 vs the old ~11511 estimate) → one stable, accurate scrollbar, no commit flash. (Non-pager reading screens — `BibleStudyChapterView` — keep `content-visibility:auto`: no peek to match, no swipe.) **(2) Scroll-position jump:** the peek always sat at top, so swiping to a *previously-read* neighbor showed top during the drag then jumped to the saved position on commit (the live's `startRestore` only runs after mount). Now the peek renders **already at the neighbor's saved scroll offset**: `useScrollMemory` publishes the active tab's saved map to `window.__scrollPositions` (bundle-b→d bridge); each reading screen looks up its neighbor's record (`savedScrollFor` + `letterScrollKey` in pager-preview.jsx; Bible/Matthew key as `${bookId}-${chapterNum}`) and passes it as `restoreScroll` to the inert clone; `ScreenLayout` (inert) applies it to its scroll container in a layout effect via `applySavedScrollToEl` (anchor by `data-hl-key`, pixel-`y` fallback — the SAME math as `startRestore`, so peek target == live target). Verified: peek opens at scrollTop 600 and commit lands at 600 (Bible), 700/700 (letters) — no jump. Gates: 2323 vitest (+3 helper tests) + typecheck + lint + smoke:ci green. **GOTCHA:** `window.__scrollPositions` is published in an effect (one render behind a fresh save) — fine in practice (a swipe targets a long-saved neighbor), and the peek rebuilds every render so it catches up.

**Page swipe peeks the REAL screen, rendered inert — pixel-identical, no spoof (2026-06-18).** Supersedes the inert-PREVIEW approach below. The owner reported the peek diverged from the committed page (different width, different text wrapping, and inline elements — section headings, study notes, annotation icons — "popping in" only AFTER release). Root cause: the peek was a **parallel re-implementation** (`PreviewLetterBody`/`PreviewWtlbBody`/`PreviewVerses`/`PreviewInlineVerses`) that dropped footnote bubbles + annotation icons, flattened sections, and capped content — it could never stay pixel-identical. **Fix: the peek is now the SAME screen component the nav arrows commit to, rendered inert.** `ScreenLayout` gained an **`inert` prop**: an inert clone renders ONLY its `.screen-scroll` content (no top-nav, no sticky nav, no nested pager) and claims NONE of the app-wide singletons — every singleton path (`__scrollEl` registration, `usePagerGesture`, the progress/scroll-notch effects, the tap-suppressor, `useMarkAsRead`, `window.__closeSheet`, the modal registry) is gated on `!inert`. Each reading screen (`LetterView`/`WtlbEntryView`/`ChapterView`/`BibleChapterView`) threads `inert`, gates its mount singletons + skips its position:fixed sheets/FABs, and its `pager.peek(side)` now returns `{ kind:'screen', el:<Self … inert/> }` (a same-collection neighbor) or `{ kind:'boundary', … }` (a reading-chain edge). `PagerPeek` (in `ui/components/pager-preview.jsx`, now ~110 lines, down from ~280) renders `desc.el` for `kind:'screen'` and the card for `kind:'boundary'`; **`resolveNeighborLetter` stays** (Letter/WTLB neighbor {id}→full corpus entry). **KEY INSIGHT (corrects the old "triple-mount corrupts the annotation scan" premise):** the document-wide `[data-hl-dom]` / React `HighlightableText` annotation passes do NOT corrupt across panes — the imperative pass keys its skip-signature PER-ELEMENT (`data-hl-sig` on the node) and neighbor letters/chapters always have UNIQUE `data-hl-key`s, so the scan paints BOTH panes in isolation. That's WHY the peek arrives already wearing every highlight, note icon, link, bookmark, footnote bubble, study note, and section heading — nothing is deferred to after release. Only the *singletons* must stay single (gated by `inert`); the visual paint is intentionally NOT suppressed. **CSS:** `scrollbar-gutter: stable` on `.pager-viewport .screen-scroll` reserves the scrollbar gutter on BOTH live + peek always, so a short non-scrolling page isn't ~10px wider than a long scrolling neighbor (that gutter delta was shifting text wrapping). **GOTCHA:** React 18.2 (the runtime) does NOT forward a JSX `inert` prop (it's React-19-only), so `PagerPeek` sets the HTML `inert` attribute imperatively via a callback ref (`el.setAttribute('inert','')`) — reliable in chrome108 (native) and jsdom. **`@ts-expect-error` on the 4 peek elements** is intentional: an inert clone passes only render-affecting props; interactive callbacks are omitted (it's `pointer-events:none` + HTML inert, so they can never fire). Preview-verified on the REAL corpus across all 4 screens: live vs peek `clientWidth` 739/739 + paragraph/verse width 672/672 (identical wrapping); peek paints a gold highlight + note icon BEFORE release with the live pane untouched (0 leaked marks); commit carries the highlight onto the live screen with NO double-marks; Matthew peek renders its inline study notes (79 of them) + Bible peek its section headings; 0 console errors. Gates: 2320 vitest + typecheck + lint(`--max-warnings 0`) + smoke:ci green. The spoof renderers + their tests are RETIRED. `BibleStudyChapterView` still chain-nav only (out of scope). GardenView keeps its bespoke pan/zoom.

**Visible finger-follow page swipe — ViewPager2-style (2026-06-17, commit `fb94463`).** [SUPERSEDED by the entry above — the gesture controller is unchanged, but the neighbor is no longer an "inert preview"; it's the real inert screen.] The reading screens already had a swipe, but it was an INVISIBLE release-only hard-swap. It's now a true finger-follow page turn on the **4 reading screens** (Bible chapters, Matthew study, Volume letters, WTLB entries): the page tracks the finger 1:1 and the prev/next page slides in, release past 35%-width OR a velocity flick commits, a short drag springs back; rubber-bands at the ends, honors `prefers-reduced-motion` (instant, like before). **Canonical gesture code (UNCHANGED):** `hooks/use-pager-gesture.js` (a pure `createPagerGesture` controller + thin React hook; exported `decideAxis`/`isCommit`/`rubberBand`/`velocityFromSamples`). `ScreenLayout` has an optional **`pager` prop** → wraps `{children}` in `.pager-track` (transform set/cleared imperatively; none at rest) + renders `.pager-peek` as an overlay sibling of `.screen-scroll`. **`use-swipe-nav.js` RETIRED** (no importers). Same-collection neighbor → full content; a reading-chain **boundary → a `.bottom-nav-card` peek** (e.g. "Previous Book · Genesis 50"). Preserves the NAV4 tappable-element + text-selection guards. **GOTCHA fixed:** `velocityFromSamples` ignores a <8ms sample window (degenerate/coalesced timestamps manufactured a huge "flick" that committed a tiny drag). **PREVIEW GOTCHA:** a backgrounded preview tab throttles `requestAnimationFrame`/`setTimeout`, so the cosmetic peek-clear + the settle commit can lag when you're not looking at the tab — a test-env artifact, NOT a bug (real swipes happen with the tab focused).

**Reflow-proof scroll restore — content-anchor (2026-06-17, commit `2a9ea07`).** Scroll-position restore now remembers the verse/paragraph (by `data-hl-key`) at the viewport top instead of a raw pixel offset, so your place survives a reflow (Text Size, translation, font, rotation). `captureAnchor` binary-searches the `data-hl-key` elements for the topmost visible one (skipping study-note / sticky chrome); `startRestore` prefers the anchor, **falls back to the saved pixel-y** (backward-compatible with legacy `{y,pct}` positions + a missing anchor). Builds on the existing cold-boot retry + content-visibility lift (preserves both). +4 vitest (incl. restore following a reflowed verse + the binary-search-skips-chrome case); 17 scroll-memory tests pass. (This had been finished-but-uncommitted WIP in the tree; reviewed + verified current, not stale, and shipped.)

**NEW search engine — MiniSearch, live behind a Settings toggle (2026-06-16).** The owner disliked Classic (FlexSearch) search; a second engine now ships ALONGSIDE it, selectable at **Settings → Search Engine** (default **Classic**; flip to **MiniSearch (new)** to A/B test). Both expose the identical facade + `{score,doc}` result contract, so `use-search`'s deep-link routing is UNCHANGED. **Canonical code: `src/search/**`** — clean ES modules IN eslint+tsc+vitest (unlike the Classic `assets/search.js` IIFE that had to be specially excluded): `engine.js` (facade → `window.VotSearchMini`, in bundle-e), `index-builder.js`, `tokenize.js`, `ref-parser.js`, `query-parse.js`, `synonyms.js`, `ranking.js`, `snippet.js`, `search-config.js`, `cache.js`, `recent-searches.js`, `search-data.js` (a thin accessor over the SHARED `window.VotSearchData` — single source of truth, NOT duplicated), `vendor/minisearch.js` (7.2.0, MIT, esbuild-bundled). Wins over Classic: **BM25 ranking + native fuzzy typo tolerance** (the headline gap — `sheperd`→`shepherd`) + **recent searches** (empty-state list; finally wires the long-dead `/clear history` command). **NARROW index (owner directive):** ONLY verse text + letter/entry name+body + bible-study chapters — NO footnotes, chapter-titles, section headings, study-notes, or cross-refs (one folded doc per letter/entry, not two). **Warm cache** `vot-minisearch-cache` (IDB): MEASURED cold build ~10s (MiniSearch insert over ~1M tokens from long VOT letter bodies; `buildDocs` itself ~55ms) vs `MiniSearch.loadJSON` warm restore **~0.36s (30×)** — the cache is load-bearing, not optional (the initial "no cache, phone is fast" idea was OVERRULED by the benchmark: a fast phone still can't index 32k docs in <10s; only caching the BUILT index fixes it). **Audited:** 112 search vitest (per-module + `engine.test.js` integration + `golden.test.js` quality suite + `cache.test.js`/`engine-cache.test.js` round-trips) + per-file coverage floors (engine/cache/index-builder/ref-parser); preview-verified on the REAL corpus (toggle persists across reload via StateStore-IDB; phrase `the lord is my shepherd`→Psalms 23:1 #1; typo `shephard`→133 matches; zero cross-corpus leak; warm restore 0.36s). Commits `4d80aa0`(scaffold)..`9691111`(engine)..`d246c21`(wire+cache), all pushed + gate-green. **GOTCHA:** to test a FRESH MiniSearch build in preview you must ALSO `indexedDB.deleteDatabase('vot-minisearch-cache')` (mirrors the Classic `vot-search-cache` gotcha) AND clear the SW (`for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)`) or it serves a stale bundle-e. **OWNER DECISION PENDING:** after the A/B test, if MiniSearch wins, retire Classic (delete `assets/search*.js`+`flexsearch.min.js`, reclaim ~138 KB off bundle-a's cold-boot path) — both kept for now for the comparison. **Deferred (v1.1, non-blocking):** fuzzy-corrected words aren't `<mark>`-highlighted in snippets (highlight uses the literal typed term — same as Classic); Clear-All doesn't yet wipe `vot-minisearch-cache` (regenerable + version-gated, low-risk); the `tools/smoke.js` Search step still only asserts render, not results.

**Blind-audit remediation ★ FULLY RESOLVED ★ (2026-06-04).** An independent 14-agent blind adversarial audit produced **`BLIND-AUDIT-2026-06-04.txt`** (59 actionable items; Section 1 = priority index, Section 3 = detail). Every actionable item is now **DONE, ADJUDICATED-with-reason, or already-SATISFIED** — **42 done + 14 adjudicated + 2 satisfied + 4 no-action, in 21 commits, all pushed + gate-green** — incl. the **Critical SEARCH ranking fix** (verses were buried under letter titles; the audit's "remove the ref field" was insufficient — real fix is index-coverage + a phrase boost + AND-search, proven on the REAL corpus via preview), the **P0 JRNL-1** journal background-kill durability fix (synchronous localStorage draft + timestamp-guarded reconcile), and the **P0 STORE-1** cross-tab clobber fix (BATCH 13): the PWA's whole-store `'v'`-blob flush let a 2nd tab silently destroy a sibling's committed records, so the 8 precious stores now flush via a per-store `navigator.locks` read-merge-write — a 3-way merge (`store-merge.js`) against a `_base` ancestor that distinguishes a delete from a never-seen sibling add. Chosen OVER the audit's "per-record keying schema change" (higher-risk): the merge lives in the ONE `CachedStore._save` site, leaving the non-merge hot path byte-identical. And **TEST-1** (BATCH 14): the Android v3 backup DRIVER (the only-backup path on the primary platform — slices each blob into ≤512 KB FileReader reads, base64s at the bridge boundary, reassembles frames) had ZERO tests and sat outside coverage inline in `SettingsScreen.jsx`; extracted to `utils/backup-android.js` (a covered scope) + a 15-case round-trip through a fake-native bridge asserting byte-identity across the off-by-one frame boundaries (`runV3AndroidExport`/`classifyV3ImportBegin`/`v3AndroidImportEntries`, globalized via `_entry-d.js`). **READ THE `HANDOFF (READ FIRST)` BLOCK near the top of `BLIND-AUDIT-2026-06-04.txt`** for the done/remaining split, the verify→prove→gate method, and the load-bearing GOTCHAS (e.g. to verify search in preview you must ALSO `indexedDB.deleteDatabase('vot-search-cache')`; jsdom has no `navigator.locks` so `vitest.setup.js` now ships a mutex shim; the audit's own fix recs can be incomplete/wrong — re-derive + prove). The remaining cluster then landed in one "finish the entire audit" pass (BATCH 15, commits `4d2db94`..`3cf2a88`): **11 more DONE** (BAK-1 fail-safe media REPLACE · STORE-2 orphan-sweep cutoff · STORE-4 bounded write-retry · TEST-2 SW runtime · TEST-3 update-prompt · TEST-4/5 coverage · SHELL-3 doc · JRNL-3 waveform downsample · BLD-1 deploy gate · **CORP-2** validator cross-ref RESOLUTION pass — which itself **caught + fixed a 2nd CORP-1-class dead link** in the holy-days.js footnote clone, CORPUS_VERSION c7→c8), **10 ADJUDICATED** with reasoning (BAK-3, TEST-6, PERF-4/5/6, ANN-1, SHELL-4, NTV-1 [GOTCHA-1: the "no recording cap" premise was wrong — the JS sheet auto-stops at 5 min], BLD-2/5 — bounded-cost perf on load-bearing render code, or net-negative/device-gated), **2 already-SATISFIED** (BAK-5 by TEST-1, JRNL-5 by JRNL-1). **READ THE `HANDOFF (READ FIRST)` BLOCK near the top of `BLIND-AUDIT-2026-06-04.txt`** for the full done/adjudicated/satisfied split + the load-bearing GOTCHAS (e.g. jsdom has no `navigator.locks` so `vitest.setup.js` ships a mutex shim; the audit's own premises can be stale/wrong — re-derive + prove). **No audit work remains.** Optional non-audit follow-ups: the device-walk verifications for the device-gated items (NTV-1 native backstop; the standing N2.x / U1 hardware walks in `tools/n1-smoke-walk.md`).

**The app is feature-complete and shipping.** One JS codebase runs as the Android APK and as a desktop PWA (live + installable + full-offline at https://votreader.github.io/app/). Every quality/uplift phase is closed — **Q3–Q8, N1, NK, P6–P11, W1–W9, U0–U22, N2** (one-line index below; full detail in **HISTORY.md**). **~2119 vitest** tests / 92 files (counts drift — verify, don't trust); CI green across build + lint (`--max-warnings 0`) + typecheck + vitest+coverage(floor) + Kotlin `testDebugUnitTest`+jacoco + headless 12-screen smoke. Pre-commit/CI also gate check_balance, schema-validate, corpus-version, CSP-hash, and the ≤800-line app.jsx canary.

**THIRD audit — 16-agent fleet (2026-06-06/07) ★ FULLY RESOLVED (tail closed 2026-06-07b) ★.** A fresh 16-agent Opus fleet (one per subsystem, code-only, self-verifying) re-rated the app **8.2/10** → **`FLEET-AUDIT-2026-06-06.txt`** (78 findings P0–P3; HANDOFF block at the top — READ IT FIRST). Remediation in 24 commits: **25 DONE + 3 ADJUDICATED, EVERY P0 + P1 + P2 closed** (plus valuable P3: SRCH2/SRCH3, BAK4, NAV4, NAV2, APP2, CORP2) — Theme A (Studies + alt-translations now cache OFFLINE + recover from load failure; search cache busts on content-only corpus edits via a new CORPUS_CONTENT_VERSION gated to CORPUS_VERSION), STOR1 (cross-tab annotation resurrection — `subMerge` in store-merge), NAV1 (Android hardware-back now consults `modalRegistry`), BAK1/BAK2 (Android import media-before-stores order + missing-size parity), PERF2 (journal media object-URL LRU — OOM fix), APP1/ANN1/ANN2 (keyed NoteStore re-render + multi-verse note paints 1 icon + "remove highlight" discloses note deletion), CORP1 (dup-id validator), TEST1, SEC1/STOR5/BAK6. Two findings were re-derived as **audit FALSE-POSITIVES** (STOR2 — Clear-All deletes whole IDB DBs, not a merge path; NAV3 — the `__goSearch` re-bind is the intentional fresh-closure bridge). **Session 2 (2026-06-07b) then CLOSED the ~49-item tail**: **13 more DONE** (BLD1 minify-fidelity gate · BAK3 import-count verify · BAK5 export-abort · SEC2 generic import errors · ANN4 note-icon normalize · ANN5 elementsFromPoint test · TEST3 deterministic-clock · TEST5 no-locks-fallback test · CORP6 footnote-render CI gate · BLD2 widened deploy gate · NTV3 Garden-cache wipe on Clear-All · PERF4 content-visibility · SRCH4 synonym snippet highlight; 8 commits, all gates green, PERF4 preview-proven on Psalm 119) + **~30 ADJUDICATED-with-reason** (each re-derived against current source by a per-cluster agent then verified — net-negative/critical-path, false-premise, latent-only, by-design, or benign-INFO) + **4 already-DONE/subsumed** (SW3 by SW1, NTV2, TEST2, plus the session-1 false-positives). **audit is now FULLY CLOSED** — every fleet-audit finding is DONE or adjudicated-with-reason. After the owner cleared them (no budget device; app isn't render-intensive), the last 3 resolved too: **ERR3** done (AppShellOverlays + AppShellSheets each wrap their return in `<ErrorBoundary fallback={null}>` so a chrome crash vanishes + logs instead of nuking the app — NO app.jsx change, still 798/800), **NTV1** done (`restoreAudioModeIfActive()` in onRenderProcessGone + onDestroy, guarded on MODE_IN_COMMUNICATION; Kotlin suite green), and **PERF1 adjudicated** (won't-do: its cold-boot win is mainly for slow devices not in use + it's the riskiest remaining change — net-negative for a marginal gain; plan retained in the tracker if a budget audience ever appears). Optional owner-side only: device confirms for NTV3 + NTV1, and the standing device walks (`tools/n1-smoke-walk.md`). **Full per-item disposition: the `FLEET-AUDIT-2026-06-06.txt` 2026-06-07b PROGRESS LOG entry.** Method per item: re-derive→fix→test (RED-first repros)→gate→push. CORPUS_VERSION is now **c9** (SW1 added bible-studies.js + the bible-`<code>`.js translations to the corpus cache; the version gate + the search-cache signature now cover them).

**Architecture quick-facts.** `function App()` in `src/app.jsx` (≤800-line canary gate — the one line count worth trusting, because it's enforced). ~200 ES modules spread across `hooks/`, `ui/components/`, `ui/screens/`, `ui/sheets/` — **don't trust an exact module/line/file count quoted in any doc; they drift every commit, so `ls`/`wc` the tree when you need a number** (CQ3). All 53 screens dispatch from `buildScreenRoutes(deps)` in `src/ui/screen-routes.jsx`. **8 bundles** in `dist/`: `bundle-a` ~593 KB raw (react/react-dom + small data + the shared `search-data.js` index source — critical path; the Classic engine + flexsearch vendor were retired 2026-07-02, MiniSearch in bundle-e is THE engine); `bundle-a-bible` ~4.6 MB / `bundle-a-matthew` ~492 KB / `bundle-a-vot` ~2.2 MB (lazy corpora via `__load*Corpus()`, **minified — PF1**); `bundle-b` ~227 KB (stores/hooks/journal/scripture-resolution/platform-bridge/StorageHealth/SW/DiagnosticLog); `bundle-c` ~16 KB (renderer); `bundle-d` ~302 KB (most screens/sheets/utils incl. backup.js/App/AppShell); `bundle-e` ~54 KB (lazy Settings/Search/Garden screens, injected on first nav via `__loadScreensE()` — **PF6**; precached in CORE_ASSETS for offline). b/c/d/e minified (U2), lazy corpora minified (PF1); **`--target=chrome69` is mandatory** (Permanent Rule 6). Cold-boot blocking path (a+b+c+d) ≈ 1.40 MB (PF1 cuts the lazy corpus parse, not this path).

**AUDIT-PLAN execution — 8.5 exit bar MET; AUDIT-PLAN FULLY RESOLVED + WebView floor lifted chrome69→chrome108 (2026-06-03).** A SECOND deep adversarial audit (15 subsystem agents + 15 independent verification agents, every finding re-checked against source) rated the post-UPLIFT app **7.5/10** and produced **`AUDIT-PLAN.txt`** — the canonical tracker (≈108 verified items, P0–P3) for the 7.5→8.5+ remediation. **READ THE `HANDOFF` BLOCK AT THE END OF AUDIT-PLAN.txt FIRST** (context + gotchas + the PILE A / PILE B remaining split). Waves 1–4 + PF1 + the overnight batch met the 8.5 bar; a P2/P3-TAIL close-out batch then landed (CQ3, B2, PF2 [bundle-a −153 KB], PF5 [Garden LRU], A7, F6, UX7 [tab-undo], UX8; B3/B7/A6/UX9 adjudicated). Owner UX calls: APPROVED UX3/UX4/UX5/UX10/UX7/E5, **SKIP UX6 — do NOT touch the welcome splash.** **PILE A BATCH landed + CLOSED 2026-06-03** (see the newest AUDIT-PLAN.txt PROGRESS LOG entry): **12 DONE** — UX5, UX4+UX10, E5, T7, E4, F3, P7pwa, F1+F2 (keyed 176→1 re-render), CQ6, T5 (Kotlin), plus the two owner-approved visible items: **UX1+UX2** (`951d468`, Surprise-back→Home + clear the search anchor so result-scroll restores) and **A1+A5** (`17f6348`, note icons rendered INLINE at the highlighted-phrase end on the React verse path — fixes the latent NotFoundError; upgraded past the audit's verse-end/scope-only options per owner) — each source-verified first, gated, pushed, preview-verified; **3 ADJUDICATED** — J7 (premise inactive: no save-while-recording trigger exists), CQ5 (app.jsx canary + checkJs flood ⇒ net-negative), PF4 (naive null reverts Bible to NKJV ⇒ focused session). **PILE A is fully CLOSED** — the one deferred item, **PF6** (`0ca8ce4`), also landed: Settings/Search/Garden code-split into a lazy `bundle-e` (54 KB), injected on first nav via `__loadScreensE()`; bundle-d 365→302 KB; App() folds the corpus + bundle-e subscriptions into `useLazyBundles()` (777/800); preview + headless smoke:ci verified. **PILE B CLOSED**: **UX3** (`055b674`) + **A4** (`6a3467a`, per-container annDomSig fan-out skip; offset-table reuse adjudicated) DONE; **PF3 DROPPED** (no jank on real devices; windowing risks the load-bearing scroll-to-verse/scroll-memory path for a theoretical gain — `content-visibility:auto` is the cheap fallback now the floor allows it) and **UX9 ADJUDICATED** (defunct inverse-set allowlist; per-tab resume = a tab-schema redesign not worth the risk for a recoverable nit). **WebView floor LIFTED chrome69→chrome108** (`1a7ae7f`, branch `chore/lift-webview-floor`): target bumped on build:b/c/d/e/css + the corpus minify, now-native boot polyfills removed (CSP 9→8 hashes, CACHE_VERSION rehashed), Permanent Rule 6 rewritten; `npm run build` + `smoke:ci` + live-preview verified; the vot_api28/WV69 emulator now black-screens BY DESIGN. **AUDIT-PLAN fully resolved.** The Kotlin **N4/N6/N7/N8** are DONE (`2520f5b` on branch `fix/audit-n4-n6-n7-n8-kotlin`) — code-read + forced Kotlin recompile + `:app:testDebugUnitTest` + vot_api28/WV69 emulator (getZoomScale()==1 across a forced restoreState cycle; two sequential takeScreenshot both succeed = single-flight releases). **N6** keep rules are now VALIDATED under R8 (**N2.1b** set `isMinifyEnabled=true` — release minified, APK 27.7→20.1 MB; mapping.txt confirms the bridge methods + `JsEvent$*` + `BoundedLogTree$LogEntry` survive R8 unrenamed; the minified release boots + renders on the new `vot_api34`/WebView-113 emulator); **N8** retry-view + **N7** true concurrency aren't stageable on a headless debug emulator (code+compile-verified there). NOTE: the "DEFERRED FOR OWNER REVIEW" list below is a PRE-BATCH snapshot — most of it (A1+A5, E4, E5 pt2, F1+F2, UX1–UX4) has since LANDED; kept for history.
- **Wave 1 — P0 (data loss + reachable crashes):** **SC1** (`698c95b`) `typeof`-guard the WTLB `{{nav:}}` bare-`BOOKS` ReferenceError (+ same-class app.jsx site). **J1/J2/J4** (`f0f7eab`) the journal editor flushes on `pagehide`/`visibilitychange:hidden` + saves a media insert IMMEDIATELY — closes a real silent-data-loss window on the Android background-kill path (debounced edits + freshly-added photo/voice memo were lost + the blob orphaned); +`JournalEditorScreen.test.jsx` (4 cases, real store, non-vacuous). **E1/E2/E3** (`00912b1`) a failed lazy-corpus load now shows a **Retry** affordance (was a permanent "Loading…" dead-end) + logs it, and a global `window.onerror`/`unhandledrejection` now feeds DiagnosticLog (the only failure trace under no-telemetry). Browser-verified in preview.
- **Wave 2 — search cluster (the lowest-rated subsystem; the engine `assets/search.js` is OUTSIDE eslint/tsc — though SRCH-COV later pulled it INTO coverage at 67%/72% via an eval→import test load + per-file floor):** **SR1/SR2/SR3 + SR8** (`5c4e051`) removed a dead `heading`-field throw that fired on EVERY query, and fixed multi-word search. KEY FINDING: the audit's OWN recommended fix (`suggest:true`) was **WRONG** — disproven against the vendored FlexSearch 0.7.41 (still returns `[]`); the real fix is per-term **OR union**. New `src/data/search-engine.test.js` loads the REAL engine over a fixture (was 0% tested; the SR2 case was RED under suggest, GREEN under per-term-OR). **SR5** (`29778ec`) `SearchScreen` loads all corpora before building the index (was caching a near-empty index on a cold search-open). **SR4** (`3a4873e`) wired the dormant scripture **synonym expansion behind a "Synonym Search" settings toggle** (default on, owner-approved), slightly trimmed (dropped the over-broad generics `lord`/`god`/`father` from the name groups). Real-corpus preview: `pastor`→shepherd verses (1 Pet 5:2, Heb 13:20), `agape` 0→400; exact matches still rank first.
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

**STILL OWED — manual device walks** (real hardware; checklist in `tools/n1-smoke-walk.md`; nothing blocking): U1 import file-walk · U7 Garden Ultra-tier crawl · U9 thumbnail-capture · Garden zoom reset on Android. (SAF v3 export/import + cancel was EMULATOR-verified end-to-end on vot_api28 / WV69 = the Android 9 floor — see the backup-streaming bullet; a real-hardware confirm is optional polish, not blocking.) **N2 device-walk queue** (verified-good but touch device-tuned code): N2.2 transient-exclusive audio focus · N2.3 volumeControlStream · N2.4 Garden stream-to-disk (PROFILE-FIRST) · N2.5 haptic API-26-28 fallback. (**N2.1b** enable R8 minify — DONE 2026-06-03: release minified, N6 keep rules validated on the `vot_api34`/WV113 emulator; `isShrinkResources` now also enabled + verified on vot_api34/WV113, APK 20.10→19.98 MB.) **W10 accessibility** — **W10-lite DONE 2026-06-03**: `prefers-reduced-motion` (global `@media reduce` neutralizing animations/transitions; the app had none) + `aria-label` on the glyph-only icon buttons whose accessible name was a bare symbol (welcome ✕ in AppShellOverlays; the ‹ "Back" buttons in AnnotationActionChip ×2 + NoteSheet). The baseline was already strong (125 aria-/role, global `:focus-visible`, `role=status`+`aria-live` toasts, alt text). The WCAG contrast audit was RUN (2026-06-03): the default dark theme is AA-clean (gold 12:1, body 21:1; only the rarely-seen "Clear All" deep-red dips to 3.86, still ≥3:1 UI); light-theme `--link-blue` was darkened `#4a90b8`→`#387493` to clear AA-normal (3.15→4.60:1). The remaining gold/accent variants that sit between 3 and 4.5 are large-text/UI roles (3:1 conformant) and were left as-is (owner's palette). **W10-lite COMPLETED 2026-06-03 (this session)** with the remaining audience-matched items: **WL1 — a global Text Size control** (Settings → Text & Translation selector: Standard/Large/Larger/Largest = 1.0/1.15/1.3/1.5×; a `--font-scale` root multiplier scales every rem/em size; `journal-styles.js` (87) + `HighlightsScreen.jsx` (14) px→rem so those injected-CSS screens scale too; StateStore lsShim + the index.html boot script apply the persisted scale pre-mount so larger text never flashes in at the standard size; `da050c8`), **WL2c** forced-colors highlight-color preservation (HC mode), and **WL4** a touch-target audit (app already AA/24px — color dots/style btns/journal/nav all clear; the lone sub-24px control, the storage-banner ✕, got a 44px hit area via an `::after` overlay; AA targets deliberately NOT pushed to AAA 44px; `0cd9075`). Each preview-verified (set→live→persist→cold-boot; 0 horizontal overflow at 375px/1.5×) + smoke:ci + 1878 vitest. Canonical detail: `PLAN.txt` §W10-LITE. Full W10 (TalkBack/VoiceOver device sweep, modal focus-traps) remains optional.

**Operational facts (load-bearing).**
- **Debug APK** at `D:\VOTReader-build\app\outputs\apk\debug\app-debug.apk` (relocated off the OneDrive junction via `vot.buildDir`; NOT `app/build/...`). **Never** `Remove-Item -Recurse` the C: junction — it follows into D: and deletes real files. ([[onedrive-build-lock]])
- **CORPUS_VERSION** needs a manual bump on any `books.js` / `matthew.js` / VOT-corpus edit, or web PWAs keep stale cache (`tools/check-corpus-version.js` enforces). ([[corpus-version-bump]])
- **adb** at `C:/Users/corbi/AppData/Local/Android/Sdk/platform-tools/`; test device `51071FDAP000C8`; emulator AVD `vot_api28` (API 28 / WebView 69 = the Android 8/9 floor). **gh** at `C:\Program Files\GitHub CLI\gh.exe` (authed as VOTReader).
- **Preview clean-slate** (load fresh bundles past the SW cache): `(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload();})()`
- **`VOTReader/VOTReader-studio` is a redirect-only repo** (2026-06-19), NOT the code. After the code repo was renamed `VOTReader-studio`→`app`, the old Pages URL `votreader.github.io/VOTReader-studio/` 404'd (GitHub carries renamed *repo* URLs but not project *Pages* URLs). This repo reclaims the old name and serves `index.html`+`404.html`, both JS/meta-redirecting every path → `votreader.github.io/app/`. Side effect: reclaiming the name consumed the rename-alias, so `github.com/VOTReader/VOTReader-studio` now shows this redirect repo instead of 301'ing to the code at `/app`. Local clone: `D:\_votreader-studio-redirect` (disposable). The live code + Pages deploy is `VOTReader/app` only.

---

## Wave 0 UX "promise-keeping" batch — 30+ fixes, 11 commits (2026-07-22, on main `099c5ae..3b7751e`)

First implementation wave of the UX Excellence Plan (9-agent audit: 2 on-device emulators + 7 source auditors; plan + evidence at `D:\VOTReader-build\ux-audit\UX-EXCELLENCE-PLAN.md`, 14 P1 / ~45 P2 / ~30 P3, 12-item protect list). Executed by 11 parallel coder agents on disjoint file scopes, centrally integrated/gated/committed. **Gates at ship: vitest 2921/2921 (165 files) · tsc clean · eslint 0 errors 0 warnings · Kotlin 195+ tests 0 failures · bundle rebuild · check-apk-assets (12 runtime-injected assets survive) · smoke:ci PASS.** Every item RED-tested or static-guard-pinned; protect list (back dispatcher, scroll memory, pager, auto-scroll, ConfirmStrip, journal data safety, reading typography) verified unregressed.

- **`099c5ae` native:** `writeTextToUri` streams via `openOutputStream(uri,"wt").writer()` (no full-payload byte[] copy; fail-clean mirrors finishV3Export) · haptics route through `dispatchVibrate()` with `VibrationAttributes(USAGE_TOUCH)` on **API 33+** (the two-arg overload is since=33 — the improvement batch's API-30 premise would NoSuchMethodError on 30–32) · `onReceivedHttpError` logs host+status for Garden-allowlisted hosts only (the interceptor-null degrade path was silent; gated via `gardenCache.hostAllowed` so fetch/log gates can't drift).
- **`384421c` css:** `.jrn-milestone-toast` rules recovered verbatim from git archaeology (5d518a4, dropped by 2db70f5 — the toast was an unstyled never-dismissing div) · `.ann-hint-pill` click-through (`pointer-events:none` container, `auto` on ✕ only, `user-select:none` — long-press selected the pill's own text) · gold `:focus-visible` ring extended to role=tab/switch/radio/slider/combobox + projected onto the settings-switch track · `.sr-only` utility added (app had none). Static guard `app-css.test.js` pins every showToast className to a shipped rule.
- **`55dff5a` coach-mark (P1-1):** dismissal persisted across cold boots via new `AnnHintDismissedFlagStore` (buildFlagStore precedent, IDB v6→v7, hydrated pre-render; window flag kept as test-host fallback).
- **`c3df5e3` journal:** P1-6 recording sheet self-registers `requestDiscard` as its registry dismiss (back/Escape mid-take no longer destroys the take) · P1-7 prune-on-exit removes blank-title+empty-content entries (`JournalStore.remove` gains `skipStats`; pagehide deliberately untouched) · P1-5 milestone stats/toast fire on first non-empty save (localStorage handoff marker), not New-Entry tap · timestamps emit "4:53 PM" · ErrorBoundary `onCatch` → AppShellSheets toasts "That panel hit a problem and closed — your data is safe." · also: dead bare-string `showToast('Could not save that image.')` fixed + StorageHealth gated on quota-shaped errors only (decode failures no longer flip READONLY) + `toast.js` warns on id-less calls + ErrorBoundary panel shows humane copy (stack stays in DiagnosticLog).
- **`261cb82` tabs:** P1-8 describeTab cases for all 10 personal screens (no more all-"Home") · cap 999→50 with toast feedback (legacy >50 sessions restore intact) · scrollPositions LRU-pruned at 100 (content-anchor restore invariant pinned).
- **`08117e8` settings:** P1-9 toggles get role=switch/aria-checked/aria-label (23 switches incl. 4 NavChips the audit missed) · copy names the real `.votbak` artifact · native alert/confirm purged from data-critical paths (import-overwrite → in-app sheet with destructive semantics intact; clear/export → toasts; "See console for details." gone) · wipe + import-confirm dialogs self-register with the modal registry (were in NEITHER dismissal system — back navigated away underneath the type-DELETE dialog).
- **`8dc3a32` selection toolbar:** P1-11a role=toolbar + distinct labels/aria-pressed on style buttons + named swatches · **P1-15 (owner-reported, emulator-confirmed): selection froze page scroll, so passages longer than one viewport were unhighlightable** — ▲/▼ nudge buttons (visible only during active selection) scroll the nearest scrollable ancestor ~60% viewport via the placement engine's exact scroll-target path without clearing the selection. Nudge look is a scoped `NUDGE_STYLE` block — migrate to app.css at token consolidation.
- **`b5633fc` nav:** P1-12 History onSelect routes through navigateToLink origin capture (Back returns to History) · P1-13 fromSearch consumed on index back branches (no more teleport into stale search sessions) · matthew-idx back matches bible-idx's parent-hub chain · sticky genreId cleared on non-genre entries. Dispatcher branches extended in place only.
- **`0de4b6f` search:** `useImeHideBlur` (exit no longer costs 3 back presses) · SrchCard renders registry labels (NKJV-R, never raw ids) · honest "400+ matches" at cap · recents individually removable (ConfirmStrip) · role=status in-flight indicator · type=search · engine-failure copy humanized.
- **`623c3f0` screens:** ChapterIndex back names the real destination (tooltip + TalkBack, one resolved string) · current-chapter marker decoupled from the reading-dot setting · Library empty tiles say how content happens · onboarding CTA "Begin Reading" · Surprise FAB captioned + named.
- **`3b7751e` garden:** image failure gets a "Try again" pill (evicts the poisoned preload entry + key-remounts; repeatable) · aria-labels on all icon-only buttons + jump input.

**Deviations/follow-ups recorded:** (1) haptics gated at API 33 not 30 (see `099c5ae`); (2) python `esprima` package installed on this machine — `check_balance.py`'s naive paren counter false-positives on `books-restored.js` (scripture text with an unbalanced paren in a string; the file parses fine) and the gate is designed to fall back to a real esprima parse; (3) the pre-commit hook's vitest step flaked 3× during the commit series (full suite green standalone immediately after each flake — likely resource contention; flake not yet identified); (4) agent follow-ups parked for later waves: `AppShellOverlays` same onCatch wiring, BibleStudyIndex same reading-dot decoupling, Library index `setNavOrigin` dead-press quirk, `use-navigate-to-link` genreId clear, NUDGE_STYLE migration, legacy >50-tab trim decision. **Owner decisions D1–D6 still open** (gate Waves 1–2); P1-2/P1-3/P1-4/P1-10/P1-14 and the remaining P2s are Waves 1–3. **[RETIRED 2026-07-30 — do not resurrect from this line.** The "D1–D6" here was never written down as an enumerated list anywhere in the repo; the only real D1–D6 is the UPLIFT D-bucket, which is fully resolved (D2/D5/D6 done, D1/D3/D4/D8 skipped with reasoning, see the 8/10 UPLIFT sections below). Owner confirmed he does not remember the list and considers this an old wave: *"I don't remember the list but pretty sure that's a really old wave, you can retire it."* It had been sitting in CLAUDE.md as a live blocker nobody could name. The Wave 1–3 P1/P2 items named in this same sentence were separately superseded — the 07-28 backlog run and the 07-29/07-30 sessions cleared the reachable work.**]

---

## External deep-review remediation — 13/13 closed: APK dead-asset purge, Kotlin hardening, persist debounce (2026-07-22, working tree — coordinator commits)

An external deep review (build-output forensics + source review) produced a findings list; a second AI independently adjudicated each finding against current source; the confirmed items were implemented and verified the same day. Canonical tracker: **`REVIEW-FIX-2026-07-22.txt`** (HANDOFF block at top; per-item finding→fix→verification). 10 DONE + 3 ADJUDICATED-no-action.

- **Packaging — the APK shipped ~51 MB of dead assets (`app/build.gradle.kts`).** The signed APK carried the whole dev ES-module tree `assets/src/` (283 files incl. 77 `*.test.*`, unminified JSX), four root files already concatenated into `dist/bundle-a.js` (`app.css`, `react.min.js`, `react-dom.min.js`, `search-data.js`), `service-worker.test.js`, and a Windows shortcut `.lnk`. Fix: `androidResources { ignoreAssetsPatterns += … }` (AGP 9 DSL) — with two recorded gotchas: supplying any pattern REPLACES aapt's default ignore set (defaults re-declared verbatim first), and patterns match entry BASENAMES case-insensitively (so `app.css` can't hit `dist/app.min.css`). Files stay in the repo (assets/ is shared with the PWA) — purely a packaging exclusion; both `.lnk` files deleted. **Verified with a real Gradle build:** `assembleDebug` APK = exactly 36 asset entries, ~11.3 MB, zero from the excluded set; dist/, index.html, service-worker.js, fonts/icons/images retained.
- **Kotlin hardening (each RED-first; suite 179 → 189 tests, 0 failures).** `StorageManager.readUriAsBase64` trusted the provider-declared size then read unbounded → lying-provider OOM; now routed through the existing `readBounded(input, max)`, over-delivery fails as `too_large` (regression test with a lying provider). `StorageManager.finishV3Export` leaked the partial backup when flush/close threw at commit; the exception path now `deleteDocumentQuietly`s too (test forces a flush-time throw). `GardenImageCache.download` enforced `MAX_DOWNLOAD_BYTES` only against declared Content-Length — chunked (-1) responses read unbounded; new `readCapped()` streams with a running counter and fails closed (cache miss) past the cap (tests: chunked over-cap rejected, under-cap intact). The back-press contract compared `result != "\"true\""` only — a JS boolean-true refactor would silently break it (app quits on consumed back presses); extracted `MainActivityLogic.isBackPressConsumed` accepting both quoted and unquoted true (6 boundary tests). Splash could stick forever on a main-frame load error; an `onReceivedError` override releases the hold for main-frame errors only (safety hatch — bundled assets make it near-impossible). Double `saveToFile` clobbered `pendingExportContent` (first picker would write the second export's payload); the field now doubles as the in-flight guard — re-launch → `error:busy`, launch wrapped in try/catch → `error:launch_failed`. The screenshot pipeline recycled bitmaps only on the happy path; a finally-block now recycles each distinct allocation (identity-compared — `createBitmap`/`scale` may return the source).
- **Web (vitest 2758 → 2787 / 2787).** CRITICAL INVARIANT 1 (use-tabs cached setter identity) had zero tests — only a console.error probe guarded it, and `use-nav.test.js` falsely claimed useTabs was "covered by its own tests". New `use-tabs.test.js` (14 tests: referential identity across rerenders/state updates/tab switches, probe silence, behavioral correctness), mutation-tested (identity assertions fail when the ref-cache is bypassed); false comment corrected. Every search keystroke triggered a full vot-state JSON.stringify + IDB put + LS shim write (searchQuery rides the full persist chain, no debounce); fixed at the use-persisted-state sink with trailing-edge 250 ms coalescing (latest-union-wins — safe because `StateStore.set` is full-replacement with no live readers), guaranteed flush on visibilitychange→hidden/pagehide/beforeunload/unmount, and a boot-critical bypass for theme/fontStyle/fontScale (read synchronously by the index.html boot script). Deliberately NOT in `CachedStore._save` — protects the hydration state machine and the `navigator.locks` 3-way merge. 15 new tests; all hydration/rebase/merge suites green.
- **ADJUDICATED — no action (rationale in the tracker):** `v3ImportReadChunk` "no ceiling" (overstated — allocation is `minOf(maxBytes, importFrameRemaining)` and the sole caller passes a constant 512 KB chunk); `use-reading-dwell` "untested" (wrong — 10 tests exist; the identity-churn do-not-useCallback invariant accepted as documented risk); device-walk deferrals + restored-names v2 (owner-signed-off deferrals, not defects — structural note: app/src has no `androidTest` source root, which is why device walks can't be absorbed into an automated harness).

---

## Data-faithfulness restoration — occasion lines + full HTML↔app audit (2026-06-11, on main)

Owner spotted (device screenshot) that "Give Thanks Without Ceasing, and Be Set Apart" was missing its "(Regarding Thanksgiving)" header line, and asked to verify ALL letter data is faithfully copied from the downloaded website HTML. Two commits.

- **The "(Regarding …)" occasion line — restored to ~40 letters (`9c00a35`, CORPUS_VERSION c9→c10).** The 4th letter-header line (a parenthetical occasion note) existed on the site but was unpopulated for ~40 Format A letters. The renderer already had a `noteLine` field (only volume-two used it, 3 entries, one malformed without parens). Restored via a structure-independent HTML scan (`tools/extract-occasion-lines.py`): 39 `noteLine`s across Volumes 1/3/4/5/6/7 + Flock + Timothy, the volume-two paren fix, the volume-seven "Woe…" forLine/noteLine scramble (occasion line was wrongly stuffed in `forLine`), letters-flock "Fixed" as a cross-collection `metaAddendum` to V5 "Trees of the Field", and volume-one "Death and Awakening"'s occasion footnote `[1]` (already in data but orphaned) re-referenced via a `noteLine` segments array. LetterView: `noteLine` accepts a string OR a segments array (renders via `<Segments>` so a header line can carry a footnote bubble). +validate-schemas scans noteLine fn segments. `7f278c6` tidies the validator.
- **Full faithfulness audit (`83857c7`, CORPUS_VERSION c10→c11).** Deterministic HTML↔app diff of all 354 Format A letters — `tools/_audit-dump-app.mjs` (eval each data file in a VM sandbox → normalized JSON), `tools/_audit-extract-html.py` (same fields from the site HTML), `tools/_audit-compare.py` (diff by slug). Audited headers / bodies / footnotes / NKJV text / relatedTopics / addendums / prev-next. **The corpus is faithful** — all letters present, all bodies complete, all 558 scripture footnotes carry NKJV text, 0 broken nav, footnote counts app≥HTML everywhere — EXCEPT two real losses, fixed: (1) **all 14 Letters-from-Timothy headers were blank** (date/from/forLine ""), restored incl. the Timothy attributions ("Wisdom Given to Timothy", "A Vision/Prayer/Parable Given to Timothy", "An Exhortation from Timothy", "The Interpretation of the Vision Given to Timothy"), the two addendums (Humble Yourselves → V7 "The Alarm of War"; Stealing → external "The True Baptism"), and The Shadow of The Almighty's attribution footnote (orphaned → re-referenced via a `from` segments array); (2) **volume-seven "Recompense" had dropped its entire opening "Dream of a Coming Storm Given to a Brother in Christ" (11/25/07)** + the "The Interpretation of the Dream Spoken to Timothy" spoken line — restored the dream as a `sectionIntro` + the spoken line. LetterView: `from` now accepts string-or-segments (mirrors noteLine); validate-schemas: from/spoken/forLine/noteLine may be string-or-segments and their fn segments count as references.
- **Verified:** live-preview confirmed (Thanksgiving + Death and Awakening footnote sheet; Tithing's restored header; The Shadow's footnote bubble→sheet; Recompense's dream); all gates green across both commits (**2170** vitest, check_balance, schema 0-errors, lint 0/0, typecheck, build, corpus-version gate); CI + PWA deploy green.
- **Format B (WTLB + The Blessed) audit (`c955289`, c11→c12).** Extended the diff to the 360 paragraph-based entries (`tools/_audit-fmtb-*`): WTLB Part One (149), Part Two (203), The Blessed (8) — **all present + complete** (median body ratio 100%, lowest 91% = stripped scripture-ref/attribution markup not missing prose, 0 broken prev/next; "Distribution"/"Back Cover"/page titles correctly excluded as non-entry back-matter). Sole divergence in the whole collection: one clarification footnote on WTLB One "YAHUWAH Is One; And His Word, One" — "The Letters[1]" → "'The Letters' refers to The Volumes of Truth", the only footnote across 360 entries (Format B has no footnote mechanism). Per owner call, included as a trailing italic note paragraph; preview-verified it renders.

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

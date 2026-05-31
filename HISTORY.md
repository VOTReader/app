# HISTORY.md — Landed work log

Append-only record. Read when you need context on past decisions. Not required for routine work. For the current briefing, see CLAUDE.md. For deep system reference, see ARCHITECTURE.md.

---

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

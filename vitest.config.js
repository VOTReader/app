/* Vitest config (Q5.1).
   ─────────────────────
   Test runner for the typed Q4 surfaces (hooks + stores + utils).
   Q5.1 is infrastructure-only: config + setup + ONE trivial useRefMirror
   test that proves the harness works. Real test coverage starts in Q5.2+
   (_validateTabState first per the pinned priority).

   - environment: jsdom (window, localStorage, document available)
   - setupFiles: vitest.setup.js (React-as-global + window.__* stubs)
   - include: any *.test.js / *.test.jsx alongside source files

   Coverage gate is NOT set yet — Q5.2 (first real test) locks the
   initial value per the regression-gate principle. See PLAN.txt. */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    include: [
      'app/src/main/assets/src/**/*.test.{js,jsx}',
      'app/src/main/assets/*.test.{js,jsx}', // service-worker.test.js (SW lives at the assets root)
      'tools/**/*.test.{js,jsx}',
    ],
    // Default reporter ('default') is fine for v1. Add 'json' / 'junit'
    // when CI reporting needs structured output.

    coverage: {
      provider: 'v8',
      // Scope coverage to the Q4 testing surfaces (utils + stores + hooks).
      // App() and the ui/ tree are out of Q5 scope — the App() decomposition
      // phase opens them up. Without this scope, coverage would average
      // across the entire untested ui/ tree and the gate would be meaningless.
      //
      // TEST-4 (scope honesty): the measured denominator is hooks/stores/utils/
      // renderer + scripture-resolution.js + the search engine (assets/search.js).
      // DELIBERATELY EXCLUDED — and guarded by the headless smoke walk + lint, NOT
      // by coverage: the ~83-file ui/ tree and data/* (the corpus). So the headline
      // % is an honest number for the LOGIC tier, not whole-app coverage. When an
      // excluded body is high-risk, the fix is to MOVE it into a covered scope +
      // test it (TEST-1 lifted the v3 backup DRIVER from ui/screens into
      // utils/backup-android.js, now 97% covered; SRCH-COV did the same for
      // search.js by switching its test loader from eval to import), rather than
      // dropping the whole ui/ tree into the denominator and diluting the floor.
      include: [
        'app/src/main/assets/src/hooks/**/*.{js,jsx}',
        'app/src/main/assets/src/stores/**/*.{js,jsx}',
        'app/src/main/assets/src/utils/**/*.{js,jsx}',
        // U15: the annotation render engine + the verse/collection resolution
        // engine — the flagship feature's hot path + the scripture lookup core.
        'app/src/main/assets/src/renderer/**/*.{js,jsx}',
        'app/src/main/assets/src/data/scripture-resolution.js',
        // SRCH-COV: the FlexSearch engine wrapper (the app's lowest-rated
        // subsystem per the blind audit) is now in the measured scope. It was
        // OUT only because the tests loaded it via eval(), and v8 instruments
        // imported modules, NOT eval'd source — so it read as untestable when it
        // simply wasn't being measured. search-engine.test.js now `import`s it,
        // making it visible + gated by the per-file floor below. (It is a classic
        // side-effect IIFE concatenated into bundle-a at ship time; importing it
        // in the test only runs the IIFE — production loading is unchanged.)
        'app/src/main/assets/search.js',
        // The new MiniSearch engine (pure ES modules — Classic/MiniSearch
        // coexistence). vendor/minisearch.js is excluded below (3rd-party).
        'app/src/main/assets/src/search/**/*.{js,jsx}',
      ],
      // Exclude colocated test files + bundler entries from coverage measurement.
      exclude: [
        '**/*.test.{js,jsx}',
        '**/_entry-b.js',
        '**/_entry.js',
        '**/search/vendor/**',
      ],
      // Coverage gate locked at the Q5.2 baseline (per [[lint-regression-gate]]).
      // Baseline is AGGREGATE across the full Q4 scope (37 files): 2 files
      // covered + 35 not yet covered drags the average way down. This is the
      // honest number — and locking at exactly here means every new commit
      // either maintains or ratchets UPWARD. Never lower these.
      //
      // Q5.2 baseline (use-ref-mirror + use-saved-state, 86 tests):
      //   statements 1.2 | branches 2.69 | functions 0.41 | lines 0.92
      // Q5.3 baseline (+ annotation-store, 90 tests):
      //   statements 2.32 | branches 3.32 | functions 1.85 | lines 2.18
      // Q5.4 baseline (+ link-store, 107 tests):
      //   statements 4.13 | branches 5.43 | functions 3.92 | lines 3.82
      // Q5.5 baseline (+ journal-index-store, 132 tests):
      //   statements 6.78 | branches 7.44 | functions 5.78 | lines 6.56
      // Q5.6 baseline (+ useSavedState hook + field preservation, 143 tests):
      //   statements 7.10 | branches 7.65 | functions 6.19 | lines 6.94
      // Q5.7 baseline (+ note-store, 166 tests):
      //   statements 8.71 | branches 8.71 | functions 8.88 | lines 8.75
      // Q5.8 baseline (+ use-history, 184 tests):
      //   statements 9.99 | branches 9.34 | functions 10.33 | lines 10.33
      // Q5.9 baseline (+ scripture-parse, 218 tests):
      //   statements 14.01 (349/2491) | branches 11.82 (224/1894)
      //   functions  12.19 (59/484)   | lines    15.09 (276/1828)
      //
      // The disproportionate jump (statements +4, lines +5) reflects
      // scripture-parse's dense regex branching — splitIntoVerses's
      // multi-strategy chain exercises many code paths per test. NOT
      // a signal that more tests would produce similar jumps; per
      // [[tests-diminishing-returns]], the silent-corruption surfaces
      // (stores, validators, store-mutation hooks) are now covered.
      // Next phase should be App() decomposition, not chasing the
      // remaining utility edge cases.
      //
      // P7a baseline (+ use-nav-history-tracking, 241 tests — first
      // App() decomposition extraction):
      //   statements 14.72 (370/2512) | branches 13.29 (256/1926)
      //   functions  12.90 (63/488)   | lines    15.78 (291/1843)
      // The branches jump (+1.47) reflects the 23 new tests covering
      // all 4 if/else-if branches × multiple guard conditions per
      // branch. Branches gate floor advances 11 → 13; the other three
      // dimensions held at the same integer floor (statements 14,
      // functions 12, lines 15) so they don't move yet.
      //
      // P7b baseline (+ use-nav, 275 tests — Phase 1 simple-nav
      // surface extraction):
      //   statements 17.10 (442/2584) | branches 13.65 (264/1934)
      //   functions  16.66 (85/510)   | lines    17.22 (323/1875)
      // useNav is 20 distinct exported helpers — each adds a function
      // and several statements. Functions jump (+3.76) and statements
      // (+2.38) are proportional to the surface added; branches barely
      // moves because the hook's branching is minimal (falsy guards
      // only). Gate floors advance: statements 14→17, functions 12→16,
      // lines 15→17. Branches floor unchanged at 13.
      //
      // P7c baseline (+ use-search, 331 tests — Phase 1 search-domain
      // extraction):
      //   statements 21.52 (590/2741) | branches 18.26 (377/2064)
      //   functions  18.32 (96/524)   | lines    22.08 (441/1997)
      // useSearch's handleSearchSelect is the heaviest single dispatcher
      // in the codebase (~14 if/else-if branches across __direct refs
      // + Orama doc kinds). The 56 new tests cover each branch + the
      // 7 handleSearchCommand actions + goSearch's 4 context variants
      // + the window.__goSearch bridge identity-churn invariant.
      // Branches jump biggest (+4.61) as expected. Gate floors advance:
      // statements 17→21, branches 13→18, functions 16→18, lines 17→22.
      //
      // P7d baseline (+ use-bible-studies, 364 tests — Phase 1
      // TDZ-blocker extraction, 5 of 12 concerns):
      //   statements 23.63 (667/2822) | branches 19.95 (421/2110)
      //   functions  21.59 (119/551)  | lines    24.06 (493/2049)
      //
      // P7e+f+g batch baseline (+ use-journal-mutations + use-tap-through
      // + useReadProgress, 402 tests — Phase 1 small-extractions batch,
      // 8 of 12 concerns):
      //   statements 25.80 (750/2906) | branches 21.51 (463/2152)
      //   functions  24.16 (138/571)  | lines    26.39 (558/2114)
      //
      // P7h+i batch baseline (+ use-reading-position-nav + use-reading-
      // chain-nav, 452 tests — Phase 1 reading-nav pair, 10 of 12 concerns):
      //   statements 29.47 (902/3060) | branches 24.57 (554/2254)
      //   functions  27.78 (167/601)  | lines    30.44 (681/2237)
      // useReadingChainNav is the largest concern remaining (~110 lines)
      // and the most branchy (boundaryConfig's chain-walk loops, the
      // Revelation↔Volume-One bridge). 50 new tests total (22 P7h + 28
      // P7i). Lines breaks 30%. Gate floors advance: statements 25→29,
      // branches 21→24, functions 24→27, lines 26→30.
      //
      // W2.1 baseline (+ idb-adapter, 672 tests — Phase 2 storage
      // hardening starts; first 220 tests of margin since P7i were
      // accumulated by W1 tests without a corresponding gate bump):
      //   statements 40.69 (1527/3752) | branches 30.97 (819/2644)
      //   functions  42.02 (324/771)   | lines    42.95 (1205/2805)
      // The total covered surface jumped because the W1 platform-bridge
      // / W1.5 modal-registry / W1.6 root-exit-toast / scripture-parse
      // extension tests all landed without bumping the floor. The
      // baseline now reflects reality. idb-adapter contributes 44 tests
      // at 78/53/68/82% local coverage (uncovered lines are
      // DOMException-fallback paths only relevant on legacy WebViews).
      //
      // W2.2 baseline (+ cached-store IDB extension, 705 tests):
      //   statements 42.24 (1644/3892) | branches 32.33 (879/2718)
      //   functions  43.21 (341/789)   | lines    44.84 (1309/2919)
      // cached-store.js coverage rises to ~95% local. The new W2.2
      // state machine (pending/loaded/degraded + rebase + background
      // retry + LS shim) is fully exercised by 33 new tests including
      // both documented data-loss vectors. Gate floors advance:
      // statements 40→42, branches 30→32, functions 42→43, lines 42→44.
      //
      // W2 audit + store-coverage sprint baseline (980 tests, 8 new
      // store test files + 17 migrateAnnotations tests):
      //   statements 53.57 (2284/4263) | branches 43.31 (1315/3036)
      //   functions  59.32 (506/853)   | lines    57.70 (1849/3204)
      // +230 tests covering: bookmark, journal cascade/prune, journal-
      // stats streak/milestones, history pruneDay, notebook dedup/
      // cascade, home-order schema validation, journal-media blob
      // round-trip/pruneOrphans, replaceAll across 14 stores,
      // migrateAnnotations legacy transformation. Per-store coverage
      // now 84-96% on every CachedStore-backed store except journal-
      // store (46% — search + scan paths still untested) and recent-
      // nav-store + thumb-store (untouched). Gate floors advance:
      // statements 42→53, branches 32→43, functions 43→59, lines 44→57.
      //
      // W2 polish — 4 new test files (state-store, recent-nav-store,
      // prophecy-cards-store, app-flag-stores):
      //   statements 55.94 (2500/4469) | branches 46.38 (1496/3225)
      //   functions  60.43 (524/867)   | lines    60.09 (2021/3363)
      // +70 tests covering: StateStore lsShim dual-write path (boot-
      // script shim shape verified through JSON round-trip),
      // RecentNavStore dedup-by-5-tuple + cap-at-30 + list-returns-20,
      // ProphecyCardsStore falsy-value filtering in setAll +
      // defensive-copy in getAll, AppFlagStores is/set/clear +
      // legacy numeric/string truthies + 3-store independence.
      // Gate floors advance: statements 53→55, branches 43→46,
      // functions 59→60, lines 57→60.
      //
      // Each future test commit either:
      //   - Maintains these (a new test that covers proportional ground), OR
      //   - Bumps these upward in the SAME commit (a test that covers more
      //     than its share of new lines).
      //
      // W9.3 baseline (+ import-validators, 37 tests — the W9.3 util is in
      // the measured utils/ scope and is ~fully covered):
      //   statements 58.04 (2709/4667) | branches 48.08 (1623/3375)
      //   functions  62.54 (561/897)   | lines    62.15 (2181/3509)
      // Floors advance: statements 55→58, branches 46→48, functions 60→62,
      // lines 60→62.
      //
      // W7.1a (1426 tests — retire legacy migrations, then recover the floor):
      //   statements 58.53 | branches 48.60 | functions 62.65 | lines 62.64
      // Retiring migrateAnnotations + the legacy link {a,b} conversion removed
      // ~80 lines of ABOVE-AVERAGE-covered dead code (and their tests), which
      // mathematically dips the global mean ~0.4% — it briefly fell under the
      // floor. Per "never lower," recovered by covering real untested in-scope
      // logic instead: link-store's query/mutation API (getForKey /
      // getForKeyPrefix / add / remove / replaceAll) + utils/dates.js
      // (relativeDate / timeAgo, previously 0%). Floors HELD at 58/48/62/62,
      // margin restored.
      //
      // W7.4 baseline (+ diagnostic-log, 1467 tests — the new JS-side ring
      // buffer is in the measured utils/ scope and is 100% covered; the
      // platform-bridge getCrashLog merge added branch coverage too):
      //   statements 59.11 (2804/4743) | branches 49.07 (1679/3421)
      //   functions  63.02 (583/925)   | lines    63.32 (2262/3572)
      // Floors advance statements 58→59, branches 48→49, lines 62→63.
      // functions HELD at 62: actual 63.02 leaves only a 0.02 margin over a
      // 63 floor — far tighter than any prior ratchet (the repo's tightest was
      // statements 0.04 at W9.3) — so a 63 floor would fail CI on the next
      // unrelated uncovered function. Not lowered; just not ratcheted this step.
      //
      // U14 baseline (+ backup.js + backup.test.js, 1545 tests — the export-
      // payload build + import-apply data plane extracted from SettingsScreen
      // for the e2e round-trip; backup.js is in the measured utils/ scope at
      // 86/74/100/91 local):
      //   statements 60.04 | branches 49.95 | functions 63.87 | lines 64.32
      // Ratchet functions 62→63 (margin 0.87) + lines 63→64 (margin 0.32),
      // both comfortable. HOLD statements at 59 (a 60 floor leaves only 0.04,
      // as thin as the 0.02 case held above) and branches at 49 (49.95 < 50).
      //
      // U15 SCOPE EXPANSION (1621 tests) — renderer/ (annotation-engine,
      // dom-links, dom-bookmarks, dom-journal-chip) + data/scripture-resolution.js
      // joined the measured `include`. Counterintuitively the aggregate ROSE,
      // not fell: annotation-engine.jsx is heavily covered by its overlap +
      // dual-render-equivalence suites and scripture-resolution.js by its new
      // 42-case engine suite, outweighing the ~60-66% dom-overlay coverage.
      //   statements 61.22 | branches 52.21 | functions 65.48 | lines 65.07
      // +70 tests (scripture-resolution 42, dom-links 8, dom-bookmarks 9,
      // dom-journal-chip 11). Ratchet CONSERVATIVELY because U8 next refactors
      // the now-measured annotation-engine hot path: statements 59→60 (1.22),
      // branches 49→51 (1.21), functions 63→64 (1.48); lines HELD at 64 (a 65
      // floor leaves only 0.07). Re-ratchet after U8 re-measures.
      //
      // SRCH-COV SCOPE EXPANSION (2015 tests) — assets/search.js joined the
      // measured `include`. Unlike U15 (which ROSE), adding a ~1830-line file at
      // 67%/72% is mildly DILUTIVE, so the aggregate floors are HELD, not raised
      // (the live aggregate sits well above them — statements 71.9, branches 61.3,
      // functions 74.2, lines 76.1 — because many recent batches added tests
      // without ratcheting). search.js gets its own per-file floor below so its
      // coverage is gated directly (a search refactor that dips it now fails CI),
      // which is the real protection; the aggregate margin is incidental. +52
      // search tests (public-API helpers — levenshtein/fuzzyBookSuggest/parse-
      // refs/snippet/highlightSpans/suggest/getState/getStats — plus a volumes-
      // engine fixture covering the second doc-builder) lifted search.js from
      // ~44/35/45/49 to 66.72/56.25/62.72/71.92. The remaining uncovered slice is
      // the IDB cache layer + alt-translation loading (jsdom-hostile paths).
      thresholds: {
        statements: 60,
        branches: 51,
        functions: 64,
        lines: 64,
        // T3: PER-FILE floors for the hot files the AGGREGATE masks. The global
        // mean (64/54/69/68) sat well above the floor while journal-store and the
        // DOM overlays rendered on EVERY Android annotation pass sit far below it —
        // a localized regression there (e.g. journal-store's search/scan paths)
        // would hide behind an unrelated gain. An exact-file glob key thresholds
        // that single file. Locked just below current per-file coverage; ratchet
        // upward with new tests, never lower (same discipline as the aggregate).
        // Per-file floors are safe to set tight: an unrelated commit doesn't touch
        // these files, so their coverage can't drift the way the aggregate mean can.
        // Current: journal-store 51.82/42.48/62/56.12 · dom-links 99.29/97.75/100/
        // 99.15 · dom-bookmarks 97.67/90.38/100/99.29. T4 raised the two overlays
        // from ~60/63% with slide-off placement suites (mid-word / closing-punct /
        // skip-element / cross-<em> / block-stop / end-of-block fallbacks / under-
        // <mark> removal); the only lines left uncovered are the unreachable
        // hasBlockBetween defensive `return true` (dom-links:251, dom-bookmarks:225).
        'app/src/main/assets/src/stores/journal-store.js': {
          // TEST-5 added the search / collectAllMediaIds / isMediaReferencedElsewhere /
          // allByCreated query-path tests, lifting this from ~51/42/62/56. Ratcheted
          // to lock the gain (never lower; per-file floors are safe to set tight).
          statements: 65, branches: 54, functions: 74, lines: 70,
        },
        'app/src/main/assets/src/renderer/dom-links.js': {
          statements: 98, branches: 96, functions: 100, lines: 98,
        },
        'app/src/main/assets/src/renderer/dom-bookmarks.js': {
          statements: 96, branches: 88, functions: 100, lines: 98,
        },
        // SRCH-COV: search.js is the app's lowest-rated subsystem AND the file
        // most likely to see future change, so — unlike the inert overlays above
        // — its per-file floor keeps a ~1-2pt buffer rather than locking tight.
        // Current 66.72/56.25/62.72/71.92; ratchet up as the cache/translation
        // paths get covered, never down.
        'app/src/main/assets/search.js': {
          statements: 65, branches: 55, functions: 61, lines: 70,
        },
        // SEARCH (MiniSearch engine) — per-file floors on the three substantive
        // logic modules (the pure helpers are ~100% and ride the aggregate they
        // lift). Locked ~2-4pt below current with a buffer, since these are the
        // files most likely to change; ratchet up as branches get covered, never
        // down. Current: engine 83.5/73.8/88.9/90.9 · index-builder 79.3/61.7/
        // 100/91.9 · ref-parser 80.2/64.8/100/85.6 (uncovered = rare ref-regex
        // variants + the alt-translation path + defensive catches).
        'app/src/main/assets/src/search/engine.js': {
          statements: 80, branches: 70, functions: 85, lines: 88,
        },
        'app/src/main/assets/src/search/index-builder.js': {
          statements: 76, branches: 58, functions: 95, lines: 88,
        },
        'app/src/main/assets/src/search/ref-parser.js': {
          statements: 77, branches: 60, functions: 95, lines: 82,
        },
      },
    },
  },
});

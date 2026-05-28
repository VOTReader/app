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
    include: ['app/src/main/assets/src/**/*.test.{js,jsx}'],
    // Default reporter ('default') is fine for v1. Add 'json' / 'junit'
    // when CI reporting needs structured output.

    coverage: {
      provider: 'v8',
      // Scope coverage to the Q4 testing surfaces (utils + stores + hooks).
      // App() and the ui/ tree are out of Q5 scope — the App() decomposition
      // phase opens them up. Without this scope, coverage would average
      // across the entire untested ui/ tree and the gate would be meaningless.
      include: [
        'app/src/main/assets/src/hooks/**/*.{js,jsx}',
        'app/src/main/assets/src/stores/**/*.{js,jsx}',
        'app/src/main/assets/src/utils/**/*.{js,jsx}',
      ],
      // Exclude colocated test files + bundler entries from coverage measurement.
      exclude: [
        '**/*.test.{js,jsx}',
        '**/_entry-b.js',
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
      // Each future test commit either:
      //   - Maintains these (a new test that covers proportional ground), OR
      //   - Bumps these upward in the SAME commit (a test that covers more
      //     than its share of new lines).
      thresholds: {
        statements: 53,
        branches: 43,
        functions: 59,
        lines: 57,
      },
    },
  },
});

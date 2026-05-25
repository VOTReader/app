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
      // Q5.2 baseline (use-ref-mirror + use-saved-state, 86 tests, 37 Q4 files):
      //   statements 1.2 (30/2491) | branches 2.69 (51/1894)
      //   functions  0.41 (2/484)  | lines    0.92 (17/1828)
      //
      // Each future test commit either:
      //   - Maintains these (a new test that covers proportional ground), OR
      //   - Bumps these upward in the SAME commit (a test that covers more
      //     than its share of new lines).
      // A failure here means "this commit reduced coverage" — investigate
      // whether a test was removed, a file was added without coverage, or
      // the previous threshold was set wrong.
      thresholds: {
        statements: 1,
        branches: 2,
        functions: 0.4,
        lines: 0.9,
      },
    },
  },
});

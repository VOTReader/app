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
  },
});

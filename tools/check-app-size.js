/**
 * Canary gate: the App() composition root must stay decomposed.
 *
 * Fails if app.jsx exceeds the line budget. This catches the class of
 * regression that lint / typecheck / tests / build do NOT: architectural
 * drift. App() was decomposed to 797 lines at the Phase 2 exit, then quietly
 * crept back to 838 over later work because no gate watched it. New concerns
 * belong in a hook under src/hooks/, not inlined in the composition root.
 *
 * Budget is intentionally a little above the current size — app.jsx should
 * grow only by thin hook CALLS, so a few of those are fine before the budget
 * forces the next extraction. Adjust BUDGET deliberately, never to paper over
 * drift. Run via `npm run check:app-size` (wired into pre-commit + CI).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const BUDGET = 800;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appPath = resolve(root, 'app/src/main/assets/src/app.jsx');

// Newline count == `wc -l`, and identical whether checked out LF or CRLF.
const lines = readFileSync(appPath, 'utf-8').split('\n').length - 1;

if (lines > BUDGET) {
  console.error(`[check-app-size] app.jsx is ${lines} lines — over the ${BUDGET}-line budget.`);
  console.error('App() is the composition root: extract the new concern into a hook');
  console.error('under app/src/main/assets/src/hooks/ instead of inlining it here.');
  console.error('See CLAUDE.md "App() decomposition" for the pattern.');
  process.exit(1);
}

console.log(`[check-app-size] app.jsx ${lines}/${BUDGET} lines — OK.`);

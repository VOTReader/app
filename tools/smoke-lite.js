/* ═══════════════════════════════════════════════════════════════════════
   smoke-lite — Node-runnable CI safety net
   ═══════════════════════════════════════════════════════════════════════
   The non-DOM subset of tools/smoke.js. Run in CI as a fast structural
   check; in Q5+ vitest can import `runSmokeChecks` and extend with
   per-store/per-hook unit tests.

   CLI:
     node tools/smoke-lite.js
       → exits 0 on pass, 1 on fail (issue list to stderr).

   Module:
     import { runSmokeChecks, checkGlobalsMirror, checkCollectionsLinkage,
              checkModuleCycles } from './smoke-lite.js';
     const { issues, ok } = runSmokeChecks();

   Three checks (each independent — failure in one doesn't stop the others):

     1. checkGlobalsMirror()
        Regenerate tools/eslint-globals.generated.{js,d.ts} via
        gen-eslint-globals.py; fail if regenerated output diffs from the
        committed copies. Catches "dev added a global without re-running
        lint:globals" drift.

     2. checkCollectionsLinkage()
        Every COLLECTIONS entry's `globalName` must be declared by some
        file in src/data/. Catches "data file went missing / renamed
        without updating the registry."

     3. checkModuleCycles()
        Walk imports from the 3 entry files (stores/_entry-b.js,
        renderer/_entry.js, ui/_entry-d.js); DFS for cycles. esbuild
        rejects strict cycles, but reorder regressions inside an entry
        file are not always caught.

   What's deliberately OUT of scope for v1:
     - .js parse check (already covered by CI syntax-check)
     - runtime initialization checks (would need jsdom or node-vm shim)
     - the 12-screen render walk (browser-only by design — that's smoke's job)
   ═══════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import nodePath from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = nodePath.resolve(nodePath.dirname(__filename), '..');
const SRC = nodePath.join(ROOT, 'app/src/main/assets/src');

/**
 * Regenerate the globals files and verify the regenerated output matches
 * the committed copies. Drift means a dev added an export without running
 * `npm run lint:globals` (the pre-commit hook would have caught this if
 * it regenerated globals — but it doesn't, by design; that's TODO).
 *
 * @returns {string[]}  issue messages (empty = pass)
 */
export function checkGlobalsMirror() {
  try {
    execSync('python tools/gen-eslint-globals.py', { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    return ['globals: failed to run gen-eslint-globals.py — ' + (e && e.message)];
  }
  try {
    execSync(
      'git diff --exit-code tools/eslint-globals.generated.js tools/globals.generated.d.ts',
      { cwd: ROOT, stdio: 'pipe' }
    );
    return [];
  } catch {
    return [
      'globals: committed tools/eslint-globals.generated.* are stale — ' +
      'run `npm run lint:globals` and re-stage the regenerated files',
    ];
  }
}

/**
 * Every COLLECTIONS entry's `globalName` (and `prefaceGlobal` when set)
 * must be declared by some file in src/data/. Tolerates any file naming
 * — we scan the directory for top-level UPPER_CASE_NAME declarations
 * rather than mapping volKey → filename.
 *
 * @returns {string[]}
 */
export function checkCollectionsLinkage() {
  /** @type {string[]} */
  const issues = [];
  const scripResolPath = nodePath.join(SRC, 'data/scripture-resolution.js');
  let scripResol;
  try { scripResol = fs.readFileSync(scripResolPath, 'utf-8'); }
  catch { return ['collections: cannot read ' + scripResolPath]; }

  // Extract every globalName / prefaceGlobal field from the COLLECTIONS array.
  /** @type {Set<string>} */
  const referenced = new Set();
  for (const m of scripResol.matchAll(/globalName:\s*'([A-Z_][A-Z0-9_]*)'/g)) referenced.add(m[1]);
  for (const m of scripResol.matchAll(/prefaceGlobal:\s*'([A-Z_][A-Z0-9_]*)'/g)) referenced.add(m[1]);

  if (referenced.size === 0) {
    return [
      'collections: scripture-resolution.js declared no globalNames — ' +
      'COLLECTIONS may be malformed (regex extraction returned zero matches)',
    ];
  }

  // Scan src/data/*.js for top-level UPPER_CASE_NAME declarations.
  const dataDir = nodePath.join(SRC, 'data');
  /** @type {Set<string>} */
  const dataExports = new Set();
  for (const f of fs.readdirSync(dataDir)) {
    if (!f.endsWith('.js')) continue;
    const text = fs.readFileSync(nodePath.join(dataDir, f), 'utf-8');
    for (const m of text.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Z_][A-Z0-9_]*)\s*=/gm)) {
      dataExports.add(m[1]);
    }
  }

  for (const ref of referenced) {
    if (!dataExports.has(ref)) {
      issues.push("collections: COLLECTIONS references '" + ref + "' but no src/data/*.js declares it");
    }
  }
  return issues;
}

/**
 * Walk imports from the 3 entry files; build the directed graph; DFS for
 * cycles. Bare-specifier imports (like `react`) are skipped — we only
 * follow relative imports inside the source tree.
 *
 * @returns {string[]}
 */
export function checkModuleCycles() {
  /** @type {string[]} */
  const issues = [];
  const entries = [
    nodePath.join(SRC, 'stores/_entry-b.js'),
    nodePath.join(SRC, 'renderer/_entry.js'),
    nodePath.join(SRC, 'ui/_entry-d.js'),
  ];

  /** @type {Map<string, Set<string>>} */
  const graph = new Map();

  /** @param {string} file */
  function resolveImport(fromFile, rel) {
    let abs = nodePath.resolve(nodePath.dirname(fromFile), rel);
    // Try as-is, then .js, .jsx, then directory/index.js
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    if (fs.existsSync(abs + '.js')) return abs + '.js';
    if (fs.existsSync(abs + '.jsx')) return abs + '.jsx';
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      if (fs.existsSync(nodePath.join(abs, 'index.js'))) return nodePath.join(abs, 'index.js');
    }
    return null;
  }

  /** @param {string} file */
  function loadImports(file) {
    if (graph.has(file)) return;
    /** @type {Set<string>} */
    const deps = new Set();
    graph.set(file, deps);  // set first to prevent re-entry on cycles

    let text;
    try { text = fs.readFileSync(file, 'utf-8'); }
    catch { return; }

    // Match `import ... from '<rel>'` AND `import '<rel>'` (side-effect only).
    // Bare specifiers (no leading . or /) are bare-module imports — skip.
    const re = /(?:^|\n)\s*import\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/g;
    for (const m of text.matchAll(re)) {
      const spec = m[1];
      if (!spec.startsWith('.') && !spec.startsWith('/')) continue;  // bare specifier
      const resolved = resolveImport(file, spec);
      if (!resolved) continue;  // skip if unresolvable
      deps.add(resolved);
    }
    for (const d of deps) loadImports(d);
  }

  for (const e of entries) loadImports(e);

  // Cycle detection — DFS with onStack set. When we revisit a node that's
  // still on the stack, trim the stack from that node to find the cycle.
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {Set<string>} */
  const onStack = new Set();
  /** @type {string[]} */
  const stack = [];

  /** @param {string} node */
  function dfs(node) {
    if (onStack.has(node)) {
      const startIdx = stack.indexOf(node);
      const cycle = stack.slice(startIdx).concat([node]).map(p =>
        p.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '')
      );
      issues.push('cycles: import cycle detected — ' + cycle.join(' → '));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    onStack.add(node);
    stack.push(node);
    const deps = graph.get(node) || new Set();
    for (const d of deps) dfs(d);
    stack.pop();
    onStack.delete(node);
  }
  for (const e of entries) dfs(e);

  return issues;
}

/**
 * Run every check, aggregate the issues.
 *
 * @returns {{ issues: string[], ok: boolean }}
 */
export function runSmokeChecks() {
  /** @type {string[]} */
  const issues = [];
  issues.push(...checkGlobalsMirror());
  issues.push(...checkCollectionsLinkage());
  issues.push(...checkModuleCycles());
  return { issues, ok: issues.length === 0 };
}

// CLI entry point — runs when invoked as `node tools/smoke-lite.js`.
// The import.meta.url comparison handles both Windows and Unix paths.
const argvAsUrl = process.argv[1] ? new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href : '';
if (import.meta.url === argvAsUrl) {
  const result = runSmokeChecks();
  if (!result.ok) {
    console.error('smoke-lite FAILED:');
    for (const i of result.issues) console.error('  - ' + i);
    process.exit(1);
  }
  console.log('smoke-lite PASS — ' + 'globals OK, collections OK, no cycles');
}

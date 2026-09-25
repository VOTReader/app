/**
 * Does this checkout's node_modules match package-lock.json? (n7-02, sweep 2026-09-25)
 *
 * WHY THIS EXISTS
 * Worktrees share the repo but not node_modules. When main moved to vitest 5
 * (a8b7be44, 2026-09-24) every older worktree kept vitest 4 installed, so its
 * commit hook ran the old runner and passed what CI then failed: 92f0b90a went
 * red on vitest 5's rule that an un-awaited async assertion fails the test,
 * after passing locally on vitest 4. The primary checkout and two lane
 * worktrees were still on 4.1.11 a day later.
 *
 * It compares every DIRECT dependency (package.json dependencies and
 * devDependencies) as installed (node_modules/<name>/package.json) against the
 * version the lockfile pins (packages["node_modules/<name>"]). Transitive
 * packages follow their parents, and reading ~30 files keeps it well under a
 * tenth of a second, so the hook runs it on every commit that runs gates.
 *
 * Usage: node tools/check-node-modules.js [root]   (exit 1 + the fix when stale)
 */

import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** @returns {{ name: string, installed: string, locked: string }[]} the direct deps that disagree */
export function staleDeps(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const names = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
  const out = [];
  for (const name of names) {
    const locked = lock.packages?.[`node_modules/${name}`]?.version;
    if (!locked) continue; // not in the lockfile: npm ci would fail loudly on its own
    const file = join(root, 'node_modules', name, 'package.json');
    let installed = 'missing';
    if (existsSync(file)) {
      try { installed = JSON.parse(readFileSync(file, 'utf8')).version || 'unknown'; } catch { installed = 'unreadable'; }
    }
    if (installed !== locked) out.push({ name, installed, locked });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(process.argv[2] || '.');
  const stale = staleDeps(root);
  if (stale.length) {
    console.error('[node-modules] this checkout\'s node_modules do not match package-lock.json:');
    for (const s of stale) console.error(`    ${s.name}: installed ${s.installed}, lockfile ${s.locked}`);
    let shared = false;
    try { shared = lstatSync(join(root, 'node_modules')).isSymbolicLink(); } catch { /* no node_modules at all */ }
    if (shared) {
      // Most worktrees junction the primary checkout's node_modules: an npm ci here would
      // rewrite that SHARED install from this branch's lockfile, under every other lane.
      console.error('  The gates would run other packages than CI. This worktree SHARES node_modules (a junction),');
      console.error('  which follows main: rebase onto origin/main. Do not npm ci here - it rewrites the shared install.');
    } else {
      console.error('  The gates would run the old packages and pass what CI fails. Run: npm ci');
    }
    process.exit(1);
  }
  console.log('[node-modules] ok - every direct dependency matches package-lock.json');
}

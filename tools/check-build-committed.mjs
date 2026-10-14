/* check-build-committed — after `npm run build`, the tree must be the committed tree (W73).

   One commit makes two artifacts: deploy-web.yml publishes the WORKING TREE of
   app/src/main/assets/ (rsync, after its own rebuild), and the APK packages the bytes
   COMMITTED to git. They agree only if the build changed nothing and added nothing.
   ci.yml and deploy-web.yml used to check with `git diff --exit-code`, which cannot
   see an untracked file: a new build output that was never committed (dist/bundle-f.js,
   2026-08) went to the web and not into the APK. This checks tracked changes and
   untracked files, ignoring only what .gitignore ignores.

   Usage (from the repo root, after `npm run build`):
     node tools/check-build-committed.mjs [path ...]   default: app/src/main/assets/
   Exit 0 = the build left the tree as committed; 1 = it did not (the files are named). */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_PATHS = ['app/src/main/assets/'];

/**
 * Files under `paths` that differ from HEAD's tree: `changed` (tracked, modified or
 * deleted) and `untracked` (new and not gitignored).
 * @param {string[]} [paths]
 * @param {string} [cwd]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ changed: string[], untracked: string[] }}
 */
export function buildDrift(paths = BUILD_PATHS, cwd = process.cwd(), env = process.env) {
  const out = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...paths], { cwd, encoding: 'utf8', env });
  const changed = [];
  const untracked = [];
  const entries = out.split('\0').filter(Boolean);
  for (let i = 0; i < entries.length; i++) {
    const xy = entries[i].slice(0, 2);
    const path = entries[i].slice(3);
    if (xy === '??') untracked.push(path);
    else changed.push(path);
    if (xy[0] === 'R' || xy[0] === 'C') i++;   // -z puts a rename's source path in the next entry
  }
  return { changed, untracked };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const paths = args.length ? args : BUILD_PATHS;
  const { changed, untracked } = buildDrift(paths);
  if (!changed.length && !untracked.length) {
    console.log(`check-build-committed: OK — the build left ${paths.join(' ')} as committed.`);
    process.exit(0);
  }
  console.error('check-build-committed: FAIL — the build output differs from the commit, so the PWA and the APK would diverge.');
  for (const p of changed) console.error(`  changed:   ${p}`);
  for (const p of untracked) console.error(`  untracked: ${p}  (built but never committed: add it, and to .githooks/pre-commit Step 5 if it is in dist/)`);
  if (changed.length) {
    try { console.error(execFileSync('git', ['diff', '--stat', '--', ...changed], { encoding: 'utf8' })); } catch { /* the names above are enough */ }
  }
  console.error('Rebuild with `npm run build` and commit what it writes.');
  process.exit(1);
}

/**
 * .githooks/pre-push runs the two heavy gates (vitest, the Kotlin unit tests) ONCE per push instead of once per
 * commit (ln1 item 6, 2026-10-05; audit-gates.md row 6). The commit hook keeps the data gates, lint-staged, tsc and
 * the build. These cases RUN the hook with git's real pre-push stdin (`<local ref> <local sha> <remote ref>
 * <remote sha>`) against commits built in memory (commit-tree on a private index; the working tree and the
 * developer's index are never touched). VOT_PREPUSH_DRY=1 prints each gate it would run instead of running it, so
 * the suite never starts a vitest inside a vitest; everything before that line (triggers, the tree guard, the
 * pass cache, land.sh's hand-off) is the real code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = '.githooks/pre-push';
const ZERO = '0'.repeat(40);
const git = (args, opts = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', ...opts }).trim();

/** A commit whose parent is HEAD and whose tree is HEAD's plus `files` ({path: content}). Never checked out. */
function commitWith(files) {
  const idx = join(mkdtempSync(join(tmpdir(), 'vot-prepush-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  git(['read-tree', 'HEAD'], { env });
  for (const [path, content] of Object.entries(files)) {
    const blob = git(['hash-object', '-w', '--stdin'], { env, input: content });
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], { env });
  }
  const tree = git(['write-tree'], { env });
  return { sha: git(['commit-tree', tree, '-p', 'HEAD', '-m', 'pre-push test'], { env }), tree };
}
const plus = (path, line) => ({ [path]: readFileSync(resolve(root, path), 'utf8') + line });

/** Run the hook as `git push` would; `guard: false` skips the working-tree guard (these commits are not on disk). */
function push(stdin, { guard = false, env: extra = {} } = {}) {
  const cache = mkdtempSync(join(tmpdir(), 'vot-prepush-cache-'));
  const env = { ...process.env, VOT_PREPUSH_DRY: '1', VOT_PREPUSH_CACHE: cache, GATE_SKIP: '1', LAND_GATED_SHA: '', ...extra };
  if (guard) delete env.VOT_PREPUSH_NO_TREE_GUARD; else env.VOT_PREPUSH_NO_TREE_GUARD = '1';
  const r = spawnSync('sh', [HOOK, 'origin', 'https://example.invalid/repo.git'], { cwd: root, env, input: stdin, encoding: 'utf8' });
  return { out: (r.stdout || '') + (r.stderr || ''), status: r.status, cache };
}
const line = (sha, base = git(['rev-parse', 'HEAD'])) => `refs/heads/x ${sha} refs/heads/main ${base}\n`;

describe('pre-push: the heavy gates run once per push (ln1 item 6)', () => {
  it.skipIf(!existsSync(resolve(root, HOOK)))('is a hook git will run', () => {
    expect(readFileSync(resolve(root, HOOK), 'utf8')).toMatch(/^#!\/bin\/sh\n/);
  });

  it('runs vitest when the pushed commits change app source', () => {
    const { sha } = commitWith(plus('app/src/main/assets/src/utils/backup.js', '\n// pre-push test\n'));
    const { out, status } = push(line(sha));
    expect(status, out).toBe(0);
    expect(out).toMatch(/\[pre-push\] would run: vitest npm run test:hook/);
    expect(out).not.toMatch(/would run: gradle/);
  }, 60_000);

  it('runs only the tools/ suite when the push changes a gate script and no app source', () => {
    const { sha } = commitWith(plus('tools/check-bundle-budget.js', '\n// pre-push test\n'));
    const { out, status } = push(line(sha));
    expect(status, out).toBe(0);
    expect(out).toMatch(/would run: vitest-tools npx vitest run tools\//);
    expect(out).not.toMatch(/would run: vitest npm/);
  }, 60_000);

  it('runs the Kotlin tests when the push changes an input the Robolectric suite reads', () => {
    const { sha } = commitWith(plus('app/src/main/AndroidManifest.xml', '\n'));
    const { out, status } = push(line(sha));
    expect(status, out).toBe(0);
    expect(out).toMatch(/would run: gradle \S+ :app:testDebugUnitTest :app:jacocoTestCoverageVerification/);
    expect(out).not.toMatch(/would run: vitest/);
  }, 60_000);

  it('runs nothing for a push of docs, a branch delete, or commits already on the remote', () => {
    const { sha } = commitWith(plus('AGENTS.md', '\n'));
    const head = git(['rev-parse', 'HEAD']);
    for (const stdin of [line(sha), `(delete) ${ZERO} refs/heads/x ${head}\n`, line(head, head)]) {
      const { out, status } = push(stdin);
      expect(status, out).toBe(0);
      expect(out, stdin).not.toMatch(/would run/);
    }
  }, 60_000);

  it('refuses to test a working tree that is not the commit being pushed', () => {
    // the gates read files on disk; this commit's backup.js is not what is on disk
    const { sha } = commitWith(plus('app/src/main/assets/src/utils/backup.js', '\n// only the commit has this\n'));
    const { out, status } = push(line(sha), { guard: true });
    expect(status, out).toBe(1);
    expect(out).toContain('app/src/main/assets/src/utils/backup.js');
    expect(out).not.toMatch(/would run/);
  }, 60_000);

  it('skips a gate that already passed on the same tree (the pass cache)', () => {
    const { sha, tree } = commitWith(plus('app/src/main/assets/src/utils/backup.js', '\n// cached\n'));
    const cache = mkdtempSync(join(tmpdir(), 'vot-prepush-cache-'));
    writeFileSync(join(cache, `${tree}.vitest`), 'passed\n');
    const { out, status } = push(line(sha), { env: { VOT_PREPUSH_CACHE: cache } });
    expect(status, out).toBe(0);
    expect(out).toMatch(/vitest already passed on tree/);
    expect(out).not.toMatch(/would run: vitest/);
  }, 60_000);

  it("trusts land.sh's gate run on the commits before its rebase", () => {
    const { sha } = commitWith(plus('app/src/main/assets/src/utils/backup.js', '\n// landed\n'));
    const { out, status } = push(line(sha), { env: { LAND_GATED_SHA: sha } });
    expect(status, out).toBe(0);
    expect(out).toMatch(/gated by land\.sh/);
    expect(out).not.toMatch(/would run/);
  }, 60_000);

  it('vitest and gradle run through heavy_run (the machine-wide gates.lock), and the old-branch fallback stays', () => {
    const hook = readFileSync(resolve(root, HOOK), 'utf8');
    expect(hook).toMatch(/if grep -q '"test:hook"' package\.json; then\n\s*heavy_run vitest npm run test:hook\n\s*else\n\s*heavy_run vitest npm run test:coverage\n/);
    expect(hook).toMatch(/^\s*heavy_run vitest-tools npx vitest run tools\/$/m);
    expect(hook).toMatch(/^\s*heavy_run gradle "\$GRADLE_CMD" :app:testDebugUnitTest :app:jacocoTestCoverageVerification$/m);
    const takes = hook.split('\n').filter((l) => /gate_take/.test(l) && !l.trim().startsWith('#'));
    expect(takes).toHaveLength(1);
  });
});

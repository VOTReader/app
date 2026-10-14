/**
 * check-build-committed (W73, sweep 2026-10-13): after a build, the tree must be
 * the committed tree, new files included. ci.yml and deploy-web.yml checked with
 * `git diff --exit-code`, which cannot see an untracked file, so a build output
 * that was never committed reached the PWA (rsync publishes the working tree)
 * and not the APK built from git: the bundle-f.js split again.
 * Each case runs against a throwaway git repo.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildDrift } from './check-build-committed.mjs';

const TOOL = resolve(dirname(fileURLToPath(import.meta.url)), 'check-build-committed.mjs');
const ASSETS = 'app/src/main/assets';

// Every git call gets an env with no GIT_* in it, on top of vitest.setup.js's scrub: inside a hook git
// exports GIT_DIR / GIT_INDEX_FILE, and a temp-repo `git init` / `git config` that inherited them would
// rewrite the real repository (network ln1, 2026-10-05).
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

let repo;
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: ENV });
const put = (rel, text) => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), text);
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'build-committed-'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  git('config', 'core.autocrlf', 'false');
  put(`${ASSETS}/dist/bundle-a.js`, 'a\n');
  put(`${ASSETS}/index.html`, '<html></html>\n');
  put('.gitignore', 'ignored.js\n');
  git('add', '-A');
  git('commit', '-q', '--no-verify', '-m', 'init');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('buildDrift', () => {
  it('finds nothing in a tree that matches the commit', () => {
    expect(buildDrift([ASSETS], repo, ENV)).toEqual({ changed: [], untracked: [] });
  });

  it('finds a new build output that was never committed, which git diff --exit-code passes', () => {
    put(`${ASSETS}/dist/bundle-f.js`, 'f\n');
    expect(spawnSync('git', ['diff', '--exit-code', `${ASSETS}/dist/`], { cwd: repo, env: ENV }).status).toBe(0);
    expect(buildDrift([ASSETS], repo, ENV)).toEqual({ changed: [], untracked: [`${ASSETS}/dist/bundle-f.js`] });
  });

  it('finds a committed file the build rewrote', () => {
    put(`${ASSETS}/index.html`, '<html>new csp</html>\n');
    expect(buildDrift([ASSETS], repo, ENV)).toEqual({ changed: [`${ASSETS}/index.html`], untracked: [] });
  });

  it('ignores gitignored files and paths outside the ones asked about', () => {
    put(`${ASSETS}/dist/ignored.js`, 'x\n');
    put('tools/scratch.js', 'x\n');
    expect(buildDrift([ASSETS], repo, ENV)).toEqual({ changed: [], untracked: [] });
  });
});

describe('check-build-committed CLI', () => {
  const run = () => spawnSync(process.execPath, [TOOL], { cwd: repo, encoding: 'utf8', env: ENV });

  it('exits 0 on a clean tree', () => {
    const r = run();
    expect(r.status).toBe(0);
  });

  it('exits 1 and names an uncommitted build output', () => {
    put(`${ASSETS}/dist/bundle-f.js`, 'f\n');
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${ASSETS}/dist/bundle-f.js`);
  });
});

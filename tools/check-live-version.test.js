/* check-live-version — IS WHAT I HAVE ACTUALLY LIVE?
   ─────────────────────────────────────────────────
   On 2026-08-11 the owner reported PWA updates "do not push correctly" and
   caches "stay stale" — the cause was unpushed work, not caching. This gate
   compares the deployed service worker (LIVE) with HEAD (COMMITTED) and the
   working tree (LOCAL) and says plainly which of "not committed", "not
   pushed", "not deployed yet" or "live" you are in.

   HOW: same harness as check-corpus-version.test.js — the gate resolves its
   own paths from import.meta.url and exports no functions, so each case
   mirrors the real tools/check-live-version.js into a throwaway git repo
   (a service worker + one HEAD commit) and runs the gate as a child process,
   exactly as pre-commit does.

   NETWORK: the gate fetches the live service worker before it can print any
   verdict, so the verdict pins need the live site and skip when it is
   unreachable (vitest context skip). The failure mode that needs no network
   — a service worker with no CACHE_VERSION — is pinned offline instead.
   --wait is never tested (25 min cap). */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, appendFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-live-version.js');

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

const SW = (cache, corpus) =>
  `const CACHE_VERSION = '${cache}';\n${corpus ? `const CORPUS_VERSION = '${corpus}';\n` : ''}`;

function git(root, ...args) {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd: root });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return (r.stdout || '').trim();
}

/** A throwaway git repo mirror with the real gate + a service worker with
 * one HEAD commit. The mirror has no origin, so `git fetch origin main`
 * fails and the gate always reports NOT ON MAIN — the deterministic pin
 * this harness can make without a deploy. */
function mirror({ cache = 'v-test-1', corpus = 'c1', swText = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-live-version-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');

  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(GATE, join(toolsDir, 'check-live-version.js'));

  const swDir = join(root, 'app', 'src', 'main', 'assets');
  mkdirSync(swDir, { recursive: true });
  const swPath = join(swDir, 'service-worker.js');
  writeFileSync(swPath, swText ?? SW(cache, corpus));

  git(root, 'init', '-b', 'main', '--quiet');
  git(root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'add', '.');
  git(root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'test sw');

  return { root, swPath };
}

function runGate(root, args = []) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-live-version.js'), ...args], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
}

/** The gate fetches the live service worker before printing any verdict;
 * when that fetch itself fails, the verdict pins cannot run at all. */
function skipWhenLiveUnreachable(ctx, run) {
  if (/live fetch failed|fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(run.all)) {
    ctx.skip('live site unreachable — verdict pins need the live fetch');
  }
}

describe('check-live-version', () => {
  it('fails offline-deterministically when the service worker has no CACHE_VERSION', () => {
    const { root } = mirror({ swText: "const CORPUS_VERSION = 'c1';\n" });
    const r = runGate(root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('could not find CACHE_VERSION in the working tree');
  });

  it('reports NOT ON MAIN for a mirror with no origin, exit 0 without --strict', (ctx) => {
    const { root } = mirror();
    const r = runGate(root);
    skipWhenLiveUnreachable(ctx, r);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('NOT LIVE:');
    expect(r.stdout).toContain('NOT ON MAIN');
    expect(r.stdout).toContain('v-test-1');
    expect(r.stdout).toContain('corpus c1');
  });

  it('exits 1 under --strict when HEAD is not on main', (ctx) => {
    const { root } = mirror();
    const r = runGate(root, ['--strict']);
    skipWhenLiveUnreachable(ctx, r);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('NOT ON MAIN');
  });

  it('reports UNCOMMITTED when the service worker is dirty', (ctx) => {
    const { root, swPath } = mirror();
    appendFileSync(swPath, '// local tweak\n');
    const r = runGate(root);
    skipWhenLiveUnreachable(ctx, r);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('UNCOMMITTED');
    expect(r.stdout).toContain('[working tree DIRTY]');
  });

  it('reports UNCOMMITTED when the local CACHE_VERSION differs from HEAD', (ctx) => {
    const { root, swPath } = mirror();
    writeFileSync(swPath, SW('v-test-2', 'c1'));
    const r = runGate(root);
    skipWhenLiveUnreachable(ctx, r);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('UNCOMMITTED');
    expect(r.stdout).toContain('v-test-2');
  });

  it('shows (none) for a missing CORPUS_VERSION', (ctx) => {
    const { root } = mirror({ corpus: null });
    const r = runGate(root);
    skipWhenLiveUnreachable(ctx, r);
    expect(r.stdout).toContain('corpus (none)');
  });
});

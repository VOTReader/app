/* check-search-index-version — a stale lock version must not pass the gate (sweep low, REPORT.md:649).
   ─────────────────────────────────────────────────────────────────────────
   The lock records MS_INDEX_VERSION with the fingerprint of the index-shaping code built under it. A
   version bumped with no code change (a commit that skipped the hook, which syncs the lock) left the
   lock one version behind, and `--check` (CI, the deploy) passed it: the code was unchanged. The next
   UNBUMPED change to index-shaping code then read as "version bumped AND code changed" (the lock's old
   version differs from cache.js's), so the pre-commit rewrote the lock and let it through, and every
   client that had built an index under that version kept restoring it. `--check` now refuses a lock
   whose version is not cache.js's, so the version a lock names is always the one its code shipped under.

   HOW: the check-corpus-version.test.js harness: the gate resolves its paths from import.meta.url and
   exports nothing, so each case mirrors it into a throwaway tree and runs it as a child process. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-search-index-version.js');

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

const cacheJs = (v) => `export const MS_INDEX_VERSION = '${v}';\nexport const sig = () => 'v:' + MS_INDEX_VERSION;\n`;

/** A throwaway tree: the real gate, a cache.js at `version`, and a stub of every index-shaping file. */
function mirror(version) {
  const root = mkdtempSync(join(tmpdir(), 'vot-search-index-version-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  mkdirSync(join(root, 'tools'), { recursive: true });
  copyFileSync(GATE, join(root, 'tools', 'check-search-index-version.js'));
  const src = join(root, 'app', 'src', 'main', 'assets', 'src');
  mkdirSync(join(src, 'search', 'vendor'), { recursive: true });
  mkdirSync(join(src, 'utils'), { recursive: true });
  for (const f of ['search/index-builder.js', 'search/search-config.js', 'search/tokenize.js', 'search/vendor/minisearch.js',
    'utils/segment-dom-text.js', 'utils/format-b-inline.js']) writeFileSync(join(src, f), `/* ${f} */\n`);
  writeFileSync(join(src, 'search', 'cache.js'), cacheJs(version));
  return { root, search: join(src, 'search') };
}

function runGate(root, args = []) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-search-index-version.js'), ...args], { encoding: 'utf8', cwd: root });
  return { status: r.status, all: (r.stdout || '') + (r.stderr || '') };
}

describe('check-search-index-version', () => {
  it('passes unchanged code, and refuses a code change with the version unbumped', () => {
    const t = mirror('m1');
    expect(runGate(t.root).status).toBe(0); // first run writes the lock
    expect(runGate(t.root, ['--check']).status).toBe(0);
    appendFileSync(join(t.search, 'index-builder.js'), 'export const shape = 2;\n');
    const r = runGate(t.root);
    expect(r.status).toBe(1);
    expect(r.all).toContain('MS_INDEX_VERSION WAS NOT BUMPED');
  });

  it('a version bumped with no code change is synced into the lock by the hook, then passes --check', () => {
    const t = mirror('m1');
    runGate(t.root);
    writeFileSync(join(t.search, 'cache.js'), cacheJs('m2'));
    expect(runGate(t.root).status).toBe(0);
    expect(runGate(t.root, ['--check']).status).toBe(0);
  });

  it('--check refuses a lock whose version is behind cache.js, so a later unbumped change cannot read as a bump', () => {
    const t = mirror('m1');
    runGate(t.root);
    // m2 committed without the hook: the lock still says m1 for this same code.
    writeFileSync(join(t.search, 'cache.js'), cacheJs('m2'));
    const stale = runGate(t.root, ['--check']);
    expect(stale.status, 'a stale lock must not reach main').toBe(1);
    expect(stale.all).toContain('lock');
  });
});

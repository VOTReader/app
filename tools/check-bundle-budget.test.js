/* check-bundle-budget — dist/ bytes have ceilings; the gate stats every
   declared bundle and reports overruns, missing bundles, and the tightest
   headroom. Same mirror harness as check-type-scale.test.js: the gate
   resolves its paths from import.meta.url and exports nothing, so each case
   mirrors the real tools/check-bundle-budget.js into a throwaway repo tree
   with a fake app/src/main/assets (dist/ + src/data/) and runs the gate as
   a child process, exactly as pre-commit does. Fully offline, deterministic.
   Sizes are exact byte counts (Buffer.alloc), so the over-by arithmetic and
   the tightest-headroom line are pinned, not approximated. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-bundle-budget.js');

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** The 14 required rows, all comfortably under their ceilings. Paths are
 * relative to app/src/main/assets: bare names stat in dist/, paths with a
 * separator stat under the assets root — exactly the gate's rule. */
const REQUIRED = {
  'dist/bundle-a.js': 100000,
  'dist/bundle-b.js': 200000,
  'dist/bundle-c.js': 20000,
  'dist/bundle-d.js': 1000000,
  'dist/bundle-w.js': 30000,
  'dist/app.min.css': 400000,
  'dist/bundle-a-bible.js': 4000000,
  'dist/bundle-a-matthew.js': 400000,
  'dist/bundle-a-vot.js': 2000000,
  'src/data/audio-sync.js': 100000,
  'src/data/audio-lengths.js': 100000,
  'src/data/verse-cites.js': 100000,
  'src/data/answers.js': 2000000,
  'src/data/answers-meta.js': 300000,
};

/** A throwaway repo mirror with the real gate + the fixture files.
 * `overrides` replaces or adds files (size in bytes, or exact content);
 * `omit` drops files from the fixture. */
function mirror(overrides = {}, omit = []) {
  const root = mkdtempSync(join(tmpdir(), 'vot-bundle-budget-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(GATE, join(toolsDir, 'check-bundle-budget.js'));
  // The gate imports fixLine from its sibling (name-the-fix, 3b96c0cbe), so the mirror carries it too.
  copyFileSync(join(dirname(GATE), 'e2e-walk-lib.mjs'), join(toolsDir, 'e2e-walk-lib.mjs'));
  const assets = join(root, 'app', 'src', 'main', 'assets');
  const files = { ...REQUIRED, ...overrides };
  for (const f of omit) delete files[f];
  for (const [rel, v] of Object.entries(files)) {
    const p = join(assets, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, typeof v === 'number' ? Buffer.alloc(v) : v);
  }
  return { root, assets };
}

function runGate(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-bundle-budget.js')], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('check-bundle-budget', () => {
  it('passes a clean tree and counts seen vs declared, optional absent', () => {
    const { root } = mirror();
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[bundle-budget] OK — all 14 of 19 declared (5 optional absent) inside their byte ceilings.');
  });

  it('counts a present optional row as seen and names the tightest row across both sets', () => {
    // bundle-c headroom is 100 (26600 - 26500); the src/data row is
    // tighter at 50 (730000 - 729950) — the tightest line must name the
    // data row, not the bare bundle that is nearly as tight.
    const { root } = mirror({
      'dist/bundle-c.js': 26500,
      'src/data/audio-sync.js': 729950,
      'src/data/audio-sync-sections.js': 100000,
    });
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[bundle-budget] OK — all 15 of 19 declared (4 optional absent) inside their byte ceilings.');
    expect(r.stdout).toContain('tightest: src/data/audio-sync.js 729950 / 730000, 50 left');
  });

  it('fails a bundle over its ceiling with the over-by bytes and the growth % vs measured', () => {
    // bundle-c at 27000: over by 400; (27000/23103 - 1) * 100 = 16.9%.
    const { root } = mirror({ 'dist/bundle-c.js': 27000 });
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[bundle-budget] a bundle grew past its byte ceiling:');
    expect(r.stderr).toContain('bundle-c.js');
    expect(r.stderr).toContain('over by 400 bytes');
    expect(r.stderr).toContain('(+16.9% vs the 23.1 KB baseline)');
  });

  it('fails a missing non-optional bundle and names it', () => {
    const { root } = mirror({}, ['dist/bundle-a.js']);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[bundle-budget] these bundles are missing from dist/ — run `npm run build`:');
    expect(r.stderr).toContain('bundle-a.js');
  });
});

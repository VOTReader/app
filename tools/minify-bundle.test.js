/**
 * tools/minify-bundle.test.js — tests for tools/minify-bundle.mjs.
 *
 * The script runs at import, exports nothing, and rewrites its file in
 * place, so it cannot be imported into vitest. Each case mirrors the real
 * script into a throwaway repo tree with a fixture bundle and runs the
 * script as a child process, exactly as tools/build.py does. The mirror's
 * node_modules is a junction to the repo's own, so the script's esbuild
 * import resolves without copying it. Fully offline, deterministic.
 * Precedent: tools/check-app-size.test.js, tools/sync-sw-version.test.js
 * (votreader-tests-2).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from './test-spawn.js'; // file stdio: no pipe another worker's child can hold
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync,
  rmSync, symlinkSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCRIPT = resolve(HERE, 'minify-bundle.mjs');
const NODE_MODULES = resolve(ROOT, 'node_modules');

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo mirror with the real script + a fixture bundle. */
function mirror(bundle) {
  const root = mkdtempSync(join(tmpdir(), 'vot-minify-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'minify-bundle.mjs'));
  symlinkSync(NODE_MODULES, join(root, 'node_modules'), 'junction');
  const file = join(root, 'bundle.js');
  if (bundle !== undefined) writeFileSync(file, bundle);
  return { root, file };
}

function runScript(root, args = []) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'minify-bundle.mjs'), ...args], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const BUNDLE = `// A fixture bundle: a comment, whitespace, and a little code.
function greet(name) {
  return 'Hello, ' + name + '!';
}
${"console.log(greet('world'));\n".repeat(40)}`;

describe('minify-bundle', () => {
  it('minifies a bundle in place, smaller and still valid', () => {
    const { root, file } = mirror(BUNDLE);
    const before = statSync(file).size;
    expect(before).toBeGreaterThan(1024);
    const r = runScript(root, ['bundle.js']);
    expect(r.status).toBe(0);
    const after = readFileSync(file, 'utf8');
    expect(statSync(file).size).toBeLessThan(before);
    expect(after).not.toContain('fixture bundle');
    expect(after).toContain('Hello, ');
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    expect(check.status).toBe(0);
  });

  it('exits 1 with usage when no file is given', () => {
    const { root } = mirror();
    const r = runScript(root, []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage: node tools/minify-bundle.mjs <file>');
  });

  it('exits 1 when the file does not exist', () => {
    const { root } = mirror();
    const r = runScript(root, ['nope.js']);
    expect(r.status).toBe(1);
  });

  it('refuses a bundle that minifies to nothing (comment-only, over 1 KB)', () => {
    const { root, file } = mirror('/* ' + 'y'.repeat(1500) + ' */\n');
    const r = runScript(root, ['bundle.js']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('implausibly small');
    expect(readFileSync(file, 'utf8').length).toBeLessThan(1024);
  });

  it('refuses a tiny file that minifies to empty', () => {
    const { root } = mirror('// nothing but a comment\n');
    const r = runScript(root, ['bundle.js']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('implausibly small');
  });

  it('passes a small file whose minified form is short but non-empty', () => {
    const { root, file } = mirror('function add(a, b) { return a + b; }\nconsole.log(add(1, 2));\n');
    const r = runScript(root, ['bundle.js']);
    expect(r.status).toBe(0);
    expect(readFileSync(file, 'utf8')).toContain('add(');
  });
});

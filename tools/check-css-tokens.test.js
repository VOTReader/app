/* check-css-tokens — a var(--name) with no fallback must resolve to a
   declaration. Each case builds a throwaway tree with a fake
   app/src/main/assets (the clean base + its fixtures) and calls the gate's
   exported checkCssTokens(root) in-process. It used to spawn the gate once
   per case: 85 ms alone, but 45-77 s (a 20 s timeout) whenever another
   vmThreads worker had a child running, e.g. search-bench/make-targets in the
   hook's fast run (a concurrent spawn on Windows inherits the gate's stdout
   pipe and spawnSync waits for it to close). One case still runs the CLI,
   with its stdio in files. Fully offline, deterministic. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, openSync, closeSync, readFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkCssTokens } from './check-css-tokens.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-css-tokens.js');

const trees = [];
afterEach(() => { for (const m of trees.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** The clean base: app.css declares --brand and --ink; main.css only
 * references the declared --brand. */
const BASE_CSS = `:root {\n  --brand: #123456;\n  --ink: #000000;\n}\n`;
const CLEAN_CSS = `.a { color: var(--brand); }\n`;

/** A throwaway repo root holding only what the gate reads: app/src/main/assets. */
function tree() {
  const root = mkdtempSync(join(tmpdir(), 'vot-css-tokens-'));
  trees.push(root);
  const assets = join(root, 'app', 'src', 'main', 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, 'app.css'), BASE_CSS);
  writeFileSync(join(assets, 'main.css'), CLEAN_CSS);
  return { root, assets };
}

/** Add a fixture file under the tree's assets dir, creating parents. */
function add(assets, rel, text) {
  const p = join(assets, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

describe('check-css-tokens', () => {
  it('passes a clean tree and reports the declared count', () => {
    const { root } = tree();
    const r = checkCssTokens(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[css-tokens] OK — every var() with no fallback resolves (2 properties declared).');
  });

  it('flags a phantom token with its reference count and sites', () => {
    const { root, assets } = tree();
    add(assets, 'bad.css', '.x { color: var(--ghost); }\n.y { border-color: var(--ghost); }\n');
    const r = checkCssTokens(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[css-tokens] references to UNDECLARED custom properties.');
    expect(r.stderr).toContain('var(--ghost)  — 2 references, 0 declarations:');
    expect(r.stderr).toContain('app/src/main/assets/bad.css:1');
    expect(r.stderr).toContain('app/src/main/assets/bad.css:2');
  });

  it('does not flag a var() with a fallback', () => {
    const { root, assets } = tree();
    add(assets, 'fb.css', '.x { color: var(--ghost, red); }\n');
    const r = checkCssTokens(root);
    expect(r.status).toBe(0);
  });

  it('does not flag the type-scale tokens check-type-scale owns', () => {
    const { root, assets } = tree();
    add(assets, 'fs.css', '.x { font-size: var(--fs-99); }\n.y { font-size: var(--fsc-99); }\n');
    const r = checkCssTokens(root);
    expect(r.status).toBe(0);
  });

  it('counts a setProperty call as a declaration', () => {
    const { root, assets } = tree();
    add(assets, 'runtime.js', "el.style.setProperty('--runtime', '10px');\n");
    add(assets, 'use.css', '.x { top: var(--runtime); }\n');
    const r = checkCssTokens(root);
    expect(r.status).toBe(0);
  });

  it('counts a declaration in index.html', () => {
    const { root, assets } = tree();
    add(assets, 'index.html', '<style>:root { --boot: red; }</style>\n');
    add(assets, 'boot.css', '.x { color: var(--boot); }\n');
    const r = checkCssTokens(root);
    expect(r.status).toBe(0);
  });

  it('does not count a declaration inside a block comment', () => {
    const { root, assets } = tree();
    add(assets, 'commented.css', '/* --gone: red; */\n.x { color: var(--gone); }\n');
    const r = checkCssTokens(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('var(--gone)');
  });

  it('does not count a reference inside a block comment', () => {
    const { root, assets } = tree();
    add(assets, 'commented2.css', '/* color: var(--ghost2); */\n.x { color: var(--brand); }\n');
    const r = checkCssTokens(root);
    expect(r.status).toBe(0);
  });

  it('ignores references in .test. files and under dist/', () => {
    const { root, assets } = tree();
    add(assets, 'foo.test.js', 'const s = "color: var(--ghost3)";\n');
    add(assets, 'dist/skip.css', '.x { color: var(--ghost4); }\n');
    const r = checkCssTokens(root);
    expect(r.status).toBe(0);
  });

  it('still counts a reference in a // line comment — only /* */ is stripped', () => {
    const { root, assets } = tree();
    add(assets, 'linecomment.js', '// color: var(--lineghost)\nconst x = 1;\n');
    const r = checkCssTokens(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('var(--lineghost)');
  });

  it('counts a textual declaration — a quoted --name: in a JS string declares it', () => {
    const { root, assets } = tree();
    add(assets, 'strdecl.js', "const s = '--str-decl: 1px';\n");
    add(assets, 'struse.css', '.x { color: var(--str-decl); }\n');
    const r = checkCssTokens(root);
    expect(r.status).toBe(0);
  });

  it('the CLI prints the report and exits 1 on a phantom (run as pre-commit runs it)', () => {
    // One child, the one place the wiring (argv check, exit code, stderr) can break.
    // Its stdio goes to files, not pipes: spawnSync then waits only for the child to
    // exit, so a pipe handle inherited by another worker's concurrent child cannot hold it.
    const { root, assets } = tree();
    mkdirSync(join(root, 'tools'));
    copyFileSync(GATE, join(root, 'tools', 'check-css-tokens.js'));
    writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
    add(assets, 'bad.css', '.x { color: var(--ghost); }\n');
    const outFd = openSync(join(root, 'out.txt'), 'w');
    const errFd = openSync(join(root, 'err.txt'), 'w');
    let r;
    try {
      r = spawnSync(process.execPath, [join(root, 'tools', 'check-css-tokens.js')], {
        cwd: root, stdio: ['ignore', outFd, errFd], timeout: 15000,
      });
    } finally { closeSync(outFd); closeSync(errFd); }
    expect(r.status).toBe(1);
    expect(readFileSync(join(root, 'out.txt'), 'utf8')).toBe('');
    expect(readFileSync(join(root, 'err.txt'), 'utf8')).toBe(checkCssTokens(root).stderr);
  });
});

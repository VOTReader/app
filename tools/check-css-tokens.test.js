/* check-css-tokens — a var(--name) with no fallback must resolve to a
   declaration. Same mirror harness as check-type-scale.test.js: the gate
   resolves its paths from import.meta.url and exports nothing, so each case
   mirrors the real tools/check-css-tokens.js into a throwaway repo tree
   with a fake app/src/main/assets (ladder + fixtures) and runs the gate as
   a child process, exactly as pre-commit does. Fully offline, deterministic. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-css-tokens.js');

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** The clean base: app.css declares --brand and --ink; main.css only
 * references the declared --brand. */
const BASE_CSS = `:root {\n  --brand: #123456;\n  --ink: #000000;\n}\n`;
const CLEAN_CSS = `.a { color: var(--brand); }\n`;

/** A throwaway repo mirror with the real gate + the clean base. */
function mirror() {
  const root = mkdtempSync(join(tmpdir(), 'vot-css-tokens-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(GATE, join(toolsDir, 'check-css-tokens.js'));
  const assets = join(root, 'app', 'src', 'main', 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, 'app.css'), BASE_CSS);
  writeFileSync(join(assets, 'main.css'), CLEAN_CSS);
  return { root, assets };
}

/** Add a fixture file under the mirror's assets dir, creating parents. */
function add(assets, rel, text) {
  const p = join(assets, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

function runGate(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-css-tokens.js')], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('check-css-tokens', () => {
  it('passes a clean tree and reports the declared count', () => {
    const { root } = mirror();
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[css-tokens] OK — every var() with no fallback resolves (2 properties declared).');
  });

  it('flags a phantom token with its reference count and sites', () => {
    const { root, assets } = mirror();
    add(assets, 'bad.css', '.x { color: var(--ghost); }\n.y { border-color: var(--ghost); }\n');
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[css-tokens] references to UNDECLARED custom properties.');
    expect(r.stderr).toContain('var(--ghost)  — 2 references, 0 declarations:');
    expect(r.stderr).toContain('app/src/main/assets/bad.css:1');
    expect(r.stderr).toContain('app/src/main/assets/bad.css:2');
  });

  it('does not flag a var() with a fallback', () => {
    const { root, assets } = mirror();
    add(assets, 'fb.css', '.x { color: var(--ghost, red); }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('does not flag the type-scale tokens check-type-scale owns', () => {
    const { root, assets } = mirror();
    add(assets, 'fs.css', '.x { font-size: var(--fs-99); }\n.y { font-size: var(--fsc-99); }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('counts a setProperty call as a declaration', () => {
    const { root, assets } = mirror();
    add(assets, 'runtime.js', "el.style.setProperty('--runtime', '10px');\n");
    add(assets, 'use.css', '.x { top: var(--runtime); }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('counts a declaration in index.html', () => {
    const { root, assets } = mirror();
    add(assets, 'index.html', '<style>:root { --boot: red; }</style>\n');
    add(assets, 'boot.css', '.x { color: var(--boot); }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('does not count a declaration inside a block comment', () => {
    const { root, assets } = mirror();
    add(assets, 'commented.css', '/* --gone: red; */\n.x { color: var(--gone); }\n');
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('var(--gone)');
  });

  it('does not count a reference inside a block comment', () => {
    const { root, assets } = mirror();
    add(assets, 'commented2.css', '/* color: var(--ghost2); */\n.x { color: var(--brand); }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('ignores references in .test. files and under dist/', () => {
    const { root, assets } = mirror();
    add(assets, 'foo.test.js', 'const s = "color: var(--ghost3)";\n');
    add(assets, 'dist/skip.css', '.x { color: var(--ghost4); }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('still counts a reference in a // line comment — only /* */ is stripped', () => {
    const { root, assets } = mirror();
    add(assets, 'linecomment.js', '// color: var(--lineghost)\nconst x = 1;\n');
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('var(--lineghost)');
  });

  it('counts a textual declaration — a quoted --name: in a JS string declares it', () => {
    const { root, assets } = mirror();
    add(assets, 'strdecl.js', "const s = '--str-decl: 1px';\n");
    add(assets, 'struse.css', '.x { color: var(--str-decl); }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });
});

/* check-type-scale — every font-size in the app must name a --fs-N / --fsc-N token.
   ─────────────────────────────────────────────────────────────────────────
   2026-08-04: 590 font-size declarations across 15 files used 103 distinct
   hand-picked values; they were snapped onto one 13-step ladder defined once
   in app.css :root. This gate keeps it that way: a literal rem/px font-size
   anywhere but the token block itself fails the build, and a reference to a
   token the ladder never declared fails too (an undeclared custom property
   silently becomes 'unset' at runtime — six phantom tokens shipped inert on
   2026-08-09).

   HOW: each case builds a throwaway tree with a fake app/src/main/assets
   (ladder + fixtures) and calls the gate's exported checkTypeScale(root)
   in-process. It used to spawn the gate once per case, which in the hook's
   fast run can wait 45-77 s whenever another vmThreads worker has a child
   running (a concurrent spawn on Windows inherits the gate's stdout pipe and
   spawnSync waits for it to close; seen on check-css-tokens 11-26). One case
   still runs the CLI, with its stdio in files. Fully offline, deterministic. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, openSync, closeSync, readFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkTypeScale } from './check-type-scale.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-type-scale.js');

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** The ladder the fake tree declares: three --fs-N steps with their frozen
 * --fsc-N twins, one declaration per line (each line is skipped by the
 * gate's TOKEN_DECL check, exactly like the real ladder in app.css), plus
 * the three calc(...% * var(--font-scale)) root rules the gate allows by
 * design — that IS the one setting, it cannot be one of its own steps. */
const LADDER = `:root {
  --fs-1: 0.5rem;
  --fsc-1: 8px;
  --fs-2: 0.75rem;
  --fsc-2: 12px;
  --fs-3: 1rem;
  --fsc-3: 16px;
}
html { font-size: calc(100% * var(--font-scale)); }
body { font-size: calc(100% * var(--font-scale)); }
:root { font-size: calc(100% * var(--font-scale)); }
`;

/** A throwaway repo root holding only what the gate reads: the ladder above
 * in app.css and one clean file that only references declared tokens.
 * Returns the root and its assets dir. */
function mirror() {
  const root = mkdtempSync(join(tmpdir(), 'vot-type-scale-'));
  mirrors.push(root);

  const assets = join(root, 'app', 'src', 'main', 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, 'app.css'), LADDER);
  writeFileSync(join(assets, 'main.css'),
    '/* clean: token references only */\n.a { font-size: var(--fs-2); }\n.b { font-size: var(--fsc-3); }\n');

  return { root, assets };
}

/** Add a fixture file under the mirror's assets dir, creating parents. */
function add(assets, rel, text) {
  const p = join(assets, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

const runGate = (root) => checkTypeScale(root);

describe('check-type-scale', () => {
  it('passes a clean tree and reports the declared count', () => {
    const { root } = mirror();
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\[type-scale\] OK — every font-size names a scale token, every token reference resolves \(6 declared\)\./);
  });

  it('flags a literal rem font-size in css with file and line', () => {
    const { root, assets } = mirror();
    add(assets, 'bad.css', '.x { font-size: 0.72rem; }\n');
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[type-scale] literal font-size values found');
    expect(r.stderr).toContain('app/src/main/assets/bad.css:1  font-size: 0.72rem');
  });

  it('flags a literal px fontSize in jsx', () => {
    const { root, assets } = mirror();
    add(assets, 'comp.jsx', 'export const s = { fontSize: "18px" };\n');
    const r = runGate(root);
    expect(r.status).toBe(1);
    // The gate's LITERAL regex ends at \b after px, so the closing quote is
    // not part of the reported match.
    expect(r.stderr).toContain('app/src/main/assets/comp.jsx:1  fontSize: "18px');
  });

  it('flags a literal px fontSize in js', () => {
    const { root, assets } = mirror();
    add(assets, 'style.js', "const s = { fontSize: '20px' };\n");
    const r = runGate(root);
    expect(r.status).toBe(1);
    // Same \b ending as the jsx case: the closing quote is not in the match.
    expect(r.stderr).toContain("app/src/main/assets/style.js:1  fontSize: '20px");
  });

  it('allows em font-sizes by design', () => {
    const { root, assets } = mirror();
    add(assets, 'em.css', '.x { font-size: 0.9em; }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('flags a reference to an undeclared token as a phantom', () => {
    const { root, assets } = mirror();
    add(assets, 'phantom.css', '.x { font-size: var(--fs-99); }\n');
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[type-scale] references to UNDECLARED scale tokens');
    expect(r.stderr).toContain('app/src/main/assets/phantom.css:1  var(--fs-99) is not declared');
  });

  it('ignores literals quoted inside block comments, single- and multi-line', () => {
    const { root, assets } = mirror();
    add(assets, 'commented.css',
      '/* doc: font-size: 14px is prose, not a violation */\n.x { color: red; }\n');
    add(assets, 'commented2.css',
      '/*\n  font-size: 14px\n  font-size: 1rem\n*/\n.x { font-size: var(--fs-1); }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('ignores literals under the skipped dirs (dist, data)', () => {
    const { root, assets } = mirror();
    add(assets, 'dist/skip.css', '.x { font-size: 14px; }\n');
    add(assets, 'data/skip.css', '.x { font-size: 14px; }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('ignores literals in .test. files', () => {
    const { root, assets } = mirror();
    add(assets, 'foo.test.js', "const s = { fontSize: '20px' };\n");
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('allows clamp() when both ends are tokens', () => {
    const { root, assets } = mirror();
    add(assets, 'clamp.css', '.x { font-size: clamp(var(--fs-1), 2vw, var(--fs-3)); }\n');
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('reports violations and phantoms together when both are present', () => {
    const { root, assets } = mirror();
    add(assets, 'bad.css', '.x { font-size: 0.72rem; }\n');
    add(assets, 'phantom.css', '.x { font-size: var(--fs-99); }\n');
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[type-scale] literal font-size values found');
    expect(r.stderr).toContain('[type-scale] references to UNDECLARED scale tokens');
    expect(r.stderr).toContain('app/src/main/assets/bad.css:1  font-size: 0.72rem');
    expect(r.stderr).toContain('app/src/main/assets/phantom.css:1  var(--fs-99) is not declared');
  });

  it('the CLI prints the report and exits 1 on a violation (run as pre-commit runs it)', () => {
    // One child, the one place the wiring (argv check, exit code, stderr) can break.
    // Its stdio goes to files, not pipes: spawnSync then waits only for the child to
    // exit, so a pipe handle inherited by another worker's concurrent child cannot hold it.
    const { root, assets } = mirror();
    mkdirSync(join(root, 'tools'));
    copyFileSync(GATE, join(root, 'tools', 'check-type-scale.js'));
    writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
    add(assets, 'bad.css', '.x { font-size: 0.72rem; }\n.y { font-size: var(--fs-99); }\n');
    const outFd = openSync(join(root, 'out.txt'), 'w');
    const errFd = openSync(join(root, 'err.txt'), 'w');
    let r;
    try {
      r = spawnSync(process.execPath, [join(root, 'tools', 'check-type-scale.js')], {
        cwd: root, stdio: ['ignore', outFd, errFd], timeout: 15000,
      });
    } finally { closeSync(outFd); closeSync(errFd); }
    expect(r.status).toBe(1);
    expect(readFileSync(join(root, 'out.txt'), 'utf8')).toBe('');
    const err = readFileSync(join(root, 'err.txt'), 'utf8');
    expect(err).toContain('app/src/main/assets/bad.css:1  font-size: 0.72rem');
    expect(err).toBe(checkTypeScale(root).stderr);
  });
});

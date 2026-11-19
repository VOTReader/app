/* check-app-size — the App() composition root must stay under its line budget.
   ─────────────────────────────────────────────────────────────────────────
   The gate resolves its own paths from import.meta.url and exports nothing,
   so each case mirrors the real tools/check-app-size.js into a throwaway
   repo tree with a fake app/src/main/assets/src/app.jsx of a chosen line
   count and runs the gate as a child process, exactly as pre-commit does.
   Fully offline, deterministic. Line count is wc -l semantics: the number
   of newlines, so an unterminated final line does not count. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-app-size.js');

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo mirror with the real gate + an app.jsx of `newlines`
 * newlines (`tail` is an unterminated final line when given; `eol` picks
 * the line ending; `writeApp: false` leaves app.jsx out entirely). */
function mirror({ newlines = 0, tail = '', eol = '\n', writeApp = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-app-size-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(GATE, join(toolsDir, 'check-app-size.js'));
  if (writeApp) {
    const srcDir = join(root, 'app', 'src', 'main', 'assets', 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'app.jsx'), ('x' + eol).repeat(newlines) + tail);
  }
  return { root };
}

function runGate(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-app-size.js')], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('check-app-size', () => {
  it('passes at exactly the budget and reports the count', () => {
    const { root } = mirror({ newlines: 800 });
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[check-app-size] app.jsx 800/800 lines — OK.');
  });

  it('fails one line over the budget with the extraction guidance', () => {
    const { root } = mirror({ newlines: 801 });
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[check-app-size] app.jsx is 801 lines — over the 800-line budget.');
    expect(r.stderr).toContain('extract the new concern into a hook');
    expect(r.stderr).toContain('under app/src/main/assets/src/hooks/');
    expect(r.stderr).toContain('ARCHITECTURE.md "P6 extraction workflow"');
  });

  it('passes an empty app.jsx', () => {
    const { root } = mirror();
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[check-app-size] app.jsx 0/800 lines — OK.');
  });

  it('does not count an unterminated final line', () => {
    const { root } = mirror({ newlines: 799, tail: 'last' });
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[check-app-size] app.jsx 799/800 lines — OK.');
  });

  it('counts CRLF the same as LF', () => {
    const { root } = mirror({ newlines: 800, eol: '\r\n' });
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[check-app-size] app.jsx 800/800 lines — OK.');
  });

  it('fails (non-zero) when app.jsx is missing — a crash, not a verdict', () => {
    const { root } = mirror({ writeApp: false });
    const r = runGate(root);
    expect(r.status).toBe(1);
  });
});

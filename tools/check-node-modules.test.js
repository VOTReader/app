/* n7-02: a checkout whose node_modules disagree with the lockfile is caught before its gates run. */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staleDeps } from './check-node-modules.js';

function checkout({ deps, locked, installed }) {
  const root = mkdtempSync(join(tmpdir(), 'nm-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: deps }));
  const packages = { '': {} };
  for (const [n, v] of Object.entries(locked)) packages[`node_modules/${n}`] = { version: v };
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
  for (const [n, v] of Object.entries(installed)) {
    mkdirSync(join(root, 'node_modules', n), { recursive: true });
    writeFileSync(join(root, 'node_modules', n, 'package.json'), JSON.stringify({ name: n, version: v }));
  }
  return root;
}

describe('staleDeps', () => {
  it('names a direct dependency installed at another version than the lockfile (the vitest 4 / 5 case)', () => {
    const root = checkout({
      deps: { vitest: '^5.0.1', '@vitest/coverage-v8': '^5.0.1', react: '^19.3.0' },
      locked: { vitest: '5.0.1', '@vitest/coverage-v8': '5.0.1', react: '19.3.0' },
      installed: { vitest: '4.1.11', '@vitest/coverage-v8': '4.1.11', react: '19.3.0' },
    });
    expect(staleDeps(root)).toEqual([
      { name: 'vitest', installed: '4.1.11', locked: '5.0.1' },
      { name: '@vitest/coverage-v8', installed: '4.1.11', locked: '5.0.1' },
    ]);
  });

  it('a missing package is stale; a matching checkout is clean', () => {
    expect(staleDeps(checkout({ deps: { a: '1' }, locked: { a: '1.0.0' }, installed: {} })))
      .toEqual([{ name: 'a', installed: 'missing', locked: '1.0.0' }]);
    expect(staleDeps(checkout({ deps: { a: '1' }, locked: { a: '1.0.0' }, installed: { a: '1.0.0' } }))).toEqual([]);
  });

  it('this checkout is clean (the suite itself runs on what the lockfile pins)', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    expect(staleDeps(root)).toEqual([]);
  });

  it('the hook stops when the globals mirror cannot be regenerated (n7-10), instead of committing a stale one', () => {
    const hook = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.githooks', 'pre-commit'), 'utf8');
    expect(hook).toMatch(/if ! npm run lint:globals >\/dev\/null 2>&1; then[\s\S]{0,300}exit 1/);
  });

  it('the commit hook runs it before any gate', () => {
    const hook = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.githooks', 'pre-commit'), 'utf8');
    const at = hook.indexOf('node tools/check-node-modules.js');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(hook.indexOf('# ─── Step 1: corpus data file validation'));
  });
});

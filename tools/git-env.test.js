/* vitest.setup.js strips every GIT_* variable before any test runs (network ln1, 2026-10-05): inside the pre-commit hook
   git exports GIT_DIR / GIT_INDEX_FILE, and a test's temp-repo `git init` / `git config` inherited them and rewrote the
   real repository's config (core.bare=true, user t). This holds the line for every test file. */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('tests never inherit a git hook environment', () => {
  it('no GIT_* variable reaches a test', () => {
    expect(Object.keys(process.env).filter((k) => k.startsWith('GIT_'))).toEqual([]);
  });

  it('a child process sees none either', () => {
    const out = execFileSync(process.execPath, ['-e', "console.log(Object.keys(process.env).filter((k) => k.startsWith('GIT_')).join(','))"], { encoding: 'utf8' });
    expect(out.trim()).toBe('');
  });
});

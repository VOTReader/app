/* vitest.setup.js strips every GIT_* variable before any test runs (network ln1, 2026-10-05): inside the pre-commit hook
   git exports GIT_DIR / GIT_INDEX_FILE, and a test's temp-repo `git init` / `git config` inherited them and rewrote the
   real repository's config (core.bare=true, user t). This holds the line for every test file. */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('tests never inherit a git hook environment', () => {
  it('no GIT_* variable reaches a test', () => {
    expect(Object.keys(process.env).filter((k) => k.startsWith('GIT_'))).toEqual([]);
  });

  /* The child reports through a file, with no stdio pipes (flake 2026-10-14 00:37, fast run). In the fast run every
     vmThreads worker is a thread of ONE Windows process, and libuv spawns with CreateProcess(bInheritHandles=TRUE): a
     child that another worker (or vitest itself, starting a forks-pool worker) creates while this spawn's stdout pipe
     exists inherits the pipe's write end. execFileSync waits for EOF on that pipe, so it waited for the unrelated,
     long-lived process to exit and ran past the 20 s test timeout. Measured beside a test file that starts 30 s
     children: the pipe version timed out in 5 of 10 fast runs (30.5 s each), this one in 0 of 20 (max 0.9 s). The
     default pool is immune (one process per file), which is why the hook's re-run was green. Nothing waits on a file. */
  it('a child process sees none either', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vot-git-env-'));
    try {
      const seen = join(dir, 'seen.txt');
      const script = "require('fs').writeFileSync(process.argv[1], Object.keys(process.env).filter((k) => k.startsWith('GIT_')).join(','))";
      execFileSync(process.execPath, ['-e', script, seen], { stdio: 'ignore', windowsHide: true });
      expect(readFileSync(seen, 'utf8')).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

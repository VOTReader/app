/* nw9b (network 2026-10-13): a test that is red in test:hook's fast run and green in the default-pool re-run used to
 * pass the push with only a console note, so flakes were retried, never fixed (readalong's W4 startMs 41001 vs 41000
 * slipped through at 03:42). record-flakes.js writes each one to D:/Swarm/flakes.jsonl and pages the pushing lane's
 * inbox once per test. */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { failedTests, recordFlakes } from './record-flakes.js';

const ROOT = 'D:/VOTReader-studio/.claude/worktrees/x';
const report = {
  numFailedTests: 2,
  testResults: [
    { name: `${ROOT}/app/src/main/assets/src/audio/restore.test.jsx`, status: 'failed', message: '',
      assertionResults: [
        { fullName: 'W4 restored bar takes the saved place', status: 'failed', failureMessages: ['expected 41001 to be 41000'] },
        { fullName: 'W4 restored bar keeps the passage', status: 'passed', failureMessages: [] },
      ] },
    { name: `${ROOT}/tools/ok.test.js`, status: 'passed', message: '', assertionResults: [{ fullName: 'fine', status: 'passed' }] },
    { name: `${ROOT}\\app\\src\\main\\assets\\src\\notes\\load.test.js`, status: 'failed',
      message: 'Error: Cannot find module ./x\n    at stack', assertionResults: [] },
  ],
};

function swarm(lanes = ['readalong']) {
  const dir = mkdtempSync(join(tmpdir(), 'flakes-'));
  for (const l of lanes) mkdirSync(join(dir, 'lanes', l), { recursive: true });
  return dir;
}
const lines = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean) : []);
const NOW = new Date(2026, 9, 13, 4, 12, 0);

describe('failedTests', () => {
  it('names each red test by repo-relative file and full name; a file that failed to load counts once', () => {
    expect(failedTests(report, ROOT)).toEqual([
      { file: 'app/src/main/assets/src/audio/restore.test.jsx', test: 'W4 restored bar takes the saved place' },
      { file: 'app/src/main/assets/src/notes/load.test.js', test: '(file failed: Error: Cannot find module ./x)' },
    ]);
  });

  it('an empty or green report names nothing', () => {
    expect(failedTests({}, ROOT)).toEqual([]);
    expect(failedTests({ testResults: [report.testResults[1]] }, ROOT)).toEqual([]);
  });
});

describe('recordFlakes', () => {
  const tests = failedTests(report, ROOT);

  it('appends one line per test to flakes.jsonl and pages the lane inbox once, naming the tests', () => {
    const dir = swarm();
    const r = recordFlakes({ tests, lane: 'readalong', sha: 'b48c6908aa', branch: 'ra3', swarmDir: dir, now: NOW });
    expect(r).toMatchObject({ recorded: 2, paged: 2 });
    const rows = lines(join(dir, 'flakes.jsonl')).map((l) => JSON.parse(l));
    expect(rows.map((x) => [x.lane, x.sha, x.branch, x.file, x.test])).toEqual([
      ['readalong', 'b48c6908aa', 'ra3', tests[0].file, tests[0].test],
      ['readalong', 'b48c6908aa', 'ra3', tests[1].file, tests[1].test],
    ]);
    expect(rows[0].at).toBe('2026-10-13T04:12:00');
    const inbox = lines(join(dir, 'lanes', 'readalong', 'inbox.md'));
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatch(/^04:12 test-hook: FLAKE /);
    expect(inbox[0]).toContain('restore.test.jsx > W4 restored bar takes the saved place');
    expect(inbox[0]).toContain('flakes.jsonl');
  });

  it('a test already in flakes.jsonl is recorded again but never pages twice', () => {
    const dir = swarm();
    recordFlakes({ tests: [tests[0]], lane: 'readalong', sha: 'a', branch: 'b', swarmDir: dir, now: NOW });
    const r = recordFlakes({ tests, lane: 'readalong', sha: 'c', branch: 'b', swarmDir: dir, now: NOW });
    expect(r).toMatchObject({ recorded: 2, paged: 1 });
    const inbox = lines(join(dir, 'lanes', 'readalong', 'inbox.md'));
    expect(inbox).toHaveLength(2);
    expect(inbox[1]).toContain('load.test.js');
    expect(inbox[1]).not.toContain('restore.test.jsx');
    expect(lines(join(dir, 'flakes.jsonl'))).toHaveLength(3);
  });

  it('no lane, or a lane with no folder (Corbin pushing by hand): recorded, nobody paged', () => {
    const dir = swarm([]);
    expect(recordFlakes({ tests, lane: '', sha: 'a', branch: 'b', swarmDir: dir, now: NOW })).toMatchObject({ recorded: 2, paged: 0 });
    expect(recordFlakes({ tests, lane: 'nobody', sha: 'a', branch: 'b', swarmDir: dir, now: NOW })).toMatchObject({ recorded: 2, paged: 0 });
    expect(existsSync(join(dir, 'lanes', 'nobody'))).toBe(false);
  });

  it('no swarm folder (CI, another machine): records nothing, never throws', () => {
    const r = recordFlakes({ tests, lane: 'readalong', sha: 'a', branch: 'b', swarmDir: join(tmpdir(), 'no-such-swarm-nw9b'), now: NOW });
    expect(r).toMatchObject({ recorded: 0, paged: 0 });
  });

  it('a torn line in flakes.jsonl is skipped, not fatal', () => {
    const dir = swarm();
    writeFileSync(join(dir, 'flakes.jsonl'), '{"file": "a", "te\n');
    expect(recordFlakes({ tests, lane: 'readalong', sha: 'a', branch: 'b', swarmDir: dir, now: NOW })).toMatchObject({ recorded: 2, paged: 2 });
  });
});

describe('test-hook.sh wiring', () => {
  const sh = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'test-hook.sh'), 'utf8');
  it('the fast run writes a JSON report, and only a green default-pool re-run records its reds as flakes', () => {
    expect(sh).toMatch(/VOT_VITEST_FAST=1 npx vitest run --reporter=default --reporter=json --outputFile\.json=\S+/);
    const rerun = sh.indexOf('run "npx vitest run" || exit 1');
    const record = sh.indexOf('node tools/record-flakes.js');
    expect(rerun).toBeGreaterThan(0);
    expect(record).toBeGreaterThan(rerun);
  });
});

/* clock-sweep — the sweep flags an unpinned real-clock test and passes a pinned one.
   ─────────────────────────────────────────────────────────────────────────
   The fixtures are models of the known Sunday case: ReadingPlansScreen
   `behind (2235)` started a plan 4 days ago on the real clock and read the
   week strip with getDay, so it went red on Sundays (tests-3 item 13; the
   network shuffle seed 20261122 caught the same case). The unpinned
   fixture below is that shape; the pinned one is the same shape with
   vi.useFakeTimers, the 211ca0ea7 fix.

   // clock-sweep-ignore — the fixtures hold clock patterns as data, not as
   // live clock reads; the sweep skips this file (see clock-sweep.mjs).
*/

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classifyFile, scanTree } from './clock-sweep.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'clock-sweep.mjs');

// The `behind` shape, unpinned: a plan started 4 days ago on the real
// clock, the week strip read with getDay.
const BEHIND_UNPINNED = `
import { describe, it, expect } from 'vitest';
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function lateRun() { return { startedAt: daysAgo(4) }; }
describe('plan', () => {
  it('behind: the week strip shows the missed days', () => {
    const run = lateRun();
    const today = new Date();
    const missed = [0, 1, 2, 3, 4, 5, 6].filter((d) => d < today.getDay());
    expect(missed.length).toBeGreaterThan(0);
  });
});
`;

// The same shape, pinned the 211ca0ea7 way (per-test fake timers).
const BEHIND_PINNED = `
import { describe, it, expect, vi } from 'vitest';
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function lateRun() { return { startedAt: daysAgo(4) }; }
describe('plan', () => {
  it('behind: the week strip shows the missed days', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-18T12:00:00') });
    try {
      const run = lateRun();
      const today = new Date();
      const missed = [0, 1, 2, 3, 4, 5, 6].filter((d) => d < today.getDay());
      expect(missed.length).toBeGreaterThan(0);
    } finally { vi.useRealTimers(); }
  });
});
`;

// Fixed dates and explicit UTC: no weekday dependence.
const FIXED_DATES = `
import { describe, it, expect } from 'vitest';
const d = new Date('2026-11-16T12:00:00');
const utc = Date.UTC(2026, 10, 16);
describe('dates', () => {
  it('a fixed Monday reads as Monday', () => {
    expect(d.getFullYear()).toBe(2026);
    expect(new Date(utc).getMonth()).toBe(10);
  });
});
`;

// A relative timestamp: Date.now() minus a duration, no weekday math.
const RELATIVE_TIMESTAMP = `
import { describe, it, expect } from 'vitest';
describe('recency', () => {
  it('an hour ago is recent', () => {
    const recent = Date.now() - 3600000;
    expect(Date.now() - recent).toBeLessThan(86400000);
  });
});
`;

// The streak shape: relative-day offsets from the real clock.
const STREAK_UNPINNED = `
import { describe, it, expect } from 'vitest';
function tsRelative(dayOffset) { return new Date(Date.now() + dayOffset * 86400000); }
describe('streak', () => {
  it('yesterday plus today is a 2-day streak', () => {
    const streak = [tsRelative(-1), tsRelative(0)];
    expect(streak.length).toBe(2);
  });
});
`;

// A daysAgo helper defined from a fixed anchor (plan-runs-edit-2310): the
// calls are fixed dates, not live reads.
const FIXED_ANCHOR_DAYSAGO = `
import { describe, it, expect } from 'vitest';
import FIX from './plan-runs-dc31d3e27.fixture.json';
const NOW = new Date(FIX.now);
const daysAgo = (n) => new Date(NOW.getTime() - n * 864e5);
describe('the plan keeps its pace', () => {
  it('a length is the whole plan', () => {
    const run = { startedAt: daysAgo(4) };
    expect(run.startedAt.getFullYear()).toBe(2026);
  });
});
`;

// A mocked streak store beside an unrelated live clock (useMarkAsRead):
// the streak word is a mock, the clock is a plan start, not streak math.
const MOCKED_STREAK_HOOK = `
import { describe, it, expect, vi } from 'vitest';
vi.mock('../stores/reading-streak-store.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real };
});
describe('useReadProgress — reading plans tick', () => {
  it('a completed read ticks the running plan', () => {
    const run = { startedAt: new Date(), pace: { mode: 'days', n: 3 } };
    expect(run.pace.n).toBe(3);
  });
  it('credits the CHAPTER key space and feeds the streak', () => {
    expect(window.ReadingStreakStore.recordReadingDay).toHaveBeenCalledTimes(1);
  });
});
`;

// Today as fixture data (replace-all / backup): lastEntryDate is 'today'
// so the streak subscriber sees a current entry; the assertions are
// relative-day, not weekday.
const FIXTURE_TODAY = `
import { describe, it, expect } from 'vitest';
describe('JournalStatsStore.replaceAll', () => {
  const _today = (() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  })();
  const payload = { totalEntries: 42, currentStreak: 7, lastEntryDate: _today };
  it('replaces the full stats object with a valid payload', () => {
    expect(payload.currentStreak).toBe(7);
    expect(payload.lastEntryDate).toBe(_today);
  });
});
`;

// Relative history timestamps (study-screens): Date.now() minus a
// duration, streaks only in mocked store gets.
const RELATIVE_HISTORY = `
import { describe, it, expect } from 'vitest';
put('ReadingStreakStore', mkStore({ get: () => ({}) }));
describe('axe — History', () => {
  it('populated, an older year opened', () => {
    const now = Date.now();
    const HISTORY = [
      { type: 'chapter', ts: now - 5 * 60000 },
      { type: 'chapter', ts: now - 400 * 86400000 },
    ];
    expect(HISTORY.length).toBe(2);
  });
});
`;

// A plan started today (MyProgressScreen): the plan's day-1 status is
// weekday-independent; the streaks are mocked stores.
const PLAN_STARTED_TODAY = `
import { describe, it, expect } from 'vitest';
globalThis.ReadingStreakStore = { get: () => ({ currentStreak: 12 }) };
describe('MyProgressScreen — reading plans', () => {
  it('a line per plan with its day and counts', () => {
    const today = todayKey(new Date());
    const run = startCatalogPlan('bible-year', null, new Date());
    expect(run.status).toBe('On track');
  });
});
`;

// The backstop still fires: a live clock inside a streak-named test.
const STREAK_SCOPED = `
import { describe, it, expect } from 'vitest';
describe('JournalStatsStore — recomputeFromLoad', () => {
  it('breaks streak when the last entry is stale', () => {
    const d = new Date();
    expect(d).toBeDefined();
  });
});
`;

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo mirror with the real gate + one test file of `content`. */
function mirror(content, name = 'a.test.js') {
  const root = mkdtempSync(join(tmpdir(), 'vot-clock-sweep-'));
  mirrors.push(root);
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(GATE, join(toolsDir, 'clock-sweep.mjs'));
  const srcDir = join(root, 'app', 'src', 'main', 'assets', 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, name), content);
  return { root };
}

function runGate(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'clock-sweep.mjs')], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('classifyFile', () => {
  it('flags the unpinned behind shape as WEEKDAY', () => {
    const r = classifyFile('ReadingPlansScreen.test.jsx', BEHIND_UNPINNED);
    expect(r.verdict).toBe('WEEKDAY');
    expect(r.hits.some((h) => h.kind === 'weekday')).toBe(true);
  });

  it('passes the pinned behind shape as SAFE', () => {
    const r = classifyFile('ReadingPlansScreen.test.jsx', BEHIND_PINNED);
    expect(r.verdict).toBe('SAFE');
  });

  it('passes fixed dates and explicit UTC as BENIGN', () => {
    const r = classifyFile('dates.test.js', FIXED_DATES);
    expect(r.verdict).toBe('BENIGN');
  });

  it('passes a relative timestamp as BENIGN', () => {
    const r = classifyFile('recency.test.js', RELATIVE_TIMESTAMP);
    expect(r.verdict).toBe('BENIGN');
  });

  it('flags the unpinned streak shape as WEEKDAY', () => {
    const r = classifyFile('reading-streak-store.test.js', STREAK_UNPINNED);
    expect(r.verdict).toBe('WEEKDAY');
  });

  it('passes a file with no clock hit as CLEAN', () => {
    const r = classifyFile('plain.test.js', "it('x', () => { expect(1).toBe(1); });\n");
    expect(r.verdict).toBe('CLEAN');
  });

  it('passes a daysAgo helper defined from a fixed anchor as BENIGN', () => {
    const r = classifyFile('plan-runs-edit-2310.test.jsx', FIXED_ANCHOR_DAYSAGO);
    expect(r.verdict).toBe('BENIGN');
  });

  it('passes a mocked streak store beside an unrelated live clock as BENIGN', () => {
    const r = classifyFile('useMarkAsRead.test.js', MOCKED_STREAK_HOOK);
    expect(r.verdict).toBe('BENIGN');
  });

  it('passes a today fixture date as BENIGN', () => {
    const r = classifyFile('replace-all.test.js', FIXTURE_TODAY);
    expect(r.verdict).toBe('BENIGN');
  });

  it('passes relative history timestamps as BENIGN', () => {
    const r = classifyFile('study-screens.axe.test.jsx', RELATIVE_HISTORY);
    expect(r.verdict).toBe('BENIGN');
  });

  it('passes a plan started today as BENIGN', () => {
    const r = classifyFile('MyProgressScreen.test.jsx', PLAN_STARTED_TODAY);
    expect(r.verdict).toBe('BENIGN');
  });

  it('flags a live clock inside a streak-named test as WEEKDAY', () => {
    const r = classifyFile('journal-stats-store.test.js', STREAK_SCOPED);
    expect(r.verdict).toBe('WEEKDAY');
  });

  it('flags a module-level live clock in a streak-named file as WEEKDAY', () => {
    const r = classifyFile('reading-streak-store.test.js', 'const d = new Date();');
    expect(r.verdict).toBe('WEEKDAY');
  });

  it('skips a file carrying the ignore marker', () => {
    const r = classifyFile('clock-sweep.test.js', '// clock-sweep-ignore\nconst d = new Date();\n');
    expect(r.verdict).toBe('IGNORED');
  });
});

describe('scanTree + CLI', () => {
  it('counts a mixed tree: 1 WEEKDAY, 1 SAFE, 1 BENIGN', () => {
    const root = mkdtempSync(join(tmpdir(), 'vot-clock-sweep-tree-'));
    mirrors.push(root);
    const srcDir = join(root, 'app', 'src', 'main', 'assets', 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'a.test.js'), BEHIND_UNPINNED);
    writeFileSync(join(srcDir, 'b.test.js'), BEHIND_PINNED);
    writeFileSync(join(srcDir, 'c.test.js'), FIXED_DATES);
    const { counts } = scanTree(root);
    expect(counts).toEqual({ SAFE: 1, BENIGN: 1, WEEKDAY: 1, CLEAN: 0, IGNORED: 0 });
  });

  it('counts a tree of only the triaged false positives: 0 WEEKDAY', () => {
    const root = mkdtempSync(join(tmpdir(), 'vot-clock-sweep-fp-'));
    mirrors.push(root);
    const srcDir = join(root, 'app', 'src', 'main', 'assets', 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'a.test.js'), FIXED_ANCHOR_DAYSAGO);
    writeFileSync(join(srcDir, 'b.test.js'), MOCKED_STREAK_HOOK);
    writeFileSync(join(srcDir, 'c.test.js'), FIXTURE_TODAY);
    writeFileSync(join(srcDir, 'd.test.js'), RELATIVE_HISTORY);
    writeFileSync(join(srcDir, 'e.test.js'), PLAN_STARTED_TODAY);
    const { counts } = scanTree(root);
    expect(counts).toEqual({ SAFE: 0, BENIGN: 5, WEEKDAY: 0, CLEAN: 0, IGNORED: 0 });
  });

  it('exits 0 for a tree holding only a fixed-anchor file', () => {
    const { root } = mirror(FIXED_ANCHOR_DAYSAGO);
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('0 WEEKDAY');
  });

  it('exits 1 and names the weekday file for an unpinned tree', () => {
    const { root } = mirror(BEHIND_UNPINNED);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('WEEKDAY');
    expect(r.stdout).toContain('a.test.js');
    expect(r.stderr).toContain('weekday-sensitive file(s) remain');
  });

  it('exits 0 for a pinned tree', () => {
    const { root } = mirror(BEHIND_PINNED);
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('0 WEEKDAY');
    expect(r.stdout).toContain('OK.');
  });

  it('exits 0 for a fixed-date tree', () => {
    const { root } = mirror(FIXED_DATES);
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('0 WEEKDAY');
  });
});

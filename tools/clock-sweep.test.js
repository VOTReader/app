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

/* titles-probe.mjs: the fuzzy-title probe — child-process test against the real
   corpus and the real open cases (read-only; the only write is --json to a temp
   file). The whole probe runs in ~2 s, so it fits in `npm test`. Counts are read
   from the same tri/cases.json the probe reads, never pinned: the admit rate
   moves with tuning. What is pinned: shape, rank/admit consistency, and the
   current clean state of zero false admissions (a regression gate). */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(fs.readFileSync(path.join(HERE, 'tri/cases.json'), 'utf8')).cases;
const open = CASES.filter((c) => !c.held);
const openTitles = open.filter((c) => c.style === 'title');
const openQuotes = open.filter((c) => c.style === 'exact' || c.style === 'misremembered');

let out;

beforeAll(() => {
  const tmp = path.join(os.tmpdir(), 'titles-probe-' + process.pid + '.json');
  const r = spawnSync(process.execPath, ['tools/search-bench/titles-probe.mjs', '--quiet', '--json', tmp], {
    cwd: path.join(HERE, '..', '..'), encoding: 'utf8', timeout: 60000,
  });
  expect(r.status).toBe(0);
  out = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.rmSync(tmp, { force: true });
}, 60000);

describe('titles-probe.mjs', () => {
  it('reports one row per open title case', () => {
    expect(out.rows).toHaveLength(openTitles.length);
    expect(new Set(out.rows.map((r) => r.id))).toEqual(new Set(openTitles.map((c) => c.id)));
    expect(out.times.n).toBe(openTitles.length + openQuotes.length);
    expect(typeof out.buildMs).toBe('number');
  });

  it('rank, admission and why are consistent', () => {
    for (const r of out.rows) {
      expect(typeof r.admitted).toBe('boolean');
      expect(typeof r.wrong).toBe('boolean');
      expect(r.rank === null || (r.rank >= 1 && r.rank <= 30)).toBe(true);
      if (r.admitted) { expect(r.admFirst).toBe(true); expect(r.rank).not.toBe(null); }
      if (r.wrong) expect(r.admitted).toBe(false);
      if (!r.admitted) expect(r.why.length).toBeGreaterThan(0);
    }
  });

  it('admits no title for open quote queries', () => {
    expect(out.falseRows).toEqual([]);
  });
});

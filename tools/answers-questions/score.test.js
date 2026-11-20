/* The Answers score bench, box side only (score.mjs --only box): the engine side needs the meaning
   model and stays a bench (npm run bench:answers, floor.json) — cases.test.js says the same. The box
   runs in seconds and its grades are deterministic, so the per-shape top-1/top-3 below are pinned:
   the box numbers recorded in floor.json's _comment (2026-11-04), re-measured 2026-11-19. A corpus
   change that moves a case re-pins them here with its reason, the way cases.test.js re-pins
   cases.json. Counts (set cases, hunt rows) are read from the inputs, not pinned. */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Box top-1/top-3 per shape, floor.json _comment, re-measured 2026-11-19. */
const BOX = {
  'title/words': [118, 120],
  'title/question': [61, 65],
  'title/short': [115, 119],
  'section/words': [94, 145],
  'section/question': [40, 68],
  'section/short': [49, 81],
  'hunt/sw-answers': [13, 17],
  'ALL set': [477, 598],
};

describe('answers score, box', () => {
  it('scores the whole set with the box matcher and writes the graded json', () => {
    const set = JSON.parse(readFileSync(resolve(HERE, 'cases.json'), 'utf8')).cases;
    const hunt = JSON.parse(readFileSync(resolve(HERE, '../search-bench/hunt/cases.json'), 'utf8')).cases
      .filter((c) => c.family === 'sw-answers' && !c.held);
    const dir = mkdtempSync(join(tmpdir(), 'answers-score-'));
    const out = join(dir, 'score.json');
    const stdout = execFileSync(process.execPath, [resolve(HERE, 'score.mjs'), '--only', 'box', '--json', out], { encoding: 'utf8' });
    expect(stdout).toContain(`${set.length} set cases + ${hunt.length} sw-answers rows; engine meaning off`);
    const d = JSON.parse(readFileSync(out, 'utf8'));
    expect(d.meaning).toBe('off');
    expect(d.rows).toHaveLength(set.length + hunt.length);
    expect(d.summary['ALL set'].n).toBe(set.length);
    for (const [shape, [top1, top3]] of Object.entries(BOX)) {
      expect(d.summary[shape].box.top1).toBe(top1, shape);
      expect(d.summary[shape].box.top3).toBe(top3, shape);
    }
    for (const r of d.rows) {
      expect(r.box === null || (Number.isInteger(r.box) && r.box >= 1)).toBe(true);
      if (r.box !== null) expect(r.boxTop).toMatch(/@\d+$/);
    }
  }, 60000);
});

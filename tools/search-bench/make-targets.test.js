/* make-targets — seeded, stratified pick of the 500 search-benchmark targets.
   The script exports nothing and loads the real corpus at top level
   (top-level await buildDocs/buildBlocks in corpus.mjs), so there is no
   fixture seam: each case runs it as a child process with --seed and --out
   to a temp file, exactly as the check-app-size / _audit-dump-app precedent
   does. The runs are slow (~65s each: full corpus build + 500 picks), so
   beforeAll runs the three invocations once (same seed twice, one other
   seed) and the cases assert on the parsed outputs. --out is always a temp
   path, so the shipped tools/search-bench/targets.json is never written.
   Fully offline. */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from '../test-spawn.js'; // file stdio: no pipe another worker's child can hold
import { mkdtempSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, 'make-targets.mjs');
const SHIPPED = resolve(HERE, 'targets.json');
const SEED = 20261005;
const OTHER_SEED = 20261006;

const words = (s) => (String(s).match(/\S+/g) || []).length;

// PLAN quotas in make-targets.mjs (search-plan.md section 3): 500 targets, 10 styles.
const GROUP_COUNTS = { bible: 110, letters: 190, words: 80, answers: 60, studies: 40, cross: 20 };
const GROUP_STYLE_COUNTS = {
  'bible:crossover': 40, 'bible:exact': 15, 'bible:misremembered': 15, 'bible:paraphrase': 20, 'bible:rare': 10, 'bible:typos': 10,
  'letters:middle': 25, 'letters:title': 15, 'letters:firstwords': 25, 'letters:exact': 30, 'letters:misremembered': 30, 'letters:paraphrase': 30, 'letters:rare': 20, 'letters:gist': 10, 'letters:typos': 5,
  'words:title': 8, 'words:exact': 15, 'words:misremembered': 15, 'words:paraphrase': 15, 'words:rare': 10, 'words:gist': 10, 'words:typos': 7,
  'answers:middle': 25, 'answers:title': 7, 'answers:exact': 7, 'answers:misremembered': 7, 'answers:paraphrase': 5, 'answers:rare': 5, 'answers:gist': 4,
  'studies:title': 5, 'studies:exact': 8, 'studies:misremembered': 8, 'studies:paraphrase': 5, 'studies:rare': 5, 'studies:gist': 6, 'studies:typos': 3,
  'cross:unitgist': 20,
};
// firstwords takes the opening sentence (min 6 words, no upper bound) and gist
// takes the longest sentence of a block: neither goes through sentenceTarget's
// 8-40 word filter, so the word-count bound does not apply to them.
const UNBOUNDED_STYLES = new Set(['firstwords', 'gist']);

let tmp;
let runA; // --seed SEED, first run
let runB; // --seed SEED, second run
let runC; // --seed OTHER_SEED
let shippedBefore;

function run(seed, out) {
  const r = spawnSync(process.execPath, [SCRIPT, '--seed', String(seed), '--out', out], {
    encoding: 'utf8', cwd: tmp, timeout: 150000,
  });
  if (r.status !== 0) throw new Error('make-targets exited ' + r.status + ': ' + (r.stderr || r.stdout || '').slice(-2000));
  return JSON.parse(readFileSync(out, 'utf8'));
}

describe('make-targets', () => {
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'vot-targets-'));
    shippedBefore = existsSync(SHIPPED) ? statSync(SHIPPED).mtimeMs : null;
    runA = run(SEED, join(tmp, 'a.json'));
    runB = run(SEED, join(tmp, 'b.json'));
    runC = run(OTHER_SEED, join(tmp, 'c.json'));
  }, 480000);

  afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

  it('same seed gives the same 500 targets', () => {
    expect(runB).toEqual(runA);
  });

  it('a different seed picks a different set', () => {
    expect(JSON.stringify(runC.targets)).not.toBe(JSON.stringify(runA.targets));
  });

  it('500 targets, ids t001..t500, seed recorded', () => {
    expect(runA.seed).toBe(SEED);
    expect(runA.targets).toHaveLength(500);
    expect(runA.targets.map((t) => t.id)).toEqual(
      Array.from({ length: 500 }, (_, i) => 't' + String(i + 1).padStart(3, '0')),
    );
  });

  it('group quotas match PLAN', () => {
    const counts = {};
    for (const t of runA.targets) counts[t.group] = (counts[t.group] || 0) + 1;
    expect(counts).toEqual(GROUP_COUNTS);
  });

  it('style quotas match PLAN per group', () => {
    const counts = {};
    for (const t of runA.targets) { const k = t.group + ':' + t.style; counts[k] = (counts[k] || 0) + 1; }
    expect(counts).toEqual(GROUP_STYLE_COUNTS);
  });

  it('exactly 100 held out', () => {
    expect(runA.targets.filter((t) => t.held)).toHaveLength(100);
    for (const t of runA.targets) expect(typeof t.held).toBe('boolean');
  });

  it('every target carries its required fields', () => {
    for (const t of runA.targets) {
      for (const k of ['id', 'group', 'col', 'collection', 'style', 'level', 'uk', 'held']) {
        expect(t[k], t.id + ' missing ' + k).not.toBeUndefined();
      }
    }
  });

  it('sentence targets are unique and 8-40 words', () => {
    const keys = new Set();
    for (const t of runA.targets) {
      if (!t.sentence) continue;
      const key = t.uk + '#' + t.sentence;
      expect(keys.has(key), 'duplicate sentence target ' + t.id).toBe(false);
      keys.add(key);
      if (!UNBOUNDED_STYLES.has(t.style)) {
        const w = words(t.sentence);
        expect(w, t.id + ' ' + t.style + ' has ' + w + ' words').toBeGreaterThanOrEqual(8);
        expect(w, t.id + ' ' + t.style + ' has ' + w + ' words').toBeLessThanOrEqual(40);
      }
    }
  });

  it('--out writes only the given file', () => {
    expect(existsSync(join(tmp, 'targets.json'))).toBe(false);
    const after = existsSync(SHIPPED) ? statSync(SHIPPED).mtimeMs : null;
    expect(after).toBe(shippedBefore);
  });
});

/**
 * tools/search-bench/check-queries.test.js — tests for tools/search-bench/check-queries.mjs.
 *
 * The script runs at import, exports nothing, and reads the real corpus
 * (buildDocs('nkjv'), seconds-scale), so each case mirrors it as a child
 * process with a fixture writers dir and a fixture --targets file, exactly
 * as a writer runs it. --freeze is only ever run with rejections present,
 * which exits before writing, so the real cases.json is never touched;
 * the test hashes it before and after to prove that.
 * Precedent: tools/check-app-size.test.js, tools/sync-sw-version.test.js.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from '../test-spawn.js'; // file stdio: no pipe another worker's child can hold
import { createHash } from 'node:crypto';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, 'check-queries.mjs');
const REAL_CASES = resolve(HERE, 'cases.json');

const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function fixture(queries, targets) {
  const dir = mkdtempSync(join(tmpdir(), 'check-queries-'));
  dirs.push(dir);
  const writers = join(dir, 'writers');
  mkdirSync(writers);
  writeFileSync(join(writers, 'w1.json'), JSON.stringify(queries));
  const targetsFile = join(dir, 'targets.json');
  writeFileSync(targetsFile, JSON.stringify({ targets }));
  return { writers, targetsFile };
}

function run(writers, targetsFile, extra = []) {
  return spawnSync(process.execPath, [SCRIPT, writers, '--targets', targetsFile, ...extra], { encoding: 'utf8' });
}

function rejections(out) {
  return out.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
}

const CLEAN_QUERIES = [
  { id: 'p-ok', q: 'gathering the flock when morning comes' },
  { id: 'e-ok', q: 'god so loved the world that he gave' },
  { id: 'r-ok', q: 'zxqvw blorp' },
  { id: 'ck-ok', q: 'only begotten son' },
  { id: 'cr-ok', q: 'yahushua heals the broken hearted' },
  { id: 't-ok', q: 'truth absolute explained' },
  { id: 'y-ok', q: 'zxqvw blorp' },
];
const CLEAN_TARGETS = [
  { id: 'p-ok', style: 'paraphrase', level: 'sentence', uk: 'v1/a', sentence: 'the shepherd gathers the flock at dawn beside still waters' },
  { id: 'e-ok', style: 'exact', level: 'sentence', uk: 'bible/john:3:16', sentence: 'for god so loved the world that he gave his only begotten son' },
  { id: 'r-ok', style: 'rare', level: 'sentence', uk: 'v1/a', sentence: 'the zxqvw blorp rests beside the quiet river stone' },
  { id: 'ck-ok', style: 'crossover', variant: 'kjv', level: 'sentence', uk: 'bible/john:3:16', sentence: 'for god so loved the world', kjv: 'for god so loved the world that he gave his only begotten son' },
  { id: 'cr-ok', style: 'crossover', variant: 'restored-names', level: 'sentence', uk: 'v1/a', sentence: 'he heals the broken hearted and binds their wounds' },
  { id: 't-ok', style: 'title', level: 'sentence', uk: 'v1/a', sentence: 'x', title: 'The Truth Absolute' },
  { id: 'y-ok', style: 'typos', level: 'sentence', uk: 'v1/a', sentence: 'the lord is good to all who trust him' },
];

const BAD_QUERIES = [
  { id: 'p-copy', q: 'the shepherd gathers the flock at dawn' },
  { id: 'e-notrun', q: 'god so loved the moon that he gave' },
  { id: 'e-words', q: 'god so loved the' },
  { id: 'r-words', q: 'zxqvw' },
  { id: 'r-notin', q: 'zxqvw quux' },
  { id: 'ck-nokjv', q: 'god so loved' },
  { id: 'cr-noname', q: 'jesus heals the broken hearted' },
  { id: 't-exact', q: 'the truth absolute' },
  { id: 'y-notypo', q: 'the lord is good' },
];
const BAD_TARGETS = [
  { id: 'p-copy', style: 'paraphrase', level: 'sentence', uk: 'v1/a', sentence: 'the shepherd gathers the flock at dawn beside still waters' },
  { id: 'e-notrun', style: 'exact', level: 'sentence', uk: 'bible/john:3:16', sentence: 'for god so loved the world that he gave his only begotten son' },
  { id: 'e-words', style: 'exact', level: 'sentence', uk: 'bible/john:3:16', sentence: 'for god so loved the world that he gave his only begotten son' },
  { id: 'r-words', style: 'rare', level: 'sentence', uk: 'v1/a', sentence: 'the zxqvw blorp rests beside the quiet river stone' },
  { id: 'r-notin', style: 'rare', level: 'sentence', uk: 'v1/a', sentence: 'the zxqvw blorp rests beside the quiet river stone' },
  { id: 'ck-nokjv', style: 'crossover', variant: 'kjv', level: 'sentence', uk: 'bible/john:3:16', sentence: 'for god so loved the world', kjv: 'for god so loved the world that he gave his only begotten son' },
  { id: 'cr-noname', style: 'crossover', variant: 'restored-names', level: 'sentence', uk: 'v1/a', sentence: 'he heals the broken hearted and binds their wounds' },
  { id: 't-exact', style: 'title', level: 'sentence', uk: 'v1/a', sentence: 'x', title: 'The Truth Absolute' },
  { id: 'y-notypo', style: 'typos', level: 'sentence', uk: 'v1/a', sentence: 'the lord is good to all who trust him' },
  { id: 'm-missing', style: 'paraphrase', level: 'sentence', uk: 'v1/a', sentence: 'the shepherd gathers the flock at dawn beside still waters' },
];

describe('check-queries', () => {
  it('a clean set passes: 7 queries, 0 rejected', () => {
    const { writers, targetsFile } = fixture(CLEAN_QUERIES, CLEAN_TARGETS);
    const out = run(writers, targetsFile);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('7 queries, 0 rejected');
    expect(rejections(out)).toEqual([]);
  }, 120000);

  it('each style rejects for its own reason, and a missing query is missing', () => {
    const { writers, targetsFile } = fixture(BAD_QUERIES, BAD_TARGETS);
    const out = run(writers, targetsFile);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('9 queries, 10 rejected');
    const byId = new Map(rejections(out).map((r) => [r.id, r.why]));
    expect(byId.get('p-copy')).toBe('copies more than 5 consecutive words');
    expect(byId.get('e-notrun')).toBe('not a run of the sentence');
    expect(byId.get('e-words')).toBe('4 words');
    expect(byId.get('r-words')).toBe('1 words');
    expect(byId.get('r-notin')).toBe('not in the sentence');
    expect(byId.get('ck-nokjv')).toBe('no KJV-only word');
    expect(byId.get('cr-noname')).toBe('no YahuShua');
    expect(byId.get('t-exact')).toBe('the exact title');
    expect(byId.get('y-notypo')).toBe('no typo');
    expect(byId.get('m-missing')).toBe('missing');
  }, 120000);

  it('--freeze with rejections exits 1 and leaves the real cases.json untouched', () => {
    const before = createHash('sha256').update(readFileSync(REAL_CASES)).digest('hex');
    const { writers, targetsFile } = fixture(BAD_QUERIES, BAD_TARGETS);
    const out = run(writers, targetsFile, ['--freeze']);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('not frozen: rejections remain');
    const after = createHash('sha256').update(readFileSync(REAL_CASES)).digest('hex');
    expect(after).toBe(before);
  }, 120000);
});

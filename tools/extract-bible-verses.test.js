/**
 * extract-bible-verses --all (sweep-2 n7-04, 2026-09-25): validate-bible-sync reads
 * a books.js edition from ONE extractor run instead of 1,189. Its verses must be
 * the per-chapter call's verses exactly, or the validator hashes different text
 * than the belts were stamped with. Measured before landing: nkjv 1,189 +
 * vot-matthew 28 + 80 sampled kjv/web chapters, old per-chapter extractor vs
 * --all, 0 differ. This pins a few chapters of each branch.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = resolve(dirname(fileURLToPath(import.meta.url)), 'extract-bible-verses.mjs');
let tmp;
const run = (...args) => execFileSync(process.execPath, [TOOL, ...args], { encoding: 'utf-8' });
const all = (translation) => {
  const out = join(tmp, `all.${translation}.json`);
  run('--all', out, '--translation', translation);
  return JSON.parse(readFileSync(out, 'utf-8'));
};
const one = (book, ch, translation) => {
  const out = join(tmp, `${book}-${ch}.${translation}.json`);
  run(book, String(ch), out, '--translation', translation);
  return JSON.parse(readFileSync(out, 'utf-8')).verses;
};

beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), 'extract-all-')); });
afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('extract-bible-verses --all', () => {
  it('nkjv: every book incl. matthew (matthew-plain.js), same verses as one chapter at a time', () => {
    const m = all('nkjv');
    expect(Object.keys(m)).toHaveLength(66);
    expect(Object.values(m).reduce((s, b) => s + Object.keys(b).length, 0)).toBe(1189);
    for (const [b, c] of [['genesis', 1], ['psalms', 119], ['matthew', 5], ['revelation', 22]]) {
      expect(m[b][String(c)]).toEqual(one(b, c, 'nkjv'));
    }
  }, 60000);

  it('vot-matthew: the one book, same verses as one chapter', () => {
    const m = all('vot-matthew');
    expect(Object.keys(m)).toEqual(['matthew']);
    expect(m.matthew['1']).toEqual(one('matthew', 1, 'vot-matthew'));
  }, 60000);

  it('a flat-map translation keys matthew-plain as the audio id "matthew"', () => {
    const m = all('kjv');
    expect(m['matthew-plain']).toBeUndefined();
    expect(m.matthew['28']).toEqual(one('matthew', 28, 'kjv'));
  }, 60000);

  it('usage errors still exit 1', () => {
    expect(spawnSync(process.execPath, [TOOL, '--all'], { encoding: 'utf-8' }).status).toBe(1);
    expect(spawnSync(process.execPath, [TOOL, 'genesis', '99', join(tmp, 'x.json')], { encoding: 'utf-8' }).status).toBe(1);
  });
});

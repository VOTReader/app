/* search200 bugcheck #8: the synonym table is built last-group-wins, so a word in two groups ("adversary", in the
   Satan group and the enemy group) read only the last group, and the first group's words reached a group that did
   not list them back. A named passage key in two entries ("creation", Genesis 1 and Genesis 1-2) opened one
   passage typed exactly and the other typed any other way. Every key belongs to one group and one passage. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

let D;
let prev;
beforeAll(async () => {
  prev = window.VotSearchData;
  // @ts-ignore -- a classic script: it sets window.VotSearchData
  await import('../../search-data.js');
  D = /** @type {any} */ (window).VotSearchData;
});
afterAll(() => { window.VotSearchData = prev; });

describe('search-data: no key in two places', () => {
  it('each synonym group is the group of every word in it', () => {
    const torn = [];
    for (const k of Object.keys(D.SYNONYM_MAP)) {
      for (const w of D.SYNONYM_MAP[k]) if (D.SYNONYM_MAP[w.toLowerCase()] !== D.SYNONYM_MAP[k]) torn.push(k + ' -> ' + w);
    }
    expect(torn).toEqual([]);
  });
  it('no named passage key names two passages', () => {
    const seen = new Map();
    const dup = [];
    for (const np of D.NAMED_PASSAGES) {
      for (const k of np.keys) {
        const key = k.toLowerCase();
        if (seen.has(key) && seen.get(key) !== np) dup.push(key);
        seen.set(key, np);
      }
    }
    expect(dup).toEqual([]);
  });
});

// @ts-nocheck
/* letter-linking — linkWtlbEntries chains a WTLB-shaped collection in array order; Answers chains in
   the SITE's order (AOGCG Topic stage, brief 3.4, U3): the Main Page first, then the sidebar's 120
   topics, Flat Earth handing on to the False Doctrines index. The Main Page is appended LAST to
   ANSWERS (c72) so no topic's paragraph index moves, so array order would be wrong there. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { linkWtlbEntries } from './letter-linking.js';

const E = (id) => ({ id, title: id.toUpperCase() });

describe('linkWtlbEntries', () => {
  it('links neighbours in array order, the ends open', () => {
    const arr = [E('a'), E('b'), E('c')];
    linkWtlbEntries(arr);
    expect(arr.map((e) => [e.prevEntry && e.prevEntry.id, e.nextEntry && e.nextEntry.id]))
      .toEqual([[null, 'b'], ['a', 'c'], ['b', null]]);
    expect(arr[1].nextEntry).toEqual({ id: 'c', title: 'C' });
  });

  describe('Answers: the site\'s own order', () => {
    const ctx = {};
    runInNewContext(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'answers.js'), 'utf8'), ctx);
    const A = ctx.ANSWERS.map((e) => ({ ...e }));
    linkWtlbEntries(A);
    const by = (id) => A.find((e) => e.id === id);
    const pn = (id) => { const e = by(id); return [e.prevEntry && e.prevEntry.id, e.nextEntry && e.nextEntry.id]; };

    it('opens at the Main Page, then THERE IS NO OTHER', () => {
      expect(pn('answers-main-page')).toEqual([null, 'there-is-no-other']);
      expect(pn('there-is-no-other')[0]).toBe('answers-main-page');
    });

    it('reads The Volumes of Truth after God Speaks Regarding Covetousness (U3)', () => {
      expect(pn('answers-the-volumes-of-truth')[0]).toBe('god-speaks-regarding-covetousness');
    });

    it('hands Flat Earth on to the False Doctrines index, which has no Next', () => {
      expect(pn('regarding-the-flat-earth-theory')[1]).toBe('false-doctrines-within-the-churches-of-men-regarding');
      expect(pn('false-doctrines-within-the-churches-of-men-regarding')).toEqual(['regarding-the-flat-earth-theory', null]);
    });

    it('never makes the appended Main Page the neighbour of the page before it in the array', () => {
      const beforeMain = A[A.length - 2].id;
      expect(pn(beforeMain)[1]).not.toBe('answers-main-page');
    });
  });
});

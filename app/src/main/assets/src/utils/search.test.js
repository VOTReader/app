import { describe, it, expect } from 'vitest';
import {
  srchGroupKey, SRCH_FILTER_CATS, srchFilterCategories, srchApplyFilter, srchSortCanonical,
} from './search.js';

/* srchGroupKey buckets a FlexSearch result doc by its source collection so
   SearchScreen can render "Volume Three (12)", "Matthew (3)", etc. It's a pure
   branch-mapping function (the doc `kind` is the discriminator; `bookId`/`volumeId`
   refine it) and was previously 0% covered though it sits in the measured utils/
   scope. Every branch is pinned here. */
describe('srchGroupKey', () => {
  it('null / missing doc → "other"', () => {
    expect(srchGroupKey(null)).toBe('other');
    expect(srchGroupKey(undefined)).toBe('other');
    expect(srchGroupKey({})).toBe('other');           // no kind
  });

  it('verse kinds split matthew vs the rest of the bible by bookId', () => {
    expect(srchGroupKey({ kind: 'verse', bookId: 'matthew' })).toBe('matthew');
    expect(srchGroupKey({ kind: 'verse', bookId: 'genesis' })).toBe('bible');
    expect(srchGroupKey({ kind: 'chapter-title', bookId: 'john' })).toBe('bible');
    expect(srchGroupKey({ kind: 'heading', bookId: 'matthew' })).toBe('matthew');
    expect(srchGroupKey({ kind: 'heading' })).toBe('bible');   // no bookId → not matthew
  });

  it('letter kinds use volumeId, falling back to "letters"', () => {
    expect(srchGroupKey({ kind: 'letter', volumeId: 'volume-three' })).toBe('volume-three');
    expect(srchGroupKey({ kind: 'letter-title', volumeId: 'rebuke' })).toBe('rebuke');
    expect(srchGroupKey({ kind: 'letter' })).toBe('letters');          // no volumeId
  });

  it('wtlb kinds use volumeId, falling back to "wtlb"', () => {
    expect(srchGroupKey({ kind: 'wtlb', volumeId: 'wtlb1' })).toBe('wtlb1');
    expect(srchGroupKey({ kind: 'wtlb-title', volumeId: 'wtlb2' })).toBe('wtlb2');
    expect(srchGroupKey({ kind: 'wtlb' })).toBe('wtlb');               // no volumeId
  });

  it('blessed / holy-day / bible-study → fixed keys', () => {
    expect(srchGroupKey({ kind: 'blessed' })).toBe('blessed');
    expect(srchGroupKey({ kind: 'blessed-title' })).toBe('blessed');
    expect(srchGroupKey({ kind: 'holy-day' })).toBe('holydays');
    expect(srchGroupKey({ kind: 'holy-day-title' })).toBe('holydays');
    expect(srchGroupKey({ kind: 'bible-study' })).toBe('bible-studies');
  });

  it('an unrecognized kind → "other"', () => {
    expect(srchGroupKey({ kind: 'mystery' })).toBe('other');
  });
});

/* FABLE5 [8] — result-filter chips + canonical verse sort. Client-side
   views over the fetched result set; wrongness here silently hides or
   scrambles results, so every contract is pinned. */
describe('srchFilterCategories', () => {
  const g = (key, n) => ({ key, items: new Array(n).fill({}) });

  it('reports present categories with summed counts, in chip order', () => {
    const cats = srchFilterCategories([g('bible', 3), g('v2', 2), g('timothy', 1), g('wtlb1', 4)]);
    expect(cats).toEqual([
      { id: 'scriptures', label: 'Scriptures', count: 3 },
      { id: 'volumes', label: 'Volumes', count: 3 },
      { id: 'wtlb', label: 'WTLB', count: 4 },
    ]);
  });

  it('returns [] when 0 or 1 category is present (chips would be noise)', () => {
    expect(srchFilterCategories([])).toEqual([]);
    expect(srchFilterCategories([g('bible', 5), g('matthew', 2)])).toEqual([]);
  });

  it('every SRCH_GROUP_META-style key except hidden-manna/other is claimed by a category', () => {
    const claimed = new Set(SRCH_FILTER_CATS.flatMap((c) => c.keys));
    for (const k of ['bible', 'matthew', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7',
      'timothy', 'flock', 'rebuke', 'letters', 'holydays', 'wtlb1', 'wtlb2',
      'blessed', 'bible-studies', 'matthew-study']) {
      expect(claimed.has(k)).toBe(true);
    }
    expect(claimed.has('hidden-manna')).toBe(false);
  });
});

describe('srchApplyFilter', () => {
  const groups = [
    { key: 'bible', items: [1] }, { key: 'v2', items: [2] }, { key: 'other', items: [3] },
  ];

  it("'all' (or unknown category) passes everything through, including 'other'", () => {
    expect(srchApplyFilter(groups, 'all')).toBe(groups);
    expect(srchApplyFilter(groups, 'nope')).toBe(groups);
  });

  it('a category keeps only its groups', () => {
    expect(srchApplyFilter(groups, 'scriptures').map((g) => g.key)).toEqual(['bible']);
    expect(srchApplyFilter(groups, 'volumes').map((g) => g.key)).toEqual(['v2']);
  });
});

describe('srchSortCanonical', () => {
  const idx = new Map([['genesis', 0], ['psalms', 18], ['john', 42]]);
  const v = (bookId, ch, vs) => ({ doc: { kind: 'verse', bookId, chapterNum: ch, verseNum: vs } });

  it('sorts by (book, chapter, verse); input array untouched', () => {
    const items = [v('john', 3, 16), v('genesis', 2, 1), v('genesis', 1, 3), v('psalms', 23, 1)];
    const sorted = srchSortCanonical(items, idx);
    expect(sorted.map((e) => e.doc.bookId + ' ' + e.doc.chapterNum + ':' + e.doc.verseNum))
      .toEqual(['genesis 1:3', 'genesis 2:1', 'psalms 23:1', 'john 3:16']);
    expect(items[0].doc.bookId).toBe('john'); // original order intact
  });

  it('unmappable docs sink to the end, keeping relative order (stable)', () => {
    const a = { doc: { kind: 'chapter-title' } };
    const b = { doc: { kind: 'verse', bookId: 'not-a-book' } };
    const sorted = srchSortCanonical([a, v('genesis', 1, 1), b], idx);
    expect(sorted[0].doc.bookId).toBe('genesis');
    expect(sorted[1]).toBe(a);
    expect(sorted[2]).toBe(b);
  });

  it('empty map = order unchanged', () => {
    const items = [v('john', 3, 16), v('genesis', 1, 1)];
    expect(srchSortCanonical(items, new Map())).toEqual(items);
  });
});

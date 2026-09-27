import { describe, it, expect } from 'vitest';
import {
  srchGroupKey, srchSortCanonical,
  SRCH_CANONICAL_BOOK_INDEX,
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

/* FABLE5 [8] — canonical verse sort. A client-side view over the fetched
   result set; wrongness here silently scrambles results, so every contract
   is pinned. (The result-filter chips and their helpers left 2026-09-13.) */
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

  /* Brianna (2026-09-26): Book order puts the LETTERS in order too. */
  it('orders a collection’s letters, entries and topics by their number, the preface (0) first', () => {
    const L = (num, kind = 'letter') => ({ doc: { kind, letterNum: num, volumeId: 'v7' } });
    const sorted = srchSortCanonical([L(55), L(9), L(37), L(0), L(53)], idx);
    expect(sorted.map((e) => e.doc.letterNum)).toEqual([0, 9, 37, 53, 55]);
    expect(srchSortCanonical([L(95, 'wtlb'), L(12, 'wtlb')], idx).map((e) => e.doc.letterNum)).toEqual([12, 95]);
    expect(srchSortCanonical([L(88, 'answers'), L(3, 'answers')], idx).map((e) => e.doc.letterNum)).toEqual([3, 88]);
  });

  it('orders study chapters by study (as they first appear), then by chapter', () => {
    const S = (study, ch) => ({ doc: { kind: 'bible-study', letterId: study, chapterNum: ch } });
    const sorted = srchSortCanonical([S('purity', 4), S('lamb', 2), S('purity', 1), S('lamb', 1)], idx);
    expect(sorted.map((e) => e.doc.letterId + ' ' + e.doc.chapterNum)).toEqual(['purity 1', 'purity 4', 'lamb 1', 'lamb 2']);
  });

  it('empty map = order unchanged', () => {
    const items = [v('john', 3, 16), v('genesis', 1, 1)];
    expect(srchSortCanonical(items, new Map())).toEqual(items);
  });
});

describe('SRCH_CANONICAL_BOOK_INDEX (constant — never the lazy corpus)', () => {
  it('covers the whole canon, in order, with matthew sharing matthew-plain\'s slot', () => {
    expect(SRCH_CANONICAL_BOOK_INDEX.get('genesis')).toBe(0);
    expect(SRCH_CANONICAL_BOOK_INDEX.get('malachi')).toBe(38);
    expect(SRCH_CANONICAL_BOOK_INDEX.get('matthew-plain')).toBe(39);
    expect(SRCH_CANONICAL_BOOK_INDEX.get('matthew')).toBe(39);
    expect(SRCH_CANONICAL_BOOK_INDEX.get('revelation')).toBe(65);
    expect(SRCH_CANONICAL_BOOK_INDEX.size).toBe(67); // 66 ranks + the shared alias
  });

  it('actually reorders a relevance-ordered result set (the owner\'s doubt)', () => {
    const v = (bookId, ch, vs) => ({ doc: { kind: 'verse', bookId, chapterNum: ch, verseNum: vs } });
    const relevance = [v('revelation', 22, 21), v('psalms', 23, 1), v('genesis', 1, 1), v('john', 3, 16)];
    const sorted = srchSortCanonical(relevance, SRCH_CANONICAL_BOOK_INDEX);
    expect(sorted.map((e) => e.doc.bookId)).toEqual(['genesis', 'psalms', 'john', 'revelation']);
  });
});

import { describe, it, expect } from 'vitest';
import { srchGroupKey } from './search.js';

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

  it('study-note / cross-ref → "matthew-study"', () => {
    expect(srchGroupKey({ kind: 'study-note' })).toBe('matthew-study');
    expect(srchGroupKey({ kind: 'cross-ref' })).toBe('matthew-study');
  });

  it('letter kinds use volumeId, falling back to "letters"', () => {
    expect(srchGroupKey({ kind: 'letter', volumeId: 'volume-three' })).toBe('volume-three');
    expect(srchGroupKey({ kind: 'letter-title', volumeId: 'rebuke' })).toBe('rebuke');
    expect(srchGroupKey({ kind: 'footnote', volumeId: 'volume-one' })).toBe('volume-one');
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

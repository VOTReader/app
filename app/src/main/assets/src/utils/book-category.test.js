/* book-category — OT/NT classification for the Matthew study.
   Pins the two-global contract: the OT_BOOK_IDS Set the page declares
   (index.html:596, filled by __finishBibleInit), else the _OT_BOOKS_INLINE Set
   the page inlines (index.html:402). bookCategory calls .has, so it needs a Set.
   search-data.js:569 also declares an OT_BOOK_IDS ARRAY, but that file ships
   inside bundle-d's IIFE (a side-effect import in _entry-d.js; dist shows it
   minified to a local), so the array never becomes the global a reader's page
   sees: the array pin below is a latent fault kept visible, not wanted
   behaviour. If search-data.js is ever loaded as a classic script again, that
   pin is the one to flip (bookCategory should accept either shape). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bookCategory } from './book-category.js';

/** @type {any} */
const g = globalThis;

const OT_39 = ['genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua', 'judges', 'ruth', '1samuel', '2samuel', '1kings', '2kings', '1chronicles', '2chronicles', 'ezra', 'nehemiah', 'esther', 'job', 'psalms', 'proverbs', 'ecclesiastes', 'songofsolomon', 'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi'];

beforeEach(() => { delete g.OT_BOOK_IDS; delete g._OT_BOOKS_INLINE; });
afterEach(() => { delete g.OT_BOOK_IDS; delete g._OT_BOOKS_INLINE; });

describe('bookCategory with the OT_BOOK_IDS Set', () => {
  beforeEach(() => { g.OT_BOOK_IDS = new Set(['genesis', 'exodus', 'psalms']); });

  it('classifies set members as Old Testament', () => {
    expect(bookCategory('genesis')).toBe('Old Testament');
    expect(bookCategory('exodus')).toBe('Old Testament');
    expect(bookCategory('psalms')).toBe('Old Testament');
  });

  it('falls through to New Testament for anything else', () => {
    expect(bookCategory('matthew')).toBe('New Testament');
    expect(bookCategory('revelation')).toBe('New Testament');
    expect(bookCategory('')).toBe('New Testament');
  });

  it('is case-sensitive', () => {
    expect(bookCategory('Genesis')).toBe('New Testament');
  });

  it('prefers OT_BOOK_IDS over the inline fallback when both exist', () => {
    g._OT_BOOKS_INLINE = new Set(['genesis']);
    g.OT_BOOK_IDS = new Set(['matthew']);
    expect(bookCategory('genesis')).toBe('New Testament');
    expect(bookCategory('matthew')).toBe('Old Testament');
  });
});

describe('bookCategory with the _OT_BOOKS_INLINE fallback', () => {
  beforeEach(() => { g._OT_BOOKS_INLINE = new Set(['genesis', 'job']); });

  it('classifies fallback members as Old Testament', () => {
    expect(bookCategory('genesis')).toBe('Old Testament');
    expect(bookCategory('job')).toBe('Old Testament');
  });

  it('falls through to New Testament otherwise', () => {
    expect(bookCategory('matthew')).toBe('New Testament');
  });
});

describe('bookCategory with the real 39-book lists', () => {
  it('classifies all 39 OT books as Old Testament', () => {
    g.OT_BOOK_IDS = new Set(OT_39);
    expect(OT_39).toHaveLength(39);
    for (const book of OT_39) expect(bookCategory(book)).toBe('Old Testament');
  });

  it('classifies the NT books as New Testament', () => {
    g.OT_BOOK_IDS = new Set(OT_39);
    for (const book of ['matthew', 'mark', 'luke', 'john', 'acts', 'romans', 'revelation']) {
      expect(bookCategory(book)).toBe('New Testament');
    }
  });
});

describe('bookCategory shape pins', () => {
  it('throws TypeError if OT_BOOK_IDS were the array search-data.js declares (latent: that array is bundle-scoped today)', () => {
    g.OT_BOOK_IDS = ['genesis', 'exodus'];
    expect(() => bookCategory('genesis')).toThrow(TypeError);
    expect(() => bookCategory('genesis')).toThrow('has is not a function');
  });

  it('throws ReferenceError when neither global exists', () => {
    expect(() => bookCategory('genesis')).toThrow(ReferenceError);
  });

  it('an empty Set classifies everything as New Testament', () => {
    g.OT_BOOK_IDS = new Set();
    expect(bookCategory('genesis')).toBe('New Testament');
  });
});

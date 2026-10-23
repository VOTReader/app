/* search-model.js: SearchScreen's pure helpers, out of the screen (search200 audit n237, s22.3). The screen
   imports them back (and still exports the ones it exported), so nothing it does changes. */
import { describe, it, expect, afterEach } from 'vitest';
import * as M from './search-model.js';
import * as S from './SearchScreen.jsx';

afterEach(() => { delete (/** @type {any} */ (globalThis)).VOT_BIBLE; });

describe('search-model', () => {
  it('the screen hands out the same helpers it used to export', () => {
    for (const k of ['expandSnippetTerms', 'typedStopWords', 'scopeConflict', 'letterRefCards', 'searchMemo', 'matchCountLabel', 'groupInSiteOrder', 'correctedQuery']) {
      expect(typeof (/** @type {any} */ (M))[k], k).toBe('function');
      expect((/** @type {any} */ (S))[k], k).toBe((/** @type {any} */ (M))[k]);
    }
  });

  it('isStopTerm: a term every word of which is a stop word', () => {
    const stop = new Set(['is', 'the', 'of']);
    expect(M.isStopTerm('is', stop)).toBe(true);
    expect(M.isStopTerm('of the', stop)).toBe(true);
    expect(M.isStopTerm('faith', stop)).toBe(false);
    expect(M.isStopTerm('is', null)).toBe(false);
  });

  it('markStopWords: both stop lists in one set, kept per tables object', () => {
    const SD = { STOP_WORDS_TRIMMED: ['the'], STOP_WORDS: ['who', 'the'] };
    const s = M.markStopWords(SD);
    expect([...(/** @type {Set<string>} */ (s))].sort()).toEqual(['the', 'who']);
    expect(M.markStopWords(SD)).toBe(s);
    expect(M.markStopWords({})).toBeNull();
    expect(M.markStopWords(null)).toBeNull();
  });

  it('refQuote: nothing for a chapter, a cross-chapter range or a parse that is not a verse', () => {
    expect(M.refQuote(null, 'nkjv')).toBe('');
    expect(M.refQuote({ kind: 'ref-book', bookId: 'john' }, 'nkjv')).toBe('');
    expect(M.refQuote({ kind: 'ref-bible', bookId: 'john', chapter: 3 }, 'nkjv')).toBe('');
    expect(M.refQuote({ kind: 'ref-bible', bookId: 'john', chapter: 3, verseStart: 16, chapterEnd: 4 }, 'nkjv')).toBe('');
  });

  it('scopeConflict and searchMemo as the screen used them', () => {
    expect(M.scopeConflict({ kind: 'book', bookId: 'luke' }, 'volumes')).toEqual({ home: 'the Scriptures', tab: 'Volumes' });
    expect(M.scopeConflict({ kind: 'book', bookId: 'matthew' }, 'volumes')).toBeNull();
    expect(M.searchMemo('love', {}, null)).toBe(['love', 'all', 'nkjv', true, true, ''].join('\u0001'));
  });
});

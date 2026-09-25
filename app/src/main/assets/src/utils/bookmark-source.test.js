/* bookmark-source.js - the label a bookmark, a note or a shared quote carries.
   n6-11 (sweep 2, 09-25): a Matthew Study Bible note's key carries a suffix
   (InlineNotes / StudyPanels: hlKeyBase + '-' + suffix), and the label printed
   it raw: "Matthew 5:12-s0", "Matthew 5:panel-s0". */
import { describe, it, expect } from 'vitest';
import { _bookmarkSourceLabel } from './bookmark-source.js';
import { buildSourceEndpoint } from './nav-index.js';

describe('_bookmarkSourceLabel: Matthew Study Bible keys', () => {
  it('a verse keeps its plain reference', () => {
    expect(_bookmarkSourceLabel('study:matthew-5:12')).toBe('Matthew 5:12');
  });

  it('(n6-11) a verse note names its verse and says it is a study note, never the raw suffix', () => {
    expect(_bookmarkSourceLabel('study:matthew-5:12-s0')).toBe('Matthew 5:12 (study note)');
  });

  it('(n6-11) a chapter panel names its chapter and says study notes', () => {
    expect(_bookmarkSourceLabel('study:matthew-5:panel-s0')).toBe('Matthew 5 (study notes)');
  });
});

describe('buildSourceEndpoint: Matthew Study Bible keys', () => {
  it('(n6-11) a chapter panel opens its chapter with no verse, not verse NaN', () => {
    const ep = buildSourceEndpoint('study:matthew-5:panel-s0', null, null, null, null);
    expect(ep).toMatchObject({ type: 'study', bookId: 'matthew', chapter: 5, verse: null });
  });

  it('a verse note opens at its verse', () => {
    const ep = buildSourceEndpoint('study:matthew-5:12-s0', null, null, null, null);
    expect(ep).toMatchObject({ type: 'study', chapter: 5, verse: 12 });
  });
});

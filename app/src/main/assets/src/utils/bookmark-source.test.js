/* bookmark-source.js - the label a bookmark, a note or a shared quote carries.
   n6-11 (sweep 2, 09-25): a Matthew Study Bible note's key carries a suffix
   (InlineNotes / StudyPanels: hlKeyBase + '-' + suffix), and the label printed
   it raw: "Matthew 5:12-s0", "Matthew 5:panel-s0". */
import { describe, it, expect, afterEach } from 'vitest';
import { _bookmarkSourceLabel, _bookmarkSourceEndpoint, _bookmarkSourcePlace, _bookmarkSourceNumber } from './bookmark-source.js';
import { buildSourceEndpoint } from './nav-index.js';

const G = /** @type {any} */ (globalThis);

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

/* The label and the endpoint read app globals as free variables
   (findEntryContext, JournalStore, JournalHelpers, BIBLE_BOOK_LIST). Each test
   installs only what it needs and the afterEach removes them, so the "global
   missing" arms are exercised by the default state. */
afterEach(() => {
  delete G.findEntryContext;
  delete G.JournalStore;
  delete G.JournalHelpers;
  delete G.BIBLE_BOOK_LIST;
  delete G.bookCategory;
});

describe('_bookmarkSourceLabel: every key kind', () => {
  it('an empty key is a generic "Bookmark"', () => {
    expect(_bookmarkSourceLabel('')).toBe('Bookmark');
    expect(_bookmarkSourceLabel(null)).toBe('Bookmark');
  });

  it('a Bible verse reads "Book C:V", and a chapter key "Book C"', () => {
    G.BIBLE_BOOK_LIST = [{ id: 'song-of-solomon', title: 'Song of Solomon' }];
    expect(_bookmarkSourceLabel('bible:song-of-solomon:2:4')).toBe('Song of Solomon 2:4');
    expect(_bookmarkSourceLabel('bible:song-of-solomon:2')).toBe('Song of Solomon 2');
  });

  it('a Bible book missing from the list falls back to the title-cased id', () => {
    expect(_bookmarkSourceLabel('bible:1-john:3:16')).toBe('1 John 3:16');
  });

  it('a study key with no verse is the book name alone', () => {
    expect(_bookmarkSourceLabel('study:matthew-5')).toBe('Matthew');
  });

  it('a study key without a chapter suffix keeps its raw id', () => {
    expect(_bookmarkSourceLabel('study:intro')).toBe('intro');
    expect(_bookmarkSourceLabel('study:')).toBe('');
  });

  it.each(['letter', 'wtlb', 'blessed', 'holy-days'])('a %s key reads its entry title', (kind) => {
    const calls = [];
    G.findEntryContext = (id, k) => { calls.push([id, k]); return { title: 'The Title of ' + id }; };
    expect(_bookmarkSourceLabel(kind + ':abc')).toBe('The Title of abc');
    expect(calls).toEqual([['abc', kind]]);
  });

  it('an entry with no resolvable title falls back to its id', () => {
    G.findEntryContext = () => null;
    expect(_bookmarkSourceLabel('wtlb:w-12')).toBe('w-12');
    G.findEntryContext = () => ({ title: '' });
    expect(_bookmarkSourceLabel('blessed:b-3')).toBe('b-3');
  });

  it('an entry key reads its id when findEntryContext is not loaded', () => {
    expect(_bookmarkSourceLabel('letter:v2-l7')).toBe('v2-l7');
  });

  it('a journal key uses JournalHelpers.entryDisplayTitle when present', () => {
    G.JournalStore = { get: (id) => (id === 'e1' ? { id: 'e1', title: 'raw' } : null) };
    G.JournalHelpers = { entryDisplayTitle: (e) => 'Display ' + e.id };
    expect(_bookmarkSourceLabel('journal:e1')).toBe('Journal · Display e1');
  });

  it('a journal title that displays empty reads "Untitled"', () => {
    G.JournalStore = { get: () => ({ id: 'e1' }) };
    G.JournalHelpers = { entryDisplayTitle: () => '' };
    expect(_bookmarkSourceLabel('journal:e1')).toBe('Journal · Untitled');
  });

  it('without JournalHelpers a journal key uses the entry title, else "Untitled"', () => {
    G.JournalStore = { get: (id) => (id === 't' ? { title: 'Morning' } : { title: '' }) };
    expect(_bookmarkSourceLabel('journal:t')).toBe('Journal · Morning');
    expect(_bookmarkSourceLabel('journal:u')).toBe('Journal · Untitled');
  });

  it('a journal key whose entry is gone (or the store not loaded) reads "Journal Entry"', () => {
    expect(_bookmarkSourceLabel('journal:gone')).toBe('Journal Entry');
    G.JournalStore = { get: () => null };
    expect(_bookmarkSourceLabel('journal:gone')).toBe('Journal Entry');
  });

  it('an unknown kind prints the key unchanged', () => {
    expect(_bookmarkSourceLabel('mystery:x:y')).toBe('mystery:x:y');
  });
});

describe('_bookmarkSourceEndpoint', () => {
  it('an empty key has no endpoint', () => {
    expect(_bookmarkSourceEndpoint('')).toBeNull();
    expect(_bookmarkSourceEndpoint(undefined)).toBeNull();
  });

  it('a Bible verse key opens its book, chapter and verse', () => {
    expect(_bookmarkSourceEndpoint('bible:john:3:16')).toEqual({ type: 'bible', key: 'bible:john:3:16', bookId: 'john', chapter: 3, verse: 16 });
  });

  it('a study verse key opens its chapter at the verse, and a verse note at its verse', () => {
    expect(_bookmarkSourceEndpoint('study:matthew-5:12')).toEqual({ type: 'study', key: 'study:matthew-5:12', bookId: 'matthew', chapter: 5, verse: 12 });
    expect(_bookmarkSourceEndpoint('study:matthew-5:12-s0')).toMatchObject({ type: 'study', chapter: 5, verse: 12 });
  });

  it('a study chapter-panel key opens its chapter with no verse, not verse NaN', () => {
    // My Highlights and the bookmark sheets route this through navigateToLink;
    // verseAnchorFor(NaN) built an empty verse anchor, and use-scroll-memory
    // honours ANY anchor on matthew-ch, so the chapter was neither reset nor
    // restored. buildSourceEndpoint made the same call in n6-11.
    expect(_bookmarkSourceEndpoint('study:matthew-5:panel-s0')).toMatchObject({ type: 'study', bookId: 'matthew', chapter: 5, verse: null });
    expect(_bookmarkSourceEndpoint('study:matthew-5')).toMatchObject({ chapter: 5, verse: null });
  });

  it('a study key without a chapter suffix has no endpoint', () => {
    expect(_bookmarkSourceEndpoint('study:intro')).toBeNull();
    expect(_bookmarkSourceEndpoint('study')).toBeNull();
  });

  it.each(['letter', 'wtlb', 'blessed', 'holy-days'])('a %s key carries the screen findEntryContext resolves', (kind) => {
    G.findEntryContext = (_id, k) => ({ screen: k + '-screen' });
    expect(_bookmarkSourceEndpoint(kind + ':id9')).toEqual({ type: kind, key: kind + ':id9', letterId: 'id9', entryId: 'id9', screen: kind + '-screen' });
  });

  it('an entry key has a null screen when unresolved or when the resolver is not loaded', () => {
    expect(_bookmarkSourceEndpoint('letter:x')).toMatchObject({ type: 'letter', letterId: 'x', screen: null });
    G.findEntryContext = () => null;
    expect(_bookmarkSourceEndpoint('wtlb:x')).toMatchObject({ type: 'wtlb', screen: null });
  });

  it('a journal key opens the journal viewer', () => {
    expect(_bookmarkSourceEndpoint('journal:e7')).toEqual({ type: 'journal', key: 'journal:e7', entryId: 'e7', screen: 'journal-viewer' });
  });

  it('an unknown kind has no endpoint', () => {
    expect(_bookmarkSourceEndpoint('mystery:1')).toBeNull();
  });

  it('a Bible key with no chapter or verse numbers opens at 0', () => {
    expect(_bookmarkSourceEndpoint('bible:john')).toMatchObject({ type: 'bible', bookId: 'john', chapter: 0, verse: 0 });
    expect(_bookmarkSourceEndpoint('bible:john:3')).toMatchObject({ chapter: 3, verse: 0 });
  });
});

describe('_bookmarkSourcePlace', () => {
  it('an empty key has no place', () => {
    expect(_bookmarkSourcePlace('')).toBe('');
    expect(_bookmarkSourcePlace(null)).toBe('');
  });

  it.each(['letter', 'wtlb', 'blessed', 'holy-days'])('a %s key reads its collection from findEntryContext', (kind) => {
    const calls = [];
    G.findEntryContext = (id, k) => { calls.push([id, k]); return { collection: 'Volume One' }; };
    expect(_bookmarkSourcePlace(kind + ':abc')).toBe('Volume One');
    expect(calls).toEqual([['abc', kind]]);
  });

  it('an entry with no collection (or no resolver) has no place', () => {
    expect(_bookmarkSourcePlace('letter:x')).toBe('');
    G.findEntryContext = () => null;
    expect(_bookmarkSourcePlace('wtlb:x')).toBe('');
    G.findEntryContext = () => ({});
    expect(_bookmarkSourcePlace('blessed:x')).toBe('');
  });

  it('a Bible key reads its testament from bookCategory when loaded', () => {
    G.bookCategory = (id) => (id === 'john' ? 'New Testament' : '' );
    expect(_bookmarkSourcePlace('bible:john:3:16')).toBe('New Testament');
    expect(_bookmarkSourcePlace('bible:genesis:1:1')).toBe('');
  });

  it('a Bible key has no place when bookCategory is not loaded', () => {
    expect(_bookmarkSourcePlace('bible:john:3:16')).toBe('');
  });

  it('study and journal keys name their shelf; an unknown kind has no place', () => {
    expect(_bookmarkSourcePlace('study:matthew-5:12')).toBe('Studies');
    expect(_bookmarkSourcePlace('journal:e1')).toBe('Journal');
    expect(_bookmarkSourcePlace('mystery:x')).toBe('');
  });
});

describe('_bookmarkSourceNumber', () => {
  it('only letter and wtlb keys carry a number', () => {
    G.findEntryContext = () => ({ entry: { num: 7 } });
    expect(_bookmarkSourceNumber('letter:abc')).toBe('Letter 7');
    expect(_bookmarkSourceNumber('wtlb:abc')).toBe('Entry 7');
    expect(_bookmarkSourceNumber('blessed:abc')).toBe('');
    expect(_bookmarkSourceNumber('bible:john:3:16')).toBe('');
    expect(_bookmarkSourceNumber('')).toBe('');
    expect(_bookmarkSourceNumber(null)).toBe('');
  });

  it('a preface or unnumbered entry has no number', () => {
    G.findEntryContext = () => ({ entry: { num: 0 } });
    expect(_bookmarkSourceNumber('letter:preface')).toBe('');
    G.findEntryContext = () => ({ entry: {} });
    expect(_bookmarkSourceNumber('wtlb:x')).toBe('');
    G.findEntryContext = () => ({});
    expect(_bookmarkSourceNumber('letter:x')).toBe('');
    G.findEntryContext = () => null;
    expect(_bookmarkSourceNumber('letter:x')).toBe('');
  });

  // r3 review: a WTLB bookmark said "Letter 31" while History said "Entry 31", and an Answers topic (keyed wtlb: too,
  // AnswersTopic.jsx) showed its place in the file as a number. The line now says what History says.
  it('names the number in its collection\'s words, and gives an Answers topic none', () => {
    G.COL_BY_KEY = new Map([
      ['wtlb2', { volKey: 'wtlb2', kind: 'wtlb', label: 'Words To Live By: Part Two' }],
      ['answers', { volKey: 'answers', kind: 'wtlb', label: 'Answers Only God Can Give' }],
      ['one', { volKey: 'one', kind: 'letter', label: 'Volume One' }],
    ]);
    try {
      G.findEntryContext = () => ({ kind: 'wtlb', collection: 'Words To Live By: Part Two', entry: { num: 31 } });
      expect(_bookmarkSourceNumber('wtlb:e31')).toBe('Entry 31');
      G.findEntryContext = () => ({ kind: 'wtlb', collection: 'Answers Only God Can Give', entry: { num: 412 } });
      expect(_bookmarkSourceNumber('wtlb:a-topic')).toBe('');
      G.findEntryContext = () => ({ kind: 'letter', collection: 'Volume One', entry: { num: 4 } });
      expect(_bookmarkSourceNumber('letter:l4')).toBe('Letter 4');
    } finally { delete G.COL_BY_KEY; }
  });

  it('no resolver loaded means no number', () => {
    expect(_bookmarkSourceNumber('letter:abc')).toBe('');
  });
});

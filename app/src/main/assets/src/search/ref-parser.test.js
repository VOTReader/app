import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseReference, parseWordNum, resolveBookToken, fuzzyBookSuggest, levenshtein } from './ref-parser.js';

const FIXTURE = {
  BOOK_ABBREVS: {
    john: 'john', jn: 'john',
    rom: 'romans', romans: 'romans',
    gen: 'genesis', genesis: 'genesis',
    matt: 'matthew', mt: 'matthew', matthew: 'matthew',
  },
  BOOK_DISPLAY: { john: 'John', romans: 'Romans', genesis: 'Genesis', matthew: 'Matthew' },
  NAMED_PASSAGE_INDEX: {
    beatitudes: { bookId: 'matthew', chapter: 5, verseStart: 3, verseEnd: 12 },
  },
  COMMAND_MAP: { '/home': { action: 'home', label: 'Go home' } },
  VOLUME_TOKEN_MAP: {
    v2: { id: 'v2', screen: 'vot-letter', label: 'Volume Two' },
    wtlb1: { id: 'wtlb1', screen: 'wtlb-one-entry', label: 'Words To Live By: Part One' },
  },
  WORD_NUMS: { five: 5 },
  ROMAN_NUMS: { ii: 2 },
  VOLUME_COLLECTIONS: [
    { id: 'timothy', screen: 'vot-timothy-letter', label: 'Letters from Timothy', tokens: ['timothy', 'lft'] },
  ],
};

describe('ref-parser helpers', () => {
  let prev;
  beforeAll(() => { prev = window.VotSearchData; window.VotSearchData = FIXTURE; });
  afterAll(() => { window.VotSearchData = prev; });

  it('levenshtein is bounded', () => {
    expect(levenshtein('john', 'john')).toBe(0);
    expect(levenshtein('john', 'jon', 2)).toBe(1);
    expect(levenshtein('abc', 'xyz', 2)).toBe(3); // cap+1
  });

  it('parseWordNum handles arabic / word / roman', () => {
    expect(parseWordNum('7')).toBe(7);
    expect(parseWordNum('five')).toBe(5);
    expect(parseWordNum('ii')).toBe(2);
    expect(parseWordNum('zzz')).toBeNull();
  });

  it('resolveBookToken tolerates spacing/casing', () => {
    expect(resolveBookToken('Romans')).toBe('romans');
    expect(resolveBookToken('JN')).toBe('john');
  });

  it('fuzzyBookSuggest corrects a typo within 2 edits', () => {
    expect(fuzzyBookSuggest('jhon')).toBe('john');
    expect(fuzzyBookSuggest('zzzzzz')).toBeNull();
  });
});

describe('parseReference', () => {
  let prev;
  beforeAll(() => { prev = window.VotSearchData; window.VotSearchData = FIXTURE; });
  afterAll(() => { window.VotSearchData = prev; });

  it('recognizes a command', () => {
    expect(parseReference('/home')).toEqual({ kind: 'command', action: 'home', label: 'Go home' });
  });

  it('recognizes a named passage', () => {
    const r = parseReference('beatitudes');
    expect(r.kind).toBe('named-passage');
    expect(r).toMatchObject({ bookId: 'matthew', chapter: 5, verseStart: 3, verseEnd: 12 });
  });

  it('parses a single verse ref', () => {
    expect(parseReference('john 3:16')).toMatchObject({ kind: 'ref-bible', bookId: 'john', chapter: 3, verseStart: 16 });
  });

  it('parses a chapter-only ref', () => {
    const r = parseReference('romans 8');
    expect(r).toMatchObject({ kind: 'ref-bible', bookId: 'romans', chapter: 8 });
    expect(r.verseStart).toBeUndefined();
  });

  it('parses a verse range and a chapter range', () => {
    expect(parseReference('rom 8:28-39')).toMatchObject({ kind: 'ref-bible', chapter: 8, verseStart: 28, verseEnd: 39 });
    expect(parseReference('gen 1-3')).toMatchObject({ kind: 'ref-bible', chapter: 1, chapterEnd: 3 });
  });

  it('parses a book-only ref', () => {
    expect(parseReference('john')).toEqual({ kind: 'ref-book', bookId: 'john', bookTitle: 'John' });
  });

  it('parses compact + WTLB + shorthand + bare letter refs', () => {
    expect(parseReference('v2 l5')).toMatchObject({ kind: 'ref-letter', volumeId: 'v2', letterNum: 5 });
    expect(parseReference('wtlb 1:45')).toMatchObject({ kind: 'ref-letter', volumeId: 'wtlb1', letterNum: 45 });
    expect(parseReference('lft five')).toMatchObject({ kind: 'ref-letter', volumeId: 'timothy', letterNum: 5 });
    expect(parseReference('letter five')).toMatchObject({ kind: 'ref-letter', volumeId: 'v2', letterNum: 5, fallbackVolumeId: 'v1' });
  });

  it('falls through to a text query', () => {
    expect(parseReference('mercy and grace').kind).toBe('text');
  });

  it('gates by corpus: volumes mode does not parse bible refs', () => {
    expect(parseReference('john 3:16', { corpus: 'volumes' }).kind).toBe('text');
  });

  it('gates by corpus: scriptures mode does not parse letter refs', () => {
    expect(parseReference('v2 l5', { corpus: 'scriptures' }).kind).toBe('text');
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { readKind, readWords, countedReads } from './read-kind.js';
import { progressLine } from '../ui/screens/LibraryScreen.jsx';

const G = /** @type {any} */ (globalThis);

describe('read kind (POL5: the mock words "1 letter read" only where true)', () => {
  afterEach(() => { delete G.COL_BY_READ_KEY; });

  it('names letters, chapters, or nothing for a mix', () => {
    G.COL_BY_READ_KEY = new Map([['volume-one', {}], ['letters-timothy', {}]]);
    expect(readKind({ 'v1:volume-one:3': 1 })).toBe('letter');
    expect(readKind({ 'v1:volume-one:3': 1, 'v1:letters-timothy:2': 1 })).toBe('letter');
    expect(readKind({ 'v1:john:3': 1 })).toBe('chapter');
    expect(readKind({ 'v1:volume-one:3': 1, 'v1:john:3': 1 })).toBe(null);
    expect(readKind({})).toBe(null);
  });

  it('says nothing it cannot know without the registry', () => {
    expect(readKind({ 'v1:volume-one:3': 1 })).toBe(null);
  });

  it('counts the marks Settings counts: no Answers topics, no Hidden Manna (C3)', () => {
    const marks = { 'v1:john:3': 1, 'v1:volume-one:3': { count: 2 }, 'v1:answers:the-sabbath': 1, 'v1:hidden-manna:12': 1 };
    expect(Object.keys(countedReads(marks))).toEqual(['v1:john:3', 'v1:volume-one:3']);
    expect(countedReads(marks)['v1:volume-one:3']).toEqual({ count: 2 });
    expect(countedReads(null)).toEqual({});
    G.COL_BY_READ_KEY = new Map([['volume-one', {}], ['hidden-manna', {}]]);
    expect(readKind(countedReads({ 'v1:john:3': 1, 'v1:hidden-manna:12': 1 }))).toBe('chapter');
  });

  it('words the count', () => {
    expect(readWords(1, 'letter', 'x', 'y')).toBe('letter read');
    expect(readWords(3, 'chapter', 'x', 'y')).toBe('chapters read');
    expect(readWords(1, null, 'x', 'y')).toBe('x');
    expect(progressLine(1, 1, 'letter')).toBe('1 letter read · 1 day in a row');
    expect(progressLine(5, 0, null)).toBe('5 read');
  });
});

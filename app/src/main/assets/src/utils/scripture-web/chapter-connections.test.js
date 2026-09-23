/* The Scripture Web as a list (A7, 2026-09-22): the threads the Famous view
   draws at one chapter, grouped by the verse in the chapter, strongest first,
   each tagged Essential or Famous. A fixture graph with a known bucket makes
   every expectation exact. */
import { describe, it, expect } from 'vitest';
import { chapterConnections, startChapter } from './chapter-connections.js';

// Numbers 21 (ids 0-9), John 3 (ids 10-45: 3:14 = 23, 3:16 = 25), Romans 5 (ids 46-66: 5:5 = 50, 5:8 = 53, 5:10 = 55, 5:15 = 60)
const books = [{ id: 'numbers', title: 'Numbers', abbr: 'Num' }, { id: 'john', title: 'John', abbr: 'John' }, { id: 'romans', title: 'Romans', abbr: 'Rom' }];
const chapters = [[0, 21, 0, 10], [1, 3, 10, 36], [2, 5, 46, 21]];
const chapterOfVerse = new Uint16Array(67);
for (let v = 10; v <= 45; v++) chapterOfVerse[v] = 1;
for (let v = 46; v <= 66; v++) chapterOfVerse[v] = 2;
// one bucket: the first 2 threads are Essential, the first 3 Famous, the 4th is past the Famous cut
const g = /** @type {any} */ ({
  total: 67, count: 4, books, chapters, chapterOfVerse,
  from: new Uint16Array([25, 23, 25, 50]), to: new Uint16Array([53, 7, 60, 55]), votes: new Int16Array([90, 80, 20, 10]),
  buckets: [{ off: 0, len: 4, off20: 2, off10: 3, segments: 0, chunks: [] }],
});

describe('chapterConnections', () => {
  it('groups John 3 by its own verses, strongest first, each row tagged', () => {
    const r = chapterConnections(g, 1);
    expect(r.total).toBe(3);
    expect(r.groups.map((x) => x.verse.label)).toEqual(['John 3:14', 'John 3:16']);
    expect(r.groups[0].rows.map((x) => [x.other.label, x.tier])).toEqual([['Numbers 21:8', 'essential']]);
    expect(r.groups[1].rows.map((x) => [x.other.label, x.tier])).toEqual([['Romans 5:8', 'essential'], ['Romans 5:15', 'famous']]);
  });

  it('lists a thread from the other end too, and leaves out what the Famous view does not draw', () => {
    const r = chapterConnections(g, 2);
    // Romans 5:5 -> 5:10 is past the Famous cut: not listed
    expect(r.groups.map((x) => x.verse.label)).toEqual(['Romans 5:8', 'Romans 5:15']);
    expect(r.groups[0].rows[0].other.label).toBe('John 3:16');
  });

  it('is empty, not broken, for a chapter the web has nothing on or does not have', () => {
    expect(chapterConnections(g, 0).groups.map((x) => x.verse.label)).toEqual(['Numbers 21:8']);
    expect(chapterConnections(g, 9)).toEqual({ total: 0, groups: [] });
    expect(chapterConnections(null, 0)).toEqual({ total: 0, groups: [] });
  });
});

describe('startChapter', () => {
  it('opens on the reader’s last Bible chapter when the web has it', () => {
    expect(startChapter(g, 'romans', 5)).toBe(2);
  });
  it('else on John 3, else on the first chapter', () => {
    expect(startChapter(g, 'romans', 99)).toBe(1);
    expect(startChapter(g, null, null)).toBe(1);
    expect(startChapter(/** @type {any} */ ({ books: [books[0]], chapters: [[0, 21, 0, 10]] }), null, null)).toBe(0);
  });
});

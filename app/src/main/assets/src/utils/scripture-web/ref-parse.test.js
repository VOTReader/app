// @ts-nocheck -- node built-ins and a stubbed global, as the other real-graph tests here
/* ref-parse: the go-to's words on the web's own verse ids (spec section 4.5), read through the
   app's own reference parser and its own tables (search-data.js), over the real graph. */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { decodeGraph } from './decode.js';
import { refOfVerse, chapterRange } from './pick.js';
import {
  bookIndexOf, chapterIndexOf, placeOfRef, goToRows, booksStarting, frameOf, startPlace, bookSpan,
} from './ref-parse.js';
import { parseReference } from '../../search/ref-parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const ASSET = resolve(here, '../../data/scripture-web-data.js');
const g = decodeGraph(runInNewContext(readFileSync(ASSET, 'utf8') + ';SCRIPTURE_WEB_DATA', {}));

let prev;
beforeAll(async () => {
  prev = window.VotSearchData;
  // @ts-ignore -- a classic script: it sets window.VotSearchData
  await import('../../../search-data.js');
});
afterAll(() => { window.VotSearchData = prev; });
afterEach(() => { delete globalThis.resolveVerseText; });

const place = (q) => placeOfRef(g, parseReference(q, { corpus: 'scriptures' }));
const labels = (rows) => rows.map((r) => r.label + (r.sub ? ' · ' + r.sub : ''));

describe('a reference, on the graph', () => {
  it('book names and abbreviations, Book C, Book C:V, Book C:V-W', () => {
    expect(place('John 3:16')).toMatchObject({ kind: 'verse', label: 'John 3:16' });
    expect(refOfVerse(g, place('John 3:16').verse).label).toBe('John 3:16');
    expect(place('Gen 1:1')).toMatchObject({ kind: 'verse', verse: 0, label: 'Genesis 1:1' });
    expect(place('jn 3 16')).toMatchObject({ kind: 'verse', label: 'John 3:16' });
    expect(place('Isaiah 53')).toMatchObject({ kind: 'chapter', label: 'Isaiah 53' });
    expect(place('Romans')).toMatchObject({ kind: 'book', label: 'Romans' });
    expect(place('Psalm 23:1-6')).toMatchObject({ kind: 'range', label: 'Psalms 23:1-6' });
    expect(place('1st cor 13')).toMatchObject({ kind: 'chapter', label: '1 Corinthians 13' });
  });
  it('a chapter range and a named passage frame their whole span', () => {
    const m = place('Matthew 5-7');
    const ci5 = chapterIndexOf(g, bookIndexOf(g, 'matthew'), 5), ci7 = chapterIndexOf(g, bookIndexOf(g, 'matthew'), 7);
    expect(m).toMatchObject({ kind: 'range', lo: chapterRange(g, ci5)[0], hi: chapterRange(g, ci7)[1], label: 'Matthew 5-7' });
    expect(place('Sermon on the Mount')).toMatchObject({ kind: 'range', lo: m.lo, hi: m.hi });
  });
  it("the parser's Matthew is the web's plain-Bible Matthew", () => {
    expect(g.books[bookIndexOf(g, 'matthew')].id).toBe('matthew-plain');
    expect(bookIndexOf(g, 'matthew-plain')).toBe(bookIndexOf(g, 'matthew'));
    expect(place('Matt 5:3')).toMatchObject({ kind: 'verse', label: 'Matthew 5:3' });
  });
  it('what the web does not hold is nothing: words, a chapter past the end, a verse past the end', () => {
    expect(place('love one another')).toBeNull();
    expect(place('John 99')).toBeNull();
    expect(place('John 3:99')).toBeNull();
  });
});

describe('the rows, live as you type', () => {
  it('"John 3:1": the verse itself first, then the verses it begins (most connected first), the chapter last', () => {
    const rows = goToRows(g, 'John 3:1', { density: 'famous', limit: 5 });
    expect(rows).toHaveLength(5);
    expect(labels(rows)[0]).toBe('John 3:1');
    expect(labels(rows)[1], 'the most connected verse it begins').toBe('John 3:16');
    expect(labels(rows)[4]).toBe('John 3 · whole chapter');
    expect(labels(rows).slice(1, 4).every((l) => /^John 3:1\d$/.test(l))).toBe(true);
  });
  it('the phone has three rows, and the whole chapter keeps the last', () => {
    expect(labels(goToRows(g, 'John 3:1', { limit: 3 }))).toEqual(['John 3:1', 'John 3:16', 'John 3 · whole chapter']);
  });
  it('a chapter leads with itself, then its most connected verses; a book with itself, then its chapters', () => {
    const ch = labels(goToRows(g, 'John 3', { limit: 5 }));
    expect(ch[0]).toBe('John 3 · whole chapter');
    expect(ch[1]).toBe('John 3:16');
    const bk = labels(goToRows(g, 'Romans', { limit: 5 }));
    expect(bk[0]).toBe('Romans · whole book');
    expect(bk.slice(1).every((l) => /^Romans \d+ · whole chapter$/.test(l))).toBe(true);
  });
  it('a book name not finished: the books it begins, in canon order', () => {
    expect(labels(goToRows(g, 'Jo'))).toEqual(['Joshua', 'Job', 'Joel', 'Jonah', 'John'].map((t) => t + ' · whole book'));
    expect(labels(goToRows(g, 'Phili'))).toEqual(['Philippians · whole book']);
    expect(labels(goToRows(g, '1 jo'))[0], 'an abbreviation is the book itself').toBe('1 John · whole book');
    const jo = booksStarting(g, 'jo').map((b) => g.books[b].title);
    expect(jo).toEqual(expect.arrayContaining(['Joshua', 'Job', 'Joel', 'Jonah', 'John']));
    expect(jo.indexOf('Joshua')).toBeLessThan(jo.indexOf('John'));
  });
  it('nothing for words, nothing for nothing', () => {
    expect(goToRows(g, 'love one another')).toEqual([]);
    expect(goToRows(g, '   ')).toEqual([]);
  });
  it("a verse row carries the verse's words once the Bible has landed", () => {
    globalThis.resolveVerseText = (ep) => (ep.bookId === 'john' && ep.chapter === 3 && ep.verse === 16 ? 'For God so loved the world' : '');
    const rows = goToRows(g, 'John 3:16');
    expect(rows[0]).toMatchObject({ label: 'John 3:16', text: 'For God so loved the world', sub: '' });
  });
});

describe('where the camera frames a place', () => {
  it('a book fills the canvas area; a chapter about 70 % of it; a verse five chapters, centred on it', () => {
    const rom = place('Romans');
    expect(frameOf(g, rom)).toEqual({ x0: rom.lo, x1: rom.hi + 1 });
    const isa = place('Isaiah 53');
    const f = frameOf(g, isa);
    expect((isa.hi + 1 - isa.lo) / (f.x1 - f.x0)).toBeCloseTo(0.7, 9);
    const j = place('John 3:16');
    const fj = frameOf(g, j);
    expect((fj.x0 + fj.x1) / 2).toBeCloseTo(j.verse + 0.5, 9);
    const john = bookIndexOf(g, 'john');
    const five = chapterRange(g, chapterIndexOf(g, john, 5))[1] + 1 - chapterRange(g, chapterIndexOf(g, john, 1))[0];
    expect(fj.x1 - fj.x0).toBe(five);
  });
});

describe('the start prop (CONTRACTS.md section 8)', () => {
  it('a verse, a book and chapter, a book, a letter', () => {
    expect(startPlace(g, { verse: { bookId: 'matthew', chapter: 5, verse: 3 } })).toMatchObject({ kind: 'verse', label: 'Matthew 5:3' });
    expect(startPlace(g, { verse: { bookId: 'matthew-plain', chapter: 5, verse: 3 } })).toMatchObject({ label: 'Matthew 5:3' });
    expect(startPlace(g, { book: 'romans', chapter: 8 })).toMatchObject({ kind: 'chapter', label: 'Romans 8' });
    expect(startPlace(g, { book: 'romans' })).toMatchObject({ kind: 'book', lo: bookSpan(g, bookIndexOf(g, 'romans'))[0] });
    expect(startPlace(g, { letterKey: 'v2:5' })).toEqual({ kind: 'letter', letterKey: 'v2:5' });
  });
  it('a place the web does not hold is nothing; a verse past its chapter is the chapter', () => {
    expect(startPlace(g, { verse: { bookId: 'nope', chapter: 1, verse: 1 } })).toBeNull();
    expect(startPlace(g, { verse: { bookId: 'john', chapter: 3, verse: 99 } })).toMatchObject({ kind: 'chapter', label: 'John 3' });
    expect(startPlace(g, null)).toBeNull();
  });
});

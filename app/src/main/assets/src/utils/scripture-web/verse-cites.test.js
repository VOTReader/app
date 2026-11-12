// @ts-nocheck
/* FEAT1: Search's "Letters that cite" file (src/data/verse-cites.js) and the Scripture Web's graph asset
   are written by one generator run from the same rows; these hold them to the same answers, so the count
   in Search and the list in the web can never disagree. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { decodeGraph } from './decode.js';
import { citationsForVerse } from './vot-citations.js';
import { citesGraph, verseIdOf, lettersCiting } from './verse-cites.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../data');
const raw = runInNewContext(readFileSync(resolve(DATA, 'scripture-web-data.js'), 'utf8') + ';SCRIPTURE_WEB_DATA', {});
const cites = runInNewContext(readFileSync(resolve(DATA, 'verse-cites.js'), 'utf8') + ';VERSE_CITES', {});
const graph = decodeGraph(raw);

describe('verse-cites.js agrees with the Scripture Web graph', () => {
  it('carries the graph asset\'s own citation rows and mirrors', () => {
    expect(JSON.stringify(cites.votCites)).toBe(JSON.stringify(raw.votCites));
    expect(JSON.stringify(cites.mirrors)).toBe(JSON.stringify(raw.mirrors));
  });

  it('numbers every verse as the graph does', () => {
    expect(cites.books).toEqual(raw.books.map((/** @type {any} */ b) => b.id));
    for (const [bi, ch, start, n] of raw.chapters) {
      expect(verseIdOf(cites, raw.books[bi].id, ch, 1)).toBe(start);
      expect(verseIdOf(cites, raw.books[bi].id, ch, n)).toBe(start + n - 1);
      expect(verseIdOf(cites, raw.books[bi].id, ch, n + 1)).toBe(-1);
    }
  });

  it('answers citationsForVerse exactly as the graph does, for every verse', () => {
    const small = citesGraph(cites);
    let cited = 0;
    for (let v = 0; v < raw.total; v++) {
      const a = citationsForVerse(graph, v, null);
      const b = citationsForVerse(small, v, null);
      if (a.length !== b.length || JSON.stringify(a) !== JSON.stringify(b)) {
        expect(JSON.stringify(b), 'verse ' + v).toBe(JSON.stringify(a));
      }
      if (a.length) cited++;
    }
    expect(cited).toBeGreaterThan(1000);
  });
});

describe('lettersCiting: one row per letter', () => {
  it('a verse counts the distinct letters citationsForVerse lists', () => {
    const v = verseIdOf(cites, 'john', 3, 16);
    const all = citationsForVerse(graph, v, null);
    const rows = lettersCiting(cites, { bookId: 'john', chapter: 3, verse: 16 });
    expect(rows.length).toBe(new Set(all.map((c) => c.letterKey)).size);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((n, r) => n + r.places, 0)).toBe(all.length);
  });

  it('a range and a chapter take in every verse in them, each place once', () => {
    const one = lettersCiting(cites, { bookId: 'john', chapter: 3, verse: 16 });
    const range = lettersCiting(cites, { bookId: 'john', chapter: 3, verse: 16, verseEnd: 18 });
    const chapter = lettersCiting(cites, { bookId: 'john', chapter: 3 });
    expect(range.length).toBeGreaterThanOrEqual(one.length);
    expect(chapter.length).toBeGreaterThanOrEqual(range.length);
    for (const r of one) expect(range.some((x) => x.letterKey === r.letterKey)).toBe(true);
    expect(new Set(chapter.map((r) => r.letterKey)).size).toBe(chapter.length);
  });

  it('nothing for a verse no letter cites, or a place that is not there', () => {
    expect(lettersCiting(cites, { bookId: 'john', chapter: 99, verse: 1 })).toEqual([]);
    expect(lettersCiting(cites, { bookId: 'nobook', chapter: 1 })).toEqual([]);
    let quiet = -1;
    for (let v = 1; v <= 30 && quiet < 0; v++) if (!citationsForVerse(graph, verseIdOf(cites, 'numbers', 7, v), null).length) quiet = v;
    expect(quiet).toBeGreaterThan(0);
    expect(lettersCiting(cites, { bookId: 'numbers', chapter: 7, verse: quiet })).toEqual([]);
  });
});

describe('lettersCiting: the names Search uses, and verses that are not there (PL-SEARCH 1, 4)', () => {
  it('finds Matthew under the id the search parser and the reader use', () => {
    const plain = lettersCiting(cites, { bookId: 'matthew-plain', chapter: 5, verse: 3 });
    expect(plain.length).toBeGreaterThan(0);
    expect(lettersCiting(cites, { bookId: 'matthew', chapter: 5, verse: 3 })).toEqual(plain);
    expect(lettersCiting(cites, { bookId: 'matthew', chapter: 24 }).length).toBeGreaterThan(0);
    expect(verseIdOf(cites, 'matthew', 5, 3)).toBe(verseIdOf(cites, 'matthew-plain', 5, 3));
    expect(verseIdOf(cites, 'matthew', 5, 3)).toBeGreaterThan(0);
  });

  it('a verse past the chapter\'s end has no letters, and a range is cut at the end', () => {
    expect(lettersCiting(cites, { bookId: 'john', chapter: 3, verse: 36 }).length).toBeGreaterThan(0);
    expect(lettersCiting(cites, { bookId: 'john', chapter: 3, verse: 99 })).toEqual([]);
    expect(lettersCiting(cites, { bookId: 'john', chapter: 3, verse: 40, verseEnd: 50 })).toEqual([]);
    expect(lettersCiting(cites, { bookId: 'john', chapter: 3, verse: 30, verseEnd: 50 }))
      .toEqual(lettersCiting(cites, { bookId: 'john', chapter: 3, verse: 30, verseEnd: 36 }));
  });
});

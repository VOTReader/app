// @ts-nocheck
/* FEAT1: Search's "Letters that cite" file (src/data/verse-cites.js) and the Scripture Web's graph asset
   are written by one generator run from the same rows; these hold them to the same answers, so the count
   in Search and the list in the web can never disagree. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { decodeGraph } from './decode.js';
import { citationsForVerse } from './vot-citations.js';
import { citesGraph, verseIdOf, lettersCiting, ensureVerseCites } from './verse-cites.js';

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

describe('ensureVerseCites: the one-time script load', () => {
  let origAppend;
  let scripts;
  beforeEach(() => {
    scripts = [];
    origAppend = document.head.appendChild;
    document.head.appendChild = (el) => { scripts.push(el); return el; };
    delete window.VERSE_CITES;
  });
  afterEach(() => {
    document.head.appendChild = origAppend;
    delete window.VERSE_CITES;
    vi.resetModules();
  });
  // A fresh module per case: _loading is module state, and one case's load
  // must not answer the next case's call.
  const fresh = async () => (await import('./verse-cites.js')).ensureVerseCites;

  it('resolves the already-loaded file without a script', async () => {
    const data = { books: [] };
    window.VERSE_CITES = data;
    const ensure = await fresh();
    await expect(ensure()).resolves.toBe(data);
    expect(scripts).toEqual([]);
  });

  it('injects the script once and resolves what it sets; a second call shares the load', async () => {
    const ensure = await fresh();
    const p1 = ensure();
    const p2 = ensure();
    expect(scripts.length).toBe(1);
    expect(scripts[0].src).toContain('src/data/verse-cites.js');
    expect(scripts[0].async).toBe(true);
    const data = { books: ['john'] };
    window.VERSE_CITES = data;
    scripts[0].onload();
    await expect(p1).resolves.toBe(data);
    await expect(p2).resolves.toBe(data);
  });

  it('a load that sets nothing resolves null', async () => {
    const ensure = await fresh();
    const p = ensure();
    scripts[0].onload();
    await expect(p).resolves.toBeNull();
  });

  it('a failed load resolves null and the next call tries again', async () => {
    const ensure = await fresh();
    const p = ensure();
    scripts[0].onerror();
    await expect(p).resolves.toBeNull();
    const p2 = ensure();
    expect(scripts.length).toBe(2);
    window.VERSE_CITES = { ok: true };
    scripts[1].onload();
    await expect(p2).resolves.toEqual({ ok: true });
  });

  it('the statically imported copy answers from the window too', async () => {
    window.VERSE_CITES = { books: ['genesis'] };
    await expect(ensureVerseCites()).resolves.toEqual({ books: ['genesis'] });
    expect(scripts).toEqual([]);
  });
});

/* A two-book file small enough to count verse ids by hand: genesis ch1 has
   2 verses (ids 0-1), ch2 has 3 (2-4), john ch1 has 4 (5-8). */
const FAKE = {
  books: ['genesis', 'john'],
  verses: [[2, 3], [4]],
  votCites: [
    { c: 'one', id: 'L1', t: 'Letter One', s: [[5, 0, 2], [6, 0, 1]] },
    { c: 'one', id: 'L1', t: 'Letter One again', s: [[7, 0, 5]] },
    { c: 'two', id: 'L2', t: 'Letter Two', s: [[5, 0, 3], [6, 0, 3]] },
    { c: 'zzz', id: 'X1', t: 'Odd Letter', s: [[5, 0, 0]] },
    { c: 'studies', sid: 'S1', id: 'C1', t: 'Study Chapter', st: 'My Study', s: [[5, 3, 0]] },
  ],
};

describe('citesGraph / verseIdOf / lettersCiting on a hand-counted file', () => {
  it('verseIdOf counts across books and refuses places that are not there', () => {
    expect(verseIdOf(FAKE, 'genesis', 1, 1)).toBe(0);
    expect(verseIdOf(FAKE, 'genesis', 2, 3)).toBe(4);
    expect(verseIdOf(FAKE, 'john', 1, 1)).toBe(5);
    expect(verseIdOf(FAKE, 'john', 1, 4)).toBe(8);
    expect(verseIdOf(null, 'john', 1, 1)).toBe(-1);
    expect(verseIdOf({ books: 'john', verses: [[4]] }, 'john', 1, 1)).toBe(-1);
    expect(verseIdOf(FAKE, '', 1, 1)).toBe(-1);
    expect(verseIdOf(FAKE, 'nobook', 1, 1)).toBe(-1);
    expect(verseIdOf(FAKE, 'john', 0, 1)).toBe(-1);
    expect(verseIdOf(FAKE, 'john', 1, 0)).toBe(-1);
    expect(verseIdOf(FAKE, 'john', 1, 5)).toBe(-1);
    expect(verseIdOf({ books: ['john'], verses: [] }, 'john', 1, 1)).toBe(-1);
  });

  it('citesGraph tolerates a file with no rows or mirrors, ranks first rows, and caches per file', () => {
    const empty = citesGraph({});
    expect(empty.votEdges).toEqual([]);
    expect(empty.mirrors).toEqual({});
    expect(empty.rank).toEqual({});
    const noMirrors = citesGraph({ votCites: FAKE.votCites });
    expect(noMirrors.mirrors).toEqual({});
    expect(noMirrors.rank['one/L1']).toBe(0); // the duplicate row keeps the first place
    expect(noMirrors.rank['study:S1/C1']).toBe(4);
    expect(citesGraph(FAKE)).toBe(citesGraph(FAKE));
    expect(citesGraph(FAKE)).not.toBe(noMirrors);
  });

  it('lettersCiting refuses empty questions', () => {
    expect(lettersCiting(null, { bookId: 'john', chapter: 1 })).toEqual([]);
    expect(lettersCiting(FAKE, null)).toEqual([]);
    expect(lettersCiting(FAKE, {})).toEqual([]);
    expect(lettersCiting(FAKE, { bookId: 'john', chapter: 0 })).toEqual([]);
    expect(lettersCiting(FAKE, { bookId: 'nobook', chapter: 1 })).toEqual([]);
    expect(lettersCiting({ books: ['john'], verses: [], votCites: [] }, { bookId: 'john', chapter: 1 })).toEqual([]);
  });

  it('a range: one row per letter, each place once, first is the earliest paragraph, unknown collections last', () => {
    const rows = lettersCiting(FAKE, { bookId: 'john', chapter: 1, verse: 1, verseEnd: 2 });
    expect(rows.map((r) => r.letterKey)).toEqual(['one/L1', 'two/L2', 'study:S1/C1', 'zzz/X1']);
    const l1 = rows[0];
    expect(l1.places).toBe(2);
    expect(l1.first.paragraph).toBe(1); // verse 2's cite sits earlier in the letter than verse 1's
    expect(rows[1].places).toBe(1); // the same paragraph citing both verses is one place
    expect(rows[2].collectionName).toBe('My Study');
  });

  it('a chapter takes in every verse; verse 0 and a backwards range stay in the chapter', () => {
    const chapter = lettersCiting(FAKE, { bookId: 'john', chapter: 1 });
    expect(chapter.find((r) => r.letterKey === 'one/L1').places).toBe(3);
    expect(lettersCiting(FAKE, { bookId: 'john', chapter: 1, verse: 0 })).toEqual(chapter);
    const backwards = lettersCiting(FAKE, { bookId: 'john', chapter: 1, verse: 2, verseEnd: 1 });
    expect(backwards).toEqual(lettersCiting(FAKE, { bookId: 'john', chapter: 1, verse: 2 }));
    // A corpus with no readers still answers, with empty excerpts.
    expect(lettersCiting(FAKE, { bookId: 'john', chapter: 1, verse: 1 }, {})).toEqual(
      lettersCiting(FAKE, { bookId: 'john', chapter: 1, verse: 1 }));
  });
});

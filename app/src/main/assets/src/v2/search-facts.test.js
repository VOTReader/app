/* v2 Search facts (zv1): the groups, where a hit opens, the Go to rows, the reader's notes matched in memory, and the
   engine settings read from the saved settings. */
import { describe, it, expect } from 'vitest';
import {
  groupOf, colBySearchId, fold, markTerms, hitRoute, collectionNamed, gotoRows, groupHits, notesMatching, searchSettings,
  GATE_CHOSEN, TRY, SCOPES,
} from './search-facts.js';
import { matchExcerpt } from '../search/snippet.js';

const ONE = { volKey: 'one', label: 'Volume One', searchVolId: 'v1', globalName: 'LETTERS_V1' };
const THREE = { volKey: 'three', label: 'Volume Three', searchVolId: 'v3', globalName: 'LETTERS_V3' };
const ANSWERS = { volKey: 'answers', label: 'Answers', searchVolId: 'answers', globalName: 'ANSWERS' };
const HM = { volKey: 'hm', label: 'Hidden Manna', searchVolId: 'hm', globalName: 'HM' };
const gl = {
  COL_BY_KEY: new Map([['one', ONE], ['three', THREE], ['answers', ANSWERS], ['hm', HM]]),
  LETTERS_V1: [{ num: 1, title: 'Chosen by God' }, { num: 2, title: 'Set Apart' }],
};

describe('groups and places', () => {
  it('groupOf: Bible, letters (with WTLB, Blessed, Holy Days), Answers; null for what v2 has no place for', () => {
    expect(groupOf({ kind: 'verse' })).toBe('bible');
    expect(groupOf({ kind: 'heading' })).toBe('bible');
    expect(groupOf({ kind: 'letter' })).toBe('letters');
    expect(groupOf({ kind: 'wtlb-title' })).toBe('letters');
    expect(groupOf({ kind: 'holy-day' })).toBe('letters');
    expect(groupOf({ kind: 'answers' })).toBe('answers');
    expect(groupOf({ kind: 'study-note' })).toBe(null);
    expect(groupOf(null)).toBe(null);
  });

  it('colBySearchId finds the collection by its search volume id', () => {
    expect(colBySearchId('v1', gl)).toBe(ONE);
    expect(colBySearchId('answers', gl)).toBe(ANSWERS);
    expect(colBySearchId('v9', gl)).toBe(null);
    expect(colBySearchId('v1', {})).toBe(null);
  });

  it('hitRoute: a verse opens its chapter marked; a heading its chapter; a letter its collection item; else null', () => {
    expect(hitRoute({ kind: 'verse', bookId: 'john', chapterNum: 3, verseNum: 3 }, ['born again'], gl))
      .toEqual({ place: 'bible-chapter', book: 'john', chapter: 3, verse: 3, match: ['born again'] });
    expect(hitRoute({ kind: 'heading', bookId: 'john', chapterNum: 3 }, ['birth'], gl))
      .toEqual({ place: 'bible-chapter', book: 'john', chapter: 3 });
    expect(hitRoute({ kind: 'letter', volumeId: 'v1', letterNum: 1 }, ['chosen'], gl))
      .toEqual({ place: 'letter', collection: 'one', n: 1, match: ['chosen'] });
    expect(hitRoute({ kind: 'answers', volumeId: 'answers', num: 12 }, [], gl))
      .toEqual({ place: 'letter', collection: 'answers', n: 12, match: [] });
    expect(hitRoute({ kind: 'letter', volumeId: 'v9', letterNum: 1 }, [], gl)).toBe(null);
    expect(hitRoute({ kind: 'study-note' }, [], gl)).toBe(null);
  });

  it("hitRoute: a letter hit carries the words it was found by, cut as main's excerptAnchor cuts them (v2-gaps 9)", () => {
    const text = 'They shall keep My commandments. And keeping them, they shall be kept. Keep watch, says The Lord.';
    const doc = { kind: 'letter', volumeId: 'v1', letterNum: 4, text };
    // the typed words cut it; the engine's other forms only count with them (main sr11), and both are marked
    const r = hitRoute(doc, ['keeping'], gl, ['keep', 'keeping']);
    expect(r).toEqual({ place: 'letter', collection: 'one', n: 4, match: ['keeping', 'keep'],
      excerpt: matchExcerpt(text, ['keeping'], undefined, ['keep', 'keeping']) });
    expect(r.excerpt).toContain('keeping them');
    // a typo the engine corrected: the typed word finds nothing, its words cut the excerpt
    expect(hitRoute(doc, ['kepeing'], gl, ['keeping']).excerpt).toContain('keeping them');
    // the Bible's route is unchanged; its match takes the engine's words too
    expect(hitRoute({ kind: 'verse', bookId: 'john', chapterNum: 3, verseNum: 3 }, ['born'], gl, ['again']))
      .toEqual({ place: 'bible-chapter', book: 'john', chapter: 3, verse: 3, match: ['born', 'again'] });
  });

  it('groupHits keeps the engine order inside each group and drops what has no group', () => {
    const a = { doc: { kind: 'letter', id: 'a' } };
    const b = { doc: { kind: 'verse', id: 'b' } };
    const c = { doc: { kind: 'letter', id: 'c' } };
    const d = { doc: { kind: 'hidden-manna', id: 'd' } };
    expect(groupHits([a, b, d, c])).toEqual({ letters: [a, c], bible: [b], answers: [] });
    expect(groupHits(null)).toEqual({ letters: [], bible: [], answers: [] });
  });
});

describe('words', () => {
  it('fold: lower case, accents and curly quotes folded, spaces made one', () => {
    expect(fold('  Chosen’s   Way ')).toBe("chosen's way");
    expect(fold('Éphèse')).toBe('ephese');
    expect(fold(null)).toBe('');
  });

  it('markTerms: phrase and run first, stop words dropped only when real words were typed too', () => {
    const stop = new Set(['the', 'of']);
    expect(markTerms({ kind: 'ref-bible' }, ['john'], stop)).toEqual([]);
    expect(markTerms({ kind: 'text', phrase: 'born again' }, ['born', 'again'], stop)).toEqual(['born again', 'born', 'again']);
    expect(markTerms({ kind: 'text' }, ['the', 'chosen'], stop)).toEqual(['chosen']);
    expect(markTerms({ kind: 'text' }, ['the', 'of'], stop)).toEqual(['the', 'of']);
  });

  it('collectionNamed: a collection by its name or number; Hidden Manna and unknown names are not', () => {
    expect(collectionNamed('Volume Three', gl)).toBe(THREE);
    expect(collectionNamed('volume 3', gl)).toBe(THREE);
    expect(collectionNamed('v3', gl)).toBe(THREE);
    expect(collectionNamed('vol. 3', gl)).toBe(THREE);
    expect(collectionNamed('Hidden Manna', gl)).toBe(null);
    expect(collectionNamed('chosen', gl)).toBe(null);
  });
});

describe('Go to', () => {
  it('a Bible reference: its chapter (and verse) first', () => {
    expect(gotoRows('John 3', { kind: 'ref-bible', bookId: 'john', bookTitle: 'John', chapter: 3 }, [], gl)).toEqual([
      { key: 'b/john/3/', where: 'The Bible', title: 'John 3', route: { place: 'bible-chapter', book: 'john', chapter: 3 } },
    ]);
    const [row] = gotoRows('John 3:16', { kind: 'ref-bible', bookId: 'john', bookTitle: 'John', chapter: 3, verseStart: 16 }, [], gl);
    expect(row.title).toBe('John 3:16');
    expect(row.route).toEqual({ place: 'bible-chapter', book: 'john', chapter: 3, verse: 16 });
  });

  it('a book, a letter by number, a collection by name', () => {
    expect(gotoRows('John', { kind: 'ref-book', bookId: 'john', bookTitle: 'John' }, [], gl).map((r) => r.route))
      .toEqual([{ place: 'bible-book', book: 'john' }]);
    expect(gotoRows('v1 l1', { kind: 'ref-letter', volumeId: 'v1', letterNum: 1 }, [], gl)).toEqual([
      { key: 'l/one/1', where: 'Volume One · Letter 1', title: 'Chosen by God', route: { place: 'letter', collection: 'one', n: 1 } },
    ]);
    expect(gotoRows('Volume Three', { kind: 'text' }, [], gl)).toEqual([
      { key: 'c/three', where: 'The letters', title: 'Volume Three', route: { place: 'collection', collection: 'three' } },
    ]);
  });

  it('titles that hold the whole query (3b: "chosen" -> Chosen by God), once each, never a verse', () => {
    const rows = gotoRows('chosen', GATE_CHOSEN.parsed, GATE_CHOSEN.hits, gl);
    expect(rows).toEqual([
      { key: 'l/one/1', where: 'Volume One · Letter 1', title: 'Chosen by God', route: { place: 'letter', collection: 'one', n: 1, match: [] } },
    ]);
    // the same letter named by number and by title shows once
    const both = gotoRows('chosen', { kind: 'ref-letter', volumeId: 'v1', letterNum: 1 }, GATE_CHOSEN.hits, gl);
    expect(both.map((r) => r.key)).toEqual(['l/one/1']);
    // two letters' worth of query is too short to match titles
    expect(gotoRows('ch', GATE_CHOSEN.parsed, GATE_CHOSEN.hits, gl)).toEqual([]);
  });
});

describe('notes and settings', () => {
  const marks = [
    { id: 'j', title: 'On being set apart', text: 'What “set apart for My glory” asks of me' },
    { id: 'n', quote: 'Timothy, write as I speak.', note: 'Read this again on Sunday.' },
  ];

  it('notesMatching: every typed word must appear somewhere in the mark', () => {
    expect(notesMatching('set apart', marks).map((m) => m.id)).toEqual(['j']);
    expect(notesMatching('glory SUNDAY', marks)).toEqual([]);
    expect(notesMatching('sunday timothy', marks).map((m) => m.id)).toEqual(['n']);
    expect(notesMatching('a', marks)).toEqual([]);
    expect(notesMatching('set', null)).toEqual([]);
  });

  it('searchSettings: the saved settings when the store is ready, else main defaults', () => {
    expect(searchSettings({})).toEqual({ translation: 'nkjv', useStopWords: true, synonyms: true });
    const store = (settings, ready = true) => ({ StateStore: { isReady: () => ready, get: () => ({ settings }) } });
    expect(searchSettings(store({ translation: 'kjv', searchSynonyms: false })))
      .toEqual({ translation: 'kjv', useStopWords: true, synonyms: false });
    expect(searchSettings(store({ translation: 'kjv' }, false))).toEqual({ translation: 'nkjv', useStopWords: true, synonyms: true });
    expect(searchSettings({ StateStore: { isReady: () => true, get: () => { throw new Error('x'); } } }))
      .toEqual({ translation: 'nkjv', useStopWords: true, synonyms: true });
  });

  it('the picture lists: five Try chips, five scopes', () => {
    expect(TRY).toEqual(['born again', 'set apart', 'Chosen by God', 'John 3', 'Volume Three']);
    expect(SCOPES.map((s) => s.label)).toEqual(['All', 'Letters', 'Bible', 'Answers', 'Notes']);
  });
});

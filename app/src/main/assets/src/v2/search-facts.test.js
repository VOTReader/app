/* v2 Search facts (zv1; zs26 = design dz19): the groups, where a hit opens, the Go to rows with main's songs row, the
   reader's notes matched in memory, the engine settings; then main's count, Best matches (on 3b's engine rows: the
   original before its reprint), Book order's sections and the passage split, the excerpt's cut, the more places, the
   place Search was opened from, did you mean. */
import { describe, it, expect } from 'vitest';
// @ts-ignore: node in a test (this tsconfig has no node types)
import fs from 'node:fs';
// @ts-ignore: node in a test (this tsconfig has no node types)
import path from 'node:path';
// @ts-ignore: node in a test (this tsconfig has no node types)
import { fileURLToPath } from 'node:url';
import {
  groupOf, colBySearchId, fold, markTerms, hitWords, hitRoute, collectionNamed, gotoRows, songsLabel, songsFound, groupHits,
  notesMatching, searchSettings, summaryOf, matchCount, topResults, namesAPlace, bookSections, sectionCount, closeSplit,
  sortShown, exWindow, excerptOf, hitExcerpt, placeStartOf, placesOf, placesLabel, moreLabel, searchContext, engineScope,
  didYouMean, gateFound, docKey, TRY, SCOPES,
} from './search-facts.js';
import { matchExcerpt, morePlaces } from '../search/snippet.js';

const ROWS = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'gate-data/search-rows.json'), 'utf8'));

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
    expect(gotoRows('John 3', { kind: 'ref-bible', bookId: 'john', bookTitle: 'John', chapter: 3 }, 0, gl)).toEqual([
      { key: 'b/john/3/', where: 'The Bible', title: 'John 3', route: { place: 'bible-chapter', book: 'john', chapter: 3 } },
    ]);
    const [row] = gotoRows('John 3:16', { kind: 'ref-bible', bookId: 'john', bookTitle: 'John', chapter: 3, verseStart: 16 }, 0, gl);
    expect(row.title).toBe('John 3:16');
    expect(row.route).toEqual({ place: 'bible-chapter', book: 'john', chapter: 3, verse: 16 });
  });

  it('a book, a letter by number, a collection by name', () => {
    expect(gotoRows('John', { kind: 'ref-book', bookId: 'john', bookTitle: 'John' }, 0, gl).map((r) => r.route))
      .toEqual([{ place: 'bible-book', book: 'john' }]);
    expect(gotoRows('v1 l1', { kind: 'ref-letter', volumeId: 'v1', letterNum: 1 }, 0, gl)).toEqual([
      { key: 'l/one/1', where: 'Volume One · Letter 1', title: 'Chosen by God', route: { place: 'letter', collection: 'one', n: 1 } },
    ]);
    expect(gotoRows('Volume Three', { kind: 'text' }, 0, gl)).toEqual([
      { key: 'c/three', where: 'The letters', title: 'Volume Three', route: { place: 'collection', collection: 'three' } },
    ]);
  });

  it("titles that hold the words leave Go to (the engine ranks them into Best matches); main's songs row comes last", () => {
    expect(gotoRows('chosen', ROWS['3b'].parsed, 0, gl)).toEqual([]);
    expect(gotoRows(' chosen ', ROWS['3b'].parsed, 1, gl)).toEqual([
      { key: 'songs', where: 'Songs of the Letters', title: '1 song matches “chosen”', route: { place: 'songs', q: 'chosen' } },
    ]);
    expect(gotoRows('Volume Three', { kind: 'text' }, 1200, gl).map((r) => r.title)).toEqual(['Volume Three', '1,200 songs match “Volume Three”']);
    expect(songsLabel(3, 'born again')).toBe('3 songs match “born again”');
  });

  it("songsFound: main's findSongFamilies over the loaded catalog, two characters at least, 0 before it loads or on a throw", () => {
    const fam = { findSongFamilies: (q) => (q === 'chosen' ? [1, 2] : []) };
    expect(songsFound('chosen', fam)).toBe(2);
    expect(songsFound('c', fam)).toBe(0);
    expect(songsFound('chosen', {})).toBe(0);
    expect(songsFound('chosen', { findSongFamilies: () => { throw new Error('x'); } })).toBe(0);
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
    const D = { translation: 'nkjv', useStopWords: true, synonyms: true, history: true };
    expect(searchSettings({})).toEqual(D);
    const store = (settings, ready = true) => ({ StateStore: { isReady: () => ready, get: () => ({ settings }) } });
    expect(searchSettings(store({ translation: 'kjv', searchSynonyms: false, historyEnabled: false })))
      .toEqual({ translation: 'kjv', useStopWords: true, synonyms: false, history: false });
    expect(searchSettings(store({ translation: 'kjv' }, false))).toEqual(D);
    expect(searchSettings({ StateStore: { isReady: () => true, get: () => { throw new Error('x'); } } })).toEqual(D);
  });

  it('the picture lists: five Try chips, five scopes', () => {
    expect(TRY).toEqual(['born again', 'set apart', 'Chosen by God', 'John 3', 'Volume Three']);
    expect(SCOPES.map((s) => s.label)).toEqual(['All', 'Letters', 'Bible', 'Answers', 'Notes']);
  });
});

const doc = (o) => ({ kind: 'letter', volumeId: 'v1', letterNum: 1, title: 'T', text: '', ...o });

describe("main's count, Best matches and the order switch", () => {
  it('summaryOf: how many, in how many of main\'s sections, "+" when a capped collection or the total was cut', () => {
    const hits = [{ doc: doc({ volumeId: 'v1' }) }, { doc: doc({ volumeId: 'v1', letterNum: 2 }) }, { doc: { kind: 'verse', volumeId: 'bible' } }];
    expect(summaryOf(hits)).toEqual({ count: 3, sections: 2, more: false });
    expect(summaryOf(hits, { capped: ['v1'] }).more).toBe(true);
    expect(summaryOf(hits, { capped: ['v7'] }).more).toBe(false);
    expect(summaryOf(hits, { truncated: true }).more).toBe(true);
    expect(summaryOf(null)).toEqual({ count: 0, sections: 0, more: false });
    expect(matchCount(1204, false)).toBe('1,204');
    expect(matchCount(669, true)).toBe('669+');
  });

  it("topResults on 3b's engine rows: main's five in the engine's order, the original (Volume Four 18) before its reprint", () => {
    const top = topResults(ROWS['3b'].hits, 18);
    expect(top.map((h) => h.doc.ref)).toEqual(['Volume Four · Letter 18', 'Words To Live By: Part One 35', 'Volume Three · Letter 21',
      'Volume One · Letter 1', "Letters to The Lord's Little Flock · Letter 55"]);
    // none for one section (3h), a named place, or no hits
    expect(topResults(ROWS['3b'].hits, 1)).toEqual([]);
    expect(topResults(ROWS['3b'].hits, 18, true)).toEqual([]);
    expect(topResults([], 18)).toEqual([]);
  });

  it('topResults: one card per text (a word-for-word reprint is one), only what v2 can open, five at most', () => {
    const a = { doc: doc({ title: 'A', text: 'same words' }) };
    const reprint = { doc: doc({ kind: 'holy-day', volumeId: 'holydays', title: 'A', text: 'same words' }) };
    const hm = { doc: { kind: 'hidden-manna', title: 'H', text: 'x' } };
    const more = [1, 2, 3, 4, 5].map((n) => ({ doc: doc({ title: 'L' + n, letterNum: n + 1 }) }));
    expect(topResults([a, reprint, hm, ...more], 3).map((h) => h.doc.title)).toEqual(['A', 'L1', 'L2', 'L3', 'L4']);
    expect(namesAPlace({ kind: 'ref-bible' })).toBe(true);
    expect(namesAPlace({ kind: 'text' })).toBe(false);
    expect(namesAPlace(null)).toBe(false);
  });

  it("sortShown: with Best matches, or a section with two to order (main's sortToggleVisible)", () => {
    const one = { doc: doc({}) };
    const v = { doc: { kind: 'verse', volumeId: 'bible' } };
    expect(sortShown([one], [one])).toBe(true);
    expect(sortShown([], [one, v])).toBe(false);
    expect(sortShown([], [one, v, { doc: doc({ letterNum: 2 }) }])).toBe(true);
  });
});

describe('Book order', () => {
  const COLS = {
    COL_BY_KEY: new Map([['one', { volKey: 'one', label: 'Volume One', searchVolId: 'v1' }], ['seven', { volKey: 'seven', label: 'Volume Seven', searchVolId: 'v7' }],
      ['wtlb2', { volKey: 'wtlb2', label: 'Words To Live By: Part Two', searchVolId: 'wtlb2' }]]),
  };

  it("bookSections: the Bible first, then the collections in the site's order, each in reading order, named and counted", () => {
    const hits = [{ doc: doc({ volumeId: 'v7', letterNum: 9 }) }, { doc: doc({ volumeId: 'v1', letterNum: 4 }) },
      { doc: { kind: 'verse', volumeId: 'bible', bookId: 'john', chapterNum: 3, verseNum: 3 } }, { doc: doc({ volumeId: 'v1', letterNum: 2 }) },
      { doc: { kind: 'study-note' } }];
    const secs = bookSections(hits, COLS);
    expect(secs.map((s) => [s.key, s.label, sectionCount(s)])).toEqual([
      ['bible', 'The Bible', '1 verse'], ['v1', 'Volume One', '2 letters'], ['v7', 'Volume Seven', '1 letter']]);
    expect(secs[1].items.map((h) => h.doc.letterNum)).toEqual([2, 4]);
    expect(moreLabel(7)).toBe('Show 7 more');
    expect(moreLabel(1204)).toBe('Show 50 more of 1,204');
  });

  it("closeSplit on 3e's rows: the two close matches by collection, the rest apart; null for a keyword search", () => {
    const split = closeSplit(ROWS['3e'].hits, COLS);
    expect(split.close.map((s) => s.label + ' · ' + sectionCount(s))).toEqual(['Volume Seven · 1 letter', 'Words To Live By: Part Two · 1 entry']);
    expect(split.looseCount).toBe(ROWS['3e'].hits.length - 2);
    expect(closeSplit(ROWS['3b'].hits, COLS)).toBe(null);
    expect(closeSplit([{ doc: doc({}), close: true }], COLS)).toBe(null);
  });
});

describe('a row', () => {
  it('exWindow (dz19): open at the sentence of the first mark within 70 characters, else ~50 before it; one ellipsis each cut', () => {
    expect(exWindow('A short line. It is chosen here.', ['chosen'])).toBe('…It is chosen here.');
    const long = 'word '.repeat(30) + 'and the chosen one';
    const cut = exWindow(long, ['chosen']);
    expect(cut.startsWith('…')).toBe(true);
    expect(cut.indexOf('chosen')).toBeLessThan(60);
    expect(exWindow('nothing marked here', ['chosen'])).toBe('nothing marked here');
    expect(exWindow('He said... Then chosen ones…...', ['chosen'])).toBe('…Then chosen ones…');
  });

  it("3b's first row: the cut design drew from main's 180-character snippet, and its one more place", () => {
    const h = ROWS['3b'].hits[0];
    const words = hitWords(markTerms(ROWS['3b'].parsed, ROWS['3b'].parsedTerms, new Set(['the', 'of'])), h.terms);
    expect(excerptOf(h.doc.text, words)).toBe('…who you choose, not what you choose, is the answer. For who you choose defines what you do. '
      + 'And whosoever chooses another, and not Me in truth, has chosen themselves, and…');
    expect(placesOf(h.doc, words)).toEqual({ unit: 'letter', list: morePlaces(h.doc.text, words) });
    expect(placesOf(h.doc, words).list).toHaveLength(1);
  });

  it("3h's rows: main's words without the stop word, design dz28's places (15: 4, 18: 6, 23: 1, 29: 2)", () => {
    const stop = new Set(['of', 'the']);
    const terms = markTerms(ROWS['3h'].parsed, ROWS['3h'].parsedTerms, stop);
    expect(terms).toEqual(['churches', 'men']);
    const n = ROWS['3h'].hits.slice(0, 4).map((h) => placesOf(h.doc, hitWords(terms, h.terms, stop)).list.length);
    expect(n).toEqual([4, 6, 1, 2]);
  });

  it("hitWords: the engine's forms join the typed words, a stop word among them left unmarked (3h)", () => {
    const stop = new Set(['of']);
    expect(hitWords(['churches', 'men'], ['churches', 'of', 'church'], stop)).toEqual(['churches', 'men', 'church']);
    expect(hitWords([], ['of'], stop)).toEqual(['of']);
    expect(hitWords(['grace'], undefined)).toEqual(['grace']);
  });

  it("hitExcerpt: a verse whole, a heading its heading, a title hit none, else the cut (at the engine's place when it has one)", () => {
    expect(hitExcerpt({ kind: 'verse', text: 'For God so loved' }, ['loved'])).toBe('For God so loved');
    expect(hitExcerpt({ kind: 'heading', heading: 'The New Birth', text: 'x' }, [])).toBe('The New Birth');
    expect(hitExcerpt({ kind: 'letter-title', title: 'Chosen', text: 'Chosen' }, ['chosen'])).toBe('');
    const text = 'First part about bread. ' + 'filler words go here. '.repeat(20) + 'Second part about chosen sons.';
    expect(hitExcerpt({ kind: 'letter', text }, ['chosen'])).toContain('chosen sons');
    expect(hitExcerpt({ kind: 'letter', text }, ['chosen'], 0)).toMatch(/^First part about bread/);
    expect(placeStartOf({ placeStart: 5, doc: { text } })).toBe(5);
    expect(placeStartOf({ placeStart: 99999, doc: { text } })).toBe(undefined);
    expect(placeStartOf({ doc: { text } })).toBe(undefined);
  });

  it('placesOf: none for a verse or a title; "N more places in this letter / entry / topic"', () => {
    expect(placesOf({ kind: 'verse', text: 'chosen chosen' }, ['chosen'])).toEqual({ unit: '', list: [] });
    expect(placesOf({ kind: 'letter-title', text: 'chosen' }, ['chosen'])).toEqual({ unit: '', list: [] });
    expect(placesOf({ kind: 'answers', text: '' }, ['chosen'])).toEqual({ unit: '', list: [] });
    expect(placesLabel(1, 'letter')).toBe('1 more place in this letter');
    expect(placesLabel(7, 'topic')).toBe('7 more places in this topic');
  });

  it("hitRoute at a place: the letter lands on the 48 characters there (main's dispatcher); one key per doc", () => {
    const text = 'One two three. ' + 'Here the chosen stand and the rest follow on behind them.';
    const r = hitRoute({ kind: 'letter', volumeId: 'v1', letterNum: 4, text }, ['chosen'], gl, [], 15);
    expect(r.excerpt).toBe(text.slice(15, 63));
    expect(docKey({ id: 'x' })).toBe('x');
    expect(docKey({ kind: 'verse', volumeId: 'bible', bookId: 'john', chapterNum: 3, verseNum: 16 })).toBe('verse/bible/john//3/16');
  });
});

describe('where Search was opened from', () => {
  const G = { COL_BY_KEY: new Map([['three', { volKey: 'three', label: 'Volume Three', searchVolId: 'v3' }],
    ['hm', { volKey: 'hm', label: 'Hidden Manna', searchVolId: 'hm', indexed: false }]]) };

  it("searchContext: a collection's letter or page, a Bible book or chapter; nothing elsewhere or unindexed", () => {
    expect(searchContext({ place: 'letter', collection: 'three', n: 15 }, G)).toEqual({ kind: 'volume', key: 'v:v3', volumeId: 'v3', label: 'Volume Three' });
    expect(searchContext({ place: 'collection', collection: 'three' }, G).key).toBe('v:v3');
    expect(searchContext({ place: 'letter', collection: 'hm', n: 1 }, G)).toBe(null);
    expect(searchContext({ place: 'home' }, G)).toBe(null);
    expect(searchContext(null, G)).toBe(null);
    const book = searchContext({ place: 'bible-chapter', book: 'joel', chapter: 2 }, G);
    expect(book).toMatchObject({ kind: 'book', key: 'b:joel', bookId: 'joel' });
    expect(engineScope(book)).toEqual({ bookId: 'joel' });
    expect(engineScope(searchContext({ place: 'collection', collection: 'three' }, G))).toEqual({ volumeId: 'v3' });
    expect(engineScope(null)).toBe(null);
  });
});

describe('the notes line and a gate answer', () => {
  const E = { VotSearchMini: { fuzzyBookSuggest: (q) => ({ genisis: 'genesis', john: 'john' })[q] || null },
    VotSearchData: { BOOK_DISPLAY: { genesis: 'Genesis', john: 'John' } } };

  it("didYouMean: one word of 4 to 15 letters that found nothing, named as main's fuzzyBookSuggest names it", () => {
    expect(didYouMean('genisis', { kind: 'text' }, 0, E)).toBe('Genesis');
    expect(didYouMean('john', { kind: 'text' }, 0, E)).toBe(null); // what was typed
    expect(didYouMean('genisis', { kind: 'text' }, 3, E)).toBe(null);
    expect(didYouMean('gen 1', { kind: 'text' }, 0, E)).toBe(null);
    expect(didYouMean('genisis', { kind: 'ref-bible' }, 0, E)).toBe(null);
    expect(didYouMean('genisis', { kind: 'text' }, 0, {})).toBe(null);
  });

  it("gateFound: main's parse, the marked words without the stop word, the engine's summary and corrections", () => {
    const f = gateFound(ROWS['3f'], { VotSearchData: { STOP_WORDS_TRIMMED: new Set(['of']) } });
    expect(f.phase).toBe('done');
    expect(f.summary).toEqual({ count: 661, sections: 17, capped: true, loose: 0 });
    expect(f.corrections[0].from).toBe('rightousness');
    expect(gateFound(ROWS['3h'], { VotSearchData: { STOP_WORDS_TRIMMED: new Set(['of']) } }).terms).toEqual(['churches', 'men']);
  });
});

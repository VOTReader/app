/* A NUMBER IS ONE TOKEN HOWEVER IT IS WRITTEN (search200 B2, 2026-10-18). "Part Two" and
   "part 2" were different words, so a title typed with its number as a digit (or written
   with one, and typed in words) matched only its other words, and a denser neighbour
   ("Part Five") led it. Now kjvEncode, on both sides of the index, reads two through
   twenty and the tens as digits, first through twentieth as 1st-20th, "144 000" as
   144000, "&" as "and", and a negative contraction as its two words ("don't" and "dont"
   are "do not"). "One" stays a word, and is 1 only where titles are compared. A title
   whose number is not the one typed is no title named. Fixture texts only (no benchmark
   query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E, expandContractions } from './engine.js';
import { titleMatch, titleLevel, TITLE_EXACT_BOOST, TITLE_LEVEL_TYPED } from './ranking.js';
import { kjvEncode, expandArchaicTerms } from './tokenize.js';
import { highlightSpans } from './snippet.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'do']);

describe('kjvEncode folds numbers, "&" and contractions (B2)', () => {
  it('a number word is its digits, on either side', () => {
    expect(kjvEncode('Seeds Part Two')).toEqual(kjvEncode('seeds part 2'));
    expect(kjvEncode('Seeds Part Two')).toEqual(['seeds', 'part', '2']);
    expect(kjvEncode('seven lamps and twelve gates')).toEqual(['7', 'lamps', 'and', '12', 'gates']);
    expect(kjvEncode('forty days')).toEqual(['40', 'days']);
  });

  it('"one" stays a word: mostly no number, and as 1 it would meet every date and "Volume 1"', () => {
    expect(kjvEncode('the one who overcomes')).toEqual(['the', 'one', 'who', 'overcomes']);
    expect(kjvEncode('twenty-one')).toEqual(['21']);
  });

  it('a compound number is one number; one joined by "and" stays as written', () => {
    expect(kjvEncode('twenty-four elders')).toEqual(kjvEncode('24 elders'));
    expect(kjvEncode('ninety nine sheep')).toEqual(['99', 'sheep']);
    expect(kjvEncode('twenty and four')).toEqual(['20', 'and', '4']);
  });

  it('an ordinal is its digits and suffix', () => {
    expect(kjvEncode('the sixth seal')).toEqual(kjvEncode('the 6th seal'));
    expect(kjvEncode('the first day')).toEqual(['the', '1st', 'day']);
    expect(kjvEncode('the twenty-first')).toEqual(['the', '21st']);
    expect(kjvEncode('the twentieth year')).toEqual(['the', '20th', 'year']);
  });

  it('a number written with a space between its thousands is one number; other numbers stay apart', () => {
    expect(kjvEncode('144 000')).toEqual(['144000']);
    expect(kjvEncode('the 12 000 sealed')).toEqual(['the', '12000', 'sealed']);
    expect(kjvEncode('1 000 000')).toEqual(['1000000']);
    expect(kjvEncode('psalm 119 105')).toEqual(['psalm', '119', '105']);
  });

  it('"&" is "and"', () => {
    expect(kjvEncode('Questions & Answers')).toEqual(['questions', 'and', 'answers']);
    expect(kjvEncode('salt&light')).toEqual(['salt', 'and', 'light']);
  });

  it('a negative contraction is its two words, with or without its apostrophe ("wont" is the KJV word)', () => {
    expect(kjvEncode('don’t look back')).toEqual(['do', 'not', 'look', 'back']);
    expect(kjvEncode('dont look back')).toEqual(['do', 'not', 'look', 'back']);
    expect(kjvEncode("can't, cant")).toEqual(['cannot', 'cannot']);
    expect(kjvEncode("won't, shouldnt")).toEqual(['will', 'not', 'should', 'not']);
    expect(kjvEncode('the ox was wont to gore')).toEqual(['the', 'ox', 'was', 'wont', 'to', 'gore']);
    // the query keeps a bare one as typed (kjvEncode reads it); one typed with its apostrophe is spelled out
    expect(expandContractions('dont look, cant see')).toBe('dont look, cant see');
    expect(expandContractions("Don't look, can't see, won't hear")).toBe('Do not look, cannot see, will not hear');
  });

  it('a number highlights in either spelling', () => {
    expect(expandArchaicTerms(['6'])).toEqual(['6', 'six']);
    expect(expandArchaicTerms(['six'])).toEqual(['six', '6']);
    expect(expandArchaicTerms(['24th'])).toEqual(expect.arrayContaining(['24th', 'twenty-fourth']));
    const marked = highlightSpans('Part Six of the seeds', ['6']).filter((s) => s.hit).map((s) => s.text);
    expect(marked).toEqual(['Six']);
  });
});

describe('a title with another number is no title named (B2)', () => {
  it('titleMatch vetoes a title whose number is not the one typed', () => {
    expect(titleMatch(kjvEncode('Seeds Part Five'), kjvEncode('seeds part 6'), STOP)).toBe(1);
    expect(titleMatch(kjvEncode('Seeds Part Six'), kjvEncode('seeds part 6'), STOP)).toBe(TITLE_EXACT_BOOST);
    expect(titleMatch(kjvEncode('Seeds Part 6'), kjvEncode('seeds part six'), STOP)).toBe(TITLE_EXACT_BOOST);
    // a number the title holds among others still names it
    expect(titleMatch(kjvEncode('Seeds Parts Five and Six'), kjvEncode('seeds parts six'), STOP)).toBeGreaterThan(1);
  });

  it('a title\'s "One" is 1 where titles are compared', () => {
    expect(titleMatch(kjvEncode('Seeds Part One'), kjvEncode('seeds part 1'), STOP)).toBe(TITLE_EXACT_BOOST);
    expect(titleLevel(kjvEncode('Seeds Part One'), kjvEncode('seeds part 1'))).toBe(TITLE_LEVEL_TYPED);
    expect(titleMatch(kjvEncode('Seeds Part Two'), kjvEncode('seeds part 1'), STOP)).toBe(1);
    expect(titleMatch(kjvEncode('Seeds Part One'), kjvEncode('seeds part 2'), STOP)).toBe(1);
  });
});

const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [
    { id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' },
  ],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'The Lord speaks to His people of many things, of the morning and of the evening, of the field and of the vineyard. '.repeat(n);
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger, the locust and the spider, in the house of kings ' + i + '.' })) }] },
    ] },
  },
  LETTERS_V4: [
    // a series: the part typed in digits, its neighbour's body thick with the series' word
    { id: 'seeds-5', num: 5, title: 'Seeds Part Five', blocks: [para('The seeds, the seeds sown in the field: seeds of the morning. '.repeat(4))] },
    { id: 'seeds-6', num: 6, title: 'Seeds Part Six', blocks: [para(filler(14) + 'Sow your seeds.')] },
    { id: 'seeds-7', num: 7, title: 'Seeds Part Seven', blocks: [para('The seeds that fall and the seeds that grow. '.repeat(3))] },
    { id: 'seeds-1', num: 1, title: 'Seeds Part One', blocks: [para(filler(4) + 'Sow your seeds in the field. ' + filler(10) + 'Go out and sow six seeds by the water.')] },
    // a negative contraction spelled out in one, contracted in the other, among many saying the word alone
    { id: 'spelled', num: 20, title: 'In Due Season', blocks: [para(filler(6) + 'Do not grow weary in the vineyard.')] },
    { id: 'contracted', num: 21, title: 'The Laborer', blocks: [para(filler(6) + 'Don’t grow weary in the vineyard.')] },
    ...Array.from({ length: 12 }, (_, i) => ({ id: 'weary-' + i, num: 30 + i, title: 'Rest ' + (i + 30), blocks: [para('They grow weary in the vineyard, and the weary find rest.')] })),
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('the engine reads numbers and contractions as folded (B2)', () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await E.init();
  }, 60000);
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('a part typed in digits finds the part written in words, before its denser neighbour', async () => {
    expect(ids(await E.search('seeds part 6'))[0]).toBe('seeds-6');
    expect(ids(await E.search('seeds part six'))[0]).toBe('seeds-6');
    // "One" is a word in the index, and 1 in the title
    expect(ids(await E.search('seeds part 1'))[0]).toBe('seeds-1');
  });

  it('the landing finds a number typed in digits where the text writes it as a word', async () => {
    const r = await E.search('sow 6 seeds');
    const hit = r.results.find((x) => x.doc.letterId === 'seeds-1');
    expect(hit).toBeTruthy();
    expect(E.matchExcerpt(hit.doc.text, ['sow', '6', 'seeds'], undefined, hit.terms)).toContain('sow six seeds');
  });

  it('a contraction typed without its apostrophe finds the words spelled out and contracted', async () => {
    const top = ids(await E.search('dont grow weary')).slice(0, 2);
    expect(top).toEqual(expect.arrayContaining(['spelled', 'contracted']));
  });
});

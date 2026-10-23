/* A COLLECTION'S NAME TYPED ALONE OPENS IT (search200 wave 3, U02.5, 2026-10-23). The UX sweep's seeker typed the
   name of a collection: "letters from timothy" led with a Bible study and Answers topics that say "letters" and
   "from" and "Timothy" often, and the collection's own first page was nowhere near the top. A collection's full name
   typed alone (scope-word.js's names, "the" before it allowed) now puts that collection's front page first: the text
   titled with the name, else its preface, else its first letter. The name beside other words stays a scope
   (scope-word.js), and a search kept to another corpus or scope is left alone. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'from', 'with', 'all']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [
    { id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' },
    { id: 'v5', screen: 'vot-five-letter', dataVar: 'LETTERS_V5', prefaceVar: null, label: 'Volume Five' },
    { id: 'timothy', screen: 'vot-timothy-letter', dataVar: 'LETTERS_TIMOTHY', prefaceVar: 'LETTERS_TIMOTHY_PREFACE', label: 'Letters from Timothy' },
  ],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const filler = (n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const seg = (v) => [{ segments: [{ v }] }];
const GLOBALS = {
  BOOKS: {},
  // texts dense in the name's words, none of them the collection
  LETTERS_V1: [
    { id: 'letters-and-timothy', num: 1, title: 'Letters and Timothy', blocks: seg('These letters from Timothy, letters written from Timothy, letters from My servant Timothy. ' + filler(1)) },
    { id: 'five-volumes', num: 2, title: 'The Fifth Volume', blocks: seg('Volume five follows volume four; read volume five, the fifth volume. ' + filler(1)) },
  ],
  LETTERS_V5: [
    { id: 'v5-first', num: 1, title: 'The First of Five', blocks: seg(filler(3)) },
    { id: 'v5-second', num: 2, title: 'The Second of Five', blocks: seg(filler(3)) },
  ],
  LETTERS_TIMOTHY_PREFACE: { id: 'put-all-your-trust', title: 'Put All Your Trust in The Holy One', blocks: seg('Fear God and put all your trust in The Holy One. ' + filler(3)) },
  LETTERS_TIMOTHY: [
    { id: 'timothy-one', num: 1, title: 'A Letter of Timothy', blocks: seg('Timothy writes. ' + filler(3)) },
  ],
};
const lead = (r) => r.results[0] && r.results[0].doc.letterId;

describe("a collection's name typed alone opens it", () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await E.init();
  });
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('"letters from timothy": its preface comes first', async () => {
    expect(lead(await E.search('letters from timothy'))).toBe('put-all-your-trust');
    expect(lead(await E.search('Letters From Timothy'))).toBe('put-all-your-trust');
  });

  it('"volume five" (and "vol 5"): its first letter comes first, the collection having no preface', async () => {
    expect(lead(await E.search('volume five'))).toBe('v5-first');
    expect(lead(await E.search('vol 5'))).toBe('v5-first');
  });

  it('shown once: the front page is not listed twice', async () => {
    const r = await E.search('letters from timothy');
    expect(r.results.filter((e) => e.doc.letterId === 'put-all-your-trust').length).toBe(1);
  });

  it('the name beside other words, or a search kept to the Scriptures, is not pinned', async () => {
    expect(lead(await E.search('letters from timothy servant'))).not.toBe('put-all-your-trust');
    const scr = await E.search('letters from timothy', { corpus: 'scriptures' });
    expect(scr.results.some((e) => e.doc.letterId === 'put-all-your-trust')).toBe(false);
  });
});

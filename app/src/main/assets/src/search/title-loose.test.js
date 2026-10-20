/* A TITLE REMEMBERED LOOSELY: THE GUARDS AND THE LIFTS AROUND IT (search200 fix1, 2026-10-20). The engine's own reads of
   a title named loosely (B5's admission, last2's one word wrong, the title lift) and the texts it weighs that title
   against. Fixture texts and titles only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'had', 'has', 'have', 'they', 'them', 'their', 'we', 'our', 'me', 'him', 'her', 'she', 'this', 'from', 'or', 'as', 'if', 'than', 'then', 'yet', 'do', 'did', 'does', 'been', 'were', 'said', 'will', 'your', 'shall', 'until', 'before']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const filler = (k) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(k);
const seg = (v) => [{ segments: [{ v }] }];
const GLOBALS = {
  BOOKS: {},
  LETTERS_V1: [
    // the title remembered with one word of the reader's own ("spun" for "Woven"); its text says neither typed word
    { id: 'woven', num: 1, title: 'Woven to Endure', blocks: seg(filler(2) + 'What I make in you shall stand through every storm. ' + filler(2)) },
    // texts holding both typed content words close together, in the other order, again and again (and one in the title)
    ...[2, 3, 4].map((num) => ({ id: 'cloth-' + num, num, title: 'Spun Cloth ' + num, blocks: seg(('All that was made to endure was spun with care in the evening. ' + filler(1)).repeat(3)) })),
    // a text holding a typed run word for word in its body, and a title holding part of it ("The Dawn of ...")
    { id: 'morning-light', num: 5, title: 'Morning Light', blocks: seg(filler(3) + 'Watch, for the dawn of mercy is coming upon the earth. ' + filler(3)) },
    { id: 'dawn-glory', num: 6, title: 'The Dawn of Glory', blocks: seg(filler(1) + 'The night is far spent; the dawn is near. ' + filler(1)) },
    // texts holding none of the typed content words, so the small words weigh as little as they do in the volumes
    ...Array.from({ length: 12 }, (_, k) => ({ id: 'words-' + k, num: 10 + k, title: 'Words ' + k, blocks: seg(filler(2)) })),
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a title remembered loosely, against the texts holding its words', () => {
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

  it('one word wrong: a text holding the typed words close together in another order is no quote of them', async () => {
    // "endure was spun" is another sentence, not "spun to endure" with a word dropped: the title one word off leads
    const top = ids(await E.search('spun to endure'));
    expect(top[0]).toBe('woven');
  });

  it('a title holding part of the typed run is lifted no higher than the text holding the run word for word', async () => {
    // "The Dawn of Glory" holds three of the four typed words in order; "the dawn of mercy" is a line of another text
    const top = ids(await E.search('the dawn of mercy'));
    expect(top.slice(0, 2)).toEqual(['morning-light', 'dawn-glory']);
  });
});

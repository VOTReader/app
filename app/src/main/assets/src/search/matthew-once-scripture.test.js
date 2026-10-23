/* ONE SEARCH, ONE SCRIPTURE COUNT (search200 wave 3, U03.9, 2026-10-23). The UX sweep searched "bride": the ALL tab's
   Scriptures group said 24 verses, the SCRIPTURES tab 29. Matthew is in the corpus twice, the Study Bible's restored
   text under The Volumes and the plain chapter under Scriptures, and across both a verse shows once (MATTHEW ONCE): as
   whichever the query found first, which was the Study Bible's, so Matthew's five bride verses went to the study's
   group under ALL and to the Scriptures under their own tab. A verse both found now shows as the Scripture's, which
   holds as many of the typed words, so the Scriptures count is one number under both tabs; a verse only the study's
   restored text found (its names) stays the study's. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'who', 'with', 'has']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [], OT_BOOK_IDS: ['isaiah'], NT_BOOK_IDS: ['matthew', 'john'],
  GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const verse = (n, text) => ({ n, text });
const chap = (num, verses) => ({ num, sections: [{ heading: '', verses }] });
const GLOBALS = {
  BOOKS: {
    isaiah: { id: 'isaiah', title: 'Isaiah', chapters: [chap(62, [verse(5, 'And as the bridegroom rejoices over the bride, So shall your God rejoice over you.')])] },
    john: { id: 'john', title: 'John', chapters: [chap(3, [verse(29, 'He who has the bride is the bridegroom.')])] },
    'matthew-plain': { id: 'matthew-plain', title: 'Matthew', chapters: [chap(25, [
      verse(1, 'Then the kingdom of heaven shall be likened to ten virgins who took their lamps and went out to meet the bridegroom.'),
      verse(6, 'And at midnight a cry was heard: Behold, the bridegroom is coming; go out to meet him!'),
    ]), chap(1, [verse(21, 'And she will bring forth a Son, and you shall call His name Jesus.')])] },
  },
  MATTHEW: { chapters: [
    { num: 25, title: 'The Parable', verses: [
      verse(1, 'Then the kingdom of heaven shall be likened to ten virgins who took their lamps and went out to meet the bridegroom.'),
      verse(6, 'And at midnight a cry was heard: Behold, the bridegroom is coming; go out to meet him!'),
    ] },
    { num: 1, title: 'The Birth', verses: [verse(21, 'And she will bring forth a Son, and you shall call His name YahuShua.')] },
  ] },
};
const keyOf = (d) => (d.kind === 'verse' ? d.bookId + ' ' + d.chapterNum + ':' + d.verseNum : d.letterId);
const scriptureCount = (r) => r.results.filter((e) => e.doc.kind === 'verse' && e.doc.bookId !== 'matthew').length;

describe('one search, one Scripture count', () => {
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

  it('"bride" counts as many Scripture verses under everything as under the Scriptures', async () => {
    const all = await E.search('bride');
    const scr = await E.search('bride', { corpus: 'scriptures' });
    expect(scriptureCount(all)).toBe(scriptureCount(scr));
    expect(all.results.map((e) => keyOf(e.doc))).toEqual(expect.arrayContaining(['matthew-plain 25:1', 'matthew-plain 25:6']));
  });

  it('each Matthew verse still shows once', async () => {
    const keys = (await E.search('bride')).results.filter((e) => /matthew/.test(e.doc.bookId || '')).map((e) => e.doc.chapterNum + ':' + e.doc.verseNum);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("a verse only the study's restored text holds stays the study's", async () => {
    const r = await E.search('yahushua');
    expect(r.results.map((e) => keyOf(e.doc))).toContain('matthew 1:21');
  });
});

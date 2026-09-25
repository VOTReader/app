/* Quoted phrases and +/- words match WORDS (improvement sweep 2026-09-22
   REPORT #8, v07-02). The filter compared raw lower-cased substrings, so:
   - "the lord is my shepherd i shall not want" found nothing: Ps 23:1 has a
     ';' after shepherd;
   - "lord's day" typed with a straight apostrophe missed Rev 1:10 (the corpus
     has the curly one), and a phrase in curly quotes was not a phrase at all;
   - "heart -art" dropped every verse with "heart" in it ('art' is inside it);
   - "+rest" kept "He restores my soul" (restores contains rest).
   Phrase and +/- now run on the index's own tokens (kjvEncode), the same
   words the search itself matched. Fixture-deterministic, like golden.test.js. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { psalms: 'psalms', ps: 'psalms', matthew: 'matthew', revelation: 'revelation' },
  BOOK_DISPLAY: { psalms: 'Psalms', matthew: 'Matthew', revelation: 'Revelation' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {},
  COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['psalms'], NT_BOOK_IDS: ['matthew', 'revelation'],
  GENRE_GROUPS: { poetry: ['psalms'], gospels: ['matthew'], prophecy: ['revelation'] },
  WORD_NUMS: {}, ROMAN_NUMS: {},
};
const verse = (n, text) => ({ n, text });
const GLOBALS = {
  BOOKS: {
    psalms: { id: 'psalms', title: 'Psalms', chapters: [
      { num: 23, sections: [{ heading: '', verses: [
        verse(1, 'The LORD is my shepherd; I shall not want.'),
        verse(3, 'He restores my soul; He leads me in the paths of righteousness For His name’s sake.'),
      ] }] },
      { num: 51, sections: [{ heading: '', verses: [verse(10, 'Create in me a clean heart, O God, And renew a steadfast spirit within me.')] }] },
    ] },
    matthew: { id: 'matthew', title: 'Matthew', chapters: [
      { num: 11, sections: [{ heading: '', verses: [verse(28, 'Come to Me, all you who labor and are heavy laden, and I will give you rest.')] }] },
    ] },
    revelation: { id: 'revelation', title: 'Revelation', chapters: [
      { num: 1, sections: [{ heading: '', verses: [verse(10, 'I was in the Spirit on the Lord’s Day, and I heard behind me a loud voice, as of a trumpet,')] }] },
    ] },
  },
};

const refs = (r) => r.results.map((x) => x.doc.ref);

describe('search: phrases and +/- words match words, not letters inside words (v07-02)', () => {
  let prevData;
  beforeAll(async () => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await VotSearchMini.init();
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('a quoted verse is found across its punctuation', async () => {
    const r = await VotSearchMini.search('"the lord is my shepherd i shall not want"', { synonyms: false });
    expect(refs(r)).toContain('Psalms 23:1');
  });

  it("a straight apostrophe finds the curly one: \"lord's day\"", async () => {
    const r = await VotSearchMini.search('"lord\'s day"', { synonyms: false });
    expect(refs(r)).toContain('Revelation 1:10');
  });

  it('curly quotes make a phrase too', async () => {
    const r = await VotSearchMini.search('“lord’s day”', { synonyms: false });
    expect(r.textQuery && r.textQuery.phrase).toBeTruthy();
    expect(refs(r)).toContain('Revelation 1:10');
  });

  it('a phrase still has to be the words in that order', async () => {
    const r = await VotSearchMini.search('"shepherd the lord"', { synonyms: false });
    expect(refs(r)).not.toContain('Psalms 23:1');
  });

  it('"heart -art" keeps the verse about a heart: art is not a word in it', async () => {
    const r = await VotSearchMini.search('heart -art', { synonyms: false });
    expect(refs(r)).toContain('Psalms 51:10');
  });

  it('"+rest" wants the word rest, not "restores"', async () => {
    const r = await VotSearchMini.search('+rest', { synonyms: false });
    expect(refs(r)).toContain('Matthew 11:28');
    expect(refs(r)).not.toContain('Psalms 23:3');
  });
});

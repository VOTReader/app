/* Typos the way readers make them (search audit 2026-09-27, 131 misspelled passages
   and a UI walk): a swapped pair of letters is one slip, not two edits ("beleive",
   "wrold" found nothing; "recieve" became "relieve"); among words one slip off, the
   slip readers make first wins over the word in the most texts ("erath" became
   "wrath"); a name the text spells in parts is found typed whole ("abednego"); a
   corrected query is the query spelled right; and under a card (a passage's name)
   there is no guessing ("beatitudes" showed "Showing results for platitudes"). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'not', 'shall']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { psalms: 'psalms', ps: 'psalms', matthew: 'matthew', matt: 'matthew', daniel: 'daniel', dan: 'daniel' },
  BOOK_DISPLAY: { psalms: 'Psalms', matthew: 'Matthew', daniel: 'Daniel' },
  NAMED_PASSAGES: [{ keys: ['beatitudes'], bookId: 'matthew', chapter: 5, verseStart: 3, verseEnd: 12 }],
  NAMED_PASSAGE_INDEX: { beatitudes: { keys: ['beatitudes'], bookId: 'matthew', chapter: 5, verseStart: 3, verseEnd: 12 } },
  COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['psalms', 'daniel'], NT_BOOK_IDS: ['matthew'],
  GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const verse = (n, text) => ({ n, text });
const GLOBALS = {
  BOOKS: {
    psalms: { id: 'psalms', title: 'Psalms', chapters: [
      { num: 23, sections: [{ heading: '', verses: [verse(1, 'The LORD is my shepherd; I shall not want.')] }] },
      { num: 24, sections: [{ heading: '', verses: [verse(1, 'The earth is the LORD’s, and all its fullness, the world and those who dwell therein.')] }] },
      { num: 90, sections: [{ heading: '', verses: [verse(11, 'Who knows the power of Your anger? For as the fear of You, so is Your wrath.'), verse(7, 'For we have been consumed by Your anger, and by Your wrath we are terrified.')] }] },
      { num: 78, sections: [{ heading: '', verses: [verse(49, 'He cast on them the fierceness of His anger, wrath, indignation, and trouble.'), verse(52, 'But He made His own people go forth like sheep, and guided them like a shepherd.')] }] },
    ] },
    matthew: { id: 'matthew', title: 'Matthew', chapters: [
      { num: 5, sections: [{ heading: '', verses: [verse(3, 'Blessed are the poor in spirit, for theirs is the kingdom of heaven.')] }] },
      { num: 21, sections: [{ heading: '', verses: [verse(22, 'And whatever things you ask in prayer, believing, you will receive.')] }] },
      { num: 9, sections: [{ heading: '', verses: [verse(28, 'Jesus said to them, Do you believe that I am able to do this?')] }] },
      { num: 11, sections: [{ heading: '', verses: [verse(28, 'Come to Me, all you who labor and are heavy laden, and I will relieve you, and relieve your burden.')] }] },
      { num: 6, sections: [{ heading: '', verses: [verse(7, 'And when you pray, do not use vain repetitions and empty platitudes as the heathen do.')] }] },
      { num: 8, sections: [{ heading: '', verses: [verse(10, 'Assuredly, I say to you, I have not found such great faith, not even in Israel!'), verse(11, 'For the faith that is real is tried by fire.')] }] },
    ] },
    daniel: { id: 'daniel', title: 'Daniel', chapters: [
      { num: 3, sections: [{ heading: '', verses: [verse(12, 'There are certain Jews: Shadrach, Meshach, and Abed-Nego; these men have not paid due regard to you.')] }] },
    ] },
  },
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('typos the way readers make them', () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await VotSearchMini.init();
  });
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('a swapped pair of letters is one slip: "beleive", "wrold" and "recieve" find their words', async () => {
    const b = await VotSearchMini.search('beleive');
    expect(b.corrections).toEqual([{ from: 'beleive', to: 'believe' }]);
    expect(refs(b)).toContain('Matthew 9:28');
    expect((await VotSearchMini.search('wrold')).corrections).toEqual([{ from: 'wrold', to: 'world' }]);
    // "relieve" is one wrong letter away and in as many texts; the swap is the likelier slip
    expect((await VotSearchMini.search('recieve')).corrections).toEqual([{ from: 'recieve', to: 'receive' }]);
  });

  /* A short word misspelt by ear is two edits from its word ("shepard": a missing h and a vowel),
     beyond one slip, and found nothing (search lane, 2026-10-05). Same first letter and the same
     consonants once vowels and h are dropped is the same word. */
  it('a short word spelt by ear finds its word: "shepard" is shepherd', async () => {
    const r = await VotSearchMini.search('the lord is my shepard');
    expect(r.corrections).toEqual([{ from: 'shepard', to: 'shepherd' }]);
    expect(r.results[0].doc.ref).toBe('Psalms 23:1');
  });

  it('the slip readers make first wins over the word in the most texts: "erath" is earth', async () => {
    expect((await VotSearchMini.search('erath')).corrections).toEqual([{ from: 'erath', to: 'earth' }]);
  });

  it('a name the text spells in parts is found typed whole', async () => {
    const r = await VotSearchMini.search('abednego');
    expect(refs(r)).toContain('Daniel 3:12');
    expect(r.corrections).toEqual([{ from: 'abednego', to: 'abed nego' }]);
  });

  /* search benchmark 2026-10-05: "abednigo" is the split plus a slip, beyond either alone; "isreal"
     split into "is real", a stop word and a word, instead of Israel a pair swapped. */
  it('a name split in the text and typed a letter off is still found', async () => {
    const r = await VotSearchMini.search('abednigo');
    expect(refs(r)).toContain('Daniel 3:12');
    expect(r.corrections).toEqual([{ from: 'abednigo', to: 'abed nego' }]);
  });

  it('a split into a little word waits for the nearest word: "isreal" is Israel, not "is real"', async () => {
    const r = await VotSearchMini.search('isreal');
    expect(r.corrections).toEqual([{ from: 'isreal', to: 'israel' }]);
    expect(refs(r)[0]).toBe('Matthew 8:10');
  });

  it('a corrected query is searched as the query spelled right', async () => {
    const typo = await VotSearchMini.search('the lord is my shephard');
    const right = await VotSearchMini.search('the lord is my shepherd');
    expect(refs(typo)).toEqual(refs(right));
    expect(refs(typo)[0]).toBe('Psalms 23:1');
  });

  it('under a passage’s card there is no guessing at a word the text lacks', async () => {
    const r = await VotSearchMini.search('beatitudes');
    expect(r.parsed.kind).toBe('named-passage');
    expect(r.corrections).toEqual([]);
    expect(refs(r)).not.toContain('Matthew 6:7');
  });
});

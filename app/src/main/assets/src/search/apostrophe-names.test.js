/* A name written with an inner apostrophe is one word (search200 fix1). The letters write "Sha’ul" and the
   editions "Ba‘al": kjvEncode split each at its apostrophe ("sha" "ul"), so a reader's "shaul" never met the
   letter. A clitic after an apostrophe (a possessive's "s", a contraction's "t", "re", "ll", "m") stays apart. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { kjvEncode, kjvEncodeAt } from './tokenize.js';
import { VotSearchMini } from './engine.js';

describe('kjvEncode: an inner apostrophe in a name', () => {
  it('joins the name across its apostrophe, whichever mark is used', () => {
    expect(kjvEncode('Sha’ul the tentmaker')).toEqual(['shaul', 'the', 'tentmaker']);
    expect(kjvEncode("Sha'ul")).toEqual(['shaul']);
    expect(kjvEncode('the altars of Ba‘al')).toEqual(['the', 'altars', 'of', 'baal']);
    expect(kjvEncode('Tz’va’ot')).toEqual(['tzvaot']);
  });

  it('keeps a clitic apart: a possessive, a contraction', () => {
    expect(kjvEncode('Sha’ul’s cloak')).toEqual(['shaul', 's', 'cloak']);
    expect(kjvEncode('the Lord’s house')).toEqual(['the', 'lord', 's', 'house']);
    expect(kjvEncode('don’t')).toEqual(['do', 'not']);
    expect(kjvEncode('I’d go')).toEqual(['i', 'd', 'go']);
  });

  it('leaves a quote mark that is no inner apostrophe alone', () => {
    expect(kjvEncode('he said, ‘Come’')).toEqual(['he', 'said', 'come']);
    expect(kjvEncode('’tis so')).toEqual(['tis', 'so']);
  });

  it('kjvEncodeAt reads the same tokens, each starting where its word does', () => {
    for (const s of ['Then Sha’ul went', 'Tz’va’ot and Ba‘al’s house', 'you’re here, Sha\'ul']) {
      const at = kjvEncodeAt(s);
      expect(at.tokens).toEqual(kjvEncode(s));
    }
    expect(kjvEncodeAt('Then Sha’ul went').starts).toEqual([0, 5, 12]);
  });
});

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'a', 'to', 'in', 'was', 'up']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { genesis: 'genesis' }, BOOK_DISPLAY: { genesis: 'Genesis' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: ['genesis'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const GLOBALS = {
  BOOKS: { genesis: { id: 'genesis', title: 'Genesis', chapters: [{ num: 46, sections: [{ heading: '', verses: [{ n: 10, text: 'And Shaul, the son of a Canaanite woman.' }] }] }] } },
  LETTERS_V1: [
    { id: 'named', num: 1, title: 'The Road', blocks: [{ segments: [{ v: 'Then Sha’ul the tentmaker went up to the city, and he was glad.' }] }] },
    // holds both typed words apart: what wins while the letter's name is two words
    { id: 'scattered', num: 2, title: 'Trades', blocks: [{ segments: [{ v: 'Shaul was a name of old. A tentmaker was a trade, and a tentmaker sewed.' }] }] },
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('search: a name typed without its apostrophe meets the name written with it', () => {
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

  it('"shaul the tentmaker" opens on the letter holding "Sha’ul the tentmaker"', async () => {
    expect(refs(await VotSearchMini.search('shaul the tentmaker'))[0]).toBe('Volume One · Letter 1');
  });
});

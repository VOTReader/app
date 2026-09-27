/* Word forms (2026-09-26): a typed word reaches its family, not just the words
   it is a prefix of. On the shipped corpus typing "prayed" missed 397 of the 463
   pray-family results and "flooding" 85 of 101 flood ones. wordForms() is pure;
   the engine searches each form exactly and demotes a doc found only through
   one, so the typed form still ranks first. Fixture-deterministic. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { wordForms } from './word-forms.js';
import { VotSearchMini } from './engine.js';

const STOP = new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'be', 'was']);
const forms = (w) => wordForms(w, (x) => STOP.has(x));

describe('wordForms', () => {
  it('strips one ending to the base and inflects it back', () => {
    expect(forms('flooding')).toEqual(expect.arrayContaining(['flood', 'floods', 'flooded']));
    expect(forms('prayed')).toEqual(expect.arrayContaining(['pray', 'prays', 'praying', 'prayeth']));
    expect(forms('repented')).toEqual(expect.arrayContaining(['repent', 'repenting', 'repenteth']));
    expect(forms('judgments')).toContain('judgment');
  });

  it('restores a dropped -e and undoes a doubled consonant', () => {
    expect(forms('loving')).toEqual(expect.arrayContaining(['love', 'loves', 'loved', 'loveth', 'lovest']));
    expect(forms('humbled')).toEqual(expect.arrayContaining(['humble', 'humbling']));
    expect(forms('sinned')).toEqual(expect.arrayContaining(['sin', 'sins']));
  });

  it('turns -ied / -ies back into -y, and a -y base out into them', () => {
    expect(forms('cried')).toEqual(expect.arrayContaining(['cry', 'cries', 'crying', 'crieth']));
    expect(forms('cry')).toEqual(expect.arrayContaining(['cries', 'cried', 'crieth']));
  });

  it('knows the strong verbs, both ways', () => {
    expect(forms('wept')).toEqual(expect.arrayContaining(['weep', 'weeping', 'weepeth']));
    expect(forms('weep')).toContain('wept');
    expect(forms('spake')).toEqual(expect.arrayContaining(['speak', 'spoke', 'spoken']));
  });

  it('leaves out what the typed word\'s own prefix search already reaches', () => {
    expect(forms('flood')).toEqual([]); // floods, flooded, flooding all start with "flood"
    expect(forms('love')).toEqual(['loving']);
  });

  it('never makes a wrong word: see is not "seed", fleeing is not "fling", evening is not "even"', () => {
    expect(forms('saw')).not.toContain('seed');
    expect(forms('see')).not.toContain('seed');
    expect(forms('fleeing')).not.toContain('fling');
    expect(forms('fleeing')).toEqual(expect.arrayContaining(['flee', 'fled']));
    expect(forms('evening')).not.toContain('even');
    expect(forms('called')).not.toContain('cal');
  });

  it('produces no stop word, and nothing for a stop word, a short word, or a non-word', () => {
    expect(forms('the')).toEqual([]);
    expect(forms('as')).toEqual([]);
    expect(forms('12')).toEqual([]);
    for (const w of ['flooding', 'prayed', 'loving', 'wept']) {
      expect(forms(w).some((f) => STOP.has(f))).toBe(false);
    }
  });
});

const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP,
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { genesis: 'genesis', john: 'john' },
  BOOK_DISPLAY: { genesis: 'Genesis', john: 'John' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {},
  COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v7', screen: 'vot-seven-letter', dataVar: 'LETTERS_V7', prefaceVar: null, label: 'Volume Seven' }],
  OT_BOOK_IDS: ['genesis'], NT_BOOK_IDS: ['john'],
  GENRE_GROUPS: {},
  WORD_NUMS: {}, ROMAN_NUMS: {},
};
const verse = (n, text) => ({ n, text });
const GLOBALS = {
  BOOKS: {
    genesis: { id: 'genesis', title: 'Genesis', chapters: [
      { num: 7, sections: [{ heading: '', verses: [verse(17, 'Now the flood was on the earth forty days.')] }] },
      { num: 8, sections: [{ heading: '', verses: [verse(22, 'While the earth remains, seedtime and harvest shall not cease.')] }] },
    ] },
    psalms: { id: 'psalms', title: 'Psalms', chapters: [
      { num: 19, sections: [{ heading: '', verses: [verse(4, 'In them He has set the rays of the sun,'), verse(6, 'Its rays go forth from one end of heaven.')] }] },
    ] },
    john: { id: 'john', title: 'John', chapters: [
      { num: 11, sections: [{ heading: '', verses: [verse(35, 'Jesus wept.')] }] },
      { num: 17, sections: [{ heading: '', verses: [verse(9, 'I pray for them. I do not pray for the world.')] }] },
    ] },
  },
  LETTERS_V7: [
    { id: 'vengeance', num: 55, title: 'Vengeance Is Mine', blocks: [{ segments: [{ v: 'I shall bring upon them a flooding rain, a great deluge.' }] }] },
    { id: 'mourning', num: 12, title: 'A Time to Mourn', blocks: [{ segments: [{ v: 'Weep with those who weep, for He prayed through the night.' }] }] },
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('search: a typed word finds its family', () => {
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

  it('"flooding" finds the flood too, the typed form first', async () => {
    const r = await VotSearchMini.search('flooding');
    expect(refs(r)).toEqual(['Volume Seven · Letter 55', 'Genesis 7:17']);
    // the flood verse carries the word it matched, so its snippet marks it
    expect(r.results[1].terms).toContain('flood');
  });

  it('"prayed" finds pray, "wept" finds weep, both ways', async () => {
    expect(refs(await VotSearchMini.search('prayed'))).toEqual(['Volume Seven · Letter 12', 'John 17:9']);
    expect(refs(await VotSearchMini.search('wept'))).toEqual(['John 11:35', 'Volume Seven · Letter 12']);
    expect(refs(await VotSearchMini.search('weep'))).toEqual(['Volume Seven · Letter 12', 'John 11:35']);
  });

  it('a typed base word is unchanged: "flood" was already reaching flooding by prefix', async () => {
    expect(refs(await VotSearchMini.search('flood')).sort()).toEqual(['Genesis 7:17', 'Volume Seven · Letter 55']);
  });

  it('a quoted phrase stays exactly as typed', async () => {
    expect(refs(await VotSearchMini.search('"flooding rain"'))).toEqual(['Volume Seven · Letter 55']);
  });

  /* A real word the corpus inflects differently is not a typo: "prays" is
     nowhere in the text, but pray and prayed are. The typo fallback waited only
     on the typed spelling, so it corrected "prays" to its one-edit neighbour with
     the most documents, "rays", and showed the sun. */
  it('"prays" finds pray through its family, never a one-edit "rays"', async () => {
    const r = await VotSearchMini.search('prays');
    expect(refs(r)).toContain('John 17:9');
    expect(refs(r)).not.toContain('Psalms 19:4');
    expect(r.corrections).toEqual([]);
  });

  it('"saw" never reaches "seedtime" through a made-up "seed"', async () => {
    expect(refs(await VotSearchMini.search('saw'))).not.toContain('Genesis 8:22');
  });
});

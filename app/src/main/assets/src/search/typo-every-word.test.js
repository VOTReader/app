/* A MISSPELT WORD IS CORRECTED EVEN WHEN A FORM OF IT IS FOUND (search200 wave 3, U08.6, 2026-10-23). The UX sweep
   typed "in the begining god creatd": the screen said "Showing results for ... created" and kept "begining", and
   Genesis 1:1 came fourth. "begining" found nothing as typed, but one of its forms did (strip -ing: begin), so the
   typo fallback read it as a real word this corpus inflects differently, as it rightly reads "prays" (pray, prayed).
   The text's own spelling one slip away, "beginning", is of the same family and is no form the engine searched: the
   typed word is that word misspelt, and is corrected with the rest. A word whose near spelling is one of the forms
   already searched ("prays" -> pray) is left as typed. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'was', 'with', 'all']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [], OT_BOOK_IDS: ['genesis', 'psalms'], NT_BOOK_IDS: ['john', 'luke'],
  GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const verse = (n, text) => ({ n, text });
const chap = (num, verses) => ({ num, sections: [{ heading: '', verses }] });
const GLOBALS = {
  BOOKS: {
    genesis: { id: 'genesis', title: 'Genesis', chapters: [chap(1, [verse(1, 'In the beginning God created the heavens and the earth.')])] },
    john: { id: 'john', title: 'John', chapters: [chap(1, [verse(1, 'In the beginning was the Word, and the Word was with God, and the Word was God.')])] },
    // "begin", the form the typo reached: a text holding it and God, never the verse
    luke: { id: 'luke', title: 'Luke', chapters: [chap(14, [verse(29, 'lest, after he has laid the foundation, and is not able to finish, all who see it begin to mock him, saying God')])] },
    psalms: { id: 'psalms', title: 'Psalms', chapters: [chap(5, [verse(2, 'Give heed to the voice of my cry, my King and my God, for to You I will pray.'), verse(3, 'In the morning I prayed to God and waited.')])] },
  },
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('a misspelt word is corrected even when a form of it is found', () => {
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

  it('"in the begining god creatd" corrects both words and finds Genesis 1:1 first', async () => {
    const r = await E.search('in the begining god creatd');
    expect(r.corrections).toEqual(expect.arrayContaining([{ from: 'begining', to: 'beginning' }, { from: 'creatd', to: 'created' }]));
    expect(refs(r)[0]).toBe('Genesis 1:1');
  });

  it('"begining" alone is corrected to the text\'s spelling', async () => {
    const r = await E.search('begining');
    expect(r.corrections).toEqual([{ from: 'begining', to: 'beginning' }]);
  });

  it('a form the engine already searches is no typo: "prays" stays as typed', async () => {
    const r = await E.search('prays');
    expect(r.corrections || []).toEqual([]);
    expect(refs(r)).toContain('Psalms 5:2');
  });
});

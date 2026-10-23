/* A QUESTION'S SUBJECT IS HELD (search200 wave 3, U02.5, 2026-10-23). The UX sweep asked "who is Timothy": past the
   few texts holding the name, verses holding only "who" ("he who is unjust, let him be unjust still") filled the
   list, ranked on the question's own words, while two hundred texts naming Timothy sat below them; "what is the
   bride" put twelve verses saying only "what is" first. The opening words of a question say it is one, the rest what
   about (questionFrame): a text found by the frame's words alone answers nothing asked, and ranks after the texts
   holding its subject. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'who', 'what', 'be', 'with', 'all', 'him', 'let', 'are', 'was', 'this', 'me', 'your', 'us']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: ['micah'], NT_BOOK_IDS: ['revelation', 'john', 'acts'], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const verse = (n, text) => ({ n, text });
const chap = (num, verses) => ({ num, sections: [{ heading: '', verses }] });
const filler = (n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const seg = (v) => [{ segments: [{ v }] }];
const GLOBALS = {
  BOOKS: {
    // short verses dense in the question's own words, holding nothing of its subject
    revelation: { id: 'revelation', title: 'Revelation', chapters: [chap(22, [verse(11, 'He who is unjust, let him be unjust still; he who is filthy, let him be filthy still.')])] },
    john: { id: 'john', title: 'John', chapters: [chap(3, [verse(31, 'He who comes from above is above all; he who is of the earth is earthly.')])] },
    micah: { id: 'micah', title: 'Micah', chapters: [chap(1, [verse(5, 'What is the transgression of Jacob? Is it not Samaria? And what are the high places of Judah?')])] },
    // long texts naming the subject once, deep in their words
    acts: { id: 'acts', title: 'Acts', chapters: [chap(16, [verse(1, 'Then he came to Derbe and Lystra. And behold, a certain disciple was there, named Timothy, the son of a certain Jewish woman who believed, but his father was Greek.')])] },
  },
  LETTERS_V1: [
    { id: 'my-servant', num: 1, title: 'Concerning My Servant', blocks: seg(filler(4) + 'Hear the words I have given to My servant Timothy. ' + filler(4)) },
    { id: 'the-wedding', num: 2, title: 'The Wedding Feast', blocks: seg(filler(4) + 'Behold, the bride makes herself ready for her Husband. ' + filler(4)) },
    ...Array.from({ length: 8 }, (_, k) => ({ id: 'words-' + k, num: 10 + k, title: 'Words ' + k, blocks: seg(filler(2)) })),
  ],
};
const refs = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe("a question's subject is held", () => {
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

  it('"who is timothy": every text naming Timothy ranks above the verses holding only "who is"', async () => {
    const r = refs(await E.search('who is timothy'));
    const last = Math.max(r.indexOf('Acts 16:1'), r.indexOf('my-servant'));
    expect(r.indexOf('Acts 16:1')).toBeGreaterThanOrEqual(0);
    expect(r.indexOf('my-servant')).toBeGreaterThanOrEqual(0);
    for (const frameOnly of ['Revelation 22:11', 'John 3:31']) if (r.indexOf(frameOnly) >= 0) expect(r.indexOf(frameOnly)).toBeGreaterThan(last);
  });

  it('"what is the bride": the text holding the bride leads the verse holding only "what is the"', async () => {
    const r = refs(await E.search('what is the bride'));
    expect(r[0]).toBe('the-wedding');
  });

  it('a quote typed whole is no question: "he who is unjust" keeps its verse first', async () => {
    expect(refs(await E.search('he who is unjust'))[0]).toBe('Revelation 22:11');
  });
});

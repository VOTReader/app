/* TWO WORDS OF ONE STORY (search200 sweep, meaning-fusion). A two-word search naming a person and a thing of their story
   ("<name> tree") often finds no one text holding both: the story tells the name in one verse and the thing in the next.
   Each verse held one word, and a text whose title says the common word outranked them all. When no text holds every
   typed word, a verse whose neighbours (VERSE_WINDOW either side, its chapter) hold the words it lacks counts them as
   held. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'a', 'an', 'of', 'and', 'by', 'to', 'in', 'he', 'his', 'was', 'who', 'into', 'up', 'for', 'him', 'see', 'is', 'there', 'under']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (/** @type {string} */ v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const FILL = Array.from({ length: 40 }, (_, i) => 'The ant and the rock badger, the locust and the spider, in the house of kings ' + i + '.');
const verses = (/** @type {string[]} */ list) => list.map((text, i) => ({ n: i + 1, text }));
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 1, sections: [{ heading: '', verses: verses(FILL) }] },
      // one story: the name in one verse, the tree two verses on
      { num: 2, sections: [{ heading: '', verses: verses([
        'Now there was a man named Bartimaeus, a keeper of the gate, and he was short.',
        'The crowd pressed close on the road that day.',
        'So he ran ahead and climbed into a sycamore tree to see the King pass.',
        'And the King looked up and called Bartimaeus by name.',
      ]) }] },
      // the name and an oak far apart in one long chapter: no one story
      { num: 3, sections: [{ heading: '', verses: verses([
        'Then Jedidiah went down to the river at dawn.',
        ...FILL.slice(0, 12),
        'An oak stood on the hill above the city.',
      ]) }] },
      ...[0, 1, 2, 3].map((k) => ({ num: 4 + k, sections: [{ heading: '', verses: verses([`A tree stands by the waters in the field of the poor ${k}.`, `Every oak and every tree of the forest is His ${k}.`]) }] })),
    ] },
  },
  // titles saying the common words, bodies saying them often
  LETTERS_V4: [
    { id: 'trees', num: 1, title: 'Trees of the Field', blocks: [para('What is a dry tree to the one who holds the axe? A tree that bears no fruit is cut down, and the tree that bears is pruned.')] },
    { id: 'oaks', num: 2, title: 'The Oak', blocks: [para('The oak is strong, yet the oak falls when the wind is great; be not an oak that will not bend.')] },
  ],
};
const refs = async (/** @type {string} */ q) => (await E.search(q)).results.map((/** @type {any} */ x) => x.doc.kind === 'verse' ? x.doc.ref : x.doc.letterId);

describe('two words of one story (search200 sweep, meaning-fusion)', () => {
  /** @type {any} */ let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) /** @type {any} */ (globalThis)[k] = /** @type {any} */ (GLOBALS)[k];
    await E.init();
  }, 60000);
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete /** @type {any} */ (globalThis)[k];
  });

  it('no text holding both words: a verse of the story whose neighbours hold the other leads the titled text', async () => {
    const r = await refs('bartimaeus tree');
    expect(['Proverbs 2:1', 'Proverbs 2:3', 'Proverbs 2:4']).toContain(r[0]);
    expect(r).toContain('trees');
  });

  it('...but not when the two words sit far apart in the chapter', async () => {
    expect((await refs('jedidiah oak'))[0]).not.toBe('Proverbs 3:14');
    expect((await refs('jedidiah oak'))[0]).not.toBe('Proverbs 3:1');
  });
});

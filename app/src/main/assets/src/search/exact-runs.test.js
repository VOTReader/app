/* THE TYPED RUN, WHEREVER IT SITS (search200 B3, 2026-10-18). The phrase ranking read the typed words in a row
   only in the 500 best-scored texts, so a run of common words deep in a long letter, behind 600 short texts that
   outscore it on its one content word, was never read; a keyword search gave the original no lead over the
   Answers topic reprinting the run; a query of small words alone found nothing; and the reader landed where the
   words sit thickest, not on the run. Now a token store (each text's tokens as numbers) is read in every text
   holding the run's rarest word, the original leads in a keyword search too, a run of four small words or more
   is searched as a run, and the first texts open on the run. Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';
import { kjvEncode, kjvEncodeAt } from './tokenize.js';

describe('kjvEncodeAt reads the tokens kjvEncode does, with where each starts (B3)', () => {
  const SAMPLES = [
    'The Lord\'s 144,000 & the twenty-four elders don’t, can\'t; won\'t.',
    'Café naïve İstanbul — ‘one’ 1,000,000 a1,000b 1,2,345 12,0000',
    'Seeds Part Two, the twenty first day, the 144 000, the sixth seal, twenty and four',
    'éclair ﬁne ΣΑΣ 😀 smile, dont shouldnt wont',
    '  &amp; leading space, trailing ,000 and 7,000.',
    '',
  ];
  it('the same tokens as kjvEncode', () => {
    for (const s of SAMPLES) expect(kjvEncodeAt(s).tokens).toEqual(kjvEncode(s));
  });
  it('each token starts where its word does', () => {
    const s = 'The Lord\'s 144,000 & the twenty-four elders don’t, Café.';
    const { tokens, starts } = kjvEncodeAt(s);
    const at = (t) => starts[tokens.indexOf(t)];
    expect(at('lord')).toBe(s.indexOf('Lord'));
    expect(at('144000')).toBe(s.indexOf('144'));
    expect(at('and')).toBe(s.indexOf('&'));
    expect(at('24')).toBe(s.indexOf('twenty'));
    expect(at('do')).toBe(s.indexOf('don'));
    expect(at('cafe')).toBe(s.indexOf('Café'));
    const accented = 'naïve éclair word';
    const r = kjvEncodeAt(accented);
    expect(r.starts[r.tokens.indexOf('word')]).toBe(accented.indexOf('word'));
  });
});

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'do', 'was', 'so', 'we', 'but', 'they', 'there', 'this', 'at', 'up']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [
    { id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' },
  ],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'The Lord speaks to His people of many things, of the morning and of the evening, of the field and of the vineyard. '.repeat(n);
const RUN_SENTENCE = 'They said to the laborers, it is not for the harvest that we labor, but for the Lord of it.';
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      // 600 short texts, each holding the run's one content word and none of its run
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 600 }, (_, i) => ({ n: i + 1, text: 'The harvest is great in the land of the east, and the reapers go out at dawn ' + i + '.' })) }] },
      { num: 31, sections: [{ heading: '', verses: [{ n: 1, text: 'Then God said, Let the light come: and it was so.' }, { n: 2, text: 'And it was evening, so they rested.' }] }] },
    ] },
  },
  LETTERS_V4: [
    // a six-word run of common words, one content word among them, deep in a long letter
    { id: 'deep-run', num: 1, title: 'The Reapers Rest', blocks: [para(filler(8) + RUN_SENTENCE + ' ' + filler(8))] },
    // a three-word run the Answers topic below reprints, in its own words around it
    { id: 'sheaves-letter', num: 2, title: 'Gathered In', blocks: [para(filler(1) + 'Bring in the golden sheaves before the rain comes, says The Lord. ' + filler(1))] },
    // a phrase quoted up to a possessive
    { id: 'lords-house', num: 3, title: 'The Evening Call', blocks: [para(filler(1) + 'They will call on the name of the Lord\'s house in the evening.')] },
  ],
  // Answers topics reprinting the letter's run, each denser in its words than the letter
  ANSWERS: ['Reaping', 'Gathering', 'Binding', 'Threshing'].map((w, i) => ({
    id: w.toLowerCase(), num: i + 1, title: 'Of ' + w,
    paragraphs: [{ text: 'Of ' + w.toLowerCase() + ': the golden sheaves are gathered in, golden grain from golden fields, and bound.' }],
  })),
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('the typed run is read in every text holding it, and landed on (B3)', () => {
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

  it('a run of common words deep in a long letter leads 600 short texts holding its one content word', async () => {
    const r = await E.search('it is not for the harvest');
    expect(ids(r)[0]).toBe('deep-run');
  });

  it('the letter opens on the run', async () => {
    const r = await E.search('it is not for the harvest');
    const hit = r.results[0];
    expect(hit.doc.letterId).toBe('deep-run');
    expect(typeof hit.placeStart).toBe('number');
    const text = hit.doc.text;
    expect(text.slice(hit.placeStart, hit.placeStart + RUN_SENTENCE.length)).toContain('it is not for the harvest');
  });

  it('in a keyword search, the letter holding a run leads the Answers topics reprinting it', async () => {
    const r = await E.search('the golden sheaves');
    const i = ids(r);
    expect(i[0]).toBe('sheaves-letter');
    expect(i).toEqual(expect.arrayContaining(['reaping', 'gathering', 'binding', 'threshing']));
  });

  it('four small words or more are searched as a run', async () => {
    const r = await E.search('and it was so');
    expect(r.stopWordsOnly).toBeFalsy();
    expect(r.results.map((x) => x.doc.ref)).toEqual(['Proverbs 31:1']);
    expect(r.textQuery && r.textQuery.run).toBe('and it was so');
    // three are not a run that names anything
    expect((await E.search('and it was')).stopWordsOnly).toBe(true);
  });

  it('a quoted phrase still matches up to a possessive', async () => {
    const r = await E.search('"the name of the lord"');
    expect(ids(r)).toContain('lords-house');
    expect((await E.search('"golden sheaves before"')).results.map((x) => x.doc.letterId)).toEqual(['sheaves-letter']);
  });
});

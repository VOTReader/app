/* A QUOTE REMEMBERED WITH ITS SLIPS LEADS (search200 B4, 2026-10-18). The phrase pass reads the typed words in a row
   as typed, so a quote remembered with a word in another form, a word left out or two verses run together lost its
   run, and BM25 ranked a text thick with its words, in no order, over the text it quotes. With the alignment on
   (setAlign, SEARCH_ALIGN), a text holding ALIGN_HELD of the quote or more, slips allowed for, leads every text
   holding less (the original first among those holding it alike) and opens on the words, where the first typed words
   are. Texts within a small word of each other hold it alike, and one within a small word of a text just under
   ALIGN_HELD is not told from it: the words rank them. A verse is lifted by its neighbour only when neither holds the
   quote alone, and a study quoting a verse gives way to it. A quote held whole, or typed in fewer than ALIGN_MIN
   words, is ranked as before. Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'has', 'through', 'upon', 'our']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [
    { id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' },
    { id: 'flock', screen: 'vot-flock-letter', dataVar: 'LETTERS_FLOCK', prefaceVar: null, label: 'Letters to The Lord’s Little Flock' },
  ],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const LAMP = 'My children, the lamp of your soul is lit by the oil of My word, so keep it burning through the long night.';
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      // many verses, half of them opening on "So": a small word is a common one
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 300 }, (_, i) => ({ n: i + 1, text: (i % 2 ? 'So the ant' : 'The ant') + ' and the rock badger, the locust and the spider, in the house of kings ' + i + '.' })) }] },
      { num: 31, sections: [{ heading: '', verses: [
        // a saying of two verses, remembered as one
        { n: 1, text: 'Arise and sing upon the hills of the morning,' },
        { n: 2, text: 'for the watchman has seen the banner of the Prince coming.' },
        // a verse thick with the saying's words, in no order
        { n: 3, text: 'The banner of the hills, the watchman of the morning: the Prince, the banner, the watchman, the Prince.' },
        // a verse saying what its neighbour does, and the neighbour the words remembered
        { n: 4, text: 'Let each take her jar and pour water in it, and each of you bring her jar to the well, every one of you with her jar; and so they took.' },
        { n: 5, text: 'So every woman took her jar, poured water in it, and set it by the well, and they stood by the gate.' },
        // the verse a study quotes with His name restored
        { n: 6, text: 'Then Jesus lifted up His voice and said, Father, I commit My spirit into Your hand.' },
        // two tellings of one deed, a small word apart: the longer says "so", the shorter "the"
        { n: 7, text: 'So keeper of the orchard carried the baskets to the king, and set them before him at the gate of the city when the feast was come.' },
        { n: 8, text: 'And the keeper of the orchard carried the baskets.' },
        // ...and its words spread over twice its length, "our" among them
        { n: 9, text: 'Praised is the city of our fathers, the city that comes in the name of the King.' },
      ] }] },
    ] },
  },
  LETTERS_V4: [
    // the line remembered, deep in a long letter
    { id: 'lamp-letter', num: 3, title: 'A Word at Nightfall', blocks: [para(filler(20) + LAMP + ' ' + filler(5))] },
    // a sentence remembered, its last word said a little before it
    { id: 'gate-letter', num: 9, title: 'The Answer', blocks: [para(filler(10) + 'The elders went forth at the dawn. The children played. And thus the elders have answered, they have surely gone out to the gate. ' + filler(5))] },
    // a title remembered loosely
    { id: 'honey-letter', num: 8, title: 'The Vessels of Honey', blocks: [para(filler(12))] },
    // a line no other text reprints, deep in a long letter
    { id: 'river-letter', num: 5, title: 'At the Water', blocks: [para(filler(16) + 'Go down to the river at evening and wash your garments in the running water, and you shall be clean. ' + filler(4))] },
  ],
  LETTERS_FLOCK: [
    // a letter thick with the line's words, none of them in its order
    { id: 'scattered-letter', num: 4, title: 'Of Many Lamps', blocks: [para('Night and the long lamp: oil, soul, children, words, burning, keep. Keep the night burning, the oil of souls, the lamps and the words, children. '.repeat(8))] },
    // ...and one thick with that line's words, in no order
    { id: 'river-scattered', num: 6, title: 'Of Rivers', blocks: [para('Clean water, running rivers; garments and evening, wash and go down. The river of evening washes the garments clean, running down. '.repeat(4))] },
  ],
  WTLB_TWO: [
    // the line reprinted whole under a title of its own
    { id: 'lamp-entry', num: 9, title: 'Keep It Burning', paragraphs: [{ text: LAMP }] },
    // a short line held nearly as typed: "the" for "our", two words of its own
    { id: 'name-entry', num: 10, title: 'Of Hills', paragraphs: [{ text: 'Praised be the great holy name of the King, for His mercy is good.' }] },
    // the title's two words in a body, apart
    { id: 'honey-entry', num: 11, title: 'At the Door', paragraphs: [{ text: filler(3) + 'Bring a vessel and fill it with the honey at the door. ' + filler(3) }] },
  ],
  BIBLE_STUDIES: [
    { id: 'restored', slug: 'restored', title: 'Of the Cross', chapters: [
      { id: 'restored-ch1', num: 1, title: 'His Last Words', blocks: [para(filler(8) + 'And YahuShua lifted up His voice and said, Father, I commit My spirit into Your hand. ' + filler(8))] },
    ] },
  ],
  ANSWERS: [],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);
/** One search with the alignment on or off, the setting put back after. */
async function searchWith(on, q) {
  E.setAlign(on);
  try { return await E.search(q); } finally { E.setAlign(false); }
}

describe('a quote remembered with its slips leads (B4)', () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await E.init();
  }, 60000);
  afterAll(() => {
    E.setAlign(false);
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  // a word in another form (words), one changed (lighted), two small ones traded (the, in)
  const SLIPPED = 'my children the lamp of the soul is lighted by oil of my words so keep it burning in the long night';

  it('a line remembered with its slips leads a text thick with its words in no order, and opens on the line', async () => {
    // words in other forms (washed, garment, waters), the modern word (will), a small word traded (in the)
    const r = await searchWith(true, 'go down to the river in the evening and washed your garment in running waters and you will be clean');
    expect(ids(r)[0]).toBe('river-letter');
    const p = r.results[0].placeStart;
    expect(typeof p).toBe('number');
    expect(r.results[0].doc.text.slice(p, p + 18)).toBe('Go down to the riv');
  });

  it('the line held alike by its letter and an entry reprinting it: the letter first, on the line, the entry next', async () => {
    const r = await searchWith(true, SLIPPED);
    const top = ids(r);
    expect(top[0]).toBe('lamp-letter');
    const p = r.results[0].placeStart;
    expect(typeof p).toBe('number');
    expect(r.results[0].doc.text.slice(p, p + 11)).toBe('My children');
    expect(top.indexOf('lamp-entry')).toBe(1);
    expect(top.indexOf('lamp-entry')).toBeLessThan(top.indexOf('scattered-letter'));
  });

  it('two verses remembered as one saying lead a verse thick with their words', async () => {
    const r = await searchWith(true, 'arise and sing on the hills of morning for the watchman sees the banner of the prince');
    expect(['Proverbs 31:1', 'Proverbs 31:2']).toContain(ids(r)[0]);
  });

  it('a sentence remembered opens on it, not on its last word said before it', async () => {
    const r = await searchWith(true, 'and so the elders have answered they have surely gone forth');
    expect(ids(r)[0]).toBe('gate-letter');
    const p = r.results[0].placeStart;
    expect(typeof p).toBe('number');
    const text = r.results[0].doc.text;
    expect(p).toBeGreaterThanOrEqual(text.indexOf('And thus the elders'));
    expect(p).toBeLessThan(text.indexOf('they have surely gone out'));
  });

  it('a verse whose neighbour holds the words alone is not lifted by the pair: the neighbour leads', async () => {
    const r = await searchWith(true, 'took every woman her jar and poured water in it');
    expect(ids(r)[0]).toBe('Proverbs 31:5');
  });

  it('a study quoting a verse with His name restored gives way to the verse', async () => {
    const r = await searchWith(true, 'yahushua lifted his voice and said father i commit my spirit into your hands');
    const top = ids(r);
    expect(top[0]).toBe('Proverbs 31:6');
    expect(top).toContain('restored');
  });

  it('a text holding the quote no better than one just under the bar is not lifted over it: the words rank them', async () => {
    const q = 'praised be the name of our king';
    expect(ids(await searchWith(false, q))[0]).toBe('name-entry');
    expect(ids(await searchWith(true, q))[0]).toBe('name-entry');
  });

  it('a title remembered loosely, its words in a body apart, keeps the place the words give it', async () => {
    const q = 'the vessel of the honey';
    expect(ids(await searchWith(true, q))).toEqual(ids(await searchWith(false, q)));
  });

  it('two texts a small word apart hold the quote alike: the words rank them', async () => {
    const q = 'so the keeper of the orchard carried the baskets';
    const off = ids(await searchWith(false, q));
    const on = ids(await searchWith(true, q));
    expect(off[0]).toBe('Proverbs 31:8');
    expect(on[0]).toBe('Proverbs 31:8');
  });

  it('a quote held whole is ranked as the words rank it', async () => {
    const q = 'keep it burning through the long night';
    expect(ids(await searchWith(true, q))).toEqual(ids(await searchWith(false, q)));
  });

  it('fewer than five typed words are no quote to align', async () => {
    const q = 'children keep lamps burning';
    expect(ids(await searchWith(true, q))).toEqual(ids(await searchWith(false, q)));
  });
});

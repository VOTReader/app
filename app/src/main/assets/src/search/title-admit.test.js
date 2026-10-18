/* A TITLE REMEMBERED LOOSELY IS ADMITTED (search200 B5, 2026-10-18). BM25 reads a title as a field among the
   body's words, so a title typed with a word changed in form, a near-synonym, the words reordered or the
   collection's name beside it ranked under texts whose bodies say the query's words again and again (and an
   Answers heading, which is no field at all, was never found by its words). titles.js scores every title and
   Answers heading on its own; the one the query clearly names (admitTitles) joins the results and leads them,
   just under a title typed whole (B1's own pass) and under a text holding four or more of the typed words in a
   row. A heading opens on itself, and a text holding the heading's words is its original: it comes first.
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at']);
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
const filler = (n) => 'The Lord speaks to His people of many things, of the morning and of the evening, of the field and of the vineyard. '.repeat(n);
const HEADING = 'The Spring Beneath the Cedars';
const QUOTED_HEADING = 'Oil Poured Out Upon the Threshold';
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 300 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger, the locust and the spider, in the house of kings ' + i + '.' })) }] },
      { num: 31, sections: [{ heading: '', verses: [
        { n: 40, text: 'I have set watchmen upon your walls, O city; they shall never hold their peace.' },
        { n: 41, text: 'The gatekeepers rise early; the watchers guarded them well through the night.' },
        // a verse holding a quote whole, whose words also name a letter's title loosely
        { n: 42, text: 'Then the watchman upon the walls lifted up his voice and cried.' },
        // a verse whose middle an entry is titled by
        { n: 43, text: 'Love the stranger, shelter the widows who weep, and feed them.' },
        // a verse holding a collection's word and a word an entry elsewhere is titled
        { n: 44, text: 'The shepherd hung lanterns over the flock by night.' },
      ] }] },
    ] },
  },
  LETTERS_V4: [
    // the title remembered with its words in other forms; its long body never says them
    { id: 'watchmen-walls', num: 5, title: 'Watchmen Upon the Walls', blocks: [para(filler(20) + 'Stand at your post.')] },
    // one title in two collections: the collection typed beside it says which
    { id: 'still-waters', num: 6, title: 'Beside the Still Waters', blocks: [para(filler(12) + 'He leads you.')] },
    // the letter a heading of the Answers quotes: its sentence is the heading's words
    { id: 'threshold-letter', num: 7, title: 'A Word for the Household', blocks: [para(filler(18) + QUOTED_HEADING + '. The house was filled with the fragrance.')] },
    // a title typed whole whose body has its words, but not in a row: the reader asked for the letter
    { id: 'oil-and-wine', num: 11, title: 'Oil and Wine for the Weary', blocks: [para(filler(13) + 'Bring oil to the lamp, and wine to the table; the weary shall rest, and the weary shall sing.')] },
    // a letter's line, and the entry that reprints it under a title made of it
    { id: 'mercy-letter', num: 12, title: 'A Word in Season', blocks: [para(filler(11) + 'Rather let mercy be planted in your house, for now the season of grace has come upon you.')] },
    // a letter whose last part an entry reprints under a title made of its last line;
    // an earlier line holds the other words of a query that misremembers that title
    { id: 'garden-letter', num: 13, title: 'A Song at Evening', blocks: [para(filler(10) + 'For the calm of My voice stills the waves, and My song is over them. Behold, the quiet of My garden keeps them!... Says The Lord.')] },
    // a letter whose line a two-word Answers heading labels: the heading is too short to find it by
    { id: 'the-sealing', num: 9, title: 'The Sealing', blocks: [para(filler(14) + 'It was begun of old, And sealed forever upon the mountain of My holiness.')] },
    // a title a sentence of its body repeats: one remembering the sentence lands on it
    { id: 'rivers-dry', num: 10, title: 'The Rivers Shall Run Dry Before the Throne', blocks: [para(filler(16) + 'Behold, the rivers shall run dry before the throne, and every proud tower shall bow.')] },
    // a title typed whole whose body says it again deep down, word for word: the words typed are that line too
    // a letter whose first words call its reader by a collection's name
    { id: 'lamp-letter', num: 14, title: 'The Evening Watch', blocks: [para('Little flock, concerning the lamp, the evening oil of the house is the oil you shall keep burning. ' + filler(3))] },
    { id: 'lamps-trimmed', num: 8, title: 'Lamps Trimmed for the Bridegroom', blocks: [para(filler(15) + 'Keep your lamps trimmed for the bridegroom, for He comes.')] },
  ],
  LETTERS_FLOCK: [
    // bodies thick with the query's words, titled otherwise
    { id: 'builders-word', num: 3, title: 'A Word to the Builders', blocks: [para('The watchman walked along the wall; the wall was high and the watchman grew weary on the wall. '.repeat(3))] },
    // a longer title whose first part names a Words To Live By entry
    { id: 'walk-says-the-lord', num: 5, title: 'Walk With Me as I Have Walked With You, Says The Lord', blocks: [para(filler(9) + 'Come.')] },
    // a title in that collection the letter's first words hold loosely
    { id: 'lamp-oil', num: 6, title: 'The Lamp and the Oil', blocks: [para(filler(2) + 'Trim it.')] },
    { id: 'flock-cedars', num: 4, title: 'Under the Trees', blocks: [para('Springs and cedars, cedars and springs: the springs ran beneath the tall cedars. '.repeat(3))] },
  ],
  WTLB_TWO: [
    { id: 'still-waters-wtlb', num: 9, title: 'Beside the Still Waters', paragraphs: [{ text: 'He leads me beside the still waters.' }] },
    { id: 'walk-wtlb', num: 11, title: 'Walk With Me As I Have Walked With You', paragraphs: [{ text: filler(3) + 'Follow.' }] },
    { id: 'mercy-entry', num: 13, title: 'Let Mercy Be Planted in Your House', paragraphs: [{ text: 'Rather let mercy be planted in your house, for now the season of grace has come upon you.' }] },
    { id: 'garden-entry', num: 14, title: 'The Quiet of My Garden', paragraphs: [{ text: filler(2) + 'For the calm of My voice stills the waves, and My song is over them. Behold, the quiet of My garden keeps them!... Says The Lord.' }] },
    { id: 'widows-entry', num: 15, title: 'Shelter the Widows Who Weep', paragraphs: [{ text: filler(2) + 'Open the door.' }] },
    { id: 'lanterns-entry', num: 16, title: 'Lanterns', paragraphs: [{ text: filler(2) + 'Light them.' }] },
    { id: 'guard-well', num: 12, title: 'Guard Well', paragraphs: [{ text: filler(4) + 'Keep the gate.' }] },
    { id: 'wall-entry', num: 10, title: 'The Wall', paragraphs: [{ text: 'A watchman on a wall, a watchman on a wall.' }] },
  ],
  ANSWERS: [
    // a heading of the topic's own: the reader who types it lands on it
    { id: 'regarding-springs', num: 2, title: 'Regarding Water', paragraphs: [
      { text: filler(8) + 'Drink and live.' },
      { align: 'center', text: '**' + HEADING + '**' },
      { text: 'Where the trees stand tall, the water rises clear. ✦ Drink of it.' },
    ] },
    // a heading quoting a letter's sentence: the letter is its original
    { id: 'regarding-household', num: 3, title: 'Regarding the Household', paragraphs: [
      { text: filler(6) + 'Keep your house.' },
      { align: 'center', text: '**' + QUOTED_HEADING + '**' },
      { text: QUOTED_HEADING + '. The house was filled with the fragrance. ✦ Keep it.' },
    ] },
    // a two-word heading over a quote of the letter's line
    { id: 'regarding-seal', num: 5, title: 'Regarding The Seal', paragraphs: [
      { text: filler(7) + 'Hold fast.' },
      { align: 'center', text: '**Sealed Forever**' },
      { text: 'It was begun of old, And sealed forever upon the mountain of My holiness. ~ [From “The Sealing” ~ Volume 4]' },
    ] },
    // an index of many matters, one of its headings a word a topic is titled by
    { id: 'regarding-many-matters', num: 6, title: 'Regarding Many Matters', paragraphs: [
      { text: 'Many ask of many matters, and here are the answers. ' + filler(9) },
      { align: 'center', text: '**The Olives**' },
      { text: 'Of the olives men say many things: the olives are bitter, the olives are sweet, the olives are the oil of the lamp. ✦ Hear.' },
    ] },
    { id: 'regarding-the-olives', num: 7, title: 'Regarding the Olives of the Mount', paragraphs: [
      { text: 'The olives ripen on the mount, and the press is ready. ' + filler(3) },
    ] },
    // a topic quoting an entry by name and collection: it holds the title and the collection's name in a row
    { id: 'regarding-rest', num: 4, title: 'Regarding Rest', paragraphs: [
      { text: filler(5) + 'He restores the soul.' },
      { align: 'right', text: '~ [From “Beside the Still Waters” ~ Words To Live By: Part Two]' },
    ] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a title remembered loosely is admitted (B5)', () => {
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

  it('a title typed with its words in other forms leads the texts whose bodies say them more', async () => {
    const r = await E.search('watchman upon the wall');
    expect(ids(r)[0]).toBe('watchmen-walls');
    // it opens at its start: the title, not a place in the body, is what was named
    expect(r.results[0].placeStart).toBe(0);
  });

  it('a title typed whole opens at its start, its words scattered in its body (the S22 look: not on a find place)', async () => {
    const r = await E.search('oil and wine for the weary');
    expect(ids(r)[0]).toBe('oil-and-wine');
    expect(r.results[0].placeStart).toBe(0);
  });

  it('a title typed whole that its body says word for word opens on that line: the words typed are a quote of it too', async () => {
    const r = await E.search('lamps trimmed for the bridegroom');
    expect(ids(r)[0]).toBe('lamps-trimmed');
    const p = r.results[0].placeStart;
    expect(r.results[0].doc.text.slice(p, p + 13).toLowerCase()).toBe('lamps trimmed');
  });

  it('a line remembered with a word left out leads the title made of it loosely: the line’s original first', async () => {
    const r = await E.search('rather let be planted in your house');
    expect(ids(r)[0]).toBe('mercy-letter');
    expect(ids(r).slice(0, 5)).toContain('mercy-entry');
  });

  it('the collection typed beside a title says which of its two texts leads', async () => {
    expect(ids(await E.search('beside still waters words to live by'))[0]).toBe('still-waters-wtlb');
    expect(ids(await E.search('beside still waters volume 4'))[0]).toBe('still-waters');
  });

  it('a title typed whole beside its collection leads a text that quotes it by that name and collection', async () => {
    // the quoting topic holds every typed word in a row, as a quote found word for word would; it is a citation of the title
    expect(ids(await E.search('beside the still waters words to live by'))[0]).toBe('still-waters-wtlb');
  });

  it('"volume N" and words is searched as words: the title in that volume leads, under no letter card', async () => {
    const r = await E.search('volume 4 watchman upon the wall');
    expect(r.parsed.kind).toBe('text');
    expect(ids(r)[0]).toBe('watchmen-walls');
  });

  it('an Answers heading typed loosely leads, opening on its heading', async () => {
    const r = await E.search('springs beneath the cedar');
    expect(ids(r)[0]).toBe('regarding-springs');
    const d = r.results[0].doc;
    expect(r.results[0].placeStart).toBe(d.text.indexOf(HEADING));
  });

  it('a heading whose words a letter holds: the letter first, on that sentence, the Answers topic next', async () => {
    const r = await E.search('oil poured upon the threshold');
    expect(ids(r).slice(0, 2)).toEqual(['threshold-letter', 'regarding-household']);
    const d = r.results[0].doc;
    expect(r.results[0].placeStart).toBe(d.text.indexOf(QUOTED_HEADING));
  });

  it('words a short heading labels, typed as the line says them: the letter holding the line first, on it', async () => {
    const r = await E.search('and sealed forever');
    expect(ids(r).slice(0, 2)).toEqual(['the-sealing', 'regarding-seal']);
    const d = r.results[0].doc;
    expect(r.results[0].placeStart).toBe(d.text.indexOf('And sealed forever'));
  });

  it('a verse holding four or more typed words in a row stays first over a title named loosely', async () => {
    const r = await E.search('the watchman upon the walls');
    expect(r.results[0].doc.ref).toBe('Proverbs 31:42');
    expect(ids(r).slice(0, 5)).toContain('watchmen-walls');
  });

  it('a verse holding three typed words in a row stays first over a title they name loosely', async () => {
    const r = await E.search('guarded them well');
    expect(r.results[0].doc.ref).toBe('Proverbs 31:41');
    expect(ids(r).slice(0, 5)).toContain('guard-well');
  });

  it('a title remembered loosely whose body says the words nearly as typed opens on that sentence, not at the top', async () => {
    const r = await E.search('the rivers will run dry before the throne');
    expect(ids(r)[0]).toBe('rivers-dry');
    // no landing at the top: where it opens is the card's words' (use-search matchExcerpt), or the place named
    const d = r.results[0].doc;
    const p = r.results[0].placeStart;
    expect(p).not.toBe(0);
    const ex = typeof p === 'number' ? d.text.slice(p, p + 48) : E.matchExcerpt(d.text, ['rivers', 'run', 'dry', 'throne']);
    expect(ex).toMatch(/run dry before the throne/);
  });

  it('a title remembered loosely: the text titled so leads the longer title it opens', async () => {
    expect(ids(await E.search('walk with me as i walked with you'))[0]).toBe('walk-wtlb');
  });

  it('a title remembered with a word wrong leads the letter its entry reprints: the body says no more of it than the title', async () => {
    expect(ids(await E.search('the calm of my garden'))[0]).toBe('garden-entry');
  });

  it('a verse remembered with a word left out leads the title its middle makes: a quote one word off is a quote', async () => {
    expect(ids(await E.search('love the shelter the widows who weep and'))[0]).toBe('Proverbs 31:43');
  });

  it('a letter’s first words calling its reader by a collection’s name are its words, not a title in that collection', async () => {
    expect(ids(await E.search('little flock concerning the lamp the oil'))[0]).toBe('lamp-letter');
  });

  it('a word or two naming a heading of an index: the topic titled by the word leads, not the index', async () => {
    expect(ids(await E.search('olives'))[0]).toBe('regarding-the-olives');
  });

  it('a collection’s word beside a title in another collection names no title: the text holding both words leads', async () => {
    expect(ids(await E.search('flock lanterns'))[0]).toBe('Proverbs 31:44');
  });

  it('a search kept to the Scriptures admits no title', async () => {
    const r = await E.search('watchman upon the wall', { corpus: 'scriptures' });
    expect(r.results.every((x) => x.doc.kind === 'verse')).toBe(true);
  });
});

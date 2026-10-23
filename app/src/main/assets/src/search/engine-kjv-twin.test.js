/* EVERY VERSE IN ITS KJV WORDING TOO, IN THE ENGINE (search200 fix1 "ed", 2026-10-19). A verse remembered in the
   KJV's words leads, found by those words alone and never "corrected"; its KJV sentence names it the original of a
   reprint; its two wordings are each read alone and scored the better, never summed; the KJV wording answers the
   typed word exactly (no prefix reach). With no wording (none set, or a file that does not load) the search is the
   reader's edition alone. Fixture texts only (no bench query); every case puts the engine's wording back. */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { VotSearchMini as E } from './engine.js';
import { encodeKjvTwin, parseKjvTwin } from './kjv-twin.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'has', 'they', 'their', 'them', 'do', 'nor', 'upon', 'unto']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (/** @type {string} */ v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (/** @type {number} */ n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const FILL = Array.from({ length: 40 }, (_, i) => 'The ant and the rock badger, the locust and the spider, in the house of kings ' + i + '.');
/** The reader's edition, and the same verses in the KJV's words. */
const NKJV = [
  'The lantern of the sentinel shines over the rampart of the town, and the door is barred at evening.',
  'Concerning this the steward spoke to the doorman: unbar the door at daybreak.',
  'The steward keeps the door.',
];
const KJV = [
  'The candle of the sentinel burneth upon the rampart of the town; and the door is barred at even.',
  'Whereof the steward spake unto the porter, Unbar thou the door at the dayspring.',
  'And the steward keepeth the door of the town by night and by day, and he watcheth the rampart.',
];
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 1, sections: [{ heading: '', verses: FILL.map((text, i) => ({ n: i + 1, text })) }] },
      { num: 2, sections: [{ heading: '', verses: NKJV.map((text, i) => ({ n: i + 1, text })) }] },
    ] },
  },
  LETTERS_V4: [
    // a letter holding the remembered line's words the reader's edition shares, and its candle
    { id: 'candle-letter', num: 3, title: 'Light in the Window', blocks: [para(filler(4) + 'Set a candle in the window of the town, and let the sentinel see it shine over the rampart at evening. ' + filler(4))] },
    { id: 'where-letter', num: 4, title: 'The Road', blocks: [para(filler(3) + 'Where the road turns, there the steward waits. ' + filler(3))] },
    // a letter holding in one wording two words the verse holds one in each, and one holding one of them over again
    { id: 'tower-letter', num: 5, title: 'The Tower', blocks: [para(filler(3) + 'In the tower the lantern hangs, and the oil burneth all the night long. ' + filler(3))] },
    { id: 'lantern-letter', num: 6, title: 'The House', blocks: [para('The lantern, the lantern, the lantern of the house. ' + filler(1))] },
  ],
  ANSWERS: [
    // a topic reprinting the verse in the KJV's words, word for word, among its own
    { id: 'reprint', num: 1, title: 'Regarding Watchfulness', paragraphs: [{ text: filler(2) + 'The candle of the sentinel burneth upon the rampart of the town. ' + filler(2) }] },
  ],
};
const TWIN = parseKjvTwin(JSON.parse(JSON.stringify(encodeKjvTwin({
  proverbs: { 1: FILL.map((text, i) => ({ n: i + 1, text })), 2: KJV.map((text, i) => ({ n: i + 1, text })) },
}, 'fixture'))));
const refs = (/** @type {any} */ r) => r.results.map((/** @type {any} */ x) => x.doc.kind === 'verse' ? x.doc.ref : x.doc.kind === 'answers' ? x.doc.title : x.doc.letterId);

describe('every verse in its KJV wording too, in the engine', () => {
  /** @type {any} */ let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) /** @type {any} */ (globalThis)[k] = /** @type {any} */ (GLOBALS)[k];
    E.setKjvTwin(null);
    await E.init();
  }, 60000);
  afterEach(() => {
    E.setKjvTwin(null);
    vi.unstubAllGlobals();
  });
  afterAll(() => {
    E.setKjvTwin(null);
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete /** @type {any} */ (globalThis)[k];
  });

  it('a verse remembered in the KJV’s words leads the texts holding the words its own edition shares', async () => {
    const q = 'the candle of the sentinel burneth upon the rampart';
    expect(refs(await E.search(q))[0]).not.toBe('Proverbs 2:1');
    E.setKjvTwin(TWIN);
    expect(refs(await E.search(q))[0]).toBe('Proverbs 2:1');
    // ...and the wording taken away, the reader's edition alone again
    E.setKjvTwin(null);
    expect(refs(await E.search(q))[0]).not.toBe('Proverbs 2:1');
  });

  it('a word only the KJV wording holds finds its verse, and is never "corrected"', async () => {
    E.setKjvTwin(TWIN);
    const r = await E.search('dayspring');
    expect(refs(r)).toEqual(['Proverbs 2:2']);
    expect(r.corrections || []).toEqual([]);
  });

  it('the KJV wording answers the typed word exactly: "where" does not reach its "whereof"', async () => {
    E.setKjvTwin(TWIN);
    const r = refs(await E.search('where'));
    expect(r).toContain('where-letter');
    expect(r).not.toContain('Proverbs 2:2');
    expect(refs(await E.search('whereof'))).toContain('Proverbs 2:2');
  });

  it('a verse both wordings find scores the better wording’s score, never the sum', async () => {
    const q = 'steward door';
    const score = (/** @type {any} */ r) => r.results.find((/** @type {any} */ x) => x.doc.ref === 'Proverbs 2:3').score;
    const off = score(await E.search(q));
    E.setKjvTwin(TWIN);
    // its KJV wording holds both words in a longer verse: its own edition's score stands
    expect(score(await E.search(q))).toBe(off);
  });

  it('a verse’s two wordings are never mixed: a word from each does not make it hold the query', async () => {
    // Proverbs 2:1 has "lantern" in its own edition and "burneth" in the KJV; one letter holds both, one "lantern" alone
    const q = 'lantern burneth';
    const at = (/** @type {string[]} */ r, /** @type {string} */ id) => r.indexOf(id);
    let r = refs(await E.search(q));
    expect(at(r, 'tower-letter')).toBe(0);
    E.setKjvTwin(TWIN);
    r = refs(await E.search(q));
    expect(at(r, 'tower-letter')).toBe(0);
    // it holds one of the two words in either wording: no more of the query than the letter saying "lantern" over again
    expect(at(r, 'Proverbs 2:1')).toBeGreaterThan(at(r, 'lantern-letter'));
  });

  it('a verse is the original of its KJV sentences: it leads a topic reprinting one word for word', async () => {
    const q = 'the candle of the sentinel burneth upon the rampart of the town';
    expect(refs(await E.search(q))[0]).toBe('Regarding Watchfulness');
    E.setKjvTwin(TWIN);
    const r = refs(await E.search(q));
    expect(r[0]).toBe('Proverbs 2:1');
    expect(r).toContain('Regarding Watchfulness');
  });

  it('a wording file that does not load leaves the search as it is without one', async () => {
    const q = 'the candle of the sentinel burneth upon the rampart';
    const base = refs(await E.search(q));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, redirected: false, status: 404, json: async () => ({}) })));
    E.setKjvTwinSource('search-kjv-twin.json');
    expect(refs(await E.search(q))).toEqual(base);
    expect(E.getState().kjv).toBe('failed');
  });

  /* search200 idea A (2026-10-22): a verse its KJV wording found says so on its result (kjvWording), so its card
     shows the KJV words it matched and the reader opens that verse in the KJV for the visit. Only when that wording
     stood for it: a verse its own edition found as well, or better, is no KJV find. */
  it('a verse its KJV wording found carries kjvWording; one its own wording found does not', async () => {
    const of = (/** @type {any} */ r, /** @type {string} */ ref) => r.results.find((/** @type {any} */ x) => x.doc.ref === ref);
    const q = 'the candle of the sentinel burneth upon the rampart';
    expect(of(await E.search(q), 'Proverbs 2:1') || {}).not.toHaveProperty('kjvWording');
    E.setKjvTwin(TWIN);
    expect(of(await E.search(q), 'Proverbs 2:1').kjvWording).toBe(true);
    expect(of(await E.search('dayspring'), 'Proverbs 2:2').kjvWording).toBe(true);
    // its own edition's score stands (the KJV verse is longer): no KJV find
    expect(of(await E.search('steward door'), 'Proverbs 2:3')).not.toHaveProperty('kjvWording');
    // never on a text that is not a verse
    for (const x of (await E.search(q)).results) if (x.doc.kind !== 'verse') expect(x).not.toHaveProperty('kjvWording');
  });

  it('the app names a file: read beside the index, and the verse leads once it is in', async () => {
    const fetch = vi.fn(async () => ({ ok: true, redirected: false, status: 200, json: async () => encodeKjvTwin({ proverbs: { 1: FILL.map((text, i) => ({ n: i + 1, text })), 2: KJV.map((text, i) => ({ n: i + 1, text })) } }, 'fixture') }));
    vi.stubGlobal('fetch', fetch);
    E.setKjvTwinSource('search-kjv-twin.json');
    expect(refs(await E.search('the candle of the sentinel burneth upon the rampart'))[0]).toBe('Proverbs 2:1');
    expect(E.getState().kjv).toBe('ready');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

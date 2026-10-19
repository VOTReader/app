/* A TITLE TYPED WITH ONE WORD WRONG (search200 last2, 2026-10-18). A reader sure of a title's shape and unsure of one of
   its words types the shape with a content word of their own in that word's place. The word is no form, typo or
   near-synonym of the title's, so titles.js named nothing, and the texts holding the typed words far apart led the
   title. swapTitles reads the shape where it fits one title alone; the engine admits it only where nothing else names a
   title and no text holds the typed words together (a short quote one word off a title is the quote). Fixture texts
   and titles only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTitles, scoreTitles, swapTitles } from './titles.js';
import { VotSearchMini as E } from './engine.js';

// 'not' is no stop word, as in the volumes' own list
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'had', 'has', 'have', 'they', 'them', 'their', 'we', 'our', 'me', 'him', 'her', 'she', 'this', 'from', 'or', 'as', 'if', 'than', 'then', 'yet', 'do', 'did', 'does', 'been', 'were', 'said', 'will', 'your', 'shall', 'until', 'before']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};

describe('swapTitles: the shape of one title, one content word changed', () => {
  let prev;
  let n = 0;
  const doc = (kind, volumeId, letterId, title) => ({ id: 'd' + (n++), kind, volumeId, letterId, title, text: title + ' is spoken of here.' });
  const DOCS = [
    doc('wtlb', 'wtlb1', 'kindled-entry', 'Kindled to Shine'),
    doc('letter', 'v1', 'kindled', 'Kindled to Shine'),
    doc('letter', 'v2', 'sent-heal', 'Sent to Heal'),
    doc('letter', 'v2', 'sent-serve', 'Sent to Serve'),
    doc('letter', 'v3', 'holy-flame', 'The Holy Flame'),
    doc('letter', 'v3', 'gate-five', 'The Gate Part Five'),
    doc('letter', 'v4', 'lamp-weary', 'The Lamp of the Weary'),
    doc('letter', 'v5', 'not-by-arm', 'Not By Strength of Arm'),
  ];
  let ix;
  beforeAll(() => { prev = window.VotSearchData; window.VotSearchData = VOT_DATA; ix = buildTitles(DOCS, {}); });
  afterAll(() => { window.VotSearchData = prev; });
  const uks = (q, hits) => swapTitles(q, { index: ix, hits }).map((h) => h.uk);

  it('one content word of the reader\'s own: the title and its reprint, the original first', () => {
    expect(scoreTitles('lit to shine', { index: ix })).toEqual([]);
    const sw = swapTitles('lit to shine', { index: ix });
    expect(sw.map((h) => h.uk)).toEqual(['v1/kindled', 'wtlb1/kindled-entry']);
    expect(sw[0]).toMatchObject({ level: 2, via: 'swap', swap: ['lit', 'kindled'], typed: ['lit', 'to', 'shine'] });
    expect(uks('the lamp of the needy')).toEqual(['v4/lamp-weary']);
  });

  it('two titles the shape fits: neither', () => {
    expect(uks('sent to mend')).toEqual([]);
  });

  it('a small word changed, a negation, a number changed, two words wrong, or a title of two words: none', () => {
    expect(uks('kindled at shine')).toEqual([]);
    expect(uks('won by strength of arm')).toEqual([]);
    expect(uks('not by strength of hand')).toEqual(['v5/not-by-arm']);
    expect(uks('the gate part six')).toEqual([]);
    expect(uks('lit for shine')).toEqual([]);
    expect(uks('lit to glow')).toEqual([]);
    expect(uks('the holy fire')).toEqual([]);
  });

  it('a title scored otherwise is a rival; its own reprint is not', () => {
    const other = { uk: 'v2/sent-heal', norm: 'sent to heal', series: 'sent heal' };
    const own = { uk: 'wtlb1/kindled-entry', norm: 'kindled to shine', series: 'kindled shine' };
    expect(uks('lit to shine', [other])).toEqual([]);
    expect(uks('lit to shine', [own])).toEqual(['v1/kindled', 'wtlb1/kindled-entry']);
  });

  it('the collection named beside it: read in that collection only', () => {
    const sw = swapTitles('lit to shine volume one', { index: ix });
    expect(sw.map((h) => h.uk)).toEqual(['v1/kindled']);
    expect(sw[0]).toMatchObject({ via: 'swap+collection', hinted: true });
  });
});

const filler = (k) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(k);
const seg = (v) => [{ segments: [{ v }] }];
const GLOBALS = {
  BOOKS: {},
  LETTERS_V1: [
    // the title remembered with one word of the reader's own; its text holds one typed content word
    { id: 'kindled', num: 1, title: 'Kindled to Gleam', blocks: seg(filler(2) + 'Arise, My children, for the night is far spent and the day is near. ' + filler(2)) },
    // texts holding both typed content words far apart, again and again (and one of them in the title)
    ...[2, 3, 4].map((num) => ({ id: 'embers-' + num, num, title: 'Fanned Embers ' + num, blocks: seg(('We fanned the coals of the fire through the long night, until at last the embers began to gleam. ' + filler(1)).repeat(2)) })),
    // a sentence holding the typed content words with words of its own between them
    { id: 'stoked', num: 8, title: 'The Gleam of the Coals', blocks: seg(filler(2) + 'At evening the coals were stoked and began to gleam in the dark. '.repeat(3) + filler(2)) },
    // a short quote of a sentence, one word off the title below; and a text holding its words far apart
    { id: 'oil', num: 5, title: 'Oil in Your Vessels', blocks: seg(filler(2) + 'Keep oil in your vessels and keep burning the lamp of the faithful, says The Lord. ' + filler(2)) },
    { id: 'keep-watch', num: 9, title: 'Keep Watch', blocks: seg(('Be faithful in all things, little ones, and watch. ' + filler(1) + 'Trim the lamp at evening and wait for Me. ').repeat(4)) },
    // the look-alike title
    { id: 'lamp-weary', num: 7, title: 'The Lamp of the Weary', blocks: seg(filler(2) + 'Come to Me, all who labor and are heavy laden, and I will be a light in your night. ' + filler(2)) },
    // texts holding none of the typed content words, so the small words weigh as little as they do in the volumes
    ...Array.from({ length: 12 }, (_, k) => ({ id: 'words-' + k, num: 10 + k, title: 'Words ' + k, blocks: seg(filler(2)) })),
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a title typed with one word wrong leads the texts holding its words far apart (last2)', () => {
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

  it('the title leads the texts holding its typed words far apart', async () => {
    const top = ids(await E.search('fanned to gleam'));
    expect(top[0]).toBe('kindled');
    expect(top.slice(1, 4).sort()).toEqual(['embers-2', 'embers-3', 'embers-4']);
  });

  it('a sentence holding the typed content words with words of its own between them: the sentence leads', async () => {
    const top = ids(await E.search('stoked to gleam'));
    expect(top.slice(0, 2)).toEqual(['stoked', 'kindled']);
  });

  it('a short quote of a sentence one word off a title: the sentence leads, the look-alike title is not pulled up', async () => {
    const top = ids(await E.search('the lamp of the faithful'));
    expect(top.slice(0, 3)).toEqual(['oil', 'keep-watch', 'lamp-weary']);
  });
});

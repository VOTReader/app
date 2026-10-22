/* A TITLE TYPED AS WRITTEN LEADS (search200 B1, 2026-10-18). titleMatch stripped a leading
   Regarding/The/A/An from both sides, so "X" and "Regarding X" (or "The X") each took the
   same x3 and body BM25 settled it: a dense Answers topic or a short Words To Live By entry
   led the letter whose title the reader typed exactly. A study chapter was matched only as
   "Study — Chapter", so its own title typed alone never counted as typed whole. Now the
   title as typed beats the same title with its lead word stripped, which beats any partial
   title, keyword searches included; ties go to the original (letter, Words To Live By, Holy
   Days, study, Answers). A verse holding a quote of four words or more as typed stays first.
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';
import { titleLevel } from './ranking.js';
import { kjvEncode } from './tokenize.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who']);
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
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      // many verses, as a Bible has: a title is long beside the average text's (none)
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 400 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger, the locust and the spider, in the house of kings ' + i + '.' })) }] },
      { num: 31, sections: [{ heading: '', verses: [
      { n: 40, text: 'Here is the patience of the saints and the faith of the upright.' },
      { n: 41, text: 'The gatekeepers rise early.' },
    ] }] },
    ] },
  },
  LETTERS_V4: [
    // the title typed whole; its body says the word once among much else
    { id: 'vigilance', num: 9, title: 'Vigilance', blocks: [para(filler(12) + 'Keep your vigilance.')] },
    // a letter titled as a verse is worded, its lead word aside; its long body never says it
    // the letter whose Words To Live By entry drops its "The"
    { id: 'the-plumb-line', num: 11, title: 'The Plumb Line', blocks: [para(filler(16) + 'I set a plumb line among you.')] },
    { id: 'patience-saints', num: 10, title: 'Patience of the Saints', blocks: [para(filler(30) + 'Be patient, saints. Amen.')] },
  ],
  LETTERS_FLOCK: [
    { id: 'gatekeepers', num: 3, title: 'Gatekeepers', blocks: [para(filler(14) + 'You are gatekeepers.')] },
    // a letter whose body says the chapter's words again and again, its title another
    { id: 'loaves-letter', num: 4, title: 'A Word on the Bread', blocks: [para('The unleavened loaves, the unleavened loaves, eat the unleavened loaves in haste. '.repeat(3))] },
  ],
  WTLB_TWO: [
    // the lead word "The" on the title typed; short, so BM25 pays it most
    { id: 'the-gatekeepers', num: 7, title: 'The Gatekeepers', paragraphs: [{ text: 'Gatekeepers, gatekeepers: watch the gate.' }] },
    { id: 'plumb-line', num: 8, title: 'Plumb Line', paragraphs: [{ text: 'A plumb line, a plumb line among you.' }] },
  ],
  ANSWERS: [
    // "Regarding" on the title typed, and a body dense with the word
    { id: 'regarding-vigilance', num: 2, title: 'Regarding Vigilance', paragraphs: [{ text: 'Vigilance, vigilance and vigilance. Be vigilant in vigilance. ✦ Vigilance is watching.' }] },
    // a title holding the chapter's title and more, its body full of the words
    { id: 'regarding-loaves', num: 3, title: 'Regarding the Unleavened Loaves of Passover', paragraphs: [{ text: 'Eat the unleavened loaves. ✦ The unleavened loaves are for the feast.' }] },
  ],
  BIBLE_STUDIES: [
    { id: 'feasts', slug: 'feasts', title: 'The Feasts of The Lord', chapters: [
      { id: 'feasts-ch1', num: 1, title: 'The Unleavened Loaves', blocks: [para(filler(10) + 'Seven days you shall eat bread without leaven.')] },
      { id: 'feasts-ch2', num: 2, title: 'The Firstfruits', blocks: [para(filler(10) + 'The first of the harvest.')] },
    ] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a title typed as written leads (B1)', () => {
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

  it('titleLevel: 4 for the title as typed, 3 with a leading Regarding/The/A/An stripped, else 0', () => {
    const lv = (t, q) => titleLevel(kjvEncode(t), kjvEncode(q));
    expect(lv('Vigilance', 'vigilance')).toBe(4);
    expect(lv('Regarding Vigilance', 'vigilance')).toBe(3);
    expect(lv('The Gatekeepers', 'gatekeepers')).toBe(3);
    expect(lv('The Gatekeepers', 'the gatekeepers')).toBe(4);
    expect(lv('God’s Gatekeepers', 'gods gatekeepers')).toBe(4);
    expect(lv('Gatekeepers of the Gate', 'gatekeepers')).toBe(0);
  });

  it('the title as typed leads the same title with "Regarding", even against a denser body', async () => {
    const r = ids(await E.search('vigilance'));
    expect(r[0]).toBe('vigilance');
    expect(r).toContain('regarding-vigilance');
  });

  it('the title as typed leads the same title with "The" (a short entry)', async () => {
    expect(ids(await E.search('gatekeepers'))[0]).toBe('gatekeepers');
    // typed with its "The", the entry is the title as typed
    expect(ids(await E.search('the gatekeepers'))[0]).toBe('the-gatekeepers');
  });

  it('a lead word left off says nothing: the original first ("plumb line" for the letter "The Plumb Line")', async () => {
    const r = ids(await E.search('plumb line'));
    expect(r[0]).toBe('the-plumb-line');
    expect(r).toContain('plumb-line');
  });

  it('a study chapter title typed alone finds that chapter', async () => {
    const r = await E.search('the unleavened loaves');
    expect(r.results[0].doc.studyChapterId).toBe('feasts-ch1');
  });

  it('a titled letter does not displace a verse that holds the quote whole', async () => {
    const r = await E.search('the patience of the saints');
    expect(r.results[0].doc.ref).toBe('Proverbs 31:40');
    // the letter is close by: the order is the title pass's call, not the reach's
    expect(ids(r).slice(0, 30)).toContain('patience-saints');
  });
});

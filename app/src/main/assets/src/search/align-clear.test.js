/* A CLEAR BEST UNDER ALIGN_HELD (search200 sealed2, 2026-10-22). B4 lifts the texts holding ALIGN_HELD (0.75) of a quote
   remembered with its slips, and a text holding it far better than every other text but under that bar got nothing:
   a study's line remembered with two of its words traded ("offered" for sacrificed, "symbol" for representation) held
   0.748 of it, the next text 0.357, and verses holding its common words led. The panel's unsealed tri m274, and the
   fault hunt's slip family (C4 (b): sli-18 0.66 against 0.49, sli-21 0.72 against 0.47, sli-28 0.66 against 0.36).
   A text holding ALIGN_CLEAR of the quote, ahead of every text not alike with it by twice the tie, is held with the
   texts alike with it; a field of texts holding it about as well holds nothing so (the Nehemiah 8:10 shape), nor does
   a passage more than CLEAR_COPIES texts print alike (the 500's open t359). A study held so gives way to the verse it
   quotes, though the reference typed beside the quote held it clear of the verse (hunt rt1-shapes-27).
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'had', 'has', 'have', 'they', 'them', 'their', 'we', 'our', 'me', 'him', 'her', 'she', 'this', 'from', 'or', 'as', 'if', 'than', 'then', 'yet', 'do', 'did', 'does', 'been', 'were', 'said', 'would']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { leviticus: 'leviticus' }, BOOK_DISPLAY: { leviticus: 'Leviticus' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['leviticus'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const GLOBALS = {
  BOOKS: {
    leviticus: { id: 'leviticus', title: 'Leviticus', chapters: [
      { num: 4, sections: [{ heading: '', verses: Array.from({ length: 120 }, (_, i) => ({ n: i + 1, text: 'The priest of the Lord of hosts shall burn the fat upon the altar in the tabernacle as a sweet aroma, for it is to be done ' + i + '.' })) }] },
      // verses dense with the quote's common words, and with "offered", one of its own
      { num: 5, sections: [{ heading: '', verses: [
        { n: 6, text: 'And he shall bring his trespass offering, a lamb offered for his sin, and the priest shall make atonement for him concerning his sin.' },
        { n: 7, text: 'If he is not able to bring a lamb, the sin offering shall be offered, and atonement shall be made for him for his sin.' },
        { n: 8, text: 'The animals offered for sin shall be without blemish, and the atonement for sin shall be made with them.' },
      ] }] },
      // ...and words of the quote that other texts hold
      { num: 6, sections: [{ heading: '', verses: [
        { n: 1, text: 'A sign of the covenant was set before the people.' },
        { n: 2, text: 'The covenant required of them what was written.' },
      ] }] },
      // a verse a study quotes, its reference printed after the quote
      { num: 17, sections: [{ heading: '', verses: [
        { n: 11, text: 'For the life of the flesh is in the blood, and I have given it to you upon the altar.' },
      ] }] },
      // verses holding another quote's words densely, out of its order
      { num: 7, sections: [{ heading: '', verses: [
        { n: 1, text: 'Souls are a ransom; a token is given for them; lambs are killed.' },
        { n: 2, text: 'The souls ransomed by the lambs killed are a token.' },
      ] }] },
    ] },
  },
  LETTERS_V4: [
    { id: 'old-covenant', num: 6, title: 'Verses Often Stumbled Over', blocks: [para(filler(10) + 'The Old Covenant required that animals be sacrificed as a representation of the atonement of sin that had come and would come through the Messiah. ' + filler(10))] },
    // a letter holding the quote's words far apart, the traded "symbol" among them (so it keeps its weight)
    { id: 'scattered', num: 9, title: 'Signs', blocks: [para(['The rainbow is a symbol given to Noah.', 'The law required much of them.', 'The animals went into the ark two by two.', 'On the day of atonement the people fasted.', 'Sin brings death.'].map((s) => filler(2) + s).join(' '))] },
    // a letter holding the words typed beside that quote far apart (so they keep their weight)
    { id: 'apart', num: 12, title: 'Epistles', blocks: [para(['Paul wrote to the Romans.', 'The Lord of hosts reigns.', 'Count 17 days.', 'Count 11 more.', 'Life is short.', 'The flesh is weak.', 'The blood was shed.'].map((x) => filler(2) + x).join(' '))] },
    // a passage three texts print alike
    ...[1, 2, 3].map((n) => ({ id: 'copy-' + n, num: 20 + n, title: 'The Old Law ' + n, blocks: [para(filler(4 * n) + 'The Old Law required that lambs be slain as a figure of the ransom of souls that had come and would come through the Messiah. ' + filler(4))] })),
  ],
  BIBLE_STUDIES: [
    { id: 'blood', slug: 'blood', title: 'The Blood of the Covenant', chapters: [
      { id: 'blood-ch1', num: 1, title: 'Life Is in the Blood', blocks: [para(filler(6) + '“For the life of the flesh is in the blood, and I have given it to you upon the altar.” – Leviticus 17:11 “The soul who sins shall die.” – Ezekiel 18:4 ' + filler(6))] },
    ] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.studyChapterId || x.doc.letterId || x.doc.ref);

describe('a clear best under ALIGN_HELD is held (sealed2)', () => {
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

  it('a line remembered with two words traded, held far better than any other text: it leads', async () => {
    expect(ids(await E.search('required animals to be offered as a symbol of the atonement for sin'))[0]).toBe('old-covenant');
  });

  it('a study held so, quoting a verse with its reference typed beside the quote: the verse it quotes leads', async () => {
    const top = ids(await E.search('romans 17 11 for the life of the flesh is in the blood lord of hosts'));
    expect(top.slice(0, 2)).toEqual(['Leviticus 17:11', 'blood-ch1']);
  });

  it('a passage three texts print alike, held as clearly: not lifted so, the order of the words stands', async () => {
    const top = ids(await E.search('required lambs to be killed as a token of the ransom for souls'));
    expect(top[0]).not.toMatch(/^copy-/);
  });
});

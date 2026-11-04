/* WHY THIS MATCHED, FROM A REAL SEARCH (search200 ideas E; h8 2026-11-04). The card reads its reason when it renders,
   from its own text and the words it marks (the screen's terms plus the engine's matched terms for the result,
   SrchCard cardTerms), through VotSearchMini.whyMatched, which knows His names (engine.js NAME_FORMS). The search
   itself adds only `byMeaning` on what the meaning brought in (engine-meaning.test.js), so the order and the scores
   are what they were. Fixture texts only. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';
import { expandSnippetTerms } from '../ui/screens/search-model.js';
import { cardTerms, whyLine } from '../ui/components/SrchCard.jsx';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'at', 'will', 'give', 'were', 'after', 'see', 'how', 'him', 'then', 'said', 'all', 'who', 'there', 'saw', 'stood', 'feeds']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: { shepherd: ['shepherd', 'pastor'], pastor: ['shepherd', 'pastor'] },
  BOOK_ABBREVS: { john: 'john', jeremiah: 'jeremiah', luke: 'luke' }, BOOK_DISPLAY: { john: 'John', jeremiah: 'Jeremiah', luke: 'Luke' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [
    { id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' },
  ],
  OT_BOOK_IDS: ['jeremiah'], NT_BOOK_IDS: ['luke', 'john'], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (/** @type {string} */ v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const verses = (/** @type {string[]} */ list) => list.map((text, i) => ({ n: i + 1, text }));
const GLOBALS = {
  BOOKS: {
    john: { id: 'john', title: 'John', chapters: [{ num: 11, sections: [{ heading: '', verses: verses(['Jesus wept.', 'Then the Jews said, See how He loved him.']) }] }] },
    jeremiah: { id: 'jeremiah', title: 'Jeremiah', chapters: [{ num: 3, sections: [{ heading: '', verses: verses(['I will give you a pastor after My heart.', 'The good shepherd feeds the flock.']) }] }] },
    luke: { id: 'luke', title: 'Luke', chapters: [{ num: 23, sections: [{ heading: '', verses: verses(['And the women were weeping at the tomb.']) }] }] },
  },
  LETTERS_V4: [
    { id: 'grave-letter', num: 3, title: 'At the Grave', blocks: [para('YahuShua wept at the grave of His friend, and all who stood there saw His love.')] },
  ],
};

/** The line a card of this search shows, built as SearchScreen and SrchCard build it. */
async function lines(/** @type {string} */ q, /** @type {any} */ opts = {}) {
  const r = await E.search(q, opts);
  const terms = expandSnippetTerms(r.textQuery || r.parsed, r.parsedTerms || [], opts.synonyms === false ? null : VOT_DATA.SYNONYM_MAP, opts.synonyms !== false, STOP);
  /** @type {Record<string, string>} */
  const out = {};
  for (const e of /** @type {any[]} */ (r.results)) {
    const d = e.doc;
    const text = [d.title, d.heading, d.text].filter(Boolean).join('\n');
    out[d.letterId || d.ref] = whyLine(E.whyMatched(text, cardTerms(e, terms, []), terms, { kjv: !!e.kjvWording, meaning: !!e.byMeaning }));
  }
  return out;
}

describe('a card says why a real search found it (ideas E)', () => {
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

  it('a text holding the typed words as typed has no line; one holding His other name says so', async () => {
    const l = await lines('jesus wept');
    expect(l['John 11:1']).toBe('');
    expect(l['grave-letter']).toBe('YahuShua = Jesus');
  });

  it('a synonym and a word form are a word swapped', async () => {
    const l = await lines('shepherd');
    expect(l['Jeremiah 3:1']).toBe('shepherd → pastor');
    expect(l['Jeremiah 3:2']).toBe('');
    expect((await lines('wept'))['Luke 23:1']).toBe('wept → weeping');
  });

  it('the search adds nothing for it: no result of a words-only search carries a why or a byMeaning', async () => {
    const r = await E.search('jesus wept');
    expect(r.results.length).toBeGreaterThan(1);
    expect(r.results.every((/** @type {any} */ x) => !('why' in x) && !('byMeaning' in x))).toBe(true);
  });
});

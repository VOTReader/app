import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { VotSearchMini } from './engine.js';

// ── Fixture corpus (window globals + VotSearchData), installed for the suite ──
const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his']),
  SYNONYM_MAP: {
    mercy: ['mercy', 'compassion'], compassion: ['mercy', 'compassion'],
    shepherd: ['shepherd', 'pastor'], pastor: ['shepherd', 'pastor'],
  },
  BOOK_ABBREVS: { john: 'john', jn: 'john', genesis: 'genesis', gen: 'genesis', psalms: 'psalms', ps: 'psalms', psalm: 'psalms' },
  BOOK_DISPLAY: { john: 'John', genesis: 'Genesis', psalms: 'Psalms' },
  NAMED_PASSAGES: [{ keys: ['shepherd psalm'], bookId: 'psalms', chapter: 23 }],
  NAMED_PASSAGE_INDEX: { 'shepherd psalm': { bookId: 'psalms', chapter: 23 } },
  COMMANDS: [{ keys: ['/home'], action: 'home', label: 'Go home' }],
  COMMAND_MAP: { '/home': { action: 'home', label: 'Go home' } },
  VOLUME_TOKEN_MAP: { v1: { id: 'v1', screen: 'vot-one-letter', label: 'Volume One' } },
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: ['genesis', 'psalms'],
  NT_BOOK_IDS: ['john'],
  GENRE_GROUPS: { gospels: ['john'], law: ['genesis'], poetry: ['psalms'] },
  WORD_NUMS: { one: 1 },
  ROMAN_NUMS: { i: 1 },
};

const GLOBALS = {
  BOOKS: {
    psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 23, sections: [{ heading: '', verses: [
      { n: 1, text: 'The LORD is my shepherd; I shall not want.' },
      { n: 2, text: 'He makes me to lie down in green pastures; He leads me beside the still waters.' },
    ] }] }] },
    john: { id: 'john', title: 'John', chapters: [{ num: 3, sections: [{ heading: '', verses: [
      { n: 16, text: 'For God so loved the world that He gave His only begotten Son.' },
    ] }] }] },
    genesis: { id: 'genesis', title: 'Genesis', chapters: [{ num: 1, sections: [{ heading: '', verses: [
      { n: 1, text: 'In the beginning God created the heavens and the earth.' },
    ] }] }] },
  },
  // Title deliberately omits "mercy" so synonym matching (mercy→compassion) is testable.
  LETTERS_V1: [{ id: 'compassion-letter', num: 1, title: 'Of Tender Compassion', blocks: [{ segments: [{ v: 'Great is the compassion of the Lord toward all His people.' }] }] }],
};

function refs(results) { return results.map((r) => r.doc.ref); }

describe('VotSearchMini engine', () => {
  let prevData;
  beforeAll(async () => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await VotSearchMini.init();
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('builds an in-memory index and reports ready', () => {
    expect(VotSearchMini.getState().ready).toBe(true);
    expect(VotSearchMini.getStats().docCount).toBe(5); // 3 verses + 1 verse + 1 letter
  });

  it('finds a single-word verse hit', async () => {
    const { results } = await VotSearchMini.search('shepherd');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].doc.ref).toBe('Psalms 23:1');
    expect(results[0].doc.kind).toBe('verse');
  });

  it('ranks a remembered phrase to the top (coverage + phrase boost)', async () => {
    const { results } = await VotSearchMini.search('the lord is my shepherd');
    expect(results[0].doc.ref).toBe('Psalms 23:1');
  });

  it('tolerates a typo (fuzzy)', async () => {
    const { results } = await VotSearchMini.search('shephard');
    expect(refs(results)).toContain('Psalms 23:1');
  });

  it('carries the fuzzy-corrected doc-side terms on each result (snippet highlight)', async () => {
    const { results } = await VotSearchMini.search('shephard');
    const hit = results.find((r) => r.doc.ref === 'Psalms 23:1');
    // The engine hands the UI the word the fuzzy search ACTUALLY matched in
    // the doc, so SrchCard can merge it into the highlight list.
    expect(hit.terms).toContain('shepherd');
    // Round-trip through the highlighter: the typed term alone marks nothing
    // (the v1.1 gap), typed + corrected marks the corrected word.
    const typedOnly = VotSearchMini.highlightSpans(hit.doc.text, ['shephard']);
    expect(typedOnly.some((s) => s.hit)).toBe(false);
    const merged = VotSearchMini.highlightSpans(hit.doc.text, ['shephard'].concat(hit.terms));
    expect(merged.some((s) => s.hit && /shepherd/i.test(s.text))).toBe(true);
  });

  it('expands synonyms only when enabled (mercy → compassion)', async () => {
    const on = await VotSearchMini.search('mercy', { synonyms: true });
    expect(on.results.some((r) => r.doc.kind === 'letter')).toBe(true);
    const off = await VotSearchMini.search('mercy', { synonyms: false });
    expect(off.results.some((r) => r.doc.kind === 'letter')).toBe(false);
  });

  it('short-circuits a structured reference (no text results)', async () => {
    const { parsed, results } = await VotSearchMini.search('john 3:16');
    expect(parsed.kind).toBe('ref-bible');
    expect(results.length).toBe(0);
  });

  it('short-circuits a command', async () => {
    const { parsed, results } = await VotSearchMini.search('/home');
    expect(parsed.kind).toBe('command');
    expect(results.length).toBe(0);
  });

  it('returns nothing for an all-stop-word query', async () => {
    const { results } = await VotSearchMini.search('the of and');
    expect(results.length).toBe(0);
  });

  it('scopes by corpus with NO cross-corpus leak', async () => {
    const scr = await VotSearchMini.search('lord', { corpus: 'scriptures' });
    expect(scr.results.length).toBeGreaterThan(0);
    expect(scr.results.every((r) => r.doc.corpus === 'scriptures')).toBe(true);

    const vol = await VotSearchMini.search('lord', { corpus: 'volumes' });
    expect(vol.results.length).toBeGreaterThan(0);
    expect(vol.results.every((r) => r.doc.corpus === 'volumes')).toBe(true);
  });

  it('scopes to a single book', async () => {
    const { results } = await VotSearchMini.search('god', { scope: { bookId: 'genesis' } });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.doc.bookId === 'genesis')).toBe(true);
  });

  it('honors a quoted phrase', async () => {
    const { results } = await VotSearchMini.search('"green pastures"');
    expect(refs(results)).toContain('Psalms 23:2');
  });

  it('honors -excluded terms', async () => {
    const { results } = await VotSearchMini.search('god -world');
    expect(refs(results)).toContain('Genesis 1:1');
    expect(refs(results)).not.toContain('John 3:16');
  });

  it('emits the { score, doc } routing contract', async () => {
    const { results } = await VotSearchMini.search('shepherd');
    const e = results[0];
    expect(typeof e.score).toBe('number');
    expect(e.doc).toMatchObject({ kind: 'verse', bookId: 'psalms', chapterNum: 23, verseNum: 1, corpus: 'scriptures' });
    expect(e.doc.ref).toBe('Psalms 23:1');
  });

  it('exposes facade helpers (suggest / parse / snippet / fuzzyBookSuggest)', () => {
    expect(VotSearchMini.suggest('shep').some((s) => s.query === 'shepherd psalm')).toBe(true);
    expect(VotSearchMini.suggest('/ho').some((s) => s.kind === 'command')).toBe(true);
    expect(VotSearchMini.parse('gen 1').kind).toBe('ref-bible');
    expect(VotSearchMini.fuzzyBookSuggest('jhon')).toBe('john');
    expect(VotSearchMini.snippet('The LORD is my shepherd', ['shepherd'])).toContain('shepherd');
  });

  it('rebuild() drops and re-creates a working index', async () => {
    await VotSearchMini.rebuild();
    expect(VotSearchMini.getState().ready).toBe(true);
    const { results } = await VotSearchMini.search('shepherd');
    expect(results.length).toBeGreaterThan(0);
  });
});

/* search-6 — THE PARSE NEEDS NO INDEX AND MUST NOT WAIT FOR ONE.

   `search()` awaited `ensureReady(options)` BEFORE parsing, and every non-text
   kind returns `results: []` two lines later without touching MiniSearch:

     engine.js:141   await ensureReady(options);          <- the ~10 s cold build
            :143   const parsed = parseReference(query, { corpus });
            :147   if (parsed.kind !== 'text') return { parsed, results: [], … };

   `parseReference` reads only the `searchData()` tables, which ship in bundle-a
   and are loaded before the app renders — the suggest box already proves it, since
   it answers at one character with no index at all. So "gen 1:1" and "/home" were
   held behind a build they have no use for.

   THIS BLOCK OWNS ITS DATA. It installs its own globals and imports a FRESH engine
   module, so `ready` is false with NO build in flight: the assertions below cannot
   race a build started by someone else's setup, and the suite-wide beforeAll's
   index cannot make a "did not build" assertion pass for the wrong reason. */
describe('search-6 — a reference or command answers before the index exists', () => {
  let prevData;
  let E;
  beforeEach(async () => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    vi.resetModules();
    E = (await import('./engine.js')).VotSearchMini;
  });
  afterEach(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('CONTROL and precondition: a fresh engine is NOT ready and has no build running', () => {
    /* Every assertion below reads `ready` to decide whether the index was waited
       on. If this case goes red the discriminator is gone and the others mean
       nothing, whatever colour they show. */
    expect(E.getState().ready).toBe(false);
    expect(E.getState().building).toBe(false);
  });

  it('a COMMAND resolves without building the index', async () => {
    const r = await E.search('/home');
    expect(r.parsed).toBeTruthy();
    expect(r.parsed.kind).toBe('command');
    expect(r.results).toEqual([]);
    // The index was never needed, so it was never waited for.
    expect(E.getState().ready).toBe(false);
  });

  it('a bare BOOK reference resolves without building the index', async () => {
    const r = await E.search('gen 1');
    expect(r.parsed).toBeTruthy();
    expect(r.parsed.kind).not.toBe('text');
    expect(r.results).toEqual([]);
    expect(E.getState().ready).toBe(false);
  });

  it('CONTROL: a TEXT query DOES build — the wait was moved, not deleted', async () => {
    /* Without this, "the index was not built" is satisfied by a search() that
       stopped building for everything, which would be a far worse defect than the
       one being fixed. */
    const r = await E.search('compassion');
    expect(r.parsed.kind).toBe('text');
    expect(E.getState().ready).toBe(true);
    expect(r.results.length).toBeGreaterThan(0);
  });
});

/* search-2 — A BARE BOOK NAME AND A NAMED-PASSAGE KEY GET A CARD AND SILENCE.

   `search()` returns `results: []` for every non-text parse, and two of the five
   kinds are ordinary reader input rather than an address:

     ref-book        a bare book name and NOTHING else (ref-parser.js:247, `if (!rest)`)
     named-passage   an exact key match

   So "Revelation" answers with a card to the book and not one verse containing the
   word. The cost lands on the book names that are also ordinary English words —
   Numbers, Judges, Kings, Chronicles, Job, Psalms, Proverbs, Song, Acts,
   Revelation, Lamentations, James, Jude.

   The nav card is NOT what changes: `SearchScreen.jsx:259` already builds direct
   entries from a parsed ref/passage/book and renders them ABOVE the results list,
   so the reader who wanted the book loses nothing. The list simply stops being
   empty.

   THIS BLOCK OWNS ITS DATA, and it needs its own fixture for a reason the shared one
   cannot give: it has to contain a book whose NAME also occurs as a word in another
   book's text. The suite fixture has no such pair, so a case written against it
   would go green or red for a corpus reason rather than for the fix. */
describe('search-2 — a bare book name gets its card AND the text hits', () => {
  const S2_STOP = new Set(['the', 'of', 'and', 'is', 'he', 'their', 'by', 'them']);
  const S2_DATA = {
    STOP_WORDS: S2_STOP,
    STOP_WORDS_TRIMMED: S2_STOP,
    SYNONYM_MAP: {},
    BOOK_ABBREVS: { numbers: 'numbers', num: 'numbers', psalms: 'psalms', ps: 'psalms' },
    BOOK_DISPLAY: { numbers: 'Numbers', psalms: 'Psalms' },
    NAMED_PASSAGES: [{ keys: ['numbers psalm'], bookId: 'psalms', chapter: 147 }],
    NAMED_PASSAGE_INDEX: { 'numbers psalm': { bookId: 'psalms', chapter: 147 } },
    WORD_NUMS: {},
    ROMAN_NUMS: {},
    VOLUME_COLLECTIONS: [],
    VOLUME_TOKEN_MAP: {},
    OT_BOOK_IDS: ['numbers', 'psalms'],
    NT_BOOK_IDS: [],
    GENRE_GROUPS: {},
    COMMANDS: [],
    COMMAND_MAP: {},
  };
  /* SEVEN verses carrying the word, because the CAP cannot be witnessed with five
     or fewer available — a cap asserted against four matches passes with no cap at
     all. */
  const S2_GLOBALS = {
    BOOKS: {
      numbers: { id: 'numbers', title: 'Numbers', chapters: [{ num: 1, sections: [{ heading: '', verses: [
        { n: 1, text: 'And the Lord spake unto Moses in the wilderness of Sinai.' },
      ] }] }] },
      psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 147, sections: [{ heading: '', verses:
        Array.from({ length: 7 }, (_unused, i) => ({
          n: i + 1, text: 'He telleth the numbers of the stars, saying ' + (i + 1) + '.',
        })),
      }] }] },
    },
  };

  let prevData;
  let E;
  beforeEach(async () => {
    prevData = window.VotSearchData;
    window.VotSearchData = S2_DATA;
    for (const k of Object.keys(S2_GLOBALS)) globalThis[k] = S2_GLOBALS[k];
    vi.resetModules();
    E = (await import('./engine.js')).VotSearchMini;
    await E.init();
  });
  afterEach(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(S2_GLOBALS)) delete globalThis[k];
  });

  it('CONTROL and precondition: the fixture has a book name that IS a word, seven times over', async () => {
    /* If this goes red the fixture stopped being the thing the other cases need,
       and "no text results" would pass for a corpus reason rather than a code one. */
    expect(E.getState().ready).toBe(true);
    const r = await E.search('stars');
    expect(r.parsed.kind).toBe('text');
    expect(r.results.length).toBe(7);
  });

  it('a bare BOOK NAME keeps its nav parse AND returns text hits', async () => {
    const r = await E.search('numbers');
    expect(r.parsed.kind).toBe('ref-book');       // the card is unchanged
    expect(r.parsed.bookId).toBe('numbers');
    expect(r.results.length).toBeGreaterThan(0);  // …and the silence is over
  });

  it('a NAMED-PASSAGE key does the same', async () => {
    const r = await E.search('numbers psalm');
    expect(r.parsed.kind).toBe('named-passage');
    expect(r.parsed.bookId).toBe('psalms');
    expect(r.results.length).toBeGreaterThan(0);
  });

  it('the text hits under a card are CAPPED at five', async () => {
    // Seven verses carry the word; five is the count the screen's own preview
    // slice already uses, and the cap is what stops a card being buried.
    const r = await E.search('numbers');
    expect(r.results.length).toBe(5);
  });

  it('the cap never OVERRIDES a caller asking for fewer', async () => {
    /* `Math.min(limit, NAV_TEXT_LIMIT)`, not `limit = NAV_TEXT_LIMIT`. A bite that
       replaced the min with a bare assignment reddened nothing, because every other
       case here uses the default limit — so the cap was free to be a floor as well
       as a ceiling. */
    const r = await E.search('numbers', { limit: 2 });
    expect(r.parsed.kind).toBe('ref-book');
    expect(r.results.length).toBe(2);
  });

  it('CONTROL: an EXPLICIT reference still returns zero text results', async () => {
    /* The arm that fails if the short-circuit is simply deleted — which would pass
       every case above perfectly. "num 1" is an address, not a word. */
    const r = await E.search('num 1');
    expect(r.parsed.kind).toBe('ref-bible');
    expect(r.parsed.chapter).toBe(1);
    expect(r.results).toEqual([]);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { buildDocs } from './index-builder.js';

const VOT_DATA = {
  VOLUME_COLLECTIONS: [
    { id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: 'LETTERS_V1_PREFACE', label: 'Volume One' },
    { id: 'wtlb1', screen: 'wtlb-one-entry', dataVar: 'WTLB_ONE', prefaceVar: null, label: 'Words To Live By: Part One' },
  ],
  OT_BOOK_IDS: ['genesis'],
  NT_BOOK_IDS: ['matthew'],
  GENRE_GROUPS: { gospels: ['matthew'], law: ['genesis'] },
};

const GLOBALS = {
  BOOKS: {
    genesis: {
      id: 'genesis', title: 'Genesis',
      chapters: [{ num: 1, sections: [{ heading: 'The Creation', verses: [
        { n: 1, text: 'In the beginning God created the heavens and the earth.' },
        { n: 2, text: 'The earth was without form, and void.' },
      ] }] }],
    },
    'matthew-plain': {
      id: 'matthew-plain', title: 'Matthew',
      chapters: [{ num: 5, sections: [{ heading: 'The Beatitudes', verses: [
        { n: 3, text: 'Blessed are the poor in spirit.' },
      ] }] }],
    },
  },
  // PRODUCTION SHAPE: matthew.js chapters expose `verses` DIRECTLY — the file
  // contains no `sections` key at all (verified against the shipped corpus:
  // 28 chapters, 0 sections, 1,071 verses). This fixture used to carry a
  // `sections` wrapper that production never had, which is precisely why the
  // builder's `mCh.sections || []` loop looked correct in tests while
  // contributing ZERO Matthew documents to the real index.
  MATTHEW: {
    chapters: [{ num: 5, title: 'Chapter 5', verses: [
      { n: 3, text: 'Blessed are the poor in spirit, restored reading.' },
    ] }],
  },
  // as the corpus has them: a preface carries no num (2026-10-05: five showed "Letter ?")
  LETTERS_V1_PREFACE: { id: 'v1-preface', title: 'A Word of Warning', blocks: [{ segments: [{ v: 'Hear the word of warning.' }] }] },
  LETTERS_V1: [{ id: 'the-wide-path', num: 1, title: 'The Wide Path', blocks: [{ segments: [{ v: 'Broad is the way that leads to destruction.' }] }, { type: 'closing', text: 'Says The Lord, The One who sees.' }] }],
  WTLB_ONE: [{ id: 'wtlb-1', num: 1, title: 'Matters of the Heart', paragraphs: [{ text: 'The wailing of the penitent {{ref:Matthew 4:4}} brings forth healing.' }] }],
  THE_BLESSED: [{ id: 'blessed-1', num: 1, title: 'The Blessed One', paragraphs: [{ text: 'Blessed are they that mourn.' }] }],
  HOLY_DAYS: [{ id: 'hd-1', num: 1, title: 'Passover', paragraphs: [{ text: 'Remember the passover forever.' }] }],
  ANSWERS: [{ id: 'regarding-pride', num: 105, title: 'Regarding Pride', paragraphs: [{ text: 'The pride of man {{ref:Proverbs 16:18}} goes before destruction.' }, { text: '~ [From “Pride” ~ Words To Live By: Part One]' }, { text: 'Humble yourselves.\n**The Truth: Regarding Humility**\n• **_Also see:_** _"Regarding the Holidays of Men"_\n\u{1F4D6} Also See: Grace AND The Law (Bible/Letter Study)\nFor I tell you the truth: walk humbly.' }] }],
  HIDDEN_MANNA: [{ id: 'woe-dallas', num: 1, title: 'Woe to Dallas', blocks: [{ segments: [{ v: 'Woe to the great city.' }] }] }],
  // PRODUCTION SHAPE (2026-09-22): a study chapter carries `id` + `blocks` (para
  // segments with `v`), never `content`. The old `content: [{ text }]` fixture
  // was a shape bible-studies.js never had, so every study doc's body was EMPTY
  // in the real index (title-only hits) while this suite stayed green.
  BIBLE_STUDIES: [{ id: 'study-faith', slug: 'study-faith', title: 'On Faith', chapters: [{ id: 'study-faith-ch1', num: 1, title: 'Beginnings', blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Faith is the substance of things hoped for.' }] },
    // a poem, as 71 study chapters carry them (sweep W30)
    { type: 'poetry', lines: [[{ t: 'text', v: 'Come, all those who know not My ways;' }], [{ t: 'text', v: '' }], [{ t: 'text', v: 'I will show you.' }, { t: 'fn', v: '3' }]] },
    { type: 'para', segments: [{ t: 'text', v: 'And so it ends.' }] }] }] }],
};

describe('buildDocs (narrow index scope)', () => {
  let prevData;
  let docs;
  beforeAll(() => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    docs = buildDocs({ translation: 'nkjv' });
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('emits ONLY the six allowed kinds — never footnote/heading/chapter-title/study-note/cross-ref/letter-title', () => {
    const kinds = new Set(docs.map((d) => d.kind));
    const allowed = new Set(['verse', 'letter', 'wtlb', 'blessed', 'holy-day', 'answers', 'bible-study']);
    for (const k of kinds) expect(allowed.has(k)).toBe(true);
    for (const banned of ['footnote', 'heading', 'chapter-title', 'study-note', 'cross-ref', 'letter-title']) {
      expect([...kinds]).not.toContain(banned);
    }
  });

  it('folds each Answers topic into one doc of its own kind, in its own volume', () => {
    const ans = docs.filter((d) => d.kind === 'answers');
    expect(ans.length).toBe(1);
    expect(ans[0]).toMatchObject({ letterId: 'regarding-pride', volumeId: 'answers', corpus: 'volumes', title: 'Regarding Pride' });
    expect(ans[0].text).toContain('pride of man');
    expect(ans[0].text).not.toContain('{{ref');
  });

  it('an Answers topic’s cross-reference lines are not its words (search audit 2026-09-27)', () => {
    const ans = docs.find((d) => d.kind === 'answers');
    expect(ans.text).toContain('Humble yourselves');
    expect(ans.text).toContain('I tell you the truth: walk humbly');   // "the truth:" in a sentence stays
    expect(ans.text).not.toContain('Regarding Humility');
    expect(ans.text).not.toContain('Holidays of Men');
    expect(ans.text).not.toContain('Grace AND The Law');
  });

  it('every doc carries an id, a corpus discriminator, and a kind', () => {
    for (const d of docs) {
      expect(typeof d.id).toBe('string');
      expect(d.corpus === 'scriptures' || d.corpus === 'volumes').toBe(true);
      expect(typeof d.kind).toBe('string');
    }
  });

  it('verses index text only — title is EMPTY, ref/heading stored for display', () => {
    const gen = docs.find((d) => d.kind === 'verse' && d.bookId === 'genesis' && d.verseNum === 1);
    expect(gen).toBeTruthy();
    expect(gen.title).toBe(''); // not indexed on the reference
    expect(gen.text).toContain('In the beginning');
    expect(gen.ref).toBe('Genesis 1:1');
    expect(gen.heading).toBe('The Creation');
    expect(gen.corpus).toBe('scriptures');
    expect(gen.testament).toBe('ot');
    expect(gen.genre).toBe('law');
    expect(gen.volumeId).toBe('bible');
  });

  it('routes matthew-plain (scriptures) vs matthew study (volumes) distinctly', () => {
    const plain = docs.find((d) => d.kind === 'verse' && d.bookId === 'matthew-plain');
    expect(plain).toMatchObject({ corpus: 'scriptures', volumeId: 'bible', ref: 'Matthew 5:3' });

    const study = docs.find((d) => d.kind === 'verse' && d.bookId === 'matthew');
    expect(study).toMatchObject({ corpus: 'volumes', volumeId: 'matthew-study', testament: 'nt', genre: 'gospels' });
    expect(study.text).toContain('restored');
  });

  it('folds each letter into ONE doc (name in title + body in text) incl. the preface', () => {
    const letters = docs.filter((d) => d.kind === 'letter' && d.volumeId === 'v1');
    expect(letters.length).toBe(2); // preface + 1 letter, NOT 4 (no separate title docs)
    const wide = letters.find((d) => d.letterId === 'the-wide-path');
    expect(wide.title).toBe('The Wide Path');
    expect(wide.text).toContain('Broad is the way');
    expect(wide.corpus).toBe('volumes');
    expect(letters.some((d) => d.letterId === 'v1-preface' && d.title === 'A Word of Warning')).toBe(true);
  });

  it('a letter\u2019s closing line is part of its body (search audit 2026-09-27: 189 closings were unsearchable)', () => {
    const wide = docs.find((d) => d.kind === 'letter' && d.letterId === 'the-wide-path');
    expect(wide.text).toBe('Broad is the way that leads to destruction. Says The Lord, The One who sees.');
  });

  it('a preface (no num, or num 0) is located as "Preface", the way LetterView names it, never "Letter ?"', () => {
    const letters = docs.filter((d) => d.kind === 'letter' && d.volumeId === 'v1');
    expect(letters.find((d) => d.letterId === 'v1-preface').ref).toBe('Volume One · Preface');
    expect(letters.find((d) => d.letterId === 'the-wide-path').ref).toBe('Volume One · Letter 1');
  });

  it('emits WTLB / Blessed / Holy-Days entries with markup stripped from the body', () => {
    const wtlb = docs.find((d) => d.kind === 'wtlb');
    expect(wtlb).toMatchObject({ title: 'Matters of the Heart', volumeId: 'wtlb1' });
    expect(wtlb.text).toContain('wailing');
    expect(wtlb.text).not.toContain('{{ref'); // inline markup stripped

    expect(docs.some((d) => d.kind === 'blessed' && d.title === 'The Blessed One')).toBe(true);
    expect(docs.some((d) => d.kind === 'holy-day' && d.title === 'Passover')).toBe(true);
  });

  // search-1: Hidden Manna is reachable ONLY through the Matthew study chain
  // (CLAUDE.md owner policy). The builder used to fold it in like any other
  // letter collection, so its full title + body sat in the public index and
  // surfaced under a "Hidden Manna" heading in Search's default All view --
  // the chips hid it, which is exactly why the leak went unnoticed. The
  // fixture global stays DEFINED on purpose: the assertion is that the builder
  // ignores HIDDEN_MANNA when it is present, not that the corpus is absent.
  it('never indexes Hidden Manna, even with the corpus loaded', () => {
    expect(docs.every((d) => d.volumeId !== 'hidden-manna')).toBe(true);
    expect(docs.some((d) => (d.text || '').includes('Woe to the great city'))).toBe(false);
    expect(docs.some((d) => d.title === 'Woe to Dallas')).toBe(false);
  });

  it('emits one bible-study doc per chapter with a combined title + body', () => {
    const study = docs.find((d) => d.kind === 'bible-study');
    expect(study).toMatchObject({ letterId: 'study-faith', chapterNum: 1, volumeId: 'bible-studies' });
    expect(study.title).toBe('On Faith — Beginnings');
    expect(study.text).toContain('Faith is the substance');
    // The chapter ID rides the doc: BibleStudyChapterView looks chapters up by
    // `id` ('study-faith-ch1'), not by number — a hit dispatched on `chapterNum`
    // alone opened nothing (read-along find, 2026-09-22).
    expect(study.studyChapterId).toBe('study-faith-ch1');
  });

  it('a study chapter’s poem is in its body, line by line in reading order (sweep W30)', () => {
    const study = docs.find((d) => d.kind === 'bible-study');
    expect(study.text).toBe('Faith is the substance of things hoped for. Come, all those who know not My ways; I will show you. And so it ends.');
  });
});

/* ── Matthew Study Bible reaches the index (2026-08-04) ──────────────────
   The builder looped over `mCh.sections`, a key matthew.js does not have,
   so the Study Bible contributed ZERO documents and was unsearchable. The
   old fixture carried a sections wrapper production never had, which is
   exactly why a green suite reported nothing. These lock the real shape. */
describe('Matthew Study Bible indexing', () => {
  let prevData;
  beforeAll(() => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('indexes chapters whose verses hang directly off the chapter', () => {
    const docs = buildDocs({ translation: 'nkjv' });
    const mt = docs.filter((d) => d.corpus === 'volumes' && d.bookId === 'matthew');
    expect(mt.length).toBeGreaterThan(0);
    expect(mt[0].text).toContain('restored reading');
  });

  it('still handles the nested sections shape if a corpus ever uses it', () => {
    const prev = /** @type {any} */ (globalThis).MATTHEW;
    /** @type {any} */ (globalThis).MATTHEW = {
      chapters: [{ num: 9, title: 'Ch 9', sections: [{ heading: 'H', verses: [{ n: 1, text: 'nested shape verse' }] }] }],
    };
    const docs = buildDocs({ translation: 'nkjv' });
    const mt = docs.filter((d) => d.corpus === 'volumes' && d.bookId === 'matthew');
    expect(mt.some((d) => d.text.includes('nested shape verse'))).toBe(true);
    /** @type {any} */ (globalThis).MATTHEW = prev;
  });
});

// ── REPORT #8 index content (v07-04, v07-09) ─────────────────────────────
import { translateVerse } from '../data/translations.js';

describe('buildDocs — verse text comes from translateVerse; block-shaped Holy Days index their bodies', () => {
  const G = /** @type {any} */ (globalThis);
  const EXTRA = {
    TRANSLATION_OPTIONS: [{ id: 'nkjv' }, { id: 'kjv' }, { id: 'rkjv', base: 'kjv' }, { id: 'hnv' }],
    // KJV-R is a SPARSE overlay on the KJV: Genesis 1:2 is overridden, 1:1 is not.
    BIBLE_RKJV: { genesis: { 1: [{ n: 2, text: 'And the earth was without form (restored).' }] } },
    BIBLE_KJV: { genesis: { 1: [{ n: 1, text: 'In the beginning God created the heaven and the earth.' }, { n: 2, text: 'KJV two' }] } },
    // The HNV stores verses it does not carry as blank strings.
    BIBLE_HNV: { genesis: { 1: [{ n: 1, text: 'In the beginning God created the heavens (HNV).' }, { n: 2, text: '' }] } },
    translateVerse,
  };
  let prevData;
  beforeAll(() => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) G[k] = GLOBALS[k];
    for (const k of Object.keys(EXTRA)) G[k] = EXTRA[k];
    G.HOLY_DAYS = [...GLOBALS.HOLY_DAYS,
      { id: 'hd-11', num: 11, title: 'Unleavened Bread', blocks: [{ segments: [{ v: 'Purge out the old leaven,' }, { v: 'says the Lord.' }] }] }];
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of [...Object.keys(GLOBALS), ...Object.keys(EXTRA)]) delete G[k];
  });
  const verse = (docs, n) => docs.find((d) => d.kind === 'verse' && d.bookId === 'genesis' && d.verseNum === n);

  it('KJV-R: a verse the overlay does not carry is indexed from the KJV base, not the NKJV', () => {
    const docs = buildDocs({ translation: 'rkjv' });
    expect(verse(docs, 1).text).toBe('In the beginning God created the heaven and the earth.');
    expect(verse(docs, 2).text).toBe('And the earth was without form (restored).');
  });

  it('a blank edition verse falls back to the NKJV instead of dropping out of the index', () => {
    const docs = buildDocs({ translation: 'hnv' });
    expect(verse(docs, 1).text).toBe('In the beginning God created the heavens (HNV).');
    expect(verse(docs, 2).text).toBe('The earth was without form, and void.');
  });

  it('a Holy Days entry made of blocks indexes its body, not just its title', () => {
    const hd = buildDocs({ translation: 'nkjv' }).find((d) => d.letterId === 'hd-11');
    expect(hd.kind).toBe('holy-day');
    expect(hd.text).toBe('Purge out the old leaven, says the Lord.');
  });
});

/* ── Fallback shapes (votreader-tests-7 item 7) ─────────────────────────
   Every corpus global is optional in buildDocs, and every record field
   has a default. These pin the arms the happy-path fixtures never take:
   no corpora at all, junk where arrays belong, records with no fields,
   the direct BIBLE_<CODE> read when translateVerse is not loaded, and
   collectStudyText's whole node vocabulary. */
describe('buildDocs — defaults, missing corpora and fallback shapes', () => {
  const G = /** @type {any} */ (globalThis);
  const DATA = {
    VOLUME_COLLECTIONS: [
      { id: 'v1', dataVar: 'LETTERS_V1', prefaceVar: 'LETTERS_V1_PREFACE', label: 'Volume One' },
      { id: 'v2', dataVar: 'LETTERS_V2', prefaceVar: null, label: '' },
      { id: 'v3', dataVar: 'NOPE_VAR', prefaceVar: null, label: 'Volume Three' },
    ],
    OT_BOOK_IDS: ['genesis'],
    NT_BOOK_IDS: ['matthew'],
    GENRE_GROUPS: { gospels: ['matthew'], law: ['genesis'] },
  };
  const KEYS = ['BOOKS', 'MATTHEW', 'LETTERS_V1_PREFACE', 'LETTERS_V1', 'LETTERS_V2', 'WTLB_ONE', 'WTLB_TWO', 'THE_BLESSED', 'HOLY_DAYS', 'ANSWERS', 'BIBLE_STUDIES', 'BIBLE_KJV', 'translateVerse'];
  let prevData;
  beforeEach(() => {
    prevData = window.VotSearchData;
    window.VotSearchData = DATA;
    for (const k of KEYS) delete G[k];
  });
  afterEach(() => {
    window.VotSearchData = prevData;
    for (const k of KEYS) delete G[k];
  });

  it('no corpora loaded: defaults apply and nothing is emitted', () => {
    expect(buildDocs()).toEqual([]);
    expect(buildDocs({})).toEqual([]);
  });

  it('BOOKS fallbacks: null books, non-array chapters, null chapters, missing sections, empty verse text', () => {
    G.BOOKS = {
      bad1: null,
      bad2: { id: 'bad2', title: 'Bad2', chapters: 'nope' },
      ok: { id: 'ok', title: 'Ok', chapters: [null, { num: 1 }, { num: 2, sections: [{ verses: [{ n: 1, text: '' }, { n: 2, text: 'two' }] }, {}] }] },
    };
    const verses = buildDocs({ translation: 'nkjv' }).filter((d) => d.kind === 'verse');
    expect(verses.length).toBe(1);
    expect(verses[0]).toMatchObject({ bookId: 'ok', verseNum: 2, text: 'two', heading: '' });
  });

  it('an alt translation without translateVerse reads BIBLE_<CODE> directly, verse by verse', () => {
    G.BOOKS = {
      genesis: { id: 'genesis', title: 'Genesis', chapters: [{ num: 1, sections: [{ verses: [{ n: 1, text: 'base one' }, { n: 2, text: 'base two' }, { n: 3, text: 'base three' }] }] }] },
      'matthew-plain': { id: 'matthew-plain', title: 'Matthew', chapters: [{ num: 5, sections: [{ verses: [{ n: 3, text: 'plain three' }] }] }] },
    };
    G.BIBLE_KJV = { genesis: { 1: [null, { n: 1, text: 'alt one' }, { n: 2, text: 'alt two' }] } };
    const docs = buildDocs({ translation: 'kjv' });
    const gen = (n) => docs.find((d) => d.bookId === 'genesis' && d.verseNum === n);
    expect(gen(1).text).toBe('alt one');
    expect(gen(2).text).toBe('alt two');
    expect(gen(3).text).toBe('base three'); // no alt verse: the base text stands
    expect(docs.find((d) => d.bookId === 'matthew-plain').text).toBe('plain three'); // book absent from the alt data
    G.BIBLE_KJV = { genesis: { 1: 'junk' } };
    expect(buildDocs({ translation: 'kjv' }).find((d) => d.bookId === 'genesis' && d.verseNum === 1).text).toBe('base one');
  });

  it('MATTHEW fallbacks: empty verses, missing sections, untitled chapters', () => {
    G.MATTHEW = { chapters: [
      { num: 1, verses: [] },
      { num: 2 },
      { num: 3, sections: [{ verses: [{ n: 1, text: 'sec verse' }] }, {}] },
      { num: 4, verses: [{ n: 1, text: 'direct verse' }] },
    ] };
    const mt = buildDocs({ translation: 'nkjv' }).filter((d) => d.bookId === 'matthew');
    expect(mt.map((d) => d.text)).toEqual(['sec verse', 'direct verse']);
    expect(mt.every((d) => d.heading === '' )).toBe(true);
    G.MATTHEW = {};
    expect(buildDocs({ translation: 'nkjv' }).filter((d) => d.bookId === 'matthew')).toEqual([]);
  });

  it('letter collections: missing preface, null letters and default fields', () => {
    G.LETTERS_V1 = [null, {}, { id: 'x', title: 'X' }];
    G.LETTERS_V2 = [{ id: 'y', num: 2, title: 'Y', blocks: [{ segments: [{ v: 'why' }] }] }];
    const letters = buildDocs({ translation: 'nkjv' }).filter((d) => d.kind === 'letter');
    expect(letters.length).toBe(3);
    const bare = letters.find((d) => d.volumeId === 'v1' && d.letterId === '' );
    expect(bare).toMatchObject({ letterNum: 0, title: '' , text: '' , ref: 'Volume One · Letter ?' });
    expect(letters.find((d) => d.letterId === 'x').ref).toBe('Volume One · Letter ?');
    expect(letters.find((d) => d.letterId === 'y')).toMatchObject({ heading: '' , text: 'why' });
  });

  it('a letter collection whose data is not an array emits nothing', () => {
    G.LETTERS_V2 = 'junk';
    expect(buildDocs({ translation: 'nkjv' }).filter((d) => d.volumeId === 'v2')).toEqual([]);
  });

  it('entry collections: non-array data, null entries, missing fields, bold and italic markup', () => {
    G.WTLB_ONE = 'junk';
    G.WTLB_TWO = [null, {}, { id: 'e1', paragraphs: [null, {}, { text: 'hi **bold** and _ital_ end' }] }];
    G.HOLY_DAYS = [{ id: 'hd-x', title: 'No Body' }];
    const docs = buildDocs({ translation: 'nkjv' });
    expect(docs.filter((d) => d.volumeId === 'wtlb1')).toEqual([]);
    const two = docs.filter((d) => d.volumeId === 'wtlb2');
    expect(two.length).toBe(2);
    expect(two.find((d) => d.letterId === '' )).toMatchObject({ title: '' , text: '' , ref: 'Words To Live By: Part Two ' });
    const e1 = two.find((d) => d.letterId === 'e1');
    expect(e1.text).toContain('bold');
    expect(e1.text).toContain('ital');
    expect(e1.text).not.toContain('**');
    expect(docs.find((d) => d.letterId === 'hd-x').text).toBe('');
  });

  it('bible studies: non-array data, null study and chapter, the content fallback and collectStudyText shapes', () => {
    G.BIBLE_STUDIES = 'junk';
    expect(buildDocs({ translation: 'nkjv' }).filter((d) => d.kind === 'bible-study')).toEqual([]);
    G.BIBLE_STUDIES = [null, { chapters: [null, { content: [
      'plain string', 42, null,
      { text: 'See {{ref:John 3:16}} now' },
      { content: [{ text: 'nested words' }] },
      { paragraphs: [{ text: 'para words' }] },
      { v: 'footnote num', t: 'fn' },
      { v: 'loose verse' },
    ] }, {}] }];
    const studies = buildDocs({ translation: 'nkjv' }).filter((d) => d.kind === 'bible-study');
    expect(studies.length).toBe(2);
    const full = studies[0];
    expect(full.text).toContain('plain string');
    expect(full.text).toContain('See John 3:16 now');
    expect(full.text).toContain('nested words');
    expect(full.text).toContain('para words');
    expect(full.text).toContain('loose verse');
    expect(full.text).not.toContain('footnote num');
    expect(full).toMatchObject({ letterId: '' , studyChapterId: '' , chapterNum: 0, heading: '' , ref: 'Study ' });
    expect(studies[1].text).toBe('');
  });
});

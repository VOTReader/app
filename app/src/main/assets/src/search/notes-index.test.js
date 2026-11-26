/* Study notes, chapter summaries and headings are searched as their own group (Corbin 2026-10-23, DECISIONS item 5);
   footnote refs stay out. They live in an index of their own (notes-index.js), so the main index, and every ranked
   result and bench, is exactly what it was. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildNoteDocs, notesSearcher, notesSearcherAsync } from './notes-index.js';
import { buildDocs } from './index-builder.js';

const VOT_DATA = {
  VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['genesis'],
  NT_BOOK_IDS: ['matthew'],
  GENRE_GROUPS: {},
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'in', 'a', 'and', 'is']),
};

const GLOBALS = {
  BOOKS: {
    genesis: {
      id: 'genesis', title: 'Genesis',
      chapters: [{ num: 1, title: 'The Creation Week · Mankind in God’s Image', sections: [
        { heading: 'The Creation Week', verses: [{ n: 1, text: 'In the beginning God created the heavens and the earth.' }, { n: 2, text: 'Void.' }] },
        { heading: 'Mankind in God’s Image', verses: [{ n: 26, text: 'Let Us make man in Our image.' }] },
      ] }, { num: 2, title: 'The Garden Planted', sections: [{ verses: [{ n: 1, text: 'Thus the heavens were finished.' }] }] }],
    },
    'matthew-plain': {
      id: 'matthew-plain', title: 'Matthew',
      chapters: [{ num: 5, title: 'The Sermon on the Mount', sections: [{ heading: 'The Beatitudes', verses: [{ n: 3, text: 'Blessed are the poor in spirit.' }] }] }],
    },
  },
  // the Restored Names wording (books-restored.js), what a reader with that setting on sees
  BOOKS_RESTORED: {
    genesis: { chapters: [{ num: 1, title: 'The Creation Week of Elohim · Mankind in God’s Image', sections: [{ heading: 'The Creation Week of Elohim' }, { heading: 'Mankind in God’s Image' }] }] },
  },
  MATTHEW: {
    chapters: [{
      num: 5, title: 'The Sermon on the Mount', verses: [{ n: 3, text: 'Blessed are the poor in spirit.' }],
      // footnote refs: never indexed
      scriptures: [{ ref: '5:3', cite: 'Isaiah 57:15 lowly tabernacle' }],
      votNotes: [{ ref: '5:3-12', vol: 'Volume Two', letter: 'Concerning the Meek', excerpt: 'The meek shall inherit, for they walk humbly with Me.' },
        { ref: '5:9', vol: null, letter: 'The Blessed', excerpt: 'Blessed are the peacemakers among you.' }],
    }],
  },
};

describe('buildNoteDocs (study notes, chapter summaries, headings)', () => {
  let prevData;
  /** @type {any[]} */ let docs;
  beforeAll(() => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    docs = buildNoteDocs();
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('emits a heading doc per section heading, opening at the section’s first verse', () => {
    const h = docs.filter((d) => d.kind === 'heading');
    expect(h.map((d) => d.text)).toEqual(['The Creation Week', 'Mankind in God’s Image', 'The Beatitudes']);
    expect(h[1]).toMatchObject({ bookId: 'genesis', chapterNum: 1, verseNum: 26, corpus: 'scriptures', volumeId: 'bible', ref: 'Genesis 1:26' });
    expect(h[2]).toMatchObject({ bookId: 'matthew-plain', chapterNum: 5, verseNum: 3, ref: 'Matthew 5:3' });
  });

  it('emits a chapter summary doc per chapter title, the Study Bible’s under Volumes', () => {
    const c = docs.filter((d) => d.kind === 'chapter-title');
    expect(c.map((d) => d.bookId + ' ' + d.chapterNum)).toEqual(['genesis 1', 'genesis 2', 'matthew-plain 5', 'matthew 5']);
    expect(c[1]).toMatchObject({ text: 'The Garden Planted', verseNum: 0, corpus: 'scriptures', ref: 'Genesis 2' });
    expect(c[3]).toMatchObject({ corpus: 'volumes', volumeId: 'matthew-study', verseNum: 0 });
  });

  it('emits a study note doc per Study Bible note, at its first verse, naming the letter it quotes', () => {
    const n = docs.filter((d) => d.kind === 'study-note');
    expect(n).toHaveLength(2);
    expect(n[0]).toMatchObject({ bookId: 'matthew', chapterNum: 5, verseNum: 3, corpus: 'volumes', volumeId: 'matthew-study',
      text: 'The meek shall inherit, for they walk humbly with Me.', heading: 'Volume Two · Concerning the Meek', ref: 'Matthew 5:3-12' });
    expect(n[1].heading).toBe('The Blessed');
  });

  it('carries a heading’s Restored Names wording, when it differs, to be found by', () => {
    const h = docs.filter((d) => d.kind === 'heading' && d.bookId === 'genesis');
    expect(h.map((d) => d.title)).toEqual(['The Creation Week of Elohim', '']);
    expect(h[0].heading).toBe('The Creation Week');
  });

  it('leaves footnote refs out', () => {
    expect(docs.some((d) => /Isaiah 57|tabernacle/.test(d.text + ' ' + d.heading))).toBe(false);
    expect(new Set(docs.map((d) => d.kind))).toEqual(new Set(['heading', 'chapter-title', 'study-note']));
  });

  it('the main index still holds none of them', () => {
    const main = buildDocs({ translation: 'nkjv' });
    expect(main.some((d) => d.kind === 'heading' || d.kind === 'chapter-title' || d.kind === 'study-note')).toBe(false);
  });
});

describe('notesSearcher', () => {
  let prevData;
  /** @type {ReturnType<typeof notesSearcher>} */ let S;
  beforeAll(() => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    S = notesSearcher(buildNoteDocs());
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });
  const kinds = (/** @type {any[]} */ r) => r.map((e) => e.doc.kind + ':' + e.doc.bookId + ':' + e.doc.chapterNum);

  it('finds a heading by its words, with the matched words for the card to mark', () => {
    const r = S.search('creation week');
    expect(r[0].doc).toMatchObject({ kind: 'heading', text: 'The Creation Week' });
    expect(r[0].terms).toEqual(expect.arrayContaining(['creation', 'week']));
  });

  it('a chapter summary gives way to a heading of the same chapter that matched too', () => {
    expect(kinds(S.search('creation'))).toEqual(['heading:genesis:1']);
    expect(kinds(S.search('garden'))).toEqual(['chapter-title:genesis:2']);
  });

  it('finds a heading by its Restored Names wording', () => {
    expect(kinds(S.search('elohim'))).toEqual(['heading:genesis:1']);
  });

  it('finds a study note by its words', () => {
    const r = S.search('meek inherit');
    expect(r).toHaveLength(1);
    expect(r[0].doc).toMatchObject({ kind: 'study-note', verseNum: 3 });
  });

  it('keeps to the corpus and the scope searched', () => {
    expect(kinds(S.search('sermon mount', { corpus: 'scriptures' }))).toEqual(['chapter-title:matthew-plain:5']);
    expect(kinds(S.search('sermon mount', { corpus: 'volumes' }))).toEqual(['chapter-title:matthew:5']);
    expect(S.search('creation', { scope: { bookId: 'matthew-plain' } })).toEqual([]);
    expect(kinds(S.search('peacemakers', { scope: { volumeId: 'matthew-study' } }))).toEqual(['study-note:matthew:5']);
  });

  it('under All, Matthew’s summary shows once, the Study Bible’s', () => {
    expect(kinds(S.search('sermon mount'))).toEqual(['chapter-title:matthew:5']);
  });

  it('small words alone find nothing, and a word typed with a slip still finds its heading', () => {
    expect(S.search('the of')).toEqual([]);
    expect(S.search('beatitudse')[0].doc.text).toBe('The Beatitudes');
  });
});

describe('buildNoteDocs (junk corpora) + notesSearcherAsync + search edges (votreader-tests-7 item 9)', () => {
  let prevData;
  beforeAll(() => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of ['BOOKS', 'BOOKS_RESTORED', 'MATTHEW']) delete globalThis[k];
  });

  it('skips junk books, chapters and notes, and falls back where a title, id or ref is missing', () => {
    const JUNK = {
      BOOKS: {
        junknull: null,
        junknoch: { id: 'junknoch', title: 'No Chapters' },
        plain: { chapters: [null, { num: 3 }, { num: 4, title: 'T4', sections: [{ heading: 'H4', verses: [{ n: 1 }] }] }] },
      },
      BOOKS_RESTORED: {},
      MATTHEW: { chapters: [null, { num: 7 }, { num: 8, title: 'MT8', votNotes: [null, { vol: 'V' }, { excerpt: 'E1' }, { ref: 'bogus', excerpt: 'E2' }, { ref: ' 9:2', excerpt: 'E3' }] }] },
    };
    for (const k of Object.keys(JUNK)) globalThis[k] = JUNK[k];
    const docs = buildNoteDocs();
    const h = docs.filter((d) => d.kind === 'heading');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ bookId: 'plain', chapterNum: 4, verseNum: 1, text: 'H4', title: '', ref: 'plain 4:1' });
    const c = docs.filter((d) => d.kind === 'chapter-title');
    expect(c.map((d) => d.bookId + ' ' + d.chapterNum)).toEqual(['plain 4', 'matthew 8']);
    const n = docs.filter((d) => d.kind === 'study-note');
    expect(n.map((d) => d.chapterNum + ':' + d.verseNum)).toEqual(['8:0', '8:0', '9:2']);
    expect(n[0]).toMatchObject({ text: 'E1', heading: '', ref: 'Matthew 8' });
    expect(n[1].ref).toBe('Matthew bogus');
  });

  it('builds nothing when no corpora are loaded', () => {
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
    expect(buildNoteDocs()).toEqual([]);
  });

  it('notesSearcherAsync indexes the same docs and searches them', async () => {
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    const docs = buildNoteDocs();
    const A = await notesSearcherAsync(docs);
    expect(A.size).toBe(docs.length);
    expect(A.search('creation week')[0].doc.text).toBe('The Creation Week');
  });

  it('search edges: empty query, exclusion and quotes stripped, stop words kept on request, short slip, corpus all, empty scope, limit', () => {
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    const S = notesSearcher(buildNoteDocs());
    expect(S.size).toBeGreaterThan(0);
    expect(S.search('')).toEqual([]);
    expect(S.search(null)).toEqual([]);
    expect(S.search('creation -week')[0].doc.text).toBe('The Creation Week');
    expect(S.search('"creation"')[0].doc.text).toBe('The Creation Week');
    expect(S.search('creation', { useStopWords: false })[0].doc.text).toBe('The Creation Week');
    expect(S.search('zzzz')).toEqual([]);
    expect(S.search('creation', { corpus: 'all' })[0].doc.text).toBe('The Creation Week');
    expect(S.search('creation', { scope: {} })[0].doc.text).toBe('The Creation Week');
    expect(S.search('creation week', { limit: 1 })).toHaveLength(1);
  });
});

describe('buildNoteDocs keeps Hidden Manna out (owner policy)', () => {
  const G = {
    MATTHEW: { chapters: [{ num: 23, votNotes: [
      { ref: '23:32, 36', vol: 'Woe to Dallas', letter: 'Woe to Dallas', excerpt: 'Fill up then, the measure of the sin of your fathers!' },
      { ref: '23:33', vol: 'Volume Two', letter: 'Concerning the Meek', excerpt: 'Serpents, brood of vipers.' },
    ] }] },
    HIDDEN_MANNA: [{ id: 'woe-to-dallas', title: 'Woe to Dallas', blocks: [] }],
  };
  let prevData;
  beforeAll(() => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(G)) globalThis[k] = G[k];
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(G)) delete globalThis[k];
  });

  it('emits no study note that quotes a Hidden Manna letter, and keeps the others', () => {
    const notes = buildNoteDocs().filter((d) => d.kind === 'study-note');
    expect(notes.some((d) => /measure of the sin/.test(d.text))).toBe(false);
    expect(notes.some((d) => /brood of vipers/.test(d.text))).toBe(true);
  });

  it('also honours index.html\'s HIDDEN_MANNA_TITLES when hidden-manna.js is not loaded', () => {
    const g = /** @type {any} */ (globalThis);
    delete g.HIDDEN_MANNA;
    g.HIDDEN_MANNA_TITLES = new Set(['Woe to Dallas']);
    try {
      const notes = buildNoteDocs().filter((d) => d.kind === 'study-note');
      expect(notes.map((d) => d.text).join(' ')).not.toMatch(/measure of the sin/);
    } finally {
      delete g.HIDDEN_MANNA_TITLES;
      g.HIDDEN_MANNA = G.HIDDEN_MANNA;
    }
  });
});

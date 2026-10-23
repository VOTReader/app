/* Study notes, chapter summaries and headings are searched as their own group (Corbin 2026-10-23, DECISIONS item 5);
   footnote refs stay out. They live in an index of their own (notes-index.js), so the main index, and every ranked
   result and bench, is exactly what it was. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildNoteDocs, notesSearcher } from './notes-index.js';
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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  MATTHEW: {
    chapters: [{ num: 5, title: 'Chapter 5', sections: [{ heading: 'Sermon on the Mount', verses: [
      { n: 3, text: 'Blessed are the poor in spirit, restored reading.' },
    ] }] }],
  },
  LETTERS_V1_PREFACE: { id: 'v1-preface', num: 0, title: 'A Word of Warning', blocks: [{ segments: [{ v: 'Hear the word of warning.' }] }] },
  LETTERS_V1: [{ id: 'the-wide-path', num: 1, title: 'The Wide Path', blocks: [{ segments: [{ v: 'Broad is the way that leads to destruction.' }] }] }],
  WTLB_ONE: [{ id: 'wtlb-1', num: 1, title: 'Matters of the Heart', paragraphs: [{ text: 'The wailing of the penitent {{ref:Matthew 4:4}} brings forth healing.' }] }],
  THE_BLESSED: [{ id: 'blessed-1', num: 1, title: 'The Blessed One', paragraphs: [{ text: 'Blessed are they that mourn.' }] }],
  HOLY_DAYS: [{ id: 'hd-1', num: 1, title: 'Passover', paragraphs: [{ text: 'Remember the passover forever.' }] }],
  HIDDEN_MANNA: [{ id: 'woe-dallas', num: 1, title: 'Woe to Dallas', blocks: [{ segments: [{ v: 'Woe to the great city.' }] }] }],
  BIBLE_STUDIES: [{ slug: 'study-faith', title: 'On Faith', chapters: [{ num: 1, title: 'Beginnings', content: [{ text: 'Faith is the substance of things hoped for.' }] }] }],
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
    const allowed = new Set(['verse', 'letter', 'wtlb', 'blessed', 'holy-day', 'bible-study']);
    for (const k of kinds) expect(allowed.has(k)).toBe(true);
    for (const banned of ['footnote', 'heading', 'chapter-title', 'study-note', 'cross-ref', 'letter-title']) {
      expect([...kinds]).not.toContain(banned);
    }
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

  it('emits WTLB / Blessed / Holy-Days entries with markup stripped from the body', () => {
    const wtlb = docs.find((d) => d.kind === 'wtlb');
    expect(wtlb).toMatchObject({ title: 'Matters of the Heart', volumeId: 'wtlb1' });
    expect(wtlb.text).toContain('wailing');
    expect(wtlb.text).not.toContain('{{ref'); // inline markup stripped

    expect(docs.some((d) => d.kind === 'blessed' && d.title === 'The Blessed One')).toBe(true);
    expect(docs.some((d) => d.kind === 'holy-day' && d.title === 'Passover')).toBe(true);
  });

  it('treats Hidden Manna as a folded letter doc', () => {
    const hm = docs.find((d) => d.volumeId === 'hidden-manna');
    expect(hm).toMatchObject({ kind: 'letter', title: 'Woe to Dallas' });
  });

  it('emits one bible-study doc per chapter with a combined title + body', () => {
    const study = docs.find((d) => d.kind === 'bible-study');
    expect(study).toMatchObject({ letterId: 'study-faith', chapterNum: 1, volumeId: 'bible-studies' });
    expect(study.title).toBe('On Faith — Beginnings');
    expect(study.text).toContain('Faith is the substance');
  });
});

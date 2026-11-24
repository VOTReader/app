// @ts-nocheck
/* nav-index — SESSION-2 (UX-BATCH-2026-07-12) LinkPicker overhaul plumbing.
   ─────────────────────────────────────────────────────────────────
   Pins three things:
   (1) the SIGNATURE-GUARDED memo — the index used to cache forever on first
       build, so a picker opened before a lazy corpus landed permanently
       lost whole corpora (a real latent bug);
   (2) contentDocToNavItem — the MiniSearch-doc → NavItem bridge that powers
       the picker's full-text "In the text" results (incl. the Hidden Manna
       exclusion falling out of the missing nav item);
   (3) buildNavTree — the Browse drill-down grouping. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNavIndex, contentDocToNavItem, buildNavTree } from './nav-index.js';

const g = /** @type {any} */ (window);
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** books.js's own key order, which is the order _allBooks() iterates (Ephesians first, Genesis 27th). */
function booksJsOrder() {
  const src = fs.readFileSync(path.join(HERE, '../data/books.js'), 'utf8');
  return [...src.matchAll(/^ {2}"([a-z0-9]+)": \{/gm)].map((m) => m[1]);
}

/** index.html's BIBLE_BOOK_LIST order: OT then NT, with 'matthew-plain' in Matthew's place. */
function bibleBookListOrder() {
  const html = fs.readFileSync(path.join(HERE, '../../index.html'), 'utf8');
  const block = html.slice(html.indexOf('BIBLE_BOOK_LIST.push('), html.indexOf('OT_BOOK_IDS.clear()'));
  return [...block.matchAll(/BOOKS(?:\.([a-z0-9]+)|\["([a-z0-9-]+)"\])/g)].map((m) => m[1] || m[2]);
}

function stubCorpora({ books = 1 } = {}) {
  const bookSet = { genesis: { id: 'genesis', title: 'Genesis', chapters: [{ num: 1 }, { num: 2 }] } };
  if (books > 1) bookSet.exodus = { id: 'exodus', title: 'Exodus', chapters: [{ num: 1 }] };
  g._allBooks = () => bookSet;
  g._matthew = () => null;
  g.COLLECTIONS = [{ volKey: 'one', kind: 'letter', label: 'Volume One', letterScreen: 'vot-one-letter' }];
  g.colPreface = () => null;
  g.colLetterArr = () => [{ id: 'first-letter', num: 1, title: 'First Letter' }];
  g.bookCategory = () => 'Old Testament';
}

beforeEach(() => { delete g.__NAV_INDEX; delete g.__NAV_INDEX_SIG; });
afterEach(() => {
  ['_allBooks', '_matthew', 'COLLECTIONS', 'colPreface', 'colLetterArr', 'bookCategory',
    'BIBLE_STUDIES', 'BIBLE_BOOK_LIST', '__NAV_INDEX', '__NAV_INDEX_SIG'].forEach((k) => delete g[k]);
});

describe('buildNavIndex — signature-guarded memo', () => {
  it('REBUILDS when a lazy corpus lands instead of serving the stale cache forever', () => {
    stubCorpora({ books: 1 });
    const first = buildNavIndex();
    expect(first.filter((i) => i.kind === 'bible-chapter').length).toBe(2);
    // The Bible corpus "arrives" (more books) — the old cache would have
    // returned the 2-chapter index until an app reload.
    stubCorpora({ books: 2 });
    const second = buildNavIndex();
    expect(second.filter((i) => i.kind === 'bible-chapter').length).toBe(3);
    expect(second.some((i) => i.kind === 'bible-chapter' && i.bookId === 'exodus')).toBe(true);
    // And the memo still memoizes when nothing changed.
    expect(buildNavIndex()).toBe(second);
  });

  it('rebuilds when a collection gains a letter, not just when the collection COUNT changes (F19)', () => {
    stubCorpora({ books: 1 });
    g.colLetterArr = () => [];
    const first = buildNavIndex();
    expect(first.some((i) => i.kind === 'letter' && i.letterId === 'new-letter')).toBe(false);
    // COLLECTIONS.length is still 1 — only the letters INSIDE that one
    // collection grew, the way a lazy corpus (e.g. bundle-a-vot) landing more
    // letters into an already-registered collection actually looks. A
    // signature keyed on COLLECTIONS.length alone can't see this.
    g.colLetterArr = () => [{ id: 'new-letter', num: 1, title: 'New Letter' }];
    const second = buildNavIndex();
    expect(second.some((i) => i.kind === 'letter' && i.letterId === 'new-letter')).toBe(true);
  });
});

describe('contentDocToNavItem — MiniSearch doc → NavItem bridge', () => {
  it('maps a Bible verse doc to a chapter+verse item', () => {
    stubCorpora();
    const item = contentDocToNavItem({ kind: 'verse', volumeId: 'bible', bookId: 'genesis', chapterNum: 1, verseNum: 3, ref: 'Genesis 1:3' });
    expect(item).toMatchObject({ kind: 'bible-chapter', bookId: 'genesis', chapter: 1, verse: 3, label: 'Genesis 1:3' });
  });

  it('routes a Matthew STUDY verse doc to the study edition', () => {
    stubCorpora();
    const item = contentDocToNavItem({ kind: 'verse', volumeId: 'matthew-study', bookId: 'matthew', chapterNum: 5, verseNum: 9 });
    expect(item).toMatchObject({ kind: 'study-chapter', bookId: 'matthew', chapter: 5, verse: 9, screen: 'matthew-ch' });
  });

  it('resolves a letter doc to its REAL nav item (screen + collection intact)', () => {
    stubCorpora();
    const item = contentDocToNavItem({ kind: 'letter', letterId: 'first-letter', heading: 'Volume One' });
    expect(item).toMatchObject({ kind: 'letter', letterId: 'first-letter', screen: 'vot-one-letter', collection: 'Volume One' });
  });

  it('returns null for a letter with no nav item (Hidden Manna stays unlisted)', () => {
    stubCorpora();
    expect(contentDocToNavItem({ kind: 'letter', letterId: 'woe-to-dallas', heading: 'Hidden Manna' })).toBeNull();
  });

  it('resolves a bible-study chapter doc by studyId + chapter number', () => {
    stubCorpora();
    g.BIBLE_STUDIES = [{ slug: 'more-than-a-man', title: 'More Than a Man', chapters: [{ id: 'mtam-1', num: 1, title: 'Section One' }] }];
    const item = contentDocToNavItem({ kind: 'bible-study', letterId: 'more-than-a-man', chapterNum: 1 });
    expect(item).toMatchObject({ kind: 'study-letter-chapter', studyId: 'more-than-a-man', studyChapterId: 'mtam-1' });
  });
});

describe('buildNavTree — Browse drill-down grouping', () => {
  it('excludes the STUDY Matthew from the Bible book list (it has its own root)', () => {
    stubCorpora();
    const withMatthew = {
      matthew: { id: 'matthew', title: 'Matthew', chapters: [{ num: 1 }] },
      'matthew-plain': { id: 'matthew-plain', title: 'Matthew', chapters: [{ num: 1 }] },
    };
    g._allBooks = () => withMatthew;
    const tree = buildNavTree();
    expect(tree.bibleBooks.map((b) => b.bookId)).toEqual(['matthew-plain']);
  });

  it('groups books with their chapters and collections with their entries', () => {
    stubCorpora({ books: 2 });
    const tree = buildNavTree();
    expect(tree.bibleBooks.length).toBe(2);
    expect(tree.bibleBooks[0]).toMatchObject({ bookId: 'genesis', title: 'Genesis' });
    expect(tree.bibleBooks[0].chapters.map((c) => c.chapter)).toEqual([1, 2]);
    expect(tree.collections.length).toBe(1);
    expect(tree.collections[0].label).toBe('Volume One');
    expect(tree.collections[0].entries[0]).toMatchObject({ kind: 'letter', letterId: 'first-letter' });
    expect(tree.matthewChapters).toEqual([]);
    expect(tree.studies).toEqual([]);
  });

  it('lists The Holy Bible in canonical order, not in the books.js order _allBooks() iterates', () => {
    const declared = booksJsOrder();
    const canon = bibleBookListOrder();
    expect(canon).toHaveLength(66);
    // The premise: the real books.js order is not canonical. If it ever becomes
    // canonical, this test no longer exercises the sort and should be revisited.
    expect(declared).not.toEqual(canon.filter((id) => id !== 'matthew-plain'));
    stubCorpora();
    const book = (id) => ({ id, title: id, chapters: [{ num: 1 }] });
    // As in the app: { matthew (the study edition), ...BOOKS }, with
    // 'matthew-plain' appended last by __finishBibleInit.
    const all = { matthew: book('matthew') };
    declared.forEach((id) => { all[id] = book(id); });
    all['matthew-plain'] = book('matthew-plain');
    g._allBooks = () => all;
    g.BIBLE_BOOK_LIST = canon.map(book);

    const ids = buildNavTree().bibleBooks.map((b) => b.bookId);
    expect(ids).toEqual(canon);
    expect(ids[0]).toBe('genesis');
    expect(ids.indexOf('matthew-plain')).toBe(ids.indexOf('malachi') + 1);
    expect(ids.indexOf('mark')).toBe(ids.indexOf('matthew-plain') + 1);
    expect(ids[ids.length - 1]).toBe('revelation');
    expect(ids).not.toContain('matthew'); // the study edition keeps its own root
  });

  it('keeps the encounter order while BIBLE_BOOK_LIST is still empty (Bible bundle not loaded)', () => {
    stubCorpora();
    const book = (id) => ({ id, title: id, chapters: [{ num: 1 }] });
    g._allBooks = () => ({ exodus: book('exodus'), genesis: book('genesis') });
    g.BIBLE_BOOK_LIST = [];
    expect(buildNavTree().bibleBooks.map((b) => b.bookId)).toEqual(['exodus', 'genesis']);
  });

  it('places a book BIBLE_BOOK_LIST does not list after the listed ones, keeping its encounter order', () => {
    stubCorpora();
    const book = (id) => ({ id, title: id, chapters: [{ num: 1 }] });
    g._allBooks = () => ({ zeta: book('zeta'), exodus: book('exodus'), alpha: book('alpha'), genesis: book('genesis') });
    g.BIBLE_BOOK_LIST = [book('genesis'), undefined, book('exodus')]; // a hole must not break the ranking
    expect(buildNavTree().bibleBooks.map((b) => b.bookId)).toEqual(['genesis', 'exodus', 'zeta', 'alpha']);
  });
});

describe('buildNavIndex — the rest of the corpus shapes', () => {
  it('skips a null book and a book with no chapters', () => {
    stubCorpora();
    g._allBooks = () => ({
      genesis: null,
      exodus: { id: 'exodus', title: 'Exodus' },
      judah: { id: 'judah', title: 'Judah', chapters: [{ num: 1 }] },
    });
    const items = buildNavIndex();
    expect(items.filter((i) => i.kind === 'bible-chapter').map((i) => i.bookId)).toEqual(['judah']);
  });

  it('skips the Hidden Manna collection (volKey hm)', () => {
    stubCorpora();
    g.COLLECTIONS = [
      { volKey: 'hm', kind: 'letter', label: 'Hidden Manna', letterScreen: 'hm' },
      { volKey: 'one', kind: 'letter', label: 'Volume One', letterScreen: 'vot-one-letter' },
    ];
    const items = buildNavIndex();
    expect(items.some((i) => i.collection === 'Hidden Manna')).toBe(false);
    expect(items.some((i) => i.collection === 'Volume One')).toBe(true);
  });

  it('maps a non-registry kind to letter, with no volume number for a volKey-less volume', () => {
    stubCorpora();
    g.COLLECTIONS = [{ volKey: 'timothy', kind: 'essay', label: 'Timothy', letterScreen: 'tim' }];
    g.colLetterArr = () => [{ id: 't1', num: 1, title: 'T One' }];
    const item = buildNavIndex().find((i) => i.letterId === 't1');
    expect(item).toMatchObject({ kind: 'letter', letterId: 't1', letterNum: 1, collection: 'Timothy', volKey: 'timothy' });
    expect(item.aliases).toContain('timothy 1');
    expect(item.aliases).not.toContain('timothy #1');
  });

  it('adds a preface, with volume preface aliases when the volume has a number', () => {
    stubCorpora();
    g.colPreface = () => ({ id: 'pref-one', title: 'Preface' });
    const item = buildNavIndex().find((i) => i.letterId === 'pref-one');
    expect(item).toMatchObject({ kind: 'letter', letterId: 'pref-one', letterNum: 0, label: 'Preface' });
    expect(item.aliases).toEqual(['preface', 'volume one preface', 'v1 preface']);
  });

  it('adds a preface with alias-base preface aliases when the volume has no number', () => {
    stubCorpora();
    g.COLLECTIONS = [{ volKey: 'timothy', kind: 'letter', label: 'Timothy', letterScreen: 'tim' }];
    g.colPreface = () => ({ id: 'pref-tim', title: 'Preface' });
    const item = buildNavIndex().find((i) => i.letterId === 'pref-tim');
    expect(item.aliases).toEqual(['preface', 'timothy preface', 'tim preface', 'letters from timothy preface', 'lft preface']);
  });

  it('gives WTLB, Blessed and Holy Days entries entryIds and their own kinds', () => {
    stubCorpora();
    g.COLLECTIONS = [
      { volKey: 'wtlb1', kind: 'wtlb', label: 'WTLB One', letterScreen: 'wtlb-one' },
      { volKey: 'blessed', kind: 'blessed', label: 'The Blessed', letterScreen: 'blessed' },
      { volKey: 'holydays', kind: 'holy-days', label: 'Regarding The Holy Days', letterScreen: 'hd' },
    ];
    g.colLetterArr = () => [{ id: 'e1', num: 2, title: 'Entry Two' }];
    const items = buildNavIndex();
    const wtlb = items.find((i) => i.collection === 'WTLB One');
    expect(wtlb).toMatchObject({ kind: 'wtlb-entry', entryId: 'e1', entryNum: 2 });
    expect(wtlb.aliases).toContain('wtlb1 #2');
    expect(wtlb.aliases).toContain('wtlb1 2');
    expect(items.find((i) => i.collection === 'The Blessed')).toMatchObject({ kind: 'blessed-entry', entryId: 'e1' });
    expect(items.find((i) => i.collection === 'Regarding The Holy Days')).toMatchObject({ kind: 'holy-days-entry', entryId: 'e1', category: 'Holy Days' });
  });

  it('handles entries with no number (aliases end at the base, no number glued on)', () => {
    stubCorpora();
    g.COLLECTIONS = [{ volKey: 'timothy', kind: 'letter', label: 'Timothy', letterScreen: 'tim' }];
    g.colLetterArr = () => [{ id: 't9', title: 'Unnumbered' }];
    const item = buildNavIndex().find((i) => i.letterId === 't9');
    expect(item.aliases).toEqual(['unnumbered', 'timothy ', 'tim ', 'letters from timothy ', 'lft ']);
  });

  it('indexes Bible Study chapters with slug, id and title fallbacks', () => {
    stubCorpora();
    g.BIBLE_STUDIES = [
      { slug: 'more-than-a-man', title: 'More Than a Man', chapters: [{ id: 'mtam-1', num: 1, title: 'Section One' }, { id: 'mtam-2' }] },
      { id: 'lamb-of-god', chapters: [{ id: 'log-1', num: 1 }] },
      { title: 'Nameless', chapters: [{ id: 'n-1', num: 1 }] },
      null,
      { slug: 'broken', title: 'Broken', chapters: 'not-an-array' },
      { slug: 'empty', title: 'Empty', chapters: [{ title: 'No Id' }] },
    ];
    const items = buildNavIndex().filter((i) => i.kind === 'study-letter-chapter');
    expect(items.map((i) => i.studyChapterId)).toEqual(['mtam-1', 'mtam-2', 'log-1', 'n-1']);
    expect(items[0]).toMatchObject({ studyId: 'more-than-a-man', label: 'Section One' });
    expect(items[0].aliases).toContain('more-than-a-man 1');
    expect(items[1]).toMatchObject({ label: 'Chapter mtam-2' });
    expect(items[2]).toMatchObject({ studyId: 'lamb-of-god', collection: 'Bible Study', label: 'Chapter 1' });
    expect(items[3]).toMatchObject({ studyChapterId: 'n-1', label: 'Chapter 1' });
  });

  it('indexes Matthew Study Bible chapters, with and without titles', () => {
    stubCorpora();
    g._matthew = () => ({ id: 'matthew', chapters: [{ num: 5, title: 'The Sermon' }, { num: 6 }] });
    const items = buildNavIndex().filter((i) => i.kind === 'study-chapter');
    expect(items.map((i) => i.chapter)).toEqual([5, 6]);
    expect(items[0]).toMatchObject({ label: 'Matthew Study Bible — Chapter 5: The Sermon', title: 'The Sermon' });
    expect(items[1]).toMatchObject({ label: 'Matthew Study Bible — Chapter 6', title: 'Chapter 6' });
  });

  it('fails loudly when the COLLECTIONS registry is missing, instead of indexing nothing', () => {
    stubCorpora();
    delete g.COLLECTIONS;
    expect(() => buildNavIndex()).toThrow();
  });
});

describe('contentDocToNavItem — entry kinds and fallbacks', () => {
  function entryCorpora() {
    stubCorpora();
    g.COLLECTIONS = [
      { volKey: 'wtlb1', kind: 'wtlb', label: 'WTLB One', letterScreen: 'wtlb-one' },
      { volKey: 'blessed', kind: 'blessed', label: 'The Blessed', letterScreen: 'blessed' },
      { volKey: 'holydays', kind: 'holy-days', label: 'Regarding The Holy Days', letterScreen: 'hd' },
    ];
    g.colLetterArr = () => [{ id: 'devotion', num: 1, title: 'Devotion' }];
  }

  it('returns null for a missing doc', () => {
    stubCorpora();
    expect(contentDocToNavItem(null)).toBeNull();
    expect(contentDocToNavItem(undefined)).toBeNull();
  });

  it('resolves entry docs by entryId, preferring the heading match', () => {
    entryCorpora();
    expect(contentDocToNavItem({ kind: 'wtlb', letterId: 'devotion', heading: 'WTLB One' }))
      .toMatchObject({ kind: 'wtlb-entry', entryId: 'devotion', collection: 'WTLB One' });
    expect(contentDocToNavItem({ kind: 'blessed', letterId: 'devotion', heading: 'The Blessed' }))
      .toMatchObject({ kind: 'blessed-entry', entryId: 'devotion', collection: 'The Blessed' });
    expect(contentDocToNavItem({ kind: 'holy-day', letterId: 'devotion', heading: 'Regarding The Holy Days' }))
      .toMatchObject({ kind: 'holy-days-entry', entryId: 'devotion' });
    // 'answers' shares the wtlb key space.
    expect(contentDocToNavItem({ kind: 'answers', letterId: 'devotion', heading: 'WTLB One' }))
      .toMatchObject({ kind: 'wtlb-entry', entryId: 'devotion' });
    // No heading match: falls back to the first entry with that id.
    expect(contentDocToNavItem({ kind: 'wtlb', letterId: 'devotion', heading: 'Nowhere' }))
      .toMatchObject({ kind: 'wtlb-entry', entryId: 'devotion', collection: 'WTLB One' });
    // No entry with that id at all.
    expect(contentDocToNavItem({ kind: 'wtlb', letterId: 'nope', heading: 'WTLB One' })).toBeNull();
  });

  it('resolves a bible-study doc and returns null when the chapter is missing', () => {
    stubCorpora();
    g.BIBLE_STUDIES = [{ slug: 'more-than-a-man', title: 'More Than a Man', chapters: [{ id: 'mtam-1', num: 1, title: 'Section One' }] }];
    expect(contentDocToNavItem({ kind: 'bible-study', letterId: 'more-than-a-man', chapterNum: 1 }))
      .toMatchObject({ kind: 'study-letter-chapter', studyId: 'more-than-a-man', studyChapterId: 'mtam-1' });
    expect(contentDocToNavItem({ kind: 'bible-study', letterId: 'more-than-a-man', chapterNum: 9 })).toBeNull();
    expect(contentDocToNavItem({ kind: 'bible-study', letterId: 'nope', chapterNum: 1 })).toBeNull();
  });

  it('returns null for a kind it does not know', () => {
    stubCorpora();
    expect(contentDocToNavItem({ kind: 'song', letterId: 'x' })).toBeNull();
  });
});

describe('buildNavTree — study roots', () => {
  it('lists Matthew study chapters and Bible Study chapters under their own roots', () => {
    stubCorpora();
    g._matthew = () => ({ id: 'matthew', chapters: [{ num: 5, title: 'The Sermon' }] });
    g.BIBLE_STUDIES = [{ slug: 'more-than-a-man', title: 'More Than a Man', chapters: [{ id: 'mtam-1', num: 1, title: 'Section One' }, { id: 'mtam-2', num: 2, title: 'Section Two' }] }];
    const tree = buildNavTree();
    expect(tree.matthewChapters.map((c) => c.chapter)).toEqual([5]);
    expect(tree.studies).toHaveLength(1);
    expect(tree.studies[0].label).toBe('More Than a Man');
    expect(tree.studies[0].chapters.map((c) => c.studyChapterId)).toEqual(['mtam-1', 'mtam-2']);
    expect(tree.collections[0].entries[0]).toMatchObject({ kind: 'letter', letterId: 'first-letter' });
  });
});

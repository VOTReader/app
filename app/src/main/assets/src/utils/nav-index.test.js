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
import { buildNavIndex, contentDocToNavItem, buildNavTree } from './nav-index.js';

const g = /** @type {any} */ (window);

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
    'BIBLE_STUDIES', '__NAV_INDEX', '__NAV_INDEX_SIG'].forEach((k) => delete g[k]);
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
});

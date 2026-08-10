// @ts-nocheck — free-var globals stubbed per test (bundle-d module contract)

/* nav-index — the four exports the picker actually calls at pick time.
   ─────────────────────────────────────────────────────────────────────
   C2-D [D6]. nav-index.js sat at 36.6% lines with three of its seven
   exports tested; these are the other four, and they are the ones whose
   output gets WRITTEN DOWN. navItemToEndpoint / buildSourceEndpoint
   produce the objects LinkStore persists forever, so a wrong `key` shape
   is not a rendering glitch — it is a saved link that never resolves
   again. searchNavIndex decides what the picker offers at all.

   Stubs are the same free-global corpus shims the sibling suite uses; the
   Bible-ref path additionally needs parseRefStr / findBook, which is how
   "Genesis 1:2" becomes a verse-precise hit instead of a fuzzy one. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  searchNavIndex, navItemPreview, navItemToEndpoint, buildSourceEndpoint,
} from './nav-index.js';

const g = /** @type {any} */ (window);

const GENESIS = {
  id: 'genesis', title: 'Genesis',
  chapters: [
    { num: 1, sections: [{ heading: 'The Beginning', verses: [{ n: 1, text: 'In the beginning' }, { n: 2, text: 'And the earth was without form' }] }] },
    { num: 2, sections: [{ heading: null, verses: [{ n: 1, text: 'Thus the heavens were finished' }] }] },
  ],
};
const MATTHEW = {
  id: 'matthew', title: 'Matthew',
  chapters: [{ num: 5, title: 'The Sermon on the Mount', verses: [{ n: 3, text: 'Blessed are the poor in spirit' }] }],
};

const STUBS = ['_allBooks', '_matthew', 'COLLECTIONS', 'colPreface', 'colLetterArr',
  'bookCategory', 'parseRefStr', 'findBook', 'bibleHlKey', 'findEntryContext',
  'BIBLE_STUDIES', '__NAV_INDEX', '__NAV_INDEX_SIG'];

beforeEach(() => {
  delete g.__NAV_INDEX; delete g.__NAV_INDEX_SIG;
  g._allBooks = () => ({ genesis: GENESIS, matthew: MATTHEW });
  g._matthew = () => MATTHEW;
  g.COLLECTIONS = [{ volKey: 'one', kind: 'letter', label: 'Volume One', letterScreen: 'vot-one-letter' }];
  g.colPreface = () => null;
  g.colLetterArr = () => [{ id: 'the-wide-path', num: 1, title: 'The Wide Path' }];
  g.bookCategory = () => 'Old Testament';
  g.bibleHlKey = (b, c, v) => `bible:${b}:${c}:${v}`;
  // Minimal reference parser: only what these cases exercise.
  g.parseRefStr = (s) => {
    const m = /^([a-z]+)\s+(\d+)(?::(\d+))?$/.exec(String(s).trim());
    return m ? { rawBook: m[1], chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : null, verseEnd: null } : null;
  };
  g.findBook = (raw) => (/^gen/i.test(raw) ? 'genesis' : /^mat/i.test(raw) ? 'matthew' : null);
  g.findEntryContext = () => null;
});

afterEach(() => { STUBS.forEach((k) => delete g[k]); });

/* ── searchNavIndex ───────────────────────────────────────────────── */

describe('searchNavIndex — what the picker offers', () => {
  it('puts a parsed Bible reference first, carrying the verse the fuzzy path cannot know', () => {
    const hits = searchNavIndex('genesis 1:2');
    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0].item;
    expect(top.kind).toBe('bible-chapter');
    expect(top.bookId).toBe('genesis');
    expect(top.chapter).toBe(1);
    expect(top.verse).toBe(2);              // ← only the ref parser produces this
    expect(top.label).toBe('Genesis 1:2');
    expect(hits[0].score).toBe(1000);       // above every alias score
  });

  it('does not also return the verse-less duplicate of that same chapter', () => {
    // The alias loop would otherwise re-add Genesis 1 with verse undefined, and
    // a picker showing the same chapter twice — one of them silently dropping
    // the verse the reader typed — is worse than showing it once.
    const hits = searchNavIndex('genesis 1:2');
    const gen1 = hits.filter((h) => h.item.bookId === 'genesis' && h.item.chapter === 1);
    expect(gen1.length).toBe(1);
  });

  it('routes a Matthew reference to the STUDY screen, not the Bible one', () => {
    const top = searchNavIndex('matthew 5:3')[0].item;
    expect(top.kind).toBe('study-chapter');
    expect(top.screen).toBe('matthew-ch');
    expect(top.category).toBe('Study Bible');
  });

  it('ranks an exact alias above a starts-with above a mere contains', () => {
    const scoreOf = (q, pred) => {
      const hit = searchNavIndex(q).find((h) => pred(h.item));
      return hit ? hit.score : -1;
    };
    const isGen1 = (i) => i.kind === 'bible-chapter' && i.bookId === 'genesis' && i.chapter === 1;
    const exact = scoreOf('genesis 1', isGen1);
    const prefix = scoreOf('genesis', isGen1);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(0);
  });

  it('returns nothing for an empty query and honours the limit', () => {
    expect(searchNavIndex('')).toEqual([]);
    expect(searchNavIndex(null)).toEqual([]);
    expect(searchNavIndex('genesis', 1).length).toBe(1);
  });

  it('finds a letter by a fragment of its title', () => {
    const hit = searchNavIndex('wide path').find((h) => h.item.kind === 'letter');
    expect(hit).toBeTruthy();
    expect(hit.item.letterId).toBe('the-wide-path');
  });
});

/* ── navItemPreview ───────────────────────────────────────────────── */

describe('navItemPreview — the row subtitle', () => {
  it('shows the verse text when the item names a verse', () => {
    expect(navItemPreview({ kind: 'bible-chapter', bookId: 'genesis', chapter: 1, verse: 2 }))
      .toBe('And the earth was without form');
  });

  it('falls back to the first section heading for a whole chapter', () => {
    expect(navItemPreview({ kind: 'bible-chapter', bookId: 'genesis', chapter: 1 }))
      .toBe('The Beginning');
  });

  it('returns empty rather than undefined when there is no heading', () => {
    expect(navItemPreview({ kind: 'bible-chapter', bookId: 'genesis', chapter: 2 })).toBe('');
  });

  it('reads a study chapter out of MATTHEW, not the Bible corpus', () => {
    expect(navItemPreview({ kind: 'study-chapter', bookId: 'matthew', chapter: 5, verse: 3 }))
      .toBe('Blessed are the poor in spirit');
    expect(navItemPreview({ kind: 'study-chapter', bookId: 'matthew', chapter: 5 }))
      .toBe('The Sermon on the Mount');
  });

  it('survives a corpus that has not loaded yet', () => {
    g._allBooks = () => ({});
    g._matthew = () => null;
    expect(navItemPreview({ kind: 'bible-chapter', bookId: 'genesis', chapter: 1 })).toBe('');
    expect(navItemPreview({ kind: 'study-chapter', bookId: 'matthew', chapter: 5 })).toBe('');
    expect(navItemPreview({ kind: 'letter', letterId: 'x' })).toBe('');
  });
});

/* ── navItemToEndpoint ────────────────────────────────────────────── */

describe('navItemToEndpoint — the object LinkStore keeps forever', () => {
  it('keys a verse pick through bibleHlKey and a chapter pick through the bible: shape', () => {
    const verse = navItemToEndpoint({ kind: 'bible-chapter', bookId: 'genesis', chapter: 1, verse: 2, label: 'Genesis 1:2' });
    expect(verse.type).toBe('bible');
    expect(verse.key).toBe('bible:genesis:1:2');
    expect(verse.verse).toBe(2);
    expect(verse.preview).toBe('And the earth was without form');

    const chapter = navItemToEndpoint({ kind: 'bible-chapter', bookId: 'genesis', chapter: 1, label: 'Genesis 1' });
    expect(chapter.key).toBe('bible:genesis:1');
    expect(chapter.verse).toBeNull();      // explicit null, never undefined
  });

  it('gives letters and the three entry kinds their own type but a shared key shape', () => {
    expect(navItemToEndpoint({ kind: 'letter', letterId: 'the-wide-path', screen: 'vot-one-letter', collection: 'Volume One', label: 'The Wide Path' }))
      .toMatchObject({ type: 'letter', key: 'letter:the-wide-path:0', letterId: 'the-wide-path' });
    for (const [kind, type] of [['wtlb-entry', 'wtlb'], ['blessed-entry', 'blessed'], ['holy-days-entry', 'holy-days']]) {
      const ep = navItemToEndpoint({ kind, entryId: 'e1', screen: 's', collection: 'c', label: 'L' });
      expect(ep.type).toBe(type);
      expect(ep.key).toBe('wtlb:e1:0');    // ONE key space for all three, by design
    }
  });

  it('gives a study chapter a :0 verse slot when no verse was picked', () => {
    expect(navItemToEndpoint({ kind: 'study-chapter', bookId: 'matthew', chapter: 5, label: 'Matthew 5' }).key)
      .toBe('study:matthew-5:0');
    expect(navItemToEndpoint({ kind: 'study-chapter', bookId: 'matthew', chapter: 5, verse: 3, label: 'Matthew 5:3' }).key)
      .toBe('study:matthew-5:3');
  });

  it('gives a non-Matthew study chapter the LETTER key shape (LetterView renders it)', () => {
    const ep = navItemToEndpoint({
      kind: 'study-letter-chapter', studyId: 'the-trinity', studyChapterId: 'trinity-ch1',
      collection: 'Bible Studies', label: 'Chapter 1',
    });
    expect(ep.type).toBe('study-letter');
    expect(ep.key).toBe('letter:trinity-ch1:0');
    expect(ep.letterId).toBe('trinity-ch1');
    expect(ep.screen).toBe('bible-study-chapter');
  });

  it('returns null for a kind it does not know, instead of a half-built endpoint', () => {
    expect(navItemToEndpoint({ kind: 'something-new' })).toBeNull();
  });
});

/* ── buildSourceEndpoint ──────────────────────────────────────────── */

describe('buildSourceEndpoint — where the link was made FROM', () => {
  it('parses a bible hlKey back into its parts', () => {
    expect(buildSourceEndpoint('bible:genesis:1:2', 'Genesis 1:2'))
      .toEqual({ type: 'bible', key: 'bible:genesis:1:2', bookId: 'genesis', chapter: 1, verse: 2, label: 'Genesis 1:2' });
  });

  it('splits the study key\'s fused "<book>-<chapter>" segment', () => {
    const ep = buildSourceEndpoint('study:matthew-5:3', null);
    expect(ep.bookId).toBe('matthew');
    expect(ep.chapter).toBe(5);
    expect(ep.verse).toBe(3);
    expect(ep.screen).toBe('matthew-ch');
    expect(ep.label).toBe('study:matthew-5:3');   // falls back to the key, not to ''
  });

  it('reads a study verse of 0 as "no verse", not verse zero', () => {
    expect(buildSourceEndpoint('study:matthew-5:0', null).verse).toBeNull();
  });

  it('spreads the excerpt only when a selection was actually made', () => {
    g.findEntryContext = () => ({ kind: 'letter', screen: 'vot-one-letter', collection: 'Volume One', title: 'The Wide Path' });
    const withSel = buildSourceEndpoint('letter:the-wide-path:0', null, 10, 24, 'a quoted phrase');
    expect(withSel).toMatchObject({ start: 10, end: 24, text: 'a quoted phrase' });
    const without = buildSourceEndpoint('letter:the-wide-path:0', null);
    expect('start' in without).toBe(false);
  });

  it('carries studyId + studyChapterId when the source turns out to be a study chapter', () => {
    // The id-collision case the kind-hint exists for: a bare id can live in
    // more than one collection, and a source that loses its studyId cannot be
    // navigated back to.
    g.findEntryContext = (id, hint) => (hint === 'letter'
      ? { kind: 'study-letter', studyId: 'the-trinity', studyChapterId: id, screen: 'bible-study-chapter', collection: 'Bible Studies', title: 'Chapter 1' }
      : null);
    const ep = buildSourceEndpoint('letter:trinity-ch1:0', null);
    expect(ep.type).toBe('study-letter');
    expect(ep.studyId).toBe('the-trinity');
    expect(ep.studyChapterId).toBe('trinity-ch1');
    expect(ep.label).toBe('Chapter 1');
  });
});

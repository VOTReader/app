// @ts-nocheck — tests construct corpus fixtures of partial shape
/* scripture-resolution — the COLLECTIONS registry + verse-reference engine.
   ─────────────────────────────────────────────────────────────────────────
   This is the single source of truth for every content collection AND the
   scripture-reference primitives (parseRefStr / findBook / parseScriptureRef /
   lookupVersesFromBooks / resolveVerseText / findEntryContext). It drives all
   navigation, back-routing, search, last-read tracking, and verse rendering —
   yet had ZERO direct tests (it sat outside the coverage gate). U15 brings it
   under measurement; this file is its first real test suite.

   The engine reads corpus globals (window.__ALL_BOOKS / MATTHEW / BIBLE_STUDIES
   / LETTERS_* / BIBLE_<CODE>) at CALL time, so the tests stub those on window
   and clean up afterward. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  COLLECTIONS, COL_BY_KEY, COL_BY_CARD, COL_BY_READ_KEY, COL_BY_SEARCH_ID,
  READING_CHAIN, _NAV_ICONS, COL_NAV_ICON, LETTER_SCREEN_SET,
  _isWtlbFamily, _boundaryShort,
  colLetters, colPreface, colLetterArr,
  parseRefStr, findBook, parseScriptureRef, resolveVerseText,
  findEntryContext, lookupVersesFromBooks,
} from './scripture-resolution.js';

const BOOKS = {
  john: {
    id: 'john', title: 'John', chapters: [
      { num: 3, sections: [{ heading: 'New Birth', verses: [
        { n: 16, text: 'For God so loved the world' },
        { n: 17, text: 'For God did not send His Son to condemn' },
        { n: 18, text: 'He who believes is not condemned' },
      ] }] },
    ],
  },
  genesis: {
    id: 'genesis', title: 'Genesis', chapters: [
      { num: 1, sections: [{ heading: '', verses: [{ n: 1, text: 'In the beginning' }] }] },
    ],
  },
  '1corinthians': {
    id: '1corinthians', title: '1 Corinthians', chapters: [
      { num: 13, sections: [{ heading: 'Love', verses: [
        { n: 4, text: 'Love suffers long' }, { n: 5, text: 'does not behave rudely' },
        { n: 6, text: 'does not rejoice in iniquity' }, { n: 7, text: 'bears all things' },
      ] }] },
    ],
  },
  psalms: {
    id: 'psalms', title: 'Psalms', chapters: [
      { num: 23, sections: [{ heading: '', verses: [{ n: 1, text: 'The Lord is my shepherd' }] }] },
    ],
  },
  // Judges BEFORE Jude on purpose: a single-pass startsWith scan would mis-resolve
  // "Jude" to "Judges" ('judges'.startsWith('jude')); the U12 two-pass fix must
  // prefer the exact "Jude" regardless of iteration order.
  judges: { id: 'judges', title: 'Judges', chapters: [{ num: 1, sections: [{ heading: '', verses: [{ n: 1, text: 'After the death of Joshua' }] }] }] },
  jude: { id: 'jude', title: 'Jude', chapters: [{ num: 1, sections: [{ heading: '', verses: [{ n: 3, text: 'contend earnestly for the faith' }] }] }] },
};

const MATTHEW = {
  chapters: [
    { num: 5, title: 'The Sermon on the Mount', verses: [
      { n: 3, text: 'Blessed are the poor in spirit' },
    ] },
  ],
};

beforeEach(() => {
  window.__ALL_BOOKS = BOOKS;
  window.MATTHEW = MATTHEW;
});
afterEach(() => {
  delete window.__ALL_BOOKS;
  delete window.MATTHEW;
  delete window.BIBLE_KJV;
  delete window.LETTERS_V1;
  delete window.LETTERS_V1_PREFACE;
  delete globalThis.BIBLE_STUDIES;
});

/* ── COLLECTION REGISTRY ──────────────────────────────────────── */
describe('COLLECTIONS registry', () => {
  it('has 15 collections, each with the load-bearing keys', () => {
    expect(COLLECTIONS.length).toBe(15);
    for (const c of COLLECTIONS) {
      expect(typeof c.volKey).toBe('string');
      expect(typeof c.globalName).toBe('string');
      expect(typeof c.letterScreen).toBe('string');
      expect(typeof c.label).toBe('string');
    }
  });
  it('volKeys are unique', () => {
    const keys = COLLECTIONS.map(c => c.volKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('COL_BY_KEY resolves by volKey', () => {
    expect(COL_BY_KEY.get('one').label).toBe('Volume One');
    expect(COL_BY_KEY.get('holydays').kind).toBe('holy-days');
  });
  it('COL_BY_CARD excludes the card-less Hidden Manna', () => {
    expect(COL_BY_CARD.has('volume-one')).toBe(true);
    expect(COL_BY_CARD.has(null)).toBe(false);
    expect([...COL_BY_CARD.values()].every(c => c.cardId)).toBe(true);
  });
  it('COL_BY_READ_KEY + COL_BY_SEARCH_ID resolve', () => {
    expect(COL_BY_READ_KEY.get('hidden-manna').volKey).toBe('hm');
    expect(COL_BY_SEARCH_ID.get('v2').volKey).toBe('two');
  });
  it('attaches short / shortFromOutside at module load', () => {
    expect(COL_BY_KEY.get('flock').short).toBe('Little Flock');
    expect(COL_BY_KEY.get('one').short).toBe('Volume One'); // default to label
    expect(COL_BY_KEY.get('wtlb1').shortFromOutside).toBe('Words To Live By');
    expect(COL_BY_KEY.get('one').shortFromOutside).toBeNull();
  });
  it('READING_CHAIN covers 14 collections (Hidden Manna excluded)', () => {
    expect(READING_CHAIN.length).toBe(14);
    expect(READING_CHAIN).not.toContain('hm');
  });
  it('COL_NAV_ICON + _NAV_ICONS map every collection to a 2-char badge', () => {
    expect(_NAV_ICONS.one).toBe('V1');
    expect(COL_NAV_ICON.get('Volume One')).toBe('V1');
    expect(COL_NAV_ICON.get('Hidden Manna')).toBe('HM');
  });
  it('LETTER_SCREEN_SET includes every letterScreen + bible-study-chapter', () => {
    expect(LETTER_SCREEN_SET.has('vot-one-letter')).toBe(true);
    expect(LETTER_SCREEN_SET.has('bible-study-chapter')).toBe(true);
  });
});

/* ── boundary helpers ─────────────────────────────────────────── */
describe('_isWtlbFamily / _boundaryShort', () => {
  const one = COL_BY_KEY.get('one');
  const rebuke = COL_BY_KEY.get('rebuke');
  const wtlb1 = COL_BY_KEY.get('wtlb1');
  const wtlb2 = COL_BY_KEY.get('wtlb2');
  const blessed = COL_BY_KEY.get('blessed');

  it('identifies the WTLB family (wtlb + blessed)', () => {
    expect(_isWtlbFamily(wtlb1)).toBe(true);
    expect(_isWtlbFamily(blessed)).toBe(true);
    expect(_isWtlbFamily(one)).toBe(false);
    expect(_isWtlbFamily(null)).toBe(false);
  });
  it('crossing INTO the WTLB family from outside uses shortFromOutside', () => {
    expect(_boundaryShort(rebuke, wtlb1)).toBe('Words To Live By');
  });
  it('moving WITHIN the WTLB family uses the short label', () => {
    expect(_boundaryShort(wtlb1, wtlb2)).toBe('Part Two');
  });
  it('a non-family target uses its short label', () => {
    expect(_boundaryShort(wtlb1, one)).toBe('Volume One');
  });
});

/* ── colLetters / colPreface / colLetterArr ───────────────────── */
describe('colLetters / colPreface / colLetterArr', () => {
  const one = COL_BY_KEY.get('one');
  it('reads the collection global when present', () => {
    window.LETTERS_V1 = [{ id: 'wide-path', title: 'The Wide Path' }];
    expect(colLetters(one)).toEqual([{ id: 'wide-path', title: 'The Wide Path' }]);
    expect(colLetterArr(one).length).toBe(1);
  });
  it('returns null / [] when the global is absent', () => {
    expect(colLetters(one)).toBeNull();
    expect(colLetterArr(one)).toEqual([]);
    expect(colLetterArr(null)).toEqual([]);
  });
  it('reads the preface global', () => {
    window.LETTERS_V1_PREFACE = { id: 'warning', title: 'A Word of Warning' };
    expect(colPreface(one).title).toBe('A Word of Warning');
    expect(colPreface(COL_BY_KEY.get('two'))).toBeNull(); // prefaceGlobal: null
  });
});

/* ── parseRefStr ──────────────────────────────────────────────── */
describe('parseRefStr', () => {
  it('parses book + chapter + verse', () => {
    expect(parseRefStr('John 3:16')).toEqual({ rawBook: 'John', chapter: 3, verse: 16, verseEnd: null, tag: null });
  });
  it('parses a verse range + a translation tag', () => {
    expect(parseRefStr('1 Cor 13:4-7 (NKJV)')).toEqual({ rawBook: '1 Cor', chapter: 13, verse: 4, verseEnd: 7, tag: 'NKJV' });
  });
  it('parses a chapter-only ref (no verse)', () => {
    expect(parseRefStr('Psalms 23')).toEqual({ rawBook: 'Psalms', chapter: 23, verse: null, verseEnd: null, tag: null });
  });
  it('returns null on empty / unparseable input', () => {
    expect(parseRefStr('')).toBeNull();
    expect(parseRefStr(null)).toBeNull();
    expect(parseRefStr('not a reference')).toBeNull();
  });
  it('normalizes en/em-dash ranges to a parsed range — U12', () => {
    expect(parseRefStr('John 3:16–18')).toMatchObject({ verse: 16, verseEnd: 18 }); // en-dash
    expect(parseRefStr('John 3:16—18')).toMatchObject({ verse: 16, verseEnd: 18 }); // em-dash
  });
  // SC4 — user-typed-ref tolerances.
  it('strips abbreviation periods — SC4', () => {
    expect(parseRefStr('Rev. 22:13')).toEqual({ rawBook: 'Rev', chapter: 22, verse: 13, verseEnd: null, tag: null });
    expect(parseRefStr('1 Cor. 13:4')).toMatchObject({ rawBook: '1 Cor', chapter: 13, verse: 4 });
  });
  it('tolerates a trailing verse letter — SC4', () => {
    expect(parseRefStr('John 3:16a')).toMatchObject({ verse: 16, verseEnd: null });
    expect(parseRefStr('John 3:16b-18a')).toMatchObject({ verse: 16, verseEnd: 18 });
  });
  it('takes the primary verse of a comma list — SC4', () => {
    expect(parseRefStr('John 3:16,17')).toMatchObject({ verse: 16, verseEnd: null });
  });
  it('accepts an alphanumeric translation tag — SC4', () => {
    expect(parseRefStr('John 3:16 (NIV84)')).toMatchObject({ verse: 16, tag: 'NIV84' });
  });
  it('drops a non-alphanumeric parenthetical, fail-soft — SC4', () => {
    expect(parseRefStr('John 3:16 (see also!)')).toMatchObject({ verse: 16, tag: null });
  });
});

/* ── findBook ─────────────────────────────────────────────────── */
describe('findBook', () => {
  it('resolves an exact title (case-insensitive)', () => {
    expect(findBook('John')).toBe('john');
    expect(findBook('john')).toBe('john');
  });
  it('resolves a prefix', () => {
    expect(findBook('Jo')).toBe('john'); // first startsWith hit
    expect(findBook('1 Cor')).toBe('1corinthians');
  });
  it('resolves the multi-word title with spaces stripped', () => {
    expect(findBook('1 Corinthians')).toBe('1corinthians');
  });
  it('returns null for an unknown book or empty input', () => {
    expect(findBook('Xyz')).toBeNull();
    expect(findBook('')).toBeNull();
    expect(findBook(null)).toBeNull();
  });
  it('prefers an EXACT title over a prefix collision (Jude, not Judges) — U12', () => {
    expect(findBook('Jude')).toBe('jude');     // exact beats 'judges'.startsWith('jude')
    expect(findBook('Judges')).toBe('judges');
  });
  // SC2 — Roman-numeral ordinals.
  it('normalizes Roman-numeral ordinals — SC2', () => {
    expect(findBook('I Corinthians')).toBe('1corinthians'); // "I " → "1 "
    expect(findBook('I Cor')).toBe('1corinthians');         // roman + abbreviation
  });
  // SC3 — standard abbreviations resolve to the conventional book before the
  // loose prefix fallback can grab a same-prefix neighbour.
  it('resolves standard abbreviations (SC3) — Jud→Jude not Judges', () => {
    expect(findBook('Jud')).toBe('jude');
    expect(findBook('Judg')).toBe('judges');
  });
  it('resolves other standard abbreviations (SC3)', () => {
    expect(findBook('Ps')).toBe('psalms');
    expect(findBook('Gen')).toBe('genesis');
    expect(findBook('1 Cor')).toBe('1corinthians');
  });
  it('still falls to the prefix pass for an unaliased prefix (Jo→John)', () => {
    expect(findBook('Jo')).toBe('john'); // "jo" is intentionally NOT aliased (ambiguous)
  });
});

/* ── parseScriptureRef ────────────────────────────────────────── */
describe('parseScriptureRef', () => {
  it('resolves a ref to book + verse text', () => {
    expect(parseScriptureRef('John 3:16')).toEqual({
      bookId: 'john', bookTitle: 'John', chapter: 3, verse: 16, verseEnd: null,
      label: 'John 3:16', text: 'For God so loved the world',
    });
  });
  it('builds a range label but returns the start-verse text', () => {
    const r = parseScriptureRef('John 3:16-18');
    expect(r.label).toBe('John 3:16-18');
    expect(r.verseEnd).toBe(18);
    expect(r.text).toBe('For God so loved the world');
  });
  it('returns null when there is no verse, no book, or no chapter', () => {
    expect(parseScriptureRef('John 3')).toBeNull();     // no verse
    expect(parseScriptureRef('Xyz 3:1')).toBeNull();    // no book
    expect(parseScriptureRef('John 99:1')).toBeNull();  // no chapter
  });
});

/* ── lookupVersesFromBooks ────────────────────────────────────── */
describe('lookupVersesFromBooks', () => {
  it('returns a single verse text', () => {
    expect(lookupVersesFromBooks('John 3:16')).toBe('For God so loved the world');
  });
  it('joins a verse range with "N. " markers', () => {
    expect(lookupVersesFromBooks('John 3:16-18')).toBe(
      '16. For God so loved the world 17. For God did not send His Son to condemn 18. He who believes is not condemned'
    );
  });
  it('reads a translation-tagged ref from the alt-translation map', () => {
    window.BIBLE_KJV = { john: { 3: [{ n: 16, text: 'For God so loued the world' }] } };
    expect(lookupVersesFromBooks('John 3:16 (KJV)')).toBe('For God so loued the world');
  });
  it('falls back to NKJV when the tagged translation is not loaded', () => {
    expect(lookupVersesFromBooks('John 3:16 (KJV)')).toBe('For God so loved the world');
  });
  it('returns null for an unknown book / missing chapter / missing verse', () => {
    expect(lookupVersesFromBooks('Xyz 1:1')).toBeNull();
    expect(lookupVersesFromBooks('John 99:1')).toBeNull();
    expect(lookupVersesFromBooks('John 3:99')).toBeNull();
    expect(lookupVersesFromBooks('John 3')).toBeNull(); // no verse
  });
  it('parses an en-dash range (defense-in-depth) — U12', () => {
    expect(lookupVersesFromBooks('John 3:16–18')).toBe(
      '16. For God so loved the world 17. For God did not send His Son to condemn 18. He who believes is not condemned'
    );
  });
  it('SCRIP-3: resolves a compound ";"-joined ref by resolving each part', () => {
    expect(lookupVersesFromBooks('Genesis 1:1; Psalms 23:1')).toBe('In the beginning The Lord is my shepherd');
    // a single ref is unchanged
    expect(lookupVersesFromBooks('John 3:16')).toBe('For God so loved the world');
    // a COMMA list stays one ref's verse list (NOT split into distinct refs — parseRefStr owns it)
    expect(lookupVersesFromBooks('1 Corinthians 13:4,5')).toBe('Love suffers long');
  });
});

/* ── resolveVerseText ─────────────────────────────────────────── */
describe('resolveVerseText', () => {
  it('reads a bible endpoint from BOOKS', () => {
    expect(resolveVerseText({ type: 'bible', bookId: 'john', chapter: 3, verse: 16 })).toBe('For God so loved the world');
  });
  it('falls back to preview when the bible verse is missing', () => {
    expect(resolveVerseText({ type: 'bible', bookId: 'john', chapter: 3, verse: 99, preview: 'PV' })).toBe('PV');
    expect(resolveVerseText({ type: 'bible', bookId: 'nope', preview: 'PV' })).toBe('PV');
  });
  it('reads a study endpoint verse from MATTHEW', () => {
    expect(resolveVerseText({ type: 'study', chapter: 5, verse: 3 })).toBe('Blessed are the poor in spirit');
  });
  it('returns the study chapter title when no verse is given', () => {
    expect(resolveVerseText({ type: 'study', chapter: 5 })).toBe('The Sermon on the Mount');
  });
  it('returns saved text/preview for a letter-type endpoint', () => {
    expect(resolveVerseText({ type: 'letter', text: 'excerpt text' })).toBe('excerpt text');
    expect(resolveVerseText({ type: 'wtlb', preview: 'preview text' })).toBe('preview text');
  });
});

/* ── findEntryContext ─────────────────────────────────────────── */
describe('findEntryContext', () => {
  beforeEach(() => {
    window.LETTERS_V1 = [{ id: 'wide-path', title: 'The Wide Path' }];
    window.LETTERS_V1_PREFACE = { id: 'warning', title: 'A Word of Warning' };
  });

  it('resolves a letter id to its collection context', () => {
    const ctx = findEntryContext('wide-path');
    expect(ctx).toMatchObject({ kind: 'letter', screen: 'vot-one-letter', collection: 'Volume One', title: 'The Wide Path' });
  });
  it('resolves a preface id', () => {
    const ctx = findEntryContext('warning');
    expect(ctx.title).toBe('A Word of Warning');
  });
  it('resolves a bible-study chapter id to a study-letter context', () => {
    globalThis.BIBLE_STUDIES = [{ slug: 's1', title: 'Study One', chapters: [{ id: 'ch1', title: 'Chapter One' }] }];
    const ctx = findEntryContext('xyz-not-a-letter');
    expect(ctx).toBeNull(); // not a letter...
    const studyCtx = findEntryContext('ch1');
    expect(studyCtx).toMatchObject({ kind: 'study-letter', screen: 'bible-study-chapter', studyId: 's1', studyChapterId: 'ch1' });
  });
  it('returns null for an unknown id', () => {
    expect(findEntryContext('does-not-exist')).toBeNull();
    expect(findEntryContext(null)).toBeNull();
  });
  it('honors a kindHint that excludes the match', () => {
    // wide-path is a letter-kind entry; a wtlb hint should not find it (and the
    // study fallback is skipped for non-letter hints).
    expect(findEntryContext('wide-path', 'wtlb')).toBeNull();
  });
});

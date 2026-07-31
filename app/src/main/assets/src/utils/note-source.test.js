/* note-source — hlKey → human label + nav endpoint (2026-07-30).
   ────────────────────────────────────────────────────────────────
   The Notes index renders every note through noteSourceLabel and navigates
   through noteSourceNav, so a silent break here shows up as mislabeled or
   dead notes rather than a crash — exactly the kind of rot a test catches
   and a smoke walk does not.

   The module reads BIBLE_BOOK_LIST / findEntryContext / JournalStore /
   JournalHelpers as bare globals (typeof-guarded), the way the bundle IIFE
   provides them. Each test opts into the globals it needs so the
   fallback paths stay exercised too.

   Key shapes, which the label/nav split hinges on:
     bible:<bookId>:<chapter>:<verse>   — 4 parts
     study:<bookId>-<chapter>:<verse>   — 3 parts, chapter FUSED into p[1]
     letter|wtlb|blessed|holy-days:<id>:<blockIdx>
     journal:<entryId>:<blockIdx>
*/

import { describe, it, expect, afterEach } from 'vitest';
import { _bookTitle, _verseRangeLabel, noteSourceLabel, noteSourceNav } from './note-source.js';

const g = /** @type {any} */ (globalThis);

afterEach(() => {
  delete g.BIBLE_BOOK_LIST;
  delete g.findEntryContext;
  delete g.JournalStore;
  delete g.JournalHelpers;
});

describe('_verseRangeLabel — contiguous runs collapse', () => {
  it('collapses a run and keeps the stragglers ([1,2,3,5] -> "1-3, 5")', () => {
    expect(_verseRangeLabel([1, 2, 3, 5])).toBe('1-3, 5');
  });

  it('sorts numerically and dedups before collapsing', () => {
    // Out of order with a repeat — a string sort would give "1, 10-11, 2".
    expect(_verseRangeLabel([11, 2, 10, 2, 1])).toBe('1-2, 10-11');
  });

  it('a single verse is bare, not a range', () => {
    expect(_verseRangeLabel([7])).toBe('7');
  });

  it('empty in, empty out', () => {
    expect(_verseRangeLabel([])).toBe('');
  });

  it('fully contiguous collapses to one range', () => {
    expect(_verseRangeLabel([4, 5, 6, 7])).toBe('4-7');
  });
});

describe('_bookTitle', () => {
  it('prefers BIBLE_BOOK_LIST when it has the id', () => {
    g.BIBLE_BOOK_LIST = [{ id: 'song-of-solomon', title: 'Song of Solomon' }];
    expect(_bookTitle('song-of-solomon')).toBe('Song of Solomon');
  });

  it('falls back to title-casing each hyphen segment when the list is absent', () => {
    expect(_bookTitle('1-corinthians')).toBe('1 Corinthians');
  });

  it('falls back when the list exists but lacks the id', () => {
    g.BIBLE_BOOK_LIST = [{ id: 'genesis', title: 'Genesis' }];
    expect(_bookTitle('philemon')).toBe('Philemon');
  });
});

describe('noteSourceLabel', () => {
  it('a bible note labels book + chapter + collapsed verses', () => {
    g.BIBLE_BOOK_LIST = [{ id: 'genesis', title: 'Genesis' }];
    const note = { keys: ['bible:genesis:1:1', 'bible:genesis:1:2', 'bible:genesis:1:3', 'bible:genesis:1:5'] };
    expect(noteSourceLabel(note)).toBe('Genesis 1:1-3, 5');
  });

  it('a note spanning two chapters joins the segments with " · "', () => {
    g.BIBLE_BOOK_LIST = [{ id: 'john', title: 'John' }];
    const note = { keys: ['bible:john:3:16', 'bible:john:4:1', 'bible:john:4:2'] };
    expect(noteSourceLabel(note)).toBe('John 3:16 · John 4:1-2');
  });

  it('a study key carries its chapter FUSED into the id and still labels correctly', () => {
    const note = { keys: ['study:matthew-22:37', 'study:matthew-22:38'] };
    expect(noteSourceLabel(note)).toBe('Matthew 22:37-38');
  });

  it('verse 0 is dropped from the range (filter(Boolean)) — a whole-chapter key labels bare', () => {
    // Pins current behavior: a key with no verse parses to 0 and is filtered
    // out, so the label ends at the colon rather than printing ":0".
    g.BIBLE_BOOK_LIST = [{ id: 'psalms', title: 'Psalms' }];
    expect(noteSourceLabel({ keys: ['bible:psalms:23:'] })).toBe('Psalms 23:');
  });

  it('a letter note resolves its title through findEntryContext', () => {
    g.findEntryContext = (id, kind) => (id === 'the-wide-path' && kind === 'letter' ? { title: 'The Wide Path' } : null);
    expect(noteSourceLabel({ keys: ['letter:the-wide-path:2'] })).toBe('The Wide Path');
  });

  it('a letter note falls back to the bare id when the context misses', () => {
    g.findEntryContext = () => null;
    expect(noteSourceLabel({ keys: ['letter:unknown-letter:0'] })).toBe('unknown-letter');
  });

  it('wtlb / blessed / holy-days route through the same title path', () => {
    g.findEntryContext = (id) => ({ title: 'Matters of the Heart:' + id });
    expect(noteSourceLabel({ keys: ['wtlb:matters:1'] })).toBe('Matters of the Heart:matters');
    expect(noteSourceLabel({ keys: ['blessed:b1:0'] })).toBe('Matters of the Heart:b1');
    expect(noteSourceLabel({ keys: ['holy-days:hd1:0'] })).toBe('Matters of the Heart:hd1');
  });

  it('a journal note prefixes "Journal · " and uses the display title', () => {
    g.JournalStore = { get: (id) => (id === 'e1' ? { id: 'e1', title: 'Morning' } : null) };
    g.JournalHelpers = { entryDisplayTitle: (e) => e.title };
    expect(noteSourceLabel({ keys: ['journal:e1:0'] })).toBe('Journal · Morning');
  });

  it('a journal note whose entry is gone degrades to "Journal Entry"', () => {
    g.JournalStore = { get: () => null };
    expect(noteSourceLabel({ keys: ['journal:deleted:0'] })).toBe('Journal Entry');
  });

  it('an untitled journal entry shows "Untitled", not empty', () => {
    g.JournalStore = { get: () => ({ id: 'e2', title: '' }) };
    g.JournalHelpers = { entryDisplayTitle: () => '' };
    expect(noteSourceLabel({ keys: ['journal:e2:0'] })).toBe('Journal · Untitled');
  });

  it('no keys -> "Note"; an unknown kind falls through to the raw first key', () => {
    expect(noteSourceLabel({})).toBe('Note');
    expect(noteSourceLabel({ keys: [] })).toBe('Note');
    expect(noteSourceLabel({ keys: ['garden:img-7:0'] })).toBe('garden:img-7:0');
  });
});

describe('noteSourceNav', () => {
  it('a bible key becomes a numeric bible endpoint', () => {
    expect(noteSourceNav({ keys: ['bible:genesis:1:5'] })).toEqual({
      type: 'bible', key: 'bible:genesis:1:5', bookId: 'genesis', chapter: 1, verse: 5,
    });
  });

  it('a study key splits the fused book-chapter back apart', () => {
    expect(noteSourceNav({ keys: ['study:matthew-22:37'] })).toEqual({
      type: 'study', key: 'study:matthew-22:37', bookId: 'matthew', chapter: 22, verse: 37,
    });
  });

  it('a letter key carries the resolved screen from findEntryContext', () => {
    g.findEntryContext = () => ({ screen: 'volume-one-letter' });
    expect(noteSourceNav({ keys: ['letter:the-wide-path:2'] })).toEqual({
      type: 'letter', key: 'letter:the-wide-path:2',
      letterId: 'the-wide-path', entryId: 'the-wide-path', screen: 'volume-one-letter',
    });
  });

  it('screen is null when no findEntryContext global is present (nav still resolves)', () => {
    expect(noteSourceNav({ keys: ['wtlb:matters:1'] })).toEqual({
      type: 'wtlb', key: 'wtlb:matters:1', letterId: 'matters', entryId: 'matters', screen: null,
    });
  });

  it('a journal key always targets the viewer screen', () => {
    expect(noteSourceNav({ keys: ['journal:e1:3'] })).toEqual({
      type: 'journal', key: 'journal:e1:3', entryId: 'e1', screen: 'journal-viewer',
    });
  });

  it('returns null for no keys, an unknown kind, and a malformed study key', () => {
    expect(noteSourceNav({})).toBeNull();
    expect(noteSourceNav({ keys: [] })).toBeNull();
    expect(noteSourceNav({ keys: ['garden:img-7:0'] })).toBeNull();
    // 'study:matthew:37' has no -<chapter> to split, so the guard fails and
    // the function falls through to null rather than inventing a chapter.
    expect(noteSourceNav({ keys: ['study:matthew:37'] })).toBeNull();
  });
});
